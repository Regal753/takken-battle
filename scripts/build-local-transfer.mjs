import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const transfer = require("../save-transfer.js");

function argumentsMap(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`invalid argument near: ${key || "(empty)"}`);
    }
    result[key.slice(2)] = value;
  }
  return result;
}

const args = argumentsMap(process.argv.slice(2));
for (const required of ["progress", "events", "resume", "output", "target"]) {
  if (!args[required]) throw new Error(`missing --${required}`);
}

const progress = JSON.parse(readFileSync(resolve(args.progress), "utf8"));
const resume = JSON.parse(readFileSync(resolve(args.resume), "utf8"));
const events = readFileSync(resolve(args.events), "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const latestMistakes = new Map();
for (const event of events) {
  if (event.kind !== "mistake-detail") continue;
  const id = String(event.payload?.id || "");
  if (!progress.perQuestion?.[id]) continue;
  const at = String(event.appAt || event.serverAt || "");
  const previous = latestMistakes.get(id);
  if (!previous || Date.parse(at) >= Date.parse(previous.at)) {
    latestMistakes.set(id, { at, payload: event.payload || {} });
  }
}

for (const [id, detail] of latestMistakes) {
  const stats = progress.perQuestion[id];
  stats.lastMistakeItems = (Array.isArray(detail.payload.items) ? detail.payload.items : [])
    .map((item) => Number(item?.index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index <= 3);
  stats.lastMistakeUnknown = Boolean(detail.payload.unknown);
  stats.lastMistakeCause = String(detail.payload.cause || "");
  stats.lastMistakeNote = String(detail.payload.note || "").slice(0, 160);
  stats.lastMistakeAt = detail.at;
}

const savePackage = {
  format: transfer.PROGRESS_FORMAT,
  version: 1,
  exportedAt: new Date().toISOString(),
  progress,
  resume
};
const token = transfer.encodePackage(savePackage);
const target = new URL(args.target);
target.hash = `save=${token}`;

const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>宅建バトル セーブ移行</title>
  </head>
  <body>
    <p>GitHub版へセーブデータを安全に移しています…</p>
    <script>
      window.location.replace(${JSON.stringify(target.href)});
    </script>
    <noscript>JavaScriptを有効にして、もう一度このページを開いてください。</noscript>
  </body>
</html>
`;

writeFileSync(resolve(args.output), html, "utf8");
console.log(JSON.stringify({
  status: "ok",
  output: resolve(args.output),
  tokenChars: token.length,
  migratedQuestions: Object.keys(progress.perQuestion || {}).length,
  migratedMistakeDetails: latestMistakes.size,
  targetOrigin: target.origin
}));
