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
      const fixedNow = new RealDate("2026-08-02T10:00:00+09:00").getTime();
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
    try {
      await page.waitForFunction(() => {
        const title = document.querySelector("#todayCommandTitle")?.textContent || "";
        const action = document.querySelector("#foundationRoutePrimaryButton")?.textContent || "";
        return title.includes("01-01 宅建業法の基本") && action.includes("読後2問");
      });
    } catch (error) {
      const route = await page.locator("#foundationRoutePrimaryButton").textContent().catch(() => "missing");
      throw new Error(`pass-plan foundation entry did not settle: ${route}; console=${JSON.stringify(consoleErrors)}; page=${JSON.stringify(pageErrors)}`, { cause: error });
    }

    const initial = await page.evaluate(() => ({
      phase: document.querySelector("#passPhaseTitle")?.textContent?.trim() || "",
      countdown: document.querySelector("#examCountdown")?.textContent?.trim() || "",
      gate: document.querySelector("#foundationGateStatus")?.textContent?.trim() || "",
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
      initial.phase !== "基礎一周" ||
      !/^D-\d+$/.test(initial.countdown) ||
      initial.gate !== "単元 0 / 45" ||
      initial.mission !== "0 / 45単元" ||
      initial.official !== "測定中・初見0/10・再0/3" ||
      initial.currentRoadmap !== 1 ||
      initial.commandTitle !== "01-01 宅建業法の基本" ||
      !initial.commandStep.includes("読む") ||
      initial.passPlanOpen ||
      initial.themeOpen ||
      initial.progressOpen
    ) {
      throw new Error(`Initial pass plan mismatch: ${JSON.stringify(initial)}`);
    }

    await page.locator(".pass-plan-summary").click();
    await page.locator(".official-ledger > summary").click();
    await page.locator(".official-manual-entry > summary").click();
    await page.evaluate(() => {
      const option = document.querySelector('#officialExamYear option[value="2025"]');
      if (option) option.disabled = false;
    });
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
        gate: document.querySelector("#foundationGateStatus")?.textContent?.trim() || "",
        mission: document.querySelector("#dailyMissionStatus")?.textContent?.trim() || "",
        ledger: document.querySelector("#officialLedgerSummary")?.textContent?.trim() || "",
        historyText: document.querySelector(".official-history-row")?.textContent?.replace(/\s+/g, " ").trim() || "",
        officialExamHistory: saved.officialExamHistory,
        missionToday: saved.missionLog?.[new Date().toLocaleDateString("sv-SE")]
      };
    }, storageId);
    if (
      recorded.readiness !== "測定中・初見0/10・再0/3" ||
      recorded.gate !== "単元 0 / 45" ||
      recorded.mission !== "0 / 45単元" ||
      recorded.ledger !== "初見 0 / 10・再試験 0 / 3" ||
      !recorded.historyText.includes("令和7年度") ||
      !recorded.historyText.includes("37 / 50") ||
      recorded.officialExamHistory?.length !== 1 ||
      recorded.officialExamHistory[0]?.business !== 18 ||
      recorded.officialExamHistory[0]?.sourceMode !== "self-report" ||
      recorded.missionToday?.officialQuestions ||
      recorded.missionToday?.reviewed ||
      recorded.missionToday?.minutes !== 115
    ) {
      throw new Error(`Official exam record mismatch: ${JSON.stringify(recorded)}`);
    }

    await page.evaluate(() => {
      const option = document.querySelector('#officialExamYear option[value="2025"]');
      if (option) option.disabled = false;
    });
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
      (document.querySelector("#officialExamStatus")?.textContent || "").includes("参考記録")
    );
    if (await page.locator(".official-history-row").count() !== 1) {
      throw new Error("Duplicate official year was not rejected.");
    }

    await capture(page, "pass-plan-desktop.png");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      document.querySelector("#officialReadinessStatus")?.textContent?.includes("初見0/10")
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
    if (mobile.overflow || mobile.mission !== "0 / 45単元" || mobile.history !== 1) {
      throw new Error(`Mobile pass plan mismatch: ${JSON.stringify(mobile)}`);
    }

    const touchedContext = await browser.newContext({
      viewport: { width: 900, height: 800 },
      reducedMotion: "reduce",
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo"
    });
    const foundationIds = await page.evaluate(() =>
      Object.values(window.TAKKEN_EXAM_BLUEPRINT.textbookRanges)
        .flatMap((range) => range.chapters)
        .flatMap((chapter) => chapter.ids)
    );
    const touchedPage = await touchedContext.newPage();
    touchedPage.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    touchedPage.on("pageerror", (error) => pageErrors.push(String(error)));
    const touchedNamespace = `touched${Date.now().toString(36)}`;
    const touchedStorageId = `takken-battle-study-clean-v2-hard-review-${touchedNamespace}`;
    await touchedPage.addInitScript(({ storageId, foundationQuestionIds }) => {
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
      const questionStats = Object.fromEntries(foundationQuestionIds.map((questionId, index) => [
        questionId,
        {
          attempts: 1,
          correct: 1,
          wrong: 0,
          lastStep: index + 1,
          lastAnsweredAt: "2026-07-01T00:00:00.000Z",
          lastCorrectAt: "2026-07-01T00:00:00.000Z",
          correctDayKeys: ["2026-07-01"],
          clearDayKeys: []
        }
      ]));
      localStorage.setItem(storageId, JSON.stringify({
        stateSchemaVersion: 3,
        questionStats,
        missionLog: {
          "2026-07-28": {
            officialQuestions: true,
            reviewed: true,
            reviewNote: "全肢の主体を先に固定する",
            minutes: 35,
            officialDrill: {
              setId: "2025-balanced-a-v1",
              startedAt: "2026-07-28T00:00:00.000Z",
              submittedAt: "2026-07-28T00:35:00.000Z",
              completed: true,
              answers: {
                1: 3, 2: 3, 3: 3, 4: 4, 5: 4, 6: 1, 15: 4, 16: 4, 17: 2, 23: 1,
                24: 2, 26: 4, 27: 1, 28: 2, 29: 2, 30: 3, 31: 4, 32: 2, 33: 3, 46: 2
              },
              uncertain: []
            }
          },
          "2026-07-29": {
            officialQuestions: true,
            reviewed: true,
            reviewNote: "例外条件を先に固定する",
            minutes: 35,
            officialDrill: {
              setId: "2025-balanced-b-v1",
              startedAt: "2026-07-29T00:00:00.000Z",
              submittedAt: "2026-07-29T00:35:00.000Z",
              completed: true,
              answers: {
                7: 1, 8: 2, 9: 1, 10: 3, 11: 3, 12: 3, 18: 2, 19: 2, 20: 4, 25: 1,
                34: 3, 35: 1, 36: 4, 37: 4, 38: 3, 39: 4, 40: 3, 41: 1, 47: 3, 48: 2
              },
              uncertain: []
            }
          }
        }
      }));
    }, { storageId: touchedStorageId, foundationQuestionIds: foundationIds });
    const touchedUrl = new URL(baseUrl);
    touchedUrl.searchParams.set("review", touchedNamespace);
    await touchedPage.goto(touchedUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });
    await touchedPage.waitForFunction(() =>
      (document.querySelector("#foundationGateStatus")?.textContent || "").includes("45 / 45")
    );
    await touchedPage.locator(".pass-plan-summary").click();
    await touchedPage.locator(".official-ledger > summary").click();
    const touchedProtection = await touchedPage.evaluate(() => {
      const touched = document.querySelector('#officialExamId option[value="2025"]');
      return {
        touchedDisabled: Boolean(touched?.disabled),
        selectedYear: document.querySelector("#officialExamId")?.value || "",
        coverage: document.querySelector("#officialPracticeCoverageStatus")?.textContent?.trim() || "",
        trend: document.querySelector("#officialPracticeTrendStatus")?.textContent?.trim() || ""
      };
    });
    if (
      !touchedProtection.touchedDisabled ||
      touchedProtection.selectedYear !== "2024" ||
      touchedProtection.coverage !== "接触 40 / 50" ||
      !touchedProtection.trend.includes("次はC")
    ) {
      throw new Error(`Touched-year UI protection mismatch: ${JSON.stringify(touchedProtection)}`);
    }
    await touchedPage.evaluate(() => {
      const option = document.querySelector('#officialExamId option[value="2025"]');
      if (option) option.disabled = false;
      const select = document.querySelector("#officialExamId");
      if (select) select.value = "2025";
    });
    await touchedPage.locator("#officialExamStartButton").click();
    await touchedPage.waitForFunction(() =>
      (document.querySelector("#officialExamStatus")?.textContent || "").includes("接触済み")
    );
    const touchedYearGuard = {
      message: await touchedPage.locator("#officialExamStatus").textContent(),
      history: (await touchedPage.evaluate((id) => {
        const saved = JSON.parse(localStorage.getItem(id) || "{}");
        return saved.officialExamHistory?.filter(
          (item) => item.sourceMode === "timed-answer-sheet"
        ).length || 0;
      }, touchedStorageId)),
      protection: touchedProtection
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
