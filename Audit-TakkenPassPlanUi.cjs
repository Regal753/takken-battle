#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const baseUrl = process.env.TAKKEN_BASE_URL || "http://127.0.0.1:8783/";
const screenshotDir = process.env.TAKKEN_SCREENSHOT_DIR || "";

async function capture(page, filename) {
  if (!screenshotDir) return;
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDir, filename),
    fullPage: true
  });
}

async function fillOfficialExam(page, values) {
  await page.locator("#officialExamYear").selectOption(String(values.year));
  await page.locator("#officialExamScore").fill(String(values.score));
  await page.locator("#officialRightsScore").fill(String(values.rights));
  await page.locator("#officialRestrictionsScore").fill(String(values.restrictions));
  await page.locator("#officialBusinessScore").fill(String(values.business));
  await page.locator("#officialTaxOtherScore").fill(String(values.taxOther));
  await page.locator("#officialExamMinutes").fill(String(values.elapsedMinutes));
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo"
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const RealDate = Date;
      const fixedNow = new RealDate("2026-07-27T02:00:00+09:00").getTime();
      class FixedDate extends RealDate {
        constructor(...args) {
          super(...(args.length ? args : [fixedNow]));
        }

        static now() {
          return fixedNow;
        }
      }
      window.Date = FixedDate;
    });
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    const reviewNamespace = `passplan${Date.now().toString(36)}`;
    const storageId = `takken-battle-study-clean-v2-hard-review-${reviewNamespace}`;
    const url = new URL(baseUrl);
    url.searchParams.set("review", reviewNamespace);
    url.searchParams.set("today", "1");
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => {
      const source = document.querySelector("#dailyQuestSource")?.textContent || "";
      return source.includes("固定10問") && !source.includes("読込中");
    });

    const initial = await page.evaluate(() => ({
      phase: document.querySelector("#passPhaseTitle")?.textContent?.trim() || "",
      countdown: document.querySelector("#examCountdown")?.textContent?.trim() || "",
      gate: document.querySelector("#julyGateStatus")?.textContent?.trim() || "",
      mission: document.querySelector("#dailyMissionStatus")?.textContent?.trim() || "",
      official: document.querySelector("#officialReadinessStatus")?.textContent?.trim() || "",
      currentRoadmap: document.querySelectorAll(".pass-roadmap li.is-current").length,
      commandTitle: document.querySelector("#todayCommandTitle")?.textContent?.trim() || "",
      commandStep: document.querySelector("#todayCommandKicker")?.textContent?.trim() || "",
      passPlanOpen: Boolean(document.querySelector("#passPlanPanel")?.open),
      themeOpen: Boolean(document.querySelector("#themeDrawer")?.open),
      progressOpen: Boolean(document.querySelector("#progressDrawer")?.open)
    }));
    if (
      initial.phase !== "7月ゲート" ||
      !/^D-\d+$/.test(initial.countdown) ||
      initial.gate !== "0 / 3" ||
      initial.mission !== "0 / 4" ||
      initial.official !== "未記録" ||
      initial.currentRoadmap !== 1 ||
      initial.commandTitle !== "固定10問を解く" ||
      initial.commandStep !== "今やる・STEP 1 / 4" ||
      initial.passPlanOpen ||
      initial.themeOpen ||
      initial.progressOpen
    ) {
      throw new Error(`Initial pass plan mismatch: ${JSON.stringify(initial)}`);
    }

    await page.locator(".pass-plan-summary").click();
    await page.locator(".official-ledger > summary").click();
    await fillOfficialExam(page, {
      year: 2025,
      score: 37,
      rights: 8,
      restrictions: 6,
      business: 18,
      taxOther: 4,
      elapsedMinutes: 115
    });
    await page.locator("#officialExamSaveButton").click();
    await page.waitForFunction(() =>
      (document.querySelector("#officialExamStatus")?.textContent || "").includes("一致しません")
    );
    if (await page.locator(".official-history-row").count()) {
      throw new Error("Invalid section total was recorded.");
    }

    await page.locator("#officialTaxOtherScore").fill("5");
    await page.locator("#officialExamSaveButton").click();
    await page.waitForFunction(() =>
      document.querySelectorAll(".official-history-row").length === 1
    );

    const recorded = await page.evaluate((id) => {
      const saved = JSON.parse(localStorage.getItem(id) || "{}");
      return {
        readiness: document.querySelector("#officialReadinessStatus")?.textContent?.trim() || "",
        gate: document.querySelector("#julyGateStatus")?.textContent?.trim() || "",
        mission: document.querySelector("#dailyMissionStatus")?.textContent?.trim() || "",
        ledger: document.querySelector("#officialLedgerSummary")?.textContent?.trim() || "",
        historyText: document.querySelector(".official-history-row")?.textContent?.replace(/\s+/g, " ").trim() || "",
        officialExamHistory: saved.officialExamHistory,
        missionToday: saved.missionLog?.[new Date().toLocaleDateString("sv-SE")]
      };
    }, storageId);
    if (
      recorded.readiness !== "戦略目標 37 / 50" ||
      recorded.gate !== "2 / 3" ||
      recorded.mission !== "2 / 4" ||
      recorded.ledger !== "1年分" ||
      !recorded.historyText.includes("2025年度") ||
      !recorded.historyText.includes("37 / 50") ||
      recorded.officialExamHistory?.length !== 1 ||
      recorded.officialExamHistory[0]?.business !== 18 ||
      !recorded.missionToday?.officialQuestions ||
      recorded.missionToday?.reviewed ||
      recorded.missionToday?.minutes !== 115
    ) {
      throw new Error(`Official exam record mismatch: ${JSON.stringify(recorded)}`);
    }

    await fillOfficialExam(page, {
      year: 2025,
      score: 40,
      rights: 10,
      restrictions: 6,
      business: 18,
      taxOther: 6,
      elapsedMinutes: 110
    });
    await page.locator("#officialExamSaveButton").click();
    await page.waitForFunction(() =>
      (document.querySelector("#officialExamStatus")?.textContent || "").includes("記録済み")
    );
    if (await page.locator(".official-history-row").count() !== 1) {
      throw new Error("Duplicate official year was not rejected.");
    }

    await capture(page, "pass-plan-desktop.png");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      document.querySelector("#officialReadinessStatus")?.textContent?.includes("37 / 50")
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    await capture(page, "pass-plan-mobile.png");
    const mobile = await page.evaluate(() => ({
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      mission: document.querySelector("#dailyMissionStatus")?.textContent?.trim() || "",
      history: document.querySelectorAll(".official-history-row").length,
      errors: document.querySelectorAll(":invalid").length
    }));
    if (mobile.overflow || mobile.mission !== "2 / 4" || mobile.history !== 1) {
      throw new Error(`Mobile pass plan mismatch: ${JSON.stringify(mobile)}`);
    }

    const touchedContext = await browser.newContext({
      viewport: { width: 900, height: 800 },
      reducedMotion: "reduce",
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo"
    });
    const touchedPage = await touchedContext.newPage();
    touchedPage.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    touchedPage.on("pageerror", (error) => pageErrors.push(String(error)));
    const touchedNamespace = `touched${Date.now().toString(36)}`;
    const touchedStorageId = `takken-battle-study-clean-v2-hard-review-${touchedNamespace}`;
    await touchedPage.addInitScript(({ storageId }) => {
      const RealDate = Date;
      const fixedNow = new RealDate("2026-07-30T10:00:00+09:00").getTime();
      class FixedDate extends RealDate {
        constructor(...args) {
          super(...(args.length ? args : [fixedNow]));
        }

        static now() {
          return fixedNow;
        }
      }
      window.Date = FixedDate;
      localStorage.setItem(storageId, JSON.stringify({
        missionLog: {
          "2026-07-30": {
            officialQuestions: true,
            reviewed: true,
            reviewNote: "全肢の主体を先に固定する",
            minutes: 35,
            officialDrill: {
              setId: "2025-balanced-a-v1",
              startedAt: "2026-07-30T00:00:00.000Z",
              submittedAt: "2026-07-30T00:35:00.000Z",
              completed: true,
              answers: {
                1: 3, 2: 3, 3: 3, 4: 4, 5: 4, 6: 1, 15: 4, 16: 4, 17: 2, 23: 1,
                24: 2, 26: 4, 27: 1, 28: 2, 29: 2, 30: 3, 31: 4, 32: 2, 33: 3, 46: 2
              },
              uncertain: []
            }
          }
        }
      }));
    }, { storageId: touchedStorageId });
    const touchedUrl = new URL(baseUrl);
    touchedUrl.searchParams.set("review", touchedNamespace);
    await touchedPage.goto(touchedUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });
    await touchedPage.locator(".pass-plan-summary").click();
    await touchedPage.locator(".official-ledger > summary").click();
    await fillOfficialExam(touchedPage, {
      year: 2025,
      score: 37,
      rights: 8,
      restrictions: 6,
      business: 18,
      taxOther: 5,
      elapsedMinutes: 120
    });
    await touchedPage.locator("#officialExamSaveButton").click();
    await touchedPage.waitForFunction(() =>
      (document.querySelector("#officialExamStatus")?.textContent || "").includes("公式20問で接触済み")
    );
    const touchedYearGuard = {
      message: await touchedPage.locator("#officialExamStatus").textContent(),
      history: await touchedPage.locator(".official-history-row").count()
    };
    await touchedContext.close();
    if (touchedYearGuard.history !== 0) {
      throw new Error(`Touched year was recorded as unseen: ${JSON.stringify(touchedYearGuard)}`);
    }

    if (consoleErrors.length || pageErrors.length) {
      throw new Error(
        `Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`
      );
    }

    console.log(JSON.stringify({
      status: "ok",
      initial,
      recorded: {
        readiness: recorded.readiness,
        gate: recorded.gate,
        mission: recorded.mission,
        years: recorded.officialExamHistory.length
      },
      mobile,
      touchedYearGuard,
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
