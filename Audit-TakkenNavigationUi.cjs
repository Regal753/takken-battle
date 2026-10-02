#!/usr/bin/env node
"use strict";

// Browser proof for the top-level navigator.  It uses an isolated review
// namespace only: no real learner save is loaded or written.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function startStaticServer(root) {
  const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp" };
  const safeRoot = path.resolve(root);
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(safeRoot, relative);
    if (!target.startsWith(`${safeRoot}${path.sep}`) && target !== path.join(safeRoot, "index.html")) {
      response.writeHead(403); response.end("forbidden"); return;
    }
    fs.readFile(target, (error, body) => {
      if (error) { response.writeHead(404); response.end("not found"); return; }
      response.writeHead(200, { "content-type": types[path.extname(target)] || "application/octet-stream", "cache-control": "no-store" });
      response.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({
      baseUrl: `http://127.0.0.1:${server.address().port}/`,
      close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(done); })
    }));
  });
}

function reviewUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set("review", `navigation-${Date.now().toString(36)}`);
  url.searchParams.set("today", "1");
  return url.toString();
}

async function savedPractical(page) {
  return page.evaluate(() => {
    const namespace = String(new URLSearchParams(location.search).get("review") || "default").replace(/[^a-z0-9-]/gi, "").slice(0, 24);
    const key = `takken-battle-study-clean-v2-hard-review-${namespace}`;
    if (!key) throw new Error("review save not found");
    const drill = JSON.parse(localStorage.getItem(key)).practicalDrill;
    return drill;
  });
}

async function assertMixedCumulativeWarning(page) {
  await page.evaluate(() => {
    const namespace = String(new URLSearchParams(location.search).get("review") || "default").replace(/[^a-z0-9-]/gi, "").slice(0, 24);
    const key = `takken-battle-study-clean-v2-hard-review-${namespace}`;
    const saved = JSON.parse(localStorage.getItem(key));
    saved.attempts = 8;
    saved.correct = 6;
    saved.centralProgress = { ...(saved.centralProgress || {}), answers: 8, correct: 6 };
    const knownQuestionId = Object.keys(window.TAKKEN_QUESTIONS || {})[0];
    if (!knownQuestionId) throw new Error("question fixture is unavailable");
    saved.questionStats = { ...(saved.questionStats || {}), [knownQuestionId]: { attempts: 1, correct: 1, wrong: 0 } };
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload({ waitUntil: "networkidle" });
  const notice = page.locator("#progressDataQualityNotice");
  const qualityState = await notice.evaluate((node) => ({ hidden: node.hidden, text: node.textContent }));
  if (process.env.TAKKEN_NAV_TRACE) console.log(`QUALITY ${JSON.stringify(qualityState)}`);
  assert.equal(qualityState.hidden, false, "mixed cumulative totals must show a visible quality warning");
  assert.match(await notice.textContent(), /解答数・正解数が一致していません。正答率や合格判定には使わず/);
  assert.equal(await page.locator("#accuracyText").textContent(), "-", "mixed cumulative totals must not render a percentage");
}

async function assertCoherentCumulativeRate(page) {
  await page.evaluate(() => {
    const namespace = String(new URLSearchParams(location.search).get("review") || "default").replace(/[^a-z0-9-]/gi, "").slice(0, 24);
    const key = `takken-battle-study-clean-v2-hard-review-${namespace}`;
    const saved = JSON.parse(localStorage.getItem(key));
    const knownQuestionId = Object.keys(window.TAKKEN_QUESTIONS || {})[0];
    if (!knownQuestionId) throw new Error("question fixture is unavailable");
    saved.attempts = 8;
    saved.correct = 6;
    saved.centralProgress = { ...(saved.centralProgress || {}), answers: 8, correct: 6 };
    saved.questionStats = { [knownQuestionId]: { attempts: 8, correct: 6, wrong: 2 } };
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("#progressDataQualityNotice").evaluate((node) => node.hidden), true, "coherent totals must hide the data-quality warning");
  assert.equal(await page.locator("#accuracyText").textContent(), "75%", "coherent totals must render their percentage");
}

async function clickNav(page, destination, expectedTarget) {
  if (process.env.TAKKEN_NAV_TRACE) console.log(`NAV ${destination}`);
  await page.locator(`[data-study-nav="${destination}"]`).first().click();
  if (expectedTarget) {
    const target = page.locator(expectedTarget).first();
    await target.waitFor({ state: "visible" });
    const viewport = page.viewportSize();
    await page.waitForFunction((selector) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    }, expectedTarget);
    const geometry = await target.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { focused: document.activeElement === node, top: rect.top, bottom: rect.bottom };
    });
    assert.ok(geometry.top >= 0 && geometry.bottom <= viewport.height, `${destination} must show its exact action in the viewport`);
    if (await target.isEnabled()) assert.equal(geometry.focused, true, `${destination} must focus its enabled action`);
    if (process.env.TAKKEN_NAV_SCREENSHOT_DIR && ["rights", "tax", "exam"].includes(destination)) {
      fs.mkdirSync(process.env.TAKKEN_NAV_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.TAKKEN_NAV_SCREENSHOT_DIR, `destination-${destination}-${viewport.width}.png`) });
    }
  }
  assert.match(await page.locator("#studyModeNavStatus").textContent(), /開始していません|今日の指示|保存状態から再開/);
}

async function runViewport(page, viewport) {
  await page.setViewportSize(viewport);
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => {
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      return original.call(this, typeof options === "object" ? { ...options, behavior: "auto" } : options);
    };
  });
  await page.locator("#studyModeNav").waitFor({ state: "visible" });
  assert.equal(await page.locator("#studyModeNav [data-study-nav]").count(), 6, "six stable destinations are required");
  await page.keyboard.press("Tab");
  const focusControl = page.locator('#studyModeNav [data-study-nav="subjects"]');
  await focusControl.focus();
  const focusStyle = await focusControl.evaluate(node => ({outline:getComputedStyle(node).outlineWidth, height:node.getBoundingClientRect().height}));
  assert.equal(focusStyle.outline, "3px", "new navigation controls need a visible keyboard focus ring");
  assert.ok(focusStyle.height >= 44, "navigation touch targets must be at least 44px");
  assert.equal(await page.locator("#businessLegacyDrawer").evaluate((node) => node.open), false, "navigation must not open the archived business drawer");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `horizontal overflow at ${viewport.width}px: ${overflow}`);
  if (process.env.TAKKEN_NAV_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.TAKKEN_NAV_SCREENSHOT_DIR, { recursive: true });
    await page.locator("#studyModeNav").screenshot({ path: path.join(process.env.TAKKEN_NAV_SCREENSHOT_DIR, `navigation-${viewport.width}.png`) });
  }
}

async function runDestinations(page) {
  await clickNav(page, "today", "#todayCommandStartButton");
  await clickNav(page, "subjects", "#subjectNavigator > summary");
  await clickNav(page, "business", "#businessKnockMode");
  await clickNav(page, "restrictions", "#restrictionExamStart");
  await clickNav(page, "rights", "#rightsMasteryTwenty");
  await clickNav(page, "tax", "#taxAuthoredTen");
  await clickNav(page, "other", '[data-subject-sprint="other"]');
  await clickNav(page, "calculation", "#calculationDrillResetButton");
  await clickNav(page, "all", "#studyScopeSelect");
  await clickNav(page, "review", "#weakQuestButton");
  await clickNav(page, "exam", "#officialExamStartButton");
  await clickNav(page, "progress", "#progressDrawer > summary");
  await clickNav(page, "settings", ".public-mode-note > summary");
}

async function main() {
  const root = process.cwd();
  const server = await startStaticServer(root);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(reviewUrl(server.baseUrl), { waitUntil: "networkidle" });
    await page.locator("#studyModeNav").waitFor({ state: "visible" });
    for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      await runViewport(page, viewport);
      await runDestinations(page);
    }

    await assertMixedCumulativeWarning(page);
    await assertCoherentCumulativeRate(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#businessKnockStart").click();
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    await page.locator(".practical-drill-choice:enabled").first().click();
    await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
    const before = await savedPractical(page);
    assert.ok(["active", "retry"].includes(before.stage) && before.currentAttempt, "fixture must preserve an answered active set");
    for (const destination of ["subjects", "business", "restrictions", "rights", "tax", "other", "calculation", "all", "review", "exam", "progress", "settings"]) {
      await page.locator(`[data-study-nav="${destination}"]`).first().click();
      assert.deepEqual(await savedPractical(page), before, `${destination} navigation must not alter the active set`);
    }
    await page.locator('[data-study-nav="today"]').click();
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    assert.deepEqual(await savedPractical(page), before, "resume navigation must not alter the active set");
    assert.match(await page.locator('[data-study-nav="today"]').textContent(), /途中を再開/);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    assert.deepEqual(await savedPractical(page), before, "reload must preserve the active set after navigation");
    console.log("PASS navigation ui: 13 destinations at 320/390/1280, mixed/coherent counter display, active-set-safe navigation, resume, reload");
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
