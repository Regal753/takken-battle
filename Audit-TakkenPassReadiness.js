"use strict";
process.env.TZ = "Asia/Tokyo";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const readiness = require("./pass-readiness.js");
const browserContext = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "pass-readiness.js"), "utf8"), browserContext);
assert.equal(typeof browserContext.TAKKEN_PASS_READINESS?.calculatePassReadiness, "function");
assert.equal(readiness.EXAM_DAY_KEY, "2026-10-18");
assert.equal(readiness.TARGET_TOTAL, 40); assert.equal(readiness.QUESTION_TOTAL, 50);
assert.equal(readiness.MIN_TIMED_MOCK_MINUTES, 30);
assert.equal(readiness.validDayKey("2026-02-29"), ""); assert.equal(readiness.validDayKey("2028-02-29"), "2028-02-29");
assert.equal(readiness.dayKey(new Date("2026-08-29T15:30:00Z")), "2026-08-30", "Date inputs use JST regardless of host timezone");

const subjects = { business: { total: 20, contacted: 20, retained: 18 }, rights: { total: 14, contacted: 14, retained: 10 }, restrictions: { total: 8, contacted: 8, retained: 7 }, tax: { total: 3, contacted: 3, retained: 2 }, other: { total: 5, contacted: 5, retained: 4 } };
const score = { business: 18, rights: 9, restrictions: 7, tax: 2, other: 4 };
const attempts = [1, 2, 3].map((n) => ({ formId: `internal-${n}`, currentLaw: true, dayKey: `2026-09-0${n}`, completedAt: `2026-09-0${n}T10:00:00+09:00`, total: 40, timed: true, elapsedMinutes: 60, questionCount: 50, sections: score }));
const gate = { attempts: [
  { dayKey: "2026-09-02", completedAt: "2026-09-02T10:00:00+09:00", correct: true, clusters: ["management-disclosure", "signage"] },
  { dayKey: "2026-09-03", completedAt: "2026-09-03T10:00:00+09:00", correct: true, clusters: ["important-matters", "land-regulation"] }
] };
const capacity = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"].map((dayKey) => ({ dayKey, minutes: 75 }));
const freshness = { current: true, failClosed: false };

const blank = readiness.calculatePassReadiness({ todayKey: "2026-08-16" });
assert.equal(blank.status, "unmeasured"); assert.equal(blank.dailyPlan.mode, "choice"); assert.equal(blank.dailyPlan.businessKnock, null); assert.equal(blank.capacity.status, "unverified");
const stable = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, currentLawGate: gate, studyMinutesHistory: capacity, currentYearFreshness: freshness });
assert.equal(stable.status, "on-track"); assert.equal(stable.timed50.stable, true); assert.equal(stable.currentLawGate.passed, true); assert.equal(stable.capacity.verified, true);
assert.equal(stable.currentYearFreshness.passed, true);
const staleCurrentYear = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, currentLawGate: gate, studyMinutesHistory: capacity, currentYearFreshness: { current: false, failClosed: true, status: "stale" } });
assert.equal(staleCurrentYear.onTrack, false); assert.equal(staleCurrentYear.reason, "current-year-freshness-unverified");

const sameForm = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts.map((a) => ({ ...a, formId: "same" })), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(sameForm.timed50.stable, false); assert.equal(sameForm.timed50.mock.distinctFormCount, 1);
const sameDay = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts.map((a) => ({ ...a, dayKey: "2026-09-01" })), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(sameDay.timed50.stable, false);
assert.equal(sameDay.timed50.mock.validTimed50Count, 1, "a supplied JST day must agree with the ISO completion timestamp");
const tooFast = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts.map((a) => ({ ...a, elapsedMinutes: 1 })), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(tooFast.timed50.mock.validTimed50Count, 0, "an implausibly fast form is practice history, not stability evidence");
const noTimestamp = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts.map(({ completedAt, ...a }) => a), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(noTimestamp.timed50.mock.validTimed50Count, 0, "legacy imports fail closed");
const historicForm = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts.map(({ currentLaw, ...a }) => a), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(historicForm.timed50.mock.validTimed50Count, 0, "a form without current-law evidence fails closed");
const badSectionSum = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: [{ ...attempts[0], sections: { ...score, business: 17 } }], currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(badSectionSum.timed50.mock.validTimed50Count, 0);
const unordered = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: [attempts[2], attempts[0], attempts[1]], currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(unordered.timed50.stable, true, "valid attempts are sorted before evaluation");

const missingGate = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, studyMinutesHistory: capacity });
assert.equal(missingGate.timed50.baseStable, true); assert.equal(missingGate.timed50.stable, false); assert.equal(missingGate.reason, "current-law-gate-unverified");
const staleGate = readiness.calculatePassReadiness({ todayKey: "2026-09-25", subjects, mockHistory: attempts, currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(staleGate.currentLawGate.passed, false);
const oneDayGate = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, currentLawGate: { attempts: gate.attempts.map((entry) => ({ ...entry, dayKey: "2026-09-03" })) }, studyMinutesHistory: capacity });
assert.equal(oneDayGate.currentLawGate.passed, false);
const unverifiedCapacity = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, currentLawGate: gate });
assert.equal(unverifiedCapacity.onTrack, false); assert.equal(unverifiedCapacity.reason, "observed-capacity-unverified");
const lowCapacity = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, currentLawGate: gate, studyMinutesHistory: capacity.map((entry) => ({ ...entry, minutes: 60 })) });
assert.equal(lowCapacity.status, "behind"); assert.equal(lowCapacity.reason, "observed-capacity-below-minimum");

const fiveScore = { business: 18, rights: 9, restrictions: 7, tax: 2 };
const fiveAttempts = [1, 2, 3].map((n) => ({ formId: `five-${n}`, currentLaw: true, dayKey: `2026-09-0${n}`, completedAt: `2026-09-0${n}T10:00:00+09:00`, total: 36, timed: true, elapsedMinutes: 55, questionCount: 45, sections: fiveScore }));
const five = readiness.calculatePassReadiness({ todayKey: "2026-09-04", examProfile: "fiveExempt", subjects, mockHistory: fiveAttempts, currentLawGate: gate, studyMinutesHistory: capacity, currentYearFreshness: freshness });
assert.equal(five.targets.questions, 45); assert.equal(five.targets.total, 36); assert.equal(five.examProfile.minutes, 110); assert.equal(five.timed50.stable, true); assert.equal(five.subjects.some((s) => s.key === "other"), false);
assert.equal(five.status, "on-track");
const malformed = readiness.calculatePassReadiness({ todayKey: "2026-08-17", subjects: { business: { total: 20, contacted: 21, retained: 18 } } });
assert.equal(malformed.valid, false); assert.equal(malformed.status, "invalid");
for (const invalid of [readiness.calculatePassReadiness({ todayKey: "2026-02-30" }), readiness.calculatePassReadiness({ todayKey: "2026-08-16", dailyAvailableMinutes: 0 }), readiness.calculatePassReadiness({ todayKey: "2026-10-18" })]) { assert.equal(invalid.valid, false); assert.equal(invalid.status, "invalid"); }
console.log("Audit-TakkenPassReadiness: OK");
