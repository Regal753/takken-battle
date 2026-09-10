"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const sandbox = { window: {}, URL }; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ["exam-blueprint.js", "exam-question-core.js", "exam-questions-rights.js",
  "exam-questions-restrictions.js", "exam-questions-tax-other.js", "exam-questions-business.js",
  "business-fullscore-supplement.js", "business-fullscore-bank.js", "business-hard-front.js",
  "business-hard-contracts.js", "business-hard-practice.js", "business-hard-bank.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), sandbox, { filename: file });
}
const bank = sandbox.window.TAKKEN_BUSINESS_HARD_BANK;
const raw = [...sandbox.window.TAKKEN_BUSINESS_HARD_FRONT, ...sandbox.window.TAKKEN_BUSINESS_HARD_CONTRACTS,
  ...sandbox.window.TAKKEN_BUSINESS_HARD_PRACTICE];
const plain = value => JSON.parse(JSON.stringify(value));
assert.equal(bank.QUESTIONS.length, 60);
assert.equal(new Set(bank.QUESTIONS.map(q => q.id)).size, 60);
assert.equal(sandbox.window.TAKKEN_BUSINESS_FULLSCORE_BANK.QUESTIONS.length, 134, "legacy bank contract must not change");
assert.deepEqual(plain(bank.QUESTIONS.map(q => q.id).sort()), Array.from({ length: 60 }, (_, i) => `hard54-${String(i + 1).padStart(3, "0")}`));
const formatCounts = {}, unitCounts = {}, slots = [0, 0, 0, 0];
const countAnswers = {};
let longestCorrect = 0, shortestCorrect = 0;
for (const q of bank.QUESTIONS) {
  const source = raw.find(s => s.id === q.id);
  const facts = source.choices || source.statements;
  assert.ok(Object.isFrozen(q) && Object.isFrozen(q.choices));
  assert.equal(q.difficulty, "hard");
  assert.notEqual(q.unitId, "business-book-05", "no guarantee-association focus in daily hard bank");
  assert.ok(q.premise.length >= 65, `${q.id}: a fact-dependent case is required`);
  assert.ok(facts.every(f => f.reason.length >= 22), `${q.id}: explain the boundary for every judgment`);
  assert.equal(q.choices.length, 4);
  assert.equal(new Set(q.choices).size, 4);
  assert.equal(q.sourceFacts.length, 4);
  assert.equal(q.legalBaseline, "2026-04-01");
  for (const s of q.legalSources) {
    assert.match(s.url, /^https:\/\/(laws\.e-gov\.go\.jp|www\.mlit\.go\.jp|www\.skr\.mlit\.go\.jp|disaportal\.gsi\.go\.jp)\//);
    assert.ok(s.reference && s.checkedAt === "2026-09-10");
  }
  const matching = facts.filter(f => f.truth === (q.ask === "correct"));
  if (q.formatKey === "single") {
    assert.equal(matching.length, 1);
    assert.equal(q.choices[q.answer], matching[0].text);
    const lengths = q.choices.map(text => text.length);
    if (lengths[q.answer] === Math.max(...lengths)) longestCorrect++;
    if (lengths[q.answer] === Math.min(...lengths)) shortestCorrect++;
  } else if (q.formatKey === "count") {
    countAnswers[matching.length] = (countAnswers[matching.length] || 0) + 1;
    assert.deepEqual(plain([...q.choices].sort()), ["1個", "2個", "3個", "4個"]);
    assert.equal(q.choices[q.answer], `${matching.length}個`);
  } else {
    assert.equal(matching.length, 2);
    assert.ok(q.choices.every(text => text.split("・").length === 2), "combination shape must not reveal answer");
  }
  const stable = JSON.stringify(q);
  const seenAnswers = new Set();
  for (let i = 0; i < 24; i++) {
    const key = `2026-09-10:hard-audit-${i}`;
    const p = bank.presentQuestion(q, key);
    seenAnswers.add(p.answer);
    assert.deepEqual(plain(p), plain(bank.presentQuestion(q.id, key)), "reload must preserve presentation");
    assert.equal(p.choices[p.answer], q.choices[q.answer]);
    assert.equal(new Set(p.presentationOrder).size, 4);
    assert.equal(p.presentationKey, key);
    for (let j = 0; j < 4; j++) {
      const original = p.presentationOrder[j];
      assert.equal(p.choiceExplanations[j].replace(/^[1-4]\s/, ""), q.choiceExplanations[original].replace(/^[1-4]\s/, ""));
      assert.equal(bank.diagnosticsForSelection(p, j).length === 0, j === p.answer);
      if (q.formatKey === "single") {
        assert.equal(p.sourceFacts[j].presentedStatement, p.choices[j]);
        assert.equal(p.displayModel.choiceBlocks[j].judgment, p.choices[j]);
      }
    }
  }
  assert.ok(seenAnswers.size >= 3, `${q.id}: varied answer placement`);
  assert.equal(JSON.stringify(q), stable, "presentation must not mutate canonical answers");
  formatCounts[q.formatKey] = (formatCounts[q.formatKey] || 0) + 1;
  unitCounts[q.unitId] = (unitCounts[q.unitId] || 0) + 1;
  slots[q.answer]++;
}
assert.deepEqual(formatCounts, { single: 48, count: 8, combination: 4 });
assert.deepEqual(slots, [15, 15, 15, 15]);
assert.deepEqual(countAnswers, { 1: 2, 2: 2, 3: 2, 4: 2 }, "count answers must not reduce to an implicit two-choice bank");
assert.equal(Object.keys(unitCounts).length, 10);
assert.ok(longestCorrect <= 24 && shortestCorrect <= 24, "answer length alone must not solve most single cases");
const knock = require("./business-knock.js");
for (let seed = 0; seed < 40; seed++) {
  const history = {}, seen = new Set();
  for (let day = 0; day < 3; day++) {
    const now = `2026-09-${10 + day}`;
    const plan = knock.plan({ questions: bank.QUESTIONS, history, now, mode: "all-random", dailyRemainder: 20, seed: `${seed}:${day}` });
    assert.equal(plan.size, 20);
    const counts = {};
    for (const id of plan.ids) {
      assert.equal(seen.has(id), false, "fresh pool must rotate over three days before repeats when no reviews are due");
      seen.add(id);
      const unit = bank.QUESTIONS_BY_ID[id].unitId;
      counts[unit] = (counts[unit] || 0) + 1;
      history[id] = { attempts: 1, correct: 1, lastConfidence: "confident", lastAnsweredAt: now, reviewLevel: 0, confidentDayKeys: [] };
    }
    if (day === 0) {
      assert.equal(Object.keys(counts).length, 10, "first fresh daily20 must cover every eligible unit");
      assert.ok(Math.max(...Object.values(counts)) <= 7, "do not let the largest unit monopolize a fresh daily20");
      assert.ok(counts["business-book-07"] >= 4 && counts["business-book-08"] >= 3, "keep business conduct and eight restrictions prominent");
    }
  }
  assert.equal(seen.size, 60);
}
const first = bank.QUESTIONS[0].id, second = bank.QUESTIONS[1].id;
const priority = knock.plan({ questions: bank.QUESTIONS, history: {
  [first]: { attempts: 1, lastConfidence: "wrong" },
  [second]: { attempts: 1, lastConfidence: "confident", lastAnsweredAt: "2026-09-08", reviewLevel: 1, confidentDayKeys: ["2026-09-08"] }
}, mode: "all-random", dailyRemainder: 20, now: "2026-09-10", seed: "urgent" });
assert.deepEqual(plain(priority.ids.slice(0, 2)), [first, second]);
const excluded = knock.plan({ questions: bank.QUESTIONS, mode: "all-random", dailyRemainder: 20,
  answeredTodayIds: priority.ids, now: "2026-09-10", seed: "remainder" });
assert.ok(excluded.ids.every(id => !priority.ids.includes(id)));
const yesterday = bank.QUESTIONS.slice(0, 20);
const dueHistory = Object.fromEntries(yesterday.map(q => [q.id, { attempts: 1, correct: 1, lastConfidence: "confident",
  lastAnsweredAt: "2026-09-09", reviewLevel: 1, confidentDayKeys: ["2026-09-09"] }]));
const mixedDay = knock.plan({ questions: bank.QUESTIONS, history: dueHistory, mode: "all-random",
  dailyRemainder: 20, now: "2026-09-10", seed: "daily-due-with-fresh" });
assert.equal(mixedDay.ids.filter(id => !dueHistory[id]).length, 8, "daily20 must reserve8 fresh cases when20reviews are due");
assert.ok(mixedDay.ids.slice(0, 12).every(id => dueHistory[id]), "reviews retain priority within their lane");
const reviewOnly = knock.plan({ questions: bank.QUESTIONS, history: dueHistory, mode: "weak-due", size: 20,
  now: "2026-09-10", seed: "explicit-reviews" });
assert.equal(reviewOnly.size, 20);
assert.ok(reviewOnly.ids.every(id => dueHistory[id]), "explicit review mode must not substitute new cases");
console.log(JSON.stringify({ audit: "business hard bank", status: "PASS", questions: 60, formatCounts, unitCounts, slots, countAnswers, longestCorrect, shortestCorrect, rotationSeeds: 40 }));
