"use strict";

const fs = require("fs");
const vm = require("vm");

global.window = {};
require("./question-bank.js");
const balance = require("./question-balance.js");

const appSource = fs.readFileSync("app.js", "utf8");
const orderMatch = appSource.match(/const ORDER = \[([\s\S]*?)\n  \];/);
if (!orderMatch) throw new Error("ORDER not found in app.js");
const order = vm.runInNewContext(`[${orderMatch[1]}]`);
const result = balance.rebalanceQuestions({
  questions: window.TAKKEN_QUESTIONS,
  order
});

const issues = [];
const single = result.audit.formats["単一選択"] || 0;
const count = result.audit.formats["個数問題"] || 0;
const answerSpread = Math.max(...result.audit.answers) - Math.min(...result.audit.answers);
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
  }
});

if (result.audit.maxFormatRun > 3) issues.push(`first-pass format run too long: ${result.audit.maxFormatRun}`);

const report = {
  ...result.audit,
  answerSpread,
  issues
};
console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
