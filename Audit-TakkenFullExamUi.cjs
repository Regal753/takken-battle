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

    const reviewNamespace = `fullui${Date.now().toString(36)}`;
    const storageId = `takken-battle-study-clean-v2-hard-review-${reviewNamespace}`;
    const url = new URL(baseUrl);
    url.searchParams.set("review", reviewNamespace);
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

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#mockAButton").click();
    await page.waitForFunction(() => {
      const text = document.querySelector("#questionText")?.textContent || "";
      return Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
        .find((candidate) => candidate.text === text)?.id === "r001";
    });
    const mockStart = await page.evaluate((id) => {
      const saved = JSON.parse(localStorage.getItem(id) || "{}");
      return {
        runMode: saved.runMode,
        formId: saved.mock?.formId,
        position: saved.mock?.position,
        attempts: saved.attempts,
        source: document.querySelector("#dailyQuestSource")?.textContent || "",
        timer: document.querySelector("#dailyWeakText")?.textContent || ""
      };
    }, storageId);
    if (
      mockStart.runMode !== "mock" ||
      mockStart.formId !== "form-a" ||
      mockStart.position !== 0 ||
      !mockStart.source.includes("終了後に採点") ||
      !/^\d{2,3}:\d{2}$/.test(mockStart.timer)
    ) {
      throw new Error(`Mock A did not start correctly: ${JSON.stringify(mockStart)}`);
    }

    let noLeakAudit = null;
    for (let index = 0; index < 50; index += 1) {
      const question = await page.evaluate(() => {
        const text = document.querySelector("#questionText")?.textContent || "";
        const item = Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
          .find((candidate) => candidate.text === text);
        if (!item) throw new Error(`Mock question not found: ${text.slice(0, 60)}`);
        return { id: item.id, answer: item.answer };
      });
      const selected = index % 5 === 0 ? (question.answer + 1) % 4 : question.answer;
      await page.locator(`.choice-button[data-index="${selected}"]`).click();
      await page.locator("#feedbackBox").waitFor({ state: "visible" });
      if (index === 0) {
        noLeakAudit = await page.evaluate((id) => {
          const saved = JSON.parse(localStorage.getItem(id) || "{}");
          const answerGrid = document.querySelector("#feedbackBox .answer-grid");
          return {
            correctWrongClasses: document.querySelectorAll(".choice-button.is-correct, .choice-button.is-wrong").length,
            selectedClasses: document.querySelectorAll(".choice-button.is-mock-selected").length,
            answerGridHidden: Boolean(answerGrid?.hidden),
            feedback: document.querySelector("#explainText")?.textContent || "",
            correctAnswer: document.querySelector("#correctAnswer")?.textContent || "",
            attempts: saved.attempts,
            mockResults: saved.mock?.results?.length || 0
          };
        }, storageId);
        if (
          noLeakAudit.correctWrongClasses !== 0 ||
          noLeakAudit.selectedClasses !== 1 ||
          !noLeakAudit.answerGridHidden ||
          !noLeakAudit.feedback.includes("50問終了後") ||
          noLeakAudit.correctAnswer ||
          noLeakAudit.attempts !== mockStart.attempts ||
          noLeakAudit.mockResults !== 1
        ) {
          throw new Error(`Mock answer leaked correctness: ${JSON.stringify(noLeakAudit)}`);
        }
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.locator("#feedbackBox").waitFor({ state: "visible" });
        const resumed = await page.evaluate(() => ({
          selectedClasses: document.querySelectorAll(".choice-button.is-mock-selected").length,
          correctWrongClasses: document.querySelectorAll(".choice-button.is-correct, .choice-button.is-wrong").length,
          feedback: document.querySelector("#explainText")?.textContent || ""
        }));
        if (
          resumed.selectedClasses !== 1 ||
          resumed.correctWrongClasses !== 0 ||
          !resumed.feedback.includes("50問終了後")
        ) {
          throw new Error(`Mock reload did not preserve hidden result: ${JSON.stringify(resumed)}`);
        }
      }
      await page.locator("#dockNextButton").click();
      if (index < 49) {
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
    await page.locator('[data-mock-result="form-a"]').waitFor({ state: "visible" });
    const mockResult = await page.evaluate((id) => {
      const saved = JSON.parse(localStorage.getItem(id) || "{}");
      const sections = Object.fromEntries(
        [...document.querySelectorAll(".mock-section-card")].map((card) => [
          card.dataset.section,
          card.querySelector("strong")?.textContent?.trim() || ""
        ])
      );
      return {
        scoreText: document.querySelector(".mock-score-hero > strong")?.textContent?.replace(/\s+/g, " ").trim() || "",
        targetText: document.querySelector(".mock-score-hero > p")?.textContent || "",
        wrongItems: document.querySelectorAll(".mock-wrong-item").length,
        sections,
        finalized: Boolean(saved.mock?.finalized),
        history: saved.mockHistory?.length || 0,
        attempts: saved.attempts,
        weakWrongCount: (saved.mock?.results || []).filter((result) => !result.correct && saved.marked?.[result.id]).length
      };
    }, storageId);
    const expectedSections = {
      rights: "11 / 14",
      restrictions: "6 / 8",
      tax: "3 / 3",
      business: "16 / 20",
      other: "4 / 5"
    };
    if (
      !mockResult.scoreText.includes("40 / 50") ||
      !mockResult.targetText.includes("安全圏目標40点を達成") ||
      mockResult.wrongItems !== 10 ||
      JSON.stringify(mockResult.sections) !== JSON.stringify(expectedSections) ||
      !mockResult.finalized ||
      mockResult.history !== 1 ||
      mockResult.attempts !== mockStart.attempts + 50 ||
      mockResult.weakWrongCount !== 10
    ) {
      throw new Error(`Mock result mismatch: ${JSON.stringify(mockResult)}`);
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[data-mock-result="form-a"]').waitFor({ state: "visible" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    const mockMobileOverflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
    );
    if (mockMobileOverflow) {
      throw new Error(`Mock result horizontal overflow: mobile=${mockMobileOverflow}`);
    }
    await page.locator("#mockOtherButton").click();
    await page.waitForFunction(() => {
      const text = document.querySelector("#questionText")?.textContent || "";
      return Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
        .find((candidate) => candidate.text === text)?.id === "r015";
    });
    const formBStart = await page.evaluate((id) => {
      const saved = JSON.parse(localStorage.getItem(id) || "{}");
      return {
        formId: saved.mock?.formId,
        position: saved.mock?.position,
        current: document.querySelector("#roundLabel")?.textContent?.trim() || ""
      };
    }, storageId);
    if (formBStart.formId !== "form-b" || formBStart.position !== 0 || formBStart.current !== "1 / 50") {
      throw new Error(`Mock B did not start correctly: ${JSON.stringify(formBStart)}`);
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

    const handoffContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo"
    });
    const handoffPage = await handoffContext.newPage();
    const handoffNamespace = `handoff${Date.now().toString(36)}`;
    const handoffStorageId = `takken-battle-study-clean-v2-hard-review-${handoffNamespace}`;
    await handoffPage.addInitScript(({ storageId }) => {
      localStorage.setItem(storageId, JSON.stringify({
        index: 0,
        attempts: 65,
        correct: 50,
        totalXp: 4631,
        progressionVersion: 4,
        examContentVersion: 1,
        crystals: 1160,
        centralProgress: { answers: 162, correct: 120, wrong: 42 },
        marked: { q127: true },
        questionStats: {
          q127: { attempts: 3, correct: 1, wrong: 2, lastStep: 65 }
        }
      }));
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (payload) => {
          window.__takkenSharedPayload = payload;
        }
      });
    }, { storageId: handoffStorageId });
    const handoffSenderUrl = new URL(baseUrl);
    handoffSenderUrl.searchParams.set("review", handoffNamespace);
    await handoffPage.goto(handoffSenderUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });
    await handoffPage.locator("#saveShareButton").click();
    await handoffPage.waitForFunction(() => Boolean(window.__takkenSharedPayload?.url));
    const sharedPayload = await handoffPage.evaluate(() => window.__takkenSharedPayload);
    if (
      !sharedPayload.url.includes("#savegz=") ||
      sharedPayload.url.includes('"totalXp"') ||
      !sharedPayload.title.includes("セーブ引継ぎ")
    ) {
      throw new Error(`Manual handoff payload invalid: ${JSON.stringify(sharedPayload)}`);
    }
    const senderStatus = ((await handoffPage.locator("#saveTransferStatus").textContent()) || "").trim();
    if (!senderStatus.includes("共有しました")) {
      throw new Error(`Manual handoff sender status missing: ${senderStatus}`);
    }
    await handoffPage.evaluate(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value) => {
            window.__takkenCopiedUrl = value;
          }
        }
      });
    });
    await handoffPage.locator("#saveShareButton").click();
    await handoffPage.waitForFunction(() => Boolean(window.__takkenCopiedUrl));
    const copiedUrl = await handoffPage.evaluate(() => window.__takkenCopiedUrl);
    const copiedStatus = ((await handoffPage.locator("#saveTransferStatus").textContent()) || "").trim();
    if (!copiedUrl.includes("#savegz=") || !copiedStatus.includes("コピーしました")) {
      throw new Error(`Manual handoff copy fallback failed: ${JSON.stringify({
        copiedUrl: copiedUrl.slice(0, 100),
        copiedStatus
      })}`);
    }

    const receiverContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo"
    });
    const receiverPage = await receiverContext.newPage();
    const receiverRequests = [];
    receiverPage.on("request", (request) => receiverRequests.push(request.url()));
    receiverPage.on("dialog", (dialog) => dialog.accept());
    await receiverPage.goto(sharedPayload.url, {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });
    await receiverPage.waitForFunction(() =>
      (document.querySelector("#saveTransferStatus")?.textContent || "").includes("引継ぎ完了")
    );
    const handoff = await receiverPage.evaluate((storageId) => {
      const saved = JSON.parse(localStorage.getItem(storageId) || "{}");
      return {
        hash: window.location.hash,
        attempts: saved.attempts,
        totalXp: saved.totalXp,
        crystals: saved.crystals,
        centralAnswers: saved.centralProgress?.answers,
        legacyWeakKept: Boolean(saved.marked?.q127),
        legacyStatsKept: Number(saved.questionStats?.q127?.attempts) || 0,
        status: document.querySelector("#saveTransferStatus")?.textContent?.trim() || "",
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    }, handoffStorageId);
    await receiverContext.close();
    await handoffContext.close();
    if (
      handoff.hash ||
      handoff.attempts !== 65 ||
      handoff.totalXp !== 4631 ||
      handoff.crystals !== 1160 ||
      handoff.centralAnswers !== 162 ||
      !handoff.legacyWeakKept ||
      handoff.legacyStatsKept !== 3 ||
      handoff.overflow > 1 ||
      receiverRequests.some((urlValue) => urlValue.includes("save=") || urlValue.includes("savegz="))
    ) {
      throw new Error(`Manual phone handoff failed: ${JSON.stringify({
        handoff,
        requestsWithSave: receiverRequests.filter(
          (urlValue) => urlValue.includes("save=") || urlValue.includes("savegz=")
        )
      })}`);
    }

    process.stdout.write(`${JSON.stringify({
      ok: true,
      total: blueprintAudit.total,
      visitedIds,
      visitedSections: [...new Set(visitedSections)],
      fixedSource: blueprintAudit.sourceLabel,
      mockStart,
      noLeakAudit,
      mockResult,
      formBStart,
      migration,
      handoff,
      desktopOverflow,
      mobileOverflow,
      mockMobileOverflow,
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
