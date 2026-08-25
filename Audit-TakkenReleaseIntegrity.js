"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const integrity = require("./scripts/release-integrity.cjs");

const manifestSource = fs.readFileSync(path.join(__dirname, "release-integrity.json"), "utf8").replace(/\r\n?/g, "\n");
const manifest = JSON.parse(manifestSource);
const currentVersion = integrity.readReleaseVersion(__dirname);
assert.equal(manifest.version, currentVersion, "release-integrity version must match the service worker");
integrity.assertVersionMatchesDigest(manifest.version, manifest.digest);

const computed = integrity.buildReleaseIntegrity(__dirname, manifest.version);
assert.deepEqual(manifest, computed, "public asset content changed without regenerating the release version and integrity manifest");
assert.equal(manifestSource, `${JSON.stringify(computed, null, 2)}\n`, "release-integrity.json must use canonical bytes so metadata-only changes cannot bypass the release version");

const appPath = path.join(__dirname, "app.js");
const mutated = integrity.buildReleaseIntegrity(__dirname, manifest.version, {
  "app.js": Buffer.concat([fs.readFileSync(appPath), Buffer.from("\n/* release-integrity mutation fixture */\n")])
});
assert.notEqual(mutated.digest, manifest.digest, "asset mutation fixture must change the release digest");
assert.notEqual(
  integrity.digestPrefix(mutated.digest),
  manifest.version.slice(-12),
  "an asset mutation under the same version must be rejected before deploy"
);

console.log(JSON.stringify({
  status: "ok",
  version: manifest.version,
  digest: manifest.digest,
  assets: manifest.assetCount,
  unchangedVersionMutationRejected: true
}));
