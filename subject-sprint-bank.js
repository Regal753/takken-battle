"use strict";

// A deliberately small, traceable sprint bank.  It does not add newly written
// legal propositions: every learner-facing prompt and choice is reused from the
// verified base bank, while the two variants give a short-cycle second pass.
(function attachSubjectSprintBank(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_SUBJECT_SPRINT_BANK = api;
  if (root.window && root.window !== root) root.window.TAKKEN_SUBJECT_SPRINT_BANK = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSubjectSprintBank(runtime) {
  const blueprint = runtime.TAKKEN_EXAM_BLUEPRINT || runtime.window?.TAKKEN_EXAM_BLUEPRINT;
  const baseQuestions = runtime.TAKKEN_EXAM_QUESTIONS || runtime.window?.TAKKEN_EXAM_QUESTIONS;
  if (!blueprint || !baseQuestions) {
    throw new Error("subject sprint bank requires the exam blueprint and base question bank");
  }

  const VERSION = 1;
  const LEGAL_BASELINE = "2026-04-01";
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const stableHash = (value) => [...String(value || "")].reduce(
    (hash, character) => ((hash * 31) + character.codePointAt(0)) >>> 0,
    2166136261
  );
  const rotate = (values, offset) => values.map((_, index) => values[(index + offset) % values.length]);
  const baseFacts = (question) => {
    const explanations = question.choiceExplanations || question.statementExplanations;
    if (!Array.isArray(explanations) || explanations.length !== 4) {
      throw new Error(`${question.id}: four verified base explanations are required`);
    }
    return Object.freeze(explanations.map((explanation, index) => {
      const marker = String(explanation).match(/[○×]/)?.[0];
      if (!marker) throw new Error(`${question.id}:${index}: truth marker is required`);
      return Object.freeze({
        key: `${question.id}:${index}`,
        sourceType: "base",
        questionId: question.id,
        choiceIndex: index,
        statement: question.choices[index],
        truth: marker === "○",
        reason: clean(explanation).replace(/^\d+\s*[○×]\s*/, ""),
        sourceRef: clean(question.sourceRef),
        sourceLocator: clean(question.sourceLocator),
        sourceUrl: clean(question.sourceUrl),
        legalBaseline: clean(question.legalBaseline),
        verifiedAt: clean(question.verifiedAt)
      });
    }));
  };

  const definitions = Object.freeze([
    ["sprint-tax-01a", "t001", "taxOther", "不動産取得税", ["local-tax", "acquisition-tax"], 0],
    ["sprint-tax-01b", "t001", "taxOther", "不動産取得税", ["local-tax", "acquisition-tax"], 2],
    ["sprint-tax-02a", "t002", "taxOther", "固定資産税", ["local-tax", "fixed-asset-tax"], 0],
    ["sprint-tax-02b", "t002", "taxOther", "固定資産税", ["local-tax", "fixed-asset-tax"], 2],
    ["sprint-tax-03a", "t003", "taxOther", "地方税比較", ["local-tax", "tax-comparison"], 0],
    ["sprint-tax-03b", "t003", "taxOther", "地方税比較", ["local-tax", "tax-comparison"], 2],
    ["sprint-tax-04a", "t004", "taxOther", "登録免許税", ["registration-tax"], 0],
    ["sprint-tax-04b", "t004", "taxOther", "登録免許税", ["registration-tax"], 2],
    ["sprint-tax-05a", "t005", "taxOther", "印紙税", ["stamp-tax"], 0],
    ["sprint-tax-05b", "t005", "taxOther", "印紙税", ["stamp-tax"], 2],
    ["sprint-tax-06a", "t006", "taxOther", "譲渡所得", ["capital-gain"], 0],
    ["sprint-tax-06b", "t006", "taxOther", "譲渡所得", ["capital-gain"], 2],
    ["sprint-law-01a", "l002", "restrictions", "開発許可", ["development-permit"], 0],
    ["sprint-law-01b", "l002", "restrictions", "開発許可", ["development-permit"], 2],
    ["sprint-law-02a", "l005", "restrictions", "建築確認", ["building-confirmation"], 0],
    ["sprint-law-02b", "l005", "restrictions", "建築確認", ["building-confirmation"], 2],
    ["sprint-law-03a", "l009", "restrictions", "国土利用計画法", ["national-land"], 0],
    ["sprint-law-03b", "l009", "restrictions", "国土利用計画法", ["national-land"], 2],
    ["sprint-law-04a", "l015", "restrictions", "盛土規制法", ["embankment"], 0],
    ["sprint-law-04b", "l015", "restrictions", "盛土規制法", ["embankment"], 2],
    ["sprint-rights-01a", "r004", "rights", "代理", ["agency"], 0],
    ["sprint-rights-01b", "r004", "rights", "代理", ["agency"], 2],
    ["sprint-rights-02a", "r008", "rights", "保証", ["guarantee"], 0],
    ["sprint-rights-02b", "r008", "rights", "保証", ["guarantee"], 2],
    ["sprint-rights-03a", "r016", "rights", "抵当権", ["mortgage"], 0],
    ["sprint-rights-03b", "r016", "rights", "抵当権", ["mortgage"], 2],
    ["sprint-rights-04a", "r106", "rights", "法定代位", ["subrogation"], 0],
    ["sprint-rights-04b", "r106", "rights", "法定代位", ["subrogation"], 2],
    ["sprint-other-01a", "o003", "other", "住宅金融支援機構", ["housing-finance", "securitization-support"], 0],
    ["sprint-other-01b", "o003", "other", "住宅金融支援機構", ["housing-finance", "securitization-support"], 2],
    ["sprint-other-02a", "o005", "other", "不動産表示", ["fair-competition", "walking-time-display"], 0],
    ["sprint-other-02b", "o005", "other", "不動産表示", ["fair-competition", "walking-time-display"], 2],
    ["sprint-other-03a", "o008", "other", "建物構造", ["land-building", "building-structure"], 0],
    ["sprint-other-03b", "o008", "other", "建物構造", ["land-building", "building-structure"], 2],
    ["sprint-other-04a", "o009", "other", "令和8年統計", ["statistics", "land-price-2026"], 0],
    ["sprint-other-04b", "o009", "other", "令和8年統計", ["statistics", "land-price-2026"], 2]
  ]);

  if (clean(blueprint.legalBaseline) !== LEGAL_BASELINE) {
    throw new Error("subject sprint bank legal baseline is incompatible");
  }

  const questions = definitions.map(([id, baseId, sectionId, tag, diagnosticTags, variantOffset]) => {
    const source = baseQuestions[baseId];
    if (!source || !Array.isArray(source.choices) || source.choices.length !== 4 ||
        !Number.isInteger(source.answer) || source.answer < 0 || source.answer > 3 ||
        clean(source.legalBaseline) !== LEGAL_BASELINE || !clean(source.sourceUrl)) {
      throw new Error(`${id}: safe verified base question ${baseId} is unavailable`);
    }
    return Object.freeze({
      id,
      masteryId: id,
      sourceQuestionId: baseId,
      sectionId,
      tag,
      diagnosticTags: Object.freeze([...diagnosticTags]),
      variantOffset,
      format: source.format,
      text: source.text,
      choices: source.choices,
      answer: source.answer,
      explain: source.explain,
      trap: source.trap,
      memoryRule: source.memoryRule,
      choiceExplanations: source.choiceExplanations,
      sourceFacts: baseFacts(source),
      sourceRef: source.sourceRef,
      sourceLocator: source.sourceLocator,
      sourceUrl: source.sourceUrl,
      legalBaseline: source.legalBaseline,
      verifiedAt: source.verifiedAt
    });
  });
  const questionsById = Object.freeze(Object.fromEntries(questions.map((question) => [question.id, question])));
  const coverage = Object.freeze({
    total: questions.length,
    bySection: Object.freeze(Object.fromEntries(["taxOther", "restrictions", "rights", "other"].map((sectionId) => [
      sectionId,
      questions.filter((question) => question.sectionId === sectionId).length
    ]))),
    byDiagnosticTag: Object.freeze(Object.fromEntries([...new Set(questions.flatMap((question) => question.diagnosticTags))]
      .sort().map((tag) => [tag, questions.filter((question) => question.diagnosticTags.includes(tag)).length])))
  });

  function stableQuestion(questionOrId) {
    const id = typeof questionOrId === "string" ? questionOrId : questionOrId?.id;
    const question = questionsById[id];
    if (!question) throw new RangeError("unknown subject sprint question");
    return question;
  }

  function presentQuestion(questionOrId, presentationKey = "") {
    const question = stableQuestion(questionOrId);
    const offset = (question.variantOffset + (stableHash(presentationKey || question.id) % 4)) % 4;
    const order = Object.freeze(rotate([0, 1, 2, 3], offset));
    return Object.freeze({
      ...question,
      choices: Object.freeze(order.map((index) => question.choices[index])),
      choiceExplanations: Object.freeze(order.map((index) => question.choiceExplanations[index])),
      answer: order.indexOf(question.answer),
      presentationKey: clean(presentationKey) || question.id,
      presentationOrder: order,
      presentationOffset: offset
    });
  }

  return Object.freeze({
    VERSION,
    LEGAL_BASELINE,
    QUESTIONS: Object.freeze(questions),
    QUESTIONS_BY_ID: questionsById,
    COVERAGE: coverage,
    presentQuestion,
    stableQuestion
  });
});
