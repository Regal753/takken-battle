"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = process.env.TAKKEN_BASE_URL || "http://127.0.0.1:8783/";
const chromePath = process.env.TAKKEN_CHROME_PATH || undefined;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const saveKey = "takken-battle-study-clean-v2-hard";
  const onlineSave = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), saveKey));
  assert.equal(onlineSave.stateSchemaVersion, 10, "application did not initialize its canonical local save");
  await page.waitForFunction(() => navigator.serviceWorker?.ready);
  const precache = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((name) => name.startsWith("takken-battle-")));
    const requests = await cache.keys();
    return requests.map((request) => request.url);
  });
  for (const file of ["app.js", "styles.css", "pwa-runtime.js", "manifest.webmanifest", "study-knight.webp", "grassland-route.webp"]) {
    assert.ok(precache.some((url) => url.includes(file)), `precache missing ${file}`);
  }
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  const result = await page.evaluate(() => ({
    app: typeof window.TAKKEN_PASS_READINESS === "object",
    state: JSON.parse(localStorage.getItem("takken-battle-study-clean-v2-hard") || "null"),
    manifest: Boolean(document.querySelector('link[rel="manifest"]')),
    updateNotice: document.getElementById("pwaUpdateNotice") === null || Boolean(document.querySelector("#pwaUpdateNotice button")),
    imagesLoaded: ["#playerVisual", "#enemyVisual"].every((selector) => {
      const image = document.querySelector(selector);
      return Boolean(image?.complete && image.naturalWidth > 0);
    })
  }));
  result.backgroundLoaded = await page.evaluate(() =>
    fetch("./assets/battle/grassland-route.webp").then((response) => response.ok).catch(() => false)
  );
  assert.equal(result.app, true);
  assert.equal(result.manifest, true);
  assert.equal(result.updateNotice, true);
  assert.equal(result.imagesLoaded, true, "unversioned character images were not served from the offline cache");
  assert.equal(result.backgroundLoaded, true, "unversioned battle background was not served from the offline cache");
  for (const key of ["stateSchemaVersion", "attempts", "correct", "questionStats", "centralMarked", "examProfile"]) {
    assert.deepEqual(result.state?.[key], onlineSave[key], `canonical save field changed across offline reload: ${key}`);
  }
  await browser.close();
  console.log("Audit-TakkenPwaOffline: OK (online precache -> offline reload -> local save retained)");
})().catch((error) => { console.error(error); process.exitCode = 1; });
