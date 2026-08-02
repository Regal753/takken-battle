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
  await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForFunction(() => {
    const source = document.querySelector("#dailyQuestSource")?.textContent || "";
    return /読後\d+問|固定10問/.test(source) && !source.includes("読込中");
  });
  return page.url();
}

async function openPanel(page) {
  const panel = page.locator("#practicalDrillPanel");
  if (!(await panel.evaluate((node) => node.open))) {
    await panel.locator(":scope > summary").click();
  }
}

async function currentQuestion(page) {
  return page.evaluate(() => {
    const text = document.querySelector("#practicalDrillPrompt")?.textContent || "";
    const question = (window.TAKKEN_PRACTICAL_VARIATIONS?.QUESTIONS || [])
      .find((candidate) => candidate.text === text);
    if (!question) throw new Error(`practical question not found: ${text.slice(0, 90)}`);
    return {
      id: question.id,
      answer: question.answer,
      unitId: question.unitId,
      scopeId: question.scopeId
    };
  });
}

async function savedPracticalState(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") &&
      !candidate.includes("previous") &&
      !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    if (!key) throw new Error("review save key not found");
    const parsed = JSON.parse(localStorage.getItem(key));
    return {
      stateSchemaVersion: parsed.stateSchemaVersion,
      practicalDrill: parsed.practicalDrill,
      baseQuestionStats: Object.keys(parsed.questionStats || {}).length
    };
  });
}

async function answerCurrent(page, selected) {
  await page.locator(`.practical-drill-choice:nth-child(${selected + 1})`).click();
  await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
}

async function answerCorrectWithConfidence(page, confidence = "confident") {
  const question = await currentQuestion(page);
  await answerCurrent(page, question.answer);
  await page.locator(`[data-practical-confidence="${confidence}"]`).click();
  assert.equal(await page.locator("#practicalDrillNextButton").isDisabled(), false);
  return question;
}

async function completeDesktopSet(page) {
  const first = await currentQuestion(page);
  await answerCurrent(page, (first.answer + 1) % 4);
  const feedback = await page.evaluate(() => ({
    verdict: document.querySelector("#practicalDrillVerdict")?.textContent || "",
    labels: [...document.querySelectorAll("#practicalDrillReasoning li strong")]
      .map((node) => node.textContent),
    texts: [...document.querySelectorAll("#practicalDrillReasoning li p")]
      .map((node) => node.textContent),
    sourceLinks: document.querySelectorAll("#practicalDrillSources a").length,
    correctChoices: document.querySelectorAll(".practical-drill-choice.is-correct").length,
    wrongChoices: document.querySelectorAll(".practical-drill-choice.is-wrong").length
  }));
  assert.match(feedback.verdict, /再出題/);
  assert.deepEqual(feedback.labels, [
    "判断軸",
    "ア・イへの当てはめ",
    "間違いやすい境界",
    "次に再現する一文"
  ]);
  assert.ok(feedback.texts.every((text) => text.length >= 20));
  assert.ok(feedback.sourceLinks >= 1);
  assert.equal(feedback.correctChoices, 1);
  assert.equal(feedback.wrongChoices, 1);
  await page.locator("#practicalDrillNextButton").click();

  await answerCorrectWithConfidence(page, "uncertain");
  await page.locator("#practicalDrillNextButton").click();

  for (let safety = 0; safety < 30; safety += 1) {
    const stage = (await savedPracticalState(page)).practicalDrill.stage;
    if (stage === "complete") break;
    await answerCorrectWithConfidence(page, "confident");
    await page.locator("#practicalDrillNextButton").click();
  }
  const completed = await savedPracticalState(page);
  assert.equal(completed.practicalDrill.stage, "complete");
  assert.equal(completed.practicalDrill.sessionIds.length, 10);
  assert.equal(
    completed.practicalDrill.retryIds.filter((id) => completed.practicalDrill.sessionIds.includes(id)).length,
    0
  );
  assert.equal(completed.practicalDrill.sessionsCompleted, 1);
  return { first, feedback, completed };
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
  const url = await gotoFresh(page, baseUrl, "practical-desktop-");
  const initial = await page.evaluate(() => ({
    baseQuestions: Object.keys(window.TAKKEN_EXAM_QUESTIONS || {}).length,
    practicalQuestions: window.TAKKEN_PRACTICAL_VARIATIONS?.QUESTIONS?.length || 0,
    units: window.TAKKEN_PRACTICAL_VARIATIONS?.UNITS?.length || 0,
    panelOpen: document.querySelector("#practicalDrillPanel")?.open,
    calculationPresent: Boolean(document.querySelector("#calculationDrillPanel")),
    summary: document.querySelector("#practicalDrillSummary")?.textContent || ""
  }));
  assert.deepEqual(initial, {
    baseQuestions: 124,
    practicalQuestions: 180,
    units: 45,
    panelOpen: false,
    calculationPresent: true,
    summary: "接触 0 / 180・根拠クリア 0・再出題 0"
  });
  await openPanel(page);
  await page.locator("#practicalDrillScope").selectOption("business");
  await page.locator("#practicalDrillSize").selectOption("10");
  await page.locator("#practicalDrillStartButton").click();
  const started = await savedPracticalState(page);
  assert.equal(started.stateSchemaVersion, 8);
  assert.equal(started.practicalDrill.stage, "active");
  assert.equal(started.practicalDrill.scope, "business");
  assert.equal(started.practicalDrill.sessionIds.length, 10);
  assert.equal(new Set(started.practicalDrill.sessionIds).size, 10);
  assert.ok(started.practicalDrill.sessionIds.every((id) => id.startsWith("pv-business-book-")));

  const completed = await completeDesktopSet(page);
  const firstSessionIds = completed.completed.practicalDrill.sessionIds;
  assert.equal(await page.locator("#practicalDrillComplete").isVisible(), true);
  await page.locator("#practicalDrillRestartButton").click();
  const restarted = await savedPracticalState(page);
  assert.equal(restarted.practicalDrill.stage, "active");
  assert.equal(restarted.practicalDrill.sessionIds.length, 10);
  assert.notDeepEqual(restarted.practicalDrill.sessionIds, firstSessionIds);

  await answerCorrectWithConfidence(page, "confident");
  await page.locator("#practicalDrillNextButton").click();
  const beforeReload = await savedPracticalState(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.querySelector("#dailyQuestSource")?.textContent.includes("読込中"));
  const afterReload = await savedPracticalState(page);
  assert.equal(afterReload.practicalDrill.stage, "active");
  assert.equal(afterReload.practicalDrill.position, beforeReload.practicalDrill.position);
  assert.deepEqual(afterReload.practicalDrill.sessionIds, beforeReload.practicalDrill.sessionIds);
  assert.deepEqual(errors, []);
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await openPanel(page);
    await page.screenshot({ path: path.join(screenshotDir, "practical-variations-desktop.png"), fullPage: true });
  }
  await context.close();
  return {
    url,
    initial,
    firstQuestion: completed.first,
    reasoningLabels: completed.feedback.labels,
    firstSessionAttempts: completed.completed.practicalDrill.attempts,
    secondSessionDifferent: true,
    reloadPosition: afterReload.practicalDrill.position,
    consoleErrors: errors.length
  };
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
  await gotoFresh(page, baseUrl, "practical-mobile-");
  await openPanel(page);
  await page.locator("#practicalDrillScope").selectOption("rights");
  await page.locator("#practicalDrillSize").selectOption("20");
  await page.locator("#practicalDrillStartButton").click();
  const question = await answerCorrectWithConfidence(page, "confident");
  const layout = await page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    choices: document.querySelectorAll(".practical-drill-choice").length,
    reasoningSteps: document.querySelectorAll("#practicalDrillReasoning li").length,
    scope: JSON.parse(
      localStorage.getItem(Object.keys(localStorage).find((key) =>
        key.startsWith("takken-battle-study-clean-v2-hard-review-") && !key.includes("backup") && !key.endsWith("event-outbox")
      ))
    ).practicalDrill.scope
  }));
  assert.equal(question.scopeId, "rights");
  assert.deepEqual(layout, { overflow: 0, choices: 4, reasoningSteps: 4, scope: "rights" });
  assert.deepEqual(errors, []);
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "practical-variations-mobile.png"), fullPage: true });
  }
  await context.close();
  return { question, layout, consoleErrors: errors.length };
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
