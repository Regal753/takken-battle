"use strict";
// Capture only before adding v59; a present fixture is never overwritten.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
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
if (bank.QUESTIONS.length !== 174 || bank.VERSION !== 5) throw new Error("Capture must use the untouched v58 sprint bank");
const keys = ["2026-09-12", "2026-09-13", "v58-active-answer"];
const fixture = { version:bank.VERSION, keys, questions:Object.fromEntries(bank.QUESTIONS.map(q=>[q.id,
  {canonical:digest(q),presented:keys.map(key=>digest(bank.presentQuestion(q,key)))}])) };
const target = path.join(__dirname, "tax-v59-sprint-compat.json");
if (fs.existsSync(target)) throw new Error("Existing compatibility fixture must not be replaced");
fs.writeFileSync(target, JSON.stringify(fixture, null, 2)+"\n");
console.log(JSON.stringify({ preservedQuestions:174, presentations:522, version:5 }));
