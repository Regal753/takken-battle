"use strict";

const assert = require("node:assert/strict");
global.window = {};
require("./exam-blueprint.js");
require("./exam-question-core.js");
require("./exam-questions-rights.js");
require("./exam-questions-restrictions.js");
require("./exam-questions-tax-other.js");
const baseQuestions = window.TAKKEN_EXAM_QUESTIONS;
const bank = require("./subject-sprint-bank.js");

assert.equal(bank.VERSION, 1, "bank version");
assert.equal(bank.LEGAL_BASELINE, "2026-04-01", "legal baseline");
assert.strictEqual(window.TAKKEN_SUBJECT_SPRINT_BANK, bank, "browser/CommonJS identity");
assert.ok(Object.isFrozen(bank) && Object.isFrozen(bank.QUESTIONS), "frozen public API");
assert.equal(bank.QUESTIONS.length, 36, "exactly 36 sprint questions");
assert.equal(new Set(bank.QUESTIONS.map((question) => question.id)).size, 36, "unique sprint ids");
assert.deepEqual(bank.COVERAGE.bySection, { taxOther: 12, restrictions: 8, rights: 8, other: 8 }, "subject coverage");

const requiredTags = ["local-tax", "tax-comparison", "registration-tax", "fixed-asset-tax", "stamp-tax", "capital-gain", "development-permit", "building-confirmation", "national-land", "embankment", "agency", "guarantee", "mortgage", "subrogation", "housing-finance", "securitization-support", "fair-competition", "walking-time-display", "land-building", "building-structure", "statistics", "land-price-2026"];
requiredTags.forEach((tag) => assert.ok(bank.COVERAGE.byDiagnosticTag[tag] >= 2, `${tag}: two sprint variants`));

const seenFactKeys = new Set();
for (const question of bank.QUESTIONS) {
  const source = baseQuestions[question.sourceQuestionId];
  assert.ok(source, `${question.id}: source exists`);
  assert.ok(["tax", "restrictions", "rights", "other"].includes(source.sectionId), `${question.id}: allowed source section`);
  assert.equal(question.text, source.text, `${question.id}: reuses verified prompt`);
  assert.strictEqual(question.choices, source.choices, `${question.id}: reuses choices without stale copy`);
  assert.equal(question.answer, source.answer, `${question.id}: answer traceability`);
  assert.equal(question.legalBaseline, "2026-04-01", `${question.id}: legal baseline`);
  assert.match(question.sourceUrl, /^https:\/\//, `${question.id}: official source URL`);
  assert.equal(question.sourceFacts.length, 4, `${question.id}: four source facts`);
  question.sourceFacts.forEach((fact, index) => {
    assert.equal(fact.key, `${source.id}:${index}`, `${question.id}: stable source-fact key`);
    assert.equal(fact.statement, source.choices[index], `${question.id}: statement traceability`);
    assert.equal(fact.legalBaseline, "2026-04-01", `${question.id}: fact baseline`);
    assert.ok(typeof fact.truth === "boolean", `${question.id}: fact truth`);
    assert.ok(fact.reason.length > 8, `${question.id}: fact explanation`);
    seenFactKeys.add(fact.key);
  });
  const presentedA = bank.presentQuestion(question, "2026-08-16");
  const presentedB = bank.presentQuestion(question, "2026-08-17");
  [presentedA, presentedB].forEach((presented) => {
    assert.equal(presented.choices.length, 4, `${question.id}: four presented choices`);
    assert.ok(presented.answer >= 0 && presented.answer < 4, `${question.id}: valid presented answer`);
    assert.equal(presented.choices[presented.answer], source.choices[source.answer], `${question.id}: answer survives rotation`);
  });
  assert.notDeepEqual(presentedA.presentationOrder, presentedB.presentationOrder, `${question.id}: daily presentation rotation`);
  assert.equal(question.variantOffset === 0 || question.variantOffset === 2, true, `${question.id}: paired rotation offset`);
}
assert.equal(seenFactKeys.size, 72, "four facts for eighteen verified sources, no invented fact IDs");

for (const prefix of ["sprint-tax", "sprint-law", "sprint-rights", "sprint-other"]) {
  const pairs = bank.QUESTIONS.filter((question) => question.id.startsWith(prefix));
  for (let index = 0; index < pairs.length; index += 2) {
    assert.equal(pairs[index].sourceQuestionId, pairs[index + 1].sourceQuestionId, `${prefix}: paired same-source second pass`);
    assert.notEqual(pairs[index].variantOffset, pairs[index + 1].variantOffset, `${prefix}: pair variant differs`);
  }
}

// No answer can be inferred from extreme wording: the sprint has copied no new
// propositions, and each base source remains governed by the main-bank audit.
assert.equal(bank.QUESTIONS.some((question) => question.sourceFacts.some((fact) => /^(必ず|常に|絶対に)/.test(fact.statement))), false, "no new extreme-word shortcut");
console.log("Takken Subject Sprint Bank audit passed: 36 questions / tax12 law8 rights8 other8 / 72 traced base facts.");
