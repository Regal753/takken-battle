"use strict";

// Official questions are historical material.  This file intentionally does
// not guess a modern-law topic from an old question's wording: each entry is
// an exact official-paper coordinate, with a safe section repair route and a
// mandatory current-law check before the learner treats the result as review.
(function attachOfficialTopicMap(root, factory) {
  const api = factory(
    typeof module === "object" && module.exports ? require("./official-exam-data.js") : root.TAKKEN_OFFICIAL_EXAMS
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_OFFICIAL_TOPIC_MAP = api;
  if (root.window && root.window !== root) root.window.TAKKEN_OFFICIAL_TOPIC_MAP = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createOfficialTopicMap(examData) {
  if (!examData?.EXAM_BY_ID || typeof examData.SECTION_BY_NUMBER !== "function") {
    throw new Error("official topic map requires official exam data");
  }

  const COVERED_EXAM_IDS = Object.freeze(["2025", "2024", "2023", "2022"]);
  const HISTORICAL_NOTICE = "過去問は出題当時の法令です。現行法の結論として採点・暗記せず、現行法確認を完了してから復習に算入してください。";
  const FALLBACKS = Object.freeze({
    rights: Object.freeze({ label: "権利関係", route: "subject-sprint", taxonomyId: "rights" }),
    restrictions: Object.freeze({ label: "法令上の制限", route: "subject-sprint", taxonomyId: "restrictions" }),
    business: Object.freeze({ label: "宅建業法", route: "business-knock", taxonomyId: "business" }),
    taxOther: Object.freeze({ label: "税・その他", route: "subject-sprint", taxonomyId: "taxOther" })
  });
  const freeze = (value) => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  };
  const clean = (value) => String(value || "").trim();

  const records = [];
  for (const examId of COVERED_EXAM_IDS) {
    const exam = examData.EXAM_BY_ID[examId];
    if (!exam || exam.answers.length !== 50) throw new Error(`${examId}: official 50-question paper required`);
    for (let questionNo = 1; questionNo <= 50; questionNo += 1) {
      const sectionId = examData.SECTION_BY_NUMBER(questionNo);
      const fallback = FALLBACKS[sectionId];
      if (!fallback) throw new Error(`${examId} Q${questionNo}: unsupported official section`);
      records.push(freeze({
        id: `${examId}-q${String(questionNo).padStart(2, "0")}`,
        examId,
        questionNo,
        sectionId,
        // A question-level subject assignment must be read from the official
        // paper and checked against current law.  Leaving it explicitly
        // unclassified is safer than manufacturing a plausible-looking tag.
        topicId: null,
        topicLabel: `${fallback.label}（公式過去問・論点未読替え）`,
        topicVerification: "official-coordinate-only",
        currentLawStatus: "historical-unreviewed",
        historicalLawRisk: true,
        sourceUrl: exam.questionUrl,
        answerSourceUrl: exam.answerSourceUrl,
        sourceLabel: `${exam.label} 問${questionNo}`,
        repairTarget: freeze({
          kind: "section-fallback",
          sectionId,
          taxonomyId: fallback.taxonomyId,
          route: fallback.route,
          label: `${fallback.label}の弱点演習へ`,
          requiresOfficialTextRead: true,
          requiresCurrentLawCheck: true
        }),
        caution: HISTORICAL_NOTICE
      }));
    }
  }

  const byKey = Object.freeze(Object.fromEntries(records.map((record) => [`${record.examId}:${record.questionNo}`, record])));
  const byExamId = Object.freeze(Object.fromEntries(COVERED_EXAM_IDS.map((examId) => [
    examId,
    Object.freeze(records.filter((record) => record.examId === examId))
  ])));

  function lookup(examId, questionNo) {
    const number = Number(questionNo);
    if (!Number.isInteger(number)) return null;
    return byKey[`${clean(examId)}:${number}`] || null;
  }

  function repairPlan(examId, questionNo) {
    const record = lookup(examId, questionNo);
    if (!record) return null;
    return freeze({
      record,
      primary: record.repairTarget,
      steps: freeze([
        `公式問題 ${record.sourceLabel} を開き、選択肢ごとの根拠を確認する`,
        `${record.repairTarget.label}を1セット解く`,
        "現行法・今年の改正カードで結論を再確認してから誤答を解消する"
      ]),
      countsTowardCurrentLawMastery: false,
      currentLawCheckRequired: true,
      caution: HISTORICAL_NOTICE
    });
  }

  return freeze({
    VERSION: 1,
    COVERED_EXAM_IDS,
    HISTORICAL_NOTICE,
    RECORDS: freeze(records),
    RECORD_BY_KEY: byKey,
    RECORDS_BY_EXAM_ID: byExamId,
    lookup,
    repairPlan
  });
});
