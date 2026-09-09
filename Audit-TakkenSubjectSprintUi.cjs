#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function staticServer(root) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".webp": "image/webp"
  };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`) && target !== path.join(path.resolve(root), "index.html")) {
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

function saveKey(review) {
  return `takken-battle-study-clean-v2-hard-review-${review}`;
}

async function readSaved(page, key) {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || "{}"), key);
}

async function waitForApp(page) {
  await page.waitForFunction(() =>
    window.TAKKEN_SUBJECT_SPRINT_BANK?.VERSION === 3 &&
    window.TAKKEN_SUBJECT_SPRINT_BANK?.COVERAGE?.bySection?.restrictions === 32 &&
    document.querySelector('[data-subject-sprint="restrictions"]:not([data-subject-sprint-topic])')
  );
}

function assertAnchorSpacing(snapshot) {
  snapshot.anchors.forEach((anchor, index) => {
    if (index >= 1) assert.notEqual(anchor, snapshot.anchors[index - 1], `source anchor repeated at distance 1: ${index}`);
    if (index >= 2) assert.notEqual(anchor, snapshot.anchors[index - 2], `source anchor repeated at distance 2: ${index}`);
  });
}

async function main() {
  const server = process.env.TAKKEN_BASE_URL
    ? { baseUrl: process.env.TAKKEN_BASE_URL, close: async () => {} }
    : await staticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      reducedMotion: "reduce",
      acceptDownloads: true
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const review = `lawv46${Date.now().toString(36)}`;
    const key = saveKey(review);
    const url = new URL(server.baseUrl);
    url.searchParams.set("review", review);
    url.searchParams.set("today", "1");
    await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(page);

    const button = page.locator('[data-subject-sprint="restrictions"]:not([data-subject-sprint-topic])');
    assert.equal((await button.textContent()).trim(), "法令 20問（全32問）・約27分");
    assert.equal(await button.getAttribute("data-session-size"), "20");
    // Dispatch the same click event without waiting for the smooth-scroll
    // animation, which is irrelevant to the saved-session contract.
    await page.evaluate(() => document.querySelector('[data-subject-sprint="restrictions"]:not([data-subject-sprint-topic])')?.click());
    await page.waitForFunction((storageKey) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      return drill?.bankId === "subject-sprint" && drill?.stage === "active" && drill?.queue?.length === 20;
    }, key);

    const started = await page.evaluate((storageKey) => {
      const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
      const ids = state.practicalDrill.queue;
      const questions = window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID;
      return {
        bankVersion: state.practicalDrill.bankVersion,
        scope: state.practicalDrill.scope,
        sessionSize: state.practicalDrill.sessionSize,
        sessionIds: state.practicalDrill.sessionIds,
        queue: ids,
        anchors: ids.map((id) => questions[id].sourceAnchor),
        sourceQuestionIds: ids.map((id) => questions[id].sourceQuestionId),
        supplementIndex: ids.findIndex((id, index) => id.includes("-rs") && index < ids.length - 1)
      };
    }, key);
    assert.equal(started.bankVersion, 3);
    assert.equal(started.scope, "restrictions");
    assert.equal(started.sessionSize, 20);
    assert.equal(started.queue.length, 20);
    assert.deepEqual(started.sessionIds, started.queue);
    assert.equal(new Set(started.queue).size, 20);
    assert.equal(new Set(started.sourceQuestionIds).size, 20);
    assert.ok(started.supplementIndex >= 0, "the 20-question session must include a new independent restriction scenario");
    assertAnchorSpacing(started);

    const supplementalId = started.queue[started.supplementIndex];
    await page.evaluate(({ storageKey, position }) => {
      const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
      state.practicalDrill.position = position;
      state.practicalDrill.currentAttempt = null;
      localStorage.setItem(storageKey, JSON.stringify(state));
    }, { storageKey: key, position: started.supplementIndex });
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    const presented = await page.evaluate(({ storageKey, id }) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      const question = window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID[id];
      const presentationKey = drill.presentationOverrides?.[id] || drill.presentationKey;
      const item = window.TAKKEN_SUBJECT_SPRINT_BANK.presentQuestion(question, presentationKey);
      return { answer: item.answer, text: item.text, sourceUrls: item.sourceUrls };
    }, { storageKey: key, id: supplementalId });
    assert.ok((await page.locator("#practicalDrillPrompt").textContent()).includes(presented.text.split("\n")[0]));
    await page.locator(".practical-drill-choice").nth(presented.answer).click();
    await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
    assert.ok((await page.locator("#practicalDrillReasoning").textContent()).trim().length > 40);
    assert.equal(await page.locator("#practicalDrillSources a").count(), presented.sourceUrls.length);
    await page.locator('[data-practical-confidence="confident"]').click();
    await page.locator("#practicalDrillNextButton").click();
    await page.waitForFunction(({ storageKey, position }) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      return drill?.position === position + 1 && !drill?.currentAttempt;
    }, { storageKey: key, position: started.supplementIndex });
    const advanced = await readSaved(page, key);
    assert.deepEqual(advanced.practicalDrill.queue, started.queue);
    assert.equal(advanced.practicalDrill.history[supplementalId].attempts, 1);
    assert.equal(advanced.practicalDrill.history[supplementalId].correct, 1);

    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    const resumed = await readSaved(page, key);
    assert.deepEqual(resumed.practicalDrill.queue, started.queue);
    assert.equal(resumed.practicalDrill.position, started.supplementIndex + 1);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const layout = await page.evaluate(() => ({
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        promptVisible: (() => {
          const rect = document.querySelector("#practicalDrillPrompt")?.getBoundingClientRect();
          return Boolean(rect && rect.bottom > 0 && rect.top < innerHeight);
        })(),
        choiceHeights: [...document.querySelectorAll(".practical-drill-choice")]
          .filter((node) => node.offsetParent)
          .map((node) => Math.round(node.getBoundingClientRect().height))
      }));
      assert.equal(layout.overflow, 0, `${width}px overflow`);
      assert.equal(layout.promptVisible, true, `${width}px next question must remain in view`);
      assert.ok(layout.choiceHeights.length === 4 && layout.choiceHeights.every((height) => height >= 44), `${width}px answer targets`);
    }

    page.once("dialog", (dialog) => dialog.accept());
    await page.evaluate(() => document.querySelector("#practicalDrillDiscardButton")?.click());
    await page.locator("#practicalDrillSession").waitFor({ state: "hidden" });
    await page.evaluate((storageKey) => {
      const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
      const retry = (attempts) => ({
        attempts,
        correct: 0,
        wrong: attempts,
        lastAnsweredAt: "2026-09-08T10:00:00+09:00",
        lastConfidence: "wrong"
      });
      state.practicalDrill = {
        ...state.practicalDrill,
        bankId: "subject-sprint",
        bankVersion: 3,
        stage: "idle",
        scope: "restrictions",
        unitId: "subject-sprint-restrictions",
        sessionSize: 20,
        sessionIds: [],
        queue: [],
        position: 0,
        currentAttempt: null,
        retryIds: [],
        history: {
          "sprint-law-l001": retry(2),
          "sprint-law-l002": retry(3)
        }
      };
      localStorage.setItem(storageKey, JSON.stringify(state));
    }, key);
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    await page.evaluate(() => document.querySelector('[data-subject-sprint="restrictions"]:not([data-subject-sprint-topic])')?.click());
    await page.waitForFunction((storageKey) =>
      JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill?.queue?.length === 20,
    key);
    const splitPriority = await page.evaluate((storageKey) => {
      const queue = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill.queue;
      const questions = window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID;
      return { queue, anchors: queue.map((id) => questions[id].sourceAnchor) };
    }, key);
    assert.equal(splitPriority.queue[0], "sprint-law-l001", "highest-priority restriction remains first");
    assert.ok(splitPriority.queue.indexOf("sprint-law-l002") > 1, "same-law retry crosses its attempt bucket to avoid repetition");
    assertAnchorSpacing(splitPriority);
    await context.close();

    const topicReview = `lawtopic${Date.now().toString(36)}`;
    const topicKey = saveKey(topicReview);
    const topicContext = await browser.newContext({
      viewport: { width: 320, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce"
    });
    const topicPage = await topicContext.newPage();
    topicPage.on("pageerror", (error) => errors.push(String(error)));
    topicPage.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const topicUrl = new URL(server.baseUrl);
    topicUrl.searchParams.set("review", topicReview);
    topicUrl.searchParams.set("today", "1");
    await topicPage.goto(topicUrl.toString(), { waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(topicPage);
    const topicLayout = await topicPage.evaluate(() => ({
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      labels: [...document.querySelectorAll("[data-subject-sprint-topic]")].map((node) => node.textContent.trim()),
      heights: [...document.querySelectorAll("[data-subject-sprint-topic]")].map((node) => Math.round(node.getBoundingClientRect().height))
    }));
    assert.equal(topicLayout.overflow, 0, "restriction topic launcher must fit 320px");
    assert.equal(topicLayout.labels.length, 7, "all restriction catch-up launchers must be exposed");
    assert.ok(topicLayout.heights.every((height) => height >= 44), `restriction topic target under 44px: ${topicLayout.heights.join(", ")}`);

    await topicPage.evaluate(() =>
      document.querySelector('[data-subject-sprint-topic="catchup"]')?.click()
    );
    await topicPage.waitForFunction((storageKey) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      return drill?.bankId === "subject-sprint" && drill?.stage === "active" && drill?.queue?.length === 20;
    }, topicKey);
    const catchup = await topicPage.evaluate((storageKey) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      const questions = window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID;
      return {
        presentationKey: drill.presentationKey,
        ids: drill.queue,
        sourceQuestionIds: drill.queue.map((id) => questions[id].sourceQuestionId)
      };
    }, topicKey);
    const cityPlanningIds = new Set(["l001", "l002", "l003", "l004", "rs001", "rs002"]);
    assert.match(catchup.presentationKey, /:topic-catchup:/, "catch-up identity must survive reload/restart");
    assert.equal(catchup.ids.length, 20);
    assert.equal(new Set(catchup.ids).size, 20);
    assert.ok(catchup.sourceQuestionIds.every((id) => !cityPlanningIds.has(id)), "catch-up must exclude completed city-planning questions");

    topicPage.once("dialog", (dialog) => dialog.accept());
    await topicPage.locator("#practicalDrillDiscardButton").click();
    await topicPage.locator("#practicalDrillSession").waitFor({ state: "hidden" });
    await topicPage.evaluate(() =>
      document.querySelector('[data-subject-sprint-topic="building"]')?.click()
    );
    await topicPage.waitForFunction((storageKey) =>
      JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill?.queue?.length === 6,
    topicKey);
    const buildingSources = await topicPage.evaluate((storageKey) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      const questions = window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID;
      return drill.queue.map((id) => questions[id].sourceQuestionId).sort();
    }, topicKey);
    assert.deepEqual(buildingSources, ["l005", "l006", "l007", "l008", "rs003", "rs004"]);
    await topicPage.evaluate((storageKey) => {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      saved.practicalDrill.stage = "complete";
      saved.practicalDrill.queue = [];
      saved.practicalDrill.position = 0;
      saved.practicalDrill.currentAttempt = null;
      saved.practicalDrill.completedAt = new Date().toISOString();
      localStorage.setItem(storageKey, JSON.stringify(saved));
    }, topicKey);
    await topicPage.reload({ waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(topicPage);
    await topicPage.locator("#practicalDrillComplete").waitFor({ state: "visible" });
    assert.match(await topicPage.locator("#practicalDrillRestartButton").textContent(), /建築基準法をもう一周/);
    await topicPage.locator("#practicalDrillRestartButton").click();
    await topicPage.waitForFunction((storageKey) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      return drill?.stage === "active" && drill?.queue?.length === 6 && /:topic-building:/.test(drill.presentationKey || "");
    }, topicKey);
    await topicContext.close();

    const defaultReview = `lawdefault${Date.now().toString(36)}`;
    const defaultKey = saveKey(defaultReview);
    const defaultContext = await browser.newContext({
      viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce"
    });
    const defaultPage = await defaultContext.newPage();
    defaultPage.on("pageerror", (error) => errors.push(String(error)));
    defaultPage.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const defaultUrl = new URL(server.baseUrl);
    defaultUrl.searchParams.set("review", defaultReview);
    defaultUrl.searchParams.set("today", "1");
    await defaultPage.goto(defaultUrl.toString(), { waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(defaultPage);
    const repairFixture = await defaultPage.evaluate((storageKey) => {
      const exam = window.TAKKEN_OFFICIAL_EXAMS.EXAM_BY_ID["2025"];
      const wrongQuestionNo = 15;
      const plan = window.TAKKEN_OFFICIAL_TOPIC_MAP.repairPlan(exam.id, wrongQuestionNo);
      const answers = Object.fromEntries(exam.answers.map((expected, index) => {
        const accepted = Array.isArray(expected) ? expected : [expected];
        const answer = index + 1 === wrongQuestionNo
          ? [1, 2, 3, 4].find((choice) => !accepted.includes(choice))
          : accepted[0];
        return [String(index + 1), answer];
      }));
      const scored = window.TAKKEN_OFFICIAL_EXAMS.scoreAnswers(exam.id, answers);
      const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
      state.officialExamHistory = [{
        recordId: "restriction-repair-default",
        examId: exam.id,
        year: exam.year,
        attemptType: "initial",
        sourceMode: "timed-answer-sheet",
        examProfile: "general",
        questionCount: 50,
        evidenceVersion: 3,
        scoringBasis: "historical-official-key",
        startedAt: "2026-09-08T07:00:00.000Z",
        startedDayKey: "2026-09-08",
        startedUtcOffsetMinutes: -540,
        appUnseenAtStart: true,
        currentLawBaseline: "2026-04-01",
        timed120: true,
        lawChecked: false,
        answers,
        score: scored.score,
        rights: scored.sectionScores.rights,
        restrictions: scored.sectionScores.restrictions,
        business: scored.sectionScores.business,
        taxOther: scored.sectionScores.taxOther,
        elapsedMinutes: 110,
        completedAt: "2026-09-08T08:50:00.000Z"
      }];
      state.officialExamExposure = {
        ...(state.officialExamExposure || {}),
        [exam.id]: {
          firstOpenedAt: "2026-09-08T07:00:00.000Z",
          firstOpenedDayKey: "2026-09-08",
          source: "full-exam"
        }
      };
      localStorage.setItem(storageKey, JSON.stringify(state));
      return { taxonomyId: plan?.primary?.taxonomyId, wrongQuestionNo };
    }, defaultKey);
    assert.equal(repairFixture.taxonomyId, "restrictions", "official repair fixture must route to restrictions");
    await defaultPage.reload({ waitUntil: "networkidle" });
    await waitForApp(defaultPage);
    await defaultPage.waitForFunction(() => document.querySelectorAll(".official-repair-button").length === 1);
    await defaultPage.evaluate(() => document.querySelector(".official-repair-button")?.click());
    await defaultPage.waitForFunction((storageKey) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      return drill?.scope === "restrictions" && drill?.stage === "active";
    }, defaultKey);
    const defaultRestrictionDrill = (await readSaved(defaultPage, defaultKey)).practicalDrill;
    assert.equal(defaultRestrictionDrill.sessionSize, 20, "official restriction repair must use the 20-question default");
    assert.equal(defaultRestrictionDrill.queue.length, 20, "official restriction repair must not expand to all 32 questions");
    await defaultContext.close();

    const rightsPriorityIds = [
      "sprint-rights-r001",
      "sprint-rights-r002",
      "sprint-rights-r003",
      "sprint-rights-r004"
    ];
    const rightsReview = `rightspriority${Date.now().toString(36)}`;
    const rightsKey = saveKey(rightsReview);
    const rightsContext = await browser.newContext({
      viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce"
    });
    await rightsContext.addInitScript(({ storageKey, ids }) => {
      const retry = Object.fromEntries(ids.map((id, index) => [id, {
        attempts: index + 1,
        correct: 0,
        wrong: index + 1,
        lastAnsweredAt: "2026-09-08T10:00:00+09:00",
        lastConfidence: "wrong"
      }]));
      localStorage.setItem(storageKey, JSON.stringify({
        stateSchemaVersion: 12,
        practicalDrill: {
          stage: "idle",
          bankId: "subject-sprint",
          bankVersion: 3,
          planMode: "sprint",
          scope: "rights",
          unitId: "subject-sprint-rights",
          sessionSize: 4,
          sessionIds: [],
          queue: [],
          position: 0,
          presentationOverrides: {},
          currentAttempt: null,
          retryIds: ids,
          history: retry,
          attempts: 0,
          correctAttempts: 0,
          sessionsCompleted: 0
        }
      }));
    }, { storageKey: rightsKey, ids: rightsPriorityIds });
    const rightsPage = await rightsContext.newPage();
    rightsPage.on("pageerror", (error) => errors.push(String(error)));
    rightsPage.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const rightsUrl = new URL(server.baseUrl);
    rightsUrl.searchParams.set("review", rightsReview);
    rightsUrl.searchParams.set("today", "1");
    await rightsPage.goto(rightsUrl.toString(), { waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(rightsPage);
    const rightsPriorityProof = await rightsPage.evaluate((priorityIds) => {
      const bank = window.TAKKEN_SUBJECT_SPRINT_BANK;
      const otherIds = bank.QUESTIONS
        .filter((question) => question.sectionId === "rights" && !priorityIds.includes(question.id))
        .map((question) => question.id);
      return {
        priorityAnchors: priorityIds.map((id) => bank.QUESTIONS_BY_ID[id].sourceAnchor),
        scopeAnchors: [...new Set([...priorityIds, ...otherIds].map((id) => bank.QUESTIONS_BY_ID[id].sourceAnchor))],
        wholeBankDiversifiedTop: bank.diversify([...priorityIds, ...otherIds]).slice(0, priorityIds.length)
      };
    }, rightsPriorityIds);
    assert.equal(new Set(rightsPriorityProof.priorityAnchors).size, 1, "priority fixture must share one source anchor");
    assert.ok(rightsPriorityProof.scopeAnchors.length > 1, "rights fixture must include lower-priority alternate anchors");
    assert.notDeepEqual(
      [...rightsPriorityProof.wholeBankDiversifiedTop].sort(),
      [...rightsPriorityIds].sort(),
      "whole-bank diversification fixture must demonstrate priority displacement"
    );
    await rightsPage.evaluate(() => {
      const button = document.querySelector('[data-subject-sprint="rights"]');
      button.dataset.sessionSize = "4";
      button.click();
    });
    await rightsPage.waitForFunction((storageKey) =>
      JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill?.queue?.length === 4,
    rightsKey);
    const rightsPriorityQueue = (await readSaved(rightsPage, rightsKey)).practicalDrill.queue;
    assert.deepEqual(
      [...rightsPriorityQueue].sort(),
      [...rightsPriorityIds].sort(),
      "non-restriction short sprints must select every higher-priority question before reordering"
    );
    await rightsContext.close();

    const retryActiveIds = [
      "sprint-law-rs002",
      "sprint-law-rs005",
      "sprint-law-rs007",
      "sprint-law-rs001",
      "sprint-law-rs003"
    ];
    const expectedRetryIds = retryActiveIds.slice(0, 3);
    const retryReview = `lawretry${Date.now().toString(36)}`;
    const retryKey = saveKey(retryReview);
    const retryContext = await browser.newContext({
      viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce"
    });
    await retryContext.addInitScript(({ storageKey, ids }) => {
      localStorage.setItem(storageKey, JSON.stringify({
        stateSchemaVersion: 12,
        practicalDrill: {
          stage: "active",
          bankId: "subject-sprint",
          bankVersion: 3,
          planMode: "sprint",
          scope: "restrictions",
          unitId: "subject-sprint-restrictions",
          sessionSize: ids.length,
          sessionIds: ids,
          queue: ids,
          position: 0,
          presentationKey: "subject-sprint:restrictions:retry-audit",
          presentationOverrides: {},
          currentAttempt: null,
          retryIds: [],
          history: {},
          attempts: 0,
          correctAttempts: 0,
          sessionsCompleted: 0,
          sessionStartedAt: "2026-09-09T10:00:00+09:00"
        }
      }));
    }, { storageKey: retryKey, ids: retryActiveIds });
    const retryPage = await retryContext.newPage();
    retryPage.on("pageerror", (error) => errors.push(String(error)));
    retryPage.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const retryUrl = new URL(server.baseUrl);
    retryUrl.searchParams.set("review", retryReview);
    retryUrl.searchParams.set("today", "1");
    await retryPage.goto(retryUrl.toString(), { waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(retryPage);
    await retryPage.locator("#practicalDrillSession").waitFor({ state: "visible" });
    for (let index = 0; index < retryActiveIds.length; index += 1) {
      const current = await retryPage.evaluate((storageKey) => {
        const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
        const id = drill.queue[drill.position];
        const key = drill.presentationOverrides?.[id] || drill.presentationKey;
        const question = window.TAKKEN_SUBJECT_SPRINT_BANK.presentQuestion(id, key);
        return { id, answer: question.answer };
      }, retryKey);
      assert.equal(current.id, retryActiveIds[index]);
      const shouldRetry = index < expectedRetryIds.length;
      await retryPage.locator(".practical-drill-choice").nth(shouldRetry ? (current.answer + 1) % 4 : current.answer).click();
      await retryPage.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
      if (!shouldRetry) await retryPage.locator('[data-practical-confidence="confident"]').click();
      await retryPage.locator("#practicalDrillNextButton").click();
    }
    await retryPage.waitForFunction((storageKey) =>
      JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill?.stage === "retry",
    retryKey);
    const retryQueue = await retryPage.evaluate(({ storageKey, activeIds }) => {
      const queue = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill.queue;
      const questions = window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID;
      return {
        queue,
        anchors: queue.map((id) => questions[id].sourceAnchor),
        lastActiveAnchors: activeIds.slice(-2).map((id) => questions[id].sourceAnchor)
      };
    }, { storageKey: retryKey, activeIds: retryActiveIds });
    assert.deepEqual([...retryQueue.queue].sort(), [...expectedRetryIds].sort());
    assert.notDeepEqual(retryQueue.queue, expectedRetryIds, "retry queue must not reuse the raw miss order");
    assert.ok(!retryQueue.lastActiveAnchors.includes(retryQueue.anchors[0]), "first retry must avoid both final active-pass anchors");
    assertAnchorSpacing(retryQueue);
    await retryContext.close();

    const oldIds = [
      "l001", "l002", "l003", "l004", "l005", "l006", "l007", "l008", "l009",
      "l010", "l011", "l012", "l013", "l014", "l015", "l016", "l101", "l102"
    ].map((id) => `sprint-law-${id}`);
    const migrationReview = `lawv2${Date.now().toString(36)}`;
    const migrationKey = saveKey(migrationReview);
    const migrationContext = await browser.newContext({
      viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce", acceptDownloads: true
    });
    const migrationPage = await migrationContext.newPage();
    migrationPage.on("pageerror", (error) => errors.push(String(error)));
    migrationPage.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const oldHistory = {
      [oldIds[0]]: {
        attempts: 3,
        correct: 2,
        wrong: 1,
        lastAnsweredAt: "2026-09-08T10:00:00+09:00",
        lastConfidence: "confident"
      }
    };
    await migrationPage.addInitScript(({ storageKey, ids, history }) => {
      localStorage.setItem(storageKey, JSON.stringify({
        stateSchemaVersion: 12,
        practicalDrill: {
          stage: "active",
          bankId: "subject-sprint",
          bankVersion: 2,
          planMode: "sprint",
          scope: "restrictions",
          unitId: "subject-sprint-restrictions",
          sessionSize: 18,
          sessionIds: ids,
          queue: ids,
          position: 0,
          presentationKey: "subject-sprint:restrictions:v2",
          presentationOverrides: {},
          currentAttempt: { id: ids[0], selected: 0, correct: true, confidence: "confident" },
          retryIds: [],
          history,
          attempts: 3,
          correctAttempts: 2,
          sessionsCompleted: 0,
          sessionStartedAt: "2026-09-08T10:00:00+09:00"
        }
      }));
    }, { storageKey: migrationKey, ids: oldIds, history: oldHistory });
    const migrationUrl = new URL(server.baseUrl);
    migrationUrl.searchParams.set("review", migrationReview);
    migrationUrl.searchParams.set("today", "1");
    await migrationPage.goto(migrationUrl.toString(), { waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(migrationPage);
    await migrationPage.locator("#practicalDrillSession").waitFor({ state: "visible" });
    assert.equal(await migrationPage.locator(".practical-drill-choice:enabled").count(), 4, "bank upgrade clears only the stale selected answer");
    await migrationPage.evaluate(() => document.querySelector("#sprintButton")?.click());
    await migrationPage.waitForFunction((storageKey) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      return drill?.bankVersion === 3 && drill?.currentAttempt === null;
    }, migrationKey);
    const migrated = await readSaved(migrationPage, migrationKey);
    assert.equal(migrated.practicalDrill.stage, "active");
    assert.equal(migrated.practicalDrill.bankVersion, 3);
    assert.deepEqual(migrated.practicalDrill.sessionIds, oldIds);
    assert.deepEqual(migrated.practicalDrill.queue, oldIds);
    assert.equal(migrated.practicalDrill.currentAttempt, null);
    assert.equal(migrated.practicalDrill.history[oldIds[0]].attempts, 3);
    assert.equal(migrated.practicalDrill.history[oldIds[0]].correct, 2);
    assert.equal(Object.keys(migrated.practicalDrill.history).some((id) => id.includes("-rs")), false);

    const exported = await migrationPage.evaluate((storageKey) =>
      window.TAKKEN_SAVE_TRANSFER.createSavePackage(
        JSON.parse(localStorage.getItem(storageKey) || "{}")
      ), migrationKey
    );
    assert.deepEqual(exported.state.practicalDrill.queue, oldIds);
    assert.equal(exported.state.practicalDrill.currentAttempt, null);

    const importReview = `lawimp${Date.now().toString(36)}`;
    const importKey = saveKey(importReview);
    const importPage = await migrationContext.newPage();
    importPage.on("pageerror", (error) => errors.push(String(error)));
    importPage.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const importUrl = new URL(server.baseUrl);
    importUrl.searchParams.set("review", importReview);
    importUrl.searchParams.set("today", "1");
    await importPage.goto(importUrl.toString(), { waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(importPage);
    importPage.once("dialog", (dialog) => dialog.accept());
    await importPage.locator("#saveImportInput").setInputFiles({
      name: "takken-v2-migrated.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exported), "utf8")
    });
    await importPage.waitForFunction(() => (document.querySelector("#saveTransferStatus")?.textContent || "").includes("引継ぎ完了"));
    const imported = await readSaved(importPage, importKey);
    assert.equal(imported.practicalDrill.bankVersion, 3);
    assert.deepEqual(imported.practicalDrill.queue, oldIds);
    assert.equal(imported.practicalDrill.currentAttempt, null);
    assert.equal(imported.practicalDrill.history[oldIds[0]].attempts, 3);
    await migrationContext.close();

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      status: "ok",
      bankQuestions: 32,
      sessionQuestions: started.queue.length,
      restrictionDefaultSessionQuestions: defaultRestrictionDrill.queue.length,
      sourceAnchorSeparation: 2,
      nonRestrictionPriorityPreserved: true,
      retryQueueDiversified: true,
      retryBoundaryDiversified: true,
      supplementalQuestionExercised: supplementalId,
      mobileWidths: [390, 320],
      v2QueuePreserved: oldIds.length,
      exportImportPreserved: true,
      errors: errors.length
    }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
