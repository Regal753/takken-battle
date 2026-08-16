import assert from "node:assert/strict";

const pageUrl = process.argv[2];
const expectedVersion = process.argv[3] || "20260816-pass-hardening-v30-1";
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
    assert.match(html, /id="mockCButton"/, "mock C button missing");
    assert.match(html, /id="passPlanPanel"/, "pass plan panel missing");
    assert.match(html, /id="passReadinessCard"/, "pass readiness card missing");
    assert.match(html, /id="passReadinessStatus"/, "pass readiness status missing");
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
    assert.match(html, /id="todayCommandPracticalButton"/, "practical review launcher missing");
    assert.match(html, /id="practicalDrillChangeButton"/, "practical review condition action missing");
    assert.match(html, /id="practicalDrillExitButton"/, "practical review exit action missing");
    assert.match(html, /id="businessMasteryPanel"/, "business full-score panel missing");
    assert.match(html, /id="businessMasteryPrimary"/, "business full-score primary action missing");
    assert.match(html, /id="businessMasteryFull"/, "business full-score scan action missing");
    assert.match(html, /id="businessKnockPanel"/, "business knock panel missing");
    assert.match(html, /id="businessKnockStart"/, "business knock launcher missing");
    const appReference = html.match(/src="([^"]*app\.js\?v=[^"]+)"/)?.[1] || "";
    const sprintReference = html.match(/src="([^"]*subject-sprint-bank\.js\?v=[^"]+)"/)?.[1] || "";
    const readinessReference = html.match(/src="([^"]*pass-readiness\.js\?v=[^"]+)"/)?.[1] || "";
    const currentYearReference = html.match(/src="([^"]*exam-current-year-2026\.js\?v=[^"]+)"/)?.[1] || "";
    const topicMapReference = html.match(/src="([^"]*official-topic-map\.js\?v=[^"]+)"/)?.[1] || "";
    const storeReference = html.match(/src="([^"]*save-store\.js\?v=[^"]+)"/)?.[1] || "";
    const officialDataReference =
      html.match(/src="([^"]*official-exam-data\.js\?v=[^"]+)"/)?.[1] || "";
    const masteryReference =
      html.match(/src="([^"]*business-mastery\.js\?v=[^"]+)"/)?.[1] || "";
    const knockReference =
      html.match(/src="([^"]*business-knock\.js\?v=[^"]+)"/)?.[1] || "";
    const paceReference =
      html.match(/src="([^"]*business-pace\.js\?v=[^"]+)"/)?.[1] || "";
    const supplementReference =
      html.match(/src="([^"]*business-fullscore-supplement\.js\?v=[^"]+)"/)?.[1] || "";
    const bankReference =
      html.match(/src="([^"]*business-fullscore-bank\.js\?v=[^"]+)"/)?.[1] || "";
    const lawBaselineReference =
      html.match(/src="([^"]*official-law-baseline\.js\?v=[^"]+)"/)?.[1] || "";
    const stateSyncReference =
      html.match(/src="([^"]*state-sync\.js\?v=[^"]+)"/)?.[1] || "";
    const styleReference = html.match(/href="([^"]*styles\.css\?v=[^"]+)"/)?.[1] || "";
    assert.ok(appReference.includes(expectedVersion), `app version missing: ${expectedVersion}`);
    assert.ok(sprintReference.includes(expectedVersion), `subject sprint version missing: ${expectedVersion}`);
    assert.ok(readinessReference.includes(expectedVersion), `pass readiness version missing: ${expectedVersion}`);
    assert.ok(currentYearReference.includes(expectedVersion), `current-year data version missing: ${expectedVersion}`);
    assert.ok(topicMapReference.includes(expectedVersion), `official topic map version missing: ${expectedVersion}`);
    assert.ok(storeReference.includes(expectedVersion), `save store version missing: ${expectedVersion}`);
    assert.ok(
      officialDataReference.includes(expectedVersion),
      `official exam data version missing: ${expectedVersion}`
    );
    assert.ok(masteryReference.includes(expectedVersion), `business mastery version missing: ${expectedVersion}`);
    assert.ok(knockReference.includes(expectedVersion), `business knock version missing: ${expectedVersion}`);
    assert.ok(paceReference.includes(expectedVersion), `business pace version missing: ${expectedVersion}`);
    assert.ok(supplementReference.includes(expectedVersion), `business supplement version missing: ${expectedVersion}`);
    assert.ok(bankReference.includes(expectedVersion), `business full-score bank version missing: ${expectedVersion}`);
    assert.ok(lawBaselineReference.includes(expectedVersion), `official law baseline version missing: ${expectedVersion}`);
    assert.ok(stateSyncReference.includes(expectedVersion), `state sync version missing: ${expectedVersion}`);
    assert.ok(styleReference.includes(expectedVersion), `style version missing: ${expectedVersion}`);
    assert.match(html, /name="takken-runtime" content="public-static"/, "public-static marker missing");
    const fetchAsset = async (reference, label) => {
      const assetResponse = await fetch(new URL(reference, response.url), { cache: "no-store" });
      const code = await assetResponse.text();
      assert.equal(assetResponse.status, 200, `${label} HTTP ${assetResponse.status}`);
      return code;
    };
    // Read sequentially so the post-deploy verifier also remains stable against
    // simple local/static servers with a low concurrent-connection limit.
    const appCode = await fetchAsset(appReference, "app");
    const sprintCode = await fetchAsset(sprintReference, "subject sprint bank");
    const readinessCode = await fetchAsset(readinessReference, "pass readiness");
    const currentYearCode = await fetchAsset(currentYearReference, "current-year data");
    const topicMapCode = await fetchAsset(topicMapReference, "official topic map");
    const storeCode = await fetchAsset(storeReference, "save store");
    const officialDataCode = await fetchAsset(officialDataReference, "official data");
    const masteryCode = await fetchAsset(masteryReference, "business mastery");
    const knockCode = await fetchAsset(knockReference, "business knock");
    const paceCode = await fetchAsset(paceReference, "business pace");
    const supplementCode = await fetchAsset(supplementReference, "business supplement");
    const bankCode = await fetchAsset(bankReference, "business full-score bank");
    const lawBaselineCode = await fetchAsset(lawBaselineReference, "official law baseline");
    const stateSyncCode = await fetchAsset(stateSyncReference, "state sync");
    const styleCode = await fetchAsset(styleReference, "style");
    assert.match(appCode, /const DEFAULT_STUDY_SCOPE = "business"/, "study scope logic missing");
    assert.match(appCode, /const TEXTBOOK_IDS/, "textbook range logic missing");
    assert.match(appCode, /function textbookIdsForSections/, "textbook scope logic missing");
    assert.match(appCode, /function isRetained/, "retention logic missing");
    assert.match(appCode, /以前の100問（解答履歴を保持）/, "legacy question history label missing");
    assert.match(appCode, /問題・履歴を保持　解答済/, "legacy answered progress missing");
    assert.match(appCode, /function renderPassPlan/, "pass plan renderer missing");
    assert.match(appCode, /function renderPassReadinessCard/, "pass readiness renderer missing");
    assert.match(appCode, /TAKKEN_PASS_READINESS/, "pass readiness integration missing");
    assert.match(appCode, /function renderTodayCommand/, "today command renderer missing");
    assert.match(appCode, /function foundationLearningRoute/, "foundation route logic missing");
    assert.match(appCode, /function renderFoundationRoutePanel/, "foundation route renderer missing");
    assert.match(appCode, /function startPracticalDrillForUnit/, "unit practical launcher missing");
    assert.match(appCode, /const STATE_SCHEMA_VERSION = 10/, "save schema v10 missing");
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
    assert.match(masteryCode, /REVIEW_INTERVAL_DAYS/, "business mastery schedule missing");
    assert.match(knockCode, /TAKKEN_BUSINESS_KNOCK/, "business knock API missing");
    assert.match(paceCode, /calculateBusinessPace/, "business pace calculator missing");
    assert.match(supplementCode, /TAKKEN_BUSINESS_FULLSCORE_SUPPLEMENT/, "business supplement API missing");
    assert.match(bankCode, /TAKKEN_BUSINESS_FULLSCORE_BANK/, "business full-score bank API missing");
    assert.match(lawBaselineCode, /assessCurrentLawProof/, "official law baseline guard missing");
    assert.match(stateSyncCode, /reconcileForSave/, "state sync reconciler missing");
    assert.match(sprintCode, /TAKKEN_SUBJECT_SPRINT_BANK/, "subject sprint bank API missing");
    assert.match(readinessCode, /TAKKEN_PASS_READINESS/, "pass readiness API missing");
    assert.match(currentYearCode, /TAKKEN_EXAM_CURRENT_YEAR_2026/, "current-year data API missing");
    assert.match(topicMapCode, /TAKKEN_OFFICIAL_TOPIC_MAP/, "official topic map API missing");
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
