"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const releaseIntegrityTools = require("./scripts/release-integrity.cjs");
const releaseIntegrity = require("./release-integrity.json");

const ROOT = __dirname;
const EXPECTED_CACHE_VERSION = releaseIntegrity.version;
releaseIntegrityTools.assertVersionMatchesDigest(releaseIntegrity.version, releaseIntegrity.digest);
// v42 adds official unseen-transfer evidence, textbook-unit pacing, and the save lease-race guard.
// Keep less than 0.2% raw-byte headroom above the reviewed shipped bundle.
const MAX_PUBLIC_JS_BYTES = 1_361_500;
const RELEASE_CONTRACT_PATHS = [
  "index.html",
  "pwa-runtime.js",
  "service-worker.js",
  "scripts/validate-public.mjs",
  "scripts/verify-deployed-page.mjs",
  "scripts/verify-deployed-browser.cjs",
  ".github/workflows/pages.yml",
  "release-integrity.json"
];

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const html = read("index.html");

assert.match(html, new RegExp(`manifest\\.webmanifest\\?v=${EXPECTED_CACHE_VERSION}`), "versioned manifest missing");
assert.match(html, new RegExp(`pwa-runtime\\.js\\?v=${EXPECTED_CACHE_VERSION}`), "versioned PWA runtime missing");
assert.match(read("service-worker.js"), new RegExp(`const VERSION = "${EXPECTED_CACHE_VERSION}"`), "service worker version missing");
assert.match(read("service-worker.js"), /self\.clients\.claim\(\)/, "activated update must take control of the current page");
assert.match(read("service-worker.js"), /IMMUTABLE_BY_PATH[\s\S]*requestUrl\.pathname/, "unversioned display assets must resolve to versioned precache entries");
assert.match(read("pwa-runtime.js"), /controllerchange[\s\S]*reloadRequested[\s\S]*window\.location\.reload\(\)/, "explicit update must reload only after controller change");
assert.match(read("pwa-runtime.js"), /TAKKEN_SKIP_WAITING/, "explicit update message missing");
assert.match(read("pwa-runtime.js"), /registration\.waiting\.postMessage\(\{ type: "TAKKEN_SKIP_WAITING" \}\)/, "old runtime must be able to activate the waiting worker without query-version coupling");
assert.doesNotMatch(read("pwa-runtime.js"), /waitingVersion|registration\.waiting\.scriptURL/, "waiting worker activation must not trust a legacy registration query");
assert.match(read("service-worker.js"), /TAKKEN_SKIP_WAITING"\) event\.waitUntil\(self\.skipWaiting\(\)\)/, "waiting worker must finish skipWaiting before the message event settles");
assert.match(read("service-worker.js"), /requestedVersion[\s\S]*requestedVersion !== VERSION[\s\S]*fetch\(event\.request\)/, "mismatched versioned assets must prefer the network");
for (const asset of ["grassland-route.webp", "contract-mimic.webp", "deadline-warden.webp", "law-citadel-boss.webp", "license-sentinel.webp", "notice-gargoyle.webp", "registry-sphinx.webp", "study-knight.webp", "vault-tortoise.webp"]) {
  assert.match(read("service-worker.js"), new RegExp(asset.replace(".", "\\.")), `offline precache missing ${asset}`);
}

const attributeValue = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
};

const hasBooleanAttribute = (tag, name) => new RegExp(`(?:^|\\s)${name}(?:\\s|=|/?>)`, "i").test(tag);

function closingAngleIndex(source, start) {
  let quote = "";
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

function collectStaticScriptTags(source) {
  const lower = source.toLowerCase();
  const result = [];
  let cursor = 0;
  while (cursor < source.length) {
    const index = lower.indexOf("<script", cursor);
    if (index < 0) break;
    const boundary = lower[index + "<script".length] || "";
    if (boundary && !/[\s>]/.test(boundary)) {
      cursor = index + "<script".length;
      continue;
    }
    const openingEnd = closingAngleIndex(source, index);
    assert.ok(openingEnd >= 0, `script tag at ${index} is not closed`);
    const closingStart = lower.indexOf("</script>", openingEnd + 1);
    assert.ok(closingStart >= 0, `script element at ${index} has no exact closing tag`);
    result.push({
      tag: source.slice(index, openingEnd + 1),
      body: source.slice(openingEnd + 1, closingStart),
      index
    });
    cursor = closingStart + "</script>".length;
  }
  return result;
}

const scriptTags = collectStaticScriptTags(html);
const runtimeScripts = scriptTags.filter(({ tag }) => attributeValue(tag, "src") !== null);
const inlineScripts = scriptTags.filter(({ tag }) => attributeValue(tag, "src") === null);

assert.ok(runtimeScripts.length >= 1, "index.html must declare its public runtime scripts");
assert.equal(
  inlineScripts.filter(({ body }) => body.trim()).length,
  0,
  "inline runtime scripts would violate the self-only script policy"
);

const headCloseIndex = html.search(/<\/head\s*>/i);
assert.ok(headCloseIndex >= 0, "index.html must have a closing head tag");

const seenRuntimePaths = new Set();
let totalPublicJsBytes = 0;

for (const script of runtimeScripts) {
  const src = attributeValue(script.tag, "src");
  assert.ok(src, "every runtime script must have a non-empty src");
  assert.ok(script.index < headCloseIndex, `${src}: deferred scripts must be declared in head for early discovery`);
  assert.ok(hasBooleanAttribute(script.tag, "defer"), `${src}: runtime loading must use defer`);
  assert.equal(hasBooleanAttribute(script.tag, "async"), false, `${src}: async would break ordered deferred execution`);

  const parsed = new URL(src, "https://takken.example/");
  assert.equal(parsed.origin, "https://takken.example", `${src}: remote runtime scripts are forbidden`);
  assert.match(src, /^\.\/[A-Za-z0-9._-]+\.js\?/, `${src}: runtime scripts must be local JavaScript assets`);
  assert.equal(parsed.hash, "", `${src}: cache-busted runtime URLs must not use fragments`);
  assert.deepEqual([...parsed.searchParams.keys()], ["v"], `${src}: v must be the only runtime cache parameter`);
  assert.equal(parsed.searchParams.get("v"), EXPECTED_CACHE_VERSION, `${src}: cache version is not unified`);

  const relativePath = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  assert.equal(seenRuntimePaths.has(relativePath), false, `${relativePath}: duplicate runtime script reference`);
  seenRuntimePaths.add(relativePath);

  const absolutePath = path.join(ROOT, relativePath);
  assert.ok(fs.existsSync(absolutePath), `${relativePath}: referenced runtime file is missing`);
  const stat = fs.statSync(absolutePath);
  assert.ok(stat.isFile(), `${relativePath}: referenced runtime asset must be a file`);
  totalPublicJsBytes += stat.size;
}

assert.ok(
  totalPublicJsBytes <= MAX_PUBLIC_JS_BYTES,
  `public JavaScript is ${totalPublicJsBytes.toLocaleString("en-US")} bytes; budget is ${MAX_PUBLIC_JS_BYTES.toLocaleString("en-US")} bytes`
);

const stylesheetTags = [...html.matchAll(/<link\b[^>]*>/gi)]
  .map((match) => match[0])
  .filter((tag) => (attributeValue(tag, "rel") || "").toLowerCase().split(/\s+/).includes("stylesheet"));
assert.ok(stylesheetTags.length >= 1, "index.html must declare its public stylesheet");
for (const tag of stylesheetTags) {
  const href = attributeValue(tag, "href");
  assert.ok(href, "every stylesheet must have a non-empty href");
  const parsed = new URL(href, "https://takken.example/");
  assert.equal(parsed.origin, "https://takken.example", `${href}: remote stylesheets are forbidden`);
  assert.deepEqual([...parsed.searchParams.keys()], ["v"], `${href}: v must be the only stylesheet cache parameter`);
  assert.equal(parsed.searchParams.get("v"), EXPECTED_CACHE_VERSION, `${href}: cache version is not unified`);
}

const cspTags = [...html.matchAll(/<meta\b[^>]*>/gi)]
  .map((match) => match[0])
  .filter((tag) => (attributeValue(tag, "http-equiv") || "").toLowerCase() === "content-security-policy");
assert.equal(cspTags.length, 1, "index.html must define exactly one Content-Security-Policy meta tag");

const cspContent = attributeValue(cspTags[0], "content");
assert.ok(cspContent, "Content-Security-Policy must not be empty");
const csp = new Map();
for (const rawDirective of cspContent.split(";")) {
  const tokens = rawDirective.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) continue;
  const [directive, ...values] = tokens;
  assert.equal(csp.has(directive), false, `CSP directive ${directive} must not be duplicated`);
  csp.set(directive, values);
}

const requireDirectiveValues = (directive, requiredValues) => {
  assert.ok(csp.has(directive), `CSP is missing ${directive}`);
  const actual = csp.get(directive);
  for (const required of requiredValues) {
    assert.ok(actual.includes(required), `CSP ${directive} must include ${required}`);
  }
};

requireDirectiveValues("default-src", ["'self'"]);
requireDirectiveValues("script-src", ["'self'"]);
requireDirectiveValues("style-src", ["'self'", "'unsafe-inline'"]);
requireDirectiveValues("img-src", ["'self'", "data:"]);
requireDirectiveValues("connect-src", ["'self'"]);
requireDirectiveValues("object-src", ["'none'"]);
requireDirectiveValues("base-uri", ["'self'"]);
requireDirectiveValues("form-action", ["'self'"]);
requireDirectiveValues("upgrade-insecure-requests", []);
assert.deepEqual(csp.get("script-src"), ["'self'"], "script-src must remain self-only");
assert.deepEqual(csp.get("object-src"), ["'none'"], "object-src must remain disabled");

const cacheVersionPattern = /\b20\d{6}-[a-z0-9][a-z0-9-]*\b/gi;
for (const relativePath of RELEASE_CONTRACT_PATHS) {
  const source = read(relativePath);
  const versions = [...source.matchAll(cacheVersionPattern)].map((match) => match[0]);
  assert.ok(versions.length >= 1, `${relativePath}: release contract must name the cache version`);
  assert.deepEqual(
    [...new Set(versions)],
    [EXPECTED_CACHE_VERSION],
    `${relativePath}: all release cache contracts must use ${EXPECTED_CACHE_VERSION}`
  );
}

console.log(
  `Audit-TakkenPublicPerformance: OK (${runtimeScripts.length} deferred scripts, ${totalPublicJsBytes.toLocaleString("en-US")} JS bytes)`
);
