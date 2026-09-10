"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const baseUrl = process.env.TAKKEN_BASE_URL || "http://127.0.0.1:8784/";
const storageId = "takken-battle-study-clean-v2-hard-review-case-ui";
const waitId = (page, id) => page.waitForFunction(value => document.querySelector("#quizCard")?.dataset.questionId === value, id);
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
    assert.match(await page.locator(".mock-score-hero").textContent(), /基礎・既習命題/);
    assert.match(await page.locator(".mock-result-meta").textContent(), /中断を含む/);
    assert.match(await page.locator("#mockOtherButton").textContent(), /事例実戦A/);
    // Start the new form from old results; test headers/choices stay in bounds.
    await page.locator("#mockOtherButton").click(); await waitId(page, questions[0].id);
    const geometry = [];
    for (const width of [320, 390, 480, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const choice = page.locator("#choices button").nth(questions[0].answer);
      await choice.scrollIntoViewIfNeeded();
      const beforeAnswer = await page.evaluate(() => scrollY);
      await choice.click();
      await assertConcealed(page);
      const afterAnswer = await page.evaluate(() => scrollY);
      assert.ok(Math.abs(afterAnswer - beforeAnswer) <= 3, `${width}: answering must not force a page jump (${beforeAnswer} -> ${afterAnswer})`);
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
      geometry.push({ width, beforeAnswer, afterAnswer, ...bounds });
      await page.screenshot({ path: path.join(output, `next-${width}.png`), fullPage: false });
      page.once("dialog", dialog => dialog.accept());
      await page.locator("#mockCaseButton").evaluate(button => button.click()); await waitId(page, questions[0].id);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "ok", score: 49, legacyScore: 46, resume: true, sourceReview: true,
      sourceHintsConcealed: true, officialNavigationOnly: true, geometry, screenshots: output }));
    await context.close();
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
