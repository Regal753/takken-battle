import assert from "node:assert/strict";

const pageUrl = process.argv[2];
const expectedVersion = process.argv[3] || "20260726-mastery-v3";
const attempts = Math.max(1, Number(process.env.TAKKEN_DEPLOY_VERIFY_ATTEMPTS) || 12);
const intervalMs = Math.max(0, Number(process.env.TAKKEN_DEPLOY_VERIFY_INTERVAL_MS) || 10000);

assert.ok(pageUrl, "usage: node scripts/verify-deployed-page.mjs <page-url> [expected-version]");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastFailure = "";

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const url = new URL(pageUrl);
    url.searchParams.set("deploy_verify", `${Date.now()}-${attempt}`);
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "cache-control": "no-cache",
        "user-agent": "takken-battle-deploy-verifier"
      }
    });
    const html = await response.text();
    assert.equal(response.status, 200, `HTTP ${response.status}`);
    assert.match(html, /id="mockAButton"/, "mock A button missing");
    assert.match(html, /id="mockBButton"/, "mock B button missing");
    assert.ok(html.includes(expectedVersion), `version missing: ${expectedVersion}`);
    assert.match(html, /name="takken-runtime" content="public-static"/, "public-static marker missing");
    console.log(JSON.stringify({
      status: "ok",
      pageUrl: response.url,
      expectedVersion,
      attempt,
      htmlLength: html.length
    }));
    process.exit(0);
  } catch (error) {
    lastFailure = error?.message || String(error);
    if (attempt < attempts) await sleep(intervalMs);
  }
}

throw new Error(`deployed page verification failed after ${attempts} attempts: ${lastFailure}`);
