#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const chromePath = process.env.TAKKEN_CHROME_PATH || "";

function serve(root) {
  const safeRoot = path.resolve(root);
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
      .replace(/^\/$/, "/index.html").replace(/^\/+/, "");
    const target = path.resolve(safeRoot, relative);
    if (!target.startsWith(`${safeRoot}${path.sep}`)) return response.writeHead(403).end();
    fs.readFile(target, (error, body) => {
      if (error) return response.writeHead(404).end();
      const type = path.extname(target) === ".js" ? "text/javascript" : path.extname(target) === ".css" ? "text/css" : "text/html";
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

async function outlineWidth(locator) {
  await locator.focus();
  return locator.evaluate((node) => parseFloat(getComputedStyle(node).outlineWidth) || 0);
}

(async () => {
  const local = await serve(process.cwd());
  const browser = await chromium.launch(chromePath
    ? { executablePath: chromePath, headless: true }
    : { channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  try {
    const url = new URL(local.url);
    url.searchParams.set("review", "accessibility-v34");
    await page.goto(url.toString(), { waitUntil: "networkidle" });

    await page.locator(".public-mode-note > summary").click();
    const saveTransferButton = page.locator("#saveExportButton");
    assert.ok(await outlineWidth(saveTransferButton) >= 3, "save transfer focus ring is too thin");
    assert.ok(await saveTransferButton.evaluate((node) => node.getBoundingClientRect().height) >= 44, "save transfer target is below 44px");
    assert.equal(await page.locator("#saveTransferStatus").evaluate((node) => getComputedStyle(node).wordBreak), "keep-all");

    const mainChoice = page.locator(".choice-button").first();
    assert.ok(await outlineWidth(mainChoice) >= 3, "main choice focus ring is too thin");
    await mainChoice.click();
    await page.locator("#feedbackBox").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.id === "feedbackBox");
    assert.ok(await outlineWidth(page.locator("#feedbackBox")) >= 3, "main feedback focus ring is too thin");
    assert.equal(await mainChoice.getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#answerDock").isHidden(), false);

    const panel = page.locator("#practicalDrillPanel");
    if (!(await panel.evaluate((node) => node.open))) await panel.locator(":scope > summary").click();
    await page.locator("#practicalDrillStartButton").click();
    await page.locator(".practical-drill-choice").first().waitFor({ state: "visible" });
    assert.equal(await page.locator("#answerDock").isHidden(), true);
    assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("has-answer-dock")), false);

    const practicalChoice = page.locator(".practical-drill-choice").first();
    assert.ok(await outlineWidth(practicalChoice) >= 3, "practical choice focus ring is too thin");
    const answer = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        !candidate.includes("backup") && !candidate.includes("previous") &&
        !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
      );
      const state = JSON.parse(localStorage.getItem(key));
      const id = state.practicalDrill.queue[state.practicalDrill.position];
      return window.TAKKEN_PRACTICAL_VARIATIONS.QUESTIONS_BY_ID[id].answer;
    });
    await page.locator(".practical-drill-choice").nth(answer).click();
    await page.waitForFunction(() => document.activeElement?.id === "practicalDrillFeedback");
    assert.ok(await outlineWidth(page.locator("#practicalDrillFeedback")) >= 3, "practical feedback focus ring is too thin");
    assert.equal(await page.locator(".practical-drill-choice").nth(answer).getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#practicalDrillFeedback").getAttribute("role"), "region");
    assert.equal(await page.locator("#practicalDrillFeedback").getAttribute("aria-label"), "実践問題の解説");
    assert.equal(await page.locator("#practicalDrillFeedback").getAttribute("aria-labelledby"), null);
    assert.equal(await page.locator("#practicalDrillVerdict").getAttribute("aria-live"), "polite");

    const confidence = page.locator('[data-practical-confidence="confident"]');
    const confidenceSize = await confidence.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      outline: parseFloat(getComputedStyle(node).outlineWidth) || 0
    }));
    assert.ok(confidenceSize.height >= 44, "confidence target is below 44px");
    assert.ok(await outlineWidth(confidence) >= 3, "confidence focus ring is too thin");
    await confidence.click();
    assert.equal(await confidence.getAttribute("aria-pressed"), "true");

    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator('[data-practical-confidence="confident"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#answerDock").isHidden(), true);
    await page.setViewportSize({ width: 320, height: 700 });
    const mobile = await page.evaluate(() => {
      const saveSummary = document.querySelector(".public-mode-note > summary > small");
      const saveSummaryRange = document.createRange();
      saveSummaryRange.selectNodeContents(saveSummary);
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dockHidden: document.querySelector("#answerDock")?.hidden,
        hasDockClass: document.body.classList.contains("has-answer-dock"),
        missionColumns: getComputedStyle(document.querySelector(".today-command-panel .daily-mission")).gridTemplateColumns.split(" ").length,
        missionTitleSize: parseFloat(getComputedStyle(document.querySelector(".today-command-panel .mission-step strong")).fontSize),
        missionStatusSize: parseFloat(getComputedStyle(document.querySelector(".today-command-panel .mission-step small")).fontSize),
        saveSummaryLineCount: saveSummaryRange.getClientRects().length,
        saveSummaryWidth: Math.round(saveSummary.getBoundingClientRect().width),
        saveSummaryWhiteSpace: getComputedStyle(saveSummary).whiteSpace
      };
    });
    assert.deepEqual(
      { ...mobile, saveSummaryWidth: undefined },
      { overflow: 0, dockHidden: true, hasDockClass: false, missionColumns: 2, missionTitleSize: 12, missionStatusSize: 10, saveSummaryLineCount: 1, saveSummaryWidth: undefined, saveSummaryWhiteSpace: "nowrap" }
    );
    assert.ok(mobile.saveSummaryWidth >= 40, `save summary label is too narrow: ${mobile.saveSummaryWidth}px`);

    const calculationPage = await browser.newPage({ viewport: { width: 320, height: 700 }, timezoneId: "Asia/Tokyo" });
    calculationPage.on("pageerror", (error) => errors.push(error.message));
    calculationPage.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const calculationUrl = new URL(local.url);
    calculationUrl.searchParams.set("review", "accessibility-calculation-v34");
    await calculationPage.goto(calculationUrl.toString(), { waitUntil: "networkidle" });
    await calculationPage.locator("#calculationDrillPanel > summary").click();
    await calculationPage.locator("#calculationDrillResetButton").click();
    const calculationAnswer = await calculationPage.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        !candidate.includes("backup") && !candidate.includes("previous") &&
        !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
      );
      const drill = JSON.parse(localStorage.getItem(key)).calculationDrill;
      const id = drill.queue[drill.position];
      return window.TAKKEN_CALCULATION_DRILL.QUESTIONS.find((item) => item.id === id).answer;
    });
    const calculationChoice = calculationPage.locator(".calculation-drill-choice").nth(calculationAnswer);
    assert.ok(await outlineWidth(calculationChoice) >= 3, "calculation choice focus ring is too thin");
    await calculationPage.keyboard.press("Enter");
    await calculationPage.waitForFunction(() => document.activeElement?.id === "calculationDrillFeedback");
    const calculationFeedback = calculationPage.locator("#calculationDrillFeedback");
    assert.ok(await outlineWidth(calculationFeedback) >= 3, "calculation feedback focus ring is too thin");
    assert.equal(await calculationPage.locator("#calculationDrillQuestion").getAttribute("aria-live"), null);
    assert.equal(await calculationFeedback.getAttribute("role"), "region");
    assert.equal(await calculationFeedback.getAttribute("aria-label"), "計算問題の解説");
    assert.equal(await calculationFeedback.getAttribute("tabindex"), "-1");
    assert.equal(await calculationPage.locator("#calculationDrillVerdict").getAttribute("role"), "status");
    assert.equal(await calculationPage.locator("#calculationDrillVerdict").getAttribute("aria-live"), "polite");
    assert.equal(await calculationPage.locator("#calculationDrillVerdict").getAttribute("aria-atomic"), "true");
    assert.equal(await calculationChoice.getAttribute("aria-pressed"), "true");
    assert.equal(await calculationPage.locator("#calculationDrillConfidence").getAttribute("role"), "group");
    assert.equal(await calculationPage.locator("#calculationDrillConfidence").getAttribute("aria-label"), "正解の手応え");
    const calculationConfidence = calculationPage.locator('[data-calculation-confidence="confident"]');
    const calculationConfidenceHeight = await calculationConfidence.evaluate((node) => node.getBoundingClientRect().height);
    assert.ok(calculationConfidenceHeight >= 44, "calculation confidence target is below 44px");
    assert.equal(await calculationConfidence.getAttribute("aria-pressed"), "false");
    assert.ok(await outlineWidth(calculationConfidence) >= 3, "calculation confidence focus ring is too thin");
    await calculationPage.keyboard.press("Enter");
    assert.equal(await calculationConfidence.getAttribute("aria-pressed"), "true");
    await calculationPage.reload({ waitUntil: "networkidle" });
    assert.equal(await calculationPage.locator('[data-calculation-confidence="confident"]').getAttribute("aria-pressed"), "true");
    await calculationPage.locator("#calculationDrillNextButton").click();
    await calculationPage.waitForFunction(() => document.activeElement?.classList.contains("calculation-drill-choice"));
    assert.equal(await calculationPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
    await calculationPage.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "ok", mainFocus: 3, practicalFocus: 3, calculationFocus: 3, saveTransferFocus: 3, targetHeight: confidenceSize.height, calculationTargetHeight: calculationConfidenceHeight, saveTransferTargetHeight: 44, overflow320: 0 }));
  } finally {
    await browser.close();
    await local.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
