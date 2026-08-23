#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const screenshotDir = process.env.TAKKEN_SCREENSHOT_DIR || "";
const FIXED_NOW = "2026-08-22T09:00:00+09:00";

async function newFixedPage(browser, viewport) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(({ now }) => {
    const RealDate = Date;
    const fixedNow = new RealDate(now).getTime();
    class FixedDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [fixedNow])); }
      static now() { return fixedNow; }
    }
    window.Date = FixedDate;
  }, { now: FIXED_NOW });
  return page;
}

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

async function answerCurrentCorrect(page) {
  const answer = await page.evaluate(() => {
    const text = document.querySelector("#questionText")?.textContent || "";
    const question = Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
      .find((candidate) => candidate.text === text);
    if (!question) throw new Error(`question not found: ${text.slice(0, 80)}`);
    return question.answer;
  });
  await page.locator(`.choice-button[data-index="${answer}"]`).click();
  await page.locator("#feedbackBox").waitFor({ state: "visible" });
}

async function currentPractical(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") &&
      !candidate.includes("previous") && !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    const id = state.practicalDrill?.queue?.[state.practicalDrill?.position || 0];
    const item = window.TAKKEN_PRACTICAL_VARIATIONS.QUESTIONS_BY_ID[id];
    if (!item) throw new Error(`practical question not found: ${id || "missing id"}`);
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
    const desktop = await newFixedPage(browser, { width: 1536, height: 1024 });
    desktop.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    desktop.on("pageerror", (error) => pageErrors.push(error.message));
    await gotoFresh(desktop, baseUrl, "learning-route-desktop");

    const initial = await desktop.evaluate(() => ({
      title: document.querySelector("#todayCommandTitle")?.textContent || "",
      text: document.querySelector("#todayCommandText")?.textContent || "",
      foundationTitle: document.querySelector("#foundationRouteTitle")?.textContent || "",
      foundationText: document.querySelector("#foundationRouteText")?.textContent || "",
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
    assert.match(initial.title, /宅建業法 残り20問/);
    assert.match(initial.text, /固定/);
    assert.match(initial.foundationTitle, /01-01 宅建業法の基本/);
    assert.match(initial.foundationText, /p\.3/);
    assert.match(initial.source, /読後2問/);
    assert.match(initial.dailyTitle, /読後2問/);
    assert.equal(initial.unitStatus.trim(), "0 / 20");
    assert.match(initial.practicalStatus.trim(), /^0 \/ \d+$/);
    assert.equal(initial.gateStatus.trim(), "0分 / 最低75分");
    assert.equal(initial.mockLocked, false);
    assert.ok(initial.order.measurement < initial.order.theme);
    assert.ok(initial.order.theme < initial.order.quest);
    assert.ok(initial.order.quest < initial.order.practical);

    const initialState = (await savedState(desktop)).state;
    assert.equal(initialState.stateSchemaVersion, 10);
    assert.equal(initialState.daily.planMode, "unit");
    assert.equal(initialState.daily.planUnitId, "business-book-01");
    assert.equal(initialState.daily.planIds.length, 2);

    await answerCurrentCorrect(desktop);
    await desktop.locator("#dockNextButton").click();
    await desktop.waitForFunction(() =>
      (document.querySelector("#roundLabel")?.textContent || "").includes("2 / 2")
    );
    await answerCurrentCorrect(desktop);
    assert.equal(
      (await desktop.locator("#dockNextLabel").textContent()).trim(),
      "読後2問を終了"
    );
    assert.equal(
      (await desktop.locator("#dockTargetText").textContent()).trim(),
      "読後2問完了・次の単元へ"
    );
    await desktop.locator("#dockNextButton").click();
    await desktop.waitForFunction(() =>
      (document.querySelector("#foundationRouteTitle")?.textContent || "").includes("01-02 免許")
    );
    assert.match(await desktop.locator("#foundationRouteTitle").textContent(), /01-02 免許/);
    if (!(await desktop.locator("#foundationRoutePracticalButton").isVisible())) {
      if (!(await desktop.locator("#themeDrawer").evaluate((node) => node.open))) {
        await desktop.locator("#themeDrawer > summary").click();
      }
      const completedUnitOption = await desktop.locator("#chapterSelect option")
        .filter({ hasText: "01-01 宅建業法の基本" })
        .getAttribute("value");
      assert.ok(completedUnitOption);
      await desktop.locator("#chapterSelect").selectOption(completedUnitOption);
    }
    assert.equal(await desktop.locator("#foundationRoutePracticalButton").isVisible(), true);
    await desktop.locator("#foundationRoutePracticalButton").click();
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
    assert.match(await desktop.locator("#practicalDrillCompleteText").textContent(), /01-01 宅建業法の基本/);
    assert.equal(
      await desktop.locator("#practicalDrillRestartButton").textContent(),
      "同じ単元を4問続ける"
    );
    assert.match(await desktop.locator("#foundationRouteTitle").textContent(), /01-02 免許/);

    const migrated = await migrateV6(desktop);
    assert.equal(migrated.stateSchemaVersion, 10);
    assert.equal(typeof migrated.practicalDrill.unitId, "string");
    assert.equal(migrated.practicalDrill.attempts, 5);

    await completeFoundationGate(desktop);
    assert.equal(await desktop.locator("#mockAButton").isDisabled(), false);
    assert.equal(await desktop.locator("#todayCommandOfficialActions").isVisible(), true);
    assert.match(await desktop.locator("#officialDrillOpenButton").textContent(), /公式20問/);
    assert.equal(await noHorizontalOverflow(desktop), 0);

    const mobile = await newFixedPage(browser, { width: 390, height: 844 });
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
      progressButtonHeight: document.querySelector("#progressDrawerLink")?.getBoundingClientRect().height,
      resetButtonHeight: document.querySelector("#resetButton")?.getBoundingClientRect().height,
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
    assert.ok(mobileLayout.progressButtonHeight >= 44, JSON.stringify(mobileLayout));
    assert.ok(mobileLayout.resetButtonHeight >= 44, JSON.stringify(mobileLayout));

    const largeUnitPage = await newFixedPage(browser, { width: 1280, height: 900 });
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
      (document.querySelector("#foundationRouteTitle")?.textContent || "").includes("01-07 業務上の規制")
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
        routeText: document.querySelector("#foundationRouteText")?.textContent || "",
        round: document.querySelector("#roundLabel")?.textContent || ""
      };
    });
    assert.equal(largeUnitBatch.chapterIds.length, 15);
    assert.equal(largeUnitBatch.planIds.length, 2);
    assert.equal(largeUnitBatch.target, 2);
    assert.equal(largeUnitBatch.planUnitId, "business-book-01");
    assert.match(largeUnitBatch.routeText, /まず4問.*単元残り15問/);
    const activeQuestionId = await largeUnitPage.evaluate(() => {
      const text = document.querySelector("#questionText")?.textContent || "";
      return Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
        .find((question) => question.text === text)?.id || "";
    });
    assert.equal(activeQuestionId, largeUnitBatch.chapterIds[0]);
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
