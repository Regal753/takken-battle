"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

async function main() {
  const root = __dirname;
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, body) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".json": "application/json" })[path.extname(file)] || "application/octet-stream");
      res.end(body);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  const out = path.join(root, "output/playwright/final-stretch");
  fs.mkdirSync(out, { recursive: true });
  try {
    async function open(day, name, width = 390) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce" });
      await context.addInitScript((day) => {
        const NativeDate = Date;
        const now = new NativeDate(day + "T10:00:00+09:00").getTime();
        window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
      }, day);
      const page = await context.newPage();
      page.on("pageerror", e => errors.push(String(e)));
      page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      await page.goto(`http://127.0.0.1:${server.address().port}/?review=final53-${name}&today=1`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => window.TAKKEN_SUBJECT_SPRINT_BANK && document.querySelector("#todayCommandStartButton")?.dataset.commandAction);
      return { page, context };
    }
    async function seed(page, { tax = 0, other = 0, minutes = 0 } = {}) {
      await page.evaluate(({ tax, other, minutes }) => {
        const review = new URL(location.href).searchParams.get("review");
        const key = `takken-battle-study-clean-v2-hard-review-${review}`;
        const saved = JSON.parse(localStorage.getItem(key));
        const bank = window.TAKKEN_BUSINESS_FULLSCORE_BANK.QUESTIONS;
        const sprint = window.TAKKEN_SUBJECT_SPRINT_BANK.QUESTIONS;
        const questions = [...bank.slice(0, 20), ...sprint.filter(q => q.sectionId === "taxOther").slice(0, tax), ...sprint.filter(q => q.sectionId === "other").slice(0, other)];
        for (const q of questions) saved.practicalDrill.history[q.id] = { attempts: 1, correct: 1, wrong: 0, lastCorrect: true, lastConfidence: "confident", lastAnsweredAt: "2026-09-10T09:00:00+09:00" };
        saved.missionLog["2026-09-10"] = { ...(saved.missionLog["2026-09-10"] || {}), minutes };
        localStorage.setItem(key, JSON.stringify(saved));
      }, { tax, other, minutes });
      await page.reload({ waitUntil: "networkidle" });
    }
    async function stored(page) {
      return page.evaluate(() => JSON.parse(localStorage.getItem(`takken-battle-study-clean-v2-hard-review-${new URL(location.href).searchParams.get("review")}`)));
    }
    const first = await open("2026-09-10", "first");
    assert.match(await first.page.locator("#todayCommandKicker").textContent(), /本試験まで38日/);
    assert.doesNotMatch(await first.page.locator("#passReadinessPace").textContent(), /今日45単元|最低\?分/);
    assert.equal(await first.page.locator("#passMockAction").getAttribute("data-command-action"), "official-exam", "official measurement remains reachable without textbook completion");
    for (const width of [320, 390, 1440]) {
      await first.page.setViewportSize({ width, height: 844 });
      assert.equal(await first.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
      assert.equal(await first.page.locator("#todayCommandStartButton").evaluate(n => n.getBoundingClientRect().bottom < innerHeight), true, `today's start must be visible without scrolling at ${width}`);
      await first.page.screenshot({ path: path.join(out, `today-${width}.png`) });
    }
    await first.page.locator("#todayCommandStartButton").click();
    const activeBefore = (await stored(first.page)).practicalDrill;
    assert.equal(activeBefore.sessionIds.length, 20);
    assert.equal(activeBefore.sessionIds.every(id => /^hard54-\d{3}$/.test(id)), true, "the weekday command must use hard cases");
    await first.page.reload({ waitUntil: "networkidle" });
    const activeAfter = (await stored(first.page)).practicalDrill;
    assert.deepEqual(activeAfter.queue, activeBefore.queue);
    assert.equal(activeAfter.position, activeBefore.position);
    assert.equal(await first.page.locator("#todayCommandStartButton").getAttribute("data-command-action"), "resume");

    const gap = await open("2026-09-10", "tax-gap");
    await seed(gap.page, { other: 12, minutes: 75 });
    assert.equal(await gap.page.locator("#todayCommandStartButton").getAttribute("data-scope-id"), "taxOther");
    assert.equal(await gap.page.locator("#todayCommandPanel").evaluate(n => n.classList.contains("is-complete")), false, "other cannot substitute for tax");
    await gap.page.locator("#todayCommandStartButton").click();
    const sprint = (await stored(gap.page)).practicalDrill;
    assert.equal(sprint.bankId, "subject-sprint");
    assert.equal(sprint.scope, "taxOther");
    assert.equal(sprint.sessionSize, 6);
    await seed(gap.page, { tax: 6, other: 12, minutes: 75 });
    assert.equal(await gap.page.locator("#todayCommandStartButton").isVisible(), true, "unfinished retry/session must remain resumable even after counts are reached");
    assert.equal(await gap.page.locator("#todayCommandPanel").evaluate(n => n.classList.contains("is-complete")), false);

    const time = await open("2026-09-10", "time");
    await seed(time.page, { tax: 6, other: 6 });
    const counted = await time.page.locator("#missionOfficialStatus").textContent();
    assert.match(counted, /12 \/ 12/, `tax + other must count both lanes: ${counted}`);
    assert.match(await time.page.locator("#todayCommandTitle").textContent(), /問題は完了/);
    assert.equal(await time.page.locator("#todayCommandStartButton").isVisible(), false, "do not send a completed learner into extra questions");
    assert.equal(await time.page.locator("#todayCommandMinutesActions").isVisible(), true);
    await time.page.locator("#missionMinutesInput").fill("75");
    await time.page.locator("#missionMinutesButton").click();
    assert.equal(await time.page.locator("#todayCommandPanel").evaluate(n => n.classList.contains("is-complete")), true);
    await time.page.reload({ waitUntil: "networkidle" });
    assert.equal(await time.page.locator("#todayCommandPanel").evaluate(n => n.classList.contains("is-complete")), true);

    const sunday = await open("2026-09-13", "sunday");
    assert.equal(await sunday.page.locator("#todayCommandStartButton").getAttribute("data-command-action"), "official-exam");
    const before = await stored(sunday.page);
    assert.deepEqual(before.officialExamExposure || {}, {});
    assert.equal(before.officialExamSession, null);
    await sunday.page.screenshot({ path: path.join(out, "sunday-390.png") });

    const eve = await open("2026-10-17", "eve");
    assert.match(await eve.page.locator("#todayCommandKicker").textContent(), /本試験まで1日/);
    assert.match(await eve.page.locator("#todayCommandText").textContent(), /前日は軽い復習/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "ok", widths: [320, 390, 1440], scenarios: ["38-day-route", "official-before-textbook", "tax-not-skipped", "active-session-resume", "minutes-after-questions", "reload-preserved", "sunday", "exam-eve"], pageErrors: errors.length, screenshots: out }));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
