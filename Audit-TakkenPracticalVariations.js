"use strict";

global.window = {};
require("./exam-blueprint.js");
require("./exam-question-core.js");
require("./exam-questions-rights.js");
require("./exam-questions-restrictions.js");
require("./exam-questions-tax-other.js");
require("./exam-questions-business.js");
require("./practical-question-bank.js");

const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
const baseQuestions = window.TAKKEN_EXAM_QUESTIONS;
const bank = window.TAKKEN_PRACTICAL_VARIATIONS;
const questions = bank?.QUESTIONS || [];
const issues = [];

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s\u3000、。・「」『』（）()【】［］,.!?！？:：;；○×0-9]/g, "");
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function reasonText(line) {
  return cleanText(line).replace(/^\s*(?:[ア-ン]|[0-9０-９]+)\s*[○×]\s*/, "");
}

function sourceFacts(question) {
  const explanations = Array.isArray(question.statementExplanations)
    ? question.statementExplanations
    : question.choiceExplanations;
  const statements = question.format === "個数問題"
    ? String(question.text || "")
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*([アイウエ])\s+(.+)$/))
        .filter(Boolean)
        .map((match) => cleanText(match[2]))
    : question.choices.map(cleanText);
  return explanations.map((line, index) => ({
    key: `${question.id}:${index}`,
    truth: String(line).includes("○"),
    statement: statements[index],
    reason: reasonText(line)
  }));
}

const baseFactByKey = Object.fromEntries(
  Object.values(baseQuestions).flatMap((question) =>
    sourceFacts(question).map((fact) => [fact.key, fact])
  )
);
const unitById = Object.fromEntries(
  Object.values(blueprint.textbookRanges).flatMap((range) =>
    range.chapters.map((unit) => [unit.id, unit])
  )
);
const expectedChoiceLabels = new Set([
  "アのみ正しい",
  "イのみ正しい",
  "ア・イとも正しい",
  "ア・イとも誤り"
]);
const expectedScopeCounts = { business: 44, rights: 84, restrictions: 28, taxOther: 24 };

if (!bank || bank.VERSION !== 1) issues.push("practical variation bank version must be 1");
if (Object.keys(baseQuestions).length !== 124) issues.push("base question bank must remain 124 questions");
if (questions.length !== 180) issues.push(`practical question count must be 180, got ${questions.length}`);
if (bank?.UNITS?.length !== 45) issues.push(`practical unit count must be 45, got ${bank?.UNITS?.length}`);
if (new Set(questions.map((question) => question.id)).size !== questions.length) {
  issues.push("practical question IDs must be unique");
}
if (new Set(questions.map((question) => question.text)).size !== questions.length) {
  issues.push("practical prompts must be unique");
}

const answerPositions = [0, 1, 2, 3].map((answer) =>
  questions.filter((question) => question.answer === answer).length
);
if (answerPositions.some((count) => count !== 45)) {
  issues.push(`answer positions must be exactly balanced, got ${answerPositions.join("/")}`);
}

Object.entries(expectedScopeCounts).forEach(([scopeId, expected]) => {
  const actual = questions.filter((question) => question.scopeId === scopeId).length;
  if (actual !== expected) issues.push(`${scopeId}: expected ${expected} variants, got ${actual}`);
});

const pairKeysByUnit = {};
questions.forEach((question) => {
  const unit = unitById[question.unitId];
  if (!unit) {
    issues.push(`${question.id}: textbook unit is missing`);
    return;
  }
  if (question.variationKind !== "same-unit-two-fact-combination") {
    issues.push(`${question.id}: variation kind is invalid`);
  }
  if (question.qualityVersion !== 2) issues.push(`${question.id}: qualityVersion must be 2`);
  if (!Array.isArray(question.sourceFacts) || question.sourceFacts.length !== 2) {
    issues.push(`${question.id}: exactly two source facts are required`);
    return;
  }
  const sourceQuestionIds = question.sourceFacts.map((fact) => fact.key.split(":")[0]);
  if (new Set(sourceQuestionIds).size !== 2) {
    issues.push(`${question.id}: source facts must come from two different questions`);
  }
  if (sourceQuestionIds.some((id) => !unit.ids.includes(id))) {
    issues.push(`${question.id}: source question escaped its textbook unit`);
  }
  question.sourceFacts.forEach((fact) => {
    const base = baseFactByKey[fact.key];
    if (!base) {
      issues.push(`${question.id}: source fact ${fact.key} is missing`);
      return;
    }
    if (base.truth !== fact.truth) issues.push(`${question.id}: ${fact.key} truth changed`);
    if (base.statement !== fact.statement) issues.push(`${question.id}: ${fact.key} statement changed`);
    if (base.reason !== fact.reason) issues.push(`${question.id}: ${fact.key} reason changed`);
  });

  const pairKey = question.sourceFacts.map((fact) => fact.key).sort().join("|");
  pairKeysByUnit[question.unitId] ||= new Set();
  if (pairKeysByUnit[question.unitId].has(pairKey)) {
    issues.push(`${question.id}: source fact pair is duplicated within the unit`);
  }
  pairKeysByUnit[question.unitId].add(pairKey);

  if (!Array.isArray(question.choices) || question.choices.length !== 4 ||
      question.choices.some((choice) => !expectedChoiceLabels.has(choice)) ||
      new Set(question.choices).size !== 4) {
    issues.push(`${question.id}: four unique combination choices are required`);
  }
  const [left, right] = question.sourceFacts;
  const expectedLabel = left.truth && right.truth
    ? "ア・イとも正しい"
    : left.truth
      ? "アのみ正しい"
      : right.truth
        ? "イのみ正しい"
        : "ア・イとも誤り";
  if (question.choices[question.answer] !== expectedLabel) {
    issues.push(`${question.id}: answer does not match source truth pair`);
  }
  if (!Array.isArray(question.choiceExplanations) || question.choiceExplanations.length !== 4) {
    issues.push(`${question.id}: four answer-choice reasons are required`);
  } else {
    const correctMarkers = question.choiceExplanations.filter((line) => /\s○\s/.test(line));
    if (correctMarkers.length !== 1 || !question.choiceExplanations[question.answer].includes("○")) {
      issues.push(`${question.id}: choice truth markers do not match answer`);
    }
    question.choiceExplanations.forEach((line, index) => {
      const reason = reasonText(line);
      if (normalize(reason).length < 20) issues.push(`${question.id}/${index + 1}: choice reason is too short`);
      if (!/[。.]$/.test(reason)) issues.push(`${question.id}/${index + 1}: choice reason is not a sentence`);
    });
  }
  if (normalize(question.explain).length < 20) issues.push(`${question.id}: judgment explanation is too short`);
  if (normalize(question.trap).length < 12) issues.push(`${question.id}: trap boundary is too short`);
  if (normalize(question.memoryRule).length < 12) issues.push(`${question.id}: reproduction rule is too short`);
  if (!Array.isArray(question.sourceUrls) || !question.sourceUrls.length ||
      question.sourceUrls.some((url) => !/^https:\/\//.test(url))) {
    issues.push(`${question.id}: official https source is required`);
  }
  if (Object.prototype.hasOwnProperty.call(baseQuestions, question.id)) {
    issues.push(`${question.id}: practical variant leaked into the base bank`);
  }
});

Object.keys(unitById).forEach((unitId) => {
  const unitQuestions = questions.filter((question) => question.unitId === unitId);
  if (unitQuestions.length !== 4) issues.push(`${unitId}: expected four variants, got ${unitQuestions.length}`);
  if ((pairKeysByUnit[unitId]?.size || 0) !== 4) issues.push(`${unitId}: four unique fact pairs are required`);
});

const report = {
  status: issues.length ? "ng" : "ok",
  baseQuestions: Object.keys(baseQuestions).length,
  practicalQuestions: questions.length,
  textbookUnits: bank?.UNITS?.length || 0,
  variantsPerUnit: bank?.VARIANTS_PER_UNIT || 0,
  scopeCounts: Object.fromEntries(
    Object.keys(expectedScopeCounts).map((scopeId) => [
      scopeId,
      questions.filter((question) => question.scopeId === scopeId).length
    ])
  ),
  answerPositions,
  sourceFactUses: questions.length * 2,
  uniqueSourceFacts: new Set(questions.flatMap((question) => question.sourceFacts.map((fact) => fact.key))).size,
  crossQuestionPairs: questions.filter((question) => new Set(question.sourceQuestionIds).size === 2).length,
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
