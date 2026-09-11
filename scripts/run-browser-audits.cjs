"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const ROOT = path.resolve(__dirname, "..");
const EXPECTED_AUDIT_COUNT = 26;
const SHARDS = Object.freeze(["a", "b"]);
// Preserve the complete former CI command list and the new tax audit. Round-robin assignment spreads
// expensive interaction and exam/save audits across independent runners.
const AUDITS = Object.freeze([
  "Audit-TakkenBusinessMasteryUi.cjs",
  "Audit-TakkenStatementReviewUi.cjs",
  "Audit-TakkenBalancedExplanationUi.cjs",
  "Audit-TakkenBusinessKnockUi.cjs",
  "Audit-TakkenChoicePremiseUi.cjs",
  "Audit-TakkenBusinessArchiveUi.cjs",
  "Audit-TakkenGuaranteeAssociationDrillUi.cjs",
  "Audit-TakkenFullExamUi.cjs",
  "Audit-TakkenPassReadinessUi.cjs",
  "Audit-TakkenFinalStretchUi.cjs",
  "Audit-TakkenSubjectSprintUi.cjs",
  "Audit-TakkenRestrictionsAuthoredUi.cjs",
  "Audit-TakkenTaxAuthoredUi.cjs",
  "Audit-TakkenRestrictionMasteryUi.cjs",
  "Audit-TakkenCalculationDrillUi.cjs",
  "Audit-TakkenPassPlanUi.cjs",
  "Audit-TakkenPassLoopV12Ui.cjs",
  "Audit-TakkenRetentionSpacingUi.cjs",
  "Audit-TakkenPwaOffline.cjs",
  "Audit-TakkenPwaUpgrade.cjs",
  "Audit-TakkenFutureSaveUi.cjs",
  "Audit-TakkenSaveLeaseRaceUi.cjs",
  "Audit-TakkenAccessibilityUi.cjs",
  "Audit-TakkenQuestCoreUi.cjs",
  "Audit-TakkenReiwaExamUi.cjs",
  "Audit-TakkenCaseExamUi.cjs"
]);

function validateRegistry(audits = AUDITS, fileExists = file => fs.existsSync(path.join(ROOT, file))) {
  assert.ok(Array.isArray(audits) && audits.length > 0, "browser audit registry must not be empty");
  assert.equal(audits.length, EXPECTED_AUDIT_COUNT, "browser audit registry count changed without updating the coverage contract");
  assert.equal(new Set(audits).size, audits.length, "duplicate browser audit in registry");
  for (const file of audits) {
    assert.match(file, /^Audit-Takken[A-Za-z0-9]+\.cjs$/, "browser audit must be a repository-root script filename");
    assert.equal(fileExists(file), true, `missing browser audit: ${file}`);
  }
  return audits;
}

function selectShard(shard, audits = AUDITS) {
  assert.ok(SHARDS.includes(shard), `unknown browser audit shard: ${shard}`);
  validateRegistry(audits);
  const selected = audits.filter((_, index) => index % SHARDS.length === SHARDS.indexOf(shard));
  assert.ok(selected.length > 0, `empty browser audit shard: ${shard}`);
  return selected;
}

function parseArgs(args) {
  assert.ok(args.length === 2 && args[0] === "--shard" && SHARDS.includes(args[1]),
    "usage: node scripts/run-browser-audits.cjs --shard <a|b>");
  return args[1];
}

function executeAudit(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, file)], {
      cwd: ROOT, env: process.env, stdio: "inherit", shell: false, windowsHide: true
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

async function runAudits(audits, { execute = executeAudit, log = console.log, now = () => performance.now() } = {}) {
  assert.ok(Array.isArray(audits) && audits.length > 0, "refusing an empty browser audit run");
  for (const file of audits) {
    const started = now();
    log(`BROWSER_AUDIT BEGIN ${file}`);
    let result;
    try {
      result = await execute(file);
    } catch (error) {
      log(`BROWSER_AUDIT END ${file} elapsed_seconds=${((now() - started) / 1000).toFixed(3)} spawn_error=true`);
      throw error;
    }
    const elapsed = ((now() - started) / 1000).toFixed(3);
    log(`BROWSER_AUDIT END ${file} elapsed_seconds=${elapsed} exit_code=${result.code} signal=${result.signal || "none"}`);
    if (result.code !== 0 || result.signal) {
      const error = new Error(`browser audit failed: ${file} (exit=${result.code}, signal=${result.signal || "none"})`);
      error.exitCode = Number.isInteger(result.code) && result.code > 0 && result.code <= 255 ? result.code : 1;
      throw error;
    }
  }
  return { passed: audits.length };
}

async function main(args = process.argv.slice(2)) {
  const shard = parseArgs(args);
  const selected = selectShard(shard);
  console.log(JSON.stringify({ browserAuditShard: shard, selected: selected.length, total: AUDITS.length, audits: selected }));
  const result = await runAudits(selected);
  console.log(JSON.stringify({ status: "ok", browserAuditShard: shard, ...result }));
}

module.exports = { AUDITS, SHARDS, EXPECTED_AUDIT_COUNT, validateRegistry, selectShard, parseArgs, runAudits, main };
if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || String(error));
    process.exitCode = error.exitCode || 1;
  });
}
