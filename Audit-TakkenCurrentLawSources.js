"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = __dirname;
const AS_OF = "2026-09-10";
const allowedHosts = new Set(["www.moj.go.jp", "www.mlit.go.jp", "www.retio.or.jp", "www.nta.go.jp", "elaws.e-gov.go.jp"]);
const requiredTopics = [
  "改正区分所有法の施行・経過措置",
  "住所等変更登記の義務化",
  "35条重要事項説明・管理業者管理者方式・標準様式",
  "登録講習修了者の5問免除",
  "土地売買の所有権移転登記・登録免許税の時限軽減",
  "不動産譲渡契約書の印紙税軽減",
  "令和8年地価公示",
  "令和7年度 建築着工統計・新設住宅着工戸数"
];
const requiredFields = ["sourceUrl", "sourceRef", "sourceLocator", "verifiedAt", "effectiveFrom", "effectiveTo", "reviewBy", "status", "coveragePolicy", "currentNote", "historicalNote"];

const ledgerApi = require(path.join(root, "current-law-source-ledger.js"));
assert.equal(ledgerApi.asOf, AS_OF, "ledger as-of date must be fixed");
assert.equal(ledgerApi.ledger.length, requiredTopics.length, "ledger must not silently omit required current topics");
const ids = new Set();
const topics = new Set();
for (const item of ledgerApi.ledger) {
  assert.ok(item.id && !ids.has(item.id), `duplicate or blank id: ${item.id}`); ids.add(item.id);
  assert.ok(requiredTopics.includes(item.topic), `unexpected topic: ${item.topic}`); topics.add(item.topic);
  for (const field of requiredFields) assert.notStrictEqual(item[field], undefined, `${item.id}: missing ${field}`);
  assert.match(item.sourceUrl, /^https:\/\//, `${item.id}: source URL must be HTTPS`);
  assert.ok(allowedHosts.has(new URL(item.sourceUrl).hostname), `${item.id}: non-primary or unapproved source domain`);
  for (const field of ["verifiedAt", "effectiveFrom", "reviewBy"]) assert.match(item[field], /^\d{4}-\d{2}-\d{2}$/, `${item.id}: invalid ${field}`);
  assert.ok(item.verifiedAt <= AS_OF, `${item.id}: verification cannot be future dated`);
  assert.ok(item.reviewBy >= AS_OF, `${item.id}: source review deadline expired`);
  if (item.effectiveTo !== null) {
    assert.match(item.effectiveTo, /^\d{4}-\d{2}-\d{2}$/, `${item.id}: invalid effectiveTo`);
    assert.ok(item.effectiveTo >= AS_OF, `${item.id}: time-limited source expired`);
  }
  assert.equal(item.status, "current", `${item.id}: only current sources may enter the R8 ledger`);
  assert.ok(["reference-when-matching-atom", "ledger-only-exam-operation"].includes(item.coveragePolicy), `${item.id}: invalid coverage policy`);
  assert.ok(item.sourceRef.trim() && item.sourceLocator.trim() && item.currentNote.trim() && item.historicalNote.trim(), `${item.id}: required narrative is blank`);
}
assert.deepEqual([...topics].sort(), [...requiredTopics].sort(), "required topic missing");

const registrationTax = ledgerApi.ledger.find((item) => item.id === "registration-tax-land-sale-extension");
assert.equal(registrationTax.effectiveTo, "2029-03-31", "must reflect latest land-sale extension through R11.3.31");
assert.match(registrationTax.currentNote, /1,000分の15/, "registration tax rate missing");
assert.match(registrationTax.historicalNote, /No\.7191.*単独根拠に使用禁止/, "old NTA 7191 fail-closed guard missing");

// Coverage policy: only a dated legal/statistical atom actually selected for a
// generated question must carry its ledger ID and exact primary URL. A ledger
// entry for exam operation (e.g. registration-course eligibility) is required
// to exist but is not falsely required to occur in a legal question.
global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(root, "exam-blueprint.js"), "utf8"), { filename: "exam-blueprint.js" });
vm.runInThisContext(fs.readFileSync(path.join(root, "exam-question-core.js"), "utf8"), { filename: "exam-question-core.js" });
["exam-questions-rights.js", "exam-questions-restrictions.js", "exam-questions-tax-other.js", "exam-questions-business.js"].forEach((file) => vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file }));
vm.runInThisContext(fs.readFileSync(path.join(root, "reiwa-exam-bank.js"), "utf8"), { filename: "reiwa-exam-bank.js" });
const questions = global.TAKKEN_REIWA_EXAM_BANK.forms.flatMap((form) => form.questions);
const ledgerById = new Map(ledgerApi.ledger.map((item) => [item.id, item]));
for (const question of questions) {
  const matchingAtoms = question.sourceQuestionIds.filter((id) => ["r025", "r026", "r028", "b020", "t004", "t005", "o009", "o010"].includes(id));
  if (!matchingAtoms.length) continue;
  assert.ok(question.currentLawSourceIds.length, `${question.id}: time-sensitive atom has no ledger reference`);
  for (const current of question.currentLawSources) {
    const item = ledgerById.get(current.id);
    assert.ok(item && item.coveragePolicy === "reference-when-matching-atom", `${question.id}: invalid current-law source id ${current.id}`);
    assert.equal(current.url, item.sourceUrl, `${question.id}: current-law URL mismatch for ${current.id}`);
  }
}
const referencedIds = new Set(questions.flatMap((question) => question.currentLawSourceIds));
for (const item of ledgerApi.ledger.filter((entry) => entry.coveragePolicy === "ledger-only-exam-operation")) assert.ok(!referencedIds.has(item.id), `${item.id}: operational ledger entry must not masquerade as a legal question source`);
console.log(JSON.stringify({ status: "ok", asOf: AS_OF, sources: ledgerApi.ledger.length, referencedCurrentSources: referencedIds.size }, null, 2));
