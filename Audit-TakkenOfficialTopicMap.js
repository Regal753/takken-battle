"use strict";

const assert = require("node:assert/strict");
const data = require("./official-exam-data.js");
const map = require("./official-topic-map.js");

assert.equal(map.VERSION, 1);
assert.deepEqual(map.COVERED_EXAM_IDS, ["2025", "2024", "2023", "2022"]);
assert.ok(Object.isFrozen(map) && Object.isFrozen(map.RECORDS), "frozen browser/CommonJS API");
assert.equal(map.RECORDS.length, 200, "four complete official papers");
assert.equal(new Set(map.RECORDS.map((record) => record.id)).size, 200, "unique records");

const expectedBySection = { rights: 14, restrictions: 8, business: 20, taxOther: 8 };
for (const examId of map.COVERED_EXAM_IDS) {
  const official = data.EXAM_BY_ID[examId];
  const rows = map.RECORDS_BY_EXAM_ID[examId];
  assert.ok(official, `${examId}: official data exists`);
  assert.equal(rows.length, 50, `${examId}: exactly 50 map rows`);
  assert.deepEqual(rows.map((record) => record.questionNo), Array.from({ length: 50 }, (_, index) => index + 1), `${examId}: every Q1-Q50 once`);
  const counts = Object.fromEntries(Object.keys(expectedBySection).map((sectionId) => [
    sectionId,
    rows.filter((record) => record.sectionId === sectionId).length
  ]));
  assert.deepEqual(counts, expectedBySection, `${examId}: official section allocation`);
  for (const record of rows) {
    assert.equal(record.sectionId, data.SECTION_BY_NUMBER(record.questionNo), `${record.id}: official section`);
    assert.equal(record.currentLawStatus, "historical-unreviewed", `${record.id}: no fabricated current-law review`);
    assert.equal(record.historicalLawRisk, true, `${record.id}: historical caution`);
    assert.equal(record.topicId, null, `${record.id}: no unverified topic id`);
    assert.equal(record.topicVerification, "official-coordinate-only", `${record.id}: verification boundary`);
    assert.match(record.sourceUrl, /^https:\/\/(?:www\.)?(?:goukaku\.)?retio\.or\.jp\//, `${record.id}: RETIO question source`);
    assert.match(record.answerSourceUrl, /^https:\/\/www\.retio\.or\.jp\//, `${record.id}: RETIO answer source`);
    assert.equal(record.repairTarget.kind, "section-fallback", `${record.id}: explicit safe fallback`);
    assert.equal(record.repairTarget.sectionId, record.sectionId, `${record.id}: fallback section`);
    assert.ok(["subject-sprint", "business-knock"].includes(record.repairTarget.route), `${record.id}: existing repair route`);
    assert.equal(record.repairTarget.requiresCurrentLawCheck, true, `${record.id}: current-law gate`);
    const plan = map.repairPlan(examId, record.questionNo);
    assert.equal(plan.countsTowardCurrentLawMastery, false, `${record.id}: history cannot earn current-law mastery`);
    assert.equal(plan.primary, record.repairTarget, `${record.id}: repair target identity`);
  }
}

assert.equal(map.lookup("2025", 1).id, "2025-q01");
assert.equal(map.lookup("2022", 50).id, "2022-q50");
assert.equal(map.lookup("2021-12", 1), null, "out-of-scope paper fails closed");
assert.equal(map.lookup("2025", 51), null, "out-of-range question fails closed");
assert.ok(map.HISTORICAL_NOTICE.includes("現行法"));

console.log(JSON.stringify({
  status: "ok",
  records: map.RECORDS.length,
  exams: map.COVERED_EXAM_IDS.length,
  allocation: expectedBySection,
  currentLawStatus: "historical-unreviewed",
  repair: "section-fallback-with-current-law-check"
}));
