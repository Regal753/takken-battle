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
require("./practical-question-bank.js");

const root = __dirname;
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
const practical = window.TAKKEN_PRACTICAL_VARIATIONS;
const textbookUnits = Object.values(blueprint.textbookRanges)
  .flatMap((range) => range.chapters);
const textbookIds = [...new Set(textbookUnits.flatMap((unit) => unit.ids))];
const issues = [];

function requireText(source, value, issue) {
  if (!source.includes(value)) issues.push(issue);
}

if (textbookUnits.length !== 45) issues.push(`textbook unit count is ${textbookUnits.length}, expected 45`);
if (textbookIds.length !== 124) issues.push(`textbook question count is ${textbookIds.length}, expected 124`);
if (practical.QUESTIONS.length !== 180) issues.push(`practical question count is ${practical.QUESTIONS.length}, expected 180`);
if (!textbookUnits.every((unit) => practical.QUESTIONS.filter((question) => question.unitId === unit.id).length === 4)) {
  issues.push("every textbook unit must have exactly four practical questions");
}
if (practical.VERSION !== 2) issues.push("practical bank must use save-compatible content version 2");
if (practical.QUESTIONS.filter((question) => question.format === "単一選択").length !== 90 ||
    practical.QUESTIONS.filter((question) => question.format === "組合せ問題").length !== 45 ||
    practical.QUESTIONS.filter((question) => question.format === "個数問題").length !== 45) {
  issues.push("practical bank must mix single-choice, combination, and count formats");
}

requireText(app, "const STATE_SCHEMA_VERSION = 8;", "save schema must be v8");
requireText(app, "const PRACTICAL_SESSION_SIZES = Object.freeze([4, 10, 20, 45]);", "four-question unit session size is missing");
requireText(app, "const FOUNDATION_UNIT_BATCH_MAX = 4;", "read-after batch cap is missing");
requireText(app, "function foundationUnitBatchIds", "bounded read-after batching is missing");
requireText(app, "function unitLearningSnapshot", "integrated unit learning snapshot is missing");
requireText(app, "function foundationLearningRoute", "foundation route selector is missing");
requireText(app, "基礎一周中は同じ単元の実践4/4を通行証にしない", "breadth-first route rule is missing");
requireText(app, "function prepareFoundationUnitPlan", "unit-specific read-after plan is missing");
requireText(app, "const RUN_MODE_CHAPTER = \"chapter\";", "manual chapter run mode is missing");
requireText(app, "function chapterModeChapter", "manual chapter state resolver is missing");
requireText(app, "state.runMode = RUN_MODE_CHAPTER;", "manual chapter selection does not enter chapter mode");
requireText(app, "function showChapterFinished", "manual chapter completion view is missing");
requireText(app, "function showQuizResult", "completion views must preserve the live question DOM");
requireText(app, "resetQuizCardView();", "question rendering does not restore the live question DOM");
requireText(app, "id=\"chapterNextButton\"", "chapter completion has no next-route action");
requireText(app, "runFoundationRouteAction(chapterNextButton)", "chapter completion bypasses the shared foundation route");
requireText(app, "if (isChapterMode())", "manual chapter navigation branch is missing");
requireText(app, "function startPracticalDrillForUnit", "unit-specific practical session is missing");
requireText(app, "function foundationCoverageComplete", "foundation coverage gate is missing");
requireText(app, "if (!foundationCoverageComplete())", "official and mock foundation gates are missing");
requireText(app, "planMode: \"unit\"", "unit plan persistence is missing");
if ((app.match(/if \(!foundationCoverageComplete\(\)\)/g) || []).length < 4) {
  issues.push("official drill, official exam, mock, and route must all enforce the foundation gate");
}
if (app.includes("JULY_GATE_DEADLINE") || html.includes("7/31学習ゲート")) {
  issues.push("expired July gate remains in the learning architecture");
}

[
  "foundationRouteTitle",
  "foundationUnitsProgress",
  "foundationQuestionsProgress",
  "foundationPracticalProgress",
  "foundationRoutePrimaryButton",
  "foundationRoutePracticalButton",
  "foundationGateStatus"
].forEach((id) => requireText(html, `id=\"${id}\"`, `${id} is missing from the page`));
requireText(html, "本文＋読後問題", "foundation-first mission label is missing");
requireText(html, "45単元の読後問題完了で公式演習を解放", "official foundation gate copy is missing");
requireText(html, "20260811-practical-review-ux-v22-1", "practical review cache version is missing");
requireText(html, '<details class="quest-card"', "review-10 menu must be collapsed by default");
requireText(html, 'id="nextButton"', "inline next-question button is missing");
requireText(css, ".quest-card:not([open]) > .quest-card-body", "collapsed review menu rule is missing");
requireText(css, "minmax(168px, 55%)", "mobile next-question control is not wide enough");
if (/\#nextButton\s*\{[^}]*display:\s*none/s.test(css)) {
  issues.push("inline next-question button is still hidden");
}
requireText(css, "#themeDrawer { order: 3; }", "foundation route must precede the question workspace");
requireText(css, ".quest-card { order: 4; }", "question workspace order is missing");
requireText(css, "#passPlanPanel { order: 8; }", "measurement panel must follow foundation and practice lanes");

const report = {
  status: issues.length ? "error" : "ok",
  stateSchema: 8,
  textbookUnits: textbookUnits.length,
  textbookQuestions: textbookIds.length,
  practicalQuestions: practical.QUESTIONS.length,
  practicalFormats: { single: 90, combination: 45, count: 45 },
  practicalPerUnit: 4,
  largestTextbookUnit: Math.max(...textbookUnits.map((unit) => unit.ids.length)),
  readAfterBatchMax: 4,
  routeOrder: ["foundation", "question", "practical", "calculation", "measurement"],
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exitCode = 1;
