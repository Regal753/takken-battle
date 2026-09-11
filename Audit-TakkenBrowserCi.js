"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const runner = require("./scripts/run-browser-audits.cjs");

// Independent snapshot of the prior 25 browser commands plus the new tax audit.
const required = [
  "Audit-TakkenBusinessMasteryUi.cjs", "Audit-TakkenStatementReviewUi.cjs",
  "Audit-TakkenBalancedExplanationUi.cjs", "Audit-TakkenBusinessKnockUi.cjs",
  "Audit-TakkenChoicePremiseUi.cjs", "Audit-TakkenBusinessArchiveUi.cjs",
  "Audit-TakkenGuaranteeAssociationDrillUi.cjs", "Audit-TakkenFullExamUi.cjs",
  "Audit-TakkenPassReadinessUi.cjs", "Audit-TakkenFinalStretchUi.cjs",
  "Audit-TakkenSubjectSprintUi.cjs", "Audit-TakkenRestrictionsAuthoredUi.cjs",
  "Audit-TakkenTaxAuthoredUi.cjs",
  "Audit-TakkenRestrictionMasteryUi.cjs", "Audit-TakkenCalculationDrillUi.cjs",
  "Audit-TakkenPassPlanUi.cjs", "Audit-TakkenPassLoopV12Ui.cjs",
  "Audit-TakkenRetentionSpacingUi.cjs", "Audit-TakkenPwaOffline.cjs",
  "Audit-TakkenPwaUpgrade.cjs", "Audit-TakkenFutureSaveUi.cjs",
  "Audit-TakkenSaveLeaseRaceUi.cjs", "Audit-TakkenAccessibilityUi.cjs",
  "Audit-TakkenQuestCoreUi.cjs", "Audit-TakkenReiwaExamUi.cjs",
  "Audit-TakkenCaseExamUi.cjs"
];

(async () => {
  assert.equal(runner.EXPECTED_AUDIT_COUNT, 26);
  assert.deepEqual([...runner.AUDITS].sort(), [...required].sort(), "the complete prior browser suite must be retained");
  runner.validateRegistry();
  const shards = runner.SHARDS.map(shard => runner.selectShard(shard));
  assert.deepEqual(shards.map(shard => shard.length), [13, 13]);
  assert.deepEqual(shards.flat().sort(), [...required].sort(), "matrix shards must have no missing or duplicated audits");
  assert.equal(new Set(shards.flat()).size, 26);
  assert.throws(() => runner.selectShard("unknown"), /unknown/);
  assert.throws(() => runner.selectShard("a", []), /empty/);
  assert.throws(() => runner.validateRegistry(required.slice(1)), /count/);
  assert.throws(() => runner.validateRegistry([...required.slice(1), required[1]]), /duplicate/);
  assert.throws(() => runner.validateRegistry(["../outside.cjs", ...required.slice(1)], () => true), /filename/);
  assert.throws(() => runner.validateRegistry(required, () => false), /missing/);
  for (const args of [[], ["--shard", "unknown"], ["--shard", "a", "extra"]]) assert.throws(() => runner.parseArgs(args), /usage/);
  assert.equal(runner.parseArgs(["--shard", "b"]), "b");
  const invalid = spawnSync(process.execPath, [path.join(__dirname, "scripts/run-browser-audits.cjs"), "--shard", "unknown"], { encoding: "utf8" });
  assert.notEqual(invalid.status, 0, "invalid shard CLI must fail closed");
  assert.doesNotMatch(invalid.stdout, /BROWSER_AUDIT BEGIN/, "invalid shard must not execute any browser audit");

  const logs = [], called = [];
  const clockValues = [1000, 1250, 2000, 2500];
  await assert.rejects(() => runner.runAudits(required.slice(0, 3), {
    execute: async file => { called.push(file); return { code: called.length === 2 ? 7 : 0, signal: null }; },
    log: line => logs.push(line), now: () => clockValues.shift()
  }), error => error.exitCode === 7);
  assert.deepEqual(called, required.slice(0, 2), "failure must stop this shard before later audits");
  assert.equal(logs.filter(line => line.includes(" BEGIN ")).length, 2);
  assert.equal(logs.filter(line => line.includes(" END ")).length, 2);
  assert.match(logs[3], /elapsed_seconds=0\.500 exit_code=7/);
  await assert.rejects(() => runner.runAudits([], { execute: () => { throw new Error("must not run"); } }), /empty/);
  await assert.rejects(() => runner.runAudits(required.slice(0, 1), {
    execute: async () => ({ code: null, signal: "SIGTERM" }), log: () => {}
  }), error => error.exitCode === 1);
  const spawnLogs = [];
  await assert.rejects(() => runner.runAudits(required.slice(0, 1), {
    execute: async () => { throw new Error("spawn failed"); }, log: line => spawnLogs.push(line)
  }), /spawn failed/);
  assert.match(spawnLogs[1], / END .*spawn_error=true/);

  const workflow = fs.readFileSync(path.join(__dirname, ".github/workflows/ci.yml"), "utf8").replace(/\r/g, "");
  const browser = workflow.split("  browser:\n")[1].split("  validate:\n")[0];
  const validate = workflow.split("  validate:\n")[1];
  assert.match(browser, /timeout-minutes: 15\n/, "keep the original per-job deadline");
  assert.match(browser, /fail-fast: false\n/, "one failed shard must not cancel the other evidence stream");
  assert.match(browser, /shard: \[a, b\]/);
  assert.match(browser, /node scripts\/run-browser-audits\.cjs --shard/);
  assert.match(browser, /TAKKEN_AUDIT_SHARD: \$\{\{ matrix\.shard \}\}/);
  assert.match(validate, /needs:\n\s+- static\n\s+- browser\n/);
  assert.ok(validate.includes("${{ needs.browser.result }}"));
  assert.ok(validate.includes('test "$BROWSER_RESULT" = "success"'));
  assert.ok(validate.includes('test "$STATIC_RESULT" = "success"'));
  console.log(JSON.stringify({ status: "ok", audits: 26, shards: shards.map(shard => shard.length), missing: 0, duplicates: 0, invalidShardRejected: true, emptyRejected: true, failureExitPreserved: true, matrixFailFast: false, timeoutMinutes: 15 }));
})().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });
