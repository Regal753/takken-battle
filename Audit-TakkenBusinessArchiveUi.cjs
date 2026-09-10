#!/usr/bin/env node
"use strict";

// Contract proof for the closed legacy-business drawer.  It deliberately
// exercises the old 134-question bank without allowing saved basic settings
// to turn a normal (new 180-question) start into an old-bank session.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function server(root) {
  const safe = path.resolve(root);
  return new Promise((resolve, reject) => {
    const value = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/$/, "/index.html").replace(/^\/+/, "");
      const file = path.resolve(safe, rel);
      if (!file.startsWith(`${safe}${path.sep}`)) return res.writeHead(403).end();
      fs.readFile(file, (err, body) => {
        if (err) return res.writeHead(404).end();
        res.writeHead(200, { "content-type": { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(body);
      });
    });
    value.once("error", reject); value.listen(0, "127.0.0.1", () => resolve({
      base: `http://127.0.0.1:${value.address().port}/`, close: () => new Promise(done => value.close(done))
    }));
  });
}

function url(base, suffix) { const value = new URL(base); value.searchParams.set("review", `business-archive-${suffix}-${Date.now().toString(36)}`); value.searchParams.set("today", "1"); return value.toString(); }
async function app(page) { await page.waitForFunction(() => Boolean(window.TAKKEN_BUSINESS_FULLSCORE_BANK?.QUESTIONS?.length === 134 && document.querySelector("#businessLegacyDrawer") && document.querySelector("#businessKnockStart"))); }
async function open(page) { const drawer = page.locator("#businessLegacyDrawer"); if (!await drawer.evaluate(node => node.open)) await drawer.locator("summary").click(); await page.locator("#businessArchiveKnockStart").waitFor({ state: "visible" }); }
async function saved(page) { return page.evaluate(() => { const key = Object.keys(localStorage).find(k => /^takken-battle-study-clean-v2-hard-review-/.test(k) && !/backup|-before-|previous|corrupt|event-outbox/.test(k)); return { key, state: JSON.parse(localStorage.getItem(key)) }; }); }
async function overflow(page) { return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth)); }
async function archiveStart(page, mode = "all-random", size = 10) { await page.locator("#businessArchiveMode").selectOption(mode); await page.locator("#businessArchiveSize").selectOption(String(size)); await page.locator("#businessArchiveKnockStart").click(); await page.locator("#practicalDrillSession").waitFor({ state: "visible" }); }
async function answerCurrent(page, { advance = true } = {}) { const answer = await page.evaluate(() => { const state = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /^takken-battle-study-clean-v2-hard-review-/.test(k) && !/backup|-before-|previous|corrupt|event-outbox/.test(k)))); const id = state.practicalDrill.queue[state.practicalDrill.position]; const bank = /^hard(?:54|55)-/.test(id) ? window.TAKKEN_BUSINESS_HARD_BANK : window.TAKKEN_BUSINESS_FULLSCORE_BANK; return bank.presentQuestion(bank.QUESTIONS_BY_ID[id], state.practicalDrill.presentationOverrides?.[id] || state.practicalDrill.presentationKey).answer; }); await page.locator(".practical-drill-choice").nth(answer).click(); await page.locator('[data-practical-confidence="confident"]').click(); if (advance && await page.locator("#practicalDrillNextButton").isVisible()) await page.locator("#practicalDrillNextButton").click(); }

(async () => {
  const local = await server(process.cwd()); const browser = await chromium.launch({ channel: "chrome", headless: true });
  const shots = path.join(process.cwd(), "output", "playwright", "business-archive"); fs.mkdirSync(shots, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); await page.addInitScript(() => { const NativeDate = Date; const fixed = new NativeDate("2026-08-24T10:00:00+09:00").getTime(); class FixedDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } } window.Date = FixedDate; }); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  try {
    await page.goto(url(local.base, "main"), { waitUntil: "networkidle" }); await app(page);
    assert.equal(await page.locator("#businessLegacyDrawer").evaluate(node => node.open), false, "legacy drawer must default closed");
    assert.equal(await page.locator("#businessArchiveKnockStart").isHidden(), true, "old controls must be hidden while closed");
    assert.equal(await page.locator("#businessKnockStart").isVisible(), true, "new hard CTA remains visible outside the drawer");
    const first = await saved(page); first.state.practicalDrill.knockPreset = { difficulty: "basic", mode: "untouched", size: 10, unitId: "" }; await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), first); await page.reload({ waitUntil: "networkidle" }); await app(page);
    await page.locator("#businessKnockStart").click(); await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    let state = (await saved(page)).state; assert.ok(state.practicalDrill.sessionIds.every(id => /^hard(?:54|55)-/.test(id)), "persisted basic preference must not leak into a normal start");
    page.once("dialog", d => d.accept()); await page.locator("#practicalDrillDiscardButton").click(); await page.locator("#practicalDrillSession").waitFor({ state: "hidden" });
    // Open explicitly, retain old bank through answer + reload, then complete a
    // bounded old-bank set and prove its restart cannot silently become hard.
    await open(page); await archiveStart(page, "untouched", 10); state = (await saved(page)).state;
    assert.equal(state.practicalDrill.bankId, "business-fullscore"); assert.equal(state.practicalDrill.sessionIds.every(id => /^bf-business-/.test(id)), true);
    await answerCurrent(page, { advance: false }); const answered = (await saved(page)).state.practicalDrill; await page.reload({ waitUntil: "networkidle" }); await app(page); await open(page);
    state = (await saved(page)).state; assert.deepEqual(state.practicalDrill.history, answered.history, "old answer history survives reload"); assert.deepEqual(state.practicalDrill.currentAttempt, answered.currentAttempt, "old active answer survives reload");
    await page.locator("#practicalDrillNextButton").click(); for (let i = 0; i < 9; i += 1) await answerCurrent(page);
    await page.locator("#practicalDrillComplete").waitFor({ state: "visible" }); await page.locator("#practicalDrillRestartButton").click(); await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    state = (await saved(page)).state; assert.equal(state.practicalDrill.bankId, "business-fullscore", "old result restart must remain old"); assert.equal(state.practicalDrill.sessionIds.every(id => /^bf-business-/.test(id)), true);
    page.once("dialog", d => d.accept()); await page.locator("#practicalDrillDiscardButton").click(); await page.locator("#practicalDrillSession").waitFor({ state: "hidden" });
    await page.locator("#businessKnockStart").click(); await page.locator("#practicalDrillSession").waitFor({ state: "visible" }); state = (await saved(page)).state;
    assert.equal(state.practicalDrill.sessionIds.every(id => /^hard(?:54|55)-/.test(id)), true, "after an old completion, the normal CTA must still start hard only");
    page.once("dialog", d => d.accept()); await page.locator("#practicalDrillDiscardButton").click(); await page.locator("#practicalDrillSession").waitFor({ state: "hidden" });
    // Same-day archive work is retained, but it must never pay down today's
    // hard-only 20-question command. One hard answer plus 19 new hard cases
    // does complete the daily target while all archive history remains intact.
    const dailyFixture = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => /^takken-battle-study-clean-v2-hard-review-/.test(k) && !/backup|-before-|previous|corrupt|event-outbox/.test(k));
      const state = JSON.parse(localStorage.getItem(key)); const now = new Date().toISOString();
      const oldIds = window.TAKKEN_BUSINESS_FULLSCORE_BANK.QUESTIONS.slice(0, 20).map(item => item.id);
      const hardId = window.TAKKEN_BUSINESS_HARD_BANK.QUESTIONS[0].id;
      for (const id of oldIds) state.practicalDrill.history[id] = { attempts: 1, correct: 1, wrong: 0, uncertain: 0, lastConfidence: "confident", lastCorrect: true, lastAnsweredAt: now };
      localStorage.setItem(key, JSON.stringify(state)); return { oldIds, oldHistory: Object.fromEntries(oldIds.map(id => [id, state.practicalDrill.history[id]])), hardId };
    });
    await page.reload({ waitUntil: "networkidle" }); await app(page);
    assert.equal(await page.locator("#todayCommandStartButton").textContent(), "残り20問をノック開始", "same-day archive10/20 answers must not reduce hard daily20");
    await page.evaluate(({ hardId }) => { const key = Object.keys(localStorage).find(k => /^takken-battle-study-clean-v2-hard-review-/.test(k) && !/backup|-before-|previous|corrupt|event-outbox/.test(k)); const state = JSON.parse(localStorage.getItem(key)); state.practicalDrill.history[hardId] = { attempts: 1, correct: 1, wrong: 0, uncertain: 0, lastConfidence: "confident", lastCorrect: true, lastAnsweredAt: new Date().toISOString() }; localStorage.setItem(key, JSON.stringify(state)); }, dailyFixture);
    await page.reload({ waitUntil: "networkidle" }); await app(page);
    assert.equal(await page.locator("#todayCommandStartButton").textContent(), "残り19問をノック開始", "archive20 plus one hard answer must leave 19 hard daily cases");
    const archiveHistoryBeforeDaily = await page.evaluate((oldIds) => { const key = Object.keys(localStorage).find(k => /^takken-battle-study-clean-v2-hard-review-/.test(k) && !/backup|-before-|previous|corrupt|event-outbox/.test(k)); const state = JSON.parse(localStorage.getItem(key)); return Object.fromEntries(oldIds.map(id => [id, state.practicalDrill.history[id]])); }, dailyFixture.oldIds);
    await page.locator("#todayCommandStartButton").click(); await page.locator("#practicalDrillSession").waitFor({ state: "visible" }); state = (await saved(page)).state;
    assert.equal(state.practicalDrill.sessionIds.length, 19, "mixed archive20 plus hard1 starts exactly the remaining19");
    assert.equal(state.practicalDrill.sessionIds.every(id => /^hard(?:54|55)-/.test(id)), true, "daily remainder contains hard IDs only");
    assert.equal(state.practicalDrill.sessionIds.includes(dailyFixture.hardId), false, "daily remainder excludes the already answered hard ID");
    for (let i = 0; i < 19; i += 1) await answerCurrent(page);
    await page.locator("#practicalDrillComplete").waitFor({ state: "visible" }); state = (await saved(page)).state;
    assert.deepEqual(Object.fromEntries(dailyFixture.oldIds.map(id => [id, state.practicalDrill.history[id]])), archiveHistoryBeforeDaily, "daily hard completion must preserve every normalized archive history record exactly");
    assert.ok(Object.keys(state.practicalDrill.history).filter(id => /^hard(?:54|55)-/.test(id)).length >= 20, "one prior hard answer plus the daily19 must complete hard20");
    assert.notEqual(await page.locator("#todayCommandStartButton").textContent(), "残り20問をノック開始", "hard20 completion must not request a fresh daily20");
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const drawer = page.locator("#businessLegacyDrawer");
      if (await drawer.evaluate(node => node.open)) await drawer.locator("summary").click();
      await page.locator("#businessMasteryPanel").evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" }));
      assert.equal(await overflow(page), 0, `${width}px closed archive must not overflow`);
      await page.screenshot({ path: path.join(shots, `closed-${width}.png`) });
      await open(page); await drawer.locator("summary").evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" }));
      assert.equal(await overflow(page), 0, `${width}px opened archive must not overflow`);
      await page.screenshot({ path: path.join(shots, `drawer-${width}.png`) });
    }
    const missing = await browser.newPage({ viewport: { width: 390, height: 844 } }); await missing.route(/business-hard-bank\.js/, route => route.abort()); await missing.goto(url(local.base, "missing-hard"), { waitUntil: "networkidle" }); await app(missing); assert.equal(await missing.locator("#businessKnockStart").isDisabled(), true, "missing hard bank disables normal start"); await open(missing); await archiveStart(missing, "all-random", 10); state = (await saved(missing)).state; assert.equal(state.practicalDrill.sessionIds.every(id => /^bf-business-/.test(id)), true, "archive remains usable when hard asset is missing"); await missing.close();
    assert.deepEqual(errors, []); console.log(JSON.stringify({ status: "ok", defaultClosed: true, archiveOld134: true, hardPreferenceIsolated: true, oldResumeAndRestart: true, missingHardArchiveWorks: true, widths: [320, 390, 1440], screenshots: shots }));
  } finally { await browser.close(); await local.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
