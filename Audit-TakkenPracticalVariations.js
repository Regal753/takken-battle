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

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return cleanText(value)
    .normalize("NFKC")
    .replace(/[\s\u3000、。・「」『』（）()【】［］,.!?！？:：;；○×0-9]/g, "");
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
  const context = cleanText(String(question.text || "").split(/\r?\n/)[0]);
  return explanations.map((line, index) => ({
    key: `${question.id}:${index}`,
    truth: String(line).includes("○"),
    context,
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
const expectedScopeCounts = { business: 44, rights: 84, restrictions: 28, taxOther: 24 };
const expectedFormatCounts = { "単一選択": 90, "組合せ問題": 45, "個数問題": 45 };
const combinationLabels = new Set([
  "アのみ正しい",
  "イのみ正しい",
  "ア・イとも正しい",
  "ア・イとも誤り"
]);
const countLabels = ["一つ", "二つ", "三つ", "四つ"];

if (!bank || bank.VERSION !== 2) issues.push("practical variation bank version must be 2");
if (Object.keys(baseQuestions).length !== 124) issues.push("base question bank must remain 124 questions");
if (questions.length !== 180) issues.push(`practical question count must be 180, got ${questions.length}`);
if (bank?.UNITS?.length !== 45) issues.push(`practical unit count must be 45, got ${bank?.UNITS?.length}`);
if (new Set(questions.map((question) => question.id)).size !== questions.length) {
  issues.push("practical question IDs must be unique");
}
if (new Set(questions.map((question) =>
  JSON.stringify([question.text, question.choices])
)).size !== questions.length) {
  issues.push("practical question bodies must be unique");
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
Object.entries(expectedFormatCounts).forEach(([format, expected]) => {
  const actual = questions.filter((question) => question.format === format).length;
  if (actual !== expected) issues.push(`${format}: expected ${expected}, got ${actual}`);
});

questions.forEach((question) => {
  const unit = unitById[question.unitId];
  if (!unit) {
    issues.push(`${question.id}: textbook unit is missing`);
    return;
  }
  if (question.qualityVersion !== 3) issues.push(`${question.id}: qualityVersion must be 3`);
  if (!Array.isArray(question.sourceFacts) || question.sourceFacts.length < 2 || question.sourceFacts.length > 4) {
    issues.push(`${question.id}: two to four source facts are required`);
    return;
  }
  if (new Set(question.sourceQuestionIds).size < 2) {
    issues.push(`${question.id}: facts must come from at least two source questions`);
  }
  if (question.sourceQuestionIds.some((id) => !unit.ids.includes(id))) {
    issues.push(`${question.id}: source question escaped its textbook unit`);
  }

  const displayed = cleanText([question.text, ...(question.choices || [])].join(" "));
  question.sourceFacts.forEach((fact) => {
    const base = baseFactByKey[fact.key];
    if (!base) {
      issues.push(`${question.id}: source fact ${fact.key} is missing`);
      return;
    }
    if (base.truth !== fact.truth) issues.push(`${question.id}: ${fact.key} truth changed`);
    if (base.statement !== fact.statement) issues.push(`${question.id}: ${fact.key} statement changed`);
    if (base.reason !== fact.reason) issues.push(`${question.id}: ${fact.key} reason changed`);
    if (normalize(fact.context).length < 4) issues.push(`${question.id}: ${fact.key} context is too short`);
    if (!displayed.includes(cleanText(fact.context)) || !displayed.includes(cleanText(fact.statement))) {
      issues.push(`${question.id}: ${fact.key} is displayed without its source context`);
    }
  });

  if (!Array.isArray(question.choices) || question.choices.length !== 4 ||
      new Set(question.choices).size !== 4 ||
      !Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) {
    issues.push(`${question.id}: four unique choices and one valid answer are required`);
  }
  if (!Array.isArray(question.choiceExplanations) || question.choiceExplanations.length !== 4) {
    issues.push(`${question.id}: four answer-choice reasons are required`);
  } else {
    question.choiceExplanations.forEach((line, index) => {
      const reason = reasonText(line);
      if (normalize(reason).length < 12) issues.push(`${question.id}/${index + 1}: choice reason is too short`);
      if (!/[。.]$/.test(reason)) issues.push(`${question.id}/${index + 1}: choice reason is not a sentence`);
    });
  }

  if (question.format === "単一選択") {
    if (question.sourceFacts.length !== 4 ||
        question.variationKind !== "same-unit-contextual-single-choice") {
      issues.push(`${question.id}: single-choice structure is invalid`);
    } else {
      const wantsTruth = question.text.includes("正しいもの");
      const targetTruth = wantsTruth;
      if (question.sourceFacts[question.answer].truth !== targetTruth ||
          question.sourceFacts.filter((fact) => fact.truth === targetTruth).length !== 1) {
        issues.push(`${question.id}: single-choice answer does not match fact truth`);
      }
    }
  } else if (question.format === "組合せ問題") {
    if (question.sourceFacts.length !== 2 ||
        question.variationKind !== "same-unit-contextual-combination" ||
        question.choices.some((choice) => !combinationLabels.has(choice))) {
      issues.push(`${question.id}: combination structure is invalid`);
    } else {
      const [left, right] = question.sourceFacts;
      const expected = left.truth && right.truth
        ? "ア・イとも正しい"
        : left.truth
          ? "アのみ正しい"
          : right.truth
            ? "イのみ正しい"
            : "ア・イとも誤り";
      if (question.choices[question.answer] !== expected) {
        issues.push(`${question.id}: combination answer does not match source facts`);
      }
    }
  } else if (question.format === "個数問題") {
    const correctCount = question.sourceFacts.filter((fact) => fact.truth).length;
    if (question.sourceFacts.length !== 4 ||
        question.variationKind !== "same-unit-contextual-count" ||
        !countLabels.includes(question.choices[question.answer]) ||
        question.choices[question.answer] !== countLabels[correctCount - 1]) {
      issues.push(`${question.id}: count answer does not match source facts`);
    }
  } else {
    issues.push(`${question.id}: unsupported format ${question.format}`);
  }

  if (normalize(question.explain).length < 20) issues.push(`${question.id}: judgment explanation is too short`);
  if (normalize(question.trap).length < 12) issues.push(`${question.id}: trap boundary is too short`);
  if (normalize(question.memoryRule).length < 12) issues.push(`${question.id}: reproduction rule is too short`);
  if (!question.sourceRef || !Array.isArray(question.sourceUrls) || !question.sourceUrls.length ||
      question.sourceUrls.some((url) => !/^https:\/\//.test(url))) {
    issues.push(`${question.id}: official source locator and https URL are required`);
  }
  if (Object.prototype.hasOwnProperty.call(baseQuestions, question.id)) {
    issues.push(`${question.id}: practical variant leaked into the base bank`);
  }
});

Object.keys(unitById).forEach((unitId) => {
  const unitQuestions = questions.filter((question) => question.unitId === unitId)
    .sort((left, right) => left.variantIndex - right.variantIndex);
  const formats = unitQuestions.map((question) => question.format);
  const answers = unitQuestions.map((question) => question.answer);
  const queueRanks = unitQuestions.map((question) => question.queueRank);
  if (unitQuestions.length !== 4) issues.push(`${unitId}: expected four variants, got ${unitQuestions.length}`);
  if (formats.filter((format) => format === "単一選択").length !== 2 ||
      formats.filter((format) => format === "組合せ問題").length !== 1 ||
      formats.filter((format) => format === "個数問題").length !== 1) {
    issues.push(`${unitId}: required 2/1/1 format mix is missing`);
  }
  if (new Set(answers).size !== 4 || answers.join(",") === "0,1,2,3") {
    issues.push(`${unitId}: answer slots are predictable or not balanced`);
  }
  if (new Set(queueRanks).size !== 4) issues.push(`${unitId}: queue ranks must be unique`);
});

const report = {
  status: issues.length ? "ng" : "ok",
  baseQuestions: Object.keys(baseQuestions).length,
  practicalQuestions: questions.length,
  textbookUnits: bank?.UNITS?.length || 0,
  formats: Object.fromEntries(Object.keys(expectedFormatCounts).map((format) => [
    format,
    questions.filter((question) => question.format === format).length
  ])),
  answerPositions,
  contextualizedFacts: questions.reduce((total, question) => total + question.sourceFacts.length, 0),
  crossQuestionVariants: questions.filter((question) => question.sourceQuestionIds.length >= 2).length,
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
