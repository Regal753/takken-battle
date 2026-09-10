"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const crypto = require("node:crypto");
const sandbox = { window: {}, URL }; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ["exam-blueprint.js", "exam-question-core.js", "exam-questions-rights.js",
  "exam-questions-restrictions.js", "exam-questions-tax-other.js", "exam-questions-business.js",
  "business-fullscore-supplement.js", "business-fullscore-bank.js", "business-hard-front.js",
  "business-hard-contracts.js", "business-hard-practice.js", "business-fresh-front.js",
  "business-fresh-contracts.js", "business-fresh-practice.js", "business-hard-bank.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), sandbox, { filename: file });
}
const bank = sandbox.window.TAKKEN_BUSINESS_HARD_BANK;
const raw = [...sandbox.window.TAKKEN_BUSINESS_HARD_FRONT, ...sandbox.window.TAKKEN_BUSINESS_HARD_CONTRACTS,
  ...sandbox.window.TAKKEN_BUSINESS_HARD_PRACTICE, ...sandbox.window.TAKKEN_BUSINESS_FRESH_FRONT,
  ...sandbox.window.TAKKEN_BUSINESS_FRESH_CONTRACTS, ...sandbox.window.TAKKEN_BUSINESS_FRESH_PRACTICE];
const plain = value => JSON.parse(JSON.stringify(value));
assert.equal(bank.QUESTIONS.length, 180);
assert.equal(new Set(bank.QUESTIONS.map(q => q.id)).size, 180);
assert.equal(sandbox.window.TAKKEN_BUSINESS_FULLSCORE_BANK.QUESTIONS.length, 134, "legacy bank contract must not change");
assert.deepEqual(plain(bank.QUESTIONS.map(q => q.id).sort()), [
  ...Array.from({ length: 60 }, (_, i) => `hard54-${String(i + 1).padStart(3, "0")}`),
  ...Array.from({ length: 120 }, (_, i) => `hard55-${String(i + 1).padStart(3, "0")}`)
]);
const compat = JSON.parse(fs.readFileSync(path.join(__dirname, "scripts/business-hard-v54-compat.json"), "utf8"));
function viewDigest(q) {
  return crypto.createHash("sha256").update(JSON.stringify({ text:q.text, choices:q.choices, answer:q.answer,
    displayModel:q.displayModel, choiceExplanations:q.choiceExplanations, statementExplanations:q.statementExplanations,
    facts:q.sourceFacts.map(f=>({key:f.key,truth:f.truth,statement:f.statement,reason:f.reason})),
    explain:q.explain, trap:q.trap })).digest("hex");
}
for (const [id, hashes] of Object.entries(compat.questions)) {
  assert.equal(viewDigest(bank.QUESTIONS_BY_ID[id]), hashes.canonical, `${id}: old case must not move its answer or judgments`);
  assert.equal(viewDigest(bank.presentQuestion(id, compat.presentationKey)), hashes.presented, `${id}: old presentation key must keep its selected judgment`);
}
assert.deepEqual(Object.keys(compat.questions).sort(),Array.from({length:60},(_,i)=>`hard54-${String(i+1).padStart(3,"0")}`),"compat fixture must cover the exact original sixty IDs");
const adapterSource=fs.readFileSync(path.join(__dirname,"business-hard-bank.js"),"utf8");
for(const pack of ["TAKKEN_BUSINESS_HARD_FRONT","TAKKEN_BUSINESS_HARD_CONTRACTS","TAKKEN_BUSINESS_HARD_PRACTICE",
  "TAKKEN_BUSINESS_FRESH_FRONT","TAKKEN_BUSINESS_FRESH_CONTRACTS","TAKKEN_BUSINESS_FRESH_PRACTICE"]) {
  const missing={window:{...sandbox.window}};
  delete missing.window[pack]; delete missing.window.TAKKEN_BUSINESS_HARD_BANK;
  vm.createContext(missing);
  assert.throws(()=>vm.runInContext(adapterSource,missing),/requires every/);
  assert.equal(missing.window.TAKKEN_BUSINESS_HARD_BANK,undefined,`${pack}: a partial bank must not be published`);
  for (const allHoles of [false,true]) {
    const sparse={window:{...sandbox.window}};
    const original=sandbox.window[pack];
    sparse.window[pack]=allHoles ? new Array(original.length) : [...original];
    if(!allHoles) delete sparse.window[pack][original.length-1];
    delete sparse.window.TAKKEN_BUSINESS_HARD_BANK;
    vm.createContext(sparse);
    assert.throws(()=>vm.runInContext(adapterSource,sparse),/requires every/);
    assert.equal(sparse.window.TAKKEN_BUSINESS_HARD_BANK,undefined,`${pack}: sparse arrays must not publish a shortened bank`);
  }
}
const knownSourceIds = new Set(Object.keys(sandbox.window.TAKKEN_EXAM_QUESTIONS));
for (const q of raw) {
  assert.ok(q.sourceQuestionIds.every(id => knownSourceIds.has(id) || sandbox.window.TAKKEN_BUSINESS_FULLSCORE_SUPPLEMENT?.ANCHORS?.some(a => a.id === id)), `${q.id}: invalid remediation anchor`);
  if (q.id.startsWith("hard55-")) assert.ok(q.noveltyNote?.length >= 20, `${q.id}: document the actual new boundary, not a name/number substitution`);
}
assert.equal(new Set(raw.map(q => q.premise)).size, 180, "every authored case needs its own scenario");
assert.equal(new Set(raw.filter(q => q.id.startsWith("hard55-")).map(q => q.noveltyNote)).size, 120, "new scenarios need individually reviewed differences");
const normalizeCaseText = text => text.normalize("NFKC").replace(/[A-Z]/g, "者").replace(/[0-9]+(?:[.,][0-9]+)*/g, "#").replace(/[\s、。・「」『』（）()]/g, "");
assert.equal(new Set(raw.map(q => normalizeCaseText(q.premise))).size,180,"changing only party letters or numbers must not count as a new scenario");
const judgmentBundles = raw.map(q => (q.choices || q.statements).map(f => normalizeCaseText(f.text)).sort().join("|"));
assert.equal(new Set(judgmentBundles).size,180,"an identical four-judgment bundle must not be repackaged as another new case");
function grams(text) {
  const chars = [...normalizeCaseText(text)];
  return new Set(chars.slice(0,-3).map((_,i)=>chars.slice(i,i+4).join("")));
}
const gramSets = raw.map(q=>grams(q.premise));
const similarityReview = [];
for (let i=60;i<raw.length;i++) {
  let closest={id:raw[i].id,otherId:"",score:0};
  for (let j=0;j<i;j++) {
    const overlap=[...gramSets[i]].filter(g=>gramSets[j].has(g)).length;
    const score=2*overlap/(gramSets[i].size+gramSets[j].size);
    if(score>closest.score) closest={id:raw[i].id,otherId:raw[j].id,score};
  }
  similarityReview.push({...closest,score:Number(closest.score.toFixed(3))});
}
similarityReview.sort((a,b)=>b.score-a.score);
const inspection = sandbox.window.TAKKEN_EXAM_QUESTIONS.b024;
assert.match(inspection.memoryRule, /貸借も/);
assert.doesNotMatch(inspection.memoryRule, /貸借ではなく/);
const feeCase = sandbox.window.TAKKEN_EXAM_QUESTIONS.b037;
assert.ok(feeCase.choices.some(text => /貸主から代理/.test(text) && /0\.55/.test(text)), "lessor agency must retain the residential lessee mediation consent boundary");
const formatCounts = {}, unitCounts = {}, slots = [0, 0, 0, 0];
const countAnswers = {};
let longestCorrect = 0, shortestCorrect = 0;
for (const q of bank.QUESTIONS) {
  const source = raw.find(s => s.id === q.id);
  const facts = source.choices || source.statements;
  assert.ok(Object.isFrozen(q) && Object.isFrozen(q.choices));
  assert.equal(q.difficulty, "hard");
  assert.notEqual(q.unitId, "business-book-05", "no guarantee-association focus in daily hard bank");
  assert.ok(q.premise.length >= 65, `${q.id}: a fact-dependent case is required`);
  assert.ok(facts.every(f => f.reason.length >= 22), `${q.id}: explain the boundary for every judgment`);
  assert.equal(q.choices.length, 4);
  assert.equal(new Set(q.choices).size, 4);
  assert.equal(q.sourceFacts.length, 4);
  assert.equal(q.legalBaseline, "2026-04-01");
  for (const s of q.legalSources) {
    assert.match(s.url, /^https:\/\/(laws\.e-gov\.go\.jp|www\.mlit\.go\.jp|www\.skr\.mlit\.go\.jp|disaportal\.gsi\.go\.jp)\//);
    assert.ok(s.reference && s.checkedAt === (q.id.startsWith("hard55-") ? "2026-09-11" : "2026-09-10"));
  }
  const matching = facts.filter(f => f.truth === (q.ask === "correct"));
  if (q.formatKey === "single") {
    assert.equal(matching.length, 1);
    assert.equal(q.choices[q.answer], matching[0].text);
    const lengths = q.choices.map(text => text.length);
    if (lengths[q.answer] === Math.max(...lengths)) longestCorrect++;
    if (lengths[q.answer] === Math.min(...lengths)) shortestCorrect++;
  } else if (q.formatKey === "count") {
    countAnswers[matching.length] = (countAnswers[matching.length] || 0) + 1;
    assert.deepEqual(plain([...q.choices].sort()), ["1個", "2個", "3個", "4個"]);
    assert.equal(q.choices[q.answer], `${matching.length}個`);
  } else {
    assert.equal(matching.length, 2);
    assert.ok(q.choices.every(text => text.split("・").length === 2), "combination shape must not reveal answer");
  }
  const stable = JSON.stringify(q);
  const seenAnswers = new Set();
  for (let i = 0; i < 24; i++) {
    const key = `2026-09-10:hard-audit-${i}`;
    const p = bank.presentQuestion(q, key);
    seenAnswers.add(p.answer);
    assert.deepEqual(plain(p), plain(bank.presentQuestion(q.id, key)), "reload must preserve presentation");
    assert.equal(p.choices[p.answer], q.choices[q.answer]);
    assert.equal(new Set(p.presentationOrder).size, 4);
    assert.equal(p.presentationKey, key);
    for (let j = 0; j < 4; j++) {
      const original = p.presentationOrder[j];
      assert.equal(p.choiceExplanations[j].replace(/^[1-4]\s/, ""), q.choiceExplanations[original].replace(/^[1-4]\s/, ""));
      assert.equal(bank.diagnosticsForSelection(p, j).length === 0, j === p.answer);
      if (q.formatKey === "single") {
        assert.equal(p.sourceFacts[j].presentedStatement, p.choices[j]);
        assert.equal(p.displayModel.choiceBlocks[j].judgment, p.choices[j]);
      }
    }
  }
  assert.ok(seenAnswers.size >= 3, `${q.id}: varied answer placement`);
  assert.equal(JSON.stringify(q), stable, "presentation must not mutate canonical answers");
  formatCounts[q.formatKey] = (formatCounts[q.formatKey] || 0) + 1;
  unitCounts[q.unitId] = (unitCounts[q.unitId] || 0) + 1;
  slots[q.answer]++;
}
assert.deepEqual(formatCounts, { single: 144, count: 20, combination: 16 });
assert.deepEqual(slots, [45, 45, 45, 45]);
assert.deepEqual(countAnswers, { 1: 5, 2: 5, 3: 5, 4: 5 }, "count answers must not reduce to an implicit two-choice bank");
assert.equal(Object.keys(unitCounts).length, 10);
assert.ok(longestCorrect <= 72 && shortestCorrect <= 72, "answer length alone must not solve most single cases");
const knock = require("./business-knock.js");
for (let seed = 0; seed < 40; seed++) {
  const history = {}, seen = new Set();
  for (let day = 0; day < 9; day++) {
    const now = `2026-09-${10 + day}`;
    const plan = knock.plan({ questions: bank.QUESTIONS, history, now, mode: "all-random", dailyRemainder: 20, seed: `${seed}:${day}` });
    assert.equal(plan.size, 20);
    const counts = {};
    for (const id of plan.ids) {
      assert.equal(seen.has(id), false, "fresh pool must rotate through all nine sets before repeats when no reviews are due");
      seen.add(id);
      const unit = bank.QUESTIONS_BY_ID[id].unitId;
      counts[unit] = (counts[unit] || 0) + 1;
      history[id] = { attempts: 1, correct: 1, lastConfidence: "confident", lastAnsweredAt: now, reviewLevel: 0, confidentDayKeys: [] };
    }
    if (day === 0) {
      assert.equal(Object.keys(counts).length, 10, "first fresh daily20 must cover every eligible unit");
      assert.ok(Math.max(...Object.values(counts)) <= 7, "do not let the largest unit monopolize a fresh daily20");
      assert.ok(counts["business-book-07"] >= 4 && counts["business-book-08"] >= 3, "keep business conduct and eight restrictions prominent");
    }
  }
  assert.equal(seen.size, 180);
}
const first = bank.QUESTIONS[0].id, second = bank.QUESTIONS[1].id;
const priority = knock.plan({ questions: bank.QUESTIONS, history: {
  [first]: { attempts: 1, lastConfidence: "wrong" },
  [second]: { attempts: 1, lastConfidence: "confident", lastAnsweredAt: "2026-09-08", reviewLevel: 1, confidentDayKeys: ["2026-09-08"] }
}, mode: "all-random", dailyRemainder: 20, now: "2026-09-10", seed: "urgent" });
assert.deepEqual(plain(priority.ids.slice(0, 2)), [first, second]);
const excluded = knock.plan({ questions: bank.QUESTIONS, mode: "all-random", dailyRemainder: 20,
  answeredTodayIds: priority.ids, now: "2026-09-10", seed: "remainder" });
assert.ok(excluded.ids.every(id => !priority.ids.includes(id)));
const yesterday = bank.QUESTIONS.slice(0, 20);
const dueHistory = Object.fromEntries(yesterday.map(q => [q.id, { attempts: 1, correct: 1, lastConfidence: "confident",
  lastAnsweredAt: "2026-09-09", reviewLevel: 1, confidentDayKeys: ["2026-09-09"] }]));
const mixedDay = knock.plan({ questions: bank.QUESTIONS, history: dueHistory, mode: "all-random",
  dailyRemainder: 20, now: "2026-09-10", seed: "daily-due-with-fresh" });
assert.equal(mixedDay.ids.filter(id => !dueHistory[id]).length, 8, "daily20 must reserve8 fresh cases when20reviews are due");
assert.ok(mixedDay.ids.slice(0, 12).every(id => dueHistory[id]), "reviews retain priority within their lane");
const reviewOnly = knock.plan({ questions: bank.QUESTIONS, history: dueHistory, mode: "weak-due", size: 20,
  now: "2026-09-10", seed: "explicit-reviews" });
assert.equal(reviewOnly.size, 20);
assert.ok(reviewOnly.ids.every(id => dueHistory[id]), "explicit review mode must not substitute new cases");
const freshHistory = Object.fromEntries(bank.QUESTIONS.filter(q => q.id.startsWith("hard54-")).map(q => [q.id,{attempts:5,lastConfidence:"wrong"}]));
const freshSeen = new Set();
for (let round = 0; round < 6; round++) {
  const set = knock.plan({questions:bank.QUESTIONS, history:freshHistory, mode:"untouched", size:20, seed:`fresh55:${round}`, now:"2026-09-11"});
  assert.equal(set.size,20);
  for (const id of set.ids) {
    assert.match(id,/^hard55-/); assert.ok(!freshSeen.has(id)); freshSeen.add(id);
    freshHistory[id]={attempts:1,lastConfidence:"wrong"};
  }
}
assert.equal(freshSeen.size,120,"new-question mode must expose all120 additions without recycling the old60 or answered new cases");
assert.equal(knock.plan({questions:bank.QUESTIONS,history:freshHistory,mode:"untouched",size:20,seed:"exhausted"}).size,0,"exhausted new mode must not silently substitute reviews");
console.log(JSON.stringify({ audit: "business hard bank", status: "PASS", questions: 180, newQuestions:120, legacyViewHashes:60, formatCounts, unitCounts, slots, countAnswers, longestCorrect, shortestCorrect, rotationSeeds: 40, normalizedDuplicateScenarios:0, normalizedDuplicateJudgmentBundles:0, closestScenarioPairsForHumanReview:similarityReview.slice(0,8) }));
