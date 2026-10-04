"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const bank = require("./vocabulary-bank.js");
const source = fs.readFileSync(path.join(__dirname, "vocabulary-bank.js"), "utf8");
const nonblank = value => typeof value === "string" && value.trim().length > 0;
const officialHosts = new Set(["laws.e-gov.go.jp", "www.moj.go.jp", "www.mlit.go.jp", "www.maff.go.jp"]);
const validateUrl = value => {
  const url = new URL(value);
  assert.equal(url.protocol, "https:");
  assert.ok(officialHosts.has(url.hostname), `unapproved source: ${value}`);
};

assert.equal(bank.VERSION, 1);
assert.equal(bank.LEGAL_BASELINE, "2026-04-01");
assert.equal(bank.QUESTIONS.length, 64, "retain all 64 original vocabulary questions");
assert.equal(bank.TOPICS.length, 6);
assert.equal(bank.UNITS, bank.TOPICS);
assert.equal(new Set(bank.QUESTION_IDS).size, 64);
assert.deepEqual(bank.QUESTION_IDS, bank.QUESTIONS.map(q => q.id));
assert.deepEqual(Object.keys(bank.QUESTIONS_BY_ID), bank.QUESTION_IDS);
assert.equal(new Set(bank.QUESTIONS.map(q => q.text)).size, 64, "each question needs a distinct prompt");
assert.equal(new Set(bank.QUESTIONS.map(q => q.term)).size, 64);
assert.ok(Object.isFrozen(bank) && Object.isFrozen(bank.QUESTIONS));
assert.deepEqual(Object.keys(bank.CARDS_BY_ID), bank.QUESTION_IDS);
for (const q of bank.QUESTIONS) {
  const card = bank.CARDS_BY_ID[q.id];
  assert.ok(Object.isFrozen(card));
  assert.equal(card.id, q.id);
  assert.equal(card.term, q.term);
  assert.equal(card.sourceUrl, q.sourceUrl);
  assert.equal(card.legalBaseline, q.legalBaseline);
  assert.ok(nonblank(card.meaning) && card.meaning.length <= 100, q.id + ': concise meaning');
}
assert.match(bank.CARDS_BY_ID['vocab-031'].meaning, /子・孫.*下の世代/);
assert.match(bank.CARDS_BY_ID['vocab-029'].meaning, /宅建業者を除く/);
assert.match(bank.CARDS_BY_ID['vocab-054'].meaning, /解約手付.*履行着手前/);
const topicIds = new Set(bank.TOPICS.map(topic => topic.id));
const slots = [0, 0, 0, 0];
const topicCounts = Object.fromEntries(bank.TOPICS.map(topic => [topic.label, 0]));
let correctIsLongest = 0;
for (const [index, q] of bank.QUESTIONS.entries()) {
  assert.equal(q.id, `vocab-${String(index + 1).padStart(3, "0")}`);
  assert.equal(bank.QUESTIONS_BY_ID[q.id], q);
  assert.ok(topicIds.has(q.unitId), `${q.id}: unknown topic`);
  assert.equal(q.format, "単一選択");
  assert.equal(q.formatKey, "single");
  assert.equal(q.legalBaseline, bank.LEGAL_BASELINE);
  assert.ok([q.term, q.text, q.explain, q.trap, q.memoryRule, q.sourceLocator].every(nonblank), `${q.id}: incomplete content`);
  assert.ok(q.text.length < 130, `${q.id}: keep this a short meaning knock`);
  assert.ok(Object.isFrozen(q) && Object.isFrozen(q.choices) && Object.isFrozen(q.sourceFacts));
  validateUrl(q.sourceUrl);
  assert.equal(q.choices.length, 4);
  assert.equal(new Set(q.choices).size, 4, `${q.id}: duplicate choices`);
  assert.ok(q.choices.every(nonblank));
  assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
  assert.equal(q.choiceExplanations.length, 4);
  assert.equal(q.sourceFacts.length, 4);
  assert.equal(q.choiceExplanations.filter(explanation => explanation.correct).length, 1);
  assert.equal(q.sourceFacts.filter(fact => fact.truth).length, 1);
  for (let i = 0; i < 4; i++) {
    const explanation = q.choiceExplanations[i], fact = q.sourceFacts[i];
    assert.equal(explanation.judgment, q.choices[i]);
    assert.equal(explanation.correct, i === q.answer);
    assert.ok([explanation.reason, explanation.sourceLocator].every(nonblank));
    assert.ok(explanation.reason.length >= 20, `${q.id}:${i}: give the rejected choice its own reason`);
    validateUrl(explanation.sourceUrl);
    assert.equal(fact.key, `${q.id}:${i}`);
    assert.equal(fact.statement, q.choices[i]);
    assert.equal(fact.presentedStatement, q.choices[i]);
    assert.equal(fact.truth, i === q.answer);
    assert.equal(fact.reason, explanation.reason);
    assert.equal(fact.sourceLocator, explanation.sourceLocator);
    assert.equal(fact.sourceUrl, explanation.sourceUrl);
    assert.equal(fact.legalBaseline, bank.LEGAL_BASELINE);
    assert.ok(fact.diagnosticTags.includes("vocabulary") && fact.diagnosticTags.includes(q.term));
  }
  assert.equal(new Set(q.choiceExplanations.map(explanation => explanation.reason)).size, 4);
  if (q.choices[q.answer].length > Math.max(...q.choices.filter((_, i) => i !== q.answer).map(value => value.length))) correctIsLongest++;
  slots[q.answer]++;
  topicCounts[bank.TOPICS.find(topic => topic.id === q.unitId).label]++;
}
assert.deepEqual(slots, [16, 16, 16, 16], "do not favor a fixed correct position");
assert.ok(correctIsLongest <= 24, "correct choice must not routinely give itself away by length");
const byTerm = term => {
  const question = bank.QUESTIONS.find(q => q.term === term);
  assert.ok(question, `missing priority term: ${term}`);
  return question;
};
const correctText = term => { const q = byTerm(term); return q.choices[q.answer]; };
assert.match(correctText("直系尊属"), /父母・祖父母/);
assert.match(correctText("直系卑属"), /直系卑属/);
assert.match(byTerm("直系卑属").explain, /孫.*下の世代/);
assert.match(correctText("傍系血族"), /兄弟姉妹・叔父叔母/);
assert.match(correctText("善意"), /知らない/);
assert.match(correctText("悪意"), /知っている/);
assert.match(correctText("時効の完成猶予"), /完成しない/);
assert.doesNotMatch(correctText("時効の完成猶予"), /ゼロ|数え直/);
assert.match(correctText("時効の更新"), /新たに.*進行/);
assert.match(byTerm("催告").trap, /更新/);
assert.match(correctText("供託"), /供託所/);
assert.match(byTerm("供託").trap, /処罰/);
assert.match(correctText("弁済供託"), /債務を消滅/);
assert.match(correctText("営業保証金の供託"), /債権を担保/);
assert.match(correctText("建蔽率"), /建築面積.*敷地面積/);
assert.match(correctText("容積率"), /延べ面積.*敷地面積/);
assert.match(byTerm("都市計画区域").trap, /市街化区域/);
assert.match(correctText("道路占用"), /継続/);
assert.match(correctText("道路使用許可"), /警察署長/);
assert.match(byTerm("仮換地").trap, /所有権/);
assert.match(correctText("国土法の事後届出"), /締結後/);
assert.match(correctText("国土法の規制区域"), /締結する前/);
assert.match(correctText("法定・約定"), /法令.*合意/);
// Keep the reviewed legal conditions and detect stale review records after edits.
const review = require("./vocabulary-legal-review-20261004.json");
assert.equal(review.legalBaseline, bank.LEGAL_BASELINE);
assert.equal(review.questions.length, 64);
assert.equal(review.counts.choicesReviewed, 256);
for (const [index, row] of review.questions.entries()) {
  const q = bank.QUESTIONS[index];
  assert.equal(row.id, q.id);
  assert.equal(row.answerIndex, q.answer, `${q.id}: preserve the reviewed answer slot`);
  assert.equal(row.contentSha256, crypto.createHash("sha256").update(JSON.stringify(q)).digest("hex"),
    `${q.id}: content changed since legal review; recheck and update its review record`);
  assert.ok(row.references.length && row.references.every(ref => review.sources[ref.law] && ref.articles.length));
}
assert.deepEqual(review.questions.filter(q => q.status === "修正").map(q => q.id),
  ["vocab-011", "vocab-024", "vocab-029", "vocab-060"]);
assert.match(byTerm("債権").choices.find(choice => choice.includes("支払う義務")), /^買主が/);
assert.match(byTerm("時効の援用").choiceExplanations.find(e => e.judgment.includes("数え直す")).reason, /完成前.*権利承認/);
assert.match(byTerm("営業保証金の供託").explain, /宅建業者を除く取引相手/);
assert.match(byTerm("仮換地").explain, /効力発生日.*開始日が別に定められる/);
assert.doesNotMatch(source, /chatgpt\.com\/c\/|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  "do not publish private conversation links or identifiers");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "vocabulary-bank.js" });
assert.ok(sandbox.window.TAKKEN_VOCABULARY_BANK, "browser global must be available without require");
assert.equal(sandbox.window.TAKKEN_VOCABULARY_BANK.QUESTIONS.length, 64);
assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.TAKKEN_VOCABULARY_BANK.QUESTION_IDS)), bank.QUESTION_IDS);

console.log(JSON.stringify({ status: "ok", questions: bank.QUESTIONS.length, topics: topicCounts,
  legalBaseline: bank.LEGAL_BASELINE, correctSlots: slots, correctIsLongest,
  officialSourceHosts: [...officialHosts], semanticSpotChecks: 28, legalReview: review.counts }, null, 2));

// Independent delivery contract for the pure term-to-meaning edition.
const meaningReview = require("./vocabulary-meaning-review-20261004.json");
assert.equal(bank.MEANING_QUESTIONS.length, 64);
assert.equal(new Set(bank.MEANING_QUESTIONS.map(q => q.id)).size, 64);
assert.deepEqual(meaningReview.counts, { terms: 64, choices: 256, singleCorrect: 64 });
for (const q of bank.MEANING_QUESTIONS) {
  assert.equal(q.text, "「" + q.term + "」の意味は？");
  assert.ok(q.text.length <= 24, q.id + ": term only, no case scenario");
  assert.equal(q.choices.length, 4);
  assert.equal(new Set(q.choices).size, 4);
  assert.ok(q.choices.every(text => text.length <= 64));
  assert.equal(q.choices[q.answer], q.meaning);
  assert.equal(q.answer, bank.QUESTIONS_BY_ID[q.id].answer, "legacy score/index compatibility");
  assert.equal(q.sourceFacts.filter(fact => fact.truth).length, 1);
  assert.equal(q.choiceTerms[q.answer], q.term);
  for (let i = 0; i < 4; i++) {
    assert.equal(q.sourceFacts[i].statement, q.choices[i]);
    assert.equal(q.sourceFacts[i].truth, i === q.answer);
    assert.ok(q.sourceFacts[i].reason.trim());
    validateUrl(q.sourceFacts[i].sourceUrl);
    if (i !== q.answer) assert.notEqual(q.choiceTerms[i], q.term);
  }
  const reviewed = meaningReview.questions.find(item => item.id === q.id);
  assert.equal(reviewed.sha256, crypto.createHash("sha256").update(JSON.stringify(q)).digest("hex"), q.id + ": reviewed final content");
}
assert.ok(!bank.MEANING_QUESTIONS_BY_ID["vocab-013"].choiceTerms.includes("弁済"), "do not offer a narrower correct definition of fulfillment as a distractor");
assert.ok(!bank.MEANING_QUESTIONS_BY_ID["vocab-027"].choiceTerms.some(term => ["弁済供託", "営業保証金の供託"].includes(term)), "do not offer a kind of deposit as an alternative definition of deposit");
assert.match(bank.MEANING_QUESTIONS_BY_ID["vocab-031"].meaning, /子・孫.*下の世代/);
assert.ok(!bank.MEANING_QUESTIONS_BY_ID["vocab-031"].choices.includes("直系卑属"), "ask meanings rather than repeat the term among choices");
assert.match(bank.MEANING_QUESTIONS_BY_ID["vocab-017"].meaning, /本来負担すべき人.*返還/);
assert.match(bank.MEANING_QUESTIONS_BY_ID["vocab-018"].meaning, /求償できる範囲.*元の債権や担保/);
assert.match(bank.MEANING_QUESTIONS_BY_ID["vocab-033"].meaning, /配偶者自身は除く/);
console.log(JSON.stringify({ meaningQuestions: 64, reviewedChoices: 256, termOnlyPrompts: true, objectiveSingleCorrect: true, legacyObjectsPreserved: true }));
