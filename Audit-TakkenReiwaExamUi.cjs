#!/usr/bin/env node
"use strict";

// Browser-level regression check for generated Reiwa forms. A valid bank is
// insufficient if the running app falls back to ORDER or leaks explanations.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = process.env.TAKKEN_BASE_URL || "http://127.0.0.1:8783/";
const reviewKey = "takken-battle-study-clean-v2-hard-review-reiwa-ui";

const waitForQuestion = async (page, id) => {
  await page.waitForFunction((expectedId) =>
    document.querySelector("#quizCard")?.dataset.questionId === expectedId,
  id);
};

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${baseUrl}?review=reiwa-ui`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.TAKKEN_REIWA_EXAM_BANK));

    const bank = await page.evaluate(() => ({
      count: window.TAKKEN_REIWA_EXAM_BANK.forms.reduce((total, form) => total + form.questions.length, 0),
      forms: window.TAKKEN_REIWA_EXAM_BANK.forms.map((form) => form.id),
      styles: [...document.styleSheets].some((sheet) => String(sheet.href).includes("reiwa-exam.css")),
      invalidCompoundOptions: window.TAKKEN_REIWA_EXAM_BANK.forms.flatMap((form) => form.questions)
        .flatMap((question) => question.sourceChoices || [])
        .filter((choice) =>
          !Array.isArray(choice.components) ||
          choice.components.length !== 2 ||
          new Set(choice.components.map((component) => component?.questionId)).size !== 1
        ).length
    }));
    assert.equal(bank.count, 150);
    assert.deepEqual(bank.forms, ["reiwa-form-a", "reiwa-form-b", "reiwa-form-c"]);
    assert.equal(bank.styles, true);
    assert.equal(bank.invalidCompoundOptions, 0, "each displayed Reiwa option must contain two components from one source question");

    assert.match(await page.locator("#mockAButton").textContent(), /令和実戦A/);
    // The launcher lives in the in-page quest drawer, which can be folded on
    // initial paint. Invoke its native click handler without coupling this
    // regression to that unrelated drawer animation.
    await page.locator("#mockAButton").evaluate((button) => button.click());
    await waitForQuestion(page, "reiwa-a-01");
    const first = await page.evaluate(() => ({
      title: document.querySelector("#dailyQuestTitle")?.textContent || "",
      question: document.querySelector("#questionText")?.textContent || "",
      firstChoice: document.querySelector("#choices button")?.textContent || "",
      visibleQuizText: document.querySelector("#quizCard")?.textContent || "",
      choices: document.querySelectorAll("#choices button").length,
      dockHidden: document.querySelector("#answerDock")?.hidden
    }));
    assert.match(first.title, /令和実戦A\s+1\s*\/\s*50/);
    assert.ok(first.question.length >= 10, "Reiwa prompt should render its lead/stem");
    assert.equal(first.question.includes(first.firstChoice), false, "choice text must not be duplicated in the prompt");
    assert.doesNotMatch(first.visibleQuizText, /\breiwa-[abc]-\d{2}\b|sourceQuestionIds|atomId/i, "internal source labels must never leak into the learner view");
    assert.equal(first.choices, 4);
    assert.equal(first.dockHidden, true);

    await page.locator("#choices button").first().click();
    await page.waitForTimeout(180);
    assert.equal(
      await page.locator("#answerDock").evaluate((dock) => !dock.hidden),
      true,
      "a Reiwa mock answer must be recorded and reveal only the next-action dock"
    );
    const concealed = await page.evaluate(() => ({
      feedbackText: document.querySelector("#feedbackBox")?.textContent || "",
      allExplanations: document.querySelectorAll(".reiwa-all-explanations, .verdict-board, .cut-list").length,
      correctAnswer: document.querySelector("#correctAnswer")?.textContent || "",
      dockVisible: !document.querySelector("#answerDock")?.hidden,
      explainHidden: document.querySelector("#dockExplainButton")?.hidden &&
        getComputedStyle(document.querySelector("#dockExplainButton")).display === "none"
    }));
    assert.equal(concealed.allExplanations, 0, "mock answers must not expose all-choice explanations before completion");
    assert.equal(concealed.correctAnswer, "", "mock answers must not reveal the correct choice before completion");
    assert.match(concealed.feedbackText, /正誤・正解肢・解説は50問終了後/);
    assert.equal(concealed.dockVisible, true);
    assert.equal(concealed.explainHidden, true, "a timed Reiwa form must show only its next action");

    await page.locator("#dockNextButton").click();
    await waitForQuestion(page, "reiwa-a-02");
    await page.waitForTimeout(120);
    const second = await page.evaluate(() => {
      const prompt = document.querySelector("#questionText")?.getBoundingClientRect();
      const questionHeader = document.querySelector("#roundLabel")?.getBoundingClientRect();
      const dock = document.querySelector("#answerDock")?.getBoundingClientRect();
      return {
        id: document.querySelector("#quizCard")?.dataset.questionId,
        focused: document.activeElement?.id,
        promptTop: prompt?.top,
        promptBottom: prompt?.bottom,
        questionHeaderTop: questionHeader?.top,
        questionHeaderBottom: questionHeader?.bottom,
        dockTop: dock?.top,
        dockVisible: Boolean(dock && dock.height > 0),
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    });
    assert.equal(second.id, "reiwa-a-02");
    assert.equal(second.focused, "questionText", "advance should focus the semantic question prompt");
    assert.ok(second.questionHeaderTop >= 0, "advance must leave the new question header visible");
    assert.ok(second.promptTop >= 16, "advanced prompt needs a positive reading offset");
    assert.ok(!second.dockVisible || second.promptBottom <= second.dockTop, "advanced prompt must not sit behind the answer dock");
    assert.equal(second.overflow, 0);

    // The generated attempt must survive a reload at its current question.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.TAKKEN_REIWA_EXAM_BANK));
    await waitForQuestion(page, "reiwa-a-02");

    // Old v50 form IDs remain readable even though new forms own readiness.
    await page.evaluate((storageId) => {
      const saved = JSON.parse(localStorage.getItem(storageId));
      saved.runMode = "mock";
      saved.index = 0;
      saved.answered = null;
      saved.finished = false;
      saved.mock = {
        formId: "form-a", examProfile: "general", position: 0,
        startedAt: new Date().toISOString(), finishedAt: "", elapsedMs: 0,
        results: [], finalized: false
      };
      localStorage.setItem(storageId, JSON.stringify(saved));
    }, reviewKey);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const id = document.querySelector("#quizCard")?.dataset.questionId || "";
      return id && !id.startsWith("reiwa-");
    });
    const legacy = await page.evaluate(() => ({
      id: document.querySelector("#quizCard")?.dataset.questionId || "",
      title: document.querySelector("#dailyQuestTitle")?.textContent || "",
      choices: document.querySelectorAll("#choices button").length
    }));
    assert.match(legacy.id, /^[a-z]\d{3}$/i, "legacy form-a snapshot should render a core question ID");
    assert.equal(legacy.choices, 4);
    assert.match(legacy.title, /旧フォームA/);

    // Legacy results remain readable but must never be presented as a Reiwa
    // measurement on the current readiness card.
    await page.evaluate((storageId) => {
      const saved = JSON.parse(localStorage.getItem(storageId));
      saved.runMode = "quest";
      saved.finished = false;
      saved.mock = {
        formId: "", examProfile: "general", position: 0,
        startedAt: "", finishedAt: "", elapsedMs: 0,
        results: [], finalized: false
      };
      saved.mockHistory = [{
        formId: "form-a", examProfile: "general", evidenceVersion: 2,
        lawBaseline: "2026-04-01", questionCount: 50,
        completedAt: "2026-08-16T10:00:00+09:00", dayKey: "2026-08-16",
        score: 40, elapsedMs: 60 * 60 * 1000,
        sectionScores: {
          business: { correct: 18 }, rights: { correct: 9 }, restrictions: { correct: 7 },
          tax: { correct: 2 }, other: { correct: 4 }
        }
      }];
      localStorage.setItem(storageId, JSON.stringify(saved));
    }, reviewKey);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.TAKKEN_REIWA_EXAM_BANK));
    const legacyReadiness = await page.evaluate(() => ({
      title: document.querySelector("#passReadinessTitle")?.textContent || "",
      subjectScores: [...document.querySelectorAll("#passSubjectGrid strong")].map((node) => node.textContent || "")
    }));
    assert.match(legacyReadiness.title, /50問は未測定。令和実戦で現在地を出す/);
    assert.ok(legacyReadiness.subjectScores.every((value) => value.startsWith("未測定")),
      `legacy history must not populate Reiwa card scores: ${JSON.stringify(legacyReadiness.subjectScores)}`);

    // 320px is where the fixed dock is most likely to overlap controls.
    await page.setViewportSize({ width: 320, height: 720 });
    await page.locator("#mockAButton").evaluate((button) => button.click());
    await waitForQuestion(page, "reiwa-a-01");
    await page.locator("#choices button").first().click();
    await page.waitForFunction(() => !document.querySelector("#answerDock")?.hidden);
    const mobile = await page.evaluate(() => {
      const dock = document.querySelector("#answerDock");
      const inner = dock?.querySelector(".answer-dock-inner");
      const next = document.querySelector("#dockNextButton");
      const explain = document.querySelector("#dockExplainButton");
      const dockBox = dock?.getBoundingClientRect();
      const innerBox = inner?.getBoundingClientRect();
      const nextBox = next?.getBoundingClientRect();
      const style = inner ? getComputedStyle(inner) : null;
      const notice = document.createElement("section");
      notice.className = "pwa-update-notice";
      notice.innerHTML = "<p>教材データを更新できます。</p><button type=\"button\">更新</button>";
      document.body.append(notice);
      const noticeBox = notice.getBoundingClientRect();
      notice.remove();
      return {
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        dockVisible: Boolean(dockBox && dockBox.height > 0),
        dockHeight: dockBox?.height || 0,
        dockTop: dockBox?.top || 0,
        dockBottom: dockBox?.bottom,
        viewport: window.innerHeight,
        nextTop: nextBox?.top,
        nextBottom: nextBox?.bottom,
        innerTop: innerBox?.top,
        innerBottom: innerBox?.bottom,
        explainHidden: explain?.hidden && getComputedStyle(explain).display === "none",
        gridRows: style?.gridTemplateRows || "",
        nextHeight: nextBox?.height || 0,
        noticeTop: noticeBox.top,
        noticeBottom: noticeBox.bottom
      };
    });
    assert.equal(mobile.overflow, 0, "320px view must not horizontally overflow");
    assert.equal(mobile.dockVisible, true);
    assert.ok(Math.abs(mobile.dockBottom - mobile.viewport) <= 1, "dock must remain fixed to viewport bottom");
    assert.ok(mobile.dockHeight <= 82, "a timed Reiwa form must keep its mobile next dock compact");
    assert.equal(mobile.explainHidden, true, "the explanation control must not occupy mock-exam space");
    assert.ok(mobile.nextTop >= mobile.innerTop && mobile.nextBottom <= mobile.innerBottom, "the next action must fit the single compact row");
    assert.ok(mobile.nextHeight >= 44, "the mobile next action needs a usable hit area");
    assert.ok(mobile.noticeBottom <= mobile.dockTop, `the update notice fallback must clear the fixed answer dock: ${JSON.stringify(mobile)}`);

    // Complete the same form through the real answer/next controls. Always
    // selecting the first displayed option guarantees a substantial wrong-answer
    // sample while remaining independent of the bank's answer order.
    await page.setViewportSize({ width: 390, height: 844 });
    for (let position = 2; position <= 50; position += 1) {
      await page.locator("#dockNextButton").click();
      await waitForQuestion(page, `reiwa-a-${String(position).padStart(2, "0")}`);
      await page.locator("#choices .choice-button").first().click();
      await page.waitForFunction(() => !document.querySelector("#answerDock")?.hidden);
    }
    await page.locator("#dockNextButton").click();
    await page.waitForFunction(() => Boolean(document.querySelector('.mock-results[data-mock-result="reiwa-form-a"]')));

    const completion = await page.evaluate((storageId) => {
      const state = JSON.parse(localStorage.getItem(storageId) || "null");
      const form = window.TAKKEN_REIWA_EXAM_BANK.forms.find((item) => item.id === "reiwa-form-a");
      const questionById = Object.fromEntries(form.questions.map((question) => [question.id, question]));
      const sourceIdsFor = (result) => {
        const question = questionById[result.id];
        const optionSourceIds = (index) => [...new Set(
          (question?.sourceChoices?.[index]?.components || [])
            .map((component) => component?.questionId)
            .filter(Boolean)
        )];
        const allSourceIds = [...new Set([0, 1, 2, 3].flatMap(optionSourceIds))];
        if (question?.formatFamily === "single") {
          return [...new Set([...optionSourceIds(result.selected), ...optionSourceIds(question.answer)])];
        }
        if (question?.formatFamily === "combination") {
          const labels = ["ア", "イ", "ウ", "エ"];
          const selectedText = String(question.choices?.[result.selected] || "");
          const correctText = String(question.choices?.[question.answer] || "");
          const differing = labels.flatMap((label, index) =>
            selectedText.includes(label) !== correctText.includes(label) ? optionSourceIds(index) : []
          );
          return differing.length ? [...new Set(differing)] : allSourceIds;
        }
        return allSourceIds;
      };
      const wrong = state.mock.results.filter((result) => !result.correct);
      const expectedSourceIds = [...new Set(wrong.flatMap(sourceIdsFor))].sort();
      const markedIds = Object.keys(state.marked || {}).sort();
      const autoMarkedIds = Object.keys(state.autoMarked || {}).sort();
      const latestHistory = [...(state.mockHistory || [])].at(-1) || {};
      const wrongItems = [...document.querySelectorAll(".mock-wrong-item")];
      return {
        resultCount: state.mock.results.length,
        finalized: state.mock.finalized,
        finished: state.finished,
        wrongCount: wrong.length,
        latestHistory,
        expectedSourceIds,
        markedIds,
        autoMarkedIds,
        generatedMarkedIds: markedIds.filter((id) => id.startsWith("reiwa-")),
        generatedAutoMarkedIds: autoMarkedIds.filter((id) => id.startsWith("reiwa-")),
        reviewCount: wrongItems.length,
        minimumChoiceReasons: wrongItems.length
          ? Math.min(...wrongItems.map((item) => item.querySelectorAll(".mock-choice-reasons li").length))
          : 0,
        resultText: document.querySelector(".mock-results")?.textContent || ""
      };
    }, reviewKey);
    assert.equal(completion.resultCount, 50, "all 50 Reiwa questions must be persisted before finishing");
    assert.equal(completion.finalized, true);
    assert.equal(completion.finished, true);
    assert.ok(completion.wrongCount > 0, "the end-to-end audit needs wrong answers to exercise review routing");
    assert.equal(completion.latestHistory.formId, "reiwa-form-a");
    assert.equal(completion.latestHistory.questionCount, 50);
    assert.match(completion.resultText, /誤答レビュー/);
    assert.match(completion.resultText, /基礎弱点へ登録/);
    assert.equal(completion.reviewCount, completion.wrongCount, "each wrong Reiwa composite needs a result review row");
    assert.equal(completion.minimumChoiceReasons, 4, "each review row must expose all four choice reasons");
    assert.deepEqual(completion.generatedMarkedIds, [], "generated Reiwa IDs must never enter the marked weak list");
    assert.deepEqual(completion.generatedAutoMarkedIds, [], "generated Reiwa IDs must never enter autoMarked");
    assert.deepEqual(completion.autoMarkedIds, completion.expectedSourceIds, "wrong Reiwa composites must route only to their source study IDs");
    assert.deepEqual(completion.markedIds, completion.expectedSourceIds, "the weak list must contain only routed source study IDs");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "ok", forms: 3, questions: 150, reload: true, legacySave: true, completedQuestions: 50, wrongReviews: completion.wrongCount, overflow320: 0 }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
