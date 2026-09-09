"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;
const CORE_FILES = [
  "exam-blueprint.js", "exam-question-core.js", "exam-questions-rights.js",
  "exam-questions-restrictions.js", "exam-questions-tax-other.js", "exam-questions-business.js"
];
const SECTION_IDS = ["rights", "restrictions", "tax", "business", "other"];
const EXPECTED_SECTIONS = { rights: 14, restrictions: 8, tax: 3, business: 20, other: 5 };
const EXPECTED_FORMATS = { single: 36, count: 8, combination: 6 };
const EXPECTED_UNDERLYING_PAIR_CAPACITY = { rights: 264, restrictions: 108, tax: 36, business: 252, other: 72 };
const LABELS = ["ア", "イ", "ウ", "エ"];
const GUARANTEE_ASSOCIATION = /保証協会|弁済業務保証金|弁済業務保証金分担金|還付充当金/;
const CURRENT_LAW_BY_SOURCE = {
  r025: ["condominium-r8-enforcement"], r026: ["condominium-r8-enforcement"], r028: ["address-change-registration-r8"],
  b020: ["takken-35-mansion-manager-r8"], b040: ["takken-35-mansion-manager-r8"], t004: ["registration-tax-land-sale-extension"],
  t005: ["stamp-tax-real-estate-contract-relief"], o009: ["land-price-publication-r8"], o010: ["land-price-publication-r8", "housing-starts-fy-r7"]
};

global.window = global;
const ledgerApi = require(path.join(root, "current-law-source-ledger.js"));
global.TAKKEN_CURRENT_LAW_SOURCE_LEDGER = ledgerApi;
CORE_FILES.forEach((file) => vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file }));
vm.runInThisContext(fs.readFileSync(path.join(root, "reiwa-exam-bank.js"), "utf8"), { filename: "reiwa-exam-bank.js" });

const bank = global.TAKKEN_REIWA_EXAM_BANK;
const base = global.TAKKEN_EXAM_QUESTIONS;
const blueprint = global.TAKKEN_EXAM_BLUEPRINT;
const ledgerById = new Map(ledgerApi.ledger.map((item) => [item.id, item]));
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const semanticFact = (value) => clean(value).replace(/[\s、。・「」『』（）()，,]/g, "");
const truthFromMarker = (value) => /^\s*(?:[1-4]|[アイウエ])\s*([○×])\s*/.exec(value || "")?.[1] === "○";
const normalizedReason = (value) => String(value || "")
  .replace(/^\s*(?:[1-4]|[アイウエ])\s*[○×]\s*/, "")
  .trim()
  .replace(/^(?:[アイウエ]|第[1-4]肢)は[、，]?\s*/, "")
  .replace(/^[アイウエ]の\s*/, "");
const DIRECT_CORRECTION_OVERRIDES = Object.freeze({
  "r005#1": "所有権は、長期間行使しなくても消滅時効にかからない。",
  "r005#3": "債務者が債務を承認すると、消滅時効はその時から更新される。",
  "r010#0": "履行遅滞を理由に解除するには、原則として相当期間を定めた催告が必要であり、無催告解除は履行不能などの例外に限られる。",
  "r010#3": "契約を解除しても、債務不履行による損害賠償を請求できる。",
  "r014#3": "時効完成前に所有権を取得した第三者に対しては、時効取得者は登記なく所有権取得を対抗できる。",
  "r016#2": "抵当権は、目的物の占有を所有者に残したまま設定でき、抵当権者への引渡しは成立要件ではない。",
  "r017#1": "法定地上権は、抵当権設定時に土地と建物が同一所有者に属することを要する。",
  "r019#3": "賃借権の譲渡又は転貸には、原則として賃貸人の承諾が必要である。",
  "r020#2": "普通借地権の当初存続期間は30年であり、10年と定めても30年となる。",
  "r027#0": "登記事項証明書は、何人でも手数料を納付して交付を請求できる。",
  "r028#2": "住所等変更登記の義務化は、自然人と法人の双方が対象となる。",
  "r028#1": "住所等変更登記の申請を正当な理由なく怠った者には、5万円以下の過料が科される。",
  "r105#3": "民法536条2項は、債権者である買主の責めに帰すべき履行不能を定めている。",
  "r106#2": "債務の弁済は、債務者以外の第三者も行うことができる。",
  "r108#0": "連帯債権者は、自己の人数割合に限られず、債務者に対して債権全額を請求できる。",
  "r110#0": "普通借地権の当初存続期間には30年の最低期間がある。",
  "r110#2": "普通借地権の当初存続期間を30年未満と定めても、期間は30年となる。",
  "r111#0": "請負は仕事の完成を目的とし、請負人は完成義務を負う。",
  "r111#3": "仕事の完成は請負契約の成立要件ではなく、請負人が契約により負う債務の内容である。",
  "r112#1": "仕事が完成しても目的物に契約不適合があれば、注文者は追完等を請求できる。",
  "r113#2": "不法行為による民事上の損害賠償責任は、刑事責任の有無とは別に成立し得る。",
  "r113#3": "不法行為は、過失による権利又は法律上保護される利益の侵害でも成立し得る。",
  "r114#3": "不法行為による損害賠償請求権は、不法行為の時から20年を経過すると時効により消滅する。",
  "l003#3": "工事完了公告前は原則として建築物の建築等が制限され、公告後も予定建築物以外の建築には知事等の許可が必要となる場合がある。",
  "l002#1": "市街化調整区域では、小規模であることだけを理由に開発許可が不要となるわけではない。",
  "l005#2": "建築確認が必要な建築物は、確認済証の交付前に工事へ着手できない。",
  "l005#3": "2階建て木造住宅の新築は、新2号建築物として原則として建築確認を要する。",
  "l014#2": "施行者の承認を得ても、土地区画整理法76条の知事等による許可が必要である。",
  "t001#3": "不動産取得税は、不動産を取得した者に対して都道府県が課す地方税である。",
  "o003#1": "住宅金融支援機構は、住宅ローン債権の証券化を支援している。",
  "o004#0": "フラット35は、借入時から返済終了まで適用金利が確定する全期間固定金利型である。",
  "o005#2": "徒歩所要時間の表示では、信号待ち時間を個別に加算しない。",
  "o007#1": "斜面災害の危険性は地形・地質・水の集まり方などにより左右され、南向きであることだけでは安全といえない。",
  "o008#2": "基礎は、上部構造の荷重を安全に地盤へ伝える役割を持つ。",
  "o009#1": "令和8年地価公示では、住宅地も全国平均で5年連続上昇している。",
  "b004#0": "死亡時の届出義務者は相続人であり、死亡を知った日から30日以内に届け出なければならない。",
  "b004#1": "宅建業の免許は一身専属であり、相続人は被相続人の免許を当然には承継できない。",
  "b009#1": "営業保証金は、主たる事務所に最も近い供託所に供託する。",
  "b009#3": "営業保証金は、金銭のほか国債証券など一定の有価証券でも供託できる。",
  "b013#0": "業務帳簿は、事務所ごとに備えなければならない。",
  "b014#3": "誇大広告の禁止は、広告の相手方が宅建業者である場合にも適用される。",
  "b014#2": "誇大広告規制は、誤認させる広告を表示した時点で違反となり得る。",
  "b015#1": "未完成物件について必要な許可等を受ける前は、賃貸借の代理又は媒介でも広告を開始できない。",
  "b016#3": "将来の利益について断定的判断を提供する行為は、書面か口頭かを問わず禁止される。",
  "b017#2": "専属専任媒介契約では、依頼者は自ら発見した相手方と契約することができない。",
  "b017#3": "専任媒介契約の有効期間は3か月を超えることができず、3か月を超える定めは3か月に短縮される。",
  "b022#2": "IT重説では、映像を通じて宅建士証を提示できる状態で説明を行う必要がある。",
  "b022#0": "35条書面を電子提供するには、相手方の事前承諾が必要である。",
  "b025#1": "37条書面は契約成立後に遅滞なく交付し、交付義務に違反しても契約が当然に無効となるものではない。",
  "b025#2": "37条書面について、宅建士による口頭説明義務はない。",
  "b025#3": "宅建業者が自ら当事者となる売買にも、37条書面の交付義務がある。",
  "b023#0": "区分所有建物の売買では、管理費等の滞納額は重要事項として説明する。",
  "b023#3": "区分所有建物では、計画修繕積立金の規約及び既積立額を重要事項として説明する。",
  "b024#1": "媒介契約書には、調査を実施する者のあっせんの有無に関する事項を記載する。",
  "b027#1": "書面の電子提供について相手方が紙を希望する場合は、書面を交付しなければならない。",
  "b027#3": "35条書面又は37条書面を電子提供するには、相手方の事前承諾が必要である。",
  "b028#2": "35条書面と37条書面は重複する事項があっても、目的・交付時期・記載事項が異なる。",
  "b030#0": "宅建業者が自ら売主で買主が宅建業者でない売買では、手付額の20%上限を買主に不利な特約で排除できない。",
  "b031#0": "宅建業者が売主で買主が宅建業者でない売買では、通知期間を引渡しから6か月とする特約は、買主に不利な限度で無効である。",
  "b032#1": "他人物売買では、取得が確実でない停止条件付契約だけを根拠に売買することはできない。",
  "b032#2": "他人物売買の規制は契約の名称ではなく実質により適用され、予約契約としても免れない。",
  "b033#2": "損害賠償額の予定等を代金額の20%を超えて定めた場合、超過部分のみが無効となる。",
  "b035#1": "法定の手付金等保全措置が講じられていない場合、買主は手付金等の支払を拒むことができる。",
  "b036#3": "割賦金の支払が1日遅れただけでは法定の催告要件を満たさず、直ちに契約を解除し又は残額を一括請求できない。",
  "b037#0": "通常の広告費は法定報酬に含まれ、成功報酬は原則として取引成立時に発生し、特別な依頼がなければ別途請求できない。",
  "b038#3": "業務停止処分の期間は1年を超えることができない。",
  "b039#2": "無免許営業などの宅建業法違反には、拘禁刑又は罰金が科されることがある。",
  "b102#0": "案内所の標識を掲示する義務を負うのは宅建業者である。"
});
const META_EVALUATION = /この(?:主張|判断|記述|選任方法)(?:は|が)|との主張がある|との判断が示された|元の記述|(?:という|とする)記述|^(?:[アイウエ]|第[1-4]肢)(?:は|の)|(?:ため|ので|なので)正しい(?:。|$)|『[^』]+』は誤り|と評価する本判定/;

function directCorrection(questionId, choiceIndex, sourceReason) {
  let result = DIRECT_CORRECTION_OVERRIDES[`${questionId}#${choiceIndex}`] || clean(sourceReason);
  if (!/[。！？]$/.test(result)) result += "。";
  result = result
    .replace(/必要。$/, "必要である。")
    .replace(/不要。$/, "不要である。")
    .replace(/有効。$/, "有効である。")
    .replace(/無効。$/, "無効である。");
  assert.doesNotMatch(result, META_EVALUATION, `${questionId}:${choiceIndex}: direct correction meta evaluation`);
  return result;
}

function directReason(component) {
  const candidate = component.sourceTruth && !META_EVALUATION.test(component.sourceReason)
    ? component.sourceReason
    : component.sourceTruth ? clean(component.sourceChoice) : component.correctionText;
  const result = /[。！？]$/.test(candidate) ? candidate : `${candidate}。`;
  assert.doesNotMatch(result, META_EVALUATION, `${component.atomId}: direct reason meta evaluation`);
  return result;
}

function eligibleSource(question, sectionId) {
  return question?.sectionId === sectionId
    && ["単一選択", "個数問題"].includes(question.format)
    && Array.isArray(question.choiceFacts) && question.choiceFacts.length === 4
    && Array.isArray(question.choiceTruths) && question.choiceTruths.length === 4
    && Array.isArray(question.choiceExplanations) && question.choiceExplanations.length === 4
    && !GUARANTEE_ASSOCIATION.test([question.tag, question.text, ...question.choiceFacts].join(" "));
}

function expectedPremise(question) {
  const prompt = clean(String(question.text || "").split("\n")[0]);
  if (question.format === "個数問題") return `${question.tag}について、`;
  if (/^次の.+(?:判断|確認)する。$/.test(prompt)) return `${question.tag}について、`;
  const streamlined = prompt.replace(/に関する(?:次の)?(?:事例|記述)である。/g, "について、");
  if (streamlined !== prompt) return streamlined;
  return /[。！？、]$/.test(prompt) ? prompt : `${prompt}。`;
}

function expectedExplanation(option, displayIndex) {
  const [first, second] = option.components;
  let conclusion;
  if (option.truth) conclusion = "①と②がともに正しいため、肢全体は○。";
  else if (!first.truth && !second.truth) conclusion = "①と②がともに誤りであるため、肢全体は×。";
  else conclusion = `${first.truth ? "②" : "①"}が誤りであるため、肢全体は×。`;
  return `${LABELS[displayIndex]} ${option.truth ? "○" : "×"} ①${first.truth ? "○" : "×"}：${first.reason} ②${second.truth ? "○" : "×"}：${second.reason} ${conclusion}`;
}

function longestRun(values) {
  let longest = values.length ? 1 : 0;
  let current = longest;
  for (let index = 1; index < values.length; index += 1) {
    current = values[index] === values[index - 1] ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

function hasShortPeriod(values, maxPeriod) {
  for (let period = 1; period <= maxPeriod; period += 1) {
    if (values.every((value, index) => index < period || value === values[index % period])) return period;
  }
  return 0;
}

function isolatedSnapshot() {
  const context = vm.createContext({ console });
  context.window = context;
  [...CORE_FILES, "current-law-source-ledger.js", "reiwa-exam-bank.js"].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  });
  return JSON.stringify(context.TAKKEN_REIWA_EXAM_BANK.forms.map((form) => form.questions.map((question) => ({
    id: question.id, answer: question.answer, atoms: question.sourceAtomIds, truths: question.choiceTruths, text: question.text
  }))));
}

assert.equal(bank.version, 51, "bank version");
assert.deepEqual(bank.forms.map((form) => form.id), ["reiwa-form-a", "reiwa-form-b", "reiwa-form-c"], "three Reiwa forms");

const allQuestions = bank.forms.flatMap((form) => form.questions);
const allQuestionIds = new Set();
const pairOccurrences = new Map();
const pairForms = new Map();
const underlyingPairOccurrences = new Map();
const underlyingPairForms = new Map();
const optionTexts = [];
const sourceQuartets = new Set();
const referencedCurrentSources = new Set();
const answerSequences = new Set();
const summaries = [];

for (const form of bank.forms) {
  assert.equal(form.questions.length, 50, `${form.id}: exactly 50 questions`);
  const sectionCounts = Object.fromEntries(SECTION_IDS.map((id) => [id, form.questions.filter((question) => question.sectionId === id).length]));
  assert.deepEqual(sectionCounts, EXPECTED_SECTIONS, `${form.id}: section allocation`);
  const formatCounts = Object.fromEntries(Object.keys(EXPECTED_FORMATS).map((id) => [id, form.questions.filter((question) => question.formatFamily === id).length]));
  assert.deepEqual(formatCounts, EXPECTED_FORMATS, `${form.id}: format allocation`);

  const answers = form.questions.map((question) => question.answer);
  answerSequences.add(answers.join(""));
  assert.ok(longestRun(answers) <= 2, `${form.id}: answer-position run exceeds two`);
  assert.equal(hasShortPeriod(answers, 10), 0, `${form.id}: short periodic answer key`);
  const overallAnswerCounts = [0, 1, 2, 3].map((answer) => answers.filter((value) => value === answer).length);
  assert.ok(Math.max(...overallAnswerCounts) - Math.min(...overallAnswerCounts) <= 1, `${form.id}: overall answers unbalanced`);
  for (const answer of [0, 1, 2, 3]) {
    const nextPositions = new Set(answers.slice(0, -1).map((value, index) => value === answer ? answers[index + 1] : null).filter((value) => value !== null));
    assert.ok(nextPositions.size >= 3, `${form.id}: predictable transition after answer ${answer + 1}`);
  }

  const familyAnswers = {};
  const truthPatterns = {};
  for (const family of Object.keys(EXPECTED_FORMATS)) {
    const familyQuestions = form.questions.filter((question) => question.formatFamily === family);
    familyAnswers[family] = [0, 1, 2, 3].map((answer) => familyQuestions.filter((question) => question.answer === answer).length);
    truthPatterns[family] = new Set(familyQuestions.map((question) => question.choiceTruths.map(Number).join(""))).size;
  }
  assert.deepEqual(familyAnswers.single, [9, 9, 9, 9], `${form.id}: single answer balance`);
  assert.deepEqual(familyAnswers.count, [2, 2, 2, 2], `${form.id}: count answer balance`);
  assert.deepEqual(familyAnswers.combination.slice().sort(), [1, 1, 2, 2], `${form.id}: combination answer balance`);
  assert.equal(truthPatterns.single, 8, `${form.id}: all one-true and one-false patterns`);
  assert.equal(truthPatterns.count, 7, `${form.id}: count-pattern variety`);
  assert.equal(truthPatterns.combination, 6, `${form.id}: all true pairs used`);

  for (const [questionIndex, question] of form.questions.entries()) {
    assert.equal(question.number, questionIndex + 1, `${question.id}: number sequence`);
    assert.equal(question.formId, form.id, `${question.id}: form ID`);
    assert.ok(!allQuestionIds.has(question.id), `duplicate question ID ${question.id}`);
    allQuestionIds.add(question.id);
    assert.equal(question.effectiveDate, blueprint.legalBaseline, `${question.id}: effective date`);
    assert.equal(question.legalBaseline, blueprint.legalBaseline, `${question.id}: legal baseline`);
    assert.equal(question.scenarioDate, "2026-04-01", `${question.id}: scenario date`);
    assert.equal(question.premise, "", `${question.id}: outer premise must remain empty`);
    assert.equal(question.sourceChoices.length, 4, `${question.id}: four option traces`);
    assert.equal(question.sourceQuestionIds.length, 4, `${question.id}: four source scenarios`);
    assert.equal(new Set(question.sourceQuestionIds).size, 4, `${question.id}: every option must use a distinct source scenario`);
    const sourceQuartetKey = [...question.sourceQuestionIds].sort().join(",");
    assert.ok(!sourceQuartets.has(sourceQuartetKey), `${question.id}: source quartet repeats across the 150-question bank`);
    sourceQuartets.add(sourceQuartetKey);
    assert.equal(question.choiceFacts.length, 4, `${question.id}: four compound options`);
    assert.equal(question.choiceTruths.length, 4, `${question.id}: four option truths`);
    assert.equal(question.choiceExplanations.length, 4, `${question.id}: four explanations`);
    assert.doesNotMatch(question.stem, /独立|第1判定|第2判定|両方.*正し/, `${question.id}: normal exam-style stem required`);
    assert.doesNotMatch(question.text, /取引又は申請|原則又は例外|本件事実に基づく/, `${question.id}: neutral length filler`);
    assert.equal(question.text.split("\n")[0], question.stem, `${question.id}: stem occurs once`);

    const flattenedComponents = [];
    for (let displayIndex = 0; displayIndex < 4; displayIndex += 1) {
      const option = question.sourceChoices[displayIndex];
      const sourceQuestion = base[option.questionId];
      assert.equal(option.label, LABELS[displayIndex], `${question.id}/${LABELS[displayIndex]}: label`);
      assert.equal(option.questionId, question.sourceQuestionIds[displayIndex], `${question.id}/${LABELS[displayIndex]}: source scenario index`);
      assert.ok(eligibleSource(sourceQuestion, question.sectionId), `${question.id}/${LABELS[displayIndex]}: ineligible source scenario`);
      assert.equal(option.components.length, 2, `${question.id}/${LABELS[displayIndex]}: two traced component judgments required`);
      const [first, second] = option.components;
      assert.equal(first.questionId, option.questionId, `${question.id}/${LABELS[displayIndex]}: first component leaves common scenario`);
      assert.equal(second.questionId, option.questionId, `${question.id}/${LABELS[displayIndex]}: second component leaves common scenario`);
      assert.notEqual(first.choiceIndex, second.choiceIndex, `${question.id}/${LABELS[displayIndex]}: two distinct source choices required`);
      assert.notEqual(first.atomId, second.atomId, `${question.id}/${LABELS[displayIndex]}: two distinct source atoms required`);
      assert.notEqual(semanticFact(first.sourceChoice), semanticFact(second.sourceChoice), `${question.id}/${LABELS[displayIndex]}: semantically duplicate source claims`);
      assert.equal(option.premise, expectedPremise(sourceQuestion), `${question.id}/${LABELS[displayIndex]}: one approved common premise`);
      assert.ok(option.premise.length >= 4, `${question.id}/${LABELS[displayIndex]}: common premise too short`);

      for (const [componentIndex, component] of option.components.entries()) {
        assert.equal(component.position, componentIndex === 0 ? "第1判定" : "第2判定", `${question.id}/${LABELS[displayIndex]}: component position`);
        assert.equal(component.atomId, `${component.questionId}#${component.choiceIndex}`, `${question.id}/${LABELS[displayIndex]}: atom ID`);
        assert.equal(component.judgmentId, `${component.atomId}:${component.assertsSourceTruth ? "affirm" : "deny"}`, `${question.id}/${LABELS[displayIndex]}: judgment ID`);
        assert.equal(component.sourcePrompt, sourceQuestion.text, `${question.id}/${LABELS[displayIndex]}: source prompt trace`);
        assert.equal(component.sourceChoice, sourceQuestion.choiceFacts[component.choiceIndex], `${question.id}/${LABELS[displayIndex]}: source fact trace`);
        assert.equal(typeof component.assertsSourceTruth, "boolean", `${question.id}/${LABELS[displayIndex]}: explicit judgment polarity`);
        assert.equal(component.sourceTruth, Boolean(sourceQuestion.choiceTruths[component.choiceIndex]), `${question.id}/${LABELS[displayIndex]}: source truth trace`);
        assert.equal(component.sourceTruth, truthFromMarker(sourceQuestion.choiceExplanations[component.choiceIndex]), `${question.id}/${LABELS[displayIndex]}: explanation marker trace`);
        assert.ok(!(component.sourceTruth && !component.assertsSourceTruth), `${question.id}/${LABELS[displayIndex]}: unsafe generated negation of a true source atom`);
        const expectedCorrection = component.sourceTruth ? "" : directCorrection(component.questionId, component.choiceIndex, normalizedReason(component.sourceExplanation));
        assert.equal(component.correctionText, expectedCorrection, `${question.id}/${LABELS[displayIndex]}: direct correction trace`);
        assert.equal(component.renderMode, component.assertsSourceTruth ? "source" : "correction", `${question.id}/${LABELS[displayIndex]}: direct render mode`);
        assert.equal(component.displayText, component.assertsSourceTruth ? clean(component.sourceChoice) : expectedCorrection, `${question.id}/${LABELS[displayIndex]}: direct displayed proposition`);
        assert.equal(component.truth, component.assertsSourceTruth ? component.sourceTruth : !component.sourceTruth, `${question.id}/${LABELS[displayIndex]}: judgment polarity truth`);
        assert.equal(component.sourceExplanation, sourceQuestion.choiceExplanations[component.choiceIndex], `${question.id}/${LABELS[displayIndex]}: source explanation trace`);
        assert.equal(component.sourceReason, normalizedReason(component.sourceExplanation), `${question.id}/${LABELS[displayIndex]}: normalized source reason`);
        assert.doesNotMatch(component.sourceReason, /^(?:[アイウエ]|第[1-4]肢)(?:は[、，]?|の)/, `${question.id}/${LABELS[displayIndex]}: leaked original option label`);
        assert.equal(component.reason, directReason(component), `${question.id}/${LABELS[displayIndex]}: direct proposition reason alignment`);
        assert.doesNotMatch(component.reason, META_EVALUATION, `${question.id}/${LABELS[displayIndex]}: meta-evaluation template in direct reason`);
        assert.doesNotMatch(component.displayText, META_EVALUATION, `${question.id}/${LABELS[displayIndex]}: meta-evaluation template in direct proposition`);
        flattenedComponents.push(component);
      }

      const expectedDisplay = `${option.premise}①${first.displayText} ②${second.displayText}`;
      assert.equal(option.displayText, expectedDisplay, `${question.id}/${LABELS[displayIndex]}: premise-once display contract`);
      assert.equal(option.displayText.split(option.premise).length - 1, 1, `${question.id}/${LABELS[displayIndex]}: common premise repeated`);
      assert.equal(question.choiceFacts[displayIndex], expectedDisplay, `${question.id}/${LABELS[displayIndex]}: choiceFacts alignment`);
      assert.equal(option.truth, first.truth && second.truth, `${question.id}/${LABELS[displayIndex]}: AND truth`);
      assert.equal(question.choiceTruths[displayIndex], option.truth, `${question.id}/${LABELS[displayIndex]}: option truth alignment`);
      const semanticPairKey = `${option.questionId}|${[semanticFact(first.displayText), semanticFact(second.displayText)].sort().join("+")}`;
      const underlyingPairKey = `${option.questionId}|${[semanticFact(first.sourceChoice), semanticFact(second.sourceChoice)].sort().join("+")}`;
      assert.equal(option.semanticPairKey, semanticPairKey, `${question.id}/${LABELS[displayIndex]}: semantic pair key`);
      assert.equal(option.underlyingPairKey, underlyingPairKey, `${question.id}/${LABELS[displayIndex]}: underlying source-atom pair key`);
      assert.equal(question.choiceExplanations[displayIndex], expectedExplanation(option, displayIndex), `${question.id}/${LABELS[displayIndex]}: two-component explanation`);
      assert.doesNotMatch(question.choiceExplanations[displayIndex], /第[12]判定|(?:①|②)[○×]：(?:[アイウエ]|第[1-4]肢)(?:は|の)/, `${question.id}/${LABELS[displayIndex]}: meta judgment label or old choice label leak`);
      assert.doesNotMatch(question.choiceExplanations[displayIndex], META_EVALUATION, `${question.id}/${LABELS[displayIndex]}: meta-evaluation template in explanation`);
      if (!option.truth) {
        assert.match(question.choiceExplanations[displayIndex], first.truth ? /②が誤りである/ : second.truth ? /①が誤りである/ : /①と②がともに誤りである/, `${question.id}/${LABELS[displayIndex]}: failing component not identified`);
      }
      if (question.formatFamily === "single") assert.equal(question.choices[displayIndex], expectedDisplay, `${question.id}/${LABELS[displayIndex]}: single display`);
      else assert.equal(question.statements[displayIndex], `${LABELS[displayIndex]}　${expectedDisplay}`, `${question.id}/${LABELS[displayIndex]}: structured statement display`);

      assert.equal(pairOccurrences.get(semanticPairKey) || 0, 0, `${question.id}/${LABELS[displayIndex]}: semantic pair repeats anywhere in forms A/B/C`);
      pairOccurrences.set(semanticPairKey, 1);
      if (!pairForms.has(semanticPairKey)) pairForms.set(semanticPairKey, new Set());
      assert.ok(!pairForms.get(semanticPairKey).has(form.id), `${question.id}/${LABELS[displayIndex]}: semantic pair repeats inside one form`);
      pairForms.get(semanticPairKey).add(form.id);
      assert.equal(underlyingPairOccurrences.get(underlyingPairKey) || 0, 0, `${question.id}/${LABELS[displayIndex]}: underlying source-atom pair repeats anywhere in forms A/B/C`);
      underlyingPairOccurrences.set(underlyingPairKey, 1);
      if (!underlyingPairForms.has(underlyingPairKey)) underlyingPairForms.set(underlyingPairKey, new Set());
      underlyingPairForms.get(underlyingPairKey).add(form.id);
      optionTexts.push(option.displayText);
    }

    assert.equal(flattenedComponents.length, 8, `${question.id}: eight source-choice components`);
    assert.equal(new Set(flattenedComponents.map((component) => component.atomId)).size, 8, `${question.id}: eight distinct source atoms`);
    assert.deepEqual(question.sourceAtomIds, flattenedComponents.map((component) => component.atomId), `${question.id}: flattened atom index`);
    assert.doesNotMatch(question.sourceQuestionIds.map((id) => [base[id].tag, base[id].text, ...base[id].choiceFacts].join(" ")).join(" "), GUARANTEE_ASSOCIATION, `${question.id}: guarantee-association source excluded`);
    assert.deepEqual(question.legalSources.map((item) => item.id), question.sourceQuestionIds, `${question.id}: legal source IDs`);
    assert.deepEqual(question.legalSources.map((item) => item.url), question.sourceQuestionIds.map((id) => base[id].sourceUrl), `${question.id}: legal source URLs`);
    assert.deepEqual(new Set(question.sourceUrls), new Set(question.legalSources.map((item) => item.url)), `${question.id}: URL set`);
    assert.equal(question.sourceUrl, question.sourceUrls[0], `${question.id}: primary URL`);

    const expectedCurrentIds = [...new Set(question.sourceQuestionIds.flatMap((id) => CURRENT_LAW_BY_SOURCE[id] || []))];
    assert.deepEqual(question.currentLawSourceIds, expectedCurrentIds, `${question.id}: current-law bridge`);
    assert.deepEqual(question.currentLawSources.map((item) => item.id), expectedCurrentIds, `${question.id}: current-law source order`);
    for (const current of question.currentLawSources) {
      const ledger = ledgerById.get(current.id);
      assert.ok(ledger && ledger.coveragePolicy === "reference-when-matching-atom", `${question.id}: invalid current-law source ${current.id}`);
      assert.equal(current.url, ledger.sourceUrl, `${question.id}: current-law URL`);
      assert.equal(current.verifiedAt, ledger.verifiedAt, `${question.id}: current-law verifiedAt`);
      referencedCurrentSources.add(current.id);
    }
    if (expectedCurrentIds.length) assert.equal(question.verifiedAt, "2026-09-10", `${question.id}: ledger date must lift verifiedAt`);
    assert.ok(question.actors.every((actor) => question.text.includes(actor)), `${question.id}: actor metadata`);
    ["tag", "sourceRef", "sourceLocator", "verifiedAt", "explain", "trap", "memoryRule", "changeNote"].forEach((key) => assert.ok(String(question[key] || "").trim(), `${question.id}: ${key}`));

    if (question.formatFamily === "single") {
      const trueCount = question.choiceTruths.filter(Boolean).length;
      assert.ok(trueCount === 1 || trueCount === 3, `${question.id}: single truth pattern`);
      assert.equal(question.answer, trueCount === 1 ? question.choiceTruths.findIndex(Boolean) : question.choiceTruths.findIndex((value) => !value), `${question.id}: single answer derivation`);
    } else if (question.formatFamily === "count") {
      assert.deepEqual(question.choices, ["一つ", "二つ", "三つ", "四つ"], `${question.id}: count choices`);
      assert.equal(question.answer, question.choiceTruths.filter(Boolean).length - 1, `${question.id}: count answer derivation`);
    } else {
      const correctPair = LABELS.filter((_, index) => question.choiceTruths[index]).join("・");
      assert.equal(question.choiceTruths.filter(Boolean).length, 2, `${question.id}: combination true count`);
      assert.equal(new Set(question.choices).size, 4, `${question.id}: unique combination choices`);
      question.choices.forEach((choice) => assert.match(choice, /^(?:ア・イ|ア・ウ|ア・エ|イ・ウ|イ・エ|ウ・エ)$/, `${question.id}: valid pair`));
      assert.equal(question.choices[question.answer], correctPair, `${question.id}: combination answer derivation`);
    }
  }

  const lengths = form.questions.map((question) => question.stem.length + (question.statements.length ? question.statements : question.choices).join("").length);
  const average = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
  assert.ok(Math.min(...lengths) >= 300, `${form.id}: minimum substantive display length ${Math.min(...lengths)}`);
  assert.ok(average >= 400, `${form.id}: average substantive display length ${average.toFixed(2)}`);
  assert.equal(lengths.filter((length) => length >= 300).length, 50, `${form.id}: every question clears long-form threshold`);
  summaries.push({ form: form.id, sections: sectionCounts, formats: formatCounts, answers: overallAnswerCounts, mean: Math.round(average), min: Math.min(...lengths), max: Math.max(...lengths), maxAnswerRun: longestRun(answers), truthPatterns });
}

assert.equal(allQuestionIds.size, 150, "150 unique questions");
assert.equal(sourceQuartets.size, 150, "150 unique source-question quartets");
assert.equal(answerSequences.size, 3, "three distinct answer sequences");
assert.equal(optionTexts.length, 600, "600 compound options");
assert.equal(new Set(optionTexts).size, 600, "600 exact displayed options must be unique");
assert.equal(pairOccurrences.size, 600, "all semantic source pairs must be globally unique");
const crossFormOverlap = [...pairForms.values()].filter((forms) => forms.size > 1).length;
assert.equal(crossFormOverlap, 0, "semantic pair overlap across forms A/B/C");
assert.equal(Math.max(...pairOccurrences.values()), 1, "semantic source pair reuse");
assert.equal(underlyingPairOccurrences.size, 600, "all 600 underlying source-atom pairs must be globally unique");
const underlyingCrossFormOverlap = [...underlyingPairForms.values()].filter((forms) => forms.size > 1).length;
assert.equal(underlyingCrossFormOverlap, 0, "underlying source-atom pair overlap across forms A/B/C");
assert.equal(Math.max(...underlyingPairOccurrences.values()), 1, "underlying source-atom pair reuse");

for (const sectionId of SECTION_IDS) {
  const sectionQuestions = allQuestions.filter((question) => question.sectionId === sectionId);
  const options = sectionQuestions.flatMap((question) => question.sourceChoices);
  const eligibleQuestions = Object.values(base).filter((question) => eligibleSource(question, sectionId)).sort((left, right) => left.id.localeCompare(right.id, "en"));
  const sourceUsage = Object.fromEntries(eligibleQuestions.map((question) => [question.id, 0]));
  options.forEach((option) => { sourceUsage[option.questionId] += 1; });
  assert.ok(Math.min(...Object.values(sourceUsage)) > 0, `${sectionId}: every eligible source question must be exercised`);
  assert.deepEqual(bank.scheduling[sectionId].sourceUsage, sourceUsage, `${sectionId}: source usage ledger`);
  const atomUsage = Object.fromEntries(eligibleQuestions.flatMap((question) => question.choiceFacts.map((_, index) => [`${question.id}#${index}`, 0])));
  options.flatMap((option) => option.components).forEach((component) => { atomUsage[component.atomId] += 1; });
  assert.deepEqual(bank.scheduling[sectionId].atomUsage, atomUsage, `${sectionId}: atom usage ledger`);

  const availablePairs = [];
  eligibleQuestions.forEach((question) => {
    for (let first = 0; first < 3; first += 1) {
      for (let second = first + 1; second < 4; second += 1) {
        if (semanticFact(question.choiceFacts[first]) === semanticFact(question.choiceFacts[second])) continue;
        availablePairs.push({
          key: `${question.id}|${[semanticFact(question.choiceFacts[first]), semanticFact(question.choiceFacts[second])].sort().join("+")}`
        });
      }
    }
  });
  assert.equal(availablePairs.length, EXPECTED_UNDERLYING_PAIR_CAPACITY[sectionId], `${sectionId}: underlying pair capacity`);
  const mathematicalMinimumMaxReuse = Math.ceil(options.length / availablePairs.length);
  const usedCounts = options.map((option) => underlyingPairOccurrences.get(option.underlyingPairKey));
  assert.equal(Math.max(...usedCounts), mathematicalMinimumMaxReuse, `${sectionId}: underlying pair reuse must meet mathematical lower bound`);
  assert.deepEqual(bank.scheduling[sectionId].pairUsage, Object.fromEntries(availablePairs.map((pair) => [pair.key, underlyingPairOccurrences.get(pair.key) || 0])), `${sectionId}: underlying pair usage ledger`);
  assert.equal(bank.scheduling[sectionId].maxPairReuse, Math.max(...availablePairs.map((pair) => underlyingPairOccurrences.get(pair.key) || 0)), `${sectionId}: max underlying pair reuse ledger`);
  const falsePatterns = bank.scheduling[sectionId].falsePatternUsage;
  assert.ok(falsePatterns.FT > 0 && falsePatterns.TF > 0 && falsePatterns.FF > 0, `${sectionId}: varied failing components`);
}

const requiredCurrentIds = ledgerApi.ledger.filter((item) => item.coveragePolicy === "reference-when-matching-atom").map((item) => item.id).sort();
assert.deepEqual([...referencedCurrentSources].sort(), requiredCurrentIds, "all applicable current-law sources exercised");

const snapshot = JSON.stringify(bank.forms.map((form) => form.questions.map((question) => ({
  id: question.id, answer: question.answer, atoms: question.sourceAtomIds, truths: question.choiceTruths, text: question.text
}))));
const isolatedOne = isolatedSnapshot();
const isolatedTwo = isolatedSnapshot();
assert.equal(isolatedOne, isolatedTwo, "deterministic generation across isolated runs");
assert.equal(snapshot, isolatedOne, "global and isolated generation match");

console.log(JSON.stringify({
  status: "ok",
  forms: summaries,
  totalQuestions: allQuestionIds.size,
  compoundOptions: optionTexts.length,
  maxSemanticPairReuse: Math.max(...pairOccurrences.values()),
  crossFormSemanticPairOverlap: crossFormOverlap,
  underlyingPairReuse: Math.max(...underlyingPairOccurrences.values()),
  crossFormUnderlyingPairOverlap: underlyingCrossFormOverlap,
  sourceRanges: Object.fromEntries(SECTION_IDS.map((sectionId) => {
    const values = Object.values(bank.scheduling[sectionId].sourceUsage);
    return [sectionId, { min: Math.min(...values), max: Math.max(...values), pairMax: bank.scheduling[sectionId].maxPairReuse }];
  })),
  currentLawSources: [...referencedCurrentSources].sort(),
  deterministic: true
}, null, 2));
