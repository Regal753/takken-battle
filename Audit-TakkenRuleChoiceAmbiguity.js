"use strict";

global.window = {};
require("./exam-blueprint.js");
require("./exam-question-core.js");
require("./exam-questions-rights.js");
require("./exam-questions-restrictions.js");
require("./exam-questions-tax-other.js");
require("./exam-questions-business.js");
require("./practical-question-bank.js");
require("./question-bank.js");
require("./understanding-system.js");

const system = window.TAKKEN_UNDERSTANDING;
const RISK_THRESHOLD = 0.4;

function normalized(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s\u3000、。・「」『』（）()【】［］,.!?！？:：;；○×0-9]/g, "")
    .toLowerCase();
}

function bigrams(value) {
  const text = normalized(value);
  const grams = new Set();
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.add(text.slice(index, index + 2));
  }
  return grams;
}

function diceSimilarity(left, right) {
  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  if (!leftGrams.size || !rightGrams.size) return 0;
  let overlap = 0;
  leftGrams.forEach((gram) => {
    if (rightGrams.has(gram)) overlap += 1;
  });
  return (2 * overlap) / (leftGrams.size + rightGrams.size);
}

const pairs = [];
Object.values(system.CHECKS).forEach((check) => {
  const choices = check.rule.choices;
  for (let left = 0; left < choices.length; left += 1) {
    for (let right = left + 1; right < choices.length; right += 1) {
      pairs.push({
        questionId: check.id,
        left,
        right,
        score: diceSimilarity(choices[left].text, choices[right].text),
        leftSource: choices[left].sourceQuestionId,
        rightSource: choices[right].sourceQuestionId,
        leftText: choices[left].text,
        rightText: choices[right].text,
        involvesCorrect: left === check.rule.answer || right === check.rule.answer
      });
    }
  }
});

pairs.sort((left, right) => right.score - left.score);
const correctDistractorPairs = pairs.filter((pair) => pair.involvesCorrect);
const riskyPairs = correctDistractorPairs.filter((pair) => pair.score >= RISK_THRESHOLD);
console.log(JSON.stringify({
  status: riskyPairs.length ? "ng" : "ok",
  riskThreshold: RISK_THRESHOLD,
  pairs: pairs.length,
  correctDistractorPairs: correctDistractorPairs.length,
  maxCorrectDistractorSimilarity: Math.max(...correctDistractorPairs.map((pair) => pair.score)),
  riskyPairs,
  topCorrectDistractorPairs: correctDistractorPairs.slice(0, 10)
}, null, 2));
if (riskyPairs.length) process.exit(1);
