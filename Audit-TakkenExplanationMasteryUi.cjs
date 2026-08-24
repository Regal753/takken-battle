#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const screenshotDir = process.env.TAKKEN_SCREENSHOT_DIR || "";

function startStaticServer(root) {
  const types = {
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

async function selectUnit(page, label) {
  if (!(await page.locator("#chapterSelect").isVisible())) {
    await page.locator("#themeDrawer > summary").click();
  }
  const value = await page.locator("#chapterSelect").evaluate((select, targetLabel) => {
    const option = [...select.options].find((candidate) => candidate.textContent.includes(targetLabel));
    if (!option) throw new Error(`missing textbook unit ${targetLabel}`);
    return option.value;
  }, label);
  await page.locator("#chapterSelect").selectOption(value);
}

async function currentQuestion(page) {
  return page.evaluate(() => {
    const id = document.querySelector("#quizCard")?.dataset.questionId || "";
    const question = window.TAKKEN_EXAM_QUESTIONS?.[id];
    if (!question) throw new Error(`current question not found: ${id || "missing id"}`);
    return { id: question.id, answer: question.answer };
  });
}

async function answer(page, index) {
  await page.locator(`.choice-button[data-index="${index}"]`).click();
  await page.locator(".reasoning-path").waitFor({ state: "visible" });
}

async function readReasoning(page) {
  return page.evaluate(() => {
    const id = document.querySelector("#quizCard")?.dataset.questionId || "";
    const question = window.TAKKEN_EXAM_QUESTIONS?.[id];
    const steps = [...document.querySelectorAll(".reasoning-steps li")].map((item) => ({
      label: item.querySelector("strong")?.textContent || "",
      text: item.querySelector("p")?.textContent || ""
    }));
    const reasons = [...document.querySelectorAll(".verdict-reason")]
      .map((item) => item.textContent.replace(/^理由:\s*/, ""));
    const normalizedLength = (value) => String(value || "")
      .normalize("NFKC")
      .replace(/[\s\u3000、。・「」『』（）()【】［］,.!?！？:：;；○×0-9]/g, "")
      .length;
    const reasoning = document.querySelector(".reasoning-path");
    const verdict = document.querySelector(".verdict-board");
    return {
      id: question?.id || "",
      steps,
      reasons,
      reasonLengths: reasons.map(normalizedLength),
      explain: question?.explain || "",
      trap: question?.trap || "",
      memoryRule: question?.memoryRule || "",
      explainHidden: Boolean(document.querySelector("#explainText")?.hidden),
      reasoningBeforeVerdict: Boolean(
        reasoning && verdict && (reasoning.compareDocumentPosition(verdict) & Node.DOCUMENT_POSITION_FOLLOWING)
      ),
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth)
    };
  });
}

async function runSingleChoice(browser, baseUrl) {
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
  await gotoFresh(page, baseUrl, "explain-single-");
  await selectUnit(page, "01-03 宅地建物取引士");
  assert.equal((await currentQuestion(page)).id, "b005");
  const question = await currentQuestion(page);
  await answer(page, (question.answer + 1) % 4);
  const result = await readReasoning(page);
  assert.equal(result.id, "b005");
  assert.deepEqual(result.steps.map((step) => step.label), [
    "見る条件",
    "使う根拠",
    "この問題への当てはめ"
  ]);
  assert.match(result.steps[0].text, /宅建士|登録/);
  assert.equal(result.steps[1].text, result.explain);
  assert.match(result.steps[2].text, /選んだ肢/);
  assert.match(result.steps[2].text, /正解肢/);
  assert.match(result.steps[2].text, /登録|宅建士証|試験/);
  assert.equal(result.reasons.length, 4);
  assert.ok(result.reasonLengths.every((length) => length >= 16));
  assert.equal(result.explainHidden, true);
  assert.equal(result.reasoningBeforeVerdict, true);
  assert.equal(result.overflow, 0);
  assert.deepEqual(errors, []);
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "explanation-mastery-desktop.png"), fullPage: true });
  }
  await context.close();
  return result;
}

async function runCountQuestion(browser, baseUrl) {
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
  await gotoFresh(page, baseUrl, "explain-count-");
  await selectUnit(page, "02-03 代理");
  const question = await currentQuestion(page);
  assert.equal(question.id, "r003");
  await answer(page, question.answer);
  const result = await readReasoning(page);
  assert.match(result.steps[2].text, /○はア・ウ・エの3個/);
  assert.match(result.steps[2].text, /答えは「三つ」/);
  assert.equal(result.reasons.length, 4);
  assert.ok(result.reasonLengths.every((length) => length >= 16));
  assert.equal(result.overflow, 0);
  assert.deepEqual(errors, []);
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "explanation-mastery-mobile.png"), fullPage: true });
  }
  await context.close();
  return result;
}

(async () => {
  const server = process.env.TAKKEN_BASE_URL
    ? { baseUrl: process.env.TAKKEN_BASE_URL, close: async () => {} }
    : await startStaticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const single = await runSingleChoice(browser, server.baseUrl);
    const count = await runCountQuestion(browser, server.baseUrl);
    console.log(JSON.stringify({ status: "ok", single, count }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
