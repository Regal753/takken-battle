"use strict";
const assert = require("node:assert/strict");
const knock = require("./business-knock.js");
const questions = Array.from({ length: 12 }, (_, index) => ({ id: `q${index + 1}`, unitId: index < 6 ? "business-book-01" : "business-book-02" }));
const now = "2026-08-15T12:00:00+09:00";
const history = {
  q1: { attempts: 2, wrong: 1, lastConfidence: "wrong", lastCorrect: false, lastAnsweredAt: "2026-08-14T10:00:00+09:00" },
  q2: { attempts: 3, uncertain: 1, lastConfidence: "uncertain", lastCorrect: true, lastAnsweredAt: "2026-08-14T11:00:00+09:00" },
  q3: { attempts: 1, correct: 1, lastConfidence: "confident", lastCorrect: true, masteryDueKey: "2026-08-15", lastAnsweredAt: "2026-08-13T10:00:00+09:00" },
  q4: { attempts: 6, correct: 5, lastConfidence: "confident", lastCorrect: true, reviewLevel: 6, masteryDueKey: "", confidentDayKeys: ["2026-01-01", "2026-01-02", "2026-01-05", "2026-01-12", "2026-01-26", "2026-02-26"], lastAnsweredAt: "2026-02-26T10:00:00+09:00" }
};
const weak = knock.plan({ questions, history, mode: "weak-retry", size: 10, now, seed: "a" });
assert.deepEqual(weak.ids, ["q1", "q2"], "retry selection order must be deterministic for its seed");
assert.equal(new Set(weak.ids).size, weak.ids.length, "selection must not duplicate ids");
assert.equal(weak.size, 2, "small buckets must cap at available bank size");
assert.deepEqual(knock.plan({ questions, history, mode: "due", size: 10, now }).ids, ["q3"]);
assert.deepEqual(knock.plan({ questions, history, mode: "due", size: 10, now: new Date("2026-08-15T12:00:00+09:00") }).ids, ["q3"], "Date now must detect due items");
assert.deepEqual(knock.plan({ questions, history, mode: "weak-due", size: 10, now, seed: "a" }).ids, ["q1", "q2", "q3"], "weak-due must put retry before due");
assert.equal(knock.plan({ questions, history, mode: "untouched", size: 10, now }).size, 8);
assert.equal(knock.plan({ questions, history, mode: "unit", unitId: "business-book-01", size: 100, now }).size, 6);
assert.equal(knock.plan({ questions, history, mode: "unit", unitId: "business-book-01", size: 100, now }).ids.every((id) => Number(id.slice(1)) <= 6), true);
assert.equal(knock.plan({ questions, history, mode: "all-random", size: 99, now }).requestedSize, 10, "unsupported size must fail closed to 10");
const daily = knock.plan({ questions, history, mode: "all-random", size: 100, dailyRemainder: 9, now, seed: "daily" });
assert.equal(daily.requestedSize, 9, "daily command must use its exact bounded remainder");
assert.equal(daily.size, 9, "daily command must fill the visible remainder across all states");
assert.deepEqual(new Set(daily.ids.slice(0, 2)), new Set(["q1", "q2"]), "daily command must put retry items first");
assert.equal(daily.ids[2], "q3", "daily command must put due items before untouched items");
assert.ok(daily.ids.slice(3).some((id) => !history[id]), "daily command must fill the set with untouched items");
const first = knock.plan({ questions, history, mode: "all-random", size: 10, now, seed: "fixed" });
const second = knock.plan({ questions, history, mode: "all-random", size: 10, now, seed: "fixed" });
assert.deepEqual(first, second, "same input must be deterministic");
assert.notDeepEqual(first.items.map((item) => item.presentationKey), knock.plan({ questions, history, mode: "all-random", size: 10, now, seed: "other" }).items.map((item) => item.presentationKey));
const allWrong = Object.fromEntries(questions.map((q) => [q.id, { attempts: 1, wrong: 1, lastConfidence: "wrong" }]));
assert.equal(knock.plan({ questions, history: allWrong, mode: "weak-retry", size: 100, now }).size, questions.length);
const allMastered = Object.fromEntries(questions.map((q) => [q.id, { attempts: 6, correct: 6, lastConfidence: "confident", reviewLevel: 6, confidentDayKeys: ["2026-01-01", "2026-01-02", "2026-01-05", "2026-01-12", "2026-01-26", "2026-02-26"] }]));
assert.equal(knock.plan({ questions, history: allMastered, mode: "due", size: 10, now }).size, 0);
const fullBank = Array.from({ length: 134 }, (_, index) => ({ id: `bank-${index + 1}`, unitId: "business-book-01" }));
const fullPlan = knock.plan({ questions: fullBank, mode: "all-random", size: 100, now, seed: "134" });
assert.equal(fullPlan.size, 100); assert.equal(fullPlan.available, 134); assert.equal(new Set(fullPlan.ids).size, 100, "134-bank selection must still be unique");
const fullWrong = Object.fromEntries(fullBank.map((question) => [question.id, { attempts: 1, wrong: 1, lastConfidence: "wrong" }]));
const fullDue = Object.fromEntries(fullBank.map((question) => [question.id, { attempts: 1, correct: 1, lastConfidence: "confident", reviewLevel: 1, masteryDueKey: "2026-08-14", confidentDayKeys: ["2026-08-13"], lastAnsweredAt: "2026-08-13T12:00:00+09:00" }]));
for (const [mode, sourceHistory] of [["all-random", {}], ["weak-retry", fullWrong], ["weak-due", fullWrong], ["due", fullDue], ["untouched", {}], ["unit", {}]]) {
  for (const size of knock.SIZES) {
    const result = knock.plan({ questions: fullBank, history: sourceHistory, mode, unitId: "business-book-01", size, now, seed: `matrix-${mode}-${size}` });
    assert.equal(result.size, size, `${mode} must support ${size}-question rounds when the bank has capacity`);
    assert.equal(new Set(result.ids).size, size, `${mode} ${size}-question round must be unique`);
  }
}
const cycleOne = knock.plan({ questions: fullBank, mode: "all-random", size: 100, now, seed: "cycle-one" });
const cycleOneRepeat = knock.plan({ questions: fullBank, mode: "all-random", size: 100, now, seed: "cycle-one" });
const cycleTwo = knock.plan({ questions: fullBank, mode: "all-random", size: 100, now, seed: "cycle-two" });
assert.deepEqual(cycleOne.ids, cycleOneRepeat.ids, "same cycle seed must retain the exact presentation order");
assert.notDeepEqual(cycleOne.ids, cycleTwo.ids, "different cycle seed must change presentation order");
const summary = knock.summarizeHistory(history, now);
assert.equal(summary.rounds, 12); assert.equal(summary.accuracy, 50); assert.equal(summary.retry, 2);
console.log("business knock audit: ok");
