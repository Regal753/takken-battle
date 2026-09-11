"use strict";

(function attachTaxAuthoredBank(root, factory) {
  const raw = root.TAKKEN_TAX_CASES_V59 || root.window?.TAKKEN_TAX_CASES_V59 ||
    (typeof require === "function" ? require("./tax-cases-v59.js") : null);
  const api = factory(raw);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_TAX_AUTHORED_BANK = api;
  if (root.window && root.window !== root) root.window.TAKKEN_TAX_AUTHORED_BANK = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTaxAuthoredBank(raw) {
  const LEGAL_BASELINE = "2026-04-01", VERIFIED_AT = "2026-09-12", VERSION = 1;
  const KANA = ["ア", "イ", "ウ", "エ"];
  const TOPICS = { "不動産取得税":"acquisition", "固定資産税":"fixed-asset", "登録免許税":"registration", "印紙税":"stamp", "譲渡所得":"capital-gain" };
  const FORMATS = { single:"単一選択", count:"個数問題" };
  const nonblank = value => typeof value === "string" && value.trim().length > 0;
  const validSourceUrl = value => {
    if (!nonblank(value)) return false;
    try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname); }
    catch { return false; }
  };
  const freeze = value => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  };
  const hash = value => [...String(value)].reduce((n,c)=>Math.imul(n ^ c.codePointAt(0),16777619)>>>0,2166136261);
  function shuffle(values, seed) {
    let state = hash(seed); const result = [...values];
    for (let i=result.length-1;i>0;i--) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      const j = Math.floor((state>>>0)/4294967296*(i+1));
      [result[i],result[j]] = [result[j],result[i]];
    }
    return result;
  }
  const ids = Array.from({length:24},(_,i)=>`tc59-${String(i+1).padStart(3,"0")}`);
  if (!Array.isArray(raw) || raw.length !== ids.length || ids.some((id,i)=>raw[i]?.id!==id)) {
    throw new Error("tax authored bank requires all 24 identified cases");
  }
  const positions = shuffle(Array.from({length:24},(_,i)=>i%4),"tax59-answer-slots");
  const questions = raw.map((input,index)=>{
    const facts = input.format === "single" ? input.choices : input.statements;
    if (!TOPICS[input.sourceAnchor] || !FORMATS[input.format] || !["correct","incorrect"].includes(input.ask) ||
        !["standard","applied"].includes(input.targetLevel) ||
        ![input.premise,input.stem,input.topic,input.explanation,input.trap,input.noveltyNote].every(nonblank) ||
        !Array.isArray(input.diagnosticTags) || !input.diagnosticTags.length || !input.diagnosticTags.every(nonblank) ||
        !Array.isArray(facts) || facts.length !== 4 || Array.from({length:4},(_,i)=>facts[i]).some(f=>
          !f || typeof f.truth !== "boolean" || ![f.text,f.reason,f.reference].every(nonblank))) {
      throw new Error(`incomplete tax case: ${input.id}`);
    }
    const sources = input.sources;
    if (!Array.isArray(sources) || !sources.length || sources.some(s=>!s || !nonblank(s.label) || !nonblank(s.reference) || s.checkedAt!==VERIFIED_AT || !validSourceUrl(s.url))) {
      throw new Error(`tax case needs dated source locators: ${input.id}`);
    }
    const wanted = input.ask === "correct";
    const matching = facts.map((f,i)=>f.truth===wanted?i:-1).filter(i=>i>=0);
    let options;
    if (input.format === "single") {
      if (matching.length !== 1) throw new Error(`ambiguous tax single: ${input.id}`);
      options = facts.map((f,i)=>({text:f.text,correct:i===matching[0],origin:i}));
    } else {
      if (matching.length < 1 || matching.length > 4) throw new Error(`unsupported tax count: ${input.id}`);
      options = [1,2,3,4].map(n=>({text:`${n}個`,correct:n===matching.length}));
    }
    const ordered = shuffle(options.filter(o=>!o.correct),`${input.id}:options`);
    ordered.splice(positions[index],0,options.find(o=>o.correct));
    const displayedFacts = input.format === "single" ? ordered.map(o=>facts[o.origin]) : facts;
    const sourceUrls = [...new Set(sources.map(s=>s.url))];
    const sourceRef = sources.map(s=>s.label).join("／");
    const sourceLocator = sources.map(s=>s.reference).join("／");
    const sourceFacts = displayedFacts.map((fact,i)=>({
      key:`${input.id}:${i}`,sourceType:"authored-case",questionId:input.id,choiceIndex:i,
      statement:fact.text,truth:fact.truth,reason:fact.reason,context:input.premise,
      sourceRef,sourceLocator:fact.reference,sourceUrl:sourceUrls[0],sourceUrls,
      legalBaseline:LEGAL_BASELINE,verifiedAt:VERIFIED_AT
    }));
    const explanations = displayedFacts.map((f,i)=>`${input.format==="single"?i+1:KANA[i]} ${f.truth?"○":"×"} ${f.reason}（${f.reference}）`);
    const intro = `${input.premise}\n\n${input.stem}`;
    const block = (fact,label="")=>({label,premises:[],judgment:fact.statement,sourceFactKeys:[fact.key]});
    return freeze({
      id:input.id,sectionId:"taxOther",tag:input.topic,topic:input.topic,sourceAnchor:input.sourceAnchor,
      topicId:TOPICS[input.sourceAnchor],authoredCase:true,ask:input.ask,formatKey:input.format,
      format:FORMATS[input.format],targetLevel:input.targetLevel,premise:input.premise,stem:input.stem,
      text:input.format==="single"?intro:`${intro}\n${facts.map((f,i)=>`${KANA[i]} ${f.text}`).join("\n")}`,
      choices:ordered.map(o=>o.text),answer:positions[index],sourceFacts,
      choiceOriginIndexes:input.format==="single"?ordered.map(o=>o.origin):[0,1,2,3],
      choiceExplanations:explanations,statementExplanations:explanations,
      displayModel:{intro,items:input.format==="single"?[]:sourceFacts.map((f,i)=>block(f,KANA[i])),
        choiceBlocks:input.format==="single"?sourceFacts.map(f=>block(f)):[]},
      explain:input.explanation,trap:input.trap,memoryRule:input.explanation,
      diagnosticTags:[...new Set(input.diagnosticTags)],noveltyNote:input.noveltyNote,
      sourceRef,sourceLocator,sourceUrl:sourceUrls[0],sourceUrls,legalSources:sources,
      legalBaseline:LEGAL_BASELINE,verifiedAt:VERIFIED_AT,qualityVersion:1,
      level:input.targetLevel==="standard"?"標準〜通常応用・税の新作事例":"条件適用・税の新作事例",
      changeNote:"2026年4月1日基準の個別作問。本試験との難度等価性・得点換算は未校正。"
    });
  });
  return freeze({VERSION,LEGAL_BASELINE,VERIFIED_AT,RAW_QUESTIONS:raw,QUESTIONS:questions,
    QUESTIONS_BY_ID:Object.fromEntries(questions.map(q=>[q.id,q])),QUESTION_IDS:ids,
    TOPIC_SOURCE_IDS:Object.fromEntries(Object.values(TOPICS).map(topic=>[topic,questions.filter(q=>q.topicId===topic).map(q=>q.id)]))});
});
