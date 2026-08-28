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
    window.TAKKEN_GUARANTEE_ASSOCIATION_DRILL?.QUESTIONS?.length === 26 &&
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

async function assertFocusedInViewport(page, expectedSelector) {
  await page.waitForFunction((selector) => {
    const active = document.activeElement;
    if (!active || !active.matches(selector)) return false;
    const rect = active.getBoundingClientRect();
    const height = window.visualViewport?.height || window.innerHeight;
    return rect.top >= 0 && rect.top < height;
  }, expectedSelector);
  const position = await page.evaluate(() => {
    const rect = document.activeElement.getBoundingClientRect();
    return { id: document.activeElement.id, top: rect.top, bottom: rect.bottom, height: window.visualViewport?.height || window.innerHeight };
  });
  assert.ok(position.top >= 0 && position.top < position.height, `focused target outside viewport: ${JSON.stringify(position)}`);
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
    assert.match(await page.locator("#guaranteeSpecialTitle").textContent(), /保証協会・営業保証金 特訓26問/);
    assert.equal(await page.locator("#guaranteeSpecialContacted").textContent(), "0 / 26");
    assert.equal(await page.locator("#guaranteeSpecialRetained").textContent(), "0 / 26");
    assert.match(await page.locator("#guaranteeSpecialStart").textContent(), /基礎から10問/);
    assert.match(await page.locator("#guaranteeSpecialFullStart").textContent(), /全26問で総点検/);
    const ids = await page.evaluate(() => window.TAKKEN_GUARANTEE_ASSOCIATION_DRILL.QUESTIONS.map((question) => question.id));
    assert.equal(ids.length, 26);
    assert.ok(ids.every((id) => /^ga\d{3}$/.test(id)), `unexpected special ids: ${ids.join(", ")}`);
    assert.equal(new Set(ids).size, 26, "guarantee drill IDs must not duplicate");
    const startTargets = await page.locator("#guaranteeSpecialCard button").evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
    assert.ok(startTargets.every((height) => height >= 44), `guarantee CTA under 44px: ${startTargets.join(", ")}`);

    const priorityWeakId = ids.at(-1);
    const currentHistoryId = ids.at(-2);
    const priorityDueId = ids.at(-3);
    const priorityFixture = await readSavedState(page);
    await page.evaluate(({ key, weakId, currentId, dueId }) => {
      const saved = JSON.parse(localStorage.getItem(key));
      const dueDate = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000));
      const dueKey = [dueDate.getFullYear(), String(dueDate.getMonth() + 1).padStart(2, "0"), String(dueDate.getDate()).padStart(2, "0")].join("-");
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
      saved.practicalDrill.history[dueId] = {
        attempts: 1,
        correct: 1,
        wrong: 0,
        uncertain: 0,
        lastConfidence: "confident",
        lastAnsweredAt: dueDate.toISOString(),
        lastConfidenceAt: dueDate.toISOString(),
        reviewLevel: 1,
        masteryDueKey: dueKey,
        confidentDayKeys: [dueKey]
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
    }, { key: priorityFixture.key, weakId: priorityWeakId, currentId: currentHistoryId, dueId: priorityDueId });
    await page.reload({ waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(page);
    assert.equal(await page.locator("#guaranteeSpecialRetry").textContent(), "2", "wrong and due questions must both be visible as review work");
    assert.equal(await page.locator("#guaranteeSpecialGrounded").textContent(), "2 / 26", "current-schema history must override an older recovery snapshot");
    assert.equal(await page.locator("#guaranteeSpecialRetained").textContent(), "0 / 26", "same-day confidence and a level-1 due item are not retained yet");
    assert.match(await page.locator("#guaranteeSpecialStart").textContent(), /誤答・期限から10問/);
    const currentAfterReload = await readSavedState(page);
    assert.equal(currentAfterReload.state.practicalDrill.history[currentHistoryId].attempts, 2, "recovery must not roll back current-schema attempts");
    assert.equal(currentAfterReload.state.practicalDrill.history[currentHistoryId].lastConfidence, "confident", "recovery must not revive an obsolete wrong outcome");

    await page.locator("#guaranteeSpecialStart").click();
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    await assertFocusedInViewport(page, ".practical-drill-choice");
    let saved = await readSavedState(page);
    assert.equal(saved.state.practicalDrill.bankId, "guarantee-association-special");
    assert.equal(saved.state.practicalDrill.planMode, "guarantee");
    assert.equal(saved.state.practicalDrill.sessionSize, 10);
    assert.equal(saved.state.practicalDrill.queue.length, 10);
    assert.ok(saved.state.practicalDrill.queue.every((id) => /^ga\d{3}$/.test(id)));
    assert.equal(new Set(saved.state.practicalDrill.queue).size, 10, "smart session must contain 10 unique ga IDs");
    assert.equal(saved.state.practicalDrill.queue[0], priorityWeakId, "an existing wrong answer must lead the smart round");
    assert.equal(saved.state.practicalDrill.queue[1], priorityDueId, "a due item must precede untouched questions");
    assert.match(await page.locator("#practicalDrillSummary").textContent(), /保証協会特訓累計 接触 3 \/ 26/);

    const wrong = await presented(page);
    await page.locator(".practical-drill-choice").nth((wrong.answer + 1) % 4).click();
    await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
    await assertFocusedInViewport(page, "#practicalDrillFeedback");
    const feedback = await page.locator("#practicalDrillFeedback").textContent();
    assert.doesNotMatch(feedback, /\[object Object\]/, "feedback must never stringify explanation objects");
    assert.match(feedback, /判定のまとめ/);
    assert.match(feedback, /各記述を1つずつ判定/);
    assert.match(feedback, /間違いやすい境界/);
    const sourceText = await page.locator("#practicalDrillSources").textContent();
    assert.match(sourceText, /宅地建物取引業法/, "official source must show the exact legal locator");
    assert.doesNotMatch(sourceText, /公式根拠:\s*公式根拠/, "official source label must not repeat itself");
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
    await assertFocusedInViewport(page, ".practical-drill-choice");
    for (let index = 1; index < saved.state.practicalDrill.sessionIds.length; index += 1) {
      await answerAndAdvance(page, "confident");
    }
    saved = await readSavedState(page);
    assert.equal(saved.state.practicalDrill.stage, "retry", "a wrong special question must enter the same-set retry queue");
    assert.deepEqual(saved.state.practicalDrill.queue, [wrong.id]);
    const retried = await presented(page);
    assert.equal(retried.id, wrong.id);
    assert.notEqual(retried.answer, wrong.answer, "retry must move the correct answer position");
    assert.notDeepEqual(retried.choices, wrong.choices, "retry must change the displayed choice order");
    await answerAndAdvance(page, "confident");
    await page.locator("#practicalDrillComplete").waitFor({ state: "visible" });
    await assertFocusedInViewport(page, "#practicalDrillRestartButton");
    assert.match(await page.locator("#practicalDrillCompleteText").textContent(), /日を空けて定着1/);
    assert.match(await page.locator("#practicalDrillCompleteText").textContent(), /要復習0問/);
    assert.equal(await page.evaluate(() => localStorage.getItem("guarantee-ui-sentinel")), "must-survive-reload-and-drill");
    assert.equal(errors.length, 0, errors.join("\n"));

    await page.locator("#practicalDrillChangeButton").click();
    await page.locator("#guaranteeSpecialCard").waitFor({ state: "visible" });
    await page.locator("#guaranteeSpecialFullStart").click();
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    await assertFocusedInViewport(page, ".practical-drill-choice");
    const fullRound = await readSavedState(page);
    assert.equal(fullRound.state.practicalDrill.sessionSize, 26, "full audit remains available after the smart round");
    assert.equal(fullRound.state.practicalDrill.queue.length, 26, "full audit must include every special question");
    assert.equal(new Set(fullRound.state.practicalDrill.queue).size, 26, "full audit IDs must remain unique");
    const firstFullPermutation = await page.evaluate(({ id, key }) =>
      window.TAKKEN_GUARANTEE_ASSOCIATION_DRILL.presentQuestion(id, key).presentationPermutationIndex,
    { id: fullRound.state.practicalDrill.queue[0], key: fullRound.state.practicalDrill.presentationKey });

    await page.setViewportSize({ width: 320, height: 700 });
    assert.equal(await horizontalOverflow(page), 0, "guarantee special UI must fit 320px");
    const narrowTargets = await page.locator("#guaranteeSpecialCard button, #practicalDrillComplete button").evaluateAll((nodes) => nodes.filter((node) => !node.closest("[hidden]")).map((node) => Math.round(node.getBoundingClientRect().height)));
    assert.ok(narrowTargets.every((height) => height >= 44), `320px CTA under 44px: ${narrowTargets.join(", ")}`);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await horizontalOverflow(page), 0, "guarantee special UI must fit 390px");

    for (let index = 0; index < fullRound.state.practicalDrill.sessionSize; index += 1) {
      await answerAndAdvance(page, "confident");
    }
    await page.locator("#practicalDrillComplete").waitFor({ state: "visible" });
    await page.locator("#practicalDrillChangeButton").click();
    await page.locator("#guaranteeSpecialFullStart").click();
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    const secondFullRound = await readSavedState(page);
    const secondFullPermutation = await page.evaluate(({ id, key }) =>
      window.TAKKEN_GUARANTEE_ASSOCIATION_DRILL.presentQuestion(id, key).presentationPermutationIndex,
    { id: secondFullRound.state.practicalDrill.queue[0], key: secondFullRound.state.practicalDrill.presentationKey });
    assert.notEqual(secondFullPermutation, firstFullPermutation, "consecutive full rounds must change the complete four-choice order");
    for (const selector of ["#todayCommandStartButton", "#businessMasteryPrimary", "#guaranteeSpecialStart", "#businessKnockStart", "#passBusinessAction"]) {
      assert.equal(await page.locator(selector).textContent(), "保証協会特訓を保存位置から再開", `${selector}: resume CTA must use one learner-facing label`);
    }

    // A failed first write must roll the in-memory launch back to idle rather
    // than showing a session that cannot be resumed after reload.
    const failureContext = await browser.newContext({ viewport: { width: 320, height: 700 }, timezoneId: "Asia/Tokyo" });
    const failurePage = await failureContext.newPage();
    try {
      await failurePage.goto(reviewUrl(local.baseUrl), { waitUntil: "networkidle", timeout: 20000 });
      await waitForApp(failurePage);
      let failedStart = await readSavedState(failurePage);
      assert.equal(failedStart.state.practicalDrill.stage, "idle", "failure fixture must begin idle");
      assert.match(await failurePage.locator("#guaranteeSpecialStart").textContent(), /基礎から10問/, "first pass must begin with a bounded foundation set");
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
      await assertFocusedInViewport(failurePage, ".practical-drill-choice");
      const retriedStart = await readSavedState(failurePage);
      assert.equal(retriedStart.state.practicalDrill.bankId, "guarantee-association-special", "launch must remain retryable after storage recovers");
      assert.deepEqual(retriedStart.state.practicalDrill.queue, ids.slice(0, 10), "the first smart pass must preserve the foundation teaching order");

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
      await assertFocusedInViewport(failurePage, "#practicalDrillFeedback");
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

    const migrationContext = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
    const migrationPage = await migrationContext.newPage();
    try {
      await migrationPage.goto(reviewUrl(local.baseUrl), { waitUntil: "networkidle", timeout: 20000 });
      await waitForApp(migrationPage);
      const migrationFixture = await readSavedState(migrationPage);
      await migrationPage.evaluate(({ key, oldIds }) => {
        const saved = JSON.parse(localStorage.getItem(key));
        saved.practicalDrill = {
          ...saved.practicalDrill,
          bankId: "guarantee-association-special",
          bankVersion: 1,
          presentationKey: "20260828:guarantee:v42",
          presentationOverrides: {},
          planMode: "guarantee",
          stage: "active",
          scope: "business",
          unitId: "guarantee-association-special",
          sessionSize: 2,
          sessionIds: [oldIds[0], oldIds[19]],
          queue: [oldIds[0], oldIds[19]],
          position: 0,
          currentAttempt: {
            id: oldIds[0],
            selected: 0,
            correct: true,
            confidence: "confident",
            masteryRecorded: true,
            diagnosticRecorded: false
          },
          retryIds: [oldIds[19]],
          history: {
            [oldIds[0]]: { attempts: 3, correct: 2, wrong: 1, uncertain: 0, lastConfidence: "confident" },
            [oldIds[19]]: { attempts: 1, correct: 0, wrong: 1, uncertain: 0, lastConfidence: "wrong" }
          },
          attempts: 4,
          correctAttempts: 2,
          sessionStartedAt: new Date(Date.now() - 60000).toISOString(),
          completedAt: ""
        };
        saved.guaranteeAssociationRecovery = { version: 1, history: {}, activeSession: null };
        localStorage.setItem(key, JSON.stringify(saved));
      }, { key: migrationFixture.key, oldIds: ids.slice(0, 20) });
      await migrationPage.reload({ waitUntil: "networkidle", timeout: 20000 });
      await waitForApp(migrationPage);
      await migrationPage.locator("#practicalDrillSession").waitFor({ state: "visible" });
      assert.equal(await migrationPage.locator("#practicalDrillFeedback").isHidden(), true, "v42 in-flight answer must be removed when the bank changes");
      assert.equal(await migrationPage.locator(".practical-drill-choice:enabled").count(), 4, "v42 migrated question must be safely answerable again");
      const migratedQuestion = await presented(migrationPage);
      await migrationPage.locator(".practical-drill-choice").nth(migratedQuestion.answer).click();
      await migrationPage.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
      const migrated = await readSavedState(migrationPage);
      assert.equal(migrated.state.practicalDrill.bankVersion, 2, "v42 guarantee bank must upgrade to v43");
      assert.deepEqual(migrated.state.practicalDrill.queue, [ids[0], ids[19]], "v42 active queue IDs must survive the upgrade");
      assert.equal(migrated.state.practicalDrill.history[ids[0]].attempts, 4, "v42 history must survive and accept a fresh answer");
      assert.equal(migrated.state.practicalDrill.history[ids[0]].wrong, 1, "v42 wrong count must not be erased");
      assert.equal(migrated.state.practicalDrill.history[ids[19]].wrong, 1, "v42 retry history must survive");
      assert.equal(migrated.state.practicalDrill.history[ids[20]], undefined, "new v43 questions must start untouched");
      assert.equal(await migrationPage.locator("#guaranteeSpecialContacted").textContent(), "2 / 26", "migrated history and six new questions must produce the right contact count");
    } finally {
      await migrationContext.close();
    }
    console.log("Audit-TakkenGuaranteeAssociationDrillUi: OK (26 ga IDs, smart/full repeat, v42 migration, retention, visible focus, reload/retry/save isolation, 390/320)");
  } finally {
    await browser.close();
    await local.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
