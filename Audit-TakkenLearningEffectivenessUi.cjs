#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function staticServer(root) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = path.resolve(root, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) {
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
    server.listen(0, "127.0.0.1", () => resolve({ baseUrl: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(done => server.close(done)) }));
  });
}

async function main() {
  const server = await staticServer(process.cwd());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const output = path.join(process.cwd(), "output", "learning-ui");
  fs.mkdirSync(output, { recursive: true });
  const errors = [];
  let verified = 0;
  try {
    for (const [topic, sourceId] of [["assignment-setoff", "r009"], ["obligations", "r008"]]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce" });
      const page = await context.newPage();
      page.on("pageerror", e => errors.push(e.message));
      const review = `learning${sourceId}`;
      const key = `takken-battle-study-clean-v2-hard-review-${review}`;
      const saved = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
      await page.goto(`${server.baseUrl}?review=${review}&today=1`, { waitUntil: "networkidle" });
      await page.selectOption("#rightsMasteryTopic", topic);
      await page.click("#rightsMasteryTopicStart");
      let found = false;
      for (let i = 0; i < 4; i++) {
        const drill = (await saved()).practicalDrill;
        const q = await page.evaluate(d => window.TAKKEN_SUBJECT_SPRINT_BANK.presentQuestion(d.queue[d.position], d.presentationOverrides?.[d.queue[d.position]] || d.presentationKey), drill);
        assert.equal(await page.locator(".reasoning-transfer:visible").count(), 0, "no check answers before the original answer");
        await page.click('[data-practical-forecast="confident"]');
        await page.locator(".practical-drill-choice").nth(q.answer).click();
        if (q.sourceQuestionId !== sourceId) {
          assert.equal(await page.locator(".reasoning-transfer:visible").count(), 0);
          await page.click("#practicalDrillNextButton");
          continue;
        }
        found = true;
        const before = (await saved()).practicalDrill;
        assert.equal(await page.locator(".reasoning-transfer details").count(), 3);
        assert.equal(await page.locator(".reasoning-transfer details[open]").count(), 0, "model answers initially hidden");
        const expected = q.reasoningChecks;
        for (let n = 0; n < 3; n++) {
          const details = page.locator(".reasoning-transfer details").nth(n);
          await details.locator("summary").click();
          assert.equal(await details.locator("p").innerText(), expected[n].answer);
          assert.match(await details.locator("a").innerText(), /2026-04-01/);
          assert.equal(await details.locator("a").getAttribute("href"), expected[n].sourceUrl);
          verified++;
        }
        assert.deepEqual((await saved()).practicalDrill, before, "revealing explanations gives no score, confidence or mastery credit");
        for (const width of [320, 390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0);
          const heights = await page.locator(".reasoning-transfer summary").evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height));
          assert.ok(heights.every(h => h >= 44));
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator(".reasoning-transfer").screenshot({ path: path.join(output, `${sourceId}-390.png`) });
        await page.reload({ waitUntil: "networkidle" });
        assert.deepEqual((await saved()).practicalDrill, before, "existing saved attempt survives reload without a schema change");
        assert.equal(await page.locator(".reasoning-transfer details[open]").count(), 0, "reloading starts with answers hidden again");
        await page.click("#practicalDrillNextButton");
        assert.equal(await page.locator(".reasoning-transfer:visible").count(), 0, "no previous question's check leaks into next question");
        break;
      }
      assert.ok(found, `reached ${sourceId}`);
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${server.baseUrl}?review=learningnormal`, { waitUntil: "networkidle" });
    if (!await page.locator("#themeDrawer").evaluate(el => el.open)) await page.click("#themeDrawer > summary");
    const chapterValue = await page.locator("#chapterSelect option").filter({ hasText: "02-11 連帯債務" }).getAttribute("value");
    assert.ok(chapterValue);
    await page.selectOption("#chapterSelect", chapterValue);
    let normalFound = false;
    for (let i = 0; i < 3; i++) {
      await page.waitForFunction(id => document.querySelector("#quizCard").dataset.questionId === id && document.querySelector("#feedbackBox").hidden, ["r007", "r008", "r108"][i]);
      const q = await page.evaluate(() => window.TAKKEN_EXAM_QUESTIONS[document.querySelector("#quizCard").dataset.questionId]);
      await page.locator(`.choice-button[data-index="${q.answer}"]`).click();
      await page.locator("#feedbackBox").waitFor({ state: "visible" });
      if (q.id === "r008") {
        normalFound = true;
        if (!await page.locator("#feedbackBox .reasoning-transfer").count()) console.log(await page.evaluate(() => ({ id: document.querySelector("#quizCard").dataset.questionId, check: window.TAKKEN_EXAM_QUESTIONS.r008.reasoningChecks?.length, feedback: document.querySelector("#feedbackBox").innerText, allChecks: document.querySelectorAll(".reasoning-transfer").length })));
        assert.equal(await page.locator("#feedbackBox .reasoning-transfer details").count(), 3, "normal chapter also provides the contrast checks");
        assert.equal(await page.locator("#feedbackBox .reasoning-transfer details[open]").count(), 0);
        await page.locator("#feedbackBox .reasoning-transfer summary").first().click();
        await page.locator("#feedbackBox .reasoning-transfer").screenshot({ path: path.join(output, "normal-r008-390.png") });
        break;
      }
      await page.click("#dockNextButton");
    }
    assert.ok(normalFound);
    await context.close();
    assert.equal(verified, 6);
    assert.deepEqual(errors, []);
    const result = { status: "passed", contrastChecks: verified, normalChapter: normalFound, widths: [320, 390, 1280], noExtraCredit: true, savedAttemptPreserved: true, consoleErrors: errors };
    fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); await server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
