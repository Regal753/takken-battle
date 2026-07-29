import assert from "node:assert/strict";

const pageUrl = process.argv[2];
const expectedVersion = process.argv[3] || "20260729-comprehension-v8";
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
    assert.match(html, /id="passPlanPanel"/, "pass plan panel missing");
    assert.match(html, /id="officialExamForm"/, "official exam ledger missing");
    const appReference = html.match(/src="([^"]*app\.js\?v=[^"]+)"/)?.[1] || "";
    const styleReference = html.match(/href="([^"]*styles\.css\?v=[^"]+)"/)?.[1] || "";
    assert.ok(appReference.includes(expectedVersion), `app version missing: ${expectedVersion}`);
    assert.ok(styleReference.includes(expectedVersion), `style version missing: ${expectedVersion}`);
    assert.match(html, /name="takken-runtime" content="public-static"/, "public-static marker missing");
    const [appResponse, styleResponse] = await Promise.all([
      fetch(new URL(appReference, response.url), { cache: "no-store" }),
      fetch(new URL(styleReference, response.url), { cache: "no-store" })
    ]);
    const [appCode, styleCode] = await Promise.all([
      appResponse.text(),
      styleResponse.text()
    ]);
    assert.equal(appResponse.status, 200, `app HTTP ${appResponse.status}`);
    assert.equal(styleResponse.status, 200, `style HTTP ${styleResponse.status}`);
    assert.match(appCode, /const DEFAULT_STUDY_SCOPE = "business"/, "study scope logic missing");
    assert.match(appCode, /function isRetained/, "retention logic missing");
    assert.match(appCode, /以前の100問（解答履歴を保持）/, "legacy question history label missing");
    assert.match(appCode, /問題・履歴を保持　解答済/, "legacy answered progress missing");
    assert.match(appCode, /function renderPassPlan/, "pass plan renderer missing");
    assert.match(appCode, /function normalizeOfficialExamHistory/, "official exam ledger logic missing");
    assert.match(styleCode, /\.study-scope-select/, "study scope style missing");
    assert.match(styleCode, /\.pass-plan-panel/, "pass plan style missing");
    console.log(JSON.stringify({
      status: "ok",
      pageUrl: response.url,
      expectedVersion,
      attempt,
      htmlLength: html.length,
      appLength: appCode.length,
      styleLength: styleCode.length
    }));
    process.exit(0);
  } catch (error) {
    lastFailure = error?.message || String(error);
    if (attempt < attempts) await sleep(intervalMs);
  }
}

throw new Error(`deployed page verification failed after ${attempts} attempts: ${lastFailure}`);
