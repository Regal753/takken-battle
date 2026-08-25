"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.window = {};
require("./exam-blueprint.js");
require("./exam-question-core.js");
require("./exam-questions-rights.js");
require("./exam-questions-restrictions.js");
require("./exam-questions-tax-other.js");
require("./exam-questions-business.js");

const supplement = require("./business-fullscore-supplement.js");
const baseBank = require("./business-fullscore-bank.js");

const expectedAnchorFields = Object.freeze([
  "diagnosticTags",
  "id",
  "prompt",
  "reasons",
  "sourceLocator",
  "sourceUrl",
  "statements",
  "tag",
  "truths",
  "unitId",
  "verifiedAt"
]);
const expectedFactFields = Object.freeze([
  "anchorId",
  "diagnosticTags",
  "key",
  "prompt",
  "reason",
  "sourceLocator",
  "sourceUrl",
  "statement",
  "statementIndex",
  "tag",
  "truth",
  "unitId",
  "verifiedAt"
]);
const expectedUnitAllocation = Object.freeze({
  "business-book-01": 1,
  "business-book-02": 2,
  "business-book-03": 1,
  "business-book-04": 1,
  "business-book-05": 1,
  "business-book-06": 1,
  "business-book-07": 5,
  "business-book-08": 2,
  "business-book-09": 1,
  "business-book-10": 2,
  "business-book-11": 1
});
const allowedDiagnosticTags = new Set([
  "subject",
  "timing",
  "counterparty",
  "number",
  "principle-exception",
  "article-35",
  "article-37",
  "eight-restrictions",
  "transaction-type",
  "amendment"
]);
const officialHosts = new Set([
  "laws.e-gov.go.jp",
  "www.mlit.go.jp"
]);
const requiredNumericTerms = Object.freeze({
  bs002: ["5年", "30日", "90日"],
  bs003: ["2024年5月25日", "2025年4月1日", "2025年1月1日"],
  bs004: ["2年", "6か月", "1年", "5年", "2週間", "30日"],
  bs005: ["1000万円", "500万円", "6か月", "3か月"],
  bs006: ["60万円", "30万円", "2週間", "1週間"],
  bs007: ["10年間", "2025年4月1日", "1人", "10日前"],
  bs009: ["5日", "7日", "1週間", "2週間", "3か月", "2025年1月1日"],
  bs012: ["20%"],
  bs013: ["5%", "10%", "1000万円", "8日"],
  bs014: ["1.1か月分", "0.55か月分", "2倍"],
  bs015: ["1年", "2年", "200万円", "3年", "300万円"],
  bs016: ["7年間"],
  bs017: ["1年", "10年間", "3月31日", "3週間", "50日"],
  bs018: ["2022年5月18日"]
});

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedStatement(value) {
  return cleanText(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[、。・「」『』（）()\s]/g, "");
}

function anchorBlob(anchor) {
  return [
    anchor.prompt,
    ...anchor.statements,
    ...anchor.reasons,
    anchor.sourceLocator
  ].join(" ");
}

assert.equal(supplement.VERSION, 2, "supplement version");
assert.equal(supplement.LEGAL_BASELINE, "2026-04-01", "legal baseline");
assert.strictEqual(
  window.TAKKEN_BUSINESS_FULLSCORE_SUPPLEMENT,
  supplement,
  "browser and CommonJS APIs must be identical"
);
assert.ok(Object.isFrozen(supplement), "API must be frozen");
assert.equal(supplement.ANCHORS.length, 18, "18 supplement anchors");
assert.equal(supplement.FACTS.length, 72, "72 supplement facts");
assert.equal(Object.keys(supplement.ANCHORS_BY_ID).length, 18, "18 anchor lookups");
assert.equal(Object.keys(supplement.FACTS_BY_KEY).length, 72, "72 fact lookups");

const expectedAnchorIds = Array.from(
  { length: 18 },
  (_, index) => `bs${String(index + 1).padStart(3, "0")}`
);
assert.deepEqual(
  supplement.ANCHORS.map((anchor) => anchor.id),
  expectedAnchorIds,
  "stable sequential anchor IDs"
);
assert.deepEqual(
  Object.fromEntries(Object.keys(expectedUnitAllocation).map((unitId) => [
    unitId,
    supplement.ANCHORS.filter((anchor) => anchor.unitId === unitId).length
  ])),
  expectedUnitAllocation,
  "unit allocation"
);

const observedTags = new Set();
for (const anchor of supplement.ANCHORS) {
  assert.deepEqual(Object.keys(anchor).sort(), expectedAnchorFields, `${anchor.id}: exact anchor schema`);
  assert.strictEqual(supplement.ANCHORS_BY_ID[anchor.id], anchor, `${anchor.id}: anchor lookup identity`);
  assert.ok(Object.isFrozen(anchor), `${anchor.id}: frozen anchor`);
  assert.ok(Object.isFrozen(anchor.statements), `${anchor.id}: frozen statements`);
  assert.ok(Object.isFrozen(anchor.truths), `${anchor.id}: frozen truths`);
  assert.ok(Object.isFrozen(anchor.reasons), `${anchor.id}: frozen reasons`);
  assert.ok(Object.isFrozen(anchor.diagnosticTags), `${anchor.id}: frozen diagnostics`);
  assert.ok(Object.hasOwn(expectedUnitAllocation, anchor.unitId), `${anchor.id}: configured unit`);
  assert.ok(cleanText(anchor.tag), `${anchor.id}: tag`);
  assert.ok(cleanText(anchor.prompt), `${anchor.id}: prompt`);
  assert.equal(anchor.statements.length, 4, `${anchor.id}: four statements`);
  assert.equal(anchor.truths.length, 4, `${anchor.id}: four truths`);
  assert.equal(anchor.reasons.length, 4, `${anchor.id}: four reasons`);
  assert.ok(anchor.truths.includes(true), `${anchor.id}: at least one true fact`);
  assert.ok(anchor.truths.includes(false), `${anchor.id}: at least one false fact`);
  anchor.truths.forEach((truth, index) => {
    assert.equal(typeof truth, "boolean", `${anchor.id}:${index}: boolean truth`);
    assert.ok(cleanText(anchor.statements[index]).length >= 20, `${anchor.id}:${index}: substantive statement`);
    assert.ok(cleanText(anchor.reasons[index]).length >= 20, `${anchor.id}:${index}: substantive reason`);
    assert.notEqual(
      normalizedStatement(anchor.statements[index]),
      normalizedStatement(anchor.reasons[index]),
      `${anchor.id}:${index}: reason must explain rather than repeat`
    );
  });
  assert.match(anchor.verifiedAt, /^\d{4}-\d{2}-\d{2}$/, `${anchor.id}: verification date format`);
  assert.equal(anchor.verifiedAt, "2026-08-15", `${anchor.id}: current verification date`);
  assert.ok(cleanText(anchor.sourceLocator).length >= 12, `${anchor.id}: source locator`);
  assert.match(anchor.sourceLocator, /法|条|令|告示|省令/, `${anchor.id}: legal locator`);
  const source = new URL(anchor.sourceUrl);
  assert.equal(source.protocol, "https:", `${anchor.id}: HTTPS source`);
  assert.ok(officialHosts.has(source.hostname), `${anchor.id}: official primary-source host`);
  if (source.hostname === "laws.e-gov.go.jp") {
    assert.equal(
      source.searchParams.get("occasion_date"),
      supplement.LEGAL_BASELINE.replaceAll("-", ""),
      `${anchor.id}: e-Gov source pinned to legal baseline`
    );
  }
  assert.ok(anchor.diagnosticTags.length >= 1, `${anchor.id}: diagnostics`);
  anchor.diagnosticTags.forEach((tag) => {
    assert.ok(allowedDiagnosticTags.has(tag), `${anchor.id}: allowed diagnostic ${tag}`);
    observedTags.add(tag);
  });
}
assert.deepEqual(observedTags, allowedDiagnosticTags, "all diagnostic dimensions represented");

const expectedFactKeys = expectedAnchorIds.flatMap((anchorId) =>
  [0, 1, 2, 3].map((index) => `${anchorId}:${index}`)
);
assert.deepEqual(
  supplement.FACTS.map((fact) => fact.key),
  expectedFactKeys,
  "stable fact keys"
);
assert.equal(new Set(expectedFactKeys).size, 72, "72 unique expected keys");

for (const fact of supplement.FACTS) {
  assert.deepEqual(Object.keys(fact).sort(), expectedFactFields, `${fact.key}: exact fact schema`);
  assert.strictEqual(supplement.FACTS_BY_KEY[fact.key], fact, `${fact.key}: fact lookup identity`);
  assert.ok(Object.isFrozen(fact), `${fact.key}: frozen fact`);
  const anchor = supplement.ANCHORS_BY_ID[fact.anchorId];
  assert.ok(anchor, `${fact.key}: source anchor`);
  assert.ok(Number.isInteger(fact.statementIndex), `${fact.key}: integer statement index`);
  assert.ok(fact.statementIndex >= 0 && fact.statementIndex < 4, `${fact.key}: statement index range`);
  assert.equal(fact.key, `${fact.anchorId}:${fact.statementIndex}`, `${fact.key}: key construction`);
  assert.equal(fact.unitId, anchor.unitId, `${fact.key}: unit trace`);
  assert.equal(fact.tag, anchor.tag, `${fact.key}: tag trace`);
  assert.equal(fact.prompt, anchor.prompt, `${fact.key}: prompt trace`);
  assert.equal(fact.statement, anchor.statements[fact.statementIndex], `${fact.key}: statement trace`);
  assert.equal(fact.truth, anchor.truths[fact.statementIndex], `${fact.key}: truth trace`);
  assert.equal(fact.reason, anchor.reasons[fact.statementIndex], `${fact.key}: reason trace`);
  assert.equal(fact.sourceUrl, anchor.sourceUrl, `${fact.key}: URL trace`);
  assert.equal(fact.sourceLocator, anchor.sourceLocator, `${fact.key}: locator trace`);
  assert.equal(fact.verifiedAt, anchor.verifiedAt, `${fact.key}: date trace`);
  assert.strictEqual(fact.diagnosticTags, anchor.diagnosticTags, `${fact.key}: diagnostics trace`);
}

const normalizedFacts = supplement.FACTS.map((fact) => normalizedStatement(fact.statement));
assert.equal(new Set(normalizedFacts).size, 72, "duplicate0: all 72 propositions must be unique");
assert.equal(
  new Set(supplement.ANCHORS.map((anchor) => normalizedStatement(anchor.prompt))).size,
  18,
  "all anchor prompts must be unique"
);

for (const [anchorId, terms] of Object.entries(requiredNumericTerms)) {
  const blob = anchorBlob(supplement.ANCHORS_BY_ID[anchorId]);
  terms.forEach((term) => assert.ok(blob.includes(term), `${anchorId}: required numeric term ${term}`));
}

const guaranteeAssociation = supplement.ANCHORS_BY_ID.bs006;
assert.match(
  guaranteeAssociation.statements[2],
  /保証協会は還付に係る通知書の送付を受けた日から2週間以内.*社員は保証協会の通知を受けた日から2週間以内/,
  "guarantee-association replenishment and member reimbursement must name their distinct notice recipients"
);
assert.match(guaranteeAssociation.reasons[2], /保証協会弁済業務保証金規則1条/, "association replenishment trigger must cite the joint rule");
assert.match(guaranteeAssociation.sourceLocator, /保証協会弁済業務保証金規則1条/, "bs006 source locator must include the exact replenishment trigger rule");

const amendment = supplement.ANCHORS_BY_ID.bs003;
assert.deepEqual(amendment.truths, [true, false, true, false], "2024/2025 amendment truth pattern");
assert.match(amendment.statements[0], /都道府県知事を経由せず.*地方整備局等へ直接申請/, "direct minister-license application");
assert.match(amendment.reasons[1], /知事免許・取引士手続.*順次運用/, "eMLIT is not a nationwide all-procedure mandate");
assert.match(amendment.statements[2], /添付書類が再編.*氏名、住所、電話番号.*連絡先を記載する書面が追加/, "2025 contact-details attachment");
assert.match(amendment.reasons[2], /施行規則1条の2第1項8号.*略歴書には住所・電話番号・生年月日の欄が残る/, "current resume fields retained");
assert.doesNotMatch(anchorBlob(amendment), /略歴書から.*(?:住所|電話番号|生年月日).*削除/, "false resume-field deletion must not return");
assert.match(amendment.reasons[3], /2025年1月1日施行/, "REINS status effective date");

const employeeAndSigns = supplement.ANCHORS_BY_ID.bs007;
assert.match(employeeAndSigns.reasons[0], /性別・生年月日.*10年間保存/, "2025 employee-roster rule");
assert.match(employeeAndSigns.statements[3], /専任宅建士の氏名欄を削除.*代表者名.*人数/, "2025 sign fields");

const articles35 = supplement.ANCHORS_BY_ID.bs010;
assert.deepEqual(articles35.truths, [true, false, true, false], "article 35 truth pattern");
assert.match(articles35.reasons[1], /説明と取引士証提示を不要.*35条書面の交付.*残す/, "business-to-business article 35 rule");

const articles37 = supplement.ANCHORS_BY_ID.bs011;
assert.deepEqual(articles37.truths, [true, false, true, false], "article 37 truth pattern");
assert.match(articles37.statements[0], /自ら当事者.*相手方.*代理.*代理依頼者.*媒介.*各当事者/, "article 37 recipients");

const coolingOff = supplement.ANCHORS_BY_ID.bs013;
assert.deepEqual(coolingOff.truths, [true, false, true, false], "deposit-protection/cooling-off truth pattern");
assert.match(coolingOff.reasons[0], /5%以下と1000万円以下の両方/, "unfinished-property conjunction");
assert.match(coolingOff.reasons[1], /10%以下かつ1000万円以下/, "finished-property conjunction");
assert.match(coolingOff.reasons[2], /8日経過.*発送時/, "cooling-off period and dispatch effect");
assert.match(coolingOff.reasons[3], /引渡しを受け、かつ、代金全額を支払った/, "cooling-off completion condition");
assert.doesNotMatch(anchorBlob(coolingOff), /履行/, "cooling-off must not use performance-start as an end condition");

const multipleBrokerRemuneration = supplement.ANCHORS_BY_ID.bs014;
assert.match(multipleBrokerRemuneration.prompt, /同一依頼者に複数業者/, "multiple-broker scope must name the same client");
assert.match(
  multipleBrokerRemuneration.statements[3],
  /同一の依頼者（例：売主）.*その依頼者から受領する総額/,
  "multiple-broker false proposition must distinguish one client from the transaction as a whole"
);
assert.match(
  multipleBrokerRemuneration.reasons[3],
  /同一の依頼者（例：売主）.*総額.*告示第二の上限.*売主側・買主側.*依頼者が別.*それぞれ上限/,
  "multiple-broker reason must distinguish same-client aggregation from separate seller/buyer principals"
);

const discipline = supplement.ANCHORS_BY_ID.bs015;
assert.match(discipline.reasons[0], /最長1年.*業務地知事.*免許取消し.*免許権者/, "disciplinary jurisdiction and duration");
assert.match(discipline.reasons[3], /3年以下の拘禁刑.*300万円以下の罰金.*併科/, "current custodial-penalty terminology and quantum");

const aml = supplement.ANCHORS_BY_ID.bs016;
assert.deepEqual(aml.truths, [true, false, true, false], "AML truth pattern");
assert.match(aml.reasons[2], /7年間保存.*疑わしい取引.*速やかな届出/, "AML records and reporting");
assert.match(aml.reasons[3], /顧客の同意は要件ではなく.*漏らす行為を禁止/, "AML non-tipping rule");

const housingDefects = supplement.ANCHORS_BY_ID.bs017;
assert.match(housingDefects.reasons[0], /未入居.*工事完了から1年以内/, "new-house definition");
assert.match(housingDefects.reasons[1], /構造耐力上主要な部分.*雨水の浸入を防止する部分/, "ten-year covered parts");
assert.match(housingDefects.reasons[2], /3月31日.*3週間以内.*10年間/, "security baseline and filing window");
assert.match(housingDefects.reasons[3], /50日を経過した日以後/, "new-contract restriction timing");

const electronicDocuments = supplement.ANCHORS_BY_ID.bs018;
assert.deepEqual(electronicDocuments.truths, [true, false, true, false], "electronic-document amendment truth pattern");
assert.match(electronicDocuments.statements[0], /35条書面や37条書面を電磁的方法で提供/, "electronic delivery is directly tested");
assert.match(electronicDocuments.statements[1], /記名押印が必要/, "historical seal requirement is directly rejected");
assert.match(electronicDocuments.reasons[2], /記名.*押印は不要/, "current signature and seal rule");

const moduleText = fs.readFileSync(
  path.join(__dirname, "business-fullscore-supplement.js"),
  "utf8"
);
const bannedOldPenalty = ["懲", "役"].join("");
const bannedCoolingShortcut = ["履行着手で", "クーリングオフ終了"].join("");
const vaguePeriod = ["一定", "期間"].join("");
const wrongResumeLabel = ["様式第2号", "の略歴書"].join("");
assert.ok(!moduleText.includes(bannedOldPenalty), "obsolete custodial-penalty term must not remain");
assert.ok(!moduleText.includes(bannedCoolingShortcut), "obsolete cooling-off shortcut must not remain");
assert.ok(!moduleText.includes(vaguePeriod), "numeric periods must not be replaced by vague wording");
assert.ok(!moduleText.includes(wrongResumeLabel), "the career-history form must not be mislabeled as the resume");

assert.equal(baseBank.BASE_FACT_KEYS.length, 176, "176 base facts remain available");
assert.equal(baseBank.SUPPLEMENT_FACT_KEYS.length, 72, "72 supplement facts are connected");
assert.equal(baseBank.FACT_KEYS.length, 248, "176 + 72 = 248 unique source facts");
assert.deepEqual(
  [...baseBank.SUPPLEMENT_FACT_KEYS].sort(),
  [...expectedFactKeys].sort(),
  "full-score bank consumes every supplement fact key"
);
assert.equal(new Set(baseBank.FACT_KEYS).size, 248, "combined source fact keys are unique");

console.log("Takken Business Full Score Supplement audit passed: 18 anchors / 72 unique facts / 248 combined facts / duplicate0.");
