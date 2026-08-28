"use strict";

const assert = require("node:assert/strict");
const sync = require("./state-sync.js");

const timestamp = (day, hour = "09:00:00") => `${day}T${hour}+09:00`;
const exposed = (firstOpenedAt, source = "full-exam") => ({
  firstOpenedAt,
  firstOpenedDayKey: firstOpenedAt.slice(0, 10),
  source
});
const historyRecord = (recordId, examId, startedAt, completedAt) => ({
  recordId,
  examId,
  startedAt,
  completedAt,
  score: 40,
  business: 20
});

const base = {
  stateSchemaVersion: 10,
  syncMeta: {
    revision: 7,
    updatedAt: timestamp("2026-08-15", "09:00:00"),
    writerId: "base"
  },
  officialExamExposure: {},
  officialExamHistory: [],
  officialExamSession: null,
  practicalDrill: {
    bankId: "business-fullscore-2026",
    stage: "idle",
    history: {
      q1: {
        attempts: 2,
        correct: 1,
        wrong: 1,
        uncertain: 0,
        lastConfidence: "wrong",
        lastAnsweredAt: timestamp("2026-08-14"),
        mistakeTags: { wording: 1 },
        lastMistakeTags: ["wording"]
      }
    },
    attempts: 2,
    correctAttempts: 1,
    sessionsCompleted: 0
  },
  questionStats: {
    main1: {
      attempts: 3,
      correct: 2,
      wrong: 1,
      lastAnsweredAt: timestamp("2026-08-14"),
      lastConfidence: "wrong",
      centralAttempts: 4,
      centralCorrect: 3,
      centralWrong: 1,
      centralLastAnsweredAt: timestamp("2026-08-14", "08:00:00")
    }
  },
  centralMarked: { main1: true },
  centralProgress: {
    generatedAt: timestamp("2026-08-14", "08:05:00"),
    lastEventAt: timestamp("2026-08-14", "08:00:00"),
    sourceEvents: 4,
    answers: 4,
    correct: 3,
    wrong: 1
  }
};

// Tab A opens exam X. Tab B was opened before that and later saves an unrelated answer.
const tabA = sync.clone(base);
tabA.syncMeta = {
  revision: 8,
  updatedAt: timestamp("2026-08-15", "09:05:00"),
  writerId: "tab-a"
};
tabA.officialExamExposure["2025"] = exposed(timestamp("2026-08-15", "09:04:00"));
tabA.officialExamSession = {
  examId: "2025",
  startedAt: timestamp("2026-08-15", "09:04:00"),
  answers: {},
  position: 0,
  lawChecked: false,
  appUnseenAtStart: true
};

const staleTabB = sync.clone(base);
staleTabB.syncMeta = {
  revision: 7,
  updatedAt: timestamp("2026-08-15", "09:06:00"),
  writerId: "tab-b"
};
staleTabB.questionStats.main1 = {
  ...staleTabB.questionStats.main1,
  attempts: 4,
  correct: 3,
  lastConfidence: "clear",
  lastAnsweredAt: timestamp("2026-08-15", "09:06:00")
};

const baseSnapshot = JSON.stringify(base);
const tabASnapshot = JSON.stringify(tabA);
const tabBSnapshot = JSON.stringify(staleTabB);
const recovered = sync.reconcileForSave(base, staleTabB, tabA, {
  updatedAt: timestamp("2026-08-15", "09:06:01"),
  writerId: "tab-b"
});

assert.equal(recovered.hasConflict, false, "an unchanged stale tab must not create a session conflict");
assert.equal(
  recovered.state.officialExamExposure["2025"].firstOpenedAt,
  timestamp("2026-08-15", "09:04:00"),
  "stale saves must never erase an exposed official exam"
);
assert.equal(recovered.state.officialExamSession.examId, "2025");
assert.equal(recovered.state.questionStats.main1.attempts, 4);
assert.equal(recovered.state.questionStats.main1.lastConfidence, "clear");
assert.equal(recovered.appliedRevision, 9);
assert.equal(recovered.comparison.winner, "right", "revision must beat a misleading later wall-clock time");
assert.equal(JSON.stringify(base), baseSnapshot, "base input must not be mutated");
assert.equal(JSON.stringify(tabA), tabASnapshot, "remote input must not be mutated");
assert.equal(JSON.stringify(staleTabB), tabBSnapshot, "local input must not be mutated");

const oldestExposure = sync.mergeOfficialExamExposureLedgers(
  { "2024": exposed(timestamp("2026-08-15", "11:00:00"), "manual") },
  { "2024": exposed(timestamp("2026-08-14", "11:00:00"), "daily-drill") },
  {}
);
assert.equal(oldestExposure["2024"].firstOpenedAt, timestamp("2026-08-14", "11:00:00"));
assert.equal(oldestExposure["2024"].source, "daily-drill");

const historyBase = {
  ...base,
  officialExamHistory: [
    historyRecord("record-a", "2023", timestamp("2026-08-10"), timestamp("2026-08-10", "11:00:00"))
  ]
};
const historyLocal = sync.clone(historyBase);
historyLocal.officialExamHistory.push(
  historyRecord("record-b", "2024", timestamp("2026-08-11"), timestamp("2026-08-11", "11:00:00"))
);
const historyRemote = sync.clone(historyBase);
historyRemote.officialExamHistory.push(
  historyRecord("record-c", "2025", timestamp("2026-08-12"), timestamp("2026-08-12", "11:00:00"))
);
assert.deepEqual(
  sync.mergeStates(historyBase, historyLocal, historyRemote).officialExamHistory.map((item) => item.recordId),
  ["record-a", "record-b", "record-c"],
  "official history must be a union keyed by recordId"
);
const historyOmittedOnBothBranches = sync.clone(historyBase);
historyOmittedOnBothBranches.officialExamHistory = [];
assert.deepEqual(
  sync.mergeStates(
    historyBase,
    historyOmittedOnBothBranches,
    historyOmittedOnBothBranches
  ).officialExamHistory.map((item) => item.recordId),
  ["record-a"],
  "an existing official record must not disappear even when stale branches omit it"
);

const practicalLocal = sync.clone(base);
practicalLocal.practicalDrill.history.q1 = {
  ...practicalLocal.practicalDrill.history.q1,
  attempts: 3,
  correct: 2,
  lastConfidence: "confident",
  lastAnsweredAt: timestamp("2026-08-15", "09:10:00"),
  mistakeTags: { wording: 2, subject: 1 },
  lastMistakeTags: ["subject"]
};
const practicalRemote = sync.clone(base);
practicalRemote.syncMeta = {
  ...practicalRemote.syncMeta,
  revision: 8,
  writerId: "practical-remote",
  clock: { base: 7, "practical-remote": 8 }
};
practicalRemote.practicalDrill.history.q1 = {
  ...practicalRemote.practicalDrill.history.q1,
  attempts: 4,
  correct: 2,
  wrong: 2,
  lastConfidence: "wrong",
  lastAnsweredAt: timestamp("2026-08-15", "09:20:00"),
  mistakeTags: { wording: 2, exception: 1 },
  lastMistakeTags: ["exception"]
};
const practicalMerged = sync.reconcileForSave(base, practicalLocal, practicalRemote, {
  updatedAt: timestamp("2026-08-15", "09:21:00"),
  writerId: "practical-local"
}).state;
assert.equal(practicalMerged.practicalDrill.history.q1.attempts, 5, "independent answer deltas must both survive");
assert.equal(practicalMerged.practicalDrill.history.q1.correct, 3);
assert.equal(practicalMerged.practicalDrill.history.q1.wrong, 2);
assert.equal(practicalMerged.practicalDrill.history.q1.lastConfidence, "wrong", "latest answer wins");
assert.deepEqual(practicalMerged.practicalDrill.history.q1.mistakeTags, {
  wording: 3,
  subject: 1,
  exception: 1
});
assert.deepEqual(
  new Set(practicalMerged.practicalDrill.history.q1.lastMistakeTags),
  new Set(["subject", "exception"])
);
const repeatedMerge = sync.mergeStates(base, practicalMerged, practicalRemote);
assert.equal(repeatedMerge.practicalDrill.history.q1.attempts, 5, "re-merging must not double count");

const practicalConfidenceBase = sync.clone(base);
practicalConfidenceBase.practicalDrill.history.q1 = {
  ...practicalConfidenceBase.practicalDrill.history.q1,
  lastAnsweredAt: timestamp("2026-08-15", "09:30:00"),
  lastConfidence: "confident",
  lastPredictedConfidence: "confident",
  lastConfidenceAt: timestamp("2026-08-15", "09:31:00"),
  retryNotBeforeKey: "",
  retryNotBeforeAt: timestamp("2026-08-15", "09:31:00"),
  uncertain: 0,
  overconfidentWrong: 0,
  hesitantCorrect: 0
};
Object.assign(practicalConfidenceBase.practicalDrill, {
  stage: "active",
  sessionIds: ["q1"],
  queue: ["q1"],
  position: 0,
  preAnswerConfidence: "confident",
  currentAttempt: {
    id: "q1",
    selected: 0,
    correct: true,
    predictedConfidence: "confident",
    confidence: "confident",
    diagnosticRecorded: false
  },
  retryIds: [],
  sessionStartedAt: timestamp("2026-08-15", "09:29:00")
});
const practicalConfidenceLocal = sync.clone(practicalConfidenceBase);
practicalConfidenceLocal.practicalDrill.history.q1 = {
  ...practicalConfidenceLocal.practicalDrill.history.q1,
  lastConfidence: "uncertain",
  lastPredictedConfidence: "uncertain",
  lastConfidenceAt: timestamp("2026-08-15", "09:35:00"),
  retryNotBeforeKey: "2026-08-16",
  retryNotBeforeAt: timestamp("2026-08-15", "09:36:00"),
  uncertain: 1,
  hesitantCorrect: 1
};
practicalConfidenceLocal.practicalDrill.preAnswerConfidence = "uncertain";
practicalConfidenceLocal.practicalDrill.currentAttempt.predictedConfidence = "uncertain";
practicalConfidenceLocal.practicalDrill.currentAttempt.confidence = "uncertain";
const practicalConfidenceRemote = sync.clone(practicalConfidenceBase);
practicalConfidenceRemote.syncMeta.revision = 9;
practicalConfidenceRemote.practicalDrill.history.q1.overconfidentWrong = 1;
practicalConfidenceRemote.practicalDrill.currentAttempt.diagnosticRecorded = true;
const practicalConfidenceMerged = sync.mergeStates(
  practicalConfidenceBase,
  practicalConfidenceLocal,
  practicalConfidenceRemote
);
assert.equal(practicalConfidenceMerged.practicalDrill.history.q1.lastConfidence, "uncertain", "newer practical confidence must beat a stale higher-revision tab");
assert.equal(practicalConfidenceMerged.practicalDrill.history.q1.lastConfidenceAt, timestamp("2026-08-15", "09:35:00"));
assert.equal(practicalConfidenceMerged.practicalDrill.history.q1.uncertain, 1, "newer uncertainty must remain eligible for retry");
assert.equal(practicalConfidenceMerged.practicalDrill.history.q1.lastPredictedConfidence, "uncertain", "latest pre-answer forecast must follow the latest outcome");
assert.equal(practicalConfidenceMerged.practicalDrill.history.q1.retryNotBeforeKey, "2026-08-16", "delayed retry must survive a stale higher-revision tab");
assert.equal(practicalConfidenceMerged.practicalDrill.history.q1.retryNotBeforeAt, timestamp("2026-08-15", "09:36:00"));
assert.equal(practicalConfidenceMerged.practicalDrill.history.q1.overconfidentWrong, 1, "independent overconfidence evidence must survive");
assert.equal(practicalConfidenceMerged.practicalDrill.history.q1.hesitantCorrect, 1, "independent hesitant-correct evidence must survive");
assert.equal(practicalConfidenceMerged.practicalDrill.preAnswerConfidence, "uncertain", "the visible forecast must follow merged history");
assert.equal(practicalConfidenceMerged.practicalDrill.currentAttempt.predictedConfidence, "uncertain", "the active answer must use the forecast from merged history");
assert.equal(practicalConfidenceMerged.practicalDrill.currentAttempt.confidence, "uncertain", "the active answer must use the confidence selected by the merged history");
assert.equal(practicalConfidenceMerged.practicalDrill.currentAttempt.diagnosticRecorded, true, "independent active-session fields from the preferred tab must survive");

const retryDeferBase = sync.clone(base);
retryDeferBase.practicalDrill.history.q1 = {
  ...retryDeferBase.practicalDrill.history.q1,
  lastAnsweredAt: timestamp("2026-08-15", "10:00:00"),
  lastConfidenceAt: timestamp("2026-08-15", "10:00:00"),
  retryNotBeforeKey: "",
  retryNotBeforeAt: timestamp("2026-08-15", "10:00:00")
};
const retryDeferredBranch = sync.clone(retryDeferBase);
retryDeferredBranch.syncMeta.revision = 8;
retryDeferredBranch.practicalDrill.history.q1.retryNotBeforeKey = "2026-08-16";
retryDeferredBranch.practicalDrill.history.q1.retryNotBeforeAt = timestamp("2026-08-15", "10:01:00");
const retryStaleBranch = sync.clone(retryDeferBase);
retryStaleBranch.syncMeta.revision = 9;
for (const mergedRetry of [
  sync.mergeStates(retryDeferBase, retryDeferredBranch, retryStaleBranch),
  sync.mergeStates(retryDeferBase, retryStaleBranch, retryDeferredBranch)
]) {
  assert.equal(mergedRetry.practicalDrill.history.q1.retryNotBeforeKey, "2026-08-16", "a stale preferred tab must not erase a later retry deferral");
  assert.equal(mergedRetry.practicalDrill.history.q1.retryNotBeforeAt, timestamp("2026-08-15", "10:01:00"));
}
const retryClearedBranch = sync.clone(retryDeferredBranch);
retryClearedBranch.syncMeta.revision = 10;
retryClearedBranch.practicalDrill.history.q1.lastAnsweredAt = timestamp("2026-08-15", "11:00:00");
retryClearedBranch.practicalDrill.history.q1.lastConfidenceAt = timestamp("2026-08-15", "11:00:00");
retryClearedBranch.practicalDrill.history.q1.retryNotBeforeKey = "";
retryClearedBranch.practicalDrill.history.q1.retryNotBeforeAt = timestamp("2026-08-15", "11:00:00");
const retryCleared = sync.mergeStates(retryDeferredBranch, retryClearedBranch, retryStaleBranch);
assert.equal(retryCleared.practicalDrill.history.q1.retryNotBeforeKey, "", "a later answer must be able to clear a prior deferral");
assert.equal(retryCleared.practicalDrill.history.q1.retryNotBeforeAt, timestamp("2026-08-15", "11:00:00"));

const guaranteeSessionBase = sync.clone(base);
guaranteeSessionBase.practicalDrill = {
  ...guaranteeSessionBase.practicalDrill,
  version: 3,
  bankId: "guarantee-association-special",
  bankVersion: 3,
  presentationKey: "2026-08-15:guarantee:base",
  presentationOverrides: {},
  planMode: "guarantee",
  stage: "active",
  sessionSize: 2,
  sessionIds: ["ga001", "ga002"],
  queue: ["ga001", "ga002"],
  position: 0,
  preAnswerConfidence: "",
  currentAttempt: null,
  retryIds: [],
  sessionStartedAt: timestamp("2026-08-15", "12:00:00")
};
const guaranteeRetryBranch = sync.clone(guaranteeSessionBase);
guaranteeRetryBranch.syncMeta.revision = 8;
guaranteeRetryBranch.practicalDrill.stage = "retry";
guaranteeRetryBranch.practicalDrill.queue = ["ga001"];
guaranteeRetryBranch.practicalDrill.retryIds = ["ga001"];
guaranteeRetryBranch.practicalDrill.presentationOverrides = { ga001: "2026-08-15:guarantee:retry:ga001" };
const guaranteeProgressBranch = sync.clone(guaranteeSessionBase);
guaranteeProgressBranch.syncMeta.revision = 9;
guaranteeProgressBranch.practicalDrill.position = 1;
guaranteeProgressBranch.practicalDrill.preAnswerConfidence = "uncertain";
const guaranteeConflict = sync.reconcileForSave(
  guaranteeSessionBase,
  guaranteeRetryBranch,
  guaranteeProgressBranch,
  { updatedAt: timestamp("2026-08-15", "12:05:00"), writerId: "guarantee-retry" }
);
assert.equal(guaranteeConflict.hasConflict, true, "divergent guarantee retry order and progress must stop instead of silently swapping choice order");
assert.equal(guaranteeConflict.conflicts[0].code, "concurrent-active-session");
assert.equal(guaranteeConflict.conflicts[0].local.kind, "practical");

const guaranteeOverrideLocal = sync.clone(guaranteeSessionBase);
guaranteeOverrideLocal.syncMeta.revision = 8;
guaranteeOverrideLocal.practicalDrill.presentationOverrides = { ga001: "2026-08-15:guarantee:order-a" };
const guaranteeOverrideRemote = sync.clone(guaranteeSessionBase);
guaranteeOverrideRemote.syncMeta.revision = 9;
guaranteeOverrideRemote.practicalDrill.presentationOverrides = { ga001: "2026-08-15:guarantee:order-b" };
const guaranteeOverrideConflict = sync.reconcileForSave(
  guaranteeSessionBase,
  guaranteeOverrideLocal,
  guaranteeOverrideRemote,
  { updatedAt: timestamp("2026-08-15", "12:06:00"), writerId: "guarantee-order" }
);
assert.equal(guaranteeOverrideConflict.hasConflict, true, "presentation override divergence alone must stop a same-session save");
assert.equal(guaranteeOverrideConflict.conflicts[0].local.kind, "practical");

const independentBase = sync.clone(base);
independentBase.attempts = 10;
independentBase.correct = 8;
independentBase.totalXp = 1000;
independentBase.syncMeta.clock = { base: 7 };
const independentLocal = sync.clone(independentBase);
independentLocal.attempts = 11;
independentLocal.correct = 9;
independentLocal.totalXp = 1100;
const independentRemote = sync.clone(independentBase);
independentRemote.attempts = 11;
independentRemote.correct = 9;
independentRemote.totalXp = 1120;
independentRemote.syncMeta = {
  ...independentRemote.syncMeta,
  revision: 8,
  writerId: "independent-remote",
  clock: { base: 7, "independent-remote": 8 }
};
const independentMerged = sync.reconcileForSave(independentBase, independentLocal, independentRemote, {
  updatedAt: timestamp("2026-08-15", "09:22:00"),
  writerId: "independent-local"
}).state;
assert.equal(independentMerged.attempts, 12);
assert.equal(independentMerged.correct, 10);
assert.equal(independentMerged.totalXp, 1220);
const independentRepeated = sync.mergeStates(independentBase, independentMerged, independentRemote);
assert.equal(independentRepeated.attempts, 12);
assert.equal(independentRepeated.correct, 10);
assert.equal(independentRepeated.totalXp, 1220);

const manyWriterBase = sync.clone(base);
manyWriterBase.attempts = 10;
manyWriterBase.syncMeta.clock = { root: 7 };
const manyWriterMerged = sync.clone(manyWriterBase);
manyWriterMerged.attempts = 50;
manyWriterMerged.syncMeta = {
  ...manyWriterMerged.syncMeta,
  revision: 47,
  writerId: "writer-39",
  clock: Object.fromEntries([
    ["root", 7],
    ...Array.from({ length: 40 }, (_, index) => [`writer-${index}`, index + 8])
  ])
};
const oldestWriterBranch = sync.clone(manyWriterBase);
oldestWriterBranch.attempts = 11;
oldestWriterBranch.syncMeta = {
  ...oldestWriterBranch.syncMeta,
  revision: 8,
  writerId: "writer-0",
  clock: { root: 7, "writer-0": 8 }
};
const manyWriterRepeated = sync.mergeStates(manyWriterBase, manyWriterMerged, oldestWriterBranch);
assert.equal(
  manyWriterRepeated.attempts,
  50,
  "causal ancestors beyond 32 writers must remain known and must not be re-added"
);
assert.ok(Object.keys(manyWriterRepeated.syncMeta.clock).length >= 41);

const confidenceBase = sync.clone(base);
confidenceBase.questionStats.main1 = {
  ...confidenceBase.questionStats.main1,
  lastConfidence: "clear",
  lastConfidenceAt: timestamp("2026-08-15", "09:00:00"),
  lastConfidenceDayKey: "2026-08-15",
  lastClearAt: timestamp("2026-08-15", "09:00:00"),
  clearAtHistory: [timestamp("2026-08-15", "09:00:00")],
  clearDayKeys: ["2026-08-15"],
  currentLawGateDayKeys: ["2026-08-15"]
};
const confidenceLocal = sync.clone(confidenceBase);
confidenceLocal.syncMeta.revision = 8;
confidenceLocal.questionStats.main1 = {
  ...confidenceLocal.questionStats.main1,
  lastConfidence: "unsure",
  lastConfidenceAt: timestamp("2026-08-15", "09:05:00"),
  lastConfidenceDayKey: "2026-08-15",
  lastClearAt: "",
  clearAtHistory: [],
  clearDayKeys: [],
  currentLawGateDayKeys: []
};
const confidenceRemote = sync.clone(confidenceBase);
confidenceRemote.syncMeta.revision = 9;
const confidenceMerged = sync.mergeStates(confidenceBase, confidenceLocal, confidenceRemote);
assert.equal(confidenceMerged.questionStats.main1.lastConfidence, "unsure");
assert.deepEqual(
  confidenceMerged.questionStats.main1.clearDayKeys,
  [],
  "a later unsure answer must invalidate the same-day clear instead of union-merging it back"
);
assert.equal(confidenceMerged.questionStats.main1.lastClearAt, "");
assert.deepEqual(
  confidenceMerged.questionStats.main1.clearAtHistory,
  [],
  "a later unsure answer must invalidate same-day timestamped clear evidence"
);
assert.deepEqual(
  confidenceMerged.questionStats.main1.currentLawGateDayKeys,
  [],
  "a later unsure answer must also invalidate same-day current-law gate evidence"
);

const mockWrongBase = sync.clone(confidenceBase);
const mockWrongLocal = sync.clone(mockWrongBase);
mockWrongLocal.syncMeta.revision = 8;
mockWrongLocal.questionStats.main1 = {
  ...mockWrongLocal.questionStats.main1,
  attempts: 4,
  wrong: 2,
  lastAnsweredAt: timestamp("2026-08-15", "10:00:00"),
  lastWrongAt: timestamp("2026-08-15", "10:00:00"),
  lastConfidence: "wrong",
  lastConfidenceAt: timestamp("2026-08-15", "10:00:00"),
  lastConfidenceDayKey: "2026-08-15",
  lastClearAt: "",
  clearDayKeys: [],
  clearAtHistory: []
};
const mockWrongRemote = sync.clone(mockWrongBase);
mockWrongRemote.syncMeta.revision = 9;
const mockWrongMerged = sync.mergeStates(mockWrongBase, mockWrongLocal, mockWrongRemote);
assert.equal(mockWrongMerged.questionStats.main1.lastConfidence, "wrong");
assert.deepEqual(
  mockWrongMerged.questionStats.main1.clearDayKeys,
  [],
  "a mock wrong answer must not regain a stale tab's same-day clear key"
);
assert.deepEqual(
  mockWrongMerged.questionStats.main1.clearAtHistory,
  [],
  "a mock wrong answer must not regain a stale tab's timestamped clear evidence"
);

const centralLocal = sync.clone(base);
centralLocal.centralProgress = {
  generatedAt: timestamp("2026-08-15", "08:05:00"),
  lastEventAt: timestamp("2026-08-15", "08:00:00"),
  sourceEvents: 8,
  answers: 8,
  correct: 6,
  wrong: 2
};
centralLocal.centralMarked = {};
centralLocal.questionStats.main1.centralAttempts = 8;
centralLocal.questionStats.main1.centralCorrect = 6;
centralLocal.questionStats.main1.centralWrong = 2;
centralLocal.questionStats.main1.centralLastAnsweredAt = timestamp("2026-08-15", "08:00:00");
centralLocal.questionStats.main1.centralWeak = false;
const centralRemote = sync.clone(base);
centralRemote.syncMeta.revision = 10;
const centralMerged = sync.mergeStates(base, centralLocal, centralRemote);
assert.equal(centralMerged.centralProgress.answers, 8);
assert.equal(centralMerged.questionStats.main1.centralAttempts, 8);
assert.equal(centralMerged.questionStats.main1.centralWeak, false);
assert.deepEqual(centralMerged.centralMarked, {}, "newer central snapshot may legitimately clear a weak mark");

const conflictLocal = sync.clone(base);
conflictLocal.syncMeta.revision = 8;
conflictLocal.officialExamSession = {
  examId: "2024",
  startedAt: timestamp("2026-08-15", "10:00:00"),
  answers: {},
  position: 0
};
const conflictRemote = sync.clone(base);
conflictRemote.syncMeta.revision = 9;
conflictRemote.officialExamSession = {
  examId: "2025",
  startedAt: timestamp("2026-08-15", "10:01:00"),
  answers: {},
  position: 0
};
const conflict = sync.reconcileForSave(base, conflictLocal, conflictRemote, {
  updatedAt: timestamp("2026-08-15", "10:02:00")
});
assert.equal(conflict.hasConflict, true);
assert.equal(conflict.conflicts[0].code, "concurrent-active-session");
assert.equal(conflict.requiresResolution, true);

const activeBase = sync.clone(conflictLocal);
const completedLocal = sync.clone(activeBase);
completedLocal.syncMeta.revision = 9;
completedLocal.officialExamSession = null;
const progressedRemote = sync.clone(activeBase);
progressedRemote.syncMeta.revision = 10;
progressedRemote.officialExamSession.answers = { "1": 2 };
progressedRemote.officialExamSession.position = 1;
assert.equal(
  sync.reconcileForSave(activeBase, completedLocal, progressedRemote, {
    updatedAt: timestamp("2026-08-15", "10:03:00")
  }).hasConflict,
  true,
  "completion racing with progress in the same active exam must be surfaced"
);

assert.deepEqual(sync.compareSync(
  { syncMeta: { revision: 2, updatedAt: timestamp("2026-08-15", "12:00:00") } },
  { syncMeta: { revision: 3, updatedAt: timestamp("2026-08-15", "11:00:00") } }
), {
  left: { generation: 0, revision: 2, updatedAt: timestamp("2026-08-15", "12:00:00"), writerId: "", clock: {} },
  right: { generation: 0, revision: 3, updatedAt: timestamp("2026-08-15", "11:00:00"), writerId: "", clock: {} },
  winner: "right",
  reason: "revision"
});

const replacementBase = sync.clone(base);
replacementBase.attempts = 12;
replacementBase.syncMeta.generation = 0;
const replacementLocal = sync.clone(replacementBase);
replacementLocal.attempts = 13;
const replacementRemote = sync.clone(base);
replacementRemote.attempts = 0;
replacementRemote.correct = 0;
replacementRemote.questionStats = {};
replacementRemote.practicalDrill.history = {};
replacementRemote.syncMeta = {
  generation: 1,
  revision: 20,
  updatedAt: timestamp("2026-08-15", "15:00:00"),
  writerId: "reset-tab"
};
replacementRemote.officialExamExposure = {
  "2024": {
    firstOpenedAt: timestamp("2026-08-15", "14:00:00"),
    firstOpenedDayKey: "2026-08-15",
    source: "full-exam"
  }
};
const replacementMerged = sync.reconcileForSave(
  replacementBase,
  replacementLocal,
  replacementRemote,
  { updatedAt: timestamp("2026-08-15", "15:01:00"), writerId: "stale-tab" }
);
assert.equal(replacementMerged.replacementApplied, true);
assert.equal(replacementMerged.state.syncMeta.generation, 1);
assert.equal(replacementMerged.state.attempts, 0, "newer replacement epoch must defeat stale progress");
assert.deepEqual(replacementMerged.state.questionStats, {});
assert.ok(replacementMerged.state.officialExamExposure["2024"], "exposure ledger remains monotonic");

const crystalBase = sync.clone(base);
crystalBase.crystals = 100;
crystalBase.crystalSpent = 0;
crystalBase.armoryRank = 0;
const crystalBuyer = sync.clone(crystalBase);
crystalBuyer.crystals = 50;
crystalBuyer.crystalSpent = 50;
crystalBuyer.armoryRank = 1;
crystalBuyer.syncMeta.revision = 8;
const crystalEarner = sync.clone(crystalBase);
crystalEarner.crystals = 110;
crystalEarner.syncMeta.revision = 9;
const crystalMerged = sync.mergeStates(crystalBase, crystalBuyer, crystalEarner);
assert.equal(crystalMerged.crystalSpent, 50);
assert.equal(crystalMerged.crystals, 60, "concurrent earning must not undo an armory purchase");
assert.equal(crystalMerged.armoryRank, 1);

console.log(JSON.stringify({
  status: "ok",
  schema: base.stateSchemaVersion,
  staleTabExposurePreserved: true,
  officialHistoryUnion: true,
  practicalHistoryLatestWins: true,
  independentCounterDeltasPreserved: true,
  manyWriterCausalityPreserved: true,
  confidenceClearInvalidation: true,
  mockWrongClearInvalidation: true,
  doubleCountPrevented: true,
  centralProgressMonotonic: true,
  replacementEpochMonotonic: true,
  spendPreserved: true,
  activeSessionConflictDetected: true,
  appliedRevision: recovered.appliedRevision
}));
