"use strict";

// Five wording-only repairs must not rewrite a saved answer or rotate a choice.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const ROOT = __dirname;
const FIXTURE = path.join(ROOT, "scripts/business-polish-v58-compat.json");
const CHANGED = ["hard55-018", "hard55-044", "hard55-087", "hard55-098", "hard55-120"];
const FILES = ["exam-blueprint.js", "exam-question-core.js", "exam-questions-rights.js",
  "exam-questions-restrictions.js", "exam-questions-tax-other.js", "exam-questions-business.js",
  "business-fullscore-supplement.js", "business-fullscore-bank.js", "business-hard-front.js",
  "business-hard-contracts.js", "business-hard-practice.js", "business-fresh-front.js",
  "business-fresh-contracts.js", "business-fresh-practice.js", "business-hard-bank.js"];
function load(ref) {
  const sandbox = { window: {}, URL };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const file of FILES) {
    const source = ref ? execFileSync("git", ["show", `${ref}:${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 5_000_000 })
      : fs.readFileSync(path.join(ROOT, file), "utf8");
    vm.runInContext(source, sandbox, { filename: file });
  }
  return sandbox.window;
}
function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function grading(q) {
  return { id: q.id, formatKey: q.formatKey, ask: q.ask, answer: q.answer, choices: q.choices,
    choiceExplanations: q.choiceExplanations, statementExplanations: q.statementExplanations,
    diagnosticTags: q.diagnosticTags, choiceDiagnosticTags: q.choiceDiagnosticTags,
    facts: q.sourceFacts.map(f => ({ key: f.key, truth: f.truth, statement: f.statement, reason: f.reason,
      choiceIndex: f.choiceIndex, statementIndex: f.statementIndex })),
    choiceBlocks: q.displayModel.choiceBlocks,
    presentationKey: q.presentationKey, presentationOrder: q.presentationOrder };
}
function snapshot(runtime) {
  const bank = runtime.TAKKEN_BUSINESS_HARD_BANK;
  const presentations = bank.QUESTIONS.flatMap(q => Array.from({ length: 32 }, (_, i) =>
    grading(bank.presentQuestion(q.id, `business-polish-v59-${i}`))));
  return { bankVersion: bank.VERSION, fullscoreVersion: runtime.TAKKEN_BUSINESS_FULLSCORE_BANK.VERSION,
    ids: bank.QUESTIONS.map(q => q.id), canonicalGrading: digest(bank.QUESTIONS.map(grading)),
    presentedGrading: digest(presentations), untouchedFullView: digest(bank.QUESTIONS.filter(q => !CHANGED.includes(q.id))),
    changedPremisesBefore: Object.fromEntries(bank.QUESTIONS.filter(q => CHANGED.includes(q.id)).map(q => [q.id, digest(q.premise)])) };
}
if (process.argv[2] === "--capture-base") {
  assert.ok(!fs.existsSync(FIXTURE), "compat fixture is immutable; do not regenerate after repairs");
  const base = process.argv[3];
  assert.match(base || "", /^[a-f0-9]{7,40}$/);
  fs.writeFileSync(FIXTURE, `${JSON.stringify({ base, ...snapshot(load(base)) }, null, 2)}\n`);
  console.log(JSON.stringify({ status: "captured", base, questions: 180, presentations: 5760 }));
} else {
  const expected = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const runtime = load();
  const actual = JSON.parse(JSON.stringify(snapshot(runtime)));
  for (const field of ["bankVersion", "fullscoreVersion", "ids", "canonicalGrading", "presentedGrading", "untouchedFullView"]) {
    assert.deepEqual(actual[field], expected[field], `${field}: saved-answer contract must stay unchanged`);
  }
  const bank = runtime.TAKKEN_BUSINESS_HARD_BANK;
  for (const id of CHANGED) assert.notEqual(digest(bank.QUESTIONS_BY_ID[id].premise), expected.changedPremisesBefore[id], `${id}: repair missing`);
  assert.match(bank.QUESTIONS_BY_ID["hard55-018"].premise, /Aは免許を受けた宅建業者に勤務し/);
  assert.match(bank.QUESTIONS_BY_ID["hard55-044"].premise, /非業者である買主C/);
  assert.doesNotMatch(bank.QUESTIONS_BY_ID["hard55-087"].premise, /Aの事務所等ではなく/);
  assert.doesNotMatch(bank.QUESTIONS_BY_ID["hard55-098"].premise, /第43条|ただし書|事情が認められ/);
  assert.doesNotMatch(bank.QUESTIONS_BY_ID["hard55-120"].premise, /適法な住宅販売|要件を全て満たす/);
  assert.match(bank.QUESTIONS_BY_ID["hard55-120"].premise, /金額以外の/);
  console.log(JSON.stringify({ status: "PASS", repaired: CHANGED, unchangedFullViews: 175,
    unchangedCanonicalAnswers: 180, unchangedPresentedAnswers: 5760, bankVersion: actual.bankVersion }));
}
