"use strict";

global.window = {};
require("./exam-blueprint.js");
require("./exam-question-core.js");
require("./exam-questions-rights.js");
require("./exam-questions-restrictions.js");
require("./exam-questions-tax-other.js");
require("./exam-questions-business.js");

const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
const questions = window.TAKKEN_EXAM_QUESTIONS;
const range = blueprint.textbookRanges?.rights;
const issues = [];
const expectedUnits = [
  [1, 163, "02-01 制限行為能力者"],
  [2, 172, "02-02 意思表示"],
  [3, 182, "02-03 代理"],
  [4, 197, "02-04 時効"],
  [5, 208, "02-05 債務不履行・解除"],
  [6, 219, "02-06 危険負担"],
  [7, 222, "02-07 弁済・相殺・債権譲渡"],
  [8, 233, "02-08 売買"],
  [9, 243, "02-09 物権変動"],
  [10, 253, "02-10 抵当権"],
  [11, 269, "02-11 連帯債務・保証・連帯債権"],
  [12, 284, "02-12 賃貸借"],
  [13, 297, "02-13 借地借家法（借地）"],
  [14, 312, "02-14 借地借家法（借家）"],
  [15, 327, "02-15 請負"],
  [16, 331, "02-16 不法行為"],
  [17, 338, "02-17 相続"],
  [18, 350, "02-18 共有"],
  [19, 357, "02-19 区分所有法"],
  [20, 375, "02-20 不動産登記法"],
  [21, 385, "02-21 参考論点"]
];
const expectedSupplemental = Array.from(
  { length: 16 },
  (_, index) => `r${String(101 + index).padStart(3, "0")}`
);

if (!range) issues.push("missing textbookRanges.rights");
if (range?.part !== 2) issues.push(`expected part 2, got ${range?.part}`);
if (range?.label !== "第2分冊 権利関係") issues.push(`unexpected range label: ${range?.label}`);
if (range?.chapters?.length !== 21) issues.push(`expected 21 units, got ${range?.chapters?.length || 0}`);

const chapters = range?.chapters || [];
chapters.forEach((chapter, index) => {
  const expected = expectedUnits[index];
  if (!expected) return;
  if (chapter.unit !== expected[0]) issues.push(`${chapter.id}: unit mismatch`);
  if (chapter.page !== expected[1]) issues.push(`${chapter.id}: page mismatch`);
  if (chapter.label !== expected[2]) issues.push(`${chapter.id}: label mismatch`);
  if (!Array.isArray(chapter.ids) || chapter.ids.length < 2) {
    issues.push(`${chapter.id}: requires at least 2 questions`);
  }
});

const rangeIds = chapters.flatMap((chapter) => chapter.ids || []);
const uniqueRangeIds = [...new Set(rangeIds)];
if (rangeIds.length !== 44) issues.push(`expected 44 mapped questions, got ${rangeIds.length}`);
if (uniqueRangeIds.length !== 44) issues.push("a rights question appears in more than one textbook unit");
if (new Set(chapters.map((chapter) => chapter.id)).size !== 21) {
  issues.push("duplicate textbook unit id");
}

const actualRightsSupplemental = (blueprint.supplementalOrder || [])
  .filter((id) => /^r1\d{2}$/.test(id));
if (JSON.stringify(actualRightsSupplemental) !== JSON.stringify(expectedSupplemental)) {
  issues.push(`rights supplemental order mismatch: ${actualRightsSupplemental.join(",")}`);
}

uniqueRangeIds.forEach((id) => {
  const question = questions[id];
  if (!question) {
    issues.push(`missing mapped question ${id}`);
    return;
  }
  if (question.sectionId !== "rights") issues.push(`${id}: must be in rights section`);
});

expectedSupplemental.forEach((id) => {
  const question = questions[id];
  if (!question) return;
  if (question.legalBaseline !== "2026-04-01") issues.push(`${id}: legal baseline mismatch`);
  if (question.verifiedAt !== "2026-08-01") issues.push(`${id}: verification date mismatch`);
  let host = "";
  try {
    host = new URL(question.sourceUrl).hostname;
  } catch {
    issues.push(`${id}: invalid source URL`);
  }
  if (host && !["elaws.e-gov.go.jp", "www.moj.go.jp"].includes(host)) {
    issues.push(`${id}: non-official source host ${host}`);
  }
});

const requiredTopicPatterns = [
  /危険負担/,
  /請負/,
  /不法行為/,
  /弁済/,
  /連帯債権/
];
requiredTopicPatterns.forEach((pattern) => {
  if (!expectedSupplemental.some((id) => pattern.test(questions[id]?.tag || ""))) {
    issues.push(`missing supplemental topic ${pattern}`);
  }
});

const coreRights = blueprint.idsBySection?.rights || [];
if (blueprint.curriculumOrder?.length !== 100) issues.push("core curriculum must remain 100");
if (coreRights.length !== 28) issues.push(`core rights must remain 28, got ${coreRights.length}`);
blueprint.mockForms.forEach((form) => {
  if (form.ids.length !== 50) issues.push(`${form.id}: mock must remain 50 questions`);
  if (form.ids.some((id) => expectedSupplemental.includes(id))) {
    issues.push(`${form.id}: supplemental question leaked into fixed mock`);
  }
});

const report = {
  range: range?.label || "missing",
  units: chapters.length,
  mappedQuestions: uniqueRangeIds.length,
  coreQuestions: blueprint.curriculumOrder?.length || 0,
  coreRights: coreRights.length,
  supplementalQuestions: expectedSupplemental.length,
  minimumQuestionsPerUnit: Math.min(...chapters.map((chapter) => chapter.ids?.length || 0)),
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
