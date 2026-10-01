"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = __dirname;
const output = path.join(root, "output", "playwright", "chatgpt-help");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

async function startServer() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = path.resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!target.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end(); return; }
    fs.readFile(target, (error, body) => {
      if (error) { response.writeHead(404).end(); return; }
      response.writeHead(200, { "content-type": `${types[path.extname(target)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
      response.end(body);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

async function saveText(page) {
  return page.evaluate(() => {
    const namespace = new URL(location.href).searchParams.get("review").replace(/[^a-z0-9-]/gi, "").slice(0, 24);
    const key = `takken-battle-study-clean-v2-hard-review-${namespace}`;
    return localStorage.getItem(key);
  });
}

async function goto(page, base, name) {
  await page.goto(`${base}?review=cgpt-${name}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#quizCard")?.dataset.questionId);
}

async function verifyHelp(page, hostSelector, choicesSelector, selected, width) {
  const host = page.locator(hostSelector);
  const help = host.locator(".chatgpt-help");
  await help.waitFor({ state: "visible" });
  assert.equal(await help.count(), 1, "rerender must not duplicate the help panel");
  const prompt = await help.locator("textarea").inputValue();
  const choices = await page.locator(choicesSelector).allTextContents();
  assert.ok(prompt.includes("【選択肢（画面の順番）】"));
  const chosen = prompt.split("【私が選んだ答え】")[1].split("\n")[0];
  assert.ok(chosen.startsWith(String(selected + 1) + ". "), "actual displayed choice number must be transferred");
  const displayedChoice = choices[selected].replace(/^\s*\d+[.．]?\s*/, "").trim();
  assert.ok(chosen.includes(displayedChoice), `actual chosen text must be transferred: ${JSON.stringify({ chosen, displayedChoice }).slice(0, 900)}`);
  assert.match(prompt, /【アプリの正解】\d\. /);
  assert.match(prompt, /法令基準日: 2026-04-01/);
  assert.ok(prompt.includes("私が回答するまで伏せて"), "retry question must withhold its answer");
  assert.doesNotMatch(prompt, /PRIVATE_SENTINEL|questionStats|writerId|stateSchemaVersion/);
  const link = help.locator("a");
  const href = await link.getAttribute("href");
  assert.equal(await link.getAttribute("target"), "_blank");
  assert.match(await link.getAttribute("rel"), /noopener.*noreferrer/);
  if (new URL(href).searchParams.has("q")) assert.equal(new URL(href).searchParams.get("q"), prompt);
  else assert.equal(href, "https://chatgpt.com/", "oversized prompt must use the copy fallback");
  const before = await saveText(page);
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  assert.equal(new URL(popup.url()).origin, "https://chatgpt.com");
  await popup.close();
  assert.equal(await saveText(page), before, "opening ChatGPT must not alter study progress");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { window.__copiedHelp = text; } } });
  });
  await help.locator("button").click();
  await page.waitForFunction(() => document.querySelector(".chatgpt-help-status")?.textContent.includes("コピーしました"));
  assert.equal(await page.evaluate(() => window.__copiedHelp), prompt, "clipboard fallback must preserve the whole prompt");
  assert.equal(await saveText(page), before, "copying must not alter study progress");
  await help.scrollIntoViewIfNeeded();
  const sizes = await help.locator("a, button").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  assert.ok(sizes.every(height => height >= 44), "touch targets must be at least 44px");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: no horizontal overflow`);
  await help.screenshot({ path: path.join(output, `${hostSelector.slice(1)}-${width}.png`) });
  return prompt;
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [], results = [];
  try {
    for (const width of [1280, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", reducedMotion: "reduce", serviceWorkers: "block" });
      // Exercise the real external-link click without sending an AI message.
      await context.route("https://chatgpt.com/**", route => route.fulfill({ contentType: "text/html", body: "<title>ChatGPT link audit</title>" }));
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await goto(page, server.url, `normal-${width}`);
      assert.equal(await page.locator("#feedbackBox .chatgpt-help").count(), 0, "no answer disclosure before answering");
      await page.locator("#choices button").first().click();
      const normalPrompt = await verifyHelp(page, "#feedbackBox", "#choices button", 0, width);
      await page.reload({ waitUntil: "networkidle" });
      assert.equal(await page.locator("#feedbackBox .chatgpt-help textarea").inputValue(), normalPrompt, "answered question must recover the same help after reload");
      if (width === 320) {
        await page.evaluate(() => {
          Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
          document.execCommand = () => false;
        });
        await page.locator("#feedbackBox .chatgpt-help-copy").click();
        await page.locator("#feedbackBox .chatgpt-help-manual").waitFor({ state: "visible" });
        assert.equal(await page.locator("#feedbackBox .chatgpt-help-manual").inputValue(), normalPrompt);
      }
      await page.locator("#dockNextButton").click();
      await page.waitForFunction(() => !document.querySelector("#feedbackBox .chatgpt-help"));
      assert.equal(await page.locator("#feedbackBox .chatgpt-help").count(), 0, "next question must remove stale answer links");
      results.push(`normal-${width}`);

      await goto(page, server.url, `knock-${width}`);
      await page.locator("#businessKnockStart").evaluate(node => node.click());
      await page.locator(".practical-drill-choice:enabled").first().click();
      await verifyHelp(page, "#practicalDrillFeedback", ".practical-drill-choice", 0, width);
      await page.locator("#practicalDrillNextButton").evaluate(node => {
        if (node.disabled) document.querySelector('[data-practical-confidence="uncertain"]').click();
        node.click();
      });
      assert.equal(await page.locator("#practicalDrillFeedback .chatgpt-help").count(), 0);
      results.push(`knock-${width}`);

      await goto(page, server.url, `calc-${width}`);
      await page.locator("#calculationDrillPanel > summary").click();
      await page.locator("#calculationDrillResetButton").click();
      const answer = await page.evaluate(() => window.TAKKEN_CALCULATION_DRILL.QUESTIONS[0].answer);
      const wrong = (answer + 1) % 4;
      await page.locator(".calculation-drill-choice").nth(wrong).click();
      await verifyHelp(page, "#calculationDrillFeedback", ".calculation-drill-choice", wrong, width);
      await page.locator("#calculationDrillNextButton").click();
      assert.equal(await page.locator("#calculationDrillFeedback .chatgpt-help").count(), 0);
      results.push(`calculation-${width}`);

      if (width === 390) {
        await goto(page, server.url, "mock");
        const questions = await page.evaluate(() => window.TAKKEN_CASE_EXAM_BANK.forms[0].questions.map(q => ({ id: q.id, answer: q.answer })));
        await page.locator("#mockCaseButton").evaluate(node => node.click());
        for (let index = 0; index < questions.length; index++) {
          await page.waitForFunction(id => document.querySelector("#quizCard").dataset.questionId === id, questions[index].id);
          await page.locator("#choices button").nth(index ? questions[index].answer : (questions[index].answer + 1) % 4).click();
          assert.equal(await page.locator("#feedbackBox .chatgpt-help").count(), 0, "unfinished mock must not leak answers through the ChatGPT URL");
          await page.locator("#dockNextButton").click();
        }
        await page.locator(".mock-wrong-item summary").click();
        const prompt = await page.locator(".mock-wrong-item .chatgpt-help textarea").inputValue();
        assert.ok(prompt.includes(questions[0].id), "review must use the actual wrong question");
        assert.equal(await page.locator(".mock-wrong-item .chatgpt-help").count(), 1);
        await page.locator(".mock-wrong-item .chatgpt-help").screenshot({ path: path.join(output, "mock-review-390.png") });
        results.push("mock-conceal-and-review");
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    const receipt = { status: "ok", checks: results, errors, screenshots: output };
    fs.writeFileSync(path.join(output, "receipt.json"), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });
