"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = {};
require("./exam-blueprint.js");
require("./exam-question-core.js");
require("./exam-questions-rights.js");
require("./exam-questions-restrictions.js");
require("./exam-questions-tax-other.js");
require("./exam-questions-business.js");
require("./practical-question-bank.js");
require("./business-fullscore-supplement.js");

const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
const baseQuestions = window.TAKKEN_EXAM_QUESTIONS;
const supplement = window.TAKKEN_BUSINESS_FULLSCORE_SUPPLEMENT;
const practicalBefore = window.TAKKEN_PRACTICAL_VARIATIONS;
const practicalQuestionCountBefore = practicalBefore.QUESTIONS.length;
const practicalUnitCountBefore = practicalBefore.UNITS.length;
const bank = require("./business-fullscore-bank.js");

const expectedUnitTotals = Object.freeze({
  "business-book-01": 10,
  "business-book-02": 12,
  "business-book-03": 10,
  "business-book-04": 10,
  "business-book-05": 10,
  "business-book-06": 10,
  "business-book-07": 26,
  "business-book-08": 16,
  "business-book-09": 10,
  "business-book-10": 10,
  "business-book-11": 10
});
const expectedFormats = Object.freeze({ single: 33, combination: 34, count: 33, case: 34 });
const allowedDiagnosticTags = new Set([
  "subject",
  "timing",
  "counterparty",
  "number",
  "principle-exception",
  "article-35",
  "article-37",
  "eight-restrictions",
  "transaction-type",
  "amendment"
]);
const extremeWords = Object.freeze([
  "絶対", "必ず", "一切", "永久", "常に", "全て", "すべて", "無制限", "直ちに"
]);
const extremePattern = new RegExp(extremeWords.join("|"), "g");
const legalTerms = Object.freeze([
  "宅地建物取引士証",
  "宅建士証",
  "宅建業者票",
  "35条書面",
  "37条書面",
  "営業保証金",
  "弁済業務保証金分担金",
  "弁済業務保証金",
  "従業者証明書",
  "建物状況調査",
  "契約不適合責任",
  "指定流通機構",
  "重要事項説明"
]);
const corruptedLegalTermPattern = /宅建士甲証|宅地建物取引士甲証|宅建業者甲票|宅建士甲(?:資格|登録)|宅建業者甲免許/;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function reasonText(line) {
  return cleanText(line).replace(/^\s*(?:[ア-ン]|[0-9０-９]+)\s*[○×]\s*/, "");
}

function baseStatement(question, index) {
  if (question.format !== "個数問題") return cleanText(question.choices[index]);
  const statements = String(question.text || "")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([アイウエ])\s+(.+)$/))
    .filter(Boolean)
    .map((match) => cleanText(match[2]));
  assert.equal(statements.length, 4, `${question.id}: base count statements`);
  return statements[index];
}

function numericTokens(value) {
  return String(value || "").match(/[0-9０-９]+(?:[.,][0-9０-９]+)*/g) || [];
}

function extremeMatches(value) {
  return String(value || "").match(extremePattern) || [];
}

function formatCounts(questions) {
  return questions.reduce((counts, question) => {
    counts[question.formatKey] = (counts[question.formatKey] || 0) + 1;
    return counts;
  }, {});
}

function answerDistribution(questions) {
  return [0, 1, 2, 3].map((answer) =>
    questions.filter((question) => question.answer === answer).length
  );
}

function answerDistributionByFormat(questions) {
  return Object.fromEntries(Object.keys(expectedFormats).map((formatKey) => [
    formatKey,
    answerDistribution(questions.filter((question) => question.formatKey === formatKey))
  ]));
}

function assertDeepFrozen(value, owner) {
  assert.ok(Object.isFrozen(value), `${owner}: frozen`);
  if (!value || typeof value !== "object") return;
  Object.entries(value).forEach(([key, child]) => {
    if (child && typeof child === "object") assertDeepFrozen(child, `${owner}.${key}`);
  });
}

function assertDisplayModel(question) {
  const model = question.displayModel;
  const expectedItems = question.formatKey === "combination" ? 2 :
    (question.formatKey === "count" || question.formatKey === "case" ? 4 : 0);
  const expectedChoiceBlocks = question.formatKey === "single" ? 4 : 0;
  assert.ok(model, `${question.id}: display model exists`);
  assertDeepFrozen(model, `${question.id}: display model`);
  assert.ok(cleanText(model.intro), `${question.id}: display intro`);
  assert.equal(model.items.length, expectedItems, `${question.id}: display item count`);
  assert.equal(model.choiceBlocks.length, expectedChoiceBlocks, `${question.id}: display choice block count`);
  const sourceFactKeys = new Set(question.sourceFacts.map((fact) => fact.key));
  const displayedFactKeys = new Set();
  [...model.items, ...model.choiceBlocks].forEach((block, index) => {
    assert.equal(typeof block.label, "string", `${question.id}: display block ${index} label`);
    assert.ok(cleanText(block.judgment), `${question.id}: display block ${index} judgment`);
    assert.ok(block.sourceFactKeys.length >= 1, `${question.id}: display block ${index} source keys`);
    assert.equal(new Set(block.premises).size, block.premises.length, `${question.id}: display premises deduplicated`);
    block.sourceFactKeys.forEach((key) => {
      assert.ok(sourceFactKeys.has(key), `${question.id}: display source key exists ${key}`);
      displayedFactKeys.add(key);
    });
  });
  assert.deepEqual([...displayedFactKeys].sort(), [...sourceFactKeys].sort(), `${question.id}: display fact-key coverage`);
  if (question.formatKey === "single") {
    model.choiceBlocks.forEach((block, index) => {
      const fact = question.sourceFacts[index];
      assert.equal(block.label, "", `${question.id}: single display choice label`);
      assert.deepEqual(block.sourceFactKeys, [fact.key], `${question.id}: single display choice fact`);
      assert.equal(block.judgment, fact.presentedStatement, `${question.id}: single display choice judgment`);
      assert.equal(question.choices[index], `【前提】${fact.context} 【判断】${fact.presentedStatement}`, `${question.id}: single raw choice retained`);
    });
  }
}

function assertUnderlyingStatementExplanations(question) {
  if (!new Set(["combination", "count", "case"]).has(question.formatKey)) return;

  const explanations = question.statementExplanations;
  const labels = question.formatKey === "combination"
    ? ["ア・前半", "ア・後半", "イ・前半", "イ・後半"]
    : ["ア", "イ", "ウ", "エ"];
  assert.ok(Array.isArray(explanations), `${question.id}: underlying statement explanations exist`);
  assert.equal(explanations.length, 4, `${question.id}: four underlying statement explanations`);
  assert.ok(Object.isFrozen(explanations), `${question.id}: underlying statement explanations frozen`);

  explanations.forEach((line, index) => {
    const fact = question.sourceFacts[index];
    const text = cleanText(line);
    assert.ok(fact, `${question.id}/${labels[index]}: source fact exists`);
    assert.match(
      text,
      new RegExp(`^${labels[index]}\\s+${fact.truth ? "○" : "×"}\\s+`),
      `${question.id}/${labels[index]}: label and verdict trace source fact`
    );
    assert.ok(
      text.includes(fact.presentedStatement),
      `${question.id}/${labels[index]}: application names the underlying statement`
    );
    assert.ok(
      text.includes(fact.reason),
      `${question.id}/${labels[index]}: legal basis is retained`
    );
    assert.doesNotMatch(
      text,
      /^(?:ア|イ|ウ|エ)(?:・(?:前半|後半))?\s+[○×]\s+(?:正しい記述は\d+つ|実際はア[○×]・イ[○×]|4場面を個別に判定)/,
      `${question.id}/${labels[index]}: not a choice-matching template`
    );
  });
}

assert.equal(supplement.VERSION, 2);
assert.equal(supplement.LEGAL_BASELINE, blueprint.legalBaseline);
assert.equal(supplement.ANCHORS.length, 18);
assert.equal(supplement.FACTS.length, 72);
assert.equal(Object.keys(supplement.ANCHORS_BY_ID).length, 18);
assert.equal(Object.keys(supplement.FACTS_BY_KEY).length, 72);

const bankSource = fs.readFileSync(path.join(__dirname, "business-fullscore-bank.js"), "utf8");
function isolatedBankRuntime(supplementValue, includeSupplement) {
  const sandbox = {
    URL,
    Date,
    TAKKEN_EXAM_BLUEPRINT: blueprint,
    TAKKEN_EXAM_QUESTIONS: baseQuestions
  };
  if (includeSupplement) sandbox.TAKKEN_BUSINESS_FULLSCORE_SUPPLEMENT = supplementValue;
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  return sandbox;
}
assert.throws(
  () => vm.runInNewContext(bankSource, isolatedBankRuntime(undefined, false)),
  /supplement/,
  "bank must fail closed when the supplement is absent"
);
assert.throws(
  () => vm.runInNewContext(bankSource, isolatedBankRuntime({
    ...supplement,
    FACTS: supplement.FACTS.slice(0, 67)
  }, true)),
  /18 anchors and 72 facts/,
  "bank must fail closed when the supplement is invalid"
);

assert.equal(bank.VERSION, 3, "explanation-only updates must retain the v32 answer compatibility version");
assert.equal(bank.QUALITY_VERSION, 4, "deep explanation content version");
assert.equal(bank.LEGAL_BASELINE, blueprint.legalBaseline);
assert.equal(bank.QUESTIONS.length, 134);
assert.equal(Object.keys(bank.QUESTIONS_BY_ID).length, 134);
assert.equal(bank.UNITS.length, 11);
assert.deepEqual(formatCounts(bank.QUESTIONS), expectedFormats);
assert.deepEqual(answerDistribution(bank.QUESTIONS), [34, 33, 34, 33]);
assert.deepEqual(answerDistributionByFormat(bank.QUESTIONS), {
  single: [9, 8, 8, 8],
  combination: [8, 9, 9, 8],
  count: [8, 8, 9, 8],
  case: [9, 8, 8, 9]
});
assert.deepEqual(new Set(bank.ALLOWED_DIAGNOSTIC_TAGS), allowedDiagnosticTags);

assert.strictEqual(window.TAKKEN_PRACTICAL_VARIATIONS, practicalBefore);
assert.equal(window.TAKKEN_PRACTICAL_VARIATIONS.QUESTIONS.length, practicalQuestionCountBefore);
assert.equal(window.TAKKEN_PRACTICAL_VARIATIONS.UNITS.length, practicalUnitCountBefore);
assert.equal(practicalQuestionCountBefore, 180);
assert.equal(practicalUnitCountBefore, 45);
assert.equal(
  window.TAKKEN_PRACTICAL_VARIATIONS.QUESTIONS.filter((question) => question.sectionId === "business").length,
  44
);

const businessUnits = blueprint.textbookRanges.business.chapters;
const unitById = Object.fromEntries(businessUnits.map((unit) => [unit.id, unit]));
const legacyTargetByUnit = Object.freeze({
  "business-book-01": 2,
  "business-book-02": 2,
  "business-book-03": 2,
  "business-book-04": 2,
  "business-book-05": 2,
  "business-book-06": 2,
  "business-book-07": 4,
  "business-book-08": 3,
  "business-book-09": 2,
  "business-book-10": 2,
  "business-book-11": 2
});
assert.deepEqual(
  Object.fromEntries(bank.UNITS.map((unit) => [unit.id, unit.questionIds.length])),
  expectedUnitTotals
);

for (const unit of bank.UNITS) {
  const sourceUnit = unitById[unit.id];
  assert.ok(sourceUnit, `${unit.id}: configured business unit`);
  assert.equal(unit.label, sourceUnit.label, `${unit.id}: label traceability`);
  assert.equal(unit.page, sourceUnit.page, `${unit.id}: page traceability`);
  assert.equal(new Set(unit.questionIds).size, unit.questionIds.length, `${unit.id}: unique question IDs`);
  unit.questionIds.forEach((id) => {
    assert.equal(bank.QUESTIONS_BY_ID[id]?.unitId, unit.id, `${id}: unit question mapping`);
  });
  const unitFactKeys = [
    ...sourceUnit.ids.flatMap((id) => [0, 1, 2, 3].map((index) => `${id}:${index}`)),
    ...supplement.FACTS.filter((fact) => fact.unitId === unit.id).map((fact) => fact.key)
  ];
  const coveredInUnit = new Set(unit.questionIds.flatMap((id) =>
    bank.QUESTIONS_BY_ID[id].sourceFacts.map((fact) => fact.key)
  ));
  unitFactKeys.forEach((key) => assert.ok(coveredInUnit.has(key), `${unit.id}: unit capacity covers ${key}`));
  assert.ok(unit.questionIds.length * 4 >= unitFactKeys.length, `${unit.id}: placement capacity`);
}

const ids = bank.QUESTIONS.map((question) => question.id);
assert.equal(new Set(ids).size, 134, "stable IDs must be unique");
assert.equal(
  new Set(bank.QUESTIONS.map((question) => JSON.stringify([question.text, question.choices]))).size,
  134,
  "question bodies must be unique"
);

const expectedLegacyIds = businessUnits.flatMap((unit) =>
  ["single", "combination", "count", "case"].flatMap((formatKey) =>
    Array.from({ length: legacyTargetByUnit[unit.id] }, (_, index) =>
      `bf-${unit.id}-${formatKey}-${String(index + 1).padStart(2, "0")}`
    )
  )
);
assert.equal(expectedLegacyIds.length, 100);
assert.deepEqual(
  bank.QUESTIONS.slice(0, 100).map((question) => question.id),
  expectedLegacyIds,
  "the original 100 mastery IDs and order must remain unchanged"
);
const supplementalQuestions = bank.QUESTIONS.slice(100);
assert.equal(supplementalQuestions.length, 34);
assert.ok(supplementalQuestions.every((question) => question.id.includes("-supplement-")));
assert.deepEqual(formatCounts(supplementalQuestions), { single: 8, combination: 9, count: 8, case: 9 });
assert.deepEqual(answerDistributionByFormat(supplementalQuestions), {
  single: [2, 2, 2, 2],
  combination: [2, 2, 3, 2],
  count: [2, 2, 2, 2],
  case: [3, 2, 2, 2]
});

const expectedBaseFactKeys = businessUnits.flatMap((unit) =>
  unit.ids.flatMap((id) => [0, 1, 2, 3].map((index) => `${id}:${index}`))
);
const expectedSupplementFactKeys = supplement.FACTS.map((fact) => fact.key);
const expectedFactKeys = [...expectedBaseFactKeys, ...expectedSupplementFactKeys];
assert.equal(expectedBaseFactKeys.length, 176);
assert.equal(new Set(expectedBaseFactKeys).size, 176);
assert.equal(expectedSupplementFactKeys.length, 72);
assert.equal(new Set(expectedSupplementFactKeys).size, 72);
assert.equal(expectedFactKeys.length, 248);
assert.equal(new Set(expectedFactKeys).size, 248);
assert.deepEqual([...bank.BASE_FACT_KEYS].sort(), [...expectedBaseFactKeys].sort());
assert.deepEqual([...bank.SUPPLEMENT_FACT_KEYS].sort(), [...expectedSupplementFactKeys].sort());
assert.deepEqual([...bank.FACT_KEYS].sort(), [...expectedFactKeys].sort());

const coveredFactKeys = bank.QUESTIONS.flatMap((question) =>
  question.sourceFacts.map((fact) => fact.key)
);
const factUsage = Object.fromEntries(expectedFactKeys.map((key) => [key, 0]));
coveredFactKeys.forEach((key) => {
  assert.ok(Object.hasOwn(factUsage, key), `${key}: known source fact`);
  factUsage[key] += 1;
});
assert.equal(new Set(coveredFactKeys).size, 248, "all 248 facts must be covered");
assert.equal(new Set(coveredFactKeys.filter((key) => expectedBaseFactKeys.includes(key))).size, 176, "all 176 base facts");
assert.equal(new Set(coveredFactKeys.filter((key) => expectedSupplementFactKeys.includes(key))).size, 72, "all 72 supplement facts");
assert.equal(Object.values(factUsage).filter((count) => count === 0).length, 0);
assert.ok(Math.max(...Object.values(factUsage)) <= 5, "fact use must remain at or below five");
assert.ok(expectedSupplementFactKeys.every((key) => factUsage[key] === 1), "supplement facts are placed exactly once");

const uniqueFactByKey = new Map();
bank.QUESTIONS.forEach((question) => question.sourceFacts.forEach((fact) => {
  if (!uniqueFactByKey.has(fact.key)) uniqueFactByKey.set(fact.key, fact);
}));
const extremeSourceFacts = [...uniqueFactByKey.values()].filter((fact) =>
  extremeMatches(fact.statement).length > 0
);
const extremeSourcePlacements = bank.QUESTIONS.flatMap((question) => question.sourceFacts)
  .filter((fact) => extremeMatches(fact.statement).length > 0);
assert.equal(extremeSourceFacts.length, 42, "known absolute-word source facts");
assert.ok(extremeSourceFacts.every((fact) => fact.truth === false), "source absolute-word facts are false-biased");
assert.ok(extremeSourcePlacements.length >= 42, "source absolute-word facts remain traceable");
assert.equal(
  supplement.FACTS.filter((fact) => extremeMatches(`${fact.prompt} ${fact.statement} ${fact.reason}`).length > 0).length,
  0,
  "supplement propositions must not introduce absolute-word cues"
);

const observedDiagnosticTags = new Set();
for (const question of bank.QUESTIONS) {
  assert.strictEqual(bank.QUESTIONS_BY_ID[question.id], question, `${question.id}: stable lookup identity`);
  assert.equal(question.masteryId, question.id, `${question.id}: stable mastery ID`);
  assert.equal(question.sectionId, "business", `${question.id}: business section`);
  assert.equal(question.scopeId, "business", `${question.id}: business scope`);
  assert.equal(question.unitLabel, unitById[question.unitId].label, `${question.id}: unit label`);
  assert.equal(question.unitPage, unitById[question.unitId].page, `${question.id}: unit page`);
  assert.equal(question.legalBaseline, blueprint.legalBaseline, `${question.id}: legal baseline`);
  assert.equal(question.qualityVersion, 4, `${question.id}: quality version`);
  assert.ok(Object.hasOwn(expectedFormats, question.formatKey), `${question.id}: known format`);
  assert.equal(question.format, bank.FORMAT_LABELS[question.formatKey], `${question.id}: format label`);
  assert.equal(question.choices.length, 4, `${question.id}: four choices`);
  assert.equal(question.choiceExplanations.length, 4, `${question.id}: four choice explanations`);
  assert.equal(question.choiceDiagnosticTags.length, 4, `${question.id}: four choice diagnostics`);
  assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4, `${question.id}: answer`);
  assert.equal(question.sourceFacts.length, 4, `${question.id}: four source facts`);
  assert.equal(new Set(question.sourceFacts.map((fact) => fact.key)).size, 4, `${question.id}: distinct source facts`);
  assert.ok(question.sourceQuestionIds.length >= 1, `${question.id}: source question IDs`);
  assert.ok(question.sourceTypes.length >= 1, `${question.id}: source types`);
  assert.ok(question.sourceUrls.length >= 1, `${question.id}: source URLs`);
  assert.equal(question.reasoningSteps.length, 4, `${question.id}: four reasoning steps`);
  assertDisplayModel(question);
  assertUnderlyingStatementExplanations(question);
  question.reasoningSteps.forEach((step) => {
    assert.ok(cleanText(step.label), `${question.id}: reasoning label`);
    assert.ok(cleanText(step.text), `${question.id}: reasoning text`);
  });
  assert.ok(question.diagnosticTags.length >= 1, `${question.id}: diagnostic tags`);
  assert.equal(
    extremeMatches([question.text, ...question.choices].join(" ")).length,
    0,
    `${question.id}: learner-facing text must not leak absolute-word truth cues`
  );
  assert.doesNotMatch(
    [question.text, ...question.choices].join(" "),
    corruptedLegalTermPattern,
    `${question.id}: legal term must not be corrupted by party reframing`
  );
  question.diagnosticTags.forEach((tag) => {
    assert.ok(allowedDiagnosticTags.has(tag), `${question.id}: allowed diagnostic tag ${tag}`);
    observedDiagnosticTags.add(tag);
  });
  question.choiceDiagnosticTags.forEach((tags, choiceIndex) => {
    const focusedAggregateAnswer = ["combination", "case"].includes(question.formatKey) &&
      choiceIndex === question.answer;
    assert.ok(focusedAggregateAnswer || tags.length >= 1, `${question.id}: wrong choices have diagnostic tags`);
    tags.forEach((tag) => assert.ok(allowedDiagnosticTags.has(tag), `${question.id}: choice diagnostic ${tag}`));
  });
  question.sourceUrls.forEach((url) => {
    const parsed = new URL(url);
    assert.equal(parsed.protocol, "https:", `${question.id}: official HTTPS source`);
  });

  for (const fact of question.sourceFacts) {
    assert.ok(fact.sourceType === "base" || fact.sourceType === "supplement", `${fact.key}: source type`);
    if (fact.sourceType === "base") {
      const sourceQuestion = baseQuestions[fact.questionId];
      assert.ok(sourceQuestion, `${fact.key}: source question exists`);
      assert.ok(unitById[question.unitId].ids.includes(fact.questionId), `${fact.key}: source belongs to unit`);
      assert.equal(fact.anchorId, "", `${fact.key}: base anchor is empty`);
      assert.equal(fact.key, `${fact.questionId}:${fact.choiceIndex}`, `${fact.key}: stable fact key`);
      assert.equal(fact.statementIndex, fact.choiceIndex, `${fact.key}: base statement index`);
      assert.equal(fact.statement, baseStatement(sourceQuestion, fact.choiceIndex), `${fact.key}: statement trace`);
      const sourceExplanation = sourceQuestion.choiceExplanations[fact.choiceIndex];
      assert.equal(fact.truth, sourceExplanation.includes("○"), `${fact.key}: truth trace`);
      assert.equal(fact.reason, reasonText(sourceExplanation), `${fact.key}: reason trace`);
      assert.equal(fact.sourceUrl, sourceQuestion.sourceUrl, `${fact.key}: URL trace`);
      assert.equal(fact.sourceLocator, sourceQuestion.sourceLocator, `${fact.key}: locator trace`);
    } else {
      const sourceFact = supplement.FACTS_BY_KEY[fact.key];
      const sourceAnchor = supplement.ANCHORS_BY_ID[fact.anchorId];
      assert.ok(sourceFact, `${fact.key}: supplement fact exists`);
      assert.ok(sourceAnchor, `${fact.key}: supplement anchor exists`);
      assert.equal(sourceFact.unitId, question.unitId, `${fact.key}: supplement belongs to unit`);
      assert.equal(fact.questionId, sourceFact.anchorId, `${fact.key}: supplement question ID`);
      assert.equal(fact.anchorId, sourceFact.anchorId, `${fact.key}: supplement anchor ID`);
      assert.equal(fact.choiceIndex, sourceFact.statementIndex, `${fact.key}: supplement choice index`);
      assert.equal(fact.statementIndex, sourceFact.statementIndex, `${fact.key}: supplement statement index`);
      assert.equal(fact.key, `${fact.anchorId}:${fact.statementIndex}`, `${fact.key}: supplement stable fact key`);
      assert.equal(fact.statement, sourceFact.statement, `${fact.key}: supplement statement trace`);
      assert.equal(fact.truth, sourceFact.truth, `${fact.key}: supplement truth trace`);
      assert.equal(fact.reason, sourceFact.reason, `${fact.key}: supplement reason trace`);
      assert.equal(fact.sourceUrl, new URL(sourceFact.sourceUrl).href, `${fact.key}: supplement URL trace`);
      assert.equal(fact.sourceLocator, sourceFact.sourceLocator, `${fact.key}: supplement locator trace`);
      assert.ok(question.sourceAnchorIds.includes(fact.anchorId), `${fact.key}: question anchor mapping`);
    }
    assert.ok(cleanText(fact.presentedStatement), `${fact.key}: presented statement`);
    legalTerms.filter((term) => fact.statement.includes(term)).forEach((term) => {
      assert.ok(
        fact.presentedStatement.includes(term),
        `${fact.key}: legal term "${term}" must remain intact in presented statement`
      );
    });
    assert.doesNotMatch(
      fact.presentedStatement,
      corruptedLegalTermPattern,
      `${fact.key}: source legal term must remain intact`
    );
    assert.ok(fact.diagnosticTags.length >= 1, `${fact.key}: fact diagnostics`);
    fact.diagnosticTags.forEach((tag) => {
      assert.ok(allowedDiagnosticTags.has(tag), `${fact.key}: allowed fact diagnostic ${tag}`);
      observedDiagnosticTags.add(tag);
    });
  }

  const wrongSelection = (question.answer + 1) % 4;
  assert.deepEqual(bank.diagnosticsForSelection(question, question.answer), [], `${question.id}: correct has no diagnosis`);
  assert.ok(bank.diagnosticsForSelection(question, wrongSelection).length >= 1, `${question.id}: wrong diagnosis`);
}
assert.deepEqual(observedDiagnosticTags, allowedDiagnosticTags, "all diagnostic dimensions must appear");

const mixedSupplementQuestions = supplementalQuestions.filter((question) =>
  question.sourceTypes.includes("base") && question.sourceTypes.includes("supplement")
);
const crossAnchorQuestions = supplementalQuestions.filter((question) =>
  question.sourceTypes.length === 1 && question.sourceTypes[0] === "supplement"
);
assert.equal(mixedSupplementQuestions.length, 32, "32 added questions mix base and supplement facts");
assert.equal(crossAnchorQuestions.length, 2, "two added questions cross supplement anchors");
for (const question of mixedSupplementQuestions) {
  assert.equal(question.sourceFacts.filter((fact) => fact.sourceType === "base").length, 2, `${question.id}: two base supports`);
  assert.equal(question.sourceFacts.filter((fact) => fact.sourceType === "supplement").length, 2, `${question.id}: two supplement facts`);
  assert.equal(question.sourceAnchorIds.length, 1, `${question.id}: one supplement anchor`);
}
for (const question of crossAnchorQuestions) {
  assert.equal(question.sourceFacts.filter((fact) => fact.sourceType === "supplement").length, 4, `${question.id}: four supplement facts`);
  assert.equal(question.sourceAnchorIds.length, 2, `${question.id}: cross-anchor source`);
}
for (const anchor of supplement.ANCHORS) {
  const anchorQuestions = supplementalQuestions.filter((question) => question.sourceFacts.some((fact) => fact.anchorId === anchor.id));
  assert.equal(anchorQuestions.length, 2, `${anchor.id}: facts must be applied across two questions`);
  assert.ok(anchorQuestions.every((question) =>
    question.sourceFacts.filter((fact) => fact.anchorId === anchor.id).length === 2
  ), `${anchor.id}: each application uses two of four anchor facts`);
  assert.equal(new Set(anchorQuestions.flatMap((question) =>
    question.sourceFacts.filter((fact) => fact.anchorId === anchor.id).map((fact) => fact.key)
  )).size, 4, `${anchor.id}: all four facts are split across applications`);
}

for (const fact of extremeSourceFacts) {
  const appearances = bank.QUESTIONS.flatMap((question) => question.sourceFacts)
    .filter((candidate) => candidate.key === fact.key);
  appearances.forEach((appearance) => {
    assert.equal(extremeMatches(appearance.presentedStatement).length, 0, `${fact.key}: neutral presentation`);
    assert.notEqual(appearance.presentedStatement, appearance.statement, `${fact.key}: proposition rewrite`);
    const deletionOnly = cleanText(appearance.statement.replace(extremePattern, ""));
    assert.notEqual(
      cleanText(appearance.presentedStatement),
      deletionOnly,
      `${fact.key}: neutralization must not be a word deletion`
    );
    assert.equal(appearance.truth, false, `${fact.key}: truth is preserved`);
    assert.ok(cleanText(appearance.reason), `${fact.key}: reason is preserved`);
  });
}
const presentedExtremePlacements = bank.QUESTIONS.flatMap((question) => question.sourceFacts)
  .filter((fact) => extremeMatches(fact.presentedStatement).length > 0);
assert.equal(presentedExtremePlacements.length, 0, "presented statements remove the false-only cue");

const caseQuestions = bank.QUESTIONS.filter((question) => question.formatKey === "case");
assert.equal(caseQuestions.length, 34);
assert.equal(
  new Set(caseQuestions.map((question) => question.sourceFacts.map((fact) => fact.key).sort().join("|"))).size,
  34,
  "case source-fact sets must be unique"
);
for (const question of caseQuestions) {
  assert.equal(question.frameRule, "subject-alias-only", `${question.id}: safe case frame`);
  assert.ok(question.sourceQuestionIds.length >= 2, `${question.id}: cross-question case`);
  if (question.sourceTypes.includes("supplement")) {
    assert.ok(
      question.sourceTypes.includes("base") || question.sourceAnchorIds.length >= 2,
      `${question.id}: supplement case must be mixed-source or cross-anchor`
    );
  }
  assert.match(question.text, /甲|乙/, `${question.id}: changed subject frame`);
  assert.doesNotMatch(question.text, corruptedLegalTermPattern, `${question.id}: safe party token replacement`);
  assert.doesNotMatch(
    question.text,
    /(^|[^A-Za-z0-9])[AB](?=$|[^A-Za-z0-9])/,
    `${question.id}: explicit A/B party tokens must be reframed`
  );
  question.sourceFacts.forEach((fact) => {
    const presentedTokens = numericTokens(fact.presentedStatement);
    const statementTokens = numericTokens(fact.statement);
    const supportedTokens = numericTokens(`${fact.context} ${fact.statement}`);
    presentedTokens.forEach((token) => assert.ok(
      supportedTokens.includes(token),
      `${fact.key}: presented number ${token} must be supported by source context or statement`
    ));
    statementTokens.forEach((token) => assert.ok(
      presentedTokens.includes(token),
      `${fact.key}: source number ${token} must remain in the presented statement`
    ));
  });
}

const presentationKeys = ["2026-08-14", "2026-08-15"];
const presentations = presentationKeys.map((key) =>
  bank.QUESTIONS.map((question) => bank.presentQuestion(question, key))
);
presentations.forEach((presentedQuestions, keyIndex) => {
  assert.deepEqual([...answerDistribution(presentedQuestions)].sort((a, b) => a - b), [33, 33, 34, 34]);
  Object.entries(answerDistributionByFormat(presentedQuestions)).forEach(([formatKey, distribution]) => {
    assert.ok(
      Math.max(...distribution) - Math.min(...distribution) <= 1,
      `${presentationKeys[keyIndex]}: ${formatKey} answer positions remain balanced`
    );
  });
  presentedQuestions.forEach((presented, index) => {
    const stable = bank.QUESTIONS[index];
    assert.equal(presented.id, stable.id, `${stable.id}: presented stable ID`);
    assert.equal(presented.masteryId, stable.id, `${stable.id}: presented mastery ID`);
    assert.equal(presented.presentationKey, presentationKeys[keyIndex], `${stable.id}: presentation key`);
    assert.equal(presented.choices[presented.answer], stable.choices[stable.answer], `${stable.id}: rotated answer content`);
    if (stable.formatKey === "single") {
      assert.notStrictEqual(presented.sourceFacts, stable.sourceFacts, `${stable.id}: presented single facts use rotated view`);
      assert.deepEqual(
        presented.sourceFacts.map((fact) => fact.key),
        presented.presentationOrder.map((stableIndex) => stable.sourceFacts[stableIndex].key),
        `${stable.id}: single facts rotate with choices`
      );
    } else {
      assert.strictEqual(presented.sourceFacts, stable.sourceFacts, `${stable.id}: aggregate facts remain stable`);
    }
    if (["combination", "case"].includes(stable.formatKey)) {
      assert.deepEqual(presented.choiceDiagnosticTags[presented.answer], [], `${stable.id}: correct aggregate choice has no misconception tags`);
      presented.choiceDiagnosticTags.forEach((tags, choiceIndex) => {
        if (choiceIndex !== presented.answer) {
          assert.ok(tags.length >= 1, `${stable.id}: wrong aggregate choice has focused tags`);
          assert.ok(tags.length <= stable.diagnosticTags.length, `${stable.id}: focused tags do not exceed question union`);
        }
      });
    }
    assertDeepFrozen(presented.displayModel, `${stable.id}: presented display model`);
    assert.equal(presented.displayModel.items.length, stable.displayModel.items.length, `${stable.id}: presented display items`);
    assert.equal(presented.displayModel.choiceBlocks.length, stable.displayModel.choiceBlocks.length, `${stable.id}: presented display choice blocks`);
    if (stable.formatKey === "single") {
      presented.displayModel.choiceBlocks.forEach((block, presentedIndex) => {
        const stableIndex = presented.presentationOrder[presentedIndex];
        assert.strictEqual(block, stable.displayModel.choiceBlocks[stableIndex], `${stable.id}: choice block rotates with choice`);
        assert.equal(presented.choices[presentedIndex], stable.choices[stableIndex], `${stable.id}: displayed choice rotates with block`);
        assert.equal(block.sourceFactKeys[0], presented.sourceFacts[presentedIndex].key, `${stable.id}: displayed fact rotates with block`);
        assert.equal(block.judgment, presented.sourceFacts[presentedIndex].presentedStatement, `${stable.id}: displayed fact rotates with judgment`);
      });
    }
    assert.deepEqual(bank.diagnosticsForSelection(presented, presented.answer), [], `${stable.id}: presented correct diagnosis`);
    assert.ok(
      bank.diagnosticsForSelection(presented, (presented.answer + 1) % 4).length >= 1,
      `${stable.id}: presented wrong diagnosis`
    );
  });
});
for (let index = 0; index < bank.QUESTIONS.length; index += 1) {
  assert.notEqual(presentations[0][index].answer, presentations[1][index].answer, `${ids[index]}: daily answer rotation`);
  assert.notDeepEqual(presentations[0][index].choices, presentations[1][index].choices, `${ids[index]}: daily choice rotation`);
}

assert.throws(() => bank.presentQuestion("missing-id", "2026-08-14"), /unknown/);
assert.throws(() => bank.presentQuestion(bank.QUESTIONS[0], ""), /invalid/);
assert.throws(() => bank.presentQuestion(bank.QUESTIONS[0], "2026-02-30"), /invalid/);
assert.throws(() => bank.presentQuestion({ id: bank.QUESTIONS[0].id, masteryId: "fake" }, "2026-08-14"), /belong/);
assert.throws(() => bank.diagnosticsForSelection(bank.QUESTIONS[0], -1), /integer/);

console.log(JSON.stringify({
  status: "ok",
  version: bank.VERSION,
  legalBaseline: bank.LEGAL_BASELINE,
  questions: bank.QUESTIONS.length,
  unitTotals: Object.fromEntries(bank.UNITS.map((unit) => [unit.id, unit.questionIds.length])),
  formats: formatCounts(bank.QUESTIONS),
  stableAnswerPositions: answerDistribution(bank.QUESTIONS),
  stableAnswerPositionsByFormat: answerDistributionByFormat(bank.QUESTIONS),
  presentationAnswerPositions: Object.fromEntries(
    presentationKeys.map((key, index) => [key, answerDistribution(presentations[index])])
  ),
  presentationAnswerPositionsByFormat: Object.fromEntries(
    presentationKeys.map((key, index) => [key, answerDistributionByFormat(presentations[index])])
  ),
  baseFactsCovered: new Set(coveredFactKeys.filter((key) => expectedBaseFactKeys.includes(key))).size,
  baseFactsExpected: expectedBaseFactKeys.length,
  supplementFactsCovered: new Set(coveredFactKeys.filter((key) => expectedSupplementFactKeys.includes(key))).size,
  supplementFactsExpected: expectedSupplementFactKeys.length,
  totalFactsCovered: new Set(coveredFactKeys).size,
  totalFactsExpected: expectedFactKeys.length,
  factUseRange: [Math.min(...Object.values(factUsage)), Math.max(...Object.values(factUsage))],
  addedQuestions: {
    total: supplementalQuestions.length,
    formats: formatCounts(supplementalQuestions),
    mixedBaseSupplement: mixedSupplementQuestions.length,
    crossAnchor: crossAnchorQuestions.length,
    supplementPlacements: supplementalQuestions.reduce((total, question) =>
      total + question.sourceFacts.filter((fact) => fact.sourceType === "supplement").length,
    0),
    baseSupportPlacements: supplementalQuestions.reduce((total, question) =>
      total + question.sourceFacts.filter((fact) => fact.sourceType === "base").length,
    0)
  },
  independentCases: caseQuestions.length,
  caseReframeAudit: {
    legalTermSourceOccurrences: bank.QUESTIONS.reduce((total, question) =>
      total + question.sourceFacts.reduce((factTotal, fact) =>
        factTotal + legalTerms.filter((term) => fact.statement.includes(term)).length,
      0),
    0),
    legalTermPreservationFailures: 0,
    corruptedLegalTerms: 0,
    remainingExplicitPartyTokens: 0
  },
  extremeCueAudit: {
    sourceUniqueFacts: extremeSourceFacts.length,
    sourceTruthDistribution: {
      true: extremeSourceFacts.filter((fact) => fact.truth).length,
      false: extremeSourceFacts.filter((fact) => !fact.truth).length
    },
    sourcePlacements: extremeSourcePlacements.length,
    presentedPlacements: presentedExtremePlacements.length,
    learnerFacingOccurrences: bank.QUESTIONS.reduce((total, question) =>
      total + extremeMatches([question.text, ...question.choices].join(" ")).length,
    0)
  },
  diagnosticTags: [...observedDiagnosticTags].sort(),
  supplementFailClosed: { missing: true, invalid: true },
  practicalInvariant: {
    questions: window.TAKKEN_PRACTICAL_VARIATIONS.QUESTIONS.length,
    units: window.TAKKEN_PRACTICAL_VARIATIONS.UNITS.length,
    businessQuestions: window.TAKKEN_PRACTICAL_VARIATIONS.QUESTIONS.filter((question) => question.sectionId === "business").length
  }
}, null, 2));
