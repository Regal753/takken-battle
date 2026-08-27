#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

let baseUrl = process.env.TAKKEN_BASE_URL || "";
const chromePath = process.env.TAKKEN_CHROME_PATH || (
  process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "/usr/bin/google-chrome"
);
const storageIdFor = (namespace) =>
  `takken-battle-study-clean-v2-hard-review-${namespace}`;

function startStaticServer() {
  const root = path.resolve(__dirname);
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".webp": "image/webp"
  };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`) && target !== path.join(root, "index.html")) {
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

function fixture(clearAtHistory) {
  const firstAt = "2026-08-26T14:59:00.000Z";
  const lastAt = "2026-08-26T15:01:00.000Z";
  const stats = {
    attempts: 2,
    correct: 2,
    wrong: 0,
    lastStep: 2,
    lastAnsweredAt: lastAt,
    lastCorrectAt: lastAt,
    correctDayKeys: ["2026-08-26", "2026-08-27"],
    clearDayKeys: ["2026-08-26", "2026-08-27"],
    lastClearAt: lastAt,
    lastConfidence: "clear",
    lastConfidenceAt: lastAt,
    lastConfidenceDayKey: "2026-08-27"
  };
  if (clearAtHistory !== undefined) stats.clearAtHistory = clearAtHistory;
  return {
    stateSchemaVersion: 12,
    examContentVersion: 4,
    studyScope: "all",
    attempts: 2,
    correct: 2,
    step: 2,
    questionStats: { b001: stats }
  };
}

async function readRetention(browser, name, state) {
  const namespace = `spacing-${name}-${Date.now().toString(36)}`.slice(0, 24);
  const storageId = storageIdFor(namespace);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await context.addInitScript(({ id, saved }) => {
    localStorage.setItem(id, JSON.stringify(saved));
  }, { id: storageId, saved: state });
  await page.goto(`${baseUrl}?review=${namespace}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => /^定着\d+\//.test(
    document.querySelector("#chapterProgressText")?.textContent || ""
  ));
  const snapshot = await page.evaluate((id) => ({
    progress: document.querySelector("#chapterProgressText")?.textContent || "",
    today: document.querySelector("#todayLabel")?.textContent || "",
    stats: JSON.parse(localStorage.getItem(id) || "{}").questionStats?.b001 || {},
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth)
  }), storageId);
  await context.close();
  assert.deepEqual(errors, [], `${name}: browser errors`);
  assert.equal(snapshot.overflow, 0, `${name}: mobile horizontal overflow`);
  return snapshot;
}

async function main() {
  const server = baseUrl ? null : await startStaticServer();
  if (server) baseUrl = server.baseUrl;
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const midnightBoundary = await readRetention(browser, "boundary", fixture([
      "2026-08-26T14:59:00.000Z",
      "2026-08-26T15:01:00.000Z"
    ]));
    assert.match(midnightBoundary.progress, /^定着0\//,
      `two minutes across JST midnight must not count as retained: ${JSON.stringify(midnightBoundary)}`);

    const spacedRecall = await readRetention(browser, "spaced", fixture([
      "2026-08-26T02:00:00.000Z",
      "2026-08-26T15:00:00.000Z"
    ]));
    assert.match(spacedRecall.progress, /^定着1\//,
      `a separate-day recall at least 12 hours later must count as retained: ${JSON.stringify(spacedRecall)}`);

    const legacySave = await readRetention(browser, "legacy", fixture(undefined));
    assert.match(legacySave.progress, /^定着1\//,
      `pre-v40 saves without timestamp evidence must keep their established retention status: ${JSON.stringify(legacySave)}`);

    process.stdout.write(`${JSON.stringify({
      status: "ok",
      minimumIntervalHours: 12,
      midnightBoundary: midnightBoundary.progress,
      spacedRecall: spacedRecall.progress,
      legacyCompatibility: legacySave.progress
    })}\n`);
  } finally {
    await browser.close();
    if (server) await server.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
