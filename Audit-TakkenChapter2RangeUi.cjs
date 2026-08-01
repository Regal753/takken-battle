#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function startStaticServer(root) {
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".webp": "image/webp"
  };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(root, relative);
    const safeRoot = path.resolve(root);
    if (!target.startsWith(`${safeRoot}${path.sep}`) && target !== path.join(safeRoot, "index.html")) {
      response.writeHead(403);
      response.end("forbidden");
      return;
    }
    fs.readFile(target, (error, body) => {
      if (error) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      response.writeHead(200, {
        "content-type": contentTypes[path.extname(target)] || "application/octet-stream",
        "cache-control": "no-store"
      });
      response.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}/`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

async function gotoFresh(page, baseUrl, prefix) {
  const url = new URL(baseUrl);
  url.searchParams.set("review", `${prefix}${Date.now().toString(36)}`);
  url.searchParams.set("today", "1");
  await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForFunction(() => {
    const source = document.querySelector("#dailyQuestSource")?.textContent || "";
    return /読後\d+問|固定10問/.test(source) && !source.includes("読込中");
  });
}

async function currentQuestion(page) {
  return page.evaluate(() => {
    const text = document.querySelector("#questionText")?.textContent || "";
    const question = Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
      .find((candidate) => candidate.text === text);
    if (!question) throw new Error(`question not found: ${text.slice(0, 80)}`);
    return { id: question.id, tag: question.tag, answer: question.answer };
  });
}

async function selectTextbookUnit(page, unitLabel) {
  const value = await page.locator("#chapterSelect").evaluate((select, label) => {
    const option = [...select.options].find((item) => item.textContent.includes(label));
    if (!option) throw new Error(`missing unit option ${label}`);
    return option.value;
  }, unitLabel);
  await page.locator("#chapterSelect").selectOption(value);
}

async function runDesktop(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await gotoFresh(page, baseUrl, "chapter2desktop");
  await page.locator("#themeDrawer > summary").click();

  const initial = await page.evaluate(() => {
    const select = document.querySelector("#chapterSelect");
    const rightsGroup = [...select.querySelectorAll("optgroup")]
      .find((group) => group.label.includes("第2分冊 権利関係"));
    const rightsPanel = document.querySelector('#chapterList details[data-group="rights"]');
    return {
      optionCount: rightsGroup?.querySelectorAll("option").length || 0,
      groupTitle: rightsPanel?.querySelector("summary strong")?.textContent || "",
      rowCount: rightsPanel?.querySelectorAll(".chapter-row").length || 0,
      coverage: document.querySelector("#textbookCoverageStatus")?.textContent || "",
      retention: document.querySelector("#textbookRetentionStatus")?.textContent || ""
    };
  });
  assert.equal(initial.optionCount, 21);
  assert.equal(initial.rowCount, 21);
  assert.match(initial.groupTitle, /21単元・44問/);
  assert.equal(initial.coverage.trim(), "接触 0 / 124");
  assert.match(initial.retention, /^単元完了 0 \/ 45・定着 0 \/ 124$/);

  await selectTextbookUnit(page, "02-02 意思表示");
  await page.waitForFunction(() => document.querySelector("#studyScopeSelect")?.value === "rights");
  const first = await currentQuestion(page);
  const unit2Ui = await page.evaluate(() => ({
    scope: document.querySelector("#studyScopeSelect")?.value || "",
    coachTitle: document.querySelector("#coachTitle")?.textContent || "",
    selected: document.querySelector("#chapterSelect option:checked")?.textContent || ""
  }));
  assert.equal(first.id, "r002");
  assert.equal(unit2Ui.scope, "rights");
  assert.match(unit2Ui.coachTitle, /02-02 意思表示・本文p\.172直後/);
  assert.match(unit2Ui.selected, /p\.172/);

  await page.locator(`.choice-button[data-index="${first.answer}"]`).click();
  await page.locator("#feedbackBox").waitFor({ state: "visible" });
  await page.locator(".confidence-button").filter({ hasText: "4肢を説明できる" }).click();
  await page.locator("#dockNextButton").click();
  await page.waitForFunction(() => {
    const text = document.querySelector("#questionText")?.textContent || "";
    return Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
      .find((question) => question.text === text)?.id === "r102";
  });
  const second = await currentQuestion(page);
  assert.equal(second.id, "r102");

  const completedDailyQuestions = await page.evaluate(() => {
    const namespace = new URL(location.href).searchParams.get("review");
    const storageId = `takken-battle-study-clean-v2-hard-review-${namespace}`;
    const state = JSON.parse(localStorage.getItem(storageId) || "{}");
    const now = new Date().toISOString();
    const planIds = state.daily?.planIds || [];
    state.questionStats ||= {};
    planIds.forEach((id) => {
      state.questionStats[id] = {
        ...(state.questionStats[id] || {}),
        attempts: Math.max(1, Number(state.questionStats[id]?.attempts) || 0),
        correct: Math.max(1, Number(state.questionStats[id]?.correct) || 0),
        lastAnsweredAt: now,
        lastCorrectAt: now
      };
    });
    state.daily.answers = planIds.length;
    state.daily.correct = planIds.length;
    localStorage.setItem(storageId, JSON.stringify(state));
    return planIds.length;
  });
  assert.equal(completedDailyQuestions, 2);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const source = document.querySelector("#dailyQuestSource")?.textContent || "";
    return /読後\d+問|固定10問/.test(source) && !source.includes("読込中");
  });
  await page.locator("#themeDrawer > summary").click();
  await selectTextbookUnit(page, "02-15 請負");
  const contractFirst = await currentQuestion(page);
  assert.equal(contractFirst.id, "r111");
  await page.locator(`.choice-button[data-index="${contractFirst.answer}"]`).click();
  await page.locator(".confidence-button").filter({ hasText: "4肢を説明できる" }).click();
  await page.locator("#dockNextButton").click();
  await page.waitForFunction(() => {
    const text = document.querySelector("#questionText")?.textContent || "";
    return Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
      .find((question) => question.text === text)?.id === "r112";
  });
  assert.equal((await currentQuestion(page)).id, "r112");
  await selectTextbookUnit(page, "02-16 不法行為");
  assert.equal((await currentQuestion(page)).id, "r113");
  assert.deepEqual(errors, []);
  await context.close();
  return {
    initial,
    unit2: { first: first.id, next: second.id },
    afterCompletedDaily: { first: "r111", next: "r112" },
    missingTopics: ["r111", "r113"]
  };
}

async function runMobile(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await gotoFresh(page, baseUrl, "chapter2mobile");
  await page.locator("#themeDrawer > summary").click();
  await selectTextbookUnit(page, "02-02 意思表示");
  const result = await page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    scope: document.querySelector("#studyScopeSelect")?.value || "",
    selected: document.querySelector("#chapterSelect option:checked")?.textContent || "",
    rightsRows: document.querySelectorAll('#chapterList details[data-group="rights"] .chapter-row').length
  }));
  assert.equal(result.overflow, 0);
  assert.equal(result.scope, "rights");
  assert.match(result.selected, /02-02 意思表示/);
  assert.equal(result.rightsRows, 21);
  assert.deepEqual(errors, []);
  await context.close();
  return result;
}

(async () => {
  const server = process.env.TAKKEN_BASE_URL
    ? { baseUrl: process.env.TAKKEN_BASE_URL, close: async () => {} }
    : await startStaticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const desktop = await runDesktop(browser, server.baseUrl);
    const mobile = await runMobile(browser, server.baseUrl);
    console.log(JSON.stringify({ status: "ok", desktop, mobile }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
