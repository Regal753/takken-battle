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

async function installFixture(page, descriptor) {
  return page.evaluate(({ bankId, formatKey, questionId = "" }) => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") &&
      !candidate.includes("previous") && !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    const state = JSON.parse(localStorage.getItem(key));
    const formatLabels = { single: "単一選択", combination: "組合せ問題", count: "個数問題" };
    let bank;
    let question;
    let presented;
    if (bankId === "business-fullscore") {
      bank = window.TAKKEN_BUSINESS_FULLSCORE_BANK;
      question = bank.QUESTIONS.find((item) =>
        questionId ? item.id === questionId : item.formatKey === formatKey
      );
      presented = bank.presentQuestion(question, `statement-review-${bankId}-${formatKey}`);
    } else if (bankId === "subject-sprint") {
      bank = window.TAKKEN_SUBJECT_SPRINT_BANK;
      question = bank.QUESTIONS.find((item) => item.format === formatLabels[formatKey]);
      presented = bank.presentQuestion(question, `statement-review-${bankId}-${formatKey}`);
    } else {
      bank = window.TAKKEN_PRACTICAL_VARIATIONS;
      question = bank.QUESTIONS.find((item) => item.format === formatLabels[formatKey]);
      presented = question;
    }
    if (!question || !presented) throw new Error(`${bankId}/${formatKey}: fixture unavailable`);
    const facts = presented.sourceFacts || [];
    const labels = formatKey === "single"
      ? ["1", "2", "3", "4"]
      : formatKey === "combination" && facts.length === 4
        ? ["ア・前半", "ア・後半", "イ・前半", "イ・後半"]
        : ["ア", "イ", "ウ", "エ"];
    state.practicalDrill = {
      ...state.practicalDrill,
      bankId,
      bankVersion: bank.VERSION,
      presentationKey: presented.presentationKey || "",
      stage: "active",
      scope: presented.scopeId || "all",
      unitId: presented.unitId || "",
      sessionSize: 1,
      sessionIds: [question.id],
      queue: [question.id],
      position: 0,
      currentAttempt: null,
      retryIds: [],
      sessionStartedAt: new Date().toISOString(),
      completedAt: ""
    };
    localStorage.setItem(key, JSON.stringify(state));
    const choiceBlocks = Array.isArray(presented.displayModel?.choiceBlocks)
      ? presented.displayModel.choiceBlocks
      : [];
    const promptItems = Array.isArray(presented.displayModel?.items)
      ? presented.displayModel.items
      : [];
    const promptBlocks = choiceBlocks.length ? choiceBlocks : promptItems;
    const promptTargetKind = choiceBlocks.length ? "choice" : "item";
    const promptUses = new Map();
    promptBlocks.forEach((block, blockIndex) => {
      new Set(block.premises || []).forEach((text) => {
        if (!text) return;
        if (!promptUses.has(text)) promptUses.set(text, []);
        promptUses.get(text).push(blockIndex);
      });
    });
    const promptShared = [...promptUses.entries()]
      .filter(([, indexes]) => indexes.length > 1)
      .map(([text, indexes]) => ({
        text,
        targets: `${promptTargetKind === "choice" ? "選択肢" : "記述"} ${indexes.map((index) =>
          promptTargetKind === "choice" ? String(index + 1) : (promptBlocks[index].label || String(index + 1))
        ).join("・")}`
      }));
    return {
      bankId,
      formatKey,
      id: question.id,
      answer: presented.answer,
      labels: labels.slice(0, facts.length),
      promptShared,
      facts: facts.map((fact) => ({
        truth: fact.truth,
        premise: fact.presentedContext || fact.context || "",
        statement: fact.presentedStatement || fact.statement || "",
        reason: fact.reason || ""
      }))
    };
  }, descriptor);
}

async function readFixture(page, fixture) {
  await page.reload({ waitUntil: "networkidle" });
  const promptShared = await page.locator(".practical-prompt-shared-row").evaluateAll((nodes) => nodes.map((row) => ({
    targets: row.querySelector(".practical-prompt-shared-targets")?.textContent?.trim() || "",
    text: row.querySelector(".practical-prompt-shared-text")?.textContent?.trim() || ""
  })));
  assert.deepEqual(promptShared, fixture.promptShared, `${fixture.bankId}/${fixture.formatKey}: prompt shared premises`);
  for (const group of fixture.promptShared) {
    const duplicatePremiseFields = await page.evaluate((text) => {
      const itemPremises = [...document.querySelectorAll(".practical-prompt-item .practical-prompt-premise li")]
        .map((node) => (node.textContent || "").trim());
      const choicePremises = [...document.querySelectorAll(".practical-drill-choice .practical-choice-premise > span:last-child")]
        .flatMap((node) => (node.textContent || "").split("／").map((value) => value.trim()));
      return [...itemPremises, ...choicePremises].filter((value) => value === text).length;
    }, group.text);
    assert.equal(duplicatePremiseFields, 0, `${fixture.bankId}/${fixture.formatKey}: prompt premise not duplicated in cards`);
  }
  await page.locator(".practical-drill-choice").nth(fixture.answer).click();
  await page.locator(".practical-statement-review-card").first().waitFor({ state: "visible" });
  const cards = await page.locator(".practical-statement-review-card").evaluateAll((nodes) => nodes.map((card) => ({
    label: card.querySelector("header strong")?.textContent?.trim() || "",
    verdict: card.querySelector(".practical-statement-verdict")?.textContent?.trim() || "",
    terms: [...card.querySelectorAll("dt")].map((node) => node.textContent?.trim() || ""),
    values: [...card.querySelectorAll("dd")].map((node) => node.textContent?.trim() || ""),
    text: card.textContent || ""
  })));
  const shared = await page.locator(".practical-statement-shared-premise").evaluateAll((nodes) => nodes.map((node) => ({
    label: node.querySelector("strong")?.textContent?.trim() || "",
    text: node.querySelector("p")?.textContent?.trim() || ""
  })));
  const premiseUses = new Map();
  fixture.facts.forEach((fact, index) => {
    if (!fact.premise) return;
    if (!premiseUses.has(fact.premise)) premiseUses.set(fact.premise, []);
    premiseUses.get(fact.premise).push(index);
  });
  const expectedShared = [...premiseUses.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([text, indexes]) => ({
      label: `共通前提（${indexes.map((index) => fixture.labels[index]).join("・")}）`,
      text
    }));
  const sharedPremiseTexts = new Set(expectedShared.map((group) => group.text));
  assert.equal(cards.length, fixture.facts.length, `${fixture.bankId}/${fixture.formatKey}: card count`);
  assert.deepEqual(cards.map((card) => card.label), fixture.labels, `${fixture.bankId}/${fixture.formatKey}: labels`);
  assert.deepEqual(shared, expectedShared, `${fixture.bankId}/${fixture.formatKey}: shared premises`);
  cards.forEach((card, index) => {
    const fact = fixture.facts[index];
    const expectedTerms = [];
    const expectedValues = [];
    if (fact.premise && !sharedPremiseTexts.has(fact.premise)) {
      expectedTerms.push("前提");
      expectedValues.push(fact.premise);
    }
    expectedTerms.push("記述", "理由・ルール");
    expectedValues.push(fact.statement, fact.reason);
    assert.equal(card.verdict, fact.truth ? "○ 正しい" : "× 誤り", `${fixture.bankId}/${fixture.formatKey}: verdict ${index}`);
    assert.deepEqual(card.terms, expectedTerms, `${fixture.bankId}/${fixture.formatKey}: terms ${index}`);
    assert.deepEqual(card.values, expectedValues, `${fixture.bankId}/${fixture.formatKey}: values ${index}`);
    assert.doesNotMatch(card.text, /正しい記述は\d+つなので|実際はア[○×]/, `${fixture.bankId}/${fixture.formatKey}: no answer-position meta explanation`);
  });
  return cards;
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
    const descriptors = [
      { bankId: "business-fullscore", formatKey: "single" },
      { bankId: "business-fullscore", formatKey: "combination" },
      { bankId: "business-fullscore", formatKey: "count" },
      { bankId: "business-fullscore", formatKey: "case" },
      { bankId: "business-fullscore", formatKey: "case", questionId: "bf-business-book-09-case-02" },
      { bankId: "legacy-practical", formatKey: "single" },
      { bankId: "legacy-practical", formatKey: "combination" },
      { bankId: "legacy-practical", formatKey: "count" },
      { bankId: "subject-sprint", formatKey: "single" },
      { bankId: "subject-sprint", formatKey: "count" }
    ];
    const results = [];
    for (const descriptor of descriptors) {
      const fixture = await installFixture(page, descriptor);
      const cards = await readFixture(page, fixture);
      results.push({ ...descriptor, id: fixture.id, cards: cards.length });
      assert.equal(await overflow(page), 0, `${descriptor.bankId}/${descriptor.formatKey}: 390px overflow`);
    }
    if (screenshotPath) {
      fs.mkdirSync(path.dirname(path.resolve(screenshotPath)), { recursive: true });
      await page.locator("#practicalDrillFeedback").screenshot({ path: path.resolve(screenshotPath) });
    }
    assert.equal(await overflow(page), 0);
    await page.setViewportSize({ width: 320, height: 700 });
    assert.equal(await overflow(page), 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "ok", fixtures: results, overflow390: 0, overflow320: 0 }));
  } finally {
    await browser.close();
    await local.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
