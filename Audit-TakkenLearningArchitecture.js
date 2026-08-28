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

requireText(app, "const STATE_SCHEMA_VERSION = 12;", "save schema must be v12 for guarantee-association history and confidence-order protection");
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
requireText(app, "id: \"chapterNextButton\"", "chapter completion has no next-route action");
requireText(app, "runFoundationRouteAction(chapterNextButton)", "chapter completion bypasses the shared foundation route");
requireText(app, "if (isChapterMode())", "manual chapter navigation branch is missing");
requireText(app, "function startPracticalDrillForUnit", "unit-specific practical session is missing");
requireText(app, "function foundationCoverageComplete", "foundation coverage gate is missing");
requireText(app, "planMode: \"unit\"", "unit plan persistence is missing");
requireText(app, "const FIRST_PASS_DEADLINE_LABEL = \"8/31\";", "first-pass deadline is missing");
requireText(app, "const MIN_INTERNAL_MOCK_ELAPSED_MINUTES = 30;", "implausibly fast mock results are not excluded from stability evidence");
requireText(app, "要再測定（最新が", "stale three-form evidence is not explained to the learner");
requireText(app, "要再確認（両日14日以内）", "stale current-law evidence is not explained to the learner");
requireText(app, "localDateKey(completedAt) === dayKey", "mock evidence does not bind the saved JST day to its completion timestamp");
requireText(app, "examProfileQuestionCount(state.examProfile)", "mock-day progress does not honor the selected 45/50-question profile");
requireText(app, "function startMock(formId)", "internal 50-question diagnostic is missing");
requireText(app, "内部${examProfileSummary()}は診断に使い、RETIO公式未見は保全する。", "profile-aware internal-diagnostic / official-reserve policy is missing");
requireText(app, "!foundationComplete && !businessUnlocked", "official full-exam protection gate is missing");
if (/function startMock\(formId\)[\s\S]{0,900}foundationCoverageComplete\(\)/.test(app)) {
  issues.push("internal 50-question diagnostic must remain available before full foundation coverage");
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
requireText(html, "8/31まで高速一周", "8/31 fast-first-pass copy is missing");
requireText(html, "内部本試験形式は診断として今すぐ利用可", "profile-aware internal diagnostic availability copy is missing");
requireText(html, "20260829-retention-v44-1-1a60cc2b7e90", "pass readiness cache version is missing");
requireText(html, '<details class="quest-card"', "review-10 menu must be collapsed by default");
requireText(html, 'id="nextButton"', "inline next-question button is missing");
requireText(css, ".quest-card:not([open]) > .quest-card-body", "collapsed review menu rule is missing");
requireText(css, "minmax(168px, 55%)", "mobile next-question control is not wide enough");
if (/\#nextButton\s*\{[^}]*display:\s*none/s.test(css)) {
  issues.push("inline next-question button is still hidden");
}
requireText(css, "#passPlanPanel { order: 3; }", "the compact pass plan must follow today's command on mobile");
requireText(css, "#themeDrawer { order: 5; }", "foundation route order is missing");
requireText(css, ".quest-card { order: 6; }", "question workspace order is missing");

const report = {
  status: issues.length ? "error" : "ok",
  stateSchema: 12,
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
