"use strict";

(() => {
  const SCHEMA_VERSION = 2;
  const EXAM_YEAR = 2026;
  const LEGAL_BASELINE = "2026-04-01";
  const REVIEWED_AT = "2026-09-10";

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

  function dateAgeDays(olderDate, newerDate) {
    return Math.floor((Date.parse(`${newerDate}T00:00:00Z`) - Date.parse(`${olderDate}T00:00:00Z`)) / 86400000);
  }

  function exactStringKeys(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
  }

  function officialUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && (
        parsed.hostname === "moushikomi.retio.or.jp" ||
        parsed.hostname === "www.retio.or.jp" ||
        parsed.hostname === "www.mlit.go.jp"
      );
    } catch {
      return false;
    }
  }

  // snapshotHash is the SHA-256 fingerprint of `${id}|${url}|${checkedAt}`.
  // It detects a changed review record; it is deliberately not represented as a
  // live-page content hash, because this static bundle cannot fetch one.
  const SOURCES = deepFreeze([
    {
      id: "retio-2026-exam-guide",
      publisher: "一般財団法人 不動産適正取引推進機構",
      title: "令和8年度インターネット申込試験案内",
      url: "https://www.retio.or.jp/wp-content/uploads/2026/05/R8%E3%82%A4%E3%83%B3%E3%82%BF%E3%83%BC%E3%83%8D%E3%83%83%E3%83%88%E7%94%B3%E8%BE%BC%E8%A9%A6%E9%A8%93%E6%A1%88%E5%86%85.pdf",
      checkedAt: REVIEWED_AT,
      snapshotId: "retio-2026-exam-guide@2026-09-10",
      snapshotHash: "c598fc9f1669fb8a13fc0f20ef4497bcc9f79d8302cee4d72714839cb96f9c96"
    },
    {
      id: "retio-2026-schedule",
      publisher: "一般財団法人 不動産適正取引推進機構",
      title: "令和8年度宅地建物取引士資格試験について",
      url: "https://www.retio.or.jp/exam/schedule/",
      checkedAt: REVIEWED_AT,
      snapshotId: "retio-2026-schedule@2026-09-10",
      snapshotHash: "20cd159f238b4fdbb539ad1b038523289bfdb2d262e82142efe62a0b47690cd8"
    },
    {
      id: "retio-2025-official-question",
      publisher: "一般財団法人 不動産適正取引推進機構",
      title: "令和7年度 宅地建物取引士資格試験問題・正解番号表",
      url: "https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf",
      checkedAt: REVIEWED_AT,
      snapshotId: "retio-2025-official-question@2026-09-10",
      snapshotHash: "a3c7b1d3c06c50c0f10bf44fe6e9d45fe3b3301cf55f9843f36295bda624c80a"
    },
    {
      id: "mlit-takken-law-2026",
      publisher: "国土交通省",
      title: "宅地建物取引業法 法令改正・解釈について",
      url: "https://www.mlit.go.jp/totikensangyo/const/1_6_bt_000268.html",
      checkedAt: REVIEWED_AT,
      snapshotId: "mlit-takken-law-2026@2026-09-10",
      snapshotHash: "99c17c2d993f049c5199fedf34cbe3e5086e2d1d01af400d0b0da10332f2e6dd"
    },
    {
      id: "mlit-2026-land-price",
      publisher: "国土交通省",
      title: "令和8年地価公示データ更新",
      url: "https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo17_hh_000001_00078.html",
      checkedAt: REVIEWED_AT,
      snapshotId: "mlit-2026-land-price@2026-09-10",
      snapshotHash: "e960c805b24901d85ac29d67fe729403f394cdb0f7c38a0fbf06c9686bc88572"
    },
    {
      id: "mlit-2026-land-white-paper",
      publisher: "国土交通省",
      title: "令和8年版 土地白書",
      url: "https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo02_hh_000001_00116.html",
      checkedAt: REVIEWED_AT,
      snapshotId: "mlit-2026-land-white-paper@2026-09-10",
      snapshotHash: "df13470ce26e1fdc49560ae6b0b2428b6c3914520615f5fe150698471f1db67c"
    },
    {
      id: "mlit-tax-acquisition",
      publisher: "国土交通省",
      title: "土地の取得に係る税制の概要（参考）",
      url: "https://www.mlit.go.jp/totikensangyo/totikensangyo_tk5_000072.html",
      checkedAt: REVIEWED_AT,
      snapshotId: "mlit-tax-acquisition@2026-09-10",
      snapshotHash: "019e26026cf95b9657ba6ef26d6022cf964c6bb113ac8381bde77f8ea29ac2cf"
    },
    {
      id: "mlit-tax-holding",
      publisher: "国土交通省",
      title: "土地の保有に係る税制",
      url: "https://www.mlit.go.jp/totikensangyo/totikensangyo_tk5_000073.html",
      checkedAt: REVIEWED_AT,
      snapshotId: "mlit-tax-holding@2026-09-10",
      snapshotHash: "e5708c36178dd3df837ef086bcfc6e4067461b505c1e8beadd60f04cf2dfcb6d"
    },
    {
      id: "mlit-tax-reform-2026",
      publisher: "国土交通省",
      title: "令和8年度 国土交通省税制改正概要",
      url: "https://www.mlit.go.jp/page/content/001975596.pdf",
      checkedAt: REVIEWED_AT,
      snapshotId: "mlit-tax-reform-2026@2026-09-10",
      snapshotHash: "5eb34706232bbf29b43281554894487daf6953d8a48932274c05bd7dad0321e6"
    }
  ]);
  const SOURCE_BY_ID = deepFreeze(Object.fromEntries(SOURCES.map((source) => [source.id, source])));

  // This is a build-time receipt for the reviewed official source records, not a
  // claim that the static bundle can observe live pages. Once it ages out, the
  // caller must refresh the receipt before this build may call a card current.
  function reviewReceiptFor(sourceIds, checkedAt = REVIEWED_AT) {
    return deepFreeze({
      checkedAt,
      sourceSnapshotHashes: deepFreeze(Object.fromEntries(sourceIds.map((id) => [id, SOURCE_BY_ID[id].snapshotHash])))
    });
  }

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
      checkedAt: REVIEWED_AT,
      maxAgeDays: 14,
      effectiveOn: LEGAL_BASELINE,
      expiresOn: "2026-10-18",
      sourceIds: ["retio-2026-exam-guide", "mlit-takken-law-2026"],
      reviewReceipt: reviewReceiptFor(["retio-2026-exam-guide", "mlit-takken-law-2026"]),
      answerPolicy: "source-linked-current-law-only",
      checkpoint: "問題の法令根拠を2026年4月1日現在施行の規定に固定し、過去問の旧法正答を現行法正答として流用しない。"
    },
    {
      id: "statistics-land-price-2026",
      category: "statistics",
      title: "2026年地価公示",
      status: "reviewed",
      reviewedAt: REVIEWED_AT,
      checkedAt: REVIEWED_AT,
      maxAgeDays: 7,
      effectiveOn: "2026-03-18",
      expiresOn: "2026-10-18",
      sourceIds: ["mlit-2026-land-price"],
      reviewReceipt: reviewReceiptFor(["mlit-2026-land-price"]),
      answerPolicy: "source-checkpoint-no-stored-quiz-numerics",
      checkpoint: "当年資料の公開を確認済み。統計数値は出典再確認後にのみ出題し、このカード自体は数値解答を保持しない。"
    },
    {
      id: "statistics-land-white-paper-2026",
      category: "statistics",
      title: "2026年版土地白書",
      status: "reviewed",
      reviewedAt: REVIEWED_AT,
      checkedAt: REVIEWED_AT,
      maxAgeDays: 7,
      effectiveOn: "2026-07-10",
      expiresOn: "2026-10-18",
      sourceIds: ["mlit-2026-land-white-paper"],
      reviewReceipt: reviewReceiptFor(["mlit-2026-land-white-paper"]),
      answerPolicy: "source-checkpoint-no-stored-quiz-numerics",
      checkpoint: "当年版の閣議決定を確認済み。数値・前年比は出典再確認後にのみ問題化する。"
    },
    {
      id: "tax-acquisition-2026",
      category: "tax",
      title: "不動産取得時税制の2026確認",
      status: "reviewed",
      reviewedAt: REVIEWED_AT,
      checkedAt: REVIEWED_AT,
      maxAgeDays: 14,
      effectiveOn: LEGAL_BASELINE,
      expiresOn: "2026-10-18",
      sourceIds: ["mlit-tax-acquisition", "mlit-tax-reform-2026"],
      reviewReceipt: reviewReceiptFor(["mlit-tax-acquisition", "mlit-tax-reform-2026"]),
      answerPolicy: "source-checkpoint-before-quiz",
      checkpoint: "不動産取得税・登録免許税等の特例期限は当年資料で再確認してから出題する。"
    },
    {
      id: "tax-holding-2026",
      category: "tax",
      title: "保有税制の2026確認",
      status: "reviewed",
      reviewedAt: REVIEWED_AT,
      checkedAt: REVIEWED_AT,
      maxAgeDays: 14,
      effectiveOn: LEGAL_BASELINE,
      expiresOn: "2026-10-18",
      sourceIds: ["mlit-tax-holding", "mlit-tax-reform-2026"],
      reviewReceipt: reviewReceiptFor(["mlit-tax-holding", "mlit-tax-reform-2026"]),
      answerPolicy: "source-checkpoint-before-quiz",
      checkpoint: "固定資産税・都市計画税の特例や期限は当年資料で再確認してから出題する。"
    }
  ]);
  const FRESHNESS_CARD_BY_ID = deepFreeze(Object.fromEntries(FRESHNESS_CARDS.map((card) => [card.id, card])));

  function officialSourceIsValid(source) {
    return Boolean(
      source &&
      typeof source.id === "string" &&
      typeof source.snapshotId === "string" &&
      source.snapshotId === `${source.id}@${source.checkedAt}` &&
      typeof source.snapshotHash === "string" &&
      /^[a-f0-9]{64}$/.test(source.snapshotHash) &&
      validDate(source.checkedAt) &&
      officialUrl(source.url)
    );
  }

  function cardReceiptIsIntact(card) {
    if (!card || !Array.isArray(card.sourceIds) || !card.sourceIds.length) return false;
    if (!card.reviewReceipt || !exactStringKeys(card.reviewReceipt, ["checkedAt", "sourceSnapshotHashes"])) return false;
    if (card.reviewReceipt.checkedAt !== card.checkedAt || !validDate(card.reviewReceipt.checkedAt)) return false;
    const hashes = card.reviewReceipt.sourceSnapshotHashes;
    if (!exactStringKeys(hashes, card.sourceIds)) return false;
    return card.sourceIds.every((id) => {
      const source = SOURCE_BY_ID[id];
      return officialSourceIsValid(source) &&
        source.checkedAt === card.checkedAt &&
        hashes[id] === source.snapshotHash;
    });
  }

  function assessFreshness(cardOrId, asOf = REVIEWED_AT) {
    const card = typeof cardOrId === "string" ? FRESHNESS_CARD_BY_ID[cardOrId] : cardOrId;
    if (!card || !validDate(asOf) || !validDate(card.reviewedAt) || !validDate(card.checkedAt) || !validDate(card.effectiveOn) || !validDate(card.expiresOn)) {
      return deepFreeze({ status: "unknown", current: false, failClosed: true, reason: "invalid-or-missing-freshness-data" });
    }
    if (card.status !== "reviewed") return deepFreeze({ status: "unknown", current: false, failClosed: true, reason: "not-reviewed" });
    if (card.reviewedAt !== card.checkedAt || !Number.isInteger(card.maxAgeDays) || card.maxAgeDays < 1) {
      return deepFreeze({ status: "unknown", current: false, failClosed: true, reason: "invalid-or-missing-review-receipt" });
    }
    if (!Array.isArray(card.sourceIds) || !card.sourceIds.length || card.sourceIds.some((id) => !SOURCE_BY_ID[id])) {
      return deepFreeze({ status: "unknown", current: false, failClosed: true, reason: "missing-primary-source" });
    }
    if (!cardReceiptIsIntact(card)) {
      return deepFreeze({ status: "unknown", current: false, failClosed: true, reason: "invalid-or-missing-review-receipt" });
    }
    if (asOf < card.effectiveOn) return deepFreeze({ status: "not-yet-effective", current: false, failClosed: true, reason: "before-effective-date" });
    if (asOf < card.checkedAt) return deepFreeze({ status: "unknown", current: false, failClosed: true, reason: "before-review-date" });
    if (asOf > card.expiresOn) return deepFreeze({ status: "expired", current: false, failClosed: true, reason: "past-expiry-date" });
    if (dateAgeDays(card.checkedAt, asOf) > card.maxAgeDays) {
      return deepFreeze({ status: "stale", current: false, failClosed: true, reason: "review-receipt-expired" });
    }
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
