#!/usr/bin/env node
"use strict";

const { chromium } = require("playwright");

const baseUrl = process.env.TAKKEN_BASE_URL || "http://127.0.0.1:8783/";

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
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    const url = new URL(baseUrl);
    url.searchParams.set("review", `fullui${Date.now().toString(36)}`);
    url.searchParams.set("today", "1");
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => {
      const source = document.querySelector("#dailyQuestSource")?.textContent || "";
      return source.includes("固定10問") && !source.includes("読込中");
    });

    const blueprintAudit = await page.evaluate(() => {
      const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
      const questions = window.TAKKEN_EXAM_QUESTIONS;
      return {
        total: blueprint.curriculumOrder.length,
        firstBlock: blueprint.dailyBlocks[0],
        missing: blueprint.curriculumOrder.filter((id) => !questions[id]),
        sourceLabel: document.querySelector("#dailyQuestSource")?.textContent || ""
      };
    });
    if (blueprintAudit.total !== 100 || blueprintAudit.missing.length) {
      throw new Error(`Curriculum not ready: ${JSON.stringify(blueprintAudit)}`);
    }
    if (!blueprintAudit.sourceLabel.includes("合格ロード")) {
      throw new Error(`Random-style source label remained: ${blueprintAudit.sourceLabel}`);
    }

    const visitedIds = [];
    const visitedSections = [];
    for (let index = 0; index < 10; index += 1) {
      const question = await page.evaluate(() => {
        const text = document.querySelector("#questionText")?.textContent || "";
        const item = Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
          .find((candidate) => candidate.text === text);
        if (!item) throw new Error(`Full-exam question not found: ${text.slice(0, 60)}`);
        return { id: item.id, sectionId: item.sectionId, answer: item.answer };
      });
      visitedIds.push(question.id);
      visitedSections.push(question.sectionId);
      await page.locator(`.choice-button[data-index="${question.answer}"]`).click();
      await page.locator("#feedbackBox").waitFor({ state: "visible" });
      await page.locator(".confidence-button").filter({ hasText: "根拠までOK" }).click();
      if (index < 9) {
        await page.locator("#dockNextButton").click();
        await page.waitForFunction(
          (id) => {
            const text = document.querySelector("#questionText")?.textContent || "";
            const item = Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
              .find((candidate) => candidate.text === text);
            return item?.id && item.id !== id;
          },
          question.id
        );
      }
    }
    if (JSON.stringify(visitedIds) !== JSON.stringify(blueprintAudit.firstBlock)) {
      throw new Error(`Daily fixed order drift: ${visitedIds.join(",")}`);
    }
    for (const sectionId of ["rights", "business", "restrictions", "tax"]) {
      if (!visitedSections.includes(sectionId)) {
        throw new Error(`First daily block lacks ${sectionId}: ${visitedSections.join(",")}`);
      }
    }

    const stopLabel = ((await page.locator("#dockNextLabel").textContent()) || "").trim();
    if (stopLabel !== "今日の10問を終了") {
      throw new Error(`Unexpected completion label: ${stopLabel}`);
    }
    await page.locator("#dockNextButton").click();
    await page.locator("#dailyCompletePanel").waitFor({ state: "visible" });

    const desktopOverflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    const mobileOverflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
    );
    if (desktopOverflow || mobileOverflow) {
      throw new Error(`Horizontal overflow: desktop=${desktopOverflow}, mobile=${mobileOverflow}`);
    }
    if (consoleErrors.length || pageErrors.length) {
      throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
    }

    const migrationContext = await browser.newContext({
      viewport: { width: 900, height: 800 },
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo"
    });
    const migrationPage = await migrationContext.newPage();
    const migrationStorageId = "takken-battle-study-clean-v2-hard-review-migrationqa";
    await migrationPage.addInitScript(({ storageId }) => {
      localStorage.setItem(storageId, JSON.stringify({
        index: 25,
        attempts: 65,
        correct: 50,
        totalXp: 5000,
        progressionVersion: 4,
        examContentVersion: 0,
        marked: { q127: true },
        questionStats: {
          q127: { attempts: 3, correct: 1, wrong: 2, lastStep: 65 }
        }
      }));
    }, { storageId: migrationStorageId });
    await migrationPage.goto(`${baseUrl}?review=migrationqa`, {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });
    await migrationPage.waitForSelector("#questionText");
    const migration = await migrationPage.evaluate((storageId) => {
      const saved = JSON.parse(localStorage.getItem(storageId) || "{}");
      const text = document.querySelector("#questionText")?.textContent || "";
      const item = Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
        .find((candidate) => candidate.text === text);
      return {
        currentId: item?.id || "",
        index: saved.index,
        examContentVersion: saved.examContentVersion,
        attempts: saved.attempts,
        totalXp: saved.totalXp,
        legacyWeakKept: Boolean(saved.marked?.q127),
        legacyStatsKept: Number(saved.questionStats?.q127?.attempts) || 0
      };
    }, migrationStorageId);
    await migrationContext.close();
    if (
      migration.currentId !== "r001" ||
      migration.index !== 0 ||
      migration.examContentVersion !== 1 ||
      migration.attempts !== 65 ||
      migration.totalXp !== 5000 ||
      !migration.legacyWeakKept ||
      migration.legacyStatsKept !== 3
    ) {
      throw new Error(`Legacy save migration failed: ${JSON.stringify(migration)}`);
    }

    process.stdout.write(`${JSON.stringify({
      ok: true,
      total: blueprintAudit.total,
      visitedIds,
      visitedSections: [...new Set(visitedSections)],
      fixedSource: blueprintAudit.sourceLabel,
      migration,
      desktopOverflow,
      mobileOverflow,
      consoleErrors,
      pageErrors
    })}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
