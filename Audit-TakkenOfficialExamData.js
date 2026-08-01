"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const data = require("./official-exam-data.js");

assert.equal(data.EXAMS.length, 12, "official exam editions");
assert.equal(new Set(data.EXAMS.map((exam) => exam.id)).size, 12);
assert.ok(data.EXAM_BY_ID["2021-10"]);
assert.ok(data.EXAM_BY_ID["2021-12"]);
assert.ok(data.EXAM_BY_ID["2020-10"]);
assert.ok(data.EXAM_BY_ID["2020-12"]);

for (const exam of data.EXAMS) {
  assert.equal(exam.answers.length, 50, `${exam.id} answer count`);
  assert.equal(exam.lawStatus, "historical", `${exam.id} law guard`);
  assert.equal(exam.source, "RETIO");
  assert.match(exam.questionUrl, /^https:\/\/(?:www\.)?(?:goukaku\.)?retio\.or\.jp\//);
  assert.match(exam.answerSourceUrl, /^https:\/\/www\.retio\.or\.jp\//);
  exam.answers.forEach((answer, index) => {
    const accepted = Array.isArray(answer) ? answer : [answer];
    assert.ok(accepted.length >= 1, `${exam.id} Q${index + 1} answer`);
    accepted.forEach((choice) => {
      assert.ok(
        Number.isInteger(choice) && choice >= 1 && choice <= 4,
        `${exam.id} Q${index + 1} choice`
      );
    });
  });
  const firstAccepted = Object.fromEntries(
    exam.answers.map((answer, index) => [
      index + 1,
      Array.isArray(answer) ? answer[0] : answer
    ])
  );
  const scored = data.scoreAnswers(exam.id, firstAccepted);
  assert.equal(scored.score, 50, `${exam.id} perfect score`);
  assert.deepEqual(scored.sectionScores, {
    rights: 14,
    restrictions: 8,
    business: 20,
    taxOther: 8
  });
}

assert.ok(data.acceptedAnswer(data.EXAM_BY_ID["2022"].answers[47], 4));
assert.ok(data.acceptedAnswer(data.EXAM_BY_ID["2021-12"].answers[43], 3));
assert.ok(data.acceptedAnswer(data.EXAM_BY_ID["2020-10"].answers[41], 4));

const untouchedAfterDaily2025 = data.EXAMS.filter((exam) => exam.id !== "2025");
assert.ok(
  untouchedAfterDaily2025.length >= 10,
  "initial target remains attainable after the 2025 daily drill"
);

const app = fs.readFileSync("app.js", "utf8");
assert.match(app, /const OFFICIAL_INITIAL_TARGET = 10/);
assert.match(app, /const OFFICIAL_RETEST_TARGET = 3/);
assert.match(app, /const OFFICIAL_RETEST_WAIT_DAYS = 14/);
assert.match(app, /function officialRetestEligibility/);
assert.match(app, /function officialReadinessStats/);
assert.match(app, /mean >= 40 && minimum >= 37/);
assert.match(app, /mean >= 37 && minimum >= 35/);
assert.match(app, /sourceMode !== "timed-answer-sheet"/);
assert.match(app, /CURRENT_LAW_BASELINE = "2026-04-01"/);

console.log(JSON.stringify({
  status: "ok",
  editions: data.EXAMS.length,
  distinctPandemicSessions: 4,
  untouchedAfterDaily2025: untouchedAfterDaily2025.length,
  initialTarget: 10,
  retestTarget: 3,
  retestWaitDays: 14
}));
