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
    ".svg": "image/svg+xml",
    ".webp": "image/webp"
  };
  const safeRoot = path.resolve(root);
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(safeRoot, relative);
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

function reviewUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set("review", `business-mastery-${Date.now().toString(36)}`);
  url.searchParams.set("today", "1");
  return url.toString();
}

async function waitForApp(page) {
  await page.waitForFunction(() => {
    const metrics = document.querySelector("#businessMasteryMetrics")?.textContent || "";
    return /変形/.test(metrics) &&
      document.querySelectorAll("#businessMasteryGrid article").length === 11;
  });
}

async function readSavedState(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") &&
      !candidate.includes("-before-") &&
      !candidate.includes("previous") &&
      !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    if (!key) throw new Error("business mastery save key not found");
    return JSON.parse(localStorage.getItem(key));
  });
}

async function injectPrimarySaveFailure(page) {
  await page.evaluate(() => {
    const primaryKey = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") &&
      !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
    );
    const original = Storage.prototype.setItem;
    window.__restoreAuditStorageSetItem = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function setItemWithInjectedFailure(key, value) {
      if (String(key) === primaryKey) throw new DOMException("audit quota failure", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
}

async function restorePrimarySave(page) {
  await page.evaluate(() => window.__restoreAuditStorageSetItem?.());
}

async function currentPracticalQuestion(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") &&
      !candidate.includes("-before-") &&
      !candidate.includes("previous") &&
      !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    const state = JSON.parse(localStorage.getItem(key));
    const id = state.practicalDrill.queue[state.practicalDrill.position];
    const bank = state.practicalDrill.bankId === "business-fullscore"
      ? window.TAKKEN_BUSINESS_FULLSCORE_BANK
      : window.TAKKEN_PRACTICAL_VARIATIONS;
    const question = bank.QUESTIONS_BY_ID[id];
    const presented = state.practicalDrill.bankId === "business-fullscore"
      ? bank.presentQuestion(question, state.practicalDrill.presentationKey)
      : question;
    return {
      id,
      answer: presented.answer,
      choices: presented.choices,
      scopeId: question.scopeId || "business",
      unitId: question.unitId
    };
  });
}

async function answerCurrent(page, selected, confidence = "") {
  await page.locator(".practical-drill-choice").nth(selected).click();
  await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
  if (confidence) {
    await page.locator(`[data-practical-confidence="${confidence}"]`).click();
  }
}

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function installDueFixture(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") &&
      !candidate.includes("-before-") &&
      !candidate.includes("previous") &&
      !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    const state = JSON.parse(localStorage.getItem(key));
    const question = window.TAKKEN_PRACTICAL_VARIATIONS.QUESTIONS.find((item) =>
      item.scopeId === "business"
    );
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const keyFor = (value) => [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0")
    ].join("-");
    state.practicalDrill = {
      ...state.practicalDrill,
      stage: "active",
      scope: "business",
      unitId: "",
      sessionSize: 4,
      sessionIds: [question.id],
      queue: [question.id],
      position: 0,
      currentAttempt: null,
      retryIds: [],
      sessionStartedAt: now.toISOString(),
      completedAt: "",
      history: {
        ...state.practicalDrill.history,
        [question.id]: {
          attempts: 1,
          correct: 1,
          wrong: 0,
          uncertain: 0,
          lastSelected: question.answer,
          lastCorrect: true,
          lastConfidence: "confident",
          lastAnsweredAt: yesterday.toISOString(),
          reviewLevel: 1,
          masteryDueKey: keyFor(now),
          confidentDayKeys: [keyFor(yesterday)]
        }
      }
    };
    localStorage.setItem(key, JSON.stringify(state));
    return { id: question.id, todayKey: keyFor(now) };
  });
}

async function installFullScoreUnitFixture(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") &&
      !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
    );
    const state = JSON.parse(localStorage.getItem(key));
    const bank = window.TAKKEN_BUSINESS_FULLSCORE_BANK;
    const unit = [...bank.UNITS].sort((left, right) =>
      right.questionIds.length - left.questionIds.length
    )[0];
    const startedAt = new Date().toISOString();
    state.practicalDrill = {
      ...state.practicalDrill,
      bankId: "business-fullscore",
      bankVersion: bank.VERSION,
      presentationKey: `${bank.localDayKey(new Date())}:unit-16-audit`,
      stage: "active",
      scope: "business",
      unitId: unit.id,
      sessionSize: unit.questionIds.length,
      sessionIds: [...unit.questionIds],
      queue: [...unit.questionIds],
      position: 0,
      currentAttempt: null,
      retryIds: [],
      sessionStartedAt: startedAt,
      completedAt: ""
    };
    localStorage.setItem(key, JSON.stringify(state));
    return { unitId: unit.id, size: unit.questionIds.length };
  });
}

async function installOfficialUnlockFixture(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") &&
      !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
    );
    const state = JSON.parse(localStorage.getItem(key));
    const bank = window.TAKKEN_BUSINESS_FULLSCORE_BANK;
    const businessUnitIds = new Set(bank.UNITS.map((unit) => unit.id));
    const chapters = Object.values(window.TAKKEN_EXAM_BLUEPRINT.textbookRanges)
      .flatMap((range) => range.chapters || [])
      .filter((chapter) => businessUnitIds.has(chapter.id));
    const baseIds = [...new Set(chapters.flatMap((chapter) => chapter.ids || []))];
    const now = new Date();
    const earlier = new Date(now);
    earlier.setDate(earlier.getDate() - 2);
    const previous = new Date(now);
    previous.setDate(previous.getDate() - 1);
    const dayKey = (value) => [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0")
    ].join("-");
    state.questionStats = {};
    baseIds.forEach((id) => {
      state.questionStats[id] = {
        ...(state.questionStats[id] || {}),
        attempts: 2,
        correct: 2,
        wrong: 0,
        correctDayKeys: [dayKey(earlier), dayKey(previous)],
        clearDayKeys: [dayKey(earlier), dayKey(previous)],
        lastCorrectAt: previous.toISOString(),
        lastClearAt: previous.toISOString(),
        lastAnsweredAt: previous.toISOString(),
        lastStep: 2,
        lastCorrectStep: 2,
        lastWrongStep: 0,
        lastWrongAt: earlier.toISOString(),
        lastConfidence: "sure",
        lastConfidenceAt: previous.toISOString()
      };
    });
    const history = { ...(state.practicalDrill.history || {}) };
    bank.QUESTIONS.forEach((question) => {
      history[question.id] = {
        attempts: 1,
        correct: 1,
        wrong: 0,
        uncertain: 0,
        lastSelected: question.answer,
        lastCorrect: true,
        lastConfidence: "confident",
        lastAnsweredAt: now.toISOString(),
        reviewLevel: 1,
        masteryDueKey: "2099-12-31",
        confidentDayKeys: [dayKey(now)],
        mistakeTags: {},
        lastMistakeTags: []
      };
    });
    state.practicalDrill = {
      ...state.practicalDrill,
      bankId: "business-fullscore",
      bankVersion: bank.VERSION,
      presentationKey: `${dayKey(now)}:bank-${bank.VERSION}`,
      stage: "idle",
      unitId: "",
      sessionSize: 10,
      sessionIds: [],
      queue: [],
      position: 0,
      currentAttempt: null,
      retryIds: [],
      history,
      sessionStartedAt: "",
      completedAt: ""
    };
    state.officialExamHistory = [];
    state.officialExamSession = null;
    state.runMode = "quest";
    localStorage.setItem(key, JSON.stringify(state));
    return { baseCount: baseIds.length, allTextbookCount: Object.keys(state.questionStats).length };
  });
}

async function installDailyDrillReadyFixture(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") &&
      !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
    );
    const state = JSON.parse(localStorage.getItem(key));
    const allIds = [...new Set(Object.values(window.TAKKEN_EXAM_BLUEPRINT.textbookRanges)
      .flatMap((range) => range.chapters || [])
      .flatMap((chapter) => chapter.ids || []))];
    const now = new Date();
    const earlier = new Date(now);
    earlier.setDate(earlier.getDate() - 2);
    const previous = new Date(now);
    previous.setDate(previous.getDate() - 1);
    const dayKey = (value) => [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0")
    ].join("-");
    const planIds = allIds.slice(0, 10);
    allIds.forEach((id) => {
      const answeredNow = planIds.includes(id);
      const answeredAt = answeredNow ? now : previous;
      state.questionStats[id] = {
        attempts: 2,
        correct: 2,
        wrong: 0,
        correctDayKeys: [dayKey(earlier), dayKey(answeredAt)],
        clearDayKeys: [dayKey(earlier), dayKey(answeredAt)],
        lastCorrectAt: answeredAt.toISOString(),
        lastClearAt: answeredAt.toISOString(),
        lastAnsweredAt: answeredAt.toISOString(),
        lastStep: 2,
        lastCorrectStep: 2,
        lastWrongStep: 0,
        lastWrongAt: earlier.toISOString(),
        lastConfidence: "sure",
        lastConfidenceAt: answeredAt.toISOString()
      };
    });
    state.daily = {
      ...state.daily,
      date: dayKey(now),
      planIds,
      ids: planIds,
      target: 10,
      planMode: "coverage",
      planScope: state.studyScope
    };
    state.dailyFinishedDate = dayKey(now);
    state.missionLog = {};
    state.officialExamSession = null;
    state.runMode = "quest";
    localStorage.setItem(key, JSON.stringify(state));
    return { allIds: allIds.length, planIds: planIds.length };
  });
}

async function installFullScoreProofFixture(page, mode) {
  return page.evaluate((requestedMode) => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") &&
      !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
    );
    const state = JSON.parse(localStorage.getItem(key));
    const bank = window.TAKKEN_BUSINESS_FULLSCORE_BANK;
    const businessUnitIds = new Set(bank.UNITS.map((unit) => unit.id));
    const baseIds = [...new Set(Object.values(window.TAKKEN_EXAM_BLUEPRINT.textbookRanges)
      .flatMap((range) => range.chapters || [])
      .filter((chapter) => businessUnitIds.has(chapter.id))
      .flatMap((chapter) => chapter.ids || []))];
    const earlierAt = new Date("2026-07-24T12:00:00+09:00").toISOString();
    const correctAt = new Date("2026-07-26T12:00:00+09:00").toISOString();
    baseIds.forEach((id) => {
      state.questionStats[id] = {
        attempts: 2,
        correct: 2,
        wrong: 0,
        clearDayKeys: ["2026-07-24", "2026-07-26"],
        correctDayKeys: ["2026-07-24", "2026-07-26"],
        lastCorrectAt: correctAt,
        lastClearAt: correctAt,
        lastAnsweredAt: correctAt,
        lastWrongAt: earlierAt,
        lastStep: 2,
        lastCorrectStep: 2,
        lastWrongStep: 0,
        lastConfidence: "sure",
        lastConfidenceAt: correctAt
      };
    });
    const chain = [
      "2026-06-01", "2026-06-02", "2026-06-05",
      "2026-06-12", "2026-06-26", "2026-07-26"
    ];
    const history = { ...(state.practicalDrill.history || {}) };
    bank.QUESTIONS.forEach((question) => {
      history[question.id] = {
        attempts: 6,
        correct: 6,
        wrong: 0,
        uncertain: 0,
        lastSelected: question.answer,
        lastCorrect: true,
        lastConfidence: "confident",
        lastAnsweredAt: correctAt,
        reviewLevel: 6,
        masteryDueKey: "",
        confidentDayKeys: chain,
        mistakeTags: {},
        lastMistakeTags: []
      };
    });
    state.practicalDrill = {
      ...state.practicalDrill,
      bankId: "business-fullscore",
      bankVersion: bank.VERSION,
      presentationKey: "2026-07-26:bank-proof-audit",
      stage: "idle",
      unitId: "",
      sessionSize: 10,
      sessionIds: [],
      queue: [],
      position: 0,
      currentAttempt: null,
      retryIds: [],
      history,
      sessionStartedAt: "",
      completedAt: ""
    };
    const exams = window.TAKKEN_OFFICIAL_EXAMS.EXAMS
      .filter((exam) => exam.id !== "2025")
      .slice(0, 5);
    const dates = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"];
    const count = requestedMode === "ready" ? 3 : requestedMode === "recovery" ? 4 : 5;
    state.officialExamHistory = exams.slice(0, count).map((exam, index) => {
      const answers = Object.fromEntries(exam.answers.map((answer, answerIndex) => [
        String(answerIndex + 1),
        Array.isArray(answer) ? answer[0] : answer
      ]));
      if (index === 3) {
        answers["26"] = answers["26"] === 4 ? 3 : answers["26"] + 1;
      }
      const scored = window.TAKKEN_OFFICIAL_EXAMS.scoreAnswers(exam.id, answers);
      return {
        recordId: `fullscore-proof-${requestedMode}-${exam.id}`,
        examId: exam.id,
        year: exam.year,
        attemptType: "initial",
        sourceMode: "timed-answer-sheet",
        evidenceVersion: 2,
        startedAt: `${dates[index]}T09:00:00+09:00`,
        startedDayKey: dates[index],
        completedAt: `${dates[index]}T10:59:00+09:00`,
        appUnseenAtStart: true,
        lawBaseline: "2026-04-01",
        timed120: true,
        lawChecked: true,
        answers,
        score: scored.score,
        rights: scored.sectionScores.rights,
        restrictions: scored.sectionScores.restrictions,
        business: scored.sectionScores.business,
        taxOther: scored.sectionScores.taxOther,
        elapsedMinutes: 119
      };
    });
    state.officialExamSession = null;
    state.officialExamHistory.forEach((item) => {
      state.officialExamExposure[item.examId] = {
        firstOpenedAt: item.startedAt,
        firstOpenedDayKey: item.startedDayKey,
        source: "full-exam"
      };
    });
    localStorage.setItem(key, JSON.stringify(state));
    return { count, questionCount: bank.QUESTIONS.length };
  }, mode);
}

(async () => {
  const local = await startStaticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const context = page.context();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  try {
    const url = reviewUrl(local.baseUrl);
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(page);

    assert.match(await page.locator("#businessMasteryPanel").textContent(), /2026年4月1日現在法/);
    assert.match(await page.locator("#businessMasteryMetrics").textContent(), /変形.*未接触134/);
    assert.equal(await page.locator("#businessTransferGate").textContent(), "0 / 134");
    assert.equal(await page.locator("#businessMasteryGrid article").count(), 11);
    const unitTotals = await page.locator("#businessMasteryGrid article small").allTextContents();
    const renderedTotals = unitTotals.map((text) => Number(text.match(/変形接触 \d+\/(\d+)/)?.[1] || 0));
    assert.equal(renderedTotals.reduce((sum, total) => sum + total, 0), 134);
    const minimumTargets = await page.locator("#businessMasteryPanel button").evaluateAll((buttons) =>
      buttons.map((button) => Math.round(button.getBoundingClientRect().height))
    );
    assert.ok(minimumTargets.every((height) => height >= 44));
    assert.equal(await horizontalOverflow(page), 0);

    const initialPageCount = context.pages().length;
    assert.equal(await page.locator('#officialExamQuestionLink[href]').count(), 0);
    assert.equal(await page.locator('a[href*="past_ques_ans/other"]').count(), 0);
    await page.evaluate(() => document.querySelector("#officialExamQuestionLink").click());
    await page.waitForTimeout(100);
    assert.equal(context.pages().length, initialPageCount, "the full-exam PDF cannot open before exposure is saved");
    assert.deepEqual((await readSavedState(page)).officialExamExposure, {});
    await page.evaluate(() => document.querySelector("#officialDrillQuestionLink").click());
    await page.waitForTimeout(100);
    assert.equal(context.pages().length, initialPageCount, "a failed daily-drill gate cannot fall through to the PDF");
    assert.deepEqual((await readSavedState(page)).officialExamExposure, {});

    const dailyReady = await installDailyDrillReadyFixture(page);
    assert.equal(dailyReady.allIds, 124);
    assert.equal(dailyReady.planIds, 10);
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    await page.locator("#officialDrillOpenButton").click();
    assert.equal(await page.locator("#officialDrillPanel").isVisible(), true);
    const dailyFailurePageCount = context.pages().length;
    await injectPrimarySaveFailure(page);
    await page.locator("#officialDrillQuestionLink").click();
    await page.waitForTimeout(100);
    assert.equal(context.pages().length, dailyFailurePageCount, "a failed daily exposure save must not open the PDF");
    const failedDailyState = await readSavedState(page);
    assert.equal(failedDailyState.officialExamExposure["2025"], undefined);
    assert.ok(!failedDailyState.missionLog[Object.keys(failedDailyState.missionLog)[0]]?.officialDrill?.startedAt);
    assert.match(await page.locator("#officialDrillStatus").textContent(), /保存できない/);
    await restorePrimarySave(page);
    // noopener deliberately severs the opener relationship, so Chromium may
    // surface the PDF as a new context page rather than page.popup.
    const dailyPopupPromise = context.waitForEvent("page");
    await page.locator("#officialDrillQuestionLink").click();
    const dailyPopup = await dailyPopupPromise;
    assert.match(dailyPopup.url(), /^https:\/\//);
    await dailyPopup.close();
    let dailySaved = await readSavedState(page);
    assert.ok(dailySaved.missionLog[Object.keys(dailySaved.missionLog)[0]].officialDrill.startedAt);
    assert.ok(dailySaved.officialExamExposure["2025"], "daily PDF exposure must be saved before opening");
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    assert.match(
      await page.locator('#officialExamId option[value="2025"]').textContent(),
      /接触済み/
    );

    await page.locator("#businessMasteryFull").click();
    let saved = await readSavedState(page);
    assert.equal(saved.stateSchemaVersion, 10);
    assert.equal(saved.practicalDrill.bankId, "business-fullscore");
    assert.equal(saved.practicalDrill.sessionSize, 134);
    assert.equal(saved.practicalDrill.queue.length, 134);
    assert.equal(new Set(saved.practicalDrill.queue).size, 134);
    assert.match(saved.practicalDrill.presentationKey, /^\d{4}-\d{2}-\d{2}:bank-\d+$/);
    const originalQueue = [...saved.practicalDrill.queue];
    const originalPresentationKey = saved.practicalDrill.presentationKey;
    const originalQuestion = await currentPracticalQuestion(page);
    const originalChoiceTexts = await page.locator(".practical-drill-choice").allTextContents();
    assert.equal(await page.locator("#businessMasteryFull").isDisabled(), true);
    assert.equal(await page.locator("#businessMasteryGrid button:enabled").count(), 0);
    await page.locator("#businessMasteryPrimary").click();
    assert.deepEqual((await readSavedState(page)).practicalDrill.queue, originalQueue);
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    saved = await readSavedState(page);
    assert.equal(saved.practicalDrill.sessionSize, 134, "reload must not shrink the full sweep to the legacy dropdown sizes");
    assert.equal(saved.practicalDrill.presentationKey, originalPresentationKey);
    assert.deepEqual(saved.practicalDrill.queue, originalQueue);
    assert.deepEqual(await page.locator(".practical-drill-choice").allTextContents(), originalChoiceTexts);
    assert.equal((await currentPracticalQuestion(page)).id, originalQuestion.id);

    await answerCurrent(page, (originalQuestion.answer + 1) % 4);
    saved = await readSavedState(page);
    const mistakeTags = saved.practicalDrill.history[originalQuestion.id].mistakeTags;
    assert.ok(Object.keys(mistakeTags).length > 0, "a wrong rotated choice must record diagnostics");
    const allowedTags = new Set(await page.evaluate(() =>
      window.TAKKEN_BUSINESS_FULLSCORE_BANK.ALLOWED_DIAGNOSTIC_TAGS
    ));
    assert.ok(Object.keys(mistakeTags).every((tag) => allowedTags.has(tag)));
    assert.match(await page.locator("#businessMasteryWeakness").textContent(), /直近: (?!なし)/);
    await page.evaluate((questionId) => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") &&
        !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
      );
      const state = JSON.parse(localStorage.getItem(key));
      state.practicalDrill.history[questionId].mistakeTags["forged-tag"] = 999;
      state.practicalDrill.history[questionId].lastMistakeTags.push("forged-tag");
      localStorage.setItem(key, JSON.stringify(state));
    }, originalQuestion.id);
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    saved = await readSavedState(page);
    assert.equal(saved.practicalDrill.history[originalQuestion.id].mistakeTags["forged-tag"], undefined);
    assert.ok(!saved.practicalDrill.history[originalQuestion.id].lastMistakeTags.includes("forged-tag"));
    await page.locator("#practicalDrillCancelButton").click();
    await page.locator("#businessMasteryFull").click();
    saved = await readSavedState(page);
    assert.equal(saved.practicalDrill.queue[0], originalQuestion.id, "the highest diagnostic retry must lead the next full sweep");
    await page.locator("#practicalDrillCancelButton").click();

    const unitFixture = await installFullScoreUnitFixture(page);
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    saved = await readSavedState(page);
    assert.ok(unitFixture.size > 0);
    assert.equal(saved.practicalDrill.unitId, unitFixture.unitId);
    assert.equal(saved.practicalDrill.sessionSize, unitFixture.size, "reload must retain a variable-size unit session");
    assert.equal(saved.practicalDrill.queue.length, unitFixture.size);
    await page.locator("#practicalDrillCancelButton").click();

    const unlockFixture = await installOfficialUnlockFixture(page);
    assert.equal(unlockFixture.baseCount, 44);
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    assert.equal(await page.locator("#businessFoundationGate").textContent(), "44 / 44");
    assert.match(await page.locator("#businessMasteryMetrics").textContent(), /未接触0/);
    assert.match(await page.locator("#businessMasteryPrimary").textContent(), /公式50問で測定（未見\d+回）/);
    assert.doesNotMatch(await page.locator("#foundationGateStatus").textContent(), /45 \/ 45/);

    const failureExamId = await page.locator("#officialExamId").inputValue();
    const exposureBeforeFailure = Object.keys((await readSavedState(page)).officialExamExposure || {}).sort();
    await injectPrimarySaveFailure(page);
    await page.locator("#businessMasteryPrimary").click();
    let failedStartState = await readSavedState(page);
    assert.equal(failedStartState.officialExamSession, null, "a failed write must not leave an in-memory official session");
    assert.equal(failedStartState.officialExamExposure[failureExamId], undefined, "a failed write must not fabricate exposure");
    assert.deepEqual(Object.keys(failedStartState.officialExamExposure || {}).sort(), exposureBeforeFailure);
    assert.match(await page.locator("#saveTransferStatus").textContent(), /自動保存に失敗/);
    assert.equal(await page.locator('#officialExamQuestionLink[href]').count(), 0);
    await restorePrimarySave(page);

    const stalePagePromise = context.waitForEvent("page");
    await page.evaluate(() => window.open("about:blank", "_blank"));
    const stalePage = await stalePagePromise;
    stalePage.on("pageerror", (error) => errors.push(`stale-page: ${error.message}`));
    stalePage.on("console", (message) => {
      if (message.type() === "error") errors.push(`stale-console: ${message.text()}`);
    });
    await stalePage.addInitScript(() => {
      const original = window.addEventListener.bind(window);
      window.addEventListener = (type, listener, options) => {
        if (type === "storage") return;
        return original(type, listener, options);
      };
    });
    await stalePage.goto(page.url(), { waitUntil: "networkidle" });
    await waitForApp(stalePage);
    assert.equal(await stalePage.locator("#officialExamId").inputValue(), failureExamId);
    await page.locator("#businessMasteryPrimary").click();
    saved = await readSavedState(page);
    assert.ok(saved.officialExamSession, "the business route must reach an official 50-question initial session");
    assert.equal(saved.officialExamSession.evidenceVersion, 3);
    assert.equal(saved.officialExamSession.appUnseenAtStart, true);
    assert.equal(saved.officialExamSession.scoringBasis, "historical-official-key");
    assert.equal(saved.officialExamSession.currentLawBaseline, "2026-04-01");
    assert.ok(Number.isInteger(saved.officialExamSession.startedUtcOffsetMinutes));
    assert.match(saved.officialExamSession.startedDayKey, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(await page.locator("#officialExamLawChecked").count(), 0);
    assert.match(await page.locator("#officialLawNotice").textContent(), /当時法.*現行法/);
    assert.ok(saved.officialExamExposure[saved.officialExamSession.examId], "exposure must be saved at start, before submission");
    const activeOfficialId = saved.officialExamSession.examId;
    await stalePage.locator("#businessMasteryPrimary").click();
    assert.match(await stalePage.locator("#saveTransferStatus").textContent(), /別タブ|接触済み/);
    const afterStaleStart = await readSavedState(page);
    assert.equal(afterStaleStart.officialExamSession.examId, activeOfficialId);
    assert.equal(afterStaleStart.officialExamSession.appUnseenAtStart, true);
    await stalePage.close();
    await page.evaluate(() => document.querySelector("#practicalDrillStartButton").click());
    saved = await readSavedState(page);
    assert.equal(saved.officialExamSession.examId, activeOfficialId, "a practical launch must not overwrite the active official session");
    assert.equal(saved.practicalDrill.stage, "idle");
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    saved = await readSavedState(page);
    assert.equal(saved.officialExamSession.examId, activeOfficialId);
    assert.ok(saved.officialExamExposure[activeOfficialId]);
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#officialExamAbandonButton").click();
    saved = await readSavedState(page);
    assert.equal(saved.officialExamSession, null, "abandoning must release the active-session lock");
    assert.ok(saved.officialExamExposure[activeOfficialId], "abandoning must retain exposure");
    assert.match(
      await page.locator(`#officialExamId option[value="${activeOfficialId}"]`).textContent(),
      /接触済み/
    );
    const nextOfficialId = await page.locator("#officialExamId").inputValue();
    assert.notEqual(nextOfficialId, activeOfficialId, "an exposed exam cannot be selected as a fresh initial attempt");
    assert.equal(await page.locator("#officialExamStartButton").isEnabled(), true);
    await page.locator("#officialExamStartButton").click();
    saved = await readSavedState(page);
    assert.equal(saved.officialExamSession.examId, nextOfficialId, "a different unseen exam remains startable");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#officialExamAbandonButton").click();

    const packageWithoutExposure = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") &&
        !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
      );
      const imported = JSON.parse(localStorage.getItem(key));
      imported.officialExamSession = null;
      imported.officialExamHistory = [];
      imported.officialExamExposure = {};
      return JSON.stringify(window.TAKKEN_SAVE_TRANSFER.createSavePackage(imported));
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#saveImportInput").setInputFiles({
      name: "fullscore-import-without-exposure.json",
      mimeType: "application/json",
      buffer: Buffer.from(packageWithoutExposure, "utf8")
    });
    await page.waitForFunction(() =>
      document.querySelector("#saveTransferStatus")?.textContent?.includes("引継ぎ完了")
    );
    saved = await readSavedState(page);
    assert.ok(saved.officialExamExposure[activeOfficialId], "a valid exposure ledger must survive import of an older package");

    assert.deepEqual(await installFullScoreProofFixture(page, "ready"), { count: 3, questionCount: 134 });
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    const proofDebug = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") &&
        !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
      );
      const saved = JSON.parse(localStorage.getItem(key));
      const counts = window.TAKKEN_BUSINESS_FULLSCORE_BANK.QUESTIONS.reduce((result, question) => {
        const status = window.TAKKEN_BUSINESS_MASTERY.stateFor(saved.practicalDrill.history[question.id] || {}, new Date());
        result[status] = (result[status] || 0) + 1;
        return result;
      }, {});
      const overall = window.TAKKEN_BUSINESS_MASTERY.summarizeOverall(
        window.TAKKEN_BUSINESS_FULLSCORE_BANK.UNITS,
        window.TAKKEN_BUSINESS_FULLSCORE_BANK.QUESTIONS,
        saved.practicalDrill.history,
        new Date()
      );
      const panel = document.querySelector("#businessMasteryPanel");
      const official = window.TAKKEN_BUSINESS_MASTERY.summarizeOfficialProof(saved.officialExamHistory || [], {
        lawBaseline: "2026-04-01"
      });
      return {
        counts,
        total: overall.questions.total,
        durable: overall.questions.durable,
        durableUnits: overall.durableUnits,
        renderedStatus: panel?.dataset.masteryStatus || "",
        renderedTransferReady: panel?.dataset.transferReady || "",
        renderedDurableUnits: panel?.dataset.durableUnits || "",
        renderedDurableTiles: document.querySelectorAll('#businessMasteryGrid [data-mastery-state="durable"]').length,
        official,
        normalizedEvidence: (saved.officialExamHistory || []).map((item) => ({
          examId: item.examId,
          evidenceVersion: item.evidenceVersion,
          score: item.score,
          business: item.business,
          answers: Object.keys(item.answers || {}).length,
          elapsedMinutes: item.elapsedMinutes,
          startedDayKey: item.startedDayKey
        }))
      };
    });
    assert.equal(await page.locator("#businessMasteryStatus").textContent(), "満点圏（アプリ内判定）", JSON.stringify(proofDebug));
    assert.equal(await page.locator("#businessTransferGate").textContent(), "134 / 134");
    assert.equal(await page.locator("#businessOfficialGate").textContent(), "3 / 3");
    await installFullScoreProofFixture(page, "recovery");
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    assert.match(await page.locator("#businessMasteryStatus").textContent(), /再調整/);
    assert.match(await page.locator("#businessOfficialGate").textContent(), /再調整/);
    await installFullScoreProofFixture(page, "cleared");
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    assert.equal(await page.locator("#businessMasteryStatus").textContent(), "満点圏（アプリ内判定）");

    const dailyRaceContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const dailyRaceOwner = await dailyRaceContext.newPage();
    const dailyRaceUrl = reviewUrl(local.baseUrl);
    await dailyRaceOwner.goto(dailyRaceUrl, { waitUntil: "networkidle" });
    await waitForApp(dailyRaceOwner);
    await installDailyDrillReadyFixture(dailyRaceOwner);
    await dailyRaceOwner.reload({ waitUntil: "networkidle" });
    await waitForApp(dailyRaceOwner);
    const dailyRaceStale = await dailyRaceContext.newPage();
    await dailyRaceStale.addInitScript(() => {
      const original = window.addEventListener.bind(window);
      window.addEventListener = (type, listener, options) => {
        if (type === "storage") return;
        return original(type, listener, options);
      };
    });
    await dailyRaceStale.goto(dailyRaceUrl, { waitUntil: "networkidle" });
    await waitForApp(dailyRaceStale);
    await dailyRaceOwner.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") &&
        !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
      );
      const saved = JSON.parse(localStorage.getItem(key));
      const startedAt = new Date().toISOString();
      const offset = new Date(startedAt).getTimezoneOffset();
      const shifted = new Date(Date.parse(startedAt) - offset * 60000);
      const startedDayKey = shifted.toISOString().slice(0, 10);
      saved.officialExamSession = {
        evidenceVersion: 3,
        scoringBasis: "historical-official-key",
        examId: "2025",
        attemptType: "initial",
        startedAt,
        startedDayKey,
        startedUtcOffsetMinutes: offset,
        appUnseenAtStart: true,
        currentLawBaseline: "2026-04-01",
        answers: {},
        position: 0
      };
      saved.officialExamExposure["2025"] = {
        firstOpenedAt: startedAt,
        firstOpenedDayKey: startedDayKey,
        firstOpenedUtcOffsetMinutes: offset,
        source: "full-exam"
      };
      saved.syncMeta = {
        ...(saved.syncMeta || {}),
        revision: Math.max(0, Number(saved.syncMeta?.revision) || 0) + 1,
        updatedAt: startedAt,
        writerId: "daily-race-owner"
      };
      localStorage.setItem(key, JSON.stringify(saved));
    });
    await dailyRaceStale.locator("#officialDrillOpenButton").click();
    const dailyRacePageCount = dailyRaceContext.pages().length;
    await dailyRaceStale.locator("#officialDrillQuestionLink").click();
    await dailyRaceStale.waitForTimeout(100);
    assert.equal(dailyRaceContext.pages().length, dailyRacePageCount, "daily PDF must stay closed while the same exam is active in another tab");
    assert.match(await dailyRaceStale.locator("#officialDrillStatus").textContent(), /保存できない/);
    const dailyRaceSaved = await readSavedState(dailyRaceOwner);
    assert.equal(dailyRaceSaved.officialExamSession.examId, "2025");
    assert.ok(!dailyRaceSaved.missionLog[Object.keys(dailyRaceSaved.missionLog)[0]]?.officialDrill?.startedAt);
    await dailyRaceContext.close();

    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.locator("#businessMasteryPanel").scrollIntoViewIfNeeded();
      await page.locator("#businessMasteryPanel").screenshot({
        path: path.join(screenshotDir, "business-mastery-390.png")
      });
    }
    assert.equal(await horizontalOverflow(page), 0);
    await page.setViewportSize({ width: 320, height: 700 });
    assert.equal(await horizontalOverflow(page), 0);
    if (screenshotDir) {
      await page.locator("#businessMasteryPanel").screenshot({
        path: path.join(screenshotDir, "business-mastery-320.png")
      });
    }
    assert.deepEqual(errors, []);

    console.log(JSON.stringify({
      status: "ok",
      topics: 11,
      fullSweep: 134,
      variableUnitSession: unitFixture.size,
      foundationRetained: 44,
      officialUnlockedBeforeAll45: true,
      saveFailureRolledBack: true,
      staleTabInitialRejected: true,
      staleTabDailyPdfRejected: true,
      exposureSavedAtStart: true,
      exposureSurvivedImport: true,
      recoveryAfterValidMiss: true,
      recoveryClearedByLaterPerfect: true,
      diagnosticTagsRecorded: Object.keys(mistakeTags).length,
      reloadPreserved: true,
      overflow390: 0,
      overflow320: 0,
      errors: 0
    }));
  } finally {
    await browser.close();
    await local.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
