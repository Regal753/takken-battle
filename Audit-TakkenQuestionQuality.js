"use strict";

global.window = {};
require("./exam-blueprint.js");
require("./exam-question-core.js");
require("./exam-questions-rights.js");
require("./exam-questions-restrictions.js");
require("./exam-questions-tax-other.js");
require("./exam-questions-business.js");

const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
const questions = Object.values(window.TAKKEN_EXAM_QUESTIONS);
const issues = [];
const allowedSourceHosts = new Set([
  "elaws.e-gov.go.jp",
  "laws.e-gov.go.jp",
  "www.jhf.go.jp",
  "www.mlit.go.jp",
  "www.moj.go.jp",
  "www.retio.or.jp",
  "www.rftc.jp"
]);

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u3000、。・「」『』（）()【】［］,.!?！？:：;；]/g, "");
}

function verdictOf(value) {
  return String(value || "").match(/[○×]/)?.[0] || "";
}

function bigrams(value) {
  const normalized = normalize(value);
  if (normalized.length < 2) return new Set([normalized]);
  return new Set(
    Array.from({ length: normalized.length - 1 }, (_, index) =>
      normalized.slice(index, index + 2)
    )
  );
}

function jaccard(left, right) {
  const leftSet = bigrams(left);
  const rightSet = bigrams(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union ? intersection / union : 0;
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function longestAnswerRun(ids) {
  let longest = 0;
  let run = 0;
  let previous = null;
  ids.forEach((id) => {
    const answer = window.TAKKEN_EXAM_QUESTIONS[id]?.answer;
    run = answer === previous ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = answer;
  });
  return longest;
}

const sourceUsage = {};
const tagUsage = {};
const choiceOwners = new Map();
const correctChoiceLengths = [];
const distractorLengths = [];
const answerCuePattern = /(必ず|常に|絶対|一切|すべて|例外なく|のみ)/;
const scenarioCuePattern =
  /([A-DＡ-Ｄ][、はがとの]|買主|売主|依頼者|宅地建物取引業者|未成年者|代理人|賃貸人|賃借人|相続人|所有者|抵当権者)/;
const applicationCuePattern =
  /(場合|とき|できる|できない|必要|不要|有効|無効|正しい|誤っている)/;
let correctChoicesWithCue = 0;
let distractorsWithCue = 0;

questions.forEach((question) => {
  tagUsage[question.tag] = (tagUsage[question.tag] || 0) + 1;
  sourceUsage[question.sourceRef] = (sourceUsage[question.sourceRef] || 0) + 1;

  let sourceHost = "";
  try {
    sourceHost = new URL(question.sourceUrl).hostname;
  } catch {
    issues.push(`${question.id}: source URL is not parseable`);
  }
  if (sourceHost && !allowedSourceHosts.has(sourceHost)) {
    issues.push(`${question.id}: non-official source host ${sourceHost}`);
  }

  const verdicts = question.choiceExplanations.map(verdictOf);
  if (verdicts.some((verdict) => !verdict)) {
    issues.push(`${question.id}: a choice explanation lacks a verdict`);
  }

  if (question.format === "単一選択") {
    const asksIncorrect = question.text.includes("誤っている");
    const expectedAnswerVerdict = asksIncorrect ? "×" : "○";
    const expectedOtherVerdict = asksIncorrect ? "○" : "×";
    if (verdicts[question.answer] !== expectedAnswerVerdict) {
      issues.push(
        `${question.id}: answer verdict ${verdicts[question.answer]} does not match ${expectedAnswerVerdict}`
      );
    }
    verdicts.forEach((verdict, index) => {
      if (index !== question.answer && verdict !== expectedOtherVerdict) {
        issues.push(`${question.id}: distractor ${index + 1} has inconsistent verdict ${verdict}`);
      }
    });
  } else if (question.format === "個数問題") {
    const correctCount = verdicts.filter((verdict) => verdict === "○").length;
    if (correctCount !== question.answer + 1) {
      issues.push(
        `${question.id}: count answer ${question.answer + 1} does not match ${correctCount} true statements`
      );
    }
  } else {
    issues.push(`${question.id}: unknown format ${question.format}`);
  }

  question.choices.forEach((choice, index) => {
    const choiceKey = normalize(choice);
    const verdict = verdicts[index];
    const existing = choiceOwners.get(choiceKey) || [];
    existing.forEach((owner) => {
      if (choiceKey.length >= 18 && owner.verdict !== verdict) {
        issues.push(
          `${question.id}: choice contradicts ${owner.id} (${owner.verdict} -> ${verdict})`
        );
      }
    });
    existing.push({ id: question.id, verdict });
    choiceOwners.set(choiceKey, existing);

    const choiceLength = normalize(choice).length;
    if (index === question.answer) {
      correctChoiceLengths.push(choiceLength);
      if (answerCuePattern.test(choice)) correctChoicesWithCue += 1;
    } else {
      distractorLengths.push(choiceLength);
      if (answerCuePattern.test(choice)) distractorsWithCue += 1;
    }
  });
});

const promptPairs = [];
for (let leftIndex = 0; leftIndex < questions.length; leftIndex += 1) {
  const left = questions[leftIndex];
  const leftLead = left.text.split("\n")[0];
  for (let rightIndex = leftIndex + 1; rightIndex < questions.length; rightIndex += 1) {
    const right = questions[rightIndex];
    const rightLead = right.text.split("\n")[0];
    if (Math.min(normalize(leftLead).length, normalize(rightLead).length) < 18) continue;
    const similarity = jaccard(leftLead, rightLead);
    if (similarity >= 0.7) {
      promptPairs.push({
        left: left.id,
        right: right.id,
        similarity: Number(similarity.toFixed(3))
      });
    }
    if (similarity >= 0.97) {
      issues.push(`${left.id}/${right.id}: near-duplicate prompt ${similarity.toFixed(3)}`);
    }
  }
}
promptPairs.sort((left, right) => right.similarity - left.similarity);

const correctLengthMean = mean(correctChoiceLengths);
const distractorLengthMean = mean(distractorLengths);
const lengthRatio = distractorLengthMean
  ? correctLengthMean / distractorLengthMean
  : 0;
if (lengthRatio < 0.8 || lengthRatio > 1.25) {
  issues.push(`answer-length cue ratio is ${lengthRatio.toFixed(3)}`);
}

const correctCueRate = correctChoicesWithCue / Math.max(1, questions.length);
const distractorCueRate = distractorsWithCue / Math.max(1, distractorLengths.length);
if (Math.abs(correctCueRate - distractorCueRate) > 0.2) {
  issues.push(
    `absolute-word cue gap is too wide: answer=${correctCueRate.toFixed(3)}, distractor=${distractorCueRate.toFixed(3)}`
  );
}

const mockAnswerRuns = Object.fromEntries(
  blueprint.mockForms.map((form) => [form.id, longestAnswerRun(form.ids)])
);
Object.entries(mockAnswerRuns).forEach(([formId, run]) => {
  if (run > 2) issues.push(`${formId}: answer-position run is ${run}`);
});

const repeatedChoices = [...choiceOwners.entries()]
  .filter(([choice, owners]) => choice.length >= 18 && owners.length > 1)
  .map(([, owners]) => owners.map((owner) => owner.id));

const report = {
  total: questions.length,
  formats: Object.fromEntries(
    [...new Set(questions.map((question) => question.format))].map((format) => [
      format,
      questions.filter((question) => question.format === format).length
    ])
  ),
  uniqueTags: Object.keys(tagUsage).length,
  maxQuestionsPerTag: Math.max(...Object.values(tagUsage)),
  sourceUsage,
  officialSourceHosts: [...new Set(questions.map((question) => new URL(question.sourceUrl).hostname))].sort(),
  answerLength: {
    correctMean: Number(correctLengthMean.toFixed(2)),
    distractorMean: Number(distractorLengthMean.toFixed(2)),
    ratio: Number(lengthRatio.toFixed(3))
  },
  absoluteWordCueRate: {
    answer: Number(correctCueRate.toFixed(3)),
    distractor: Number(distractorCueRate.toFixed(3))
  },
  comprehensionProfile: {
    scenarioPrompts: questions.filter((question) => scenarioCuePattern.test(question.text)).length,
    applicationPrompts: questions.filter((question) => applicationCuePattern.test(question.text)).length,
    fourChoiceExplanations: questions.filter(
      (question) => Array.isArray(question.choiceExplanations) && question.choiceExplanations.length === 4
    ).length,
    trapExplanations: questions.filter((question) => normalize(question.trap).length >= 8).length,
    memoryRules: questions.filter((question) => normalize(question.memoryRule).length >= 8).length
  },
  mockAnswerRuns,
  repeatedChoiceGroups: repeatedChoices.length,
  nearPromptPairs: promptPairs.slice(0, 10),
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
