#!/usr/bin/env node
"use strict";

// Focused regression coverage for the normal Quest loop.  Every run gets an
// isolated review namespace, so it never reads or changes a learner's save.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function serve(root) {
  const safeRoot = path.resolve(root);
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
      .replace(/^\/$/, "/index.html").replace(/^\/+/, "");
    const target = path.resolve(safeRoot, relative);
    if (!target.startsWith(`${safeRoot}${path.sep}`)) return response.writeHead(403).end();
    fs.readFile(target, (error, body) => {
      if (error) return response.writeHead(404).end();
      const ext = path.extname(target);
      const type = ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : "text/html";
      response.writeHead(200, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
      response.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({
      url: `http://127.0.0.1:${server.address().port}/`,
      close: () => new Promise((done) => server.close(done))
    }));
  });
}

function reviewUrl(baseUrl, name) {
  const url = new URL(baseUrl);
  url.searchParams.set("review", `quest-core-${name}-${Date.now().toString(36)}`);
  return url.toString();
}

async function save(page) {
  return page.evaluate(() => {
    const namespace = String(new URL(location.href).searchParams.get("review") || "default")
      .replace(/[^a-z0-9-]/gi, "").slice(0, 24);
    const key = `takken-battle-study-clean-v2-hard-review-${namespace}`;
    if (!localStorage.getItem(key)) throw new Error("isolated review save was not created");
    return { key, state: JSON.parse(localStorage.getItem(key)) };
  });
}

async function currentAnswer(page) {
  return page.evaluate(() => {
    const id = document.querySelector("#quizCard")?.dataset.questionId || "";
    const question = window.TAKKEN_EXAM_QUESTIONS?.[id];
    if (!question) throw new Error(`normal Quest question unavailable: ${id || "none"}`);
    return { id, answer: question.answer };
  });
}

async function answerCorrect(page) {
  const { answer } = await currentAnswer(page);
  await page.locator(`.choice-button[data-index="${answer}"]`).click();
}

async function outlineWidth(locator) {
  await locator.focus();
  return locator.evaluate((node) => parseFloat(getComputedStyle(node).outlineWidth) || 0);
}

(async () => {
  const local = process.env.TAKKEN_BASE_URL ? null : await serve(process.cwd());
  const baseUrl = process.env.TAKKEN_BASE_URL || local.url;
  const chromePath = process.env.TAKKEN_CHROME_PATH || "";
  const browser = await chromium.launch(chromePath
    ? { executablePath: chromePath, headless: true }
    : { channel: "chrome", headless: true });
  const errors = [];
  const wireErrors = (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  };
  try {
    // A normal two-question foundation unit must land on an actual result view,
    // retain it through reload, and let the learner enter the next unit.
    const completion = await browser.newPage({ viewport: { width: 1280, height: 900 }, timezoneId: "Asia/Tokyo" });
    wireErrors(completion);
    await completion.goto(reviewUrl(baseUrl, "completion"), { waitUntil: "networkidle" });
    await completion.waitForFunction(() => (document.querySelector("#dailyQuestSource")?.textContent || "").includes("読後2問"));
    const initial = await save(completion);
    assert.equal(initial.state.daily.planMode, "unit");
    assert.equal(initial.state.daily.planIds.length, 2);
    await answerCorrect(completion);
    await completion.locator("#feedbackBox").waitFor({ state: "visible" });
    await completion.locator("#dockNextButton").click();
    await completion.waitForFunction(() => (document.querySelector("#roundLabel")?.textContent || "").includes("2 / 2"));
    await answerCorrect(completion);
    await completion.locator("#feedbackBox").waitFor({ state: "visible" });
    await completion.locator("#dockNextButton").click();
    await completion.locator("#chapterNextButton").waitFor({ state: "visible" });
    assert.match(await completion.locator("[data-chapter-result]").textContent(), /01-01 宅建業法の基本/);
    await completion.reload({ waitUntil: "networkidle" });
    await completion.locator("#chapterNextButton").waitFor({ state: "visible" });
    await completion.locator("#chapterNextButton").click();
    await completion.waitForFunction(() => (document.querySelector("#foundationRouteTitle")?.textContent || "").includes("01-02 免許"));
    await completion.close();

    // A bounded batch from a large unit must report only the questions just
    // completed and keep the learner in that unit while untouched items remain.
    const batch = await browser.newPage({ viewport: { width: 1280, height: 900 }, timezoneId: "Asia/Tokyo" });
    wireErrors(batch);
    await batch.goto(reviewUrl(baseUrl, "large-batch"), { waitUntil: "networkidle" });
    await batch.evaluate(() => {
      const namespace = String(new URL(location.href).searchParams.get("review") || "default")
        .replace(/[^a-z0-9-]/gi, "").slice(0, 24);
      const key = `takken-battle-study-clean-v2-hard-review-${namespace}`;
      const saved = JSON.parse(localStorage.getItem(key));
      const chapters = Object.values(window.TAKKEN_EXAM_BLUEPRINT.textbookRanges)
        .flatMap((range) => range.chapters);
      const targetIndex = chapters.findIndex((chapter) => chapter.id === "business-book-07");
      if (targetIndex < 0) throw new Error("large foundation unit is unavailable");
      const stamp = new Date().toISOString();
      chapters.slice(0, targetIndex).flatMap((chapter) => chapter.ids).forEach((id) => {
        saved.questionStats[id] = {
          ...(saved.questionStats[id] || {}),
          attempts: 1,
          correct: 1,
          wrong: 0,
          lastAnsweredAt: stamp,
          lastCorrectAt: stamp
        };
      });
      saved.daily = {
        ...saved.daily,
        planIds: [],
        planMode: "",
        planUnitId: "",
        answers: 0,
        target: 10
      };
      saved.answered = null;
      saved.finished = false;
      localStorage.setItem(key, JSON.stringify(saved));
    });
    await batch.reload({ waitUntil: "networkidle" });
    await batch.waitForFunction(() =>
      (document.querySelector("#dailyQuestSource")?.textContent || "").includes("読後4問")
    );
    const largePlan = (await save(batch)).state.daily;
    assert.equal(largePlan.planUnitId, "business-book-07");
    assert.equal(largePlan.planIds.length, 4);
    await batch.locator(".quest-card > .quest-compact-summary").click();
    await batch.locator("#dailyQuestButton").click();
    await batch.waitForFunction((id) =>
      document.querySelector("#quizCard")?.dataset.questionId === id,
    largePlan.planIds[0]);
    for (let index = 0; index < 4; index += 1) {
      await answerCorrect(batch);
      await batch.locator("#feedbackBox").waitFor({ state: "visible" });
      await batch.locator("#dockNextButton").click();
      if (index < 3) {
        await batch.waitForFunction((position) =>
          (document.querySelector("#roundLabel")?.textContent || "").includes(`${position} / 4`),
        index + 2);
      }
    }
    await batch.locator("[data-chapter-result='business-book-07']").waitFor({ state: "visible" });
    const batchResult = await batch.locator("[data-chapter-result='business-book-07']").textContent();
    assert.match(batchResult, /今回の読後\s*4問/, batchResult);
    assert.match(batchResult, /単元接触\s*4\s*\/\s*15問/, batchResult);
    assert.match(batchResult, /残り11問/, batchResult);
    assert.doesNotMatch(batchResult, /15\s*\/\s*15/, batchResult);
    assert.match(await batch.locator("#chapterNextButton").textContent(), /読後4問を始める/);
    await batch.close();

    // Crossing JST midnight while a result is open must exit yesterday's
    // completion view and initialize the new day's normal Quest state.
    const rollover = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
    wireErrors(rollover);
    await rollover.clock.install({ time: new Date("2026-08-25T14:59:45.000Z") });
    await rollover.goto(reviewUrl(baseUrl, "rollover"), { waitUntil: "networkidle" });
    await rollover.waitForFunction(() => (document.querySelector("#dailyQuestSource")?.textContent || "").includes("読後2問"));
    await answerCorrect(rollover);
    await rollover.locator("#dockNextButton").click();
    await answerCorrect(rollover);
    await rollover.locator("#dockNextButton").click();
    await rollover.locator("[data-chapter-result]").waitFor({ state: "visible" });
    await rollover.clock.fastForward("00:00:20");
    await rollover.waitForFunction(() => !document.querySelector("[data-chapter-result]"));
    const rolledState = (await save(rollover)).state;
    assert.equal(rolledState.finished, false, "day rollover left the Quest finished");
    assert.equal(rolledState.questCompletion, null, "day rollover kept yesterday's result");
    assert.ok(await rollover.locator("#quizCard").getAttribute("data-question-id"), "new-day quiz did not render");
    await rollover.close();

    // A write failure may not award points or reveal a false answer receipt.
    const persistence = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
    wireErrors(persistence);
    await persistence.goto(reviewUrl(baseUrl, "save-failure"), { waitUntil: "networkidle" });
    const before = (await save(persistence)).state;
    const target = await currentAnswer(persistence);
    await persistence.evaluate(() => {
      window.__takkenOriginalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function forcedQuestSaveFailure(key) {
        if (String(key).startsWith("takken-battle-study-clean-v2-hard-review-")) throw new Error("forced local save failure");
        return window.__takkenOriginalSetItem.apply(this, arguments);
      };
    });
    await persistence.locator(`.choice-button[data-index="${target.answer}"]`).click();
    await persistence.waitForFunction(() => /保存.*(できません|失敗)/.test(document.body.innerText));
    assert.equal(await persistence.locator("#feedbackBox").isHidden(), true, "failed answer must not show feedback");
    await persistence.evaluate(() => { Storage.prototype.setItem = window.__takkenOriginalSetItem; });
    const afterFailure = (await save(persistence)).state;
    assert.equal(afterFailure.attempts, before.attempts, "failed answer changed total attempts");
    assert.equal(afterFailure.correct, before.correct, "failed answer changed correct count");
    assert.equal(afterFailure.totalXp, before.totalXp, "failed answer awarded XP");
    assert.equal(afterFailure.crystals, before.crystals, "failed answer awarded crystals");
    assert.deepEqual(afterFailure.questionStats[target.id] || null, before.questionStats[target.id] || null, "failed answer changed question history");
    await persistence.locator(`.choice-button[data-index="${target.answer}"]`).click();
    await persistence.locator("#feedbackBox").waitFor({ state: "visible" });
    assert.equal((await save(persistence)).state.attempts, before.attempts + 1, "retry did not persist");
    await persistence.close();

    // Four-statement/count questions must be scannable without duplicating the
    // statements in the lead paragraph or forcing horizontal scrolling.
    const statement = await browser.newPage({ viewport: { width: 320, height: 700 }, timezoneId: "Asia/Tokyo" });
    wireErrors(statement);
    await statement.goto(reviewUrl(baseUrl, "statements"), { waitUntil: "networkidle" });
    await statement.locator("#themeDrawer > summary").click();
    const countChapterValue = await statement.locator("#chapterSelect option")
      .filter({ hasText: "02-03 代理" }).getAttribute("value");
    assert.ok(countChapterValue, "count-question chapter is unavailable");
    await statement.locator("#chapterSelect").selectOption(countChapterValue);
    await statement.locator(".core-statement-prompt").waitFor({ state: "visible" });
    const statementLayout = await statement.evaluate(() => ({
      prompt: document.querySelectorAll(".core-statement-prompt").length,
      cards: document.querySelectorAll(".core-statement-prompt .core-statement-prompt-item").length,
      lead: document.querySelector("#questionText")?.textContent || "",
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      leadHasStatement: /^ア[\s　]/m.test(document.querySelector("#questionText")?.textContent || "")
    }));
    assert.equal(statementLayout.prompt, 1, JSON.stringify({ statementLayout, errors }));
    assert.equal(statementLayout.cards, 4, JSON.stringify(statementLayout));
    assert.equal(statementLayout.leadHasStatement, false, "statement text is duplicated in #questionText");
    assert.equal(statementLayout.overflow, 0, JSON.stringify(statementLayout));
    await statement.close();

    // Compact controls must remain touch-sized and keyboard-visible at 320px.
    const mobile = await browser.newPage({ viewport: { width: 320, height: 700 }, timezoneId: "Asia/Tokyo" });
    wireErrors(mobile);
    await mobile.goto(reviewUrl(baseUrl, "mobile-controls"), { waitUntil: "networkidle" });
    await mobile.locator(".quest-card > .quest-compact-summary").click();
    await mobile.locator(".collection-drawer > summary").click();
    await mobile.locator("#themeDrawer > summary").click();
    const controls = {
      quick: mobile.locator("#dailyQuestButton"),
      route: mobile.locator(".route-node").first(),
      armory: mobile.locator("#armoryButton")
    };
    for (const [name, locator] of Object.entries(controls)) {
      const metrics = await locator.evaluate((node) => ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height
      }));
      assert.ok(metrics.width >= 44 && metrics.height >= 44, `${name} target is below 44px: ${JSON.stringify(metrics)}`);
      assert.ok(await outlineWidth(locator) >= 3, `${name} focus ring is below 3px`);
    }
    assert.equal(await mobile.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth)), 0);
    const archive = mobile.locator(".chapter-optional > summary");
    assert.match(await archive.textContent(), /(アーカイブ|参考用)/, "legacy group is not marked archive/reference");
    assert.match(await archive.textContent(), /定着判定外/, "legacy group does not exclude current mastery");
    await mobile.close();

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "ok", coverage: ["unit-completion", "unit-batch-totals", "day-rollover", "save-rollback", "structured-statements", "mobile-targets", "archive-label"] }));
  } finally {
    await browser.close();
    if (local) await local.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
