import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const text = (path) => readFileSync(new URL(path, root), "utf8");
const required = [
  "index.html",
  "styles.css",
  "app.js",
  "practical-question-bank.js",
  "calculation-drill.js",
  "official-exam-data.js",
  "save-store.js",
  "save-transfer.js",
  "reward-system.js",
  "question-bank.js",
  "question-balance.js",
  "exam-blueprint.js",
  "exam-question-core.js",
  "exam-questions-rights.js",
  "exam-questions-restrictions.js",
  "exam-questions-tax-other.js",
  "exam-questions-business.js",
  "Audit-TakkenChapter2Range.js",
  "Audit-TakkenChapter2RangeUi.cjs",
  "Audit-TakkenTextbookRanges.js",
  "Audit-TakkenTextbookRangesUi.cjs",
  "Audit-TakkenQuestionQuality.js",
  "Audit-TakkenUnderstandingDepth.js",
  "Audit-TakkenUnderstandingDepthUi.cjs",
  "Audit-Takken2026Coverage.js",
  "Audit-TakkenPracticalVariations.js",
  "Audit-TakkenPracticalVariationsUi.cjs",
  "Audit-TakkenOfficialDrill.js",
  "Audit-TakkenOfficialExamData.js",
  "Audit-TakkenSaveStore.js",
  "Audit-TakkenCalculationDrill.js",
  "Audit-TakkenLearningArchitecture.js",
  "Audit-TakkenLearningArchitectureUi.cjs",
  "Audit-TakkenChapterModeUi.cjs",
  "Audit-TakkenPassPlanUi.cjs",
  "Audit-TakkenPassLoopV12Ui.cjs",
  "scripts/verify-deployed-page.mjs",
  "README.md",
];

for (const path of required) {
  assert.ok(existsSync(new URL(path, root)), `missing required file: ${path}`);
}

const index = text("index.html");
const app = text("app.js");
const readme = text("README.md");
const pagesWorkflow = text(".github/workflows/pages.yml");
const ciWorkflow = text(".github/workflows/ci.yml");

assert.match(index, /name="takken-runtime" content="public-static"/);
assert.match(app, /const PUBLIC_STATIC_MODE/);
assert.match(app, /function publicTodayQuest/);
assert.match(app, /const DEFAULT_STUDY_SCOPE = "business"/);
assert.match(app, /function focusedQuestPlan/);
assert.match(app, /function isRetained/);
assert.match(app, /function legacyProgress/);
assert.match(app, /以前の100問（解答履歴を保持）/);
assert.match(app, /問題・履歴を保持　解答済/);
assert.match(app, /normalizedComprehensionDayKeys\(stats\)\.length < 2/);
assert.match(app, /const maxReview = newPool\.length >= 6 \? 4 : DAILY_TARGET/);
assert.match(app, /const CURRICULUM_ORDER/);
assert.match(app, /const TEXTBOOK_IDS/);
assert.match(app, /function textbookIdsForSections/);
assert.match(app, /const RUN_MODE_MOCK = "mock"/);
assert.match(app, /const RUN_MODE_CHAPTER = "chapter"/);
assert.match(app, /function showChapterFinished/);
assert.match(app, /function showMockFinished/);
assert.match(app, /function renderPassPlan/);
assert.match(app, /function renderTodayCommand/);
assert.match(app, /function foundationLearningRoute/);
assert.match(app, /function renderFoundationRoutePanel/);
assert.match(app, /function startPracticalDrillForUnit/);
assert.match(app, /const PRACTICAL_SESSION_SIZES = Object\.freeze\(\[4, 10, 20, 45\]\)/);
assert.match(app, /const STATE_SCHEMA_VERSION = 8/);
assert.match(app, /const OFFICIAL_DAILY_DRILL_DEFINITIONS/);
assert.match(app, /2025-balanced-c-v1/);
assert.match(app, /const OFFICIAL_DRILL_EVIDENCE_VERSION = 3/);
assert.match(app, /data-confidence-question/);
assert.match(app, /function officialPracticeStats/);
assert.match(app, /function restorePreviousSave/);
assert.match(app, /function submitOfficialDrill/);
assert.match(app, /function normalizeOfficialDrill/);
assert.match(app, /function saveMissionReview/);
assert.match(app, /function recordOfficialExam/);
assert.match(app, /function normalizeOfficialExamHistory/);
assert.match(app, /const DAILY_STUDY_MINUTES = 90/);
assert.match(app, /正誤・正解肢・解説は50問終了後/);
assert.doesNotMatch(
  app.match(/function publicTodayQuest\(\) \{[\s\S]*?\n  \}/)?.[0] || "",
  /Math\.random|seed|shuffle/i,
);
assert.match(app, /この端末に保存/);
assert.match(app, /consumeSaveTransferHash/);
assert.match(app, /shareSaveTransfer/);
assert.match(index, /id="saveExportButton"/);
assert.match(index, /id="saveShareButton"/);
assert.match(index, /id="saveRestorePreviousButton"/);
assert.match(index, /id="saveProtectionStatus"/);
assert.match(index, /id="saveImportInput"/);
assert.match(index, /スマホへ渡す/);
assert.match(index, /id="mockAButton"/);
assert.match(index, /id="mockBButton"/);
assert.match(index, /id="studyScopeSelect"/);
assert.match(index, /id="passPlanPanel"/);
assert.match(index, /id="todayCommandPanel"/);
assert.match(index, /id="todayReviewInput"/);
assert.match(index, /id="themeDrawer"/);
assert.match(index, /id="progressDrawer"/);
assert.match(index, /id="dailyMissionStatus"/);
assert.match(index, /id="officialExamSessionForm"/);
assert.match(index, /id="officialExamManualForm"/);
assert.match(index, /id="officialExamLawChecked"/);
assert.match(index, /id="officialExamHistory"/);
assert.match(index, /RETIO公式過去問を開く/);
assert.match(index, /id="officialDrillOpenButton"/);
assert.match(index, /id="officialDrillQuestionLink"/);
assert.match(index, /id="officialDrillAnswerGrid"/);
assert.match(index, /id="officialPracticeCoverageStatus"/);
assert.match(index, /id="textbookCoverageStatus"/);
assert.match(index, /id="textbookRetentionStatus"/);
assert.match(index, /全4章・45単元/);
assert.match(index, /id="calculationDrillPanel"/);
assert.match(index, /id="todayCommandCalculationButton"/);
assert.match(index, /id="calculationDrillExitButton"/);
assert.match(index, /id="practicalDrillPanel"/);
assert.match(index, /id="foundationRouteTitle"/);
assert.match(index, /id="foundationRouteContext"/);
assert.match(index, /id="foundationRoutePrimaryButton"/);
assert.match(index, /id="foundationUnitsProgress"/);
assert.match(index, /id="foundationGateStatus"/);
assert.match(index, /分野別の振り返り/);
assert.match(index, /id="todayCommandPracticalButton"/);
assert.match(index, /id="practicalDrillChangeButton"/);
assert.match(index, /id="practicalDrillExitButton"/);
assert.match(index, /公式20問シートを開く/);
assert.match(index, /① 宅建業法を固める/);
assert.match(index, /② 第2分冊・権利関係を固める/);
assert.match(index, /③ 法令・税その他へ進む/);
assert.match(index, /④ 全分野を混ぜる/);
assert.match(index, /styles\.css\?v=20260811-study-route-audit-v22-2/);
assert.match(index, /practical-question-bank\.js\?v=20260811-study-route-audit-v22-2/);
assert.match(index, /calculation-drill\.js\?v=20260811-study-route-audit-v22-2/);
assert.match(index, /app\.js\?v=20260811-study-route-audit-v22-2/);
assert.match(index, /save-store\.js\?v=20260811-study-route-audit-v22-2/);
assert.match(index, /official-exam-data\.js\?v=20260811-study-route-audit-v22-2/);
assert.match(index, /save-transfer\.js/);
assert.doesNotMatch(index, /href="\.\/study-state\//);
assert.doesNotMatch(index, /understanding-system\.js/);
assert.doesNotMatch(app, /TEACHBACK_MIN_LENGTH|submitUnderstandingChoice|updateTeachback/);
assert.match(app, /title\.textContent = "こう解く"/);
assert.match(app, /label: "見る条件"/);
assert.match(app, /label: "使う根拠"/);
assert.match(app, /この問題への当てはめ/);
assert.match(app, /解答・進捗をこの端末へ自動保存済み/);
assert.match(app, /normalizedComprehensionDayKeys/);
assert.match(app, /誤答・根拠なし.*1行化/);
assert.match(app, /reviewNote/);

const localReferencePattern = /\b(?:href|src)="([^"]+)"/g;
for (const [, reference] of index.matchAll(localReferencePattern)) {
  if (!reference || reference.startsWith("#") || /^[a-z]+:/i.test(reference)) {
    continue;
  }
  const localPath = reference.split(/[?#]/, 1)[0];
  assert.ok(
    existsSync(new URL(localPath, root)),
    `missing local href/src target: ${reference}`,
  );
}

assert.match(readme, /市販教材本文・市販問題文・公式過去問本文は転載していません/);
assert.match(readme, /localStorage/);
assert.match(readme, /URLフラグメント/);
assert.match(readme, /スマホへ渡す/);
assert.match(pagesWorkflow, /node Audit-TakkenSaveTransfer\.js/);
assert.match(pagesWorkflow, /node Audit-TakkenSaveStore\.js/);
assert.match(pagesWorkflow, /node Audit-TakkenOfficialDrill\.js/);
assert.match(pagesWorkflow, /node Audit-TakkenOfficialExamData\.js/);
assert.match(pagesWorkflow, /node Audit-TakkenCalculationDrill\.js/);
assert.match(pagesWorkflow, /node Audit-TakkenFullExam\.js/);
assert.match(pagesWorkflow, /node Audit-TakkenChapter2Range\.js/);
assert.match(pagesWorkflow, /node Audit-TakkenTextbookRanges\.js/);
assert.match(pagesWorkflow, /node Audit-TakkenQuestionQuality\.js/);
assert.match(pagesWorkflow, /node Audit-TakkenExplanationMastery\.js/);
assert.match(pagesWorkflow, /node Audit-TakkenUnderstandingDepth\.js/);
assert.match(pagesWorkflow, /node Audit-Takken2026Coverage\.js/);
assert.match(pagesWorkflow, /node Audit-TakkenPracticalVariations\.js/);
assert.match(pagesWorkflow, /node Audit-TakkenLearningArchitecture\.js/);
assert.match(pagesWorkflow, /node scripts\/verify-deployed-page\.mjs/);
assert.match(pagesWorkflow, /20260811-study-route-audit-v22-2/);
assert.doesNotMatch(pagesWorkflow, /cp [^\n]*understanding-system\.js[^\n]*_site\//);
assert.match(pagesWorkflow, /cp [^\n]*calculation-drill\.js[^\n]*_site\//);
assert.match(pagesWorkflow, /cp [^\n]*practical-question-bank\.js[^\n]*_site\//);
assert.match(pagesWorkflow, /cp [^\n]*official-exam-data\.js[^\n]*_site\//);
assert.match(pagesWorkflow, /cp [^\n]*save-store\.js[^\n]*_site\//);
assert.match(pagesWorkflow, /cp [^\n]*save-transfer\.js[^\n]*_site\//);
assert.match(pagesWorkflow, /cp [^\n]*exam-blueprint\.js[^\n]*_site\//);
assert.match(ciWorkflow, /node Audit-TakkenUnderstandingDepth\.js/);
assert.match(ciWorkflow, /node Audit-Takken2026Coverage\.js/);
assert.doesNotMatch(ciWorkflow, /node Audit-TakkenRuleChoiceAmbiguity\.js/);

const forbiddenNames = new Set([
  ".env",
  "study-events.jsonl",
  "codex-weakness-brief.md",
]);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.name === ".git") return [];
    if (entry.isDirectory()) return walk(path);
    return [path];
  });
}

const files = walk(rootPath);
for (const file of files) {
  assert.ok(!forbiddenNames.has(file.split(/[\\/]/).at(-1)), `forbidden file: ${relative(rootPath, file)}`);
}

const assetPattern = /\.\/assets\/[a-z0-9_./-]+\.(?:webp|png|svg)/gi;
const referencedAssets = new Set(
  [index, app, text("styles.css")].flatMap((value) => value.match(assetPattern) ?? []),
);
for (const asset of referencedAssets) {
  assert.ok(existsSync(new URL(asset.slice(2), root)), `missing referenced asset: ${asset}`);
}

const executableTextFiles = files.filter((file) =>
  [".html", ".js", ".css", ".md", ".yml", ".yaml"].includes(extname(file)),
);
for (const file of executableTextFiles) {
  const contents = readFileSync(file, "utf8");
  assert.doesNotMatch(contents, /(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,})/);
}

console.log(
  JSON.stringify({
    status: "ok",
    requiredFiles: required.length,
    referencedAssets: referencedAssets.size,
    scannedTextFiles: executableTextFiles.length,
  }),
);
