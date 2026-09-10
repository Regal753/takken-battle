"use strict";
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const files = ["exam-blueprint.js", "exam-question-core.js", "exam-questions-rights.js", "exam-questions-restrictions.js", "exam-questions-tax-other.js", "exam-questions-business.js", "case-exam-rights.js", "case-exam-restrictions.js", "case-exam-tax-other.js", "case-exam-business.js", "case-exam-bank.js"];
function load() {
  const context = { window: {} }; vm.createContext(context);
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context, { filename: file });
  return context.window;
}
const root = load(), form = root.TAKKEN_CASE_EXAM_BANK.forms[0], questions = form.questions;
assert.equal(form.id, "case-form-2026-a");
assert.equal(form.evidenceClass, "authored-case-practice");
assert.equal(questions.length, 50);
assert.equal(new Set(questions.map(q => q.id)).size, 50);
assert.equal(JSON.stringify(questions), JSON.stringify(load().TAKKEN_CASE_EXAM_BANK.forms[0].questions), "answer order must survive reload");
const sections = {}, formats = {}, positions = [0, 0, 0, 0], seenChoices = new Set();
const raw = [...root.TAKKEN_CASE_EXAM_RIGHTS, ...root.TAKKEN_CASE_EXAM_RESTRICTIONS, ...root.TAKKEN_CASE_EXAM_TAX_OTHER, ...root.TAKKEN_CASE_EXAM_BUSINESS];
for (const q of questions) {
  const authored = raw.find(item => item.id === q.id);
  sections[q.sectionId] = (sections[q.sectionId] || 0) + 1;
  formats[q.formatFamily] = (formats[q.formatFamily] || 0) + 1;
  positions[q.answer]++;
  assert.equal(q.choices.length, 4, q.id);
  assert.equal(new Set(q.choices).size, 4, `${q.id}: duplicate options`);
  assert.equal(q.choiceExplanations.length, 4, q.id);
  assert.ok(q.premise.length >= 20 && q.stem.length >= 10, `${q.id}: explicit case and question`);
  assert.ok(q.explain.length >= 20 && q.trap.length >= 10, `${q.id}: actionable explanations`);
  assert.ok(q.sourceQuestionIds.every(id => root.TAKKEN_EXAM_QUESTIONS[id]), `${q.id}: review source exists`);
  assert.ok(q.legalSources.length && q.legalSources.every(s => /^https:\/\//.test(s.url) && s.reference && s.checkedAt), `${q.id}: sourced legal judgments`);
  assert.equal(q.legalBaseline, "2026-04-01");
  assert.doesNotMatch(q.text + q.choices.join(""), /保証協会|弁済業務保証金|①.*②/, `${q.id}: no retired focus or atom pair template`);
  const facts = authored.choices || authored.statements;
  const matching = facts.map((fact, i) => fact.truth === (authored.ask !== "incorrect") ? i : -1).filter(i => i >= 0);
  if (q.formatFamily === "single") {
    assert.equal(matching.length, 1, `${q.id}: unique correct answer`);
    assert.equal(q.choices[q.answer], facts[matching[0]].text, `${q.id}: shuffled answer/choice alignment`);
    q.choices.forEach((choice, i) => {
      const fact = facts.find(f => f.text === choice);
      assert.ok(q.choiceExplanations[i].endsWith(fact.reason), `${q.id}: explanation follows choice`);
      assert.equal(q.choiceTruths[i], fact.truth);
      assert.ok(!seenChoices.has(choice), `${q.id}: copied option`); seenChoices.add(choice);
    });
  } else if (q.formatFamily === "count") {
    assert.equal(q.choices[q.answer], `${matching.length}個`, `${q.id}: count recomputed`);
    assert.equal(q.statements.length, 4);
  } else {
    assert.equal(q.choices[q.answer], matching.map(i => ["ア", "イ", "ウ", "エ"][i]).join("・") || "該当なし", `${q.id}: combination recomputed`);
    assert.equal(q.statements.length, 4);
  }
}
assert.deepEqual(sections, { rights: 14, restrictions: 8, tax: 3, business: 20, other: 5 });
assert.deepEqual(formats, { single: 38, count: 7, combination: 5 });
assert.ok(Math.max(...positions) - Math.min(...positions) <= 1, "balanced positions");
for (let start = 0; start < 50; start++) for (let period = 1; period <= 4; period++) {
  const length = Math.max(4, period * 2);
  if (start + length <= 50) assert.ok(!questions.slice(start, start + length).every((q, i) => q.answer === questions[start + i % period].answer), "no repeating answer sequence");
}
assert.equal(questions.filter(q => q.sectionId !== "other").length, 45, "five-exempt form");
const tail = questions.slice(45).map(q => q.tag);
[/機構|住宅金融/, /表示|広告/, /統計|地価|着工/, /土地|地形/, /建物|構造|鉄筋|RC/].forEach((regex, i) => assert.match(tail[i], regex));
assert.match(questions[24].tag, /価格|鑑定/);
const lengthStats = questions.map(q => [...q.premise + q.stem + q.statements.map(s => s.text).join("") + q.choices.join("")].length);
console.log(JSON.stringify({ status: "ok", questions: 50, sections, formats, positions, minimumChars: Math.min(...lengthStats), meanChars: Math.round(lengthStats.reduce((a,b) => a+b,0)/50), sourceReferences: questions.reduce((n,q)=>n+q.legalSources.length,0), note: "Structural safeguards are not psychometric difficulty calibration." }));
