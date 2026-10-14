#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function staticServer(root) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webp": "image/webp", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
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
const raw = (page, key) => page.evaluate(storageKey => localStorage.getItem(storageKey), key);
async function reveal(page, selector) {
  await page.locator(selector).evaluate(node => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === "DETAILS") parent.open = true;
  });
}
async function shown(page, key) {
  return page.evaluate(storageKey => {
    const drill = JSON.parse(localStorage.getItem(storageKey)).practicalDrill;
    const id = drill.queue[drill.position];
    const question = window.TAKKEN_REFORM_2026_BANK.QUESTIONS_BY_ID[id];
    const order = window.TAKKEN_BUSINESS_MASTERY.choiceOrder(id, drill.presentationOverrides?.[id] || drill.presentationKey, 4);
    return { id, text: question.text, unitId: question.unitId, answer: order.indexOf(question.answer), choices: order.map(i => question.choices[i]), reasons: order.map(i => question.sourceFacts[i].reason), urls: [...new Set(question.sourceFacts.map(fact => fact.sourceUrl))] };
  }, key);
}
async function answer(page, key, confidence = "confident", wrong = false) {
  const question = await shown(page, key);
  assert.equal(await page.locator("#practicalDrillPrompt").textContent(), question.text);
  await page.locator(`[data-practical-forecast="${confidence}"]`).click();
  const selected = wrong ? (question.answer + 1) % 4 : question.answer;
  await page.locator(".practical-drill-choice").nth(selected).click();
  await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
  const attempt = (await saved(page, key)).practicalDrill.currentAttempt;
  assert.equal(attempt.correct, !wrong);
  assert.equal(attempt.predictedConfidence, confidence);
  const reasoning = await page.locator("#practicalDrillReasoning").textContent();
  for (const reason of question.reasons) assert.ok(reasoning.includes(reason), `${question.id}: every choice has its own reason after shuffling`);
  const urls = await page.locator("#practicalDrillSources a").evaluateAll(nodes => nodes.map(node => node.href));
  assert.ok(question.urls.every(url => urls.includes(url)), `${question.id}: primary source links visible`);
  return question;
}
async function next(page) { await page.locator("#practicalDrillNextButton").click(); }
function mainEvidence(state) {
  const fields = ["attempts", "correct", "index", "totalXp", "crystals", "questionStats", "daily", "questClaims", "questRewardClaims", "missionLog", "officialExamExposure", "officialExamHistory", "officialExamSession", "mock", "mockHistory", "calculationDrill", "rightsTransferQuiz"];
  const evidence = Object.fromEntries(fields.map(field => [field, state[field]]));
  evidence.otherHistory = Object.fromEntries(Object.entries(state.practicalDrill.history).filter(([id]) => !id.startsWith("reform-")));
  return evidence;
}

async function main() {
  const server = process.env.TAKKEN_BASE_URL ? { baseUrl: process.env.TAKKEN_BASE_URL, close: async () => {} } : await staticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  const output = path.join(process.cwd(), "output", "playwright", "reform-2026");
  fs.mkdirSync(output, { recursive: true });
  let fixtures = 0, checks = 0;
  function watch(page) {
    page.on("pageerror", error => errors.push(String(error)));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  }
  async function fixture(label) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce", serviceWorkers: "block", acceptDownloads: true });
    const page = await context.newPage(); watch(page);
    const review = `reform${++fixtures}${Date.now().toString(36)}`;
    const key = `takken-battle-study-clean-v2-hard-review-${review}`;
    const url = new URL(server.baseUrl); url.searchParams.set("review", review); url.searchParams.set("today", "1");
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    await page.locator("#reformTopic option").first().waitFor({ state: "attached" });
    return { context, page, key, url: url.toString(), label };
  }
  try {
    const item = await fixture("main");
    const { page, key } = item;
    const bank = await page.evaluate(() => ({ total: window.TAKKEN_REFORM_2026_BANK.QUESTIONS.length, topics: window.TAKKEN_REFORM_2026_BANK.TOPICS }));
    assert.equal(await page.locator("#reformTopic option").count(), bank.topics.length);
    await reveal(page, "#reformMode");
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.locator("#reformPanel").evaluate(panel => ({
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        targets: [...panel.querySelectorAll("button, select, summary")].filter(node => node.getBoundingClientRect().height > 0).map(node => node.getBoundingClientRect().height),
        wide: [...panel.querySelectorAll("select")].some(node => node.getBoundingClientRect().width > panel.getBoundingClientRect().width)
      }));
      assert.equal(layout.overflow, 0, `${width}px horizontal overflow`);
      assert.equal(layout.wide, false);
      assert.ok(layout.targets.every(height => height >= 44), `${width}px tap targets`);
      await page.locator("#reformPanel").screenshot({ path: path.join(output, `launcher-${width}.png`) }); checks++;
    }
    const priority = await page.evaluate(storageKey => {
      const state = JSON.parse(localStorage.getItem(storageKey));
      const [wrong, due, safe] = window.TAKKEN_REFORM_2026_BANK.QUESTIONS;
      state.practicalDrill.history[wrong.id] = { attempts: 2, correct: 0, wrong: 2, lastConfidence: "wrong", lastAnsweredAt: "2026-09-20T09:00:00+09:00" };
      state.practicalDrill.history[due.id] = { attempts: 1, correct: 1, wrong: 0, lastCorrect: true, lastConfidence: "confident", lastAnsweredAt: "2026-09-20T09:00:00+09:00" };
      state.practicalDrill.history[safe.id] = { attempts: 2, correct: 2, wrong: 0, lastCorrect: true, lastConfidence: "confident", lastAnsweredAt: new Date().toISOString(), correctDayKeys: ["2026-10-13", "2026-10-14"] };
      localStorage.setItem(storageKey, JSON.stringify(state));
      return { wrong: wrong.id, due: due.id, safe: safe.id };
    }, key);
    await page.reload({ waitUntil: "networkidle" });
    const baseline = mainEvidence(await saved(page, key));
    await page.locator("#reformStart").click();
    let drill = (await saved(page, key)).practicalDrill;
    assert.equal(drill.bankId, "reform2026"); assert.equal(drill.scope, "reform2026"); assert.equal(drill.planMode, "reform");
    assert.equal(drill.queue.length, 10); assert.equal(new Set(drill.queue).size, 10);
    assert.deepEqual(drill.queue.slice(0, 2), [priority.wrong, priority.due], "weakness and overdue records precede untouched items");
    assert.ok(!drill.queue.includes(priority.safe), "untouched questions precede recent grounded records");
    assert.equal(await page.locator(".practical-drill-choice:disabled").count(), 4, "confidence is required before a choice");
    assert.equal(await page.locator("#practicalDrillFeedback").isVisible(), false);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
      await page.locator("#practicalDrillSession").screenshot({ path: path.join(output, `question-${width}.png`) });
    }
    const first = await answer(page, key, "confident", true);
    const answered = (await saved(page, key)).practicalDrill;
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual((await saved(page, key)).practicalDrill, answered, "answered reload preserves confidence/history/queue");
    await page.locator("#practicalDrillCancelButton").click(); await page.locator("#reformStart").click();
    assert.deepEqual((await saved(page, key)).practicalDrill, answered, "exit and resume preserve the exact question");
    await next(page);
    const guessed = await answer(page, key, "guess"); await next(page);
    const uncertain = await answer(page, key, "uncertain"); await next(page);
    while ((await saved(page, key)).practicalDrill.stage === "active") { await answer(page, key); await next(page); }
    drill = (await saved(page, key)).practicalDrill;
    assert.equal(drill.stage, "retry");
    assert.deepEqual([...drill.queue].sort(), [first.id, guessed.id, uncertain.id].sort(), "wrong answers, correct guesses and uncertain correct answers retry");
    const repeated = await shown(page, key);
    assert.equal(repeated.id, first.id); assert.notEqual(repeated.answer, first.answer, "retry changes the correct choice position");
    while ((await saved(page, key)).practicalDrill.stage === "retry") { await answer(page, key); await next(page); }
    const completed = await saved(page, key);
    assert.equal(completed.stateSchemaVersion, 20); assert.equal(completed.practicalDrill.stage, "complete");
    assert.equal(completed.practicalDrill.history[first.id].overconfidentWrong, 1);
    assert.equal(completed.practicalDrill.history[guessed.id].guessAnswers, 1);
    assert.deepEqual(mainEvidence(completed), baseline, "reform study does not invent main/official/mock/calculation score or exposure");
    assert.match(await page.locator("#practicalDrillCompleteText").textContent(), /法改正ノック.*完了.*同日正解だけでは別日定着に数えません/);
    await page.locator("#practicalDrillComplete").screenshot({ path: path.join(output, "completion-320.png") }); checks++;
    await reveal(page, "#reformMode"); await page.locator("#reformMode").selectOption("topic");
    await page.locator("#reformTopic").selectOption(bank.topics.at(-1).id); await page.locator("#reformSize").selectOption("20");
    const crossBankPreset = (await saved(page, key)).practicalDrill.reformPreset;
    await page.locator("#vocabularyStart").click();
    const afterBankChange = (await saved(page, key)).practicalDrill;
    assert.equal(afterBankChange.bankId, "vocabulary"); assert.deepEqual(afterBankChange.reformPreset, crossBankPreset, "switching banks retains the independent reform preset");
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual((await saved(page, key)).practicalDrill, afterBankChange, "cross-bank history and reform preset survive reload");
    const crossBankJson = await page.evaluate(storageKey => {
      const transfer = window.TAKKEN_SAVE_TRANSFER;
      const state = JSON.parse(localStorage.getItem(storageKey));
      return transfer.decodePackage(transfer.encodePackage(transfer.createSavePackage(state))).state.practicalDrill;
    }, key);
    assert.deepEqual(crossBankJson, afterBankChange, "cross-bank JSON retains reform preferences and prior reform history"); checks++;

    const sizes = await fixture("sizes");
    await reveal(sizes.page, "#reformMode"); await sizes.page.locator("#reformMode").selectOption("all"); await sizes.page.locator("#reformSize").selectOption("20"); await sizes.page.locator("#reformCustomStart").click();
    assert.equal((await saved(sizes.page, sizes.key)).practicalDrill.sessionIds.length, 20);
    sizes.page.once("dialog", dialog => dialog.accept()); await sizes.page.locator("#practicalDrillDiscardButton").click();
    await reveal(sizes.page, "#reformMode"); await sizes.page.locator("#reformSize").selectOption("all"); await sizes.page.locator("#reformCustomStart").click();
    assert.equal((await saved(sizes.page, sizes.key)).practicalDrill.sessionIds.length, bank.total);
    const rendered = new Set();
    while (["active", "retry"].includes((await saved(sizes.page, sizes.key)).practicalDrill.stage)) {
      const question = await answer(sizes.page, sizes.key); rendered.add(question.id);
      if (rendered.size === 1) for (const width of [1280, 390, 320]) {
        await sizes.page.setViewportSize({ width, height: 900 });
        assert.equal(await sizes.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        await sizes.page.locator("#practicalDrillSession").screenshot({ path: path.join(output, `explanation-${width}.png`) });
      }
      await next(sizes.page);
    }
    assert.equal(rendered.size, bank.total, "every question actually renders, scores and explains every shuffled choice");
    await sizes.context.close(); checks++;
    for (const topic of bank.topics) {
      const theme = await fixture("topic"); await reveal(theme.page, "#reformMode");
      await theme.page.locator("#reformMode").selectOption("topic"); await theme.page.locator("#reformTopic").selectOption(topic.id); await theme.page.locator("#reformSize").selectOption("all"); await theme.page.locator("#reformCustomStart").click();
      const session = (await saved(theme.page, theme.key)).practicalDrill;
      assert.equal(session.reformPreset.topicId, topic.id); assert.equal(session.reformPreset.mode, "topic"); assert.equal(session.unitId, topic.id);
      const expected = await theme.page.evaluate(topicId => window.TAKKEN_REFORM_2026_BANK.QUESTIONS.filter(q => q.unitId === topicId).map(q => q.id), topic.id);
      assert.deepEqual([...session.sessionIds].sort(), expected.sort(), "topic selects exactly its own questions");
      await theme.context.close(); checks++;
    }

    const transfer = await fixture("transfer"); await transfer.page.locator("#reformStart").click(); await answer(transfer.page, transfer.key, "guess");
    assert.equal((await transfer.page.locator("#reformGrounded").textContent()).trim(), `0 / ${bank.total}`, "a correct guess cannot be grounded credit");
    assert.equal((await transfer.page.locator("#reformReview").textContent()).trim(), "1", "a correct guess immediately joins review");
    const beforeTransfer = (await saved(transfer.page, transfer.key)).practicalDrill;
    // Headless Windows cannot interact with the native share sheet. Exercise
    // the supported browser-download branch and then the actual file import.
    await transfer.page.evaluate(() => Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false }));
    await reveal(transfer.page, "#saveExportButton");
    const downloadPromise = transfer.page.waitForEvent("download"); await transfer.page.locator("#saveExportButton").click();
    const download = await downloadPromise; const json = fs.readFileSync(await download.path(), "utf8");
    assert.deepEqual(JSON.parse(json).state.practicalDrill, beforeTransfer, "the actual JSON download includes full reform state");
    const imported = await fixture("import"); imported.page.once("dialog", dialog => dialog.accept());
    await imported.page.locator("#saveImportInput").setInputFiles({ name: "reform-session.json", mimeType: "application/json", buffer: Buffer.from(json) });
    await imported.page.waitForFunction(() => document.querySelector("#saveTransferStatus").textContent.includes("引継ぎ完了"));
    assert.deepEqual((await saved(imported.page, imported.key)).practicalDrill, beforeTransfer, "file import retains answer, confidence, retry and preset");
    await imported.context.close();
    const second = await transfer.context.newPage(); watch(second); await second.goto(transfer.url, { waitUntil: "networkidle" });
    await next(transfer.page);
    await second.waitForFunction(({ key, position }) => document.querySelector("#practicalDrillProgress").textContent.startsWith(`第${position + 1}問 /`) && JSON.parse(localStorage.getItem(key)).practicalDrill.position === position, { key: transfer.key, position: 1 });
    assert.equal((await shown(second, transfer.key)).id, (await shown(transfer.page, transfer.key)).id, "cross-tab refresh shows the same question");
    await answer(second, transfer.key, "uncertain");
    await transfer.page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
    assert.equal((await saved(transfer.page, transfer.key)).practicalDrill.currentAttempt.predictedConfidence, "uncertain");
    await transfer.context.close(); checks++;

    const legacy = await fixture("schema19"); await legacy.page.locator("#vocabularyStart").click();
    const legacyAnswer = await legacy.page.evaluate(storageKey => {
      const drill = JSON.parse(localStorage.getItem(storageKey)).practicalDrill;
      const id = drill.queue[drill.position], q = window.TAKKEN_VOCABULARY_BANK.MEANING_QUESTIONS_BY_ID[id];
      return window.TAKKEN_BUSINESS_MASTERY.choiceOrder(id, drill.presentationOverrides?.[id] || drill.presentationKey, 4).indexOf(q.answer);
    }, legacy.key);
    await legacy.page.locator(".practical-drill-choice").nth((legacyAnswer + 1) % 4).click();
    const prior = await legacy.page.evaluate(storageKey => {
      const state = JSON.parse(localStorage.getItem(storageKey)); state.stateSchemaVersion = 19;
      state.attempts = 8; state.correct = 5; state.totalXp = 475; state.crystals = 40;
      state.daily.answers = 4; state.daily.correct = 3; state.daily.wrong = 1;
      delete state.practicalDrill.reformPreset;
      const raw = JSON.stringify(state); localStorage.setItem(storageKey, raw); return { raw, state };
    }, legacy.key);
    await legacy.page.reload({ waitUntil: "networkidle" });
    const upgraded = await saved(legacy.page, legacy.key);
    assert.equal(upgraded.stateSchemaVersion, 20);
    assert.deepEqual(mainEvidence(upgraded), mainEvidence(prior.state), "schema19 main and calculation evidence preserved");
    for (const field of ["bankId", "queue", "position", "sessionIds", "retryIds", "currentAttempt", "history", "presentationKey", "presentationOverrides", "vocabularyPreset", "attempts", "correctAttempts"]) assert.deepEqual(upgraded.practicalDrill[field], prior.state.practicalDrill[field], `schema19 ${field} preserved`);
    assert.equal(await legacy.page.evaluate(key => localStorage.getItem(key + "-before-upgrade-v19-to-v20"), legacy.key), prior.raw, "exact original migration backup");
    await legacy.page.locator("#reformStart").click();
    assert.deepEqual((await saved(legacy.page, legacy.key)).practicalDrill, upgraded.practicalDrill, "new launcher resumes another active bank without replacing it");
    await legacy.context.close(); checks++;

    const calculation = await fixture("calculation"); await reveal(calculation.page, "#calculationDrillResetButton");
    await calculation.page.locator("#calculationDrillResetButton").click();
    const beforeCalculation = await saved(calculation.page, calculation.key);
    assert.equal(beforeCalculation.calculationDrill.stage, "active");
    await calculation.page.locator("#reformStart").click();
    assert.deepEqual((await saved(calculation.page, calculation.key)).calculationDrill, beforeCalculation.calculationDrill, "active calculation is resumed intact");
    assert.deepEqual((await saved(calculation.page, calculation.key)).practicalDrill, beforeCalculation.practicalDrill, "launcher does not create a competing reform session");
    await calculation.context.close(); checks++;

    const failedSave = await fixture("quota"); await failedSave.page.locator("#reformStart").click();
    const beforeFailure = (await saved(failedSave.page, failedSave.key)).practicalDrill;
    const failureQuestion = await shown(failedSave.page, failedSave.key);
    await failedSave.page.locator('[data-practical-forecast="confident"]').click();
    await failedSave.page.evaluate(storageKey => {
      const original = Storage.prototype.setItem;
      window.restoreReformWrites = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function(name, value) {
        if (name === storageKey) throw new DOMException("synthetic quota failure", "QuotaExceededError");
        return original.call(this, name, value);
      };
    }, failedSave.key);
    await failedSave.page.locator(".practical-drill-choice").nth(failureQuestion.answer).click();
    await failedSave.page.locator("#practicalDrillSaveError").waitFor({ state: "visible" });
    const failed = (await saved(failedSave.page, failedSave.key)).practicalDrill;
    assert.equal(failed.attempts, beforeFailure.attempts); assert.equal(failed.position, beforeFailure.position); assert.equal(failed.currentAttempt, null);
    await failedSave.page.evaluate(() => window.restoreReformWrites());
    await failedSave.page.locator(".practical-drill-choice").nth(failureQuestion.answer).click(); await next(failedSave.page);
    assert.equal((await saved(failedSave.page, failedSave.key)).practicalDrill.history[failureQuestion.id].attempts, 1, "failed grading recovery does not double count");
    const protectedRaw = await raw(failedSave.page, failedSave.key);
    const bankSource = fs.readFileSync(path.join(__dirname, "reform-2026-bank.js"), "utf8");
    const malformed = [
      'bank.QUESTIONS[0].sourceFacts[0].statement="different offered statement";',
      'bank.QUESTIONS[0].sourceFacts[0].truth=!bank.QUESTIONS[0].sourceFacts[0].truth;',
      'bank.QUESTIONS[0].sourceFacts[0].effectiveAt="2026-04-02";',
      'bank.QUESTIONS[0].effectiveAt="2026-04-02";',
      'bank.QUESTIONS[0].sourceFacts[0].legalBaseline="2026-04-02";',
      'bank.QUESTIONS_BY_ID[bank.QUESTIONS[0].id]={...bank.QUESTIONS[0],choices:["divergent index",...bank.QUESTIONS[0].choices.slice(1)]};'
    ].map(mutation => `${bankSource}\n(() => { const bank=JSON.parse(JSON.stringify(window.TAKKEN_REFORM_2026_BANK)); bank.QUESTIONS_BY_ID=Object.fromEntries(bank.QUESTIONS.map(q=>[q.id,q])); ${mutation} window.TAKKEN_REFORM_2026_BANK=bank; })();`);
    for (const body of ["", 'window.TAKKEN_REFORM_2026_BANK={VERSION:1,LEGAL_BASELINE:"2026-04-01",QUESTIONS:[],TOPICS:[]};', ...malformed]) {
      await failedSave.page.route("**/reform-2026-bank.js*", route => route.fulfill({ status: 200, contentType: "text/javascript", body }));
      await failedSave.page.reload({ waitUntil: "networkidle" }); await failedSave.page.locator("#bankLoadRecovery").waitFor({ state: "visible" });
      assert.equal(await raw(failedSave.page, failedSave.key), protectedRaw, "missing or malformed reform bank preserves the exact session bytes");
      await failedSave.page.unroute("**/reform-2026-bank.js*");
    }
    await failedSave.context.close(); checks++;

    const future = await fixture("future");
    await future.page.locator("#reformStart").click(); await answer(future.page, future.key, "guess");
    const futureRaw = await future.page.evaluate(storageKey => {
      const state = JSON.parse(localStorage.getItem(storageKey)); state.stateSchemaVersion = 21; state.futureSentinel = { preserve: "all bytes" };
      const raw = JSON.stringify(state); localStorage.setItem(storageKey, raw); return raw;
    }, future.key);
    await future.page.reload({ waitUntil: "networkidle" });
    assert.equal(await raw(future.page, future.key), futureRaw);
    assert.equal(await future.page.locator("body").evaluate(node => node.classList.contains("is-save-read-only")), true);
    assert.equal(await future.page.locator("#reformStart").isDisabled(), true);
    assert.equal(await future.page.locator("#reformCustomStart").isDisabled(), true);
    assert.match(await future.page.locator("#saveTransferStatus").textContent(), /新しい保存形式v21/);
    await future.context.close(); checks++;
    await item.context.close();
    assert.deepEqual(errors, [], "console and page errors");
    console.log(JSON.stringify({ status: "ok", checks, questions: bank.total, topics: bank.topics.length, renderedQuestions: rendered.size, schema: 20, sizes: [10, 20, "all"], viewports: [1280, 390, 320], consoleErrors: errors.length, confidenceRequired: true, retriesShuffled: true, scoresPreserved: true, jsonRoundtrip: true, crossTab: true, schema19Preserved: true, futureProtected: true, screenshots: output }));
  } finally { await browser.close(); await server.close(); }
}
main().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });
