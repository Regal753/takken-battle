#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

function startStaticServer(root) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".webp": "image/webp"
  };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`) && target !== path.join(path.resolve(root), "index.html")) {
      response.writeHead(403).end("forbidden");
      return;
    }
    fs.readFile(target, (error, body) => {
      if (error) {
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, {
        "content-type": types[path.extname(target)] || "application/octet-stream",
        "cache-control": "no-store"
      });
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

async function gotoFresh(page, baseUrl, name) {
  const url = new URL(baseUrl);
  url.searchParams.set("review", `${name}-${Date.now().toString(36)}`);
  await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForSelector("#chapterSelect", { state: "attached" });
  await page.emulateMedia({ reducedMotion: "reduce" });
}

async function savedState(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
      !candidate.includes("backup") &&
      !candidate.includes("-before-") &&
      !candidate.includes("previous") &&
      !candidate.includes("corrupt") &&
      !candidate.endsWith("event-outbox")
    );
    if (!key) throw new Error("review save key not found");
    return JSON.parse(localStorage.getItem(key));
  });
}

async function textbookChapter(page, id) {
  return page.evaluate((chapterId) => Object.values(window.TAKKEN_EXAM_BLUEPRINT.textbookRanges)
    .flatMap((range) => range.chapters)
    .find((chapter) => chapter.id === chapterId), id);
}

async function currentQuestion(page) {
  return page.evaluate(() => {
    const text = document.querySelector("#questionText")?.textContent || "";
    const question = Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
      .find((candidate) => candidate.text === text);
    if (!question) throw new Error(`question not found: ${text.slice(0, 80)}`);
    return { id: question.id, answer: question.answer };
  });
}

async function selectChapter(page, label) {
  await page.locator("#themeDrawer > summary").click();
  const value = await page.locator("#chapterSelect option").filter({ hasText: label }).getAttribute("value");
  assert.ok(value, `missing chapter option: ${label}`);
  await page.locator("#chapterSelect").selectOption(value);
}

async function finishChapter(page, chapter) {
  for (let index = 0; index < chapter.ids.length; index += 1) {
    const question = await currentQuestion(page);
    assert.equal(question.id, chapter.ids[index]);
    await page.locator(`.choice-button[data-index="${question.answer}"]`).click();
    await page.locator("#feedbackBox").waitFor({ state: "visible" });
    await page.locator("#dockNextButton").click();
    if (index < chapter.ids.length - 1) {
      await page.waitForFunction((nextId) => {
        const text = document.querySelector("#questionText")?.textContent || "";
        return Object.values(window.TAKKEN_EXAM_QUESTIONS || {})
          .find((candidate) => candidate.text === text)?.id === nextId;
      }, chapter.ids[index + 1]);
    }
  }
  await page.locator(`[data-chapter-result="${chapter.id}"]`).waitFor();
}

async function main() {
  const server = await startStaticServer(__dirname);
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  const consoleErrors = [];
  const pageErrors = [];
  try {
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    desktop.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    desktop.on("pageerror", (error) => pageErrors.push(error.message));
    await gotoFresh(desktop, server.baseUrl, "chapter-mode-desktop");
    const dailyBefore = (await savedState(desktop)).daily;
    const chapter = await textbookChapter(desktop, "business-book-07");
    assert.equal(chapter.ids.length, 15);
    await selectChapter(desktop, "01-07 業務上の規制");
    const selected = await savedState(desktop);
    assert.equal(selected.runMode, "chapter");
    assert.equal(selected.chapterModeId, chapter.id);
    assert.deepEqual(selected.daily.planIds, dailyBefore.planIds);
    assert.equal(selected.daily.target, dailyBefore.target);
    assert.equal(selected.daily.planUnitId, dailyBefore.planUnitId);
    await finishChapter(desktop, chapter);
    assert.match(await desktop.locator(`[data-chapter-result="${chapter.id}"]`).textContent(), /固定10問は変更していません/);
    const dailyAfter = (await savedState(desktop)).daily;
    assert.deepEqual(dailyAfter.planIds, dailyBefore.planIds);
    assert.equal(dailyAfter.target, dailyBefore.target);
    assert.equal(dailyAfter.planUnitId, dailyBefore.planUnitId);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    mobile.on("pageerror", (error) => pageErrors.push(error.message));
    await gotoFresh(mobile, server.baseUrl, "chapter-mode-mobile");
    const mobileChapter = await textbookChapter(mobile, "tax-other-book-02");
    await selectChapter(mobile, "04-02 不動産鑑定評価基準");
    await finishChapter(mobile, mobileChapter);
    const overflow = await mobile.evaluate(() => ({
      body: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      items: [...document.querySelectorAll("body *")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < 0 || rect.right > window.innerWidth;
        })
        .slice(0, 8)
        .map((element) => ({ id: element.id, className: String(element.className || "").slice(0, 60) }))
    }));
    assert.equal(overflow.body, 0, JSON.stringify(overflow.items));
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    console.log(JSON.stringify({
      status: "ok",
      desktopChapter: { id: chapter.id, questions: chapter.ids.length },
      mobileChapter: { id: mobileChapter.id, questions: mobileChapter.ids.length },
      fixedPlanPreserved: true,
      mobileOverflow: overflow.body,
      consoleErrors: consoleErrors.length,
      pageErrors: pageErrors.length
    }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
