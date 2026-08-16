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

const expectedSourceIds = Object.freeze({
  taxOther: ["t001","t002","t003","t004","t005","t006"],
  restrictions: ["l001","l002","l003","l004","l005","l006","l007","l008","l009","l010","l011","l012","l013","l014","l015","l016","l101","l102"],
  rights: ["r001","r002","r003","r004","r005","r006","r007","r008","r009","r010","r011","r012","r013","r014","r015","r016","r017","r018","r019","r020","r021","r022","r023","r024","r025","r026","r027","r028","r101","r102","r103","r104","r105","r106","r107","r108","r109","r110","r111","r112","r113","r114","r115","r116"],
  other: ["o001","o002","o003","o004","o005","o006","o007","o008","o009","o010","o101","o102"]
});
const expectedTotal = Object.values(expectedSourceIds).flat().length;
assert.equal(bank.VERSION, 2, "bank version");
assert.equal(bank.LEGAL_BASELINE, "2026-04-01", "legal baseline");
assert.strictEqual(window.TAKKEN_SUBJECT_SPRINT_BANK, bank, "browser/CommonJS identity");
assert.ok(Object.isFrozen(bank) && Object.isFrozen(bank.QUESTIONS), "frozen public API");
assert.equal(bank.QUESTIONS.length, expectedTotal, "one item for every approved source question");
assert.equal(new Set(bank.QUESTIONS.map((question) => question.id)).size, expectedTotal, "unique sprint ids");
assert.equal(new Set(bank.QUESTIONS.map((question) => question.sourceQuestionId)).size, expectedTotal, "no duplicate source rotations masquerade as coverage");
assert.equal(bank.COVERAGE.sourceQuestionCount, expectedTotal, "coverage reports unique source count");
assert.deepEqual(bank.COVERAGE.bySection, { taxOther: 6, restrictions: 18, rights: 44, other: 12 }, "all available chapter sources by subject");
assert.deepEqual(bank.COVERAGE.byFormat, { "個数問題": 4, "単一選択": 76 }, "mixed single/count formats are retained from verified sources");
const expectedAll = Object.values(expectedSourceIds).flat().sort();
assert.deepEqual([...bank.COVERAGE.sourceQuestionIds].sort(), expectedAll, "exact source coverage: no hidden or omitted chapter");
for (const [sectionId, ids] of Object.entries(expectedSourceIds)) {
  assert.deepEqual(bank.QUESTIONS.filter((question) => question.sectionId === sectionId).map((question) => question.sourceQuestionId).sort(), [...ids].sort(), `${sectionId}: exact chapter coverage`);
}
const seenFactKeys = new Set();
for (const question of bank.QUESTIONS) {
  const source = baseQuestions[question.sourceQuestionId];
  assert.ok(source, `${question.id}: source exists`);
  assert.ok(["tax","restrictions","rights","other"].includes(source.sectionId), `${question.id}: allowed source section`);
  assert.equal(question.text, source.text, `${question.id}: reuses verified prompt`);
  assert.strictEqual(question.choices, source.choices, `${question.id}: reuses choices without stale copy`);
  assert.equal(question.answer, source.answer, `${question.id}: answer traceability`);
  assert.equal(question.format, source.format, `${question.id}: format traceability`);
  assert.equal(question.legalBaseline, "2026-04-01", `${question.id}: legal baseline`);
  assert.match(question.sourceUrl, /^https:\/\//, `${question.id}: official source URL`);
  assert.ok(question.tag.length >= 2 && question.diagnosticTags.length >= 1, `${question.id}: topic routing`);
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
  for (const presented of [presentedA, presentedB]) {
    assert.equal(presented.choices.length, 4, `${question.id}: four presented choices`);
    assert.ok(presented.answer >= 0 && presented.answer < 4, `${question.id}: valid presented answer`);
    assert.equal(presented.choices[presented.answer], source.choices[source.answer], `${question.id}: answer survives rotation`);
  }
  assert.notDeepEqual(presentedA.presentationOrder, presentedB.presentationOrder, `${question.id}: daily presentation rotation`);
}
assert.equal(seenFactKeys.size, expectedTotal * 4, "all traced facts derive from distinct verified source questions");
assert.ok(bank.QUESTIONS.some((question) => question.format === "個数問題"), "count-format practice present");
assert.ok(bank.QUESTIONS.some((question) => question.text.includes("事例")), "case-format practice present");
// Any wording (including an intentionally tempting absolute) is the source
// wording above; this bank introduces no learner-facing legal proposition.
console.log("Takken Subject Sprint Bank audit passed: 80 unique verified sources / tax6 law18 rights44 other12 / 320 traced facts / single76 count4.");
