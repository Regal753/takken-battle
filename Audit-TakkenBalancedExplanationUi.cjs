#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vm = require("node:vm");
const { chromium } = require("playwright");

const root = __dirname;
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const orderMatch = appSource.match(/const LEGACY_ORDER = \[([\s\S]*?)\n  \];/);
if (!orderMatch) throw new Error("LEGACY_ORDER not found in app.js");
const legacyOrder = vm.runInNewContext(`[${orderMatch[1]}]`);

global.window = {};
require("./question-bank.js");
const balance = require("./question-balance.js");
const balanced = balance.rebalanceQuestions({ questions: window.TAKKEN_QUESTIONS, order: legacyOrder });
const expectedQuestion = balanced.questions.q117;
if (!expectedQuestion || expectedQuestion.balanceSourceFormat !== "個数問題") {
  throw new Error("q117 is no longer a count-to-single regression fixture");
}
if (!expectedQuestion.choiceOriginIndexes.some((origin, index) => origin !== index)) {
  throw new Error("q117 must retain a nonidentity display order");
}

const expectedTruths = expectedQuestion.choiceExplanations.map((line) => /○/.test(line));

function startStaticServer() {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".webp": "image/webp"
  };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`) && target !== path.join(root, "index.html")) {
      response.writeHead(403).end("forbidden");
      return;
    }
    fs.readFile(target, (error, body) => {
      if (error) {
        response.writeHead(404).end("not found");
        return;
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
      close: () => new Promise((done) => server.close(done))
    }));
  });
}

async function overflow(page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
}

async function uiFixture(page) {
  return page.evaluate(() => ({
    question: document.querySelector("#questionText")?.textContent || "",
    choices: [...document.querySelectorAll("#choices .choice-button .choice-text")].map((node) => node.textContent),
    statements: [...document.querySelectorAll(".cut-check-row .cut-check-copy p")].map((node) => node.textContent),
    buttons: [...document.querySelectorAll(".cut-check-row")].map((row) =>
      [...row.querySelectorAll(".cut-check-button")].map((button) => ({
        text: button.textContent,
        label: button.getAttribute("aria-label"),
        pressed: button.getAttribute("aria-pressed")
      }))
    )
  }));
}

async function main() {
  const server = await startStaticServer();
  const browser = await chromium.launch({
    ...(process.env.TAKKEN_CHROME_PATH
      ? { executablePath: process.env.TAKKEN_CHROME_PATH }
      : { channel: "chrome" }),
    headless: true
  });
  try {
    const context = await browser.newContext({
      serviceWorkers: "block",
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      viewport: { width: 390, height: 844 }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(String(error)));
    const review = `balanced-explanation-${Date.now().toString(36)}`;
    const url = new URL(server.baseUrl);
    url.searchParams.set("review", review);
    url.searchParams.set("today", "1");
    await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 20000 });
    const storageId = await page.evaluate(() => Object.keys(localStorage).find((key) =>
      key.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !key.includes("backup") && !key.includes("-before-") &&
      !key.includes("previous") && !key.includes("corrupt") &&
      !key.endsWith("event-outbox")
    ));
    assert.ok(storageId, "review save state was not initialized");

    await page.evaluate(({ key, id, legacyIndex }) => {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
      const studyPrefix = [
        ...(blueprint?.curriculumOrder || []),
        ...(blueprint?.supplementalOrder || [])
      ].length;
      saved.examContentVersion = blueprint?.version || saved.examContentVersion;
      saved.index = studyPrefix + legacyIndex;
      saved.answered = null;
      saved.activeCutCheck = null;
      saved.runMode = "quest";
      saved.marked = { ...(saved.marked || {}), [id]: true };
      saved.autoMarked = { ...(saved.autoMarked || {}), [id]: true };
      saved.questionStats = { ...(saved.questionStats || {}) };
      delete saved.questionStats[id];
      saved.daily = { ...(saved.daily || {}), answers: Math.max(1, Number(saved.daily?.answers) || 0) };
      localStorage.setItem(key, JSON.stringify(saved));
    }, { key: storageId, id: expectedQuestion.id, legacyIndex: legacyOrder.indexOf(expectedQuestion.id) });
    const fixtureUrl = new URL(page.url());
    fixtureUrl.searchParams.delete("today");
    await page.goto(fixtureUrl.toString(), { waitUntil: "networkidle" });
    try {
      await page.locator(".cut-check-panel").waitFor({ state: "visible" });
    } catch (error) {
      const diagnostic = await page.evaluate((key) => {
        const saved = JSON.parse(localStorage.getItem(key) || "{}");
        return {
          index: saved.index,
          marked: saved.marked?.q117,
          runMode: saved.runMode,
          question: document.querySelector("#questionText")?.textContent || "",
          choiceCount: document.querySelectorAll("#choices .choice-button").length
        };
      }, storageId);
      throw new Error(`balanced explanation fixture did not render: ${JSON.stringify(diagnostic)}`, { cause: error });
    }

    const initial = await uiFixture(page);
    assert.match(initial.question, /宅建業に当たる行為/);
    assert.deepEqual(initial.choices, expectedQuestion.choices, "displayed choices must retain balanced order");
    assert.deepEqual(initial.statements, expectedQuestion.choices, "weakness statements must match balanced choices order");
    assert.deepEqual(initial.buttons, expectedTruths.map((unused, index) => [
      { text: "○", label: `肢${index + 1}を正しいと判定`, pressed: "false" },
      { text: "×", label: `肢${index + 1}を誤りと判定`, pressed: "false" }
    ]), "all weak-check buttons must expose their accessible label and initial aria-pressed state");
    assert.equal(await overflow(page), 0, "390px weak-check screen must not horizontally overflow");

    await page.locator(".cut-check-row").first().locator(".cut-check-button").nth(expectedTruths[0] ? 0 : 1).click();
    const selected = await uiFixture(page);
    assert.deepEqual(selected.buttons[0], expectedTruths[0]
      ? [
          { text: "○", label: "肢1を正しいと判定", pressed: "true" },
          { text: "×", label: "肢1を誤りと判定", pressed: "false" }
        ]
      : [
          { text: "○", label: "肢1を正しいと判定", pressed: "false" },
          { text: "×", label: "肢1を誤りと判定", pressed: "true" }
        ], "selection must update aria-pressed without losing the accessible label");

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".cut-check-panel").waitFor({ state: "visible" });
    const reloaded = await uiFixture(page);
    assert.deepEqual(reloaded.statements, expectedQuestion.choices, "reload must retain the aligned statements");
    assert.deepEqual(reloaded.buttons[0], selected.buttons[0], "reload must retain aria-pressed selection");
    assert.equal(await overflow(page), 0, "390px reload must not horizontally overflow");

    await page.setViewportSize({ width: 320, height: 700 });
    await page.locator(".cut-check-panel").scrollIntoViewIfNeeded();
    assert.equal(await overflow(page), 0, "320px weak-check screen must not horizontally overflow");
    assert.deepEqual(errors, [], "balanced explanation UI emitted browser errors");
    console.log(JSON.stringify({
      status: "ok",
      fixture: expectedQuestion.id,
      nonIdentityOrder: expectedQuestion.choiceOriginIndexes,
      statements: 4,
      ariaPressedPersisted: true,
      overflow390: 0,
      overflow320: 0,
      errors: 0
    }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
