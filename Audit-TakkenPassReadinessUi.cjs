#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function staticServer(root) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".webp": "image/webp" };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`) && target !== path.join(path.resolve(root), "index.html")) {
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
      close: () => new Promise((done) => server.close(done))
    }));
  });
}

async function stored(page) {
  return page.evaluate(() => {
    const review = new URL(location.href).searchParams.get("review") || "";
    const exactKey = `takken-battle-study-clean-v2-hard-review-${review}`;
    const key = localStorage.getItem(exactKey) !== null ? exactKey : Object.keys(localStorage).find((item) => item.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !item.includes("backup") && !item.includes("previous") && !item.includes("before-upgrade") &&
      !item.endsWith("event-outbox"));
    return { key, state: JSON.parse(localStorage.getItem(key) || "{}") };
  });
}

async function questionAnswer(page) {
  return page.evaluate(() => {
    const review = new URL(location.href).searchParams.get("review") || "";
    const exactKey = `takken-battle-study-clean-v2-hard-review-${review}`;
    const key = localStorage.getItem(exactKey) !== null ? exactKey : Object.keys(localStorage).find((item) => item.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !item.includes("backup") && !item.includes("previous") && !item.includes("before-upgrade") &&
      !item.endsWith("event-outbox"));
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    const drill = state.practicalDrill;
    const id = drill.queue[drill.position];
    const question = window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID[id];
    return { id, answer: window.TAKKEN_SUBJECT_SPRINT_BANK.presentQuestion(question, drill.presentationKey).answer };
  });
}

async function answerSprint(page, { wrong = false } = {}) {
  const question = await questionAnswer(page);
  const selected = wrong ? (question.answer + 1) % 4 : question.answer;
  await page.locator(".practical-drill-choice").nth(selected).click();
  await page.locator("#practicalDrillFeedback").waitFor({ state: "visible" });
  if (!wrong) await page.locator('[data-practical-confidence="confident"]').click();
  await page.locator("#practicalDrillNextButton").click();
  return question;
}

async function startSprint(page, scope) {
  const panel = page.locator("#passPlanPanel");
  if (!(await panel.evaluate((node) => node.open))) await panel.locator(":scope > summary").click();
  await page.locator(`[data-subject-sprint="${scope}"]`).click();
  await page.waitForTimeout(120);
  const probe = await page.evaluate(() => {
    const review = new URL(location.href).searchParams.get("review") || "";
    const exactKey = `takken-battle-study-clean-v2-hard-review-${review}`;
    const key = localStorage.getItem(exactKey) !== null ? exactKey : Object.keys(localStorage).find((item) => item.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !item.includes("backup") && !item.includes("previous") && !item.includes("before-upgrade") &&
      !item.endsWith("event-outbox"));
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    return { runMode: saved.runMode, drill: saved.practicalDrill, status: document.querySelector("#todayCommandStatus")?.textContent || "" };
  });
  if (probe.drill?.stage !== "active" || probe.drill?.bankId !== "subject-sprint") throw new Error(`sprint did not start: ${JSON.stringify(probe)}`);
  return stored(page);
}

async function openPassPanel(page) {
  const panel = page.locator("#passPlanPanel");
  if (!(await panel.evaluate((node) => node.open))) await panel.locator(":scope > summary").click();
}

async function main() {
  const runtimeSource = fs.readFileSync(path.join(process.cwd(), "app.js"), "utf8");
  const markupSource = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
  // Static guards complement the browser journey: they make regressions in
  // the Sunday and evidence policies fail even if the suite is run on a
  // weekday fixture.
  assert.match(runtimeSource, /sundayMode === "full-mock" \? mockDone : sundayMode === "short-review" \? shortDone : false/);
  assert.match(runtimeSource, /異なる3フォーム・3日、改正確認2日、当年資料、直近7日の学習時間/);
  assert.match(markupSource, /<details id="passPlanPanel"/);
  assert.doesNotMatch(markupSource, /<details id="passPlanPanel"[^>]*\bopen\b/);
  const server = process.env.TAKKEN_BASE_URL ? { baseUrl: process.env.TAKKEN_BASE_URL, close: async () => {} } : await staticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.addInitScript(() => {
      const NativeDate = Date; const fixed = new NativeDate("2026-08-16T10:00:00+09:00").getTime();
      class FixedDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } }
      window.Date = FixedDate;
    });
    const review = `passreadiness${Date.now().toString(36)}`;
    const url = new URL(server.baseUrl); url.searchParams.set("review", review); url.searchParams.set("today", "1");
    await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => document.querySelector("#passReadinessTitle")?.textContent?.includes("50問") && window.TAKKEN_SUBJECT_SPRINT_BANK?.QUESTIONS?.length === 80);

    const initial = await page.evaluate(() => ({
      targets: [...document.querySelectorAll("#passSubjectGrid strong")].map((node) => node.textContent.trim()),
      title: document.querySelector("#passReadinessTitle")?.textContent?.trim(),
      pace: document.querySelector("#passReadinessPace")?.textContent?.trim(),
      note: document.querySelector("#passReadinessNote")?.textContent?.trim(),
      mockDisabled: document.querySelector("#passMockAction")?.disabled,
      aDisabled: document.querySelector("#mockAButton")?.disabled,
      bDisabled: document.querySelector("#mockBButton")?.disabled,
      cDisabled: document.querySelector("#mockCButton")?.disabled,
      profile: document.querySelector("#examProfileSelect")?.value,
      passPlanOpen: document.querySelector("#passPlanPanel")?.open,
      lawGateLabel: document.querySelector("#passLawGateAction")?.textContent?.trim(),
      exposure: (() => {
        const review = new URL(location.href).searchParams.get("review") || "";
        const key = `takken-battle-study-clean-v2-hard-review-${review}`;
        return JSON.parse(localStorage.getItem(key) || "{}").officialExamExposure;
      })()
    }));
    assert.deepEqual(initial.targets, ["未測定 → 目標18", "未測定 → 目標9", "未測定 → 目標7", "未測定 → 目標2", "未測定 → 目標4"]);
    assert.match(initial.note, /未測定は弱点と決めつけず/);
    assert.match(initial.pace, /残り45単元・今日3単元/);
    assert.equal(initial.mockDisabled, false);
    assert.equal(initial.aDisabled, false);
    assert.equal(initial.bDisabled, false);
    assert.equal(initial.cDisabled, false);
    assert.equal(initial.profile, "general");
    assert.match(await page.locator("#passTimeAllocation").textContent(), /50問演習は100分で一周、残り20分/);
    assert.equal(initial.passPlanOpen, false, "the long-term plan must not push today\'s command below the fold");
    assert.match(initial.lawGateLabel, /2026改正2問/);
    assert.deepEqual(initial.exposure || {}, {});

    await openPassPanel(page);
    await page.locator("#passMockAction").click();
    await page.waitForFunction(() => document.querySelector(".quest-card")?.classList.contains("is-mock"));
    const afterMock = await stored(page);
    assert.equal(afterMock.state.runMode, "mock");
    assert.deepEqual(afterMock.state.officialExamExposure || {}, {}, "internal mock must not consume official exposure");
    // The launch control can be above the current viewport. Exercise the
    // actual cancel/resume guard so all mirrored save records stay in sync.
    page.once("dialog", (dialog) => dialog.accept());
    await page.evaluate(() => document.querySelector("#dailyQuestButton")?.click());
    await page.waitForFunction(() => !document.querySelector(".quest-card")?.classList.contains("is-mock"));

    // The profile is a scoring contract, not a cosmetic label.  A registered
    // course completer gets exactly questions 1-45 and 110 minutes; switching
    // back restores the general 50/120 lane without touching official exposure.
    await page.locator("#examProfileSelect").selectOption("fiveExempt");
    assert.match(await page.locator("#passTimeAllocation").textContent(), /45問演習は90分で一周、残り20分/);
    await openPassPanel(page);
    await page.locator("#passMockAction").click();
    await page.waitForFunction(() => document.querySelector(".quest-card")?.classList.contains("is-mock"));
    const fiveExemptMock = await stored(page);
    assert.equal(fiveExemptMock.state.mock.examProfile, "fiveExempt");
    assert.match(await page.locator("#chapterProgressText").textContent(), /1 \/ 45問/);
    assert.match(await page.locator("#dailyWeakText").textContent(), /^110:/);
    await page.locator(".choice-button").first().click();
    await page.locator("#feedbackBox").waitFor({ state: "visible" });
    const fiveExemptAnswerLock = await page.evaluate(() => ({
      answerGridHidden: Boolean(document.querySelector("#feedbackBox .answer-grid")?.hidden),
      answer: document.querySelector("#correctAnswer")?.textContent?.trim() || "",
      trap: document.querySelector("#trapText")?.textContent?.trim() || "",
      reference: document.querySelector("#bookRef")?.textContent?.trim() || "",
      explanation: document.querySelector("#explainText")?.textContent?.trim() || "",
      title: document.querySelector("#feedbackTitle")?.textContent?.trim() || ""
    }));
    assert.deepEqual(fiveExemptAnswerLock, {
      answerGridHidden: true,
      answer: "",
      trap: "",
      reference: "",
      explanation: "解答を保存しました。正誤・正解肢・解説は45問終了後にまとめて表示します。途中で答え合わせはしません。",
      title: "解答を記録しました"
    });
    await page.reload({ waitUntil: "networkidle" });
    assert.match(await page.locator("#dailyQuestSource").textContent(), /45問・110分・正誤は終了後に採点/);
    page.once("dialog", (dialog) => dialog.accept());
    await page.evaluate(() => document.querySelector("#dailyQuestButton")?.click());
    await page.waitForFunction(() => !document.querySelector(".quest-card")?.classList.contains("is-mock"));
    await openPassPanel(page);
    await page.locator("#examProfileSelect").selectOption("general");
    assert.equal((await stored(page)).state.examProfile, "general");
    assert.match(await page.locator("#passTimeAllocation").textContent(), /50問演習は100分で一周、残り20分/);

    // Current-law proof is deliberately an explicit two-question set.  It
    // must start as a normal saved daily session so a second calendar day can
    // be evidenced instead of inferred from a single answer burst.
    await page.locator("#passLawGateAction").click();
    const lawGate = await stored(page);
    assert.deepEqual(lawGate.state.daily.planIds, ["b020", "b040"]);
    assert.equal(lawGate.state.daily.target, 2);
    assert.equal(lawGate.state.daily.planMode, "mastery");
    page.once("dialog", (dialog) => dialog.accept());
    await page.evaluate(() => document.querySelector("#dailyQuestButton")?.click());
    await page.waitForFunction(() => !document.querySelector(".quest-card")?.classList.contains("is-mock"));

    const rights = await startSprint(page, "rights");
    assert.equal(rights.state.practicalDrill.bankId, "subject-sprint");
    assert.equal(rights.state.practicalDrill.scope, "rights");
    assert.equal(rights.state.practicalDrill.sessionIds.length, 44);
    assert.equal(new Set(rights.state.practicalDrill.sessionIds).size, 44);
    assert.ok(rights.state.practicalDrill.sessionIds.every((id) => id.startsWith("sprint-rights-")));
    assert.deepEqual(rights.state.officialExamExposure || {}, {});

    const wrong = await answerSprint(page, { wrong: true });
    for (let index = 1; index < 44; index += 1) await answerSprint(page);
    const retry = await stored(page);
    assert.equal(retry.state.practicalDrill.stage, "retry");
    assert.deepEqual(retry.state.practicalDrill.queue, [wrong.id]);
    await answerSprint(page);
    const finished = await stored(page);
    assert.equal(finished.state.practicalDrill.stage, "complete");
    assert.deepEqual(finished.state.officialExamExposure || {}, {});

    for (const [scope, count, prefix] of [
      ["restrictions", 18, "sprint-law-"],
      ["taxOther", 6, "sprint-tax-"],
      ["other", 12, "sprint-other-"]
    ]) {
      const started = await startSprint(page, scope);
      assert.equal(started.state.practicalDrill.sessionIds.length, count);
      assert.equal(new Set(started.state.practicalDrill.sessionIds).size, count);
      assert.ok(started.state.practicalDrill.sessionIds.every((id) => id.startsWith(prefix)));
      await page.reload({ waitUntil: "networkidle" });
      const reloaded = await stored(page);
      assert.equal(reloaded.state.practicalDrill.stage, "active");
      assert.deepEqual(reloaded.state.practicalDrill.queue, started.state.practicalDrill.queue);
      assert.equal(await page.locator("#practicalDrillPanel").evaluate((node) => node.open), true);
      // Starting another set while active must resume this exact queue, not overwrite it.
      await openPassPanel(page);
      await page.locator('[data-subject-sprint="rights"]').click();
      const resumed = await stored(page);
      assert.deepEqual(resumed.state.practicalDrill.queue, started.state.practicalDrill.queue);
      await page.locator("#practicalDrillCancelButton").click();
    }

    // The app deliberately caps review namespaces at 24 characters. Keep the
    // seeded key within that contract so this checks the real primary save.
    const legacyReview = `prlegacy${Date.now().toString(36)}`;
    const legacyUrl = new URL(server.baseUrl); legacyUrl.searchParams.set("review", legacyReview); legacyUrl.searchParams.set("today", "1");
    const legacyKey = `takken-battle-study-clean-v2-hard-review-${legacyReview}`;
    const legacyBrowser = await chromium.launch({ channel: "chrome", headless: true });
    const legacyContext = await legacyBrowser.newContext({
      viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce"
    });
    const legacyPage = await legacyContext.newPage();
    legacyPage.on("pageerror", (error) => errors.push(String(error)));
    legacyPage.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await legacyPage.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({
      stateSchemaVersion: 8, step: 4, attempts: 4, correct: 3,
      practicalDrill: { stage: "active", bankId: "subject-sprint", bankVersion: 1, scope: "rights", unitId: "subject-sprint-rights", sessionSize: 44, sessionIds: ["sprint-rights-01"], queue: ["sprint-rights-01"], position: 0, retryIds: [], history: {} }
    })), { key: legacyKey });
    await legacyPage.goto(legacyUrl.toString(), { waitUntil: "networkidle" });
    const migratedOnLoad = await legacyPage.evaluate((key) =>
      JSON.parse(localStorage.getItem(key) || "{}").stateSchemaVersion, legacyKey
    );
    assert.equal(migratedOnLoad, 10, "schema migration must persist during initial load");
    // Normalization is persisted on the first ordinary state-changing action.
    await openPassPanel(legacyPage);
    await legacyPage.locator("#passMockAction").click();
    await legacyPage.waitForFunction(() => document.querySelector(".quest-card")?.classList.contains("is-mock"));
    const legacy = await legacyPage.evaluate((key) => ({
      key,
      state: JSON.parse(localStorage.getItem(key) || "{}")
    }), legacyKey);
    assert.equal(legacy.state.stateSchemaVersion, 10);
    // Schema-8 records predate the sprint presentation key; normalization must
    // fail closed to an idle launch state instead of reviving a corrupt session.
    assert.equal(legacy.state.practicalDrill.stage, "idle");
    assert.deepEqual(legacy.state.practicalDrill.queue, []);
    await legacyContext.close();
    await legacyBrowser.close();

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const layout = await page.evaluate(() => ({
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        // The readiness/sprint controls are the v29 touch contract. Older
        // manual official-entry controls have their own UI audit.
        controls: [...document.querySelectorAll("#passReadinessCard button, .subject-sprint-card button, #practicalDrillStartButton")]
          .filter((node) => node.offsetParent)
          .map((node) => ({ label: node.textContent.trim(), height: Math.round(node.getBoundingClientRect().height) }))
      }));
      assert.equal(layout.overflow, 0, `${width}px overflow`);
      assert.ok(layout.controls.every((item) => item.height >= 44), `${width}px touch targets: ${JSON.stringify(layout.controls)}`);
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(JSON.stringify({ status: "ok", initial, retryId: wrong.id, schema: legacy.state.stateSchemaVersion, errors: errors.length }, null, 2));
  } finally { await browser.close(); await server.close(); }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
