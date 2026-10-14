"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const pageUrl = process.argv[2];
const expectedVersion = process.argv[3] || "20261014-reform-reading-7c0d4b13a868";
const chromePath = process.env.TAKKEN_CHROME_PATH || undefined;
const canonicalIndex = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const expectedScriptCount = [...canonicalIndex.matchAll(/<script\b[^>]*\bsrc=/gi)].length;

assert.ok(pageUrl, "usage: node scripts/verify-deployed-browser.cjs <page-url> [expected-version]");
assert.ok(expectedScriptCount > 0, "canonical index has no runtime scripts");

(async () => {
  const browser = await chromium.launch(chromePath
    ? { headless: true, executablePath: chromePath }
    : { headless: true, channel: "chrome" });
  try {
    const context = await browser.newContext({
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      viewport: { width: 390, height: 844 }
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    const url = new URL(pageUrl);
    url.searchParams.set("deploy_browser", `${Date.now()}`);
    await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForFunction(() => Boolean(
      window.TAKKEN_PASS_READINESS?.calculatePassReadiness &&
      window.TAKKEN_BUSINESS_FULLSCORE_BANK?.QUESTIONS?.length === 134 &&
      window.TAKKEN_BUSINESS_HARD_BANK?.QUESTIONS?.length === 180 &&
      window.TAKKEN_RESTRICTIONS_AUTHORED_BANK?.QUESTIONS?.length === 72 &&
      window.TAKKEN_TAX_AUTHORED_BANK?.QUESTIONS?.length === 24 &&
      window.TAKKEN_SUBJECT_SPRINT_BANK?.QUESTIONS?.length === 198 &&
      window.TAKKEN_REFORM_2026_BANK?.QUESTIONS?.length === 40 &&
      window.TAKKEN_REFORM_2026_BANK?.TOPICS?.length === 5 &&
      document.querySelector("#passReadinessCard")
    ));
    await page.waitForFunction(() => navigator.serviceWorker?.ready, null, { timeout: 30000 });

    const inspect = async () => page.evaluate((version) => ({
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      schema: JSON.parse(localStorage.getItem("takken-battle-study-clean-v2-hard") || "null")?.stateSchemaVersion,
      scriptVersions: [...document.scripts]
        .map((script) => script.src)
        .filter(Boolean)
        .map((src) => new URL(src).searchParams.get("v")),
      manifestVersion: new URL(document.querySelector('link[rel="manifest"]')?.href || location.href).searchParams.get("v"),
      controlled: Boolean(navigator.serviceWorker.controller),
      version
    }), expectedVersion);

    const mobile390 = await inspect();
    await page.setViewportSize({ width: 320, height: 800 });
    await page.waitForTimeout(100);
    const mobile320 = await inspect();
    for (const result of [mobile390, mobile320]) {
      assert.equal(result.overflow, 0, "deployed page has horizontal overflow");
      assert.equal(result.schema, 20, "deployed page did not initialize save schema v20");
      assert.equal(result.manifestVersion, expectedVersion, "deployed manifest version mismatch");
      assert.equal(result.scriptVersions.length, expectedScriptCount, "deployed runtime script count mismatch");
      assert.ok(result.scriptVersions.every((version) => version === expectedVersion), "deployed runtime versions are mixed");
    }
    assert.equal(mobile320.controlled, true, "deployed page is not controlled by its service worker after first load");
    const drawer = page.locator("#businessLegacyDrawer");
    assert.equal(await drawer.evaluate((node) => node.open), false, "legacy drawer must start closed");
    assert.equal(await page.locator("#businessMasteryPrimary").isHidden(), true, "old primary entry must stay in drawer");
    await page.locator("#businessKnockFreshStart").click();
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    const readDrill = () => page.evaluate(() => JSON.parse(localStorage.getItem("takken-battle-study-clean-v2-hard")).practicalDrill);
    const fresh = await readDrill();
    assert.equal(fresh.sessionIds.length, 20);
    assert.ok(fresh.sessionIds.every((id) => /^hard(?:54|55)-/.test(id)), "normal entry must use new questions");
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual((await readDrill()).sessionIds, fresh.sessionIds, "published new session must survive reload");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#practicalDrillDiscardButton").click();
    await drawer.locator("summary").click();
    await page.locator("#businessArchiveKnockStart").click();
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    const old = await readDrill();
    assert.equal(old.sessionIds.length, 20);
    assert.ok(old.sessionIds.every((id) => /^bf-business-/.test(id)), "explicit archive must retrieve old questions");
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual((await readDrill()).sessionIds, old.sessionIds, "published archive session must survive reload");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#practicalDrillDiscardButton").click();
    await page.locator("#restrictionAuthoredTwenty").click();
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    const restrictions = await readDrill();
    assert.equal(restrictions.sessionIds.length, 20);
    assert.ok(restrictions.sessionIds.every(id => /^sprint-law-rc58-/.test(id)), "new restriction entry must exclude legacy questions");
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual((await readDrill()).sessionIds, restrictions.sessionIds, "new restriction session must survive reload");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#practicalDrillDiscardButton").click();
    await page.locator("#passPlanPanel").evaluate(node => node.open = true);
    await page.locator("#taxAuthoredTen").click();
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    const tax = await readDrill();
    assert.equal(tax.sessionIds.length, 10);
    assert.ok(tax.sessionIds.every(id => /^sprint-tax-tc59-/.test(id)), "new tax entry must exclude legacy questions");
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual((await readDrill()).sessionIds, tax.sessionIds, "new tax session must survive reload");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#practicalDrillDiscardButton").click();
    await page.locator("#reformPanel details").evaluate(node => { node.open = true; });
    await page.locator("#reformMode").selectOption("all");
    await page.locator("#reformSize").selectOption("20");
    await page.locator("#reformCustomStart").click();
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    const reform = await readDrill();
    assert.equal(reform.bankId, "reform2026");
    assert.equal(reform.sessionIds.length, 20);
    assert.equal(new Set(reform.sessionIds).size, 20);
    const reformTopics = await page.evaluate(ids => new Set(ids.map(id => window.TAKKEN_REFORM_2026_BANK.QUESTIONS_BY_ID[id].unitId)).size, reform.sessionIds);
    assert.equal(reformTopics, 5, "published mixed set must reach all five reform themes");
    const shownAnswer = await page.evaluate(drill => {
      const question = window.TAKKEN_REFORM_2026_BANK.QUESTIONS_BY_ID[drill.queue[drill.position]];
      const order = window.TAKKEN_BUSINESS_MASTERY.choiceOrder(question.id, drill.presentationKey, 4);
      return order.indexOf(question.answer);
    }, reform);
    await page.locator('[data-practical-forecast="confident"]').click();
    await page.locator(".practical-drill-choice").nth(shownAnswer).click();
    await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
    const reformAnswered = await readDrill();
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual(await readDrill(), reformAnswered, "published reform answer and history must survive reload");
    const reformParagraphs = await page.locator("#practicalDrillPrompt.reform-question-prompt > p").allTextContents();
    assert.ok(reformParagraphs.length >= 1 && reformParagraphs.length <= 2 && reformParagraphs.every(text => text.trim()), "published reform question must use short natural paragraphs");
    assert.deepEqual(consoleErrors, [], "deployed page emitted console errors");
    assert.deepEqual(pageErrors, [], "deployed page emitted page errors");
    console.log(JSON.stringify({ status: "ok", expectedVersion, scripts: mobile320.scriptVersions.length, overflow390: mobile390.overflow, overflow320: mobile320.overflow, archiveClosed: true, newAndLegacyReload: true, newRestrictionReload: true, newTaxReload: true, reformQuestions: 40, reformMixedTopics: reformTopics, reformAnswerReload: true, authoredRestrictions: 72, authoredTax: 24, syntheticContextOnly: true, errors: 0 }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
