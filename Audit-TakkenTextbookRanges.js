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
const issues = [];

const expectedRanges = {
  business: {
    part: 1,
    label: "第1分冊 宅建業法",
    sectionIds: ["business"],
    mappedQuestions: 44,
    units: [
      [1, 3, "01-01 宅建業法の基本"],
      [2, 9, "01-02 免許"],
      [3, 25, "01-03 宅地建物取引士"],
      [4, 40, "01-04 営業保証金"],
      [5, 49, "01-05 保証協会"],
      [6, 62, "01-06 事務所、案内所等に関する規制"],
      [7, 72, "01-07 業務上の規制"],
      [8, 104, "01-08 自ら売主となる場合の8つの制限（8種制限）"],
      [9, 123, "01-09 報酬に関する制限"],
      [10, 139, "01-10 監督・罰則"],
      [11, 152, "01-11 住宅瑕疵担保履行法"]
    ]
  },
  rights: {
    part: 2,
    label: "第2分冊 権利関係",
    sectionIds: ["rights"],
    mappedQuestions: 44,
    units: [
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
    ]
  },
  restrictions: {
    part: 3,
    label: "第3分冊 法令上の制限",
    sectionIds: ["restrictions"],
    mappedQuestions: 18,
    units: [
      [1, 411, "03-01 都市計画法"],
      [2, 451, "03-02 建築基準法"],
      [3, 492, "03-03 国土利用計画法"],
      [4, 504, "03-04 農地法"],
      [5, 510, "03-05 盛土規制法"],
      [6, 530, "03-06 土地区画整理法"],
      [7, 543, "03-07 その他の法令上の制限"]
    ]
  },
  taxOther: {
    part: 3,
    label: "第3分冊 税・その他",
    sectionIds: ["tax", "other"],
    mappedQuestions: 18,
    units: [
      [1, 548, "04-01 不動産に関する税金"],
      [2, 574, "04-02 不動産鑑定評価基準"],
      [3, 580, "04-03 地価公示法"],
      [4, 585, "04-04 住宅金融支援機構"],
      [5, 591, "04-05 景品表示法（不当景品類及び不当表示防止法）"],
      [6, 602, "04-06 土地・建物"]
    ]
  }
};

const expectedSupplemental = [
  "b101", "b102", "b103", "b104",
  ...Array.from({ length: 16 }, (_, index) => `r${String(index + 101).padStart(3, "0")}`),
  "l101", "l102", "o101", "o102"
];
const coreIds = blueprint.sections.flatMap((section) =>
  section.chapters.flatMap((chapter) => chapter.ids)
);
const mappedIds = [];

if (Object.keys(blueprint.textbookRanges || {}).length !== 4) {
  issues.push("expected exactly 4 textbook ranges");
}

Object.entries(expectedRanges).forEach(([rangeId, expected]) => {
  const range = blueprint.textbookRanges?.[rangeId];
  if (!range) {
    issues.push(`${rangeId}: missing textbook range`);
    return;
  }
  if (range.part !== expected.part) issues.push(`${rangeId}: part mismatch`);
  if (range.label !== expected.label) issues.push(`${rangeId}: label mismatch`);
  if (JSON.stringify(range.sectionIds) !== JSON.stringify(expected.sectionIds)) {
    issues.push(`${rangeId}: sectionIds mismatch`);
  }
  if (range.chapters?.length !== expected.units.length) {
    issues.push(`${rangeId}: expected ${expected.units.length} units, got ${range.chapters?.length || 0}`);
  }
  (range.chapters || []).forEach((chapter, index) => {
    const expectedUnit = expected.units[index];
    if (!expectedUnit) return;
    if (chapter.unit !== expectedUnit[0]) issues.push(`${chapter.id}: unit mismatch`);
    if (chapter.page !== expectedUnit[1]) issues.push(`${chapter.id}: page mismatch`);
    if (chapter.label !== expectedUnit[2]) issues.push(`${chapter.id}: label mismatch`);
    if (!Array.isArray(chapter.ids) || chapter.ids.length < 2) {
      issues.push(`${chapter.id}: requires at least 2 questions`);
    }
    (chapter.ids || []).forEach((id) => {
      mappedIds.push(id);
      const question = questions[id];
      if (!question) {
        issues.push(`${chapter.id}: missing mapped question ${id}`);
      } else if (!expected.sectionIds.includes(question.sectionId)) {
        issues.push(`${chapter.id}/${id}: section ${question.sectionId} outside range`);
      }
    });
  });
  const rangeIds = (range.chapters || []).flatMap((chapter) => chapter.ids || []);
  if (rangeIds.length !== expected.mappedQuestions) {
    issues.push(`${rangeId}: expected ${expected.mappedQuestions} mapped questions, got ${rangeIds.length}`);
  }
  if (new Set(rangeIds).size !== rangeIds.length) {
    issues.push(`${rangeId}: question mapped to multiple units`);
  }
});

if (mappedIds.length !== 124) issues.push(`expected 124 textbook mappings, got ${mappedIds.length}`);
if (new Set(mappedIds).size !== 124) issues.push("a question appears in multiple textbook units");
if (mappedIds.filter((id) => coreIds.includes(id)).length !== 100) {
  issues.push("every core question must be mapped exactly once");
}
if (coreIds.some((id) => !mappedIds.includes(id))) issues.push("textbook ranges omit a core question");
if (JSON.stringify(blueprint.supplementalOrder) !== JSON.stringify(expectedSupplemental)) {
  issues.push(`supplemental order mismatch: ${(blueprint.supplementalOrder || []).join(",")}`);
}

const officialHosts = new Set([
  "elaws.e-gov.go.jp",
  "laws.e-gov.go.jp",
  "www.moj.go.jp",
  "www.mlit.go.jp"
]);
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
  if (host && !officialHosts.has(host)) issues.push(`${id}: non-official source host ${host}`);
});

const requiredNewTopics = {
  b101: /宅建業の定義/,
  b102: /案内所/,
  b103: /住宅瑕疵担保履行法/,
  b104: /住宅瑕疵担保履行法/,
  l101: /文化財保護法/,
  l102: /道路法/,
  o101: /不動産鑑定評価/,
  o102: /地価公示法/
};
Object.entries(requiredNewTopics).forEach(([id, pattern]) => {
  if (!pattern.test(questions[id]?.tag || "")) issues.push(`${id}: required topic missing`);
});

if (blueprint.curriculumOrder.length !== 100) issues.push("core curriculum must remain 100");
blueprint.mockForms.forEach((form) => {
  if (form.ids.length !== 50) issues.push(`${form.id}: mock must remain 50 questions`);
  if (form.ids.some((id) => expectedSupplemental.includes(id))) {
    issues.push(`${form.id}: supplemental question leaked into fixed mock`);
  }
});

const report = {
  ranges: Object.fromEntries(Object.entries(expectedRanges).map(([rangeId, expected]) => [
    rangeId,
    {
      part: expected.part,
      units: blueprint.textbookRanges?.[rangeId]?.chapters?.length || 0,
      mappedQuestions: blueprint.textbookRanges?.[rangeId]?.chapters
        ?.flatMap((chapter) => chapter.ids || []).length || 0
    }
  ])),
  totalUnits: Object.values(blueprint.textbookRanges || {})
    .reduce((sum, range) => sum + (range.chapters?.length || 0), 0),
  mappedQuestions: new Set(mappedIds).size,
  coreQuestions: coreIds.length,
  supplementalQuestions: expectedSupplemental.length,
  minimumQuestionsPerUnit: Math.min(
    ...Object.values(blueprint.textbookRanges || {})
      .flatMap((range) => range.chapters || [])
      .map((chapter) => chapter.ids?.length || 0)
  ),
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
