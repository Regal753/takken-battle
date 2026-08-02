"use strict";

global.window = {};
require("./exam-blueprint.js");
require("./exam-question-core.js");
require("./exam-questions-rights.js");
require("./exam-questions-restrictions.js");
require("./exam-questions-tax-other.js");
require("./exam-questions-business.js");

const questions = Object.values(window.TAKKEN_EXAM_QUESTIONS || {});
const amendment = window.TAKKEN_EXAM_QUESTIONS?.b040;
const issues = [];
const requiredTerms = [
  "管理業者管理者方式",
  "標識の大きさ",
  "森林経営管理法",
  "森林法",
  "港湾法"
];

if (questions.length !== 124) issues.push(`expected 124 base questions, got ${questions.length}`);
questions.forEach((question) => {
  if (!String(question.sourceLocator || "").trim()) {
    issues.push(`${question.id}: source locator is missing`);
  }
});

if (!amendment) {
  issues.push("b040: 2026 amendment checkpoint is missing");
} else {
  const body = JSON.stringify(amendment);
  requiredTerms.forEach((term) => {
    if (!body.includes(term)) issues.push(`b040: ${term} is missing`);
  });
  if (amendment.legalBaseline !== "2026-04-01") issues.push("b040: legal baseline mismatch");
  if (amendment.verifiedAt !== "2026-08-02") issues.push("b040: verification date mismatch");
  if (amendment.sourceUrl !== "https://www.mlit.go.jp/totikensangyo/const/1_6_bt_000268.html") {
    issues.push("b040: official MLIT amendment source mismatch");
  }
  if (!String(amendment.sourceLocator).includes("施行令3条")) {
    issues.push("b040: article-level source locator is missing");
  }
}

const report = {
  status: issues.length ? "ng" : "ok",
  questions: questions.length,
  sourceLocators: questions.filter((question) => question.sourceLocator).length,
  amendmentTerms: requiredTerms.filter((term) => JSON.stringify(amendment || {}).includes(term)),
  legalBaseline: amendment?.legalBaseline || "",
  officialSource: amendment?.sourceUrl || "",
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
