#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vm = require("node:vm");
const { chromium } = require("playwright");
const officialData = require("./official-exam-data.js");

const FIXED_NOW = "2026-07-31T10:00:00+09:00";
const screenshotDir = process.env.TAKKEN_SCREENSHOT_DIR || "";
const storageIdFor = (namespace) =>
  `takken-battle-study-clean-v2-hard-review-${namespace}`;
const blueprintSandbox = { window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "exam-blueprint.js"), "utf8"),
  blueprintSandbox
);
const FOUNDATION_IDS = Object.values(blueprintSandbox.window.TAKKEN_EXAM_BLUEPRINT.textbookRanges)
  .flatMap((range) => range.chapters)
  .flatMap((chapter) => chapter.ids);

async function capture(page, filename) {
  if (!screenshotDir) return;
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDir, filename),
    fullPage: true
  });
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
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`) && target !== path.resolve(root, "index.html")) {
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

async function newFixedContext(browser, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    acceptDownloads: true
  });
  await context.addInitScript(({ now }) => {
    const RealDate = Date;
    const fixedNow = new RealDate(now).getTime();
    class FixedDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = FixedDate;
  }, { now: FIXED_NOW });
  return context;
}

async function gotoReview(page, baseUrl, namespace) {
  const url = new URL(baseUrl);
  url.searchParams.set("review", namespace);
  url.searchParams.set("today", "1");
  await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForFunction(() => {
    const source = document.querySelector("#dailyQuestSource")?.textContent || "";
    return /読後\d+問|固定10問/.test(source) && !source.includes("読込中");
  });
}

async function completeFoundationCoverage(page, storageId) {
  await page.evaluate((id) => {
    const saved = JSON.parse(localStorage.getItem(id) || "{}");
    const textbookIds = Object.values(window.TAKKEN_EXAM_BLUEPRINT.textbookRanges)
      .flatMap((range) => range.chapters)
      .flatMap((chapter) => chapter.ids);
    saved.questionStats ||= {};
    textbookIds.forEach((questionId, index) => {
      if ((Number(saved.questionStats[questionId]?.attempts) || 0) > 0) return;
      saved.questionStats[questionId] = {
        attempts: 1,
        correct: 1,
        wrong: 0,
        lastStep: index + 1,
        lastAnsweredAt: "2026-07-01T00:00:00.000Z",
        lastCorrectAt: "2026-07-01T00:00:00.000Z",
        correctDayKeys: ["2026-07-01"],
        clearDayKeys: []
      };
    });
    localStorage.setItem(id, JSON.stringify(saved));
  }, storageId);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    (document.querySelector("#foundationGateStatus")?.textContent || "").includes("45 / 45")
  );
}

function dailyDefinition(id) {
  const sets = {
    "2025-balanced-a-v1": [
      [1, 3], [2, 3], [3, 3], [4, 4], [5, 4], [6, 1], [15, 4], [16, 4], [17, 2], [23, 1],
      [24, 2], [26, 4], [27, 1], [28, 2], [29, 2], [30, 3], [31, 4], [32, 2], [33, 3], [46, 2]
    ],
    "2025-balanced-b-v1": [
      [7, 1], [8, 2], [9, 1], [10, 3], [11, 3], [12, 3], [18, 2], [19, 2], [20, 4], [25, 1],
      [34, 3], [35, 1], [36, 4], [37, 4], [38, 3], [39, 4], [40, 3], [41, 1], [47, 3], [48, 2]
    ]
  };
  return sets[id];
}

function qualifyingEntry(examId, score, completedAt) {
  const exam = officialData.EXAM_BY_ID[examId];
  const answers = {};
  exam.answers.forEach((expected, index) => {
    const accepted = Array.isArray(expected) ? expected : [expected];
    answers[index + 1] = index < score
      ? accepted[0]
      : [1, 2, 3, 4].find((choice) => !accepted.includes(choice));
  });
  const scored = officialData.scoreAnswers(examId, answers);
  const startedAt = new Date(Date.parse(completedAt) - 110 * 60 * 1000).toISOString();
  const startedDayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(startedAt));
  return {
    recordId: `fixture-${examId}`,
    examId,
    year: exam.year,
    attemptType: "initial",
    sourceMode: "timed-answer-sheet",
    examProfile: "general",
    questionCount: 50,
    evidenceVersion: 3,
    scoringBasis: "historical-official-key",
    startedAt,
    startedDayKey,
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
    completedAt
  };
}

async function runOfficialExamScenario(browser, baseUrl) {
  const context = await newFixedContext(browser);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const namespace = `exam${Date.now().toString(36)}`;
  const storageId = storageIdFor(namespace);
  await gotoReview(page, baseUrl, namespace);
  await completeFoundationCoverage(page, storageId);
  await page.locator(".pass-plan-summary").click();
  await page.locator(".official-ledger > summary").click();

  assert.equal(await page.locator("#officialExamId option").count(), 12);
  await page.locator("#officialExamId").selectOption("2024");
  await page.locator("#officialExamStartButton").click();
  assert.equal(await page.locator("#officialExamSessionForm").isVisible(), true);
  await capture(page, "official-50-runner-desktop.png");
  const exam = officialData.EXAM_BY_ID["2024"];
  for (let index = 0; index < 50; index += 1) {
    const expected = Array.isArray(exam.answers[index])
      ? exam.answers[index][0]
      : exam.answers[index];
    await page.locator(
      `input[name="official-exam-answer"][value="${expected}"] + span`
    ).click();
    if (index < 49) await page.locator("#officialExamNextButton").click();
  }
  await page.locator("#officialExamSubmitButton").click();
  await page.waitForFunction(() =>
    (document.querySelector("#officialExamStatus")?.textContent || "").includes("50/50")
  );

  await page.locator("#officialExamAttemptType").selectOption("retest");
  const immediateRetest = await page.locator('#officialExamId option[value="2024"]').evaluate((option) => ({
    disabled: option.disabled,
    text: option.textContent
  }));
  assert.equal(immediateRetest.disabled, true);
  assert.match(immediateRetest.text, /あと14日/);

  await page.locator(".official-manual-entry > summary").click();
  await page.locator("#officialExamYear").selectOption("2023");
  await page.locator("#officialExamScore").fill("37");
  await page.locator("#officialRightsScore").fill("8");
  await page.locator("#officialRestrictionsScore").fill("6");
  await page.locator("#officialBusinessScore").fill("18");
  await page.locator("#officialTaxOtherScore").fill("5");
  await page.locator("#officialExamMinutes").fill("120");
  await page.locator("#officialExamSaveButton").click();
  await page.waitForFunction(() =>
    (document.querySelector("#officialExamStatus")?.textContent || "").includes("参考記録")
  );

  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => false
    });
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function captureBackupClick() {
      window.__takkenBackupClick = {
        download: this.download,
        href: this.href
      };
      return originalClick.call(this);
    };
  });
  await page.locator(".public-mode-note > summary").click();
  await page.locator("#saveExportButton").click();
  await page.waitForFunction(() =>
    (document.querySelector("#saveTransferStatus")?.textContent || "").includes("バックアップ")
  );
  const snapshot = await page.evaluate((id) => {
    const state = JSON.parse(localStorage.getItem(id));
    return {
      history: state.officialExamHistory,
      saveMeta: state.saveMeta,
      readiness: document.querySelector("#officialReadinessStatus")?.textContent || "",
      protection: document.querySelector("#saveProtectionStatus")?.textContent || "",
      backupClick: window.__takkenBackupClick,
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth)
    };
  }, storageId);
  assert.equal(snapshot.history.length, 2);
  assert.equal(snapshot.history.filter((item) => item.sourceMode === "timed-answer-sheet").length, 1);
  assert.match(snapshot.readiness, /測定中・初見1\/10・再0\/3/);
  assert.match(snapshot.saveMeta.lastExportHash, /^[a-f0-9]{8}$/);
  assert.ok(Date.parse(snapshot.saveMeta.lastExportedAt));
  assert.match(snapshot.protection, /JSONバックアップ1時間以内/);
  assert.match(snapshot.backupClick.download, /^takken-battle-save-\d{8}\.json$/);
  assert.match(snapshot.backupClick.href, /^blob:/);
  assert.equal(snapshot.overflow, 0);
  assert.deepEqual(errors, []);
  await context.close();
  return {
    score: snapshot.history.find((item) => item.sourceMode === "timed-answer-sheet").score,
    history: snapshot.history.length,
    immediateRetest: immediateRetest.text,
    saveHash: snapshot.saveMeta.lastExportHash
  };
}

async function runCrossDayScenario(browser, baseUrl) {
  const context = await newFixedContext(browser, { width: 390, height: 844 });
  const namespace = `review${Date.now().toString(36)}`;
  const storageId = storageIdFor(namespace);
  const setA = dailyDefinition("2025-balanced-a-v1");
  const answers = Object.fromEntries(setA);
  answers[1] = 1;
  const confidence = Object.fromEntries(setA.map(([number]) => [number, "grounded"]));
  const dailyIds = Array.from({ length: 10 }, (_, index) =>
    `b${String(index + 1).padStart(3, "0")}`
  );
  const fixedStats = Object.fromEntries(FOUNDATION_IDS.map((questionId, index) => [
    questionId,
    {
      attempts: 1,
      correct: 1,
      wrong: 0,
      lastStep: index + 1,
      lastAnsweredAt: "2026-07-01T00:30:00.000Z",
      lastCorrectAt: "2026-07-01T00:30:00.000Z",
      correctDayKeys: ["2026-07-01"],
      clearDayKeys: []
    }
  ]));
  dailyIds.forEach((questionId) => {
    fixedStats[questionId] = {
      ...fixedStats[questionId],
      lastAnsweredAt: "2026-07-31T00:30:00.000Z",
      lastCorrectAt: "2026-07-31T00:30:00.000Z",
      correctDayKeys: ["2026-07-31"],
      clearDayKeys: ["2026-07-31"]
    };
  });
  await context.addInitScript(({ id, answers: savedAnswers, confidence: savedConfidence, stats, planIds }) => {
    localStorage.setItem(id, JSON.stringify({
      stateSchemaVersion: 10,
      examContentVersion: 4,
      questionStats: stats,
      daily: {
        date: "2026-07-31",
        answers: 10,
        correct: 10,
        wrong: 0,
        weakAdded: 0,
        target: 10,
        planIds,
        planVersion: 3,
        planMode: "coverage",
        planScope: "business"
      },
      missionLog: {
        "2026-07-30": {
          officialQuestions: true,
          reviewed: false,
          minutes: 35,
          officialDrill: {
            setId: "2025-balanced-a-v1",
            position: 0,
            startedAt: "2026-07-30T00:00:00.000Z",
            submittedAt: "2026-07-30T00:35:00.000Z",
            completed: true,
            evidenceVersion: 3,
            answers: savedAnswers,
            confidence: savedConfidence,
            uncertain: [],
            reviewNotes: {},
            reviewCauses: {}
          }
        }
      }
    }));
  }, { id: storageId, answers, confidence, stats: fixedStats, planIds: dailyIds });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await gotoReview(page, baseUrl, namespace);
  // The current app may rebuild an old-schema daily plan during migration.
  // Complete the normalized plan explicitly so this scenario continues to
  // test the next-day review debt rather than a stale v12 plan fixture.
  const normalizedDailySave = await page.evaluate((id) => {
    const saved = JSON.parse(localStorage.getItem(id) || "{}");
    const ids = Array.isArray(saved.daily?.planIds) ? saved.daily.planIds : [];
    saved.questionStats ||= {};
    ids.forEach((questionId, index) => {
      const previous = saved.questionStats[questionId] || {};
      saved.questionStats[questionId] = {
        ...previous,
        attempts: Math.max(1, Number(previous.attempts) || 0),
        correct: Math.max(1, Number(previous.correct) || 0),
        wrong: Math.max(0, Number(previous.wrong) || 0),
        lastStep: Math.max(index + 1, Number(previous.lastStep) || 0),
        lastAnsweredAt: "2026-07-31T01:00:00.000Z",
        lastCorrectAt: "2026-07-31T01:00:00.000Z",
        correctDayKeys: ["2026-07-31"],
        clearDayKeys: ["2026-07-31"]
      };
    });
    return saved;
  }, storageId);
  await context.addInitScript(({ id, saved }) => {
    localStorage.setItem(id, JSON.stringify(saved));
  }, { id: storageId, saved: normalizedDailySave });
  await page.reload({ waitUntil: "networkidle" });
  const debtSnapshot = await page.evaluate((id) => {
    const saved = JSON.parse(localStorage.getItem(id) || "{}");
    return {
      title: document.querySelector("#todayCommandTitle")?.textContent || "",
      planIds: saved.daily?.planIds || [],
      done: (saved.daily?.planIds || []).filter((questionId) =>
        String(saved.questionStats?.[questionId]?.lastAnsweredAt || "").startsWith("2026-07-31")
      ).length,
      pendingReviewed: saved.missionLog?.["2026-07-30"]?.reviewed,
      schema: saved.stateSchemaVersion
    };
  }, storageId);
  assert.match(debtSnapshot.title, /未復習1件/, JSON.stringify(debtSnapshot));
  assert.match(await page.locator("#todayCommandKicker").textContent(), /2026-07-30/);
  await page.locator('[data-review-cause="1"]').selectOption("reading");
  await page.locator('[data-review-question="1"]').fill(
    "主語を飛ばした → 最初に主体へ線を引く"
  );
  await page.locator("#todayCommandReviewButton").click();
  await page.waitForFunction((id) =>
    JSON.parse(localStorage.getItem(id) || "{}").missionLog?.["2026-07-30"]?.reviewed === true,
    storageId
  );

  const persisted = await page.evaluate((id) => {
    const state = JSON.parse(localStorage.getItem(id));
    return {
      reviewed: state.missionLog?.["2026-07-30"]?.reviewed,
      cause: state.missionLog?.["2026-07-30"]?.officialDrill?.reviewCauses?.[1],
      note: state.missionLog?.["2026-07-30"]?.officialDrill?.reviewNotes?.[1],
      todayReview: state.missionLog?.["2026-07-31"]?.reviewed
    };
  }, storageId);
  assert.equal(persisted.reviewed, true);
  assert.equal(persisted.cause, "reading");
  assert.match(persisted.note, /主体へ線を引く/);
  assert.notEqual(persisted.todayReview, true);

  assert.deepEqual(errors, []);
  await context.close();
  return { persisted };
}

async function runStabilityScenario(browser, baseUrl) {
  const context = await newFixedContext(browser);
  const namespace = `stable${Date.now().toString(36)}`;
  const storageId = storageIdFor(namespace);
  const history = [
    qualifyingEntry("2024", 40, "2026-07-01T01:00:00.000Z"),
    qualifyingEntry("2023", 40, "2026-07-08T01:00:00.000Z"),
    qualifyingEntry("2019", 40, "2026-07-15T01:00:00.000Z")
  ];
  await context.addInitScript(({ id, records }) => {
    localStorage.setItem(id, JSON.stringify({
      stateSchemaVersion: 4,
      examContentVersion: 3,
      officialExamHistory: records
    }));
  }, { id: storageId, records: history });
  const page = await context.newPage();
  await gotoReview(page, baseUrl, namespace);
  const stability = await page.locator("#officialReadinessStatus").textContent();
  const title = await page.locator("#officialReadinessStatus").getAttribute("title");
  assert.match(stability, /^安定40・初見3\/10・再0\/3$/);
  assert.match(title, /平均40\.0・最低40/);
  await page.locator(".pass-plan-summary").click();
  await page.locator(".official-ledger > summary").click();
  await page.locator("#officialExamAttemptType").selectOption("retest");
  const due = await page.locator('#officialExamId option[value="2024"]').evaluate((option) => ({
    disabled: option.disabled,
    text: option.textContent
  }));
  assert.equal(due.disabled, false);
  assert.doesNotMatch(due.text, /あと\d+日/);
  await context.close();

  const sameDayContext = await newFixedContext(browser);
  const sameDayNamespace = `same-day-${Date.now().toString(36)}`;
  const sameDayStorageId = storageIdFor(sameDayNamespace);
  const sameDayHistory = [
    qualifyingEntry("2024", 40, "2026-07-01T01:00:00.000Z"),
    qualifyingEntry("2023", 40, "2026-07-01T02:00:00.000Z"),
    qualifyingEntry("2019", 40, "2026-07-01T03:00:00.000Z")
  ];
  await sameDayContext.addInitScript(({ id, records }) => {
    localStorage.setItem(id, JSON.stringify({
      stateSchemaVersion: 10,
      examContentVersion: 4,
      officialExamHistory: records
    }));
  }, { id: sameDayStorageId, records: sameDayHistory });
  const sameDayPage = await sameDayContext.newPage();
  await gotoReview(sameDayPage, baseUrl, sameDayNamespace);
  const sameDayStability = await sameDayPage.locator("#officialReadinessStatus").textContent();
  assert.match(sameDayStability, /^測定中・初見3\/10・再0\/3$/);
  await sameDayContext.close();
  return { stability, title, retest2024: due.text, sameDayStability };
}

async function runQuotaWarningScenario(browser, baseUrl) {
  const context = await newFixedContext(browser, { width: 390, height: 844 });
  await context.addInitScript(() => {
    const storage = navigator.storage || {};
    Object.defineProperty(storage, "estimate", {
      configurable: true,
      value: async () => ({ usage: 90, quota: 100 })
    });
    if (!navigator.storage) {
      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: storage
      });
    }
  });
  const page = await context.newPage();
  const namespace = `quota${Date.now().toString(36)}`;
  await gotoReview(page, baseUrl, namespace);
  await page.waitForFunction(() =>
    document.querySelector("#saveProtectionStatus")?.classList.contains("is-warning")
  );
  const result = await page.locator("#saveProtectionStatus").evaluate((element) => ({
    text: element.textContent,
    warning: element.classList.contains("is-warning")
  }));
  assert.match(result.text, /保存領域90%/);
  assert.equal(result.warning, true);
  await context.close();
  return result;
}

(async () => {
  const server = process.env.TAKKEN_BASE_URL
    ? { baseUrl: process.env.TAKKEN_BASE_URL, close: async () => {} }
    : await startStaticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const officialExam = await runOfficialExamScenario(browser, server.baseUrl);
    const crossDay = await runCrossDayScenario(browser, server.baseUrl);
    const stability = await runStabilityScenario(browser, server.baseUrl);
    const quotaWarning = await runQuotaWarningScenario(browser, server.baseUrl);
    console.log(JSON.stringify({
      status: "ok",
      officialExam,
      crossDay,
      stability,
      quotaWarning
    }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
