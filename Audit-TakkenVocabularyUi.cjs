#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function staticServer(root) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = path.resolve(root, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) { response.writeHead(403).end(); return; }
    fs.readFile(target, (error, body) => {
      if (error) { response.writeHead(404).end(); return; }
      response.writeHead(200, { "content-type": types[path.extname(target)] || "application/octet-stream", "cache-control": "no-store" });
      response.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ baseUrl: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(done => server.close(done)) }));
  });
}
const saved = (page, key) => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), key);
async function shown(page, key) {
  return page.evaluate(storageKey => {
    const drill = JSON.parse(localStorage.getItem(storageKey)).practicalDrill;
    const id = drill.queue[drill.position];
    const question = (drill.presentationOverrides?.[id] || drill.presentationKey).startsWith("meaning2:") ? window.TAKKEN_VOCABULARY_BANK.MEANING_QUESTIONS_BY_ID[id] : window.TAKKEN_VOCABULARY_BANK.QUESTIONS_BY_ID[id];
    const order = window.TAKKEN_BUSINESS_MASTERY.choiceOrder(id, drill.presentationOverrides?.[id] || drill.presentationKey, 4);
    return { id, term: question.term, text: question.text, reading: question.reading || "", meaning: question.meaning,
      answer: order.indexOf(question.answer), choices: order.map(index => question.choices[index]), topicId: question.unitId,
      reasons: order.map(index => question.sourceFacts[index].reason) };
  }, key);
}
async function answer(page, key, result = "confident") {
  const question = await shown(page, key);
  await page.locator(".practical-drill-choice").nth(result === "confident" ? question.answer : (question.answer + 1) % 4).click();
  await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
  if (result !== "confident") {
    assert.equal((await saved(page, key)).practicalDrill.currentAttempt.correct, false);
    assert.ok((await page.locator("#practicalDrillReasoning").textContent()).includes(question.reasons[(question.answer + 1) % 4]), "wrong answer must identify the selected confused term");
  }
  await page.locator("#practicalDrillNextButton").click();
  return question;
}

function mainEvidence(state) {
  return {
    attempts: state.attempts, correct: state.correct, index: state.index, questionStats: state.questionStats,
    daily: state.daily, questClaims: state.questClaims, missionLog: state.missionLog,
    officialExamExposure: state.officialExamExposure, officialExamHistory: state.officialExamHistory,
    officialExamSession: state.officialExamSession, mock: state.mock, mockHistory: state.mockHistory,
    calculationDrill: state.calculationDrill,
    businessHistory: Object.fromEntries(Object.entries(state.practicalDrill.history).filter(([id]) => !id.startsWith("vocab-")))
  };
}
async function main() {
  const server = process.env.TAKKEN_BASE_URL ? { baseUrl: process.env.TAKKEN_BASE_URL, close: async () => {} } : await staticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  let expectingExpansionFailure = false, expansionFailures = 0;
  const output = path.join(process.cwd(), "output", "playwright", "vocabulary");
  fs.mkdirSync(output, { recursive: true });
  let fixtures = 0, checks = 0;
  async function fixture() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage();
    page.on("pageerror", error => {
      if (expectingExpansionFailure && error.message === "Vocabulary expansion is missing or incomplete") expansionFailures++;
      else errors.push(String(error));
    });
    const review = `vocab${++fixtures}${Date.now().toString(36)}`;
    const key = `takken-battle-study-clean-v2-hard-review-${review}`;
    const url = new URL(server.baseUrl); url.searchParams.set("review", review); url.searchParams.set("today", "1");
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    await page.locator("#vocabularyTopic option").first().waitFor({ state: "attached" });
    return { context, page, key };
  }
  try {
    const { context, page, key } = await fixture();
    const total = await page.evaluate(() => window.TAKKEN_VOCABULARY_BANK.QUESTIONS.length);
    await page.locator(".vocabulary-settings").evaluate(node => { node.open = true; });
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.locator("#vocabularyPanel").evaluate(panel => ({
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        heights: [...panel.querySelectorAll("button, select, summary")].filter(node => node.getBoundingClientRect().height > 0).map(node => node.getBoundingClientRect().height),
        wide: [...panel.querySelectorAll("select")].some(node => node.getBoundingClientRect().width > panel.getBoundingClientRect().width)
      }));
      assert.equal(layout.overflow, 0, `${width}px horizontal overflow`);
      assert.equal(layout.wide, false);
      assert.ok(layout.heights.every(height => height >= 44), `${width}px tap targets`);
      await page.locator("#vocabularyPanel").screenshot({ path: path.join(output, `launcher-${width}.png`) });
      checks++;
    }
    const priorityIds = await page.evaluate(storageKey => {
      const state = JSON.parse(localStorage.getItem(storageKey));
      const [wrong, due] = window.TAKKEN_VOCABULARY_BANK.QUESTIONS;
      state.practicalDrill.history[wrong.id] = { attempts: 2, correct: 0, wrong: 2, lastConfidence: "wrong", lastAnsweredAt: "2026-09-20T09:00:00+09:00" };
      state.practicalDrill.history[due.id] = { attempts: 1, correct: 1, wrong: 0, lastCorrect: true, lastConfidence: "confident", lastAnsweredAt: "2026-09-20T09:00:00+09:00" };
      state.practicalDrill.attempts = 3;
      state.practicalDrill.correctAttempts = 1;
      localStorage.setItem(storageKey, JSON.stringify(state));
      return { wrong: wrong.id, due: due.id };
    }, key);
    await page.reload({ waitUntil: "networkidle" });
    const baseline = mainEvidence(await saved(page, key));
    await page.locator("#vocabularyStart").click();
    let drill = (await saved(page, key)).practicalDrill;
    assert.equal(drill.bankId, "vocabulary");
    assert.equal(drill.scope, "vocabulary");
    assert.equal(drill.queue.length, 10);
    assert.equal(new Set(drill.queue).size, 10);
    assert.deepEqual(drill.queue.slice(0, 2), [priorityIds.wrong, priorityIds.due], "unresolved misconception precedes a due item and untouched meanings");
    assert.equal(await page.locator(".practical-drill-choice:enabled").count(), 4);
    assert.equal(await page.locator("#practicalDrillForecast").isVisible(), false);
    assert.equal(await page.locator("#practicalConfidenceHint").isVisible(), false);
    const first = await shown(page, key);
    assert.equal(await page.locator("#practicalDrillPrompt").textContent(), "「" + first.term + "」の意味は？", "only a term-to-meaning prompt, no scenario");
    assert.deepEqual(await page.locator(".practical-drill-choice").allTextContents(), first.choices.map((text, index) => (index + 1) + ". " + text));
    assert.equal(await page.locator("#practicalDrillFeedback").isVisible(), false);
    assert.equal(await page.locator("#vocabularyReveal, #vocabularyKnown, #vocabularyAgain").count(), 0, "no subjective flashcard grading");
    const beforeReveal = (await saved(page, key)).practicalDrill;
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
      assert.ok((await page.locator(".practical-drill-choice").evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().height))).every(height => height >= 44));
      await page.locator("#practicalDrillSession").screenshot({ path: path.join(output, 'question-before-answer-' + width + '.png') });
    }
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual((await saved(page, key)).practicalDrill, beforeReveal, "unanswered reload does not grant a correct answer");
    const again = await answer(page, key, "uncertain");
    assert.equal((await saved(page, key)).practicalDrill.position, 1, "objective answer advances only through Next");
    const unsure = await answer(page, key, "uncertain");
    const beforeReload = (await saved(page, key)).practicalDrill;
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual((await saved(page, key)).practicalDrill, beforeReload, "history, queue and retries survive reload");
    await page.locator("#practicalDrillCancelButton").click();
    await page.locator("#vocabularyStart").click();
    assert.deepEqual((await saved(page, key)).practicalDrill, beforeReload, "pause/resume keeps the current term");
    while ((await saved(page, key)).practicalDrill.stage === "active") await answer(page, key);
    drill = (await saved(page, key)).practicalDrill;
    assert.equal(drill.stage, "retry");
    assert.deepEqual([...drill.queue].sort(), [again.id, unsure.id].sort());
    await answer(page, key, "uncertain");
    while ((await saved(page, key)).practicalDrill.stage === "retry") await answer(page, key);
    const completed = await saved(page, key);
    assert.equal(completed.stateSchemaVersion, 19);
    assert.equal(completed.practicalDrill.history[again.id].overconfidentWrong || 0, 0, "objective grading is not a confidence prediction");
    assert.equal(completed.practicalDrill.history[again.id].wrong, 4, "two new objectively wrong selections are added to the preserved two wrong answers");
    assert.match(await page.locator("#practicalDrillCompleteText").textContent(), /通常問題や模試の得点には算入しません/);
    assert.equal(await page.locator("#vocabularyRetained").textContent(), '0 / ' + total);
    assert.deepEqual(mainEvidence(completed), baseline, "vocabulary cannot advance daily/official/mock evidence");
    assert.equal(completed.practicalDrill.attempts, Object.values(completed.practicalDrill.history).reduce((sum, item) => sum + item.attempts, 0));
    await page.locator("#practicalDrillComplete").screenshot({ path: path.join(output, "completion-320.png") });
    checks++;

    await page.locator("#practicalDrillChangeButton").click();
    await page.locator("#vocabularyMode").selectOption("topic");
    const topicId = await page.locator("#vocabularyTopic").inputValue();
    await page.locator("#vocabularySize").selectOption("20");
    await page.locator("#vocabularyCustomStart").click();
    drill = (await saved(page, key)).practicalDrill;
    assert.equal(drill.vocabularyPreset.mode, "topic");
    assert.equal(drill.unitId, topicId);
    assert.ok(await page.evaluate(({ key, topicId }) => JSON.parse(localStorage.getItem(key)).practicalDrill.queue.every(id => window.TAKKEN_VOCABULARY_BANK.QUESTIONS_BY_ID[id].unitId === topicId), { key, topicId }));
    while (["active", "retry"].includes((await saved(page, key)).practicalDrill.stage)) { await answer(page, key); }
    await page.locator("#practicalDrillRestartButton").click();
    assert.equal((await saved(page, key)).practicalDrill.unitId, topicId, "restart keeps its topic");
    page.once("dialog", dialog => dialog.dismiss());
    const beforeDiscard = (await saved(page, key)).practicalDrill;
    await page.locator("#practicalDrillDiscardButton").click();
    assert.deepEqual((await saved(page, key)).practicalDrill, beforeDiscard, "dismissed discard retains exact session");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#practicalDrillDiscardButton").click();
    await page.locator(".vocabulary-settings").evaluate(node => { node.open = true; });
    await page.locator("#vocabularyMode").selectOption("all");
    await page.locator("#vocabularySize").selectOption("all");
    await page.locator("#vocabularyCustomStart").click();
    assert.equal((await saved(page, key)).practicalDrill.sessionIds.length, total);
    const reviewed = new Set();
    while (["active", "retry"].includes((await saved(page, key)).practicalDrill.stage)) {
      const item = await shown(page, key);
      assert.equal(await page.locator("#practicalDrillPrompt").textContent(), item.text);
      if (item.reading) assert.ok((await page.locator("#practicalDrillUnit").textContent()).includes(item.reading), "difficult readings are visible");
      assert.equal(await page.locator("#practicalDrillFeedback").isVisible(), false, "no definition or distinction is exposed before an answer");
      assert.deepEqual(await page.locator(".practical-drill-choice").allTextContents(), item.choices.map((text, index) => (index + 1) + ". " + text));
      assert.equal(new Set(item.choices).size, 4);
      await page.locator(".practical-drill-choice").nth(item.answer).click();
      assert.equal((await saved(page, key)).practicalDrill.currentAttempt.correct, true);
      assert.equal((await saved(page, key)).practicalDrill.currentAttempt.predictedConfidence, "", "no subjective confidence is invented");
      assert.equal(await page.locator("#practicalDrillReasoning .vocabulary-meaning").textContent(), item.term + "：" + item.meaning);
      if (reviewed.size === 0) {
        for (const width of [390, 320]) {
          await page.setViewportSize({ width, height: 844 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
          await page.locator("#practicalDrillSession").screenshot({ path: path.join(output, 'answer-' + width + '.png') });
        }
      }
      reviewed.add(item.id);
      await page.locator("#practicalDrillNextButton").click();
    }
    assert.equal(reviewed.size, 158, "all 158 terms must actually render and score as meaning choices");
    await page.locator("#practicalDrillRestartButton").click();
    checks++;

    // PR78's schema18/bank1 meaning edition must retain both answered and
    // unanswered sessions byte-for-byte in its pre-upgrade backup.
    for (const answered of [false, true]) {
      const old = await fixture();
      await old.page.locator(".vocabulary-settings").evaluate(node => { node.open = true; });
      await old.page.locator("#vocabularyMode").selectOption("topic");
      await old.page.locator("#vocabularyTopic").selectOption("vocab-language");
      await old.page.locator("#vocabularyCustomStart").click();
      if (answered) {
        const question = await shown(old.page, old.key);
        await old.page.locator(".practical-drill-choice").nth((question.answer + 1) % 4).click();
      }
      const prior = await old.page.evaluate(key => {
        const state = JSON.parse(localStorage.getItem(key));
        state.stateSchemaVersion = 18; state.practicalDrill.bankVersion = 1;
        const raw = JSON.stringify(state); localStorage.setItem(key, raw);
        return { raw, drill: state.practicalDrill };
      }, old.key);
      await old.page.reload({ waitUntil: "networkidle" });
      const migrated = await saved(old.page, old.key);
      assert.equal(migrated.stateSchemaVersion, 19);
      assert.equal(migrated.practicalDrill.bankVersion, 2);
      for (const field of ["queue", "sessionIds", "retryIds", "history", "currentAttempt", "position", "presentationKey", "attempts", "correctAttempts"]) {
        assert.deepEqual(migrated.practicalDrill[field], prior.drill[field], "additive upgrade preserves " + field);
      }
      assert.equal(await old.page.evaluate(key => localStorage.getItem(key + "-before-upgrade-v18-to-v19"), old.key), prior.raw);
      assert.equal(await old.page.locator("#practicalDrillFeedback").isVisible(), answered);
      await old.context.close(); checks++;
    }
    for (const [topic, count] of [["vocab-rights-hard", 31], ["vocab-business-hard", 16], ["vocab-restrictions-hard", 21], ["vocab-tax-other", 26]]) {
      const item = await fixture();
      await item.page.locator(".vocabulary-settings").evaluate(node => { node.open = true; });
      await item.page.locator("#vocabularyMode").selectOption("topic");
      await item.page.locator("#vocabularyTopic").selectOption(topic);
      await item.page.locator("#vocabularySize").selectOption("all");
      await item.page.locator("#vocabularyCustomStart").click();
      const session = (await saved(item.page, item.key)).practicalDrill;
      assert.equal(session.sessionIds.length, count);
      const question = await shown(item.page, item.key);
      assert.equal(question.topicId, topic);
      assert.ok((await item.page.locator("#practicalDrillUnit").textContent()).includes(question.reading));
      await item.page.locator("#practicalDrillSession").screenshot({ path: path.join(output, topic + "-390.png") });
      await answer(item.page, item.key, "wrong");
      assert.ok((await saved(item.page, item.key)).practicalDrill.retryIds.includes(question.id));
      await item.page.reload({ waitUntil: "networkidle" });
      assert.ok((await saved(item.page, item.key)).practicalDrill.retryIds.includes(question.id));
      await item.context.close(); checks++;
    }
    const raw = await page.evaluate(storageKey => localStorage.getItem(storageKey), key);
    const partialBank = await page.evaluate(() => `window.TAKKEN_VOCABULARY_BANK=${JSON.stringify({
      ...window.TAKKEN_VOCABULARY_BANK, QUESTIONS: window.TAKKEN_VOCABULARY_BANK.QUESTIONS.slice(0, -1)
    })};`);
    const oldBank = await page.evaluate(() => { const { CARDS_BY_ID, ...legacy } = window.TAKKEN_VOCABULARY_BANK; return `window.TAKKEN_VOCABULARY_BANK=${JSON.stringify(legacy)};`; });
    for (const body of [oldBank, "", 'window.TAKKEN_VOCABULARY_BANK={VERSION:1,LEGAL_BASELINE:"2026-04-01",QUESTIONS:[{id:"vocab-001"}],TOPICS:[{id:"bad",label:"bad"}]};', partialBank]) {
      await page.route("**/vocabulary-bank.js*", route => route.fulfill({ status: 200, contentType: "text/javascript", body }));
      await page.reload({ waitUntil: "networkidle" });
      await page.locator("#bankLoadRecovery").waitFor({ state: "visible" });
      assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), key), raw, "missing/corrupt bank preserves raw queue");
      await page.unroute("**/vocabulary-bank.js*");
      checks++;
    }
    expectingExpansionFailure = true;
    await page.route("**/vocabulary-expansion-data.js*", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#bankLoadRecovery").waitFor({ state: "visible" });
    assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), key), raw, "missing expansion never normalizes away saved IDs");
    assert.equal(expansionFailures, 1, "the expected dependency error is diagnosed explicitly");
    await page.unroute("**/vocabulary-expansion-data.js*");
    expectingExpansionFailure = false;
    checks++;
    await context.close();

    // Published schema18 answers retain their old displayed choices without changing
    // their old answer/confidence counts or charging another attempt.
    for (const confidence of ["confident", "uncertain", "wrong"]) {
      const old = await fixture();
      await old.page.locator("#vocabularyStart").click();
      await old.page.evaluate(({ key, confidence }) => {
        const state = JSON.parse(localStorage.getItem(key));
        const d = state.practicalDrill;
        state.stateSchemaVersion = 18;
        d.bankVersion = 1;
        d.sessionIds = window.TAKKEN_VOCABULARY_BANK.QUESTION_IDS.slice(0, 10);
        d.queue = d.sessionIds.slice();
        d.presentationKey = d.presentationKey.replace(/^meaning2:/, "");
        const id = d.queue[0];
        const q = window.TAKKEN_VOCABULARY_BANK.QUESTIONS_BY_ID[id];
        const order = window.TAKKEN_BUSINESS_MASTERY.choiceOrder(id, d.presentationKey, 4);
        const correct = confidence !== "wrong";
        const selected = correct ? order.indexOf(q.answer) : (order.indexOf(q.answer) + 1) % 4;
        d.currentAttempt = { id, selected, correct, confidence, predictedConfidence: "confident", diagnosticRecorded: false, masteryRecorded: false };
        d.history[id] = { attempts: 4, correct: correct ? 4 : 3, wrong: correct ? 0 : 1, uncertain: confidence === "uncertain" ? 1 : 0,
          lastSelected: selected, lastCorrect: correct, lastConfidence: confidence, lastPredictedConfidence: "confident", lastAnsweredAt: new Date().toISOString() };
        d.attempts = 4; d.correctAttempts = correct ? 4 : 3;
        if (confidence !== "confident") d.retryIds.push(id);
        localStorage.setItem(key, JSON.stringify(state));
      }, { key: old.key, confidence });
      await old.page.reload({ waitUntil: "networkidle" });
      const prior = (await saved(old.page, old.key)).practicalDrill;
      assert.equal(await old.page.locator("#practicalDrillReasoning .vocabulary-meaning").isVisible(), true);
      assert.equal(await old.page.locator(".practical-drill-choice:enabled").count(), 0);
      const legacyQuestion = await shown(old.page, old.key);
      assert.deepEqual(await old.page.locator(".practical-drill-choice").allTextContents(), legacyQuestion.choices.map((text, index) => (index + 1) + ". " + text));
      await old.page.locator("#practicalDrillNextButton").click();
      const after = (await saved(old.page, old.key)).practicalDrill;
      assert.equal(after.position, 1);
      assert.ok(after.presentationKey.startsWith("meaning2:"), "next term upgrades to the new meaning choices");
      assert.equal(after.attempts, prior.attempts);
      assert.equal(after.history[prior.queue[0]].attempts, 4);
      assert.equal(after.history[prior.queue[0]].lastConfidence, confidence);
      await old.context.close(); checks++;
    }
    for (const failAt of [1, 2]) {
      const broken = await fixture();
      await broken.page.locator("#vocabularyStart").click();
      const question = await shown(broken.page, broken.key);
      const prior = (await saved(broken.page, broken.key)).practicalDrill;
      await broken.page.evaluate(({ key, failAt }) => {
        const original = Storage.prototype.setItem;
        let writes = 0;
        window.restoreVocabularyWrites = () => { Storage.prototype.setItem = original; };
        Storage.prototype.setItem = function(name, value) {
          if (name === key && ++writes === failAt) throw new DOMException("synthetic quota failure", "QuotaExceededError");
          return original.call(this, name, value);
        };
      }, { key: broken.key, failAt });
      await broken.page.locator(".practical-drill-choice").nth(question.answer).click();
      if (failAt === 2) await broken.page.locator("#practicalDrillNextButton").click();
      await broken.page.locator("#practicalDrillSaveError").waitFor({ state: "visible" });
      const failed = (await saved(broken.page, broken.key)).practicalDrill;
      assert.equal(failed.position, prior.position, "failed position write must retain the current card");
      assert.equal(failed.attempts, prior.attempts + (failAt === 2 ? 1 : 0));
      await broken.page.evaluate(() => window.restoreVocabularyWrites());
      if (failAt === 1) {
        await broken.page.locator(".practical-drill-choice").nth(question.answer).click();
        await broken.page.locator("#practicalDrillNextButton").click();
      }
      else {
        await broken.page.reload({ waitUntil: "networkidle" });
        await broken.page.locator("#practicalDrillNextButton").click();
      }
      const recovered = (await saved(broken.page, broken.key)).practicalDrill;
      assert.equal(recovered.position, 1);
      assert.equal(recovered.history[prior.queue[0]].attempts, 1, "recovery must not double-count the scored selection");
      await broken.context.close(); checks++;
    }
    const ungraded = await fixture();
    await ungraded.page.locator("#vocabularyStart").click();
    await ungraded.page.evaluate(key => {
      const state = JSON.parse(localStorage.getItem(key));
      state.practicalDrill.presentationKey = state.practicalDrill.presentationKey.replace(/^meaning2:/, "");
      localStorage.setItem(key, JSON.stringify(state));
    }, ungraded.key);
    const beforeUpgrade = (await saved(ungraded.page, ungraded.key)).practicalDrill;
    await ungraded.page.reload({ waitUntil: "networkidle" });
    const afterUpgrade = (await saved(ungraded.page, ungraded.key)).practicalDrill;
    assert.deepEqual(afterUpgrade.queue, beforeUpgrade.queue, "unanswered old flashcard queue is retained");
    assert.deepEqual(afterUpgrade.history, beforeUpgrade.history);
    assert.equal(afterUpgrade.attempts, beforeUpgrade.attempts);
    assert.ok(afterUpgrade.presentationKey.startsWith("meaning2:"));
    assert.equal(await ungraded.page.locator(".practical-drill-choice:enabled").count(), 4);
    await ungraded.context.close(); checks++;
    const legacy = await fixture();
    await legacy.page.evaluate(storageKey => {
      const state = JSON.parse(localStorage.getItem(storageKey));
      const question = window.TAKKEN_PRACTICAL_VARIATIONS.QUESTIONS[0];
      state.stateSchemaVersion = 17;
      state.practicalDrill = { ...state.practicalDrill, bankId: "legacy-practical", bankVersion: 2, stage: "active", scope: "business", sessionSize: 1, sessionIds: [question.id], queue: [question.id], position: 0, currentAttempt: null,
        history: { [question.id]: { attempts: 3, correct: 2, wrong: 1, lastConfidence: "wrong", lastAnsweredAt: "2026-09-20T00:00:00Z" } }, attempts: 3, correctAttempts: 2 };
      localStorage.setItem(storageKey, JSON.stringify(state));
    }, legacy.key);
    await legacy.page.reload({ waitUntil: "networkidle" });
    const migrated = await saved(legacy.page, legacy.key);
    assert.equal(migrated.stateSchemaVersion, 19);
    assert.equal(Object.values(migrated.practicalDrill.history)[0].attempts, 3, "schema17 existing history survives migration");
    await legacy.page.locator("#vocabularyStart").click();
    assert.deepEqual((await saved(legacy.page, legacy.key)).practicalDrill, migrated.practicalDrill, "vocab action resumes another unfinished drill");
    assert.equal(await legacy.page.locator("#practicalDrillPanel").evaluate(node => node.open), true);
    await legacy.context.close();
    checks++;
    const calculation = await fixture();
    await calculation.page.locator("#calculationDrillPanel").evaluate(node => { node.open = true; });
    await calculation.page.locator("#calculationDrillResetButton").click();
    const calculating = await saved(calculation.page, calculation.key);
    await calculation.page.locator("#vocabularyStart").click();
    const afterCalculationResume = await saved(calculation.page, calculation.key);
    assert.deepEqual(afterCalculationResume.calculationDrill, calculating.calculationDrill, "vocabulary must preserve unfinished calculation answers");
    assert.deepEqual(afterCalculationResume.practicalDrill, calculating.practicalDrill, "vocabulary must not open a competing drill while calculation is active");
    assert.equal(await calculation.page.locator("#calculationDrillPanel").evaluate(node => node.open), true);
    await calculation.context.close();
    checks++;
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "ok", checks, questions: total, schema: 19, viewports: [1280, 390, 320], termOnly: true, meaningChoices: 4, objectiveGrading: true, renderedTerms: 158, reload: true, topicRestart: true, legacyFourChoiceCompatible: true, failedGradeAndAdvanceProtected: true, otherSessionPreserved: true, missingBankProtected: true, examEvidenceUnchanged: true }));
  } finally { await browser.close(); await server.close(); }
}
main().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });
