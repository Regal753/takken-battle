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
    const id = document.querySelector("#quizCard")?.dataset.questionId || "";
    const question = window.TAKKEN_EXAM_QUESTIONS?.[id];
    if (!question) throw new Error(`question not found: ${id || "missing id"}`);
    return { id: question.id, answer: question.answer };
  });
}

async function selectChapter(page, label) {
  const drawer = page.locator("#themeDrawer");
  if (!await drawer.evaluate((details) => details.open)) {
    await page.locator("#themeDrawer > summary").click();
  }
  const value = await page.locator("#chapterSelect option").filter({ hasText: label }).getAttribute("value");
  assert.ok(value, `missing chapter option: ${label}`);
  await page.locator("#chapterSelect").selectOption(value);
}

function dailyContract(state) {
  const daily = state.daily || {};
  const planIds = [...(daily.planIds || [])];
  return {
    planIds,
    target: daily.target,
    planUnitId: daily.planUnitId,
    planMode: daily.planMode,
    planScope: daily.planScope,
    planQuestionStats: Object.fromEntries(planIds.map((id) => [id, {
      attempts: Number(state.questionStats?.[id]?.attempts) || 0,
      correct: Number(state.questionStats?.[id]?.correct) || 0,
      wrong: Number(state.questionStats?.[id]?.wrong) || 0
    }]))
  };
}

async function waitForQuestion(page, id) {
  await page.waitForFunction(
    (questionId) => document.querySelector("#quizCard")?.dataset.questionId === questionId,
    id
  );
}

async function chapterUi(page) {
  return page.evaluate(() => ({
    dailyScope: document.querySelector("#studyScopeSelect")?.value || "",
    themeSummary: document.querySelector("#themeDrawerSummary")?.textContent || "",
    selected: document.querySelector("#chapterSelect option:checked")?.textContent || "",
    coachTitle: document.querySelector("#coachTitle")?.textContent || "",
    routeContext: document.querySelector("#foundationRouteContext")?.textContent || "",
    routeButton: document.querySelector("#foundationRoutePrimaryButton")?.textContent || "",
    routeUnitId: document.querySelector("#foundationRoutePrimaryButton")?.dataset?.unitId || "",
    chapterControlLabel: document.querySelector(".theme-control-field-chapter > span")?.textContent || "",
    scopeControlLabel: document.querySelector(".theme-control-field-scope > span")?.textContent || ""
  }));
}

async function roundLabelLayout(page, text = null) {
  return page.evaluate((candidateText) => {
    const roundLabel = document.querySelector("#roundLabel");
    const tagBadge = document.querySelector("#tagBadge");
    const markButton = document.querySelector("#markButton");
    if (!roundLabel || !tagBadge || !markButton) return null;
    const originalText = roundLabel.textContent;
    if (candidateText !== null) roundLabel.textContent = candidateText;
    const range = document.createRange();
    range.selectNodeContents(roundLabel);
    const lineCount = new Set(
      [...range.getClientRects()]
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => Math.round(rect.top * 10) / 10)
    ).size;
    const roundRect = roundLabel.getBoundingClientRect();
    const tagRect = tagBadge.getBoundingClientRect();
    const markRect = markButton.getBoundingClientRect();
    const layout = {
      text: roundLabel.textContent?.trim() || "",
      lineCount,
      clientWidth: roundLabel.clientWidth,
      scrollWidth: roundLabel.scrollWidth,
      tagWidth: Math.round(tagRect.width),
      roundRight: Math.round(roundRect.right),
      tagLeft: Math.round(tagRect.left),
      tagRight: Math.round(tagRect.right),
      markLeft: Math.round(markRect.left),
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
    };
    roundLabel.textContent = originalText;
    return layout;
  }, text);
}

function assertRoundLabelSingleLine(layout, context) {
  assert.ok(layout, `${context}: round label missing`);
  assert.equal(layout.lineCount, 1, `${context}: ${JSON.stringify(layout)}`);
  assert.ok(
    layout.scrollWidth <= layout.clientWidth + 1,
    `${context}: ${JSON.stringify(layout)}`
  );
}

async function finishChapter(page, chapter, expectedAdaptiveTitle = null) {
  for (let index = 0; index < chapter.ids.length; index += 1) {
    const question = await currentQuestion(page);
    assert.equal(question.id, chapter.ids[index]);
    await page.locator(`.choice-button[data-index="${question.answer}"]`).click();
    await page.locator("#feedbackBox").waitFor({ state: "visible" });
    if (index === 0 && expectedAdaptiveTitle) {
      assert.match(
        await page.locator(".adaptive-note strong").textContent(),
        expectedAdaptiveTitle
      );
    }
    await page.locator("#dockNextButton").click();
    if (index < chapter.ids.length - 1) {
      await waitForQuestion(page, chapter.ids[index + 1]);
    }
  }
  await page.locator(`[data-chapter-result="${chapter.id}"]`).waitFor();
}

async function auditReloadBoundaries(page, baseUrl) {
  await gotoFresh(page, baseUrl, "chapter-mode-reload");
  const dailyBefore = dailyContract(await savedState(page));
  const chapter = await textbookChapter(page, "rights-book-02");
  assert.deepEqual(chapter.ids, ["r002", "r102"]);

  await selectChapter(page, "02-02 意思表示");
  await waitForQuestion(page, "r002");
  let state = await savedState(page);
  assert.equal(state.runMode, "chapter");
  assert.equal(state.chapterModeId, chapter.id);
  assert.deepEqual(dailyContract(state), dailyBefore);

  await page.reload({ waitUntil: "networkidle" });
  await waitForQuestion(page, "r002");
  state = await savedState(page);
  let ui = await chapterUi(page);
  assert.equal(state.runMode, "chapter");
  assert.equal(state.chapterModeId, chapter.id);
  assert.deepEqual(dailyContract(state), dailyBefore);
  assert.equal(ui.dailyScope, "business");
  assert.match(ui.themeSummary, /第2分冊・権利・02-02 意思表示/);
  assert.match(ui.selected, /02-02 意思表示/);
  assert.match(ui.coachTitle, /02-02 意思表示・本文p\.172直後/);
  assert.equal(ui.routeContext, "日課: 宅建業法");
  assert.match(ui.routeButton, /^日課:/);
  assert.match(ui.routeUnitId, /^business-book-/);
  assert.match(ui.chapterControlLabel, /単発で解くテーマ/);
  assert.equal(ui.scopeControlLabel, "日課の学習範囲");

  const first = await currentQuestion(page);
  await page.locator(`.choice-button[data-index="${first.answer}"]`).click();
  await page.locator("#feedbackBox").waitFor({ state: "visible" });
  assert.match(
    await page.locator(".adaptive-note strong").textContent(),
    /第2分冊・権利の合格ロード/
  );
  assert.deepEqual(dailyContract(await savedState(page)), dailyBefore);

  await page.reload({ waitUntil: "networkidle" });
  await waitForQuestion(page, "r002");
  await page.locator("#feedbackBox").waitFor({ state: "visible" });
  state = await savedState(page);
  assert.equal(state.answered?.id, "r002");
  assert.deepEqual(dailyContract(state), dailyBefore);
  assert.match(
    await page.locator(".adaptive-note strong").textContent(),
    /第2分冊・権利の合格ロード/
  );

  await page.locator("#dockNextButton").click();
  await waitForQuestion(page, "r102");
  await page.reload({ waitUntil: "networkidle" });
  await waitForQuestion(page, "r102");
  state = await savedState(page);
  ui = await chapterUi(page);
  assert.equal(state.runMode, "chapter");
  assert.equal(state.chapterModeId, chapter.id);
  assert.equal(state.answered, null);
  assert.deepEqual(dailyContract(state), dailyBefore);
  assert.equal(ui.dailyScope, "business");
  assert.match(ui.themeSummary, /第2分冊・権利・02-02 意思表示/);

  const second = await currentQuestion(page);
  await page.locator(`.choice-button[data-index="${second.answer}"]`).click();
  await page.locator("#dockNextButton").click();
  await page.locator(`[data-chapter-result="${chapter.id}"]`).waitFor();
  state = await savedState(page);
  assert.equal(state.finished, true);
  assert.deepEqual(dailyContract(state), dailyBefore);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator(`[data-chapter-result="${chapter.id}"]`).waitFor();
  state = await savedState(page);
  assert.equal(state.runMode, "chapter");
  assert.equal(state.chapterModeId, chapter.id);
  assert.equal(state.finished, true);
  assert.deepEqual(dailyContract(state), dailyBefore);
  ui = await chapterUi(page);
  assert.equal(ui.dailyScope, "business");
  assert.match(ui.themeSummary, /第2分冊・権利・02-02 意思表示/);
  assert.match(ui.selected, /02-02 意思表示/);
  assert.match(
    await page.locator(`[data-chapter-result="${chapter.id}"]`).textContent(),
    /固定10問は変更していません/
  );

  await page.locator("#chapterDailyButton").click();
  const returnedQuestion = await currentQuestion(page);
  state = await savedState(page);
  assert.equal(state.runMode, "quest");
  assert.equal(state.chapterModeId, "");
  assert.equal(state.finished, false);
  assert.ok(dailyBefore.planIds.includes(returnedQuestion.id));
  assert.deepEqual(dailyContract(state), dailyBefore);

  return {
    id: chapter.id,
    questions: chapter.ids.length,
    selectionReload: "r002",
    answeredReload: "r002",
    nextReload: "r102",
    resultReload: true,
    dailyReturn: returnedQuestion.id,
    dailyScopePreserved: "business"
  };
}

async function auditFoundationNextUnit(page, baseUrl) {
  await gotoFresh(page, baseUrl, "chapter-mode-next-unit");
  const dailyBefore = dailyContract(await savedState(page));
  const unitIds = [
    "rights-book-01",
    "rights-book-02",
    "rights-book-03",
    "rights-book-04",
    "rights-book-05"
  ];
  const unitLabels = [
    "02-01 制限行為能力者",
    "02-02 意思表示",
    "02-03 代理",
    "02-04 時効",
    "02-05 債務不履行・解除"
  ];
  const units = [];
  for (const id of unitIds) units.push(await textbookChapter(page, id));
  const transitions = [];

  await selectChapter(page, unitLabels[0]);
  for (let index = 0; index < units.length - 1; index += 1) {
    const chapter = units[index];
    const nextChapter = units[index + 1];
    await finishChapter(page, chapter);

    const nextButton = page.locator("#chapterNextButton");
    await nextButton.waitFor({ state: "visible" });
    assert.match(await nextButton.textContent(), new RegExp(`次の単元.*${unitLabels[index + 1]}`));
    assert.match(
      await page.locator(`[data-chapter-result="${chapter.id}"]`).textContent(),
      new RegExp(`読む＋読後問題.*${unitLabels[index + 1]}`, "s")
    );
    assert.deepEqual(dailyContract(await savedState(page)), dailyBefore);

    await nextButton.click();
    const state = await savedState(page);
    assert.equal(state.runMode, "chapter");
    assert.equal(state.chapterModeId, nextChapter.id);
    assert.deepEqual(dailyContract(state), dailyBefore);
    const renderedQuestion = await currentQuestion(page);
    assert.equal(renderedQuestion.id, nextChapter.ids[0]);
    transitions.push({
      from: chapter.id,
      to: nextChapter.id,
      firstQuestion: nextChapter.ids[0]
    });
  }

  return {
    transitions,
    fixedPlanPreserved: true
  };
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
    const reloadDesktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    reloadDesktop.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    reloadDesktop.on("pageerror", (error) => pageErrors.push(error.message));
    const reloadBoundaries = await auditReloadBoundaries(reloadDesktop, server.baseUrl);

    const nextUnitDesktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    nextUnitDesktop.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    nextUnitDesktop.on("pageerror", (error) => pageErrors.push(error.message));
    const foundationNextUnit = await auditFoundationNextUnit(nextUnitDesktop, server.baseUrl);

    const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    desktop.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    desktop.on("pageerror", (error) => pageErrors.push(error.message));
    await gotoFresh(desktop, server.baseUrl, "chapter-mode-desktop");
    const dailyBefore = dailyContract(await savedState(desktop));
    const chapter = await textbookChapter(desktop, "business-book-07");
    assert.equal(chapter.ids.length, 15);
    await selectChapter(desktop, "01-07 業務上の規制");
    const selected = await savedState(desktop);
    assert.equal(selected.runMode, "chapter");
    assert.equal(selected.chapterModeId, chapter.id);
    assert.deepEqual(dailyContract(selected), dailyBefore);
    await finishChapter(desktop, chapter);
    assert.match(await desktop.locator(`[data-chapter-result="${chapter.id}"]`).textContent(), /固定10問は変更していません/);
    const dailyAfter = dailyContract(await savedState(desktop));
    assert.deepEqual(dailyAfter, dailyBefore);
    await desktop.locator("#chapterRetryButton").click();
    assert.equal((await currentQuestion(desktop)).id, chapter.ids[0]);
    const retryState = await savedState(desktop);
    assert.equal(retryState.runMode, "chapter");
    assert.equal(retryState.chapterModeId, chapter.id);
    assert.equal(retryState.finished, false);
    assert.deepEqual(dailyContract(retryState), dailyBefore);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    mobile.on("pageerror", (error) => pageErrors.push(error.message));
    await gotoFresh(mobile, server.baseUrl, "chapter-mode-mobile");
    const mobileInitialLabel = await roundLabelLayout(mobile);
    assertRoundLabelSingleLine(mobileInitialLabel, "390px daily label");
    await mobile.setViewportSize({ width: 320, height: 844 });
    const narrowInitialLabel = await roundLabelLayout(mobile);
    assertRoundLabelSingleLine(narrowInitialLabel, "320px daily label");
    const narrowThemeLabel = await roundLabelLayout(mobile, "テーマ 15 / 15");
    assertRoundLabelSingleLine(narrowThemeLabel, "320px longest chapter label");
    const narrowSupplementalLabel = await roundLabelLayout(mobile, "第3分冊 補助 18 / 18");
    assert.ok(narrowSupplementalLabel, "320px supplemental label missing");
    assert.ok(narrowSupplementalLabel.lineCount <= 2, JSON.stringify(narrowSupplementalLabel));
    assert.ok(narrowSupplementalLabel.tagWidth >= 90, JSON.stringify(narrowSupplementalLabel));
    assert.ok(narrowSupplementalLabel.roundRight <= narrowSupplementalLabel.tagLeft);
    assert.ok(narrowSupplementalLabel.tagRight <= narrowSupplementalLabel.markLeft);
    assert.equal(narrowSupplementalLabel.overflow, 0);
    const narrowOverflow = await mobile.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
    );
    assert.equal(narrowOverflow, 0);
    await mobile.setViewportSize({ width: 390, height: 844 });
    const mobileDailyBefore = dailyContract(await savedState(mobile));
    const mobileChapter = await textbookChapter(mobile, "tax-other-book-02");
    await selectChapter(mobile, "04-02 不動産鑑定評価基準");
    const mobileUi = await chapterUi(mobile);
    const mobileChapterLabel = await roundLabelLayout(mobile);
    assertRoundLabelSingleLine(mobileChapterLabel, "390px chapter label");
    assert.equal(mobileUi.dailyScope, "business");
    assert.match(mobileUi.themeSummary, /法令・税その他・04-02 不動産鑑定評価基準/);
    assert.equal(mobileUi.routeContext, "日課: 宅建業法");
    assert.match(mobileUi.routeButton, /^日課:/);
    assert.match(mobileUi.routeUnitId, /^business-book-/);
    await finishChapter(mobile, mobileChapter, /法令・税その他の合格ロード/);
    assert.deepEqual(dailyContract(await savedState(mobile)), mobileDailyBefore);
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
      reloadBoundaries,
      foundationNextUnit,
      desktopChapter: { id: chapter.id, questions: chapter.ids.length },
      chapterRetry: chapter.ids[0],
      mobileChapter: { id: mobileChapter.id, questions: mobileChapter.ids.length },
      fixedPlanPreserved: true,
      roundLabels: {
        mobileDaily: mobileInitialLabel,
        narrowDaily: narrowInitialLabel,
        narrowTheme: narrowThemeLabel,
        narrowSupplemental: narrowSupplementalLabel,
        mobileChapter: mobileChapterLabel
      },
      narrowOverflow,
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
