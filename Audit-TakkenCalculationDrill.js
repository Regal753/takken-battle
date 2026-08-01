"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;
const source = fs.readFileSync(path.join(root, "calculation-drill.js"), "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: "calculation-drill.js" });

const drill = context.window.TAKKEN_CALCULATION_DRILL;
const questions = drill?.QUESTIONS || [];
const issues = [];
const expectedAnswers = {
  "calc-sale-200": 110000,
  "calc-sale-300": 154000,
  "calc-sale-800": 330000,
  "calc-sale-2000": 726000,
  "calc-exchange-1500": 561000,
  "calc-agency-3000": 2112000,
  "calc-agency-remaining": 1412000,
  "calc-both-sides-2500": 1782000,
  "calc-lease-no-consent-8": 44000,
  "calc-lease-total-9": 99000,
  "calc-lease-consent-12": 132000,
  "calc-lease-agency-14": 154000,
  "calc-key-money-300": 154000,
  "calc-low-price-500": 330000,
  "calc-low-price-800": 330000,
  "calc-low-price-801": 330330,
  "calc-deposit-cap-4200": 8400000,
  "calc-damages-cap-2800": 5600000,
  "calc-penalty-remaining-2000": 2500000,
  "calc-protection-unfinished-3000": 1500000,
  "calc-protection-complete-6000": 6000000,
  "calc-stamp-4500": 10000,
  "calc-stamp-8000": 30000,
  "calc-stamp-30000": 60000
};

if (!drill || drill.VERSION !== 1) issues.push("Calculation drill version must be 1.");
if (drill?.LEGAL_BASELINE !== "2026-04-01") issues.push("Legal baseline must be 2026-04-01.");
if (questions.length !== 24) issues.push(`Expected 24 questions, got ${questions.length}.`);
if (new Set(questions.map((item) => item.id)).size !== questions.length) issues.push("Question IDs must be unique.");
if (new Set(questions.map((item) => item.prompt)).size !== questions.length) issues.push("Question prompts must be unique.");

const sourceHosts = new Set();
questions.forEach((item) => {
  if (!Array.isArray(item.choices) || item.choices.length !== 4) {
    issues.push(`${item.id}: choices must have four entries.`);
    return;
  }
  if (new Set(item.choices).size !== 4 || item.choices.some((value) => !Number.isInteger(value) || value <= 0)) {
    issues.push(`${item.id}: choices must be unique positive integer yen amounts.`);
  }
  if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer > 3) {
    issues.push(`${item.id}: answer index is invalid.`);
  }
  if (item.choices[item.answer] !== expectedAnswers[item.id]) {
    issues.push(`${item.id}: expected ${expectedAnswers[item.id]}, got ${item.choices[item.answer]}.`);
  }
  if (!Array.isArray(item.formula) || item.formula.length < 2 || item.formula.some((line) => !String(line).trim())) {
    issues.push(`${item.id}: visible formula steps are required.`);
  }
  if (!String(item.trap || "").trim()) issues.push(`${item.id}: trap explanation is required.`);
  if (!Array.isArray(item.sources) || !item.sources.length) {
    issues.push(`${item.id}: at least one official source is required.`);
  } else {
    item.sources.forEach((sourceKey) => {
      const sourceItem = drill.SOURCES[sourceKey];
      if (!sourceItem) {
        issues.push(`${item.id}: source key ${sourceKey} is missing.`);
      } else {
        sourceHosts.add(new URL(sourceItem.url).hostname);
      }
    });
  }
});

const requiredHosts = ["www.mlit.go.jp", "laws.e-gov.go.jp", "www.nta.go.jp"];
requiredHosts.forEach((host) => {
  if (!sourceHosts.has(host)) issues.push(`Required official source host missing: ${host}`);
});

const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
if (!app.includes("const STATE_SCHEMA_VERSION = 8;")) issues.push("State schema version must include objective understanding, calculation, practical drill, and unit-route data.");
if (!app.includes("normalizeCalculationDrillState")) issues.push("Calculation save normalization is missing.");
if (!app.includes("drill.retryIds = addCalculationId")) issues.push("Wrong/uncertain retry queue is missing.");
if (!html.includes("id=\"calculationDrillPanel\"")) issues.push("Calculation drill panel is missing.");
if (!html.includes("calculation-drill.js?v=20260802-understanding-v18")) issues.push("Calculation data script is not loaded.");

const report = {
  status: issues.length ? "error" : "ok",
  version: drill?.VERSION,
  legalBaseline: drill?.LEGAL_BASELINE,
  questions: questions.length,
  categories: Object.fromEntries(
    [...new Set(questions.map((item) => item.category))].map((category) => [
      category,
      questions.filter((item) => item.category === category).length
    ])
  ),
  officialSourceHosts: [...sourceHosts].sort(),
  visibleFormulaSteps: questions.reduce((sum, item) => sum + item.formula.length, 0),
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
