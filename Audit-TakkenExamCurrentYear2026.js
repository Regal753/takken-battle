"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const data = require("./exam-current-year-2026.js");

const exactKeys = (value, keys, label) => assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), label);
const assertDeepFrozen = (value, seen = new Set()) => {
  if (value === null || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) return;
  seen.add(value);
  assert.ok(Object.isFrozen(value), "all exported reachable objects must be frozen");
  Object.getOwnPropertyNames(value).forEach((key) => assertDeepFrozen(value[key], seen));
};

exactKeys(data, ["SCHEMA_VERSION", "EXAM_YEAR", "LEGAL_BASELINE", "REVIEWED_AT", "SOURCES", "SOURCE_BY_ID", "EXAM", "SUBJECT_ALLOCATION", "FRESHNESS_CARDS", "FRESHNESS_CARD_BY_ID", "assessFreshness", "assessAllFreshness"], "api schema");
assert.equal(data.SCHEMA_VERSION, 2);
assert.equal(data.EXAM_YEAR, 2026);
assert.equal(data.LEGAL_BASELINE, "2026-04-01");
assert.equal(data.REVIEWED_AT, "2026-08-16");

for (const source of data.SOURCES) {
  exactKeys(source, ["id", "publisher", "title", "url", "checkedAt", "snapshotId", "snapshotHash"], `source ${source.id}`);
  assert.match(source.url, /^https:\/\/(?:moushikomi\.retio\.or\.jp|www\.retio\.or\.jp|www\.mlit\.go\.jp)\//);
  assert.equal(source.checkedAt, data.REVIEWED_AT);
  assert.equal(source.snapshotId, `${source.id}@${source.checkedAt}`);
  assert.match(source.snapshotHash, /^[a-f0-9]{64}$/);
  assert.equal(data.SOURCE_BY_ID[source.id], source);
}
assert.match(data.SOURCE_BY_ID["retio-2026-exam-guide"].url, /^https:\/\/moushikomi\.retio\.or\.jp\/?$/);
assert.match(data.SOURCE_BY_ID["mlit-takken-law-2026"].url, /^https:\/\/www\.mlit\.go\.jp\//);

exactKeys(data.EXAM, ["legalBaseline", "examDate", "regular", "fiveQuestionExempt", "result", "sourceIds", "reviewedAt", "expiresOn"], "exam schema");
assert.equal(data.EXAM.legalBaseline, "2026-04-01");
assert.equal(data.EXAM.examDate, "2026-10-18");
assert.deepEqual(data.EXAM.regular, { startTime: "13:00", endTime: "15:00", durationMinutes: 120, questionCount: 50 });
assert.deepEqual(data.EXAM.fiveQuestionExempt, { startTime: "13:10", endTime: "15:00", durationMinutes: 110, questionCount: 45 });
assert.deepEqual(data.EXAM.result, { date: "2026-11-25", time: "09:30" });

assert.deepEqual(data.SUBJECT_ALLOCATION.map(({ id, questionCount }) => [id, questionCount]), [["rights", 14], ["restrictions", 8], ["tax-other", 3], ["business", 20], ["exempt", 5]]);
assert.equal(data.SUBJECT_ALLOCATION.reduce((sum, item) => sum + item.questionCount, 0), 50);
assert.equal(data.SUBJECT_ALLOCATION.find((item) => item.id === "business").questionRange, "26-45");

assert.equal(data.FRESHNESS_CARDS.length, 5);
for (const card of data.FRESHNESS_CARDS) {
  exactKeys(card, ["id", "category", "title", "status", "reviewedAt", "checkedAt", "maxAgeDays", "effectiveOn", "expiresOn", "sourceIds", "reviewReceipt", "answerPolicy", "checkpoint"], `card ${card.id}`);
  assert.equal(card.status, "reviewed");
  assert.equal(card.reviewedAt, data.REVIEWED_AT);
  assert.equal(card.checkedAt, data.REVIEWED_AT);
  assert.ok(Number.isInteger(card.maxAgeDays) && card.maxAgeDays >= 1);
  assert.ok(card.sourceIds.length > 0);
  card.sourceIds.forEach((id) => assert.ok(data.SOURCE_BY_ID[id], id));
  exactKeys(card.reviewReceipt, ["checkedAt", "sourceSnapshotHashes"], `${card.id} receipt`);
  assert.equal(card.reviewReceipt.checkedAt, card.checkedAt);
  assert.deepEqual(Object.keys(card.reviewReceipt.sourceSnapshotHashes).sort(), [...card.sourceIds].sort());
  card.sourceIds.forEach((id) => {
    assert.equal(data.SOURCE_BY_ID[id].checkedAt, card.checkedAt);
    assert.equal(card.reviewReceipt.sourceSnapshotHashes[id], data.SOURCE_BY_ID[id].snapshotHash);
  });
  assert.equal(data.FRESHNESS_CARD_BY_ID[card.id], card);
}
for (const card of data.FRESHNESS_CARDS.filter((card) => card.category === "statistics")) {
  assert.equal(card.answerPolicy, "source-checkpoint-no-stored-quiz-numerics");
  assert.doesNotMatch(card.checkpoint, /\d+(?:\.\d+)?%/);
}

assert.deepEqual(data.assessFreshness("law-baseline-2026-04-01", "2026-08-16"), { status: "current", current: true, failClosed: false, reason: null });
assert.deepEqual(data.assessFreshness("tax-holding-2026", "2026-10-19"), { status: "expired", current: false, failClosed: true, reason: "past-expiry-date" });
assert.deepEqual(data.assessFreshness("missing", "2026-08-16"), { status: "unknown", current: false, failClosed: true, reason: "invalid-or-missing-freshness-data" });
assert.deepEqual(data.assessFreshness("tax-holding-2026", "not-a-date"), { status: "unknown", current: false, failClosed: true, reason: "invalid-or-missing-freshness-data" });
assert.deepEqual(data.assessFreshness("law-baseline-2026-04-01", "2026-09-01"), { status: "stale", current: false, failClosed: true, reason: "review-receipt-expired" });
const baseCard = data.FRESHNESS_CARD_BY_ID["law-baseline-2026-04-01"];
const refreshedCard = {
  ...baseCard,
  reviewedAt: "2026-08-28",
  checkedAt: "2026-08-28",
  reviewReceipt: { ...baseCard.reviewReceipt, checkedAt: "2026-08-28" }
};
assert.deepEqual(data.assessFreshness(refreshedCard, "2026-09-01"), { status: "unknown", current: false, failClosed: true, reason: "invalid-or-missing-review-receipt" });
const changedHashCard = {
  ...baseCard,
  reviewReceipt: {
    ...baseCard.reviewReceipt,
    sourceSnapshotHashes: { ...baseCard.reviewReceipt.sourceSnapshotHashes, "mlit-takken-law-2026": "0".repeat(64) }
  }
};
assert.deepEqual(data.assessFreshness(changedHashCard, "2026-08-16"), { status: "unknown", current: false, failClosed: true, reason: "invalid-or-missing-review-receipt" });
const missingReceiptCard = { ...baseCard, reviewReceipt: null };
assert.deepEqual(data.assessFreshness(missingReceiptCard, "2026-08-16"), { status: "unknown", current: false, failClosed: true, reason: "invalid-or-missing-review-receipt" });
const missingSourceCard = { ...baseCard, sourceIds: ["untrusted-example"] };
assert.deepEqual(data.assessFreshness(missingSourceCard, "2026-08-16"), { status: "unknown", current: false, failClosed: true, reason: "missing-primary-source" });
const invalidDateCard = { ...baseCard, checkedAt: "2026-02-30" };
assert.deepEqual(data.assessFreshness(invalidDateCard, "2026-08-16"), { status: "unknown", current: false, failClosed: true, reason: "invalid-or-missing-freshness-data" });
const allCurrent = data.assessAllFreshness("2026-08-16");
assert.equal(allCurrent.current, true);
assert.equal(allCurrent.failClosed, false);
assert.equal(allCurrent.cards.length, 5);
const allExpired = data.assessAllFreshness("2026-10-19");
assert.equal(allExpired.current, false);
assert.equal(allExpired.failClosed, true);
const allStale = data.assessAllFreshness("2026-09-01");
assert.equal(allStale.current, false);
assert.equal(allStale.failClosed, true);
assert.ok(allStale.cards.every((entry) => entry.status === "stale"));

assertDeepFrozen(data);
const source = fs.readFileSync(require.resolve("./exam-current-year-2026.js"), "utf8");
const sandbox = { window: {} };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: "exam-current-year-2026.js" });
assert.ok(sandbox.window.TAKKEN_EXAM_CURRENT_YEAR_2026);
assert.equal(sandbox.window.TAKKEN_EXAM_CURRENT_YEAR_2026.EXAM_YEAR, 2026);
assert.ok(Object.isFrozen(sandbox.window.TAKKEN_EXAM_CURRENT_YEAR_2026));

console.log("PASS Audit-TakkenExamCurrentYear2026");
