import assert from "node:assert/strict";

const pageUrl = process.argv[2];
const expectedVersion = process.argv[3] || "20260802-direct-explain-1";
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
    assert.match(html, /id="todayCommandPanel"/, "today command panel missing");
    assert.match(html, /id="officialDrillOpenButton"/, "official drill launcher missing");
    assert.match(html, /id="officialDrillAnswerGrid"/, "official drill answer grid missing");
    assert.match(html, /id="saveRestorePreviousButton"/, "save restore button missing");
    assert.match(html, /id="officialPracticeCoverageStatus"/, "official practice coverage missing");
    assert.match(html, /id="textbookCoverageStatus"/, "textbook coverage missing");
    assert.match(html, /id="progressDrawer"/, "progress drawer missing");
    assert.match(html, /id="officialExamSessionForm"/, "official exam runner missing");
    assert.match(html, /id="foundationRouteTitle"/, "foundation route title missing");
    assert.match(html, /id="foundationRoutePrimaryButton"/, "foundation route action missing");
    assert.match(html, /id="foundationUnitsProgress"/, "foundation unit progress missing");
    assert.match(html, /id="foundationGateStatus"/, "foundation gate status missing");
    const appReference = html.match(/src="([^"]*app\.js\?v=[^"]+)"/)?.[1] || "";
    const storeReference = html.match(/src="([^"]*save-store\.js\?v=[^"]+)"/)?.[1] || "";
    const officialDataReference =
      html.match(/src="([^"]*official-exam-data\.js\?v=[^"]+)"/)?.[1] || "";
    const styleReference = html.match(/href="([^"]*styles\.css\?v=[^"]+)"/)?.[1] || "";
    assert.ok(appReference.includes(expectedVersion), `app version missing: ${expectedVersion}`);
    assert.ok(storeReference.includes(expectedVersion), `save store version missing: ${expectedVersion}`);
    assert.ok(
      officialDataReference.includes(expectedVersion),
      `official exam data version missing: ${expectedVersion}`
    );
    assert.ok(styleReference.includes(expectedVersion), `style version missing: ${expectedVersion}`);
    assert.match(html, /name="takken-runtime" content="public-static"/, "public-static marker missing");
    const [appResponse, storeResponse, officialDataResponse, styleResponse] = await Promise.all([
      fetch(new URL(appReference, response.url), { cache: "no-store" }),
      fetch(new URL(storeReference, response.url), { cache: "no-store" }),
      fetch(new URL(officialDataReference, response.url), { cache: "no-store" }),
      fetch(new URL(styleReference, response.url), { cache: "no-store" })
    ]);
    const [appCode, storeCode, officialDataCode, styleCode] = await Promise.all([
      appResponse.text(),
      storeResponse.text(),
      officialDataResponse.text(),
      styleResponse.text()
    ]);
    assert.equal(appResponse.status, 200, `app HTTP ${appResponse.status}`);
    assert.equal(storeResponse.status, 200, `save store HTTP ${storeResponse.status}`);
    assert.equal(officialDataResponse.status, 200, `official data HTTP ${officialDataResponse.status}`);
    assert.equal(styleResponse.status, 200, `style HTTP ${styleResponse.status}`);
    assert.match(appCode, /const DEFAULT_STUDY_SCOPE = "business"/, "study scope logic missing");
    assert.match(appCode, /const TEXTBOOK_IDS/, "textbook range logic missing");
    assert.match(appCode, /function textbookIdsForSections/, "textbook scope logic missing");
    assert.match(appCode, /function isRetained/, "retention logic missing");
    assert.match(appCode, /以前の100問（解答履歴を保持）/, "legacy question history label missing");
    assert.match(appCode, /問題・履歴を保持　解答済/, "legacy answered progress missing");
    assert.match(appCode, /function renderPassPlan/, "pass plan renderer missing");
    assert.match(appCode, /function renderTodayCommand/, "today command renderer missing");
    assert.match(appCode, /function foundationLearningRoute/, "foundation route logic missing");
    assert.match(appCode, /function renderFoundationRoutePanel/, "foundation route renderer missing");
    assert.match(appCode, /function startPracticalDrillForUnit/, "unit practical launcher missing");
    assert.match(appCode, /const STATE_SCHEMA_VERSION = 8/, "save schema v8 missing");
    assert.match(appCode, /title\.textContent = "こう解く"/, "direct explanation heading missing");
    assert.match(appCode, /label: "見る条件"/, "direct condition step missing");
    assert.match(appCode, /label: "使う根拠"/, "direct legal basis step missing");
    assert.match(appCode, /解答・進捗をこの端末へ自動保存済み/, "answer autosave receipt missing");
    assert.doesNotMatch(appCode, /TEACHBACK_MIN_LENGTH|submitUnderstandingChoice/, "removed answer gate remains");
    assert.match(appCode, /function submitOfficialDrill/, "official drill scorer missing");
    assert.match(appCode, /2025-balanced-c-v1/, "official drill set C missing");
    assert.match(appCode, /data-confidence-question/, "official evidence gate missing");
    assert.match(appCode, /function restorePreviousSave/, "save restore workflow missing");
    assert.match(appCode, /function normalizeOfficialDrill/, "official drill save normalization missing");
    assert.match(appCode, /function saveMissionReview/, "review note workflow missing");
    assert.match(appCode, /function normalizeOfficialExamHistory/, "official exam ledger logic missing");
    assert.match(officialDataCode, /2021-12/, "December 2021 exam missing");
    assert.match(officialDataCode, /2020-10/, "October 2020 exam missing");
    assert.match(styleCode, /\.study-scope-select/, "study scope style missing");
    assert.match(styleCode, /\.pass-plan-panel/, "pass plan style missing");
    assert.match(styleCode, /\.foundation-route-card/, "foundation route style missing");
    assert.match(storeCode, /function restorePrevious/, "save store restore missing");
    assert.match(storeCode, /before-upgrade-v/, "save upgrade backup missing");
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
