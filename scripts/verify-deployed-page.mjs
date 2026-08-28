import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { extname } from "node:path";

const pageUrl = process.argv[2];
const expectedVersion = process.argv[3] || "20260829-retention-v44-2-3701208f0d3c";
const attempts = Math.max(1, Number(process.env.TAKKEN_DEPLOY_VERIFY_ATTEMPTS) || 12);
const intervalMs = Math.max(0, Number(process.env.TAKKEN_DEPLOY_VERIFY_INTERVAL_MS) || 10000);
assert.ok(pageUrl, "usage: node scripts/verify-deployed-page.mjs <page-url> [expected-version]");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const localReferences = (html) => [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"[^>]*>/gi)]
  .map((match) => match[1])
  .filter((reference) => reference && !/^[a-z]+:/i.test(reference) && !reference.startsWith("#"));
const fetchAsset = async (reference, base, label) => {
  const response = await fetch(new URL(reference, base), { cache: "no-store" });
  assert.equal(response.status, 200, `${label} HTTP ${response.status}`);
  return response.text();
};
const fetchBytes = async (reference, base, label) => {
  const response = await fetch(new URL(reference, base), { cache: "no-store" });
  assert.equal(response.status, 200, `${label} HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};
const textExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".webmanifest"]);
const normalizedAssetBytes = (relativePath, bytes) => {
  if (!textExtensions.has(extname(relativePath).toLowerCase())) return bytes;
  return Buffer.from(bytes.toString("utf8").replace(/\r\n?/g, "\n").replaceAll(expectedVersion, "__TAKKEN_RELEASE_VERSION__"), "utf8");
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

let lastFailure = "";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const url = new URL(pageUrl);
    url.searchParams.set("deploy_verify", `${Date.now()}-${attempt}`);
    const response = await fetch(url, { redirect: "follow", headers: { "cache-control": "no-cache", "user-agent": "takken-battle-deploy-verifier" } });
    const html = await response.text();
    assert.equal(response.status, 200, `HTTP ${response.status}`);
    for (const id of ["mockAButton", "mockBButton", "mockCButton", "passPlanPanel", "passReadinessCard", "todayCommandPanel", "officialDrillOpenButton", "saveRestorePreviousButton", "businessMasteryPanel", "businessKnockPanel"]) {
      assert.match(html, new RegExp(`id="${id}"`), `${id} missing`);
    }
    assert.match(html, /name="takken-runtime" content="public-static"/, "public-static marker missing");
    assert.ok(html.includes(`manifest.webmanifest?v=${expectedVersion}`), "versioned manifest missing");
    assert.ok(html.includes(`pwa-runtime.js?v=${expectedVersion}`), "versioned PWA runtime missing");
    const references = [...new Set(localReferences(html))];
    assert.ok(references.length >= 30, "runtime references unexpectedly incomplete");
    for (const reference of references) {
      const referenceUrl = new URL(reference, response.url);
      assert.equal(referenceUrl.searchParams.get("v"), expectedVersion, `stale or unversioned runtime reference: ${reference}`);
      await fetchAsset(reference, response.url, reference);
    }
    const manifestReference = references.find((reference) => /manifest\.webmanifest\?/.test(reference));
    assert.ok(manifestReference, "manifest reference missing");
    const manifest = JSON.parse(await fetchAsset(manifestReference, response.url, "manifest"));
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, "manifest icons missing");
    for (const icon of manifest.icons) {
      const iconUrl = new URL(icon.src, new URL(manifestReference, response.url));
      assert.equal(iconUrl.searchParams.get("v"), expectedVersion, `stale manifest icon: ${icon.src}`);
      await fetchAsset(icon.src, new URL(manifestReference, response.url), `manifest icon ${icon.src}`);
    }
    const serviceWorker = await fetchAsset(`service-worker.js?v=${expectedVersion}`, response.url, "service worker");
    assert.ok(serviceWorker.includes(`const VERSION = "${expectedVersion}"`), "service worker version missing");
    for (const reference of references) {
      const pathname = new URL(reference, response.url).pathname.split("/").pop();
      assert.match(serviceWorker, new RegExp(pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `service worker does not precache ${reference}`);
    }
    const integrity = JSON.parse(await fetchAsset(`release-integrity.json?v=${expectedVersion}`, response.url, "release integrity"));
    assert.equal(integrity.version, expectedVersion, "deployed release-integrity version mismatch");
    assert.match(integrity.digest, /^sha256:[0-9a-f]{64}$/, "deployed release-integrity digest is invalid");
    assert.equal(expectedVersion.slice(-12), integrity.digest.slice(7, 19), "deployed release version digest suffix is stale");
    assert.equal(integrity.assetCount, integrity.assets.length, "deployed release-integrity asset count mismatch");
    for (const asset of integrity.assets) {
      const bytes = await fetchBytes(`${asset.path}?v=${expectedVersion}`, response.url, `integrity asset ${asset.path}`);
      assert.equal(sha256(normalizedAssetBytes(asset.path, bytes)), asset.sha256, `deployed asset digest mismatch: ${asset.path}`);
    }
    const aggregate = integrity.assets.map((asset) => `${asset.path}\0${asset.sha256}\n`).join("");
    assert.equal(`sha256:${sha256(Buffer.from(aggregate, "utf8"))}`, integrity.digest, "deployed aggregate release digest mismatch");
    const appReference = references.find((reference) => /(?:^|\/)app\.js\?/.test(reference));
    const appCode = await fetchAsset(appReference, response.url, "app");
    assert.match(appCode, /const STATE_SCHEMA_VERSION = 12/, "save schema v12 missing");
    assert.match(appCode, /function renderPassReadinessCard/, "readiness renderer missing");
    console.log(JSON.stringify({ status: "ok", pageUrl: response.url, expectedVersion, attempt, references: references.length, htmlLength: html.length }));
    process.exit(0);
  } catch (error) {
    lastFailure = error?.message || String(error);
    if (attempt < attempts) await sleep(intervalMs);
  }
}
throw new Error(`deployed page verification failed after ${attempts} attempts: ${lastFailure}`);
