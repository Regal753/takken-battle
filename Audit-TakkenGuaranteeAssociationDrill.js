"use strict";

const assert = require("node:assert/strict");
const drill = require("./guarantee-association-drill.js");
const required = ["1,000万円", "500万円", "60万円", "30万円", "保証協会", "供託所", "社員となろうとする日まで", "新設の日から2週間", "受領日から1週間", "二以上", "宅建業者以外", "社員となる前", "2,000万円", "認証", "3通", "通知書の送付を受けた日", "通知を受けた日から2週間", "社員資格を失う", "資格喪失から1週間", "公示の日から2週間", "6か月", "特別弁済業務保証金分担金", "加入前／新設2週／協会1週／喪失1週"];
const corpus = drill.QUESTIONS.map((q) => JSON.stringify(q).toLowerCase()).join("\n");
assert.equal(drill.LEGAL_BASELINE, "2026-04-01");
assert.equal(drill.VERIFIED_AT, "2026-08-25");
assert.equal(drill.QUESTIONS.length, 20);
assert.deepEqual(drill.QUESTIONS.map((q) => q.id), Array.from({ length: 20 }, (_, i) => `ga${String(i + 1).padStart(3, "0")}`));
assert.ok(Object.isFrozen(drill.QUESTIONS));
for (const question of drill.QUESTIONS) {
  assert.ok(Object.isFrozen(question), `${question.id}: frozen`);
  assert.equal(question.choices.length, 4, `${question.id}: four choices`);
  assert.equal(question.sourceFacts.length, 4, `${question.id}: four source facts`);
  assert.equal(question.choiceExplanations.length, 4, `${question.id}: four explanations`);
  assert.ok(question.explain && question.trap && question.memoryRule, `${question.id}: learning loop`);
  question.sourceFacts.forEach((item, index) => {
    assert.ok(item.reason && item.sourceLocator && /^https:\/\/laws\.e-gov\.go\.jp\//.test(item.sourceUrl), `${question.id}/${index}: reason and primary source`);
    assert.ok(Array.isArray(item.sourceUrls) && item.sourceUrls.length >= 1, `${question.id}/${index}: source URL set`);
    assert.ok(item.sourceUrls.every((url) => /^https:\/\/laws\.e-gov\.go\.jp\//.test(url)), `${question.id}/${index}: primary source URL set`);
    assert.equal(typeof item.truth, "boolean", `${question.id}/${index}: truth`);
  });
  const one = drill.presentQuestion(question.id, "morning");
  const two = drill.presentQuestion(question.id, "evening");
  assert.equal(one.id, question.id); assert.equal(two.id, question.id);
  assert.equal(one.choices[one.answer], question.choices[question.answer], `${question.id}: answer semantic identity`);
  assert.notDeepEqual(one.presentationOrder, two.presentationOrder, `${question.id}: deterministic position changes`);
}
for (const token of required) assert.ok(corpus.includes(token), `missing coverage token: ${token}`);
const formats = new Set(drill.QUESTIONS.map((q) => q.format));
["単一選択", "事例問題", "計算問題", "手続順序"].forEach((format) => assert.ok(formats.has(format), `missing format: ${format}`));
const allowedTags = new Set(["subject", "timing", "counterparty", "number", "principle-exception", "article-35", "article-37", "eight-restrictions", "transaction-type", "amendment"]);
const expectedLocators = new Set(["施行令 2条の4", "施行令 7条", "64条の4", "64条の7", "64条の8", "64条の9", "64条の10", "64条の11", "64条の12", "64条の15", "64条の23", "施行規則 26条の5", "保証協会弁済業務保証金規則 1条"]);
for (const question of drill.QUESTIONS) {
  assert.equal(question.unitLabel, "保証協会・営業保証金 特訓", `${question.id}: unit label`);
  assert.ok(["single", "case", "count", "procedure", "calculation"].includes(question.formatKey), `${question.id}: English format key`);
  assert.ok(Array.isArray(question.sourceUrls) && question.sourceUrls.length >= 1, `${question.id}: source urls`);
  assert.ok(question.choiceExplanations.every((text) => typeof text === "string" && !text.includes("[object Object]")), `${question.id}: readable choices`);
  assert.ok(question.diagnosticTags.length >= 1, `${question.id}: diagnostic tag`);
  assert.ok(question.diagnosticTags.every((tag) => allowedTags.has(tag)), `${question.id}: compatible business diagnostic tags`);
  question.sourceFacts.forEach((item) => {
    assert.ok([...expectedLocators].some((token) => item.sourceLocator.includes(token)), `${question.id}: exact locator ${item.sourceLocator}`);
    assert.ok(!/64条の3|64条の9の2/.test(item.sourceLocator), `${question.id}: obsolete locator ${item.sourceLocator}`);
  });
}
assert.match(drill.QUESTIONS_BY_ID.ga008.choices[3], /保証協会が加入又は地位喪失を直ちに免許権者へ報告する/, "ga008 association is reporter");
for (const index of [0, 1, 2]) {
  const fact = drill.QUESTIONS_BY_ID.ga010.sourceFacts[index];
  assert.match(fact.sourceLocator, /64条の8.*施行令 2条の4/, `ga010/${index}: cap and amount sources`);
  assert.equal(fact.sourceUrls.length, 2, `ga010/${index}: law and decree URLs`);
}
assert.match(drill.QUESTIONS_BY_ID.ga013.sourceFacts[1].sourceLocator, /保証協会弁済業務保証金規則 1条/, "ga013 exact replenishment trigger source");
assert.match(drill.QUESTIONS_BY_ID.ga013.sourceFacts[1].reason, /通知書の送付を受けた日/, "ga013 exact replenishment trigger");
assert.match(drill.QUESTIONS_BY_ID.ga015.sourceFacts[2].sourceLocator, /64条の15/, "ga015 operating-deposit deadline source");
assert.match(drill.QUESTIONS_BY_ID.ga017.sourceFacts[0].sourceLocator, /64条の15/, "ga017 ordinary loss deadline source");
assert.match(drill.QUESTIONS_BY_ID.ga017.choices[1], /公示の日から2週間以内/, "ga017 cancellation or dissolution distinction");
drill.QUESTIONS_BY_ID.ga020.sourceFacts.forEach((fact, index) => {
  assert.match(fact.sourceLocator, /64条の9.*64条の7.*64条の15/, `ga020/${index}: combined deadline sources`);
});
console.log(JSON.stringify({ ok: true, questions: drill.QUESTIONS.length, ids: Object.keys(drill.QUESTIONS_BY_ID).length, legalBaseline: drill.LEGAL_BASELINE, verifiedAt: drill.VERIFIED_AT, formats: [...formats] }));
