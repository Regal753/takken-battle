"use strict";

const fs = require("fs");
const vm = require("vm");

global.window = {};
require("./question-bank.js");
const balance = require("./question-balance.js");

const appSource = fs.readFileSync("app.js", "utf8");
const orderMatch = appSource.match(/const LEGACY_ORDER = \[([\s\S]*?)\n  \];/);
if (!orderMatch) throw new Error("LEGACY_ORDER not found in app.js");
const order = vm.runInNewContext(`[${orderMatch[1]}]`);
const result = balance.rebalanceQuestions({
  questions: window.TAKKEN_QUESTIONS,
  order
});

const issues = [];
const single = result.audit.formats["単一選択"] || 0;
const count = result.audit.formats["個数問題"] || 0;
const answerSpread = Math.max(...result.audit.answers) - Math.min(...result.audit.answers);
const metaOnlyCombinationReason = /^(?:正しい肢の組合せは[ア-エ・]+|[ア-エ・]+は正しい肢の組合せと一致しない)[。.]?$/;

function explanationReason(line) {
  const match = String(line || "").match(/^\s*(?:[アイウエ]|[1-4])?\s*[○×]\s*(.*)$/);
  return match ? match[1].trim() : "";
}

function statementLines(question) {
  return String(question?.text || "")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.replace(/^\s*[アイウエ]\s*/, "").trim())
    .filter(Boolean);
}
if (single < 50 || single > 60) issues.push(`single-choice ratio out of range: ${single}/${order.length}`);
if (count < 40 || count > 50) issues.push(`count-question ratio out of range: ${count}/${order.length}`);
if (answerSpread > 4) issues.push(`answer position spread too wide: ${result.audit.answers.join("/")}`);

order.forEach((id) => {
  const question = result.questions[id];
  const source = window.TAKKEN_QUESTIONS[id];
  if (!question) {
    issues.push(`missing question: ${id}`);
    return;
  }
  if (question.choices.length !== 4 || question.choiceExplanations.length !== 4) {
    issues.push(`incomplete choices: ${id}`);
  }
  if (!question.choiceExplanations.every((line) => /[○×]/.test(line))) {
    issues.push(`missing verdict marker: ${id}`);
  }
  if (question.answer < 0 || question.answer > 3) {
    issues.push(`invalid answer: ${id}`);
  }
  const sourceVerdicts = source?.choiceExplanations || [];
  const sourceAllTrue = source?.format === "個数問題" &&
    sourceVerdicts.length === 4 &&
    sourceVerdicts.every((line) => /○/.test(line));
  if (sourceAllTrue && question.balanceSourceFormat === "個数問題") {
    issues.push(`all-true count question was converted: ${id}`);
  }
  if (/正しいものの組合せ/.test(question.text) && question.balanceSourceFormat === "個数問題") {
    if (!Array.isArray(question.statementExplanations) || question.statementExplanations.length !== 4) {
      issues.push(`combination question lacks statement verdicts: ${id}`);
    }
    const statementReasons = (question.statementExplanations || []).map(explanationReason);
    if (statementReasons.some((reason) => !reason || metaOnlyCombinationReason.test(reason))) {
      issues.push(`combination question has a non-substantive statement reason: ${id}`);
    }
    const choiceReasons = question.choiceExplanations.map(explanationReason);
    if (choiceReasons.some((reason) => !reason || metaOnlyCombinationReason.test(reason))) {
      issues.push(`combination question has a count-only choice explanation: ${id}`);
    }
  }
  if (question.balanceSourceFormat === "個数問題" && !Array.isArray(question.statementExplanations)) {
    const sourceStatements = statementLines(source);
    const displayOrder = question.choiceOriginIndexes || [];
    const nonIdentity = displayOrder.some((originIndex, index) => originIndex !== index);
    if (nonIdentity) {
      if (!Array.isArray(displayOrder) || displayOrder.length !== 4) {
        issues.push(`reordered count question lacks choice origin indexes: ${id}`);
      } else {
        displayOrder.forEach((originIndex, index) => {
          if (question.choices[index] !== sourceStatements[originIndex]) {
            issues.push(`reordered count question choice mismatch: ${id}/${index + 1}`);
          }
          if (explanationReason(question.choiceExplanations[index]) !== explanationReason(source.choiceExplanations[originIndex])) {
            issues.push(`reordered count question explanation mismatch: ${id}/${index + 1}`);
          }
        });
      }
    }
  }
});

const answerEvent = appSource.match(/logStudyEvent\("answer", \{([\s\S]*?)\n    \}\);/);
if (!answerEvent || !/statementExplanations:\s*question\.statementExplanations\s*\|\|\s*\[\]/.test(answerEvent[1])) {
  issues.push("answer study event drops statement explanations");
}
if (!/function displayedChoiceStatements\(question\)[\s\S]*?question\.balanceSourceFormat === "個数問題"[\s\S]*?return question\.choices\.map/.test(appSource)) {
  issues.push("reordered count questions do not use displayed choices as statement labels");
}
if (!/button\.setAttribute\("aria-pressed", String\(active\.answers\[String\(fact\.index\)\] === item\.value\)\)/.test(appSource)) {
  issues.push("weakness cut-check buttons lack aria-pressed state");
}

if (result.audit.maxFormatRun > 3) issues.push(`first-pass format run too long: ${result.audit.maxFormatRun}`);

const report = {
  ...result.audit,
  answerSpread,
  issues
};
console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
