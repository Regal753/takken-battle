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
assert.equal(readiness.FIRST_PASS_UNIT_MINUTES, 12);
assert.equal(readiness.FIRST_PASS_FIXED_DAILY_MINUTES, 30);
assert.equal(readiness.STABILITY_LATEST_MAX_AGE_DAYS, 14);
assert.equal(readiness.STABILITY_WINDOW_DAYS, 21);
assert.equal(readiness.CURRENT_LAW_ATTEMPT_MAX_AGE_DAYS, 14);
assert.deepEqual(readiness.MOCK_STABILITY_POLICY.eligibleFormIds, ["form-a", "form-b"]);
assert.equal(readiness.validDayKey("2026-02-29"), ""); assert.equal(readiness.validDayKey("2028-02-29"), "2028-02-29");
assert.equal(readiness.dayKey(new Date("2026-08-29T15:30:00Z")), "2026-08-30", "Date inputs use JST regardless of host timezone");

const subjects = { business: { total: 20, contacted: 20, retained: 18 }, rights: { total: 14, contacted: 14, retained: 10 }, restrictions: { total: 8, contacted: 8, retained: 7 }, tax: { total: 3, contacted: 3, retained: 2 }, other: { total: 5, contacted: 5, retained: 4 } };
const score = { business: 18, rights: 9, restrictions: 7, tax: 2, other: 4 };
const attemptDates = ["2026-08-25", "2026-08-26", "2026-09-01"];
const attempts = ["form-a", "form-b", "form-a"].map((formId, index) => {
  const dayKey = attemptDates[index];
  return { formId, evidenceClass: "independent-current-law", currentLaw: true, dayKey, completedAt: `${dayKey}T10:00:00+09:00`, total: 40, timed: true, elapsedMinutes: 60, questionCount: 50, sections: score };
});
const officialAttempts = attempts.map((attempt, index) => ({ ...attempt, formId: `official-${index + 1}` }));
const officialTransfer = { initialCount: 3, latestThreeInitial: [
  { examId: "retio-2023", dayKey: "2026-08-25", score50: 40 },
  { examId: "retio-2024", dayKey: "2026-08-26", score50: 42 },
  { examId: "retio-2025", dayKey: "2026-09-01", score50: 41 }
] };
const textbookComplete = { totalUnits: 45, completedUnits: 45, minutesPerUnit: 12 };
const gate = { attempts: [
  { dayKey: "2026-09-02", completedAt: "2026-09-02T10:00:00+09:00", correct: true, clusters: ["management-disclosure", "signage"] },
  { dayKey: "2026-09-03", completedAt: "2026-09-03T10:00:00+09:00", correct: true, clusters: ["important-matters", "land-regulation"] }
] };
const capacity = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"].map((dayKey) => ({ dayKey, minutes: 75 }));
const freshness = { current: true, failClosed: false };

const blank = readiness.calculatePassReadiness({ todayKey: "2026-08-16" });
assert.equal(blank.status, "unmeasured"); assert.equal(blank.dailyPlan.mode, "required-full-mock"); assert.equal(blank.dailyPlan.requiredMeasurement, "internal-mock"); assert.equal(blank.dailyPlan.businessKnock, null); assert.equal(blank.capacity.status, "unverified");
const stable = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, officialHistory: officialAttempts, officialTransferHistory: officialTransfer, textbookFirstPass: textbookComplete, currentLawGate: gate, studyMinutesHistory: capacity, currentYearFreshness: freshness });
assert.equal(stable.status, "on-track"); assert.equal(stable.timed50.stable, true); assert.equal(stable.currentLawGate.passed, true); assert.equal(stable.capacity.verified, true);
assert.equal(stable.currentYearFreshness.passed, true);
assert.equal(stable.timed50.mock.requiredDistinctForms, 2);
assert.equal(stable.timed50.mock.minimumRepeatGapDays, 7);
assert.equal(stable.timed50.mock.repeatSpacingSatisfied, true);
assert.equal(stable.timed50.official.stable, true, "generic official stability keeps the existing three-distinct-form rule");
assert.equal(stable.timed50.officialTransfer.passed, true, "official historical transfer proof is required separately from current-law evidence");
const noOfficialTransfer = readiness.calculatePassReadiness({ todayKey: "2026-09-06", subjects, mockHistory: attempts, textbookFirstPass: textbookComplete, currentLawGate: gate, studyMinutesHistory: capacity, currentYearFreshness: freshness });
assert.equal(noOfficialTransfer.onTrack, false); assert.equal(noOfficialTransfer.reason, "official-transfer-unverified");
assert.equal(noOfficialTransfer.dailyPlan.requiredMeasurement, "official-transfer");
const duplicateOfficialExam = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, officialTransferHistory: { ...officialTransfer, latestThreeInitial: officialTransfer.latestThreeInitial.map((entry) => ({ ...entry, examId: "retio-same" })) }, textbookFirstPass: textbookComplete, currentLawGate: gate, studyMinutesHistory: capacity, currentYearFreshness: freshness });
assert.equal(duplicateOfficialExam.timed50.officialTransfer.passed, false, "three scores from one official exam are not transfer evidence");
const lowOfficialFloor = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, officialTransferHistory: { ...officialTransfer, latestThreeInitial: officialTransfer.latestThreeInitial.map((entry, index) => ({ ...entry, score50: [45, 44, 36][index] })) }, textbookFirstPass: textbookComplete, currentLawGate: gate, studyMinutesHistory: capacity, currentYearFreshness: freshness });
assert.equal(lowOfficialFloor.timed50.officialTransfer.mean, 125 / 3);
assert.equal(lowOfficialFloor.timed50.officialTransfer.passed, false, "a sub-37 official first-seen floor fails even when the mean exceeds 40");
const futureOfficial = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, officialTransferHistory: { ...officialTransfer, latestThreeInitial: officialTransfer.latestThreeInitial.map((entry, index) => index === 2 ? { ...entry, dayKey: "2026-09-05" } : entry) }, textbookFirstPass: textbookComplete, currentLawGate: gate, studyMinutesHistory: capacity, currentYearFreshness: freshness });
assert.equal(futureOfficial.timed50.officialTransfer.futureDated, true);
assert.equal(futureOfficial.timed50.officialTransfer.passed, false, "future-dated official evidence fails closed");
const unstartedSunday = readiness.calculatePassReadiness({ todayKey: "2026-08-30", subjects, textbookFirstPass: { totalUnits: 45, completedUnits: 0 }, dailyAvailableMinutes: 90 });
assert.equal(unstartedSunday.dailyPlan.requiredMeasurement, "internal-mock");
assert.equal(unstartedSunday.dailyPlan.choices.length, 1, "short Sunday route is unavailable before the first pass and official transfer");
const impossibleFirstPass = readiness.calculatePassReadiness({ todayKey: "2026-08-28", subjects, textbookFirstPass: { totalUnits: 45, completedUnits: 0, minutesPerUnit: 12 }, dailyAvailableMinutes: 90 });
assert.equal(impossibleFirstPass.behind, true); assert.equal(impossibleFirstPass.reason, "first-pass-plan-infeasible");
assert.equal(impossibleFirstPass.firstPass.textbook.requiredUnitsPerDay, 12);
assert.equal(impossibleFirstPass.firstPass.textbook.requiredMinutesPerDay, 174, "unit reading time reserves 30 minutes for the fixed daily business-law knock");
const staleCurrentYear = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, officialTransferHistory: officialTransfer, textbookFirstPass: textbookComplete, currentLawGate: gate, studyMinutesHistory: capacity, currentYearFreshness: { current: false, failClosed: true, status: "stale" } });
assert.equal(staleCurrentYear.onTrack, false); assert.equal(staleCurrentYear.reason, "current-year-freshness-unverified");

const sameForm = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts.map((a) => ({ ...a, formId: "same" })), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(sameForm.timed50.stable, false); assert.equal(sameForm.timed50.mock.eligibleTimedCount, 0);
const allA = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts.map((a) => ({ ...a, formId: "form-a" })), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(allA.timed50.mock.eligibleTimedCount, 3);
assert.equal(allA.timed50.mock.distinctFormCount, 1);
assert.equal(allA.timed50.stable, false, "three eligible attempts still need both independent forms");
const mixedOnly = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts.map((a) => ({ ...a, formId: "form-c", evidenceClass: "internal-mixed-practice" })), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(mixedOnly.timed50.mock.eligibleTimedCount, 0, "auxiliary mixed form C is excluded from stability evidence");
assert.equal(mixedOnly.timed50.mock.excludedTimedCount, 3);
const tooSoonRepeat = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts.map((a, index) => ({ ...a, dayKey: `2026-09-0${index + 1}`, completedAt: `2026-09-0${index + 1}T10:00:00+09:00` })), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(tooSoonRepeat.timed50.mock.repeatSpacingSatisfied, false, "a repeated A/B form needs a seven-day calendar gap");
assert.equal(tooSoonRepeat.timed50.stable, false);
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
const unordered = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: [attempts[2], attempts[0], attempts[1]], officialTransferHistory: officialTransfer, textbookFirstPass: textbookComplete, currentLawGate: gate, studyMinutesHistory: capacity, currentYearFreshness: freshness });
assert.equal(unordered.timed50.stable, true, "valid attempts are sorted before evaluation");

const datedAttempts = (dates) => dates.map((dateKey, index) => ({ ...attempts[index], dayKey: dateKey, completedAt: `${dateKey}T10:00:00+09:00` }));
const staleSpread = readiness.calculatePassReadiness({ todayKey: "2026-08-01", subjects, mockHistory: datedAttempts(["2026-04-01", "2026-05-01", "2026-08-01"]), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(staleSpread.timed50.mock.latestRecentEnough, true, "a latest attempt can be fresh while its streak is still too old");
assert.equal(staleSpread.timed50.mock.withinRollingWindow, false);
assert.equal(staleSpread.timed50.stable, false, "4/1, 5/1, 8/1 cannot establish a current streak");
const boundaryStreak = readiness.calculatePassReadiness({ todayKey: "2026-08-29", subjects, mockHistory: datedAttempts(["2026-08-01", "2026-08-10", "2026-08-21"]), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(boundaryStreak.timed50.mock.windowSpanDays, 20);
assert.equal(boundaryStreak.timed50.mock.withinRollingWindow, true, "a 21-calendar-day inclusive streak is permitted");
assert.equal(boundaryStreak.timed50.mock.latestAgeDays, 8);
assert.equal(boundaryStreak.timed50.mock.stable, true);
const overWindowStreak = readiness.calculatePassReadiness({ todayKey: "2026-08-29", subjects, mockHistory: datedAttempts(["2026-08-01", "2026-08-10", "2026-08-22"]), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(overWindowStreak.timed50.mock.windowSpanDays, 21);
assert.equal(overWindowStreak.timed50.mock.withinRollingWindow, false);
assert.equal(overWindowStreak.timed50.mock.stable, false, "a 22-calendar-day inclusive streak is too wide");
const latestBoundaryStreak = readiness.calculatePassReadiness({ todayKey: "2026-08-29", subjects, mockHistory: datedAttempts(["2026-08-01", "2026-08-08", "2026-08-15"]), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(latestBoundaryStreak.timed50.mock.latestAgeDays, 14);
assert.equal(latestBoundaryStreak.timed50.mock.stable, true, "a latest qualifying form exactly 14 days old is accepted");
const futureStreak = readiness.calculatePassReadiness({ todayKey: "2026-08-29", subjects, mockHistory: datedAttempts(["2026-08-10", "2026-08-20", "2026-08-30"]), currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(futureStreak.timed50.mock.latestAgeDays, -1);
assert.equal(futureStreak.timed50.mock.latestRecentEnough, false);
assert.equal(futureStreak.timed50.mock.stable, false, "future-dated evidence fails closed");

const missingGate = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, officialTransferHistory: officialTransfer, textbookFirstPass: textbookComplete, studyMinutesHistory: capacity, currentYearFreshness: freshness });
assert.equal(missingGate.timed50.baseStable, true); assert.equal(missingGate.timed50.stable, false); assert.equal(missingGate.reason, "current-law-gate-unverified");
const staleGate = readiness.calculatePassReadiness({ todayKey: "2026-09-25", subjects, mockHistory: attempts, currentLawGate: gate, studyMinutesHistory: capacity });
assert.equal(staleGate.currentLawGate.passed, false);
const splitAgeGate = readiness.calculatePassReadiness({ todayKey: "2026-08-18", subjects, mockHistory: attempts, currentLawGate: { attempts: [
  { ...gate.attempts[0], dayKey: "2026-04-01", completedAt: "2026-04-01T10:00:00+09:00" },
  { ...gate.attempts[1], dayKey: "2026-08-18", completedAt: "2026-08-18T10:00:00+09:00" }
] }, studyMinutesHistory: capacity });
assert.deepEqual(splitAgeGate.currentLawGate.attemptAgeDays, [139, 0]);
assert.equal(splitAgeGate.currentLawGate.recentEnough, false);
assert.equal(splitAgeGate.currentLawGate.passed, false, "4/1 plus 8/18 cannot satisfy the current-law gate");
const gateBoundary = readiness.calculatePassReadiness({ todayKey: "2026-08-18", subjects, mockHistory: attempts, currentLawGate: { attempts: [
  { ...gate.attempts[0], dayKey: "2026-08-04", completedAt: "2026-08-04T10:00:00+09:00" },
  { ...gate.attempts[1], dayKey: "2026-08-18", completedAt: "2026-08-18T10:00:00+09:00" }
] }, studyMinutesHistory: capacity });
assert.deepEqual(gateBoundary.currentLawGate.attemptAgeDays, [14, 0]);
assert.equal(gateBoundary.currentLawGate.passed, true, "both gate attempts exactly within the 14-day boundary are accepted");
const futureGate = readiness.calculatePassReadiness({ todayKey: "2026-08-18", subjects, mockHistory: attempts, currentLawGate: { attempts: [
  { ...gate.attempts[0], dayKey: "2026-08-17", completedAt: "2026-08-17T10:00:00+09:00" },
  { ...gate.attempts[1], dayKey: "2026-08-19", completedAt: "2026-08-19T10:00:00+09:00" }
] }, studyMinutesHistory: capacity });
assert.equal(futureGate.currentLawGate.recentEnough, false);
assert.equal(futureGate.currentLawGate.passed, false, "future-dated current-law evidence fails closed");
const oneDayGate = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, currentLawGate: { attempts: gate.attempts.map((entry) => ({ ...entry, dayKey: "2026-09-03" })) }, studyMinutesHistory: capacity });
assert.equal(oneDayGate.currentLawGate.passed, false);
const unverifiedCapacity = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, officialTransferHistory: officialTransfer, textbookFirstPass: textbookComplete, currentLawGate: gate, currentYearFreshness: freshness });
assert.equal(unverifiedCapacity.onTrack, false); assert.equal(unverifiedCapacity.reason, "observed-capacity-unverified");
const lowCapacity = readiness.calculatePassReadiness({ todayKey: "2026-09-04", subjects, mockHistory: attempts, officialTransferHistory: officialTransfer, textbookFirstPass: textbookComplete, currentLawGate: gate, studyMinutesHistory: capacity.map((entry) => ({ ...entry, minutes: 60 })), currentYearFreshness: freshness });
assert.equal(lowCapacity.status, "behind"); assert.equal(lowCapacity.reason, "observed-capacity-below-minimum");

const fiveScore = { business: 18, rights: 9, restrictions: 7, tax: 2 };
const fiveAttempts = ["form-a", "form-b", "form-a"].map((formId, index) => {
  const dayKey = attemptDates[index];
  return { formId, evidenceClass: "independent-current-law", currentLaw: true, dayKey, completedAt: `${dayKey}T10:00:00+09:00`, total: 36, timed: true, elapsedMinutes: 55, questionCount: 45, sections: fiveScore };
});
const five = readiness.calculatePassReadiness({ todayKey: "2026-09-04", examProfile: "fiveExempt", subjects, mockHistory: fiveAttempts, officialTransferHistory: officialTransfer, textbookFirstPass: textbookComplete, currentLawGate: gate, studyMinutesHistory: capacity, currentYearFreshness: freshness });
assert.equal(five.targets.questions, 45); assert.equal(five.targets.total, 36); assert.equal(five.examProfile.minutes, 110); assert.equal(five.timed50.stable, true); assert.equal(five.subjects.some((s) => s.key === "other"), false);
assert.equal(five.status, "on-track");
const malformed = readiness.calculatePassReadiness({ todayKey: "2026-08-17", subjects: { business: { total: 20, contacted: 21, retained: 18 } } });
assert.equal(malformed.valid, false); assert.equal(malformed.status, "invalid");
for (const invalid of [readiness.calculatePassReadiness({ todayKey: "2026-02-30" }), readiness.calculatePassReadiness({ todayKey: "2026-08-16", dailyAvailableMinutes: 0 }), readiness.calculatePassReadiness({ todayKey: "2026-10-18" })]) { assert.equal(invalid.valid, false); assert.equal(invalid.status, "invalid"); }
console.log("Audit-TakkenPassReadiness: OK");
