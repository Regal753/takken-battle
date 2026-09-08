"use strict";

const assert = require("node:assert/strict");
const bank = require("./restrictions-supplement-bank.js");

const expectedIds = Array.from({ length: 14 }, (_, index) =>
  `rs${String(index + 1).padStart(3, "0")}`
);
const allowedHosts = new Set(["laws.e-gov.go.jp", "www.mlit.go.jp"]);
const golden = Object.freeze({
  rs001: [/完了届/, /検査済証/, /公告前/],
  rs002: [/43条/, /新築・改築・用途変更/],
  rs003: [/2階以上/, /200平方メートル超/, /令和7年4月/],
  rs004: [/大規模修繕・模様替/, /着工前/],
  rs005: [/代表者/, /国籍/, /過半数/, /利用目的/],
  rs006: [/権利取得者/, /利用目的/, /勧告/],
  rs007: [/3条/, /4条/, /5条/, /市街化区域/],
  rs008: [/効力/, /相続/, /一時転用/],
  rs009: [/公告日の翌日/, /仮換地/, /所有権/],
  rs010: [/減歩/, /清算金/, /照応/],
  rs011: [/用途・目的/, /二つの規制区域/, /土石の堆積/],
  rs012: [/周辺住民/, /全員の同意/, /中間検査/, /安全な状態/],
  rs013: [/60日前/, /遅滞なく/, /93条/, /96条/],
  rs014: [/道路占用許可/, /道路使用許可/, /道路管理者/, /警察/]
});

function normalize(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/[\s\u3000、。・「」『』（）()【】［］,.!?！？:：;；]/g, "");
}

function verdict(value) {
  return String(value || "").match(/[○×]/)?.[0] || "";
}

function bigrams(value) {
  const text = normalize(value);
  return new Set(Array.from({ length: Math.max(1, text.length - 1) }, (_, index) =>
    text.length < 2 ? text : text.slice(index, index + 2)
  ));
}

function jaccard(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / Math.max(1, new Set([...a, ...b]).size);
}

assert.equal(bank.VERSION, 1);
assert.equal(bank.LEGAL_BASELINE, "2026-04-01");
assert.deepEqual(bank.QUESTIONS.map((question) => question.id), expectedIds);
assert.equal(new Set(bank.QUESTIONS.map((question) => question.id)).size, 14);
assert.deepEqual(
  Object.fromEntries([...new Set(bank.QUESTIONS.map((question) => question.format))].sort().map((format) => [
    format,
    bank.QUESTIONS.filter((question) => question.format === format).length
  ])),
  { "個数問題": 7, "単一選択": 7 }
);
assert.deepEqual(
  Object.fromEntries([...new Set(bank.QUESTIONS.map((question) => question.sourceAnchor))].map((anchor) => [
    anchor,
    bank.QUESTIONS.filter((question) => question.sourceAnchor === anchor).length
  ])),
  {
    "都市計画法": 2,
    "建築基準法": 2,
    "国土利用計画法": 2,
    "農地法": 2,
    "土地区画整理法": 2,
    "宅地造成及び特定盛土等規制法": 2,
    "文化財保護法": 1,
    "道路法": 1
  }
);

for (const question of bank.QUESTIONS) {
  assert.equal(question.sectionId, "restrictions", `${question.id}: section`);
  assert.equal(question.legalBaseline, "2026-04-01", `${question.id}: legal baseline`);
  assert.equal(question.verifiedAt, "2026-09-09", `${question.id}: verification date`);
  assert.equal(question.choices.length, 4, `${question.id}: choices`);
  assert.equal(question.choiceExplanations.length, 4, `${question.id}: explanations`);
  assert.ok(question.sourceLocator.length >= 8, `${question.id}: pinpoint source locator`);
  assert.ok(Array.isArray(question.sourceUrls) && question.sourceUrls.length >= 1, `${question.id}: source list`);
  assert.equal(question.sourceUrls[0], question.sourceUrl, `${question.id}: primary source`);
  question.sourceUrls.forEach((url) =>
    assert.ok(allowedHosts.has(new URL(url).hostname), `${question.id}: official source host`)
  );
  const verdicts = question.choiceExplanations.map(verdict);
  assert.ok(verdicts.every(Boolean), `${question.id}: verdict on every fact`);
  if (question.format === "単一選択") {
    const asksIncorrect = question.text.includes("誤っている");
    assert.equal(verdicts[question.answer], asksIncorrect ? "×" : "○", `${question.id}: selected verdict`);
    assert.equal(verdicts.filter((value) => value === (asksIncorrect ? "×" : "○")).length, 1, `${question.id}: unique answer`);
  } else {
    assert.equal(verdicts.filter((value) => value === "○").length, question.answer + 1, `${question.id}: count answer`);
  }
  const evidenceText = [question.text, question.explain, question.trap, question.memoryRule, question.sourceLocator, ...question.choiceExplanations].join(" ");
  golden[question.id].forEach((pattern) => assert.match(evidenceText, pattern, `${question.id}: golden rule ${pattern}`));
}

assert.equal(bank.QUESTIONS_BY_ID.rs014.sourceUrls.length, 2, "rs014: both road-law sources");
assert.match(bank.QUESTIONS_BY_ID.rs014.sourceUrls[0], /327AC1000000180/, "rs014: Roads Act source");
assert.match(bank.QUESTIONS_BY_ID.rs014.sourceUrls[1], /335AC0000000105/, "rs014: Road Traffic Act source");
assert.equal(bank.QUESTIONS_BY_ID.rs011.sourceUrls.length, 2, "rs011: portal and governing statute");
assert.match(bank.QUESTIONS_BY_ID.rs011.sourceUrls[1], /336AC0000000191/, "rs011: fill-regulation statute source");

for (let left = 0; left < bank.QUESTIONS.length; left += 1) {
  for (let right = left + 1; right < bank.QUESTIONS.length; right += 1) {
    const similarity = jaccard(bank.QUESTIONS[left].text.split("\n")[0], bank.QUESTIONS[right].text.split("\n")[0]);
    assert.ok(similarity < 0.95, `${bank.QUESTIONS[left].id}/${bank.QUESTIONS[right].id}: duplicate prompt ${similarity.toFixed(3)}`);
  }
}

console.log("Takken restrictions supplement audit passed: 14 independent scenarios / 8 source anchors / 7 single + 7 count / official 2026 sources.");
