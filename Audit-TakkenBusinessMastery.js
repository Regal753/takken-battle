"use strict";

process.env.TZ = "Asia/Tokyo";

const assert = require("node:assert/strict");
const mastery = require("./business-mastery.js");

assert.deepEqual(mastery.REVIEW_INTERVAL_DAYS, [1, 3, 7, 14, 30]);
assert.equal(mastery.DURABLE_LEVEL, 6);
assert.equal(mastery.BUSINESS_UNIT_IDS.length, 11);
assert.equal(new Set(mastery.BUSINESS_UNIT_IDS).size, 11);

const firstAt = "2026-08-14T23:55:00+09:00";
let item = mastery.recordOutcome({}, {
  correct: true,
  confidence: "confident",
  answeredAt: firstAt
});
assert.deepEqual(item, {
  reviewLevel: 1,
  masteryDueKey: "2026-08-15",
  confidentDayKeys: ["2026-08-14"]
});
assert.equal(
  mastery.stateFor({ attempts: 1, lastConfidence: "confident", lastAnsweredAt: firstAt, ...item }, firstAt),
  "learning"
);
assert.equal(
  mastery.stateFor(
    { attempts: 1, lastConfidence: "confident", lastAnsweredAt: firstAt, ...item },
    "2026-08-15T00:00:00+09:00"
  ),
  "due"
);

const sameDay = mastery.recordOutcome({ ...item, lastConfidence: "confident", lastAnsweredAt: firstAt }, {
  correct: true,
  confidence: "confident",
  answeredAt: "2026-08-14T23:59:00+09:00"
});
assert.equal(sameDay.reviewLevel, 1, "same-day repetition must not advance");
assert.equal(sameDay.masteryDueKey, "2026-08-15", "same-day repetition must not postpone due day");

item = mastery.recordOutcome({ ...item, lastConfidence: "confident", lastAnsweredAt: firstAt }, {
  correct: true,
  confidence: "confident",
  answeredAt: "2026-08-15T00:01:00+09:00"
});
assert.equal(item.reviewLevel, 2);
assert.equal(item.masteryDueKey, "2026-08-18");
assert.equal(
  mastery.stateFor({ attempts: 2, lastConfidence: "confident", lastAnsweredAt: "2026-08-15T00:01:00+09:00", ...item }, "2026-08-15T00:02:00+09:00"),
  "retained"
);

const earlyReview = mastery.recordOutcome({ ...item, lastConfidence: "confident", lastAnsweredAt: "2026-08-15T00:01:00+09:00" }, {
  correct: true,
  confidence: "confident",
  answeredAt: "2026-08-16T10:00:00+09:00"
});
assert.equal(earlyReview.reviewLevel, 2, "review before due day must not advance");
assert.equal(earlyReview.masteryDueKey, "2026-08-18", "early review must preserve the due day");

for (const answeredAt of [
  "2026-08-18T08:00:00+09:00",
  "2026-08-25T08:00:00+09:00",
  "2026-09-08T08:00:00+09:00"
]) {
  item = mastery.recordOutcome({ ...item, lastConfidence: "confident", lastAnsweredAt: item.confidentDayKeys.at(-1) }, { correct: true, confidence: "confident", answeredAt });
}
assert.equal(item.reviewLevel, 5);
assert.equal(item.masteryDueKey, "2026-10-08");
assert.equal(
  mastery.stateFor({ attempts: 5, lastConfidence: "confident", lastAnsweredAt: "2026-09-08T08:00:00+09:00", ...item }, "2026-09-09T09:00:00+09:00"),
  "retained",
  "passing the 14-day review must not complete mastery before the 30-day recall"
);
assert.equal(
  mastery.stateFor({ attempts: 5, lastConfidence: "confident", lastAnsweredAt: "2026-09-08T08:00:00+09:00", ...item }, "2026-10-08T00:00:00+09:00"),
  "due",
  "level 5 still requires its next scheduled recall"
);

item = mastery.recordOutcome({ ...item, lastConfidence: "confident", lastAnsweredAt: "2026-09-08T08:00:00+09:00" }, {
  correct: true,
  confidence: "confident",
  answeredAt: "2026-10-08T00:01:00+09:00"
});
assert.equal(item.reviewLevel, 6, "the successful 30-day recall must create the durable state");
assert.equal(item.masteryDueKey, "", "durable mastery must not retain a stale due day");
assert.equal(
  mastery.stateFor({ attempts: 6, lastConfidence: "confident", lastAnsweredAt: "2026-10-08T00:01:00+09:00", ...item }, "2026-10-08T00:02:00+09:00"),
  "durable"
);

const wrong = mastery.recordOutcome(item, {
  correct: false,
  confidence: "wrong",
  answeredAt: "2026-09-09T09:00:00+09:00"
});
assert.deepEqual(wrong, { reviewLevel: 0, masteryDueKey: "", confidentDayKeys: [] });
assert.equal(mastery.stateFor({ attempts: 6, lastConfidence: "wrong", ...wrong }, firstAt), "retry");
const uncertain = mastery.recordOutcome(item, {
  correct: true,
  confidence: "uncertain",
  answeredAt: "2026-09-09T09:00:00+09:00"
});
assert.equal(uncertain.reviewLevel, 0);

const legacy = mastery.normalizeMasteryHistory({
  attempts: 3,
  lastConfidence: "confident",
  lastAnsweredAt: firstAt
});
assert.equal(legacy.reviewLevel, 1, "legacy confident history must migrate conservatively");
assert.equal(legacy.masteryDueKey, "2026-08-15");
assert.deepEqual(
  mastery.normalizeMasteryHistory({ ...legacy, lastConfidence: "confident", lastAnsweredAt: firstAt }),
  legacy,
  "normalization must be idempotent when saved evidence metadata is present"
);
assert.equal(mastery.normalizeMasteryHistory({ reviewLevel: 99 }).reviewLevel, 0);
assert.equal(mastery.normalizeMasteryHistory({ reviewLevel: -4 }).reviewLevel, 0);
assert.equal(mastery.normalizeMasteryHistory({
  reviewLevel: 2,
  masteryDueKey: "2026-08-20",
  confidentDayKeys: ["2026-08-14"],
  lastAnsweredAt: "2026-08-14T12:00:00+09:00"
}).reviewLevel, 0, "retention without two distinct confident days must fail closed");
assert.equal(mastery.normalizeMasteryHistory({
  reviewLevel: 5,
  masteryDueKey: "2026-10-08",
  confidentDayKeys: ["2026-08-14", "2026-08-15", "2026-08-18", "2026-08-25", "2026-09-08"],
  lastAnsweredAt: "2026-09-08T12:00:00+09:00",
  lastConfidence: "wrong"
}).reviewLevel, 0, "a later wrong answer must demote immediately during normalization");
assert.equal(mastery.dayKey("2026-02-30"), "", "invalid calendar keys must be rejected");

const priorityEntries = [
  { attempts: 1, lastConfidence: "wrong" },
  { attempts: 1, lastConfidence: "confident", lastAnsweredAt: "2026-08-13T12:00:00+09:00", reviewLevel: 1, masteryDueKey: "2026-08-14", confidentDayKeys: ["2026-08-13"] },
  {},
  { attempts: 1, lastConfidence: "confident", lastAnsweredAt: "2026-08-14T12:00:00+09:00", reviewLevel: 1, masteryDueKey: "2026-08-20", confidentDayKeys: ["2026-08-14"] },
  { attempts: 2, lastConfidence: "confident", lastAnsweredAt: "2026-08-13T12:00:00+09:00", reviewLevel: 2, masteryDueKey: "2026-08-20", confidentDayKeys: ["2026-08-10", "2026-08-13"] },
  { attempts: 6, lastConfidence: "confident", lastAnsweredAt: "2026-07-26T12:00:00+09:00", reviewLevel: 6, masteryDueKey: "", confidentDayKeys: ["2026-06-01", "2026-06-02", "2026-06-05", "2026-06-12", "2026-06-26", "2026-07-26"] }
];
assert.deepEqual(
  priorityEntries.map((entry) => mastery.priorityFor(entry, "2026-08-14T12:00:00+09:00")),
  [0, 1, 2, 3, 4, 5]
);

const unit = { id: "business-book-01", label: "01-01 宅建業法の基本" };
const questions = [1, 2, 3, 4].map((number) => ({ id: `pv-${number}`, unitId: unit.id }));
const durableHistory = Object.fromEntries(questions.map((question) => [question.id, {
  attempts: 6,
  lastConfidence: "confident",
  reviewLevel: 6,
  masteryDueKey: "",
  lastAnsweredAt: "2026-07-26T12:00:00+09:00",
  confidentDayKeys: ["2026-06-01", "2026-06-02", "2026-06-05", "2026-06-12", "2026-06-26", "2026-07-26"]
}]));
const complete = mastery.summarizeOverall([unit], questions, durableHistory, "2026-09-09T09:00:00+09:00");
assert.equal(complete.durableUnits, 1);
const awaitingFinalRecall = Object.fromEntries(questions.map((question) => [question.id, {
  attempts: 5,
  lastConfidence: "confident",
  reviewLevel: 5,
  masteryDueKey: "2026-10-08",
  lastAnsweredAt: "2026-09-08T12:00:00+09:00",
  confidentDayKeys: ["2026-08-01", "2026-08-02", "2026-08-05", "2026-08-12", "2026-09-08"]
}]));
assert.equal(
  mastery.summarizeOverall([unit], questions, awaitingFinalRecall, "2026-09-09T09:00:00+09:00").durableUnits,
  0,
  "a unit awaiting its 30-day recall must not be shown as complete"
);
durableHistory[questions[3].id] = { attempts: 1, lastConfidence: "confident", lastAnsweredAt: "2026-09-09T12:00:00+09:00", reviewLevel: 1, masteryDueKey: "2026-09-10", confidentDayKeys: ["2026-09-09"] };
assert.equal(
  mastery.summarizeOverall([unit], questions, durableHistory, "2026-09-09T09:00:00+09:00").durableUnits,
  0,
  "a unit must not complete until all four questions are durable"
);

const requiredChain = [
  "2026-08-01", "2026-08-02", "2026-08-05",
  "2026-08-12", "2026-08-26", "2026-09-25"
];
assert.equal(mastery.normalizeMasteryHistory({
  reviewLevel: 6,
  masteryDueKey: "",
  confidentDayKeys: [
    "2026-08-01", "2026-08-02", "2026-08-03",
    "2026-08-04", "2026-08-05", "2026-08-06"
  ],
  lastConfidence: "confident",
  lastAnsweredAt: "2026-08-06T12:00:00+09:00"
}).reviewLevel, 0, "six consecutive days must not forge the 1/3/7/14/30-day chain");
assert.deepEqual(mastery.normalizeMasteryHistory({
  reviewLevel: 5,
  masteryDueKey: "2099-12-31",
  confidentDayKeys: requiredChain.slice(0, 5),
  lastConfidence: "confident",
  lastAnsweredAt: "2026-08-26T12:00:00+09:00"
}), {
  reviewLevel: 5,
  masteryDueKey: "2026-09-25",
  confidentDayKeys: requiredChain.slice(0, 5)
}, "saved due dates must be recomputed from accepted evidence");
assert.equal(mastery.normalizeMasteryHistory({
  reviewLevel: 6,
  confidentDayKeys: requiredChain,
  lastConfidence: "confident",
  lastAnsweredAt: "2026-08-26T12:00:00+09:00"
}).reviewLevel, 0, "a confident day after lastAnsweredAt must not elevate the save");
const futureDurable = {
  attempts: 6,
  lastConfidence: "confident",
  reviewLevel: 6,
  masteryDueKey: "",
  confidentDayKeys: requiredChain,
  lastAnsweredAt: "2026-09-25T12:00:00+09:00"
};
assert.notEqual(
  mastery.stateFor(futureDurable, "2026-09-24T23:59:00+09:00"),
  "durable",
  "future evidence must not survive a clock rollback as durable"
);
assert.equal(
  mastery.summarizeOverall([unit], questions, Object.fromEntries(
    questions.map((question) => [question.id, futureDurable])
  ), "2026-09-24T23:59:00+09:00").durableUnits,
  0
);
assert.equal(mastery.stateFor(futureDurable, "2026-09-25T00:00:00+09:00"), "durable");

const answers50 = Object.fromEntries(
  Array.from({ length: 50 }, (_, index) => [String(index + 1), 1])
);
const officialEvidence = (examId, day, business = 20, overrides = {}) => ({
  examId,
  attemptType: "initial",
  sourceMode: "timed-answer-sheet",
  evidenceVersion: 2,
  startedAt: `${day}T09:00:00+09:00`,
  startedDayKey: day,
  completedAt: `${day}T10:59:00+09:00`,
  appUnseenAtStart: true,
  lawBaseline: "2026-04-01",
  timed120: true,
  lawChecked: true,
  elapsedMinutes: 119,
  answers: { ...answers50 },
  business,
  ...overrides
});
assert.equal(mastery.officialEvidenceQualifies(officialEvidence("2025", "2026-08-01")), true);
assert.equal(mastery.officialEvidenceQualifies(officialEvidence("2025", "2026-08-01", "20")), false, "string scores fail closed");
assert.equal(mastery.officialEvidenceQualifies(officialEvidence("2025", "2026-08-01", 20, {
  answers: { ...answers50, fake: 1 }
})), false, "a fake fifty-first answer key must be rejected");
assert.equal(mastery.officialEvidenceQualifies(officialEvidence("2025", "2026-08-01", 20, {
  startedDayKey: "2026-08-02"
})), false, "the saved study day must match startedAt");
assert.equal(mastery.officialEvidenceQualifies(officialEvidence("2025", "2026-08-01", 20, {
  elapsedMinutes: -1
})), false, "negative elapsed time must be rejected");
assert.equal(mastery.officialEvidenceQualifies(officialEvidence("2025", "2026-08-01", 20, {
  elapsedMinutes: "119"
})), false, "string elapsed time must not become proof");
assert.equal(mastery.officialEvidenceQualifies(officialEvidence("2025", "2026-08-01", 20, {
  completedAt: "2026-08-01T08:59:00+09:00"
})), false, "completion before start must be rejected");
assert.equal(mastery.officialEvidenceQualifies(officialEvidence("2025", "2026-08-01", 20, {
  appUnseenAtStart: false
})), true, "exposure is evaluated when selecting first-exposure proof, not general validity");

const firstThreePerfect = [
  officialEvidence("2025", "2026-08-01"),
  officialEvidence("2024", "2026-08-02"),
  officialEvidence("2023", "2026-08-03")
];
let officialProof = mastery.summarizeOfficialProof(firstThreePerfect);
assert.equal(officialProof.ready, true);
assert.equal(officialProof.perfect, 3);
assert.equal(mastery.summarizeOfficialProof([
  firstThreePerfect[0],
  officialEvidence("2024", "2026-08-01"),
  firstThreePerfect[2]
]).ready, false, "three exam IDs on only two start days do not prove reproducibility");
officialProof = mastery.summarizeOfficialProof([
  ...firstThreePerfect,
  officialEvidence("2022", "2026-08-04", 19)
]);
assert.equal(officialProof.currentMiss, true, "a later valid 19/20 must enter recovery");
assert.equal(officialProof.ready, false);
officialProof = mastery.summarizeOfficialProof([
  ...firstThreePerfect,
  officialEvidence("2022", "2026-08-04", 19),
  officialEvidence("2021-12", "2026-08-05", 20)
]);
assert.equal(officialProof.currentMiss, false, "a later valid perfect result must clear recovery");
assert.equal(officialProof.ready, true);

const transferGate = {
  questions: { total: 132, durable: 132 },
  durableUnits: 11
};
assert.equal(mastery.summarizeFullScore({
  foundation: { total: 44, contacted: 44, retained: 44 },
  transfer: transferGate,
  official: officialProof,
  bankReady: true
}).ready, true);
assert.equal(mastery.summarizeFullScore({
  foundation: { total: 44, contacted: 44, retained: 43 },
  transfer: transferGate,
  official: officialProof,
  bankReady: true
}).ready, false, "the three independent gates cannot substitute for one another");
assert.equal(mastery.summarizeFullScore({
  foundation: { total: 44, contacted: 44, retained: 44 },
  transfer: { questions: { total: 100, durable: 100 }, durableUnits: 11 },
  official: officialProof,
  bankReady: true
}).ready, false, "the former 100-question bank cannot satisfy the expanded transfer gate");

console.log("Audit-TakkenBusinessMastery: OK");
