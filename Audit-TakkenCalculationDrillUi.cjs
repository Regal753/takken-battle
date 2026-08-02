#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = __dirname;
const screenshotDir = process.env.TAKKEN_SCREENSHOT_DIR || path.join(root, "output", "playwright", "calculation-drill");
const chromePath = process.env.TAKKEN_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const storageIdFor = (namespace) => `takken-battle-study-clean-v2-hard-review-${namespace}`;

function startStaticServer() {
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".webp": "image/webp"
  };
  const resolvedRoot = path.resolve(root);
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${resolvedRoot}${path.sep}`) && target !== path.join(resolvedRoot, "index.html")) {
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
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}/`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

async function newContext(browser, viewport) {
  return browser.newContext({
    viewport,
    reducedMotion: "reduce",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo"
  });
}

async function gotoReview(page, baseUrl, namespace) {
  const url = new URL(baseUrl);
  url.searchParams.set("review", namespace);
  await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 15000 });
  await page.locator("#calculationDrillPanel").waitFor({ state: "visible" });
  if (!(await page.locator("#calculationDrillPanel").evaluate((node) => node.open))) {
    await page.locator("#calculationDrillPanel > summary").click();
  }
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => {
    const rootOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("#calculationDrillPanel *")]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && (rect.right > document.documentElement.clientWidth + 1 || rect.left < -1);
      })
      .slice(0, 8)
      .map((node) => ({
        tag: node.tagName,
        id: node.id,
        className: String(node.className || "").slice(0, 80),
        right: Math.round(node.getBoundingClientRect().right)
      }));
    return { rootOverflow, offenders };
  });
}

async function answerCurrentCorrectly(page) {
  const snapshot = await page.evaluate(() => {
    const storageId = `takken-battle-study-clean-v2-hard-review-${new URLSearchParams(location.search).get("review")}`;
    const saved = JSON.parse(localStorage.getItem(storageId) || "{}");
    const drill = saved.calculationDrill || {};
    const id = drill.queue?.[drill.position];
    const item = window.TAKKEN_CALCULATION_DRILL.QUESTIONS.find((question) => question.id === id);
    return { id, answer: item?.answer, currentAttempt: drill.currentAttempt, stage: drill.stage };
  });
  if (snapshot.stage === "complete") return false;
  assert.ok(snapshot.id, "Current calculation ID must exist.");
  if (!snapshot.currentAttempt) {
    await page.locator("#calculationDrillChoices .calculation-drill-choice").nth(snapshot.answer).click();
  }
  const needsConfidence = await page.evaluate(() => {
    const selected = document.querySelector("[data-calculation-confidence].is-selected");
    return !selected && !document.querySelector("#calculationDrillConfidence")?.hidden;
  });
  if (needsConfidence) {
    await page.locator('[data-calculation-confidence="confident"]').click();
  }
  await page.locator("#calculationDrillNextButton").click();
  return true;
}

(async () => {
  fs.mkdirSync(screenshotDir, { recursive: true });
  const server = await startStaticServer();
  assert.ok(fs.existsSync(chromePath), `Chrome executable not found: ${chromePath}`);
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const errors = [];
  try {
    const desktopContext = await newContext(browser, { width: 1440, height: 1000 });
    const desktop = await desktopContext.newPage();
    desktop.on("pageerror", (error) => errors.push(`desktop pageerror: ${error.message}`));
    desktop.on("console", (message) => {
      if (message.type() === "error") errors.push(`desktop console: ${message.text()}`);
    });
    await gotoReview(desktop, server.baseUrl, "calc-desktop");

    const initial = await desktop.evaluate(() => ({
      open: document.querySelector("#calculationDrillPanel")?.open,
      prompt: document.querySelector("#calculationDrillPrompt")?.textContent?.trim(),
      choices: document.querySelectorAll("#calculationDrillChoices .calculation-drill-choice").length,
      summary: document.querySelector("#calculationDrillSummary")?.textContent?.trim()
    }));
    assert.equal(initial.open, true);
    assert.ok(initial.prompt.includes("200万円"));
    assert.equal(initial.choices, 4);
    assert.equal(initial.summary, "初回 0 / 24・再出題 0");

    await desktop.locator("#calculationDrillChoices .calculation-drill-choice").nth(0).click();
    assert.match(await desktop.locator("#calculationDrillVerdict").textContent(), /誤答/);
    assert.equal(await desktop.locator("#calculationDrillFormula li").count(), 2);
    assert.match(await desktop.locator("#calculationDrillRetryStatus").textContent(), /再出題 1/);
    await desktop.locator("#calculationDrillNextButton").click();

    await desktop.locator("#calculationDrillChoices .calculation-drill-choice").nth(1).click();
    await desktop.locator('[data-calculation-confidence="uncertain"]').click();
    assert.match(await desktop.locator("#calculationDrillRetryStatus").textContent(), /再出題 2/);
    await desktop.screenshot({ path: path.join(screenshotDir, "desktop-feedback.png"), fullPage: true });

    const persistedBeforeReload = await desktop.evaluate((storageId) => {
      const saved = JSON.parse(localStorage.getItem(storageId) || "{}");
      return {
        schema: saved.stateSchemaVersion,
        currentAttempt: saved.calculationDrill?.currentAttempt,
        retryIds: saved.calculationDrill?.retryIds,
        attempts: saved.calculationDrill?.attempts
      };
    }, storageIdFor("calc-desktop"));
    assert.equal(persistedBeforeReload.schema, 8);
    assert.equal(persistedBeforeReload.currentAttempt?.confidence, "uncertain");
    assert.deepEqual(persistedBeforeReload.retryIds, ["calc-sale-200", "calc-sale-300"]);
    assert.equal(persistedBeforeReload.attempts, 2);

    await desktop.reload({ waitUntil: "networkidle" });
    if (!(await desktop.locator("#calculationDrillPanel").evaluate((node) => node.open))) {
      await desktop.locator("#calculationDrillPanel > summary").click();
    }
    assert.equal(await desktop.locator('[data-calculation-confidence="uncertain"]').getAttribute("class"), "is-selected");
    await desktop.locator("#calculationDrillNextButton").click();
    for (let guard = 0; guard < 80; guard += 1) {
      const stage = await desktop.evaluate((storageId) =>
        JSON.parse(localStorage.getItem(storageId) || "{}").calculationDrill?.stage,
      storageIdFor("calc-desktop"));
      if (stage === "complete") break;
      await answerCurrentCorrectly(desktop);
    }

    const completed = await desktop.evaluate((storageId) => {
      const drill = JSON.parse(localStorage.getItem(storageId) || "{}").calculationDrill;
      return {
        stage: drill.stage,
        retryIds: drill.retryIds,
        mastered: drill.masteredIds.length,
        attempts: drill.attempts,
        correct: drill.correctAttempts,
        completedAt: drill.completedAt
      };
    }, storageIdFor("calc-desktop"));
    assert.equal(completed.stage, "complete");
    assert.deepEqual(completed.retryIds, []);
    assert.equal(completed.mastered, 24);
    assert.equal(completed.attempts, 26);
    assert.equal(completed.correct, 25);
    assert.ok(Number.isFinite(Date.parse(completed.completedAt)));
    assert.match(await desktop.locator("#calculationDrillCompleteText").textContent(), /累計26解答/);
    const desktopOverflow = await noHorizontalOverflow(desktop);
    assert.equal(desktopOverflow.rootOverflow, 0, JSON.stringify(desktopOverflow));
    assert.deepEqual(desktopOverflow.offenders, [], JSON.stringify(desktopOverflow));
    await desktop.screenshot({ path: path.join(screenshotDir, "desktop-complete.png"), fullPage: true });
    await desktopContext.close();

    const legacyContext = await newContext(browser, { width: 1280, height: 900 });
    const legacyPage = await legacyContext.newPage();
    await gotoReview(legacyPage, server.baseUrl, "calc-legacy");
    await legacyPage.evaluate((storageId) => {
      localStorage.setItem(storageId, JSON.stringify({
        stateSchemaVersion: 4,
        progressionVersion: 4,
        examContentVersion: 3,
        attempts: 37,
        correct: 25,
        questionStats: { q1: { correct: 2, wrong: 1 } },
        centralProgress: { q1: { answered: true } }
      }));
    }, storageIdFor("calc-legacy"));
    await legacyPage.reload({ waitUntil: "networkidle" });
    const migrated = await legacyPage.evaluate((storageId) => {
      const saved = JSON.parse(localStorage.getItem(storageId) || "{}");
      return {
        schema: saved.stateSchemaVersion,
        attempts: saved.attempts,
        correct: saved.correct,
        q1Correct: saved.questionStats?.q1?.correct,
        centralAnswered: saved.centralProgress?.q1?.answered,
        calcQueue: saved.calculationDrill?.queue?.length,
        calcStage: saved.calculationDrill?.stage
      };
    }, storageIdFor("calc-legacy"));
    assert.deepEqual(migrated, {
      schema: 8,
      attempts: 37,
      correct: 25,
      q1Correct: 2,
      centralAnswered: true,
      calcQueue: 24,
      calcStage: "first"
    });
    await legacyContext.close();

    const mobileContext = await newContext(browser, { width: 390, height: 844 });
    const mobile = await mobileContext.newPage();
    mobile.on("pageerror", (error) => errors.push(`mobile pageerror: ${error.message}`));
    mobile.on("console", (message) => {
      if (message.type() === "error") errors.push(`mobile console: ${message.text()}`);
    });
    await gotoReview(mobile, server.baseUrl, "calc-mobile");
    const mobileLayout = await mobile.evaluate(() => {
      const choice = document.querySelector(".calculation-drill-choice")?.getBoundingClientRect();
      const question = document.querySelector(".calculation-drill-question")?.getBoundingClientRect();
      return {
        viewport: document.documentElement.clientWidth,
        choiceWidth: Math.round(choice?.width || 0),
        questionWidth: Math.round(question?.width || 0),
        columns: getComputedStyle(document.querySelector(".calculation-drill-choices")).gridTemplateColumns
      };
    });
    assert.equal(mobileLayout.viewport, 390);
    assert.equal(mobileLayout.columns.split(" ").length, 1);
    assert.ok(mobileLayout.choiceWidth <= mobileLayout.questionWidth);
    const mobileOverflow = await noHorizontalOverflow(mobile);
    assert.equal(mobileOverflow.rootOverflow, 0, JSON.stringify(mobileOverflow));
    assert.deepEqual(mobileOverflow.offenders, [], JSON.stringify(mobileOverflow));
    await mobile.screenshot({ path: path.join(screenshotDir, "mobile-390.png"), fullPage: true });
    await mobileContext.close();

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      status: "ok",
      desktop: { completed, overflow: desktopOverflow },
      legacyMigration: migrated,
      mobile390: { ...mobileLayout, overflow: mobileOverflow },
      screenshots: screenshotDir
    }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
