#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const screenshotDir = process.env.TAKKEN_SCREENSHOT_DIR || "";

async function capture(page, filename) {
  if (!screenshotDir) return;
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, filename), fullPage: true });
}

function startStaticServer(root) {
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".webp": "image/webp"
  };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(root, relative);
    const safeRoot = path.resolve(root);
    if (!target.startsWith(`${safeRoot}${path.sep}`) && target !== path.join(safeRoot, "index.html")) {
      response.writeHead(403);
      response.end("forbidden");
      return;
    }
    fs.readFile(target, (error, body) => {
      if (error) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      response.writeHead(200, {
        "content-type": contentTypes[path.extname(target)] || "application/octet-stream",
        "cache-control": "no-store"
      });
      response.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({
      baseUrl: `http://127.0.0.1:${server.address().port}/`,
      close: () => new Promise((done) => server.close(done))
    }));
  });
}

async function gotoFresh(page, baseUrl, prefix) {
  const url = new URL(baseUrl);
  url.searchParams.set("review", `${prefix}${Date.now().toString(36)}`);
  url.searchParams.set("today", "1");
  await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForFunction(() => {
    const source = document.querySelector("#dailyQuestSource")?.textContent || "";
    return /読後\d+問|固定10問/.test(source) && !source.includes("読込中");
  });
}

async function selectTextbookUnit(page, unitLabel) {
  const value = await page.locator("#chapterSelect").evaluate((select, label) => {
    const option = [...select.options].find((item) => item.textContent.includes(label));
    if (!option) throw new Error(`missing unit option ${label}`);
    return option.value;
  }, unitLabel);
  await page.locator("#chapterSelect").selectOption(value);
}

async function currentQuestion(page) {
  return page.evaluate(() => {
    const id = document.querySelector("#quizCard")?.dataset.questionId || "";
    const question = window.TAKKEN_EXAM_QUESTIONS?.[id];
    if (!question) throw new Error(`question not found: ${id || "missing id"}`);
    return { id: question.id, answer: question.answer };
  });
}

async function answerAndAdvance(page, expectedNextId) {
  const question = await currentQuestion(page);
  await page.locator(`.choice-button[data-index="${question.answer}"]`).click();
  await page.locator("#feedbackBox").waitFor({ state: "visible" });
  await page.locator("#dockNextButton").click();
  await page.waitForFunction(
    (id) => document.querySelector("#quizCard")?.dataset.questionId === id,
    expectedNextId
  );
  assert.equal((await currentQuestion(page)).id, expectedNextId);
}

async function runDesktop(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await gotoFresh(page, baseUrl, "textbookdesktop");
  await page.locator("#themeDrawer > summary").click();

  const initial = await page.evaluate(() => {
    const groups = [...document.querySelectorAll("#chapterSelect optgroup")]
      .filter((group) => /^第[1-4]分冊/.test(group.label))
      .map((group) => ({ label: group.label, options: group.querySelectorAll("option").length }));
    const panels = [...document.querySelectorAll("#chapterList > details.chapter-group")]
      .map((panel) => ({
        id: panel.dataset.group,
        title: panel.querySelector("summary strong")?.textContent || "",
        rows: panel.querySelectorAll(":scope > .chapter-group-list > .chapter-row").length
      }));
    return {
      groups,
      panels,
      coverage: document.querySelector("#textbookCoverageStatus")?.textContent.trim() || "",
      retention: document.querySelector("#textbookRetentionStatus")?.textContent.trim() || ""
    };
  });
  assert.deepEqual(initial.groups.map((group) => group.options), [11, 21, 7, 6]);
  assert.deepEqual(initial.panels.map((panel) => panel.rows), [11, 21, 7, 6]);
  assert.match(initial.groups[0].label, /第1分冊 宅建業法（11単元・44問）/);
  assert.match(initial.groups[1].label, /第2分冊 権利関係（21単元・44問）/);
  assert.match(initial.groups[2].label, /第3分冊 法令上の制限（7単元・18問）/);
  assert.match(initial.groups[3].label, /第3分冊 税・その他（6単元・18問）/);
  assert.equal(initial.coverage, "接触 0 / 124");
  assert.equal(initial.retention, "単元完了 0 / 45・定着 0 / 124");

  await selectTextbookUnit(page, "01-11 住宅瑕疵担保履行法");
  assert.equal((await currentQuestion(page)).id, "b103");
  const chapterMode = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") &&
      !candidate.includes("-before-") &&
      !candidate.includes("previous") &&
      !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    return { runMode: saved.runMode, chapterModeId: saved.chapterModeId };
  });
  assert.deepEqual(chapterMode, { runMode: "chapter", chapterModeId: "business-book-11" });
  let selection = await page.evaluate(() => ({
    scope: document.querySelector("#studyScopeSelect")?.value || "",
    coach: document.querySelector("#coachTitle")?.textContent || "",
    option: document.querySelector("#chapterSelect option:checked")?.textContent || ""
  }));
  assert.equal(selection.scope, "business");
  assert.match(selection.coach, /01-11 住宅瑕疵担保履行法・本文p\.152直後/);
  assert.match(selection.option, /p\.152/);
  await answerAndAdvance(page, "b104");

  await selectTextbookUnit(page, "03-07 その他の法令上の制限");
  assert.equal((await currentQuestion(page)).id, "l101");
  selection = await page.evaluate(() => ({
    scope: document.querySelector("#studyScopeSelect")?.value || "",
    option: document.querySelector("#chapterSelect option:checked")?.textContent || ""
  }));
  assert.equal(selection.scope, "business");
  assert.match(selection.option, /03-07 その他の法令上の制限.*p\.543/);
  await answerAndAdvance(page, "l102");

  await selectTextbookUnit(page, "04-02 不動産鑑定評価基準");
  assert.equal((await currentQuestion(page)).id, "o002");
  await answerAndAdvance(page, "o101");
  assert.equal(
    (await page.locator("#roundLabel").textContent()).replace(/\s+/g, " ").trim(),
    "テーマ 2 / 2"
  );
  await capture(page, "textbook-ranges-desktop.png");
  assert.deepEqual(errors, []);
  await context.close();
  return { initial, selected: ["b103", "b104", "l101", "l102", "o002", "o101"] };
}

async function runMobile(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await gotoFresh(page, baseUrl, "textbookmobile");
  await page.locator("#themeDrawer > summary").click();
  await selectTextbookUnit(page, "01-08 自ら売主となる場合の8つの制限");
  await selectTextbookUnit(page, "04-05 景品表示法");
  const result = await page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    groups: document.querySelectorAll("#chapterList > details.chapter-group").length,
    rows: document.querySelectorAll("#chapterList .chapter-row").length,
    scope: document.querySelector("#studyScopeSelect")?.value || "",
    selected: document.querySelector("#chapterSelect option:checked")?.textContent || ""
  }));
  assert.equal(result.overflow, 0);
  assert.equal(result.groups, 4);
  assert.equal(result.rows, 53);
  assert.equal(result.scope, "business");
  assert.match(result.selected, /04-05 景品表示法/);
  await capture(page, "textbook-ranges-mobile.png");
  assert.deepEqual(errors, []);
  await context.close();
  return result;
}

(async () => {
  const server = process.env.TAKKEN_BASE_URL
    ? { baseUrl: process.env.TAKKEN_BASE_URL, close: async () => {} }
    : await startStaticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const desktop = await runDesktop(browser, server.baseUrl);
    const mobile = await runMobile(browser, server.baseUrl);
    console.log(JSON.stringify({ status: "ok", desktop, mobile }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
