"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const bank = require("./rights-transfer-bank.js");
const officialData = require("./official-exam-data.js");
const legacy = execFileSync("git", ["show", "a65ed1a0da87d1fb27b497e5f0b060bc4243a5e5:app.js"], { encoding: "utf8" });
const legacy76 = execFileSync("git", ["show", "1b552fe1366bd43fc106bd16ba663853b03cd9e5:app.js"], { encoding: "utf8" });
async function main() {
  const root = __dirname, out = path.join(root, "output/coverage-ui");
  const reviewRuntime = process.env.TAKKEN_REVIEW_RUNTIME_REF
    ? execFileSync("git", ["show", `${process.env.TAKKEN_REVIEW_RUNTIME_REF}:app.js`], { encoding: "utf8" })
    : null;
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost"), relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    if (relative === "legacy-app.js") { res.setHeader("Content-Type", "text/javascript; charset=utf-8"); res.end(legacy); return; }
    if (relative === "legacy76-app.js") { res.setHeader("Content-Type", "text/javascript; charset=utf-8"); res.end(legacy76); return; }
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, body) => {
      if (error) { res.writeHead(404).end(); return; }
      if (relative === "app.js" && reviewRuntime) body = reviewRuntime;
      res.setHeader("Content-Type", ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" })[path.extname(file)] || "application/octet-stream");
      if (relative === "index.html" && url.searchParams.has("legacy")) body = body.toString("utf8").replace(/\.\/app\.js\?v=[^"]+/, url.searchParams.get("legacy") === "76" ? "./legacy76-app.js" : "./legacy-app.js");
      res.end(body);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ channel: "chrome", headless: true }), errors = [];
  const base = `http://127.0.0.1:${server.address().port}/`;
  const key = page => `takken-battle-study-clean-v2-hard-review-${new URL(page.url()).searchParams.get("review").replace(/[^a-z0-9-]/gi, "").slice(0, 24)}`;
  const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key(page));
  async function open(name, date = "2026-09-10") {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce" });
    await context.addInitScript(day => { const NativeDate = Date, now = Date.parse(day + "T10:00:00+09:00"); window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }; }, date);
    const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${base}?review=coverage-${name}&today=1`, { waitUntil: "networkidle" });
    return { page, context };
  }
  async function seed(page, profile, { tax = 4, price = 0, exempt = 0, duplicatePrice = false } = {}) {
    await page.evaluate(({ k, profile, tax, price, exempt, duplicatePrice }) => {
      const s = JSON.parse(localStorage.getItem(k)), sprint = window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS, c = window.TAKKEN_EXAM_DAILY_COVERAGE;
      s.examProfile = profile;
      const items = [...window.TAKKEN_BUSINESS_HARD_BANK.QUESTIONS.slice(0, 20), ...sprint.filter(q => c.category(q) === "tax").slice(0, tax), ...sprint.filter(q => c.category(q) === "price").slice(0, price), ...sprint.filter(q => c.category(q) === "exempt").slice(0, exempt)];
      for (const q of items) s.practicalDrill.history[q.id] = { attempts: 1, correct: 1, wrong: 0, lastCorrect: true, lastConfidence: "confident", lastAnsweredAt: new Date().toISOString() };
      if (duplicatePrice) s.questionStats[items.find(q => c.category(q) === "price").sourceQuestionId] = { attempts: 1, correct: 1, lastAnsweredAt: new Date().toISOString() };
      s.missionLog["2026-09-10"] = { ...(s.missionLog["2026-09-10"] || {}), minutes: 75 };
      localStorage.setItem(k, JSON.stringify(s));
    }, { k: key(page), profile, tax, price, exempt, duplicatePrice });
    await page.reload({ waitUntil: "networkidle" });
  }
  async function finishSprint(page) {
    for (let i = 0; i < 20; i++) {
      const d = (await saved(page)).practicalDrill;
      if (!["active", "retry"].includes(d.stage)) return;
      const q = await page.evaluate(d => window.TAKKEN_SUBJECT_SPRINT_BANK.presentQuestion(d.queue[d.position], d.presentationOverrides?.[d.queue[d.position]] || d.presentationKey), d);
      if (await page.locator('[data-practical-forecast="confident"]').isVisible()) await page.click('[data-practical-forecast="confident"]');
      await page.locator(".practical-drill-choice").nth(q.answer).click();
      if (await page.locator('[data-practical-confidence="confident"]').isVisible()) await page.click('[data-practical-confidence="confident"]');
      await page.click("#practicalDrillNextButton");
    }
    throw Error("sprint did not complete");
  }
  try {
    // Regression probes use separate synthetic saves and real UI handlers.
    const reviewRegressions = [];
    for (const [profile, omitPrice, shouldUnlock] of [["general", false, false], ["fiveExempt", true, false], ["fiveExempt", false, true]]) {
      const row = await open(`gate-${profile}-${omitPrice}`, "2026-08-16");
      const expected = await row.page.evaluate(({ k, profile, omitPrice }) => {
        const s = JSON.parse(localStorage.getItem(k)), chapters = Object.values(window.TAKKEN_EXAM_BLUEPRINT.textbookRanges).flatMap(range => range.chapters);
        const excluded = new Set(["o003", "o004", "o005", "o006", "o007", "o008", "o009", "o010"]);
        const eligible = chapters.map(chapter => chapter.ids.filter(id => profile === "general" || !excluded.has(id))).filter(ids => ids.length);
        s.examProfile = profile;
        s.questionStats = Object.fromEntries(chapters.flatMap(chapter => chapter.ids).filter(id => !excluded.has(id) && (!omitPrice || !["o001", "o002"].includes(id))).map(id => [id, { attempts: 1, correct: 1, wrong: 0, lastAnsweredAt: "2026-08-15T10:00:00+09:00" }]));
        localStorage.setItem(k, JSON.stringify(s));
        return { totalUnits: eligible.length, completedUnits: eligible.filter(ids => ids.every(id => s.questionStats[id]?.attempts)).length };
      }, { k: key(row.page), profile, omitPrice });
      await row.page.reload({ waitUntil: "networkidle" });
      const disabled = await row.page.locator("#officialExamStartButton").isDisabled();
      const progress = await row.page.locator("#foundationGateStatus").textContent();
      const contactProgress = await row.page.locator("#foundationUnitsProgress").textContent();
      let started = null;
      if (!disabled) {
        await row.page.evaluate(() => document.querySelector("#officialExamStartButton").click());
        started = (await saved(row.page)).officialExamSession;
      }
      const stillUnanswered = Object.keys((await saved(row.page)).questionStats).every(id => !/^o00[3-9]$|^o010$/.test(id));
      const displayedCount = shouldUnlock && !disabled ? await row.page.locator("#officialExamProgress").textContent() : "";
      reviewRegressions.push({ id: `profile-gate-${profile}-${omitPrice}`, passed: disabled === !shouldUnlock && progress.includes(`${expected.completedUnits} / ${expected.totalUnits}`) && contactProgress.includes(`${expected.completedUnits} / ${expected.totalUnits}`) && stillUnanswered && (!shouldUnlock || started?.examProfile === "fiveExempt" && displayedCount.includes("45")), disabled, progress, contactProgress, startedProfile: started?.examProfile, displayedCount, expected });
      await row.context.close();
    }
    const officialAttempt = (examId, score, day) => {
      const exam = officialData.EXAM_BY_ID[examId], answers = Object.fromEntries(exam.answers.map((value, index) => {
        const accepted = Array.isArray(value) ? value : [value];
        return [index + 1, index < score ? accepted[0] : [1, 2, 3, 4].find(choice => !accepted.includes(choice))];
      }));
      const scored = officialData.scoreAnswers(examId, answers);
      return { recordId: `fixture-${examId}`, examId, year: exam.year, attemptType: "initial", sourceMode: "timed-answer-sheet", examProfile: "general", questionCount: 50, evidenceVersion: 3, scoringBasis: "historical-official-key", startedAt: `${day}T10:00:00+09:00`, startedDayKey: day, startedUtcOffsetMinutes: -540, appUnseenAtStart: true, currentLawBaseline: "2026-04-01", timed120: true, answers, score: scored.score, rights: scored.sectionScores.rights, restrictions: scored.sectionScores.restrictions, business: scored.sectionScores.business, taxOther: scored.sectionScores.taxOther, elapsedMinutes: 110, completedAt: `${day}T11:50:00+09:00` };
    };
    for (const [name, days, score, expectedText] of [
      ["stale-latest", ["2026-07-25", "2026-07-26", "2026-07-27"], 40, "再確認待ち"],
      ["stale-span", ["2026-07-01", "2026-08-14", "2026-08-15"], 40, "再確認待ち"],
      ["below-target", ["2026-08-13", "2026-08-14", "2026-08-15"], 37, "得点未達"],
      ["fresh-target", ["2026-08-13", "2026-08-14", "2026-08-15"], 40, "通過"]
    ]) {
      const row = await open(name, "2026-08-16"), history = days.map((day, i) => officialAttempt(String(2023 + i), score, day));
      await row.page.evaluate(({ k, history }) => { const s = JSON.parse(localStorage.getItem(k)); s.officialExamHistory = history; localStorage.setItem(k, JSON.stringify(s)); }, { k: key(row.page), history });
      await row.page.reload({ waitUntil: "networkidle" });
      const status = await row.page.locator("#passReadinessStatus").textContent();
      reviewRegressions.push({ id: name, passed: status.includes(expectedText) && (expectedText !== "再確認待ち" || !status.includes("得点未達")), status, expectedText });
      if (name === "stale-latest") {
        if (!(await row.page.locator("#passPlanPanel").evaluate(node => node.open))) await row.page.locator("#passPlanPanel > summary").click();
        await row.page.locator("#passReadinessCard").screenshot({ path: path.join(out, "stale-readiness-390.png") });
        assert.equal(await row.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      await row.context.close();
    }
    fs.writeFileSync(path.join(out, "review-regressions.json"), JSON.stringify(reviewRegressions, null, 2));
    assert.deepEqual(reviewRegressions.filter(row => !row.passed), [], "PR76 profile gate and stale-score UI regressions");
    if (process.argv.includes("--review-regressions-only")) { console.log(JSON.stringify({ status: "passed", reviewRegressions })); return; }
    for (const profile of ["general", "fiveExempt"]) {
      const { page, context } = await open(profile);
      await seed(page, profile, { exempt: profile === "fiveExempt" ? 8 : 0 });
      const button = page.locator("#todayCommandStartButton");
      assert.equal(await button.getAttribute("data-scope-id"), "other");
      assert.equal(await button.getAttribute("data-topic-id"), "price", "price remains required in BOTH profiles");
      assert.equal(await button.getAttribute("data-session-size"), "2");
      assert.equal(await page.locator("#todayCommandPanel").evaluate(n => n.classList.contains("is-complete")), false);
      await button.click();
      const before = (await saved(page)).practicalDrill;
      assert.equal(before.sessionIds.length, 2);
      assert.equal(await page.evaluate(ids => ids.every(id => window.TAKKEN_EXAM_DAILY_COVERAGE.category(window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID[id]) === "price"), before.sessionIds), true);
      await finishSprint(page);
      if (profile === "general") {
        assert.equal(await button.getAttribute("data-topic-id"), "exempt");
        assert.equal(await button.getAttribute("data-session-size"), "6");
        await button.click(); await finishSprint(page);
      }
      assert.equal(await page.locator("#todayCommandPanel").evaluate(n => n.classList.contains("is-complete")), true);
      assert.match(await page.locator("#missionOfficialStatus").textContent(), profile === "general" ? /12 \/ 12/ : /6 \/ 6/);
      await page.reload({ waitUntil: "networkidle" });
      assert.equal(await page.locator("#todayCommandPanel").evaluate(n => n.classList.contains("is-complete")), true);
      await page.screenshot({ path: path.join(out, `daily-${profile}.png`) });
      await context.close();
    }
    const dedup = await open("dedup");
    await seed(dedup.page, "fiveExempt", { price: 1, exempt: 8, duplicatePrice: true });
    assert.equal(await dedup.page.locator("#todayCommandStartButton").getAttribute("data-topic-id"), "price");
    assert.equal(await dedup.page.locator("#todayCommandStartButton").getAttribute("data-session-size"), "1", "same base/sprint source cannot count twice");
    await dedup.context.close();
    for (const [date, scope] of [["2026-09-08", "restrictions"], ["2026-09-09", "rights"]]) {
      for (const profile of ["general", "fiveExempt"]) {
        const row = await open(scope + profile, date); await seed(row.page, profile, { tax: 0 });
        assert.equal(await row.page.locator("#todayCommandStartButton").getAttribute("data-scope-id"), scope);
        await row.page.locator("#todayCommandStartButton").click();
        const drill = (await saved(row.page)).practicalDrill;
        assert.equal(drill.sessionIds.length, 8);
        assert.equal(await row.page.evaluate(({ ids, scope }) => ids.every(id => window.TAKKEN_EXAM_DAILY_COVERAGE.category(window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS_BY_ID[id]) === scope), { ids: drill.sessionIds, scope }), true);
        await row.context.close();
      }
    }
    const { page, context } = await open("objective");
    const before = await saved(page);
    await page.evaluate(k => {
      window.originalCoverageSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === k) throw new DOMException("synthetic quota", "QuotaExceededError");
        return window.originalCoverageSetItem.call(this, key, value);
      };
    }, key(page));
    await page.locator("#rightsTransferStart").click();
    assert.equal(await page.locator("#rightsTransferDialog").evaluate(n => n.open), false);
    assert.deepEqual((await saved(page)).rightsTransferQuiz, before.rightsTransferQuiz, "failed start does not leave apparent first evidence");
    await page.evaluate(() => { Storage.prototype.setItem = window.originalCoverageSetItem; delete window.originalCoverageSetItem; });
    await page.locator("#rightsTransferStart").click();
    assert.match(await page.locator("#rightsTransferProgress").textContent(), /1\/6/);
    const first = bank.QUESTIONS[0];
    await page.locator(`[data-transfer-choice="${(first.answer + 1) % 4}"]`).click();
    const partial = (await saved(page)).rightsTransferQuiz;
    assert.equal(partial.firstResult, null);
    assert.equal(await page.locator("[data-transfer-review]").count(), 0);
    await page.locator("#rightsTransferClose").click();
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#rightsTransferStart").click();
    assert.match(await page.locator("#rightsTransferProgress").textContent(), /2\/6/);
    assert.deepEqual((await saved(page)).rightsTransferQuiz, partial);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.ok((await page.locator("[data-transfer-choice]").evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height))).every(h => h >= 44));
      await page.locator("#rightsTransferDialog").screenshot({ path: path.join(out, `objective-${width}.png`) });
    }
    for (const q of bank.QUESTIONS.slice(1)) { assert.equal(await page.locator("#rightsTransferContent").getAttribute("data-question-id"), q.id); await page.locator(`[data-transfer-choice="${q.answer}"]`).click(); }
    assert.equal(await page.locator("[data-transfer-review]").count(), 6);
    assert.match(await page.locator("#rightsTransferProgress").textContent(), /5\/6/);
    assert.equal(await page.locator("[data-transfer-review] details[open]").count(), 0);
    const completed = await saved(page), immutable = completed.rightsTransferQuiz.firstResult;
    for (const field of ["questionStats", "practicalDrill", "officialExamHistory", "daily", "correct", "attempts", "totalXp", "missionLog"]) assert.deepEqual(completed[field], before[field], `objective adds no credit to ${field}`);
    await page.locator("[data-transfer-review] summary").first().click();
    assert.equal(await page.locator("[data-transfer-review]").first().locator("details p").count(), 4);
    assert.match(await page.locator("[data-transfer-review]").first().locator("a").textContent(), /2026-04-01/);
    await page.locator("#rightsTransferClose").click(); await page.locator("#rightsTransferStart").click();
    for (const q of bank.QUESTIONS) await page.locator(`[data-transfer-choice="${q.answer}"]`).click();
    const retry = (await saved(page)).rightsTransferQuiz;
    assert.deepEqual(retry.firstResult, immutable);
    assert.equal(retry.lastResult.score, 6);
    await page.locator("#rightsTransferClose").click();
    assert.match(await page.locator("#rightsTransferStatus").textContent(), /初回 5\/6.*解き直し 6\/6/);
    await page.goto(`${base}?review=coverage-objective&today=1&legacy=1`, { waitUntil: "networkidle" });
    if (completed.stateSchemaVersion === 17) await page.locator("#todayCommandStartButton").click();
    else assert.match(await page.locator("#saveTransferStatus").textContent(), /新しい保存形式v18/, "old main must protect the newer PR76 schema");
    assert.deepEqual((await saved(page)).rightsTransferQuiz, retry, "main schema17 normal save preserves additive field");
    if (completed.stateSchemaVersion === 19) {
      await page.goto(`${base}?review=coverage-objective&today=1&legacy=76`, { waitUntil: "networkidle" });
      await page.locator("#todayCommandStartButton").click();
      assert.deepEqual((await saved(page)).rightsTransferQuiz, retry, "standalone PR76 normal save preserves the added checkpoint");
    }
    await page.goto(`${base}?review=coverage-objective&today=1`, { waitUntil: "networkidle" });
    const packageText = await page.evaluate(k => JSON.stringify(window.TAKKEN_SAVE_TRANSFER.createSavePackage(JSON.parse(localStorage.getItem(k)))), key(page));
    page.on("dialog", dialog => dialog.accept());
    await page.locator("#saveImportInput").setInputFiles({ name: "synthetic-coverage-save.json", mimeType: "application/json", buffer: Buffer.from(packageText) });
    await page.waitForFunction(() => document.querySelector("#saveTransferStatus")?.textContent.includes("引継ぎ完了"));
    assert.deepEqual((await saved(page)).rightsTransferQuiz, retry, "full JSON import preserves original/retry records");
    assert.deepEqual(errors, []);
    const result = { status: "passed", profiles: ["general", "fiveExempt"], dailyPriceActuallyAnswered: true, everyEligibleCategoryReachable: true, deduplicatedSourceCredit: true, objective: 6, widths: [320, 390, 1280], firstScore: 5, retryScore: 6, oldMainSavePreserved: true, fullJsonImportPreserved: true, quotaFailureRolledBack: true, noReadinessCredit: true, pageErrors: errors };
    fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); await context.close();
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
