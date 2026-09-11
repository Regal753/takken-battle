"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const baseUrl = process.env.TAKKEN_BASE_URL || "http://127.0.0.1:8784/";
const storageId = "takken-battle-study-clean-v2-hard-review-case-ui";
const settleFrames = page => page.evaluate(() => new Promise(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}));
async function waitId(page, id) {
  await page.waitForFunction(value => document.querySelector("#quizCard")?.dataset.questionId === value, id);
  // Starting/advancing schedules its own reveal; do not include that movement in an answer measurement.
  await settleFrames(page);
}
async function clickChoiceWithGeometry(page, index, width, injectLayoutShift = false) {
  const choice = page.locator("#choices button").nth(index);
  await choice.scrollIntoViewIfNeeded();
  await settleFrames(page);
  const point = await choice.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = (Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2;
    return { x, y, hitIndex: document.elementFromPoint(x, y)?.closest("#choices button")?.dataset.index };
  });
  assert.equal(point.hitIndex, String(index), `${width}: the physical click must reach the intended choice`);
  await page.evaluate(({ index, injectLayoutShift }) => {
    const read = () => {
      const button = document.querySelectorAll("#choices button")[index];
      const top = button.getBoundingClientRect().top;
      return { scrollY, top, pageY: top + scrollY, questionId: document.querySelector("#quizCard").dataset.questionId,
        selected: button.getAttribute("aria-pressed") === "true" };
    };
    const probe = window.__caseAnswerProbe = { before: null, calls: [], read, stable: 0, last: null, injectedHeight: 0 };
    let layoutObserver, spacer, anchorStyle;
    if (injectLayoutShift) {
      // Synthetic DOM only: force a document-space shift after answer render, before its anchor RAF.
      // Disable native anchoring so this scenario must exercise the app's correction.
      anchorStyle = document.createElement("style");
      anchorStyle.textContent = "* { overflow-anchor: none !important; }";
      document.head.append(anchorStyle);
      spacer = document.createElement("div");
      spacer.style.cssText = "height:0;flex-shrink:0;";
      document.querySelector("#quizCard").before(spacer);
      layoutObserver = new MutationObserver(() => {
        spacer.style.height = "80px";
        probe.injectedHeight = spacer.getBoundingClientRect().height;
        layoutObserver.disconnect();
      });
      layoutObserver.observe(document.querySelector("#choices"), { childList: true });
    }
    const scrollToOriginal = window.scrollTo, scrollByOriginal = window.scrollBy;
    window.scrollTo = function(...args) { probe.calls.push({ method: "scrollTo", args }); return scrollToOriginal.apply(this, args); };
    window.scrollBy = function(...args) { probe.calls.push({ method: "scrollBy", args }); return scrollByOriginal.apply(this, args); };
    const down = event => {
      const button = event.target.closest("#choices button");
      if (button?.dataset.index !== String(index)) return;
      probe.before = { ...read(), trusted: event.isTrusted, pointerType: event.pointerType, pointerPageY: event.pageY };
    };
    document.addEventListener("pointerdown", down, { capture: true, once: true });
    probe.restore = () => {
      window.scrollTo = scrollToOriginal; window.scrollBy = scrollByOriginal;
      document.removeEventListener("pointerdown", down, true);
      layoutObserver?.disconnect(); spacer?.remove(); anchorStyle?.remove();
    };
  }, { index, injectLayoutShift });
  // A locator click may perform its own scrolling after the baseline. Use the actual mouse and pointerdown instead.
  await page.mouse.click(point.x, point.y);
  await assertConcealed(page);
  await settleFrames(page);
  await page.waitForFunction(() => {
    const probe = window.__caseAnswerProbe, current = probe.read();
    probe.stable = probe.last && Math.abs(current.top - probe.last.top) <= 0.1 &&
      Math.abs(current.scrollY - probe.last.scrollY) <= 0.1 ? probe.stable + 1 : 0;
    probe.last = current;
    return probe.stable >= 3;
  }, null, { polling: "raf", timeout: 3000 });
  const measured = await page.evaluate(() => {
    const probe = window.__caseAnswerProbe;
    const result = { before: probe.before, after: probe.read(), calls: probe.calls, injectedHeight: probe.injectedHeight };
    probe.restore(); delete window.__caseAnswerProbe;
    return result;
  });
  // Keep coordinates and API calls in CI logs even when a following assertion fails.
  console.log(JSON.stringify({ caseAnswerGeometry: width, scenario: injectLayoutShift ? "injected-layout-80px" : "normal", ...measured }));
  assert.ok(measured.before?.trusted, `${width}: baseline must come from a trusted pointerdown`);
  assert.equal(measured.before.pointerType, "mouse");
  assert.equal(measured.after.questionId, measured.before.questionId, `${width}: the same question must remain visible`);
  assert.equal(measured.after.selected, true, `${width}: the physically clicked choice must be recorded`);
  const scrollDelta = measured.after.scrollY - measured.before.scrollY;
  const pageYDelta = measured.after.pageY - measured.before.pageY;
  const topDelta = measured.after.top - measured.before.top;
  assert.ok(Math.abs(topDelta) <= 2, `${width}: selected choice must stay in place (${measured.before.top} -> ${measured.after.top})`);
  assert.ok(Math.abs(scrollDelta - pageYDelta) <= 2,
    `${width}: scrolling must only track document layout movement (scroll ${scrollDelta}, pageY ${pageYDelta})`);
  assert.equal(measured.calls.filter(call => call.method === "scrollTo").length, 0, `${width}: answering must not call scrollTo`);
  assert.ok(measured.calls.filter(call => call.method === "scrollBy").length <= 2, `${width}: at most two minimal anchor corrections`);
  if (injectLayoutShift) {
    assert.equal(measured.injectedHeight, 80, "the synthetic answer-render layout shift must actually occur");
    assert.ok(Math.abs(pageYDelta - 80) <= 2, `synthetic choice document position must move 80px, got ${pageYDelta}`);
    assert.ok(measured.calls.some(call => call.method === "scrollBy"), "native anchoring is disabled: the app must correct this shift");
  }
  return { beforeAnswer: measured.before.scrollY, afterAnswer: measured.after.scrollY,
    beforeTop: measured.before.top, afterTop: measured.after.top, scrollDelta, pageYDelta, topDelta,
    scrollCalls: measured.calls, injectedHeight: measured.injectedHeight };
}
async function assertSourceConcealed(page) {
  assert.match(await page.locator("#sourceLabel").textContent(), /時間演習中・根拠条文と解説は終了後に表示/,
    "source articles and case-law summaries must not hint at answers during an attempt");
}
async function assertConcealed(page) {
  await assertSourceConcealed(page);
  const result = await page.evaluate(() => ({
    answer: document.querySelector("#correctAnswer")?.textContent || "",
    reasons: document.querySelectorAll(".reiwa-all-explanations, .verdict-board, .cut-list").length,
    feedback: document.querySelector("#feedbackBox")?.textContent || "",
    explainHidden: document.querySelector("#dockExplainButton")?.hidden &&
      getComputedStyle(document.querySelector("#dockExplainButton")).display === "none"
  }));
  assert.equal(result.answer, "", "no correct-answer leak before completion");
  assert.equal(result.reasons, 0, "no choice reasons before completion");
  assert.equal(result.explainHidden, true, "no explanation action before completion");
  assert.match(result.feedback, /正誤・正解肢・解説は50問終了後/);
}
async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const output = path.join(__dirname, "output", "playwright", "case52");
  fs.mkdirSync(output, { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP" });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(`${baseUrl}?review=case-ui`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.TAKKEN_CASE_EXAM_BANK));
    const questions = await page.evaluate(() => window.TAKKEN_CASE_EXAM_BANK.forms[0].questions.map(q => ({ id: q.id, answer: q.answer })));
    await page.locator("#mockCaseButton").evaluate(button => button.click());
    await waitId(page, questions[0].id);
    assert.match(await page.locator("#dailyQuestTitle").textContent(), /事例実戦A.*1\s*\/\s*50/);
    assert.equal(await page.locator("#choices button").count(), 4);
    await assertSourceConcealed(page);
    await page.screenshot({ path: path.join(output, "first-390.png"), fullPage: false });
    await page.locator("#choices button").nth(questions[0].answer).click();
    await assertConcealed(page);
    await page.locator("#dockNextButton").click(); await waitId(page, questions[1].id);
    await page.reload({ waitUntil: "domcontentloaded" }); await waitId(page, questions[1].id);
    for (let index = 1; index < 50; index++) {
      await page.locator("#choices button").nth(index === 1 ? (questions[index].answer + 1) % 4 : questions[index].answer).click();
      await assertConcealed(page);
      await page.locator("#dockNextButton").click();
      if (index < 49) await waitId(page, questions[index + 1].id);
    }
    await page.locator(".mock-results").waitFor();
    assert.equal(await page.locator("#quizCard > .quiz-meta").isVisible(), false, "completed mock must hide the old question header");
    assert.match(await page.locator(".mock-score-hero strong").textContent(), /49\s*\/\s*50/);
    assert.match(await page.locator(".mock-evidence-note").first().textContent(), /難易度|換算/);
    assert.doesNotMatch(await page.locator(".mock-score-hero").textContent(), /演習安全圏\d/);
    assert.equal(await page.locator("#mockOtherButton").count(), 0, "a sole case form must not be advertised as an alternate");
    assert.equal(await page.locator("#mockRetryButton").isVisible(), true, "same-form retry remains explicit");
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageId);
    assert.equal(saved.mock.results.length, 50);
    assert.equal(saved.mockHistory.at(-1).score, 49);
    assert.ok(Object.keys(saved.marked).length > 0, "case wrong answer must register base review");
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.match(await page.locator(".mock-score-hero strong").textContent(), /49\s*\/\s*50/);
    assert.equal(await page.locator("#quizCard > .quiz-meta").isVisible(), false, "result reload must not reveal initial 1/100 metadata");
    assert.equal(await page.locator("#mockOtherButton").count(), 0, "reload must not restore a duplicate alternate action");
    await page.locator(".mock-score-hero").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "results-390.png"), fullPage: false });
    const beforeOfficial = await page.evaluate(key => {
      const save = JSON.parse(localStorage.getItem(key));
      return { session: save.officialExamSession, exposure: save.officialExamExposure, history: save.officialExamHistory };
    }, storageId);
    await page.locator("#mockOfficialExamButton").click();
    assert.equal(await page.locator("#passPlanPanel").evaluate(panel => panel.open), true, "official navigation must open its parent panel");
    assert.equal(await page.locator(".official-ledger").evaluate(panel => panel.open), true, "official navigation must open the ledger");
    await page.waitForFunction(() => document.activeElement?.id ===
      (document.querySelector("#officialExamStartButton")?.disabled ? "officialExamId" : "officialExamStartButton"));
    await page.locator("#officialExamStartButton").waitFor({ state: "visible" });
    const afterOfficial = await page.evaluate(key => {
      const save = JSON.parse(localStorage.getItem(key));
      return { session: save.officialExamSession, exposure: save.officialExamExposure, history: save.officialExamHistory };
    }, storageId);
    assert.deepEqual(afterOfficial, beforeOfficial, "opening official measurement must not start a session or record exposure");
    await page.locator("#officialExamStartButton").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "official-navigation-390.png"), fullPage: false });
    // Seed only this isolated review profile, never the learner's browser/save.
    await page.evaluate(key => {
      const save = JSON.parse(localStorage.getItem(key));
      const ids = window.TAKKEN_EXAM_BLUEPRINT.mockForms.find(f => f.id === "form-a").ids;
      const questions = window.TAKKEN_EXAM_QUESTIONS;
      save.runMode = "mock"; save.answered = null; save.finished = true;
      save.mock = { formId: "form-a", examProfile: "general", position: 49,
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), elapsedMs: 37986000, finalized: true,
        results: ids.map((id, i) => ({ id, selected: [3,4,5,49].includes(i) ? (questions[id].answer + 1) % 4 : questions[id].answer,
          correct: ![3,4,5,49].includes(i), sectionId: i < 14 ? "rights" : i < 22 ? "restrictions" : i < 25 ? "tax" : i < 45 ? "business" : "other" })) };
      localStorage.setItem(key, JSON.stringify(save));
    }, storageId);
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.match(await page.locator(".mock-score-hero strong").textContent(), /46\s*\/\s*50/);
    assert.equal(await page.locator("#quizCard > .quiz-meta").isVisible(), false, "legacy results must hide stale question metadata too");
    assert.match(await page.locator(".mock-score-hero").textContent(), /基礎・既習命題/);
    assert.match(await page.locator(".mock-result-meta").textContent(), /中断を含む/);
    assert.match(await page.locator("#mockOtherButton").textContent(), /事例実戦A/);
    // Start the new form from old results; test headers/choices stay in bounds.
    await page.locator("#mockOtherButton").click(); await waitId(page, questions[0].id);
    assert.equal(await page.locator("#quizCard > .quiz-meta").isVisible(), true, "starting a new attempt must restore its question header");
    const geometry = [];
    for (const width of [320, 390, 480, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await settleFrames(page);
      const answerGeometry = await clickChoiceWithGeometry(page, questions[0].answer, width);
      await page.locator("#dockNextButton").click(); await waitId(page, questions[1].id);
      await assertSourceConcealed(page);
      await page.waitForTimeout(350);
      const bounds = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        header: document.querySelector("#roundLabel").getBoundingClientRect().top,
        question: document.querySelector("#questionText").getBoundingClientRect().top
      }));
      assert.ok(bounds.overflow <= 1, `${width}: horizontal overflow`);
      assert.ok(bounds.header >= 0 && bounds.header < 450, `${width}: next question header visible`);
      geometry.push({ width, ...answerGeometry, ...bounds });
      await page.screenshot({ path: path.join(output, `next-${width}.png`), fullPage: false });
      page.once("dialog", dialog => dialog.accept());
      await page.locator("#mockCaseButton").evaluate(button => button.click()); await waitId(page, questions[0].id);
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await settleFrames(page);
    const syntheticLayout = await clickChoiceWithGeometry(page, questions[0].answer, 320, true);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "ok", score: 49, legacyScore: 46, resume: true, sourceReview: true,
      sourceHintsConcealed: true, officialNavigationOnly: true, geometry, syntheticLayout, screenshots: output }));
    await context.close();
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
