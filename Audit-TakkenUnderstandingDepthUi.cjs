#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const screenshotDir = process.env.TAKKEN_SCREENSHOT_DIR || "";

function startStaticServer(root) {
  const types = {
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
        "content-type": types[path.extname(target)] || "application/octet-stream",
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

async function selectUnit(page, label) {
  if (!(await page.locator("#chapterSelect").isVisible())) {
    await page.locator("#themeDrawer > summary").click();
  }
  const value = await page.locator("#chapterSelect").evaluate((select, targetLabel) => {
    const option = [...select.options].find((candidate) => candidate.textContent.includes(targetLabel));
    if (!option) throw new Error(`missing textbook unit ${targetLabel}`);
    return option.value;
  }, label);
  await page.locator("#chapterSelect").selectOption(value);
}

async function currentQuestion(page) {
  return page.evaluate(() => {
    const text = document.querySelector("#questionText")?.textContent || "";
    const question = Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
      .find((candidate) => candidate.text === text);
    if (!question) throw new Error(`current question not found: ${text.slice(0, 80)}`);
    return { id: question.id, answer: question.answer };
  });
}

async function savedState(page) {
  return page.evaluate(() => {
    const namespace = String(new URLSearchParams(location.search).get("review") || "default")
      .replace(/[^a-z0-9-]/gi, "")
      .slice(0, 24);
    const key = `takken-battle-study-clean-v2-hard-review-${namespace || "default"}`;
    if (!localStorage.getItem(key)) throw new Error("review save key not found");
    return { key, state: JSON.parse(localStorage.getItem(key)) };
  });
}

async function waitForQuestion(page, id) {
  await page.waitForFunction((targetId) => {
    const text = document.querySelector("#questionText")?.textContent || "";
    return Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
      .find((candidate) => candidate.text === text)?.id === targetId;
  }, id);
}

async function runDirectExplanationLoop(browser, baseUrl) {
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

  await gotoFresh(page, baseUrl, "direct-explain-");
  await selectUnit(page, "01-08 自ら売主となる場合の8つの制限");

  const first = await currentQuestion(page);
  assert.equal(first.id, "b029");
  await page.locator(`.choice-button[data-index="${first.answer}"]`).click();
  await page.locator(".reasoning-path").waitFor({ state: "visible" });
  const direct = await page.evaluate(() => ({
    title: document.querySelector(".reasoning-path-head strong")?.textContent || "",
    subtitle: document.querySelector(".reasoning-path-head span")?.textContent || "",
    labels: [...document.querySelectorAll(".reasoning-steps strong")].map((node) => node.textContent),
    receipt: document.querySelector(".answer-save-receipt")?.textContent || "",
    dock: document.querySelector("#dockResultText")?.textContent || "",
    answerGridHidden: document.querySelector(".answer-grid")?.hidden,
    verdictReasons: document.querySelectorAll(".verdict-reason").length,
    understandingInputs: document.querySelectorAll("[data-understanding-kind], .teachback-input").length,
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth)
  }));
  assert.equal(direct.title, "こう解く");
  assert.equal(direct.subtitle, "見る条件 → 使う根拠 → 当てはめ");
  assert.deepEqual(direct.labels, ["見る条件", "使う根拠", "この問題への当てはめ"]);
  assert.match(direct.receipt, /自動保存済み/);
  assert.match(direct.dock, /自動保存済み/);
  assert.equal(direct.answerGridHidden, false);
  assert.equal(direct.verdictReasons, 4);
  assert.equal(direct.understandingInputs, 0);
  assert.equal(direct.overflow, 0);

  const firstSave = await savedState(page);
  assert.equal(firstSave.state.stateSchemaVersion, 8);
  assert.equal(firstSave.state.questionStats.b029.attempts, 1);
  assert.equal(firstSave.state.questionStats.b029.correct, 1);
  assert.equal(firstSave.state.questionStats.b029.clearDayKeys.length, 1);
  assert.equal(firstSave.state.answered.confidence, "clear");

  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".reasoning-path").waitFor({ state: "visible" });
  assert.equal((await currentQuestion(page)).id, "b029");
  const reloaded = await savedState(page);
  assert.equal(reloaded.state.questionStats.b029.attempts, 1);

  await page.locator("#dockNextButton").click();
  await waitForQuestion(page, "b030");
  const second = await currentQuestion(page);
  const wrongIndex = (second.answer + 1) % 4;
  await page.locator(`.choice-button[data-index="${wrongIndex}"]`).click();
  await page.locator(".reasoning-path").waitFor({ state: "visible" });
  const wrong = await page.evaluate(() => ({
    title: document.querySelector("#feedbackTitle")?.textContent || "",
    mistakeTitle: document.querySelector(".mistake-capture-head strong")?.textContent || "",
    mistakeStatus: document.querySelector(".mistake-save-status")?.textContent || "",
    teachbackCount: document.querySelectorAll(".teachback-input").length,
    next: document.querySelector("#dockNextLabel")?.textContent || ""
  }));
  assert.match(wrong.title, /根拠からこう直す/);
  assert.match(wrong.mistakeTitle, /任意/);
  assert.match(wrong.mistakeStatus, /未記録でも次へ/);
  assert.equal(wrong.teachbackCount, 0);
  assert.doesNotMatch(wrong.next, /ミス入力|再現文|判断軸/);
  const wrongSave = await savedState(page);
  assert.equal(wrongSave.state.marked.b030, true);
  assert.equal(wrongSave.state.questionStats.b030.wrong, 1);

  await page.locator("#dockNextButton").click();
  await waitForQuestion(page, "b031");
  await page.setViewportSize({ width: 390, height: 844 });
  const third = await currentQuestion(page);
  await page.locator(`.choice-button[data-index="${third.answer}"]`).click();
  await page.locator(".reasoning-path").waitFor({ state: "visible" });
  const b031 = await page.evaluate(() => ({
    explain: document.querySelector(".reasoning-steps li:nth-child(2) p")?.textContent || "",
    application: document.querySelector(".reasoning-steps li:nth-child(3) p")?.textContent || "",
    boundary: document.querySelector("#trapText")?.textContent || "",
    source: document.querySelector("#bookRef")?.textContent || "",
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth)
  }));
  assert.match(b031.explain, /宅建業法40条/);
  assert.match(b031.explain, /通知.*2年以上/);
  assert.match(b031.application, /正解肢/);
  assert.match(b031.boundary, /責任が一律に消える期限ではない/);
  assert.match(b031.source, /宅地建物取引業法/);
  assert.equal(b031.overflow, 0);

  await page.locator("#dockUnsureButton").click();
  const unsureSave = await savedState(page);
  assert.equal(unsureSave.state.answered.confidence, "unsure");
  assert.deepEqual(unsureSave.state.questionStats.b031.clearDayKeys, []);
  assert.equal(unsureSave.state.marked.b031, true);
  assert.deepEqual(errors, []);

  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotDir, "direct-explanation-b031-mobile.png"),
      fullPage: true
    });
  }
  await context.close();
  return { direct, wrong, b031 };
}

async function runV7Migration(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 800 },
    reducedMotion: "reduce",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo"
  });
  const page = await context.newPage();
  await gotoFresh(page, baseUrl, "direct-migrate-");
  const before = await savedState(page);
  await page.evaluate(({ key, state }) => {
    state.stateSchemaVersion = 7;
    state.answered = null;
    state.questionStats = {
      b029: {
        attempts: 2,
        correct: 2,
        wrong: 0,
        correctDayKeys: ["2026-07-30", "2026-07-31"],
        clearDayKeys: ["2026-07-30", "2026-07-31"],
        lastClearAt: "2026-07-31T09:00:00+09:00"
      }
    };
    localStorage.setItem(key, JSON.stringify(state));
  }, before);
  await page.reload({ waitUntil: "networkidle" });
  const after = await savedState(page);
  const migration = await page.evaluate((key) => ({
    backupExists: Boolean(localStorage.getItem(`${key}-before-upgrade-v7-to-v8`)),
    notice: document.querySelector("#saveTransferStatus")?.textContent || ""
  }), after.key);
  assert.equal(after.state.stateSchemaVersion, 8);
  assert.deepEqual(after.state.questionStats.b029.correctDayKeys, ["2026-07-30", "2026-07-31"]);
  assert.deepEqual(after.state.questionStats.b029.clearDayKeys, ["2026-07-30", "2026-07-31"]);
  assert.equal(migration.backupExists, true);
  assert.match(migration.notice, /更新前のセーブを自動退避/);
  await context.close();
  return migration;
}

(async () => {
  const server = process.env.TAKKEN_BASE_URL
    ? { baseUrl: process.env.TAKKEN_BASE_URL, close: async () => {} }
    : await startStaticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const loop = await runDirectExplanationLoop(browser, server.baseUrl);
    const migration = await runV7Migration(browser, server.baseUrl);
    console.log(JSON.stringify({ status: "ok", loop, migration }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
