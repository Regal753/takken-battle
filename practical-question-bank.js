"use strict";

(() => {
  const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
  const baseQuestions = window.TAKKEN_EXAM_QUESTIONS;
  if (!blueprint || !baseQuestions) {
    throw new Error("exam blueprint and questions must be loaded before practical variants");
  }

  const kana = Object.freeze(["ア", "イ", "ウ", "エ"]);
  const countLabels = Object.freeze(["一つ", "二つ", "三つ", "四つ"]);
  const truthPatterns = Object.freeze([
    Object.freeze({ key: "a-only", label: "アのみ正しい", a: true, b: false }),
    Object.freeze({ key: "b-only", label: "イのみ正しい", a: false, b: true }),
    Object.freeze({ key: "both", label: "ア・イとも正しい", a: true, b: true }),
    Object.freeze({ key: "neither", label: "ア・イとも誤り", a: false, b: false })
  ]);
  const answerSlotPermutations = Object.freeze([
    Object.freeze([2, 0, 3, 1]),
    Object.freeze([1, 3, 0, 2]),
    Object.freeze([3, 1, 0, 2]),
    Object.freeze([1, 2, 3, 0]),
    Object.freeze([2, 3, 1, 0]),
    Object.freeze([3, 0, 2, 1]),
    Object.freeze([0, 3, 1, 2]),
    Object.freeze([2, 1, 3, 0])
  ]);

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function stableHash(value) {
    return [...String(value || "")].reduce(
      (hash, character) => ((hash * 31) + character.codePointAt(0)) >>> 0,
      2166136261
    );
  }

  function rotate(values, offset) {
    if (!values.length) return [];
    const start = ((offset % values.length) + values.length) % values.length;
    return [...values.slice(start), ...values.slice(0, start)];
  }

  function reasonText(line) {
    return cleanText(line).replace(/^\s*(?:[ア-ン]|[0-9０-９]+)\s*[○×]\s*/, "");
  }

  function questionContext(question) {
    const firstLine = String(question.text || "")
      .split(/\r?\n/)
      .map(cleanText)
      .find(Boolean);
    return firstLine || `論点「${cleanText(question.tag)}」の事例`;
  }

  function statementTexts(question) {
    if (question.format !== "個数問題") return question.choices.map(cleanText);
    const statements = String(question.text || "")
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([アイウエ])\s+(.+)$/))
      .filter(Boolean)
      .map((match) => cleanText(match[2]));
    if (statements.length !== 4) {
      throw new Error(`${question.id}: count-question statements could not be extracted`);
    }
    return statements;
  }

  function factsFor(question) {
    const explanationLines = Array.isArray(question.statementExplanations)
      ? question.statementExplanations
      : question.choiceExplanations;
    if (!Array.isArray(explanationLines) || explanationLines.length !== 4) {
      throw new Error(`${question.id}: four source explanations are required`);
    }
    const context = questionContext(question);
    const statements = statementTexts(question);
    return explanationLines.map((line, index) => {
      const marker = String(line).match(/[○×]/)?.[0];
      if (!marker) throw new Error(`${question.id}/${index + 1}: truth marker is missing`);
      return Object.freeze({
        key: `${question.id}:${index}`,
        questionId: question.id,
        index,
        context,
        statement: statements[index],
        displayStatement: `【前提】${context} 【判断】${statements[index]}`,
        truth: marker === "○",
        reason: reasonText(line),
        explain: cleanText(question.explain),
        trap: cleanText(question.trap),
        memoryRule: cleanText(question.memoryRule),
        sourceRef: cleanText(question.sourceLocator || question.sourceRef),
        sourceUrl: cleanText(question.sourceUrl),
        verifiedAt: cleanText(question.verifiedAt)
      });
    });
  }

  function uniqueTexts(values) {
    return [...new Set(values.map(cleanText).filter(Boolean))];
  }

  function uniqueFacts(values) {
    return [...new Map(values.map((fact) => [fact.key, fact])).values()];
  }

  function selectFacts(pool, count, seed, excluded = []) {
    const excludedKeys = new Set(excluded.map((fact) => fact.key));
    return rotate(pool, seed).filter((fact) => !excludedKeys.has(fact.key)).slice(0, count);
  }

  function ensureMultipleQuestions(selected, pool, lockedCount = 0) {
    if (new Set(selected.map((fact) => fact.questionId)).size > 1) return selected;
    const replacement = pool.find((fact) =>
      fact.questionId !== selected[0]?.questionId &&
      !selected.some((item) => item.key === fact.key)
    );
    if (!replacement || selected.length <= lockedCount) return selected;
    return [...selected.slice(0, -1), replacement];
  }

  function placeTargetAtSlot(target, distractors, slot) {
    const result = [...distractors];
    result.splice(slot, 0, target);
    return result;
  }

  function commonQuestionFields(unit, unitIndex, variantIndex, facts, answer) {
    const sourceQuestionIds = uniqueTexts(facts.map((fact) => fact.questionId));
    return {
      id: `pv-${unit.id}-${String(variantIndex + 1).padStart(2, "0")}`,
      sectionId: unit.sectionId,
      scopeId: unit.scopeId,
      unitId: unit.id,
      unitLabel: unit.label,
      unitPage: unit.page,
      unitIndex,
      variantIndex,
      queueRank: ((variantIndex - (stableHash(unit.id) % 4)) + 4) % 4,
      sourceQuestionIds: Object.freeze(sourceQuestionIds),
      sourceFacts: Object.freeze(facts.map((fact) => Object.freeze({
        key: fact.key,
        truth: fact.truth,
        context: fact.context,
        statement: fact.statement,
        reason: fact.reason
      }))),
      answer,
      trap: uniqueTexts(facts.map((fact) => fact.trap)).join("／"),
      memoryRule: uniqueTexts(facts.map((fact) => fact.memoryRule)).join("／"),
      sourceRef: uniqueTexts(facts.map((fact) => fact.sourceRef)).join("／"),
      sourceUrls: Object.freeze(uniqueTexts(facts.map((fact) => fact.sourceUrl))),
      legalBaseline: blueprint.legalBaseline,
      verifiedAt: facts.map((fact) => fact.verifiedAt).filter(Boolean).sort().at(-1),
      qualityVersion: 3
    };
  }

  function buildSingleChoice(unit, unitIndex, variantIndex, facts, answerSlot) {
    const trueFacts = facts.filter((fact) => fact.truth);
    const falseFacts = facts.filter((fact) => !fact.truth);
    const askForTruth = falseFacts.length >= 3;
    const targetPool = askForTruth ? trueFacts : falseFacts;
    const distractorPool = askForTruth ? falseFacts : trueFacts;
    const target = rotate(targetPool, unitIndex + variantIndex)[0];
    let distractors = selectFacts(
      distractorPool,
      3,
      unitIndex * 5 + variantIndex * 3,
      [target]
    );
    distractors = ensureMultipleQuestions([target, ...distractors], distractorPool, 1).slice(1);
    if (!target || distractors.length !== 3) {
      throw new Error(`${unit.id}: single-choice variant could not be built`);
    }
    const displayedFacts = placeTargetAtSlot(target, distractors, answerSlot);
    const askLabel = askForTruth ? "正しい" : "誤っている";
    const correctness = askForTruth ? "正しい肢" : "誤っている肢";
    const fields = commonQuestionFields(unit, unitIndex, variantIndex, displayedFacts, answerSlot);
    const explanations = displayedFacts.map((fact, index) =>
      `${index + 1} ${fact.truth ? "○" : "×"} ${fact.reason}`
    );
    return Object.freeze({
      ...fields,
      variationKind: "same-unit-contextual-single-choice",
      format: "単一選択",
      text: `同じ単元の別事例を比較する。次の記述のうち、${askLabel}ものはどれか。`,
      choices: Object.freeze(displayedFacts.map((fact) => fact.displayStatement)),
      explain: `${correctness}を一つ探す。正解肢は「${target.statement}」。理由は、${target.reason}`,
      statementExplanations: Object.freeze(explanations),
      choiceExplanations: Object.freeze(explanations),
      level: "実践・事例比較"
    });
  }

  function selectCrossQuestionPair(leftPool, rightPool, seed) {
    const leftCandidates = rotate(leftPool, seed);
    const rightCandidates = rotate(rightPool, seed * 3 + 1);
    for (const left of leftCandidates) {
      const right = rightCandidates.find((candidate) =>
        candidate.questionId !== left.questionId && candidate.key !== left.key
      );
      if (right) return [left, right];
    }
    const left = leftCandidates[0];
    const right = rightCandidates.find((candidate) => candidate.key !== left?.key);
    return left && right ? [left, right] : [];
  }

  function buildCombination(unit, unitIndex, variantIndex, facts, answerSlot) {
    const trueFacts = facts.filter((fact) => fact.truth);
    const falseFacts = facts.filter((fact) => !fact.truth);
    const pattern = truthPatterns[stableHash(`${unit.id}:combination`) % truthPatterns.length];
    const pair = selectCrossQuestionPair(
      pattern.a ? trueFacts : falseFacts,
      pattern.b ? trueFacts : falseFacts,
      unitIndex + 7
    );
    if (pair.length !== 2) throw new Error(`${unit.id}: combination variant could not be built`);
    const [left, right] = pair;
    const distractorPatterns = rotate(
      truthPatterns.filter((candidate) => candidate.key !== pattern.key),
      unitIndex
    );
    const displayedPatterns = placeTargetAtSlot(pattern, distractorPatterns, answerSlot);
    const fields = commonQuestionFields(unit, unitIndex, variantIndex, pair, answerSlot);
    return Object.freeze({
      ...fields,
      variationKind: "same-unit-contextual-combination",
      format: "組合せ問題",
      text: `次のア・イを別々に判定し、正しい組合せを選べ。\nア ${left.displayStatement}\nイ ${right.displayStatement}`,
      choices: Object.freeze(displayedPatterns.map((candidate) => candidate.label)),
      explain: `アは${left.truth ? "正しい" : "誤り"}、イは${right.truth ? "正しい" : "誤り"}。根拠は、アが「${left.reason}」、イが「${right.reason}」。`,
      statementExplanations: Object.freeze([
        `ア ${left.truth ? "○" : "×"} ${left.reason}`,
        `イ ${right.truth ? "○" : "×"} ${right.reason}`
      ]),
      choiceExplanations: Object.freeze(displayedPatterns.map((candidate, index) => {
        const actualMarks = `ア${left.truth ? "○" : "×"}・イ${right.truth ? "○" : "×"}`;
        return index === answerSlot
          ? `${index + 1} ○ 実際は${actualMarks}なので「${candidate.label}」が一致する。`
          : `${index + 1} × 実際は${actualMarks}なので「${candidate.label}」とは一致しない。`;
      })),
      level: "実践・組合せ"
    });
  }

  function buildCount(unit, unitIndex, variantIndex, facts, answerSlot) {
    const trueFacts = facts.filter((fact) => fact.truth);
    const mandatoryTrue = rotate(trueFacts, unitIndex + 1)[0];
    let selected = uniqueFacts([
      mandatoryTrue,
      ...selectFacts(facts, 3, unitIndex * 3 + 2, [mandatoryTrue])
    ]);
    selected = ensureMultipleQuestions(selected, facts, 1);
    if (selected.length !== 4) throw new Error(`${unit.id}: count variant could not be built`);
    selected = rotate(selected, unitIndex % selected.length);
    const correctCount = selected.filter((fact) => fact.truth).length;
    const correctLabel = countLabels[correctCount - 1];
    const distractorLabels = rotate(
      countLabels.filter((label) => label !== correctLabel),
      unitIndex
    );
    const displayedLabels = placeTargetAtSlot(correctLabel, distractorLabels, answerSlot);
    const fields = commonQuestionFields(unit, unitIndex, variantIndex, selected, answerSlot);
    return Object.freeze({
      ...fields,
      variationKind: "same-unit-contextual-count",
      format: "個数問題",
      text: `次の記述のうち、正しいものはいくつあるか。\n${selected.map((fact, index) => `${kana[index]} ${fact.displayStatement}`).join("\n")}`,
      choices: Object.freeze(displayedLabels),
      explain: `各記述を先に○×判定する。正しいのは${selected.map((fact, index) => fact.truth ? kana[index] : "").filter(Boolean).join("・")}の${correctCount}つなので、答えは「${correctLabel}」。`,
      statementExplanations: Object.freeze(selected.map((fact, index) =>
        `${kana[index]} ${fact.truth ? "○" : "×"} ${fact.reason}`
      )),
      choiceExplanations: Object.freeze(displayedLabels.map((label, index) =>
        index === answerSlot
          ? `${index + 1} ○ 正しい記述は${correctCount}つなので「${label}」が一致する。`
          : `${index + 1} × 正しい記述は${correctCount}つであり「${label}」ではない。`
      )),
      level: "実践・個数"
    });
  }

  function buildVariants(unit, unitIndex, facts) {
    const answerSlots = answerSlotPermutations[stableHash(unit.id) % answerSlotPermutations.length];
    return [
      buildSingleChoice(unit, unitIndex, 0, facts, answerSlots[0]),
      buildSingleChoice(unit, unitIndex, 1, facts, answerSlots[1]),
      buildCombination(unit, unitIndex, 2, facts, answerSlots[2]),
      buildCount(unit, unitIndex, 3, facts, answerSlots[3])
    ];
  }

  const units = [];
  const questions = [];
  let unitIndex = 0;
  Object.entries(blueprint.textbookRanges).forEach(([scopeId, range]) => {
    range.chapters.forEach((chapter) => {
      const sourceQuestions = chapter.ids.map((id) => baseQuestions[id]).filter(Boolean);
      if (sourceQuestions.length < 2) {
        throw new Error(`${chapter.id}: at least two source questions are required`);
      }
      const sectionId = chapter.sectionId || sourceQuestions[0].sectionId;
      const unit = Object.freeze({
        id: chapter.id,
        scopeId,
        sectionId,
        label: chapter.label,
        page: chapter.page,
        part: range.part,
        sourceQuestionIds: Object.freeze(sourceQuestions.map((question) => question.id))
      });
      const facts = sourceQuestions.flatMap(factsFor);
      questions.push(...buildVariants(unit, unitIndex, facts));
      units.push(unit);
      unitIndex += 1;
    });
  });

  const questionsById = Object.freeze(Object.fromEntries(
    questions.map((question) => [question.id, question])
  ));
  const scopeCounts = Object.freeze(Object.fromEntries(
    Object.keys(blueprint.textbookRanges).map((scopeId) => [
      scopeId,
      questions.filter((question) => question.scopeId === scopeId).length
    ])
  ));

  window.TAKKEN_PRACTICAL_VARIATIONS = Object.freeze({
    VERSION: 2,
    LEGAL_BASELINE: blueprint.legalBaseline,
    VARIANTS_PER_UNIT: 4,
    QUESTIONS: Object.freeze(questions),
    QUESTIONS_BY_ID: questionsById,
    UNITS: Object.freeze(units),
    TRUTH_PATTERNS: truthPatterns,
    SCOPE_COUNTS: scopeCounts
  });
})();
