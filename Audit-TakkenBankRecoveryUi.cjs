#!/usr/bin/env node
"use strict";

// Synthetic localhost profiles only. Blocking service workers makes each
// dependency abort deterministic; this is not an offline/PWA lifecycle audit.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const ASSETS = [
  "tax-authored-bank.js",
  "tax-cases-v59.js",
  "restrictions-cases-city-land.js",
  "restrictions-cases-building-readjustment.js",
  "restrictions-cases-agriculture-fill.js",
  "restrictions-authored-bank.js",
  "subject-sprint-bank.js",
  "calculation-drill.js",
  "practical-question-bank.js",
  "business-fullscore-bank.js",
  "business-hard-bank.js",
  "guarantee-association-drill.js"
];
const WIDTHS = [320, 390, 1280];
const INCOMPLETE_SPRINTS = [
  { label: "wrong-count", override: "QUESTIONS: bank.QUESTIONS.slice(0, -1)" },
  { label: "wrong-legal-baseline", override: 'LEGAL_BASELINE: "2025-04-01"' },
  { label: "missing-present-question", override: "presentQuestion: undefined" },
  { label: "missing-diversify", override: "diversify: undefined" },
  { label: "duplicate-id", override: "QUESTIONS: bank.QUESTIONS.map((question, index) => index === 1 ? { ...question, id: bank.QUESTIONS[0].id } : question)", normalizedShape: true },
  { label: "three-choices", override: "QUESTIONS: bank.QUESTIONS.map((question, index) => index === 0 ? { ...question, choices: question.choices.slice(0, 3) } : question)", normalizedShape: true }
];
const focus = process.env.TAKKEN_BANK_RECOVERY_FOCUS || "all";
const runLabel = String(process.env.TAKKEN_BANK_RECOVERY_RUN_LABEL || "current").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "current";
const output = path.join(__dirname, "output", "playwright", "bank-recovery-ui", runLabel);
const result = { status: "running", coverage: focus, syntheticContextOnly: true, serviceWorkers: "block", faultInjection: "one dependency route abort or incomplete module at a time", scenarios: [], layouts: [] };
let phase = "start";

async function host() {
  const root = path.resolve(__dirname);
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json" };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = path.resolve(root, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
    if (!target.startsWith(root + path.sep)) return response.writeHead(403).end();
    fs.readFile(target, (error, body) => {
      if (error) return response.writeHead(404).end();
      response.writeHead(200, { "content-type": types[path.extname(target)] || "application/octet-stream", "cache-control": "no-store" });
      response.end(body);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); }) };
}

const allStorage = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
const saved = async (page, key) => JSON.parse(await page.evaluate(key => localStorage.getItem(key), key));

function storageStats(storage, key) {
  const state = JSON.parse(storage[key] || "null");
  const drill = state?.practicalDrill;
  return { keys: Object.keys(storage).length, bytes: Object.values(storage).reduce((sum, value) => sum + value.length, 0),
    bankId: drill?.bankId || "", stage: drill?.stage || "", queue: drill?.queue?.length || 0,
    position: drill?.position ?? null, attemptPresent: Boolean(drill?.currentAttempt), revision: state?.syncMeta?.revision ?? null };
}

async function assertStorageUnchanged(page, before, key) {
  const after = await allStorage(page);
  const same = JSON.stringify(after) === JSON.stringify(before);
  if (!same) result.storageFailure = { phase, before: storageStats(before, key), after: storageStats(after, key) };
  assert.ok(same, `${phase}: missing-bank initialization/retry must preserve every localStorage key and byte, including primary and backups`);
}

async function reveal(page, selector) {
  await page.locator(selector).evaluate(node => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === "DETAILS") parent.open = true;
  });
}

async function boot(page) {
  await page.waitForFunction(() => Boolean(
    window.TAKKEN_TAX_AUTHORED_BANK?.QUESTIONS.length === 24 &&
    window.TAKKEN_RESTRICTIONS_AUTHORED_BANK?.QUESTIONS.length === 72 &&
    window.TAKKEN_SUBJECT_SPRINT_BANK?.QUESTIONS.length === 198 &&
    document.querySelector(".app-root") && !document.querySelector(".app-root").hidden
  ));
}

async function uiQuestion(page) {
  return page.evaluate(() => ({
    prompt: document.querySelector("#practicalDrillPrompt").textContent,
    progress: document.querySelector("#practicalDrillProgress").textContent,
    choices: [...document.querySelectorAll(".practical-drill-choice")].map(node => ({ text: node.textContent, classes: node.className, disabled: node.disabled })),
    verdict: document.querySelector("#practicalDrillVerdict").textContent,
    feedbackVisible: !document.querySelector("#practicalDrillFeedback").hidden
  }));
}

async function answerCurrent(page, key, subject) {
  if (subject === "law") await page.locator('[data-practical-forecast="uncertain"]').click();
  const answer = await page.evaluate(key => {
    const drill = JSON.parse(localStorage.getItem(key)).practicalDrill;
    return window.TAKKEN_SUBJECT_SPRINT_BANK.presentQuestion(drill.queue[drill.position], drill.presentationOverrides?.[drill.queue[drill.position]] || drill.presentationKey).answer;
  }, key);
  await page.locator(".practical-drill-choice").nth(answer).click();
  await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
  const confidence = page.locator('[data-practical-confidence="confident"]');
  if (await confidence.isVisible()) await confidence.click();
}

async function prepareSession(page, key, subject) {
  const selector = subject === "tax" ? "#taxAuthoredTen" : '[data-subject-sprint="restrictions"][data-subject-sprint-topic="authored"]';
  await reveal(page, selector);
  await page.locator(selector).click();
  await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
  await answerCurrent(page, key, subject);
  await page.locator("#practicalDrillNextButton").click();
  await answerCurrent(page, key, subject);
  const state = await saved(page, key);
  assert.equal(state.practicalDrill.bankId, "subject-sprint");
  assert.equal(state.practicalDrill.stage, "active");
  assert.equal(state.practicalDrill.position, 1, "fixture must preserve a nonzero saved position");
  assert.equal(state.practicalDrill.queue.length, subject === "tax" ? 10 : 20);
  assert.ok(state.practicalDrill.currentAttempt?.correct, "fixture must contain an actual UI answer, not a fabricated session");
  assert.equal(Object.keys(state.practicalDrill.history).length, 2);
  assert.ok(await page.evaluate(key => Boolean(localStorage.getItem(`${key}-previous`)), key), "normal UI saves must have created a backup");
  return { drill: state.practicalDrill, ui: await uiQuestion(page) };
}

async function recoveryVisible(page, asset) {
  await page.locator("#bankLoadRecovery").waitFor({ state: "visible" });
  assert.equal(await page.locator(".app-root").isVisible(), false, "incomplete learning UI must not be operable");
  assert.equal(await page.locator(".app-root").evaluate(node => node.hidden), true);
  assert.equal(await page.locator("#bankLoadRetry").isEnabled(), true);
  const detail = await page.locator("#bankLoadDetail").textContent();
  assert.ok(detail.trim().length > 0, "recovery must explain which bank is unavailable");
  if (asset.startsWith("tax-")) assert.match(detail, /税/, "tax dependencies need a tax-specific recovery explanation");
  if (asset.startsWith("restrictions-")) assert.match(detail, /法令|制限/, "restriction dependencies need a restriction-specific recovery explanation");
}

async function checkRecoveryLayout(page, subject) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    const geometry = await page.locator("#bankLoadRecovery").evaluate(node => {
      const box = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, clippedX: element.scrollWidth > element.clientWidth + 1, clippedY: element.scrollHeight > element.clientHeight + 1 }; };
      return { viewport: { width: innerWidth, height: innerHeight }, overflow: document.documentElement.scrollWidth - innerWidth,
        panel: box(node), detail: box(document.querySelector("#bankLoadDetail")), retry: box(document.querySelector("#bankLoadRetry")) };
    });
    assert.ok(geometry.overflow <= 1, `${subject}/${width}: recovery horizontal overflow`);
    for (const [name, item] of Object.entries(geometry).filter(([name]) => ["panel", "detail", "retry"].includes(name))) {
      assert.ok(item.width > 0 && item.height > 0 && item.left >= -1 && item.right <= width + 1, `${subject}/${width}: ${name} horizontally cut off`);
      assert.ok(item.top >= -1 && item.bottom <= 845, `${subject}/${width}: ${name} outside initial viewport`);
      assert.equal(item.clippedX, false, `${subject}/${width}: ${name} text clipped horizontally`);
      assert.equal(item.clippedY, false, `${subject}/${width}: ${name} text clipped vertically`);
    }
    assert.ok(geometry.retry.height >= 44, `${subject}/${width}: retry touch target below 44px`);
    await page.locator("#bankLoadRetry").focus();
    assert.equal(await page.locator("#bankLoadRetry").evaluate(node => document.activeElement === node), true, "keyboard focus must reach retry");
    await page.screenshot({ path: path.join(output, `recovery-${subject}-${width}.png`), fullPage: false });
    result.layouts.push({ subject, width, ...geometry });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

async function clickRetry(page) {
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }), page.locator("#bankLoadRetry").click()]);
}

async function contextFor(browser, serverUrl, label) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce", serviceWorkers: "block" });
  context.setDefaultTimeout(15000);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const review = `bank61-${Date.now().toString(36)}-${label}`.slice(0, 24);
  const url = new URL(serverUrl); url.searchParams.set("review", review); url.searchParams.set("today", "1");
  return { context, page, errors, url: url.toString(), key: `takken-battle-study-clean-v2-hard-review-${review}` };
}

async function existingSession(browser, serverUrl, subject) {
  const { context, page, errors, url, key } = await contextFor(browser, serverUrl, subject);
  try {
    phase = `${subject}: prepare real UI session`;
    await page.goto(url, { waitUntil: "networkidle" }); await boot(page);
    const expected = await prepareSession(page, key, subject);
    assert.deepEqual(errors, [], "healthy session preparation must have no page errors");
    for (const [index, asset] of (focus === "all" ? ASSETS : []).entries()) {
      const before = await allStorage(page);
      let aborted = 0;
      const route = `**/${asset}*`;
      await page.route(route, interception => { aborted += 1; return interception.abort(); });
      phase = `${subject}: missing ${asset}`;
      await page.reload({ waitUntil: "networkidle" });
      assert.ok(aborted > 0, `${phase}: fixture did not abort requested asset`);
      await assertStorageUnchanged(page, before, key);
      await recoveryVisible(page, asset);
      if (index === 0) {
        await checkRecoveryLayout(page, subject);
        phase = `${subject}: retry still missing ${asset}`;
        await clickRetry(page);
        await recoveryVisible(page, asset);
        await assertStorageUnchanged(page, before, key);
      }
      await page.unroute(route);
      const errorCountBeforeRecovery = errors.length;
      phase = `${subject}: recovered ${asset}`;
      await clickRetry(page); await boot(page);
      await reveal(page, "#practicalDrillSession");
      await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
      assert.equal(await page.locator("#bankLoadRecovery").isVisible(), false);
      const restored = await saved(page, key);
      assert.ok(JSON.stringify(restored.practicalDrill) === JSON.stringify(expected.drill), `${phase}: complete session, history, grading, presentation keys or position changed`);
      assert.deepEqual(await uiQuestion(page), expected.ui, `${phase}: restored question, option order, selection or feedback changed`);
      assert.equal(errors.length, errorCountBeforeRecovery, `${phase}: unexpected page error after healthy recovery`);
      result.scenarios.push({ subject, asset, existingSave: true, unchangedAllStorageBytes: true, retryFailurePreserved: index === 0, exactSessionAndUiRestored: true });
    }
    if (subject === "tax") {
      for (const variant of INCOMPLETE_SPRINTS.filter(item => focus === "all" || item.normalizedShape)) {
        phase = `tax: incomplete sprint ${variant.label}`;
        const before = await allStorage(page);
        let injected = 0;
        const route = "**/subject-sprint-bank.js*";
        await page.route(route, async interception => {
          const response = await interception.fetch();
          const body = await response.text();
          injected += 1;
          await interception.fulfill({ response, body: body + `\n;(() => { const bank = window.TAKKEN_SUBJECT_SPRINT_BANK; window.TAKKEN_SUBJECT_SPRINT_BANK = { ...bank, ${variant.override} }; })();\n` });
        });
        await page.reload({ waitUntil: "networkidle" });
        assert.ok(injected > 0, `${phase}: incomplete-module fixture must run`);
        await assertStorageUnchanged(page, before, key);
        await recoveryVisible(page, "subject-sprint-bank.js");
        assert.match(await page.locator("#bankLoadDetail").textContent(), /科目/, "an incompatible sprint bank needs a subject-sprint explanation");
        await page.unroute(route);
        const errorCount = errors.length;
        phase = `tax: recovered incomplete sprint ${variant.label}`;
        await clickRetry(page); await boot(page); await reveal(page, "#practicalDrillSession");
        const restored = await saved(page, key);
        assert.ok(JSON.stringify(restored.practicalDrill) === JSON.stringify(expected.drill), `${phase}: complete session changed`);
        assert.deepEqual(await uiQuestion(page), expected.ui, `${phase}: restored question/selection changed`);
        assert.equal(errors.length, errorCount, `${phase}: healthy recovery caused a page error`);
        result.scenarios.push({ subject, asset: "subject-sprint-bank.js", incompleteModule: variant.label,
          existingSave: true, unchangedAllStorageBytes: true, exactSessionAndUiRestored: true });
      }
    }
  } finally { await context.close(); }
}

async function firstVisit(browser, serverUrl, asset, index) {
  const { context, page, errors, url, key } = await contextFor(browser, serverUrl, `new${index}`);
  try {
    let aborted = 0;
    const route = `**/${asset}*`;
    await page.route(route, interception => { aborted += 1; return interception.abort(); });
    phase = `first visit: missing ${asset}`;
    await page.goto(url, { waitUntil: "networkidle" });
    assert.ok(aborted > 0, `${phase}: fixture did not abort requested asset`);
    await assertStorageUnchanged(page, {}, key);
    await recoveryVisible(page, asset);
    if (index === 0) {
      phase = `first visit: retry still missing ${asset}`;
      await clickRetry(page); await recoveryVisible(page, asset);
      await assertStorageUnchanged(page, {}, key);
    }
    await page.unroute(route);
    const errorCount = errors.length;
    phase = `first visit: recovered ${asset}`;
    await clickRetry(page); await boot(page);
    const state = await saved(page, key);
    assert.ok(state, "first successful initialization may create the new save");
    assert.equal(state.practicalDrill.stage, "idle");
    assert.equal(state.practicalDrill.attempts, 0);
    assert.deepEqual(state.practicalDrill.history, {});
    assert.equal(errors.length, errorCount, `${phase}: healthy initialization caused a page error`);
    result.scenarios.push({ subject: "first-visit", asset, existingSave: false, unchangedAllStorageBytes: true, retryFailurePreserved: index === 0, healthyInitialization: true });
  } finally { await context.close(); }
}

async function helperSession(browser, serverUrl, subject) {
  const { context, page, url, key } = await contextFor(browser, serverUrl, subject);
  const calculation = subject === "calculation";
  const selector = calculation ? "#calculationDrillResetButton" : "#businessKnockFreshStart";
  const field = calculation ? "calculationDrill" : "practicalDrill";
  const asset = calculation ? "calculation-drill.js" : "business-hard-bank.js";
  const route = `**/${asset}*`;
  try {
    phase = `${subject}: prepare helper session`;
    await page.goto(url, { waitUntil: "networkidle" }); await boot(page);
    await reveal(page, selector); await page.locator(selector).click();
    const expected = (await saved(page, key))[field];
    assert.equal(expected.stage, "active");
    assert.equal(expected.queue.length, calculation ? 35 : 20);
    const before = await allStorage(page);
    let aborted = 0;
    await page.route(route, interception => { aborted++; return interception.abort(); });
    phase = `${subject}: missing ${asset}`;
    await page.reload({ waitUntil: "networkidle" });
    assert.ok(aborted > 0, "helper bank fault injection must abort the actual asset");
    await assertStorageUnchanged(page, before, key); await recoveryVisible(page, asset);
    await clickRetry(page); await recoveryVisible(page, asset); await assertStorageUnchanged(page, before, key);
    await page.unroute(route);
    phase = `${subject}: helper recovered`;
    await clickRetry(page); await boot(page);
    assert.deepEqual((await saved(page, key))[field], expected, "helper session must resume without loss");
    await reveal(page, calculation ? "#calculationDrillPanel" : "#practicalDrillSession");
    assert.equal(await page.locator(calculation ? "#calculationDrillPanel" : "#practicalDrillSession").isVisible(), true);
    result.scenarios.push({ subject, asset, existingSave: true, unchangedAllStorageBytes: true, retryFailurePreserved: true, helperSessionRestored: true });
  } finally { await context.close(); }
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const server = process.env.TAKKEN_BASE_URL ? { url: process.env.TAKKEN_BASE_URL, close: async () => {} } : await host();
  let browser;
  try {
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(server.url).hostname), "fault-injection audit must use a local server");
    assert.ok(["all", "normalized-shape"].includes(focus), "unknown bank-recovery audit focus");
    assert.ok(focus === "all" || (!process.env.CI && !process.env.GITHUB_ACTIONS), "CI must run the complete bank-recovery audit, never a focused subset");
    browser = await chromium.launch(process.env.TAKKEN_CHROME_PATH ? { headless: true, executablePath: process.env.TAKKEN_CHROME_PATH } : { headless: true, channel: "chrome" });
    for (const subject of (focus === "all" ? ["tax", "law"] : ["tax"])) await existingSession(browser, server.url, subject);
    for (const [index, asset] of (focus === "all" ? ASSETS : []).entries()) await firstVisit(browser, server.url, asset, index);
    if (focus === "all") for (const subject of ["calculation", "business"]) await helperSession(browser, server.url, subject);
    assert.equal(result.scenarios.length, focus === "all" ? 44 : 2, "bank-recovery scenario coverage changed");
    assert.equal(result.layouts.length, focus === "all" ? 6 : 0, "bank-recovery viewport coverage changed");
    result.status = "ok";
  } catch (error) {
    result.status = "failed";
    result.failure = { phase, message: error.message };
    throw error;
  } finally {
    await browser?.close(); await server.close();
    fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify({ status: result.status, coverage: focus, scenarios: result.scenarios.length, dependencyAssets: ASSETS.length,
      layouts: result.layouts.length, syntheticContextOnly: true, serviceWorkers: "block", resultPath: path.join(output, "result.json"),
      ...(result.storageFailure ? { storageFailure: result.storageFailure } : {}) }));
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
