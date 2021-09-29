import * as robot from "robotjs";
import * as fs from "fs";
import handler from "serve-handler";
import http from "http";
import all, {
  Browser,
  firefox,
  webkit,
  Page,
  Electron,
  BrowserType,
  chromium,
} from "@playwright/test";
import { Window, windowManager } from "node-window-manager";

const URL = "http://localhost:3000/";
const ACTION_KEY = process.platform === "darwin" ? "command" : "control";
const BROWSER_TYPE: BrowserType = chromium;
const BROWSER_CHANNEL:
  | "chrome"
  | "chrome-beta"
  | "chrome-dev"
  | "chrome-canary"
  | "msedge"
  | "msedge-beta"
  | "msedge-dev"
  | "msedge-canary"
  | null = "msedge";

function mapBrowserTypeToName(browserType: BrowserType): string | null {
  switch (browserType) {
    case firefox:
      return "firefox";
    case webkit:
      return "webkit";
    case chromium:
      return BROWSER_CHANNEL;
    default:
      throw "unrecognized browser";
  }
}

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createStaticServer() {
  const server = http.createServer((request, response) => {
    return handler(request, response, { public: "./public" });
  });

  return server.listen(3000, () => {
    console.log(`Running at ${URL}`);
  });
}

const alphabet = [..."abcdefghijklmnopqrstuvwxyz1234567890"];

const testList = [
  ...alphabet.map((key) => ({ key, modifier: ACTION_KEY })),
  ...alphabet.map((key) => ({ key, modifier: "alt" })),
];

const results: any[] = [];
let browser: Browser;
let server: http.Server;
let page: Page;
let window: Window;

let msg: any = null;

async function main() {
  await setUp();

  console.log("SetUp Done!");

  for (const testArgs of testList) {
    await test(testArgs);
  }

  console.log(JSON.stringify(results));
  writeToFile();

  await tearDown();
}

async function test(testArgs: any) {
  msg = null;
  robot.keyTap(testArgs.key, testArgs.modifier);

  await wait(250);

  const success = await afterCheck();
  results.push({ testArgs, success });
  console.log(JSON.stringify({ testArgs, success }));

  if (!success) {
    await resetTestEnv();
  }
}

async function afterCheck(): Promise<boolean> {
  if (window.id !== windowManager.getActiveWindow().id) {
    console.log("window not active anymore");
    return false;
  }
  if (page.isClosed()) {
    console.log("page closed");
    return false;
  }
  if (page.url() !== URL) {
    console.log("url changed:", page.url());
    return false;
  }
  if (!msg || !msg.cancelable) {
    console.log("no event");
    return false;
  }
  return true;
}

async function setUp() {
  server = await createStaticServer();
  browser = await BROWSER_TYPE.launch({
    headless: false,
    channel: BROWSER_TYPE === chromium ? BROWSER_CHANNEL : "",
  });

  await resetTestEnv();
}

async function resetTestEnv() {
  const pages = browser.contexts()?.[0]?.pages();
  if (pages) {
    await Promise.all(pages.map((page) => page.close()));
  }
  page = await browser.newPage();

  await page.goto(URL);

  await page.waitForEvent("domcontentloaded");

  page.addListener("console", (parsable) => {
    try {
      msg = JSON.parse(parsable.text());
    } catch (e) {}
    return true;
  });

  await tabTillInWindow();

  window = windowManager.getActiveWindow();
}

async function tabTillInWindow() {
  let count = 0;

  while (!msg) {
    count++;
    robot.keyTap("tab");
    await wait(50);

    if (count > 10) {
      throw new Error("Was not able to reach browser window with tabs");
    }
  }

  msg = null;
}

async function writeToFile() {
  const browserName = mapBrowserTypeToName(BROWSER_TYPE);
  const browserVersion = browser.version();
  fs.writeFileSync(
    `results_${browserName}_${browserVersion}_${process.platform}.json`,
    JSON.stringify(results, null, 2)
  );
}

async function tearDown() {
  await browser.close();
  server.close();
}

main();
