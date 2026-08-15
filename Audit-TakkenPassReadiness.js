"use strict";

process.env.TZ = "Asia/Tokyo";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const readiness = require("./pass-readiness.js");

const browserContext = {};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "pass-readiness.js"), "utf8"),
  browserContext,
  { filename: "pass-readiness.js" }
);
assert.equal(typeof browserContext.TAKKEN_PASS_READINESS?.calculatePassReadiness, "function");
assert.equal(readiness.EXAM_DAY_KEY, "2026-10-18");
assert.equal(readiness.LAW_BASELINE_DAY_KEY, "2026-04-01");
assert.equal(readiness.FIRST_PASS_DEADLINE_KEY, "2026-08-31");
assert.equal(readiness.TARGET_TOTAL, 40);
assert.equal(readiness.QUESTION_TOTAL, 50);
assert.deepEqual(readiness.SUBJECTS.map(({ key, target, questions }) => [key, target, questions]), [
  ["business", 18, 20], ["rights", 9, 14], ["restrictions", 7, 8], ["tax", 2, 3], ["other", 4, 5]
]);
assert.equal(readiness.validDayKey("2026-02-29"), "");
assert.equal(readiness.validDayKey("2028-02-29"), "2028-02-29");
assert.equal(readiness.daysBetween("2026-08-16", "2026-08-31"), 15);

const blank = readiness.calculatePassReadiness({ todayKey: "2026-08-16" });
assert.equal(blank.valid, true);
assert.equal(blank.status, "unmeasured");
assert.equal(blank.firstPass.daysRemainingInclusive, 16);
assert.deepEqual(blank.unmeasuredSubjectKeys, ["business", "rights", "restrictions", "tax", "other"]);
assert.equal(blank.dailyPlan.theme.mode, "mock", "2026-08-16 is Sunday");
assert.equal(blank.dailyPlan.theme.fitsAvailableMinutes, false);
assert.equal(blank.dailyPlan.businessKnock.count, 20);

const subjects = {
  business: { total: 20, contacted: 20, retained: 18 },
  rights: { total: 14, contacted: 14, retained: 10 },
  restrictions: { total: 8, contacted: 8, retained: 7 },
  tax: { total: 3, contacted: 3, retained: 2 },
  other: { total: 5, contacted: 5, retained: 4 }
};
const score = { business: 18, rights: 9, restrictions: 7, tax: 2, other: 4 };
const stableAttempts = [1, 2, 3].map((index) => ({
  dayKey: `2026-09-0${index}`, total: 40, timed: true, questionCount: 50, sections: score
}));
const onTrack = readiness.calculatePassReadiness({
  todayKey: "2026-08-17", dailyAvailableMinutes: 90, subjects, mockHistory: stableAttempts
});
assert.equal(onTrack.valid, true);
assert.equal(onTrack.status, "on-track");
assert.equal(onTrack.timed50.mock.stable, true);
assert.equal(onTrack.timed50.stable, true);
assert.equal(onTrack.dailyPlan.theme.key, "rights");
assert.equal(onTrack.firstPass.knownRemainingContact, 0);

const weak = readiness.calculatePassReadiness({
  todayKey: "2026-08-17",
  subjects: { ...subjects, rights: { total: 14, contacted: 14, retained: 8 } }
});
assert.equal(weak.status, "urgent");
assert.deepEqual(weak.weakSubjectKeys, ["rights"]);
assert.equal(weak.subjects.find((subject) => subject.key === "rights").state, "weak");

const malformed = readiness.calculatePassReadiness({
  todayKey: "2026-08-17", subjects: { business: { total: 20, contacted: 21, retained: 18 } }
});
assert.equal(malformed.valid, false);
assert.equal(malformed.status, "invalid");
assert.equal(malformed.reason, "invalid-subject-metric");

const shortDay = readiness.calculatePassReadiness({ todayKey: "2026-08-17", dailyAvailableMinutes: 60, subjects });
assert.equal(shortDay.status, "behind");
assert.equal(shortDay.reason, "daily-time-below-minimum");

const late = readiness.calculatePassReadiness({
  todayKey: "2026-09-01",
  subjects: { business: { total: 20, contacted: 10, retained: 9 } }
});
assert.equal(late.status, "unmeasured", "unknown subjects remain explicitly unmeasured");
assert.equal(late.firstPass.deadlinePassedWithWork, true);
assert.equal(late.reason, "first-pass-deadline-passed");

const unstable = readiness.calculatePassReadiness({
  todayKey: "2026-09-05", subjects,
  officialHistory: [
    { total: 41, timed: true, questionCount: 50, sections: score },
    { total: 42, timed: false, questionCount: 50, sections: score },
    { total: 40, timed: true, questionCount: 45, sections: score }
  ]
});
assert.equal(unstable.timed50.official.validTimed50Count, 1);
assert.equal(unstable.timed50.status, "unmeasured");

const historicalPerfectOnly = readiness.calculatePassReadiness({
  todayKey: "2026-09-05", subjects, officialHistory: stableAttempts
});
assert.equal(historicalPerfectOnly.timed50.official.stable, true);
assert.equal(historicalPerfectOnly.timed50.stable, false,
  "historical official answer keys must not establish current-law stability");
assert.equal(historicalPerfectOnly.timed50.status, "unmeasured");

for (const invalid of [
  readiness.calculatePassReadiness({ todayKey: "2026-02-30" }),
  readiness.calculatePassReadiness({ todayKey: "2026-08-16", dailyAvailableMinutes: 0 }),
  readiness.calculatePassReadiness({ todayKey: "2026-10-18" })
]) {
  assert.equal(invalid.valid, false);
  assert.equal(invalid.status, "invalid");
  assert.equal(invalid.onTrack, false);
}

console.log("Audit-TakkenPassReadiness: OK");
