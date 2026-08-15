"use strict";

process.env.TZ = "Asia/Tokyo";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const pace = require("./business-pace.js");

const browserContext = {};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "business-pace.js"), "utf8"),
  browserContext,
  { filename: "business-pace.js" }
);
assert.equal(
  typeof browserContext.TAKKEN_BUSINESS_PACE?.calculateBusinessPace,
  "function",
  "the UMD build must expose the same API without CommonJS"
);

assert.equal(pace.EXAM_DAY_KEY, "2026-10-18");
assert.equal(pace.LAST_SUCCESS_DAY_KEY, "2026-10-17");
assert.deepEqual(pace.REVIEW_INTERVAL_DAYS, [1, 3, 7, 14, 30]);
assert.equal(pace.REVIEW_LAG_DAYS, 55);
assert.equal(pace.addDays(pace.LAST_SUCCESS_DAY_KEY, -pace.REVIEW_LAG_DAYS), "2026-08-23");

assert.equal(pace.validDayKey("2026-02-29"), "");
assert.equal(pace.validDayKey("2028-02-29"), "2028-02-29");
assert.equal(pace.validDayKey("2026-13-01"), "");
assert.equal(pace.validDayKey("2026-08-1"), "");
assert.equal(pace.validDayKey("0099-12-31"), "", "pre-modern years fail closed instead of hitting Date.UTC year coercion");
assert.equal(pace.addDays("2028-02-28", 1), "2028-02-29");
assert.equal(pace.addDays("2028-02-29", 1), "2028-03-01");
assert.equal(pace.addDays("2026-03-08", 1), "2026-03-09", "spring DST must not skip a calendar day");
assert.equal(pace.addDays("2026-11-01", 1), "2026-11-02", "fall DST must not repeat a calendar day");
assert.equal(pace.daysBetween("2026-08-15", "2026-08-23"), 8);
assert.equal(pace.daysBetween("2026-08-23", "2026-08-15"), -8);

const august15 = pace.calculateBusinessPace({
  todayKey: "2026-08-15",
  untouched: 134
});
assert.equal(august15.valid, true);
assert.equal(august15.latestFirstExposureKey, "2026-08-23");
assert.equal(august15.calendarDaysUntilLatest, 8, "exclusive gap is eight days");
assert.equal(august15.remainingSafeDays, 9, "today and 8/23 are both usable, for nine inclusive days");
assert.equal(august15.remainingSafeDaysIncludesTodayAndLatest, true);
assert.equal(august15.requiredPerDay, 15);
assert.equal(august15.todayRequired, 15);
assert.equal(august15.plannedDailyNew, 10);
assert.equal(august15.currentPlanShortfallPerDay, 5);
assert.equal(august15.projectedLastFirstExposureKey, "2026-08-28");
assert.equal(august15.projectedFinalRecallKey, "2026-10-22");
assert.equal(august15.catchUpProjectedFinalRecallKey, "2026-10-17");
assert.equal(august15.status, "urgent");
assert.equal(august15.onTrack, false);
assert.equal(august15.urgent, true);
assert.equal(august15.impossible, false);

const caughtUpPlan = pace.calculateBusinessPace({
  todayKey: "2026-08-15",
  untouched: 134,
  plannedDailyNew: 15,
  existingLoad: { retry: 2, due: 3, overdue: 1, learning: 40 }
});
assert.equal(caughtUpPlan.status, "on-track");
assert.equal(caughtUpPlan.projectedFinalRecallKey, "2026-10-17");
assert.deepEqual(caughtUpPlan.todayLoad, {
  firstExposure: 15,
  knownExistingActionable: 5,
  knownTotal: 20,
  complete: true
});
assert.equal(caughtUpPlan.existingLoad.overdue, 1, "overdue remains available as a due subset for display");
assert.equal(caughtUpPlan.existingLoad.learning, 40);
assert.equal(caughtUpPlan.existingLoad.retained, null, "unknown existing states remain visibly unknown");

const fitsTenPerDay = pace.calculateBusinessPace({
  todayKey: "2026-08-10",
  untouched: 134
});
assert.equal(fitsTenPerDay.remainingSafeDays, 14);
assert.equal(fitsTenPerDay.requiredPerDay, 10);
assert.equal(fitsTenPerDay.status, "on-track");
assert.equal(fitsTenPerDay.projectedFinalRecallKey, "2026-10-17");

const lastSafeDay = pace.calculateBusinessPace({
  todayKey: "2026-08-23",
  untouched: 7,
  plannedDailyNew: 7
});
assert.equal(lastSafeDay.calendarDaysUntilLatest, 0);
assert.equal(lastSafeDay.remainingSafeDays, 1);
assert.equal(lastSafeDay.requiredPerDay, 7);
assert.equal(lastSafeDay.todayRequired, 7);
assert.equal(lastSafeDay.projectedFinalRecallKey, "2026-10-17");
assert.equal(lastSafeDay.status, "urgent", "the final safe day is urgent even with enough planned capacity");
assert.equal(lastSafeDay.reason, "last-safe-first-exposure-day");

const oneDayLate = pace.calculateBusinessPace({
  todayKey: "2026-08-24",
  untouched: 1,
  plannedDailyNew: 100
});
assert.equal(oneDayLate.valid, false);
assert.equal(oneDayLate.reason, "first-exposure-deadline-passed");
assert.equal(oneDayLate.calendarDaysUntilLatest, -1);
assert.equal(oneDayLate.remainingSafeDays, 0);
assert.equal(oneDayLate.status, "impossible");
assert.equal(oneDayLate.impossible, true);
assert.equal(oneDayLate.todayRequired, null, "an impossible schedule must not emit a reassuring target");

const noUntouched = pace.calculateBusinessPace({
  todayKey: "2026-09-01",
  untouched: 0,
  plannedDailyNew: 0
});
assert.equal(noUntouched.valid, true);
assert.equal(noUntouched.requiredPerDay, 0);
assert.equal(noUntouched.todayRequired, 0);
assert.equal(noUntouched.status, "on-track", "the first-exposure scope is complete when none remain");
assert.equal(noUntouched.projectedFinalRecallKey, "");

const afterExam = pace.calculateBusinessPace({
  todayKey: "2026-10-18",
  untouched: 0
});
assert.equal(afterExam.valid, false, "the pace gate must not claim success on or after exam day");
assert.equal(afterExam.reason, "exam-window-closed");
assert.equal(afterExam.impossible, true);

for (const invalid of [
  pace.calculateBusinessPace({ todayKey: "2026-02-30", untouched: 134 }),
  pace.calculateBusinessPace({ todayKey: "2026-08-15", untouched: -1 }),
  pace.calculateBusinessPace({ todayKey: "2026-08-15", untouched: "134" }),
  pace.calculateBusinessPace({ todayKey: "2026-08-15", untouched: 134, plannedDailyNew: "15" })
]) {
  assert.equal(invalid.valid, false);
  assert.equal(invalid.status, "impossible");
  assert.equal(invalid.onTrack, false);
  assert.equal(invalid.impossible, true);
}

const invalidOptionalLoad = pace.calculateBusinessPace({
  todayKey: "2026-08-15",
  untouched: 134,
  plannedDailyNew: 15,
  existingLoad: { retry: "2", due: 3, overdue: 1, nextDueKey: "2026-02-30" }
});
assert.equal(invalidOptionalLoad.valid, true, "optional load corruption must not alter the independently valid pace");
assert.equal(invalidOptionalLoad.existingLoad.valid, false);
assert.equal(invalidOptionalLoad.todayLoad.complete, false);

let reserve = pace.calculateOfficialReserve({ totalExams: 12, exposedExams: 0 });
assert.equal(reserve.status, "safe");
assert.equal(reserve.unseenExams, 12);
assert.equal(reserve.safeStartsRemaining, 9);
assert.equal(reserve.canStartInitial, true);
reserve = pace.calculateOfficialReserve({ totalExams: 12, exposedExams: 8 });
assert.equal(reserve.unseenExams, 4);
assert.equal(reserve.safeStartsRemaining, 1);
assert.equal(reserve.canStartInitial, true, "the last safe start leaves exactly three exams unseen");
assert.equal(reserve.hypotheticalUnseenAfterNext, 3);
reserve = pace.calculateOfficialReserve({ totalExams: 12, exposedExams: 9 });
assert.equal(reserve.status, "hold");
assert.equal(reserve.reserveSatisfied, true);
assert.equal(reserve.safeStartsRemaining, 0);
assert.equal(reserve.canStartInitial, false);
reserve = pace.calculateOfficialReserve({ totalExams: 12, exposedExams: 10 });
assert.equal(reserve.status, "depleted");
assert.equal(reserve.reserveSatisfied, false);
assert.equal(reserve.canStartInitial, false);

for (const invalid of [
  pace.calculateOfficialReserve({ totalExams: 12, exposedExams: 13 }),
  pace.calculateOfficialReserve({ totalExams: "12", exposedExams: 0 }),
  pace.calculateOfficialReserve({ totalExams: 12, exposedExams: -1 }),
  pace.calculateOfficialReserve({ totalExams: 12, exposedExams: 1, minimumReserve: "3" })
]) {
  assert.equal(invalid.valid, false);
  assert.equal(invalid.status, "invalid");
  assert.equal(invalid.canStartInitial, false, "invalid reserve data must fail closed");
}

console.log("Audit-TakkenBusinessPace: OK");
