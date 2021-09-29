import * as robot from "robotjs";
import handler from "serve-handler";
import http from "http";
import { Browser, firefox, Page } from "@playwright/test";
import { Window, windowManager } from "node-window-manager";

const URL = "http://localhost:3000/";
const ACTION_KEY = process.platform === "darwin" ? "command" : "control";

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
  browser = await firefox.launch({ headless: false });

  await resetTestEnv();
}

async function resetTestEnv() {
  const pages = browser.contexts()?.[0]?.pages();
  if (pages) {
    await Promise.all(pages.map((page) => page.close()));
  }
  page = await browser.newPage();

  await page.waitForEvent("domcontentloaded");

  await page.goto(URL);

  page.addListener("console", (parsable) => {
    msg = JSON.parse(parsable.text());
    return true;
  });

  window = windowManager.getActiveWindow();
}

async function tearDown() {
  await browser.close();
  server.close();
}

main();
