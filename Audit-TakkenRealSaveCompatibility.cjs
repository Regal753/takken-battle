#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const transfer = require("./save-transfer.js");

const fixturePath = process.env.TAKKEN_REAL_SAVE_FIXTURE || "";
const baseUrl = process.env.TAKKEN_BASE_URL || "http://127.0.0.1:8783/";
const screenshotDir = process.env.TAKKEN_SCREENSHOT_DIR || "";

function semanticSnapshot(state) {
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
    missionDays: Object.keys(state.missionLog || {}).sort()
  };
}

async function main() {
  assert.ok(fixturePath, "TAKKEN_REAL_SAVE_FIXTURE is required");
  assert.ok(fs.existsSync(fixturePath), `fixture missing: ${fixturePath}`);
  const parsed = transfer.validatePackage(
    JSON.parse(fs.readFileSync(fixturePath, "utf8"))
  );
  assert.equal(parsed.format, transfer.SAVE_FORMAT);
  const sourceState = parsed.state;
  const expected = semanticSnapshot(sourceState);
  const sourceRaw = JSON.stringify(sourceState);

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
      (document.querySelector("#saveProtectionStatus")?.textContent || "").includes("v4")
    );

    const readback = await page.evaluate((id) => {
      const state = JSON.parse(localStorage.getItem(id) || "{}");
      return {
        state,
        previousRaw: localStorage.getItem(`${id}-previous`) || "",
        upgradeRaw: localStorage.getItem(`${id}-before-upgrade-v0-to-v4`) || "",
        protection: document.querySelector("#saveProtectionStatus")?.textContent || "",
        notice: document.querySelector("#saveTransferStatus")?.textContent || "",
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    }, storageId);
    assert.deepEqual(semanticSnapshot(readback.state), expected);
    assert.equal(readback.state.stateSchemaVersion, 4);
    assert.deepEqual(semanticSnapshot(JSON.parse(readback.previousRaw)), expected);
    assert.equal(readback.upgradeRaw, sourceRaw);
    assert.match(readback.notice, /更新前のセーブを自動退避/);
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
    assert.deepEqual(semanticSnapshot(recovered.state), expected);
    assert.deepEqual(semanticSnapshot(JSON.parse(recovered.previousRaw)), expected);
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
    assert.deepEqual(semanticSnapshot(restoredByUi), expected);

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
      upgradeBackupExact: readback.upgradeRaw === sourceRaw,
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
