"use strict";

(() => {
  const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
  const baseQuestions = window.TAKKEN_EXAM_QUESTIONS;
  if (!blueprint || !baseQuestions) {
    throw new Error("exam blueprint and questions must be loaded before practical variants");
  }

  const truthPatterns = Object.freeze([
    Object.freeze({ key: "a-only", label: "アのみ正しい", a: true, b: false }),
    Object.freeze({ key: "b-only", label: "イのみ正しい", a: false, b: true }),
    Object.freeze({ key: "both", label: "ア・イとも正しい", a: true, b: true }),
    Object.freeze({ key: "neither", label: "ア・イとも誤り", a: false, b: false })
  ]);

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function reasonText(line) {
    return cleanText(line).replace(/^\s*(?:[ア-ン]|[0-9０-９]+)\s*[○×]\s*/, "");
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
    const statements = statementTexts(question);
    return explanationLines.map((line, index) => {
      const marker = String(line).match(/[○×]/)?.[0];
      if (!marker) throw new Error(`${question.id}/${index + 1}: truth marker is missing`);
      return Object.freeze({
        key: `${question.id}:${index}`,
        questionId: question.id,
        index,
        statement: statements[index],
        truth: marker === "○",
        reason: reasonText(line),
        explain: cleanText(question.explain),
        trap: cleanText(question.trap),
        memoryRule: cleanText(question.memoryRule),
        sourceRef: cleanText(question.sourceRef),
        sourceUrl: cleanText(question.sourceUrl),
        verifiedAt: cleanText(question.verifiedAt)
      });
    });
  }

  function uniqueTexts(values) {
    return [...new Set(values.map(cleanText).filter(Boolean))];
  }

  function pairKey(left, right) {
    return [left.key, right.key].sort().join("|");
  }

  function pickFactPair(facts, pattern, seed, usedPairs, unitId) {
    const leftCandidates = facts.filter((fact) => fact.truth === pattern.a);
    if (!leftCandidates.length) return null;
    for (let leftOffset = 0; leftOffset < leftCandidates.length; leftOffset += 1) {
      const left = leftCandidates[(seed + leftOffset) % leftCandidates.length];
      const rightCandidates = facts.filter((fact) =>
        fact.truth === pattern.b &&
        fact.questionId !== left.questionId &&
        fact.statement !== left.statement
      );
      for (let rightOffset = 0; rightOffset < rightCandidates.length; rightOffset += 1) {
        const right = rightCandidates[(seed * 3 + rightOffset) % rightCandidates.length];
        const key = pairKey(left, right);
        if (!usedPairs.has(key)) {
          usedPairs.add(key);
          return { left, right };
        }
      }
    }
    return null;
  }

  function patternReason(pattern, actual, isCorrect) {
    const actualLabel = truthPatterns.find((candidate) =>
      candidate.a === actual.a && candidate.b === actual.b
    )?.label;
    const marks = `ア${actual.a ? "○" : "×"}・イ${actual.b ? "○" : "×"}`;
    return isCorrect
      ? `実際は${marks}なので、「${pattern.label}」が正しい組合せとなる。`
      : `実際は${marks}で正解は「${actualLabel}」のため、「${pattern.label}」とは一致しない。`;
  }

  function buildVariant(unit, unitIndex, variantIndex, facts, usedPairs) {
    let selectedPattern = null;
    let selectedPair = null;
    for (let patternOffset = 0; patternOffset < truthPatterns.length; patternOffset += 1) {
      const candidatePattern = truthPatterns[(variantIndex + patternOffset) % truthPatterns.length];
      const candidatePair = pickFactPair(
        facts,
        candidatePattern,
        unitIndex * 19 + variantIndex * 7 + patternOffset,
        usedPairs,
        unit.id
      );
      if (candidatePair) {
        selectedPattern = candidatePattern;
        selectedPair = candidatePair;
        break;
      }
    }
    if (!selectedPair || !selectedPattern) {
      throw new Error(`${unit.id}: four unique cross-question fact pairs could not be built`);
    }
    const { left, right } = selectedPair;
    const actual = { a: left.truth, b: right.truth };
    const semanticAnswer = truthPatterns.findIndex((pattern) =>
      pattern.a === selectedPattern.a && pattern.b === selectedPattern.b
    );
    const shift = (semanticAnswer - variantIndex + truthPatterns.length) % truthPatterns.length;
    const displayedPatterns = truthPatterns.map((_, index) =>
      truthPatterns[(index + shift) % truthPatterns.length]
    );
    const answer = variantIndex;
    const sourceQuestionIds = [left.questionId, right.questionId];
    const sourceUrls = uniqueTexts([left.sourceUrl, right.sourceUrl]);
    const sourceRefs = uniqueTexts([left.sourceRef, right.sourceRef]);
    const variantNumber = String(variantIndex + 1).padStart(2, "0");
    const id = `pv-${unit.id}-${variantNumber}`;
    const statementExplanations = [
      `ア ${left.truth ? "○" : "×"} ${left.reason}`,
      `イ ${right.truth ? "○" : "×"} ${right.reason}`
    ];

    return Object.freeze({
      id,
      sectionId: unit.sectionId,
      scopeId: unit.scopeId,
      unitId: unit.id,
      unitLabel: unit.label,
      unitPage: unit.page,
      unitIndex,
      variantIndex,
      variationKind: "same-unit-two-fact-combination",
      sourceQuestionIds: Object.freeze(sourceQuestionIds),
      sourceFacts: Object.freeze([
        Object.freeze({ key: left.key, truth: left.truth, statement: left.statement, reason: left.reason }),
        Object.freeze({ key: right.key, truth: right.truth, statement: right.statement, reason: right.reason })
      ]),
      format: "組合せ問題",
      text: `次のア・イの記述について、正しい組合せはどれか。\nア ${left.statement}\nイ ${right.statement}`,
      choices: Object.freeze(displayedPatterns.map((pattern) => pattern.label)),
      answer,
      explain: `アは${left.truth ? "正しい" : "誤り"}、イは${right.truth ? "正しい" : "誤り"}。二つを別々に判定してから組合せを選ぶ。`,
      trap: uniqueTexts([left.trap, right.trap]).join("／"),
      memoryRule: uniqueTexts([left.memoryRule, right.memoryRule]).join("／"),
      statementExplanations: Object.freeze(statementExplanations),
      choiceExplanations: Object.freeze(
        displayedPatterns.map((pattern, index) =>
          `${index + 1} ${index === answer ? "○" : "×"} ${patternReason(pattern, actual, index === answer)}`
        )
      ),
      sourceRef: sourceRefs.join("／"),
      sourceUrls: Object.freeze(sourceUrls),
      legalBaseline: blueprint.legalBaseline,
      verifiedAt: [left.verifiedAt, right.verifiedAt].sort().at(-1),
      level: "実践組合せ",
      qualityVersion: 2
    });
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
      const usedPairs = new Set();
      truthPatterns.forEach((_, variantIndex) => {
        questions.push(buildVariant(unit, unitIndex, variantIndex, facts, usedPairs));
      });
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
    VERSION: 1,
    LEGAL_BASELINE: blueprint.legalBaseline,
    VARIANTS_PER_UNIT: truthPatterns.length,
    QUESTIONS: Object.freeze(questions),
    QUESTIONS_BY_ID: questionsById,
    UNITS: Object.freeze(units),
    TRUTH_PATTERNS: truthPatterns,
    SCOPE_COUNTS: scopeCounts
  });
})();
