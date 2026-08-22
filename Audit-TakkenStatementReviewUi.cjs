#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const screenshotPath = process.env.TAKKEN_STATEMENT_REVIEW_SCREENSHOT || "";
const chromePath = process.env.TAKKEN_CHROME_PATH || "";

function startStaticServer(root) {
  const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
  const safeRoot = path.resolve(root);
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
      .replace(/^\/$/, "/index.html").replace(/^\/+/, "");
    const target = path.resolve(safeRoot, relative);
    if (!target.startsWith(`${safeRoot}${path.sep}`)) return response.writeHead(403).end();
    fs.readFile(target, (error, body) => {
      if (error) return response.writeHead(404).end();
      response.writeHead(200, { "content-type": types[path.extname(target)] || "application/octet-stream", "cache-control": "no-store" });
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
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

(async () => {
  const local = await startStaticServer(process.cwd());
  const browser = await chromium.launch(chromePath
    ? { executablePath: chromePath, headless: true }
    : { channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  try {
    const url = new URL(local.baseUrl);
    url.searchParams.set("review", "statement-review-ui");
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.TAKKEN_BUSINESS_FULLSCORE_BANK?.QUESTIONS_BY_ID));
    const fixture = await page.evaluate(() => {
      const id = "bf-business-book-07-count-02";
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        !candidate.includes("backup") && !candidate.includes("-before-") &&
        !candidate.includes("previous") && !candidate.includes("corrupt") &&
        !candidate.endsWith("event-outbox")
      );
      const state = JSON.parse(localStorage.getItem(key));
      const bank = window.TAKKEN_BUSINESS_FULLSCORE_BANK;
      const question = bank.QUESTIONS_BY_ID[id];
      if (!question || question.formatKey !== "count") throw new Error("count fixture unavailable");
      const presentationKey = `${bank.localDayKey(new Date())}:statement-review-audit`;
      state.practicalDrill = {
        ...state.practicalDrill, bankId: "business-fullscore", bankVersion: bank.VERSION,
        presentationKey, stage: "active", scope: "business", unitId: question.unitId,
        sessionSize: 1, sessionIds: [id], queue: [id], position: 0, currentAttempt: null,
        retryIds: [], sessionStartedAt: new Date().toISOString(), completedAt: ""
      };
      localStorage.setItem(key, JSON.stringify(state));
      const presented = bank.presentQuestion(question, presentationKey);
      return {
        id, answer: presented.answer, truths: question.sourceFacts.map((fact) => fact.truth),
        premises: question.sourceFacts.map((fact) => fact.presentedContext || fact.context),
        statements: question.sourceFacts.map((fact) => fact.presentedStatement || fact.statement),
        reasons: question.sourceFacts.map((fact) => fact.reason)
      };
    });
    assert.deepEqual(fixture.truths, [true, false, true, true]);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".practical-drill-choice").nth(fixture.answer).click();
    await page.locator(".practical-statement-review-card").first().waitFor({ state: "visible" });
    const result = await page.locator(".practical-statement-review-card").evaluateAll((cards) => cards.map((card) => ({
      label: card.querySelector("header strong")?.textContent?.trim() || "",
      verdict: card.querySelector(".practical-statement-verdict")?.textContent?.trim() || "",
      terms: [...card.querySelectorAll("dt")].map((node) => node.textContent?.trim() || ""),
      values: [...card.querySelectorAll("dd")].map((node) => node.textContent?.trim() || ""),
      text: card.textContent || ""
    })));
    const shared = await page.locator(".practical-statement-shared-premise p").allTextContents();
    assert.equal(result.length, 4);
    assert.deepEqual(result.map((card) => card.label), ["ア", "イ", "ウ", "エ"]);
    assert.ok(shared.length <= 1);
    const sharedPremise = shared.length === 1;
    if (sharedPremise) {
      assert.equal(new Set(fixture.premises).size, 1);
      assert.equal(shared[0].trim(), fixture.premises[0]);
    }
    result.forEach((card, index) => {
      assert.equal(card.verdict, fixture.truths[index] ? "○ 正しい" : "× 誤り");
      assert.deepEqual(card.terms, sharedPremise ? ["記述", "理由・ルール"] : ["前提", "記述", "理由・ルール"]);
      assert.deepEqual(card.values, sharedPremise
        ? [fixture.statements[index], fixture.reasons[index]]
        : [fixture.premises[index], fixture.statements[index], fixture.reasons[index]]);
      assert.doesNotMatch(card.text, /正しい記述は3つなので/);
    });
    const sprintFixture = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        !candidate.includes("backup") && !candidate.includes("-before-") &&
        !candidate.includes("previous") && !candidate.includes("corrupt") &&
        !candidate.endsWith("event-outbox")
      );
      const state = JSON.parse(localStorage.getItem(key));
      const bank = window.TAKKEN_SUBJECT_SPRINT_BANK;
      const question = bank.QUESTIONS.find((item) => item.format === "個数問題");
      if (!question) throw new Error("subject sprint count fixture unavailable");
      const presentationKey = "statement-review-subject-sprint";
      const presented = bank.presentQuestion(question, presentationKey);
      state.practicalDrill = {
        ...state.practicalDrill, bankId: "subject-sprint", bankVersion: bank.VERSION,
        presentationKey, stage: "active", scope: "all", unitId: "",
        sessionSize: 1, sessionIds: [question.id], queue: [question.id], position: 0,
        currentAttempt: null, retryIds: [], sessionStartedAt: new Date().toISOString(), completedAt: ""
      };
      localStorage.setItem(key, JSON.stringify(state));
      return {
        answer: presented.answer,
        facts: question.sourceFacts.map((fact) => ({ statement: fact.statement, truth: fact.truth, reason: fact.reason }))
      };
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".practical-drill-choice").nth(sprintFixture.answer).click();
    await page.locator(".practical-statement-review-card").first().waitFor({ state: "visible" });
    const sprintCards = await page.locator(".practical-statement-review-card").evaluateAll((cards) => cards.map((card) => ({
      label: card.querySelector("header strong")?.textContent?.trim() || "",
      verdict: card.querySelector(".practical-statement-verdict")?.textContent?.trim() || "",
      terms: [...card.querySelectorAll("dt")].map((node) => node.textContent?.trim() || ""),
      values: [...card.querySelectorAll("dd")].map((node) => node.textContent?.trim() || "")
    })));
    assert.equal(sprintCards.length, 4);
    sprintCards.forEach((card, index) => {
      assert.equal(card.label, ["ア", "イ", "ウ", "エ"][index]);
      assert.equal(card.verdict, sprintFixture.facts[index].truth ? "○ 正しい" : "× 誤り");
      assert.deepEqual(card.terms, ["記述", "理由・ルール"]);
      assert.deepEqual(card.values, [sprintFixture.facts[index].statement, sprintFixture.facts[index].reason]);
    });
    if (screenshotPath) {
      fs.mkdirSync(path.dirname(path.resolve(screenshotPath)), { recursive: true });
      await page.locator("#practicalDrillFeedback").screenshot({ path: path.resolve(screenshotPath) });
    }
    assert.equal(await overflow(page), 0);
    await page.setViewportSize({ width: 320, height: 700 });
    assert.equal(await overflow(page), 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "ok", question: fixture.id, cards: result.length, overflow390: 0, overflow320: 0 }));
  } finally {
    await browser.close();
    await local.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
