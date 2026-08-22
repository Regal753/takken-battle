"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const pageUrl = process.argv[2];
const expectedVersion = process.argv[3] || "20260823-mastery-hardening-v34-1";
const chromePath = process.env.TAKKEN_CHROME_PATH || undefined;

assert.ok(pageUrl, "usage: node scripts/verify-deployed-browser.cjs <page-url> [expected-version]");

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
      assert.equal(result.schema, 10, "deployed page did not initialize save schema v10");
      assert.equal(result.manifestVersion, expectedVersion, "deployed manifest version mismatch");
      assert.equal(result.scriptVersions.length, 27, "deployed runtime script count mismatch");
      assert.ok(result.scriptVersions.every((version) => version === expectedVersion), "deployed runtime versions are mixed");
    }
    assert.equal(mobile320.controlled, true, "deployed page is not controlled by its service worker after first load");
    assert.deepEqual(consoleErrors, [], "deployed page emitted console errors");
    assert.deepEqual(pageErrors, [], "deployed page emitted page errors");
    console.log(JSON.stringify({ status: "ok", expectedVersion, scripts: mobile320.scriptVersions.length, overflow390: mobile390.overflow, overflow320: mobile320.overflow, errors: 0 }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
