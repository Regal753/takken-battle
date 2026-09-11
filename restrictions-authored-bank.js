"use strict";

// New authored practice stays outside the fixed core and mock-form contracts.
(function attachRestrictionsAuthoredBank(root, factory) {
  const definitions = [
    ["TAKKEN_RESTRICTIONS_CASES_CITY_LAND", "./restrictions-cases-city-land.js", 26],
    ["TAKKEN_RESTRICTIONS_CASES_BUILDING_READJUSTMENT", "./restrictions-cases-building-readjustment.js", 26],
    ["TAKKEN_RESTRICTIONS_CASES_AGRICULTURE_FILL", "./restrictions-cases-agriculture-fill.js", 20]
  ];
  const packs = definitions.map(([name, file, count]) => {
    const values = root[name] || root.window?.[name] || (typeof require === "function" ? require(file) : null);
    if (!Array.isArray(values) || values.length !== count ||
        Array.from({ length: count }, (_, index) => values[index]).some(value => !value)) {
      throw new Error(`restrictions authored bank requires every case in ${name}`);
    }
    return values;
  });
  const api = factory(packs.flat());
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_RESTRICTIONS_AUTHORED_BANK = api;
  if (root.window && root.window !== root) root.window.TAKKEN_RESTRICTIONS_AUTHORED_BANK = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRestrictionsAuthoredBank(raw) {
  const VERSION = 1;
  const LEGAL_BASELINE = "2026-04-01";
  const VERIFIED_AT = "2026-09-12";
  const KANA = ["ア", "イ", "ウ", "エ"];
  const FORMATS = { single: "単一選択", count: "個数問題", combination: "組合せ問題" };
  const TOPICS = {
    "都市計画法": "city-planning", "建築基準法": "building", "国土利用計画法": "national-land",
    "農地法": "agriculture", "土地区画整理法": "readjustment", "宅地造成及び特定盛土等規制法": "embankment"
  };
  const freeze = value => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  };
  const hash = value => [...String(value)].reduce((n, c) => Math.imul(n ^ c.codePointAt(0), 16777619) >>> 0, 2166136261);
  function shuffle(values, seed) {
    let state = hash(seed);
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      const j = Math.floor((state >>> 0) / 4294967296 * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  const expectedIds = Array.from({ length: 72 }, (_, index) => `rc58-${String(index + 1).padStart(3, "0")}`);
  if (raw.length !== 72 || raw.some((q, index) => q.id !== expectedIds[index])) throw new Error("restrictions authored case identities are incomplete");
  const positions = shuffle(Array.from({ length: 72 }, (_, i) => i % 4), "restriction58-answer-slots");
  const maskLabel = mask => KANA.filter((_, i) => mask & (1 << i)).join("・");
  const questions = raw.map((input, index) => {
    const facts = input.format === "single" ? input.choices : input.statements;
    if (!TOPICS[input.sourceAnchor] || !FORMATS[input.format] || !["correct", "incorrect"].includes(input.ask) ||
        !["standard", "applied"].includes(input.targetLevel) || !input.premise || !input.stem || !input.topic ||
        !input.explanation || !input.trap || !input.noveltyNote || !input.diagnosticTags?.length ||
        !Array.isArray(facts) || facts.length !== 4 ||
        Array.from({ length: 4 }, (_, i) => facts[i]).some(f => !f || typeof f.truth !== "boolean" || !f.text || !f.reason || !f.reference)) {
      throw new Error(`incomplete restriction case: ${input.id}`);
    }
    const sources = input.sources;
    if (!Array.isArray(sources) || !sources.length || sources.some(source => !source.label || !source.reference || source.checkedAt !== VERIFIED_AT || !/^https:\/\//.test(source.url))) {
      throw new Error(`restriction case needs verified source locators: ${input.id}`);
    }
    const wanted = input.ask === "correct";
    const matching = facts.map((fact, i) => fact.truth === wanted ? i : -1).filter(i => i >= 0);
    let options;
    if (input.format === "single") {
      if (matching.length !== 1) throw new Error(`ambiguous restriction single: ${input.id}`);
      options = facts.map((fact, i) => ({ text: fact.text, correct: i === matching[0], origin: i }));
    } else if (input.format === "count") {
      if (matching.length < 1 || matching.length > 4) throw new Error(`unsupported restriction count: ${input.id}`);
      options = [1, 2, 3, 4].map(count => ({ text: `${count}個`, correct: count === matching.length }));
    } else {
      if (matching.length !== 2) throw new Error(`restriction combination needs two matching facts: ${input.id}`);
      const correctMask = matching.reduce((mask, i) => mask | (1 << i), 0);
      const distractors = shuffle([3, 5, 6, 9, 10, 12].filter(mask => mask !== correctMask), input.id).slice(0, 3);
      options = [correctMask, ...distractors].map(mask => ({ text: maskLabel(mask), correct: mask === correctMask }));
    }
    const ordered = shuffle(options.filter(option => !option.correct), `${input.id}:options`);
    ordered.splice(positions[index], 0, options.find(option => option.correct));
    const displayedFacts = input.format === "single" ? ordered.map(option => facts[option.origin]) : facts;
    const sourceUrls = [...new Set(sources.map(source => source.url))];
    const sourceRef = sources.map(source => source.label).join("／");
    const sourceLocator = sources.map(source => source.reference).join("／");
    const sourceFacts = displayedFacts.map((fact, factIndex) => ({
      key: `${input.id}:${factIndex}`, sourceType: "authored-case", questionId: input.id, choiceIndex: factIndex,
      statement: fact.text, truth: fact.truth, reason: fact.reason, context: input.premise,
      sourceRef, sourceLocator: fact.reference, sourceUrl: sourceUrls[0], sourceUrls,
      legalBaseline: LEGAL_BASELINE, verifiedAt: VERIFIED_AT
    }));
    const explanations = displayedFacts.map((fact, i) => `${input.format === "single" ? i + 1 : KANA[i]} ${fact.truth ? "○" : "×"} ${fact.reason}（${fact.reference}）`);
    const intro = `${input.premise}\n\n${input.stem}`;
    const block = (fact, label = "") => ({ label, premises: [], judgment: fact.statement, sourceFactKeys: [fact.key] });
    return freeze({
      id: input.id, sectionId: "restrictions", tag: input.topic, topic: input.topic,
      sourceAnchor: input.sourceAnchor, topicId: TOPICS[input.sourceAnchor], authoredCase: true,
      ask: input.ask, formatKey: input.format, format: FORMATS[input.format], targetLevel: input.targetLevel,
      premise: input.premise, stem: input.stem,
      text: input.format === "single" ? intro : `${intro}\n${facts.map((fact, i) => `${KANA[i]} ${fact.text}`).join("\n")}`,
      choices: ordered.map(option => option.text), answer: positions[index], sourceFacts,
      choiceOriginIndexes: input.format === "single" ? ordered.map(option => option.origin) : [0, 1, 2, 3],
      choiceExplanations: explanations, statementExplanations: explanations,
      displayModel: { intro, items: input.format === "single" ? [] : sourceFacts.map((fact, i) => block(fact, KANA[i])),
        choiceBlocks: input.format === "single" ? sourceFacts.map(fact => block(fact)) : [] },
      explain: input.explanation, trap: input.trap, memoryRule: input.explanation,
      diagnosticTags: [...new Set(input.diagnosticTags)], noveltyNote: input.noveltyNote,
      sourceRef, sourceLocator, sourceUrl: sourceUrls[0], sourceUrls, legalSources: sources,
      legalBaseline: LEGAL_BASELINE, verifiedAt: VERIFIED_AT, qualityVersion: 1,
      level: input.targetLevel === "standard" ? "標準〜通常応用・新作事例" : "難問寄りの条件適用・新作事例",
      changeNote: "個別作問の訓練問題。本試験との難度等価性・得点換算は未校正。"
    });
  });
  return freeze({ VERSION, LEGAL_BASELINE, VERIFIED_AT, RAW_QUESTIONS: raw, QUESTIONS: questions,
    QUESTIONS_BY_ID: Object.fromEntries(questions.map(q => [q.id, q])),
    QUESTION_IDS: questions.map(q => q.id),
    TOPIC_SOURCE_IDS: Object.fromEntries(Object.values(TOPICS).map(topic => [topic, questions.filter(q => q.topicId === topic).map(q => q.id)]))
  });
});
