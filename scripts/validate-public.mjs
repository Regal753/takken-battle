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
  "reward-system.js",
  "question-bank.js",
  "question-balance.js",
  "README.md",
];

for (const path of required) {
  assert.ok(existsSync(new URL(path, root)), `missing required file: ${path}`);
}

const index = text("index.html");
const app = text("app.js");
const readme = text("README.md");

assert.match(index, /name="takken-runtime" content="public-static"/);
assert.match(app, /const PUBLIC_STATIC_MODE/);
assert.match(app, /function publicTodayQuest/);
assert.match(app, /この端末に保存/);
assert.match(readme, /市販教材本文・市販問題文・公式過去問本文は転載していません/);
assert.match(readme, /localStorage/);

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
