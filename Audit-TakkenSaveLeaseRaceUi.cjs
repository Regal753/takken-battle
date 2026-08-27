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
    url.searchParams.set("review", "save-lease-race");
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    const fixture = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-save-lease-race") &&
        !candidate.includes("backup") && !candidate.includes("previous") &&
        !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
      );
      const base = JSON.parse(localStorage.getItem(key));
      const remote = {
        ...base,
        marked: { ...(base.marked || {}), q1: true },
        syncMeta: {
          ...(base.syncMeta || {}),
          revision: Number(base.syncMeta?.revision || 0) + 1,
          updatedAt: "2026-08-28T12:00:00.000Z",
          writerId: "remote-tab"
        }
      };
      return { key, remoteRaw: JSON.stringify(remote) };
    });

    // Simulate a second tab completing its save exactly after the local tab
    // acquires the save lease. The fixed save path must then re-read this raw
    // before reconciliation; the historical read-before-lease order loses q1.
    await page.evaluate(({ key, remoteRaw }) => {
      const originalGet = Storage.prototype.getItem;
      const originalSet = Storage.prototype.setItem;
      let injected = false;
      Storage.prototype.getItem = function patchedGetItem(name) {
        if (!injected && name === `${key}-save-lease`) {
          injected = true;
          originalSet.call(this, key, remoteRaw);
        }
        return originalGet.call(this, name);
      };
    }, fixture);
    await page.locator("#markButton").click();
    await page.waitForTimeout(100);
    const result = await page.evaluate((key) => {
      const state = JSON.parse(localStorage.getItem(key) || "{}");
      return {
        marked: state.marked || {},
        transferStatus: document.querySelector("#saveTransferStatus")?.textContent || "",
        protectionStatus: document.querySelector("#saveProtectionStatus")?.textContent || ""
      };
    }, fixture.key);
    assert.equal(result.marked.q1, true, "remote-tab mark must survive the lease/read interleaving");
    assert.ok(
      Object.keys(result.marked).some((id) => id !== "q1"),
      `local-tab mark was lost: ${JSON.stringify(result.marked)}`
    );
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log("Audit-TakkenSaveLeaseRaceUi: OK (fresh post-lease read preserves both tabs)");
  } finally {
    await browser.close();
    await local.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
