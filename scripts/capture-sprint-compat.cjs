"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
global.window = {};
for (const file of ["exam-blueprint.js", "exam-question-core.js", "exam-questions-rights.js", "exam-questions-restrictions.js", "exam-questions-tax-other.js"]) require(path.join(root, file));
const bank = require(path.join(root, "subject-sprint-bank.js"));
function digest(q) {
  return crypto.createHash("sha256").update(JSON.stringify({
    id:q.id, text:q.text, choices:q.choices, answer:q.answer, format:q.format,
    choiceExplanations:q.choiceExplanations, statementExplanations:q.statementExplanations,
    sourceFacts:q.sourceFacts.map(f=>({key:f.key,statement:f.statement,truth:f.truth,reason:f.reason})),
    displayModel:q.displayModel, explain:q.explain, trap:q.trap
  })).digest("hex");
}
const keys = ["2026-09-11", "2026-09-12", "legacy-attempt-seed"];
if (bank.QUESTIONS.length !== 102) throw new Error("Capture must run against the untouched v57 bank");
const fixture = { version:bank.VERSION, keys, questions:Object.fromEntries(bank.QUESTIONS.map(q=>[q.id,
  {canonical:digest(q),presented:keys.map(key=>digest(bank.presentQuestion(q,key)))}])) };
const target = path.join(__dirname, "restrictions-v58-sprint-compat.json");
if (fs.existsSync(target)) throw new Error("Compatibility fixture already exists; do not overwrite the baseline");
fs.writeFileSync(target, JSON.stringify(fixture, null, 2)+"\n");
console.log(JSON.stringify({legacy_questions:bank.QUESTIONS.length,version:bank.VERSION,presentation_keys:keys.length}));
