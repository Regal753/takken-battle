"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const baseline = require("./official-law-baseline.js");

const exactKeys = (value, expected, label) => {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label}: exact schema`);
};

const assertDeepFrozen = (value, seen = new Set()) => {
  if (value === null || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) return;
  seen.add(value);
  assert.ok(Object.isFrozen(value), "every exported object must be frozen");
  Object.getOwnPropertyNames(value).forEach((name) => assertDeepFrozen(value[name], seen));
};

const apiFields = [
  "SCHEMA_VERSION",
  "CURRENT_LAW_BASELINE",
  "REVIEWED_AT",
  "MASTERY_FACT_TOTAL",
  "EXAM_IDS",
  "BUSINESS_QUESTION_NUMBERS",
  "SOURCES",
  "SOURCE_BY_ID",
  "LAW_CHANGES",
  "LAW_CHANGE_BY_ID",
  "QUESTION_CHANGES",
  "QUESTION_CHANGE_BY_KEY",
  "QUESTION_REVIEWS",
  "QUESTION_REVIEW_BY_KEY",
  "EXAM_BASELINES",
  "EXAM_BASELINE_BY_ID",
  "REQUIRED_SUPPLEMENT_QUESTION_KEYS",
  "getExamBaseline",
  "getQuestionReview",
  "assessCurrentLawProof"
];
const sourceFields = ["id", "publisher", "title", "url", "checkedAt"];
const lawChangeFields = [
  "id",
  "baseline",
  "effectiveDate",
  "reviewedAt",
  "title",
  "summary",
  "sourceIds",
  "supplementRequirementId"
];
const questionChangeFields = [
  "id",
  "examId",
  "questionNumber",
  "questionKey",
  "section",
  "baseline",
  "reviewStatus",
  "currentLawDisposition",
  "historicalAnswer",
  "currentLawAnswer",
  "affectedStatements",
  "historicalRule",
  "currentRule",
  "effectiveDate",
  "reviewedAt",
  "sourceIds",
  "lawChangeId",
  "supplementRequirementId"
];
const questionReviewFields = [
  "examId",
  "questionNumber",
  "questionKey",
  "section",
  "baseline",
  "reviewStatus",
  "currentLawProofEligible",
  "changeId",
  "reviewedAt"
];
const examFields = [
  "examId",
  "historicalLawStatus",
  "currentLawBaseline",
  "currentLawReviewStatus",
  "reviewedBusinessQuestionNumbers",
  "unreviewedBusinessQuestionNumbers",
  "canDeriveCurrentLawScore",
  "historicalScoringPolicy",
  "currentLawScoringPolicy"
];
const proofFields = ["schemaVersion", "examId", "examKnown", "historical", "currentLaw", "audit"];
const historicalProofFields = ["lawStatus", "businessScore", "perfect", "scoringPolicy"];
const currentLawProofFields = [
  "baseline",
  "historicalExamScoreUsed",
  "derivedExamScore",
  "proofMethod",
  "masterySatisfied",
  "supplementSatisfied",
  "missingRequirements",
  "eligible"
];
const auditProofFields = [
  "reviewStatus",
  "reviewedBusinessQuestionCount",
  "unreviewedBusinessQuestionCount",
  "failClosed"
];

exactKeys(baseline, apiFields, "API");
assert.equal(baseline.SCHEMA_VERSION, 1);
assert.equal(baseline.CURRENT_LAW_BASELINE, "2026-04-01");
assert.equal(baseline.REVIEWED_AT, "2026-08-15");
assert.equal(baseline.MASTERY_FACT_TOTAL, 134);
assert.deepEqual(baseline.EXAM_IDS, [
  "2025", "2024", "2023", "2022", "2021-12", "2021-10",
  "2020-12", "2020-10", "2019", "2018", "2017", "2016"
]);
assert.deepEqual(baseline.BUSINESS_QUESTION_NUMBERS, Array.from({ length: 20 }, (_, index) => index + 26));

assert.equal(baseline.SOURCES.length, 6);
for (const source of baseline.SOURCES) {
  exactKeys(source, sourceFields, source.id);
  assert.equal(source.checkedAt, baseline.REVIEWED_AT);
  assert.match(source.url, /^https:\/\//);
  assert.equal(baseline.SOURCE_BY_ID[source.id], source);
}
assert.match(
  baseline.SOURCE_BY_ID["egov-real-estate-brokerage-act-2026-04-01"].url,
  /[?&]occasion_date=20260401(?:&|$)/,
  "e-Gov current-law source must pin the baseline date"
);
assert.match(
  baseline.SOURCE_BY_ID["mlit-electronic-documents-2022"].url,
  /^https:\/\/www\.mlit\.go\.jp\//,
  "law-change source must be the official MLIT source"
);
assert.match(
  baseline.SOURCE_BY_ID["retio-2016-question-answer"].url,
  /^https:\/\/www\.retio\.or\.jp\/.*\.pdf$/,
  "question source must be the official RETIO PDF"
);

assert.equal(baseline.LAW_CHANGES.length, 1);
for (const change of baseline.LAW_CHANGES) {
  exactKeys(change, lawChangeFields, change.id);
  assert.equal(change.baseline, baseline.CURRENT_LAW_BASELINE);
  assert.equal(change.effectiveDate, "2022-05-18");
  assert.equal(change.reviewedAt, baseline.REVIEWED_AT);
  assert.ok(change.sourceIds.includes("mlit-electronic-documents-2022"));
  assert.ok(change.sourceIds.includes("egov-real-estate-brokerage-act-2026-04-01"));
  change.sourceIds.forEach((sourceId) => assert.ok(baseline.SOURCE_BY_ID[sourceId], sourceId));
  assert.equal(baseline.LAW_CHANGE_BY_ID[change.id], change);
}

assert.equal(baseline.QUESTION_CHANGES.length, 2);
for (const change of baseline.QUESTION_CHANGES) {
  exactKeys(change, questionChangeFields, change.questionKey);
  assert.equal(change.section, "business");
  assert.equal(change.baseline, baseline.CURRENT_LAW_BASELINE);
  assert.equal(change.reviewStatus, "reviewed-changed");
  assert.equal(change.effectiveDate, "2022-05-18");
  assert.equal(change.reviewedAt, baseline.REVIEWED_AT);
  assert.ok(baseline.LAW_CHANGE_BY_ID[change.lawChangeId]);
  change.sourceIds.forEach((sourceId) => assert.ok(baseline.SOURCE_BY_ID[sourceId], sourceId));
  assert.equal(baseline.QUESTION_CHANGE_BY_KEY[change.questionKey], change);
}

const h28q30 = baseline.QUESTION_CHANGE_BY_KEY["2016-q30"];
assert.equal(h28q30.historicalAnswer, 4);
assert.equal(h28q30.currentLawAnswer, 3);
assert.equal(h28q30.currentLawDisposition, "answer-changed");
assert.deepEqual(h28q30.affectedStatements, ["choice-3", "choice-4"]);

const r3q41 = baseline.QUESTION_CHANGE_BY_KEY["2021-10-q41"];
assert.equal(r3q41.historicalAnswer, 1);
assert.equal(r3q41.currentLawAnswer, null);
assert.equal(r3q41.currentLawDisposition, "rewrite-required");
assert.deepEqual(r3q41.affectedStatements, ["statement-a"]);

assert.equal(baseline.QUESTION_REVIEWS.length, 12 * 20);
assert.equal(new Set(baseline.QUESTION_REVIEWS.map((review) => review.questionKey)).size, 12 * 20);
for (const review of baseline.QUESTION_REVIEWS) {
  exactKeys(review, questionReviewFields, review.questionKey);
  assert.equal(review.section, "business");
  assert.equal(review.baseline, baseline.CURRENT_LAW_BASELINE);
  assert.equal(review.currentLawProofEligible, false, "historical questions never become current-law proof by inference");
  assert.ok(["unreviewed", "reviewed-changed"].includes(review.reviewStatus));
  assert.notEqual(review.reviewStatus, "reviewed-unchanged");
  if (review.reviewStatus === "unreviewed") {
    assert.equal(review.changeId, null);
    assert.equal(review.reviewedAt, null);
  } else {
    assert.ok(baseline.QUESTION_CHANGES.some((change) => change.id === review.changeId));
    assert.equal(review.reviewedAt, baseline.REVIEWED_AT);
  }
  assert.equal(baseline.QUESTION_REVIEW_BY_KEY[review.questionKey], review);
}
assert.equal(baseline.QUESTION_REVIEWS.filter((review) => review.reviewStatus === "reviewed-changed").length, 2);
assert.equal(baseline.QUESTION_REVIEWS.filter((review) => review.reviewStatus === "unreviewed").length, 238);

assert.equal(baseline.EXAM_BASELINES.length, 12);
for (const exam of baseline.EXAM_BASELINES) {
  exactKeys(exam, examFields, exam.examId);
  assert.equal(exam.historicalLawStatus, "historical");
  assert.equal(exam.currentLawBaseline, baseline.CURRENT_LAW_BASELINE);
  assert.ok(["partial", "unreviewed"].includes(exam.currentLawReviewStatus));
  assert.equal(exam.canDeriveCurrentLawScore, false);
  assert.equal(exam.historicalScoringPolicy, "preserve-official-answer-key");
  assert.equal(exam.currentLawScoringPolicy, "never-infer-from-historical-key");
  assert.equal(
    exam.reviewedBusinessQuestionNumbers.length + exam.unreviewedBusinessQuestionNumbers.length,
    20
  );
  assert.equal(baseline.EXAM_BASELINE_BY_ID[exam.examId], exam);
  assert.equal(baseline.getExamBaseline(exam.examId), exam);
}
assert.equal(baseline.getExamBaseline("missing"), null);
assert.equal(baseline.getQuestionReview("2016", 30).changeId, "2016-q30-current-law");
assert.equal(baseline.getQuestionReview("2021-10", 41).changeId, "2021-10-q41-current-law");
assert.equal(baseline.getQuestionReview("2025", 26).reviewStatus, "unreviewed");
assert.equal(baseline.getQuestionReview("2025", 25), null);
assert.equal(baseline.getQuestionReview("2025", "nope"), null);

const completeMastery = {
  baseline: "2026-04-01",
  totalFactCount: 134,
  masteredFactCount: 134,
  allFactsRetained: true,
  completedAt: "2026-08-15"
};
const completeSupplement = {
  baseline: "2026-04-01",
  masteredQuestionKeys: ["2016-q30", "2021-10-q41"],
  completedAt: "2026-08-15T12:00:00+09:00"
};

const historicalOnly = baseline.assessCurrentLawProof({
  examId: "2016",
  historicalBusinessScore: 20
});
exactKeys(historicalOnly, proofFields, "proof");
exactKeys(historicalOnly.historical, historicalProofFields, "proof.historical");
exactKeys(historicalOnly.currentLaw, currentLawProofFields, "proof.currentLaw");
exactKeys(historicalOnly.audit, auditProofFields, "proof.audit");
assert.equal(historicalOnly.historical.businessScore, 20);
assert.equal(historicalOnly.historical.perfect, true);
assert.equal(historicalOnly.currentLaw.historicalExamScoreUsed, false);
assert.equal(historicalOnly.currentLaw.derivedExamScore, null);
assert.equal(historicalOnly.currentLaw.eligible, false);
assert.deepEqual(historicalOnly.currentLaw.missingRequirements, [
  "current-law-134-question-retention",
  "current-law-changed-question-supplement"
]);

const masteryWithoutSupplement = baseline.assessCurrentLawProof({
  examId: "2016",
  historicalBusinessScore: 20,
  currentLawMastery: completeMastery
});
assert.equal(masteryWithoutSupplement.currentLaw.masterySatisfied, true);
assert.equal(masteryWithoutSupplement.currentLaw.supplementSatisfied, false);
assert.equal(masteryWithoutSupplement.currentLaw.eligible, false);

const completeProof = baseline.assessCurrentLawProof({
  examId: "2016",
  historicalBusinessScore: 20,
  currentLawMastery: completeMastery,
  currentLawSupplement: completeSupplement
});
assert.equal(completeProof.currentLaw.masterySatisfied, true);
assert.equal(completeProof.currentLaw.supplementSatisfied, true);
assert.equal(completeProof.currentLaw.eligible, true);
assert.deepEqual(completeProof.currentLaw.missingRequirements, []);
assert.equal(completeProof.audit.reviewStatus, "partial");
assert.equal(completeProof.audit.failClosed, true);

const wrongBaseline = baseline.assessCurrentLawProof({
  examId: "2016",
  historicalBusinessScore: 20,
  currentLawMastery: { ...completeMastery, baseline: "2025-04-01" },
  currentLawSupplement: completeSupplement
});
assert.equal(wrongBaseline.currentLaw.eligible, false);
assert.ok(wrongBaseline.currentLaw.missingRequirements.includes("current-law-134-question-retention"));

const impossibleCompletionDate = baseline.assessCurrentLawProof({
  examId: "2016",
  historicalBusinessScore: 20,
  currentLawMastery: { ...completeMastery, completedAt: "2026-99-99" },
  currentLawSupplement: completeSupplement
});
assert.equal(impossibleCompletionDate.currentLaw.eligible, false);
assert.ok(impossibleCompletionDate.currentLaw.missingRequirements.includes("current-law-134-question-retention"));

const stringScore = baseline.assessCurrentLawProof({
  examId: "2016",
  historicalBusinessScore: "20",
  currentLawMastery: completeMastery,
  currentLawSupplement: completeSupplement
});
assert.equal(stringScore.historical.businessScore, null);
assert.equal(stringScore.currentLaw.eligible, false);

const unknownExam = baseline.assessCurrentLawProof({
  examId: "unknown",
  historicalBusinessScore: 20,
  currentLawMastery: completeMastery,
  currentLawSupplement: completeSupplement
});
assert.equal(unknownExam.examKnown, false);
assert.equal(unknownExam.historical.businessScore, null);
assert.equal(unknownExam.currentLaw.eligible, false);
assert.deepEqual(unknownExam.currentLaw.missingRequirements, [
  "known-official-exam",
  "historical-business-20-of-20"
]);

assertDeepFrozen(baseline);
assertDeepFrozen(historicalOnly);
assertDeepFrozen(completeProof);

const browserSource = fs.readFileSync("official-law-baseline.js", "utf8");
const browserContext = { window: {} };
vm.createContext(browserContext);
vm.runInContext(browserSource, browserContext, { filename: "official-law-baseline.js" });
assert.ok(browserContext.window.TAKKEN_OFFICIAL_LAW_BASELINE);
assert.equal(browserContext.window.TAKKEN_OFFICIAL_LAW_BASELINE.CURRENT_LAW_BASELINE, "2026-04-01");
assert.equal(browserContext.window.TAKKEN_OFFICIAL_LAW_BASELINE.EXAM_IDS.length, 12);
assert.ok(Object.isFrozen(browserContext.window.TAKKEN_OFFICIAL_LAW_BASELINE));

console.log(JSON.stringify({
  status: "ok",
  schemaVersion: baseline.SCHEMA_VERSION,
  baseline: baseline.CURRENT_LAW_BASELINE,
  editions: baseline.EXAM_IDS.length,
  businessQuestionReviews: baseline.QUESTION_REVIEWS.length,
  reviewedChanged: baseline.QUESTION_CHANGES.length,
  unreviewedFailClosed: baseline.QUESTION_REVIEWS.filter((review) => review.reviewStatus === "unreviewed").length,
  historicalPerfectAloneIsCurrentProof: historicalOnly.currentLaw.eligible,
  combinedProofEligible: completeProof.currentLaw.eligible
}));
