#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const transfer = require("./save-transfer.js");
const mastery = require("./business-mastery.js");

const fixturePath = process.env.TAKKEN_REAL_SAVE_FIXTURE || "";
const baseUrl = process.env.TAKKEN_BASE_URL || "http://127.0.0.1:8783/";
const screenshotDir = process.env.TAKKEN_SCREENSHOT_DIR || "";

function practicalHistorySnapshot(state, businessIds = []) {
  const business = new Set(businessIds);
  const history = state.practicalDrill?.history && typeof state.practicalDrill.history === "object"
    ? state.practicalDrill.history
    : {};
  return Object.fromEntries(
    Object.entries(history)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, item]) => [id, {
        attempts: Number(item?.attempts) || 0,
        correct: Number(item?.correct) || 0,
        wrong: Number(item?.wrong) || 0,
        uncertain: Number(item?.uncertain) || 0,
        lastSelected: Number.isInteger(Number(item?.lastSelected))
          ? Number(item.lastSelected)
          : null,
        lastCorrect: Boolean(item?.lastCorrect),
        lastConfidence: String(item?.lastConfidence || ""),
        lastAnsweredAt: String(item?.lastAnsweredAt || ""),
        mistakeTags: item?.mistakeTags && typeof item.mistakeTags === "object"
          ? { ...item.mistakeTags }
          : {},
        lastMistakeTags: Array.isArray(item?.lastMistakeTags)
          ? item.lastMistakeTags.map(String)
          : [],
        ...(business.has(id) ? mastery.normalizeMasteryHistory(item) : {})
      }])
  );
}

function practicalSnapshot(state, businessIds = []) {
  const drill = state.practicalDrill && typeof state.practicalDrill === "object"
    ? state.practicalDrill
    : {};
  return {
    version: Number(drill.version) || 0,
    bankId: String(drill.bankId || ""),
    bankVersion: Number(drill.bankVersion) || 0,
    presentationKey: String(drill.presentationKey || ""),
    stage: String(drill.stage || ""),
    scope: String(drill.scope || ""),
    unitId: String(drill.unitId || ""),
    sessionSize: Number(drill.sessionSize) || 0,
    sessionIds: (Array.isArray(drill.sessionIds) ? drill.sessionIds : []).map(String),
    queue: (Array.isArray(drill.queue) ? drill.queue : []).map(String),
    position: Number(drill.position) || 0,
    currentAttempt: drill.currentAttempt ? {
      id: String(drill.currentAttempt.id || ""),
      selected: Number(drill.currentAttempt.selected),
      correct: Boolean(drill.currentAttempt.correct),
      confidence: String(drill.currentAttempt.confidence || "")
    } : null,
    retryIds: (Array.isArray(drill.retryIds) ? drill.retryIds : []).map(String),
    history: practicalHistorySnapshot(state, businessIds),
    attempts: Number(drill.attempts) || 0,
    correctAttempts: Number(drill.correctAttempts) || 0,
    sessionsCompleted: Number(drill.sessionsCompleted) || 0,
    sessionStartedAt: String(drill.sessionStartedAt || ""),
    completedAt: String(drill.completedAt || "")
  };
}

function semanticSnapshot(state, businessIds = []) {
  const stats = state.questionStats && typeof state.questionStats === "object"
    ? state.questionStats
    : {};
  const questionStats = Object.fromEntries(
    Object.entries(stats).map(([id, item]) => [id, {
      attempts: Number(item?.attempts) || 0,
      correct: Number(item?.correct) || 0,
      wrong: Number(item?.wrong) || 0,
      centralAttempts: Number(item?.centralAttempts) || 0,
      centralCorrect: Number(item?.centralCorrect) || 0,
      centralWrong: Number(item?.centralWrong) || 0,
      lastAnsweredAt: String(item?.lastAnsweredAt || ""),
      lastCorrectAt: String(item?.lastCorrectAt || ""),
      lastWrongAt: String(item?.lastWrongAt || ""),
      lastMistakeNote: String(item?.lastMistakeNote || ""),
      centralWeak: Boolean(item?.centralWeak)
    }])
  );
  return {
    attempts: Number(state.attempts) || 0,
    correct: Number(state.correct) || 0,
    totalXp: Number(state.totalXp) || 0,
    crystals: Number(state.crystals) || 0,
    victories: Number(state.victories) || 0,
    questionStats,
    markedIds: Object.entries(state.marked || {})
      .filter(([, value]) => Boolean(value))
      .map(([id]) => id)
      .sort(),
    centralMarkedIds: Object.entries(state.centralMarked || {})
      .filter(([, value]) => Boolean(value))
      .map(([id]) => id)
      .sort(),
    centralProgress: state.centralProgress || {},
    officialExamHistory: state.officialExamHistory || [],
    officialExamExposure: state.officialExamExposure || {},
    missionDays: Object.keys(state.missionLog || {}).sort(),
    practicalDrill: practicalSnapshot(state, businessIds)
  };
}

async function fullScoreSnapshot(page, storageId) {
  return page.evaluate((id) => {
    const state = JSON.parse(localStorage.getItem(id) || "{}");
    const bank = window.TAKKEN_BUSINESS_FULLSCORE_BANK || {};
    const legacy = window.TAKKEN_PRACTICAL_VARIATIONS || {};
    const mastery = window.TAKKEN_BUSINESS_MASTERY;
    const questions = Array.isArray(bank.QUESTIONS) ? bank.QUESTIONS : [];
    const units = Array.isArray(bank.UNITS) ? bank.UNITS : [];
    const foundation = mastery.summarizeOverall(
      (legacy.UNITS || []).filter((unit) => unit.scopeId === "business"),
      (legacy.QUESTIONS || []).filter((question) => question.scopeId === "business"),
      state.practicalDrill?.history || {}, new Date()
    );
    const transfer = mastery.summarizeOverall(units, questions, state.practicalDrill?.history || {}, new Date());
    const official = mastery.summarizeOfficialProof(state.officialExamHistory || {});
    return {
      bankVersion: Number(bank.VERSION) || 0,
      ids: questions.map((question) => question.id),
      units: units.map((unit) => unit.id),
      foundation,
      transfer,
      official,
      diagnostic: {
        mistakeTags: Object.fromEntries(Object.entries(state.practicalDrill?.history || {})
          .filter(([, item]) => item?.mistakeTags && Object.keys(item.mistakeTags).length)
          .map(([questionId, item]) => [questionId, item.mistakeTags])),
        lastMistakeTags: Object.fromEntries(Object.entries(state.practicalDrill?.history || {})
          .filter(([, item]) => Array.isArray(item?.lastMistakeTags) && item.lastMistakeTags.length)
          .map(([questionId, item]) => [questionId, item.lastMistakeTags]))
      },
      officialGate: document.querySelector("#businessOfficialGate")?.textContent || "",
      transferGate: document.querySelector("#businessTransferGate")?.textContent || ""
    };
  }, storageId);
}

async function businessSnapshot(page, storageId) {
  return page.evaluate((id) => {
    const state = JSON.parse(localStorage.getItem(id) || "{}");
    const questions = (window.TAKKEN_PRACTICAL_VARIATIONS?.QUESTIONS || [])
      .filter((question) => question.scopeId === "business");
    const units = (window.TAKKEN_PRACTICAL_VARIATIONS?.UNITS || [])
      .filter((unit) => unit.scopeId === "business");
    const summary = window.TAKKEN_BUSINESS_MASTERY.summarizeOverall(
      units,
      questions,
      state.practicalDrill?.history || {},
      new Date()
    );
    const gridText = document.querySelector("#businessMasteryGrid")?.textContent || "";
    const base = [...gridText.matchAll(/基礎接触\s*(\d+)\/(\d+)・定着\s*(\d+)\/(\d+)/g)]
      .map(([, contacted, total, retained, retainedTotal]) => ({
        contacted: Number(contacted),
        total: Number(total),
        retained: Number(retained),
        retainedTotal: Number(retainedTotal)
      }));
    return {
      ids: questions.map((question) => question.id),
      questions: questions.map((question) => ({
        id: question.id,
        unitId: question.unitId,
        answer: question.answer
      })),
      summary,
      base,
      gridText,
      metrics: document.querySelector("#businessMasteryMetrics")?.textContent || ""
    };
  }, storageId);
}

async function main() {
  assert.ok(fixturePath, "TAKKEN_REAL_SAVE_FIXTURE is required");
  assert.ok(fs.existsSync(fixturePath), `fixture missing: ${fixturePath}`);
  const parsed = transfer.validatePackage(
    JSON.parse(fs.readFileSync(fixturePath, "utf8"))
  );
  assert.equal(parsed.format, transfer.SAVE_FORMAT);
  const sourceState = parsed.state;
  const sourceSchema = Math.max(0, Math.trunc(Number(sourceState.stateSchemaVersion) || 0));
  assert.equal(sourceSchema, 8, "the fixed real fixture must exercise the schema 8 to 9 upgrade");
  const sourceRaw = JSON.stringify(sourceState);

  const validDurableDays = [
    "2026-05-01", "2026-05-02", "2026-05-05",
    "2026-05-12", "2026-05-26", "2026-06-25"
  ];
  const insufficientEvidence = mastery.normalizeMasteryHistory({
    attempts: 6,
    lastConfidence: "confident",
    reviewLevel: 6,
    masteryDueKey: "",
    confidentDayKeys: validDurableDays.slice(0, 5),
    lastAnsweredAt: "2026-06-25T09:00:00+09:00"
  });
  assert.equal(insufficientEvidence.reviewLevel, 0);
  assert.equal(mastery.normalizeMasteryHistory({
    attempts: 6,
    lastConfidence: "confident",
    reviewLevel: 6,
    confidentDayKeys: [...validDurableDays.slice(0, 5), "2026-02-30"],
    lastAnsweredAt: "2026-06-25T09:00:00+09:00"
  }).reviewLevel, 0);
  assert.equal(mastery.normalizeMasteryHistory({
    attempts: 6,
    lastConfidence: "uncertain",
    reviewLevel: 6,
    confidentDayKeys: validDurableDays,
    lastAnsweredAt: "2026-06-25T09:00:00+09:00"
  }).reviewLevel, 0);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      reducedMotion: "reduce"
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    const namespace = `real-save-${Date.now().toString(36)}`;
    const storageId = `takken-battle-study-clean-v2-hard-review-${namespace}`;
    await page.addInitScript(({ id, raw }) => {
      const marker = `${id}-fixture-loaded`;
      if (!sessionStorage.getItem(marker)) {
        localStorage.setItem(id, raw);
        sessionStorage.setItem(marker, "1");
      }
    }, { id: storageId, raw: sourceRaw });
    const url = new URL(baseUrl);
    url.searchParams.set("review", namespace);
    await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });
    await page.waitForFunction(() =>
      /\u4fdd\u5b58\u5f62\u5f0fv\d+/.test(document.querySelector("#saveProtectionStatus")?.textContent || "")
    );

    const realBusiness = await businessSnapshot(page, storageId);
    const businessIds = realBusiness.ids;
    assert.equal(businessIds.length, 44);
    assert.equal(new Set(businessIds).size, 44);
    const sourceExpected = semanticSnapshot(sourceState, businessIds);
    assert.equal(sourceExpected.attempts, 93);
    assert.equal(sourceExpected.correct, 80);
    assert.equal(Object.keys(sourceExpected.questionStats).length, 111);
    assert.equal(Number(sourceExpected.centralProgress.answers) || 0, 162);
    assert.equal(sourceExpected.markedIds.length, 20);
    assert.equal(realBusiness.base.reduce((sum, item) => sum + item.contacted, 0), 40);
    assert.equal(realBusiness.base.reduce((sum, item) => sum + item.total, 0), 44);
    assert.equal(realBusiness.base.reduce((sum, item) => sum + item.retained, 0), 6);
    assert.equal(realBusiness.base.reduce((sum, item) => sum + item.retainedTotal, 0), 44);
    assert.equal(realBusiness.summary.questions.untouched, 44);
    assert.equal(realBusiness.summary.questions.durable, 0);
    assert.equal(realBusiness.summary.durableUnits, 0);
    assert.match(realBusiness.metrics, /基礎\s*接触40\/44・定着6\/44/);
    assert.match(realBusiness.metrics, /変形\s*再挑戦・期限0・未接触134・長期定着0\/134/);
    assert.match(realBusiness.metrics, /公式\s*初見満点0\/3/);
    const realFullScore = await fullScoreSnapshot(page, storageId);
    assert.equal(realFullScore.ids.length, 134);
    assert.equal(new Set(realFullScore.ids).size, 134);
    assert.equal(realFullScore.transfer.questions.untouched, 134);
    assert.equal(realFullScore.transfer.questions.durable, 0);
    assert.equal(realFullScore.official.required, 3);
    assert.equal(realFullScore.official.qualifying, 0);
    assert.equal(realFullScore.official.ready, false);
    assert.notEqual(realFullScore.officialGate, "");

    const readback = await page.evaluate((id) => {
      const state = JSON.parse(localStorage.getItem(id) || "{}");
      return {
        state,
        previousRaw: localStorage.getItem(`${id}-previous`) || "",
        upgradeRaw: Object.keys(localStorage)
          .filter((key) => key.startsWith(`${id}-before-upgrade-`))
          .map((key) => localStorage.getItem(key) || "")
          .find(Boolean) || "",
        protection: document.querySelector("#saveProtectionStatus")?.textContent || "",
        notice: document.querySelector("#saveTransferStatus")?.textContent || "",
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    }, storageId);
    const targetSchema = Math.max(0, Math.trunc(Number(readback.state.stateSchemaVersion) || 0));
    assert.deepEqual(
      practicalHistorySnapshot(readback.state, businessIds),
      sourceExpected.practicalDrill.history
    );
    const expected = {
      ...sourceExpected,
      // schema 10 derives a durable no-peek exposure ledger from the existing
      // daily-drill record; this is a migration, not a legacy full-score proof.
      officialExamExposure: readback.state.officialExamExposure || {},
      practicalDrill: practicalSnapshot(readback.state, businessIds)
    };
    assert.deepEqual(semanticSnapshot(readback.state, businessIds), expected);
    assert.deepEqual(readback.state.officialExamExposure, {
      "2025": {
        firstOpenedAt: "2026-07-31T10:57:49.627Z",
        firstOpenedDayKey: "2026-07-31",
        firstOpenedUtcOffsetMinutes: 0,
        source: "daily-drill"
      }
    });
    assert.equal(targetSchema, 10);
    assert.ok(targetSchema >= sourceSchema);
    assert.equal(readback.state.calculationDrill?.stage, "idle");
    assert.equal(readback.state.calculationDrill?.queue?.length, 0);
    assert.equal(readback.state.practicalDrill?.stage, "idle");
    if (sourceSchema < targetSchema) {
      assert.deepEqual(semanticSnapshot(JSON.parse(readback.previousRaw), businessIds), expected);
      assert.equal(readback.upgradeRaw, sourceRaw);
      assert.match(readback.notice, /更新前のセーブを自動退避/);
    } else {
      assert.equal(readback.upgradeRaw, "");
      if (!readback.previousRaw) {
        await page.locator("#markButton").click();
        readback.previousRaw = await page.evaluate((id) =>
          localStorage.getItem(`${id}-previous`) || ""
        , storageId);
      }
      assert.deepEqual(semanticSnapshot(JSON.parse(readback.previousRaw), businessIds), expected);
    }
    assert.equal(readback.overflow, 0);

    await page.evaluate((id) => {
      localStorage.setItem(id, "{broken");
    }, storageId);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      (document.querySelector("#saveTransferStatus")?.textContent || "").includes("自動復旧")
    );
    const recovered = await page.evaluate((id) => ({
      state: JSON.parse(localStorage.getItem(id) || "{}"),
      previousRaw: localStorage.getItem(`${id}-previous`) || "",
      corruptCopies: Object.keys(localStorage)
        .filter((key) => key.startsWith(`${id}-corrupt-`)).length,
      notice: document.querySelector("#saveTransferStatus")?.textContent || ""
    }), storageId);
    assert.deepEqual(semanticSnapshot(recovered.state, businessIds), expected);
    assert.deepEqual(semanticSnapshot(JSON.parse(recovered.previousRaw), businessIds), expected);
    assert.equal(recovered.corruptCopies, 1);

    const markedBefore = recovered.state.marked || {};
    await page.locator("#markButton").click();
    const markedAfter = await page.evaluate((id) =>
      JSON.parse(localStorage.getItem(id) || "{}").marked || {}
    , storageId);
    assert.notDeepEqual(markedAfter, markedBefore);
    await page.locator(".public-mode-note > summary").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#saveRestorePreviousButton").click();
    await page.waitForFunction(() =>
      (document.querySelector("#saveTransferStatus")?.textContent || "").includes("復元しました")
    );
    const restoredByUi = await page.evaluate((id) =>
      JSON.parse(localStorage.getItem(id) || "{}")
    , storageId);
    assert.deepEqual(semanticSnapshot(restoredByUi, businessIds), expected);

    const businessIdSet = new Set(businessIds);
    const fullScoreState = JSON.parse(JSON.stringify(restoredByUi));
    const nonFullScoreHistory = Object.fromEntries(
      Object.entries(fullScoreState.practicalDrill?.history || {})
        .filter(([id]) => !String(id).startsWith("bf-business-book-"))
    );
    const fullScoreBank = await fullScoreSnapshot(page, storageId);
    assert.equal(fullScoreBank.ids.length, 134);
    const fullScoreIds = [...businessIds, ...fullScoreBank.ids];
    const durableHistory = Object.fromEntries(fullScoreBank.ids.map((id, index) => [
      id,
      {
        attempts: 6,
        correct: 6,
        wrong: 0,
        uncertain: 0,
        lastSelected: index % 4,
        lastCorrect: true,
        lastConfidence: "confident",
        lastAnsweredAt: "2026-06-25T09:00:00+09:00",
        reviewLevel: 6,
        masteryDueKey: "",
        confidentDayKeys: validDurableDays
      }
    ]));
    fullScoreState.practicalDrill = {
      ...fullScoreState.practicalDrill,
      bankId: "business-fullscore",
      bankVersion: fullScoreBank.bankVersion,
      presentationKey: "2026-06-25:bank-1",
      stage: "idle",
      scope: "business",
      unitId: "",
      sessionSize: 10,
      sessionIds: [],
      queue: [],
      position: 0,
      currentAttempt: null,
      retryIds: [],
      history: { ...nonFullScoreHistory, ...durableHistory },
      attempts: 792,
      correctAttempts: 792,
      sessionsCompleted: 14,
      sessionStartedAt: "",
      completedAt: ""
    };
    const fullScorePackage = transfer.createSavePackage(fullScoreState);
    const exportedRoundTrip = transfer.validatePackage(
      JSON.parse(JSON.stringify(fullScorePackage))
    );
    const fullScoreExpected = practicalSnapshot(fullScoreState, fullScoreIds);
    assert.deepEqual(
      practicalSnapshot(exportedRoundTrip.state, fullScoreIds),
      fullScoreExpected
    );

    const observePage = (targetPage) => {
      targetPage.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      targetPage.on("pageerror", (error) => pageErrors.push(String(error)));
    };
    const fullNamespace = `rsf-${Date.now().toString(36)}`;
    const fullStorageId = `takken-battle-study-clean-v2-hard-review-${fullNamespace}`;
    const fullPage = await context.newPage();
    observePage(fullPage);
    await fullPage.addInitScript(({ id, raw }) => {
      const marker = `${id}-full-loaded`;
      if (!sessionStorage.getItem(marker)) {
        localStorage.setItem(id, raw);
        sessionStorage.setItem(marker, "1");
      }
    }, { id: fullStorageId, raw: JSON.stringify(fullScoreState) });
    const fullUrl = new URL(baseUrl);
    fullUrl.searchParams.set("review", fullNamespace);
    await fullPage.goto(fullUrl.toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
    await fullPage.waitForFunction(() =>
      document.querySelectorAll("#businessMasteryGrid button").length === 11
    );
    let fullReadback = await fullPage.evaluate((id) =>
      JSON.parse(localStorage.getItem(id) || "{}")
    , fullStorageId);
    assert.deepEqual(practicalSnapshot(fullReadback, fullScoreIds), fullScoreExpected);
    let fullBusiness = await fullScoreSnapshot(fullPage, fullStorageId);
    assert.equal(fullBusiness.transfer.questions.retry, 0);
    assert.equal(fullBusiness.transfer.questions.due, 0);
    assert.equal(fullBusiness.transfer.questions.untouched, 0);
    assert.equal(fullBusiness.transfer.questions.durable, 134);
    assert.equal(fullBusiness.transfer.durableUnits, 11);
    assert.equal(fullBusiness.official.required, 3);
    assert.equal(fullBusiness.official.ready, false);
    await fullPage.reload({ waitUntil: "domcontentloaded" });
    await fullPage.waitForFunction(() =>
      document.querySelectorAll("#businessMasteryGrid button").length === 11
    );
    fullReadback = await fullPage.evaluate((id) =>
      JSON.parse(localStorage.getItem(id) || "{}")
    , fullStorageId);
    assert.deepEqual(practicalSnapshot(fullReadback, fullScoreIds), fullScoreExpected);

    const malformedState = JSON.parse(JSON.stringify(fullScoreState));
    const malformedId = fullScoreBank.ids[0];
    malformedState.practicalDrill.history[malformedId] = {
      ...malformedState.practicalDrill.history[malformedId],
      reviewLevel: 6,
      confidentDayKeys: validDurableDays.slice(0, 5)
    };
    malformedState.businessFullScoreReadiness = {
      status: "ready",
      transfer: { durable: 44 }
    };
    const malformedNamespace = `rsm-${Date.now().toString(36)}`;
    const malformedStorageId = `takken-battle-study-clean-v2-hard-review-${malformedNamespace}`;
    const malformedPage = await context.newPage();
    observePage(malformedPage);
    await malformedPage.addInitScript(({ id, raw }) => {
      localStorage.setItem(id, raw);
    }, { id: malformedStorageId, raw: JSON.stringify(malformedState) });
    const malformedUrl = new URL(baseUrl);
    malformedUrl.searchParams.set("review", malformedNamespace);
    await malformedPage.goto(malformedUrl.toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
    await malformedPage.waitForFunction(() =>
      document.querySelectorAll("#businessMasteryGrid button").length === 11
    );
    await malformedPage.locator("#markButton").click();
    const malformedReadback = await malformedPage.evaluate((id) =>
      JSON.parse(localStorage.getItem(id) || "{}")
    , malformedStorageId);
    const normalizedMalformed = mastery.normalizeMasteryHistory(
      malformedReadback.practicalDrill.history[malformedId]
    );
    assert.equal(normalizedMalformed.reviewLevel, 0);
    assert.equal(normalizedMalformed.masteryDueKey, "");
    const malformedBusiness = await fullScoreSnapshot(malformedPage, malformedStorageId);
    assert.equal(malformedBusiness.transfer.questions.durable, 133);
    assert.equal(malformedBusiness.transfer.durableUnits, 10);

    const importNamespace = `rsi-${Date.now().toString(36)}`;
    const importStorageId = `takken-battle-study-clean-v2-hard-review-${importNamespace}`;
    const importPage = await context.newPage();
    observePage(importPage);
    const importUrl = new URL(baseUrl);
    importUrl.searchParams.set("review", importNamespace);
    await importPage.goto(importUrl.toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
    await importPage.waitForFunction(() =>
      document.querySelectorAll("#businessMasteryGrid button").length === 11
    );
    importPage.once("dialog", (dialog) => dialog.accept());
    await importPage.locator("#saveImportInput").setInputFiles({
      name: "takken-full-score-audit.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fullScorePackage), "utf8")
    });
    await importPage.waitForFunction(() =>
      (document.querySelector("#saveTransferStatus")?.textContent || "").includes("\u5f15\u7d99\u304e\u5b8c\u4e86")
    );
    let importedState = await importPage.evaluate((id) =>
      JSON.parse(localStorage.getItem(id) || "{}")
    , importStorageId);
    assert.deepEqual(practicalSnapshot(importedState, fullScoreIds), fullScoreExpected);
    let importedBusiness = await fullScoreSnapshot(importPage, importStorageId);
    assert.equal(importedBusiness.transfer.questions.durable, 134);
    assert.equal(importedBusiness.transfer.durableUnits, 11);
    await importPage.reload({ waitUntil: "domcontentloaded" });
    await importPage.waitForFunction(() =>
      document.querySelectorAll("#businessMasteryGrid button").length === 11
    );
    importedState = await importPage.evaluate((id) =>
      JSON.parse(localStorage.getItem(id) || "{}")
    , importStorageId);
    assert.deepEqual(practicalSnapshot(importedState, fullScoreIds), fullScoreExpected);

    await importPage.locator("#markButton").click();
    await importPage.evaluate((id) => {
      localStorage.setItem(id, "{broken");
    }, importStorageId);
    await importPage.reload({ waitUntil: "domcontentloaded" });
    await importPage.waitForFunction(() =>
      (document.querySelector("#saveTransferStatus")?.textContent || "").includes("\u81ea\u52d5\u5fa9\u65e7")
    );
    const fullRecovered = await importPage.evaluate((id) => ({
      state: JSON.parse(localStorage.getItem(id) || "{}"),
      previous: JSON.parse(localStorage.getItem(`${id}-previous`) || "{}"),
      corruptCopies: Object.keys(localStorage)
        .filter((key) => key.startsWith(`${id}-corrupt-`)).length
    }), importStorageId);
    assert.deepEqual(practicalSnapshot(fullRecovered.state, fullScoreIds), fullScoreExpected);
    assert.deepEqual(practicalSnapshot(fullRecovered.previous, fullScoreIds), fullScoreExpected);
    assert.equal(fullRecovered.corruptCopies, 1);

    await importPage.locator("#markButton").click();
    await importPage.locator(".public-mode-note > summary").click();
    importPage.once("dialog", (dialog) => dialog.accept());
    await importPage.locator("#saveRestorePreviousButton").click();
    await importPage.waitForFunction(() =>
      (document.querySelector("#saveTransferStatus")?.textContent || "").includes("\u5fa9\u5143\u3057\u307e\u3057\u305f")
    );
    const fullRestored = await importPage.evaluate((id) =>
      JSON.parse(localStorage.getItem(id) || "{}")
    , importStorageId);
    assert.deepEqual(practicalSnapshot(fullRestored, fullScoreIds), fullScoreExpected);

    await importPage.locator("#businessMasteryFull").click();
    await importPage.waitForFunction(() =>
      !document.querySelector("#practicalDrillSession")?.hidden
    );
    const wrongTarget = await importPage.evaluate((id) => {
      const state = JSON.parse(localStorage.getItem(id) || "{}");
      const questionId = state.practicalDrill.queue[state.practicalDrill.position];
      const bank = window.TAKKEN_BUSINESS_FULLSCORE_BANK;
      const question = (bank.QUESTIONS || []).find((item) => item.id === questionId);
      const presented = bank.presentQuestion(question, state.practicalDrill.presentationKey);
      return { id: questionId, wrongChoice: (presented.answer + 1) % 4 };
    }, importStorageId);
    await importPage.locator("#practicalDrillChoices button").nth(wrongTarget.wrongChoice).click();
    await importPage.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
    await importPage.locator("#practicalDrillNextButton").click();
    importedState = await importPage.evaluate((id) =>
      JSON.parse(localStorage.getItem(id) || "{}")
    , importStorageId);
    assert.equal(importedState.practicalDrill.history[wrongTarget.id].lastConfidence, "wrong");
    assert.equal(importedState.practicalDrill.history[wrongTarget.id].reviewLevel, 0);
    assert.equal(importedState.practicalDrill.history[wrongTarget.id].masteryDueKey, "");
    assert.deepEqual(importedState.practicalDrill.history[wrongTarget.id].confidentDayKeys, []);
    importedBusiness = await fullScoreSnapshot(importPage, importStorageId);
    assert.equal(importedBusiness.transfer.questions.retry, 1);
    assert.equal(importedBusiness.transfer.questions.durable, 133);
    assert.equal(importedBusiness.transfer.durableUnits, 10);
    await importPage.reload({ waitUntil: "domcontentloaded" });
    await importPage.waitForFunction(() =>
      document.querySelectorAll("#businessMasteryGrid button").length === 11
    );
    importedState = await importPage.evaluate((id) =>
      JSON.parse(localStorage.getItem(id) || "{}")
    , importStorageId);
    assert.equal(importedState.practicalDrill.history[wrongTarget.id].reviewLevel, 0);
    assert.deepEqual(importedState.practicalDrill.history[wrongTarget.id].confidentDayKeys, []);
    importedBusiness = await fullScoreSnapshot(importPage, importStorageId);
    assert.equal(importedBusiness.transfer.questions.retry, 1);
    assert.equal(importedBusiness.transfer.questions.durable, 133);
    assert.equal(importedBusiness.transfer.durableUnits, 10);

    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({
        path: path.join(screenshotDir, "real-save-recovered-mobile.png"),
        fullPage: true
      });
    }
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    console.log(JSON.stringify({
      status: "ok",
      fixtureVersion: parsed.version,
      preservedAttempts: expected.attempts,
      preservedCorrect: expected.correct,
      preservedQuestions: Object.keys(expected.questionStats).length,
      preservedCentralAnswers: Number(expected.centralProgress.answers) || 0,
      preservedMarked: expected.markedIds.length,
      preservedPracticalHistory: Object.keys(expected.practicalDrill.history).length,
      foundationContacted: 40,
      foundationTotal: 44,
      legacyBusinessUntouched: realBusiness.summary.questions.untouched,
      fullScoreUntouched: realFullScore.transfer.questions.untouched,
      fullScoreOfficialQualifying: realFullScore.official.qualifying,
      fullScoreBankVersion: fullBusiness.bankVersion,
      syntheticDurable: fullBusiness.transfer.questions.durable,
      syntheticDurableUnits: fullBusiness.transfer.durableUnits,
      syntheticExportImport: true,
      syntheticCorruptRecovery: fullRecovered.corruptCopies === 1,
      syntheticUiRestore: true,
      wrongDemotion: importedBusiness.transfer.questions.retry === 1,
      malformedMasteryFailClosed: malformedBusiness.transfer.questions.durable === 133,
      sourceSchema,
      targetSchema,
      upgradeBackupExact: sourceSchema < targetSchema ? readback.upgradeRaw === sourceRaw : "not-required",
      previousBackupSemantic: true,
      corruptRecovery: recovered.corruptCopies === 1,
      uiRestore: true,
      mobileOverflow: readback.overflow,
      consoleErrors: consoleErrors.length,
      pageErrors: pageErrors.length
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
