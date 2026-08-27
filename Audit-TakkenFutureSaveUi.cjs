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
        stateSchemaVersion: 13,
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
    assert.equal(result.storedSchema, 13);
    assert.deepEqual(result.sentinel, { retained: true, bytes: "do-not-downgrade" });
    assert.equal(result.bodyReadOnly, true);
    assert.match(`${result.protection} ${result.transfer}`, /新しい保存形式v13|読み取り専用/);
    assert.ok(result.controls > 20);
    assert.deepEqual(result.enabledControlIds, [], `enabled read-only controls: ${result.enabledControlIds.join(", ")}`);
    assert.equal(result.exportDisabled, true);
    assert.equal(result.overflow, 0);

    await page.keyboard.press("1");
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), fixture.key), fixture.raw);

    // Keep this runtime open, then emulate a newer tab writing a future
    // schema. The same page receives no storage event for its own write, so
    // the next normal save action must fail closed before it can downcast.
    const stalePage = await context.newPage();
    stalePage.on("pageerror", (error) => errors.push(error.message));
    stalePage.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const staleUrl = new URL(local.baseUrl);
    staleUrl.searchParams.set("review", "future-save-stale-open-tab");
    await stalePage.goto(staleUrl.toString(), { waitUntil: "networkidle" });
    const staleFixture = await stalePage.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        candidate.includes("future-save-stale-open") &&
        !candidate.includes("backup") && !candidate.includes("previous") &&
        !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
      );
      const future = {
        ...JSON.parse(localStorage.getItem(key)),
        stateSchemaVersion: 13,
        futureSchemaSentinel: { retained: true, bytes: "stale-open-tab-must-not-downcast" }
      };
      const raw = JSON.stringify(future);
      localStorage.setItem(key, raw);
      return { key, raw };
    });
    await stalePage.locator("#markButton").click();
    await stalePage.waitForTimeout(50);
    const stale = await stalePage.evaluate(({ key, raw }) => ({
      rawUnchanged: localStorage.getItem(key) === raw,
      storedSchema: JSON.parse(localStorage.getItem(key)).stateSchemaVersion,
      sentinel: JSON.parse(localStorage.getItem(key)).futureSchemaSentinel,
      readOnly: document.body.classList.contains("is-save-read-only"),
      notice: `${document.querySelector("#saveProtectionStatus")?.textContent || ""} ${document.querySelector("#saveTransferStatus")?.textContent || ""}`,
      enabledControls: [...document.querySelectorAll("button, input, select, textarea")]
        .filter((control) => !control.closest("#pwaUpdateNotice") && !control.disabled)
        .map((control) => control.id || control.outerHTML.slice(0, 80))
    }), staleFixture);
    assert.equal(stale.rawUnchanged, true, "stale tab must not rewrite the future-schema primary raw");
    assert.equal(stale.storedSchema, 13);
    assert.deepEqual(stale.sentinel, { retained: true, bytes: "stale-open-tab-must-not-downcast" });
    assert.equal(stale.readOnly, true);
    assert.match(stale.notice, /別タブで新しい保存形式v13|読み取り専用/);
    assert.deepEqual(stale.enabledControls, []);
    await stalePage.close();

    // A package with valid integrity can still carry a state schema that this
    // runtime does not understand. Reject it before confirmation/backup so an
    // older runtime cannot silently normalize away newer fields.
    const futureImportPage = await context.newPage();
    futureImportPage.on("pageerror", (error) => errors.push(error.message));
    futureImportPage.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    let fileImportDialogs = 0;
    futureImportPage.on("dialog", async (dialog) => {
      fileImportDialogs += 1;
      await dialog.dismiss();
    });
    const futureImportUrl = new URL(local.baseUrl);
    futureImportUrl.searchParams.set("review", "future-file-import");
    await futureImportPage.goto(futureImportUrl.toString(), { waitUntil: "networkidle" });
    const futureFilePackage = await futureImportPage.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        candidate.includes("future-file-import") &&
        !candidate.includes("backup") && !candidate.includes("previous") &&
        !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
      );
      const raw = localStorage.getItem(key);
      const current = JSON.parse(raw);
      const future = {
        ...current,
        stateSchemaVersion: Number(current.stateSchemaVersion) + 1,
        futureSchemaSentinel: { retained: true, source: "file-import" }
      };
      const savePackage = window.TAKKEN_SAVE_TRANSFER.createSavePackage(future);
      return { key, raw, json: JSON.stringify(savePackage), schema: future.stateSchemaVersion };
    });
    await futureImportPage.locator("#saveImportInput").setInputFiles({
      name: "future-schema-save.json",
      mimeType: "application/json",
      buffer: Buffer.from(futureFilePackage.json, "utf8")
    });
    await futureImportPage.waitForFunction(() =>
      (document.querySelector("#saveTransferStatus")?.textContent || "").trim().length > 0
    );
    const futureFileImport = await futureImportPage.evaluate(({ key, raw }) => ({
      rawUnchanged: localStorage.getItem(key) === raw,
      beforeImportKeys: Object.keys(localStorage).filter((candidate) => candidate.startsWith(`${key}-before-import-`)),
      status: document.querySelector("#saveTransferStatus")?.textContent || ""
    }), futureFilePackage);
    assert.equal(fileImportDialogs, 0, "future-schema file import must fail before confirmation");
    assert.equal(futureFileImport.rawUnchanged, true, "future-schema file import must not overwrite the current primary raw");
    assert.deepEqual(futureFileImport.beforeImportKeys, [], "future-schema file import must not create a before-import backup");
    assert.match(futureFileImport.status, new RegExp(`新しい保存形式v${futureFilePackage.schema}`));
    await futureImportPage.close();

    const futureHashPage = await context.newPage();
    futureHashPage.on("pageerror", (error) => errors.push(error.message));
    futureHashPage.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    let hashImportDialogs = 0;
    futureHashPage.on("dialog", async (dialog) => {
      hashImportDialogs += 1;
      await dialog.dismiss();
    });
    const futureHashUrl = new URL(local.baseUrl);
    futureHashUrl.searchParams.set("review", "future-hash-import");
    await futureHashPage.goto(futureHashUrl.toString(), { waitUntil: "networkidle" });
    const futureHashPackage = await futureHashPage.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        candidate.includes("future-hash-import") &&
        !candidate.includes("backup") && !candidate.includes("previous") &&
        !candidate.includes("corrupt") && !candidate.endsWith("event-outbox")
      );
      const raw = localStorage.getItem(key);
      const current = JSON.parse(raw);
      const future = {
        ...current,
        stateSchemaVersion: Number(current.stateSchemaVersion) + 1,
        futureSchemaSentinel: { retained: true, source: "hash-import" }
      };
      const savePackage = window.TAKKEN_SAVE_TRANSFER.createSavePackage(future);
      return {
        key,
        raw,
        token: window.TAKKEN_SAVE_TRANSFER.encodePackage(savePackage),
        schema: future.stateSchemaVersion
      };
    });
    await futureHashPage.close();
    // Seed a fresh browser context before the app bootstraps. This keeps the
    // primary raw under test separate from any normal-navigation write that a
    // page transition itself may perform.
    const futureHashImportContext = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
    await futureHashImportContext.addInitScript(({ key, raw }) => {
      localStorage.setItem(key, raw);
      const originalReplaceState = window.history.replaceState.bind(window.history);
      window.history.replaceState = function (...args) {
        // consumeSaveTransferHash clears the fragment immediately before it
        // validates/imports. Snapshot the actual current raw at that boundary
        // so harmless startup normalization is not confused with an import
        // overwrite.
        if (window.location.hash.includes("save=")) {
          window.__futureSchemaHashPrimaryBeforeImport = localStorage.getItem(key);
          queueMicrotask(() => {
            window.__futureSchemaHashPrimaryAfterImport = localStorage.getItem(key);
          });
        }
        return originalReplaceState(...args);
      };
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (String(input).includes("study-state/study_progress.json")) {
          return Promise.resolve(new Response("", { status: 404 }));
        }
        return nativeFetch(input, init);
      };
    }, { key: futureHashPackage.key, raw: futureHashPackage.raw });
    const guardedHashPage = await futureHashImportContext.newPage();
    guardedHashPage.on("pageerror", (error) => errors.push(error.message));
    guardedHashPage.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    hashImportDialogs = 0;
    guardedHashPage.on("dialog", async (dialog) => {
      hashImportDialogs += 1;
      await dialog.dismiss();
    });
    const futureHashImportUrl = new URL(futureHashUrl);
    futureHashImportUrl.hash = new URLSearchParams({ save: futureHashPackage.token }).toString();
    await guardedHashPage.goto(futureHashImportUrl.toString(), { waitUntil: "networkidle" });
    await guardedHashPage.waitForFunction(() =>
      (document.querySelector("#saveTransferStatus")?.textContent || "").trim().length > 0
    );
    const futureHashImport = await guardedHashPage.evaluate(({ key }) => ({
      rawUnchanged: window.__futureSchemaHashPrimaryAfterImport === window.__futureSchemaHashPrimaryBeforeImport,
      primaryBeforeImportCaptured: typeof window.__futureSchemaHashPrimaryBeforeImport === "string",
      primaryAfterImportCaptured: typeof window.__futureSchemaHashPrimaryAfterImport === "string",
      beforeImportKeys: Object.keys(localStorage).filter((candidate) => candidate.startsWith(`${key}-before-import-`)),
      status: document.querySelector("#saveTransferStatus")?.textContent || "",
      hashCleared: window.location.hash === ""
    }), futureHashPackage);
    assert.equal(futureHashImport.primaryBeforeImportCaptured, true, "hash import must capture the primary raw immediately before import handling");
    assert.equal(futureHashImport.primaryAfterImportCaptured, true, "hash import must capture the primary raw immediately after import handling");
    assert.match(futureHashImport.status, new RegExp(`新しい保存形式v${futureHashPackage.schema}`));
    assert.equal(hashImportDialogs, 0, "future-schema hash import must fail before confirmation");
    assert.equal(futureHashImport.rawUnchanged, true, "future-schema hash import must not overwrite the current primary raw");
    assert.deepEqual(futureHashImport.beforeImportKeys, [], "future-schema hash import must not create a before-import backup");
    assert.equal(futureHashImport.hashCleared, true, "failed import links must still be removed from the address bar");
    await futureHashImportContext.close();

    const recoveryFromV36Page = await context.newPage();
    recoveryFromV36Page.on("pageerror", (error) => errors.push(error.message));
    recoveryFromV36Page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const recoveryFromV36Url = new URL(local.baseUrl);
    recoveryFromV36Url.searchParams.set("review", "v36-guarantee-recovery");
    await recoveryFromV36Page.goto(recoveryFromV36Url.toString(), { waitUntil: "networkidle" });
    await recoveryFromV36Page.locator("#guaranteeSpecialStart").click();
    await recoveryFromV36Page.locator(".practical-drill-choice").first().click();
    const v36DowncastFixture = await recoveryFromV36Page.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        candidate.includes("v36-guarantee-recovery")
      );
      const current = JSON.parse(localStorage.getItem(key));
      const practical = current.practicalDrill;
      const downcast = {
        ...current,
        stateSchemaVersion: 10,
        // This mirrors the v36 practical-drill normalizer: it does not know
        // ga001..ga020 or the special bank/session, but preserves unknown
        // top-level fields through its state spread.
        practicalDrill: {
          ...practical,
          bankId: "legacy-practical",
          bankVersion: 1,
          planMode: "legacy",
          stage: "idle",
          scope: "all",
          unitId: "",
          sessionIds: [],
          queue: [],
          position: 0,
          currentAttempt: null,
          retryIds: [],
          history: Object.fromEntries(Object.entries(practical.history || {})
            .filter(([id]) => !/^ga\d{3}$/.test(id)))
        }
      };
      const raw = JSON.stringify(downcast);
      localStorage.setItem(key, raw);
      return {
        key,
        raw,
        recovery: current.guaranteeAssociationRecovery,
        session: practical,
        history: Object.fromEntries(Object.entries(practical.history || {})
          .filter(([id]) => /^ga\d{3}$/.test(id)))
      };
    });
    await recoveryFromV36Page.reload({ waitUntil: "networkidle" });
    const recoveredFromV36 = await recoveryFromV36Page.evaluate(({ key }) => {
      const state = JSON.parse(localStorage.getItem(key));
      return {
        schema: state.stateSchemaVersion,
        recovery: state.guaranteeAssociationRecovery,
        practical: state.practicalDrill
      };
    }, v36DowncastFixture);
    assert.equal(recoveredFromV36.schema, 12);
    assert.equal(recoveredFromV36.practical.bankId, v36DowncastFixture.session.bankId);
    assert.equal(recoveredFromV36.practical.stage, v36DowncastFixture.session.stage);
    assert.deepEqual(recoveredFromV36.practical.queue, v36DowncastFixture.session.queue);
    assert.equal(recoveredFromV36.practical.position, v36DowncastFixture.session.position);
    assert.deepEqual(recoveredFromV36.practical.currentAttempt, v36DowncastFixture.session.currentAttempt);
    assert.deepEqual(
      Object.fromEntries(Object.entries(recoveredFromV36.practical.history || {}).filter(([id]) => /^ga\d{3}$/.test(id))),
      v36DowncastFixture.history
    );
    assert.deepEqual(recoveredFromV36.recovery.history, v36DowncastFixture.history);
    await recoveryFromV36Page.close();

    const recoveryFromV11Page = await context.newPage();
    recoveryFromV11Page.on("pageerror", (error) => errors.push(error.message));
    recoveryFromV11Page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const recoveryFromV11Url = new URL(local.baseUrl);
    recoveryFromV11Url.searchParams.set("review", "v11-guarantee-live-wins");
    await recoveryFromV11Page.goto(recoveryFromV11Url.toString(), { waitUntil: "networkidle" });
    await recoveryFromV11Page.locator("#guaranteeSpecialStart").click();
    const v11Fixture = await recoveryFromV11Page.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("takken-battle-study-clean-v2-hard-review-") &&
        candidate.includes("v11-guarantee-live-wins")
      );
      const current = JSON.parse(localStorage.getItem(key));
      const activeSession = current.practicalDrill;
      const questionId = activeSession.queue[activeSession.position];
      const liveHistory = {
        attempts: 4, correct: 4, wrong: 0, uncertain: 0,
        lastSelected: 1, lastCorrect: true, lastConfidence: "confident",
        lastAnsweredAt: "2026-08-26T06:30:00+09:00",
        mistakeTags: {}, lastMistakeTags: []
      };
      const staleRecoveryHistory = {
        attempts: 1, correct: 0, wrong: 1, uncertain: 0,
        lastSelected: 0, lastCorrect: false, lastConfidence: "wrong",
        lastAnsweredAt: "2026-08-25T06:30:00+09:00",
        mistakeTags: { timing: 1 }, lastMistakeTags: ["timing"]
      };
      const v11 = {
        ...current,
        stateSchemaVersion: 11,
        practicalDrill: {
          ...activeSession,
          stage: "idle",
          sessionIds: [], queue: [], position: 0, currentAttempt: null, retryIds: [],
          history: { ...(activeSession.history || {}), [questionId]: liveHistory }
        },
        guaranteeAssociationRecovery: {
          version: 1,
          history: { [questionId]: staleRecoveryHistory },
          activeSession: {
            ...activeSession,
            history: { [questionId]: staleRecoveryHistory }
          }
        }
      };
      localStorage.setItem(key, JSON.stringify(v11));
      return { key, questionId, liveHistory };
    });
    await recoveryFromV11Page.reload({ waitUntil: "networkidle" });
    const recoveredFromV11 = await recoveryFromV11Page.evaluate(({ key, questionId }) => {
      const state = JSON.parse(localStorage.getItem(key));
      return {
        schema: state.stateSchemaVersion,
        stage: state.practicalDrill?.stage,
        queue: state.practicalDrill?.queue,
        retryIds: state.practicalDrill?.retryIds,
        history: state.practicalDrill?.history?.[questionId],
        recovery: state.guaranteeAssociationRecovery
      };
    }, v11Fixture);
    assert.equal(recoveredFromV11.schema, 12);
    assert.equal(recoveredFromV11.stage, "idle", "v11 must not reopen a stale guarantee recovery session");
    assert.deepEqual(recoveredFromV11.queue, []);
    assert.deepEqual(recoveredFromV11.retryIds, []);
    assert.deepEqual({
      attempts: recoveredFromV11.history?.attempts,
      correct: recoveredFromV11.history?.correct,
      wrong: recoveredFromV11.history?.wrong,
      lastCorrect: recoveredFromV11.history?.lastCorrect,
      lastConfidence: recoveredFromV11.history?.lastConfidence,
      lastAnsweredAt: recoveredFromV11.history?.lastAnsweredAt
    }, {
      attempts: 4,
      correct: 4,
      wrong: 0,
      lastCorrect: true,
      lastConfidence: "confident",
      lastAnsweredAt: v11Fixture.liveHistory.lastAnsweredAt
    });
    assert.equal(recoveredFromV11.recovery.activeSession, null);
    assert.equal(recoveredFromV11.recovery.history[v11Fixture.questionId].lastCorrect, true);
    await recoveryFromV11Page.close();

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
        stateSchemaVersion: 13,
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
    assert.match(recovery.notice, /直前セーブは新しい保存形式v13|読み取り専用/);
    assert.deepEqual(recovery.enabledControls, []);
    assert.equal(recovery.overflow, 0);
    await recoveryPage.close();

    const migrationPage = await context.newPage();
    migrationPage.on("pageerror", (error) => errors.push(error.message));
    migrationPage.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const migrationUrl = new URL(local.baseUrl);
    migrationUrl.searchParams.set("review", "v36-to-v37-save-upgrade");
    await migrationPage.goto(migrationUrl.toString(), { waitUntil: "networkidle" });
    const migrationFixture = await migrationPage.evaluate(() => {
      const key = "takken-battle-study-clean-v2-hard-review-v36-to-v37-save-upgrade";
      const current = JSON.parse(localStorage.getItem(key));
      const questionId = window.TAKKEN_BUSINESS_FULLSCORE_BANK.QUESTIONS[0].id;
      const legacy = {
        ...current,
        stateSchemaVersion: 10,
        practicalDrill: {
          ...current.practicalDrill,
          bankId: "business-fullscore",
          bankVersion: 1,
          history: {
            ...(current.practicalDrill?.history || {}),
            [questionId]: {
              attempts: 3, correct: 2, wrong: 1, uncertain: 1,
              lastSelected: 2, lastCorrect: false, lastConfidence: "wrong",
              lastAnsweredAt: "2026-08-25T10:00:00+09:00",
              mistakeTags: { timing: 1 }, lastMistakeTags: ["timing"]
            }
          }
        }
      };
      const raw = JSON.stringify(legacy);
      localStorage.setItem(key, raw);
      return { key, raw, questionId };
    });
    await migrationPage.reload({ waitUntil: "networkidle" });
    const migration = await migrationPage.evaluate(({ key, questionId }) => {
      const state = JSON.parse(localStorage.getItem(key));
      const backup = localStorage.getItem(`${key}-before-upgrade-v10-to-v12`);
      return {
        schema: state.stateSchemaVersion,
        migratedHistory: state.practicalDrill?.history?.[questionId],
        backup,
        notice: document.querySelector("#saveTransferStatus")?.textContent || ""
      };
    }, migrationFixture);
    assert.equal(migration.schema, 12);
    assert.deepEqual(migration.migratedHistory && {
      attempts: migration.migratedHistory.attempts,
      correct: migration.migratedHistory.correct,
      wrong: migration.migratedHistory.wrong,
      uncertain: migration.migratedHistory.uncertain,
      lastSelected: migration.migratedHistory.lastSelected,
      lastCorrect: migration.migratedHistory.lastCorrect,
      lastConfidence: migration.migratedHistory.lastConfidence,
      lastAnsweredAt: migration.migratedHistory.lastAnsweredAt,
      mistakeTags: migration.migratedHistory.mistakeTags,
      lastMistakeTags: migration.migratedHistory.lastMistakeTags
    }, {
      attempts: 3, correct: 2, wrong: 1, uncertain: 1,
      lastSelected: 2, lastCorrect: false, lastConfidence: "wrong",
      lastAnsweredAt: "2026-08-25T10:00:00+09:00",
      mistakeTags: { timing: 1 }, lastMistakeTags: ["timing"]
    });
    assert.equal(migration.backup, migrationFixture.raw, "v36 state must be retained before the v37 schema upgrade");
    assert.match(migration.notice, /更新前のセーブを自動退避してから引き継ぎました/);
    await migrationPage.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      status: "ok",
      schema: 12,
      rawUnchanged: true,
      controlsDisabled: result.controls,
      corruptPrimaryFuturePreviousReadOnly: true,
      v36ToV37HistoryRetained: true,
      v11LiveHistoryWinsRecovery: true,
      overflow: 0
    }));
  } finally {
    await context.close();
    await browser.close();
    await local.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
