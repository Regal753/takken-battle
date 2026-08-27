#!/usr/bin/env node
"use strict";

// Regression: an already-open older runtime must be able to activate a newly
// fetched worker without changing the learner's canonical local save.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = process.cwd();
const CURRENT_VERSION = "20260827-quality-v40-1-09a958d00a73";
const OLD_VERSION = "20260822-controlled-old-runtime";
const SAVE_KEY = "takken-battle-study-clean-v2-hard";
const SENTINEL_KEY = "takken-pwa-upgrade-sentinel";
const chromePath = process.env.TAKKEN_CHROME_PATH || undefined;

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
      if (release === "old" && (relative === "pwa-runtime.js" || relative === "service-worker.js")) {
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
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
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

    server.release("new");
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("old runtime registration missing");
      await registration.update();
    });
    await page.waitForFunction(() => navigator.serviceWorker.getRegistration()
      .then((registration) => Boolean(registration?.waiting)), null, { timeout: 15000 });
    await page.waitForSelector("#pwaUpdateNotice button", { state: "visible", timeout: 15000 });

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
    console.log("Audit-TakkenPwaUpgrade: OK (old runtime update button -> controllerchange -> new cache; sentinel bytes and canonical attempt/history values retained)");
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
