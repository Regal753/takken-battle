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
    return /読後\d+問|固定10問|復習10問/.test(source) && !source.includes("読込中");
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
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("previous") &&
      !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
    );
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    const id = state.practicalDrill?.queue?.[state.practicalDrill?.position || 0];
    const question = window.TAKKEN_PRACTICAL_VARIATIONS?.QUESTIONS_BY_ID?.[id];
    if (!question) throw new Error(`practical question not found: ${id || "missing id"}`);
    return {
      id: question.id,
      answer: question.answer,
      unitId: question.unitId,
      scopeId: question.scopeId,
      format: question.format
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
      baseQuestionStats: Object.keys(parsed.questionStats || {}).length,
      studyScope: parsed.studyScope,
      dailyPlanScope: parsed.daily?.planScope || "",
      dailyQuestionIds: [...(parsed.daily?.ids || [])]
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
    "各肢への当てはめ",
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
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("previous") &&
      !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
    );
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    saved.practicalDrill = {
      ...saved.practicalDrill,
      stage: "idle",
      scope: "all",
      unitId: "",
      sessionSize: 20,
      sessionIds: [],
      queue: [],
      position: 0,
      currentAttempt: null,
      retryIds: [],
      history: {},
      attempts: 0,
      correctAttempts: 0,
      sessionsCompleted: 0
    };
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.querySelector("#dailyQuestSource")?.textContent.includes("読込中"));
  const initial = await page.evaluate(() => ({
    baseQuestions: Object.keys(window.TAKKEN_EXAM_QUESTIONS || {}).length,
    practicalQuestions: window.TAKKEN_PRACTICAL_VARIATIONS?.QUESTIONS?.length || 0,
    units: window.TAKKEN_PRACTICAL_VARIATIONS?.UNITS?.length || 0,
    panelOpen: document.querySelector("#practicalDrillPanel")?.open,
    calculationPresent: Boolean(document.querySelector("#calculationDrillPanel")),
    summary: document.querySelector("#practicalDrillSummary")?.textContent || "",
    missionLabel: document.querySelector("#missionMinutesLabel")?.textContent || "",
    quickAction: document.querySelector("#todayCommandPracticalButton")?.textContent || "",
    quickActionHidden: document.querySelector("#todayCommandPracticalButton")?.hidden,
    missionTag: document.querySelector("#missionMinutesStep")?.tagName,
    missionAction: document.querySelector("#missionMinutesStep")?.dataset.action,
    defaultScope: document.querySelector("#practicalDrillScope")?.value,
    defaultSize: document.querySelector("#practicalDrillSize")?.value,
    startLabel: document.querySelector("#practicalDrillStartButton")?.textContent || ""
  }));
  assert.deepEqual(initial, {
    baseQuestions: 124,
    practicalQuestions: 180,
    units: 45,
    panelOpen: false,
    calculationPresent: true,
    summary: "接触 0 / 180・根拠クリア 0・再出題 0",
    missionLabel: "宅建業法を復習",
    quickAction: "宅建業法を10問で振り返る",
    quickActionHidden: false,
    missionTag: "BUTTON",
    missionAction: "practical",
    defaultScope: "business",
    defaultSize: "10",
    startLabel: "宅建業法を10問で始める"
  });
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "practical-review-entry-desktop.png") });
  }
  const priorityRetryIds = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("previous") &&
      !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
    );
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    const ids = window.TAKKEN_PRACTICAL_VARIATIONS.QUESTIONS
      .filter((question) => question.unitId === "business-book-01")
      .slice(0, 2)
      .map((question) => question.id);
    saved.practicalDrill.retryIds = [...ids];
    ids.forEach((id) => {
      saved.practicalDrill.history[id] = {
        attempts: 1,
        correct: 0,
        wrong: 1,
        uncertain: 0,
        lastConfidence: "wrong"
      };
    });
    localStorage.setItem(key, JSON.stringify(saved));
    return ids;
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.querySelector("#dailyQuestSource")?.textContent.includes("読込中"));
  const beforeQuickStart = await savedPracticalState(page);
  await page.locator("#missionMinutesStep").click();
  assert.equal(await page.locator("#practicalDrillPanel").evaluate((node) => node.open), true);
  const started = await savedPracticalState(page);
  assert.equal(started.stateSchemaVersion, 9);
  assert.equal(started.practicalDrill.stage, "active");
  assert.equal(started.practicalDrill.version, 2);
  assert.equal(started.practicalDrill.scope, "business");
  assert.equal(started.practicalDrill.sessionIds.length, 10);
  assert.equal(started.studyScope, beforeQuickStart.studyScope);
  assert.equal(started.dailyPlanScope, beforeQuickStart.dailyPlanScope);
  assert.deepEqual(started.dailyQuestionIds, beforeQuickStart.dailyQuestionIds);
  assert.equal(started.baseQuestionStats, beforeQuickStart.baseQuestionStats);
  assert.equal(new Set(started.practicalDrill.sessionIds).size, 10);
  assert.ok(priorityRetryIds.every((id) => started.practicalDrill.sessionIds.includes(id)));
  assert.ok(started.practicalDrill.sessionIds.every((id) => id.startsWith("pv-business-book-")));
  const sessionFormats = await page.evaluate((ids) => ids.map((id) =>
    window.TAKKEN_PRACTICAL_VARIATIONS.QUESTIONS_BY_ID[id].format
  ), started.practicalDrill.sessionIds);
  assert.ok(new Set(sessionFormats).size >= 2);

  const completed = await completeDesktopSet(page);
  const firstSessionIds = completed.completed.practicalDrill.sessionIds;
  assert.equal(await page.locator("#practicalDrillComplete").isVisible(), true);
  if (screenshotDir) {
    await page.locator("#practicalDrillPanel").screenshot({
      path: path.join(screenshotDir, "practical-review-complete-desktop.png")
    });
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.querySelector("#dailyQuestSource")?.textContent.includes("読込中"));
  const completedAfterReload = await savedPracticalState(page);
  assert.equal(completedAfterReload.practicalDrill.stage, "complete");
  assert.equal(await page.locator("#practicalDrillPanel").evaluate((node) => node.open), true);
  assert.equal(await page.locator("#practicalDrillComplete").isVisible(), true);
  assert.equal(await page.locator("#todayCommandPracticalButton").textContent(), "実践結果を確認する");
  assert.equal(
    await page.locator("#practicalDrillRestartButton").textContent(),
    "宅建業法を10問続ける"
  );
  assert.equal(await page.locator("#practicalDrillExitButton").textContent(), "学習画面へ戻る");
  await page.locator("#practicalDrillChangeButton").click();
  const returnedToLauncher = await savedPracticalState(page);
  assert.equal(returnedToLauncher.practicalDrill.stage, "idle");
  assert.equal(await page.locator("#practicalDrillOverview").isVisible(), true);
  assert.equal(await page.locator("#practicalDrillScope").inputValue(), "business");
  assert.equal(await page.locator("#practicalDrillSize").inputValue(), "10");
  await page.locator("#practicalDrillSize").selectOption("45");
  assert.equal(await page.locator("#practicalDrillStartButton").textContent(), "宅建業法を44問で始める");
  await page.locator("#practicalDrillSize").selectOption("10");
  await page.locator("#practicalDrillStartButton").click();
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
  assert.equal(await page.locator("#practicalDrillPanel").evaluate((node) => node.open), true);
  assert.equal(await page.locator("#todayCommandPracticalButton").textContent(), "実践セットを再開する");
  await page.locator("#todayCommandPracticalButton").click();
  const afterResumeAction = await savedPracticalState(page);
  assert.equal(afterResumeAction.practicalDrill.position, afterReload.practicalDrill.position);
  assert.deepEqual(afterResumeAction.practicalDrill.sessionIds, afterReload.practicalDrill.sessionIds);

  const compatibilityFixture = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") &&
      !candidate.includes("previous") && !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    const state = JSON.parse(localStorage.getItem(key));
    const drill = state.practicalDrill;
    const id = drill.queue[drill.position];
    drill.version = 1;
    drill.bankVersion = 1;
    drill.history[id] = {
      ...(drill.history[id] || {}),
      attempts: 17,
      correct: 12,
      wrong: 5,
      lastConfidence: "confident"
    };
    drill.currentAttempt = { id, selected: 0, correct: true, confidence: "confident" };
    localStorage.setItem(key, JSON.stringify(state));
    return { id, sessionIds: drill.sessionIds };
  });
  await page.reload({ waitUntil: "networkidle" });
  const compatible = await savedPracticalState(page);
  assert.equal(compatible.practicalDrill.version, 2);
  assert.equal(compatible.practicalDrill.history[compatibilityFixture.id].attempts, 17);
  assert.equal(compatible.practicalDrill.history[compatibilityFixture.id].correct, 12);
  assert.equal(compatible.practicalDrill.currentAttempt, null);
  assert.deepEqual(compatible.practicalDrill.sessionIds, compatibilityFixture.sessionIds);
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
    v1HistoryPreserved: compatible.practicalDrill.history[compatibilityFixture.id].attempts,
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
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "practical-review-entry-mobile.png") });
  }
  await openPanel(page);
  await page.locator("#practicalDrillScope").selectOption("lawOther");
  await page.locator("#practicalDrillSize").selectOption("10");
  assert.equal(
    await page.locator("#practicalDrillStartButton").textContent(),
    "法令・税その他を10問で始める"
  );
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
  assert.ok(["restrictions", "taxOther"].includes(question.scopeId));
  assert.deepEqual(layout, { overflow: 0, choices: 4, reasoningSteps: 4, scope: "lawOther" });
  await page.setViewportSize({ width: 320, height: 800 });
  const compact = await page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    missionHeight: Math.round(document.querySelector("#missionMinutesStep")?.getBoundingClientRect().height || 0)
  }));
  assert.equal(compact.overflow, 0);
  assert.ok(compact.missionHeight >= 44);
  assert.deepEqual(errors, []);
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "practical-variations-mobile.png"), fullPage: true });
  }
  await context.close();
  return { question, layout, compact, consoleErrors: errors.length };
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
