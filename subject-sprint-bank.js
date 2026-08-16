"use strict";

// A traceable quick-review bank.  A sprint item is always one verified source
// question; it is never a second copy with merely shuffled choices.  This
// keeps the subject labels honest while a session still selects a short subset.
(function attachSubjectSprintBank(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_SUBJECT_SPRINT_BANK = api;
  if (root.window && root.window !== root) root.window.TAKKEN_SUBJECT_SPRINT_BANK = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubjectSprintBank(runtime) {
  const blueprint = runtime.TAKKEN_EXAM_BLUEPRINT || runtime.window?.TAKKEN_EXAM_BLUEPRINT;
  const baseQuestions = runtime.TAKKEN_EXAM_QUESTIONS || runtime.window?.TAKKEN_EXAM_QUESTIONS;
  if (!blueprint || !baseQuestions) throw new Error("subject sprint bank requires the exam blueprint and base question bank");

  const VERSION = 2;
  const LEGAL_BASELINE = "2026-04-01";
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const stableHash = (value) => [...String(value || "")].reduce((hash, character) => ((hash * 31) + character.codePointAt(0)) >>> 0, 2166136261);
  const rotate = (values, offset) => values.map((_, index) => values[(index + offset) % values.length]);
  const baseFacts = (question) => {
    const explanations = question.choiceExplanations || question.statementExplanations;
    if (!Array.isArray(explanations) || explanations.length !== 4) throw new Error(`${question.id}: four verified base explanations are required`);
    return Object.freeze(explanations.map((explanation, index) => {
      const marker = String(explanation).match(/[○×]/)?.[0];
      if (!marker) throw new Error(`${question.id}:${index}: truth marker is required`);
      return Object.freeze({
        key: `${question.id}:${index}`, sourceType: "base", questionId: question.id, choiceIndex: index,
        statement: question.choices[index], truth: marker === "○", reason: clean(explanation).replace(/^\d+\s*[○×]\s*/, ""),
        sourceRef: clean(question.sourceRef), sourceLocator: clean(question.sourceLocator), sourceUrl: clean(question.sourceUrl),
        legalBaseline: clean(question.legalBaseline), verifiedAt: clean(question.verifiedAt)
      });
    }));
  };

  // Explicit source lists make every new chapter addition reviewable.
  const sourceGroups = Object.freeze([
    ["taxOther", "tax", ["t001", "t002", "t003", "t004", "t005", "t006"]],
    ["restrictions", "law", ["l001", "l002", "l003", "l004", "l005", "l006", "l007", "l008", "l009", "l010", "l011", "l012", "l013", "l014", "l015", "l016", "l101", "l102"]],
    ["rights", "rights", ["r001", "r002", "r003", "r004", "r005", "r006", "r007", "r008", "r009", "r010", "r011", "r012", "r013", "r014", "r015", "r016", "r017", "r018", "r019", "r020", "r021", "r022", "r023", "r024", "r025", "r026", "r027", "r028", "r101", "r102", "r103", "r104", "r105", "r106", "r107", "r108", "r109", "r110", "r111", "r112", "r113", "r114", "r115", "r116"]],
    ["other", "other", ["o001", "o002", "o003", "o004", "o005", "o006", "o007", "o008", "o009", "o010", "o101", "o102"]]
  ]);
  const topicAliases = Object.freeze({
    r001:["制限行為能力",["limited-capacity"]],r101:["制限行為能力者",["limited-capacity"]],r002:["意思表示",["declaration"]],r102:["意思表示・第三者詐欺",["declaration","third-party-fraud"]],r003:["錯誤・代理",["mistake","agency"]],r004:["無権代理",["agency","unauthorized-agency"]],r005:["消滅時効",["extinctive-prescription"]],r006:["条件・期限",["condition-term"]],r116:["条件・期限",["condition-term"]],r007:["連帯債務",["joint-obligation"]],r108:["連帯債権",["joint-claim"]],r008:["保証",["guarantee"]],r009:["債権譲渡・相殺",["assignment","setoff"]],r010:["債務不履行・解除",["default","cancellation"]],r103:["債務不履行・解除",["default","cancellation"]],r011:["契約不適合責任",["contract-nonconformity"]],r012:["手付",["earnest-money"]],r013:["物権変動",["real-right-change"]],r107:["物権変動・二重譲渡",["real-right-change","double-transfer"]],r014:["取得時効",["acquisitive-prescription"]],r015:["共有",["co-ownership"]],r115:["共有物の管理",["co-ownership"]],r016:["抵当権",["mortgage"]],r017:["法定地上権",["statutory-surface-right"]],r018:["物上代位",["subrogation-in-rem"]],r019:["賃貸借",["lease"]],r109:["賃貸借・修繕",["lease","repair"]],r020:["借地権",["land-lease"]],r110:["借地権・存続期間",["land-lease"]],r021:["借家権",["building-lease"]],r022:["定期建物賃貸借",["fixed-term-building-lease"]],r023:["相続",["inheritance"]],r024:["遺言・遺留分",["will","reserved-portion"]],r025:["区分所有法改正",["condominium","current-law"]],r026:["区分所有法",["condominium"]],r027:["不動産登記",["real-estate-registration"]],r028:["住所等変更登記",["address-change-registration","current-law"]],r104:["危険負担・双方無責",["risk-allocation"]],r105:["危険負担・債権者責任",["risk-allocation"]],r106:["弁済・法定代位",["payment","legal-subrogation"]],r111:["請負・成立",["contract-for-work"]],r112:["請負・契約不適合",["contract-for-work","contract-nonconformity"]],r113:["不法行為・成立要件",["tort"]],r114:["不法行為・消滅時効",["tort","extinctive-prescription"]],
    l001:["都市計画区域",["city-planning-area"]],l002:["開発許可",["development-permit"]],l003:["開発区域内の建築",["development-permit","development-area-building"]],l004:["都市計画手続",["city-planning-procedure"]],l005:["建築確認",["building-confirmation"]],l006:["道路・接道",["road-access"]],l007:["容積率・建蔽率",["floor-area-building-coverage"]],l008:["用途・防火",["zoning-fire-prevention"]],l009:["国土利用計画法",["national-land"]],l010:["事後届出",["national-land","post-contract-notice"]],l011:["農地法3条",["agricultural-land"]],l012:["農地転用",["agricultural-land","conversion"]],l013:["仮換地",["land-readjustment"]],l014:["76条許可",["land-readjustment","article-76-permit"]],l015:["盛土規制区域",["embankment"]],l016:["盛土工事の義務",["embankment"]],l101:["文化財保護法・埋蔵文化財",["cultural-property"]],l102:["道路法・道路占用",["road-occupation"]],
    o001:["地価公示",["land-price-publication"]],o102:["地価公示法・標準地価格",["land-price-publication"]],o002:["鑑定評価",["appraisal"]],o101:["不動産鑑定評価・三手法",["appraisal"]],o003:["住宅金融支援機構",["housing-finance","securitization-support"]],o004:["フラット35",["housing-finance","flat35"]],o005:["不動産表示",["fair-competition","walking-time-display"]],o006:["広告表示",["fair-competition","advertising"]],o007:["土地",["land-building","land-characteristics"]],o008:["建物構造",["land-building","building-structure"]],o009:["令和8年統計",["statistics","land-price-2026"]],o010:["令和8年統計",["statistics","land-price-2026"]],
    t001:["不動産取得税",["local-tax","acquisition-tax"]],t002:["固定資産税",["local-tax","fixed-asset-tax"]],t003:["地方税比較",["local-tax","tax-comparison"]],t004:["登録免許税",["registration-tax"]],t005:["印紙税",["stamp-tax"]],t006:["譲渡所得",["capital-gain"]]
  });
  if (clean(blueprint.legalBaseline) !== LEGAL_BASELINE) throw new Error("subject sprint bank legal baseline is incompatible");
  const definitions = Object.freeze(sourceGroups.flatMap(([sectionId, prefix, sourceIds]) => sourceIds.map((baseId, index) => {
    const [tag, diagnosticTags] = topicAliases[baseId];
    if (!tag || !diagnosticTags) throw new Error(`${baseId}: explicit topic routing is required`);
    return Object.freeze([`sprint-${prefix}-${baseId}`, baseId, sectionId, tag, Object.freeze(diagnosticTags), index % 4]);
  })));
  const questions = definitions.map(([id, baseId, sectionId, tag, diagnosticTags, variantOffset]) => {
    const source = baseQuestions[baseId];
    if (!source || !Array.isArray(source.choices) || source.choices.length !== 4 || !Number.isInteger(source.answer) || source.answer < 0 || source.answer > 3 || clean(source.legalBaseline) !== LEGAL_BASELINE || !clean(source.sourceUrl)) throw new Error(`${id}: safe verified base question ${baseId} is unavailable`);
    return Object.freeze({id,masteryId:id,sourceQuestionId:baseId,sectionId,tag,diagnosticTags,variantOffset,format:source.format,text:source.text,choices:source.choices,answer:source.answer,explain:source.explain,trap:source.trap,memoryRule:source.memoryRule,choiceExplanations:source.choiceExplanations,sourceFacts:baseFacts(source),sourceRef:source.sourceRef,sourceLocator:source.sourceLocator,sourceUrl:source.sourceUrl,legalBaseline:source.legalBaseline,verifiedAt:source.verifiedAt});
  });
  const questionsById = Object.freeze(Object.fromEntries(questions.map((question) => [question.id, question])));
  const coveredSourceIds = Object.freeze(questions.map((question) => question.sourceQuestionId));
  const coverage = Object.freeze({
    total:questions.length,sourceQuestionCount:new Set(coveredSourceIds).size,
    bySection:Object.freeze(Object.fromEntries(["taxOther","restrictions","rights","other"].map((sectionId)=>[sectionId,questions.filter((question)=>question.sectionId===sectionId).length]))),
    byFormat:Object.freeze(Object.fromEntries([...new Set(questions.map((question)=>question.format))].sort().map((format)=>[format,questions.filter((question)=>question.format===format).length]))),
    byDiagnosticTag:Object.freeze(Object.fromEntries([...new Set(questions.flatMap((question)=>question.diagnosticTags))].sort().map((tag)=>[tag,questions.filter((question)=>question.diagnosticTags.includes(tag)).length]))),sourceQuestionIds:coveredSourceIds
  });
  function stableQuestion(questionOrId) { const id=typeof questionOrId==="string"?questionOrId:questionOrId?.id; const question=questionsById[id]; if(!question) throw new RangeError("unknown subject sprint question"); return question; }
  function presentQuestion(questionOrId,presentationKey="") { const question=stableQuestion(questionOrId); const offset=(question.variantOffset+(stableHash(presentationKey||question.id)%4))%4; const order=Object.freeze(rotate([0,1,2,3],offset)); return Object.freeze({...question,choices:Object.freeze(order.map((index)=>question.choices[index])),choiceExplanations:Object.freeze(order.map((index)=>question.choiceExplanations[index])),answer:order.indexOf(question.answer),presentationKey:clean(presentationKey)||question.id,presentationOrder:order,presentationOffset:offset}); }
  return Object.freeze({VERSION,LEGAL_BASELINE,QUESTIONS:Object.freeze(questions),QUESTIONS_BY_ID:questionsById,COVERAGE:coverage,presentQuestion,stableQuestion});
});
