#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function staticServer(root) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = path.resolve(root, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) {
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
    server.listen(0, "127.0.0.1", () => resolve({ baseUrl: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(done => server.close(done)) }));
  });
}

const saved = (page, key) => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), key);

async function currentQuestion(page, key) {
  return page.evaluate(storageKey => {
    const drill = JSON.parse(localStorage.getItem(storageKey)).practicalDrill;
    const id = drill.queue[drill.position];
    const question = window.TAKKEN_SUBJECT_SPRINT_BANK.presentQuestion(id, drill.presentationOverrides?.[id] || drill.presentationKey);
    return { id, answer: question.answer, sourceQuestionId: question.sourceQuestionId };
  }, key);
}

async function answer(page, key, confidence = "confident", wrong = false) {
  const question = await currentQuestion(page, key);
  await page.locator(`[data-practical-forecast="${confidence}"]`).click();
  await page.locator(".practical-drill-choice").nth(wrong ? (question.answer + 1) % 4 : question.answer).click();
  await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
  return question;
}

async function next(page) {
  await page.locator("#practicalDrillNextButton").click();
}

async function main() {
  const server = process.env.TAKKEN_BASE_URL ? { baseUrl: process.env.TAKKEN_BASE_URL, close: async () => {} } : await staticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const failures = [];
  const output = path.join(process.cwd(), "output", "playwright", "rights-knock");
  fs.mkdirSync(output, { recursive: true });
  let checks = 0;
  async function createFixture(label) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", error => failures.push(String(error)));
    page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
    const review = `rights${label}${Date.now().toString(36)}`;
    const key = `takken-battle-study-clean-v2-hard-review-${review}`;
    const url = new URL(server.baseUrl); url.searchParams.set("review", review); url.searchParams.set("today", "1");
    await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 20000 });
    await page.locator("#rightsMasteryTopic option").first().waitFor({ state: "attached" });
    return { context, page, key };
  }
  try {
    const { context, page, key } = await createFixture("main");
    assert.equal(await page.locator("#rightsMasteryTopic option").count(), 16);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => {
        const panel = document.querySelector("#rightsMasteryPanel");
        return {
          overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
          hidden: Boolean(panel.closest("[hidden]") || panel.hidden),
          heights: [...panel.querySelectorAll("button, select, summary")].map(node => Math.round(node.getBoundingClientRect().height)),
          pickerWidth: panel.querySelector("select").getBoundingClientRect().width,
          panelWidth: panel.getBoundingClientRect().width
        };
      });
      assert.equal(layout.overflow, 0, `${width}px overflow`);
      assert.equal(layout.hidden, false);
      assert.ok(layout.heights.every(height => height >= 44), `${width}px tap targets ${layout.heights}`);
      assert.ok(layout.pickerWidth <= layout.panelWidth);
      await page.locator("#rightsMasteryPanel").screenshot({ path: path.join(output, `panel-${width}.png`) });
      checks++;
    }

    await page.evaluate(storageKey => {
      const state = JSON.parse(localStorage.getItem(storageKey));
      state.practicalDrill.history["sprint-rights-r104"] = { attempts: 3, correct: 0, wrong: 3, lastConfidence: "wrong", lastAnsweredAt: "2026-09-20T09:00:00+09:00" };
      state.practicalDrill.history["sprint-law-l001"] = { attempts: 2, correct: 2, wrong: 0, lastConfidence: "confident", lastAnsweredAt: "2026-09-20T09:00:00+09:00" };
      localStorage.setItem(storageKey, JSON.stringify(state));
    }, key);
    await page.reload({ waitUntil: "networkidle" });
    const baseline = await saved(page, key);
    await page.locator("#rightsMasteryTwenty").click();
    const started = await saved(page, key);
    assert.equal(started.practicalDrill.sessionSize, 20);
    assert.equal(new Set(started.practicalDrill.queue).size, 20);
    assert.equal(started.practicalDrill.scope, "rights");
    assert.equal(started.practicalDrill.queue[0], "sprint-rights-r104", "known weakness must be selected first");
    assert.ok(started.practicalDrill.queue.every(id => id.startsWith("sprint-rights-")));
    assert.equal(await page.locator(".practical-drill-choice:disabled").count(), 4);
    assert.equal(await page.locator('[data-practical-forecast="guess"]:visible').count(), 1);
    checks++;

    const first = await answer(page, key, "confident", true);
    const answered = await saved(page, key);
    assert.equal(answered.practicalDrill.currentAttempt.predictedConfidence, "confident");
    assert.ok(answered.practicalDrill.retryIds.includes(first.id));
    assert.ok((await page.locator("#practicalDrillReasoning").textContent()).length > 40);
    await page.reload({ waitUntil: "networkidle" });
    const reloaded = await saved(page, key);
    assert.deepEqual(reloaded.practicalDrill.currentAttempt, answered.practicalDrill.currentAttempt);
    assert.deepEqual(reloaded.practicalDrill.queue, answered.practicalDrill.queue);
    const beforeResume = reloaded.practicalDrill;
    await page.locator("#rightsMasteryTwenty").click();
    assert.deepEqual((await saved(page, key)).practicalDrill, beforeResume, "resume must preserve the answered question");
    await next(page);
    const guessed = await answer(page, key, "guess");
    assert.ok((await saved(page, key)).practicalDrill.retryIds.includes(guessed.id), "correct guesses must retry");
    assert.equal((await saved(page, key)).practicalDrill.currentAttempt.confidence, "uncertain");
    assert.equal((await page.locator("#rightsMasteryGuesses").textContent()).trim(), "1");
    await next(page);
    const uncertain = await answer(page, key, "uncertain");
    assert.ok((await saved(page, key)).practicalDrill.retryIds.includes(uncertain.id));
    await next(page);
    checks++;

    while ((await saved(page, key)).practicalDrill.stage === "active") {
      await answer(page, key);
      await next(page);
    }
    const retry = (await saved(page, key)).practicalDrill;
    assert.equal(retry.stage, "retry");
    assert.deepEqual(new Set(retry.queue), new Set([first.id, guessed.id, uncertain.id]));
    assert.equal((await currentQuestion(page, key)).id, first.id);
    assert.notEqual((await currentQuestion(page, key)).answer, first.answer, "retry changes the correct choice position");
    while ((await saved(page, key)).practicalDrill.stage === "retry") {
      await answer(page, key);
      await next(page);
    }
    const completed = await saved(page, key);
    assert.equal(completed.practicalDrill.stage, "complete");
    assert.deepEqual(completed.practicalDrill.history["sprint-law-l001"], baseline.practicalDrill.history["sprint-law-l001"], "unrelated law progress stays intact");
    assert.equal((await page.locator("#rightsMasteryRetained").textContent()).trim(), "0 / 44", "same-day retries do not imply retention");
    checks++;

    await page.locator("#rightsMasteryFresh").click();
    const fresh = await saved(page, key);
    assert.equal(fresh.practicalDrill.sessionSize, 20);
    assert.ok(fresh.practicalDrill.queue.every(id => !started.practicalDrill.sessionIds.includes(id)), "fresh mode excludes contacted questions");
    assert.ok(fresh.practicalDrill.presentationKey.includes(":topic-untouched:"));
    await context.close();
    checks++;

    const themes = await createFixture("themes");
    const themeIds = await themes.page.locator("#rightsMasteryTopic option").evaluateAll(options => options.map(option => option.value));
    const covered = [];
    for (const themeId of themeIds) {
      await themes.page.locator("#rightsMasteryTopic").selectOption(themeId);
      await themes.page.locator("#rightsMasteryTopicStart").click();
      const state = await saved(themes.page, themes.key);
      assert.ok(state.practicalDrill.presentationKey.includes(`:topic-${themeId}:`));
      assert.ok(state.practicalDrill.queue.length >= 1 && state.practicalDrill.queue.length <= 4);
      covered.push(...state.practicalDrill.queue);
      while (["active", "retry"].includes((await saved(themes.page, themes.key)).practicalDrill.stage)) {
        await answer(themes.page, themes.key);
        await next(themes.page);
      }
    }
    const expectedIds = await themes.page.evaluate(() => window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS.filter(question => question.sectionId === "rights").map(question => question.id));
    assert.deepEqual([...covered].sort(), [...expectedIds].sort(), "all 44 source questions belong to exactly one theme");
    assert.equal(new Set(covered).size, 44);
    assert.equal(await themes.page.locator("#rightsMasteryFresh").isDisabled(), true);
    assert.equal((await themes.page.locator("#rightsMasteryGrounded").textContent()).trim(), "44 / 44");
    await themes.page.locator("#rightsMasteryAll").click();
    assert.equal((await saved(themes.page, themes.key)).practicalDrill.queue.length, 44);
    await themes.context.close();
    checks++;

    const legacy = await createFixture("legacy");
    if (!(await legacy.page.locator("#passPlanPanel").evaluate(panel => panel.open))) {
      await legacy.page.locator("#passPlanPanel > summary").click();
    }
    await legacy.page.locator('[data-subject-sprint="rights"]').click();
    assert.equal((await saved(legacy.page, legacy.key)).practicalDrill.queue.length, 44);
    assert.equal(await legacy.page.locator("#practicalDrillForecast").isVisible(), false, "old rights sets keep their answer flow");
    const legacyQuestion = await currentQuestion(legacy.page, legacy.key);
    await legacy.page.locator(".practical-drill-choice").nth(legacyQuestion.answer).click();
    await legacy.page.locator('[data-practical-confidence="confident"]').click();
    const legacyAnswered = (await saved(legacy.page, legacy.key)).practicalDrill;
    await legacy.page.reload({ waitUntil: "networkidle" });
    assert.deepEqual((await saved(legacy.page, legacy.key)).practicalDrill, legacyAnswered);
    await legacy.context.close();
    checks++;

    assert.deepEqual(failures, [], "browser console/page errors");
    console.log(JSON.stringify({ status: "ok", checks, viewports: [1280, 390, 320], questions: 44, themes: 16, errors: failures.length, screenshots: output }));
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
