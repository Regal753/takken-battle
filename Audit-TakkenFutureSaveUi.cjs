#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const chromePath = process.env.TAKKEN_CHROME_PATH || "";

function startStaticServer(root) {
  const safeRoot = path.resolve(root);
  const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
      .replace(/^\/$/, "/index.html").replace(/^\/+/, "");
    const target = path.resolve(safeRoot, relative);
    if (!target.startsWith(`${safeRoot}${path.sep}`)) return response.writeHead(403).end();
    fs.readFile(target, (error, body) => {
      if (error) return response.writeHead(404).end();
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

(async () => {
  const local = await startStaticServer(process.cwd());
  const browser = await chromium.launch(chromePath
    ? { executablePath: chromePath, headless: true }
    : { channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  try {
    const url = new URL(local.baseUrl);
    url.searchParams.set("review", "future-save-ui");
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    const fixture = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        !candidate.includes("backup") && !candidate.includes("previous") &&
        !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
      );
      const current = JSON.parse(localStorage.getItem(key));
      const future = {
        ...current,
        stateSchemaVersion: 11,
        futureSchemaSentinel: { retained: true, bytes: "do-not-downgrade" }
      };
      const raw = JSON.stringify(future);
      localStorage.setItem(key, raw);
      return { key, raw };
    });

    await page.reload({ waitUntil: "networkidle" });
    const result = await page.evaluate(({ key, raw }) => {
      const appControls = [...document.querySelectorAll("button, input, select, textarea")]
        .filter((control) => !control.closest("#pwaUpdateNotice"));
      return {
        rawUnchanged: localStorage.getItem(key) === raw,
        storedSchema: JSON.parse(localStorage.getItem(key)).stateSchemaVersion,
        sentinel: JSON.parse(localStorage.getItem(key)).futureSchemaSentinel,
        bodyReadOnly: document.body.classList.contains("is-save-read-only"),
        protection: document.querySelector("#saveProtectionStatus")?.textContent || "",
        transfer: document.querySelector("#saveTransferStatus")?.textContent || "",
        controls: appControls.length,
        enabledControls: appControls.filter((control) => !control.disabled).length,
        enabledControlIds: appControls.filter((control) => !control.disabled).map((control) => control.id || control.outerHTML.slice(0, 80)),
        exportDisabled: document.querySelector("#saveExportButton")?.disabled,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    }, fixture);
    assert.equal(result.rawUnchanged, true);
    assert.equal(result.storedSchema, 11);
    assert.deepEqual(result.sentinel, { retained: true, bytes: "do-not-downgrade" });
    assert.equal(result.bodyReadOnly, true);
    assert.match(`${result.protection} ${result.transfer}`, /新しい保存形式v11|読み取り専用/);
    assert.ok(result.controls > 20);
    assert.deepEqual(result.enabledControlIds, [], `enabled read-only controls: ${result.enabledControlIds.join(", ")}`);
    assert.equal(result.exportDisabled, true);
    assert.equal(result.overflow, 0);

    await page.keyboard.press("1");
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), fixture.key), fixture.raw);

    const recoveryPage = await context.newPage();
    recoveryPage.on("pageerror", (error) => errors.push(error.message));
    recoveryPage.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const recoveryUrl = new URL(local.baseUrl);
    recoveryUrl.searchParams.set("review", "future-previous-ui");
    await recoveryPage.goto(recoveryUrl.toString(), { waitUntil: "networkidle" });
    const recoveryFixture = await recoveryPage.evaluate(() => {
      const key = "takken-battle-study-clean-v2-hard-review-future-previous-ui";
      const current = JSON.parse(localStorage.getItem(key));
      const previous = {
        ...current,
        stateSchemaVersion: 11,
        futureSchemaSentinel: { retained: true, bytes: "future-previous-must-survive" }
      };
      const previousRaw = JSON.stringify(previous);
      const primaryRaw = "{broken-future-primary";
      localStorage.setItem(`${key}-previous`, previousRaw);
      localStorage.setItem(key, primaryRaw);
      return { key, previousRaw, primaryRaw };
    });
    await recoveryPage.reload({ waitUntil: "networkidle" });
    const recovery = await recoveryPage.evaluate(({ key, previousRaw, primaryRaw }) => {
      const enabled = [...document.querySelectorAll("button, input, select, textarea")]
        .filter((control) => !control.closest("#pwaUpdateNotice") && !control.disabled);
      const corruptCopies = Object.keys(localStorage)
        .filter((candidate) => candidate.startsWith(`${key}-corrupt-`))
        .map((candidate) => localStorage.getItem(candidate));
      return {
        primaryUnchanged: localStorage.getItem(key) === primaryRaw,
        previousUnchanged: localStorage.getItem(`${key}-previous`) === previousRaw,
        corruptCopyRetained: corruptCopies.includes(primaryRaw),
        readOnly: document.body.classList.contains("is-save-read-only"),
        notice: `${document.querySelector("#saveProtectionStatus")?.textContent || ""} ${document.querySelector("#saveTransferStatus")?.textContent || ""}`,
        enabledControls: enabled.map((control) => control.id || control.outerHTML.slice(0, 80)),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    }, recoveryFixture);
    assert.equal(recovery.primaryUnchanged, true);
    assert.equal(recovery.previousUnchanged, true);
    assert.equal(recovery.corruptCopyRetained, true);
    assert.equal(recovery.readOnly, true);
    assert.match(recovery.notice, /直前セーブは新しい保存形式v11|読み取り専用/);
    assert.deepEqual(recovery.enabledControls, []);
    assert.equal(recovery.overflow, 0);
    await recoveryPage.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      status: "ok",
      schema: 11,
      rawUnchanged: true,
      controlsDisabled: result.controls,
      corruptPrimaryFuturePreviousReadOnly: true,
      overflow: 0
    }));
  } finally {
    await context.close();
    await browser.close();
    await local.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
