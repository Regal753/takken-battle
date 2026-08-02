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
    const check = window.TAKKEN_UNDERSTANDING.CHECKS[question.id];
    return {
      id: question.id,
      answer: question.answer,
      ruleAnswer: check.rule.answer,
      transferAnswer: check.transfer.answer
    };
  });
}

async function answerQuestion(page, answerIndex) {
  await page.locator(`.choice-button[data-index="${answerIndex}"]`).click();
  await page.locator(".understanding-check").waitFor({ state: "visible" });
}

async function chooseUnderstanding(page, kind, index) {
  const encoded = index === -1 ? "unknown" : String(index);
  await page.locator(
    `[data-understanding-kind="${kind}"][data-understanding-index="${encoded}"]`
  ).click();
}

async function passUnderstanding(page, question, transferScreenshot = "") {
  await chooseUnderstanding(page, "rule", question.ruleAnswer);
  await page.locator('[data-understanding-stage="transfer"]').waitFor({ state: "visible" });
  await page.locator(".understanding-transfer-scenario").waitFor({ state: "visible" });
  if (transferScreenshot) {
    fs.mkdirSync(path.dirname(transferScreenshot), { recursive: true });
    await page.screenshot({ path: transferScreenshot, fullPage: true });
  }
  await chooseUnderstanding(page, "transfer", question.transferAnswer);
  await page.locator(".reasoning-path").waitFor({ state: "visible" });
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

async function runUnderstandingLoop(browser, baseUrl) {
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

  await gotoFresh(page, baseUrl, "understanding-");
  await selectUnit(page, "01-08 自ら売主となる場合の8つの制限");

  const first = await currentQuestion(page);
  assert.equal(first.id, "b029");
  await answerQuestion(page, first.answer);
  const locked = await page.evaluate(() => ({
    answerGridHidden: document.querySelector(".answer-grid")?.hidden,
    reasoningCount: document.querySelectorAll(".reasoning-path").length,
    verdictCount: document.querySelectorAll(".verdict-board").length,
    optionCount: document.querySelectorAll('[data-understanding-kind="rule"]').length,
    ruleTexts: [...document.querySelectorAll('[data-understanding-kind="rule"].understanding-choice')]
      .map((node) => node.textContent?.replace(/^\d+/, "").trim()).filter(Boolean),
    preAnswerCueCount: document.querySelectorAll('[data-understanding-kind="rule"] .understanding-choice-copy').length,
    next: document.querySelector("#dockNextLabel")?.textContent,
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth)
  }));
  assert.equal(locked.answerGridHidden, true);
  assert.equal(locked.reasoningCount, 0);
  assert.equal(locked.verdictCount, 0);
  assert.equal(locked.optionCount, 5);
  assert.equal(locked.ruleTexts.length, 4);
  assert.ok(locked.ruleTexts.every((text) => text.length >= 8));
  assert.equal(new Set(locked.ruleTexts).size, 4);
  assert.equal(locked.preAnswerCueCount, 0);
  assert.equal(locked.next, "判断軸を選ぶ");
  assert.equal(locked.overflow, 0);

  await passUnderstanding(
    page,
    first,
    screenshotDir ? path.join(screenshotDir, "understanding-transfer-desktop.png") : ""
  );
  const passed = await page.evaluate(() => ({
    result: document.querySelector(".understanding-check-head span")?.textContent,
    reasoningLabels: [...document.querySelectorAll(".reasoning-steps strong")]
      .map((node) => node.textContent),
    verdictReasons: document.querySelectorAll(".verdict-reason").length,
    answerGridHidden: document.querySelector(".answer-grid")?.hidden,
    downgradeVisible: Boolean(document.querySelector(".understanding-downgrade-button")),
    resultCues: [...document.querySelectorAll(".understanding-results small")]
      .map((node) => node.textContent?.trim()).filter(Boolean)
  }));
  assert.equal(passed.result, "2 / 2");
  assert.deepEqual(passed.reasoningLabels, [
    "適用場面",
    "判断軸",
    "この問題への当てはめ",
    "間違いやすい境界",
    "次に再現する一文"
  ]);
  assert.equal(passed.verdictReasons, 4);
  assert.equal(passed.answerGridHidden, false);
  assert.equal(passed.downgradeVisible, true);
  assert.equal(passed.resultCues.length, 2);
  assert.ok(passed.resultCues.every((cue) => cue.length >= 8));
  const firstSave = await savedState(page);
  assert.equal(firstSave.state.stateSchemaVersion, 8);
  assert.equal(firstSave.state.questionStats.b029.lastUnderstandingPassed, true);
  assert.equal(firstSave.state.questionStats.b029.understandingDayKeys.length, 1);
  assert.equal(firstSave.state.answered.confidence, "clear");

  await page.locator("#dockNextButton").click();
  await page.waitForFunction(() => document.querySelector("#questionText")?.textContent.includes("手付を受領"));
  await page.evaluate(() => {
    const namespace = String(new URLSearchParams(location.search).get("review") || "default")
      .replace(/[^a-z0-9-]/gi, "")
      .slice(0, 24);
    const key = `takken-battle-study-clean-v2-hard-review-${namespace || "default"}`;
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    const now = new Date().toISOString();
    const today = new Date().toLocaleDateString("sv-SE");
    state.questionStats ||= {};
    state.questionStats.b030 = {
      ...(state.questionStats.b030 || {}),
      understandingDayKeys: [today],
      lastUnderstandingAt: now,
      lastUnderstandingPassedAt: now,
      lastUnderstandingPassed: true
    };
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload({ waitUntil: "networkidle" });
  await selectUnit(page, "01-08 自ら売主となる場合の8つの制限");
  const second = await currentQuestion(page);
  assert.equal(second.id, "b030");
  await answerQuestion(page, second.answer);
  await chooseUnderstanding(page, "rule", -1);
  await page.locator('[data-understanding-stage="transfer"]').waitFor({ state: "visible" });
  await chooseUnderstanding(page, "transfer", second.transferAnswer);
  await page.locator(".teachback-input").waitFor({ state: "visible" });
  assert.equal(await page.locator(".understanding-check-head span").textContent(), "1 / 2");
  assert.match(await page.locator("#dockNextLabel").textContent(), /再現文をあと15字/);
  const failedSameDay = await savedState(page);
  assert.deepEqual(failedSameDay.state.questionStats.b030.understandingDayKeys, []);
  assert.equal(failedSameDay.state.questionStats.b030.lastUnderstandingPassed, false);
  await page.reload({ waitUntil: "networkidle" });
  const reloadedFailure = await savedState(page);
  assert.deepEqual(reloadedFailure.state.questionStats.b030.understandingDayKeys, []);

  await page.locator("#dockNextButton").click();
  assert.equal((await currentQuestion(page)).id, "b030");
  await page.waitForFunction(() => document.activeElement?.classList.contains("teachback-input"));
  await page.locator(".teachback-input").fill("手付だけ確認");
  await page.locator("#dockNextButton").click();
  assert.equal((await currentQuestion(page)).id, "b030");
  await page.locator(".teachback-input").fill("業者売主では手付上限と保全措置を別々に確認する");
  assert.equal(await page.locator(".teachback-status").textContent(), "再現文を保存済み");
  await page.locator("#dockNextButton").click();
  await page.waitForFunction(() => document.querySelector("#questionText")?.textContent.includes("契約不適合責任"));
  const secondSave = await savedState(page);
  assert.equal(secondSave.state.marked.b030, true);
  assert.equal(secondSave.state.questionStats.b030.lastUnderstandingPassed, false);
  assert.match(secondSave.state.questionStats.b030.lastTeachback, /手付上限と保全措置/);

  await page.setViewportSize({ width: 390, height: 844 });
  const third = await currentQuestion(page);
  assert.equal(third.id, "b031");
  await answerQuestion(page, third.answer);
  await passUnderstanding(page, third);
  const b031 = await page.evaluate(() => ({
    explain: document.querySelector(".reasoning-steps li:nth-child(2) p")?.textContent || "",
    boundary: document.querySelector(".reasoning-steps li:nth-child(4) p")?.textContent || "",
    source: document.querySelector("#bookRef")?.textContent || "",
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth)
  }));
  assert.match(b031.explain, /宅建業法40条/);
  assert.match(b031.explain, /通知.*2年以上/);
  assert.match(b031.boundary, /責任が一律に消える期限ではない/);
  assert.match(b031.source, /宅地建物取引業法/);
  assert.equal(b031.overflow, 0);
  assert.deepEqual(errors, []);

  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotDir, "understanding-depth-b031-mobile.png"),
      fullPage: true
    });
  }
  await context.close();
  return { locked, passed, b031 };
}

async function runV7Migration(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 800 },
    reducedMotion: "reduce",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo"
  });
  const page = await context.newPage();
  await gotoFresh(page, baseUrl, "understanding-migrate-");
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
  assert.deepEqual(after.state.questionStats.b029.understandingDayKeys, []);
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
    const loop = await runUnderstandingLoop(browser, server.baseUrl);
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
