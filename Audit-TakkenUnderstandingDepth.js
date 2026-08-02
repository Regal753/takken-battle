"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = {};
require("./exam-blueprint.js");
require("./exam-question-core.js");
require("./exam-questions-rights.js");
require("./exam-questions-restrictions.js");
require("./exam-questions-tax-other.js");
require("./exam-questions-business.js");

const questions = Object.values(window.TAKKEN_EXAM_QUESTIONS || {});
const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const issues = [];

function requireText(source, value, issue) {
  if (!source.includes(value)) issues.push(issue);
}

if (questions.length !== 124) issues.push(`question count must be 124, got ${questions.length}`);
questions.forEach((question) => {
  if (!String(question.explain || "").trim()) issues.push(`${question.id}: direct rule missing`);
  if (!String(question.trap || "").trim()) issues.push(`${question.id}: condition boundary missing`);
  if (!String(question.memoryRule || "").trim()) issues.push(`${question.id}: reusable rule missing`);
  if (!Array.isArray(question.choiceExplanations) || question.choiceExplanations.length !== 4) {
    issues.push(`${question.id}: four choice reasons required`);
  }
});

requireText(app, 'title.textContent = "こう解く";', "direct explanation heading is missing");
requireText(app, 'label: "見る条件"', "condition step is missing");
requireText(app, 'label: "使う根拠"', "legal basis step is missing");
requireText(app, 'label: "この問題への当てはめ"', "application step is missing");
requireText(app, "解答・進捗をこの端末へ自動保存済み", "answer autosave receipt is missing");
requireText(app, 'confidence: isCorrect ? "clear" : "wrong"', "answer confidence persistence is missing");
requireText(app, "lastExplanationAt: state.answered.at", "explanation timestamp is missing");
requireText(html, "解答ごとにこの端末へ自動保存", "autosave header copy is missing");

[
  "TEACHBACK_MIN_LENGTH",
  "data-understanding-kind",
  "転用ミニ問",
  "自分の言葉で再現（15字以上）"
].forEach((forbidden) => {
  if (app.includes(forbidden) || html.includes(forbidden)) {
    issues.push(`removed answer gate remains: ${forbidden}`);
  }
});
if (html.includes("understanding-system.js")) {
  issues.push("unused per-answer transfer system is still loaded by the page");
}

const answerStart = app.indexOf("  function answer(index) {");
const answerEnd = app.indexOf("  function confirmWeakBreak", answerStart);
const answerBody = answerStart >= 0 && answerEnd > answerStart
  ? app.slice(answerStart, answerEnd)
  : "";
if (!answerBody) {
  issues.push("answer function could not be inspected");
} else {
  const statsAt = answerBody.indexOf("state.questionStats[question.id] = nextStats;");
  const saveAt = answerBody.indexOf("saveState();", statsAt);
  const renderAt = answerBody.indexOf("render();", saveAt);
  if (!(statsAt >= 0 && saveAt > statsAt && renderAt > saveAt)) {
    issues.push("answer must persist stats before rendering the explanation");
  }
}

const nextStart = app.indexOf("  function nextQuestion() {");
const nextEnd = app.indexOf("  function setAdvanceBusy", nextStart);
const nextBody = nextStart >= 0 && nextEnd > nextStart ? app.slice(nextStart, nextEnd) : "";
if (/needsUnderstanding|needsTeachback|showMistakeCapture/.test(nextBody)) {
  issues.push("next question is still blocked by a post-answer input gate");
}

const b031 = questions.find((question) => question.id === "b031");
if (!b031) {
  issues.push("b031 is missing");
} else {
  if (!/宅建業法40条/.test(b031.explain)) issues.push("b031: Article 40 must be explicit");
  if (!/通知.*2年以上/.test(b031.explain)) issues.push("b031: notice-period exception must be explicit");
  if (!/責任が一律に消える期限ではない/.test(b031.trap)) {
    issues.push("b031: two-year misconception must be corrected");
  }
}

const report = {
  status: issues.length ? "ng" : "ok",
  questions: questions.length,
  directSteps: ["見る条件", "使う根拠", "この問題への当てはめ"],
  forcedTeachback: false,
  perAnswerTransferQuestion: false,
  autosaveBeforeRender: Boolean(answerBody),
  b031: b031 ? {
    legalBaseline: b031.legalBaseline,
    explanationChars: b031.explain.length,
    trapChars: b031.trap.length
  } : null,
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
