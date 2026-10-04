"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const readiness = require("./pass-readiness.js");
const rows = (scores, days = ["2026-09-20", "2026-09-27", "2026-10-04"]) => ({
  initialCount: 3,
  latestThreeInitial: scores.map((score50, i) => ({ examId: `retio-${2022 + i}`, dayKey: days[i], score50 }))
});
const assess = (input, today = "2026-10-04") => readiness.assessOfficialTransfer(input, today);
const lowFloor = assess(rows([43, 40, 37]));
assert.equal(lowFloor.mean, 40);
assert.equal(lowFloor.historicalPassed, true, "preserve prior transfer evidence");
assert.equal(lowFloor.passed, false, "a 37-point floor must not be called stable 40");
assert.equal(lowFloor.label, "平均40・下振れあり");
assert.equal(assess(rows([40, 40, 40])).passed, true);
assert.equal(assess(rows([40, 40, 40])).label, "直近3回40点以上");
assert.equal(assess(rows([50, 50, 39.999])).passed, false, "do not round a sub-40 score up");
assert.equal(assess(rows([36 * 50 / 45, 37 * 50 / 45, 38 * 50 / 45])).passed, true, "45-question profile uses the same 50-question equivalent");
assert.equal(assess(rows([40, 41, 42], ["2026-08-10", "2026-08-17", "2026-08-24"])).passed, false);
assert.equal(assess(rows([40, 41, 42], ["2026-08-10", "2026-08-17", "2026-08-24"])).label, "40点以上・再確認待ち");
assert.equal(assess(rows([40, 41, 42], ["2026-09-01", "2026-09-10", "2026-09-21"]), "2026-10-05").passed, true, "14-day age / 21 inclusive-day window boundary");
assert.equal(assess(rows([40, 41, 42], ["2026-09-01", "2026-09-10", "2026-09-21"]), "2026-10-06").passed, false);
assert.equal(assess(rows([40, 41, 42], ["2026-09-01", "2026-09-10", "2026-09-22"]), "2026-10-04").passed, false, "22 inclusive days is too wide");
for (const input of [
  rows([40, 41, 42], ["2026-10-02", "2026-10-03", "2026-10-05"]),
  rows([40, 41, 42], ["2026-10-02", "2026-10-02", "2026-10-04"]),
  { ...rows([40, 41, 42]), latestThreeInitial: rows([40, 41, 42]).latestThreeInitial.map(r => ({ ...r, examId: "same" })) },
  { ...rows([40, 41, 42]), initialCount: 2 },
  { initialCount: 0, latestThreeInitial: [] }
]) assert.equal(assess(input).passed, false, "missing, duplicate and future evidence fail closed");
const input = rows([40, 41, 42]);
const before = JSON.stringify(input);
assess(input);
assert.equal(JSON.stringify(input), before, "assessment never rewrites saved performance");

const context = { window: {} };
vm.createContext(context);
for (const file of ["exam-blueprint.js", "exam-question-core.js", "exam-questions-rights.js"])
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
const bank = context.window.TAKKEN_EXAM_QUESTIONS;
assert.equal(Object.keys(bank).length, 44, "no new scored IDs or apparent coverage inflation");
const checks = [bank.r008, bank.r009].flatMap(q => q.reasoningChecks);
assert.equal(checks.length, 6);
for (const c of checks) {
  assert.equal(c.legalBaseline, "2026-04-01");
  assert.equal(c.verifiedAt, "2026-10-04");
  assert.match(c.sourceUrl, /^https:\/\/laws\.e-gov\.go\.jp\/law\//);
  assert.ok(c.prompt.length > 40 && c.answer.length > 40 && c.sourceLocator);
  assert.ok(Object.isFrozen(c));
}
assert.match(checks[0].answer, /連帯根保証/);
assert.match(checks[5].answer, /差押え前の原因/);
assert.match(checks[5].answer, /他人の債権/);
const app = fs.readFileSync("app.js", "utf8");
assert.match(app, /PASS_READINESS\.assessOfficialTransfer/);
assert.doesNotMatch(app, /\? "安定40"|\? "合格域"/);
console.log("Audit-TakkenLearningEffectiveness: OK (score floors, freshness, independence, six unscored contrast checks)");
