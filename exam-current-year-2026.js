"use strict";

(() => {
  const SCHEMA_VERSION = 1;
  const EXAM_YEAR = 2026;
  const LEGAL_BASELINE = "2026-04-01";
  const REVIEWED_AT = "2026-08-16";

  function deepFreeze(value, seen = new WeakSet()) {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
    if (Object.isFrozen(value) || seen.has(value)) return value;
    seen.add(value);
    Object.getOwnPropertyNames(value).forEach((name) => deepFreeze(value[name], seen));
    return Object.freeze(value);
  }

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  const SOURCES = deepFreeze([
    {
      id: "retio-2026-exam-guide",
      publisher: "一般財団法人 不動産適正取引推進機構",
      title: "令和8年度インターネット申込試験案内",
      url: "https://moushikomi.retio.or.jp/",
      checkedAt: REVIEWED_AT
    },
    {
      id: "retio-2026-schedule",
      publisher: "一般財団法人 不動産適正取引推進機構",
      title: "令和8年度宅地建物取引士資格試験について",
      url: "https://www.retio.or.jp/exam/schedule/",
      checkedAt: REVIEWED_AT
    },
    {
      id: "retio-2025-official-question",
      publisher: "一般財団法人 不動産適正取引推進機構",
      title: "令和7年度 宅地建物取引士資格試験問題・正解番号表",
      url: "https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf",
      checkedAt: REVIEWED_AT
    },
    {
      id: "mlit-takken-law-2026",
      publisher: "国土交通省",
      title: "宅地建物取引業法 法令改正・解釈について",
      url: "https://www.mlit.go.jp/totikensangyo/const/1_6_bt_000268.html",
      checkedAt: REVIEWED_AT
    },
    {
      id: "mlit-2026-land-price",
      publisher: "国土交通省",
      title: "令和8年地価公示データ更新",
      url: "https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo17_hh_000001_00078.html",
      checkedAt: REVIEWED_AT
    },
    {
      id: "mlit-2026-land-white-paper",
      publisher: "国土交通省",
      title: "令和8年版 土地白書",
      url: "https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo02_hh_000001_00116.html",
      checkedAt: REVIEWED_AT
    },
    {
      id: "mlit-tax-acquisition",
      publisher: "国土交通省",
      title: "土地の取得に係る税制の概要（参考）",
      url: "https://www.mlit.go.jp/totikensangyo/totikensangyo_tk5_000072.html",
      checkedAt: REVIEWED_AT
    },
    {
      id: "mlit-tax-holding",
      publisher: "国土交通省",
      title: "土地の保有に係る税制",
      url: "https://www.mlit.go.jp/totikensangyo/totikensangyo_tk5_000073.html",
      checkedAt: REVIEWED_AT
    },
    {
      id: "mlit-tax-reform-2026",
      publisher: "国土交通省",
      title: "令和8年度 国土交通省税制改正概要",
      url: "https://www.mlit.go.jp/page/content/001975596.pdf",
      checkedAt: REVIEWED_AT
    }
  ]);
  const SOURCE_BY_ID = deepFreeze(Object.fromEntries(SOURCES.map((source) => [source.id, source])));

  const EXAM = deepFreeze({
    legalBaseline: LEGAL_BASELINE,
    examDate: "2026-10-18",
    regular: deepFreeze({ startTime: "13:00", endTime: "15:00", durationMinutes: 120, questionCount: 50 }),
    fiveQuestionExempt: deepFreeze({ startTime: "13:10", endTime: "15:00", durationMinutes: 110, questionCount: 45 }),
    result: deepFreeze({ date: "2026-11-25", time: "09:30" }),
    sourceIds: deepFreeze(["retio-2026-exam-guide", "retio-2026-schedule"]),
    reviewedAt: REVIEWED_AT,
    expiresOn: "2026-11-25"
  });

  const SUBJECT_ALLOCATION = deepFreeze([
    { id: "rights", label: "権利関係", questionRange: "1-14", questionCount: 14, sourceIds: ["retio-2025-official-question"], status: "official-format-reference" },
    { id: "restrictions", label: "法令上の制限", questionRange: "15-22", questionCount: 8, sourceIds: ["retio-2025-official-question"], status: "official-format-reference" },
    { id: "tax-other", label: "税・その他", questionRange: "23-25", questionCount: 3, sourceIds: ["retio-2025-official-question"], status: "official-format-reference" },
    { id: "business", label: "宅建業法", questionRange: "26-45", questionCount: 20, sourceIds: ["retio-2025-official-question"], status: "official-format-reference" },
    { id: "exempt", label: "5問免除", questionRange: "46-50", questionCount: 5, sourceIds: ["retio-2026-exam-guide", "retio-2025-official-question"], status: "registered-course-only" }
  ]);

  const FRESHNESS_CARDS = deepFreeze([
    {
      id: "law-baseline-2026-04-01",
      category: "law",
      title: "2026年法令基準日",
      status: "reviewed",
      reviewedAt: REVIEWED_AT,
      effectiveOn: LEGAL_BASELINE,
      expiresOn: "2026-10-18",
      sourceIds: ["retio-2026-exam-guide", "mlit-takken-law-2026"],
      answerPolicy: "source-linked-current-law-only",
      checkpoint: "問題の法令根拠を2026年4月1日現在施行の規定に固定し、過去問の旧法正答を現行法正答として流用しない。"
    },
    {
      id: "statistics-land-price-2026",
      category: "statistics",
      title: "2026年地価公示",
      status: "reviewed",
      reviewedAt: REVIEWED_AT,
      effectiveOn: "2026-03-24",
      expiresOn: "2026-10-18",
      sourceIds: ["mlit-2026-land-price"],
      answerPolicy: "source-checkpoint-no-stored-quiz-numerics",
      checkpoint: "当年資料の公開を確認済み。統計数値は出典再確認後にのみ出題し、このカード自体は数値解答を保持しない。"
    },
    {
      id: "statistics-land-white-paper-2026",
      category: "statistics",
      title: "2026年版土地白書",
      status: "reviewed",
      reviewedAt: REVIEWED_AT,
      effectiveOn: "2026-07-10",
      expiresOn: "2026-10-18",
      sourceIds: ["mlit-2026-land-white-paper"],
      answerPolicy: "source-checkpoint-no-stored-quiz-numerics",
      checkpoint: "当年版の閣議決定を確認済み。数値・前年比は出典再確認後にのみ問題化する。"
    },
    {
      id: "tax-acquisition-2026",
      category: "tax",
      title: "不動産取得時税制の2026確認",
      status: "reviewed",
      reviewedAt: REVIEWED_AT,
      effectiveOn: LEGAL_BASELINE,
      expiresOn: "2026-10-18",
      sourceIds: ["mlit-tax-acquisition", "mlit-tax-reform-2026"],
      answerPolicy: "source-checkpoint-before-quiz",
      checkpoint: "不動産取得税・登録免許税等の特例期限は当年資料で再確認してから出題する。"
    },
    {
      id: "tax-holding-2026",
      category: "tax",
      title: "保有税制の2026確認",
      status: "reviewed",
      reviewedAt: REVIEWED_AT,
      effectiveOn: LEGAL_BASELINE,
      expiresOn: "2026-10-18",
      sourceIds: ["mlit-tax-holding", "mlit-tax-reform-2026"],
      answerPolicy: "source-checkpoint-before-quiz",
      checkpoint: "固定資産税・都市計画税の特例や期限は当年資料で再確認してから出題する。"
    }
  ]);
  const FRESHNESS_CARD_BY_ID = deepFreeze(Object.fromEntries(FRESHNESS_CARDS.map((card) => [card.id, card])));

  function assessFreshness(cardOrId, asOf = REVIEWED_AT) {
    const card = typeof cardOrId === "string" ? FRESHNESS_CARD_BY_ID[cardOrId] : cardOrId;
    if (!card || !validDate(asOf) || !validDate(card.reviewedAt) || !validDate(card.effectiveOn) || !validDate(card.expiresOn)) {
      return deepFreeze({ status: "unknown", current: false, failClosed: true, reason: "invalid-or-missing-freshness-data" });
    }
    if (card.status !== "reviewed") return deepFreeze({ status: "unknown", current: false, failClosed: true, reason: "not-reviewed" });
    if (!Array.isArray(card.sourceIds) || !card.sourceIds.length || card.sourceIds.some((id) => !SOURCE_BY_ID[id])) {
      return deepFreeze({ status: "unknown", current: false, failClosed: true, reason: "missing-primary-source" });
    }
    if (asOf < card.effectiveOn) return deepFreeze({ status: "not-yet-effective", current: false, failClosed: true, reason: "before-effective-date" });
    if (asOf > card.expiresOn) return deepFreeze({ status: "expired", current: false, failClosed: true, reason: "past-expiry-date" });
    return deepFreeze({ status: "current", current: true, failClosed: false, reason: null });
  }

  function assessAllFreshness(asOf = REVIEWED_AT) {
    const cards = FRESHNESS_CARDS.map((card) => ({ id: card.id, ...assessFreshness(card, asOf) }));
    const current = cards.every((entry) => entry.current);
    return deepFreeze({ asOf, current, failClosed: !current, cards: deepFreeze(cards) });
  }

  const api = deepFreeze({
    SCHEMA_VERSION,
    EXAM_YEAR,
    LEGAL_BASELINE,
    REVIEWED_AT,
    SOURCES,
    SOURCE_BY_ID,
    EXAM,
    SUBJECT_ALLOCATION,
    FRESHNESS_CARDS,
    FRESHNESS_CARD_BY_ID,
    assessFreshness,
    assessAllFreshness
  });

  if (typeof window !== "undefined") window.TAKKEN_EXAM_CURRENT_YEAR_2026 = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
