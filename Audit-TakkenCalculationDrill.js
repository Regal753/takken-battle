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
  "calc-stamp-30000": 60000,
  "calc-coverage-600": 360,
  "calc-far-200": 1000,
  "calc-frontage-2": 2,
  "calc-national-land-2000": 2000,
  "calc-fixed-asset-1800": 252000,
  "calc-city-planning-1800": 54000,
  "calc-acquisition-tax-3000": 1200000,
  "calc-registration-preservation-1200": 48000,
  "calc-registration-transfer-1200": 240000,
  "calc-walk-1201": 16,
  "calc-walk-80": 1
};
const ordinaryLowPriceSaleIds = ["calc-sale-200", "calc-sale-300"];

const expectedUnits = {
  "calc-coverage-600": "㎡",
  "calc-far-200": "㎡",
  "calc-frontage-2": "m",
  "calc-national-land-2000": "㎡",
  "calc-walk-1201": "分",
  "calc-walk-80": "分"
};

if (!drill || drill.VERSION !== 1) issues.push("Calculation drill version must be 1.");
if (drill?.LEGAL_BASELINE !== "2026-04-01") issues.push("Legal baseline must be 2026-04-01.");
if (questions.length !== 35) issues.push(`Expected 35 questions, got ${questions.length}.`);
if (new Set(questions.map((item) => item.id)).size !== questions.length) issues.push("Question IDs must be unique.");
if (new Set(questions.map((item) => item.prompt)).size !== questions.length) issues.push("Question prompts must be unique.");

const sourceHosts = new Set();
questions.forEach((item) => {
  if (!Array.isArray(item.choices) || item.choices.length !== 4) {
    issues.push(`${item.id}: choices must have four entries.`);
    return;
  }
  if (new Set(item.choices).size !== 4 || item.choices.some((value) => !Number.isInteger(value) || value <= 0)) {
    issues.push(`${item.id}: choices must be unique positive integer amounts.`);
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
  if (!["円", "㎡", "m", "分"].includes(item.unit)) {
    issues.push(`${item.id}: supported unit is required.`);
  }
  if (expectedUnits[item.id] && item.unit !== expectedUnits[item.id]) {
    issues.push(`${item.id}: expected unit ${expectedUnits[item.id]}, got ${item.unit}.`);
  }
  if (!String(item.rounding || "").trim()) {
    issues.push(`${item.id}: rounding or boundary rule is required.`);
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

ordinaryLowPriceSaleIds.forEach((id) => {
  const item = questions.find((question) => question.id === id);
  if (!item) return;
  if (!/低廉な空家等の特例を適用しない通常の売買媒介/.test(item.prompt)) {
    issues.push(`${id}: low-price vacant-property exception is not excluded from the ordinary remuneration calculation.`);
  }
  if (!item.sources.includes("remunerationSale")) {
    issues.push(`${id}: direct remuneration notice source for sections 2 and 7 is missing.`);
  }
  if (!item.formula.some((step) => /特例を適用しない通常報酬/.test(step)) || !/特例上限330,000円/.test(item.trap)) {
    issues.push(`${id}: ordinary remuneration and the special ceiling are not contrasted in the explanation.`);
  }
});
if (!/第2・第7/.test(String(drill?.SOURCES?.remunerationSale?.label || ""))) {
  issues.push("remunerationSale: direct notice locator is missing.");
}

const requiredHosts = ["www.mlit.go.jp", "laws.e-gov.go.jp", "www.nta.go.jp"];
requiredHosts.forEach((host) => {
  if (!sourceHosts.has(host)) issues.push(`Required official source host missing: ${host}`);
});

const requiredCategories = [
  "建築基準法・建蔽率",
  "建築基準法・容積率",
  "建築基準法・接道",
  "国土利用計画法・届出面積",
  "固定資産税",
  "都市計画税",
  "不動産取得税",
  "登録免許税・保存登記",
  "登録免許税・移転登記",
  "不動産表示・徒歩時間"
];
const categories = new Set(questions.map((item) => item.category));
requiredCategories.forEach((category) => {
  if (!categories.has(category)) issues.push(`Required cross-subject category missing: ${category}`);
});
const requiredSourceKeys = ["building", "localTax", "registrationTax", "nationalLand", "display"];
requiredSourceKeys.forEach((key) => {
  if (!questions.some((item) => item.sources.includes(key))) issues.push(`Required cross-subject source coverage missing: ${key}`);
});

const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
if (!app.includes("const STATE_SCHEMA_VERSION = 12;")) issues.push("State schema version must protect guarantee-association history and confidence ordering from older clients while retaining objective understanding, calculation, practical drill, unit-route, full-score evidence, and multi-tab sync data.");
if (!app.includes("normalizeCalculationDrillState")) issues.push("Calculation save normalization is missing.");
if (!app.includes("drill.retryIds = addCalculationId")) issues.push("Wrong/uncertain retry queue is missing.");
if (!app.includes("function startCalculationDrill()")) issues.push("Calculation session restart must preserve history.");
if (!app.includes("function exitCalculationDrill()")) issues.push("Calculation completion exit is missing.");
if (!html.includes("id=\"calculationDrillPanel\"")) issues.push("Calculation drill panel is missing.");
if (!html.includes("id=\"todayCommandCalculationButton\"")) issues.push("Calculation drill quick entry is missing.");
if (!html.includes("id=\"calculationDrillExitButton\"")) issues.push("Calculation drill completion exit button is missing.");
if (!html.includes("calculation-drill.js?v=20260829-retention-v44-1-1a60cc2b7e90")) issues.push("Calculation data script is not loaded.");

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
  units: Object.fromEntries(
    [...new Set(questions.map((item) => item.unit))].sort().map((unit) => [
      unit,
      questions.filter((item) => item.unit === unit).length
    ])
  ),
  roundingRules: questions.filter((item) => String(item.rounding || "").trim()).length,
  crossSubjectQuestions: questions.filter((item) => requiredCategories.includes(item.category)).length,
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
