"use strict";

global.window = {};
require("./exam-blueprint.js");
require("./exam-question-core.js");
require("./exam-questions-rights.js");
require("./exam-questions-restrictions.js");
require("./exam-questions-tax-other.js");
require("./exam-questions-business.js");
require("./practical-question-bank.js");
require("./question-bank.js");
require("./understanding-system.js");

const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
const questions = window.TAKKEN_EXAM_QUESTIONS;
const practical = window.TAKKEN_PRACTICAL_VARIATIONS;
const practicalById = practical.QUESTIONS_BY_ID;
const system = window.TAKKEN_UNDERSTANDING;
const issues = [];
const textbookIds = [...system.TEXTBOOK_QUESTION_IDS];
const unitByQuestionId = Object.fromEntries(
  Object.values(blueprint.textbookRanges)
    .flatMap((range) => range.chapters)
    .flatMap((unit) => unit.ids.map((id) => [id, unit.id]))
);
const answerPositions = {
  rule: [0, 0, 0, 0],
  transfer: [0, 0, 0, 0]
};
let phases = 0;
let options = 0;
let sameSectionDistractors = 0;
let directTransfers = 0;
const uniqueTransferIds = new Set();

function normalized(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s\u3000、。・「」『』（）()【】［］,.!?！？:：;；○×0-9]/g, "")
    .toLowerCase();
}

function expectedCue(question) {
  const firstLine = String(question.text || question.tag || "宅建の適用場面")
    .split("\n")[0]
    .replace(/\s+/g, " ")
    .trim();
  return firstLine.length > 72 ? `${firstLine.slice(0, 71)}…` : firstLine;
}

if (system.VERSION !== 2) issues.push(`understanding version must be 2, got ${system.VERSION}`);
if (textbookIds.length !== 124) issues.push(`textbook check count must be 124, got ${textbookIds.length}`);
if (new Set(textbookIds).size !== textbookIds.length) issues.push("textbook ids must be unique");

textbookIds.forEach((id) => {
  const question = questions[id];
  const check = system.CHECKS[id];
  if (!question) {
    issues.push(`${id}: source question missing`);
    return;
  }
  if (!check) {
    issues.push(`${id}: understanding check missing`);
    return;
  }
  if (check.version !== system.VERSION) issues.push(`${id}: version mismatch`);
  if (check.unitId !== unitByQuestionId[id]) issues.push(`${id}: textbook unit mismatch`);
  if (normalized(check.teachbackPrompt).length < 20) issues.push(`${id}: teach-back prompt too short`);

  phases += 1;
  const rule = check.rule;
  if (!rule || rule.kind !== "rule") {
    issues.push(`${id}/rule: phase missing`);
  } else if (!Array.isArray(rule.choices) || rule.choices.length !== 4) {
    issues.push(`${id}/rule: four choices required`);
  } else {
    options += rule.choices.length;
    if (!Number.isInteger(rule.answer) || rule.answer < 0 || rule.answer > 3) {
      issues.push(`${id}/rule: invalid answer index`);
    } else {
      answerPositions.rule[rule.answer] += 1;
      const correct = rule.choices[rule.answer];
      if (correct.sourceQuestionId !== id) issues.push(`${id}/rule: correct source id mismatch`);
      if (correct.text !== question.memoryRule) issues.push(`${id}/rule: correct memory rule drift`);
    }
    if (rule.scenario !== expectedCue(question)) issues.push(`${id}/rule: scenario drift`);
    const normalizedChoices = rule.choices.map((choice) => normalized(choice.text));
    if (new Set(normalizedChoices).size !== 4) issues.push(`${id}/rule: duplicate choices`);
    let localPeers = 0;
    rule.choices.forEach((choice, index) => {
      if (normalized(choice.text).length < 10) issues.push(`${id}/rule/${index}: option too short`);
      const source = questions[choice.sourceQuestionId] || window.TAKKEN_QUESTIONS[choice.sourceQuestionId];
      if (!source) {
        issues.push(`${id}/rule/${index}: source question missing`);
        return;
      }
      if (choice.text !== source.memoryRule) issues.push(`${id}/rule/${index}: source memory rule drift`);
      if (index !== rule.answer) {
        if (unitByQuestionId[choice.sourceQuestionId] === unitByQuestionId[id]) {
          issues.push(`${id}/rule/${index}: same-unit rule can create another substantively correct answer`);
        }
        if (source.sectionId === question.sectionId || source.tag === question.tag) {
          localPeers += 1;
        }
      }
    });
    sameSectionDistractors += localPeers;
    const availableLocalPeers = textbookIds.filter((candidateId) => {
      if (candidateId === id || unitByQuestionId[candidateId] === unitByQuestionId[id]) return false;
      const candidate = questions[candidateId];
      return candidate && (candidate.sectionId === question.sectionId || candidate.tag === question.tag);
    }).length;
    if (availableLocalPeers > 0 && localPeers < 1) {
      issues.push(`${id}/rule: needs a same-section distractor`);
    }
  }

  phases += 1;
  const transfer = check.transfer;
  const sourceTransfer = transfer ? practicalById[transfer.sourceQuestionId] : null;
  if (!transfer || transfer.kind !== "transfer") {
    issues.push(`${id}/transfer: phase missing`);
  } else if (!sourceTransfer) {
    issues.push(`${id}/transfer: practical source missing`);
  } else if (!Array.isArray(transfer.choices) || transfer.choices.length !== 4) {
    issues.push(`${id}/transfer: four choices required`);
  } else {
    options += transfer.choices.length;
    uniqueTransferIds.add(sourceTransfer.id);
    if (transfer.direct) directTransfers += 1;
    if (sourceTransfer.unitId !== unitByQuestionId[id]) issues.push(`${id}/transfer: unit mismatch`);
    if (transfer.scenario !== sourceTransfer.text) issues.push(`${id}/transfer: scenario drift`);
    if (transfer.explain !== sourceTransfer.explain) issues.push(`${id}/transfer: explanation drift`);
    if (transfer.trap !== sourceTransfer.trap) issues.push(`${id}/transfer: trap drift`);
    if (transfer.answer !== sourceTransfer.answer) issues.push(`${id}/transfer: answer drift`);
    if (!Number.isInteger(transfer.answer) || transfer.answer < 0 || transfer.answer > 3) {
      issues.push(`${id}/transfer: invalid answer index`);
    } else {
      answerPositions.transfer[transfer.answer] += 1;
    }
    transfer.choices.forEach((choice, index) => {
      if (choice.sourceQuestionId !== sourceTransfer.id) issues.push(`${id}/transfer/${index}: source id drift`);
      if (choice.text !== sourceTransfer.choices[index]) issues.push(`${id}/transfer/${index}: choice drift`);
      if (normalized(choice.text).length < 2) issues.push(`${id}/transfer/${index}: option too short`);
    });
  }
});

if (answerPositions.rule.some((count) => count !== 31)) {
  issues.push(`rule: correct positions must be 31 each, got ${answerPositions.rule.join("/")}`);
}
if (Math.max(...answerPositions.transfer) - Math.min(...answerPositions.transfer) > 8) {
  issues.push(`transfer: correct positions are too imbalanced, got ${answerPositions.transfer.join("/")}`);
}
if (directTransfers < 100) issues.push(`direct transfer coverage is ${directTransfers}, expected at least 100`);
if (uniqueTransferIds.size < 90) issues.push(`unique transfer questions are ${uniqueTransferIds.size}, expected at least 90`);

const b031 = questions.b031;
if (!/宅建業法40条/.test(b031.explain)) issues.push("b031: Article 40 must be explicit");
if (!/通知.*2年以上/.test(b031.explain)) issues.push("b031: notice-period exception must be explicit");
if (!/責任が一律に消える期限ではない/.test(b031.trap)) issues.push("b031: two-year misconception must be corrected");

const report = {
  status: issues.length ? "ng" : "ok",
  version: system.VERSION,
  textbookQuestions: textbookIds.length,
  phases,
  options,
  sameSectionDistractors,
  directTransfers,
  uniqueTransferQuestions: uniqueTransferIds.size,
  answerPositions,
  b031: {
    legalBaseline: b031.legalBaseline,
    explanationChars: b031.explain.length,
    trapChars: b031.trap.length
  },
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
