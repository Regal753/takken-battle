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
  .replace(/^(?:[アイウエ]|第[1-4]肢)は[、，]?\s*/, "");

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
  if (option.truth) conclusion = "第1判定・第2判定がともに正しいため、肢全体は○。";
  else if (!first.truth && !second.truth) conclusion = "第1判定・第2判定がともに誤っているため、肢全体は×。";
  else conclusion = `${first.truth ? "第2判定" : "第1判定"}が誤っているため、肢全体は×。`;
  return `${LABELS[displayIndex]} ${option.truth ? "○" : "×"} 第1判定${first.truth ? "○" : "×"}：${normalizedReason(first.sourceExplanation)} 第2判定${second.truth ? "○" : "×"}：${normalizedReason(second.sourceExplanation)} ${conclusion}`;
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
        assert.equal(component.sourcePrompt, sourceQuestion.text, `${question.id}/${LABELS[displayIndex]}: source prompt trace`);
        assert.equal(component.sourceChoice, sourceQuestion.choiceFacts[component.choiceIndex], `${question.id}/${LABELS[displayIndex]}: source fact trace`);
        assert.equal(component.displayText, component.sourceChoice, `${question.id}/${LABELS[displayIndex]}: premise must not be duplicated inside component`);
        assert.equal(component.truth, Boolean(sourceQuestion.choiceTruths[component.choiceIndex]), `${question.id}/${LABELS[displayIndex]}: source truth trace`);
        assert.equal(component.truth, truthFromMarker(sourceQuestion.choiceExplanations[component.choiceIndex]), `${question.id}/${LABELS[displayIndex]}: explanation marker trace`);
        assert.equal(component.sourceExplanation, sourceQuestion.choiceExplanations[component.choiceIndex], `${question.id}/${LABELS[displayIndex]}: source explanation trace`);
        assert.doesNotMatch(component.reason, /^(?:[アイウエ]|第[1-4]肢)は[、，]?/, `${question.id}/${LABELS[displayIndex]}: leaked original option label`);
        assert.equal(component.reason, normalizedReason(component.sourceExplanation), `${question.id}/${LABELS[displayIndex]}: normalized component reason`);
        flattenedComponents.push(component);
      }

      const expectedDisplay = `${option.premise}${first.sourceChoice} また、${second.sourceChoice}`;
      assert.equal(option.displayText, expectedDisplay, `${question.id}/${LABELS[displayIndex]}: premise-once display contract`);
      assert.equal(option.displayText.split(option.premise).length - 1, 1, `${question.id}/${LABELS[displayIndex]}: common premise repeated`);
      assert.equal(question.choiceFacts[displayIndex], expectedDisplay, `${question.id}/${LABELS[displayIndex]}: choiceFacts alignment`);
      assert.equal(option.truth, first.truth && second.truth, `${question.id}/${LABELS[displayIndex]}: AND truth`);
      assert.equal(question.choiceTruths[displayIndex], option.truth, `${question.id}/${LABELS[displayIndex]}: option truth alignment`);
      const semanticPairKey = `${option.questionId}|${[semanticFact(first.sourceChoice), semanticFact(second.sourceChoice)].sort().join("+")}`;
      assert.equal(option.semanticPairKey, semanticPairKey, `${question.id}/${LABELS[displayIndex]}: semantic pair key`);
      assert.equal(question.choiceExplanations[displayIndex], expectedExplanation(option, displayIndex), `${question.id}/${LABELS[displayIndex]}: two-component explanation`);
      assert.doesNotMatch(question.choiceExplanations[displayIndex], /(?:第1判定|第2判定)[○×]：(?:[アイウエ]|第[1-4]肢)は/, `${question.id}/${LABELS[displayIndex]}: embedded reason leaks old choice label`);
      if (!option.truth) {
        assert.match(question.choiceExplanations[displayIndex], first.truth ? /第2判定が誤っている/ : second.truth ? /第1判定が誤っている/ : /第1判定・第2判定がともに誤っている/, `${question.id}/${LABELS[displayIndex]}: failing component not identified`);
      }
      if (question.formatFamily === "single") assert.equal(question.choices[displayIndex], expectedDisplay, `${question.id}/${LABELS[displayIndex]}: single display`);
      else assert.equal(question.statements[displayIndex], `${LABELS[displayIndex]}　${expectedDisplay}`, `${question.id}/${LABELS[displayIndex]}: structured statement display`);

      pairOccurrences.set(semanticPairKey, (pairOccurrences.get(semanticPairKey) || 0) + 1);
      if (!pairForms.has(semanticPairKey)) pairForms.set(semanticPairKey, new Set());
      assert.ok(!pairForms.get(semanticPairKey).has(form.id), `${question.id}/${LABELS[displayIndex]}: semantic pair repeats inside one form`);
      pairForms.get(semanticPairKey).add(form.id);
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
assert.ok(Math.max(...pairOccurrences.values()) <= 3, "semantic source pair repeated more than three times");

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
          key: `${question.id}|${[semanticFact(question.choiceFacts[first]), semanticFact(question.choiceFacts[second])].sort().join("+")}`,
          truth: Boolean(question.choiceTruths[first]) && Boolean(question.choiceTruths[second])
        });
      }
    }
  });
  for (const truth of [true, false]) {
    const demand = options.filter((option) => option.truth === truth).length;
    const capacity = availablePairs.filter((pair) => pair.truth === truth).length;
    const mathematicalMinimumMaxReuse = Math.ceil(demand / capacity);
    const usedCounts = options.filter((option) => option.truth === truth).map((option) => pairOccurrences.get(option.semanticPairKey));
    assert.equal(Math.max(...usedCounts), mathematicalMinimumMaxReuse, `${sectionId}/${truth ? "true" : "false"}: semantic pair reuse must meet mathematical lower bound`);
  }
  assert.deepEqual(bank.scheduling[sectionId].pairUsage, Object.fromEntries(availablePairs.map((pair) => [pair.key, pairOccurrences.get(pair.key) || 0])), `${sectionId}: pair usage ledger`);
  assert.equal(bank.scheduling[sectionId].maxPairReuse, Math.max(...availablePairs.map((pair) => pairOccurrences.get(pair.key) || 0)), `${sectionId}: max pair reuse ledger`);
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
  sourceRanges: Object.fromEntries(SECTION_IDS.map((sectionId) => {
    const values = Object.values(bank.scheduling[sectionId].sourceUsage);
    return [sectionId, { min: Math.min(...values), max: Math.max(...values), pairMax: bank.scheduling[sectionId].maxPairReuse }];
  })),
  currentLawSources: [...referencedCurrentSources].sort(),
  deterministic: true
}, null, 2));
