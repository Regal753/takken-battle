"use strict";

const assert = require("node:assert/strict");
global.window = {};
require("./exam-blueprint.js");
require("./exam-question-core.js");
require("./exam-questions-rights.js");
require("./exam-questions-restrictions.js");
require("./exam-questions-tax-other.js");
const restrictionsSupplement = require("./restrictions-supplement-bank.js");
require("./restrictions-cases-city-land.js");
require("./restrictions-cases-building-readjustment.js");
require("./restrictions-cases-agriculture-fill.js");
const restrictionsAuthored = require("./restrictions-authored-bank.js");
const taxAuthored = require("./tax-authored-bank.js");
const baseQuestions = { ...window.TAKKEN_EXAM_QUESTIONS, ...restrictionsSupplement.QUESTIONS_BY_ID, ...restrictionsAuthored.QUESTIONS_BY_ID, ...taxAuthored.QUESTIONS_BY_ID };
const bank = require("./subject-sprint-bank.js");

const expectedSourceIds = Object.freeze({
  taxOther: ["t001","t002","t003","t004","t005","t006", ...taxAuthored.QUESTION_IDS],
  restrictions: ["l001","l002","l003","l004","l005","l006","l007","l008","l009","l010","l011","l012","l013","l014","l015","l016","l101","l102","rs001","rs002","rs003","rs004","rs005","rs006","rs007","rs008","rs009","rs010","rs011","rs012","rs013","rs014","rs015","rs016","rs017","rs018","rs019","rs020","rs021","rs022", ...restrictionsAuthored.QUESTION_IDS],
  rights: ["r001","r002","r003","r004","r005","r006","r007","r008","r009","r010","r011","r012","r013","r014","r015","r016","r017","r018","r019","r020","r021","r022","r023","r024","r025","r026","r027","r028","r101","r102","r103","r104","r105","r106","r107","r108","r109","r110","r111","r112","r113","r114","r115","r116"],
  other: ["o001","o002","o003","o004","o005","o006","o007","o008","o009","o010","o101","o102"]
});
const expectedTotal = Object.values(expectedSourceIds).flat().length;
function countPromptStatements(source) {
  return String(source.text || "").split(/\r?\n/).slice(1)
    .map((line) => line.match(/^\s*[アイウエ]\s+(.+)$/)?.[1]?.trim())
    .filter(Boolean);
}
assert.equal(bank.VERSION, 5, "bank version");
assert.equal(bank.LEGAL_BASELINE, "2026-04-01", "legal baseline");
assert.strictEqual(window.TAKKEN_SUBJECT_SPRINT_BANK, bank, "browser/CommonJS identity");
assert.ok(Object.isFrozen(bank) && Object.isFrozen(bank.QUESTIONS), "frozen public API");
assert.equal(bank.QUESTIONS.length, expectedTotal, "one item for every approved source question");
assert.equal(new Set(bank.QUESTIONS.map((question) => question.id)).size, expectedTotal, "unique sprint ids");
assert.equal(new Set(bank.QUESTIONS.map((question) => question.sourceQuestionId)).size, expectedTotal, "no duplicate source rotations masquerade as coverage");
assert.equal(bank.COVERAGE.sourceQuestionCount, expectedTotal, "coverage reports unique source count");
assert.deepEqual(bank.COVERAGE.bySection, { taxOther: 30, restrictions: 112, rights: 44, other: 12 }, "all approved sources by subject");
assert.deepEqual(bank.COVERAGE.byFormat, { "個数問題": 31, "単一選択": 161, "組合せ問題": 6 }, "mixed formats are retained from approved sources");
const expectedAll = Object.values(expectedSourceIds).flat().sort();
assert.deepEqual([...bank.COVERAGE.sourceQuestionIds].sort(), expectedAll, "exact source coverage: no hidden or omitted chapter");
for (const [sectionId, ids] of Object.entries(expectedSourceIds)) {
  assert.deepEqual(bank.QUESTIONS.filter((question) => question.sectionId === sectionId).map((question) => question.sourceQuestionId).sort(), [...ids].sort(), `${sectionId}: exact chapter coverage`);
}
const seenFactKeys = new Set();
for (const question of bank.QUESTIONS) {
  const source = baseQuestions[question.sourceQuestionId];
  assert.ok(source, `${question.id}: source exists`);
  assert.ok(["tax","taxOther","restrictions","rights","other"].includes(source.sectionId), `${question.id}: allowed source section`);
  assert.equal(question.text, source.text, `${question.id}: reuses verified prompt`);
  assert.strictEqual(question.choices, source.choices, `${question.id}: reuses choices without stale copy`);
  assert.equal(question.answer, source.answer, `${question.id}: answer traceability`);
  assert.equal(question.format, source.format, `${question.id}: format traceability`);
  assert.deepEqual(question.statementExplanations, source.choiceExplanations, `${question.id}: source-statement explanations are explicit`);
  assert.equal(question.legalBaseline, "2026-04-01", `${question.id}: legal baseline`);
  assert.match(question.sourceUrl, /^https:\/\//, `${question.id}: official source URL`);
  assert.ok(Array.isArray(question.sourceUrls) && question.sourceUrls.length >= 1, `${question.id}: source URL list`);
  assert.equal(question.sourceUrls[0], question.sourceUrl, `${question.id}: primary source URL`);
  assert.ok(question.tag.length >= 2 && question.diagnosticTags.length >= 1, `${question.id}: topic routing`);
  assert.equal(question.sourceFacts.length, 4, `${question.id}: four source facts`);
  question.sourceFacts.forEach((fact, index) => {
    assert.equal(fact.key, `${source.id}:${index}`, `${question.id}: stable source-fact key`);
    const expectedStatement = source.format === "単一選択"
      ? source.choices[index]
      : source.format === "個数問題"
      ? countPromptStatements(source)[index]
      : countPromptStatements(source)[index];
    assert.equal(fact.statement, expectedStatement, `${question.id}: statement traceability`);
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
    if (source.format !== "単一選択") {
      assert.deepEqual(presented.sourceFacts, question.sourceFacts, `${question.id}: count prompt facts keep ア〜エ order`);
      assert.deepEqual(presented.statementExplanations, question.statementExplanations, `${question.id}: count explanations keep ア〜エ order`);
    } else {
      assert.deepEqual(presented.sourceFacts.map((fact) => fact.statement), presented.choices, `${question.id}: single facts follow presented choices`);
      assert.deepEqual(presented.statementExplanations, presented.presentationOrder.map((index) => source.choiceExplanations[index]), `${question.id}: single explanations follow presented choices`);
    }
  }
  assert.notDeepEqual(presentedA.presentationOrder, presentedB.presentationOrder, `${question.id}: daily presentation rotation`);
}
assert.equal(seenFactKeys.size, expectedTotal * 4, "all traced facts derive from distinct verified source questions");
assert.ok(bank.QUESTIONS.some((question) => question.format === "個数問題"), "count-format practice present");
assert.ok(bank.QUESTIONS.some((question) => question.format === "組合せ問題"), "combination-format practice present");
assert.ok(bank.QUESTIONS.some((question) => question.text.includes("事例")), "case-format practice present");
const restrictionsIds = bank.QUESTIONS.filter((question) => question.sectionId === "restrictions").map((question) => question.id);
const diversified = bank.diversify(restrictionsIds);
assert.deepEqual([...diversified].sort(), [...restrictionsIds].sort(), "diversity planner preserves all restriction questions exactly once");
diversified.forEach((id, index) => {
  const anchor = bank.QUESTIONS_BY_ID[id].sourceAnchor;
  assert.ok(anchor, `${id}: source anchor`);
  [1, 2].forEach((distance) => {
    if (index >= distance) assert.notEqual(anchor, bank.QUESTIONS_BY_ID[diversified[index - distance]].sourceAnchor, `${id}: source anchor separated by ${distance}`);
  });
});
assert.deepEqual(bank.diversify(restrictionsIds), diversified, "diversity planner is deterministic");
const splitPriorityOrder = [
  "sprint-law-l001", "sprint-law-l002", "sprint-law-l003", "sprint-law-rs001",
  ...restrictionsIds.filter((id) => !["sprint-law-l001", "sprint-law-l002", "sprint-law-l003", "sprint-law-rs001"].includes(id))
];
const splitDiversified = bank.diversify(splitPriorityOrder);
const splitPending = [...splitPriorityOrder];
const splitRecent = [];
splitDiversified.forEach((id) => {
  const selected = bank.QUESTIONS_BY_ID[id];
  const hasSafeCandidate = splitPending.some((pendingId) =>
    !splitRecent.some((recentId) => bank.QUESTIONS_BY_ID[pendingId].sourceAnchor === bank.QUESTIONS_BY_ID[recentId].sourceAnchor)
  );
  if (hasSafeCandidate) {
    assert.equal(splitRecent.some((recentId) => selected.sourceAnchor === bank.QUESTIONS_BY_ID[recentId].sourceAnchor), false, `${id}: choose another law across ranking boundaries`);
  }
  splitPending.splice(splitPending.indexOf(id), 1);
  splitRecent.push(id);
  if (splitRecent.length > 2) splitRecent.shift();
});
assert.equal(bank.QUESTIONS_BY_ID["sprint-law-rs014"].sourceUrls.length, 2, "road question keeps both governing statutes");
[
  "sprint-law-rs015", "sprint-law-rs016", "sprint-law-rs017", "sprint-law-rs018",
  "sprint-law-rs019", "sprint-law-rs020", "sprint-law-rs021", "sprint-law-rs022"
].forEach((id) => {
  const frame = bank.QUESTIONS_BY_ID[id]?.groundingFrame;
  assert.ok(frame && typeof frame === "object", `${id}: grounded precision frame`);
  ["area", "action", "actor", "threshold"].forEach((key) =>
    assert.ok(String(frame[key] || "").trim().length >= 4, `${id}: grounded precision ${key}`)
  );
});
// All learner-facing wording is copied from the fixed core or the separately
// audited restriction/tax supplements; this sprint layer only routes/presents it.
console.log("Takken Subject Sprint Bank audit passed: 198 approved sources / tax30 law112 rights44 other12 / 792 traced facts / source-anchor separation 2.");
