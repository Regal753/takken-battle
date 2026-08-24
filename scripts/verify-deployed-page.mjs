import assert from "node:assert/strict";

const pageUrl = process.argv[2];
const expectedVersion = process.argv[3] || "20260825-quest-core-v36-1";
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
    const appReference = references.find((reference) => /(?:^|\/)app\.js\?/.test(reference));
    const appCode = await fetchAsset(appReference, response.url, "app");
    assert.match(appCode, /const STATE_SCHEMA_VERSION = 10/, "save schema v10 missing");
    assert.match(appCode, /function renderPassReadinessCard/, "readiness renderer missing");
    console.log(JSON.stringify({ status: "ok", pageUrl: response.url, expectedVersion, attempt, references: references.length, htmlLength: html.length }));
    process.exit(0);
  } catch (error) {
    lastFailure = error?.message || String(error);
    if (attempt < attempts) await sleep(intervalMs);
  }
}
throw new Error(`deployed page verification failed after ${attempts} attempts: ${lastFailure}`);
