"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),vm=require("node:vm");
const bank=require("./tax-authored-bank.js");
global.window={};
for(const f of ["exam-blueprint","exam-question-core","exam-questions-rights","exam-questions-restrictions","exam-questions-tax-other"])require(`./${f}.js`);
const sprint=require("./subject-sprint-bank.js");
const fixture=require("./scripts/tax-v59-sprint-compat.json");
const group=(rows,key)=>rows.reduce((out,q)=>(out[q[key]]=(out[q[key]]||0)+1,out),{});
function digest(q){return crypto.createHash("sha256").update(JSON.stringify({
  id:q.id,text:q.text,choices:q.choices,answer:q.answer,format:q.format,
  choiceExplanations:q.choiceExplanations,statementExplanations:q.statementExplanations,
  sourceFacts:q.sourceFacts.map(f=>({key:f.key,statement:f.statement,truth:f.truth,reason:f.reason})),
  displayModel:q.displayModel,explain:q.explain,trap:q.trap
})).digest("hex");}
assert.equal(bank.QUESTIONS.length,24);
assert.equal(bank.LEGAL_BASELINE,"2026-04-01");
assert.deepEqual(group(bank.RAW_QUESTIONS,"format"),{single:20,count:4});
assert.deepEqual(group(bank.QUESTIONS,"sourceAnchor"),{"不動産取得税":5,"固定資産税":5,"登録免許税":4,"印紙税":4,"譲渡所得":6});
assert.deepEqual([0,1,2,3].map(i=>bank.QUESTIONS.filter(q=>q.answer===i).length),[6,6,6,6]);
const seen=new Set(),facts=new Set();
for(const q of bank.QUESTIONS){
  assert.ok(Object.isFrozen(q)&&Object.isFrozen(q.sourceFacts));
  assert.equal(q.choices.length,4);assert.equal(new Set(q.choices).size,4);
  assert.equal(q.sourceFacts.length,4);assert.equal(q.authoredCase,true);
  assert.ok(q.noveltyNote.length>=12&&q.explain.length>=15&&q.trap.length>=8,q.id);
  const text=q.text.normalize("NFKC").replace(/\s/g,"");
  assert.ok(!seen.has(text),`${q.id}: duplicate case`);seen.add(text);
  const wanted=q.ask==="correct";
  assert.ok(q.stem.includes(wanted?"正しい":"誤っている"),`${q.id}: explicit ask`);
  for(const source of q.legalSources){
    const url=new URL(source.url);
    assert.equal(url.protocol,"https:");
    assert.ok(/(?:^|\.)(?:go|lg)\.jp$/.test(url.hostname)||["www.pref.kyoto.jp","www.city.sendai.jp"].includes(url.hostname),`${q.id}: governmental primary source`);
    assert.equal(source.checkedAt,"2026-09-12");assert.ok(source.reference.length>=3);
  }
  for(const [i,f] of q.sourceFacts.entries()){
    assert.equal(f.key,`${q.id}:${i}`);assert.ok(!facts.has(f.key));facts.add(f.key);
    assert.equal(f.context,q.premise);assert.ok(f.reason.length>=12&&f.sourceLocator.length>=3,f.key);
  }
  const wantedFacts=q.sourceFacts.filter(f=>f.truth===wanted);
  if(q.formatKey==="single"){
    assert.equal(wantedFacts.length,1);assert.equal(q.sourceFacts[q.answer].truth,wanted);
    assert.deepEqual(q.choices,q.sourceFacts.map(f=>f.statement));
  }else assert.equal(q.choices[q.answer],`${wantedFacts.length}個`);
  const item=sprint.QUESTIONS_BY_ID[`sprint-tax-${q.id}`];assert.ok(item,q.id);
  for(const key of [...fixture.keys,"next-cycle","sixth-day"]){
    const shown=sprint.presentQuestion(item,key);
    assert.deepEqual(shown,sprint.presentQuestion(item,key));
    assert.equal(shown.choices[shown.answer],q.choices[q.answer]);
    if(q.formatKey==="single"){
      assert.deepEqual(shown.choices,shown.sourceFacts.map(f=>f.statement));
      assert.deepEqual(shown.choices,shown.displayModel.choiceBlocks.map(b=>b.judgment));
      assert.equal(shown.sourceFacts[shown.answer].truth,wanted);
    }else{
      assert.deepEqual(shown.displayModel.items,q.displayModel.items);
      assert.deepEqual(shown.sourceFacts,item.sourceFacts);
    }
  }
}
assert.equal(facts.size,96);
assert.equal(sprint.VERSION,5);assert.equal(sprint.QUESTIONS.length,198);
assert.deepEqual(sprint.COVERAGE.bySection,{taxOther:30,restrictions:112,rights:44,other:12});
assert.equal(Object.keys(fixture.questions).length,174);
for(const [id,old] of Object.entries(fixture.questions)){
  const q=sprint.QUESTIONS_BY_ID[id];assert.ok(q,`${id}: previous ID retained`);
  assert.equal(digest(q),old.canonical,`${id}: canonical grading/presentation preserved`);
  fixture.keys.forEach((key,i)=>assert.equal(digest(sprint.presentQuestion(q,key)),old.presented[i],`${id}: stored presentation preserved`));
}
const builder=fs.readFileSync(path.join(__dirname,"tax-authored-bank.js"),"utf8");
assert.throws(()=>vm.runInNewContext(builder,{}),/requires all 24/);
const corrupt=JSON.parse(JSON.stringify(bank.RAW_QUESTIONS));corrupt[0].choices[0].truth="true";
assert.throws(()=>vm.runInNewContext(builder,{TAKKEN_TAX_CASES_V59:corrupt}),/incomplete tax case/);
for(const [mutate,message] of [
  [raw=>{raw[0].choices[0].text=123;},/incomplete tax case/],
  [raw=>{raw[0].choices[0].reason="  ";},/incomplete tax case/],
  [raw=>{raw[0].diagnosticTags="not-an-array";},/incomplete tax case/],
  [raw=>{raw[0].sources[0].url="https://";},/dated source locators/],
  [raw=>{raw[0].sources[0].url="http://www.nta.go.jp/";},/dated source locators/]
]){
  const raw=JSON.parse(JSON.stringify(bank.RAW_QUESTIONS));mutate(raw);
  assert.throws(()=>vm.runInNewContext(builder,{TAKKEN_TAX_CASES_V59:raw,URL}),message);
}
const validContext={TAKKEN_TAX_CASES_V59:bank.RAW_QUESTIONS,URL};
vm.runInNewContext(builder,validContext);assert.equal(validContext.TAKKEN_TAX_AUTHORED_BANK.QUESTIONS.length,24);
console.log(JSON.stringify({status:"ok",newQuestions:24,judgments:96,formats:group(bank.RAW_QUESTIONS,"format"),
  targets:group(bank.QUESTIONS,"targetLevel"),oldGradingPreserved:174,oldPresentationsPreserved:522,
  compatibilityExceptions:0,newPresentations:120,totalSprint:198,legalBaseline:bank.LEGAL_BASELINE}));
