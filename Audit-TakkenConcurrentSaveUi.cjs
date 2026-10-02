#!/usr/bin/env node
"use strict";

// Deterministic, synthetic two-tab races. Only storage-event delivery is delayed;
// the application still acquires its real lease, reads shared localStorage and
// executes its real save/reconciliation/rollback code.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

async function host() {
  const root = path.resolve(__dirname);
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = path.resolve(root, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
    if (!target.startsWith(root + path.sep)) return response.writeHead(403).end();
    fs.readFile(target, (error, body) => {
      if (error) return response.writeHead(404).end();
      response.writeHead(200, { "content-type": types[path.extname(target)] || "application/octet-stream", "cache-control": "no-store" });
      response.end(body);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); })
  };
}

async function reveal(page, selector) {
  await page.locator(selector).evaluate(node => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") parent.open = true;
    }
  });
}

async function boot(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(
    window.TAKKEN_STATE_SYNC?.reconcileForSave &&
    window.TAKKEN_BUSINESS_HARD_BANK?.QUESTIONS.length === 180 &&
    window.TAKKEN_TAX_AUTHORED_BANK?.QUESTIONS.length === 24 &&
    document.querySelector("#businessKnockFreshStart") &&
    document.querySelector("#taxAuthoredTen")
  ));
}

const readRaw = (page, key) => page.evaluate(key => localStorage.getItem(key), key);
const read = async (page, key) => JSON.parse(await readRaw(page, key));

async function trackReconciliation(page) {
  await page.evaluate(() => {
    window.__saveAuditReconcileErrors = [];
    const original = window.TAKKEN_STATE_SYNC.reconcileForSave;
    window.TAKKEN_STATE_SYNC.reconcileForSave = function (...args) {
      try { return original.apply(this, args); }
      catch (error) {
        window.__saveAuditReconcileErrors.push(String(error.stack || error));
        throw error;
      }
    };
  });
}

async function prepare(browser, baseUrl, label, calculationActive) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo",
    reducedMotion: "reduce", serviceWorkers: "block"
  });
  context.setDefaultTimeout(15000);
  await context.addInitScript(() => {
    window.__saveAuditDelayStorage = false;
    window.addEventListener("storage", event => {
      if (window.__saveAuditDelayStorage) event.stopImmediatePropagation();
    }, true);
  });
  const errors = [];
  context.on("page", page => page.on("pageerror", error => errors.push(String(error.stack || error))));
  // app.js deliberately caps review namespaces at 24 characters.
  const review = `save60-${Date.now().toString(36)}-${label}`.slice(0, 24);
  const key = `takken-battle-study-clean-v2-hard-review-${review}`;
  const url = new URL(baseUrl);
  url.searchParams.set("review", review);
  url.searchParams.set("today", "1");
  const a = await context.newPage();
  await boot(a, url.toString());
  if (calculationActive) {
    await reveal(a, "#calculationDrillResetButton");
    await a.locator("#calculationDrillResetButton").click();
    assert.equal((await read(a, key)).calculationDrill.stage, "active");
    await a.locator("#calculationDrillPanel").evaluate(node => node.open = false);
  }
  return { context, errors, key, url: url.toString(), a };
}

async function startBusiness(page) {
  await reveal(page, "#businessKnockFreshStart");
  await page.locator("#businessKnockFreshStart").click();
  await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
}

async function reloadAndCheck(page, url, key, expectedDrill, expectedCalculation) {
  await boot(page, url);
  await reveal(page, "#practicalDrillSession");
  await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
  const restored = await read(page, key);
  assert.deepEqual(restored.practicalDrill, expectedDrill, "reload preserves the first writer's complete practical session and history");
  assert.deepEqual(restored.calculationDrill, expectedCalculation, "reload preserves the parallel calculation session");
}

async function sameQuestionRace(browser, baseUrl, calculationActive) {
  const fixture = await prepare(browser, baseUrl, `answer-${calculationActive ? "calc" : "idle"}`, calculationActive);
  const { context, errors, key, url, a } = fixture;
  try {
    await startBusiness(a);
    const b = await context.newPage();
    await boot(b, url);
    await reveal(b, "#practicalDrillChoices");
    await b.locator("#practicalDrillSession").waitFor({ state: "visible" });
    const before = await read(a, key);
    const id = before.practicalDrill.queue[before.practicalDrill.position];
    assert.equal(before.practicalDrill.currentAttempt, null, "both tabs start on an unanswered question");
    assert.equal(before.practicalDrill.history[id], undefined, "new history creation exercises the missing-value counter path");
    assert.equal(before.calculationDrill.stage, calculationActive ? "active" : "idle");
    const answer = await a.evaluate(({ id, presentationKey }) =>
      window.TAKKEN_BUSINESS_HARD_BANK.presentQuestion(id, presentationKey).answer,
    { id, presentationKey: before.practicalDrill.presentationOverrides[id] || before.practicalDrill.presentationKey });
    await trackReconciliation(b);
    await a.evaluate(() => { window.__saveAuditDelayStorage = true; });
    await b.evaluate(() => { window.__saveAuditDelayStorage = true; });
    const selectedA = (answer + 1) % 4;
    const selectedB = (answer + 2) % 4;
    await a.locator(".practical-drill-choice").nth(selectedA).click();
    const committed = await read(a, key);
    assert.equal(committed.practicalDrill.currentAttempt.selected, selectedA);
    assert.equal(committed.practicalDrill.history[id].attempts, 1);
    const rawCommitted = await readRaw(a, key);
    await b.locator(".practical-drill-choice").nth(selectedB).click();
    assert.match(await b.locator("#practicalDrillSaveError").textContent(), /解答を保存できませんでした/);
    assert.match(await b.locator("#saveTransferStatus").textContent(), /別タブで異なる学習セッション/,
      "the second answer must use the explicit conflict path, not a generic caught exception");
    assert.equal(await readRaw(b, key), rawCommitted, "rejected answer must not mutate the primary save or merge a phantom attempt");
    assert.deepEqual(await b.evaluate(() => window.__saveAuditReconcileErrors), [], "no Symbol conversion or other reconciliation exception");
    assert.equal(await b.locator(".practical-drill-choice:enabled").count(), 4, "failed answer rolls back the in-memory attempt");
    await reloadAndCheck(b, url, key, committed.practicalDrill, committed.calculationDrill);
    assert.equal(await b.locator("#practicalDrillFeedback").isVisible(), true, "reload displays the first writer's saved answer");
    assert.deepEqual(errors, []);
    return { calculationActive, newHistory: true, conflictRejected: true, primaryUnchanged: true, reload: true };
  } finally { await context.close(); }
}

async function differentSubjectRace(browser, baseUrl, calculationActive) {
  const { context, errors, key, url, a } = await prepare(browser, baseUrl, `branch-${calculationActive ? "calc" : "idle"}`, calculationActive);
  try {
    const b = await context.newPage();
    await boot(b, url);
    await reveal(b, "#taxAuthoredTen");
    await trackReconciliation(b);
    await a.evaluate(() => { window.__saveAuditDelayStorage = true; });
    await b.evaluate(() => { window.__saveAuditDelayStorage = true; });
    await startBusiness(a);
    const committed = await read(a, key);
    const rawCommitted = await readRaw(a, key);
    await b.locator("#taxAuthoredTen").click();
    assert.match(await b.locator("#todayCommandStatus").textContent(), /科目補強の開始状態を保存できませんでした/);
    assert.match(await b.locator("#saveTransferStatus").textContent(), /別タブで異なる学習セッション/);
    assert.equal(await b.locator("#practicalDrillSession").isVisible(), false, "unsaved competing tax session must not be shown as active");
    assert.equal(await readRaw(b, key), rawCommitted, "competing subject start must preserve the first writer's session and history");
    assert.deepEqual(await b.evaluate(() => window.__saveAuditReconcileErrors), []);
    await reloadAndCheck(b, url, key, committed.practicalDrill, committed.calculationDrill);
    assert.deepEqual(errors, []);
    return { calculationActive, subjects: ["business", "taxOther"], conflictRejected: true, reload: true };
  } finally { await context.close(); }
}

async function failedBusinessStart(browser, baseUrl) {
  const { context, errors, key, url, a } = await prepare(browser, baseUrl, "start-write-failure", false);
  try {
    await reveal(a, "#businessKnockFreshStart");
    const before = await read(a, key);
    const rawBefore = await readRaw(a, key);
    assert.equal(before.practicalDrill.stage, "idle");
    await a.evaluate(key => {
      const original = Storage.prototype.setItem;
      window.__saveAuditFailPrimary = true;
      window.__saveAuditPrimaryFailures = 0;
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === key && window.__saveAuditFailPrimary) {
          window.__saveAuditPrimaryFailures += 1;
          throw new DOMException("Synthetic primary-write failure", "QuotaExceededError");
        }
        return original.call(this, name, value);
      };
    }, key);
    await a.locator("#businessKnockFreshStart").click();
    assert.ok(await a.evaluate(() => window.__saveAuditPrimaryFailures > 0), "fixture must reach the actual primary-save write");
    assert.match(await a.locator("#todayCommandStatus").textContent(), /業法セットの開始状態を保存できませんでした/);
    assert.equal(await a.locator("#todayCommandStatus").evaluate(node => node.classList.contains("is-error")), true);
    assert.match(await a.locator("#saveTransferStatus").textContent(), /Synthetic primary-write failure/);
    assert.equal(await readRaw(a, key), rawBefore, "failed start preserves the complete persisted queue and history");
    assert.equal(await a.locator("#practicalDrillSession").isVisible(), false, "unsaved session must not appear active");
    await a.evaluate(() => { window.__saveAuditFailPrimary = false; });
    await startBusiness(a);
    const committed = await read(a, key);
    assert.equal(committed.practicalDrill.stage, "active");
    assert.equal(committed.practicalDrill.queue.length, 20);
    assert.equal(new Set(committed.practicalDrill.queue).size, 20);
    assert.equal(committed.practicalDrill.attempts, before.practicalDrill.attempts);
    assert.deepEqual(committed.practicalDrill.history, before.practicalDrill.history, "successful retry must not introduce answers");
    await reloadAndCheck(a, url, key, committed.practicalDrill, committed.calculationDrill);
    assert.deepEqual(errors, []);
    return { primaryFailureExercised: true, rollback: true, primaryUnchanged: true, successfulRetry: true, reload: true };
  } finally { await context.close(); }
}

async function main() {
  const server = process.env.TAKKEN_BASE_URL ? { url: process.env.TAKKEN_BASE_URL, close: async () => {} } : await host();
  let browser;
  try {
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(server.url).hostname), "fault-injection audit must use a local server");
    browser = await chromium.launch(process.env.TAKKEN_CHROME_PATH
      ? { headless: true, executablePath: process.env.TAKKEN_CHROME_PATH }
      : { headless: true, channel: "chrome" });
    const sameQuestion = [], differentSubjects = [];
    for (const calculationActive of [false, true]) sameQuestion.push(await sameQuestionRace(browser, server.url, calculationActive));
    for (const calculationActive of [false, true]) differentSubjects.push(await differentSubjectRace(browser, server.url, calculationActive));
    const businessStart = await failedBusinessStart(browser, server.url);
    console.log(JSON.stringify({ status: "ok", sameQuestion, differentSubjects, businessStart, syntheticContextOnly: true,
      raceInjection: "storage events delayed; actual shared storage, lease and reconciliation unchanged" }));
  } finally { await browser?.close(); await server.close(); }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
