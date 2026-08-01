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

function reviewUrl(baseUrl, name) {
  const url = new URL(baseUrl);
  url.searchParams.set("review", `${name}-${Date.now().toString(36)}`);
  return url.toString();
}

async function gotoFresh(page, baseUrl, name) {
  await page.goto(reviewUrl(baseUrl, name), { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForFunction(() =>
    (document.querySelector("#dailyQuestSource")?.textContent || "").includes("読後2問")
  );
}

async function savedState(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") &&
      !candidate.includes("-before-") &&
      !candidate.includes("previous") &&
      !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    if (!key) throw new Error("review save key not found");
    return { key, state: JSON.parse(localStorage.getItem(key)) };
  });
}

async function markFirstUnitContacted(page) {
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") &&
      !candidate.includes("-before-") &&
      !candidate.includes("previous") &&
      !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    const state = JSON.parse(localStorage.getItem(key));
    const unit = Object.values(window.TAKKEN_EXAM_BLUEPRINT.textbookRanges)
      .flatMap((range) => range.chapters)
      .find((chapter) => chapter.id === "business-book-01");
    const now = new Date().toISOString();
    const local = new Date();
    const day = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    unit.ids.forEach((id, index) => {
      state.questionStats[id] = {
        attempts: 1,
        correct: 1,
        wrong: 0,
        lastStep: index + 1,
        lastAnsweredAt: now,
        lastCorrectAt: now,
        lastClearAt: now,
        correctDayKeys: [day],
        clearDayKeys: [day],
        lastConfidence: "clear",
        lastConfidenceAt: now
      };
    });
    state.daily.answers = unit.ids.length;
    state.daily.correct = unit.ids.length;
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    (document.querySelector("#todayCommandKicker")?.textContent || "").includes("実践4問")
  );
}

async function currentPractical(page) {
  return page.evaluate(() => {
    const text = document.querySelector("#practicalDrillPrompt")?.textContent || "";
    const item = window.TAKKEN_PRACTICAL_VARIATIONS.QUESTIONS
      .find((question) => question.text === text);
    if (!item) throw new Error(`practical question not found: ${text.slice(0, 80)}`);
    return { id: item.id, answer: item.answer, unitId: item.unitId };
  });
}

async function answerPractical(page, answer, confidence = "confident") {
  await page.locator(`.practical-drill-choice:nth-child(${answer + 1})`).click();
  await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
  if (await page.locator("#practicalDrillConfidence").isVisible()) {
    await page.locator(`[data-practical-confidence="${confidence}"]`).click();
  }
  await page.locator("#practicalDrillNextButton").click();
}

async function completeUnitPractical(page) {
  const first = await currentPractical(page);
  await answerPractical(page, (first.answer + 1) % 4);
  for (let guard = 0; guard < 10; guard += 1) {
    const { state } = await savedState(page);
    if (state.practicalDrill.stage === "complete") return state;
    const current = await currentPractical(page);
    await answerPractical(page, current.answer, "confident");
  }
  throw new Error("unit practical session did not complete");
}

async function migrateV6(page) {
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") &&
      !candidate.includes("-before-") &&
      !candidate.includes("previous") &&
      !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    const state = JSON.parse(localStorage.getItem(key));
    state.stateSchemaVersion = 6;
    delete state.practicalDrill.unitId;
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload({ waitUntil: "networkidle" });
  return (await savedState(page)).state;
}

async function completeFoundationGate(page) {
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") &&
      !candidate.includes("-before-") &&
      !candidate.includes("previous") &&
      !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    const state = JSON.parse(localStorage.getItem(key));
    const ids = [...new Set(Object.values(window.TAKKEN_EXAM_BLUEPRINT.textbookRanges)
      .flatMap((range) => range.chapters)
      .flatMap((chapter) => chapter.ids))];
    const now = new Date().toISOString();
    const local = new Date();
    const day = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    ids.forEach((id, index) => {
      state.questionStats[id] = {
        ...(state.questionStats[id] || {}),
        attempts: Math.max(1, state.questionStats[id]?.attempts || 0),
        correct: Math.max(1, state.questionStats[id]?.correct || 0),
        wrong: state.questionStats[id]?.wrong || 0,
        lastStep: index + 1,
        lastAnsweredAt: now,
        lastCorrectAt: now,
        lastClearAt: now,
        correctDayKeys: [day],
        clearDayKeys: [day],
        lastConfidence: "clear",
        lastConfidenceAt: now
      };
    });
    state.studyScope = "all";
    state.daily = {
      date: day,
      answers: 10,
      correct: 10,
      wrong: 0,
      weakAdded: 0,
      target: 10,
      planIds: ids.slice(0, 10),
      planVersion: 3,
      planMode: "coverage",
      planScope: "all",
      planUnitId: ""
    };
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    (document.querySelector("#foundationGateStatus")?.textContent || "").includes("45 / 45")
  );
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
}

async function main() {
  const external = process.env.TAKKEN_BASE_URL || "";
  const server = external ? null : await startStaticServer(__dirname);
  const baseUrl = external || server.baseUrl;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const consoleErrors = [];
  const pageErrors = [];
  try {
    const desktop = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
    desktop.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    desktop.on("pageerror", (error) => pageErrors.push(error.message));
    await gotoFresh(desktop, baseUrl, "learning-route-desktop");

    const initial = await desktop.evaluate(() => ({
      title: document.querySelector("#todayCommandTitle")?.textContent || "",
      text: document.querySelector("#todayCommandText")?.textContent || "",
      source: document.querySelector("#dailyQuestSource")?.textContent || "",
      dailyTitle: document.querySelector("#dailyQuestTitle")?.textContent || "",
      unitStatus: document.querySelector("#missionBattleStatus")?.textContent || "",
      practicalStatus: document.querySelector("#missionOfficialStatus")?.textContent || "",
      gateStatus: document.querySelector("#missionMinutesStatus")?.textContent || "",
      mockLocked: document.querySelector("#mockAButton")?.disabled,
      order: {
        theme: document.querySelector("#themeDrawer")?.getBoundingClientRect().top,
        quest: document.querySelector(".quest-card")?.getBoundingClientRect().top,
        practical: document.querySelector("#practicalDrillPanel")?.getBoundingClientRect().top,
        measurement: document.querySelector("#passPlanPanel")?.getBoundingClientRect().top
      }
    }));
    assert.match(initial.title, /01-01 宅建業法の基本/);
    assert.match(initial.text, /p\.3/);
    assert.match(initial.source, /読後2問/);
    assert.match(initial.dailyTitle, /読後2問/);
    assert.equal(initial.unitStatus.trim(), "0 / 2");
    assert.equal(initial.practicalStatus.trim(), "0 / 4");
    assert.match(initial.gateStatus, /0 \/ 45単元/);
    assert.equal(initial.mockLocked, true);
    assert.ok(initial.order.theme < initial.order.quest);
    assert.ok(initial.order.quest < initial.order.practical);
    assert.ok(initial.order.practical < initial.order.measurement);

    const initialState = (await savedState(desktop)).state;
    assert.equal(initialState.stateSchemaVersion, 7);
    assert.equal(initialState.daily.planMode, "unit");
    assert.equal(initialState.daily.planUnitId, "business-book-01");
    assert.equal(initialState.daily.planIds.length, 2);

    await markFirstUnitContacted(desktop);
    assert.match(await desktop.locator("#todayCommandTitle").textContent(), /組み替えて解く/);
    await desktop.locator("#todayCommandStartButton").click();
    await desktop.locator("#practicalDrillPrompt").waitFor({ state: "visible" });
    const unitSession = (await savedState(desktop)).state.practicalDrill;
    assert.equal(unitSession.unitId, "business-book-01");
    assert.equal(unitSession.sessionSize, 4);
    assert.equal(unitSession.sessionIds.length, 4);
    assert.ok(unitSession.sessionIds.every((id) => id.startsWith("pv-business-book-01-")));

    const completed = await completeUnitPractical(desktop);
    assert.equal(completed.practicalDrill.stage, "complete");
    assert.equal(completed.practicalDrill.attempts, 5);
    assert.equal(completed.practicalDrill.retryIds.length, 0);
    assert.equal(
      completed.practicalDrill.sessionIds.filter((id) =>
        completed.practicalDrill.history[id]?.lastConfidence === "confident"
      ).length,
      4
    );
    assert.match(await desktop.locator("#todayCommandTitle").textContent(), /01-02 免許/);

    const migrated = await migrateV6(desktop);
    assert.equal(migrated.stateSchemaVersion, 7);
    assert.equal(typeof migrated.practicalDrill.unitId, "string");
    assert.equal(migrated.practicalDrill.attempts, 5);

    await completeFoundationGate(desktop);
    assert.equal(await desktop.locator("#mockAButton").isDisabled(), false);
    assert.match(await desktop.locator("#todayCommandTitle").textContent(), /公式20問/);
    assert.equal(await noHorizontalOverflow(desktop), 0);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    mobile.on("pageerror", (error) => pageErrors.push(error.message));
    await gotoFresh(mobile, baseUrl, "learning-route-mobile");
    await mobile.locator("#themeDrawer > summary").click();
    assert.equal(await mobile.locator(".foundation-route-card").isVisible(), true);
    const mobileLayout = await mobile.evaluate(() => ({
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      routeWidth: document.querySelector(".foundation-route-card")?.getBoundingClientRect().width,
      viewport: window.innerWidth,
      quizBeforePractice: document.querySelector("#quizCard")?.getBoundingClientRect().top <
        document.querySelector("#practicalDrillPanel")?.getBoundingClientRect().top,
      buttonWidth: document.querySelector("#foundationRoutePrimaryButton")?.getBoundingClientRect().width,
      overflowElements: [...document.querySelectorAll("body *")]
        .map((element) => ({
          tag: element.tagName,
          id: element.id,
          className: String(element.className || "").slice(0, 80),
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right)
        }))
        .filter((item) => item.left < 0 || item.right > window.innerWidth)
        .slice(0, 12)
    }));
    assert.equal(mobileLayout.overflow, 0, JSON.stringify(mobileLayout.overflowElements));
    assert.equal(mobileLayout.quizBeforePractice, true);
    assert.ok(mobileLayout.routeWidth <= mobileLayout.viewport);
    assert.ok(mobileLayout.buttonWidth > 250);

    const largeUnitPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    largeUnitPage.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    largeUnitPage.on("pageerror", (error) => pageErrors.push(error.message));
    await gotoFresh(largeUnitPage, baseUrl, "learning-route-large-unit");
    await largeUnitPage.locator("#themeDrawer > summary").click();
    const largeUnitOption = await largeUnitPage.locator("#chapterSelect option")
      .filter({ hasText: "01-07 業務上の規制" })
      .getAttribute("value");
    assert.ok(largeUnitOption);
    await largeUnitPage.locator("#chapterSelect").selectOption(largeUnitOption);
    await largeUnitPage.waitForFunction(() =>
      (document.querySelector("#dailyQuestSource")?.textContent || "").includes("読後4問")
    );
    const largeUnitBatch = await largeUnitPage.evaluate(() => {
      const namespace = String(new URLSearchParams(location.search).get("review") || "")
        .replace(/[^a-z0-9-]/gi, "")
        .slice(0, 24);
      const key = `takken-battle-study-clean-v2-hard-review-${namespace}`;
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      const chapter = Object.values(window.TAKKEN_EXAM_BLUEPRINT.textbookRanges)
        .flatMap((range) => range.chapters)
        .find((item) => item.id === "business-book-07");
      return {
        planIds: saved.daily?.planIds || [],
        target: saved.daily?.target,
        planUnitId: saved.daily?.planUnitId,
        chapterIds: chapter?.ids || [],
        source: document.querySelector("#dailyQuestSource")?.textContent || "",
        routeText: document.querySelector("#todayCommandText")?.textContent || "",
        round: document.querySelector("#roundLabel")?.textContent || ""
      };
    });
    assert.equal(largeUnitBatch.chapterIds.length, 15);
    assert.equal(largeUnitBatch.planIds.length, 4);
    assert.equal(largeUnitBatch.target, 4);
    assert.equal(largeUnitBatch.planUnitId, "business-book-07");
    assert.ok(largeUnitBatch.planIds.every((id) => largeUnitBatch.chapterIds.includes(id)));
    assert.match(largeUnitBatch.routeText, /まず4問.*単元残り15問/);
    assert.match(largeUnitBatch.round, /読後 1 \/ 4/);
    await largeUnitPage.close();

    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      await desktop.screenshot({ path: path.join(screenshotDir, "learning-route-desktop.png"), fullPage: true });
      await mobile.screenshot({ path: path.join(screenshotDir, "learning-route-mobile.png"), fullPage: true });
    }

    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    console.log(JSON.stringify({
      status: "ok",
      initial,
      unitSession: {
        unitId: unitSession.unitId,
        questions: unitSession.sessionIds.length,
        attemptsWithRetry: completed.practicalDrill.attempts
      },
      migration: {
        schema: migrated.stateSchemaVersion,
        practicalAttempts: migrated.practicalDrill.attempts
      },
      gate: "45 / 45",
      largeUnitBatch,
      mobile: mobileLayout,
      consoleErrors: consoleErrors.length,
      pageErrors: pageErrors.length
    }, null, 2));
  } finally {
    await browser.close();
    if (server) await server.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
