#!/usr/bin/env node
"use strict";

// Regression: an already-open older runtime must be able to activate a newly
// fetched worker without changing the learner's canonical local save.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const { execFileSync } = require("node:child_process");

const ROOT = process.cwd();
const CURRENT_VERSION = "20261004-vocabulary-cards-7456ead81208";
const OLD_VERSION = "20260822-controlled-old-runtime";
const SAVE_KEY = "takken-battle-study-clean-v2-hard";
const SENTINEL_KEY = "takken-pwa-upgrade-sentinel";
const chromePath = process.env.TAKKEN_CHROME_PATH || undefined;
const autoReconnect = process.argv.includes("--auto-reconnect");
const multiTab = process.argv.includes("--multi-tab");
const saveFailure = process.argv.includes("--save-failure");
const legacyRef = process.env.TAKKEN_PWA_LEGACY_REF || "";
if (legacyRef) assert.match(legacyRef, /^[0-9a-f]{7,40}$/);
const legacyRuntime = legacyRef
  ? execFileSync("git", ["show", `${legacyRef}:pwa-runtime.js`], { encoding: "utf8" })
      .replace(/const VERSION = "[^"]+";/, `const VERSION = "${OLD_VERSION}";`)
  : null;

function startVersionedServer(root) {
  let release = "old";
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
    ".webp": "image/webp"
  };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const safeRoot = path.resolve(root);
    const target = path.resolve(safeRoot, relative);
    if (!target.startsWith(`${safeRoot}${path.sep}`) && target !== path.join(safeRoot, "index.html")) {
      response.writeHead(403); response.end("forbidden"); return;
    }
    fs.readFile(target, (error, body) => {
      if (error) { response.writeHead(404); response.end("not found"); return; }
      if (release === "old" && relative === "pwa-runtime.js" && legacyRuntime) {
        body = Buffer.from(legacyRuntime, "utf8");
      } else if (release === "old" && (relative === "pwa-runtime.js" || relative === "service-worker.js")) {
        body = Buffer.from(body.toString("utf8").replaceAll(CURRENT_VERSION, OLD_VERSION), "utf8");
      }
      response.writeHead(200, {
        "content-type": types[path.extname(target)] || "application/octet-stream",
        "cache-control": "no-store"
      });
      response.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({
      baseUrl: `http://127.0.0.1:${server.address().port}/`,
      release: (next) => { release = next; },
      close: () => new Promise((done) => server.close(done))
    }));
  });
}

async function waitForController(page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 15000 });
}

async function cacheNames(page) {
  return page.evaluate(() => caches.keys());
}

(async () => {
  const server = await startVersionedServer(ROOT);
  const browser = await chromium.launch(chromePath
    ? { headless: true, executablePath: chromePath }
    : { headless: true, channel: "chrome" });
  const context = await browser.newContext(autoReconnect || saveFailure ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  const page = await context.newPage();
  try {
    if (autoReconnect) await page.clock.install();
    await page.goto(server.baseUrl, { waitUntil: "networkidle", timeout: 20000 });
    await waitForController(page);
    // Reload once so the original runtime is definitely controlled by its old SW.
    await page.reload({ waitUntil: "networkidle", timeout: 20000 });
    await waitForController(page);

    const fixture = await page.evaluate(({ saveKey, sentinelKey }) => {
      const state = JSON.parse(localStorage.getItem(saveKey) || "{}");
      const bank = window.TAKKEN_BUSINESS_FULLSCORE_BANK;
      const question = bank.QUESTIONS[0];
      const presentationKey = "2026-08-23:pwa-upgrade";
      const presented = bank.presentQuestion(question, presentationKey);
      const answeredAt = "2026-08-23T04:00:00+09:00";
      state.practicalDrill = {
        ...state.practicalDrill,
        bankId: "business-fullscore",
        bankVersion: bank.VERSION,
        presentationKey,
        stage: "active",
        scope: "business",
        unitId: question.unitId,
        sessionSize: 1,
        sessionIds: [question.id],
        queue: [question.id],
        position: 0,
        currentAttempt: {
          id: question.id,
          selected: presented.answer,
          correct: true,
          confidence: "confident",
          masteryRecorded: true,
          diagnosticRecorded: true
        },
        retryIds: [],
        history: {
          ...(state.practicalDrill?.history || {}),
          [question.id]: {
            attempts: 1, correct: 1, wrong: 0, uncertain: 0,
            lastSelected: presented.answer, lastCorrect: true,
            lastConfidence: "confident", lastAnsweredAt: answeredAt,
            reviewLevel: 1, masteryDueKey: "2026-08-24",
            confidentDayKeys: ["2026-08-23"], mistakeTags: {}, lastMistakeTags: []
          }
        }
      };
      state.pwaUpgradeSentinel = { text: "更新前の学習記録", nested: [1, { keep: true }] };
      const raw = JSON.stringify(state);
      const sentinel = "exact-sentinel: PWA update must not rewrite this value";
      localStorage.setItem(saveKey, raw);
      localStorage.setItem(sentinelKey, sentinel);
      return { sentinel };
    }, { saveKey: SAVE_KEY, sentinelKey: SENTINEL_KEY });

    // Normalize through the *old* runtime first. The assertion below then
    // isolates SW activation/reload from ordinary app startup normalization.
    await page.reload({ waitUntil: "networkidle", timeout: 20000 });
    const beforeUpdate = await page.evaluate(({ saveKey, sentinelKey }) => {
      const raw = localStorage.getItem(saveKey) || "";
      const state = JSON.parse(raw);
      const id = state.practicalDrill?.currentAttempt?.id;
      return {
        sentinel: localStorage.getItem(sentinelKey),
        currentAttempt: state.practicalDrill?.currentAttempt,
        history: state.practicalDrill?.history?.[id],
        stateSentinel: state.pwaUpgradeSentinel
      };
    }, { saveKey: SAVE_KEY, sentinelKey: SENTINEL_KEY });

    const oldCaches = await cacheNames(page);
    assert.ok(oldCaches.some((name) => name === `takken-battle-${OLD_VERSION}`), "old controlled cache was not installed");

    const peer = multiTab ? await context.newPage() : null;
    const peerErrors = [];
    if (peer) {
      peer.on("pageerror", error => peerErrors.push(error.message));
      await peer.goto(server.baseUrl, { waitUntil: "networkidle" });
    }

    server.release("new");
    if (autoReconnect) {
      // A real disconnect/reconnect must retry even inside the foreground throttle.
      await context.setOffline(true);
      await context.setOffline(false);
    } else await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("old runtime registration missing");
      await registration.update();
    });
    await page.waitForFunction(() => navigator.serviceWorker.getRegistration()
      .then((registration) => Boolean(registration?.waiting)), null, { timeout: 15000 });
    await page.waitForSelector("#pwaUpdateNotice button", { state: "visible", timeout: 15000 });
    if (peer) await peer.waitForSelector("#pwaUpdateNotice button", { state: "visible" });
    if (saveFailure) {
      const beforeFailure = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY);
      await page.evaluate(key => {
        const original = Storage.prototype.setItem;
        window.__restoreStorageWrites = () => { Storage.prototype.setItem = original; };
        Storage.prototype.setItem = function (name, value) {
          if (name === key) throw new DOMException("synthetic quota failure", "QuotaExceededError");
          return original.call(this, name, value);
        };
        document.querySelector("#businessLegacyDrawer").open = true;
      }, SAVE_KEY);
      await page.locator("#markButton").click();
      assert.match(await page.locator("#saveProtectionStatus").textContent(), /自動保存に失敗/);
      await page.locator("#pwaUpdateNotice button").click();
      await page.waitForFunction(() => document.querySelector("#pwaUpdateNotice p")?.textContent.includes("保存できていない"), null, { timeout: 3000 });
      assert.equal(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY), beforeFailure);
      assert.equal(await page.locator("#pwaUpdateNotice button").isEnabled(), true);
      fs.mkdirSync("output/playwright", { recursive: true });
      await page.setViewportSize({ width: 320, height: 720 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
      await page.screenshot({ path: "output/playwright/pwa-save-failure-320.png", fullPage: false });
      await page.evaluate(() => window.__restoreStorageWrites());
      await page.locator("#markButton").click();
      assert.doesNotMatch(await page.locator("#saveProtectionStatus").textContent(), /自動保存に失敗/);
    }
    if (autoReconnect) {
      assert.equal(await page.locator("#pwaUpdateNotice").count(), 1);
      assert.ok((await cacheNames(page)).includes(`takken-battle-${OLD_VERSION}`), "reconnect must await the learner's explicit update");
      fs.mkdirSync("output/playwright", { recursive: true });
      await page.screenshot({ path: "output/playwright/pwa-reconnect-390.png", fullPage: false });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.equal(overflow, 0, "mobile update notice must not overflow");
      await page.setViewportSize({ width: 320, height: 720 });
      const mobile = await page.locator("#pwaUpdateNotice button").boundingBox();
      assert.ok(mobile?.width >= 44 && mobile.height >= 44, "320px update action must keep a 44px touch target");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, "320px update must not overflow");
      await page.screenshot({ path: "output/playwright/pwa-reconnect-320.png", fullPage: false });
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }),
      page.locator("#pwaUpdateNotice button").click()
    ]);
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await waitForController(page);
    await page.waitForFunction((version) => caches.keys().then((names) => names.includes(`takken-battle-${version}`)), CURRENT_VERSION, { timeout: 15000 });

    const readback = await page.evaluate(({ saveKey, sentinelKey }) => {
      const state = JSON.parse(localStorage.getItem(saveKey) || "{}");
      const id = state.practicalDrill?.currentAttempt?.id;
      return {
        sentinel: localStorage.getItem(sentinelKey),
        currentAttempt: state.practicalDrill?.currentAttempt,
        history: state.practicalDrill?.history?.[id],
        stateSentinel: state.pwaUpgradeSentinel
      };
    }, { saveKey: SAVE_KEY, sentinelKey: SENTINEL_KEY });
    assert.equal(readback.sentinel, fixture.sentinel, "unrelated localStorage sentinel bytes changed during PWA upgrade");
    assert.deepEqual(readback.currentAttempt, beforeUpdate.currentAttempt, "currentAttempt changed during PWA upgrade");
    assert.deepEqual(readback.history, beforeUpdate.history, "answer history changed during PWA upgrade");
    assert.deepEqual(readback.stateSentinel, beforeUpdate.stateSentinel, "canonical state sentinel changed during PWA upgrade");

    const newCaches = await cacheNames(page);
    assert.ok(newCaches.includes(`takken-battle-${CURRENT_VERSION}`), "new controlled cache was not activated");
    assert.ok(!newCaches.includes(`takken-battle-${OLD_VERSION}`), "old cache survived activation cleanup");
    if (peer) {
      // Reloading the updated runtime changes its registration query URL. If
      // that installs a second worker, settle it from the updating tab too.
      await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then(reg => Boolean(reg.waiting)), null, { timeout: 15000 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle" }),
        page.locator("#pwaUpdateNotice button").click()
      ]);
      await peer.waitForFunction(() => navigator.serviceWorker.getRegistration().then(reg => !reg.waiting && !reg.installing));
      try {
        await Promise.all([
          peer.waitForNavigation({ waitUntil: "networkidle", timeout: 10000 }),
          peer.locator("#pwaUpdateNotice button").click()
        ]);
      } catch (error) {
        error.message += `; sibling page errors: ${JSON.stringify(peerErrors)}`;
        throw error;
      }
      assert.deepEqual(peerErrors, [], "a sibling update must not strand this tab's update button");
      const peerState = await peer.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
      assert.deepEqual(peerState.practicalDrill.currentAttempt, beforeUpdate.currentAttempt);
      assert.deepEqual(peerState.practicalDrill.history[beforeUpdate.currentAttempt.id], beforeUpdate.history);
    }
    console.log(JSON.stringify({ status: "ok", audit: "PwaUpgrade", autoReconnect, multiTab, saveFailure,
      legacyRuntime: legacyRef || "current runtime with an older release version", canonicalAttemptAndHistoryRetained: true }));
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
