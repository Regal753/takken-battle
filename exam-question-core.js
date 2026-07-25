"use strict";

// 全分野コア問題の共通ビルダー。問題本文はすべてオリジナル。
(() => {
  const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
  if (!blueprint) throw new Error("exam-blueprint.js must be loaded first");

  const questions = {};
  const kana = ["ア", "イ", "ウ", "エ"];

  function sourceFor(sourceKey) {
    const source = blueprint.sources[sourceKey];
    if (!source) throw new Error(`Unknown source: ${sourceKey}`);
    return source;
  }

  function add(input) {
    const {
      id,
      sectionId,
      tag,
      sourceKey,
      ask = "correct",
      prompt,
      choices,
      truths,
      notes,
      explain,
      trap,
      memoryRule = explain,
      level = "本試験標準"
    } = input;
    if (questions[id]) throw new Error(`Duplicate question id: ${id}`);
    if (!Array.isArray(choices) || choices.length !== 4) throw new Error(`${id}: choices must be 4`);
    if (!Array.isArray(truths) || truths.length !== 4) throw new Error(`${id}: truths must be 4`);
    if (!Array.isArray(notes) || notes.length !== 4) throw new Error(`${id}: notes must be 4`);
    const candidates = truths
      .map((truth, index) => ({ truth: Boolean(truth), index }))
      .filter((item) => ask === "incorrect" ? !item.truth : item.truth);
    if (candidates.length !== 1) {
      throw new Error(`${id}: ${ask} question must have exactly one answer`);
    }
    const numericId = Number.parseInt(String(id).slice(1), 10) || 1;
    const targetAnswer = (numericId - 1) % 4;
    const shift = (candidates[0].index - targetAnswer + 4) % 4;
    const originIndexes = [0, 1, 2, 3].map((_, index) => (index + shift) % 4);
    const balancedChoices = originIndexes.map((index) => choices[index]);
    const balancedTruths = originIndexes.map((index) => Boolean(truths[index]));
    const balancedNotes = originIndexes.map((index) => notes[index]);
    const source = sourceFor(sourceKey);
    questions[id] = {
      id,
      sectionId,
      tag,
      format: "単一選択",
      text: `${prompt}\n次の記述のうち、${ask === "incorrect" ? "誤っている" : "正しい"}ものはどれか。`,
      choices: balancedChoices,
      answer: targetAnswer,
      explain,
      trap,
      choiceExplanations: balancedChoices.map((_, index) =>
        `${index + 1} ${balancedTruths[index] ? "○" : "×"} ${balancedNotes[index]}`
      ),
      choiceOriginIndexes: originIndexes,
      memoryRule,
      sourceRef: source.label,
      sourceUrl: source.url,
      legalBaseline: blueprint.legalBaseline,
      verifiedAt: "2026-07-26",
      level,
      qualityVersion: 1
    };
  }

  function addCount(input) {
    const {
      id,
      sectionId,
      tag,
      sourceKey,
      prompt,
      statements,
      truths,
      notes,
      explain,
      trap,
      memoryRule = explain,
      level = "本試験標準"
    } = input;
    if (questions[id]) throw new Error(`Duplicate question id: ${id}`);
    if (!Array.isArray(statements) || statements.length !== 4) {
      throw new Error(`${id}: statements must be 4`);
    }
    if (!Array.isArray(truths) || truths.length !== 4) throw new Error(`${id}: truths must be 4`);
    if (!Array.isArray(notes) || notes.length !== 4) throw new Error(`${id}: notes must be 4`);
    const correctCount = truths.filter(Boolean).length;
    if (correctCount < 1 || correctCount > 4) throw new Error(`${id}: invalid correct count`);
    const source = sourceFor(sourceKey);
    questions[id] = {
      id,
      sectionId,
      tag,
      format: "個数問題",
      text: `${prompt}\n${statements.map((statement, index) => `${kana[index]} ${statement}`).join("\n")}`,
      choices: ["一つ", "二つ", "三つ", "四つ"],
      answer: correctCount - 1,
      explain,
      trap,
      choiceExplanations: statements.map((_, index) =>
        `${kana[index]} ${truths[index] ? "○" : "×"} ${notes[index]}`
      ),
      memoryRule,
      sourceRef: source.label,
      sourceUrl: source.url,
      legalBaseline: blueprint.legalBaseline,
      verifiedAt: "2026-07-26",
      level,
      qualityVersion: 1
    };
  }

  window.TAKKEN_EXAM_QUESTIONS = questions;
  window.TAKKEN_EXAM_Q = { add, addCount };
})();
