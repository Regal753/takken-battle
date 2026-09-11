#!/usr/bin/env node
"use strict";

// Browser proof for the reading-first choice layout: a choice-specific premise
// must be visible immediately above (not inside) the answer button, while the
// answer order and all legacy fallbacks remain unchanged.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

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
      close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(done); })
    }));
  });
}

function appUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set("review", `choice-premise-${Date.now().toString(36)}`);
  return url.toString();
}

async function saveKey(page) {
  return page.evaluate(() => Object.keys(localStorage).find((candidate) =>
    candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
    !candidate.includes("backup") && !candidate.includes("-before-") &&
    !candidate.includes("previous") && !candidate.includes("corrupt") &&
    !candidate.endsWith("event-outbox")
  ) || "");
}

async function fixtureCatalog(page) {
  return page.evaluate(() => {
    const ownPremises = (blocks) => {
      const uses = new Map();
      blocks.forEach((block, index) => new Set(block.premises || []).forEach((text) => {
        if (!text) return;
        if (!uses.has(text)) uses.set(text, []);
        uses.get(text).push(index);
      }));
      const shared = new Set([...uses].filter(([, indexes]) => indexes.length > 1).map(([text]) => text));
      return blocks.map((block) => (block.premises || []).filter((text) => !shared.has(text)));
    };
    const full = window.TAKKEN_BUSINESS_FULLSCORE_BANK.QUESTIONS;
    const hard = window.TAKKEN_BUSINESS_HARD_BANK.QUESTIONS;
    const choiceBlocks = (question) => question.displayModel?.choiceBlocks;
    const unique = full.find((question) => {
      const blocks = choiceBlocks(question);
      return Array.isArray(blocks) && blocks.length === 4 && ownPremises(blocks).some((items) => items.length);
    });
    const common = full.find((question) => {
      const blocks = choiceBlocks(question);
      if (!Array.isArray(blocks) || blocks.length !== 4) return false;
      const all = blocks.flatMap((block) => block.premises || []);
      return all.some((text) => all.filter((candidate) => candidate === text).length > 1);
    });
    const hardPlain = hard.find((question) => !Array.isArray(choiceBlocks(question)) || !choiceBlocks(question).length);
    const hardNoOwn = hard.find((question) => {
      const blocks = choiceBlocks(question);
      return Array.isArray(blocks) && blocks.length === 4 && ownPremises(blocks).every((items) => !items.length);
    });
    const raw = window.TAKKEN_PRACTICAL_VARIATIONS.QUESTIONS.find((question) => !question.displayModel);
    const count = full.find((question) => question.formatKey === "count");
    const combination = full.find((question) => question.formatKey === "combination");
    const result = { unique, common, hardPlain, hardNoOwn, raw, count, combination };
    for (const [name, question] of Object.entries(result)) {
      if (!question) throw new Error(`missing ${name} premise-layout fixture`);
    }
    return Object.fromEntries(Object.entries(result).map(([name, question]) => [name, {
      id: question.id,
      bankId: name === "raw" ? "legacy-practical" : "business-fullscore",
      kind: name
    }]));
  });
}

async function forceQuestion(page, fixture, presentationKey = "choice-premise-layout-a") {
  await page.evaluate(({ fixture, presentationKey }) => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") &&
      !candidate.includes("corrupt") && !candidate.endsWith("event-outbox"));
    const state = JSON.parse(localStorage.getItem(key));
    const business = fixture.bankId === "business-fullscore";
    state.practicalDrill = {
      ...state.practicalDrill,
      bankId: fixture.bankId,
      bankVersion: business ? window.TAKKEN_BUSINESS_FULLSCORE_BANK.VERSION : window.TAKKEN_PRACTICAL_VARIATIONS.VERSION,
      presentationKey: business ? presentationKey : "",
      presentationOverrides: {},
      planMode: business ? "knock" : "legacy",
      stage: "active",
      scope: business ? "business" : "all",
      unitId: "",
      sessionSize: 1,
      sessionIds: [fixture.id],
      queue: [fixture.id],
      position: 0,
      currentAttempt: null,
      retryIds: [],
      completedAt: "",
      attempts: 0,
      correctAttempts: 0,
      history: {}
    };
    localStorage.setItem(key, JSON.stringify(state));
  }, { fixture, presentationKey });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
}

async function expectedPresented(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") &&
      !candidate.includes("corrupt") && !candidate.endsWith("event-outbox"));
    const drill = JSON.parse(localStorage.getItem(key)).practicalDrill;
    const id = drill.queue[drill.position];
    const bank = window.TAKKEN_BUSINESS_HARD_BANK.QUESTIONS_BY_ID[id]
      ? window.TAKKEN_BUSINESS_HARD_BANK
      : drill.bankId === "business-fullscore" ? window.TAKKEN_BUSINESS_FULLSCORE_BANK : window.TAKKEN_PRACTICAL_VARIATIONS;
    const question = bank.QUESTIONS_BY_ID?.[id] || bank.QUESTIONS.find((item) => item.id === id);
    const presentationKey = drill.presentationOverrides?.[id] || drill.presentationKey;
    const presented = bank.presentQuestion ? bank.presentQuestion(question, presentationKey) : question;
    const blocks = Array.isArray(presented.displayModel?.choiceBlocks) ? presented.displayModel.choiceBlocks : [];
    const uses = new Map();
    blocks.forEach((block, index) => new Set(block.premises || []).forEach((text) => {
      if (!text) return;
      if (!uses.has(text)) uses.set(text, []);
      uses.get(text).push(index);
    }));
    const shared = [...uses].filter(([, indexes]) => indexes.length > 1).map(([text, indexes], index) => ({ id: `practicalSharedPremise${index + 1}`, text, indexes }));
    const sharedTexts = new Set(shared.map((item) => item.text));
    return {
      id: presented.id,
      answer: presented.answer,
      choices: [...presented.choices],
      hasChoiceBlocks: blocks.length === 4,
      shared,
      own: blocks.map((block) => (block.premises || []).filter((text) => !sharedTexts.has(text)).join("／")),
      judgments: blocks.map((block) => block.judgment || "")
    };
  });
}

async function actualChoiceLayout(page) {
  return page.evaluate(() => [...document.querySelectorAll(".practical-drill-choice")].map((button, index) => {
    const option = button.closest(".practical-choice-option");
    const premise = option?.querySelector(".practical-choice-premise");
    return {
      index,
      text: button.textContent.trim(),
      structured: button.getAttribute("data-structured"),
      describedBy: button.getAttribute("aria-describedby"),
      option: Boolean(option),
      premiseId: premise?.id || null,
      premiseLabel: premise?.querySelector(".practical-choice-label")?.textContent || null,
      premise: premise?.querySelector(".practical-choice-premise-text")?.textContent || null,
      judgment: button.querySelector(".practical-choice-judgment")?.textContent || null,
      judgmentHasLabel: Boolean(button.querySelector(".practical-choice-judgment .practical-choice-label")),
      nestedPremise: Boolean(button.querySelector(".practical-choice-premise"))
    };
  }));
}

function assertStructuredMapping(actual, expected, label) {
  assert.equal(actual.length, 4, `${label}: four answer buttons`);
  assert.equal(expected.hasChoiceBlocks, true, `${label}: fixture has four structured choice blocks`);
  actual.forEach((choice, index) => {
    const own = expected.own[index];
    const shared = expected.shared.filter((item) => item.indexes.includes(index)).map((item) => item.id);
    assert.equal(choice.structured, "true", `${label}/${index + 1}: structured answer marker`);
    assert.equal(choice.nestedPremise, false, `${label}/${index + 1}: premise must not live inside the answer button`);
    assert.equal(choice.option, Boolean(own), `${label}/${index + 1}: only own premises create an option wrapper`);
    assert.equal(choice.premise, own || null, `${label}/${index + 1}: own premise stays with its presented answer`);
    assert.equal(choice.premiseId, own ? `practicalChoicePremise${index + 1}` : null, `${label}/${index + 1}: stable own-premise id`);
    assert.equal(choice.premiseLabel, own ? `選択肢 ${index + 1} の前提` : null, `${label}/${index + 1}: premise label`);
    assert.equal(choice.describedBy, [...shared, ...(own ? [`practicalChoicePremise${index + 1}`] : [])].join(" ") || null, `${label}/${index + 1}: screen-reader references`);
    assert.equal(choice.judgment, expected.judgments[index], `${label}/${index + 1}: judgment remains paired with its presented premise`);
    assert.equal(choice.judgmentHasLabel, false, `${label}/${index + 1}: no redundant judgment label in answer`);
  });
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

(async () => {
  const local = process.env.TAKKEN_BASE_URL ? null : await startStaticServer(process.cwd());
  const baseUrl = process.env.TAKKEN_BASE_URL || local.baseUrl;
  const chromePath = process.env.TAKKEN_CHROME_PATH || "";
  const browser = await chromium.launch(chromePath ? { executablePath: chromePath, headless: true } : { channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto(appUrl(baseUrl), { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.TAKKEN_BUSINESS_FULLSCORE_BANK?.QUESTIONS_BY_ID && window.TAKKEN_BUSINESS_HARD_BANK?.QUESTIONS_BY_ID));
    assert.ok(await saveKey(page), "app creates an isolated review save");
    const fixtures = await fixtureCatalog(page);

    await forceQuestion(page, fixtures.unique);
    let expected = await expectedPresented(page);
    let actual = await actualChoiceLayout(page);
    assertStructuredMapping(actual, expected, "unique");
    const uniquePremise = page.locator(".practical-choice-option .practical-choice-premise").first();
    await uniquePremise.click();
    assert.equal(await page.locator("#practicalDrillFeedback").isHidden(), true, "clicking the read-only premise must not answer");
    await page.locator(".practical-drill-choice").first().focus();
    await page.keyboard.press("Enter");
    await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
    const verdict = await page.locator("#practicalDrillVerdict").textContent();
    assert.doesNotMatch(verdict, /【前提】/, "verdict must not reintroduce raw premise markers");
    assert.ok(verdict.includes(expected.judgments[expected.answer]), "verdict repeats the correct presented judgment without its premise marker");

    await forceQuestion(page, fixtures.common, "choice-premise-common-a");
    expected = await expectedPresented(page);
    actual = await actualChoiceLayout(page);
    assertStructuredMapping(actual, expected, "common");
    assert.ok(expected.shared.length > 0, "common fixture has a shared premise");
    assert.equal(await page.locator(".practical-prompt-shared-row").count(), expected.shared.length, "common premise remains once above the choices");

    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual(await actualChoiceLayout(page), actual, "reload preserves the exact premise-to-presented-choice correspondence");

    const answer = (await expectedPresented(page)).answer;
    await page.locator(".practical-drill-choice").nth((answer + 1) % 4).click();
    await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
    await page.locator("#practicalDrillNextButton").click();
    await page.waitForFunction(() => {
      const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("takken-battle-study-clean-v2-hard-review-") && !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") && !candidate.includes("corrupt") && !candidate.endsWith("event-outbox"));
      const drill = key && JSON.parse(localStorage.getItem(key)).practicalDrill;
      return drill?.stage === "retry" && document.querySelector("#practicalDrillSession") && document.querySelector("#practicalDrillFeedback")?.hidden;
    });
    // A one-question wrong answer immediately starts its shuffled retry. The
    // DOM must still correspond to the current saved presentation, not the
    // original ordering.
    expected = await expectedPresented(page);
    actual = await actualChoiceLayout(page);
    assertStructuredMapping(actual, expected, "retry");

    for (const kind of ["hardPlain", "hardNoOwn", "raw", "count", "combination"]) {
      await forceQuestion(page, fixtures[kind], `choice-premise-${kind}`);
      expected = await expectedPresented(page);
      actual = await actualChoiceLayout(page);
      assert.equal(actual.length, 4, `${kind}: four fallback answer buttons`);
      assert.equal(await page.locator(".practical-choice-option").count(), 0, `${kind}: no premise wrapper in the unchanged fallback`);
      assert.ok(actual.every((choice) => choice.structured !== "true" || !choice.option), `${kind}: fallback answers stay simple`);
      assert.deepEqual(
        actual.map((choice) => choice.text.replace(/^\d+\.?\s*/, "")),
        expected.choices,
        `${kind}: answer text/order remains unchanged without adding a premise to the button`
      );
    }

    const screenshotRoot = path.join(process.cwd(), "output", "playwright", "choice-premise");
    fs.mkdirSync(screenshotRoot, { recursive: true });
    await forceQuestion(page, fixtures.unique, "choice-premise-viewport");
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator(".practical-choice-option").first().scrollIntoViewIfNeeded();
      assert.equal(await overflow(page), 0, `${width}px: no horizontal overflow`);
      await page.screenshot({ path: path.join(screenshotRoot, `${width}.png`), fullPage: false });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "ok", unique: fixtures.unique.id, common: fixtures.common.id, hardPlain: fixtures.hardPlain.id, hardNoOwn: fixtures.hardNoOwn.id, raw: fixtures.raw.id, count: fixtures.count.id, combination: fixtures.combination.id, screenshots: [320, 390, 1440] }));
  } finally {
    await browser.close();
    await local?.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
