#!/usr/bin/env node
"use strict";

// Browser proof for the learner-facing guarantee-association weak-point drill.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function startStaticServer(root) {
  const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp" };
  const safeRoot = path.resolve(root);
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(safeRoot, relative);
    if (!target.startsWith(`${safeRoot}${path.sep}`) && target !== path.join(safeRoot, "index.html")) {
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
    server.listen(0, "127.0.0.1", () => resolve({
      baseUrl: `http://127.0.0.1:${server.address().port}/`,
      close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(done); })
    }));
  });
}

function reviewUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set("review", `guarantee-ui-${Date.now().toString(36)}`);
  return url.toString();
}

async function waitForApp(page) {
  await page.waitForFunction(() => Boolean(
    window.TAKKEN_GUARANTEE_ASSOCIATION_DRILL?.QUESTIONS?.length === 20 &&
    document.querySelector("#guaranteeSpecialCard") &&
    document.querySelector("#guaranteeSpecialStart")
  ));
}

async function readSavedState(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") && !candidate.includes("-before-") &&
      !candidate.includes("previous") && !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    if (!key) throw new Error("guarantee special save key not found");
    return { key, state: JSON.parse(localStorage.getItem(key)) };
  });
}

async function failPrimarySaveWrites(page, primaryKey) {
  await page.evaluate((exactPrimaryKey) => {
    if (window.__guaranteeNativeSetItem) return;
    window.__guaranteeNativeSetItem = Storage.prototype.setItem;
    window.__guaranteePrimarySaveKey = exactPrimaryKey;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (String(key) === window.__guaranteePrimarySaveKey) {
        throw new DOMException("storage unavailable", "QuotaExceededError");
      }
      return window.__guaranteeNativeSetItem.call(this, key, value);
    };
  }, primaryKey);
}

async function restorePrimarySaveWrites(page) {
  await page.evaluate(() => {
    if (!window.__guaranteeNativeSetItem) return;
    Storage.prototype.setItem = window.__guaranteeNativeSetItem;
    delete window.__guaranteeNativeSetItem;
    delete window.__guaranteePrimarySaveKey;
  });
}

async function assertVisiblePracticalSaveError(page, expected) {
  const status = page.locator("#practicalDrillSaveError");
  await status.waitFor({ state: "visible" });
  assert.match(await status.textContent(), expected);
  assert.equal(await status.getAttribute("role"), "status");
  assert.equal(await status.getAttribute("aria-live"), "polite");
  await page.waitForFunction(() => document.activeElement?.id === "practicalDrillSaveError");
  await page.waitForFunction(() => {
    const node = document.querySelector("#practicalDrillSaveError");
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  });
}

async function presented(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("takken-battle-study-clean-v2-hard-review-") && !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") && !candidate.includes("corrupt") && !candidate.endsWith("event-outbox"));
    const state = JSON.parse(localStorage.getItem(key));
    const id = state.practicalDrill.queue[state.practicalDrill.position];
    const presentationKey = state.practicalDrill.presentationOverrides?.[id] || state.practicalDrill.presentationKey;
    const question = window.TAKKEN_GUARANTEE_ASSOCIATION_DRILL.presentQuestion(id, presentationKey);
    return { id: question.id, answer: question.answer, choices: [...question.choices] };
  });
}

async function answerAndAdvance(page, kind = "confident") {
  const question = await presented(page);
  const choice = kind === "wrong" ? (question.answer + 1) % 4 : question.answer;
  await page.locator(".practical-drill-choice").nth(choice).click();
  await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
  if (kind !== "wrong") await page.locator(`[data-practical-confidence="${kind}"]`).click();
  await page.locator("#practicalDrillNextButton").click();
  return question;
}

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

(async () => {
  const local = await startStaticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  try {
    await page.goto(reviewUrl(local.baseUrl), { waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(page);
    assert.equal(await page.locator("#guaranteeSpecialCard").isVisible(), true);
    assert.match(await page.locator("#guaranteeSpecialTitle").textContent(), /保証協会・営業保証金 特訓20問/);
    assert.equal(await page.locator("#guaranteeSpecialContacted").textContent(), "0 / 20");
    const ids = await page.evaluate(() => window.TAKKEN_GUARANTEE_ASSOCIATION_DRILL.QUESTIONS.map((question) => question.id));
    assert.equal(ids.length, 20);
    assert.ok(ids.every((id) => /^ga\d{3}$/.test(id)), `unexpected special ids: ${ids.join(", ")}`);
    assert.equal(new Set(ids).size, 20, "guarantee drill IDs must not duplicate");
    const startTargets = await page.locator("#guaranteeSpecialCard button").evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
    assert.ok(startTargets.every((height) => height >= 44), `guarantee CTA under 44px: ${startTargets.join(", ")}`);

    const priorityWeakId = ids.at(-1);
    const currentHistoryId = ids.at(-2);
    const priorityFixture = await readSavedState(page);
    await page.evaluate(({ key, weakId, currentId }) => {
      const saved = JSON.parse(localStorage.getItem(key));
      saved.practicalDrill.history[weakId] = {
        attempts: 1,
        correct: 0,
        wrong: 1,
        uncertain: 0,
        lastConfidence: "wrong"
      };
      saved.practicalDrill.history[currentId] = {
        attempts: 2,
        correct: 1,
        wrong: 1,
        uncertain: 0,
        lastConfidence: "confident"
      };
      saved.guaranteeAssociationRecovery = {
        version: 1,
        history: {
          [currentId]: {
            attempts: 1,
            correct: 0,
            wrong: 1,
            uncertain: 0,
            lastConfidence: "wrong"
          }
        },
        activeSession: null
      };
      localStorage.setItem(key, JSON.stringify(saved));
    }, { key: priorityFixture.key, weakId: priorityWeakId, currentId: currentHistoryId });
    await page.reload({ waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(page);
    assert.equal(await page.locator("#guaranteeSpecialRetry").textContent(), "1", "an existing weak question must be visible before launch");
    assert.equal(await page.locator("#guaranteeSpecialGrounded").textContent(), "1 / 20", "current-schema history must override an older recovery snapshot");
    const currentAfterReload = await readSavedState(page);
    assert.equal(currentAfterReload.state.practicalDrill.history[currentHistoryId].attempts, 2, "recovery must not roll back current-schema attempts");
    assert.equal(currentAfterReload.state.practicalDrill.history[currentHistoryId].lastConfidence, "confident", "recovery must not revive an obsolete wrong outcome");

    await page.locator("#guaranteeSpecialStart").click();
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    let saved = await readSavedState(page);
    assert.equal(saved.state.practicalDrill.bankId, "guarantee-association-special");
    assert.equal(saved.state.practicalDrill.planMode, "guarantee");
    assert.equal(saved.state.practicalDrill.sessionSize, 20);
    assert.equal(saved.state.practicalDrill.queue.length, 20);
    assert.ok(saved.state.practicalDrill.queue.every((id) => /^ga\d{3}$/.test(id)));
    assert.equal(new Set(saved.state.practicalDrill.queue).size, 20, "session must contain 20 unique ga IDs");
    assert.equal(saved.state.practicalDrill.queue[0], priorityWeakId, "an existing wrong answer must lead the next 20-question round");
    assert.match(await page.locator("#practicalDrillSummary").textContent(), /保証協会特訓累計 接触 2 \/ 20/);

    const wrong = await presented(page);
    await page.locator(".practical-drill-choice").nth((wrong.answer + 1) % 4).click();
    await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
    const feedback = await page.locator("#practicalDrillFeedback").textContent();
    assert.doesNotMatch(feedback, /\[object Object\]/, "feedback must never stringify explanation objects");
    assert.match(feedback, /判定のまとめ/);
    assert.match(feedback, /各記述を1つずつ判定/);
    assert.match(feedback, /間違いやすい境界/);
    assert.match(feedback, /次に再現する一文/);
    const verdictRows = await page.locator("#practicalDrillReasoning .practical-statement-review-card").count();
    assert.equal(verdictRows, 4, "wrong-answer feedback must explain all four choices");
    assert.equal(await page.locator("#practicalDrillNextButton").isDisabled(), false);
    await page.evaluate(() => localStorage.setItem("guarantee-ui-sentinel", "must-survive-reload-and-drill"));
    await page.reload({ waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(page);
    saved = await readSavedState(page);
    assert.equal(saved.state.practicalDrill.bankId, "guarantee-association-special");
    assert.equal(saved.state.practicalDrill.currentAttempt?.id, wrong.id, "reload must resume the answered guarantee question");
    assert.equal(saved.state.practicalDrill.currentAttempt?.correct, false);
    assert.equal(await page.evaluate(() => localStorage.getItem("guarantee-ui-sentinel")), "must-survive-reload-and-drill");
    assert.equal(await page.locator("#practicalDrillFeedback").isVisible(), true);

    await page.locator("#practicalDrillNextButton").click();
    for (let index = 0; index < 19; index += 1) await answerAndAdvance(page, "confident");
    saved = await readSavedState(page);
    assert.equal(saved.state.practicalDrill.stage, "retry", "a wrong special question must enter the same-set retry queue");
    assert.deepEqual(saved.state.practicalDrill.queue, [wrong.id]);
    const retried = await presented(page);
    assert.equal(retried.id, wrong.id);
    assert.notEqual(retried.answer, wrong.answer, "retry must move the correct answer position");
    assert.notDeepEqual(retried.choices, wrong.choices, "retry must change the displayed choice order");
    await answerAndAdvance(page, "confident");
    await page.locator("#practicalDrillComplete").waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => localStorage.getItem("guarantee-ui-sentinel")), "must-survive-reload-and-drill");
    assert.equal(errors.length, 0, errors.join("\n"));

    await page.setViewportSize({ width: 320, height: 700 });
    assert.equal(await horizontalOverflow(page), 0, "guarantee special UI must fit 320px");
    const narrowTargets = await page.locator("#guaranteeSpecialCard button, #practicalDrillComplete button").evaluateAll((nodes) => nodes.filter((node) => !node.closest("[hidden]")).map((node) => Math.round(node.getBoundingClientRect().height)));
    assert.ok(narrowTargets.every((height) => height >= 44), `320px CTA under 44px: ${narrowTargets.join(", ")}`);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await horizontalOverflow(page), 0, "guarantee special UI must fit 390px");

    // A failed first write must roll the in-memory launch back to idle rather
    // than showing a session that cannot be resumed after reload.
    const failureContext = await browser.newContext({ viewport: { width: 320, height: 700 }, timezoneId: "Asia/Tokyo" });
    const failurePage = await failureContext.newPage();
    try {
      await failurePage.goto(reviewUrl(local.baseUrl), { waitUntil: "networkidle", timeout: 20000 });
      await waitForApp(failurePage);
      let failedStart = await readSavedState(failurePage);
      assert.equal(failedStart.state.practicalDrill.stage, "idle", "failure fixture must begin idle");
      await failPrimarySaveWrites(failurePage, failedStart.key);
      await failurePage.locator("#guaranteeSpecialStart").click();
      assert.equal(await failurePage.locator("#practicalDrillSession").isHidden(), true, "failed start must not leave a visible session");
      assert.match(
        await failurePage.locator("#todayCommandStatus").textContent(),
        /保証協会特訓の開始状態を保存できませんでした。もう一度試してください。/
      );
      await restorePrimarySaveWrites(failurePage);
      failedStart = await readSavedState(failurePage);
      assert.equal(failedStart.state.practicalDrill.stage, "idle", "failed start must retain the persisted idle state");
      await failurePage.locator("#guaranteeSpecialStart").click();
      await failurePage.locator("#practicalDrillSession").waitFor({ state: "visible" });
      const retriedStart = await readSavedState(failurePage);
      assert.equal(retriedStart.state.practicalDrill.bankId, "guarantee-association-special", "launch must remain retryable after storage recovers");

      const failureQuestion = await presented(failurePage);
      const beforeFailedAnswer = await readSavedState(failurePage);
      await failPrimarySaveWrites(failurePage, beforeFailedAnswer.key);
      await failurePage.locator(".practical-drill-choice").nth(failureQuestion.answer).click();
      assert.equal(await failurePage.locator("#practicalDrillFeedback").isHidden(), true, "failed answer must return to the unanswered question");
      assert.match(await failurePage.locator("#todayCommandStatus").textContent(), /解答を保存できませんでした。進捗は加算していません。/);
      await assertVisiblePracticalSaveError(failurePage, /解答を保存できませんでした。進捗は加算していません。/);
      assert.equal(await horizontalOverflow(failurePage), 0, "the inline save error must not overflow a 320px viewport");
      let failedMutation = await readSavedState(failurePage);
      assert.deepEqual(failedMutation.state.practicalDrill, beforeFailedAnswer.state.practicalDrill, "failed answer must not change persisted practical state");
      assert.ok(await failurePage.evaluate((key) => localStorage.getItem(`${key}-previous`) !== null, beforeFailedAnswer.key), "the exact primary-write failure must occur after the recoverable previous-save rotation");
      await restorePrimarySaveWrites(failurePage);

      await failurePage.locator(".practical-drill-choice").nth(failureQuestion.answer).click();
      await failurePage.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
      assert.equal(await failurePage.locator("#practicalDrillSaveError").isHidden(), true, "a recovered answer must clear the inline save error");
      const beforeFailedConfidence = await readSavedState(failurePage);
      assert.equal(beforeFailedConfidence.state.practicalDrill.currentAttempt?.confidence, "");
      await failPrimarySaveWrites(failurePage, beforeFailedConfidence.key);
      await failurePage.locator('[data-practical-confidence="uncertain"]').click();
      assert.equal(await failurePage.locator("#practicalDrillNextButton").isDisabled(), true, "failed confidence must remain unselected");
      assert.match(await failurePage.locator("#todayCommandStatus").textContent(), /手応えを保存できませんでした。再出題判定は変更していません。/);
      await assertVisiblePracticalSaveError(failurePage, /手応えを保存できませんでした。再出題判定は変更していません。/);
      failedMutation = await readSavedState(failurePage);
      assert.deepEqual(failedMutation.state.practicalDrill, beforeFailedConfidence.state.practicalDrill, "failed confidence must not change persisted practical state");
      await restorePrimarySaveWrites(failurePage);

      await failurePage.locator('[data-practical-confidence="uncertain"]').click();
      assert.equal(await failurePage.locator("#practicalDrillNextButton").isDisabled(), false);
      assert.equal(await failurePage.locator("#practicalDrillSaveError").isHidden(), true, "a recovered confidence choice must clear the inline save error");
      const beforeFailedAdvance = await readSavedState(failurePage);
      assert.equal(beforeFailedAdvance.state.practicalDrill.history[failureQuestion.id].lastConfidence, "uncertain");
      assert.ok(Number.isFinite(Date.parse(beforeFailedAdvance.state.practicalDrill.history[failureQuestion.id].lastConfidenceAt)), "confidence update must persist an ordering timestamp");
      await failPrimarySaveWrites(failurePage, beforeFailedAdvance.key);
      await failurePage.locator("#practicalDrillNextButton").click();
      assert.equal(await failurePage.locator("#practicalDrillFeedback").isVisible(), true, "failed advance must retain the answered question");
      assert.match(await failurePage.locator("#todayCommandStatus").textContent(), /次の問題へ進めませんでした。現在の解答位置を保持しています。/);
      await assertVisiblePracticalSaveError(failurePage, /次の問題へ進めませんでした。現在の解答位置を保持しています。/);
      failedMutation = await readSavedState(failurePage);
      assert.deepEqual(failedMutation.state.practicalDrill, beforeFailedAdvance.state.practicalDrill, "failed advance must not change persisted practical state");
      await restorePrimarySaveWrites(failurePage);
      await failurePage.locator("#practicalDrillNextButton").click();
      assert.equal(await failurePage.locator("#practicalDrillSaveError").isHidden(), true, "a recovered advance must clear the inline save error");
      const afterRecoveredAdvance = await readSavedState(failurePage);
      assert.equal(afterRecoveredAdvance.state.practicalDrill.position, beforeFailedAdvance.state.practicalDrill.position + 1, "advance must remain retryable after storage recovers");

      const discardAccepted = new Promise((resolve, reject) => {
        failurePage.once("dialog", (dialog) => dialog.accept().then(resolve, reject));
      });
      await failurePage.locator("#practicalDrillDiscardButton").click();
      await discardAccepted;
      await failurePage.locator("#practicalDrillSession").waitFor({ state: "hidden" });
      let discarded = await readSavedState(failurePage);
      assert.equal(discarded.state.practicalDrill.stage, "idle", "discard must persist an idle practical state");
      assert.equal(discarded.state.guaranteeAssociationRecovery?.activeSession, null, "discard must clear the v37 recovery active session");
      await failurePage.reload({ waitUntil: "networkidle", timeout: 20000 });
      await waitForApp(failurePage);
      discarded = await readSavedState(failurePage);
      assert.equal(await failurePage.locator("#practicalDrillSession").isHidden(), true, "discarded guarantee session must not auto-resume after reload");
      assert.equal(discarded.state.practicalDrill.stage, "idle", "reload must retain the discarded idle state");
      assert.equal(discarded.state.guaranteeAssociationRecovery?.activeSession, null, "reload must not recreate a discarded recovery session");
    } finally {
      await failureContext.close();
    }
    console.log("Audit-TakkenGuaranteeAssociationDrillUi: OK (20 ga IDs, all-choice explanation, reload/retry/save isolation, 390/320)");
  } finally {
    await browser.close();
    await local.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
