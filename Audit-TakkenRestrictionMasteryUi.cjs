#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function staticServer(root) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webp": "image/webp" };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`) && target !== path.join(path.resolve(root), "index.html")) {
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
    server.listen(0, "127.0.0.1", () => resolve({ baseUrl: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((done) => server.close(done)) }));
  });
}

function saveKey(review) { return `takken-battle-study-clean-v2-hard-review-${review}`; }

async function stored(page, key) {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || "{}"), key);
}

async function waitForApp(page) {
  await page.waitForFunction(() =>
    Boolean(document.querySelector("#restrictionMasteryPanel")) &&
    window.TAKKEN_SUBJECT_SPRINT_BANK?.VERSION >= 4
  );
}

async function main() {
  const server = await staticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  try {
    const review = `restrictionv49${Date.now().toString(36)}`;
    const key = saveKey(review);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const url = new URL(server.baseUrl); url.searchParams.set("review", review); url.searchParams.set("today", "1");
    await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(page);

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const layout = await page.evaluate(() => {
        const panel = document.querySelector("#restrictionMasteryPanel");
        const rect = panel.getBoundingClientRect();
        const style = getComputedStyle(panel);
        const actions = [...panel.querySelectorAll(".restriction-mastery-actions button")];
        return {
          overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
          hidden: Boolean(panel.hidden || panel.closest("[hidden]")),
          display: style.display,
          top: rect.top,
          heights: actions.map((button) => Math.round(button.getBoundingClientRect().height)),
          labels: actions.map((button) => button.textContent.trim())
        };
      });
      assert.equal(layout.overflow, 0, `${width}px restriction panel overflow`);
      assert.equal(layout.hidden, false, `${width}px restriction panel must be visible without PASS PLAN`);
      assert.notEqual(layout.display, "none", `${width}px restriction panel display`);
      assert.equal(layout.heights.length, 3, `${width}px restriction action count`);
      assert.ok(layout.heights.every((height) => height >= 44), `${width}px restriction action targets: ${layout.heights.join(",")}`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#restrictionExamStart").click();
    await page.waitForFunction((storageKey) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      return drill?.bankId === "subject-sprint" && drill?.stage === "active" && drill?.scope === "restrictions" && drill?.queue?.length === 8;
    }, key);
    const started = await page.evaluate((storageKey) => {
      const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
      const drill = state.practicalDrill;
      const questions = window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID;
      const sourceIds = drill.queue.map((id) => questions[id].sourceQuestionId);
      const topicFor = (sourceId) => {
        if (["l001", "l002", "l003", "l004", "rs001", "rs002"].includes(sourceId)) return "city";
        if (["l005", "l006", "l007", "l008", "rs003", "rs004"].includes(sourceId)) return "building";
        if (["l009", "l010", "rs005", "rs006"].includes(sourceId)) return "national";
        if (["l011", "l012", "rs007", "rs008"].includes(sourceId)) return "agriculture";
        if (["l013", "l014", "rs009", "rs010"].includes(sourceId)) return "readjustment";
        if (["l015", "l016", "rs011", "rs012"].includes(sourceId)) return "embankment";
        return "unexpected";
      };
      return { presentationKey: drill.presentationKey, sessionSize: drill.sessionSize, queue: drill.queue, sourceIds, distribution: sourceIds.reduce((counts, id) => ({ ...counts, [topicFor(id)]: (counts[topicFor(id)] || 0) + 1 }), {}) };
    }, key);
    assert.equal(started.sessionSize, 8);
    assert.equal(started.queue.length, 8);
    assert.match(started.presentationKey, /subject-sprint:restrictions:topic-exam:/, "exam session identity");
    assert.deepEqual(started.distribution, { city: 2, building: 2, national: 1, agriculture: 1, readjustment: 1, embankment: 1 });
    assert.equal(await page.locator(".practical-drill-choice:disabled").count(), 4, "forecast must lock choices");
    await page.locator('[data-practical-forecast="guess"]').click();
    assert.equal(await page.locator(".practical-drill-choice:enabled").count(), 4, "guess unlocks choices");
    const first = await page.evaluate((storageKey) => {
      const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
      const id = state.practicalDrill.queue[state.practicalDrill.position];
      return { id, answer: window.TAKKEN_SUBJECT_SPRINT_BANK.presentQuestion(window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID[id], state.practicalDrill.presentationKey).answer };
    }, key);
    await page.locator(".practical-drill-choice").nth(first.answer).click();
    await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
    const guessed = await stored(page, key);
    const history = guessed.practicalDrill.history[first.id];
    assert.equal(history.lastConfidence, "uncertain");
    assert.equal(history.lastPredictedConfidence, "guess");
    assert.equal(history.guessAnswers, 1);
    assert.ok(guessed.practicalDrill.retryIds.includes(first.id), "correct guess must retry");
    assert.equal((await page.locator("#restrictionMasteryGuesses").textContent()).trim(), "1", "mastery card records guess total");

    await page.locator("#practicalDrillNextButton").click();
    for (let answered = 1; answered < 8; answered += 1) {
      await page.locator('[data-practical-forecast="confident"]').click();
      const answer = await page.evaluate((storageKey) => {
        const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
        const drill = state.practicalDrill;
        const id = drill.queue[drill.position];
        return window.TAKKEN_SUBJECT_SPRINT_BANK.presentQuestion(
          window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID[id],
          drill.presentationOverrides?.[id] || drill.presentationKey
        ).answer;
      }, key);
      await page.locator(".practical-drill-choice").nth(answer).click();
      await page.locator("#practicalDrillNextButton").click();
    }
    await page.waitForFunction((storageKey) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      return drill?.stage === "retry" && Boolean(drill?.restrictionExamResult);
    }, key);
    const firstPassResult = (await stored(page, key)).practicalDrill.restrictionExamResult;
    assert.equal(firstPassResult.firstPassAnswered, 8);
    assert.equal(firstPassResult.firstPassCorrect, 8);
    assert.equal(firstPassResult.groundedCorrect, 7);
    assert.equal(firstPassResult.uncertainAnswers, 0);
    assert.equal(firstPassResult.guessAnswers, 1);
    assert.equal(firstPassResult.targetGroundedCorrect, 7);
    assert.equal(firstPassResult.targetElapsedMs, 12 * 60 * 1000);
    assert.equal(firstPassResult.passed, true);
    assert.match((await page.locator("#practicalDrillRetryStatus").textContent()).trim(), /^初回 \d{2}:\d{2} \/ 12:00・再出題 1$/);

    await page.locator('[data-practical-forecast="confident"]').click();
    const retryAnswer = await page.evaluate((storageKey) => {
      const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
      const drill = state.practicalDrill;
      const id = drill.queue[drill.position];
      return window.TAKKEN_SUBJECT_SPRINT_BANK.presentQuestion(
        window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID[id],
        drill.presentationOverrides?.[id] || drill.presentationKey
      ).answer;
    }, key);
    await page.locator(".practical-drill-choice").nth(retryAnswer).click();
    await page.locator("#practicalDrillNextButton").click();
    await page.locator("#practicalDrillComplete").waitFor({ state: "visible" });
    const completionText = (await page.locator("#practicalDrillCompleteText").textContent()).trim();
    assert.match(completionText, /初回は正答8\/8、根拠あり7\/8、迷い0・ヤマ勘1/);
    assert.match(completionText, /所要\d{2}:\d{2}\/12:00/);
    assert.match(completionText, /判定は合格圏目安/);

    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    await page.locator("#practicalDrillComplete").waitFor({ state: "visible" });
    assert.equal((await page.locator("#practicalDrillCompleteText").textContent()).trim(), completionText, "result survives reload");
    assert.deepEqual((await stored(page, key)).practicalDrill.restrictionExamResult, firstPassResult, "frozen result survives reload");

    await page.locator("#practicalDrillExitButton").click();
    await page.locator("#practicalDrillSession").waitFor({ state: "hidden" });
    assert.deepEqual((await stored(page, key)).practicalDrill.restrictionExamResult, firstPassResult, "latest diagnosis survives exit");

    await page.evaluate((storageKey) => {
      const state = JSON.parse(localStorage.getItem(storageKey) || "{}");
      state.practicalDrill.restrictionExamResult = {
        ...state.practicalDrill.restrictionExamResult,
        groundedCorrect: 6,
        elapsedMs: 12 * 60 * 1000 + 1,
        passed: true
      };
      localStorage.setItem(storageKey, JSON.stringify(state));
    }, key);
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    const normalizedFailure = (await stored(page, key)).practicalDrill.restrictionExamResult;
    assert.equal(normalizedFailure.groundedCorrect, 6);
    assert.equal(normalizedFailure.elapsedMs, 12 * 60 * 1000 + 1);
    assert.equal(normalizedFailure.passed, false, "normalization recomputes the 7/8 and 12-minute gate");
    assert.match((await page.locator("#restrictionMasteryStatus").textContent()).trim(), /要再診断/);

    await page.locator("#restrictionTopicOpen").click();
    await page.waitForFunction(() => document.querySelector("#passPlanPanel")?.open);
    await page.waitForTimeout(1000);
    const picker = await page.evaluate(() => ({
      focused: document.activeElement?.matches("[data-subject-sprint-topic]") || false,
      targetTop: document.querySelector(".restriction-catchup")?.getBoundingClientRect().top,
      viewport: innerHeight
    }));
    assert.ok(picker.targetTop >= -2 && picker.targetTop < picker.viewport, `topic picker must scroll restriction catch-up into view: ${JSON.stringify(picker)}`);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(JSON.stringify({ status: "ok", session: started.distribution, guessedQuestion: first.id, errors: errors.length }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
