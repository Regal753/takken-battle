#!/usr/bin/env node
"use strict";

// Browser proof that the retired guarantee-association intensive lane stays
// hidden while its saved history and in-progress-session compatibility remain.
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

async function openLegacyDrawer(page) {
  const drawer = page.locator("#businessLegacyDrawer");
  await drawer.waitFor({ state: "attached" });
  if (!await drawer.evaluate((node) => node.open)) await drawer.locator("summary").click();
  await page.locator("#businessArchiveKnockStart").waitFor({ state: "visible" });
}

async function waitForApp(page, { openDrawer = true } = {}) {
  await page.waitForFunction(() => Boolean(
    window.TAKKEN_GUARANTEE_ASSOCIATION_DRILL?.QUESTIONS?.length === 33 &&
    document.querySelector("#guaranteeSpecialCard") &&
    document.querySelector("#guaranteeSpecialStart")
  ));
  if (openDrawer) await openLegacyDrawer(page);
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
  const forecast = kind === "uncertain" ? "uncertain" : "confident";
  await page.locator(`[data-practical-forecast="${forecast}"]`).click();
  await page.locator(".practical-drill-choice").nth(choice).click();
  await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
  await page.locator("#practicalDrillNextButton").click();
  return question;
}

async function presentationDetails(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("takken-battle-study-clean-v2-hard-review-") && !candidate.includes("backup") && !candidate.includes("-before-") && !candidate.includes("previous") && !candidate.includes("corrupt") && !candidate.endsWith("event-outbox"));
    const state = JSON.parse(localStorage.getItem(key));
    return Object.fromEntries(state.practicalDrill.sessionIds.map((id) => {
      const presentationKey = state.practicalDrill.presentationOverrides?.[id] || state.practicalDrill.presentationKey;
      const question = window.TAKKEN_GUARANTEE_ASSOCIATION_DRILL.presentQuestion(id, presentationKey);
      return [id, { permutation: question.presentationPermutationIndex, answer: question.answer }];
    }));
  });
}

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function assertFocusedInViewport(page, expectedSelector) {
  try {
    await page.waitForFunction((selector) => {
      const active = document.activeElement;
      if (!active || !active.matches(selector)) return false;
      const rect = active.getBoundingClientRect();
      const height = window.visualViewport?.height || window.innerHeight;
      return rect.top >= 0 && rect.top < height;
    }, expectedSelector);
    const position = await page.evaluate((selector) => {
      const active = document.activeElement;
      const rect = active.getBoundingClientRect();
      return { id: active.id, matchesExpected: active.matches(selector), top: rect.top, bottom: rect.bottom, height: window.visualViewport?.height || window.innerHeight };
    }, expectedSelector);
    assert.ok(position.matchesExpected, `focus moved before the viewport check: ${JSON.stringify(position)}`);
    assert.ok(position.top >= 0 && position.top < position.height, `focused target outside viewport: ${JSON.stringify(position)}`);
  } catch (error) {
    const diagnostic = await page.evaluate((selector) => {
      const rect = (node) => {
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, height: box.height };
      };
      const active = document.activeElement;
      const target = document.querySelector(selector);
      const review = new URL(location.href).searchParams.get("review");
      const saved = JSON.parse(localStorage.getItem(`takken-battle-study-clean-v2-hard-review-${review}`) || "{}");
      return { selector, active: active?.outerHTML?.slice(0, 500), activeRect: rect(active), targetRect: rect(target),
        stage: saved.practicalDrill?.stage, bank: saved.practicalDrill?.bankId,
        sessionHidden: document.querySelector("#practicalDrillSession")?.hidden,
        completeHidden: document.querySelector("#practicalDrillComplete")?.hidden,
        trace: window.__guaranteeFocusTrace || [] };
    }, expectedSelector);
    console.error("GUARANTEE_FOCUS_DIAGNOSTIC", JSON.stringify(diagnostic));
    throw error;
  }
}

(async () => {
  const local = await startStaticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__guaranteeFocusTrace = [];
    document.addEventListener("focusin", event => {
      const node = event.target;
      window.__guaranteeFocusTrace.push({ at: Math.round(performance.now()), id: node.id, tag: node.tagName,
        text: node.textContent?.trim().slice(0, 65), top: node.getBoundingClientRect().top });
      window.__guaranteeFocusTrace = window.__guaranteeFocusTrace.slice(-15);
    });
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  try {
    await page.goto(reviewUrl(local.baseUrl), { waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(page, { openDrawer: false });
    assert.equal(await page.locator("#businessLegacyDrawer").evaluate((node) => node.open), false, "legacy drawer must be closed by default");
    assert.equal(await page.locator("#guaranteeSpecialCard").isHidden(), true, "retired special card must stay out of the learner-facing dojo until the drawer is explicitly opened");
    await openLegacyDrawer(page);
    assert.match(await page.locator("#guaranteeSpecialTitle").textContent(), /保証協会・営業保証金 特訓33問/);
    assert.equal(await page.locator("#guaranteeSpecialContacted").textContent(), "0 / 33");
    assert.equal(await page.locator("#guaranteeSpecialRetained").textContent(), "0 / 33");
    assert.match(await page.locator("#guaranteeSpecialStart").textContent(), /基礎から10問/);
    assert.match(await page.locator("#guaranteeSpecialFullStart").textContent(), /全33問で総点検/);
    assert.equal(await page.locator("#todayCommandGuaranteeButton").isHidden(), true, "retired guarantee CTA must stay out of today's command");
    const ids = await page.evaluate(() => window.TAKKEN_GUARANTEE_ASSOCIATION_DRILL.QUESTIONS.map((question) => question.id));
    assert.equal(ids.length, 33);
    assert.ok(ids.every((id) => /^ga\d{3}$/.test(id)), `unexpected special ids: ${ids.join(", ")}`);
    assert.equal(new Set(ids).size, 33, "guarantee drill IDs must not duplicate");
    assert.equal(await page.locator("#guaranteeSpecialCard").isHidden(), true, "retired guarantee card remains hidden even inside the explicitly opened legacy drawer");
    assert.equal(await page.locator("#guaranteeSpecialCard button:visible").count(), 0, "retired guarantee controls must not expose a touch target");

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
    const currentAfterReload = await readSavedState(page);
    assert.equal(currentAfterReload.state.practicalDrill.history[currentHistoryId].attempts, 2, "recovery must not roll back current-schema attempts");
    assert.equal(currentAfterReload.state.practicalDrill.history[currentHistoryId].lastConfidence, "confident", "recovery must not revive an obsolete wrong outcome");

    await page.locator("#guaranteeSpecialStart").dispatchEvent("click");
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    await assertFocusedInViewport(page, "[data-practical-forecast]");
    let saved = await readSavedState(page);
    assert.equal(saved.state.practicalDrill.bankId, "guarantee-association-special");
    assert.equal(saved.state.practicalDrill.planMode, "guarantee");
    assert.equal(saved.state.practicalDrill.sessionSize, 10);
    assert.equal(saved.state.practicalDrill.queue.length, 10);
    assert.ok(saved.state.practicalDrill.queue.every((id) => /^ga\d{3}$/.test(id)));
    assert.equal(new Set(saved.state.practicalDrill.queue).size, 10, "smart session must contain 10 unique ga IDs");
    assert.equal(saved.state.practicalDrill.queue[0], priorityWeakId, "an existing wrong answer must lead the smart round");
    assert.equal(saved.state.practicalDrill.queue[1], priorityDueId, "a due item must precede untouched questions");
    assert.match(await page.locator("#practicalDrillSummary").textContent(), /保証協会特訓累計 接触 3 \/ 33/);
    assert.equal(await page.locator(".practical-drill-choice:enabled").count(), 0, "answer choices must wait for a pre-answer forecast");

    const wrong = await presented(page);
    await page.locator('[data-practical-forecast="confident"]').click();
    assert.equal(await page.locator(".practical-drill-choice:enabled").count(), 4, "forecast selection must unlock all choices");
    const wrongChoice = page.locator(".practical-drill-choice").nth((wrong.answer + 1) % 4);
    await wrongChoice.scrollIntoViewIfNeeded();
    const answerScrollBefore = await page.evaluate(() => {
      window.__takkenOriginalGuaranteeScrollTo = window.scrollTo;
      window.__takkenGuaranteeAnswerScrollCalls = [];
      window.scrollTo = function (...args) {
        window.__takkenGuaranteeAnswerScrollCalls.push(args);
        return window.__takkenOriginalGuaranteeScrollTo.apply(window, args);
      };
      return window.scrollY;
    });
    await wrongChoice.click();
    await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const answerScrollAfter = await page.evaluate(() => {
      const result = {
        scrollY: window.scrollY,
        calls: [...(window.__takkenGuaranteeAnswerScrollCalls || [])],
        activeId: document.activeElement?.id || ""
      };
      window.scrollTo = window.__takkenOriginalGuaranteeScrollTo;
      delete window.__takkenOriginalGuaranteeScrollTo;
      delete window.__takkenGuaranteeAnswerScrollCalls;
      return result;
    });
    assert.equal(answerScrollAfter.activeId, "practicalDrillFeedback", "feedback must still receive accessible focus");
    assert.deepEqual(answerScrollAfter.calls, [], `guarantee answer must not force window.scrollTo: ${JSON.stringify(answerScrollAfter)}`);
    assert.ok(
      Math.abs(answerScrollAfter.scrollY - answerScrollBefore) <= 1,
      `guarantee answer must preserve the selected-choice viewport: ${JSON.stringify({ answerScrollBefore, answerScrollAfter })}`
    );
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
    assert.equal(saved.state.practicalDrill.currentAttempt?.predictedConfidence, "confident", "pre-answer forecast must survive reload");
    assert.equal(saved.state.practicalDrill.history[wrong.id].overconfidentWrong, 1, "confident wrong must be recorded as an overconfidence miss");
    assert.equal(await page.locator("#guaranteeSpecialCard").isHidden(), true, "legacy activity must not revive the retired focus card");
    assert.equal(await page.evaluate(() => localStorage.getItem("guarantee-ui-sentinel")), "must-survive-reload-and-drill");
    assert.equal(await page.locator("#practicalDrillFeedback").isVisible(), true);

    await page.locator("#practicalDrillNextButton").click();
    await assertFocusedInViewport(page, "[data-practical-forecast]");
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
    await page.locator("#guaranteeSpecialCard").waitFor({ state: "hidden" });
    const afterChange = await readSavedState(page);
    assert.equal(afterChange.state.practicalDrill.stage, "idle", "changing settings must end the completed session");
    // The retired full-round control is intentionally hidden. Launch its
    // compatibility fixture from a fresh idle view, not while the real return
    // route is still smoothly scrolling to the visible business-law dojo.
    await page.reload({ waitUntil: "networkidle", timeout: 20000 });
    await waitForApp(page);
    const afterChangeReload = await readSavedState(page);
    assert.equal(afterChangeReload.state.practicalDrill.stage, "idle");
    assert.deepEqual(afterChangeReload.state.practicalDrill.history, afterChange.state.practicalDrill.history,
      "preparing the retired full-round fixture must retain every answer and mastery record");
    await page.locator("#guaranteeSpecialFullStart").dispatchEvent("click");
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    await assertFocusedInViewport(page, "[data-practical-forecast]");
    const fullRound = await readSavedState(page);
    assert.equal(fullRound.state.practicalDrill.sessionSize, 33, "full audit remains available after the smart round");
    assert.equal(fullRound.state.practicalDrill.queue.length, 33, "full audit must include every special question");
    assert.equal(new Set(fullRound.state.practicalDrill.queue).size, 33, "full audit IDs must remain unique");
    const firstFullPresentations = await presentationDetails(page);

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
    const completedFullRound = await readSavedState(page);
    assert.equal(Object.keys(completedFullRound.state.practicalDrill.presentationOverrides || {}).length, 33, "completed guarantee round must retain every actual presentation key for the next round");
    await page.locator("#postTrainingGuide").waitFor({ state: "visible" });
    assert.match(await page.locator("#postTrainingStatus").textContent(), /33\/33問への接触完了/);
    assert.match(await page.locator("#postTrainingStatus").textContent(), /1周完走だけでは定着済みにしません/);
    assert.equal(await page.locator("#postTrainingGuide button:visible").count(), 4, "completed special must expose review plus three next routes");
    await page.locator("#practicalDrillChangeButton").click();
    const returnedToMenu = await readSavedState(page);
    assert.equal(Object.keys(returnedToMenu.state.practicalDrill.presentationOverrides || {}).length, 33, "returning to the guarantee menu must preserve the completed round presentation map");
    await page.locator("#guaranteeSpecialFullStart").dispatchEvent("click");
    await page.locator("#practicalDrillSession").waitFor({ state: "visible" });
    const secondFullRound = await readSavedState(page);
    const secondFullPresentations = await presentationDetails(page);
    assert.equal(Object.keys(secondFullPresentations).length, 33);
    ids.forEach((id) => {
      assert.notEqual(
        secondFullPresentations[id].answer,
        firstFullPresentations[id].answer,
        `${id}: consecutive full rounds must move the correct answer position`
      );
      assert.notEqual(
        secondFullPresentations[id].permutation,
        firstFullPresentations[id].permutation,
        `${id}: consecutive full rounds must change every four-choice order`
      );
    });
    for (const selector of ["#todayCommandStartButton", "#businessMasteryPrimary", "#businessKnockStart", "#passBusinessAction"]) {
      assert.equal(await page.locator(selector).textContent(), "保証協会特訓を保存位置から再開", `${selector}: resume CTA must use one learner-facing label`);
    }

    // A user who reports all 33 questions complete gets an honest post-training
    // route: law catch-up first, then business variations or an official timed exam.
    const routeContext = await browser.newContext({ viewport: { width: 320, height: 844 }, timezoneId: "Asia/Tokyo" });
    const routePage = await routeContext.newPage();
    try {
      await routePage.goto(reviewUrl(local.baseUrl), { waitUntil: "networkidle", timeout: 20000 });
      await waitForApp(routePage);
      const routeFixture = await readSavedState(routePage);
      await routePage.evaluate(({ key, ids: questionIds }) => {
        const saved = JSON.parse(localStorage.getItem(key));
        const answeredAt = new Date().toISOString();
        questionIds.forEach((id) => {
          saved.practicalDrill.history[id] = {
            attempts: 1,
            correct: 1,
            wrong: 0,
            uncertain: 0,
            lastConfidence: "confident",
            lastAnsweredAt: answeredAt,
            lastConfidenceAt: answeredAt
          };
        });
        questionIds.slice(0, 12).forEach((id) => {
          saved.practicalDrill.history[id] = {
            attempts: 1,
            correct: 0,
            wrong: 1,
            uncertain: 0,
            lastConfidence: "wrong",
            lastAnsweredAt: answeredAt,
            lastConfidenceAt: answeredAt
          };
        });
        localStorage.setItem(key, JSON.stringify(saved));
      }, { key: routeFixture.key, ids });
      await routePage.reload({ waitUntil: "networkidle", timeout: 20000 });
      await waitForApp(routePage);
      await routePage.locator("#postTrainingGuide").waitFor({ state: "visible" });
      const routeLayout = await routePage.locator("#postTrainingGuide button:visible").evaluateAll((nodes) => ({
        heights: nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth)
      }));
      assert.equal(routeLayout.overflow, 0, "post-training guide must fit 320px");
      assert.ok(routeLayout.heights.every((height) => height >= 44), `post-training CTA under 44px: ${routeLayout.heights.join(", ")}`);

      assert.equal(await routePage.locator("#postTrainingGuaranteeReview").isDisabled(), false, "due guarantee review must become actionable");
      assert.match(await routePage.locator("#postTrainingGuaranteeReview").textContent(), /保証協会を10問再戦（要復習12問・最優先）/);
      await routePage.locator("#postTrainingGuaranteeReview").click();
      await routePage.locator("#practicalDrillSession").waitFor({ state: "visible" });
      let routed = await readSavedState(routePage);
      assert.equal(routed.state.practicalDrill.bankId, "guarantee-association-special");
      assert.equal(routed.state.practicalDrill.queue.length, 10, "review CTA must state the actual capped set size");
      assert.ok(routed.state.practicalDrill.queue.every((id) => ids.slice(0, 12).includes(id)), "smart review must contain only the due backlog");
      routePage.once("dialog", (dialog) => dialog.accept());
      await routePage.locator("#practicalDrillDiscardButton").click();
      await routePage.locator("#practicalDrillSession").waitFor({ state: "hidden" });
      await routePage.evaluate(({ key, reviewIds }) => {
        const saved = JSON.parse(localStorage.getItem(key));
        const answeredAt = new Date().toISOString();
        reviewIds.forEach((id) => {
          saved.practicalDrill.history[id] = {
            attempts: 2,
            correct: 1,
            wrong: 1,
            uncertain: 0,
            lastConfidence: "confident",
            lastAnsweredAt: answeredAt,
            lastConfidenceAt: answeredAt
          };
        });
        localStorage.setItem(key, JSON.stringify(saved));
      }, { key: routeFixture.key, reviewIds: ids.slice(0, 12) });
      await routePage.reload({ waitUntil: "networkidle", timeout: 20000 });
      await waitForApp(routePage);
      assert.equal(await routePage.locator("#postTrainingGuaranteeReview").isDisabled(), true, "review CTA must wait when no item is due");

      assert.match(await routePage.locator("#postTrainingRestrictions").textContent(), /法令全体を20問で診断/);
      assert.match(await routePage.locator("#postTrainingExam").textContent(), /公式50問・120分の記録へ/);
      assert.match(await routePage.locator("#postTrainingTarget").textContent(), /合計38点。安定目標は40点/);
      await routePage.locator("#postTrainingRestrictions").click();
      await routePage.locator("#practicalDrillSession").waitFor({ state: "visible" });
      routed = await readSavedState(routePage);
      assert.equal(routed.state.practicalDrill.bankId, "subject-sprint");
      assert.equal(routed.state.practicalDrill.scope, "restrictions");
      assert.equal(routed.state.practicalDrill.queue.length, 20);
      assert.match(routed.state.practicalDrill.presentationKey, /:topic-all:/);
      let lawSources = await routePage.evaluate((queue) => queue.map((id) =>
        window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID[id].sourceQuestionId
      ), routed.state.practicalDrill.queue);
      assert.ok(lawSources.some((id) => ["l001", "l002", "l003", "l004", "rs001", "rs002", "rs015", "rs016"].includes(id)), "law route must include city planning while its saved coverage is incomplete");

      routePage.once("dialog", (dialog) => dialog.accept());
      await routePage.locator("#practicalDrillDiscardButton").click();
      await routePage.locator("#practicalDrillSession").waitFor({ state: "hidden" });
      await routePage.evaluate(({ key, cityPlanningIds }) => {
        const saved = JSON.parse(localStorage.getItem(key));
        const answeredAt = new Date().toISOString();
        Object.values(window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID)
          .filter((question) => cityPlanningIds.includes(question.sourceQuestionId))
          .forEach((question) => {
            saved.practicalDrill.history[question.id] = {
              attempts: 1,
              correct: 1,
              wrong: 0,
              uncertain: 0,
              lastConfidence: "confident",
              lastAnsweredAt: answeredAt,
              lastConfidenceAt: answeredAt
            };
          });
        localStorage.setItem(key, JSON.stringify(saved));
      }, { key: routeFixture.key, cityPlanningIds: ["l001", "l002", "l003", "l004", "rs001", "rs002", "rs015", "rs016"] });
      await routePage.reload({ waitUntil: "networkidle", timeout: 20000 });
      await waitForApp(routePage);
      assert.match(await routePage.locator("#postTrainingRestrictions").textContent(), /都市計画法以外を20問で診断/);
      await routePage.locator("#postTrainingRestrictions").click();
      await routePage.locator("#practicalDrillSession").waitFor({ state: "visible" });
      routed = await readSavedState(routePage);
      assert.match(routed.state.practicalDrill.presentationKey, /:topic-catchup:/);
      lawSources = await routePage.evaluate((queue) => queue.map((id) =>
        window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID[id].sourceQuestionId
      ), routed.state.practicalDrill.queue);
      assert.ok(lawSources.every((id) => !["l001", "l002", "l003", "l004", "rs001", "rs002", "rs015", "rs016"].includes(id)), "post-training law route may skip city planning only after all eight sources are in saved history");

      routePage.once("dialog", (dialog) => dialog.accept());
      await routePage.locator("#practicalDrillDiscardButton").click();
      await routePage.locator("#practicalDrillSession").waitFor({ state: "hidden" });
      await routePage.locator("#postTrainingBusiness").click();
      await routePage.locator("#practicalDrillSession").waitFor({ state: "visible" });
      routed = await readSavedState(routePage);
      assert.equal(routed.state.practicalDrill.bankId, "business-fullscore");
      assert.equal(routed.state.practicalDrill.planMode, "knock");
      assert.equal(routed.state.practicalDrill.knockPreset.mode, "all-random");
      assert.equal(routed.state.practicalDrill.queue.length, 20);

      routePage.once("dialog", (dialog) => dialog.accept());
      await routePage.locator("#practicalDrillDiscardButton").click();
      await routePage.locator("#practicalDrillSession").waitFor({ state: "hidden" });
      await routePage.evaluate(() => {
        const select = document.querySelector("#examProfileSelect");
        select.value = "fiveExempt";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      assert.match(await routePage.locator("#postTrainingExam").textContent(), /公式45問・110分の記録へ/);
      assert.doesNotMatch(await routePage.locator("#postTrainingTarget").textContent(), /その他|38点|40点/);
      assert.match(await routePage.locator("#postTrainingTarget").textContent(), /税2\/3、合計35点。安定目標は36点/);
      await routePage.locator("#postTrainingExam").click();
      assert.equal(await routePage.locator("#passPlanPanel").getAttribute("open"), "");
      assert.equal(await routePage.locator(".official-ledger").getAttribute("open"), "");
      assert.match(await routePage.locator("#todayCommandStatus").textContent(), /RETIO公式45問・110分/);
    } finally {
      await routeContext.close();
    }

    // A miss at the end of a set must not be repeated immediately. It is sent
    // to the next JST study day because fewer than three different questions
    // can separate the two attempts.
    const deferredContext = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
    const deferredPage = await deferredContext.newPage();
    try {
      await deferredPage.goto(reviewUrl(local.baseUrl), { waitUntil: "networkidle", timeout: 20000 });
      await waitForApp(deferredPage);
      await deferredPage.locator("#guaranteeSpecialStart").dispatchEvent("click");
      await deferredPage.locator("#practicalDrillSession").waitFor({ state: "visible" });
      const deferredStart = await readSavedState(deferredPage);
      assert.equal(deferredStart.state.practicalDrill.sessionIds.length, 10, "direct mobile entry must start the bounded smart set");
      for (let index = 0; index < 9; index += 1) await answerAndAdvance(deferredPage, "confident");
      const deferredMiss = await answerAndAdvance(deferredPage, "wrong");
      await deferredPage.locator("#practicalDrillComplete").waitFor({ state: "visible" });
      const deferredSaved = await readSavedState(deferredPage);
      const deferredEntry = deferredSaved.state.practicalDrill.history[deferredMiss.id];
      const todayKey = await deferredPage.evaluate(() => {
        const now = new Date();
        return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
      });
      assert.equal(deferredSaved.state.practicalDrill.stage, "complete", "an end-of-set miss must not open an immediate retry stage");
      assert.ok(deferredSaved.state.practicalDrill.retryIds.includes(deferredMiss.id), "the deferred miss must remain in the retry ledger");
      assert.ok(deferredEntry.retryNotBeforeKey > todayKey, `deferred retry must be after today: ${deferredEntry.retryNotBeforeKey}`);
      assert.ok(Number.isFinite(Date.parse(deferredEntry.retryNotBeforeAt)), "deferred retry must carry a causal timestamp for cross-tab merging");
      await deferredPage.locator("#practicalDrillChangeButton").click();
      assert.equal(await deferredPage.locator("#guaranteeSpecialCard").isHidden(), true, "deferred history must not revive the retired card");
    } finally {
      await deferredContext.close();
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
      await failurePage.locator("#guaranteeSpecialStart").dispatchEvent("click");
      assert.equal(await failurePage.locator("#practicalDrillSession").isHidden(), true, "failed start must not leave a visible session");
      assert.match(
        await failurePage.locator("#todayCommandStatus").textContent(),
        /保証協会特訓の開始状態を保存できませんでした。もう一度試してください。/
      );
      await restorePrimarySaveWrites(failurePage);
      failedStart = await readSavedState(failurePage);
      assert.equal(failedStart.state.practicalDrill.stage, "idle", "failed start must retain the persisted idle state");
      await failurePage.locator("#guaranteeSpecialStart").dispatchEvent("click");
      await failurePage.locator("#practicalDrillSession").waitFor({ state: "visible" });
      await assertFocusedInViewport(failurePage, "[data-practical-forecast]");
      const retriedStart = await readSavedState(failurePage);
      assert.equal(retriedStart.state.practicalDrill.bankId, "guarantee-association-special", "launch must remain retryable after storage recovers");
      assert.deepEqual(retriedStart.state.practicalDrill.queue, ids.slice(0, 10), "the first smart pass must preserve the foundation teaching order");

      const failureQuestion = await presented(failurePage);
      const beforeFailedForecast = await readSavedState(failurePage);
      await failPrimarySaveWrites(failurePage, beforeFailedForecast.key);
      await failurePage.locator('[data-practical-forecast="confident"]').click();
      assert.equal(await failurePage.locator(".practical-drill-choice:enabled").count(), 0, "failed forecast must keep answer choices locked");
      await assertVisiblePracticalSaveError(failurePage, /解答前の手応えを保存できませんでした/);
      let failedMutation = await readSavedState(failurePage);
      assert.deepEqual(failedMutation.state.practicalDrill, beforeFailedForecast.state.practicalDrill, "failed forecast must not change persisted practical state");
      await restorePrimarySaveWrites(failurePage);
      await failurePage.locator('[data-practical-forecast="confident"]').click();
      assert.equal(await failurePage.locator(".practical-drill-choice:enabled").count(), 4, "forecast must remain retryable after storage recovers");

      const beforeFailedAnswer = await readSavedState(failurePage);
      await failPrimarySaveWrites(failurePage, beforeFailedAnswer.key);
      await failurePage.locator(".practical-drill-choice").nth(failureQuestion.answer).click();
      assert.equal(await failurePage.locator("#practicalDrillFeedback").isHidden(), true, "failed answer must return to the unanswered question");
      assert.match(await failurePage.locator("#todayCommandStatus").textContent(), /解答を保存できませんでした。進捗は加算していません。/);
      await assertVisiblePracticalSaveError(failurePage, /解答を保存できませんでした。進捗は加算していません。/);
      assert.equal(await horizontalOverflow(failurePage), 0, "the inline save error must not overflow a 320px viewport");
      failedMutation = await readSavedState(failurePage);
      assert.deepEqual(failedMutation.state.practicalDrill, beforeFailedAnswer.state.practicalDrill, "failed answer must not change persisted practical state");
      assert.ok(await failurePage.evaluate((key) => localStorage.getItem(`${key}-previous`) !== null, beforeFailedAnswer.key), "the exact primary-write failure must occur after the recoverable previous-save rotation");
      await restorePrimarySaveWrites(failurePage);

      await failurePage.locator(".practical-drill-choice").nth(failureQuestion.answer).click();
      await failurePage.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
      await assertFocusedInViewport(failurePage, "#practicalDrillFeedback");
      assert.equal(await failurePage.locator("#practicalDrillSaveError").isHidden(), true, "a recovered answer must clear the inline save error");
      assert.equal(await failurePage.locator("#practicalDrillNextButton").isDisabled(), false);
      const beforeFailedAdvance = await readSavedState(failurePage);
      assert.equal(beforeFailedAdvance.state.practicalDrill.history[failureQuestion.id].lastConfidence, "confident");
      assert.equal(beforeFailedAdvance.state.practicalDrill.currentAttempt?.predictedConfidence, "confident");
      assert.ok(Number.isFinite(Date.parse(beforeFailedAdvance.state.practicalDrill.history[failureQuestion.id].lastConfidenceAt)), "pre-answer confidence must persist an ordering timestamp");
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
          bankVersion: 2,
          presentationKey: "20260828:guarantee:v43",
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
      }, { key: migrationFixture.key, oldIds: ids.slice(0, 26) });
      await migrationPage.reload({ waitUntil: "networkidle", timeout: 20000 });
      await waitForApp(migrationPage);
      await migrationPage.locator("#practicalDrillSession").waitFor({ state: "visible" });
      assert.equal(await migrationPage.locator("#practicalDrillFeedback").isHidden(), true, "v43 in-flight answer must be removed when the bank changes");
      assert.equal(await migrationPage.locator(".practical-drill-choice:enabled").count(), 0, "v43 migration must enter the new pre-answer forecast gate");
      await migrationPage.locator('[data-practical-forecast="confident"]').click();
      assert.equal(await migrationPage.locator(".practical-drill-choice:enabled").count(), 4, "v43 migrated question must be safely answerable after forecasting");
      const migratedQuestion = await presented(migrationPage);
      await migrationPage.locator(".practical-drill-choice").nth(migratedQuestion.answer).click();
      await migrationPage.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
      const migrated = await readSavedState(migrationPage);
      assert.equal(migrated.state.practicalDrill.bankVersion, 3, "v43 guarantee bank must upgrade to v44");
      assert.deepEqual(migrated.state.practicalDrill.queue, [ids[0], ids[19]], "v43 active queue IDs must survive the upgrade");
      assert.equal(migrated.state.practicalDrill.history[ids[0]].attempts, 4, "v43 history must survive and accept a fresh answer");
      assert.equal(migrated.state.practicalDrill.history[ids[0]].wrong, 1, "v43 wrong count must not be erased");
      assert.equal(migrated.state.practicalDrill.history[ids[19]].wrong, 1, "v43 retry history must survive");
      assert.equal(migrated.state.practicalDrill.history[ids[26]], undefined, "new v44 questions must start untouched");
      assert.equal(ids.filter((id) => (migrated.state.practicalDrill.history[id]?.attempts || 0) > 0).length, 2, "migrated history must retain its exact contacted count");
    } finally {
      await migrationContext.close();
    }
    console.log("Audit-TakkenGuaranteeAssociationDrillUi: OK (retired UI hidden, 33 ga IDs/history preserved, delayed retry, v43 migration, reload/save isolation, 390/320)");
  } finally {
    await browser.close();
    await local.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
