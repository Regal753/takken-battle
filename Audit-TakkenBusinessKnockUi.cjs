#!/usr/bin/env node
"use strict";

// Focused browser proof for the dedicated business-law knock panel. This is
// intentionally independent from the broader business mastery UI audit so a
// regression in the rapid-practice loop is easy to diagnose.
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
      close: () => new Promise((done) => {
        server.closeAllConnections?.();
        server.close(done);
      })
    }));
  });
}

function reviewUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set("review", `business-knock-${Date.now().toString(36)}`);
  url.searchParams.set("today", "1");
  return url.toString();
}

async function waitForApp(page) {
  await page.waitForFunction(() => Boolean(
    window.TAKKEN_BUSINESS_KNOCK?.plan &&
    document.querySelector("#businessKnockPanel") &&
    document.querySelector("#businessKnockStart") &&
    document.querySelector("#businessKnockUntouched")
  ));
}

async function readSavedState(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") &&
      !candidate.includes("previous") && !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    if (!key) throw new Error("business knock save key not found");
    return JSON.parse(localStorage.getItem(key));
  });
}

async function resetKnockState(page, history = {}) {
  await page.evaluate((nextHistory) => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") &&
      !candidate.includes("previous") && !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    const saved = JSON.parse(localStorage.getItem(key));
    saved.practicalDrill = {
      ...saved.practicalDrill,
      bankId: "business-fullscore",
      bankVersion: window.TAKKEN_BUSINESS_FULLSCORE_BANK.VERSION,
      presentationKey: "",
      planMode: "",
      knockPreset: { mode: "untouched", size: 20, unitId: "" },
      stage: "idle",
      scope: "business",
      unitId: "",
      sessionSize: 0,
      sessionIds: [],
      queue: [],
      position: 0,
      currentAttempt: null,
      retryIds: [],
      completedAt: "",
      attempts: 0,
      correctAttempts: 0,
      history: nextHistory
    };
    localStorage.setItem(key, JSON.stringify(saved));
  }, history);
  await page.reload({ waitUntil: "networkidle" });
  await waitForApp(page);
}

async function setKnockPreset(page, { mode, size, unitId }) {
  await page.locator("#businessKnockMode").selectOption(mode);
  if (mode === "unit") {
    await page.locator("#businessKnockUnit").selectOption(unitId);
  }
  await page.locator("#businessKnockSize").selectOption(String(size));
}

async function startKnock(page, preset) {
  await setKnockPreset(page, preset);
  await page.locator("#businessKnockStart").click();
  await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
  return readSavedState(page);
}

async function cancelKnock(page) {
  await page.locator("#practicalDrillCancelButton").click();
  await page.locator("#practicalDrillSession").waitFor({ state: "hidden" });
}

async function currentPresented(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") &&
      !candidate.includes("previous") && !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    const saved = JSON.parse(localStorage.getItem(key));
    const id = saved.practicalDrill.queue[saved.practicalDrill.position];
    const question = window.TAKKEN_BUSINESS_FULLSCORE_BANK.QUESTIONS_BY_ID[id];
    const presented = window.TAKKEN_BUSINESS_FULLSCORE_BANK.presentQuestion(question, saved.practicalDrill.presentationKey);
    return { id, answer: presented.answer, choices: [...presented.choices] };
  });
}

async function answerAndAdvance(page, kind = "confident") {
  const question = await currentPresented(page);
  const selected = kind === "wrong" ? (question.answer + 1) % 4 : question.answer;
  await page.locator(".practical-drill-choice").nth(selected).click();
  await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
  if (kind === "confident" || kind === "uncertain") {
    await page.locator(`[data-practical-confidence="${kind}"]`).click();
  }
  await page.locator("#practicalDrillNextButton").click();
  return question;
}

async function completeTenWithTwoRetries(page) {
  const wrong = await answerAndAdvance(page, "wrong");
  const uncertain = await answerAndAdvance(page, "uncertain");
  for (let index = 0; index < 8; index += 1) await answerAndAdvance(page, "confident");
  let saved = await readSavedState(page);
  assert.equal(saved.practicalDrill.stage, "retry", "wrong and uncertain answers must enter the same-set retry queue");
  assert.deepEqual(saved.practicalDrill.queue, [wrong.id, uncertain.id]);
  await answerAndAdvance(page, "confident");
  await answerAndAdvance(page, "confident");
  await page.locator("#practicalDrillComplete").waitFor({ state: "visible" });
  return { wrong, uncertain, saved: await readSavedState(page) };
}

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

(async () => {
  const local = await startStaticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });

  try {
    await page.goto(reviewUrl(local.baseUrl), { waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(page);
    assert.equal(await page.locator("#businessKnockPanel").isVisible(), true);
    assert.match(await page.locator("#businessKnockPanel").textContent(), /宅建業法ノック道場/);
    assert.equal(await page.locator("#businessKnockSize option").count(), 4);
    assert.deepEqual(await page.locator("#businessKnockSize option").evaluateAll((options) => options.map((option) => option.value)), ["10", "20", "50", "100"]);
    assert.equal(await page.locator("#businessKnockUnitField").isVisible(), false, "unit select must stay hidden outside unit mode");
    await page.locator("#businessKnockMode").selectOption("unit");
    assert.equal(await page.locator("#businessKnockUnitField").isVisible(), true, "unit mode must reveal its select");
    await page.locator("#businessKnockMode").selectOption("untouched");
    assert.equal(await page.locator("#businessKnockUnitField").isVisible(), false, "leaving unit mode must hide its select again");
    const targetHeights = await page.locator("#businessKnockPanel button, #businessKnockPanel select").evaluateAll((nodes) => nodes
      .filter((node) => !node.closest("[hidden]") && node.getBoundingClientRect().height > 0)
      .map((node) => Math.round(node.getBoundingClientRect().height)));
    assert.ok(targetHeights.every((height) => height >= 44), `touch target under 44px: ${targetHeights.join(", ")}`);
    assert.equal(await horizontalOverflow(page), 0);

    // Fresh, untouched starts must select precisely the requested unique count.
    for (const size of [10, 20, 50, 100]) {
      await resetKnockState(page);
      const saved = await startKnock(page, { mode: "untouched", size });
      assert.equal(saved.practicalDrill.planMode, "knock");
      assert.equal(saved.practicalDrill.sessionSize, size);
      assert.equal(saved.practicalDrill.queue.length, size);
      assert.equal(new Set(saved.practicalDrill.queue).size, size);
      assert.equal(saved.practicalDrill.sessionIds.length, size);
      await cancelKnock(page);
    }

    // A unit plan cannot leak a question from another unit.
    await resetKnockState(page);
    const unitId = await page.locator("#businessKnockUnit option").nth(3).getAttribute("value");
    const unitSaved = await startKnock(page, { mode: "unit", unitId, size: 100 });
    const unitQueue = await page.evaluate((ids) => ids.map((id) => window.TAKKEN_BUSINESS_FULLSCORE_BANK.QUESTIONS_BY_ID[id].unitId), unitSaved.practicalDrill.queue);
    assert.ok(unitQueue.length > 0);
    assert.ok(unitQueue.every((value) => value === unitId), `unit leak: ${JSON.stringify(unitQueue)}`);
    await cancelKnock(page);

    // Weak/due must place a true retry before a due item.
    const fixture = await page.evaluate(() => {
      const [retry, due] = window.TAKKEN_BUSINESS_FULLSCORE_BANK.QUESTIONS;
      const now = new Date();
      const twoDaysAgo = new Date(now); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
      return {
        retry: retry.id,
        due: due.id,
        history: {
          [retry.id]: { attempts: 1, wrong: 1, correct: 0, uncertain: 0, lastConfidence: "wrong", lastAnsweredAt: now.toISOString(), reviewLevel: 0, masteryDueKey: "", confidentDayKeys: [] },
          [due.id]: { attempts: 1, wrong: 0, correct: 1, uncertain: 0, lastConfidence: "confident", lastAnsweredAt: twoDaysAgo.toISOString(), reviewLevel: 1, masteryDueKey: yesterday.toISOString().slice(0, 10), confidentDayKeys: [twoDaysAgo.toISOString().slice(0, 10)] }
        }
      };
    });
    await resetKnockState(page, fixture.history);
    const weakDue = await startKnock(page, { mode: "weak-due", size: 10 });
    assert.deepEqual(weakDue.practicalDrill.queue.slice(0, 2), [fixture.retry, fixture.due]);
    await cancelKnock(page);

    // Random 100 is still a complete, duplicate-free sampled set.
    await resetKnockState(page);
    const random100 = await startKnock(page, { mode: "all-random", size: 100 });
    assert.equal(random100.practicalDrill.queue.length, 100);
    assert.equal(new Set(random100.practicalDrill.queue).size, 100);
    const stableSession = {
      queue: [...random100.practicalDrill.queue],
      key: random100.practicalDrill.presentationKey,
      position: random100.practicalDrill.position,
      attempt: random100.practicalDrill.currentAttempt,
      question: await currentPresented(page),
      choices: await page.locator(".practical-drill-choice").allTextContents()
    };
    // Clicking the launcher while active must resume instead of replacing the session.
    await page.locator("#businessKnockStart").click();
    let saved = await readSavedState(page);
    assert.deepEqual(saved.practicalDrill.queue, stableSession.queue);
    assert.equal(saved.practicalDrill.presentationKey, stableSession.key);
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    saved = await readSavedState(page);
    assert.deepEqual(saved.practicalDrill.queue, stableSession.queue);
    assert.equal(saved.practicalDrill.presentationKey, stableSession.key);
    assert.equal(saved.practicalDrill.position, stableSession.position);
    assert.deepEqual(await page.locator(".practical-drill-choice").allTextContents(), stableSession.choices);
    assert.deepEqual(await currentPresented(page), stableSession.question);
    await cancelKnock(page);

    // Complete a normal set. Correct same-day repetitions begin (but do not leap)
    // the spaced-repetition chain; wrong/uncertain cases are separately exercised below.
    await resetKnockState(page);
    const firstCycle = await startKnock(page, { mode: "untouched", size: 10 });
    const firstCycleKey = firstCycle.practicalDrill.presentationKey;
    for (let index = 0; index < 10; index += 1) await answerAndAdvance(page, "confident");
    await page.locator("#practicalDrillComplete").waitFor({ state: "visible" });
    saved = await readSavedState(page);
    assert.equal(saved.practicalDrill.stage, "complete");
    firstCycle.practicalDrill.sessionIds.forEach((id) => {
      assert.equal(saved.practicalDrill.history[id].reviewLevel, 1, "same-day correct answers must only establish level 1");
      assert.equal(saved.practicalDrill.history[id].confidentDayKeys.length, 1);
    });
    await page.locator("#practicalDrillRestartButton").click();
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    const secondCycle = await readSavedState(page);
    assert.equal(secondCycle.practicalDrill.planMode, "knock");
    assert.notEqual(secondCycle.practicalDrill.presentationKey, firstCycleKey);
    const choiceOrderChanged = await page.evaluate(({ firstKey, secondKey }) => window.TAKKEN_BUSINESS_FULLSCORE_BANK.QUESTIONS.some((question) => {
      const a = window.TAKKEN_BUSINESS_FULLSCORE_BANK.presentQuestion(question, firstKey).choices.join("|");
      const b = window.TAKKEN_BUSINESS_FULLSCORE_BANK.presentQuestion(question, secondKey).choices.join("|");
      return a !== b;
    }), { firstKey: firstCycleKey, secondKey: secondCycle.practicalDrill.presentationKey });
    assert.equal(choiceOrderChanged, true, "a new knock cycle must rotate at least one question's choices");
    await cancelKnock(page);

    // Both an outright miss and an uncertain correct answer repeat before completing,
    // then return to a single same-day mastery level rather than inflating it.
    await resetKnockState(page);
    await startKnock(page, { mode: "all-random", size: 10 });
    const retries = await completeTenWithTwoRetries(page);
    saved = retries.saved;
    assert.equal(saved.practicalDrill.history[retries.wrong.id].wrong, 1);
    assert.equal(saved.practicalDrill.history[retries.uncertain.id].uncertain, 1);
    assert.equal(saved.practicalDrill.history[retries.wrong.id].lastConfidence, "confident");
    assert.equal(saved.practicalDrill.history[retries.uncertain.id].lastConfidence, "confident");
    assert.equal(saved.practicalDrill.history[retries.wrong.id].reviewLevel, 1);
    assert.equal(saved.practicalDrill.history[retries.uncertain.id].reviewLevel, 1);
    assert.equal(saved.practicalDrill.retryIds.length, 0);
    const persistedPreset = { ...saved.practicalDrill.knockPreset };
    await page.locator("#practicalDrillChangeButton").click();
    saved = await readSavedState(page);
    assert.equal(saved.practicalDrill.stage, "idle");
    assert.deepEqual(saved.practicalDrill.knockPreset, persistedPreset, "cancel/settings must preserve the next knock preset");
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    saved = await readSavedState(page);
    assert.deepEqual(saved.practicalDrill.knockPreset, persistedPreset);

    assert.equal(await horizontalOverflow(page), 0);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.locator("#businessKnockPanel").scrollIntoViewIfNeeded();
    assert.equal(await horizontalOverflow(page), 0);
    const compactHeights = await page.locator("#businessKnockPanel button, #businessKnockPanel select").evaluateAll((nodes) => nodes
      .filter((node) => !node.closest("[hidden]") && node.getBoundingClientRect().height > 0)
      .map((node) => Math.round(node.getBoundingClientRect().height)));
    assert.ok(compactHeights.every((height) => height >= 44), `320px touch target under 44px: ${compactHeights.join(", ")}`);

    // The dojo is additive: a missing planner asset must disable only the dojo,
    // while the existing 134-question mastery route remains usable.
    const fallbackPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await fallbackPage.route(/business-knock\.js/, (route) => route.abort());
    await fallbackPage.goto(reviewUrl(local.baseUrl), { waitUntil: "networkidle", timeout: 20000 });
    await fallbackPage.waitForFunction(() => document.querySelectorAll("#businessMasteryGrid article").length === 11);
    assert.equal(await fallbackPage.locator("#businessMasteryFull").isDisabled(), false, "core 134-question route must survive a missing knock planner");
    assert.equal(await fallbackPage.locator("#businessKnockStart").isDisabled(), true, "only the knock launcher must fail closed");
    await fallbackPage.close();

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "ok", plannerSizes: [10, 20, 50, 100], unitFiltered: true, weakDuePrioritized: true, random100Unique: true, reloadPreserved: true, retryLoop: true, sameDayLevelCapped: true, coreFallbackWithoutKnock: true, overflow390: 0, overflow320: 0, errors: 0 }));
  } finally {
    await browser.close();
    await local.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
