"use strict";

// Authored case questions. A fixed per-version permutation preserves saved
// answer indices; legacy questions and their historical ordering never change.
(() => {
  const KANA = ["ア", "イ", "ウ", "エ"];
  const FORM_ID = "case-form-2026-a";
  const raw = [
    ...(window.TAKKEN_CASE_EXAM_RIGHTS || []),
    ...(window.TAKKEN_CASE_EXAM_RESTRICTIONS || []),
    ...(window.TAKKEN_CASE_EXAM_TAX_OTHER || []).filter(q => q.sectionId === "tax"),
    ...(window.TAKKEN_CASE_EXAM_BUSINESS || []),
    ...(window.TAKKEN_CASE_EXAM_TAX_OTHER || []).filter(q => q.sectionId === "other")
  ];
  if (raw.length !== 50) throw new Error("authored case bank requires all 50 questions");
  const random = seed => () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const shuffle = (items, seed) => {
    const result = [...items], next = random(seed);
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const hasCycle = values => values.some((_, start) =>
    [1, 2, 3, 4].some(period => start + Math.max(4, period * 2) <= values.length &&
      values.slice(start, start + Math.max(4, period * 2))
        .every((value, offset) => value === values[start + offset % period])));
  let positions, seed = 520260910;
  do {
    positions = shuffle(Array.from({ length: 50 }, (_, i) => i % 4), seed++);
  } while (hasCycle(positions));
  const combination = mask => KANA.filter((_, i) => mask & (1 << i)).join("・") || "該当なし";
  const questions = raw.map((source, number) => {
    const facts = source.format === "single" ? source.choices : source.statements;
    if (!Array.isArray(facts) || facts.length !== 4 || facts.some(f => typeof f.truth !== "boolean" || !f.reason)) {
      throw new Error(`invalid four judgments: ${source.id}`);
    }
    const wanted = source.ask !== "incorrect";
    const matching = facts.map((fact, index) => fact.truth === wanted ? index : -1).filter(i => i >= 0);
    let options, stem = source.stem;
    const factReasons = facts.map((fact, i) => `${KANA[i]} ${fact.truth ? "○" : "×"} ${fact.reason}`);
    if (source.format === "single") {
      if (matching.length !== 1) throw new Error(`single answer not unique: ${source.id}`);
      options = facts.map((fact, i) => ({ ...fact, correct: i === matching[0] }));
    } else if (source.format === "count") {
      const count = matching.length;
      const omitted = count <= 2 ? 4 : 0;
      options = Array.from({ length: 5 }, (_, n) => n).filter(n => n !== omitted).map(n => ({
        text: `${n}個`, correct: n === count,
        reason: `${wanted ? "正しい" : "誤っている"}記述は${count}個。${factReasons.join(" ／ ")}`
      }));
      stem = `次のアからエの記述のうち、${wanted ? "正しい" : "誤っている"}ものはいくつあるか。`;
    } else if (source.format === "combination") {
      const correctMask = matching.reduce((mask, i) => mask | (1 << i), 0);
      const distractors = shuffle([0, 1, 2, 3], 5200 + number).slice(0, 3).map(i => correctMask ^ (1 << i));
      options = [correctMask, ...distractors].map(mask => ({
        text: combination(mask), correct: mask === correctMask,
        reason: `${wanted ? "正しい" : "誤っている"}記述の組合せは「${combination(correctMask)}」。${factReasons.join(" ／ ")}`
      }));
      stem = `次のアからエの記述のうち、${wanted ? "正しい" : "誤っている"}ものの組合せはどれか。`;
    } else throw new Error(`unsupported format: ${source.id}`);
    const correct = options.find(option => option.correct);
    const ordered = shuffle(options.filter(option => !option.correct), 5252 + number);
    ordered.splice(positions[number], 0, correct);
    const statements = source.format === "single" ? [] : facts.map((fact, i) => ({ id: KANA[i], text: fact.text }));
    const sources = source.sources || [];
    if (!sources.length || !source.sourceQuestionIds?.length) throw new Error(`missing provenance: ${source.id}`);
    return Object.freeze({
      id: source.id, formId: FORM_ID, number: number + 1, sectionId: source.sectionId,
      tag: source.topic, formatFamily: source.format,
      format: { single: "単一選択", count: "個数問題", combination: "組合せ問題" }[source.format],
      authoredCase: true, ask: source.ask, premise: source.premise, stem, statements,
      text: [source.premise, stem, ...statements.map(s => `${s.id} ${s.text}`)].filter(Boolean).join("\n"),
      choices: ordered.map(option => option.text), answer: positions[number],
      choiceTruths: source.format === "single" ? ordered.map(option => option.truth) : facts.map(f => f.truth),
      choiceFacts: source.format === "single" ? ordered.map(option => option.text) : facts.map(f => f.text),
      choiceExplanations: ordered.map((option, i) => `${i + 1} ${source.format === "single" ? (option.truth ? "○" : "×") : (option.correct ? "○" : "×")} ${option.reason}`),
      statementExplanations: factReasons,
      explain: source.explanation, trap: source.trap, memoryRule: source.explanation,
      sourceQuestionIds: [...source.sourceQuestionIds], sourceRef: sources.map(s => s.label).join("・"),
      sourceUrl: sources[0].url, sourceUrls: sources.map(s => s.url),
      sourceLocator: sources.map(s => s.reference).join(" / "), legalSources: sources,
      legalBaseline: "2026-04-01", effectiveDate: "2026-04-01", verifiedAt: "2026-09-10",
      changeNote: "個別作問の事例演習。難易度の得点換算・本試験との等価性は未校正。"
    });
  });
  window.TAKKEN_CASE_EXAM_BANK = Object.freeze({
    version: 52, forms: [{ id: FORM_ID, label: "事例実戦A（2026改訂）", shortLabel: "事例実戦A", evidenceClass: "authored-case-practice", questions }]
  });
})();
