"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const VERSION_TOKEN = "__TAKKEN_RELEASE_VERSION__";
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".svg", ".webmanifest"]);
const VERSION_CONTRACT_FILES = Object.freeze([
  ".github/workflows/pages.yml",
  "Audit-TakkenCalculationDrill.js",
  "Audit-TakkenLearningArchitecture.js",
  "Audit-TakkenPublicPerformance.js",
  "Audit-TakkenPwaUpgrade.cjs",
  "index.html",
  "manifest.webmanifest",
  "pwa-runtime.js",
  "release-integrity.json",
  "scripts/validate-public.mjs",
  "scripts/verify-deployed-browser.cjs",
  "scripts/verify-deployed-page.mjs",
  "service-worker.js"
]);

function toPosix(value) {
  return String(value).replaceAll("\\", "/");
}

function absoluteFor(root, relativePath) {
  const absolute = path.resolve(root, ...relativePath.split("/"));
  assert.ok(
    absolute === root || absolute.startsWith(`${root}${path.sep}`),
    `release asset escapes root: ${relativePath}`
  );
  return absolute;
}

function readReleaseVersion(root = ROOT) {
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  const match = worker.match(/\bconst VERSION = "([^"]+)"/);
  assert.ok(match, "service-worker.js release version is missing");
  return match[1];
}

function localReference(reference) {
  if (!reference || reference.startsWith("#") || /^[a-z]+:/i.test(reference)) return "";
  const clean = decodeURIComponent(reference.split(/[?#]/, 1)[0]).replace(/^\.\//, "");
  return clean && clean !== "." ? toPosix(clean) : "";
}

function walkFiles(root, directory) {
  const absoluteDirectory = absoluteFor(root, directory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const relativePath = `${directory}/${entry.name}`;
      return entry.isDirectory() ? walkFiles(root, relativePath) : [toPosix(relativePath)];
    });
}

function collectReleaseAssetPaths(root = ROOT) {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const references = [...index.matchAll(/\b(?:src|href)="([^"#]+)"/g)]
    .map((match) => localReference(match[1]))
    .filter(Boolean);
  const paths = new Set(["index.html", "service-worker.js", ...references, ...walkFiles(root, "assets")]);
  paths.delete("release-integrity.json");
  const ordered = [...paths].sort();
  for (const relativePath of ordered) {
    const absolute = absoluteFor(root, relativePath);
    assert.ok(fs.existsSync(absolute), `release asset is missing: ${relativePath}`);
    assert.ok(fs.statSync(absolute).isFile(), `release asset is not a file: ${relativePath}`);
  }
  return ordered;
}

function normalizedReleaseBytes(relativePath, bytes, version) {
  assert.ok(version, "release version is required for normalized hashing");
  if (!TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) return Buffer.from(bytes);
  const normalized = Buffer.from(bytes).toString("utf8")
    .replace(/\r\n?/g, "\n")
    .replaceAll(version, VERSION_TOKEN);
  return Buffer.from(normalized, "utf8");
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function buildReleaseIntegrity(root = ROOT, version = readReleaseVersion(root), overrides = {}) {
  const assets = collectReleaseAssetPaths(root).map((relativePath) => {
    const override = Object.prototype.hasOwnProperty.call(overrides, relativePath)
      ? overrides[relativePath]
      : fs.readFileSync(absoluteFor(root, relativePath));
    return {
      path: relativePath,
      sha256: sha256(normalizedReleaseBytes(relativePath, override, version))
    };
  });
  const aggregate = assets.map((asset) => `${asset.path}\0${asset.sha256}\n`).join("");
  return {
    schemaVersion: 1,
    version,
    digest: `sha256:${sha256(Buffer.from(aggregate, "utf8"))}`,
    assetCount: assets.length,
    assets
  };
}

function digestPrefix(digest) {
  const match = String(digest).match(/^sha256:([0-9a-f]{64})$/);
  assert.ok(match, `invalid release digest: ${digest}`);
  return match[1].slice(0, 12);
}

function assertVersionMatchesDigest(version, digest) {
  const match = String(version).match(/-([0-9a-f]{12})$/);
  assert.ok(match, "release version must end with the first 12 content-digest characters");
  assert.equal(match[1], digestPrefix(digest), "release version digest suffix is stale");
}

module.exports = Object.freeze({
  ROOT,
  VERSION_CONTRACT_FILES,
  VERSION_TOKEN,
  assertVersionMatchesDigest,
  buildReleaseIntegrity,
  collectReleaseAssetPaths,
  digestPrefix,
  normalizedReleaseBytes,
  readReleaseVersion,
  sha256
});
