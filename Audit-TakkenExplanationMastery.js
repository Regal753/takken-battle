"use strict";

global.window = {};
require("./exam-blueprint.js");
require("./exam-question-core.js");
require("./exam-questions-rights.js");
require("./exam-questions-restrictions.js");
require("./exam-questions-tax-other.js");
require("./exam-questions-business.js");

const questions = Object.values(window.TAKKEN_EXAM_QUESTIONS);
const issues = [];
const labelOnlyPattern =
  /(?:義務|制度|定義|役割|方法|条件|上限|特例|基本形|法定額|重要事項|主要点|法定割合|金銭条件|目的物の特定)[。.]?$/;

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s\u3000、。・「」『』（）()【】［］,.!?！？:：;；○×0-9]/g, "");
}

function reasonOf(value) {
  return String(value || "")
    .replace(/^\s*(?:[ア-ン]|[0-9０-９]+)\s*[○×]\s*/, "")
    .trim();
}

const sectionCounts = {};
let totalReasons = 0;
let shortestReason = null;

questions.forEach((question) => {
  sectionCounts[question.sectionId] = (sectionCounts[question.sectionId] || 0) + 1;
  if (question.qualityVersion !== 2) {
    issues.push(`${question.id}: explanation qualityVersion must be 2`);
  }
  if (!Array.isArray(question.choiceExplanations) || question.choiceExplanations.length !== 4) {
    issues.push(`${question.id}: four choice explanations are required`);
    return;
  }

  question.choiceExplanations.forEach((line, index) => {
    totalReasons += 1;
    const reason = reasonOf(line);
    const length = normalize(reason).length;
    if (!shortestReason || length < shortestReason.length) {
      shortestReason = { id: question.id, index: index + 1, length, reason };
    }
    if (length < 16) {
      issues.push(`${question.id}/${index + 1}: reason is too short (${length})`);
    }
    if (labelOnlyPattern.test(reason) && !/(は|を|が|で|ため|なら|でき|なる|する)/.test(reason)) {
      issues.push(`${question.id}/${index + 1}: reason is only a topic label`);
    }
    if (!/[。.]$/.test(reason)) issues.push(`${question.id}/${index + 1}: reason must be a complete sentence`);
  });

  const explainLength = normalize(question.explain).length;
  const trapLength = normalize(question.trap).length;
  const memoryLength = normalize(question.memoryRule).length;
  if (explainLength < 20) issues.push(`${question.id}: judgment rule is too short (${explainLength})`);
  if (trapLength < 12) issues.push(`${question.id}: misconception boundary is too short (${trapLength})`);
  if (memoryLength < 12) issues.push(`${question.id}: reproduction rule is too short (${memoryLength})`);
  if (normalize(question.explain) === normalize(question.memoryRule)) {
    issues.push(`${question.id}: judgment rule and reproduction rule must do different jobs`);
  }
  if (normalize(question.explain) === normalize(question.trap)) {
    issues.push(`${question.id}: judgment rule and misconception boundary must differ`);
  }
});

if (questions.length !== 124) issues.push(`question count must be 124, got ${questions.length}`);
if (totalReasons !== 496) issues.push(`choice reason count must be 496, got ${totalReasons}`);

const report = {
  status: issues.length ? "ng" : "ok",
  questions: questions.length,
  choiceReasons: totalReasons,
  qualityVersion2: questions.filter((question) => question.qualityVersion === 2).length,
  sectionCounts,
  minimums: {
    choiceReason: 16,
    judgmentRule: 20,
    misconceptionBoundary: 12,
    reproductionRule: 12
  },
  shortestReason,
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
