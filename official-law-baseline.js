"use strict";

(() => {
  const SCHEMA_VERSION = 1;
  const CURRENT_LAW_BASELINE = "2026-04-01";
  const REVIEWED_AT = "2026-08-15";
  const MASTERY_FACT_TOTAL = 134;

  const EXAM_IDS = [
    "2025",
    "2024",
    "2023",
    "2022",
    "2021-12",
    "2021-10",
    "2020-12",
    "2020-10",
    "2019",
    "2018",
    "2017",
    "2016"
  ];
  const BUSINESS_QUESTION_NUMBERS = Array.from({ length: 20 }, (_, index) => index + 26);

  function deepFreeze(value, seen = new WeakSet()) {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
    if (Object.isFrozen(value) || seen.has(value)) return value;
    seen.add(value);
    Object.getOwnPropertyNames(value).forEach((name) => deepFreeze(value[name], seen));
    return Object.freeze(value);
  }

  const SOURCES = deepFreeze([
    {
      id: "retio-past-exams",
      publisher: "一般財団法人 不動産適正取引推進機構",
      title: "宅建試験の問題及び正解番号表",
      url: "https://www.retio.or.jp/exam/past_ques_ans/other/",
      checkedAt: REVIEWED_AT
    },
    {
      id: "retio-2016-question-answer",
      publisher: "一般財団法人 不動産適正取引推進機構",
      title: "平成28年度 宅地建物取引士資格試験問題・正解番号表",
      url: "https://www.retio.or.jp/wp-content/uploads/2024/10/H28-q_a.pdf",
      checkedAt: REVIEWED_AT
    },
    {
      id: "retio-2021-10-question",
      publisher: "一般財団法人 不動産適正取引推進機構",
      title: "令和3年度 10月試験 問題",
      url: "https://www.retio.or.jp/wp-content/uploads/2024/12/R3-question.pdf",
      checkedAt: REVIEWED_AT
    },
    {
      id: "retio-2021-10-answer",
      publisher: "一般財団法人 不動産適正取引推進機構",
      title: "令和3年度 10月試験 正解番号表",
      url: "https://www.retio.or.jp/wp-content/uploads/2024/10/R3-answer.pdf",
      checkedAt: REVIEWED_AT
    },
    {
      id: "mlit-electronic-documents-2022",
      publisher: "国土交通省",
      title: "不動産取引時の書面が電子書面で提供できるようになります",
      url: "https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo16_hh_000001_00036.html",
      checkedAt: REVIEWED_AT
    },
    {
      id: "egov-real-estate-brokerage-act-2026-04-01",
      publisher: "e-Gov法令検索",
      title: "宅地建物取引業法（2026年4月1日基準）",
      url: "https://laws.e-gov.go.jp/law/327AC1000000176?occasion_date=20260401",
      checkedAt: REVIEWED_AT
    }
  ]);
  const SOURCE_BY_ID = deepFreeze(Object.fromEntries(SOURCES.map((source) => [source.id, source])));

  const LAW_CHANGES = deepFreeze([
    {
      id: "digital-documents-and-seal-removal-2022-05-18",
      baseline: CURRENT_LAW_BASELINE,
      effectiveDate: "2022-05-18",
      reviewedAt: REVIEWED_AT,
      title: "35条・37条等の押印廃止と書面の電磁的方法による提供",
      summary: "宅地建物取引士の押印を不要とし、相手方の承諾等を前提に重要事項説明書、37条書面、媒介契約書面等を電磁的方法で提供できるようにした。",
      sourceIds: [
        "mlit-electronic-documents-2022",
        "egov-real-estate-brokerage-act-2026-04-01"
      ],
      supplementRequirementId: "master-digital-documents-and-seal-removal"
    }
  ]);
  const LAW_CHANGE_BY_ID = deepFreeze(Object.fromEntries(LAW_CHANGES.map((change) => [change.id, change])));

  const QUESTION_CHANGES = deepFreeze([
    {
      id: "2016-q30-current-law",
      examId: "2016",
      questionNumber: 30,
      questionKey: "2016-q30",
      section: "business",
      baseline: CURRENT_LAW_BASELINE,
      reviewStatus: "reviewed-changed",
      currentLawDisposition: "answer-changed",
      historicalAnswer: 4,
      currentLawAnswer: 3,
      affectedStatements: ["choice-3", "choice-4"],
      historicalRule: "37条書面は書面交付を前提とし、宅地建物取引士の記名押印が必要だった。",
      currentRule: "相手方の承諾等を前提に電磁的方法による提供ができ、宅地建物取引士の押印は不要で記名が必要となる。",
      effectiveDate: "2022-05-18",
      reviewedAt: REVIEWED_AT,
      sourceIds: [
        "retio-2016-question-answer",
        "mlit-electronic-documents-2022",
        "egov-real-estate-brokerage-act-2026-04-01"
      ],
      lawChangeId: "digital-documents-and-seal-removal-2022-05-18",
      supplementRequirementId: "master-digital-documents-and-seal-removal"
    },
    {
      id: "2021-10-q41-current-law",
      examId: "2021-10",
      questionNumber: 41,
      questionKey: "2021-10-q41",
      section: "business",
      baseline: CURRENT_LAW_BASELINE,
      reviewStatus: "reviewed-changed",
      currentLawDisposition: "rewrite-required",
      historicalAnswer: 1,
      currentLawAnswer: null,
      affectedStatements: ["statement-a"],
      historicalRule: "関与した各宅地建物取引業者は宅地建物取引士に37条書面へ記名押印させる必要があり、アが正しいため正しいものは一つだった。",
      currentRule: "押印は不要で記名のみが必要である。原文の記名押印を要求するアは現行法では誤りとなり、原文の個数選択肢には正答がなくなるため改題が必要である。",
      effectiveDate: "2022-05-18",
      reviewedAt: REVIEWED_AT,
      sourceIds: [
        "retio-2021-10-question",
        "retio-2021-10-answer",
        "mlit-electronic-documents-2022",
        "egov-real-estate-brokerage-act-2026-04-01"
      ],
      lawChangeId: "digital-documents-and-seal-removal-2022-05-18",
      supplementRequirementId: "master-digital-documents-and-seal-removal"
    }
  ]);
  const QUESTION_CHANGE_BY_KEY = deepFreeze(Object.fromEntries(
    QUESTION_CHANGES.map((change) => [change.questionKey, change])
  ));

  const QUESTION_REVIEWS = deepFreeze(EXAM_IDS.flatMap((examId) =>
    BUSINESS_QUESTION_NUMBERS.map((questionNumber) => {
      const questionKey = `${examId}-q${questionNumber}`;
      const change = QUESTION_CHANGE_BY_KEY[questionKey] || null;
      return {
        examId,
        questionNumber,
        questionKey,
        section: "business",
        baseline: CURRENT_LAW_BASELINE,
        reviewStatus: change ? "reviewed-changed" : "unreviewed",
        currentLawProofEligible: false,
        changeId: change ? change.id : null,
        reviewedAt: change ? change.reviewedAt : null
      };
    })
  ));
  const QUESTION_REVIEW_BY_KEY = deepFreeze(Object.fromEntries(
    QUESTION_REVIEWS.map((review) => [review.questionKey, review])
  ));

  const EXAM_BASELINES = deepFreeze(EXAM_IDS.map((examId) => {
    const reviews = QUESTION_REVIEWS.filter((review) => review.examId === examId);
    const reviewedBusinessQuestionNumbers = reviews
      .filter((review) => review.reviewStatus !== "unreviewed")
      .map((review) => review.questionNumber);
    const unreviewedBusinessQuestionNumbers = reviews
      .filter((review) => review.reviewStatus === "unreviewed")
      .map((review) => review.questionNumber);
    return {
      examId,
      historicalLawStatus: "historical",
      currentLawBaseline: CURRENT_LAW_BASELINE,
      currentLawReviewStatus: reviewedBusinessQuestionNumbers.length ? "partial" : "unreviewed",
      reviewedBusinessQuestionNumbers,
      unreviewedBusinessQuestionNumbers,
      canDeriveCurrentLawScore: false,
      historicalScoringPolicy: "preserve-official-answer-key",
      currentLawScoringPolicy: "never-infer-from-historical-key"
    };
  }));
  const EXAM_BASELINE_BY_ID = deepFreeze(Object.fromEntries(
    EXAM_BASELINES.map((exam) => [exam.examId, exam])
  ));

  const REQUIRED_SUPPLEMENT_QUESTION_KEYS = deepFreeze(
    QUESTION_CHANGES.map((change) => change.questionKey)
  );

  function getExamBaseline(examId) {
    return EXAM_BASELINE_BY_ID[String(examId || "")] || null;
  }

  function getQuestionReview(examId, questionNumber) {
    const number = Number(questionNumber);
    if (!Number.isInteger(number)) return null;
    return QUESTION_REVIEW_BY_KEY[`${String(examId || "")}-q${number}`] || null;
  }

  function validDateStamp(value) {
    if (typeof value !== "string") return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
    if (!match) return false;
    const dateOnly = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
    const dateIsReal = Number.isFinite(dateOnly.getTime())
      && dateOnly.getUTCFullYear() === Number(match[1])
      && dateOnly.getUTCMonth() + 1 === Number(match[2])
      && dateOnly.getUTCDate() === Number(match[3]);
    return dateIsReal && (!value.includes("T") || Number.isFinite(Date.parse(value)));
  }

  function masterySatisfied(evidence) {
    return Boolean(
      evidence
      && evidence.baseline === CURRENT_LAW_BASELINE
      && evidence.totalFactCount === MASTERY_FACT_TOTAL
      && evidence.masteredFactCount === MASTERY_FACT_TOTAL
      && evidence.allFactsRetained === true
      && validDateStamp(evidence.completedAt)
    );
  }

  function supplementSatisfied(evidence) {
    if (!evidence || evidence.baseline !== CURRENT_LAW_BASELINE) return false;
    if (!validDateStamp(evidence.completedAt) || !Array.isArray(evidence.masteredQuestionKeys)) return false;
    const mastered = new Set(evidence.masteredQuestionKeys.map(String));
    return REQUIRED_SUPPLEMENT_QUESTION_KEYS.every((questionKey) => mastered.has(questionKey));
  }

  function assessCurrentLawProof(input = {}) {
    const examId = String(input.examId || "");
    const exam = getExamBaseline(examId);
    const score = input.historicalBusinessScore;
    const historicalBusinessScore = exam && typeof score === "number" && Number.isInteger(score) && score >= 0 && score <= 20
      ? score
      : null;
    const historicalPerfect = historicalBusinessScore === 20;
    const masteryComplete = masterySatisfied(input.currentLawMastery);
    const supplementComplete = supplementSatisfied(input.currentLawSupplement);
    const missingRequirements = [];
    if (!exam) missingRequirements.push("known-official-exam");
    if (!historicalPerfect) missingRequirements.push("historical-business-20-of-20");
    if (!masteryComplete) missingRequirements.push("current-law-134-question-retention");
    if (!supplementComplete) missingRequirements.push("current-law-changed-question-supplement");
    const eligible = missingRequirements.length === 0;

    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      examId,
      examKnown: Boolean(exam),
      historical: {
        lawStatus: "historical",
        businessScore: historicalBusinessScore,
        perfect: historicalPerfect,
        scoringPolicy: "preserve-official-answer-key"
      },
      currentLaw: {
        baseline: CURRENT_LAW_BASELINE,
        historicalExamScoreUsed: false,
        derivedExamScore: null,
        proofMethod: "historical-exam-plus-current-law-supplement-and-mastery",
        masterySatisfied: masteryComplete,
        supplementSatisfied: supplementComplete,
        missingRequirements,
        eligible
      },
      audit: {
        reviewStatus: exam ? exam.currentLawReviewStatus : "unknown-exam",
        reviewedBusinessQuestionCount: exam ? exam.reviewedBusinessQuestionNumbers.length : 0,
        unreviewedBusinessQuestionCount: exam ? exam.unreviewedBusinessQuestionNumbers.length : 20,
        failClosed: true
      }
    });
  }

  const api = deepFreeze({
    SCHEMA_VERSION,
    CURRENT_LAW_BASELINE,
    REVIEWED_AT,
    MASTERY_FACT_TOTAL,
    EXAM_IDS: deepFreeze([...EXAM_IDS]),
    BUSINESS_QUESTION_NUMBERS: deepFreeze([...BUSINESS_QUESTION_NUMBERS]),
    SOURCES,
    SOURCE_BY_ID,
    LAW_CHANGES,
    LAW_CHANGE_BY_ID,
    QUESTION_CHANGES,
    QUESTION_CHANGE_BY_KEY,
    QUESTION_REVIEWS,
    QUESTION_REVIEW_BY_KEY,
    EXAM_BASELINES,
    EXAM_BASELINE_BY_ID,
    REQUIRED_SUPPLEMENT_QUESTION_KEYS,
    getExamBaseline,
    getQuestionReview,
    assessCurrentLawProof
  });

  if (typeof window !== "undefined") window.TAKKEN_OFFICIAL_LAW_BASELINE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
