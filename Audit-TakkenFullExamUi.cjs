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

async function chooseDrillConfidence(page, storageId, number, confidence) {
  await page.locator(
    `[data-confidence-question="${number}"][value="${confidence}"] + span`
  ).click();
  await page.waitForFunction(({ id, number: questionNumber, confidence: value }) => {
    const saved = JSON.parse(localStorage.getItem(id) || "{}");
    const date = new Date().toLocaleDateString("sv-SE");
    return saved.missionLog?.[date]?.officialDrill?.confidence?.[questionNumber] === value;
  }, { id: storageId, number, confidence });
}

async function chooseDrillAnswer(page, storageId, number, answer) {
  await page.locator(
    `input[name="official-drill-q${number}"][value="${answer}"] + span`
  ).click();
  await page.waitForFunction(({ id, number: questionNumber, answer: value }) => {
    const saved = JSON.parse(localStorage.getItem(id) || "{}");
    const date = new Date().toLocaleDateString("sv-SE");
    return saved.missionLog?.[date]?.officialDrill?.answers?.[questionNumber] === value;
  }, { id: storageId, number, answer });
}

async function seedAdvancedFoundation(page, storageId) {
  await page.evaluate((id) => {
    const saved = JSON.parse(localStorage.getItem(id) || "{}");
    const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
    const textbookIds = Object.values(blueprint.textbookRanges)
      .flatMap((range) => range.chapters)
      .flatMap((chapter) => chapter.ids);
    const firstBusinessBlock = blueprint.curriculumOrder
      .filter((questionId) => window.TAKKEN_EXAM_QUESTIONS?.[questionId]?.sectionId === "business")
      .slice(0, 10);
    const contactedAt = "2026-01-01T00:00:00.000Z";
    saved.questionStats ||= {};
    textbookIds.forEach((questionId, index) => {
      saved.questionStats[questionId] = {
        ...(saved.questionStats[questionId] || {}),
        attempts: Math.max(1, Number(saved.questionStats[questionId]?.attempts) || 0),
        correct: Math.max(1, Number(saved.questionStats[questionId]?.correct) || 0),
        lastStep: Math.max(index + 1, Number(saved.questionStats[questionId]?.lastStep) || 0),
        lastAnsweredAt: saved.questionStats[questionId]?.lastAnsweredAt || contactedAt,
        lastCorrectAt: saved.questionStats[questionId]?.lastCorrectAt || contactedAt,
        correctDayKeys: saved.questionStats[questionId]?.correctDayKeys || ["2026-01-01"],
        clearDayKeys: saved.questionStats[questionId]?.clearDayKeys || []
      };
    });
    saved.studyScope = "business";
    saved.daily = {
      date: new Date().toLocaleDateString("sv-SE"),
      answers: 0,
      correct: 0,
      wrong: 0,
      weakAdded: 0,
      target: 10,
      planIds: firstBusinessBlock,
      planVersion: 3,
      planMode: "coverage",
      planScope: "business",
      planUnitId: ""
    };
    localStorage.setItem(id, JSON.stringify(saved));
  }, storageId);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const source = document.querySelector("#dailyQuestSource")?.textContent || "";
    return source.includes("固定10問") && !source.includes("読込中");
  });
}

async function main() {
  const runtimeSource = fs.readFileSync(path.join(__dirname, "pass-readiness.js"), "utf8");
  // Strict readiness is intentionally more than three high scores: form, day,
  // current-law, and rolling-capacity evidence are all required.
  if (!runtimeSource.includes("ids.size === 3") ||
      !runtimeSource.includes("days.size === 3") ||
      !runtimeSource.includes("currentLawGate.passed") ||
      !runtimeSource.includes("capacity.verified")) {
    throw new Error("Strict three-form/current-law/capacity readiness guard is missing from runtime.");
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      serviceWorkers: "block",
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

    // This suite preserves the pre-v29 daily/full-exam workflow as a fallback
    // regression. The new 40-point command route has its own dedicated
    // Audit-TakkenPassReadinessUi.cjs coverage, so keep the responsibilities
    // separate instead of asserting two incompatible primary commands here.
    await page.route("**/pass-readiness.js*", (route) => route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: "window.TAKKEN_PASS_READINESS = null;"
    }));

    const reviewNamespace = `fullui${Date.now().toString(36)}`;
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
      throw new Error(`foundation entry did not settle: ${route}; console=${JSON.stringify(consoleErrors)}; page=${JSON.stringify(pageErrors)}`, { cause: error });
    }
    const foundationEntry = await page.evaluate(() => ({
      title: document.querySelector("#todayCommandTitle")?.textContent?.trim() || "",
      action: document.querySelector("#foundationRoutePrimaryButton")?.textContent?.trim() || "",
      gate: document.querySelector("#foundationGateStatus")?.textContent?.trim() || "",
      mockDisabled: Boolean(document.querySelector("#mockAButton")?.disabled),
      mockTitle: document.querySelector("#mockAButton")?.title || "",
      formCExists: Boolean(document.querySelector("#mockCButton"))
    }));
    if (
      foundationEntry.title !== "01-01 宅建業法の基本" ||
      !foundationEntry.action.includes("読後2問") ||
      foundationEntry.gate !== "単元 0 / 45" ||
      foundationEntry.mockDisabled ||
      !foundationEntry.mockTitle.includes("RETIO公式未見") ||
      !foundationEntry.formCExists
    ) {
      throw new Error(`Foundation entry mismatch: ${JSON.stringify(foundationEntry)}`);
    }
    await seedAdvancedFoundation(page, storageId);

    const blueprintAudit = await page.evaluate(() => {
      const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
      const questions = window.TAKKEN_EXAM_QUESTIONS;
      return {
        total: blueprint.curriculumOrder.length,
        firstBusinessBlock: blueprint.curriculumOrder
          .filter((id) => questions[id]?.sectionId === "business")
          .slice(0, 10),
        missing: blueprint.curriculumOrder.filter((id) => !questions[id]),
        sourceLabel: document.querySelector("#dailyQuestSource")?.textContent || "",
        coachTitle: document.querySelector("#coachTitle")?.textContent || "",
        coachText: document.querySelector("#coachText")?.textContent || "",
        scopeValue: document.querySelector("#studyScopeSelect")?.value || "",
        mockDisabled: Boolean(document.querySelector("#mockAButton")?.disabled),
        mockTitle: document.querySelector("#mockAButton")?.title || "",
        roundLabel: document.querySelector("#roundLabel")?.textContent?.trim() || "",
        commandTitle: document.querySelector("#todayCommandTitle")?.textContent?.trim() || "",
        commandStep: document.querySelector("#todayCommandKicker")?.textContent?.trim() || "",
        passPlanOpen: Boolean(document.querySelector("#passPlanPanel")?.open),
        themeOpen: Boolean(document.querySelector("#themeDrawer")?.open),
        progressOpen: Boolean(document.querySelector("#progressDrawer")?.open)
      };
    });
    if (blueprintAudit.total !== 100 || blueprintAudit.missing.length) {
      throw new Error(`Curriculum not ready: ${JSON.stringify(blueprintAudit)}`);
    }
    if (!blueprintAudit.sourceLabel.includes("宅建業法") || !blueprintAudit.sourceLabel.includes("定着")) {
      throw new Error(`Random-style source label remained: ${blueprintAudit.sourceLabel}`);
    }
    if (
      !blueprintAudit.coachTitle.includes("宅建業法") ||
      !blueprintAudit.coachText.includes("全問接触済み") ||
      blueprintAudit.scopeValue !== "business" ||
      blueprintAudit.mockDisabled ||
      !blueprintAudit.mockTitle.includes("RETIO公式未見") ||
      blueprintAudit.roundLabel !== "今日 1 / 10" ||
      blueprintAudit.commandTitle !== "固定10問を解く" ||
      blueprintAudit.commandStep !== "今やる・STEP 1 / 4" ||
      blueprintAudit.passPlanOpen ||
      blueprintAudit.themeOpen ||
      blueprintAudit.progressOpen
    ) {
      throw new Error(`Coverage coach missing: ${JSON.stringify(blueprintAudit)}`);
    }

    const themeHierarchy = await page.evaluate(() => {
      const groups = [...document.querySelectorAll("#chapterList > .chapter-group")];
      const labels = groups.map((group) =>
        group.querySelector(":scope > .chapter-group-summary strong")?.textContent?.trim() || ""
      );
      const optionGroups = [...document.querySelectorAll("#chapterSelect optgroup")]
        .map((group) => group.label);
      const optional = document.querySelector('[data-group="business"] > .chapter-optional');
      return {
        labels,
        optionGroups,
        openGroups: groups.filter((group) => group.open).map((group) => group.dataset.group),
        businessCoreRows: document.querySelectorAll(
          '[data-group="business"] > .chapter-group-list > .chapter-row'
        ).length,
        optionalRows: optional?.querySelectorAll(".chapter-row").length || 0,
        optionalOpen: Boolean(optional?.open),
        optionalText: optional?.querySelector(":scope > summary")?.textContent?.replace(/\s+/g, " ").trim() || ""
      };
    });
    const expectedThemeGroups = [
      "第1分冊 宅建業法（11単元・44問）",
      "第2分冊 権利関係（21単元・44問）",
      "第3分冊 法令上の制限（7単元・18問）",
      "第3分冊 税・その他（6単元・18問）"
    ];
    if (JSON.stringify(themeHierarchy.labels) !== JSON.stringify(expectedThemeGroups)) {
      throw new Error(`Theme hierarchy mismatch: ${JSON.stringify(themeHierarchy)}`);
    }
    if (
      themeHierarchy.businessCoreRows !== 11 ||
      themeHierarchy.optionalRows !== 8 ||
      themeHierarchy.optionalOpen ||
      !themeHierarchy.optionalText.includes("以前の100問") ||
      !themeHierarchy.optionalText.includes("解答済 0/100") ||
      !themeHierarchy.optionGroups.includes("以前の100問（解答履歴を保持）")
    ) {
      throw new Error(`Theme hierarchy details mismatch: ${JSON.stringify(themeHierarchy)}`);
    }
    await capture(page, "business-scope-desktop.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, "business-scope-mobile.png");
    const mobileStructure = await page.evaluate(() => {
      const quiz = document.querySelector("#quizCard")?.getBoundingClientRect();
      const battle = document.querySelector(".battle-card")?.getBoundingClientRect();
      return {
        quizBeforeBattle: Boolean(quiz && battle && quiz.top < battle.top),
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    });
    if (!mobileStructure.quizBeforeBattle || mobileStructure.overflow) {
      throw new Error(`Mobile command-first structure mismatch: ${JSON.stringify(mobileStructure)}`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#themeDrawer > summary").click();
    await page.locator("#studyScopeSelect").selectOption("law-other");
    await page.waitForFunction(() =>
      (document.querySelector("#dailyQuestSource")?.textContent || "").includes("法令・税その他")
    );
    const scopeSwitchAudit = await page.evaluate((id) => {
      const saved = JSON.parse(localStorage.getItem(id) || "{}");
      return {
        scope: saved.studyScope,
        planScope: saved.daily?.planScope,
        sections: [...new Set((saved.daily?.planIds || [])
          .map((questionId) => window.TAKKEN_EXAM_QUESTIONS?.[questionId]?.sectionId))]
      };
    }, storageId);
    if (
      scopeSwitchAudit.scope !== "law-other" ||
      scopeSwitchAudit.planScope !== "law-other" ||
      scopeSwitchAudit.sections.includes("rights") ||
      !scopeSwitchAudit.sections.includes("restrictions") ||
      !scopeSwitchAudit.sections.includes("tax")
    ) {
      throw new Error(`Study scope switch failed: ${JSON.stringify(scopeSwitchAudit)}`);
    }
    await page.locator("#studyScopeSelect").selectOption("business");
    await page.waitForFunction(() =>
      (document.querySelector("#dailyQuestSource")?.textContent || "").includes("宅建業法")
    );
    await page.locator("#themeDrawer > summary").click();

    const visitedIds = [];
    const visitedSections = [];
    const visitedSourceHosts = [];
    for (let index = 0; index < 10; index += 1) {
      const question = await page.evaluate(() => {
        const text = document.querySelector("#questionText")?.textContent || "";
        const item = Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
          .find((candidate) => candidate.text === text);
        if (!item) throw new Error(`Full-exam question not found: ${text.slice(0, 60)}`);
        return {
          id: item.id,
          sectionId: item.sectionId,
          answer: item.answer
        };
      });
      visitedIds.push(question.id);
      visitedSections.push(question.sectionId);
      await page.locator(`.choice-button[data-index="${question.answer}"]`).click();
      await page.locator("#feedbackBox").waitFor({ state: "visible" });
      const directExplanation = await page.evaluate(() => ({
        title: document.querySelector(".reasoning-path-head strong")?.textContent?.trim() || "",
        receipt: document.querySelector(".answer-save-receipt")?.textContent?.trim() || "",
        understandingInputs: document.querySelectorAll("[data-understanding-kind], .teachback-input").length,
        next: document.querySelector("#dockNextLabel")?.textContent?.trim() || ""
      }));
      if (
        directExplanation.title !== "こう解く" ||
        !directExplanation.receipt.includes("自動保存済み") ||
        directExplanation.understandingInputs !== 0 ||
        directExplanation.next === "判断軸を選ぶ"
      ) {
        throw new Error(`Direct explanation flow invalid: ${JSON.stringify(directExplanation)}`);
      }
      if (index === 0) {
        await capture(page, "direct-explanation-desktop.png");
      }
      const sourceLink = await page.locator("#bookRef a.official-source-link").evaluate((link) => ({
        host: new URL(link.href).hostname,
        text: link.textContent || "",
        target: link.target,
        rel: link.rel
      }));
      if (
        !sourceLink.text.includes("公式根拠") ||
        sourceLink.target !== "_blank" ||
        !sourceLink.rel.includes("noopener")
      ) {
        throw new Error(`Official source link invalid: ${JSON.stringify(sourceLink)}`);
      }
      visitedSourceHosts.push(sourceLink.host);
      if (index === 0) {
        await page.locator("#dockUnsureButton").click();
      }
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
    if (JSON.stringify(visitedIds) !== JSON.stringify(blueprintAudit.firstBusinessBlock)) {
      throw new Error(`Daily fixed order drift: ${visitedIds.join(",")}`);
    }
    if (new Set(visitedSections).size !== 1 || visitedSections[0] !== "business") {
      throw new Error(`Unstudied section leaked into business scope: ${visitedSections.join(",")}`);
    }
    const allowedSourceHosts = new Set([
      "laws.e-gov.go.jp",
      "www.jhf.go.jp",
      "www.mlit.go.jp",
      "www.moj.go.jp",
      "www.retio.or.jp",
      "www.rftc.jp"
    ]);
    if (visitedSourceHosts.some((host) => !allowedSourceHosts.has(host))) {
      throw new Error(`Daily source host invalid: ${visitedSourceHosts.join(",")}`);
    }

    const stopState = await page.evaluate(() => ({
      label: document.querySelector("#dockNextLabel")?.textContent?.trim() || "",
      target: document.querySelector("#dockTargetText")?.textContent?.trim() || ""
    }));
    if (
      stopState.label !== "今日の10問を終了" ||
      !stopState.target.includes("次は公式20問")
    ) {
      throw new Error(`Unexpected completion handoff: ${JSON.stringify(stopState)}`);
    }
    await page.locator("#dockNextButton").click();
    await page.waitForFunction(() =>
      (document.querySelector("#todayCommandTitle")?.textContent || "").includes("公式20問")
    );
    const sameDayRetention = await page.evaluate(({ storageId, visitedIds }) => {
      const saved = JSON.parse(localStorage.getItem(storageId) || "{}");
      const officialLink = document.querySelector("#officialDrillQuestionLink");
      return {
        progress: document.querySelector("#chapterProgressText")?.textContent || "",
        coach: document.querySelector("#coachTitle")?.textContent || "",
        commandTitle: document.querySelector("#todayCommandTitle")?.textContent?.trim() || "",
        commandStep: document.querySelector("#todayCommandKicker")?.textContent?.trim() || "",
        mission: document.querySelector("#dailyMissionStatus")?.textContent?.trim() || "",
        officialHref: officialLink?.href || "",
        officialTarget: officialLink?.target || "",
        officialRel: officialLink?.rel || "",
        confidence: visitedIds.map((id) => ({
          id,
          lastConfidence: saved.questionStats?.[id]?.lastConfidence || "",
          clearDays: saved.questionStats?.[id]?.clearDayKeys || [],
          marked: Boolean(saved.marked?.[id])
        }))
      };
    }, { storageId, visitedIds });
    if (
      !sameDayRetention.progress.includes("定着0/100") ||
      !sameDayRetention.commandTitle.includes("公式20問") ||
      !sameDayRetention.commandTitle.includes("35分") ||
      sameDayRetention.commandStep !== "今やる・STEP 2 / 4" ||
      sameDayRetention.mission !== "1 / 4" ||
      sameDayRetention.officialHref !== "" ||
      sameDayRetention.officialTarget !== "" ||
      sameDayRetention.officialRel !== "" ||
      sameDayRetention.confidence[0]?.lastConfidence !== "unsure" ||
      sameDayRetention.confidence[0]?.clearDays.length !== 0 ||
      !sameDayRetention.confidence[0]?.marked ||
      sameDayRetention.confidence.slice(1).some(
        (item) => item.lastConfidence !== "clear" || item.clearDays.length !== 1
      )
    ) {
      throw new Error(`Daily completion route mismatch: ${JSON.stringify(sameDayRetention)}`);
    }
    await capture(page, "command-step2-desktop.png");

    await page.locator("#officialDrillOpenButton").click();
    await page.locator("#officialDrillStartButton").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    await capture(page, "official-drill-mobile.png");
    const officialDrillMobileOverflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
    );
    if (officialDrillMobileOverflow) {
      throw new Error(`Official drill mobile overflow: ${officialDrillMobileOverflow}`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const officialAnswerKey = {
      1: 3, 2: 3, 3: 3, 4: 4, 5: 4, 6: 1, 7: 1, 8: 2, 9: 1, 10: 3,
      11: 3, 12: 3, 13: 3, 14: 1, 15: 4, 16: 4, 17: 2, 18: 2, 19: 2, 20: 4,
      21: 4, 22: 4, 23: 1, 24: 2, 25: 1, 26: 4, 27: 1, 28: 2, 29: 2, 30: 3,
      31: 4, 32: 2, 33: 3, 34: 3, 35: 1, 36: 4, 37: 4, 38: 3, 39: 4, 40: 3,
      41: 1, 42: 2, 43: 4, 44: 2, 45: 4, 46: 2, 47: 3, 48: 2, 49: 1, 50: 1
    };
    const drillNumbers = [
      1, 2, 3, 4, 5, 6, 15, 16, 17, 23,
      24, 26, 27, 28, 29, 30, 31, 32, 33, 46
    ];
    for (const [index, number] of drillNumbers.entries()) {
      const answer = index === 0
        ? (officialAnswerKey[number] % 4) + 1
        : officialAnswerKey[number];
      await chooseDrillAnswer(page, storageId, number, answer);
      if (index < drillNumbers.length - 1) {
        await page.locator("#officialDrillNextButton").click();
      }
    }
    await page.locator("#officialDrillSubmitButton").click();
    await page.waitForFunction(() =>
      (document.querySelector("#officialDrillStatus")?.textContent || "").includes("根拠未判定")
    );
    for (const [index, number] of drillNumbers.entries()) {
      const confidence = number === drillNumbers[1] ? "uncertain" : "grounded";
      await chooseDrillConfidence(page, storageId, number, confidence);
      if (index < drillNumbers.length - 1) {
        await page.locator("#officialDrillNextButton").click();
      }
    }
    await page.locator("#officialDrillSubmitButton").click();
    await page.waitForFunction(() =>
      (document.querySelector("#todayCommandTitle")?.textContent || "").includes("誤答・根拠なし2件")
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    await capture(page, "official-review-mobile.png");
    const officialReviewMobileOverflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
    );
    if (officialReviewMobileOverflow) {
      throw new Error(`Official review mobile overflow: ${officialReviewMobileOverflow}`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(`[data-review-cause="${drillNumbers[0]}"]`).selectOption("reading");
    await page.locator(`[data-review-cause="${drillNumbers[1]}"]`).selectOption("exception");
    await page.locator(`[data-review-question="${drillNumbers[0]}"]`)
      .fill("根拠を飛ばした");
    await page.locator(`[data-review-question="${drillNumbers[1]}"]`)
      .fill("二択で迷った → 例外条件を声に出して切る");
    await page.locator("#todayCommandReviewButton").click();
    await page.waitForFunction(() =>
      (document.querySelector("#todayCommandStatus")?.textContent || "").includes("原因を選び")
    );
    await page.locator(`[data-review-question="${drillNumbers[0]}"]`)
      .fill("根拠を飛ばした → 条文の主体を先に囲む");
    await page.locator("#todayCommandReviewButton").click();
    await page.waitForFunction(() =>
      (document.querySelector("#todayCommandTitle")?.textContent || "").includes("最低75分まで")
    );
    await page.locator("#missionMinutesInput").fill("90");
    await page.locator("#missionMinutesButton").click();
    await page.waitForFunction(() =>
      document.querySelector("#todayCommandTitle")?.textContent?.trim() === "最低75分ライン完了"
    );
    const completedMission = await page.evaluate((id) => {
      const saved = JSON.parse(localStorage.getItem(id) || "{}");
      const mission = saved.missionLog?.[new Date().toLocaleDateString("sv-SE")] || {};
      return {
        title: document.querySelector("#todayCommandTitle")?.textContent?.trim() || "",
        step: document.querySelector("#todayCommandKicker")?.textContent?.trim() || "",
        missionCount: document.querySelector("#dailyMissionStatus")?.textContent?.trim() || "",
        reviewNote: mission.reviewNote || "",
        reviewed: Boolean(mission.reviewed),
        officialQuestions: Boolean(mission.officialQuestions),
        officialDrill: mission.officialDrill || null,
        minutes: Number(mission.minutes) || 0
      };
    }, storageId);
    if (
      completedMission.title !== "最低75分ライン完了" ||
      completedMission.step !== "今日の作戦・4 / 4" ||
      completedMission.missionCount !== "4 / 4" ||
      !completedMission.reviewed ||
      !completedMission.officialQuestions ||
      completedMission.officialDrill?.score !== 19 ||
      completedMission.officialDrill?.reviewTargets?.length !== 2 ||
      completedMission.officialDrill?.evidenceVersion !== 3 ||
      Object.keys(completedMission.officialDrill?.confidence || {}).length !== 20 ||
      completedMission.officialDrill?.confidence?.[drillNumbers[1]] !== "uncertain" ||
      Object.keys(completedMission.officialDrill?.reviewNotes || {}).length !== 2 ||
      Object.keys(completedMission.officialDrill?.reviewCauses || {}).length !== 2 ||
      !completedMission.reviewNote.includes(`問${drillNumbers[0]}`) ||
      completedMission.minutes !== 90
    ) {
      throw new Error(`Sequential mission workflow mismatch: ${JSON.stringify(completedMission)}`);
    }
    await capture(page, "command-complete-desktop.png");

    const desktopOverflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    await capture(page, "command-complete-mobile.png");
    const mobileOverflow = await page.evaluate(() => {
      const quiz = document.querySelector("#quizCard")?.getBoundingClientRect();
      const battle = document.querySelector(".battle-card")?.getBoundingClientRect();
      return {
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        quizBeforeBattle: Boolean(quiz && battle && quiz.top < battle.top)
      };
    });
    if (desktopOverflow || mobileOverflow.overflow || !mobileOverflow.quizBeforeBattle) {
      throw new Error(`Responsive structure mismatch: desktop=${desktopOverflow}, mobile=${JSON.stringify(mobileOverflow)}`);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate((id) => {
      const saved = JSON.parse(localStorage.getItem(id) || "{}");
      delete saved.missionLog?.[new Date().toLocaleDateString("sv-SE")];
      localStorage.setItem(id, JSON.stringify(saved));
    }, storageId);
    await page.reload({ waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(() =>
        (document.querySelector("#todayCommandKicker")?.textContent || "").includes("STEP 2"),
      null, { timeout: 10000 });
    } catch (error) {
      const command = await page.evaluate((id) => {
        const saved = JSON.parse(localStorage.getItem(id) || "{}");
        const date = new Date().toLocaleDateString("sv-SE");
        return {
          kicker: document.querySelector("#todayCommandKicker")?.textContent?.trim() || "",
          title: document.querySelector("#todayCommandTitle")?.textContent?.trim() || "",
          status: document.querySelector("#todayCommandStatus")?.textContent?.trim() || "",
          mission: saved.missionLog?.[date] || null
        };
      }, storageId);
      throw new Error(`STEP 2 did not return after clearing today's mission: ${JSON.stringify(command)}`, { cause: error });
    }
    await page.locator("#officialDrillOpenButton").click();
    await page.locator("#officialDrillStartButton").click();
    const perfectNumbers = drillNumbers;
    for (const [index, number] of perfectNumbers.entries()) {
      await chooseDrillAnswer(page, storageId, number, officialAnswerKey[number]);
      await chooseDrillConfidence(page, storageId, number, "grounded");
      if (index < perfectNumbers.length - 1) {
        await page.locator("#officialDrillNextButton").click();
      }
    }
    await page.locator("#officialDrillSubmitButton").click();
    await page.waitForFunction(() =>
      (document.querySelector("#todayCommandKicker")?.textContent || "").includes("STEP 4")
    );
    const zeroReviewAudit = await page.evaluate((id) => {
      const saved = JSON.parse(localStorage.getItem(id) || "{}");
      const mission = saved.missionLog?.[new Date().toLocaleDateString("sv-SE")] || {};
      return {
        reviewed: Boolean(mission.reviewed),
        reviewTargets: mission.officialDrill?.reviewTargets || [],
        missionCount: document.querySelector("#dailyMissionStatus")?.textContent?.trim() || "",
        reviewStatus: document.querySelector("#missionReviewStatus")?.textContent?.trim() || "",
        command: document.querySelector("#todayCommandTitle")?.textContent?.trim() || ""
      };
    }, storageId);
    if (
      !zeroReviewAudit.reviewed ||
      zeroReviewAudit.reviewTargets.length !== 0 ||
      zeroReviewAudit.missionCount !== "3 / 4" ||
      zeroReviewAudit.reviewStatus !== "対象0件" ||
      !zeroReviewAudit.command.includes("最低75分まで")
    ) {
      throw new Error(`Zero-review transition mismatch: ${JSON.stringify(zeroReviewAudit)}`);
    }

    await page.evaluate((id) => {
      const saved = JSON.parse(localStorage.getItem(id) || "{}");
      const now = new Date().toISOString();
      saved.studyScope = "all";
      saved.dailyFinishedDate = "";
      saved.daily = { ...(saved.daily || {}), planVersion: 0, planIds: [] };
      saved.questionStats = saved.questionStats || {};
      for (const questionId of window.TAKKEN_EXAM_BLUEPRINT.curriculumOrder) {
        if (saved.questionStats[questionId]?.attempts) continue;
        saved.questionStats[questionId] = {
          attempts: 1,
          correct: 0,
          wrong: 1,
          lastStep: 1,
          lastAnsweredAt: now,
          lastWrongAt: now
        };
      }
      localStorage.setItem(id, JSON.stringify(saved));
    }, storageId);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.querySelector("#mockAButton")?.disabled);
    const mockMenu = page.locator("details.quest-card");
    if (!await mockMenu.evaluate((panel) => panel.open)) {
      await page.locator("details.quest-card > summary").click();
    }
    await page.locator("#mockAButton").waitFor({ state: "visible" });
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
        questLabel: document.querySelector("#questLabel")?.textContent?.trim() || "",
        coachText: document.querySelector("#coachText")?.textContent?.trim() || "",
        source: document.querySelector("#dailyQuestSource")?.textContent || "",
        timer: document.querySelector("#dailyWeakText")?.textContent || ""
      };
    }, storageId);
    if (
      mockStart.runMode !== "mock" ||
      mockStart.formId !== "form-a" ||
      mockStart.position !== 0 ||
      mockStart.questLabel !== "50問確認模試" ||
      !mockStart.coachText.includes("既習問題の定着確認") ||
      !mockStart.coachText.includes("初見実力は公式過去問") ||
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
            sourceLinks: document.querySelectorAll("#bookRef a").length,
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
          noLeakAudit.sourceLinks !== 0 ||
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
          {
            score: card.querySelector("strong")?.childNodes?.[0]?.textContent?.trim() || "",
            target: card.querySelector("small")?.textContent?.trim() || ""
          }
        ])
      );
      return {
        scoreText: document.querySelector(".mock-score-hero > strong")?.textContent?.replace(/\s+/g, " ").trim() || "",
        targetText: document.querySelector(".mock-score-hero > p")?.textContent || "",
        wrongItems: document.querySelectorAll(".mock-wrong-item").length,
        sections,
        priorityText: document.querySelector(".mock-priority")?.textContent?.replace(/\s+/g, " ").trim() || "",
        historyItems: document.querySelectorAll(".mock-history-item").length,
        historyText: document.querySelector(".mock-history")?.textContent?.replace(/\s+/g, " ").trim() || "",
        wrongSourceLinks: [...document.querySelectorAll(".mock-wrong-item .mock-source-link")].map((link) => ({
          host: new URL(link.href).hostname,
          text: link.textContent?.trim() || "",
          target: link.target,
          rel: link.rel
        })),
        calibration: {
          text: document.querySelector(".mock-calibration")?.textContent?.replace(/\s+/g, " ").trim() || "",
          button: document.querySelector("#mockOfficialExamButton")?.textContent?.trim() || "",
          href: document.querySelector(".mock-calibration a")?.href || ""
        },
        stats: {
          scoreLabel: document.querySelector("#accuracyLabel")?.textContent?.trim() || "",
          score: document.querySelector("#accuracyText")?.textContent?.trim() || "",
          timeLabel: document.querySelector("#streakLabel")?.textContent?.trim() || "",
          time: document.querySelector("#streakText")?.textContent?.trim() || ""
        },
        finalized: Boolean(saved.mock?.finalized),
        history: saved.mockHistory?.length || 0,
        attempts: saved.attempts,
        weakWrongCount: (saved.mock?.results || []).filter((result) => !result.correct && saved.marked?.[result.id]).length
      };
    }, storageId);
    const expectedSections = {
      rights: { score: "11 / 14", target: "目標 9" },
      restrictions: { score: "6 / 8", target: "目標 7" },
      business: { score: "16 / 20", target: "目標 18" },
      tax: { score: "3 / 3", target: "目標 2" },
      other: { score: "4 / 5", target: "目標 4" }
    };
    if (
      !mockResult.scoreText.includes("40 / 50") ||
      !mockResult.targetText.includes("内部目標40点を達成") ||
      mockResult.wrongItems !== 10 ||
      JSON.stringify(mockResult.sections) !== JSON.stringify(expectedSections) ||
      !mockResult.priorityText.includes("宅建業法 16/20 → 目標18") ||
      mockResult.historyItems !== 1 ||
      !mockResult.historyText.includes("40 / 50") ||
      mockResult.wrongSourceLinks.length !== 10 ||
      mockResult.wrongSourceLinks.some((link) =>
        !allowedSourceHosts.has(link.host) ||
        !link.text.includes("公式根拠") ||
        link.target !== "_blank" ||
        !link.rel.includes("noopener")
      ) ||
      !mockResult.calibration.text.includes("初見実力は公式過去問で確認") ||
      mockResult.calibration.button !== "露出記録つき公式50問へ" ||
      mockResult.calibration.href !== "" ||
      mockResult.stats.scoreLabel !== "得点" ||
      mockResult.stats.score !== "40/50" ||
      mockResult.stats.timeLabel !== "所要時間" ||
      !/^\d{2}:\d{2}$/.test(mockResult.stats.time) ||
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
    await page.locator(".mock-wrong-item summary").first().click();
    await capture(page, "mock-result-mobile.png");
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
    const formCPage = await context.newPage();
    const formCReview = `formc${Date.now().toString(36)}`.slice(0, 24);
    const formCUrl = new URL(baseUrl);
    formCUrl.searchParams.set("review", formCReview);
    formCUrl.searchParams.set("today", "1");
    await formCPage.goto(formCUrl.toString(), { waitUntil: "networkidle" });
    const questMenu = formCPage.locator(".quest-card");
    if (!(await questMenu.evaluate((node) => node.open))) await questMenu.locator(":scope > summary").click();
    await formCPage.locator("#mockCButton").click();
    await formCPage.waitForFunction(() => document.querySelector(".quest-card")?.classList.contains("is-mock"));
    const formCStart = await formCPage.evaluate((id) => {
      const saved = JSON.parse(localStorage.getItem(id) || "{}");
      return { formId: saved.mock?.formId, position: saved.mock?.position, current: document.querySelector("#roundLabel")?.textContent?.trim() || "" };
    }, `takken-battle-study-clean-v2-hard-review-${formCReview}`);
    if (formCStart.formId !== "form-c" || formCStart.position !== 0 || formCStart.current !== "1 / 50") {
      throw new Error(`Mock C did not start correctly: ${JSON.stringify(formCStart)}`);
    }
    await formCPage.close();

    const textbookIdsForFixtures = await page.evaluate(() =>
      Object.values(window.TAKKEN_EXAM_BLUEPRINT.textbookRanges)
        .flatMap((range) => range.chapters)
        .flatMap((chapter) => chapter.ids)
    );
    const masteryContext = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo"
    });
    const masteryPage = await masteryContext.newPage();
    const masteryErrors = [];
    masteryPage.on("console", (message) => {
      if (message.type() === "error") masteryErrors.push(message.text());
    });
    masteryPage.on("pageerror", (error) => masteryErrors.push(String(error)));
    const masteryNamespace = `mastery${Date.now().toString(36)}`;
    const masteryStorageId = `takken-battle-study-clean-v2-hard-review-${masteryNamespace}`;
    await masteryPage.addInitScript(({ storageId, foundationIds }) => {
      const ids = [
        ...Array.from({ length: 28 }, (_, index) => `r${String(index + 1).padStart(3, "0")}`),
        ...Array.from({ length: 16 }, (_, index) => `l${String(index + 1).padStart(3, "0")}`),
        ...Array.from({ length: 6 }, (_, index) => `t${String(index + 1).padStart(3, "0")}`),
        ...Array.from({ length: 40 }, (_, index) => `b${String(index + 1).padStart(3, "0")}`),
        ...Array.from({ length: 10 }, (_, index) => `o${String(index + 1).padStart(3, "0")}`)
      ];
      const weakIds = new Set(["r001", "l001", "t001", "b001"]);
      const questionStats = Object.fromEntries(ids.map((id, index) => [
        id,
        {
          attempts: 1,
          correct: weakIds.has(id) ? 0 : 1,
          wrong: weakIds.has(id) ? 1 : 0,
          lastStep: index + 1,
          lastAnsweredAt: "2026-06-01T00:00:00.000Z",
          lastCorrectAt: weakIds.has(id) ? "" : "2026-06-01T00:00:00.000Z",
          lastWrongAt: weakIds.has(id) ? "2026-06-01T00:00:00.000Z" : "",
          correctDayKeys: weakIds.has(id) ? [] : ["2026-05-31", "2026-06-01"],
          understandingDayKeys: weakIds.has(id) ? [] : ["2026-05-31", "2026-06-01"],
          lastUnderstandingPassed: !weakIds.has(id),
          lastUnderstandingPassedAt: weakIds.has(id) ? "" : "2026-06-01T00:00:00.000Z",
          lastConfidence: weakIds.has(id) ? "wrong" : "clear",
          lastConfidenceAt: "2026-06-01T00:00:00.000Z"
        }
      ]));
      foundationIds.forEach((id, index) => {
        if (questionStats[id]) return;
        questionStats[id] = {
          attempts: 1,
          correct: 1,
          wrong: 0,
          lastStep: ids.length + index + 1,
          lastAnsweredAt: "2026-06-01T00:00:00.000Z",
          lastCorrectAt: "2026-06-01T00:00:00.000Z",
          correctDayKeys: ["2026-05-31", "2026-06-01"],
          clearDayKeys: ["2026-05-31", "2026-06-01"],
          understandingDayKeys: ["2026-05-31", "2026-06-01"],
          lastUnderstandingPassed: true,
          lastUnderstandingPassedAt: "2026-06-01T00:00:00.000Z",
          lastConfidence: "clear",
          lastConfidenceAt: "2026-06-01T00:00:00.000Z"
        };
      });
      localStorage.setItem(storageId, JSON.stringify({
        index: 0,
        attempts: 100,
        correct: 96,
        totalXp: 6000,
        progressionVersion: 4,
        examContentVersion: 1,
        studyScope: "all",
        marked: Object.fromEntries([...weakIds].map((id) => [id, true])),
        questionStats
      }));
    }, { storageId: masteryStorageId, foundationIds: textbookIdsForFixtures });
    const masteryUrl = new URL(baseUrl);
    masteryUrl.searchParams.set("review", masteryNamespace);
    masteryUrl.searchParams.set("today", "1");
    await masteryPage.goto(masteryUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });
    await masteryPage.waitForFunction(() =>
      (document.querySelector("#dailyQuestSource")?.textContent || "").includes("全分野・定着")
    );
    const readMastery = () => masteryPage.evaluate((storageId) => {
      const saved = JSON.parse(localStorage.getItem(storageId) || "{}");
      const planIds = saved.daily?.planIds || [];
      const groups = planIds.map((id) => {
        const sectionId = window.TAKKEN_EXAM_QUESTIONS?.[id]?.sectionId;
        return sectionId === "tax" || sectionId === "other" ? "taxOther" : sectionId;
      });
      return {
        planIds,
        planMode: saved.daily?.planMode,
        groupCounts: groups.reduce((counts, groupId) => ({
          ...counts,
          [groupId]: (counts[groupId] || 0) + 1
        }), {}),
        source: document.querySelector("#dailyQuestSource")?.textContent || "",
        coachTitle: document.querySelector("#coachTitle")?.textContent || "",
        coachText: document.querySelector("#coachText")?.textContent || "",
        questLabel: document.querySelector("#questLabel")?.textContent || "",
        passLabel: document.querySelector("#passQuestButton")?.textContent || "",
        retentionStatus: document.querySelector("#coreRetentionStatus")?.textContent || "",
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    }, masteryStorageId);
    const masteryAudit = await readMastery();
    const expectedMasteryGroups = {
      rights: 3,
      business: 4,
      restrictions: 2,
      taxOther: 1
    };
    if (
      masteryAudit.planIds.length !== 10 ||
      new Set(masteryAudit.planIds).size !== 10 ||
      masteryAudit.planIds[0] !== "r001" ||
      masteryAudit.planIds[1] !== "b001" ||
      masteryAudit.planIds[2] !== "l001" ||
      masteryAudit.planIds[4] !== "t001" ||
      JSON.stringify(masteryAudit.groupCounts) !== JSON.stringify(expectedMasteryGroups) ||
      masteryAudit.planMode !== "mastery" ||
      !masteryAudit.source.includes("全分野・定着") ||
      !masteryAudit.coachTitle.includes("全分野 8割定着・弱点4問") ||
      !masteryAudit.coachText.includes("全100問接触後") ||
      masteryAudit.questLabel.trim() !== "全分野・定着" ||
      masteryAudit.passLabel.trim() !== "範囲接触済み" ||
      !masteryAudit.retentionStatus.includes("定着 96 / 100") ||
      masteryAudit.overflow
    ) {
      throw new Error(`Mastery quest mismatch: ${JSON.stringify(masteryAudit)}`);
    }
    await capture(masteryPage, "mastery-quest-mobile.png");
    await masteryPage.reload({ waitUntil: "domcontentloaded" });
    await masteryPage.waitForFunction(() =>
      (document.querySelector("#dailyQuestSource")?.textContent || "").includes("全分野・定着")
    );
    const masteryReload = await readMastery();
    await masteryContext.close();
    if (
      JSON.stringify(masteryReload.planIds) !== JSON.stringify(masteryAudit.planIds) ||
      masteryReload.planMode !== "mastery" ||
      masteryErrors.length
    ) {
      throw new Error(`Mastery quest reload drift: ${JSON.stringify({ masteryAudit, masteryReload, masteryErrors })}`);
    }

    const unitResumeContext = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo"
    });
    const unitResumePage = await unitResumeContext.newPage();
    const unitResumeNamespace = `unitresume${Date.now().toString(36)}`;
    const unitResumeStorageId = `takken-battle-study-clean-v2-hard-review-${unitResumeNamespace}`;
    await unitResumePage.addInitScript(({ storageId }) => {
      const reviewedIds = ["b001", "b002", "b003", "b004"];
      const questionStats = Object.fromEntries(reviewedIds.map((id, index) => [
        id,
        {
          attempts: 1,
          correct: 0,
          wrong: 1,
          lastStep: index + 1,
          lastAnsweredAt: "2026-06-01T00:00:00.000Z",
          lastWrongAt: "2026-06-01T00:00:00.000Z"
        }
      ]));
      localStorage.setItem(storageId, JSON.stringify({
        studyScope: "business",
        attempts: 4,
        correct: 0,
        marked: Object.fromEntries(reviewedIds.map((id) => [id, true])),
        autoMarked: Object.fromEntries(reviewedIds.map((id) => [id, true])),
        questionStats
      }));
    }, { storageId: unitResumeStorageId });
    const unitResumeUrl = new URL(baseUrl);
    unitResumeUrl.searchParams.set("review", unitResumeNamespace);
    unitResumeUrl.searchParams.set("today", "1");
    await unitResumePage.goto(unitResumeUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });
    await unitResumePage.waitForFunction(() => {
      const source = document.querySelector("#dailyQuestSource")?.textContent || "";
      return source.includes("読後1問") && !source.includes("読込中");
    });
    const unitResumeAudit = await unitResumePage.evaluate((storageId) => {
      const saved = JSON.parse(localStorage.getItem(storageId) || "{}");
      const planIds = saved.daily?.planIds || [];
      const reviewedIds = new Set(["b001", "b002", "b003", "b004"]);
      return {
        planIds,
        source: document.querySelector("#dailyQuestSource")?.textContent || "",
        planMode: saved.daily?.planMode,
        planUnitId: saved.daily?.planUnitId,
        reviewCount: planIds.filter((id) => reviewedIds.has(id)).length,
        newCount: planIds.filter((id) => !reviewedIds.has(id)).length,
        sections: [...new Set(planIds.map((id) => window.TAKKEN_EXAM_QUESTIONS?.[id]?.sectionId))],
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    }, unitResumeStorageId);
    await unitResumeContext.close();
    if (
      JSON.stringify(unitResumeAudit.planIds) !== JSON.stringify(["b101"]) ||
      unitResumeAudit.source !== "読後1問: 01-01 宅建業法の基本" ||
      unitResumeAudit.planMode !== "unit" ||
      unitResumeAudit.planUnitId !== "business-book-01" ||
      unitResumeAudit.reviewCount !== 0 ||
      unitResumeAudit.newCount !== 1 ||
      JSON.stringify(unitResumeAudit.sections) !== JSON.stringify(["business"]) ||
      unitResumeAudit.overflow
    ) {
      throw new Error(`Foundation unit resume mismatch: ${JSON.stringify(unitResumeAudit)}`);
    }

    if (consoleErrors.length || pageErrors.length) {
      throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
    }

    const migrationContext = await browser.newContext({
      serviceWorkers: "block",
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
    await migrationPage.locator("#progressDrawer > summary").click();
    await migrationPage.locator(".chapter-optional > summary").click();
    await migrationPage.setViewportSize({ width: 390, height: 844 });
    await capture(migrationPage, "legacy-history-mobile.png");
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
        legacyStatsKept: Number(saved.questionStats?.q127?.attempts) || 0,
        legacySummary: document.querySelector(".chapter-optional > summary")
          ?.textContent?.replace(/\s+/g, " ").trim() || "",
        legacyFirstChapter: document.querySelector(".chapter-optional .chapter-row")
          ?.textContent?.replace(/\s+/g, " ").trim() || "",
        legacySelectGroup: [...document.querySelectorAll("#chapterSelect optgroup")]
          .find((group) => group.label.includes("以前の100問"))?.label || "",
        legacyFirstOption: [...document.querySelectorAll("#chapterSelect optgroup option")]
          .find((option) => option.textContent.includes("免許・免許換え"))?.textContent || "",
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    }, migrationStorageId);
    await migrationContext.close();
    if (
      migration.currentId !== "b001" ||
      migration.index !== 1 ||
      migration.examContentVersion !== 4 ||
      migration.attempts !== 65 ||
      migration.totalXp !== 5000 ||
      !migration.legacyWeakKept ||
      migration.legacyStatsKept !== 3 ||
      !migration.legacySummary.includes("問題・履歴を保持") ||
      !migration.legacySummary.includes("解答済 1/100") ||
      !migration.legacyFirstChapter.includes("解答済 1/21") ||
      migration.legacySelectGroup !== "以前の100問（解答履歴を保持）" ||
      !migration.legacyFirstOption.includes("解答済1/21") ||
      migration.overflow
    ) {
      throw new Error(`Legacy save migration failed: ${JSON.stringify(migration)}`);
    }

    const handoffContext = await browser.newContext({
      serviceWorkers: "block",
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
    await handoffPage.locator(".public-mode-note > summary").click();
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
      serviceWorkers: "block",
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
      themeHierarchy,
      scopeSwitchAudit,
      visitedIds,
      visitedSections: [...new Set(visitedSections)],
      visitedSourceHosts: [...new Set(visitedSourceHosts)],
      fixedSource: blueprintAudit.sourceLabel,
      mockStart,
      noLeakAudit,
      mockResult,
      formBStart,
      formCStart,
      masteryAudit,
      masteryReloadStable: JSON.stringify(masteryReload.planIds) === JSON.stringify(masteryAudit.planIds),
      foundationUnitResume: unitResumeAudit,
      migration,
      handoff,
      zeroReviewAudit,
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
