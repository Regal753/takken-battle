"use strict";

const assert = require("node:assert/strict");

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
const allIds = blueprint.sections.flatMap((section) =>
  section.chapters.flatMap((chapter) => chapter.ids)
);
const uniqueIds = new Set(allIds);
const supplementalIds = blueprint.supplementalOrder || [];
const allQuestionIds = [...allIds, ...supplementalIds];
const answerCounts = [0, 0, 0, 0];
const formatCounts = {};
const promptOwners = new Map();

assert.equal(blueprint.legalBaseline, "2026-04-01", "blueprint legal baseline");
const legalSourceEntries = Object.entries(blueprint.sources).filter(([, source]) => {
  try {
    return new URL(source.url).hostname === "laws.e-gov.go.jp";
  } catch {
    return false;
  }
});
assert.equal(legalSourceEntries.length, 16, "all declared statutory sources use the pinned e-Gov baseline");
for (const [sourceId, source] of legalSourceEntries) {
  const url = new URL(source.url);
  assert.equal(url.protocol, "https:", `${sourceId}: statutory source HTTPS`);
  assert.equal(url.searchParams.get("occasion_date"), "20260401", `${sourceId}: statutory source pinned to 2026-04-01`);
}
assert.ok(
  !Object.values(blueprint.sources).some((source) => String(source.url || "").includes("elaws.e-gov.go.jp")),
  "legacy unpinned e-Laws source URLs must not remain in the blueprint"
);

if (allIds.length !== 100) issues.push(`expected 100 blueprint ids, got ${allIds.length}`);
if (uniqueIds.size !== allIds.length) issues.push("duplicate blueprint question id");
if (supplementalIds.length !== 24) {
  issues.push(`expected 24 supplemental questions, got ${supplementalIds.length}`);
}
if (new Set(allQuestionIds).size !== 124) {
  issues.push("core and supplemental ids must make 124 unique questions");
}
if (Object.keys(questions).length !== 124) {
  issues.push(`expected 124 questions, got ${Object.keys(questions).length}`);
}

blueprint.sections.forEach((section) => {
  const ids = section.chapters.flatMap((chapter) => chapter.ids);
  if (ids.length !== section.coreQuestions) {
    issues.push(`${section.id}: expected ${section.coreQuestions}, got ${ids.length}`);
  }
  ids.forEach((id) => {
    const question = questions[id];
    if (!question) {
      issues.push(`missing question: ${id}`);
      return;
    }
    if (question.sectionId !== section.id) issues.push(`${id}: section mismatch`);
  });
});

Object.values(questions).forEach((question) => {
  formatCounts[question.format] = (formatCounts[question.format] || 0) + 1;
  if (!Array.isArray(question.choices) || question.choices.length !== 4) {
    issues.push(`${question.id}: choices must be 4`);
  } else if (new Set(question.choices.map((choice) => String(choice).trim())).size !== 4) {
    issues.push(`${question.id}: duplicate choice`);
  }
  if (!Array.isArray(question.choiceExplanations) || question.choiceExplanations.length !== 4) {
    issues.push(`${question.id}: explanations must be 4`);
  }
  if (!question.choiceExplanations.every((line) => /[○×]/.test(line))) {
    issues.push(`${question.id}: missing verdict marker`);
  }
  if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) {
    issues.push(`${question.id}: invalid answer`);
  } else {
    answerCounts[question.answer] += 1;
  }
  if (String(question.text || "").length < 24) issues.push(`${question.id}: prompt too short`);
  if (String(question.explain || "").length < 24) issues.push(`${question.id}: explanation too short`);
  if (String(question.trap || "").length < 12) issues.push(`${question.id}: trap too short`);
  if (String(question.memoryRule || "").length < 12) issues.push(`${question.id}: memory rule too short`);
  if (question.legalBaseline !== "2026-04-01") issues.push(`${question.id}: legal baseline mismatch`);
  const expectedVerifiedAt = question.id === "b040"
    ? "2026-08-02"
    : supplementalIds.includes(question.id)
      ? "2026-08-01"
      : "2026-07-26";
  if (question.verifiedAt !== expectedVerifiedAt) {
    issues.push(`${question.id}: verification date mismatch`);
  }
  if (!/^https:\/\//.test(question.sourceUrl || "")) issues.push(`${question.id}: invalid source URL`);
  if (!question.sourceRef) issues.push(`${question.id}: missing source reference`);
  const promptKey = String(question.text || "").replace(/\s+/g, " ").trim();
  if (promptOwners.has(promptKey)) {
    issues.push(`${question.id}: duplicate prompt with ${promptOwners.get(promptKey)}`);
  } else {
    promptOwners.set(promptKey, question.id);
  }
});

if (formatCounts["単一選択"] !== 118) {
  issues.push(`expected 118 single-choice questions, got ${formatCounts["単一選択"] || 0}`);
}
if (formatCounts["個数問題"] !== 6) {
  issues.push(`expected 6 count questions, got ${formatCounts["個数問題"] || 0}`);
}
if (Math.max(...answerCounts) - Math.min(...answerCounts) > 4) {
  issues.push(`answer position spread too wide: ${answerCounts.join("/")}`);
}

if (blueprint.curriculumOrder.length !== 100) {
  issues.push(`curriculum length ${blueprint.curriculumOrder.length}`);
}
if (new Set(blueprint.curriculumOrder).size !== 100) {
  issues.push("curriculum contains duplicates");
}
blueprint.dailyBlocks.forEach((ids, index) => {
  if (ids.length !== 10) issues.push(`daily block ${index + 1}: expected 10`);
  if (new Set(ids).size !== ids.length) issues.push(`daily block ${index + 1}: duplicate id`);
});
const dailySectionCounts = Object.fromEntries(
  blueprint.sections.map((section) => [
    section.id,
    blueprint.curriculumOrder.filter((id) => questions[id]?.sectionId === section.id).length
  ])
);
blueprint.sections.forEach((section) => {
  if (dailySectionCounts[section.id] !== section.coreQuestions) {
    issues.push(
      `daily curriculum/${section.id}: expected ${section.coreQuestions}, got ${dailySectionCounts[section.id]}`
    );
  }
});

const expectedMockWeights = {
  rights: 14,
  restrictions: 8,
  tax: 3,
  business: 20,
  other: 5
};

const requiredMockFormIds = ["form-a", "form-b", "form-c"];
const mockFormsById = Object.fromEntries(blueprint.mockForms.map((form) => [form.id, form]));
if (blueprint.mockForms.length !== requiredMockFormIds.length) {
  issues.push(`expected ${requiredMockFormIds.length} internal mock forms, got ${blueprint.mockForms.length}`);
}
requiredMockFormIds.forEach((id) => {
  if (!mockFormsById[id]) issues.push(`missing required mock form: ${id}`);
});
if (new Set(blueprint.mockForms.map((form) => form.id)).size !== blueprint.mockForms.length) {
  issues.push("duplicate mock form id");
}

// A/B はコア100を固定で二分する既存フォームとして保存する。
const expectedCoreForms = {
  "form-a": [
    ...blueprint.idsBySection.rights.slice(0, 14),
    ...blueprint.idsBySection.restrictions.slice(0, 8),
    ...blueprint.idsBySection.tax.slice(0, 3),
    ...blueprint.idsBySection.business.slice(0, 20),
    ...blueprint.idsBySection.other.slice(0, 5)
  ],
  "form-b": [
    ...blueprint.idsBySection.rights.slice(14, 28),
    ...blueprint.idsBySection.restrictions.slice(8, 16),
    ...blueprint.idsBySection.tax.slice(3, 6),
    ...blueprint.idsBySection.business.slice(20, 40),
    ...blueprint.idsBySection.other.slice(5, 10)
  ]
};
Object.entries(expectedCoreForms).forEach(([formId, expectedIds]) => {
  const actualIds = mockFormsById[formId]?.ids || [];
  if (actualIds.join("|") !== expectedIds.join("|")) {
    issues.push(`${formId}: existing core form changed`);
  }
});

const expectedStudyTargets = {
  total: 40,
  safe: 42,
  rights: 9,
  restrictions: 7,
  business: 18,
  tax: 2,
  other: 4,
  // Backwards-compatible aggregate for legacy save/report consumers.
  taxOther: 6
};
Object.entries(expectedStudyTargets).forEach(([key, expected]) => {
  if (blueprint.studyTargets?.[key] !== expected) {
    issues.push(`study target/${key}: expected ${expected}, got ${blueprint.studyTargets?.[key]}`);
  }
});
const masteryQuotaTotal = Object.values(blueprint.masteryDailyQuotas || {})
  .reduce((sum, value) => sum + Number(value || 0), 0);
if (masteryQuotaTotal !== 10) {
  issues.push(`mastery daily quota: expected 10, got ${masteryQuotaTotal}`);
}
const expectedMasteryQuotas = {
  rights: 3,
  restrictions: 2,
  business: 4,
  taxOther: 1
};
Object.entries(expectedMasteryQuotas).forEach(([key, expected]) => {
  if (blueprint.masteryDailyQuotas?.[key] !== expected) {
    issues.push(`mastery quota/${key}: expected ${expected}, got ${blueprint.masteryDailyQuotas?.[key]}`);
  }
});
if (
  Number(blueprint.studyTargets?.rights || 0) +
  Number(blueprint.studyTargets?.restrictions || 0) +
  Number(blueprint.studyTargets?.business || 0) +
  Number(blueprint.studyTargets?.tax || 0) +
  Number(blueprint.studyTargets?.other || 0) !== blueprint.studyTargets?.total
) {
  issues.push("study target sections do not sum to total");
}
blueprint.mockForms.forEach((form) => {
  if (form.ids.length !== 50) issues.push(`${form.id}: expected 50 questions`);
  if (new Set(form.ids).size !== 50) issues.push(`${form.id}: duplicate id`);
  Object.entries(expectedMockWeights).forEach(([sectionId, expected]) => {
    const actual = form.ids.filter((id) => questions[id]?.sectionId === sectionId).length;
    if (actual !== expected) issues.push(`${form.id}/${sectionId}: expected ${expected}, got ${actual}`);
  });
});

const formC = mockFormsById["form-c"];
if (formC && formC.evidenceClass !== "internal-mixed-practice") {
  issues.push("form-c must remain labelled as internal mixed practice");
}
if (formC) {
  blueprint.sections.forEach((section) => {
    const availableSupplemental = supplementalIds.filter((id) => questions[id]?.sectionId === section.id);
    const usedSupplemental = formC.ids.filter((id) => availableSupplemental.includes(id));
    const feasibleCount = Math.min(availableSupplemental.length, expectedMockWeights[section.id]);
    if (usedSupplemental.length !== feasibleCount) {
      issues.push(
        `form-c/${section.id}: expected ${feasibleCount} feasible supplemental ids, got ${usedSupplemental.length}`
      );
    }
  });
}

const formOverlap = (left, right) =>
  left.ids.filter((id) => right.ids.includes(id));
const formOverlapReport = blueprint.mockForms.flatMap((form, index) =>
  blueprint.mockForms.slice(index + 1).map((other) => {
    const questionIds = formOverlap(form, other);
    const leftSources = new Set(form.ids.map((id) => questions[id]?.sourceUrl).filter(Boolean));
    const rightSources = new Set(other.ids.map((id) => questions[id]?.sourceUrl).filter(Boolean));
    return {
      forms: [form.id, other.id],
      questionIdOverlap: questionIds.length,
      questionIds,
      sourceUrlOverlap: [...leftSources].filter((url) => rightSources.has(url)).length
    };
  })
);
const mockUnionIds = new Set(blueprint.mockForms.flatMap((form) => form.ids));
const formCOmittedSupplementalIds = supplementalIds.filter((id) => !formC?.ids.includes(id));

const report = {
  version: blueprint.version,
  legalBaseline: blueprint.legalBaseline,
  total: Object.keys(questions).length,
  coreQuestions: allIds.length,
  supplementalQuestions: supplementalIds.length,
  sections: Object.fromEntries(
    blueprint.sections.map((section) => [
      section.id,
      section.chapters.flatMap((chapter) => chapter.ids).length
    ])
  ),
  formats: formatCounts,
  answers: answerCounts,
  dailyBlocks: blueprint.dailyBlocks.length,
  studyTargets: blueprint.studyTargets,
  masteryDailyQuotas: blueprint.masteryDailyQuotas,
  mockForms: blueprint.mockForms.map((form) => ({
    id: form.id,
    questions: form.ids.length,
    evidenceClass: form.evidenceClass || "internal-core-practice"
  })),
  mockCoverage: {
    distinctFormIds: blueprint.mockForms.map((form) => form.id),
    unionQuestions: mockUnionIds.size,
    supplementalInFormC: formC ? formC.ids.filter((id) => supplementalIds.includes(id)).length : 0,
    formCOmittedSupplementalIds,
    crossFormOverlap: formOverlapReport
  },
  sourceUrls: new Set(Object.values(questions).map((question) => question.sourceUrl)).size,
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
