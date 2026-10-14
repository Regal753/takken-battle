"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const bank = require("./reform-2026-bank.js");
const source = fs.readFileSync(path.join(__dirname, "reform-2026-bank.js"), "utf8");
const nonblank = value => typeof value === "string" && value.trim().length > 0;
const primaryHosts = new Set(["laws.e-gov.go.jp", "elaws.e-gov.go.jp", "www.moj.go.jp", "www.mlit.go.jp", "www.nta.go.jp", "www.maff.go.jp", "www.retio.or.jp", "www.soumu.go.jp", "www.caa.go.jp", "www.meti.go.jp", "www.kantei.go.jp", "www.courts.go.jp", "www.pref.kanagawa.jp", "www.city.yokosuka.kanagawa.jp"]);
const validateUrl = value => {
  const url = new URL(value);
  assert.equal(url.protocol, "https:");
  assert.ok(primaryHosts.has(url.hostname) || /(?:^|\.)(?:go\.jp|lg\.jp)$/.test(url.hostname), `primary source required: ${value}`);
};

assert.equal(bank.VERSION, 1);
assert.equal(bank.LEGAL_BASELINE, "2026-04-01");
assert.ok(bank.QUESTIONS.length >= 20, "10/20/full sessions require at least 20 substantive questions");
assert.ok(bank.TOPICS.length >= 4, "cover distinct recent changes rather than repeat one reform");
assert.ok(Object.isFrozen(bank) && Object.isFrozen(bank.QUESTIONS));
const ids = bank.QUESTION_IDS || bank.IDS;
const byId = bank.QUESTIONS_BY_ID || bank.BY_ID;
assert.deepEqual(ids, bank.QUESTIONS.map(q => q.id));
assert.equal(new Set(ids).size, bank.QUESTIONS.length);
assert.deepEqual(Object.keys(byId), ids);
assert.equal(new Set(bank.QUESTIONS.map(q => q.text)).size, bank.QUESTIONS.length, "distinct question prompts");
const topics = new Set(bank.TOPICS.map(topic => topic.id));
assert.equal(topics.size, bank.TOPICS.length);
assert.ok(bank.TOPICS.every(topic => nonblank(topic.label)));
const slots = [0, 0, 0, 0];
const counts = Object.fromEntries(bank.TOPICS.map(topic => [topic.id, 0]));
const sourceHosts = new Set();
let longestCorrect = 0;
for (const [index, q] of bank.QUESTIONS.entries()) {
  assert.equal(q.id, `reform-${String(index + 1).padStart(3, "0")}`);
  assert.equal(byId[q.id], q);
  assert.ok(Object.isFrozen(q) && Object.isFrozen(q.choices) && Object.isFrozen(q.sourceFacts), `${q.id}: immutable source-backed question`);
  assert.equal(q.format, "単一選択"); assert.equal(q.formatKey, "single");
  assert.ok(topics.has(q.unitId), `${q.id}: known reform topic`);
  assert.equal(q.legalBaseline, bank.LEGAL_BASELINE);
  assert.ok([q.text, q.explain, q.trap, q.memoryRule].every(nonblank), `${q.id}: teaching content`);
  assert.equal(q.choices.length, 4);
  assert.equal(new Set(q.choices).size, 4);
  assert.ok(q.choices.every(nonblank));
  assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
  assert.equal(q.sourceFacts.length, 4, `${q.id}: verify every offered statement`);
  assert.equal(q.sourceFacts.filter(fact => fact.truth).length, 1, `${q.id}: objective single correct answer`);
  for (const [i, fact] of q.sourceFacts.entries()) {
    assert.equal(fact.statement, q.choices[i], `${q.id}:${i}: fact follows the actual choice`);
    assert.equal(fact.key, `${q.id}:${i}`); assert.equal(fact.questionId, q.id); assert.equal(fact.choiceIndex, i);
    assert.equal(fact.truth, i === q.answer, `${q.id}:${i}: answer key matches source judgment`);
    assert.ok([fact.reason, fact.sourceLocator, fact.sourceUrl].every(nonblank), `${q.id}:${i}: reason and source location`);
    assert.ok(fact.reason.length >= 16, `${q.id}:${i}: explain why that particular option fails or succeeds`);
    validateUrl(fact.sourceUrl);
    sourceHosts.add(new URL(fact.sourceUrl).hostname);
    assert.equal(fact.legalBaseline, bank.LEGAL_BASELINE);
    assert.equal(fact.effectiveAt, q.effectiveAt, `${q.id}:${i}: fact and question share the applicable reform date`);
    assert.match(fact.effectiveAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(fact.effectiveAt <= bank.LEGAL_BASELINE, `${q.id}:${i}: effective by the exam baseline`);
  }
  const effectiveDate = q.effectiveAt;
  assert.ok(nonblank(effectiveDate), `${q.id}: record the reform effective date`);
  assert.match(effectiveDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(effectiveDate <= bank.LEGAL_BASELINE, `${q.id}: future reforms must not become the 2026 answer`);
  assert.equal(new Set(q.sourceFacts.map(fact => fact.reason)).size, 4, `${q.id}: individual choice reasons`);
  if (q.sourceUrl) validateUrl(q.sourceUrl);
  if (q.choiceExplanations) q.choiceExplanations.forEach((explanation, i) => {
    if (typeof explanation === "string") assert.ok(explanation.includes(q.sourceFacts[i].reason));
    else {
      assert.equal(explanation.correct, i === q.answer);
      assert.equal(explanation.reason, q.sourceFacts[i].reason);
    }
  });
  if (q.statementExplanations) {
    assert.equal(q.statementExplanations.length, 4);
    assert.ok(q.statementExplanations.every(nonblank));
  }
  counts[q.unitId]++;
  slots[q.answer]++;
  if (q.choices[q.answer].length > Math.max(...q.choices.filter((_, i) => i !== q.answer).map(text => text.length))) longestCorrect++;
}
assert.ok(Object.values(counts).every(count => count > 0), "each selectable topic has questions");
assert.ok(Math.max(...slots) - Math.min(...slots) <= 1, "balanced correct answer positions");
assert.ok(longestCorrect <= Math.ceil(bank.QUESTIONS.length * 0.6), "correct choices must not routinely reveal themselves by length");
assert.doesNotMatch(source, /chatgpt\.com\/c\/|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}/, "no private links or credentials");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "reform-2026-bank.js" });
assert.ok(sandbox.window.TAKKEN_REFORM_2026_BANK, "standalone browser global");
assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.TAKKEN_REFORM_2026_BANK.QUESTIONS)), bank.QUESTIONS);
// Exercise the production selector directly: the former prefix polynomial
// returned the same first ten IDs for every seed despite the mixed-mode label.
const queue = require("./reform-2026-queue.js");
assert.equal(queue.VERSION, 1);
const now = new Date("2026-10-14T12:00:00+09:00");
const seeds = Array.from({ length: 16 }, (_, i) => `2026-10-14:reform2026:cycle_fixed_${String(i).padStart(2, "0")}`);
const questionBeforeSelection = JSON.stringify(bank.QUESTIONS);
const selectedTopicIds = ids => new Set(ids.map(id => byId[id].unitId));
const subsetKey = ids => [...ids].sort().join(",");
const variations = {};
for (const size of ["10", "20"]) {
  const selections = seeds.map(sessionKey => queue.buildQueue(bank.QUESTIONS, { mode: "all", size, history: {}, sessionKey, now }));
  for (const [index, ids] of selections.entries()) {
    assert.equal(ids.length, Number(size)); assert.equal(new Set(ids).size, Number(size));
    assert.ok(ids.every(id => byId[id]));
    assert.equal(selectedTopicIds(ids).size, bank.TOPICS.length, `${size}: each mixed batch reaches every reform theme`);
    const topicCounts = bank.TOPICS.map(topic => ids.filter(id => byId[id].unitId === topic.id).length);
    assert.ok(Math.max(...topicCounts) - Math.min(...topicCounts) <= 1, `${size}: mixed batches spread questions evenly across available themes`);
    assert.deepEqual(queue.buildQueue(bank.QUESTIONS, { mode: "all", size, history: {}, sessionKey: seeds[index], now }), ids, "the same seed reproduces the saved queue");
  }
  const subsets = new Set(selections.map(subsetKey));
  assert.ok(subsets.size >= 8, `${size}: changing sessions must change selected IDs, not only their order`);
  variations[size] = subsets.size;
}
const [wrong, uncertain, due, recent] = bank.QUESTIONS;
const history = {
  [wrong.id]: { attempts: 3, correct: 0, wrong: 3, lastCorrect: false, lastConfidence: "wrong", lastAnsweredAt: "2026-09-20T09:00:00+09:00" },
  [uncertain.id]: { attempts: 1, correct: 1, wrong: 0, lastCorrect: true, lastConfidence: "uncertain", lastPredictedConfidence: "guess", lastAnsweredAt: "2026-10-14T10:00:00+09:00" },
  [due.id]: { attempts: 1, correct: 1, wrong: 0, lastCorrect: true, lastConfidence: "confident", lastAnsweredAt: "2026-09-20T09:00:00+09:00" },
  [recent.id]: { attempts: 1, correct: 1, wrong: 0, lastCorrect: true, lastConfidence: "confident", lastAnsweredAt: now.toISOString() }
};
const historyBeforeSelection = JSON.stringify(history);
for (const sessionKey of seeds) {
  const ids = queue.buildQueue(bank.QUESTIONS, { mode: "weak", size: "10", history, sessionKey, now });
  assert.deepEqual(new Set(ids.slice(0, 2)), new Set([wrong.id, uncertain.id]), "wrong and uncertain/guess answers precede overdue items");
  assert.equal(ids[2], due.id, "overdue evidence precedes untouched items");
  assert.ok(ids.slice(3).every(id => !history[id]), "untouched reforms precede recent grounded answers");
  assert.deepEqual(queue.buildQueue(bank.QUESTIONS, { mode: "weak", size: "10", history, sessionKey, now }), ids);
}
for (const topic of bank.TOPICS) {
  const eligible = bank.QUESTIONS.filter(q => q.unitId === topic.id);
  const ids = queue.buildQueue(eligible, { mode: "topic", size: "all", history, sessionKey: seeds[0], now });
  assert.deepEqual([...ids].sort(), eligible.map(q => q.id).sort(), "topic selection retains exactly its eligible pool");
}
const full = queue.buildQueue(bank.QUESTIONS, { mode: "all", size: "all", history, sessionKey: seeds[0], now });
assert.deepEqual([...full].sort(), [...ids].sort(), "full selection includes every question exactly once");
assert.equal(JSON.stringify(bank.QUESTIONS), questionBeforeSelection, "selection cannot mutate question data or source facts");
assert.equal(JSON.stringify(history), historyBeforeSelection, "selection cannot grant attempts or mastery");
const queueMastery = require("./business-mastery.js");
const queueSandbox = { TAKKEN_BUSINESS_MASTERY: queueMastery };
queueSandbox.window = queueSandbox;
vm.createContext(queueSandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "reform-2026-queue.js"), "utf8"), queueSandbox, { filename: "reform-2026-queue.js" });
assert.ok(queueSandbox.window.TAKKEN_REFORM_2026_QUEUE);
assert.deepEqual(JSON.parse(JSON.stringify(queueSandbox.window.TAKKEN_REFORM_2026_QUEUE.buildQueue(bank.QUESTIONS, { mode: "all", size: "10", history: {}, sessionKey: seeds[0], now }))), queue.buildQueue(bank.QUESTIONS, { mode: "all", size: "10", history: {}, sessionKey: seeds[0], now }), "browser and Node selectors agree");
console.log(JSON.stringify({ status: "ok", questions: bank.QUESTIONS.length, choicesReviewed: bank.QUESTIONS.length * 4, legalBaseline: bank.LEGAL_BASELINE, topics: counts, correctSlots: slots, longestCorrect, primarySourceHosts: [...sourceHosts] }));
console.log(JSON.stringify({ queue: "ok", fixedSeeds: seeds.length, distinctMixedSubsets: variations, themesPerBatch: bank.TOPICS.length, weakPriorityPreserved: true, sameSeedDeterministic: true, inputDataUnchanged: true }));
