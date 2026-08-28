"use strict";

const assert = require("node:assert/strict");
const drill = require("./guarantee-association-drill.js");
const required = ["1,000万円", "500万円", "60万円", "30万円", "保証協会", "供託所", "社員となろうとする日まで", "新設の日から2週間", "受領日から1週間", "二以上", "宅建業者以外", "社員となる前", "弁済業務開始日以後", "既に認証された還付額0円", "還付充当金0円", "2,000万円", "認証", "3通", "債権発生の事実・取引時期・債権額・申出経緯", "通知書の送付を受けた日", "通知を受けた日から2週間", "社員資格を失う", "資格喪失から1週間", "公示の日から2週間", "6か月", "特別弁済業務保証金分担金", "主たる事務所最寄りの供託所", "有価証券", "35条の2", "加入前取引", "担保の提供", "64条の24", "通常喪失=1週", "供託書写し", "保管替え", "弁済業務開始日の1か月前", "営業保証金規則 5条", "宅地建物取引業者でない取引相手"];
const corpus = drill.QUESTIONS.map((q) => JSON.stringify(q).toLowerCase()).join("\n");
assert.equal(drill.LEGAL_BASELINE, "2026-04-01");
assert.equal(drill.VERSION, 3);
assert.equal(drill.VERIFIED_AT, "2026-08-29");
assert.equal(drill.QUESTIONS.length, 33);
assert.deepEqual(drill.QUESTIONS.map((q) => q.id), Array.from({ length: 33 }, (_, i) => `ga${String(i + 1).padStart(3, "0")}`));
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
  assert.ok(Array.isArray(one.presentationOrder) && Array.isArray(two.presentationOrder), `${question.id}: deterministic presentation orders`);
  assert.equal(one.choices[one.answer], question.choices[question.answer], `${question.id}: retry keeps semantic answer`);
  assert.ok(Number.isInteger(one.presentationPermutationIndex) && one.presentationPermutationIndex >= 0 && one.presentationPermutationIndex < 24, `${question.id}: 24-order index`);
}
assert.ok(new Set(Array.from({ length: 24 }, (_, index) => drill.presentQuestion("ga001", `permutation-${index}`).presentationOrder.join(""))).size >= 12, "ga001: retry keys yield at least 12 relative orders");
for (const question of drill.QUESTIONS) {
  const orders = new Set();
  for (let index = 0; index < 96; index += 1) {
    const presented = drill.presentQuestion(question.id, `retry-${index}`);
    orders.add(presented.presentationOrder.join(""));
    assert.equal(presented.choices[presented.answer], question.choices[question.answer], `${question.id}: retry ${index} semantic answer`);
  }
  assert.ok(orders.size >= 12, `${question.id}: at least 12 deterministic relative orders`);
}
for (const token of required) assert.ok(corpus.includes(token), `missing coverage token: ${token}`);
const formats = new Set(drill.QUESTIONS.map((q) => q.format));
["単一選択", "事例問題", "計算問題", "手続順序"].forEach((format) => assert.ok(formats.has(format), `missing format: ${format}`));
const allowedTags = new Set(["subject", "timing", "counterparty", "number", "principle-exception", "article-35", "article-37", "eight-restrictions", "transaction-type", "amendment"]);
const expectedLocators = new Set(["25条", "26条", "27条", "28条", "29条", "30条", "35条の2", "施行令 2条の4", "施行令 7条", "64条の4", "64条の7", "64条の8", "64条の9", "64条の10", "64条の11", "64条の12", "64条の13", "64条の14", "64条の15", "64条の23", "64条の24", "施行規則 26条の5", "保証協会弁済業務保証金規則 1条", "営業保証金規則 5条"]);
for (const question of drill.QUESTIONS) {
  assert.equal(question.unitLabel, "保証協会・営業保証金 特訓", `${question.id}: unit label`);
  assert.ok(["single", "case", "count", "procedure", "calculation"].includes(question.formatKey), `${question.id}: English format key`);
  assert.ok(Array.isArray(question.sourceUrls) && question.sourceUrls.length >= 1, `${question.id}: source urls`);
  assert.ok(question.sourceRef && question.sourceRef !== "公式根拠", `${question.id}: learner-facing source locator`);
  assert.ok(question.choiceExplanations.every((text) => typeof text === "string" && !text.includes("[object Object]")), `${question.id}: readable choices`);
  assert.ok(question.diagnosticTags.length >= 1, `${question.id}: diagnostic tag`);
  assert.ok(question.diagnosticTags.every((tag) => allowedTags.has(tag)), `${question.id}: compatible business diagnostic tags`);
  question.sourceFacts.forEach((item) => {
    assert.ok([...expectedLocators].some((token) => item.sourceLocator.includes(token)), `${question.id}: exact locator ${item.sourceLocator}`);
    assert.ok(!/64条の3|64条の9の2/.test(item.sourceLocator), `${question.id}: obsolete locator ${item.sourceLocator}`);
  });
}
assert.match(drill.QUESTIONS_BY_ID.ga008.choices[3], /保証協会が加入又は地位喪失を直ちに免許権者へ報告する/, "ga008 association is reporter");
assert.match(drill.QUESTIONS_BY_ID.ga005.text, /^保証協会の社員となろうとする宅建業者が/, "ga005 must ask the pre-membership deadline from the correct legal time point");
assert.match(drill.QUESTIONS_BY_ID.ga004.text, /第64条の9第1項又は第2項/, "ga004 must limit the deposit flow to ordinary contributions");
assert.match(drill.QUESTIONS_BY_ID.ga007.text, /第64条の9第1項又は第2項/, "ga007 must limit the one-week rule to ordinary contributions");
assert.match(drill.QUESTIONS_BY_ID.ga009.choices[1], /弁済業務開始日以後/, "ga009 claimant choice must state the business-start date premise");
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
assert.match(drill.QUESTIONS_BY_ID.ga017.sourceFacts[3].sourceLocator, /64条の11.*64条の24/, "ga017 six-month notice applies beyond ordinary loss");
drill.QUESTIONS_BY_ID.ga020.sourceFacts.forEach((fact, index) => {
  assert.match(fact.sourceLocator, /64条の9.*64条の7.*64条の15/, `ga020/${index}: combined deadline sources`);
});
assert.match(drill.QUESTIONS_BY_ID.ga021.choices[1], /最寄りの供託所.*供託書写し.*届出後に営業開始/, "ga021: non-member sequence");
assert.match(drill.QUESTIONS_BY_ID.ga022.choices[3], /有価証券を供託できる/, "ga022: securities deposit");
assert.match(drill.QUESTIONS_BY_ID.ga023.choices[2], /非社員は営業保証金の供託所.*開始日前なら.*両方.*開始日以後/, "ga023: article 35-2 three-way explanation duty");
assert.match(drill.QUESTIONS_BY_ID.ga024.choices[0], /^担保の提供$/, "ga024: joining-before transaction safeguard");
assert.match(drill.QUESTIONS_BY_ID.ga024.text, /弁済業務開始日後に社員となった/, "ga024: ordinary post-start membership premise");
assert.match(drill.QUESTIONS_BY_ID.ga024.explain, /開始日前から社員.*開始日前取引/, "ga024: pre-start member exception");
assert.match(drill.QUESTIONS_BY_ID.ga025.choices[3], /取り戻したとき.*分担金を返還/, "ga025: actual recovery before contribution return");
assert.match(drill.QUESTIONS_BY_ID.ga025.memoryRule, /取戻しは協会の選択.*返還は取戻し後.*公告・債権清算/, "ga025: recovery and return conditions");
assert.match(drill.QUESTIONS_BY_ID.ga026.choices[1], /公示後1週間以内.*6か月を下らない期間/, "ga026: former association public notice");
assert.match(drill.QUESTIONS_BY_ID.ga010.text, /弁済業務開始日以後.*宅地建物取引業者でない取引相手/, "ga010: business-start date and claimant qualification premises");
assert.match(drill.QUESTIONS_BY_ID.ga011.text, /第64条の8第1項の権利を有する者/, "ga011: claimant premise");
assert.match(drill.QUESTIONS_BY_ID.ga025.choices[3], /^協会が弁済業務保証金を取り戻したとき/, "ga025: recovery is not deferred by notice period");
assert.match(drill.QUESTIONS_BY_ID.ga027.choices[1], /追加営業保証金.*供託書写し.*届出.*営業を開始/, "ga027: new-office operating-deposit gate");
assert.match(drill.QUESTIONS_BY_ID.ga028.choices[2], /2週間以内.*供託.*供託後2週間以内.*免許権者/, "ga028: replenishment and notification");
assert.equal(drill.QUESTIONS_BY_ID.ga028.sourceFacts[2].sourceUrls.length, 2, "ga028: law and rule URLs");
assert.match(drill.QUESTIONS_BY_ID.ga029.choices[0], /費用を予納.*保管替え/, "ga029: cash-only transfer");
assert.match(drill.QUESTIONS_BY_ID.ga030.choices[1], /弁済業務開始日の1か月前.*社員資格を失う/, "ga030: existing-member deadline and loss");
assert.match(drill.QUESTIONS_BY_ID.ga031.choices[2], /弁済業務開始日以後.*30条3項準用/, "ga031: exemption and recovery procedure");
assert.match(drill.QUESTIONS_BY_ID.ga031.sourceFacts[2].reason, /免許権者の書面.*6か月公告は不要/, "ga031: exact no-notice recovery procedure");
assert.equal(drill.QUESTIONS_BY_ID.ga031.sourceFacts[2].sourceUrls.length, 2, "ga031: act and operating-deposit rule URLs");
assert.match(drill.QUESTIONS_BY_ID.ga016.text, /^弁済業務開始日以後/, "ga016: ordinary loss deadline applies after business starts");
assert.match(drill.QUESTIONS_BY_ID.ga020.text, /^弁済業務開始日以後/, "ga020: combined deadline premise applies after business starts");
assert.match(drill.QUESTIONS_BY_ID.ga032.choices[1], /社員資格を失う/, "ga032: new-office contribution nonpayment loss");
assert.match(drill.QUESTIONS_BY_ID.ga033.choices[1], /宅建業者に該当しない者/, "ga033: operating-deposit claimant exclusion");
console.log(JSON.stringify({ ok: true, questions: drill.QUESTIONS.length, ids: Object.keys(drill.QUESTIONS_BY_ID).length, legalBaseline: drill.LEGAL_BASELINE, verifiedAt: drill.VERIFIED_AT, formats: [...formats] }));
