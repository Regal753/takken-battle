"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const zlib = require("node:zlib");
const bank = require("./restrictions-authored-bank.js");
global.window = {};
for (const name of ["exam-blueprint", "exam-question-core", "exam-questions-rights", "exam-questions-restrictions", "exam-questions-tax-other"]) require(`./${name}.js`);
const sprint = require("./subject-sprint-bank.js");
const legacy = require("./scripts/restrictions-v58-sprint-compat.json");
const grouped = (rows, key) => rows.reduce((r,q) => { r[q[key]] = (r[q[key]] || 0) + 1; return r; }, {});
const normalize = text => String(text).normalize("NFKC").replace(/[\s。、・「」『』（）()]/g, "");
const digest = q => crypto.createHash("sha256").update(JSON.stringify({
  id:q.id,text:q.text,choices:q.choices,answer:q.answer,format:q.format,
  choiceExplanations:q.choiceExplanations,statementExplanations:q.statementExplanations,
  sourceFacts:q.sourceFacts.map(f=>({key:f.key,statement:f.statement,truth:f.truth,reason:f.reason})),
  displayModel:q.displayModel,explain:q.explain,trap:q.trap
})).digest("hex");
assert.equal(bank.QUESTIONS.length,72);
assert.equal(bank.LEGAL_BASELINE,"2026-04-01");
assert.equal(bank.VERIFIED_AT,"2026-09-12");
assert.equal(new Set(bank.QUESTION_IDS).size,72);
assert.deepEqual(grouped(bank.RAW_QUESTIONS,"format"),{single:54,count:12,combination:6});
assert.deepEqual(grouped(bank.QUESTIONS,"sourceAnchor"),{
  "都市計画法":18,"国土利用計画法":8,"建築基準法":18,"土地区画整理法":8,"農地法":10,"宅地造成及び特定盛土等規制法":10
});
assert.deepEqual([0,1,2,3].map(answer=>bank.QUESTIONS.filter(q=>q.answer===answer).length),[18,18,18,18]);
const officialHosts = new Set(["laws.e-gov.go.jp","elaws.e-gov.go.jp","www.mlit.go.jp","www.maff.go.jp"]);
const factKeys = new Set();
const caseKeys = new Set();
const noveltyKeys = new Set();
const lengths = [];
for (const q of bank.QUESTIONS) {
  assert.equal(q.authoredCase,true,q.id);
  assert.equal(q.choices.length,4,q.id);
  assert.equal(new Set(q.choices).size,4,q.id);
  assert.equal(q.sourceFacts.length,4,q.id);
  assert.ok(Object.isFrozen(q) && Object.isFrozen(q.sourceFacts),q.id);
  assert.ok(q.trap.length>=8 && q.explain.length>=15,q.id);
  assert.ok(q.noveltyNote.length>=12,q.id);
  assert.ok(!noveltyKeys.has(normalize(q.noveltyNote)),`${q.id}: repeated novelty note`);
  noveltyKeys.add(normalize(q.noveltyNote));
  const caseKey=normalize(q.text+q.sourceFacts.map(f=>f.statement).join(""));
  assert.ok(!caseKeys.has(caseKey),`${q.id}: duplicate complete question`);
  caseKeys.add(caseKey);
  lengths.push(q.displayModel.intro.length+q.sourceFacts.reduce((n,f)=>n+f.statement.length,0));
  for (const source of q.legalSources) {
    assert.ok(officialHosts.has(new URL(source.url).hostname),`${q.id}: primary source host`);
    assert.equal(source.checkedAt,bank.VERIFIED_AT,q.id);
    assert.ok(source.reference.length>=3,q.id);
    assert.ok(!source.url.includes("349AC0000000092"),`${q.id}: invalid national land law ID`);
  }
  for (const [i,fact] of q.sourceFacts.entries()) {
    assert.equal(fact.key,`${q.id}:${i}`);
    assert.ok(!factKeys.has(fact.key),fact.key);
    factKeys.add(fact.key);
    assert.equal(fact.context,q.premise,q.id);
    assert.ok(fact.reason.length>=12 && fact.sourceLocator.length>=3,`${fact.key}: specific legal reason`);
    assert.equal(q.choiceExplanations[i].includes(fact.truth ? "○" : "×"),true,fact.key);
  }
  const wanted=q.ask==="correct";
  const matching=q.sourceFacts.map((f,i)=>f.truth===wanted ? i:-1).filter(i=>i>=0);
  assert.ok(q.stem.includes(wanted ? "正しい" : "誤っている"),`${q.id}: explicit ask`);
  if(q.formatKey==="single") {
    assert.equal(matching.length,1,q.id);
    assert.equal(q.answer,matching[0],q.id);
    assert.deepEqual(q.choices,q.sourceFacts.map(f=>f.statement),q.id);
    assert.deepEqual(q.displayModel.choiceBlocks.map(b=>b.judgment),q.choices,q.id);
  } else {
    assert.equal(q.displayModel.items.length,4,q.id);
    assert.deepEqual(q.displayModel.items.map(b=>b.judgment),q.sourceFacts.map(f=>f.statement),q.id);
    const answer=q.formatKey==="count" ? `${matching.length}個` : matching.map(i=>"アイウエ"[i]).join("・");
    assert.equal(q.choices[q.answer],answer,q.id);
  }
  const item=sprint.QUESTIONS_BY_ID[`sprint-law-${q.id}`];
  assert.ok(item,`${q.id}: integrated sprint entry`);
  for(const key of [...legacy.keys,"2026-09-13","alternate-38"]) {
    const shown=sprint.presentQuestion(item,key);
    assert.deepEqual(shown,sprint.presentQuestion(item,key),`${q.id}: deterministic presentation`);
    assert.equal(shown.choices[shown.answer],q.choices[q.answer],`${q.id}: correct option preserved`);
    if(q.formatKey==="single") {
      assert.deepEqual(shown.displayModel.choiceBlocks.map(b=>b.judgment),shown.choices,`${q.id}: rendered choice alignment`);
      assert.deepEqual(shown.sourceFacts.map(f=>f.statement),shown.choices,`${q.id}: fact alignment`);
      assert.equal(shown.sourceFacts[shown.answer].truth,wanted,q.id);
    } else {
      assert.deepEqual(shown.displayModel.items,q.displayModel.items,`${q.id}: statement order preserved`);
      assert.deepEqual(shown.sourceFacts,item.sourceFacts,q.id);
    }
  }
}
assert.equal(factKeys.size,288);
// Additive content must not reset a v57 in-progress answer or change its presentation.
assert.equal(sprint.VERSION,legacy.version);
for (const [id, expected] of Object.entries(legacy.questions)) {
  const current=sprint.QUESTIONS_BY_ID[id];
  assert.ok(current,`${id}: legacy item retained`);
  assert.equal(digest(current),expected.canonical,`${id}: legacy canonical contract`);
  legacy.keys.forEach((key,i)=>assert.equal(digest(sprint.presentQuestion(current,key)),expected.presented[i],`${id}: legacy presentation ${key}`));
}
assert.equal(sprint.QUESTIONS.length,174);
assert.equal(sprint.COVERAGE.bySection.restrictions,112);
// Browser loader must fail closed for missing or corrupt author packs.
const names=["TAKKEN_RESTRICTIONS_CASES_CITY_LAND","TAKKEN_RESTRICTIONS_CASES_BUILDING_READJUSTMENT","TAKKEN_RESTRICTIONS_CASES_AGRICULTURE_FILL"];
const files=["restrictions-cases-city-land.js","restrictions-cases-building-readjustment.js","restrictions-cases-agriculture-fill.js"];
const builder=fs.readFileSync(path.join(__dirname,"restrictions-authored-bank.js"),"utf8");
const context=Object.fromEntries(names.map((n,i)=>[n,JSON.parse(JSON.stringify(require(`./${files[i]}`)))]));
for(const name of names) {
  assert.throws(()=>vm.runInNewContext(builder,{...context,[name]:[]}),/requires every case/);
}
const broken=JSON.parse(JSON.stringify(context));
broken[names[0]][0].choices[0].truth="true";
assert.throws(()=>vm.runInNewContext(builder,broken),/incomplete restriction case/);
lengths.sort((a,b)=>a-b);
const assetSizes = [...files,"restrictions-authored-bank.js"].map(file=>{
  const data=fs.readFileSync(path.join(__dirname,file));return {file,raw:data.length,gzip:zlib.gzipSync(data).length};
});
console.log(JSON.stringify({status:"ok",newQuestions:72,sourceFacts:288,formats:grouped(bank.RAW_QUESTIONS,"format"),
  targetLevels:grouped(bank.QUESTIONS,"targetLevel"),answerPositions:[18,18,18,18],
  readLoad:{min:lengths[0],median:lengths[36],max:lengths[71]},assetSizes,legacyQuestionsPreserved:102,legacyPresentationsPreserved:306,
  totalRestrictions:112,deterministicPresentations:360,legalBaseline:bank.LEGAL_BASELINE,
  caveat:"Authored training; difficulty and score equivalence to the official exam are not calibrated."},null,2));
