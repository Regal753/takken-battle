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
    const question = window.TAKKEN_VOCABULARY_BANK.QUESTIONS_BY_ID[id];
    const order = window.TAKKEN_BUSINESS_MASTERY.choiceOrder(id, drill.presentationOverrides?.[id] || drill.presentationKey, 4);
    return { id, answer: order.indexOf(question.answer), choices: order.map(index => question.choices[index]), topicId: question.unitId };
  }, key);
}
async function answer(page, key, confidence = "confident", wrong = false) {
  const question = await shown(page, key);
  await page.locator(`[data-practical-forecast="${confidence}"]`).click();
  await page.locator(".practical-drill-choice").nth(wrong ? (question.answer + 1) % 4 : question.answer).click();
  await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
  return question;
}
const next = page => page.locator("#practicalDrillNextButton").click();
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
  const output = path.join(process.cwd(), "output", "playwright", "vocabulary");
  fs.mkdirSync(output, { recursive: true });
  let fixtures = 0, checks = 0;
  async function fixture() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(String(error)));
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
    assert.equal(await page.locator(".practical-drill-choice:disabled").count(), 4);
    assert.equal(await page.locator('[data-practical-forecast="confident"]').textContent(), "意味を言える");
    assert.equal(await page.locator('[data-practical-forecast="uncertain"]').textContent(), "迷い");
    assert.equal(await page.locator('[data-practical-forecast="guess"]').textContent(), "勘");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#practicalDrillSession").screenshot({ path: path.join(output, "question-before-answer-390.png") });
    await page.setViewportSize({ width: 320, height: 900 });
    const wrong = await answer(page, key, "confident", true);
    assert.equal(await page.locator(".practical-statement-review-card").count(), 4, "all four meanings need reasons");
    assert.ok(await page.locator("#practicalDrillSources a").count() > 0);
    await page.locator("#practicalDrillSession").screenshot({ path: path.join(output, "answer-320.png") });
    await next(page);
    const unsure = await answer(page, key, "uncertain");
    await next(page);
    const guess = await answer(page, key, "guess");
    const beforeReload = (await saved(page, key)).practicalDrill;
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual((await saved(page, key)).practicalDrill, beforeReload, "answer, confidence, queue and retry survive reload");
    await page.locator("#practicalDrillCancelButton").click();
    await page.locator("#vocabularyStart").click();
    assert.deepEqual((await saved(page, key)).practicalDrill, beforeReload, "pause/resume must not restart");
    await next(page);
    while ((await saved(page, key)).practicalDrill.stage === "active") { await answer(page, key); await next(page); }
    drill = (await saved(page, key)).practicalDrill;
    assert.equal(drill.stage, "retry");
    assert.deepEqual([...drill.queue].sort(), [wrong.id, unsure.id, guess.id].sort());
    const originals = { [wrong.id]: wrong, [unsure.id]: unsure, [guess.id]: guess };
    while ((await saved(page, key)).practicalDrill.stage === "retry") {
      const retry = await shown(page, key);
      assert.notEqual(retry.answer, originals[retry.id].answer, "retry must move the correct choice");
      await answer(page, key); await next(page);
    }
    const completed = await saved(page, key);
    assert.equal(completed.stateSchemaVersion, 18);
    assert.equal(completed.practicalDrill.history[wrong.id].overconfidentWrong, 1);
    assert.equal(completed.practicalDrill.history[guess.id].guessAnswers, 1);
    assert.match(await page.locator("#practicalDrillCompleteText").textContent(), /通常問題や模試の得点には算入しません/);
    assert.equal(await page.locator("#vocabularyRetained").textContent(), `0 / ${total}`);
    assert.deepEqual(mainEvidence(completed), baseline, "vocabulary must not advance daily/subject/official/mock evidence");
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
    while (["active", "retry"].includes((await saved(page, key)).practicalDrill.stage)) { await answer(page, key); await next(page); }
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
    checks++;

    const raw = await page.evaluate(storageKey => localStorage.getItem(storageKey), key);
    const partialBank = await page.evaluate(() => `window.TAKKEN_VOCABULARY_BANK=${JSON.stringify({
      ...window.TAKKEN_VOCABULARY_BANK, QUESTIONS: window.TAKKEN_VOCABULARY_BANK.QUESTIONS.slice(0, -1)
    })};`);
    for (const body of ["", 'window.TAKKEN_VOCABULARY_BANK={VERSION:1,LEGAL_BASELINE:"2026-04-01",QUESTIONS:[{id:"vocab-001"}],TOPICS:[{id:"bad",label:"bad"}]};', partialBank]) {
      await page.route("**/vocabulary-bank.js*", route => route.fulfill({ status: 200, contentType: "text/javascript", body }));
      await page.reload({ waitUntil: "networkidle" });
      await page.locator("#bankLoadRecovery").waitFor({ state: "visible" });
      assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), key), raw, "missing/corrupt bank preserves raw queue");
      await page.unroute("**/vocabulary-bank.js*");
      checks++;
    }
    await context.close();

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
    assert.equal(migrated.stateSchemaVersion, 18);
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
    console.log(JSON.stringify({ status: "ok", checks, questions: total, schema: 18, viewports: [1280, 390, 320], retryShuffled: true, reload: true, topicRestart: true, otherSessionPreserved: true, missingBankProtected: true, examEvidenceUnchanged: true }));
  } finally { await browser.close(); await server.close(); }
}
main().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });
