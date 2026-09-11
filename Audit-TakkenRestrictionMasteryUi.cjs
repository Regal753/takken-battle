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

async function completeRestrictionGrounding(page, { required = true } = {}) {
  const checklist = page.locator("#practicalGroundingChecklist");
  if (!(await checklist.isVisible())) {
    assert.equal(required, false, "precision question must expose the grounding checklist");
    return false;
  }
  await checklist.waitFor({ state: "visible" });
  const buttons = checklist.locator("[data-practical-grounding]");
  assert.equal(await buttons.count(), 4, "confident restriction answer requires four grounding axes");
  for (let index = 0; index < 4; index += 1) {
    await buttons.nth(index).click();
  }
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-practical-grounding]")]
      .every((button) => button.getAttribute("aria-pressed") === "true") &&
    document.querySelectorAll(".practical-drill-choice:enabled").length === 4
  );
  return true;
}

async function waitForApp(page) {
  await page.waitForFunction(() =>
    Boolean(document.querySelector("#restrictionMasteryPanel")) &&
    window.TAKKEN_SUBJECT_SPRINT_BANK?.VERSION >= 5
  );
}

async function main() {
  const server = await staticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  try {
    const review = `restrictionv50${Date.now().toString(36)}`;
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
      assert.equal(layout.heights.length, 5, `${width}px restriction action count`);
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
    await page.locator('[data-practical-forecast="confident"]').click();
    const groundingBefore = await page.evaluate(() => ({
      hidden: document.querySelector("#practicalGroundingChecklist")?.hidden,
      enabled: document.querySelectorAll(".practical-drill-choice:enabled").length
    }));
    assert.equal(groundingBefore.hidden, true, "standard eight-question diagnosis must not impose the precision-only grounding gate");
    assert.equal(groundingBefore.enabled, 4, "confident standard diagnosis unlocks choices");
    await page.locator('[data-practical-forecast="guess"]').click();
    assert.equal(await page.locator("#practicalGroundingChecklist").isHidden(), true, "guess route must not retain a confident grounding draft");
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
      await completeRestrictionGrounding(page, { required: false });
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
    await completeRestrictionGrounding(page, { required: false });
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

    await page.locator("#restrictionPrecisionStart").click();
    await page.waitForFunction((storageKey) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      return drill?.stage === "active" && drill?.scope === "restrictions" &&
        String(drill?.presentationKey || "").includes(":topic-precision:") && drill?.queue?.length === 8;
    }, key);
    const precision = await page.evaluate((storageKey) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      const questions = window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID;
      return drill.queue.map((id) => questions[id].sourceQuestionId).sort();
    }, key);
    assert.deepEqual(precision, ["rs015", "rs016", "rs017", "rs018", "rs019", "rs020", "rs021", "rs022"], "precision mode must be the boundary/actor eight");
    await page.locator('[data-practical-forecast="confident"]').click();
    assert.equal(await page.locator(".practical-drill-choice:enabled").count(), 0, "precision confidence alone must keep choices locked");
    await page.setViewportSize({ width: 320, height: 700 });
    const precisionMobile = await page.evaluate(() => ({
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      forecastLabel: document.querySelector("#practicalDrillForecast")?.getAttribute("aria-label"),
      checklistLabel: document.querySelector(".practical-grounding-actions")?.getAttribute("aria-label"),
      checklistVisible: !document.querySelector("#practicalGroundingChecklist")?.hidden,
      axisAria: [...document.querySelectorAll("[data-practical-grounding]")]
        .map((button) => button.getAttribute("aria-pressed")),
      visibleTargets: [...document.querySelectorAll("#practicalDrillSession button")]
        .filter((button) => !button.disabled && button.getBoundingClientRect().height > 0)
        .map((button) => Math.round(button.getBoundingClientRect().height))
    }));
    assert.equal(precisionMobile.overflow, 0, "320px precision session must not overflow");
    assert.equal(precisionMobile.checklistLabel, "自力で確認した根拠4点");
    assert.equal(precisionMobile.checklistVisible, true, "precision confidence exposes the four-point checklist on mobile");
    assert.deepEqual(precisionMobile.axisAria, ["false", "false", "false", "false"], "precision axes expose unselected ARIA state");
    assert.ok(precisionMobile.visibleTargets.every((height) => height >= 44), `320px precision target under 44px: ${precisionMobile.visibleTargets.join(",")}`);
    await completeRestrictionGrounding(page);
    const precisionAnswer = await page.evaluate((storageKey) => {
      const drill = JSON.parse(localStorage.getItem(storageKey) || "{}").practicalDrill;
      const id = drill.queue[drill.position];
      const question = window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID[id];
      return window.TAKKEN_SUBJECT_SPRINT_BANK.presentQuestion(question, drill.presentationKey).answer;
    }, key);
    const precisionChoice = page.locator(".practical-drill-choice").nth(precisionAnswer);
    await page.evaluate(() => document.fonts.ready);
    await precisionChoice.scrollIntoViewIfNeeded();
    await precisionChoice.click({ trial: true });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const precisionViewportBefore = await page.evaluate((answerIndex) => {
      window.__takkenPrecisionScrollOriginals = {
        by: window.scrollBy, to: window.scrollTo, reveal: Element.prototype.scrollIntoView
      };
      window.__takkenPrecisionScrollCalls = { corrections: [], scrolls: [], reveals: [] };
      window.scrollBy = function (...args) {
        window.__takkenPrecisionScrollCalls.corrections.push(args);
        return window.__takkenPrecisionScrollOriginals.by.apply(this, args);
      };
      window.scrollTo = function (...args) {
        window.__takkenPrecisionScrollCalls.scrolls.push(args);
        return window.__takkenPrecisionScrollOriginals.to.apply(this, args);
      };
      Element.prototype.scrollIntoView = function (...args) {
        window.__takkenPrecisionScrollCalls.reveals.push(args);
        return window.__takkenPrecisionScrollOriginals.reveal.apply(this, args);
      };
      const node = document.querySelectorAll(".practical-drill-choice")[answerIndex];
      const rect = node.getBoundingClientRect();
      return { scrollY: window.scrollY, top: rect.top, bottom: rect.bottom, absoluteTop: window.scrollY + rect.top, viewport: innerHeight };
    }, precisionAnswer);
    const scrollBeforePrecisionAnswer = precisionViewportBefore.scrollY;
    const precisionChoiceBox = await precisionChoice.boundingBox();
    assert.ok(precisionChoiceBox, "precision answer must have a visible click box");
    await page.mouse.click(
      precisionChoiceBox.x + precisionChoiceBox.width / 2,
      precisionChoiceBox.y + precisionChoiceBox.height / 2,
    );
    await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const precisionViewportAfter = await page.evaluate((answerIndex) => {
      const node = document.querySelectorAll(".practical-drill-choice")[answerIndex];
      const rect = node.getBoundingClientRect();
      const result = {
        scrollY: window.scrollY, top: rect.top, bottom: rect.bottom,
        absoluteTop: window.scrollY + rect.top, viewport: innerHeight,
        ...window.__takkenPrecisionScrollCalls,
        activeId: document.activeElement?.id || ""
      };
      window.scrollBy = window.__takkenPrecisionScrollOriginals.by;
      window.scrollTo = window.__takkenPrecisionScrollOriginals.to;
      Element.prototype.scrollIntoView = window.__takkenPrecisionScrollOriginals.reveal;
      delete window.__takkenPrecisionScrollOriginals;
      delete window.__takkenPrecisionScrollCalls;
      return result;
    }, precisionAnswer);
    const scrollAfterPrecisionAnswer = precisionViewportAfter.scrollY;
    assert.equal(precisionViewportAfter.activeId, "practicalDrillFeedback", "precision feedback must still receive accessible focus");
    assert.ok(precisionViewportAfter.corrections.length <= 2, "precision viewport correction must be bounded to two frames");
    assert.ok(precisionViewportAfter.corrections.every(([x, y]) => x === 0 && Number.isFinite(y)), "precision viewport correction must remain vertical and finite");
    assert.deepEqual(precisionViewportAfter.scrolls, [], "precision answer must not call window.scrollTo");
    assert.deepEqual(precisionViewportAfter.reveals, [], "precision answer must not reveal feedback by scrolling");
    assert.equal(await page.locator("#practicalDrillVerdict").getAttribute("role"), "status", "precision verdict must remain an announced status");
    assert.equal(await page.locator("#practicalDrillVerdict").getAttribute("aria-live"), "polite", "precision verdict must remain politely announced");
    assert.ok(
      Math.abs(precisionViewportAfter.top - precisionViewportBefore.top) <= 2 &&
        precisionViewportAfter.top >= -1 && precisionViewportAfter.bottom <= precisionViewportAfter.viewport + 1,
      `precision answer must preserve the selected-choice viewport: ${JSON.stringify({ precisionViewportBefore, precisionViewportAfter })}`
    );
    const fourPointFeedback = (await page.locator("#practicalDrillReasoning").textContent()).trim();
    ["区域・対象", "行為", "主体・手続", "数値・期限"].forEach((label) =>
      assert.match(fourPointFeedback, new RegExp(label), `precision feedback must expose ${label} grounding`)
    );
    await page.locator("#practicalDrillNextButton").click();
    await page.waitForFunction(() => {
      const prompt = document.querySelector("#practicalDrillPrompt");
      if (!prompt) return false;
      const rect = prompt.getBoundingClientRect();
      return Boolean(prompt.textContent.trim()) && rect.bottom > 0 && rect.top < innerHeight;
    });
    const nextPrompt = await page.evaluate(() => {
      const prompt = document.querySelector("#practicalDrillPrompt");
      const rect = prompt.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, viewport: innerHeight, text: prompt.textContent.trim() };
    });
    assert.ok(nextPrompt.text.length > 0, "next precision question must retain prompt text");
    assert.ok(
      nextPrompt.bottom > 0 && nextPrompt.top < nextPrompt.viewport,
      `320px next precision prompt must remain in viewport: ${JSON.stringify(nextPrompt)}`
    );
    assert.deepEqual(errors, []);
    await context.close();
    console.log(JSON.stringify({ status: "ok", session: started.distribution, guessedQuestion: first.id, errors: errors.length }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
