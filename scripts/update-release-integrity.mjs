import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const integrity = require("./release-integrity.cjs");
const prefix = String(process.argv[2] || "").trim();
assert.match(prefix, /^20\d{6}-[a-z0-9][a-z0-9-]*[a-z0-9]$/, "usage: node scripts/update-release-integrity.mjs <YYYYMMDD-release-prefix>");
assert.doesNotMatch(prefix, /-[0-9a-f]{12}$/, "pass a human release prefix without a digest suffix");

const oldVersion = integrity.readReleaseVersion();
const before = integrity.buildReleaseIntegrity(integrity.ROOT, oldVersion);
const newVersion = `${prefix}-${integrity.digestPrefix(before.digest)}`;
let replacements = 0;
let contracts = 0;

for (const relativePath of integrity.VERSION_CONTRACT_FILES) {
  const absolutePath = resolve(integrity.ROOT, ...relativePath.split("/"));
  if (!existsSync(absolutePath)) continue;
  const source = readFileSync(absolutePath, "utf8");
  if (source.includes(oldVersion)) contracts += 1;
  const updated = source.replaceAll(oldVersion, newVersion);
  if (updated !== source) {
    writeFileSync(absolutePath, updated, "utf8");
    replacements += 1;
  }
}

assert.ok(contracts >= 10, `release version contract surface is incomplete: ${contracts}`);
const after = integrity.buildReleaseIntegrity(integrity.ROOT, newVersion);
assert.equal(after.digest, before.digest, "normalizing the version must keep the content digest stable");
integrity.assertVersionMatchesDigest(newVersion, after.digest);
writeFileSync(resolve(integrity.ROOT, "release-integrity.json"), `${JSON.stringify(after, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "ok", oldVersion, version: newVersion, digest: after.digest, assets: after.assetCount, contracts, replacements }));
