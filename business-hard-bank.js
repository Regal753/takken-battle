"use strict";

// Separate authored cases: legacy 134 questions and their answer contracts stay intact.
(function attachBusinessHardBank(root) {
  const legacy = root.TAKKEN_BUSINESS_FULLSCORE_BANK;
  const raw = [root.TAKKEN_BUSINESS_HARD_FRONT, root.TAKKEN_BUSINESS_HARD_CONTRACTS,
    root.TAKKEN_BUSINESS_HARD_PRACTICE].flatMap(part => {
    if (!Array.isArray(part) || part.length !== 20) throw new Error("hard knock requires three 20-case packs");
    return part;
  });
  if (!legacy?.UNITS) throw new Error("hard knock requires business units");
  const KANA = ["ア", "イ", "ウ", "エ"];
  const LABELS = { single: "事例・単一選択", count: "事例・個数問題", combination: "事例・組合せ問題" };
  const unique = values => [...new Set(values)];
  const freeze = value => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  };
  const hash = value => [...String(value)].reduce((n, c) => Math.imul(n ^ c.codePointAt(0), 16777619) >>> 0, 2166136261);
  function shuffle(items, key) {
    let state = hash(key);
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      const j = Math.floor((state >>> 0) / 4294967296 * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  const maskLabel = mask => KANA.filter((_, i) => mask & (1 << i)).join("・");
  const ids = new Set();
  // Balanced, non-cyclic stable answer positions. Presentation shuffles each
  // question independently; question number is never an answer shortcut.
  const positions = shuffle(Array.from({ length: 60 }, (_, i) => i % 4), "hard54-answer-slots");
  const questions = raw.map((source, index) => {
    const unit = legacy.UNITS.find(unit => unit.id === source.unitId);
    if (!unit || unit.id === "business-book-05" || ids.has(source.id) || !/^hard54-\d{3}$/.test(source.id)) {
      throw new Error(`invalid hard case identity: ${source.id}`);
    }
    ids.add(source.id);
    const facts = source.format === "single" ? source.choices : source.statements;
    if (!Array.isArray(facts) || facts.length !== 4 || facts.some(f => typeof f.truth !== "boolean" || !f.text || !f.reason)) {
      throw new Error(`invalid hard case judgments: ${source.id}`);
    }
    if (!source.premise || !source.stem || !source.explanation || !source.trap || !source.sources?.length ||
      !source.sourceQuestionIds?.length || !["correct", "incorrect"].includes(source.ask)) {
      throw new Error(`incomplete hard case: ${source.id}`);
    }
    const tags = unique(source.diagnosticTags || []);
    if (!tags.length || tags.some(tag => !legacy.ALLOWED_DIAGNOSTIC_TAGS.includes(tag))) {
      throw new Error(`invalid hard diagnostic tags: ${source.id}`);
    }
    const wanted = source.ask === "correct";
    const matching = facts.map((f, i) => f.truth === wanted ? i : -1).filter(i => i >= 0);
    const reasons = facts.map((f, i) => `${KANA[i]} ${f.truth ? "○" : "×"} ${f.reason}`);
    let options;
    if (source.format === "single") {
      if (matching.length !== 1) throw new Error(`ambiguous hard single: ${source.id}`);
      options = facts.map((f, i) => ({ text: f.text, correct: i === matching[0], fact: i,
        reason: `${f.truth ? "○" : "×"} ${f.reason}` }));
    } else if (source.format === "count") {
      if (matching.length < 1 || matching.length > 4) throw new Error(`unsupported hard count: ${source.id}`);
      // A fixed range prevents the displayed options from revealing the answer.
      options = [1, 2, 3, 4].map(n => ({ text: `${n}個`, correct: n === matching.length,
        reason: `${wanted ? "正しい" : "誤っている"}記述は${matching.length}個。${reasons.join(" ／ ")}` }));
    } else if (source.format === "combination") {
      if (matching.length !== 2) throw new Error(`hard combinations require two matching facts: ${source.id}`);
      const correct = matching.reduce((mask, i) => mask | (1 << i), 0);
      const others = shuffle([3, 5, 6, 9, 10, 12].filter(mask => mask !== correct), source.id).slice(0, 3);
      options = [correct, ...others].map(mask => ({ text: maskLabel(mask), correct: mask === correct,
        reason: `${wanted ? "正しい" : "誤っている"}記述は「${maskLabel(correct)}」。${reasons.join(" ／ ")}` }));
    } else throw new Error(`invalid hard format: ${source.id}`);
    const ordered = shuffle(options.filter(option => !option.correct), `${source.id}:stable`);
    ordered.splice(positions[index], 0, options.find(option => option.correct));
    const sourceFacts = facts.map((f, i) => ({
      key: `${source.id}:${i}`, sourceType: "authored-case", questionId: source.sourceQuestionIds[0],
      anchorId: source.id, choiceIndex: i, statementIndex: i, tag: source.topic,
      truth: f.truth, context: source.premise, presentedContext: source.premise,
      statement: f.text, presentedStatement: f.text, reason: f.reason,
      sourceRef: source.sources.map(s => s.label).join("／"),
      sourceLocator: source.sources.map(s => s.reference).join("／"),
      sourceUrl: source.sources[0].url, verifiedAt: source.sources[0].checkedAt, diagnosticTags: tags
    }));
    const block = (fact, label = "") => ({ label, premises: [], judgment: fact.presentedStatement, sourceFactKeys: [fact.key] });
    const single = source.format === "single";
    const displayedFacts = single ? ordered.map(option => sourceFacts[option.fact]) : sourceFacts;
    const intro = `${source.premise}\n\n${source.stem}`;
    return freeze({
      id: source.id, masteryId: source.id, unitId: unit.id, unitLabel: unit.label, unitPage: unit.page,
      sectionId: "business", scopeId: "business", difficulty: "hard", authoredCase: true,
      topic: source.topic, premise: source.premise, stem: source.stem, ask: source.ask,
      formatKey: source.format, format: LABELS[source.format], variationKind: "authored-hard-case",
      text: single ? intro : `${intro}\n${facts.map((fact, i) => `${KANA[i]} ${fact.text}`).join("\n")}`,
      choices: ordered.map(option => option.text), answer: positions[index],
      sourceFacts: displayedFacts, sourceQuestionIds: [...source.sourceQuestionIds],
      sourceAnchorIds: [...source.sourceQuestionIds], diagnosticTags: tags,
      choiceDiagnosticTags: ordered.map(() => tags),
      choiceExplanations: ordered.map((option, i) => `${i + 1} ${option.reason}`),
      statementExplanations: single ? ordered.map((option, i) => `${i + 1} ${option.reason}`) : reasons,
      displayModel: { intro, items: single ? [] : sourceFacts.map((f, i) => block(f, KANA[i])),
        choiceBlocks: single ? displayedFacts.map(f => block(f)) : [] },
      explain: source.explanation, trap: source.trap, memoryRule: source.explanation,
      sourceUrls: unique(source.sources.map(s => s.url)), sourceRef: source.sources.map(s => s.label).join("／"),
      sourceLocator: source.sources.map(s => s.reference).join("／"), legalSources: source.sources,
      legalBaseline: "2026-04-01", verifiedAt: "2026-09-10", qualityVersion: 1,
      changeNote: "日課用の個別作問。内部演習であり、本試験との難易度等価性・得点換算は未校正。"
    });
  });
  const byId = freeze(Object.fromEntries(questions.map(q => [q.id, q])));
  function resolve(value) {
    const question = byId[typeof value === "string" ? value : value?.id];
    if (!question) throw new RangeError("unknown hard knock question");
    return question;
  }
  function presentQuestion(value, key) {
    const q = resolve(value);
    if (typeof key !== "string" || !key.trim() || key.length > 120 || /[\u0000-\u001f\u007f]/.test(key)) {
      throw new TypeError("invalid hard presentation key");
    }
    const order = shuffle([0, 1, 2, 3], `${q.id}:${key}`);
    const relabel = text => text.replace(/^[1-4]\s/, "");
    const choiceExplanations = order.map((index, i) => `${i + 1} ${relabel(q.choiceExplanations[index])}`);
    return freeze({ ...q, choices: order.map(i => q.choices[i]), answer: order.indexOf(q.answer),
      sourceFacts: q.formatKey === "single" ? order.map(i => q.sourceFacts[i]) : q.sourceFacts,
      choiceExplanations, choiceDiagnosticTags: order.map(i => q.choiceDiagnosticTags[i]),
      statementExplanations: q.formatKey === "single" ? choiceExplanations : q.statementExplanations,
      displayModel: { ...q.displayModel, choiceBlocks: q.displayModel.choiceBlocks.length
        ? order.map(i => q.displayModel.choiceBlocks[i]) : [] },
      presentationKey: key, presentationOffset: hash(key) % 4, presentationOrder: order });
  }
  function diagnosticsForSelection(value, selected) {
    if (!Number.isInteger(selected) || selected < 0 || selected > 3) throw new RangeError("invalid hard selection");
    const q = value?.presentationKey ? presentQuestion(value.id, value.presentationKey) : resolve(value);
    return selected === q.answer ? [] : [...q.diagnosticTags];
  }
  const api = freeze({ VERSION: 1, LEGAL_BASELINE: "2026-04-01", QUESTIONS: questions, QUESTIONS_BY_ID: byId,
    UNITS: legacy.UNITS.filter(unit => unit.id !== "business-book-05"), presentQuestion, diagnosticsForSelection });
  root.TAKKEN_BUSINESS_HARD_BANK = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
