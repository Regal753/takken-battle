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
  "Audit-TakkenQuestionQuality.js",
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

assert.match(index, /name="takken-runtime" content="public-static"/);
assert.match(app, /const PUBLIC_STATIC_MODE/);
assert.match(app, /function publicTodayQuest/);
assert.match(app, /const DEFAULT_STUDY_SCOPE = "business"/);
assert.match(app, /function focusedQuestPlan/);
assert.match(app, /function isRetained/);
assert.match(app, /function legacyProgress/);
assert.match(app, /以前の100問（解答履歴を保持）/);
assert.match(app, /問題・履歴を保持　解答済/);
assert.match(app, /normalizedCorrectDayKeys\(stats\)\.length < 2/);
assert.match(app, /const maxReview = newPool\.length >= 6 \? 4 : DAILY_TARGET/);
assert.match(app, /const CURRICULUM_ORDER/);
assert.match(app, /const RUN_MODE_MOCK = "mock"/);
assert.match(app, /function showMockFinished/);
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
assert.match(index, /id="saveImportInput"/);
assert.match(index, /スマホへ渡す/);
assert.match(index, /id="mockAButton"/);
assert.match(index, /id="mockBButton"/);
assert.match(index, /id="studyScopeSelect"/);
assert.match(index, /① 宅建業法を固める/);
assert.match(index, /② 法令・税その他へ進む/);
assert.match(index, /③ 全分野を混ぜる/);
assert.match(index, /styles\.css\?v=20260726-legacy-history-v6/);
assert.match(index, /app\.js\?v=20260726-legacy-history-v6/);
assert.match(index, /save-transfer\.js/);
assert.doesNotMatch(index, /href="\.\/study-state\//);

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
assert.match(pagesWorkflow, /node Audit-TakkenFullExam\.js/);
assert.match(pagesWorkflow, /node Audit-TakkenQuestionQuality\.js/);
assert.match(pagesWorkflow, /node scripts\/verify-deployed-page\.mjs/);
assert.match(pagesWorkflow, /20260726-legacy-history-v6/);
assert.match(pagesWorkflow, /cp [^\n]*save-transfer\.js[^\n]*_site\//);
assert.match(pagesWorkflow, /cp [^\n]*exam-blueprint\.js[^\n]*_site\//);

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
