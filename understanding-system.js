"use strict";

(() => {
  const VERSION = 1;
  const blueprint = window.TAKKEN_EXAM_BLUEPRINT || {};
  const questions = {
    ...(window.TAKKEN_QUESTIONS || {}),
    ...(window.TAKKEN_EXAM_QUESTIONS || {})
  };
  const questionList = Object.values(questions);
  const practicalSystem = window.TAKKEN_PRACTICAL_VARIATIONS || {};
  const practicalQuestions = Array.isArray(practicalSystem.QUESTIONS)
    ? practicalSystem.QUESTIONS
    : [];
  const textbookUnits = Object.values(blueprint.textbookRanges || {})
    .flatMap((range) => range.chapters || []);
  const unitByQuestionId = Object.fromEntries(
    textbookUnits.flatMap((unit) =>
      (unit.ids || []).map((id) => [id, { id: unit.id, label: unit.label }])
    )
  );
  const orderedIds = [
    ...(blueprint.curriculumOrder || []),
    ...(blueprint.supplementalOrder || [])
  ];
  const orderedIndex = new Map(orderedIds.map((id, index) => [id, index]));

  function normalized(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[\s\u3000、。・「」『』（）()【】［］,.!?！？:：;；○×0-9]/g, "")
      .toLowerCase();
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function peerPriority(question, candidate) {
    const unit = unitByQuestionId[question.id]?.id || "";
    const candidateUnit = unitByQuestionId[candidate.id]?.id || "";
    if (unit && unit === candidateUnit) return 0;
    if (question.tag && question.tag === candidate.tag) return 1;
    if (question.sectionId && question.sectionId === candidate.sectionId) return 2;
    return 3;
  }

  function scenarioCue(question) {
    const firstLine = String(question.text || question.tag || "宅建の適用場面")
      .split("\n")[0]
      .replace(/\s+/g, " ")
      .trim();
    return firstLine.length > 72 ? `${firstLine.slice(0, 71)}…` : firstLine;
  }

  function correctPosition(questionId, kind) {
    const index = orderedIndex.has(questionId)
      ? orderedIndex.get(questionId)
      : stableHash(questionId) % 124;
    return kind === "rule" ? index % 4 : (index + 2) % 4;
  }

  function ruleChoiceSet(question) {
    const field = "memoryRule";
    const kind = "rule";
    const correctText = String(question[field] || "").trim();
    const correctNormalized = normalized(correctText);
    const used = new Set([correctNormalized]);
    const distractors = questionList
      .filter((candidate) => candidate.id !== question.id)
      .map((candidate) => ({
        sourceQuestionId: candidate.id,
        text: String(candidate[field] || "").trim(),
        priority: peerPriority(question, candidate),
        order: stableHash(`${question.id}:${kind}:${candidate.id}`)
      }))
      .filter((candidate) => {
        const key = normalized(candidate.text);
        if (!key || key.length < 10 || used.has(key)) return false;
        used.add(key);
        return true;
      })
      .sort((left, right) =>
        left.priority - right.priority ||
        left.order - right.order ||
        left.sourceQuestionId.localeCompare(right.sourceQuestionId)
      )
      .slice(0, 3)
      .map(({ sourceQuestionId, text }) => ({ sourceQuestionId, text }));

    if (distractors.length !== 3 || !correctText) {
      throw new Error(`${question.id}: ${kind} understanding choices could not be built`);
    }

    const answer = correctPosition(question.id, kind);
    const choices = [...distractors];
    choices.splice(answer, 0, {
      sourceQuestionId: question.id,
      text: correctText
    });
    return Object.freeze({
      kind,
      prompt: "この事例を切る判断軸はどれ？",
      scenario: scenarioCue(question),
      choices: Object.freeze(choices.map((choice) => Object.freeze(choice))),
      answer
    });
  }

  function transferSet(question) {
    const unitId = unitByQuestionId[question.id]?.id || "";
    const unitCandidates = practicalQuestions.filter((candidate) => candidate.unitId === unitId);
    const directCandidates = unitCandidates.filter((candidate) =>
      Array.isArray(candidate.sourceQuestionIds) && candidate.sourceQuestionIds.includes(question.id)
    );
    const pool = directCandidates.length ? directCandidates : unitCandidates;
    if (!pool.length) {
      throw new Error(`${question.id}: transfer question could not be built`);
    }
    const transfer = pool[stableHash(`${question.id}:transfer`) % pool.length];
    if (!Array.isArray(transfer.choices) || transfer.choices.length !== 4) {
      throw new Error(`${question.id}: transfer question must have four choices`);
    }
    return Object.freeze({
      kind: "transfer",
      prompt: "同じ単元の別事例へ、その判断軸を移せるか？",
      scenario: String(transfer.text || "").trim(),
      sourceQuestionId: transfer.id,
      sourceQuestionIds: Object.freeze([...(transfer.sourceQuestionIds || [])]),
      choices: Object.freeze(transfer.choices.map((text) => Object.freeze({
        sourceQuestionId: transfer.id,
        text: String(text || "").trim()
      }))),
      answer: transfer.answer,
      explain: String(transfer.explain || "").trim(),
      trap: String(transfer.trap || "").trim(),
      direct: Array.isArray(transfer.sourceQuestionIds) && transfer.sourceQuestionIds.includes(question.id)
    });
  }

  const checks = Object.fromEntries(orderedIds.map((id) => {
    const question = questions[id];
    if (!question) throw new Error(`${id}: source question missing`);
    const unit = unitByQuestionId[question.id] || { id: "", label: question.tag || "宅建" };
    return [question.id, Object.freeze({
      id: question.id,
      version: VERSION,
      unitId: unit.id,
      unitLabel: unit.label,
      rule: ruleChoiceSet(question),
      transfer: transferSet(question),
      teachbackPrompt: "元の事例と別事例を分けた条件を、誰に・いつ・何を・どの例外の形で15字以上に言い直す。"
    })];
  }));

  window.TAKKEN_UNDERSTANDING = Object.freeze({
    VERSION,
    CHECKS: Object.freeze(checks),
    TEXTBOOK_QUESTION_IDS: Object.freeze([...orderedIds])
  });
})();
