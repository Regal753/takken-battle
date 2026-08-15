"use strict";

(() => {
  const URL_PARAMS = new URLSearchParams(window.location.search);
  const PUBLIC_STATIC_MODE =
    document.querySelector('meta[name="takken-runtime"]')?.content === "public-static";
  const REVIEW_MODE = URL_PARAMS.has("review") || URL_PARAMS.has("sandbox");
  const REVIEW_NAMESPACE = REVIEW_MODE
    ? String(URL_PARAMS.get("review") || URL_PARAMS.get("sandbox") || "default").replace(/[^a-z0-9-]/gi, "").slice(0, 24)
    : "";
  const STORAGE_ID = `takken-battle-study-clean-v2-hard${REVIEW_MODE ? `-review-${REVIEW_NAMESPACE || "default"}` : ""}`;
  const EVENT_OUTBOX_ID = `${STORAGE_ID}-event-outbox`;
  const SAVE_STORE = window.TAKKEN_SAVE_STORE;
  const STATE_SYNC = window.TAKKEN_STATE_SYNC;
  const OFFICIAL_EXAM_DATA = window.TAKKEN_OFFICIAL_EXAMS;
  const OFFICIAL_LAW_BASELINE = window.TAKKEN_OFFICIAL_LAW_BASELINE;
  const CALCULATION_DRILL = window.TAKKEN_CALCULATION_DRILL;
  const CALCULATION_QUESTIONS = CALCULATION_DRILL?.QUESTIONS || [];
  const CALCULATION_QUESTION_BY_ID = Object.fromEntries(
    CALCULATION_QUESTIONS.map((item) => [item.id, item])
  );
  const CALCULATION_QUESTION_IDS = Object.freeze(CALCULATION_QUESTIONS.map((item) => item.id));
  const PRACTICAL_VARIATIONS = window.TAKKEN_PRACTICAL_VARIATIONS;
  const BUSINESS_MASTERY = window.TAKKEN_BUSINESS_MASTERY;
  const BUSINESS_KNOCK = window.TAKKEN_BUSINESS_KNOCK;
  const BUSINESS_PACE = window.TAKKEN_BUSINESS_PACE;
  const BUSINESS_FULLSCORE_BANK = window.TAKKEN_BUSINESS_FULLSCORE_BANK;
  const PRACTICAL_QUESTIONS = PRACTICAL_VARIATIONS?.QUESTIONS || [];
  const PRACTICAL_QUESTION_BY_ID = Object.fromEntries(
    PRACTICAL_QUESTIONS.map((item) => [item.id, item])
  );
  const PRACTICAL_QUESTION_IDS = Object.freeze(PRACTICAL_QUESTIONS.map((item) => item.id));
  const BUSINESS_FULLSCORE_BANK_ID = "business-fullscore";
  const LEGACY_PRACTICAL_BANK_ID = "legacy-practical";
  const BUSINESS_FULLSCORE_EXPECTED_QUESTIONS = 134;
  const BUSINESS_KNOCK_MODES = Object.freeze(["weak-due", "untouched", "unit", "all-random"]);
  const BUSINESS_KNOCK_SIZES = Object.freeze([10, 20, 50, 100]);
  const CURRENT_LAW_DELTA_QUESTION_MAP = Object.freeze({
    "2016-q30": "bf-business-book-07-supplement-bs018-01",
    "2021-10-q41": "bf-business-book-07-supplement-bs018-02"
  });
  const BUSINESS_DIAGNOSTIC_LABELS = Object.freeze({
    subject: "主体",
    timing: "時点",
    counterparty: "相手方",
    number: "数値",
    "principle-exception": "原則例外",
    "article-35": "35条",
    "article-37": "37条",
    "eight-restrictions": "8種",
    "transaction-type": "取引類型",
    amendment: "改正"
  });
  const BUSINESS_DIAGNOSTIC_TAGS = new Set(
    (Array.isArray(BUSINESS_FULLSCORE_BANK?.ALLOWED_DIAGNOSTIC_TAGS)
      ? BUSINESS_FULLSCORE_BANK.ALLOWED_DIAGNOSTIC_TAGS
      : Object.keys(BUSINESS_DIAGNOSTIC_LABELS))
      .map(String)
      .filter((tag) => Boolean(BUSINESS_DIAGNOSTIC_LABELS[tag]))
  );
  const normalizeFullScoreQuestion = (item) => {
    const choices = Array.isArray(item?.choices) ? item.choices.map(String) : [];
    const answer = Number(item?.answer);
    const reasoning = Array.isArray(item?.reasoningSteps)
      ? item.reasoningSteps.map((step) => typeof step === "string" ? step : String(step?.text || step?.body || "")).filter(Boolean)
      : [];
    const sourceUrls = Array.isArray(item?.sourceUrls)
      ? item.sourceUrls.map(String).filter(Boolean)
      : item?.sourceUrl ? [String(item.sourceUrl)] : [];
    if (
      !item || !String(item.id || "") || !String(item.unitId || "") ||
      !String(item.text || "") || choices.length !== 4 ||
      !Number.isInteger(answer) || answer < 0 || answer > 3
    ) return null;
    return Object.freeze({
      ...item,
      id: String(item.id),
      scopeId: "business",
      unitId: String(item.unitId),
      unitLabel: String(item.unitLabel || item.unitId),
      unitPage: Math.max(0, Number(item.unitPage || item.page) || 0),
      text: String(item.text),
      choices: Object.freeze(choices),
      answer,
      explain: String(item.explain || reasoning[0] || "正解肢と各肢の根拠を確認する。"),
      statementExplanations: Object.freeze(
        (Array.isArray(item.statementExplanations) ? item.statementExplanations :
          Array.isArray(item.choiceExplanations) ? item.choiceExplanations : reasoning.slice(1))
          .map(String)
      ),
      trap: String(item.trap || reasoning.at(-2) || "主体・時期・例外を取り違えない。"),
      memoryRule: String(item.memoryRule || reasoning.at(-1) || "根拠から再現する。"),
      sourceUrls: Object.freeze(sourceUrls),
      sourceRef: String(item.sourceRef || item.sourceLocator || "公式根拠"),
      legalBaseline: String(item.legalBaseline || item.lawBaseline || BUSINESS_FULLSCORE_BANK?.LEGAL_BASELINE || "")
    });
  };
  const BUSINESS_FULLSCORE_QUESTIONS = Object.freeze(
    (Array.isArray(BUSINESS_FULLSCORE_BANK?.QUESTIONS) ? BUSINESS_FULLSCORE_BANK.QUESTIONS : [])
      .map(normalizeFullScoreQuestion)
      .filter(Boolean)
  );
  const BUSINESS_FULLSCORE_QUESTION_BY_ID = Object.freeze(Object.fromEntries(
    BUSINESS_FULLSCORE_QUESTIONS.map((item) => [item.id, item])
  ));
  const BUSINESS_FULLSCORE_QUESTION_IDS = Object.freeze(BUSINESS_FULLSCORE_QUESTIONS.map((item) => item.id));
  const BUSINESS_FULLSCORE_UNITS = Object.freeze(
    (Array.isArray(BUSINESS_FULLSCORE_BANK?.UNITS) ? BUSINESS_FULLSCORE_BANK.UNITS : [])
      .filter((unit) => unit && String(unit.id || ""))
      .map((unit) => Object.freeze({
        ...unit,
        id: String(unit.id),
        label: String(unit.label || unit.id),
        page: Math.max(0, Number(unit.page) || 0),
        part: Math.max(1, Number(unit.part) || 1)
      }))
  );
  const BUSINESS_FULLSCORE_BANK_READY = Boolean(
    BUSINESS_MASTERY &&
    OFFICIAL_LAW_BASELINE?.CURRENT_LAW_BASELINE === "2026-04-01" &&
    BUSINESS_FULLSCORE_BANK?.LEGAL_BASELINE === "2026-04-01" &&
    BUSINESS_FULLSCORE_QUESTIONS.length === BUSINESS_FULLSCORE_EXPECTED_QUESTIONS &&
    new Set(BUSINESS_FULLSCORE_QUESTION_IDS).size === BUSINESS_FULLSCORE_EXPECTED_QUESTIONS &&
    BUSINESS_FULLSCORE_UNITS.length === 11 &&
    Object.values(CURRENT_LAW_DELTA_QUESTION_MAP).every((id) =>
      Boolean(BUSINESS_FULLSCORE_QUESTION_BY_ID[id])
    ) &&
    BUSINESS_FULLSCORE_QUESTIONS.every((question) =>
      BUSINESS_FULLSCORE_UNITS.some((unit) => unit.id === question.unitId)
    )
  );
  const BUSINESS_KNOCK_READY = BUSINESS_FULLSCORE_BANK_READY &&
    Boolean(BUSINESS_KNOCK?.plan && typeof BUSINESS_FULLSCORE_BANK?.presentQuestion === "function");
  const ALL_PRACTICAL_QUESTION_BY_ID = Object.freeze({
    ...PRACTICAL_QUESTION_BY_ID,
    ...BUSINESS_FULLSCORE_QUESTION_BY_ID
  });
  const PRACTICAL_SCOPES = Object.freeze(["all", "business", "rights", "lawOther", "restrictions", "taxOther"]);
  const PRACTICAL_SCOPE_LABELS = Object.freeze({
    all: "全分野",
    business: "宅建業法",
    rights: "権利関係",
    lawOther: "法令・税その他",
    restrictions: "法令上の制限",
    taxOther: "税・その他"
  });
  const PRACTICAL_SESSION_SIZES = Object.freeze([4, 10, 20, 45]);
  const STATE_SCHEMA_VERSION = 10;
  const DAILY_TARGET = 10;
  const FOUNDATION_UNIT_BATCH_MAX = 4;
  const SPRINT_MINUTES = 25;
  const TODAY_QUEST_PARAM = URL_PARAMS.has("today") || URL_PARAMS.has("quest");
  const FIRST_PASS_PARAM = URL_PARAMS.has("pass") || URL_PARAMS.has("firstpass") || URL_PARAMS.has("onepass");
  const RUN_MODE_FIRST_PASS = "first-pass";
  const RUN_MODE_MOCK = "mock";
  const RUN_MODE_CHAPTER = "chapter";
  const MOCK_DURATION_MINUTES = 120;
  const MOCK_DURATION_MS = MOCK_DURATION_MINUTES * 60 * 1000;
  const OFFICIAL_PAST_EXAMS_URL = "https://www.retio.or.jp/exam/past_ques_ans/other/";
  const FIRST_PASS_DEADLINE = "2026-10-18";
  const FIRST_PASS_DEADLINE_LABEL = "10/18";
  const DAILY_STUDY_MINUTES = 90;
  const OFFICIAL_DRILL_EVIDENCE_VERSION = 3;
  const OFFICIAL_EXAM_EVIDENCE_VERSION = 3;
  const OFFICIAL_EXAM_LEGACY_EVIDENCE_VERSION = 2;
  const OFFICIAL_HISTORICAL_SCORING_BASIS = "historical-official-key";
  const OFFICIAL_INITIAL_TARGET = 10;
  const OFFICIAL_RETEST_TARGET = 3;
  const OFFICIAL_RETEST_WAIT_DAYS = 14;
  const CURRENT_LAW_BASELINE = "2026-04-01";
  let saveStoreSession = {
    source: "empty",
    notice: "",
    isError: false,
    skipPreviousRotation: false
  };
  let lastSuccessfulSaveAt = "";
  let lastSaveError = "";
  let syncBaseState = null;
  let syncWriterId = "";
  let storageEstimatePending = false;
  let storageEstimateChecked = false;
  let storageEstimate = null;
  const OFFICIAL_EXAMS = OFFICIAL_EXAM_DATA?.EXAMS || [];
  const OFFICIAL_EXAM_BY_ID = OFFICIAL_EXAM_DATA?.EXAM_BY_ID || {};
  const officialDrillQuestions = (items) => Object.freeze(
    items.map((item) => Object.freeze({
      ...item,
      verifiedAsOf: "2025-04-01",
      lawStatus: "historical"
    }))
  );
  const OFFICIAL_DAILY_DRILL_DEFINITIONS = Object.freeze([
    Object.freeze({
      id: "2025-balanced-a-v1",
      label: "令和7年度・公式20問 A",
      questionRange: "問1–6・15–17・23–24・26–33・46",
      year: 2025,
      lawAsOf: "2025-04-01",
      durationMinutes: 35,
      targetScore: 15,
      safeScore: 16,
      questionUrl: "https://goukaku.retio.or.jp/exam/pdf_2025_1_UWbaZCx6hm/2025question.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf",
      questions: officialDrillQuestions([
        { number: 1, answer: 3, section: "rights" },
        { number: 2, answer: 3, section: "rights" },
        { number: 3, answer: 3, section: "rights" },
        { number: 4, answer: 4, section: "rights" },
        { number: 5, answer: 4, section: "rights" },
        { number: 6, answer: 1, section: "rights" },
        { number: 15, answer: 4, section: "restrictions" },
        { number: 16, answer: 4, section: "restrictions" },
        { number: 17, answer: 2, section: "restrictions" },
        { number: 23, answer: 1, section: "taxOther" },
        { number: 24, answer: 2, section: "taxOther" },
        { number: 26, answer: 4, section: "business" },
        { number: 27, answer: 1, section: "business" },
        { number: 28, answer: 2, section: "business" },
        { number: 29, answer: 2, section: "business" },
        { number: 30, answer: 3, section: "business" },
        { number: 31, answer: 4, section: "business" },
        { number: 32, answer: 2, section: "business" },
        { number: 33, answer: 3, section: "business" },
        { number: 46, answer: 2, section: "taxOther" }
      ])
    }),
    Object.freeze({
      id: "2025-balanced-b-v1",
      label: "令和7年度・公式20問 B",
      questionRange: "問7–12・18–20・25・34–41・47–48",
      year: 2025,
      lawAsOf: "2025-04-01",
      durationMinutes: 35,
      targetScore: 15,
      safeScore: 16,
      questionUrl: "https://goukaku.retio.or.jp/exam/pdf_2025_1_UWbaZCx6hm/2025question.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf",
      questions: officialDrillQuestions([
        { number: 7, answer: 1, section: "rights" },
        { number: 8, answer: 2, section: "rights" },
        { number: 9, answer: 1, section: "rights" },
        { number: 10, answer: 3, section: "rights" },
        { number: 11, answer: 3, section: "rights" },
        { number: 12, answer: 3, section: "rights" },
        { number: 18, answer: 2, section: "restrictions" },
        { number: 19, answer: 2, section: "restrictions" },
        { number: 20, answer: 4, section: "restrictions" },
        { number: 25, answer: 1, section: "taxOther" },
        { number: 34, answer: 3, section: "business" },
        { number: 35, answer: 1, section: "business" },
        { number: 36, answer: 4, section: "business" },
        { number: 37, answer: 4, section: "business" },
        { number: 38, answer: 3, section: "business" },
        { number: 39, answer: 4, section: "business" },
        { number: 40, answer: 3, section: "business" },
        { number: 41, answer: 1, section: "business" },
        { number: 47, answer: 3, section: "taxOther" },
        { number: 48, answer: 2, section: "taxOther" }
      ])
    }),
    Object.freeze({
      id: "2025-balanced-c-v1",
      label: "令和7年度・公式20問 C",
      questionRange: "問1・4・8・11・13–14・18・21–23・26・33・36・41–45・49–50",
      year: 2025,
      lawAsOf: "2025-04-01",
      durationMinutes: 35,
      targetScore: 15,
      safeScore: 16,
      questionUrl: "https://goukaku.retio.or.jp/exam/pdf_2025_1_UWbaZCx6hm/2025question.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf",
      questions: officialDrillQuestions([
        { number: 1, answer: 3, section: "rights" },
        { number: 4, answer: 4, section: "rights" },
        { number: 8, answer: 2, section: "rights" },
        { number: 11, answer: 3, section: "rights" },
        { number: 13, answer: 3, section: "rights" },
        { number: 14, answer: 1, section: "rights" },
        { number: 18, answer: 2, section: "restrictions" },
        { number: 21, answer: 4, section: "restrictions" },
        { number: 22, answer: 4, section: "restrictions" },
        { number: 23, answer: 1, section: "taxOther" },
        { number: 26, answer: 4, section: "business" },
        { number: 33, answer: 3, section: "business" },
        { number: 36, answer: 4, section: "business" },
        { number: 41, answer: 1, section: "business" },
        { number: 42, answer: 2, section: "business" },
        { number: 43, answer: 4, section: "business" },
        { number: 44, answer: 2, section: "business" },
        { number: 45, answer: 4, section: "business" },
        { number: 49, answer: 1, section: "taxOther" },
        { number: 50, answer: 1, section: "taxOther" }
      ])
    })
  ]);
  const OFFICIAL_DRILL_SECTION_LABELS = Object.freeze({
    rights: "権利",
    restrictions: "法令",
    business: "業法",
    taxOther: "税その他"
  });
  function officialDrillDefinitionById(setId) {
    return OFFICIAL_DAILY_DRILL_DEFINITIONS.find((item) => item.id === setId) || null;
  }
  function officialDailyDrillDefinition(missionLog = {}) {
    const counts = new Map(
      OFFICIAL_DAILY_DRILL_DEFINITIONS.map((item) => [item.id, 0])
    );
    Object.values(missionLog && typeof missionLog === "object" ? missionLog : {})
      .forEach((mission) => {
        const drill = normalizeOfficialDrill(mission?.officialDrill);
        const definition = officialDrillDefinitionById(drill?.setId);
        if (!definition || !drill?.completed) return;
        counts.set(definition.id, (counts.get(definition.id) || 0) + 1);
      });
    return OFFICIAL_DAILY_DRILL_DEFINITIONS.reduce((selected, candidate) =>
      (counts.get(candidate.id) || 0) < (counts.get(selected.id) || 0)
        ? candidate
        : selected
    );
  }
  function officialDrillDefinitionFor(drill) {
    return officialDrillDefinitionById(drill?.setId) ||
      officialDailyDrillDefinition(state?.missionLog);
  }
  const EXAM_BLUEPRINT = window.TAKKEN_EXAM_BLUEPRINT;
  const STUDY_TARGETS = EXAM_BLUEPRINT?.studyTargets || {
    total: 37,
    safe: 40,
    rights: 8,
    restrictions: 6,
    business: 18,
    taxOther: 5
  };
  const MOCK_SAFE_TARGET = STUDY_TARGETS.safe;
  const EXAM_CONTENT_VERSION = EXAM_BLUEPRINT?.version || 0;
  const STUDY_PLAN_VERSION = 3;
  const DEFAULT_STUDY_SCOPE = "business";
  const STUDY_SCOPES = [
    {
      id: "business",
      label: "① 宅建業法を固める",
      shortLabel: "宅建業法",
      newSections: ["business"],
      reviewSections: ["business"],
      targetRate: 0.8
    },
    {
      id: "rights",
      label: "② 第2分冊・権利関係を固める",
      shortLabel: "第2分冊・権利",
      newSections: ["rights"],
      reviewSections: ["business", "rights"],
      targetRate: 0.8
    },
    {
      id: "law-other",
      label: "③ 法令・税その他へ進む",
      shortLabel: "法令・税その他",
      newSections: ["restrictions", "tax", "other"],
      reviewSections: ["business", "restrictions", "tax", "other"],
      targetRate: 0.8
    },
    {
      id: "all",
      label: "④ 全分野を混ぜる",
      shortLabel: "全分野",
      newSections: ["rights", "restrictions", "tax", "business", "other"],
      reviewSections: ["rights", "restrictions", "tax", "business", "other"],
      targetRate: 0.8
    }
  ];
  const STUDY_SCOPE_IDS = new Set(STUDY_SCOPES.map((scope) => scope.id));
  const REWARD_SYSTEM = window.TAKKEN_REWARDS;
  const SAVE_TRANSFER = window.TAKKEN_SAVE_TRANSFER;
  const PROGRESSION_VERSION = REWARD_SYSTEM?.VERSION || 2;
  const QUESTION_BALANCE_VERSION = window.TAKKEN_BALANCE?.VERSION || 0;
  const MISTAKE_CAUSES = [
    { id: "knowledge", label: "知識不足" },
    { id: "mixup", label: "主体・制度混同" },
    { id: "number", label: "期限・数字" },
    { id: "exception", label: "例外見落とし" },
    { id: "reading", label: "読み飛ばし" },
    { id: "ambiguous", label: "設問自体が曖昧" }
  ];
  const MISTAKE_CAUSE_IDS = new Set(MISTAKE_CAUSES.map((item) => item.id));
  const PLAYER_RANKS = [
    { level: 1, title: "見習い" },
    { level: 3, title: "調査騎士" },
    { level: 5, title: "権利攻略兵" },
    { level: 8, title: "法令剣士" },
    { level: 12, title: "四分野の守人" },
    { level: 18, title: "合格執行官" },
    { level: 25, title: "宅建英雄" },
    { level: 35, title: "合格圏の覇者" }
  ];
  const CONTINUITY_MILESTONES = [3, 7, 14, 30];
  const BATTLE_PROFILES = {
    sentinel: {
      name: "免許の番人",
      classLabel: "NORMAL ENCOUNTER",
      trait: "主体・権限を見抜け",
      maxHp: 420,
      asset: "./assets/characters/license-sentinel.webp",
      lootKey: "license-shard",
      lootName: "免許印の欠片",
      lootColor: "#d7c49a"
    },
    mimic: {
      name: "契約書ミミック",
      classLabel: "TRICK ENCOUNTER",
      trait: "全肢を切って数えろ",
      maxHp: 360,
      asset: "./assets/characters/contract-mimic.webp",
      lootKey: "contract-page",
      lootName: "契約紙片",
      lootColor: "#d6aa63"
    },
    clock: {
      name: "期限の監視者",
      classLabel: "LIMIT ENCOUNTER",
      trait: "期限・起算点を外すな",
      maxHp: 480,
      asset: "./assets/characters/deadline-warden.webp",
      lootKey: "deadline-gear",
      lootName: "時限歯車",
      lootColor: "#88b7c7"
    },
    sphinx: {
      name: "登記の石獅子",
      classLabel: "REGISTRY ENCOUNTER",
      trait: "登録・名簿を照合せよ",
      maxHp: 520,
      asset: "./assets/characters/registry-sphinx.webp",
      lootKey: "registry-stone",
      lootName: "登記石片",
      lootColor: "#e0d9bd"
    },
    gargoyle: {
      name: "標識のガーゴイル",
      classLabel: "NOTICE ENCOUNTER",
      trait: "表示・説明義務を見抜け",
      maxHp: 560,
      asset: "./assets/characters/notice-gargoyle.webp",
      lootKey: "notice-rivet",
      lootName: "標識鋲",
      lootColor: "#9a7655"
    },
    tortoise: {
      name: "供託金庫亀",
      classLabel: "VAULT ENCOUNTER",
      trait: "金額・還付・供託を守れ",
      maxHp: 640,
      asset: "./assets/characters/vault-tortoise.webp",
      lootKey: "deposit-key",
      lootName: "供託鍵",
      lootColor: "#a98d52"
    },
    boss: {
      name: "法典城塞",
      classLabel: "CHAPTER BOSS",
      trait: "複合論点を一撃判定",
      maxHp: 1200,
      asset: "./assets/characters/law-citadel-boss.webp",
      lootKey: "codex-core",
      lootName: "法典核",
      lootColor: "#f2bd45"
    }
  };
  const LOOT_ORDER = Object.values(BATTLE_PROFILES).map((profile) => ({
    key: profile.lootKey,
    name: profile.lootName,
    color: profile.lootColor
  }));
  const LEGACY_ORDER = [
    "q116", "q117", "q118", "q119", "q120", "q121", "q122", "q123", "q124",
    "q125", "q126", "q127", "q128", "q129", "q130", "q131", "q132", "q133", "q134", "q135", "q136",
    "q6", "q7", "q8", "q9", "q41", "q42", "q43", "q44", "q45", "q88", "q89", "q90", "q91",
    "q4", "q10", "q46", "q47", "q48", "q49", "q50", "q92", "q93", "q94", "q95",
    "q11", "q13", "q51", "q52", "q53", "q54", "q55", "q96", "q97", "q98", "q99",
    "q12", "q56", "q57", "q58", "q59", "q60", "q100", "q101", "q102", "q103",
    "q14", "q15", "q61", "q62", "q63", "q64", "q65", "q104", "q105", "q106", "q107",
    "q16", "q66", "q67", "q68", "q69", "q70", "q108", "q109", "q110", "q111",
    "q17", "q18", "q19", "q20", "q71", "q72", "q73", "q74", "q75", "q112", "q113", "q114", "q115"
  ];
  const LEGACY_ID_SET = new Set(LEGACY_ORDER);

  const LEGACY_CHAPTERS = [
    { label: "旧・業法 / 免許・免許換え", ids: ["q116", "q117", "q118", "q119", "q120", "q121", "q122", "q123", "q124", "q125", "q126", "q127", "q128", "q129", "q130", "q131", "q132", "q133", "q134", "q135", "q136"] },
    { label: "旧・業法 / 宅建士・従業者", ids: ["q6", "q7", "q8", "q9", "q41", "q42", "q43", "q44", "q45", "q88", "q89", "q90", "q91"] },
    { label: "旧・業法 / 標識・案内所・広告", ids: ["q4", "q10", "q46", "q47", "q48", "q49", "q50", "q92", "q93", "q94", "q95"] },
    { label: "旧・業法 / 35条 重要事項説明", ids: ["q11", "q13", "q51", "q52", "q53", "q54", "q55", "q96", "q97", "q98", "q99"] },
    { label: "旧・業法 / 37条・契約制限", ids: ["q12", "q56", "q57", "q58", "q59", "q60", "q100", "q101", "q102", "q103"] },
    { label: "旧・業法 / 媒介契約", ids: ["q14", "q15", "q61", "q62", "q63", "q64", "q65", "q104", "q105", "q106", "q107"] },
    { label: "旧・業法 / 報酬・金銭", ids: ["q16", "q66", "q67", "q68", "q69", "q70", "q108", "q109", "q110", "q111"] },
    { label: "旧・業法 / 保証金・監督処分", ids: ["q17", "q18", "q19", "q20", "q71", "q72", "q73", "q74", "q75", "q112", "q113", "q114", "q115"] }
  ];

  const CURRICULUM_ORDER = EXAM_BLUEPRINT?.curriculumOrder || [];
  const SUPPLEMENTAL_ORDER = EXAM_BLUEPRINT?.supplementalOrder || [];
  const TEXTBOOK_RANGES = EXAM_BLUEPRINT?.textbookRanges || {};
  const TEXTBOOK_RANGE_ENTRIES = Object.entries(TEXTBOOK_RANGES);
  const SECTION_BY_ID = new Map(
    (EXAM_BLUEPRINT?.sections || []).map((section) => [section.id, section])
  );
  const TEXTBOOK_CHAPTERS = TEXTBOOK_RANGE_ENTRIES.flatMap(([rangeId, textbookRange]) => {
    const sectionIds = textbookRange.sectionIds || [rangeId];
    return (textbookRange.chapters || []).map((chapter) => {
      const sectionId = chapter.sectionId || sectionIds.find((candidate) =>
        chapter.ids.some((id) => EXAM_BLUEPRINT?.idsBySection?.[candidate]?.includes(id))
      ) || sectionIds[0];
      return {
        ...chapter,
        sectionId,
        sectionIds,
        textbookRangeId: rangeId,
        textbookPart: textbookRange.part || null,
        textbookLabel: textbookRange.label || "",
        topicLabel: chapter.label,
        label: `${textbookRange.shortLabel || SECTION_BY_ID.get(sectionId)?.shortLabel || "教材"} / ${chapter.label}`
      };
    });
  });
  const TEXTBOOK_IDS = [...new Set(TEXTBOOK_CHAPTERS.flatMap((chapter) => chapter.ids))];
  const TEXTBOOK_SECTION_IDS = new Set(
    TEXTBOOK_RANGE_ENTRIES.flatMap(([, textbookRange]) => textbookRange.sectionIds || [])
  );
  const FALLBACK_CURRICULUM_CHAPTERS = (EXAM_BLUEPRINT?.sections || [])
    .filter((section) => !TEXTBOOK_SECTION_IDS.has(section.id))
    .flatMap((section) => section.chapters.map((chapter) => ({
      ...chapter,
      sectionId: section.id,
      sectionIds: [section.id],
      textbookRangeId: "",
      textbookPart: null,
      textbookLabel: "",
      topicLabel: chapter.label,
      label: `${section.shortLabel} / ${chapter.label}`
    })));
  const CURRICULUM_CHAPTERS = [...TEXTBOOK_CHAPTERS, ...FALLBACK_CURRICULUM_CHAPTERS];
  const STUDY_ORDER = [...CURRICULUM_ORDER, ...SUPPLEMENTAL_ORDER];
  const ORDER = [...STUDY_ORDER, ...LEGACY_ORDER];
  const CHAPTERS = [...CURRICULUM_CHAPTERS, ...LEGACY_CHAPTERS];
  let selectedTextbookChapterId = "";
  const STUDY_GROUPS = TEXTBOOK_RANGE_ENTRIES.map(([rangeId, textbookRange]) => {
    const entries = CURRICULUM_CHAPTERS
      .map((chapter, chapterIndex) => ({ chapter, chapterIndex }))
      .filter(({ chapter }) => chapter.textbookRangeId === rangeId);
    const ids = [...new Set(entries.flatMap(({ chapter }) => chapter.ids))];
    return {
      id: rangeId,
      label: `${textbookRange.label}（${entries.length}単元・${ids.length}問）`,
      sectionIds: textbookRange.sectionIds || [],
      entries
    };
  });
  const LEGACY_CHAPTER_ENTRIES = LEGACY_CHAPTERS.map((chapter, legacyIndex) => ({
    chapter,
    chapterIndex: CURRICULUM_CHAPTERS.length + legacyIndex
  }));

  const TOPIC_REFS = {
    "免許": "第1分冊 宅建業法 / 免許",
    "宅建士": "第1分冊 宅建業法 / 宅建士",
    "従業者": "第1分冊 宅建業法 / 従業者",
    "広告": "第1分冊 宅建業法 / 広告規制",
    "標識": "第1分冊 宅建業法 / 標識・案内所",
    "案内所": "第1分冊 宅建業法 / 案内所",
    "重要事項説明": "第1分冊 宅建業法 / 35条書面",
    "37条書面": "第1分冊 宅建業法 / 37条書面",
    "契約制限": "第1分冊 宅建業法 / 契約制限",
    "媒介契約": "第1分冊 宅建業法 / 媒介契約",
    "報酬": "第1分冊 宅建業法 / 報酬額",
    "手付金等": "第1分冊 宅建業法 / 金銭保全",
    "営業保証金": "第1分冊 宅建業法 / 保証金",
    "保証協会": "第1分冊 宅建業法 / 保証協会",
    "監督処分": "第1分冊 宅建業法 / 監督処分"
  };

  const QUESTIONS = {
    ...(window.TAKKEN_QUESTIONS || {}),
    ...(window.TAKKEN_EXAM_QUESTIONS || {})
  };
  const idToChapter = new Map();
  CHAPTERS.forEach((chapter, chapterIndex) => {
    chapter.ids.forEach((id) => idToChapter.set(id, { ...chapter, chapterIndex }));
  });

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    enemyName: $("#enemyName"),
    enemyClassLabel: $("#enemyClassLabel"),
    sourceLabel: $("#sourceLabel"),
    enemyStateLabel: $("#enemyStateLabel"),
    enemyHpText: $("#enemyHpText"),
    enemyHpFill: $("#enemyHpFill"),
    battleField: $("#battleField"),
    hitEffect: $("#hitEffect"),
    enemyVisual: $("#enemyVisual"),
    playerVisual: $("#playerVisual"),
    enemyTraitText: $("#enemyTraitText"),
    comboText: $("#comboText"),
    comboSubtext: $("#comboSubtext"),
    rewardBreakdown: $("#rewardBreakdown"),
    focusFill: $("#focusFill"),
    focusText: $("#focusText"),
    playerLevelText: $("#playerLevelText"),
    playerTitleText: $("#playerTitleText"),
    fieldLevelText: $("#fieldLevelText"),
    xpText: $("#xpText"),
    xpFill: $("#xpFill"),
    chestText: $("#chestText"),
    chestPips: $("#chestPips"),
    adventureDaysText: $("#adventureDaysText"),
    crystalText: $("#crystalText"),
    damageNumber: $("#damageNumber"),
    rewardBurst: $("#rewardBurst"),
    chestBurst: $("#chestBurst"),
    chestBurstTitle: $("#chestBurstTitle"),
    chestBurstText: $("#chestBurstText"),
    marchSignal: $("#marchSignal"),
    battleAnnouncement: $("#battleAnnouncement"),
    campaignRoute: $("#campaignRoute"),
    routeSectorLabel: $("#routeSectorLabel"),
    lootSummary: $("#lootSummary"),
    lootCollection: $("#lootCollection"),
    armoryName: $("#armoryName"),
    armoryProgress: $("#armoryProgress"),
    armoryButton: $("#armoryButton"),
    continuityText: $("#continuityText"),
    answerDock: $("#answerDock"),
    dockExplainButton: $("#dockExplainButton"),
    dockResultText: $("#dockResultText"),
    dockTargetText: $("#dockTargetText"),
    dockUnsureButton: $("#dockUnsureButton"),
    dockNextButton: $("#dockNextButton"),
    dockNextLabel: $("#dockNextLabel"),
    roundLabel: $("#roundLabel"),
    tagBadge: $("#tagBadge"),
    markButton: $("#markButton"),
    questionText: $("#questionText"),
    choices: $("#choices"),
    feedbackBox: $("#feedbackBox"),
    feedbackTitle: $("#feedbackTitle"),
    correctAnswer: $("#correctAnswer"),
    trapText: $("#trapText"),
    bookRef: $("#bookRef"),
    explainText: $("#explainText"),
    nextButton: $("#nextButton"),
    resetButton: $("#resetButton"),
    attemptLabel: $("#attemptLabel"),
    attemptCount: $("#attemptCount"),
    accuracyLabel: $("#accuracyLabel"),
    accuracyText: $("#accuracyText"),
    streakLabel: $("#streakLabel"),
    streakText: $("#streakText"),
    markedLabel: $("#markedLabel"),
    markedText: $("#markedText"),
    chapterProgressText: $("#chapterProgressText"),
    studyTitle: $("#studyTitle"),
    todayLabel: $("#todayLabel"),
    chapterList: $("#chapterList"),
    progressDrawer: $("#progressDrawer"),
    progressDrawerLink: $("#progressDrawerLink"),
    progressDrawerSummary: $("#progressDrawerSummary"),
    themeDrawerSummary: $("#themeDrawerSummary"),
    themeBar: $("#themeBar"),
    chapterSelect: $("#chapterSelect"),
    studyScopeSelect: $("#studyScopeSelect"),
    weakButton: $("#weakButton"),
    coachTitle: $("#coachTitle"),
    coachText: $("#coachText"),
    logStatus: $("#logStatus"),
    codexBriefButton: $("#codexBriefButton"),
    codexBriefLink: $("#codexBriefLink"),
    quizCard: $("#quizCard"),
    questCard: $(".quest-card"),
    questLabel: $("#questLabel"),
    questRewardRail: $("#questRewardRail"),
    questRewardTrack: $("#questRewardTrack"),
    questRewardNext: $("#questRewardNext"),
    dailyQuestTitle: $("#dailyQuestTitle"),
    dailyQuestFill: $("#dailyQuestFill"),
    dailyQuestSource: $("#dailyQuestSource"),
    dailyAnswerLabel: $("#dailyAnswerLabel"),
    dailyAnswerText: $("#dailyAnswerText"),
    dailyCorrectLabel: $("#dailyCorrectLabel"),
    dailyCorrectText: $("#dailyCorrectText"),
    dailyWeakLabel: $("#dailyWeakLabel"),
    dailyWeakText: $("#dailyWeakText"),
    dailyQuestButton: $("#dailyQuestButton"),
    mockAButton: $("#mockAButton"),
    mockBButton: $("#mockBButton"),
    passQuestButton: $("#passQuestButton"),
    weakQuestButton: $("#weakQuestButton"),
    sprintButton: $("#sprintButton"),
    sprintTimer: $("#sprintTimer"),
    sprintStatus: $("#sprintStatus"),
    saveExportButton: $("#saveExportButton"),
    saveShareButton: $("#saveShareButton"),
    saveRestorePreviousButton: $("#saveRestorePreviousButton"),
    saveImportButton: $("#saveImportButton"),
    saveImportInput: $("#saveImportInput"),
    saveTransferStatus: $("#saveTransferStatus"),
    saveProtectionStatus: $("#saveProtectionStatus"),
    todayCommandPanel: $("#todayCommandPanel"),
    todayCommandKicker: $("#todayCommandKicker"),
    todayCommandTitle: $("#todayCommandTitle"),
    todayCommandText: $("#todayCommandText"),
    todayCommandStartButton: $("#todayCommandStartButton"),
    todayCommandPracticalButton: $("#todayCommandPracticalButton"),
    todayCommandCalculationButton: $("#todayCommandCalculationButton"),
    todayCommandOfficialActions: $("#todayCommandOfficialActions"),
    officialDrillOpenButton: $("#officialDrillOpenButton"),
    officialDrillPanel: $("#officialDrillPanel"),
    officialDrillTitle: $("#officialDrillTitle"),
    officialDrillQuestionRange: $("#officialDrillQuestionRange"),
    officialDrillSummary: $("#officialDrillSummary"),
    officialDrillQuestionLink: $("#officialDrillQuestionLink"),
    officialDrillStartButton: $("#officialDrillStartButton"),
    officialDrillTimer: $("#officialDrillTimer"),
    officialDrillForm: $("#officialDrillForm"),
    officialDrillAnswerGrid: $("#officialDrillAnswerGrid"),
    officialDrillPrevButton: $("#officialDrillPrevButton"),
    officialDrillNextButton: $("#officialDrillNextButton"),
    officialDrillJumpSelect: $("#officialDrillJumpSelect"),
    officialDrillProgress: $("#officialDrillProgress"),
    officialDrillSubmitButton: $("#officialDrillSubmitButton"),
    officialDrillResult: $("#officialDrillResult"),
    officialDrillStatus: $("#officialDrillStatus"),
    todayCommandReviewActions: $("#todayCommandReviewActions"),
    todayReviewTargets: $("#todayReviewTargets"),
    todayReviewLabel: $("#todayReviewLabel"),
    todayReviewInput: $("#todayReviewInput"),
    todayCommandReviewButton: $("#todayCommandReviewButton"),
    todayCommandMinutesActions: $("#todayCommandMinutesActions"),
    todayCommandStatus: $("#todayCommandStatus"),
    foundationRouteContext: $("#foundationRouteContext"),
    foundationRouteStage: $("#foundationRouteStage"),
    foundationRouteTitle: $("#foundationRouteTitle"),
    foundationRouteText: $("#foundationRouteText"),
    foundationUnitsProgress: $("#foundationUnitsProgress"),
    foundationQuestionsProgress: $("#foundationQuestionsProgress"),
    foundationPracticalProgress: $("#foundationPracticalProgress"),
    foundationRoutePrimaryButton: $("#foundationRoutePrimaryButton"),
    foundationRoutePracticalButton: $("#foundationRoutePracticalButton"),
    passPlanPanel: $("#passPlanPanel"),
    passPhaseTitle: $("#passPhaseTitle"),
    passPhaseText: $("#passPhaseText"),
    examCountdown: $("#examCountdown"),
    foundationGateStatus: $("#foundationGateStatus"),
    coreCoverageStatus: $("#coreCoverageStatus"),
    coreRetentionStatus: $("#coreRetentionStatus"),
    textbookCoverageStatus: $("#textbookCoverageStatus"),
    textbookRetentionStatus: $("#textbookRetentionStatus"),
    officialReadinessStatus: $("#officialReadinessStatus"),
    officialPracticeCoverageStatus: $("#officialPracticeCoverageStatus"),
    officialPracticeTrendStatus: $("#officialPracticeTrendStatus"),
    dailyMissionStatus: $("#dailyMissionStatus"),
    dailyMissionSummary: $("#dailyMissionSummary"),
    missionBattleStep: $("#missionBattleStep"),
    missionBattleLabel: $("#missionBattleLabel"),
    missionBattleStatus: $("#missionBattleStatus"),
    missionOfficialStep: $("#missionOfficialStep"),
    missionOfficialLabel: $("#missionOfficialLabel"),
    missionOfficialStatus: $("#missionOfficialStatus"),
    missionReviewStep: $("#missionReviewStep"),
    missionReviewLabel: $("#missionReviewLabel"),
    missionReviewStatus: $("#missionReviewStatus"),
    missionMinutesStep: $("#missionMinutesStep"),
    missionMinutesLabel: $("#missionMinutesLabel"),
    missionMinutesStatus: $("#missionMinutesStatus"),
    missionMinutesInput: $("#missionMinutesInput"),
    missionMinutesButton: $("#missionMinutesButton"),
    officialLedgerSummary: $("#officialLedgerSummary"),
    officialLedgerPanel: $(".official-ledger"),
    officialExamAttemptType: $("#officialExamAttemptType"),
    officialExamId: $("#officialExamId"),
    officialExamQuestionLink: $("#officialExamQuestionLink"),
    officialExamStartButton: $("#officialExamStartButton"),
    officialExamTimer: $("#officialExamTimer"),
    officialExamSessionForm: $("#officialExamSessionForm"),
    officialExamQuestionNumber: $("#officialExamQuestionNumber"),
    officialExamQuestionSection: $("#officialExamQuestionSection"),
    officialExamAnswerChoices: $("#officialExamAnswerChoices"),
    officialExamPrevButton: $("#officialExamPrevButton"),
    officialExamNextButton: $("#officialExamNextButton"),
    officialExamJumpSelect: $("#officialExamJumpSelect"),
    officialExamProgress: $("#officialExamProgress"),
    officialLawNotice: $("#officialLawNotice"),
    officialExamSubmitButton: $("#officialExamSubmitButton"),
    officialExamAbandonButton: $("#officialExamAbandonButton"),
    officialExamManualForm: $("#officialExamManualForm"),
    officialExamYear: $("#officialExamYear"),
    officialExamScore: $("#officialExamScore"),
    officialRightsScore: $("#officialRightsScore"),
    officialRestrictionsScore: $("#officialRestrictionsScore"),
    officialBusinessScore: $("#officialBusinessScore"),
    officialTaxOtherScore: $("#officialTaxOtherScore"),
    officialExamMinutes: $("#officialExamMinutes"),
    officialExamStatus: $("#officialExamStatus"),
    officialExamHistory: $("#officialExamHistory"),
    calculationDrillPanel: $("#calculationDrillPanel"),
    calculationDrillSummary: $("#calculationDrillSummary"),
    calculationDrillStage: $("#calculationDrillStage"),
    calculationDrillProgress: $("#calculationDrillProgress"),
    calculationDrillResetButton: $("#calculationDrillResetButton"),
    calculationDrillQuestion: $("#calculationDrillQuestion"),
    calculationDrillCategory: $("#calculationDrillCategory"),
    calculationDrillRetryStatus: $("#calculationDrillRetryStatus"),
    calculationDrillPrompt: $("#calculationDrillPrompt"),
    calculationDrillChoices: $("#calculationDrillChoices"),
    calculationDrillFeedback: $("#calculationDrillFeedback"),
    calculationDrillVerdict: $("#calculationDrillVerdict"),
    calculationDrillFormula: $("#calculationDrillFormula"),
    calculationDrillTrap: $("#calculationDrillTrap"),
    calculationDrillSource: $("#calculationDrillSource"),
    calculationDrillConfidence: $("#calculationDrillConfidence"),
    calculationDrillNextButton: $("#calculationDrillNextButton"),
    calculationDrillComplete: $("#calculationDrillComplete"),
    calculationDrillCompleteText: $("#calculationDrillCompleteText"),
    calculationDrillRestartButton: $("#calculationDrillRestartButton"),
    calculationDrillExitButton: $("#calculationDrillExitButton"),
    practicalDrillPanel: $("#practicalDrillPanel"),
    practicalDrillSummary: $("#practicalDrillSummary"),
    practicalDrillOverview: $("#practicalDrillOverview"),
    practicalDrillScope: $("#practicalDrillScope"),
    practicalDrillSize: $("#practicalDrillSize"),
    practicalDrillStartButton: $("#practicalDrillStartButton"),
    practicalDrillSession: $("#practicalDrillSession"),
    practicalDrillStage: $("#practicalDrillStage"),
    practicalDrillProgress: $("#practicalDrillProgress"),
    practicalDrillUnit: $("#practicalDrillUnit"),
    practicalDrillRetryStatus: $("#practicalDrillRetryStatus"),
    practicalDrillPrompt: $("#practicalDrillPrompt"),
    practicalDrillChoices: $("#practicalDrillChoices"),
    practicalDrillFeedback: $("#practicalDrillFeedback"),
    practicalDrillVerdict: $("#practicalDrillVerdict"),
    practicalDrillReasoning: $("#practicalDrillReasoning"),
    practicalDrillSources: $("#practicalDrillSources"),
    practicalDrillConfidence: $("#practicalDrillConfidence"),
    practicalDrillNextButton: $("#practicalDrillNextButton"),
    practicalDrillCancelButton: $("#practicalDrillCancelButton"),
    practicalDrillComplete: $("#practicalDrillComplete"),
    practicalDrillCompleteText: $("#practicalDrillCompleteText"),
    practicalDrillRestartButton: $("#practicalDrillRestartButton"),
    practicalDrillChangeButton: $("#practicalDrillChangeButton"),
    practicalDrillExitButton: $("#practicalDrillExitButton"),
    businessMasteryPanel: $("#businessMasteryPanel"),
    businessMasteryStatus: $("#businessMasteryStatus"),
    businessFoundationGate: $("#businessFoundationGate"),
    businessTransferGate: $("#businessTransferGate"),
    businessOfficialGate: $("#businessOfficialGate"),
    businessMasteryMetrics: $("#businessMasteryMetrics"),
    businessMasteryPace: $("#businessMasteryPace"),
    businessMasteryWeakness: $("#businessMasteryWeakness"),
    businessMasteryGrid: $("#businessMasteryGrid"),
    businessMasteryPrimary: $("#businessMasteryPrimary"),
    businessMasteryFull: $("#businessMasteryFull"),
    businessKnockPanel: $("#businessKnockPanel"),
    businessKnockAttempts: $("#businessKnockAttempts"),
    businessKnockAccuracy: $("#businessKnockAccuracy"),
    businessKnockRecovery: $("#businessKnockRecovery"),
    businessKnockUntouched: $("#businessKnockUntouched"),
    businessKnockMode: $("#businessKnockMode"),
    businessKnockUnitField: $("#businessKnockUnitField"),
    businessKnockUnit: $("#businessKnockUnit"),
    businessKnockSize: $("#businessKnockSize"),
    businessKnockStart: $("#businessKnockStart"),
    businessKnockStatus: $("#businessKnockStatus")
  };

  let fallbackIdSequence = 0;

  function createOpaqueId(prefix) {
    const timestamp = Date.now().toString(36);
    if (globalThis.crypto?.randomUUID) {
      return `${prefix}-${timestamp}-${globalThis.crypto.randomUUID()}`;
    }
    if (globalThis.crypto?.getRandomValues) {
      const bytes = new Uint8Array(12);
      globalThis.crypto.getRandomValues(bytes);
      const randomPart = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
      return `${prefix}-${timestamp}-${randomPart}`;
    }
    fallbackIdSequence += 1;
    return `${prefix}-${timestamp}-${fallbackIdSequence.toString(36)}`;
  }

  function createCalculationDrillState() {
    return {
      version: CALCULATION_DRILL?.VERSION || 1,
      stage: "idle",
      queue: [],
      position: 0,
      currentAttempt: null,
      retryIds: [],
      masteredIds: [],
      history: {},
      attempts: 0,
      correctAttempts: 0,
      completedAt: ""
    };
  }

  function createPracticalDrillState() {
    return {
      version: PRACTICAL_VARIATIONS?.VERSION || 1,
      bankId: LEGACY_PRACTICAL_BANK_ID,
      bankVersion: PRACTICAL_VARIATIONS?.VERSION || 1,
      presentationKey: "",
      planMode: "",
      knockPreset: {
        mode: "untouched",
        size: 20,
        unitId: "",
        lastPresentationOffset: null
      },
      stage: "idle",
      scope: "business",
      unitId: "",
      sessionSize: 10,
      sessionIds: [],
      queue: [],
      position: 0,
      currentAttempt: null,
      retryIds: [],
      history: {},
      attempts: 0,
      correctAttempts: 0,
      sessionsCompleted: 0,
      sessionStartedAt: "",
      completedAt: ""
    };
  }

  const createState = () => ({
    stateSchemaVersion: STATE_SCHEMA_VERSION,
    index: 0,
    answered: null,
    attempts: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    focus: 0,
    crystals: 0,
    crystalSpent: 0,
    victories: 0,
    progressionVersion: PROGRESSION_VERSION,
    examContentVersion: EXAM_CONTENT_VERSION,
    questionBalanceVersion: QUESTION_BALANCE_VERSION,
    questionChoiceOrders: {},
    questionBalanceAudit: {},
    totalXp: 0,
    chestProgress: 0,
    chestQuality: 0,
    chestsOpened: 0,
    loot: {},
    armoryRank: 0,
    questRewardClaims: {},
    analysisRewardClaims: {},
    adventureDays: {},
    weakRewards: {},
    step: 0,
    sessionId: createOpaqueId("session"),
    runMode: FIRST_PASS_PARAM ? RUN_MODE_FIRST_PASS : "quest",
    chapterModeId: "",
    adaptive: false,
    studyScope: DEFAULT_STUDY_SCOPE,
    questionStats: {},
    centralMarked: {},
    centralProgress: {},
    marked: {},
    autoMarked: {},
    activeCutCheck: null,
    dailyFinishedDate: "",
    daily: createDailyState(),
    mock: createMockState(),
    mockHistory: [],
    officialExamHistory: [],
    officialExamSession: null,
    officialExamExposure: {},
    missionLog: {},
    calculationDrill: createCalculationDrillState(),
    practicalDrill: createPracticalDrillState(),
    saveMeta: {
      lastExportedAt: "",
      lastExportHash: ""
    },
    syncMeta: {
      generation: 0,
      revision: 0,
      updatedAt: "",
      writerId: "",
      baseRevision: 0,
      clock: {}
    },
    sprint: {
      endsAt: null,
      completed: 0
    },
    finished: false
  });

  let state = loadState();
  syncWriterId = createOpaqueId("writer");
  syncBaseState = STATE_SYNC?.clone ? STATE_SYNC.clone(state) : JSON.parse(JSON.stringify(state));
  applyQuestionBalance();
  saveState();
  if (saveStoreSession.notice) {
    setSaveTransferStatus(saveStoreSession.notice, saveStoreSession.isError);
  }
  let isAdvancing = false;
  let isFlushingEvents = false;
  let activeDayKey = todayKey();
  const logConnection = {
    checked: false,
    available: false,
    message: "確認中"
  };
  const todayQuest = {
    status: "loading",
    date: todayKey(),
    questId: "",
    ids: [],
    items: [],
    source: "loading",
    mode: "coverage",
    scope: DEFAULT_STUDY_SCOPE,
    message: "固定10問: 読込中"
  };

  function localDateKey(value) {
    const now = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(now.getTime())) return "";
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function todayKey() {
    return localDateKey(new Date());
  }

  function normalizedCorrectDayKeys(stats) {
    const keys = [
      ...(Array.isArray(stats?.correctDayKeys) ? stats.correctDayKeys : []),
      localDateKey(stats?.lastCorrectAt),
      localDateKey(stats?.centralLastCorrectAt)
    ].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
    return [...new Set(keys)].sort().slice(-8);
  }

  function normalizedComprehensionDayKeys(stats) {
    const hasRecordedGate = Object.prototype.hasOwnProperty.call(
      stats || {},
      "clearDayKeys"
    );
    const baseline = hasRecordedGate
      ? (Array.isArray(stats?.clearDayKeys) ? stats.clearDayKeys : [])
      : normalizedCorrectDayKeys(stats);
    const keys = [
      ...baseline,
      localDateKey(stats?.lastClearAt)
    ].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
    return [...new Set(keys)].sort().slice(-8);
  }

  function normalizedUnderstandingDayKeys(stats) {
    const lastPassedDay = localDateKey(stats?.lastUnderstandingPassedAt);
    const lastAttemptDay = localDateKey(stats?.lastUnderstandingAt);
    const includeLastPassed = Boolean(
      lastPassedDay &&
      (stats?.lastUnderstandingPassed !== false || lastPassedDay !== lastAttemptDay)
    );
    const keys = [
      ...(Array.isArray(stats?.understandingDayKeys) ? stats.understandingDayKeys : []),
      includeLastPassed ? lastPassedDay : ""
    ].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
    return [...new Set(keys)].sort().slice(-8);
  }

  function createDailyState() {
    return {
      date: todayKey(),
      answers: 0,
      correct: 0,
      wrong: 0,
      weakAdded: 0,
      target: DAILY_TARGET,
      planIds: [],
      planVersion: STUDY_PLAN_VERSION,
      planMode: "coverage",
      planScope: DEFAULT_STUDY_SCOPE,
      planUnitId: ""
    };
  }

  function normalizeDailyState(input) {
    const fresh = createDailyState();
    if (!input || input.date !== fresh.date) {
      return fresh;
    }
    return {
      ...fresh,
      ...input,
      target: Number(input.target) || DAILY_TARGET,
      answers: Number(input.answers) || 0,
      correct: Number(input.correct) || 0,
      wrong: Number(input.wrong) || 0,
      weakAdded: Number(input.weakAdded) || 0,
      planIds: Array.isArray(input.planIds)
        ? input.planIds.filter((id) => STUDY_ORDER.includes(id)).slice(0, DAILY_TARGET)
        : [],
      planVersion: Number(input.planVersion) || 0,
      planMode: ["mastery", "unit"].includes(input.planMode) ? input.planMode : "coverage",
      planScope: STUDY_SCOPE_IDS.has(input.planScope) ? input.planScope : DEFAULT_STUDY_SCOPE,
      planUnitId: TEXTBOOK_CHAPTERS.some((chapter) => chapter.id === input.planUnitId)
        ? String(input.planUnitId)
        : ""
    };
  }

  function normalizeSprintState(input) {
    return {
      endsAt: input?.endsAt || null,
      completed: Number(input?.completed) || 0
    };
  }

  function mockFormById(formId) {
    return (EXAM_BLUEPRINT?.mockForms || []).find((form) => form.id === formId) || null;
  }

  function createMockState(formId = "") {
    return {
      formId,
      position: 0,
      startedAt: "",
      finishedAt: "",
      elapsedMs: 0,
      results: [],
      finalized: false
    };
  }

  function normalizeMockState(input) {
    const form = mockFormById(String(input?.formId || ""));
    if (!form) return createMockState();
    const sourceResults = Array.isArray(input?.results) ? input.results : [];
    const results = [];
    for (const id of form.ids) {
      const source = sourceResults[results.length];
      if (!source || source.id !== id) break;
      const selected = Number(source.selected);
      if (!Number.isInteger(selected) || selected < 0 || selected > 3 || !QUESTIONS[id]) break;
      const question = QUESTIONS[id];
      results.push({
        id,
        selected,
        correct: selected === question.answer,
        sectionId: question.sectionId || "",
        tag: question.tag || ""
      });
    }
    const finalized = Boolean(input?.finalized) && results.length === form.ids.length;
    return {
      formId: form.id,
      position: Math.min(
        form.ids.length - 1,
        Math.max(0, Number(input?.position) || 0)
      ),
      startedAt: String(input?.startedAt || ""),
      finishedAt: finalized ? String(input?.finishedAt || "") : "",
      elapsedMs: finalized ? Math.max(0, Number(input?.elapsedMs) || 0) : 0,
      results,
      finalized
    };
  }

  function normalizeMockHistory(input) {
    return (Array.isArray(input) ? input : [])
      .filter((item) => mockFormById(String(item?.formId || "")))
      .map((item) => ({
        formId: String(item.formId),
        completedAt: String(item.completedAt || ""),
        score: Math.min(50, Math.max(0, Number(item.score) || 0)),
        elapsedMs: Math.max(0, Number(item.elapsedMs) || 0),
        sectionScores: item.sectionScores && typeof item.sectionScores === "object"
          ? { ...item.sectionScores }
          : {}
      }))
      .slice(-10);
  }

  function boundedInteger(value, maximum) {
    return Math.min(maximum, Math.max(0, Math.trunc(Number(value) || 0)));
  }

  function officialExamDefinition(examId) {
    return OFFICIAL_EXAM_BY_ID[String(examId || "")] || null;
  }

  function legacyOfficialExamId(item) {
    const year = Number(item?.year);
    if (year === 2020 || year === 2021) return `${year}-legacy`;
    const examId = String(year || "");
    return officialExamDefinition(examId) ? examId : "";
  }

  function normalizeOfficialExamAnswers(examId, input) {
    const definition = officialExamDefinition(examId);
    if (!definition) return {};
    const answers = {};
    definition.answers.forEach((unused, index) => {
      const number = index + 1;
      const selected = Number(input?.[number]);
      if (Number.isInteger(selected) && selected >= 1 && selected <= 4) {
        answers[number] = selected;
      }
    });
    return answers;
  }

  function normalizedUtcOffsetMinutes(value) {
    const offset = Number(value);
    return Number.isInteger(offset) && offset >= -840 && offset <= 840
      ? offset
      : null;
  }

  function dayKeyAtUtcOffset(value, offsetMinutes) {
    const timestamp = Date.parse(value);
    const offset = normalizedUtcOffsetMinutes(offsetMinutes);
    if (!Number.isFinite(timestamp) || offset === null) return "";
    return new Date(timestamp - offset * 60000).toISOString().slice(0, 10);
  }

  function inferUtcOffsetMinutes(value, expectedDayKey) {
    if (!BUSINESS_MASTERY?.dayKey(expectedDayKey) || !Number.isFinite(Date.parse(value))) {
      return null;
    }
    const currentOffset = new Date(value).getTimezoneOffset();
    if (dayKeyAtUtcOffset(value, currentOffset) === expectedDayKey) return currentOffset;
    for (let offset = -840; offset <= 840; offset += 1) {
      if (dayKeyAtUtcOffset(value, offset) === expectedDayKey) return offset;
    }
    return null;
  }

  function officialExamAnswerObjectValid(examId, input, requireComplete = false) {
    const definition = officialExamDefinition(examId);
    if (!definition || !input || typeof input !== "object" || Array.isArray(input)) return false;
    const keys = Object.keys(input);
    if (requireComplete && keys.length !== 50) return false;
    return keys.every((key) => {
      const number = Number(key);
      return String(number) === key && Number.isInteger(number) && number >= 1 && number <= 50 &&
        Number.isInteger(input[key]) && input[key] >= 1 && input[key] <= 4;
    });
  }

  function normalizeOfficialExamExposure(input) {
    return Object.fromEntries(
      Object.entries(input && typeof input === "object" && !Array.isArray(input) ? input : {})
        .filter(([examId]) => Boolean(officialExamDefinition(examId)))
        .map(([examId, item]) => {
          const firstOpenedAt = Number.isFinite(Date.parse(item?.firstOpenedAt))
            ? String(item.firstOpenedAt).slice(0, 64)
            : "";
          const suppliedDayKey = BUSINESS_MASTERY?.dayKey(item?.firstOpenedDayKey);
          const suppliedOffset = normalizedUtcOffsetMinutes(item?.firstOpenedUtcOffsetMinutes);
          const inferredOffset = suppliedOffset ?? inferUtcOffsetMinutes(firstOpenedAt, suppliedDayKey);
          const firstOpenedUtcOffsetMinutes = inferredOffset ??
            (firstOpenedAt ? new Date(firstOpenedAt).getTimezoneOffset() : null);
          const firstOpenedDayKey = firstOpenedAt
            ? dayKeyAtUtcOffset(firstOpenedAt, firstOpenedUtcOffsetMinutes)
            : "";
          if (!firstOpenedAt || !firstOpenedDayKey) return null;
          const source = ["full-exam", "daily-drill", "manual", "history"].includes(item?.source)
            ? item.source
            : "history";
          return [examId, {
            firstOpenedAt,
            firstOpenedDayKey,
            firstOpenedUtcOffsetMinutes,
            source
          }];
        })
        .filter(Boolean)
    );
  }

  function mergeOfficialExamExposure(exposure, examId, source, openedAt, openedUtcOffsetMinutes = null) {
    const id = String(examId || "");
    if (!officialExamDefinition(id) || !Number.isFinite(Date.parse(openedAt))) return exposure;
    const current = normalizeOfficialExamExposure(exposure);
    const candidateAt = String(openedAt).slice(0, 64);
    const existingAt = Date.parse(current[id]?.firstOpenedAt || "");
    if (!Number.isFinite(existingAt) || Date.parse(candidateAt) < existingAt) {
      const offset = normalizedUtcOffsetMinutes(openedUtcOffsetMinutes) ??
        new Date(candidateAt).getTimezoneOffset();
      current[id] = {
        firstOpenedAt: candidateAt,
        firstOpenedDayKey: dayKeyAtUtcOffset(candidateAt, offset),
        firstOpenedUtcOffsetMinutes: offset,
        source: ["full-exam", "daily-drill", "manual", "history"].includes(source) ? source : "history"
      };
    }
    return current;
  }

  function mergeOfficialExamExposureLedgers(...ledgers) {
    return ledgers.reduce((merged, ledger) => {
      Object.entries(normalizeOfficialExamExposure(ledger)).forEach(([examId, item]) => {
        merged = mergeOfficialExamExposure(
          merged,
          examId,
          item.source,
          item.firstOpenedAt,
          item.firstOpenedUtcOffsetMinutes
        );
      });
      return merged;
    }, {});
  }

  function recordOfficialExamExposure(examId, source, openedAt = new Date().toISOString()) {
    const id = String(examId || "");
    if (!officialExamDefinition(id) || !Number.isFinite(Date.parse(openedAt))) return false;
    state.officialExamExposure = normalizeOfficialExamExposure(state.officialExamExposure);
    if (state.officialExamExposure[id]) return false;
    state.officialExamExposure = mergeOfficialExamExposure(
      state.officialExamExposure,
      id,
      source,
      openedAt,
      new Date(openedAt).getTimezoneOffset()
    );
    return true;
  }

  function createOfficialExamSession() {
    return {
      evidenceVersion: OFFICIAL_EXAM_EVIDENCE_VERSION,
      scoringBasis: OFFICIAL_HISTORICAL_SCORING_BASIS,
      examId: "",
      attemptType: "initial",
      startedAt: "",
      startedDayKey: "",
      startedUtcOffsetMinutes: null,
      appUnseenAtStart: false,
      currentLawBaseline: CURRENT_LAW_BASELINE,
      answers: {},
      position: 0
    };
  }

  function normalizeOfficialExamSession(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const examId = String(input.examId || "");
    if (!officialExamDefinition(examId)) return null;
    const attemptType = input.attemptType === "retest" ? "retest" : "initial";
    const startedAt = Number.isFinite(Date.parse(input.startedAt))
      ? String(input.startedAt).slice(0, 64)
      : "";
    if (!startedAt) return null;
    const suppliedStartedDayKey = BUSINESS_MASTERY?.dayKey(input.startedDayKey);
    const requestedVersion = Number(input.evidenceVersion) || 0;
    const suppliedOffset = normalizedUtcOffsetMinutes(input.startedUtcOffsetMinutes);
    const legacyOffset = inferUtcOffsetMinutes(startedAt, suppliedStartedDayKey);
    const answerEvidenceValid =
      officialExamAnswerObjectValid(examId, input.answers || {}, false) &&
      typeof input.appUnseenAtStart === "boolean";
    const version3Valid = requestedVersion >= OFFICIAL_EXAM_EVIDENCE_VERSION &&
      input.scoringBasis === OFFICIAL_HISTORICAL_SCORING_BASIS &&
      suppliedOffset !== null &&
      dayKeyAtUtcOffset(startedAt, suppliedOffset) === suppliedStartedDayKey &&
      answerEvidenceValid;
    const version2Valid = !version3Valid &&
      requestedVersion >= OFFICIAL_EXAM_LEGACY_EVIDENCE_VERSION &&
      legacyOffset !== null &&
      input.lawBaseline === CURRENT_LAW_BASELINE &&
      typeof input.lawChecked === "boolean" &&
      answerEvidenceValid;
    const evidenceVersion = version3Valid
      ? OFFICIAL_EXAM_EVIDENCE_VERSION
      : version2Valid
        ? OFFICIAL_EXAM_LEGACY_EVIDENCE_VERSION
        : 0;
    const startedUtcOffsetMinutes = version3Valid ? suppliedOffset : version2Valid ? legacyOffset : null;
    const startedDayKey = evidenceVersion ? suppliedStartedDayKey : localDateKey(startedAt);
    return {
      evidenceVersion,
      scoringBasis: version3Valid ? OFFICIAL_HISTORICAL_SCORING_BASIS : "",
      examId,
      attemptType,
      startedAt,
      startedDayKey,
      startedUtcOffsetMinutes,
      appUnseenAtStart: evidenceVersion >= OFFICIAL_EXAM_LEGACY_EVIDENCE_VERSION && Boolean(input.appUnseenAtStart),
      currentLawBaseline: version3Valid ? CURRENT_LAW_BASELINE : "",
      lawBaseline: version2Valid && input.lawBaseline === CURRENT_LAW_BASELINE
        ? CURRENT_LAW_BASELINE
        : "",
      answers: normalizeOfficialExamAnswers(examId, input.answers),
      position: Math.min(49, Math.max(0, Math.trunc(Number(input.position) || 0))),
      lawChecked: version2Valid && Boolean(input.lawChecked)
    };
  }

  function normalizeOfficialExamHistory(input) {
    const normalized = (Array.isArray(input) ? input : [])
      .map((item) => {
        const suppliedExamId = String(item?.examId || "");
        const examId = officialExamDefinition(suppliedExamId)
          ? suppliedExamId
          : legacyOfficialExamId(item);
        if (!examId) return null;
        const definition = officialExamDefinition(examId);
        const legacySessionAmbiguous = !definition &&
          (examId === "2020-legacy" || examId === "2021-legacy");
        const sourceMode = item?.sourceMode === "timed-answer-sheet"
          ? "timed-answer-sheet"
          : "self-report";
        const answers = sourceMode === "timed-answer-sheet"
          ? normalizeOfficialExamAnswers(examId, item.answers)
          : {};
        const scored = definition && Object.keys(answers).length === 50
          ? OFFICIAL_EXAM_DATA?.scoreAnswers(examId, answers)
          : null;
        const rights = scored
          ? scored.sectionScores.rights
          : boundedInteger(item.rights, 14);
        const restrictions = scored
          ? scored.sectionScores.restrictions
          : boundedInteger(item.restrictions, 8);
        const business = scored
          ? scored.sectionScores.business
          : boundedInteger(item.business, 20);
        const taxOther = scored
          ? scored.sectionScores.taxOther
          : boundedInteger(item.taxOther, 8);
        const score = scored ? scored.score : boundedInteger(item.score, 50);
        const completedAt = Number.isFinite(Date.parse(item.completedAt))
          ? String(item.completedAt).slice(0, 64)
          : "";
        if (!completedAt) return null;
        const startedAt = Number.isFinite(Date.parse(item.startedAt))
          ? String(item.startedAt).slice(0, 64)
          : "";
        const suppliedStartedDayKey = BUSINESS_MASTERY?.dayKey(item.startedDayKey);
        const suppliedOffset = normalizedUtcOffsetMinutes(item.startedUtcOffsetMinutes);
        const legacyOffset = inferUtcOffsetMinutes(startedAt, suppliedStartedDayKey);
        const rawElapsedMinutes = item.elapsedMinutes;
        const commonEvidenceValid = sourceMode === "timed-answer-sheet" &&
          officialExamAnswerObjectValid(examId, item.answers, true) &&
          typeof item.appUnseenAtStart === "boolean" &&
          item.timed120 === true &&
          Number.isInteger(rawElapsedMinutes) && rawElapsedMinutes >= 1 &&
          rawElapsedMinutes <= MOCK_DURATION_MINUTES &&
          Boolean(startedAt) && Date.parse(completedAt) >= Date.parse(startedAt);
        const version3Valid = Number(item.evidenceVersion) >= OFFICIAL_EXAM_EVIDENCE_VERSION &&
          item.scoringBasis === OFFICIAL_HISTORICAL_SCORING_BASIS &&
          suppliedOffset !== null &&
          dayKeyAtUtcOffset(startedAt, suppliedOffset) === suppliedStartedDayKey &&
          commonEvidenceValid;
        const version2Valid = !version3Valid &&
          Number(item.evidenceVersion) >= OFFICIAL_EXAM_LEGACY_EVIDENCE_VERSION &&
          legacyOffset !== null &&
          item.lawBaseline === CURRENT_LAW_BASELINE &&
          item.lawChecked === true &&
          commonEvidenceValid;
        const evidenceVersion = version3Valid
          ? OFFICIAL_EXAM_EVIDENCE_VERSION
          : version2Valid
            ? OFFICIAL_EXAM_LEGACY_EVIDENCE_VERSION
            : 0;
        const startedUtcOffsetMinutes = version3Valid ? suppliedOffset : version2Valid ? legacyOffset : null;
        const startedDayKey = evidenceVersion ? suppliedStartedDayKey : startedAt ? localDateKey(startedAt) : "";
        const normalizedElapsedMinutes = Number(item.elapsedMinutes);
        return {
          recordId: cleanMissionText(
            item.recordId ||
              `${examId}-${item.attemptType === "retest" ? "retest" : "initial"}-${sourceMode}-${completedAt}`,
            180
          ),
          examId,
          year: definition?.year || Number(item.year),
          legacySessionAmbiguous,
          attemptType: item.attemptType === "retest" ? "retest" : "initial",
          sourceMode,
          evidenceVersion,
          scoringBasis: version3Valid ? OFFICIAL_HISTORICAL_SCORING_BASIS : "",
          startedAt,
          startedDayKey,
          startedUtcOffsetMinutes,
          appUnseenAtStart: evidenceVersion >= OFFICIAL_EXAM_LEGACY_EVIDENCE_VERSION && Boolean(item.appUnseenAtStart),
          currentLawBaseline: version3Valid ? CURRENT_LAW_BASELINE : "",
          lawBaseline: version2Valid && item.lawBaseline === CURRENT_LAW_BASELINE
            ? CURRENT_LAW_BASELINE
            : "",
          timed120: sourceMode === "timed-answer-sheet" &&
            Boolean(item.timed120 ?? (Number(item.elapsedMinutes) <= MOCK_DURATION_MINUTES)),
          lawChecked: version2Valid && Boolean(item.lawChecked),
          answers,
          score,
          rights,
          restrictions,
          business,
          taxOther,
          elapsedMinutes: Number.isInteger(normalizedElapsedMinutes) &&
            normalizedElapsedMinutes >= 1 && normalizedElapsedMinutes <= 180
            ? normalizedElapsedMinutes
            : 0,
          completedAt
        };
      })
      .filter(Boolean)
      .filter((item) =>
        item.score === item.rights + item.restrictions + item.business + item.taxOther
      )
      .sort((left, right) =>
        (Date.parse(left.completedAt) || 0) - (Date.parse(right.completedAt) || 0)
      );
    const latestByAttempt = new Map();
    normalized.forEach((item) => {
      const key = `${item.examId}:${item.attemptType}:${item.sourceMode}`;
      latestByAttempt.set(key, item);
    });
    return [...latestByAttempt.values()].slice(-60);
  }

  function cleanMissionText(value, maximum = 120) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maximum);
  }

  function validReviewRule(value) {
    const note = cleanMissionText(value);
    const parts = note.split(/\s*(?:→|⇒|->)\s*/);
    return parts.length === 2 &&
      parts[0].length >= 2 &&
      parts[1].length >= 4 &&
      /(見る|読む|引く|囲む|書く|比べる|数える|確認する|探す|消す|選ぶ|分ける|戻る|止める|切る|付ける|つける|照合する|唱える|チェックする)/.test(parts[1]);
  }

  function normalizeOfficialDrill(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const definition = officialDrillDefinitionById(String(input.setId || ""));
    if (!definition) return null;
    const questionNumbers = new Set(definition.questions.map((item) => item.number));

    const answers = {};
    definition.questions.forEach((item) => {
      const answer = Number(input.answers?.[item.number]);
      if (Number.isInteger(answer) && answer >= 1 && answer <= 4) {
        answers[item.number] = answer;
      }
    });
    const legacyUncertain = [...new Set(
      (Array.isArray(input.uncertain) ? input.uncertain : [])
        .map(Number)
        .filter((number) => questionNumbers.has(number))
    )].sort((left, right) => left - right);
    const evidenceVersion = boundedInteger(input.evidenceVersion, 10);
    const confidence = {};
    definition.questions.forEach((item) => {
      const recorded = String(input.confidence?.[item.number] || "");
      if (recorded === "grounded" || recorded === "uncertain") {
        confidence[item.number] = recorded;
      } else if (Boolean(input.completed) && evidenceVersion < OFFICIAL_DRILL_EVIDENCE_VERSION) {
        confidence[item.number] = legacyUncertain.includes(item.number)
          ? "uncertain"
          : "grounded";
      }
    });
    const uncertain = [...new Set([
      ...legacyUncertain,
      ...Object.entries(confidence)
        .filter(([, value]) => value === "uncertain")
        .map(([number]) => Number(number))
    ])].sort((left, right) => left - right);
    const startedAt = Number.isFinite(Date.parse(input.startedAt))
      ? String(input.startedAt).slice(0, 64)
      : "";
    const submittedAt = Number.isFinite(Date.parse(input.submittedAt))
      ? String(input.submittedAt).slice(0, 64)
      : "";
    const completed =
      Boolean(input.completed) &&
      Boolean(submittedAt) &&
      Object.keys(answers).length === definition.questions.length &&
      (
        evidenceVersion < OFFICIAL_DRILL_EVIDENCE_VERSION ||
        Object.keys(confidence).length === definition.questions.length
      );
    const position = Math.min(
      definition.questions.length - 1,
      Math.max(0, Math.trunc(Number(input.position) || 0))
    );

    if (!completed) {
      return {
        setId: definition.id,
        position,
        startedAt,
        submittedAt: "",
        answers,
        confidence,
        uncertain,
        evidenceVersion,
        completed: false,
        score: 0,
        sectionScores: {},
        elapsedMinutes: 0,
        reviewTargets: [],
        reviewNotes: {},
        reviewCauses: {}
      };
    }

    const sectionScores = Object.fromEntries(
      Object.keys(OFFICIAL_DRILL_SECTION_LABELS).map((section) => [section, 0])
    );
    const reviewTargets = [];
    let score = 0;
    definition.questions.forEach((item) => {
      const correct = answers[item.number] === item.answer;
      if (correct) {
        score += 1;
        sectionScores[item.section] += 1;
      }
      if (!correct || uncertain.includes(item.number)) {
        reviewTargets.push(item.number);
      }
    });
    const derivedMinutes =
      startedAt && Date.parse(submittedAt) >= Date.parse(startedAt)
        ? Math.ceil((Date.parse(submittedAt) - Date.parse(startedAt)) / 60000)
        : 0;
    const elapsedMinutes = Math.min(
      180,
      Math.max(1, derivedMinutes || boundedInteger(input.elapsedMinutes, 180))
    );
    const reviewNotes = Object.fromEntries(
      reviewTargets
        .map((number) => [
          number,
          cleanMissionText(input.reviewNotes?.[number])
        ])
        .filter(([, note]) => note)
    );
    const reviewCauses = Object.fromEntries(
      reviewTargets
        .map((number) => [
          number,
          MISTAKE_CAUSE_IDS.has(input.reviewCauses?.[number])
            ? input.reviewCauses[number]
            : ""
        ])
        .filter(([, cause]) => cause)
    );

    return {
      setId: definition.id,
      position,
      startedAt,
      submittedAt,
      answers,
      confidence,
      uncertain,
      evidenceVersion,
      completed: true,
      score,
      sectionScores,
      elapsedMinutes,
      reviewTargets,
      reviewNotes,
      reviewCauses
    };
  }

  function normalizeMissionEntry(mission) {
    const officialDrill = normalizeOfficialDrill(mission?.officialDrill);
    const reviewNote = cleanMissionText(mission?.reviewNote);
    const drillReviewComplete = officialDrill?.completed
      ? officialDrill.reviewTargets.length === 0 ||
        officialDrill.reviewTargets.every((number) =>
          officialDrill.evidenceVersion >= OFFICIAL_DRILL_EVIDENCE_VERSION
            ? MISTAKE_CAUSE_IDS.has(officialDrill.reviewCauses?.[number]) &&
              validReviewRule(officialDrill.reviewNotes?.[number])
            : cleanMissionText(officialDrill.reviewNotes?.[number]).length >= 4
        )
      : null;
    return {
      officialQuestions: Boolean(mission?.officialQuestions || officialDrill?.completed),
      reviewed: drillReviewComplete === null
        ? Boolean(mission?.reviewed)
        : drillReviewComplete,
      reviewNote,
      minutes: boundedInteger(mission?.minutes, 600),
      officialDrill
    };
  }

  function normalizeMissionLog(input) {
    return Object.fromEntries(
      Object.entries(input && typeof input === "object" && !Array.isArray(input) ? input : {})
        .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
        .slice(-180)
        .map(([date, mission]) => [
          date,
          normalizeMissionEntry(mission)
        ])
    );
  }

  function calculationIds(input) {
    const valid = new Set(CALCULATION_QUESTION_IDS);
    return [...new Set((Array.isArray(input) ? input : []).map(String))]
      .filter((id) => valid.has(id));
  }

  function normalizeCalculationHistory(input) {
    return Object.fromEntries(
      Object.entries(input && typeof input === "object" && !Array.isArray(input) ? input : {})
        .filter(([id]) => Boolean(CALCULATION_QUESTION_BY_ID[id]))
        .map(([id, item]) => [
          id,
          {
            attempts: boundedInteger(item?.attempts, 10000),
            correct: boundedInteger(item?.correct, 10000),
            wrong: boundedInteger(item?.wrong, 10000),
            uncertain: boundedInteger(item?.uncertain, 10000),
            lastSelected: Number.isInteger(Number(item?.lastSelected))
              ? Math.min(3, Math.max(0, Number(item.lastSelected)))
              : null,
            lastCorrect: Boolean(item?.lastCorrect),
            lastConfidence: ["confident", "uncertain", "wrong"].includes(item?.lastConfidence)
              ? item.lastConfidence
              : "",
            lastAnsweredAt: Number.isFinite(Date.parse(item?.lastAnsweredAt))
              ? String(item.lastAnsweredAt).slice(0, 64)
              : ""
          }
        ])
    );
  }

  function normalizeCalculationDrillState(input) {
    const fresh = createCalculationDrillState();
    if (!CALCULATION_QUESTION_IDS.length) return fresh;
    const retryIds = calculationIds(input?.retryIds);
    const masteredIds = calculationIds(input?.masteredIds)
      .filter((id) => !retryIds.includes(id));
    const legacyIdleDefaults = (input?.stage || "first") === "first" &&
      !(Number(input?.position) > 0) && !input?.currentAttempt &&
      !(Number(input?.attempts) > 0) && !(Number(input?.correctAttempts) > 0) &&
      !Object.keys(input?.history || {}).length && !retryIds.length && !masteredIds.length &&
      !input?.completedAt;
    let stage = legacyIdleDefaults
      ? "idle"
      : ["idle", "active", "first", "retry", "complete"].includes(input?.stage)
        ? input.stage
        : fresh.stage;
    if (stage === "complete" && retryIds.length) stage = "retry";
    let queue = stage === "idle" ? [] : calculationIds(input?.queue);
    if (!queue.length && !["idle", "complete"].includes(stage)) {
      queue = stage === "retry" && retryIds.length
        ? [...retryIds]
        : [...CALCULATION_QUESTION_IDS];
    }
    const position = queue.length
      ? Math.min(Math.max(Number(input?.position) || 0, 0), queue.length - 1)
      : 0;
    const currentId = queue[position];
    const rawAttempt = input?.currentAttempt;
    const selected = Number(rawAttempt?.selected);
    const currentQuestion = CALCULATION_QUESTION_BY_ID[currentId];
    const currentAttempt = currentQuestion && rawAttempt?.id === currentId &&
      Number.isInteger(selected) && selected >= 0 && selected < 4
      ? {
          id: currentId,
          selected,
          correct: selected === currentQuestion.answer,
          confidence: selected === currentQuestion.answer
            ? (["confident", "uncertain"].includes(rawAttempt?.confidence) ? rawAttempt.confidence : "")
            : "wrong"
        }
      : null;
    return {
      version: CALCULATION_DRILL?.VERSION || 1,
      stage,
      queue,
      position,
      currentAttempt,
      retryIds,
      masteredIds,
      history: normalizeCalculationHistory(input?.history),
      attempts: boundedInteger(input?.attempts, 100000),
      correctAttempts: boundedInteger(input?.correctAttempts, 100000),
      completedAt: stage === "complete" && Number.isFinite(Date.parse(input?.completedAt))
        ? String(input.completedAt).slice(0, 64)
        : ""
    };
  }

  function practicalQuestionSet(bankId = LEGACY_PRACTICAL_BANK_ID) {
    return bankId === BUSINESS_FULLSCORE_BANK_ID
      ? new Set(BUSINESS_FULLSCORE_QUESTION_IDS)
      : new Set(PRACTICAL_QUESTION_IDS);
  }

  function practicalQuestionFor(id, bankId = state?.practicalDrill?.bankId) {
    return bankId === BUSINESS_FULLSCORE_BANK_ID
      ? BUSINESS_FULLSCORE_QUESTION_BY_ID[id] || null
      : PRACTICAL_QUESTION_BY_ID[id] || null;
  }

  function practicalIds(input, bankId = LEGACY_PRACTICAL_BANK_ID) {
    const valid = practicalQuestionSet(bankId);
    return [...new Set((Array.isArray(input) ? input : []).map(String))]
      .filter((id) => valid.has(id));
  }

  function normalizeBusinessMistakeTags(input) {
    return Object.fromEntries(
      Object.entries(input && typeof input === "object" && !Array.isArray(input) ? input : {})
        .filter(([tag]) => BUSINESS_DIAGNOSTIC_TAGS.has(tag))
        .map(([tag, count]) => [tag, boundedInteger(count, 10000)])
        .filter(([, count]) => count > 0)
    );
  }

  function normalizeBusinessTagList(input) {
    return [...new Set((Array.isArray(input) ? input : []).map(String))]
      .filter((tag) => BUSINESS_DIAGNOSTIC_TAGS.has(tag))
      .slice(0, BUSINESS_DIAGNOSTIC_TAGS.size);
  }

  function normalizePracticalHistory(input, preserveUnknownIds = []) {
    const preserved = new Set((Array.isArray(preserveUnknownIds) ? preserveUnknownIds : []).map(String).slice(0, 200));
    return Object.fromEntries(
      Object.entries(input && typeof input === "object" && !Array.isArray(input) ? input : {})
        .filter(([id]) => Boolean(ALL_PRACTICAL_QUESTION_BY_ID[id]) || preserved.has(id))
        .map(([id, item]) => [
          id,
          {
            attempts: boundedInteger(item?.attempts, 10000),
            correct: boundedInteger(item?.correct, 10000),
            wrong: boundedInteger(item?.wrong, 10000),
            uncertain: boundedInteger(item?.uncertain, 10000),
            lastSelected: Number.isInteger(Number(item?.lastSelected))
              ? Math.min(3, Math.max(0, Number(item.lastSelected)))
              : null,
            lastCorrect: Boolean(item?.lastCorrect),
            lastConfidence: ["confident", "uncertain", "wrong"].includes(item?.lastConfidence)
              ? item.lastConfidence
              : "",
            lastAnsweredAt: Number.isFinite(Date.parse(item?.lastAnsweredAt))
              ? String(item.lastAnsweredAt).slice(0, 64)
              : "",
            mistakeTags: normalizeBusinessMistakeTags(item?.mistakeTags),
            lastMistakeTags: normalizeBusinessTagList(item?.lastMistakeTags),
            ...((ALL_PRACTICAL_QUESTION_BY_ID[id]?.scopeId === "business" || preserved.has(id))
              ? BUSINESS_MASTERY.normalizeMasteryHistory(item)
              : {})
          }
        ])
    );
  }

  function normalizePracticalDrillState(input) {
    const fresh = createPracticalDrillState();
    if (!PRACTICAL_QUESTION_IDS.length) return fresh;
    const requestedFullScoreBank = input?.bankId === BUSINESS_FULLSCORE_BANK_ID;
    const bankId = requestedFullScoreBank
      ? BUSINESS_FULLSCORE_BANK_ID
      : LEGACY_PRACTICAL_BANK_ID;
    const currentBankVersion = bankId === BUSINESS_FULLSCORE_BANK_ID
      ? Number(BUSINESS_FULLSCORE_BANK?.VERSION) || Number(input?.bankVersion) || 1
      : PRACTICAL_VARIATIONS?.VERSION || 1;
    const savedBankVersion = Number(input?.bankVersion || input?.version || 1);
    const bankChanged = savedBankVersion !== currentBankVersion;
    const preserveUnknownIds = !BUSINESS_FULLSCORE_BANK_READY
      ? Object.keys(input?.history || {}).filter((id) =>
          /^bf-business-book-(?:0[1-9]|1[01])-/.test(id)
        )
      : [];
    const legacyIdleDefaults = (input?.stage || "idle") === "idle" &&
      input?.scope === "all" && Number(input?.sessionSize) === 20 && !input?.unitId &&
      !(Number(input?.attempts) > 0) && !(Number(input?.sessionsCompleted) > 0) &&
      !Object.keys(input?.history || {}).length && !(input?.retryIds || []).length &&
      !(input?.sessionIds || []).length && !(input?.queue || []).length;
    const scope = legacyIdleDefaults
      ? fresh.scope
      : PRACTICAL_SCOPES.includes(input?.scope) ? input.scope : fresh.scope;
    const validUnits = bankId === BUSINESS_FULLSCORE_BANK_ID
      ? BUSINESS_FULLSCORE_UNITS
      : (PRACTICAL_VARIATIONS?.UNITS || []);
    const unitId = validUnits.some((unit) => unit.id === input?.unitId)
      ? String(input.unitId)
      : "";
    const planMode = ["mastery", "knock", "legacy"].includes(input?.planMode)
      ? String(input.planMode)
      : bankId === BUSINESS_FULLSCORE_BANK_ID ? "mastery" : "legacy";
    const rawKnockPreset = input?.knockPreset && typeof input.knockPreset === "object"
      ? input.knockPreset
      : fresh.knockPreset;
    const knockMode = BUSINESS_KNOCK_MODES.includes(rawKnockPreset?.mode)
      ? String(rawKnockPreset.mode)
      : fresh.knockPreset.mode;
    const knockSize = BUSINESS_KNOCK_SIZES.includes(Number(rawKnockPreset?.size))
      ? Number(rawKnockPreset.size)
      : fresh.knockPreset.size;
    const knockUnitId = validUnits.some((unit) => unit.id === rawKnockPreset?.unitId)
      ? String(rawKnockPreset.unitId)
      : "";
    const knockLastPresentationOffset = Number.isInteger(rawKnockPreset?.lastPresentationOffset) &&
      rawKnockPreset.lastPresentationOffset >= 0 && rawKnockPreset.lastPresentationOffset <= 3
      ? rawKnockPreset.lastPresentationOffset
      : null;
    const requestedSize = Number(input?.sessionSize);
    const sessionSize = legacyIdleDefaults
      ? fresh.sessionSize
      : bankId === BUSINESS_FULLSCORE_BANK_ID
        ? Number.isInteger(requestedSize) && requestedSize >= 1 && requestedSize <= BUSINESS_FULLSCORE_EXPECTED_QUESTIONS
          ? requestedSize
          : fresh.sessionSize
        : PRACTICAL_SESSION_SIZES.includes(requestedSize) ? requestedSize : fresh.sessionSize;
    const retryIds = practicalIds(input?.retryIds, bankId);
    const sessionIds = practicalIds(input?.sessionIds, bankId);
    let stage = ["idle", "active", "retry", "complete"].includes(input?.stage)
      ? input.stage
      : "idle";
    let queue = practicalIds(input?.queue, bankId);
    if (["active", "retry"].includes(stage) && !queue.length) stage = "idle";
    if (stage === "retry" && !retryIds.some((id) => sessionIds.includes(id)) && !input?.currentAttempt) {
      stage = "complete";
      queue = [];
    }
    const position = queue.length
      ? Math.min(Math.max(Number(input?.position) || 0, 0), queue.length - 1)
      : 0;
    const currentId = queue[position];
    const rawAttempt = input?.currentAttempt;
    const selected = Number(rawAttempt?.selected);
    const currentQuestion = practicalQuestionFor(currentId, bankId);
    const presentationKey = bankId === BUSINESS_FULLSCORE_BANK_ID
      ? String(input?.presentationKey || "").replace(/[^0-9a-z:_-]/gi, "").slice(0, 80)
      : "";
    const presentedQuestion = presentPracticalQuestion(currentQuestion, bankId, presentationKey);
    // 問題IDと履歴は維持する。問題本文・正答が更新された場合だけ、
    // 途中で表示中だった一問の選択を外して旧正答の誤判定を防ぐ。
    const currentAttempt = !bankChanged && presentedQuestion && rawAttempt?.id === currentId &&
      Number.isInteger(selected) && selected >= 0 && selected < 4
      ? {
          id: currentId,
          selected,
          correct: selected === presentedQuestion.answer,
          confidence: selected === presentedQuestion.answer
            ? (["confident", "uncertain"].includes(rawAttempt?.confidence) ? rawAttempt.confidence : "")
            : "wrong",
          masteryRecorded: Boolean(rawAttempt?.masteryRecorded),
          diagnosticRecorded: Boolean(rawAttempt?.diagnosticRecorded)
        }
      : null;
    return {
      version: bankId === LEGACY_PRACTICAL_BANK_ID ? currentBankVersion : fresh.version,
      bankId,
      bankVersion: currentBankVersion,
      presentationKey,
      planMode,
      knockPreset: {
        mode: knockMode,
        size: knockSize,
        unitId: knockUnitId,
        lastPresentationOffset: knockLastPresentationOffset
      },
      stage,
      scope,
      unitId,
      sessionSize,
      sessionIds,
      queue,
      position,
      currentAttempt,
      retryIds,
      history: normalizePracticalHistory(input?.history, preserveUnknownIds),
      attempts: boundedInteger(input?.attempts, 100000),
      correctAttempts: boundedInteger(input?.correctAttempts, 100000),
      sessionsCompleted: boundedInteger(input?.sessionsCompleted, 10000),
      sessionStartedAt: Number.isFinite(Date.parse(input?.sessionStartedAt))
        ? String(input.sessionStartedAt).slice(0, 64)
        : "",
      completedAt: stage === "complete" && Number.isFinite(Date.parse(input?.completedAt))
        ? String(input.completedAt).slice(0, 64)
        : ""
    };
  }

  function inferredMistakeCause(answered) {
    const note = String(answered?.mistakeNote || "");
    if (/読み|見落と|見間違/.test(note)) return "reading";
    if (/期限|日|年|月|数字/.test(note)) return "number";
    if (/例外|ただし|原則/.test(note)) return "exception";
    if (/法人|個人|主体|制度|変更届|免許換|区別|混同|勘違/.test(note)) return "mixup";
    return "knowledge";
  }

  function loadState() {
    if (!SAVE_STORE) {
      const raw = localStorage.getItem(STORAGE_ID);
      try {
        return normalizeState(JSON.parse(raw || "null") || createState());
      } catch {
        return createState();
      }
    }
    saveStoreSession = SAVE_STORE.load(
      localStorage,
      STORAGE_ID,
      STATE_SCHEMA_VERSION
    );
    return normalizeState(saveStoreSession.value || createState());
  }

  function normalizeState(input) {
    const previousProgressionVersion = Number(input?.progressionVersion) || 0;
    const previousExamContentVersion = Number(input?.examContentVersion) || 0;
    const hasProgressionV1 = previousProgressionVersion >= 1;
    const next = { ...createState(), ...input };
    next.index = Math.min(Math.max(Number(next.index) || 0, 0), ORDER.length - 1);
    next.step = Number(next.step) || next.attempts || 0;
    next.sessionId = next.sessionId || createOpaqueId("session");
    next.mock = normalizeMockState(input?.mock);
    next.mockHistory = normalizeMockHistory(input?.mockHistory);
    next.officialExamHistory = normalizeOfficialExamHistory(input?.officialExamHistory);
    next.officialExamSession = normalizeOfficialExamSession(input?.officialExamSession);
    next.missionLog = normalizeMissionLog(input?.missionLog);
    next.officialExamExposure = normalizeOfficialExamExposure(input?.officialExamExposure);
    next.officialExamHistory.forEach((item) => {
      next.officialExamExposure = mergeOfficialExamExposure(
        next.officialExamExposure,
        item.examId,
        item.sourceMode === "self-report" ? "manual" : "history",
        item.startedAt || item.completedAt
      );
    });
    if (next.officialExamSession) {
      next.officialExamExposure = mergeOfficialExamExposure(
        next.officialExamExposure,
        next.officialExamSession.examId,
        "full-exam",
        next.officialExamSession.startedAt
      );
    }
    Object.values(next.missionLog || {}).forEach((mission) => {
      const drill = normalizeOfficialDrill(mission?.officialDrill);
      const definition = officialDrillDefinitionById(drill?.setId);
      if (!definition || !drill?.startedAt) return;
      next.officialExamExposure = mergeOfficialExamExposure(
        next.officialExamExposure,
        String(definition.examId || definition.year || ""),
        "daily-drill",
        drill.startedAt
      );
    });
    next.calculationDrill = normalizeCalculationDrillState(input?.calculationDrill);
    next.practicalDrill = normalizePracticalDrillState(input?.practicalDrill);
    next.saveMeta = {
      lastExportedAt: Number.isFinite(Date.parse(input?.saveMeta?.lastExportedAt))
        ? String(input.saveMeta.lastExportedAt).slice(0, 64)
        : "",
      lastExportHash: /^[a-f0-9]{8}$/i.test(String(input?.saveMeta?.lastExportHash || ""))
        ? String(input.saveMeta.lastExportHash).toLowerCase()
        : ""
    };
    const requestedMock = input?.runMode === RUN_MODE_MOCK && mockFormById(next.mock.formId);
    const requestedChapterModeId = String(input?.chapterModeId || "").slice(0, 80);
    const requestedChapter = CHAPTERS.find((chapter) => chapter.id === requestedChapterModeId);
    next.runMode = FIRST_PASS_PARAM || next.runMode === RUN_MODE_FIRST_PASS
      ? RUN_MODE_FIRST_PASS
      : requestedMock
        ? RUN_MODE_MOCK
        : input?.runMode === RUN_MODE_CHAPTER && requestedChapter
          ? RUN_MODE_CHAPTER
          : "quest";
    next.chapterModeId = next.runMode === RUN_MODE_CHAPTER ? requestedChapter.id : "";
    next.adaptive = false;
    next.studyScope = STUDY_SCOPE_IDS.has(input?.studyScope)
      ? input.studyScope
      : DEFAULT_STUDY_SCOPE;
    next.questionStats = next.questionStats || {};
    next.centralMarked = next.centralMarked || {};
    next.centralProgress = next.centralProgress || {};
    next.questionChoiceOrders = next.questionChoiceOrders || {};
    next.questionBalanceAudit = next.questionBalanceAudit || {};
    next.questionBalanceVersion = Number(next.questionBalanceVersion) || 0;
    next.stateSchemaVersion = STATE_SCHEMA_VERSION;
    const syncStamp = STATE_SYNC?.syncStamp ? STATE_SYNC.syncStamp(input || {}) : {
      generation: Math.max(0, Math.trunc(Number(input?.syncMeta?.generation) || 0)),
      revision: Math.max(0, Math.trunc(Number(input?.syncMeta?.revision) || 0)),
      updatedAt: Number.isFinite(Date.parse(input?.syncMeta?.updatedAt)) ? String(input.syncMeta.updatedAt) : "",
      writerId: String(input?.syncMeta?.writerId || "")
    };
    next.syncMeta = {
      generation: Math.max(0, Math.trunc(Number(syncStamp.generation) || 0)),
      revision: syncStamp.revision,
      updatedAt: syncStamp.updatedAt,
      writerId: syncStamp.writerId.slice(0, 180),
      baseRevision: Math.max(0, Math.trunc(Number(input?.syncMeta?.baseRevision) || 0)),
      clock: syncStamp.clock || {}
    };
    next.marked = next.marked || {};
    next.autoMarked = next.autoMarked || {};
    next.focus = Math.min(100, Math.max(0, Number(next.focus) || 0));
    next.crystals = Math.max(0, Number(next.crystals) || 0);
    next.crystalSpent = Math.max(0, Number(next.crystalSpent) || 0);
    next.victories = Math.max(0, Number(next.victories) || 0, Number(next.correct) || 0);
    next.weakRewards = next.weakRewards || {};
    if (!hasProgressionV1) {
      const correct = Math.max(0, Number(next.correct) || 0);
      const wrong = Math.max(0, (Number(next.attempts) || 0) - correct);
      const migratedChests = Math.floor(next.victories / 5);
      const clearedBoss = Object.entries(next.questionStats).some(([id, stats]) => {
        const question = QUESTIONS[id];
        if (!question || !(Number(stats?.correct) > 0)) return false;
        return id === chapterPosition({ id, ...question, chapter: idToChapter.get(id) }).bossId;
      });
      next.totalXp = correct * 100 + wrong * 15;
      next.chestsOpened = migratedChests;
      next.chestProgress = next.victories % 5;
      next.loot = migratedChests > 0 ? { "license-shard": migratedChests } : {};
      if (clearedBoss) {
        next.loot["codex-core"] = 1;
      }
      next.adventureDays = (Number(next.attempts) || 0) > 0 ? { [todayKey()]: true } : {};
      next.progressionVersion = PROGRESSION_VERSION;
    }
    next.totalXp = Math.max(0, Number(next.totalXp) || 0);
    next.chestProgress = Math.min(4, Math.max(0, Number(next.chestProgress) || 0));
    next.chestQuality = Math.max(0, Number(next.chestQuality) || 0);
    if (previousProgressionVersion < 2 && hasProgressionV1) {
      next.chestQuality = Math.max(next.chestQuality, next.chestProgress * 2);
    }
    next.chestsOpened = Math.max(0, Number(next.chestsOpened) || 0);
    next.loot = Object.fromEntries(
      Object.entries(next.loot || {})
        .map(([key, count]) => [key, Math.max(0, Number(count) || 0)])
        .filter(([, count]) => count > 0)
    );
    next.armoryRank = Math.min(
      REWARD_SYSTEM.ARMORY_RANKS.length - 1,
      Math.max(0, Number(next.armoryRank) || 0)
    );
    next.adventureDays = Object.fromEntries(
      Object.entries(next.adventureDays || {}).filter(([, active]) => Boolean(active))
    );
    next.questRewardClaims = Object.fromEntries(
      Object.entries(next.questRewardClaims || {}).map(([date, claims]) => [
        date,
        [...new Set((Array.isArray(claims) ? claims : []).map((claim) => {
          if (claim === "elite") return "continue";
          if (claim === "conquest") return "complete";
          return String(claim);
        }))]
      ])
    );
    next.analysisRewardClaims = Object.fromEntries(
      Object.entries(next.analysisRewardClaims || {}).map(([date, ids]) => [
        date,
        [...new Set((Array.isArray(ids) ? ids : []).map(String))]
      ])
    );
    next.questionStats = Object.fromEntries(
      Object.entries(next.questionStats).map(([id, stats]) => {
        const normalized = { ...stats };
        if (!normalized.lastCorrectAt && normalized.lastCorrectStep === normalized.lastStep) {
          normalized.lastCorrectAt = normalized.lastAnsweredAt;
        }
        if (!normalized.lastWrongAt && normalized.lastWrongStep === normalized.lastStep) {
          normalized.lastWrongAt = normalized.lastAnsweredAt;
        }
        normalized.correctDayKeys = normalizedCorrectDayKeys(normalized);
        normalized.clearDayKeys = normalizedComprehensionDayKeys(normalized);
        normalized.understandingDayKeys = normalizedUnderstandingDayKeys(normalized);
        return [id, normalized];
      })
    );
    if (!input?.analysisRewardClaims) {
      const migratedIds = Object.entries(next.questionStats)
        .filter(([, stats]) => localDateKey(stats?.lastMistakeAt) === todayKey())
        .map(([id]) => id);
      if (migratedIds.length) next.analysisRewardClaims[todayKey()] = migratedIds;
    }
    next.progressionVersion = PROGRESSION_VERSION;
    next.examContentVersion = EXAM_CONTENT_VERSION;
    if (previousExamContentVersion < EXAM_CONTENT_VERSION) {
      next.index = 0;
      next.answered = null;
      next.activeCutCheck = null;
      next.finished = false;
      next.runMode = "quest";
      next.chapterModeId = "";
      next.adaptive = false;
      next.dailyFinishedDate = "";
      next.daily = createDailyState();
      next.mock = createMockState();
    }
    next.activeCutCheck = next.activeCutCheck && next.activeCutCheck.id === ORDER[next.index] && !next.answered
      ? { id: next.activeCutCheck.id, answers: next.activeCutCheck.answers || {} }
      : null;
    next.dailyFinishedDate = String(next.dailyFinishedDate || "");
    next.daily = normalizeDailyState(next.daily);
    next.sprint = normalizeSprintState(next.sprint);
    if (next.runMode === RUN_MODE_MOCK) {
      const form = mockFormById(next.mock.formId);
      const mockId = form?.ids[next.mock.position];
      const mockIndex = ORDER.indexOf(mockId);
      if (mockIndex >= 0) next.index = mockIndex;
      next.finished = Boolean(next.mock.finalized);
    }
    if (next.answered && next.answered.id !== ORDER[next.index]) {
      next.answered = null;
      next.activeCutCheck = null;
    }
    if (
      next.answered?.correct === false &&
      !MISTAKE_CAUSE_IDS.has(next.answered.mistakeCause) &&
      ((next.answered.mistakeItems || []).length || next.answered.mistakeUnknown || next.answered.mistakeNote)
    ) {
      next.answered.mistakeCause = inferredMistakeCause(next.answered);
      if (next.questionStats[next.answered.id]) {
        next.questionStats[next.answered.id] = {
          ...next.questionStats[next.answered.id],
          lastMistakeCause: next.answered.mistakeCause
        };
      }
    }
    return next;
  }

  function cloneStateForSync(value) {
    return STATE_SYNC?.clone
      ? STATE_SYNC.clone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function persistedStateForSync() {
    const raw = localStorage.getItem(STORAGE_ID);
    if (!raw) return null;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      if (saveStoreSession.skipPreviousRotation) return null;
      throw error;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("別タブのセーブ形式を確認できませんでした。");
    }
    return normalizeState(parsed);
  }

  function acquireStateSaveLease() {
    const leaseKey = `${STORAGE_ID}-save-lease`;
    const now = Date.now();
    const token = JSON.stringify({
      writerId: syncWriterId,
      nonce: createOpaqueId("lease"),
      expiresAt: now + 5000
    });
    const currentRaw = localStorage.getItem(leaseKey);
    if (currentRaw) {
      try {
        const current = JSON.parse(currentRaw);
        if (Number(current?.expiresAt) > now && current.writerId !== syncWriterId) {
          return null;
        }
      } catch {
        // Invalid or stale leases are safely replaced below.
      }
    }
    localStorage.setItem(leaseKey, token);
    if (localStorage.getItem(leaseKey) !== token) return null;
    return () => {
      try {
        if (localStorage.getItem(leaseKey) === token) localStorage.removeItem(leaseKey);
      } catch {
        // Expiry makes an unreleased lease recoverable.
      }
    };
  }

  function saveState(options = {}) {
    let releaseLease = null;
    try {
      releaseLease = acquireStateSaveLease();
      if (!releaseLease) {
        throw new Error("別タブが保存中です。数秒後にもう一度お試しください。");
      }
      const savedAt = new Date().toISOString();
      const replace = Boolean(options.replace);
      const preserveExposure = Boolean(options.preserveExposure);
      let candidate = state;
      const persisted = persistedStateForSync();
      const remote = persisted || syncBaseState || state;
      const requiredUnexposedExamId = String(options.requireUnexposedExamId || "");
      const requiredNoActiveOfficialExamId = String(options.requireNoActiveOfficialExamId || "");
      if (
        requiredUnexposedExamId &&
        normalizeOfficialExamExposure(remote.officialExamExposure)[requiredUnexposedExamId]
      ) {
        throw new Error("この公式試験回は別タブで先に接触済みになりました。");
      }
      if (
        requiredNoActiveOfficialExamId &&
        String(remote.officialExamSession?.examId || "") === requiredNoActiveOfficialExamId
      ) {
        throw new Error("この公式試験回は別タブで50問測定中です。");
      }
      if (replace) {
        const generation = Math.max(
          0,
          Number(state.syncMeta?.generation) || 0,
          Number(remote.syncMeta?.generation) || 0
        ) + 1;
        const revision = Math.max(
          0,
          Number(state.syncMeta?.revision) || 0,
          Number(remote.syncMeta?.revision) || 0
        ) + 1;
        candidate = normalizeState({
          ...state,
          officialExamExposure: preserveExposure
            ? mergeOfficialExamExposureLedgers(
                remote.officialExamExposure,
                state.officialExamExposure
              )
            : state.officialExamExposure,
          syncMeta: {
            generation,
            revision,
            updatedAt: savedAt,
            writerId: syncWriterId,
            baseRevision: Math.max(0, revision - 1)
          }
        });
      } else if (STATE_SYNC?.reconcileForSave) {
        const base = syncBaseState || remote;
        const reconciliation = STATE_SYNC.reconcileForSave(base, state, remote, {
          updatedAt: savedAt,
          writerId: syncWriterId
        });
        if (reconciliation.hasConflict) {
          lastSaveError = "別タブで異なる学習セッションが進行中です。どちらかを終了して再読み込みしてください。";
          setSaveTransferStatus(lastSaveError, true);
          renderSaveProtectionStatus();
          return false;
        }
        candidate = normalizeState(reconciliation.state);
      } else {
        candidate = normalizeState({
          ...state,
          syncMeta: {
            generation: Math.max(0, Number(state.syncMeta?.generation) || 0),
            revision: Math.max(0, Number(state.syncMeta?.revision) || 0) + 1,
            updatedAt: savedAt,
            writerId: syncWriterId,
            baseRevision: Math.max(0, Number(state.syncMeta?.revision) || 0)
          }
        });
      }
      if (!SAVE_STORE) {
        localStorage.setItem(STORAGE_ID, JSON.stringify(candidate));
      } else {
        SAVE_STORE.save(localStorage, STORAGE_ID, candidate, {
          skipPreviousRotation:
            Boolean(options.skipPreviousRotation) || saveStoreSession.skipPreviousRotation
        });
      }
      state = candidate;
      syncBaseState = cloneStateForSync(state);
      saveStoreSession.skipPreviousRotation = false;
      saveStoreSession.source = "primary";
      lastSuccessfulSaveAt = savedAt;
      lastSaveError = "";
      renderSaveProtectionStatus();
      return true;
    } catch (error) {
      lastSaveError = `自動保存に失敗しました：${error?.message || "保存領域を利用できません。"} バックアップを保存してから再試行してください。`;
      setSaveTransferStatus(lastSaveError, true);
      renderSaveProtectionStatus();
      return false;
    } finally {
      releaseLease?.();
    }
  }

  function setSaveTransferStatus(message, isError = false) {
    if (!elements.saveTransferStatus) return;
    elements.saveTransferStatus.textContent = message;
    elements.saveTransferStatus.classList.toggle("is-error", isError);
  }

  function savePackageSummary(parsed) {
    if (parsed.format === SAVE_TRANSFER.PROGRESS_FORMAT) {
      const contacted = Object.keys(parsed.progress.perQuestion).length;
      const weak = parsed.progress.weakIds.length;
      return `旧業法${contacted}/100問・弱点${weak}問・中央台帳${parsed.progress.answers}解答`;
    }
    const stats = parsed.state.questionStats || {};
    const contacted = Object.values(stats).filter((item) =>
      Math.max(Number(item?.attempts) || 0, Number(item?.centralAttempts) || 0) > 0
    ).length;
    return `${contacted}問接触・端末${Number(parsed.state.attempts) || 0}解答`;
  }

  function importSavePackage(input, sourceLabel = "セーブファイル") {
    if (!SAVE_TRANSFER) throw new Error("セーブ移行機能を読み込めませんでした。");
    const parsed = SAVE_TRANSFER.validatePackage(input, ORDER);
    const summary = savePackageSummary(parsed);
    const confirmed = window.confirm(
      `${sourceLabel}から ${summary} を引き継ぎます。\n` +
      "現在の端末セーブは自動バックアップしてから置き換えます。"
    );
    if (!confirmed) {
      setSaveTransferStatus("引継ぎをキャンセルしました。");
      return false;
    }

    if (SAVE_STORE?.backupCurrent) {
      SAVE_STORE.backupCurrent(
        localStorage,
        STORAGE_ID,
        SAVE_STORE.BEFORE_IMPORT_SUFFIX,
        Date.now()
      );
    } else {
      localStorage.setItem(
        `${STORAGE_ID}-before-import-${Date.now()}`,
        JSON.stringify(state)
      );
    }
    const imported = parsed.format === SAVE_TRANSFER.PROGRESS_FORMAT
      ? {
          ...SAVE_TRANSFER.stateFromProgressPackage(parsed, createState(), ORDER),
          examContentVersion: 0
        }
      : parsed.state;
    const previousState = cloneStateForSync(state);
    const preservedExposure = normalizeOfficialExamExposure(state.officialExamExposure);
    state = normalizeState(imported);
    state.officialExamExposure = mergeOfficialExamExposureLedgers(
      preservedExposure,
      state.officialExamExposure
    );
    applyQuestionBalance();
    if (!saveState({ replace: true, preserveExposure: true })) {
      state = previousState;
      applyQuestionBalance();
      setSaveTransferStatus(
        "引継ぎセーブを書き込めませんでした。現在の端末状態は維持しています。",
        true
      );
      render();
      return false;
    }
    setSaveTransferStatus(`引継ぎ完了: ${summary}`);
    render();
    return true;
  }

  function downloadSaveBackup() {
    try {
      const savePackage = SAVE_TRANSFER.createSavePackage(state);
      const blob = new Blob([JSON.stringify(savePackage, null, 2)], {
        type: "application/json;charset=utf-8"
      });
      const link = document.createElement("a");
      const day = todayKey().replace(/-/g, "");
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `takken-battle-save-${day}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      state.saveMeta = {
        lastExportedAt: new Date().toISOString(),
        lastExportHash: String(savePackage.integrity?.value || "")
      };
      saveState();
      setSaveTransferStatus(
        `セーブのバックアップを保存しました（照合 ${state.saveMeta.lastExportHash || "なし"}）。`
      );
    } catch (error) {
      setSaveTransferStatus(error?.message || "バックアップに失敗しました。", true);
    }
  }

  async function copyTransferUrl(value) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch {
        // Permission may be unavailable on older or non-secure browsers.
      }
    }
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("リンクをコピーできませんでした。");
  }

  async function shareSaveTransfer() {
    try {
      const savePackage = SAVE_TRANSFER.createSavePackage(state);
      const transferUrl = await SAVE_TRANSFER.createCompressedTransferUrl(savePackage, window.location.href);
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: "宅建バトル セーブ引継ぎ",
            text: "本人用の宅建バトル引継ぎリンクです。次の端末で開いてください。",
            url: transferUrl
          });
          setSaveTransferStatus("本人用引継ぎリンクを共有しました。");
          return;
        } catch (error) {
          if (error?.name === "AbortError") {
            setSaveTransferStatus("共有をキャンセルしました。");
            return;
          }
        }
      }
      await copyTransferUrl(transferUrl);
      setSaveTransferStatus("本人用引継ぎリンクをコピーしました。次の端末で開いてください。");
    } catch (error) {
      setSaveTransferStatus(error?.message || "引継ぎリンクを作れませんでした。", true);
    }
  }

  async function importSaveFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("セーブファイルが大きすぎます。");
      importSavePackage(JSON.parse(await file.text()), "選択したファイル");
    } catch (error) {
      setSaveTransferStatus(error?.message || "セーブを読み込めませんでした。", true);
    }
  }

  async function consumeSaveTransferHash() {
    if (!PUBLIC_STATIC_MODE || !SAVE_TRANSFER || !window.location.hash) return;
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const token = hashParams.get("save");
    const compressedToken = hashParams.get("savegz");
    if (!token && !compressedToken) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    try {
      const savePackage = compressedToken
        ? await SAVE_TRANSFER.decodeCompressedPackage(compressedToken)
        : SAVE_TRANSFER.decodePackage(token);
      importSavePackage(savePackage, "本人用引継ぎリンク");
    } catch (error) {
      setSaveTransferStatus(error?.message || "移行リンクを読み込めませんでした。", true);
    }
  }

  function applyQuestionBalance() {
    if (!window.TAKKEN_BALANCE?.rebalanceQuestions) return;
    const lockedIds = Object.entries(state.questionStats || {})
      .filter(([, stats]) => Number(stats?.attempts) > 0)
      .map(([id]) => id);
    const result = window.TAKKEN_BALANCE.rebalanceQuestions({
      questions: QUESTIONS,
      order: LEGACY_ORDER,
      choiceOrders: state.questionChoiceOrders,
      lockedIds,
      currentAnsweredId: state.answered?.id || null
    });
    Object.assign(QUESTIONS, result.questions);
    state.questionChoiceOrders = result.choiceOrders;
    state.questionBalanceAudit = result.audit;
    state.questionBalanceVersion = QUESTION_BALANCE_VERSION;
  }

  function setLogStatus(available, message) {
    logConnection.checked = true;
    logConnection.available = available;
    logConnection.message = message;
    if (!elements.logStatus) return;
    elements.logStatus.textContent = `Codexログ: ${message}`;
    elements.logStatus.classList.toggle("is-live", available);
  }

  function updateLogStatusText() {
    if (!elements.logStatus) return;
    elements.logStatus.textContent = `Codexログ: ${logConnection.message}`;
    elements.logStatus.classList.toggle("is-live", logConnection.available);
  }

  function loadEventOutbox() {
    try {
      const pending = JSON.parse(localStorage.getItem(EVENT_OUTBOX_ID) || "[]");
      return Array.isArray(pending) ? pending : [];
    } catch {
      return [];
    }
  }

  function saveEventOutbox(pending) {
    localStorage.setItem(EVENT_OUTBOX_ID, JSON.stringify(pending));
  }

  function createEventId() {
    return createOpaqueId("evt");
  }

  async function flushEventOutbox() {
    if (PUBLIC_STATIC_MODE || REVIEW_MODE || isFlushingEvents) return;
    let pending = loadEventOutbox();
    if (!pending.length) return;
    isFlushingEvents = true;
    try {
      while (pending.length) {
        const sending = pending[0];
        const response = await fetch("./api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sending),
          keepalive: true
        });
        if (!response.ok) throw new Error(`event log ${response.status}`);
        pending = loadEventOutbox().filter((event) => event.eventId !== sending.eventId);
        saveEventOutbox(pending);
      }
      setLogStatus(true, "保存済み");
    } catch {
      setLogStatus(false, `送信待ち${pending.length}件`);
    } finally {
      isFlushingEvents = false;
    }
  }

  async function checkStudyServer() {
    if (PUBLIC_STATIC_MODE) {
      setLogStatus(false, "この端末に保存");
      return;
    }
    if (REVIEW_MODE) {
      setLogStatus(false, "レビュー中・保存なし");
      return;
    }
    try {
      const response = await fetch("./api/health", { cache: "no-store" });
      if (!response.ok) {
        setLogStatus(false, "ブラウザ内のみ");
        return;
      }
      setLogStatus(true, "保存中");
      await flushEventOutbox();
    } catch {
      setLogStatus(false, "ブラウザ内のみ");
    }
  }

  function normalizeTodayQuestPayload(payload, source) {
    const sameDate = !payload?.date || payload.date === todayKey();
    const ids = sameDate && Array.isArray(payload?.ids)
      ? payload.ids.filter((id) => ORDER.includes(id) && QUESTIONS[id]).slice(0, DAILY_TARGET)
      : [];
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return {
      status: ids.length > 0 ? "ready" : "empty",
      date: payload?.date || todayKey(),
      questId: payload?.questId || "",
      ids,
      items,
      source,
      mode: ["mastery", "unit"].includes(payload?.mode) ? payload.mode : "coverage",
      scope: STUDY_SCOPE_IDS.has(payload?.scope) ? payload.scope : state.studyScope,
      target: Number(payload?.target) || DAILY_TARGET,
      message: ids.length > 0
        ? payload?.mode === "unit"
          ? `読後${ids.length}問: ${String(payload?.unitLabel || "").trim() || "選択単元"}`
          : `固定10問: ${studyScopeConfig(payload?.scope).shortLabel}・${
            source === "api"
              ? "自動生成"
              : source === "browser"
                ? (payload?.mode === "mastery" ? "定着" : "新規＋復習")
                : "前回生成"
          }`
        : "固定10問: 未生成"
    };
  }

  function masteryGroupId(id) {
    const sectionId = QUESTIONS[id]?.sectionId;
    return sectionId === "tax" || sectionId === "other" ? "taxOther" : sectionId;
  }

  function lastAnsweredTimestamp(id) {
    const stats = statsFor(id);
    return Date.parse(latestAt(stats.lastAnsweredAt, stats.centralLastAnsweredAt)) || 0;
  }

  function compareMasteryPriority(leftId, rightId) {
    const todayDiff = Number(answeredToday(leftId)) - Number(answeredToday(rightId));
    if (todayDiff !== 0) return todayDiff;
    const retainedDiff = Number(isRetained(leftId)) - Number(isRetained(rightId));
    if (retainedDiff !== 0) return retainedDiff;
    const weakDiff = weaknessScore(rightId) - weaknessScore(leftId);
    if (weakDiff !== 0) return weakDiff;
    const answeredDiff = lastAnsweredTimestamp(leftId) - lastAnsweredTimestamp(rightId);
    if (answeredDiff !== 0) return answeredDiff;
    const attemptDiff = effectiveAttempts(statsFor(leftId)) - effectiveAttempts(statsFor(rightId));
    if (attemptDiff !== 0) return attemptDiff;
    return STUDY_ORDER.indexOf(leftId) - STUDY_ORDER.indexOf(rightId);
  }

  function interleaveDailyPlan(newIds, reviewIds, fallbackIds) {
    const result = [];
    const reviewSlots = new Set(
      reviewIds.map((_, index) =>
        Math.max(0, Math.floor(((index + 1) * DAILY_TARGET) / (reviewIds.length + 1)) - 1)
      )
    );
    const fresh = [...newIds];
    const review = [...reviewIds];
    for (let index = 0; index < DAILY_TARGET; index += 1) {
      const preferReview = reviewSlots.has(index) && review.length > 0;
      const next = preferReview
        ? review.shift()
        : (fresh.shift() || review.shift());
      if (next && !result.includes(next)) result.push(next);
    }
    for (const id of fallbackIds) {
      if (result.length >= DAILY_TARGET) break;
      if (!result.includes(id)) result.push(id);
    }
    return result;
  }

  function focusedQuestPlan(scopeId = state.studyScope) {
    const newPool = scopeNewIds(scopeId).filter((id) => !isContacted(id));
    const reviewPool = scopeReviewIds(scopeId)
      .filter((id) => isContacted(id) && !answeredToday(id) && !isRetained(id))
      .sort(compareMasteryPriority);
    const maxReview = newPool.length >= 6 ? 4 : DAILY_TARGET;
    const selectedReview = reviewPool.slice(0, maxReview);
    const selectedNew = newPool.slice(0, DAILY_TARGET - selectedReview.length);
    const fallback = scopeReviewIds(scopeId)
      .filter((id) => !answeredToday(id))
      .sort(compareMasteryPriority);
    return {
      ids: interleaveDailyPlan(selectedNew, selectedReview, fallback),
      mode: newPool.length > 0 ? "coverage" : "mastery"
    };
  }

  function masteryQuestPlan() {
    const quotas = EXAM_BLUEPRINT?.masteryDailyQuotas || {
      rights: 3,
      restrictions: 2,
      business: 4,
      taxOther: 1
    };
    const pools = Object.fromEntries(
      Object.keys(quotas).map((groupId) => [
        groupId,
        CURRICULUM_ORDER
          .filter((id) => masteryGroupId(id) === groupId)
          .sort(compareMasteryPriority)
      ])
    );
    const layout = [
      "rights", "business", "restrictions", "business", "taxOther",
      "business", "rights", "business", "restrictions", "rights"
    ];
    const ids = layout
      .map((groupId) => pools[groupId]?.shift())
      .filter(Boolean);
    if (ids.length < DAILY_TARGET) {
      const remainder = CURRICULUM_ORDER
        .filter((id) => !ids.includes(id))
        .sort(compareMasteryPriority);
      ids.push(...remainder.slice(0, DAILY_TARGET - ids.length));
    }
    return ids.slice(0, DAILY_TARGET);
  }

  function publicTodayQuest() {
    const date = todayKey();
    const savedPlan = (
      state.daily.planVersion === STUDY_PLAN_VERSION &&
      state.daily.planScope === state.studyScope
    )
      ? state.daily.planIds.filter((id) => STUDY_ORDER.includes(id) && QUESTIONS[id])
      : [];
    const unitPlan = state.daily.planMode === "unit" &&
      Boolean(state.daily.planUnitId) &&
      savedPlan.length > 0;
    const focusedPlan = state.studyScope === "all" && remainingFirstPassCount() === 0
      ? { ids: masteryQuestPlan(), mode: "mastery" }
      : focusedQuestPlan(state.studyScope);
    const ids = unitPlan
      ? savedPlan
      : savedPlan.length === DAILY_TARGET
        ? savedPlan
        : [...focusedPlan.ids];
    const mode = unitPlan ? "unit" : focusedPlan.mode;
    const target = unitPlan ? ids.length : DAILY_TARGET;
    state.daily.planIds = ids.slice(0, DAILY_TARGET);
    state.daily.planVersion = STUDY_PLAN_VERSION;
    state.daily.planMode = mode;
    state.daily.planScope = state.studyScope;
    if (!unitPlan) state.daily.planUnitId = "";
    state.daily.target = target;
    saveState();
    const unit = TEXTBOOK_CHAPTERS.find((chapter) => chapter.id === state.daily.planUnitId);
    return normalizeTodayQuestPayload({
      date,
      questId: `public-${date}`,
      ids: state.daily.planIds,
      target,
      mode: state.daily.planMode,
      scope: state.studyScope,
      unitLabel: unit?.topicLabel || ""
    }, "browser");
  }

  async function fetchTodayQuestFromApi() {
    const response = await fetch("./api/today-quest", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`today quest api ${response.status}`);
    }
    return normalizeTodayQuestPayload(await response.json(), "api");
  }

  async function fetchTodayQuestFromStatic() {
    const response = await fetch("./study-state/today_quest.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`today quest static ${response.status}`);
    }
    return normalizeTodayQuestPayload(await response.json(), "static");
  }

  function applyTodayQuest(nextQuest) {
    Object.assign(todayQuest, nextQuest);
    if (todayQuest.status === "ready") {
      state.daily = normalizeDailyState({
        ...state.daily,
        target: todayQuest.target || DAILY_TARGET
      });
      saveState();
    }
    renderQuestPanel();
  }

  async function loadTodayQuest() {
    if (PUBLIC_STATIC_MODE) {
      const hasActiveDailyProgress = (state.daily.planIds || []).some(answeredToday) ||
        Number(state.daily.answers) > 0;
      if (
        !foundationCoverageComplete() &&
        !hasActiveDailyProgress &&
        !isChapterMode() &&
        !isMockMode() &&
        !isFirstPassMode()
      ) {
        const route = foundationLearningRoute();
        if (route.kind === "unit") prepareFoundationUnitPlan(route.snapshot.chapter);
      }
      applyTodayQuest(publicTodayQuest());
    } else {
      try {
        applyTodayQuest(await fetchTodayQuestFromApi());
      } catch {
        try {
          applyTodayQuest(await fetchTodayQuestFromStatic());
        } catch {
          Object.assign(todayQuest, {
            status: "offline",
            ids: [],
            items: [],
            source: "fallback",
            message: "固定10問: サーバー未接続"
          });
          renderQuestPanel();
        }
      }
    }

    const firstQuestId = nextDailyQuestId();
    if (
      firstQuestId &&
      !isFirstPassMode() &&
      !isChapterMode() &&
      !isMockMode() &&
      (TODAY_QUEST_PARAM || state.daily.answers === 0) &&
      !state.answered &&
      currentId() !== firstQuestId
    ) {
      goToQuestion(firstQuestId);
    }
  }

  async function syncCentralProgress() {
    if (PUBLIC_STATIC_MODE) return false;
    try {
      await fetch("./api/brief", { cache: "no-store" });
    } catch {
      // A previously generated snapshot can still be used while the brief API is offline.
    }
    try {
      const response = await fetch("./study-state/study_progress.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`progress snapshot ${response.status}`);
      const payload = await response.json();
      const perQuestion = payload?.perQuestion || {};
      const weakSet = new Set((payload?.weakIds || []).filter((id) => ORDER.includes(id)));
      const previousCentralMarked = { ...(state.centralMarked || {}) };

      ORDER.forEach((id) => {
        const central = perQuestion[id];
        if (central) {
          state.questionStats[id] = {
            ...statsFor(id),
            centralAttempts: Number(central.attempts) || 0,
            centralCorrect: Number(central.correct) || 0,
            centralWrong: Number(central.wrong) || 0,
            centralLastAnsweredAt: central.lastAnsweredAt || "",
            centralLastCorrectAt: central.lastCorrectAt || "",
            centralLastWrongAt: central.lastWrongAt || "",
            centralWeak: Boolean(central.weak)
          };
        }
        if (weakSet.has(id)) {
          if (!state.marked[id]) {
            state.marked[id] = true;
            state.autoMarked[id] = true;
          }
        } else if (previousCentralMarked[id] && state.autoMarked[id]) {
          delete state.marked[id];
          delete state.autoMarked[id];
        }
      });

      state.centralMarked = Object.fromEntries([...weakSet].map((id) => [id, true]));
      Object.entries(payload.questClaims || {}).forEach(([date, claims]) => {
        state.questRewardClaims[date] = [
          ...new Set([
            ...(state.questRewardClaims[date] || []),
            ...(Array.isArray(claims) ? claims : [])
          ])
        ];
      });
      state.centralProgress = {
        generatedAt: payload.generatedAt || "",
        sourceEvents: Number(payload.sourceEvents) || 0,
        lastEventAt: payload.lastEventAt || "",
        answers: Number(payload.answers) || 0,
        correct: Number(payload.correct) || 0,
        wrong: Number(payload.wrong) || 0
      };
      saveState();
      renderCurrentView();
      return true;
    } catch {
      return false;
    }
  }

  function checkDayRollover() {
    const currentDay = todayKey();
    if (currentDay === activeDayKey) return;
    activeDayKey = currentDay;
    state.daily = createDailyState();
    state.dailyFinishedDate = "";
    Object.assign(todayQuest, {
      status: "loading",
      date: currentDay,
      ids: [],
      items: [],
      source: "loading",
      message: "固定10問: 更新中"
    });
    saveState();
    renderQuestPanel();
    renderPassPlan();
    void loadTodayQuest();
  }

  function backupAgeLabel(value) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return "JSONバックアップ未作成";
    const elapsed = Math.max(0, Date.now() - timestamp);
    const days = Math.floor(elapsed / 86400000);
    if (days >= 1) return `JSONバックアップ${days}日前`;
    const hours = Math.floor(elapsed / 3600000);
    if (hours >= 1) return `JSONバックアップ${hours}時間前`;
    return "JSONバックアップ1時間以内";
  }

  async function refreshStorageEstimate() {
    if (storageEstimatePending || !navigator.storage?.estimate) return;
    storageEstimatePending = true;
    try {
      const estimate = await navigator.storage.estimate();
      const usage = Math.max(0, Number(estimate?.usage) || 0);
      const quota = Math.max(0, Number(estimate?.quota) || 0);
      storageEstimate = quota > 0
        ? { usage, quota, ratio: usage / quota }
        : null;
    } catch {
      storageEstimate = null;
    } finally {
      storageEstimateChecked = true;
      storageEstimatePending = false;
      renderSaveProtectionStatus();
    }
  }

  function renderSaveProtectionStatus() {
    if (!elements.saveProtectionStatus) return;
    const previous = SAVE_STORE?.getPrevious(localStorage, STORAGE_ID);
    const canRestore = Boolean(previous);
    if (elements.saveRestorePreviousButton) {
      elements.saveRestorePreviousButton.disabled = !canRestore;
    }
    const quotaText = storageEstimate
      ? `・保存領域${Math.round(storageEstimate.ratio * 100)}%`
      : "";
    elements.saveProtectionStatus.textContent = lastSaveError
      ? lastSaveError
      : `自動保護：保存形式v${STATE_SCHEMA_VERSION}・` +
        `${canRestore ? "直前セーブあり" : "初回スナップショット待ち"}・` +
        `${backupAgeLabel(state.saveMeta?.lastExportedAt)}${quotaText}`;
    elements.saveProtectionStatus.classList.toggle(
      "is-warning",
      Boolean(lastSaveError || (storageEstimate && storageEstimate.ratio >= 0.8))
    );
    if (!storageEstimateChecked && !storageEstimatePending) {
      void refreshStorageEstimate();
    }
  }

  function restorePreviousSave() {
    try {
      if (!SAVE_STORE) throw new Error("直前セーブの復元機能を読み込めませんでした。");
      const previous = SAVE_STORE.getPrevious(localStorage, STORAGE_ID);
      if (!previous) throw new Error("戻せる直前セーブがありません。");
      const summary = savePackageSummary({
        format: SAVE_TRANSFER.SAVE_FORMAT,
        state: previous
      });
      const confirmed = window.confirm(
        `直前セーブ（${summary}）へ戻します。\n` +
        "現在の状態も復元前バックアップへ残します。"
      );
      if (!confirmed) {
        setSaveTransferStatus("直前セーブへの復元をキャンセルしました。");
        return;
      }
      const preservedExposure = normalizeOfficialExamExposure(state.officialExamExposure);
      const previousState = cloneStateForSync(state);
      SAVE_STORE.backupCurrent(
        localStorage,
        STORAGE_ID,
        SAVE_STORE.BEFORE_RESTORE_SUFFIX,
        Date.now()
      );
      state = normalizeState(previous);
      state.officialExamExposure = mergeOfficialExamExposureLedgers(
        preservedExposure,
        state.officialExamExposure
      );
      applyQuestionBalance();
      if (!saveState({
        replace: true,
        preserveExposure: true,
        skipPreviousRotation: false
      })) {
        state = previousState;
        applyQuestionBalance();
        throw new Error("復元後のセーブ確認に失敗しました。現在の状態は維持しています。");
      }
      render();
      setSaveTransferStatus(`直前セーブへ復元しました: ${summary}`);
    } catch (error) {
      setSaveTransferStatus(error?.message || "直前セーブの復元に失敗しました。", true);
    }
  }

  function logStudyEvent(kind, payload = {}) {
    if (PUBLIC_STATIC_MODE) {
      setLogStatus(false, "この端末に保存");
      return;
    }
    if (REVIEW_MODE) {
      setLogStatus(false, "レビュー中・保存なし");
      return;
    }
    const event = {
      eventId: createEventId(),
      kind,
      appAt: new Date().toISOString(),
      sessionId: state.sessionId,
      step: state.step || 0,
      currentId: currentId(),
      url: window.location.href,
      payload
    };
    const pending = loadEventOutbox();
    pending.push(event);
    saveEventOutbox(pending);
    setLogStatus(logConnection.available, `送信待ち${pending.length}件`);
    void flushEventOutbox();
  }

  async function requestCodexBrief() {
    if (!elements.codexBriefButton) return;
    if (PUBLIC_STATIC_MODE) {
      elements.codexBriefButton.textContent = "公開版は端末保存";
      setLogStatus(false, "この端末に保存");
      return;
    }
    elements.codexBriefButton.disabled = true;
    elements.codexBriefButton.textContent = "診断中";
    try {
      const response = await fetch("./api/brief", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`brief api ${response.status}`);
      }
      const data = await response.json();
      const summary = data.summary || {};
      const weakCount = Array.isArray(summary.weakTopics) ? summary.weakTopics.length : 0;
      try {
        applyTodayQuest(await fetchTodayQuestFromApi());
      } catch {
        // The weakness brief is still useful when the quest endpoint is offline.
      }
      elements.codexBriefButton.textContent = summary.answers
        ? `診断+10問 ${summary.wrong}/${summary.answers}`
        : "ログなし";
      if (elements.codexBriefLink) {
        elements.codexBriefLink.hidden = false;
        elements.codexBriefLink.href = data.reportUrl || "./study-state/codex-weakness-brief.md";
      }
      if (summary.answers) {
        elements.coachTitle.textContent = weakCount ? "Codex診断を生成" : "Codex診断: 弱点少なめ";
        elements.coachText.textContent = `解答${summary.answers}問、誤答${summary.wrong}問。ブリーフを開けば、Codexが追加問題を作る材料になる。`;
      } else {
        elements.coachTitle.textContent = "Codex診断: ログなし";
        elements.coachText.textContent = "まず数問解く。誤答・選択肢・ひっかけが保存されると診断できる。";
      }
      setLogStatus(!REVIEW_MODE, REVIEW_MODE ? "レビュー中・診断のみ" : "保存中");
    } catch {
      elements.codexBriefButton.textContent = "診断不可";
      setLogStatus(false, "サーバー未接続");
    } finally {
      window.setTimeout(() => {
        elements.codexBriefButton.disabled = false;
        if (elements.codexBriefButton.textContent === "診断中") {
          elements.codexBriefButton.textContent = "Codex診断";
        }
      }, 450);
    }
  }

  function currentId() {
    return ORDER[state.index];
  }

  function questionPositionText(id) {
    const curriculumIndex = CURRICULUM_ORDER.indexOf(id);
    if (curriculumIndex >= 0) {
      return `${curriculumIndex + 1}/${CURRICULUM_ORDER.length}`;
    }
    const supplementalIndex = SUPPLEMENTAL_ORDER.indexOf(id);
    if (supplementalIndex >= 0) {
      const part = idToChapter.get(id)?.textbookPart;
      const partIds = SUPPLEMENTAL_ORDER.filter((candidate) =>
        idToChapter.get(candidate)?.textbookPart === part
      );
      return part
        ? `第${part}分冊補助${partIds.indexOf(id) + 1}/${partIds.length}`
        : `補助${supplementalIndex + 1}/${SUPPLEMENTAL_ORDER.length}`;
    }
    const legacyIndex = LEGACY_ORDER.indexOf(id);
    return legacyIndex >= 0 ? `旧業法${legacyIndex + 1}/${LEGACY_ORDER.length}` : "補助問題";
  }

  function currentQuestion() {
    const id = currentId();
    const question = QUESTIONS[id];
    if (!question) {
      throw new Error(`Question not found: ${id}`);
    }
    return { id, ...question, chapter: idToChapter.get(id) };
  }

  function chapterPosition(question) {
    const chapterIds = question.chapter?.ids || [question.id];
    const localIndex = Math.max(0, chapterIds.indexOf(question.id));
    const sectorStart = Math.floor(localIndex / 10) * 10;
    const sectorIds = chapterIds.slice(sectorStart, sectorStart + 10);
    return {
      chapterIds,
      localIndex,
      sectorStart,
      sectorIds,
      sectorNumber: Math.floor(localIndex / 10) + 1,
      bossId: sectorIds[sectorIds.length - 1]
    };
  }

  function enemyProfileFor(question) {
    const position = chapterPosition(question);
    const isBoss = question.id === position.bossId;
    if (isBoss) {
      return { kind: "boss", isBoss, ...BATTLE_PROFILES.boss };
    }
    const corpus = [question.text, question.tag, question.format, question.trap]
      .filter(Boolean)
      .join(" ");
    if (/広告|標識|案内所|重要事項説明|35条|説明義務/.test(corpus)) {
      return { kind: "gargoyle", isBoss, ...BATTLE_PROFILES.gargoyle };
    }
    if (/報酬|手付金等|営業保証金|保証協会|供託|還付|金額/.test(corpus)) {
      return { kind: "tortoise", isBoss, ...BATTLE_PROFILES.tortoise };
    }
    if (/登録|名簿|登載|変更の登録|変更届|免許換え|宅建士/.test(corpus)) {
      return { kind: "sphinx", isBoss, ...BATTLE_PROFILES.sphinx };
    }
    if (/期限|期間|満了|更新|経過|遅滞|日以内|月以内|年以内|週間/.test(corpus)) {
      return { kind: "clock", isBoss, ...BATTLE_PROFILES.clock };
    }
    if (/個数|いくつ|組合せ|組み合わせ/.test(corpus)) {
      return { kind: "mimic", isBoss, ...BATTLE_PROFILES.mimic };
    }
    if (stableVariant(question.id, 3) === 1) {
      return { kind: "sphinx", isBoss, ...BATTLE_PROFILES.sphinx };
    }
    return { kind: "sentinel", isBoss, ...BATTLE_PROFILES.sentinel };
  }

  function renderCampaignRoute(question) {
    if (!elements.campaignRoute) return;
    const position = chapterPosition(question);
    elements.routeSectorLabel.textContent = `${question.chapter?.label || "宅建全分野"} / 区画${position.sectorNumber}`;
    elements.campaignRoute.replaceChildren();
    position.sectorIds.forEach((id, offset) => {
      const stats = statsFor(id);
      const routeQuestion = QUESTIONS[id];
      const isCurrent = id === question.id;
      const isBoss = id === position.bossId;
      const node = document.createElement("button");
      node.type = "button";
      node.className = "route-node";
      node.classList.toggle("is-current", isCurrent);
      node.classList.toggle("is-cleared", (stats.correct || 0) > 0);
      node.classList.toggle("is-failed", (stats.wrong || 0) > 0 && !(stats.correct || 0));
      node.classList.toggle("is-weak", Boolean(state.marked[id]));
      node.classList.toggle("is-boss", isBoss);
      node.textContent = isBoss ? "B" : String(position.sectorStart + offset + 1);
      node.title = `${routeQuestion?.tag || "宅建業法"}${isBoss ? " / 区画ボス" : ""}`;
      node.setAttribute("aria-label", `${position.sectorStart + offset + 1}問目${isBoss ? " 区画ボス" : ""}${isCurrent ? " 現在地" : ""}`);
      node.disabled = isCurrent;
      if (!isCurrent) {
        node.addEventListener("click", () => goToQuestion(id));
      }
      elements.campaignRoute.append(node);
    });
  }

  function attackTierFor(streak, overdrive) {
    if (overdrive || streak >= 5) return 3;
    if (streak >= 3) return 2;
    return 1;
  }

  function stableVariant(value, modulo) {
    return [...String(value)].reduce((total, char) => total + char.charCodeAt(0), 0) % modulo;
  }

  function xpNeededForLevel(level) {
    return 260 + Math.max(0, level - 1) * 90;
  }

  function progressionForXp(totalXp) {
    let level = 1;
    let spentXp = 0;
    let needed = xpNeededForLevel(level);
    while (level < 99 && totalXp - spentXp >= needed) {
      spentXp += needed;
      level += 1;
      needed = xpNeededForLevel(level);
    }
    return {
      level,
      currentXp: Math.max(0, totalXp - spentXp),
      needed,
      fill: Math.min(100, Math.max(0, ((totalXp - spentXp) / needed) * 100))
    };
  }

  function titleForLevel(level) {
    return PLAYER_RANKS.reduce(
      (title, rank) => level >= rank.level ? rank.title : title,
      PLAYER_RANKS[0].title
    );
  }

  function rankBonusForLevels(previousLevel, nextLevel) {
    const unlocked = PLAYER_RANKS.filter((rank) => rank.level > previousLevel && rank.level <= nextLevel);
    return unlocked.length * REWARD_SYSTEM.BATTLE_REWARDS.titleUnlock.crystals;
  }

  function renderProgression() {
    const progression = progressionForXp(state.totalXp);
    const title = titleForLevel(progression.level);
    const days = Object.keys(state.adventureDays || {}).length;
    const nextChest = 5 - state.chestProgress;
    const projectedTier = REWARD_SYSTEM.projectedChestTier(state.chestQuality, state.chestProgress);
    elements.playerLevelText.textContent = `Lv.${progression.level} ${title}`;
    elements.playerTitleText.textContent = title;
    elements.fieldLevelText.textContent = `Lv.${progression.level}`;
    elements.xpText.textContent = `${progression.currentXp.toLocaleString("ja-JP")} / ${progression.needed.toLocaleString("ja-JP")} EXP`;
    elements.xpFill.style.width = `${progression.fill}%`;
    elements.chestText.textContent = nextChest === 1
      ? `次の撃破で${projectedTier.label}宝箱`
      : `${projectedTier.label}宝箱まで ${nextChest}体`;
    elements.chestText.dataset.tier = projectedTier.id;
    elements.adventureDaysText.textContent = `冒険${Math.max(1, days)}日目`;
    elements.battleField.dataset.armoryRank = String(state.armoryRank || 0);
    elements.chestPips.replaceChildren();
    for (let index = 0; index < 5; index += 1) {
      const pip = document.createElement("span");
      pip.className = "chest-pip";
      pip.classList.toggle("is-filled", index < state.chestProgress);
      pip.classList.toggle(`is-${projectedTier.id}`, index < state.chestProgress);
      elements.chestPips.append(pip);
    }
    renderLootCollection();
    renderArmory();
  }

  function renderLootCollection() {
    const ownedTypes = LOOT_ORDER.filter((item) => (state.loot[item.key] || 0) > 0).length;
    elements.lootSummary.textContent = `${ownedTypes}種 / 宝箱${state.chestsOpened}個`;
    elements.lootCollection.replaceChildren();
    [...LOOT_ORDER]
      .sort((left, right) => (state.loot[right.key] || 0) - (state.loot[left.key] || 0))
      .forEach((item) => {
        const count = state.loot[item.key] || 0;
        const row = document.createElement("div");
        row.className = "loot-item";
        row.classList.toggle("is-owned", count > 0);
        row.innerHTML = `<i style="--loot-color:${item.color}"></i><span>${count > 0 ? item.name : "未発見"}</span><strong>${count > 0 ? `x${count}` : "---"}</strong>`;
        elements.lootCollection.append(row);
      });
  }

  function renderArmory() {
    if (!elements.armoryName || !elements.armoryProgress || !elements.armoryButton) return;
    const current = REWARD_SYSTEM.ARMORY_RANKS[state.armoryRank] || REWARD_SYSTEM.ARMORY_RANKS[0];
    const next = REWARD_SYSTEM.nextArmoryRank(state.armoryRank);
    const days = Object.keys(state.adventureDays || {}).length;
    const nextDay = CONTINUITY_MILESTONES.find((day) => day > days);
    elements.armoryName.textContent = current.label;
    elements.armoryProgress.textContent = next
      ? `次 ${next.label} / ${next.cost.toLocaleString("ja-JP")}C`
      : "最終段階 COMPLETE";
    elements.armoryButton.hidden = !next;
    elements.armoryButton.disabled = !next || state.crystals < next.cost;
    elements.armoryButton.textContent = next
      ? (state.crystals >= next.cost ? `${next.cost.toLocaleString("ja-JP")}Cで鍛造` : `あと${(next.cost - state.crystals).toLocaleString("ja-JP")}C`)
      : "完成";
    if (elements.continuityText) {
      elements.continuityText.textContent = nextDay
        ? `継続 ${days}日 / 次の勲章 ${nextDay}日`
        : `継続 ${days}日 / 30日勲章達成`;
    }
  }

  function forgeNextArmoryRank() {
    const next = REWARD_SYSTEM.nextArmoryRank(state.armoryRank);
    if (!next || state.crystals < next.cost) return;
    if (!window.confirm(`${next.label}を${next.cost.toLocaleString("ja-JP")}知識Cで鍛造する？`)) return;
    state.crystals -= next.cost;
    state.crystalSpent = Math.max(0, Number(state.crystalSpent) || 0) + next.cost;
    state.armoryRank = next.rank;
    saveState();
    logStudyEvent("armory-forge", {
      rank: next.rank,
      label: next.label,
      cost: next.cost,
      crystals: state.crystals
    });
    render();
    elements.battleAnnouncement.textContent = `${next.label}完成。攻撃演出が強化された。`;
    elements.battleField.classList.add("is-forged");
    window.setTimeout(() => elements.battleField.classList.remove("is-forged"), 1000);
  }

  function isChapterEnd(index = state.index) {
    const id = ORDER[index];
    const chapter = idToChapter.get(id);
    return Boolean(chapter && chapter.ids[chapter.ids.length - 1] === id);
  }

  function statsFor(id) {
    return state.questionStats[id] || { attempts: 0, correct: 0, wrong: 0, lastStep: 0 };
  }

  function effectiveAttempts(stats) {
    return Math.max(Number(stats?.attempts) || 0, Number(stats?.centralAttempts) || 0);
  }

  function effectiveCorrectCount(stats) {
    return Math.max(Number(stats?.correct) || 0, Number(stats?.centralCorrect) || 0);
  }

  function effectiveWrongCount(stats) {
    return Math.max(Number(stats?.wrong) || 0, Number(stats?.centralWrong) || 0);
  }

  function studyScopeConfig(scopeId = state.studyScope) {
    return STUDY_SCOPES.find((scope) => scope.id === scopeId) || STUDY_SCOPES[0];
  }

  function studyScopeIdForChapter(chapter) {
    const sectionIds = chapter?.sectionIds || [chapter?.sectionId];
    if (sectionIds.includes("business")) return "business";
    if (sectionIds.includes("rights")) return "rights";
    return "law-other";
  }

  function curriculumIdsForSections(sectionIds) {
    const allowed = new Set(sectionIds);
    return CURRICULUM_ORDER.filter((id) => allowed.has(QUESTIONS[id]?.sectionId));
  }

  function textbookIdsForSections(sectionIds) {
    const allowed = new Set(sectionIds);
    return [...new Set(
      TEXTBOOK_CHAPTERS
        .filter((chapter) => chapter.sectionIds.some((id) => allowed.has(id)))
        .flatMap((chapter) => chapter.ids)
    )];
  }

  function scopeNewIds(scopeId = state.studyScope) {
    const scope = studyScopeConfig(scopeId);
    if (scopeId === "rights") {
      const textbookIds = textbookIdsForSections(scope.newSections);
      if (textbookIds.length) return textbookIds;
    }
    return curriculumIdsForSections(scope.newSections);
  }

  function scopeReviewIds(scopeId = state.studyScope) {
    const scope = studyScopeConfig(scopeId);
    const textbookIds = textbookIdsForSections(scope.reviewSections);
    const coreIds = curriculumIdsForSections(scope.reviewSections);
    return [
      ...coreIds,
      ...textbookIds.filter((id) => !coreIds.includes(id) && isContacted(id))
    ];
  }

  function isRetained(id) {
    const stats = statsFor(id);
    if (normalizedComprehensionDayKeys(stats).length < 2) return false;
    if (weaknessScore(id) > 0) return false;
    const lastCorrectAt = Date.parse(latestAt(stats.lastCorrectAt, stats.centralLastCorrectAt)) || 0;
    const lastWrongAt = Date.parse(latestAt(stats.lastWrongAt, stats.centralLastWrongAt)) || 0;
    if (lastWrongAt >= lastCorrectAt) return false;
    if (
      (stats.lastConfidence === "unsure" || stats.lastConfidence === "cuts") &&
      (Date.parse(stats.lastConfidenceAt || "") || 0) >= lastCorrectAt
    ) {
      return false;
    }
    return true;
  }

  function retainedCount(ids = CURRICULUM_ORDER) {
    return ids.filter(isRetained).length;
  }

  function scopeProgress(scopeId = state.studyScope) {
    const scope = studyScopeConfig(scopeId);
    const newIds = scopeNewIds(scope.id);
    const reviewIds = scopeReviewIds(scope.id);
    return {
      scope,
      ids: newIds,
      reviewIds,
      contacted: newIds.filter(isContacted).length,
      retained: retainedCount(newIds),
      total: newIds.length,
      due: reviewIds.filter((id) => isContacted(id) && !answeredToday(id) && !isRetained(id)).length
    };
  }

  function practicalQuestionsForUnit(unitId) {
    return PRACTICAL_QUESTIONS.filter((question) => question.unitId === unitId);
  }

  function foundationUnitBatchIds(chapter) {
    const chapterIds = chapter?.ids || [];
    const activeIds = state.daily?.planMode === "unit" &&
      state.daily?.planUnitId === chapter?.id
      ? (state.daily.planIds || []).filter((id) => chapterIds.includes(id))
      : [];
    if (activeIds.some((id) => !isContacted(id))) return activeIds;

    const uncontacted = chapterIds.filter((id) => !isContacted(id));
    const due = chapterIds.filter((id) =>
      isContacted(id) && !answeredToday(id) && !isRetained(id)
    );
    const candidates = uncontacted.length ? uncontacted : due.length ? due : chapterIds;
    if (candidates.length <= FOUNDATION_UNIT_BATCH_MAX) return candidates;
    const size = candidates.length % FOUNDATION_UNIT_BATCH_MAX === 1
      ? FOUNDATION_UNIT_BATCH_MAX - 1
      : FOUNDATION_UNIT_BATCH_MAX;
    return candidates.slice(0, size);
  }

  function unitLearningSnapshot(chapter) {
    const baseIds = chapter?.ids || [];
    const practicalItems = practicalQuestionsForUnit(chapter?.id);
    const baseContacted = baseIds.filter(isContacted).length;
    const baseRetained = baseIds.filter(isRetained).length;
    const practicalContacted = practicalItems.filter((question) =>
      (state.practicalDrill?.history?.[question.id]?.attempts || 0) > 0
    ).length;
    const practicalGrounded = practicalItems.filter((question) =>
      state.practicalDrill?.history?.[question.id]?.lastConfidence === "confident"
    ).length;
    const stage = baseContacted < baseIds.length
      ? "input"
      : baseRetained < baseIds.length
        ? "retention"
        : "complete";
    return {
      chapter,
      baseIds,
      baseContacted,
      baseRetained,
      practicalItems,
      practicalContacted,
      practicalGrounded,
      stage
    };
  }

  function textbookChaptersForScope(scopeId = state.studyScope) {
    if (scopeId === "all") return [...TEXTBOOK_CHAPTERS];
    return TEXTBOOK_CHAPTERS.filter((chapter) =>
      studyScopeIdForChapter(chapter) === scopeId
    );
  }

  function foundationProgress() {
    const snapshots = TEXTBOOK_CHAPTERS.map(unitLearningSnapshot);
    return {
      snapshots,
      completedUnits: snapshots.filter((item) => item.baseContacted === item.baseIds.length).length,
      retainedUnits: snapshots.filter((item) => item.baseRetained === item.baseIds.length).length,
      contactedQuestions: TEXTBOOK_IDS.filter(isContacted).length,
      retainedQuestions: retainedCount(TEXTBOOK_IDS),
      practicalContacted: PRACTICAL_QUESTION_IDS.filter((id) =>
        (state.practicalDrill?.history?.[id]?.attempts || 0) > 0
      ).length,
      practicalGrounded: PRACTICAL_QUESTION_IDS.filter((id) =>
        state.practicalDrill?.history?.[id]?.lastConfidence === "confident"
      ).length
    };
  }

  function foundationCoverageComplete() {
    return TEXTBOOK_CHAPTERS.length > 0 &&
      TEXTBOOK_CHAPTERS.every((chapter) => chapter.ids.every(isContacted));
  }

  function selectedFoundationChapter(scopeId = state.studyScope) {
    const scoped = textbookChaptersForScope(scopeId);
    const explicit = scoped.find((chapter) => chapter.id === selectedTextbookChapterId);
    if (explicit) return explicit;
    const currentChapter = idToChapter.get(currentId());
    return scoped.find((chapter) => chapter.id === currentChapter?.id) || null;
  }

  function nextFoundationScope(scopeId = state.studyScope) {
    const order = ["business", "rights", "law-other"];
    const currentIndex = order.indexOf(scopeId);
    return currentIndex >= 0 && currentIndex + 1 < order.length
      ? studyScopeConfig(order[currentIndex + 1])
      : null;
  }

  function foundationLearningRoute(scopeId = state.studyScope) {
    const chapters = textbookChaptersForScope(scopeId);
    const selected = selectedFoundationChapter(scopeId);
    const selectedSnapshot = selected ? unitLearningSnapshot(selected) : null;
    if (selectedSnapshot?.baseContacted < selectedSnapshot?.baseIds.length) {
      return { kind: "unit", snapshot: selectedSnapshot };
    }

    // 基礎一周中は同じ単元の実践4/4を通行証にしない。
    // 読後問題が終わったら次の未接触単元へ進み、実践は別メニューで混ぜる。
    const nextInput = chapters.map(unitLearningSnapshot)
      .find((item) => item.baseContacted < item.baseIds.length);
    if (nextInput) return { kind: "unit", snapshot: nextInput };

    const dueIds = scopeReviewIds(scopeId).filter((id) =>
      isContacted(id) && !answeredToday(id) && !isRetained(id)
    );
    if (dueIds.length) return { kind: "review", dueIds };

    const nextScope = nextFoundationScope(scopeId);
    if (nextScope && !foundationCoverageComplete()) {
      return { kind: "scope", nextScope };
    }
    return { kind: foundationCoverageComplete() ? "official" : "review", dueIds: [] };
  }

  function hasNewerLocalAnswer(stats) {
    const localAt = Date.parse(stats?.lastAnsweredAt || "");
    if (!Number.isFinite(localAt)) return false;
    const centralAt = Date.parse(stats?.centralLastAnsweredAt || "");
    return !Number.isFinite(centralAt) || localAt > centralAt;
  }

  function latestAt(...values) {
    return values
      .filter(Boolean)
      .sort((left, right) => (Date.parse(right) || 0) - (Date.parse(left) || 0))[0] || "";
  }

  function isFirstPassMode() {
    return state.runMode === RUN_MODE_FIRST_PASS;
  }

  function chapterModeChapter() {
    if (state.runMode !== RUN_MODE_CHAPTER) return null;
    return CHAPTERS.find((chapter) => chapter.id === state.chapterModeId) || null;
  }

  function isChapterMode() {
    return Boolean(chapterModeChapter());
  }

  function activeDisplayScopeConfig() {
    const chapter = chapterModeChapter();
    return chapter
      ? studyScopeConfig(studyScopeIdForChapter(chapter))
      : studyScopeConfig();
  }

  function nextChapterModeId() {
    const chapter = chapterModeChapter();
    if (!chapter) return null;
    const localIndex = chapter.ids.indexOf(currentId());
    return localIndex >= 0 ? chapter.ids[localIndex + 1] || null : chapter.ids[0] || null;
  }

  function isMockMode() {
    return state.runMode === RUN_MODE_MOCK && Boolean(mockFormById(state.mock?.formId));
  }

  function activeLearningSession() {
    if (state.officialExamSession) return { kind: "official", label: "計測中の公式50問" };
    if (isMockMode() && !state.mock?.finalized) return { kind: "mock", label: "進行中の50問模試" };
    if (["active", "retry"].includes(state.practicalDrill?.stage)) {
      return {
        kind: "practical",
        label: state.practicalDrill.bankId === BUSINESS_FULLSCORE_BANK_ID
          ? state.practicalDrill.planMode === "knock"
            ? "進行中の業法ノック"
            : "進行中の満点変形セット"
          : "進行中の実践セット"
      };
    }
    return null;
  }

  function resumeActiveLearningSession() {
    const active = activeLearningSession();
    if (!active) return false;
    setTodayCommandStatus(`${active.label}を保存状態から再開します。終了後に次のセットへ進めます。`);
    if (active.kind === "official") {
      if (elements.passPlanPanel) elements.passPlanPanel.open = true;
      renderPassPlan();
      window.requestAnimationFrame(() =>
        elements.officialExamSessionForm?.scrollIntoView({ block: "start", behavior: "smooth" })
      );
    } else if (active.kind === "mock") {
      render();
      window.requestAnimationFrame(() =>
        elements.quizCard?.scrollIntoView({ block: "start", behavior: "smooth" })
      );
    } else {
      if (elements.practicalDrillPanel) elements.practicalDrillPanel.open = true;
      renderPracticalDrill();
      window.requestAnimationFrame(() =>
        elements.practicalDrillPanel?.scrollIntoView({ block: "start", behavior: "smooth" })
      );
    }
    return true;
  }

  function currentMockForm() {
    return isMockMode() ? mockFormById(state.mock.formId) : null;
  }

  function mockFormShortLabel(form = currentMockForm()) {
    if (!form) return "模試";
    return form.id === "form-a" ? "フォームA" : "フォームB";
  }

  function mockQuestionIds() {
    return currentMockForm()?.ids || [];
  }

  function mockAnsweredCount() {
    return Math.min(mockQuestionIds().length, state.mock?.results?.length || 0);
  }

  function mockElapsedMs() {
    if (state.mock?.finalized) return Math.max(0, Number(state.mock.elapsedMs) || 0);
    const startedAt = Date.parse(state.mock?.startedAt || "");
    return Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : 0;
  }

  function formatElapsed(ms) {
    const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function mockTimeText() {
    const delta = MOCK_DURATION_MS - mockElapsedMs();
    return delta >= 0
      ? formatTimer(delta)
      : `超過 +${formatElapsed(Math.abs(delta))}`;
  }

  function mockSectionScores(results = state.mock?.results || []) {
    return Object.fromEntries((EXAM_BLUEPRINT?.sections || []).map((section) => {
      const sectionResults = results.filter((result) => result.sectionId === section.id);
      return [
        section.id,
        {
          label: section.label,
          correct: sectionResults.filter((result) => result.correct).length,
          total: section.examQuestions
        }
      ];
    }));
  }

  function mockStrategyRows(sectionScores = mockSectionScores()) {
    const scoreFor = (sectionId) => Math.max(0, Number(sectionScores?.[sectionId]?.correct) || 0);
    return [
      {
        id: "rights",
        label: "権利関係",
        correct: scoreFor("rights"),
        total: 14,
        target: STUDY_TARGETS.rights
      },
      {
        id: "restrictions",
        label: "法令上の制限",
        correct: scoreFor("restrictions"),
        total: 8,
        target: STUDY_TARGETS.restrictions
      },
      {
        id: "business",
        label: "宅建業法",
        correct: scoreFor("business"),
        total: 20,
        target: STUDY_TARGETS.business
      },
      {
        id: "tax-other",
        label: "税・その他",
        correct: scoreFor("tax") + scoreFor("other"),
        total: 8,
        target: STUDY_TARGETS.taxOther
      }
    ].map((row) => ({
      ...row,
      deficit: Math.max(0, row.target - row.correct)
    }));
  }

  function mockPriorityRow(sectionScores) {
    return mockStrategyRows(sectionScores)
      .filter((row) => row.deficit > 0)
      .sort((left, right) =>
        right.deficit - left.deficit ||
        right.target - left.target ||
        left.label.localeCompare(right.label, "ja")
      )[0] || null;
  }

  function latestMockAttempt() {
    return [...(state.mockHistory || [])]
      .filter((item) => mockFormById(item.formId))
      .sort((left, right) =>
        (Date.parse(right.completedAt) || 0) - (Date.parse(left.completedAt) || 0)
      )[0] || null;
  }

  function latestOfficialExam() {
    return officialReadinessStats().qualifying.at(-1) || null;
  }

  function daysBetween(left, right) {
    const leftTime = Date.parse(left);
    const rightTime = Date.parse(right);
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return -1;
    return Math.floor((rightTime - leftTime) / 86400000);
  }

  function officialAttemptQualifies(item, history = state.officialExamHistory || []) {
    const evidenceVersion = Number(item?.evidenceVersion) || 0;
    const evidenceBasisValid = evidenceVersion >= OFFICIAL_EXAM_EVIDENCE_VERSION
      ? item?.scoringBasis === OFFICIAL_HISTORICAL_SCORING_BASIS
      : evidenceVersion >= OFFICIAL_EXAM_LEGACY_EVIDENCE_VERSION &&
        item?.lawChecked === true && item?.lawBaseline === CURRENT_LAW_BASELINE;
    if (
      !officialExamDefinition(item?.examId) ||
      item?.legacySessionAmbiguous ||
      item?.sourceMode !== "timed-answer-sheet" ||
      !item?.timed120 ||
      !evidenceBasisValid ||
      Number(item?.elapsedMinutes) > MOCK_DURATION_MINUTES ||
      Object.keys(item?.answers || {}).length !== 50
    ) {
      return false;
    }
    if (item.attemptType !== "retest") return item.attemptType === "initial";
    const initial = history
      .filter((candidate) =>
        candidate.examId === item.examId &&
        candidate.attemptType === "initial" &&
        candidate.sourceMode === "timed-answer-sheet" &&
        Number(candidate.evidenceVersion) >= OFFICIAL_EXAM_LEGACY_EVIDENCE_VERSION &&
        candidate.timed120 &&
        Object.keys(candidate.answers || {}).length === 50 &&
        Date.parse(candidate.completedAt) < Date.parse(item.completedAt)
      )
      .sort((left, right) =>
        (Date.parse(right.completedAt) || 0) - (Date.parse(left.completedAt) || 0)
      )[0];
    return Boolean(
      initial &&
      daysBetween(initial.completedAt, item.completedAt) >= OFFICIAL_RETEST_WAIT_DAYS
    );
  }

  function officialReadinessStats() {
    const history = [...(state.officialExamHistory || [])]
      .sort((left, right) =>
        (Date.parse(left.completedAt) || 0) - (Date.parse(right.completedAt) || 0)
      );
    const qualifying = history.filter((item) =>
      officialAttemptQualifies(item, history)
    );
    const initial = qualifying.filter((item) => item.attemptType === "initial");
    const retests = qualifying.filter((item) => item.attemptType === "retest");
    const latestThree = qualifying.slice(-3);
    const mean = latestThree.length
      ? latestThree.reduce((sum, item) => sum + item.score, 0) / latestThree.length
      : 0;
    const minimum = latestThree.length
      ? Math.min(...latestThree.map((item) => item.score))
      : 0;
    const stability = latestThree.length < 3
      ? "測定中"
      : mean >= 40 && minimum >= 37
        ? "安定40"
        : mean >= 37 && minimum >= 35
          ? "合格域"
          : "測定中";
    return {
      history,
      qualifying,
      initial,
      retests,
      latestThree,
      mean,
      minimum,
      stability
    };
  }

  function officialInitialAttempt(examId) {
    return [...(state.officialExamHistory || [])]
      .filter((item) =>
        item.examId === examId &&
        item.attemptType === "initial" &&
        officialAttemptQualifies(item)
      )
      .sort((left, right) =>
        (Date.parse(right.completedAt) || 0) - (Date.parse(left.completedAt) || 0)
      )[0] || null;
  }

  function officialRetestEligibility(examId, at = new Date()) {
    const initial = officialInitialAttempt(examId);
    if (!initial) return { eligible: false, reason: "初見測定が未完了", initial: null };
    const existing = (state.officialExamHistory || []).some((item) =>
      item.examId === examId &&
      item.attemptType === "retest" &&
      item.sourceMode === "timed-answer-sheet"
    );
    if (existing) return { eligible: false, reason: "再試験済み", initial };
    const elapsedDays = daysBetween(initial.completedAt, at.toISOString());
    if (elapsedDays < OFFICIAL_RETEST_WAIT_DAYS) {
      return {
        eligible: false,
        reason: `あと${OFFICIAL_RETEST_WAIT_DAYS - Math.max(0, elapsedDays)}日`,
        initial
      };
    }
    return { eligible: true, reason: "再試験可", initial };
  }

  function missionForDate(date = todayKey()) {
    return normalizeMissionEntry(state.missionLog?.[date]);
  }

  function setMissionForDate(date, mission) {
    const current = missionForDate(date);
    state.missionLog = {
      ...(state.missionLog || {}),
      [date]: normalizeMissionEntry({
        ...current,
        ...mission
      })
    };
  }

  function pendingOfficialReview() {
    return Object.entries(state.missionLog || {})
      .map(([date, mission]) => ({
        date,
        mission: normalizeMissionEntry(mission)
      }))
      .filter(({ mission }) =>
        mission.officialQuestions &&
        !mission.reviewed
      )
      .sort((left, right) => left.date.localeCompare(right.date))[0] || null;
  }

  function daysUntil(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const target = new Date(year, month - 1, day);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.ceil((target - today) / 86400000);
  }

  function passPhaseFor(date = todayKey()) {
    if (!foundationCoverageComplete()) {
      return {
        id: "foundation",
        title: "基礎一周",
        text: "45単元を本文と読後2〜4問でつなぐ。基礎一周までは公式問題を日課へ混ぜない。"
      };
    }
    if (date <= "2026-08-31") {
      return {
        id: "august",
        title: "全分野拡張",
        text: "権利関係を加えてコア100へ全接触。公式未見過去問を週2年分のペースで解く。"
      };
    }
    if (date <= "2026-09-30") {
      return {
        id: "september",
        title: "本試験演習",
        text: "公式10試験回を初見・120分で解き、37点以上を複数回で再現する。"
      };
    }
    if (date <= "2026-10-11") {
      return {
        id: "october",
        title: "弱点補修",
        text: "公式過去問の誤答、法改正、統計へ限定し、新しい教材と機能追加を止める。"
      };
    }
    return {
      id: "final",
      title: "最終固定",
      text: "40点の再現、受験票・会場・睡眠を固定し、10/18の13時にピークを合わせる。"
    };
  }

  function setOfficialExamStatus(message, isError = false) {
    if (!elements.officialExamStatus) return;
    elements.officialExamStatus.textContent = message;
    elements.officialExamStatus.classList.toggle("is-error", isError);
  }

  function renderOfficialExamYearOptions() {
    const attemptType = state.officialExamSession?.attemptType ||
      (elements.officialExamAttemptType?.value === "retest" ? "retest" : "initial");
    const previousSelection = state.officialExamSession?.examId ||
      elements.officialExamId?.value ||
      "";
    const readiness = officialReadinessStats();
    const touched = officialDrillExamIdsTouched();

    if (elements.officialExamAttemptType) {
      elements.officialExamAttemptType.value = attemptType;
      elements.officialExamAttemptType.disabled = Boolean(state.officialExamSession);
    }
    if (elements.officialExamId) {
      elements.officialExamId.replaceChildren();
      OFFICIAL_EXAMS.forEach((exam) => {
        const option = document.createElement("option");
        option.value = exam.id;
        let reason = "";
        if (attemptType === "initial") {
          const exposed = Boolean(state.officialExamExposure?.[exam.id]);
          const needsFullScoreEvidence = !businessOfficialProof().ready;
          reason = exposed
            ? "公式問題へ接触済み"
            : touched.has(exam.id)
              ? "公式20問で接触済み"
              : readiness.initial.length >= OFFICIAL_INITIAL_TARGET && !needsFullScoreEvidence
                ? "初見目標達成済み"
                : "";
        } else {
          const eligibility = officialRetestEligibility(exam.id);
          reason = readiness.retests.length >= OFFICIAL_RETEST_TARGET
            ? "再試験目標達成済み"
            : eligibility.eligible
              ? ""
              : eligibility.reason;
        }
        option.disabled = Boolean(reason) && !state.officialExamSession;
        option.textContent = reason ? `${exam.label}・${reason}` : exam.label;
        elements.officialExamId.append(option);
      });
      const preferred = [...elements.officialExamId.options].find((option) =>
        option.value === previousSelection &&
        (!option.disabled || Boolean(state.officialExamSession))
      );
      const next = preferred ||
        [...elements.officialExamId.options].find((option) => !option.disabled);
      if (next) elements.officialExamId.value = next.value;
      elements.officialExamId.disabled = Boolean(state.officialExamSession);
    }

    if (elements.officialExamYear) {
      const manualSelection = elements.officialExamYear.value;
      elements.officialExamYear.replaceChildren();
      OFFICIAL_EXAMS.forEach((exam) => {
        const option = document.createElement("option");
        option.value = exam.id;
        option.textContent = exam.label;
        elements.officialExamYear.append(option);
      });
      if (officialExamDefinition(manualSelection)) {
        elements.officialExamYear.value = manualSelection;
      }
    }

    const selectedExam = officialExamDefinition(
      state.officialExamSession?.examId || elements.officialExamId?.value
    );
    if (elements.officialLawNotice) {
      const baseline = OFFICIAL_LAW_BASELINE?.getExamBaseline?.(selectedExam?.id);
      const changedQuestions = Array.isArray(baseline?.reviewedBusinessQuestionNumbers)
        ? baseline.reviewedBusinessQuestionNumbers
        : [];
      elements.officialLawNotice.textContent = changedQuestions.length
        ? `当時法の公式キーで採点します。${selectedExam.label}は現行法差分を問${changedQuestions.join("・問")}で確認済みです。押印廃止・電子書面化は現行法変形問題で別に定着判定します。`
        : "当時法の公式キーで採点します。この試験回の業法20問は現行法への全問照合を完了していないため、現行法得点には換算しません。";
    }
    if (elements.officialExamQuestionLink) {
      const canOpen = Boolean(state.officialExamSession && selectedExam?.questionUrl);
      if (canOpen) {
        elements.officialExamQuestionLink.href = selectedExam.questionUrl;
        elements.officialExamQuestionLink.target = "_blank";
        elements.officialExamQuestionLink.rel = "noopener noreferrer";
      } else {
        elements.officialExamQuestionLink.removeAttribute("href");
        elements.officialExamQuestionLink.removeAttribute("target");
      }
      elements.officialExamQuestionLink.setAttribute("aria-disabled", String(!canOpen));
      elements.officialExamQuestionLink.classList.toggle("is-disabled", !canOpen);
      elements.officialExamQuestionLink.textContent = canOpen
        ? "公式問題PDFを開く"
        : "計測開始後にPDFを開く";
    }
    if (elements.officialExamStartButton) {
      const selectedOption = elements.officialExamId?.selectedOptions?.[0];
      elements.officialExamStartButton.disabled =
        Boolean(state.officialExamSession) ||
        !selectedExam ||
        Boolean(selectedOption?.disabled);
      elements.officialExamStartButton.textContent = state.officialExamSession
        ? "計測中"
        : attemptType === "retest"
          ? "120分の再試験を開始"
          : "120分の初見測定を開始";
    }
  }

  function renderOfficialExamHistory() {
    if (!elements.officialExamHistory) return;
    elements.officialExamHistory.replaceChildren();
    const history = [...(state.officialExamHistory || [])]
      .sort((left, right) =>
        (Date.parse(right.completedAt) || 0) - (Date.parse(left.completedAt) || 0)
      );
    if (!history.length) {
      const empty = document.createElement("p");
      empty.className = "official-history-empty";
      empty.textContent = "まだ記録なし。未接触の試験回を120分で開始します。";
      elements.officialExamHistory.append(empty);
      return;
    }
    history.forEach((item) => {
      const row = document.createElement("article");
      row.className = "official-history-row";
      row.classList.toggle("is-safe", item.score >= STUDY_TARGETS.safe);
      row.classList.toggle(
        "is-target",
        item.score >= STUDY_TARGETS.total && item.score < STUDY_TARGETS.safe
      );
      const heading = document.createElement("div");
      const label = document.createElement("span");
      const definition = officialExamDefinition(item.examId);
      label.textContent = definition?.label ||
        `${item.year}年度（試験回不明の旧記録）`;
      const score = document.createElement("strong");
      score.textContent = `${item.score} / 50`;
      const time = document.createElement("small");
      time.textContent =
        `${item.attemptType === "retest" ? "再試験" : "初見"}・${item.elapsedMinutes}分`;
      heading.append(label, score, time);

      const sections = document.createElement("p");
      sections.textContent =
        `権利 ${item.rights}/14・法令 ${item.restrictions}/8・業法 ${item.business}/20・税他 ${item.taxOther}/8`;
      const evidence = document.createElement("p");
      evidence.className = "official-history-evidence";
      evidence.textContent = officialAttemptQualifies(item)
        ? `当時法の安定度へ算入・120分以内・現行法${BUSINESS_FULLSCORE_EXPECTED_QUESTIONS}問は別ゲート`
        : item.legacySessionAmbiguous
          ? "参考記録・10月／12月の試験回が不明"
          : item.sourceMode === "self-report"
            ? "参考記録・自己申告"
            : "参考記録・測定条件未達";
      row.append(heading, sections, evidence);
      elements.officialExamHistory.append(row);
    });
  }

  function officialExamSectionLabel(number) {
    const section = OFFICIAL_EXAM_DATA?.SECTION_BY_NUMBER(Number(number));
    return OFFICIAL_DRILL_SECTION_LABELS[section] || section || "";
  }

  function renderOfficialExamTimer(session = state.officialExamSession) {
    if (!elements.officialExamTimer) return;
    elements.officialExamTimer.classList.remove("is-over");
    if (!session?.startedAt) {
      elements.officialExamTimer.textContent = "120:00";
      return;
    }
    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000)
    );
    const remaining = MOCK_DURATION_MINUTES * 60 - elapsedSeconds;
    if (remaining < 0) {
      const over = Math.abs(remaining);
      elements.officialExamTimer.textContent =
        `+${String(Math.floor(over / 60)).padStart(2, "0")}:` +
        `${String(over % 60).padStart(2, "0")}`;
      elements.officialExamTimer.classList.add("is-over");
      return;
    }
    elements.officialExamTimer.textContent =
      `${String(Math.floor(remaining / 60)).padStart(2, "0")}:` +
      `${String(remaining % 60).padStart(2, "0")}`;
  }

  function renderOfficialExamSession() {
    const session = state.officialExamSession;
    if (!elements.officialExamSessionForm) return;
    elements.officialExamSessionForm.hidden = !session;
    if (session) {
      if (elements.passPlanPanel) elements.passPlanPanel.open = true;
      if (elements.officialLedgerPanel) elements.officialLedgerPanel.open = true;
    }
    renderOfficialExamTimer(session);
    if (!session) return;
    const definition = officialExamDefinition(session.examId);
    if (!definition) return;
    const position = Math.min(49, Math.max(0, Number(session.position) || 0));
    const number = position + 1;
    if (elements.officialExamQuestionNumber) {
      elements.officialExamQuestionNumber.textContent = `問${number}`;
    }
    if (elements.officialExamQuestionSection) {
      elements.officialExamQuestionSection.textContent =
        `${officialExamSectionLabel(number)}・歴史問題`;
    }
    elements.officialExamAnswerChoices
      ?.querySelectorAll('input[name="official-exam-answer"]')
      .forEach((input) => {
        input.checked = Number(input.value) === Number(session.answers?.[number]);
      });
    if (
      elements.officialExamJumpSelect &&
      elements.officialExamJumpSelect.dataset.examId !== definition.id
    ) {
      elements.officialExamJumpSelect.replaceChildren();
      definition.answers.forEach((unused, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `問${index + 1}`;
        elements.officialExamJumpSelect.append(option);
      });
      elements.officialExamJumpSelect.dataset.examId = definition.id;
    }
    if (elements.officialExamJumpSelect) {
      elements.officialExamJumpSelect.value = String(position);
    }
    if (elements.officialExamProgress) {
      elements.officialExamProgress.textContent =
        `${position + 1} / 50・解答${Object.keys(session.answers || {}).length}`;
    }
    if (elements.officialExamPrevButton) {
      elements.officialExamPrevButton.disabled = position === 0;
    }
    if (elements.officialExamNextButton) {
      elements.officialExamNextButton.disabled = position === 49;
    }
  }

  function collectOfficialExamSession(position = null) {
    const session = state.officialExamSession;
    if (!session) return null;
    const currentNumber = (Number(session.position) || 0) + 1;
    const selected = elements.officialExamAnswerChoices
      ?.querySelector('input[name="official-exam-answer"]:checked');
    const answers = { ...(session.answers || {}) };
    if (selected) answers[currentNumber] = Number(selected.value);
    return normalizeOfficialExamSession({
      ...session,
      answers,
      position: Number.isInteger(position) ? position : session.position
    });
  }

  function saveOfficialExamDraft(position = null) {
    const next = collectOfficialExamSession(position);
    if (!next) return false;
    const previous = state.officialExamSession;
    state.officialExamSession = next;
    if (!saveState()) {
      state.officialExamSession = previous;
      setOfficialExamStatus(
        "解答を自動保存できませんでした。バックアップ後に空き容量と別タブを確認してください。",
        true
      );
      return false;
    }
    if (elements.officialExamProgress) {
      elements.officialExamProgress.textContent =
        `${next.position + 1} / 50・解答${Object.keys(next.answers).length}`;
    }
    return true;
  }

  function moveOfficialExam(position) {
    if (!state.officialExamSession) return;
    const nextPosition = Math.min(
      49,
      Math.max(0, Math.trunc(Number(position) || 0))
    );
    if (saveOfficialExamDraft(nextPosition)) renderOfficialExamSession();
  }

  function startOfficialExam() {
    if (resumeActiveLearningSession()) return;
    if (!foundationCoverageComplete() && !businessFullScoreOfficialUnlocked()) {
      const progress = foundationProgress();
      setOfficialExamStatus(
        `公式50問は全体基礎一周、または業法の基礎44問定着＋変形${BUSINESS_FULLSCORE_EXPECTED_QUESTIONS}問初回走査後に解放します。現在は単元${progress.completedUnits}/${TEXTBOOK_CHAPTERS.length}です。`,
        true
      );
      return;
    }
    const examId = String(elements.officialExamId?.value || "");
    const definition = officialExamDefinition(examId);
    const attemptType = elements.officialExamAttemptType?.value === "retest"
      ? "retest"
      : "initial";
    if (!definition) {
      setOfficialExamStatus("開始できる試験回がありません。", true);
      return;
    }
    const readiness = officialReadinessStats();
    if (attemptType === "initial") {
      const businessSummary = businessFullScoreSummary();
      const reserve = businessOfficialReserve();
      if (
        !businessSummary.transferReady &&
        reserve?.valid &&
        !reserve.canStartInitial
      ) {
        setOfficialExamStatus(
          `現行法変形${BUSINESS_FULLSCORE_EXPECTED_QUESTIONS}問を長期定着させるまで、満点証拠に必要な未見${reserve.minimumReserve}回を保留します。`,
          true
        );
        return;
      }
      if (readiness.initial.length >= OFFICIAL_INITIAL_TARGET && businessOfficialProof().ready) {
        setOfficialExamStatus("初見10回は達成済みです。再試験へ進んでください。", true);
        return;
      }
      if (state.officialExamExposure?.[examId] || officialDrillExamIdsTouched().has(examId)) {
        setOfficialExamStatus(
          `${definition.label}はアプリ内で接触済みです。別の未接触試験回を選んでください。`,
          true
        );
        return;
      }
      const existing = (state.officialExamHistory || []).some((item) =>
        item.examId === examId &&
        item.attemptType === "initial" &&
        item.sourceMode === "timed-answer-sheet"
      );
      if (existing) {
        setOfficialExamStatus("この試験回の初見測定は記録済みです。", true);
        return;
      }
    } else {
      if (readiness.retests.length >= OFFICIAL_RETEST_TARGET) {
        setOfficialExamStatus("再試験3回は達成済みです。弱点補修へ進んでください。", true);
        return;
      }
      const eligibility = officialRetestEligibility(examId);
      if (!eligibility.eligible) {
        setOfficialExamStatus(
          `${definition.label}は再試験不可：${eligibility.reason}。`,
          true
        );
        return;
      }
    }
    const previousState = cloneStateForSync(state);
    const startedAt = new Date().toISOString();
    const startedUtcOffsetMinutes = new Date(startedAt).getTimezoneOffset();
    const appUnseenAtStart = attemptType === "initial" && !state.officialExamExposure?.[examId];
    recordOfficialExamExposure(examId, "full-exam", startedAt);
    state.officialExamSession = normalizeOfficialExamSession({
      ...createOfficialExamSession(),
      examId,
      attemptType,
      evidenceVersion: OFFICIAL_EXAM_EVIDENCE_VERSION,
      scoringBasis: OFFICIAL_HISTORICAL_SCORING_BASIS,
      startedAt,
      startedDayKey: dayKeyAtUtcOffset(startedAt, startedUtcOffsetMinutes),
      startedUtcOffsetMinutes,
      appUnseenAtStart,
      currentLawBaseline: CURRENT_LAW_BASELINE
    });
    if (!saveState({
      requireUnexposedExamId: attemptType === "initial" ? examId : ""
    })) {
      state = previousState;
      renderPassPlan();
      setOfficialExamStatus(
        "露出記録と解答シートを保存できないため開始しませんでした。バックアップ後に保存領域と別タブを確認してください。",
        true
      );
      return;
    }
    logStudyEvent("official-past-exam", {
      action: "start",
      examId,
      attemptType
    });
    renderPassPlan();
    setOfficialExamStatus(
      `${definition.label}の${attemptType === "retest" ? "再試験" : "初見測定"}を開始しました。120分・検索なしで50問を入力してください。`
    );
  }

  function submitOfficialExam(event) {
    event?.preventDefault();
    if (!saveOfficialExamDraft()) return;
    const session = state.officialExamSession;
    if (!session) {
      setOfficialExamStatus("先に120分計測を開始してください。", true);
      return;
    }
    const definition = officialExamDefinition(session.examId);
    const missing = definition.answers
      .map((unused, index) => index + 1)
      .filter((number) => !session.answers[number]);
    if (missing.length) {
      moveOfficialExam(missing[0] - 1);
      setOfficialExamStatus(
        `未回答は${missing.length}問です。問${missing[0]}から埋めてください。`,
        true
      );
      return;
    }
    if (session.attemptType === "retest") {
      const eligibility = officialRetestEligibility(session.examId);
      if (!eligibility.eligible) {
        setOfficialExamStatus(`再試験を記録できません：${eligibility.reason}。`, true);
        return;
      }
    }
    const completedAt = new Date().toISOString();
    const elapsedMinutes = Math.max(
      1,
      Math.ceil((Date.parse(completedAt) - Date.parse(session.startedAt)) / 60000)
    );
    const scored = OFFICIAL_EXAM_DATA.scoreAnswers(session.examId, session.answers);
    const entry = {
      recordId: createOpaqueId("official"),
      examId: session.examId,
      year: definition.year,
      attemptType: session.attemptType,
      sourceMode: "timed-answer-sheet",
      evidenceVersion: session.evidenceVersion,
      scoringBasis: session.scoringBasis,
      startedAt: session.startedAt,
      startedDayKey: session.startedDayKey,
      startedUtcOffsetMinutes: session.startedUtcOffsetMinutes,
      appUnseenAtStart: session.appUnseenAtStart,
      currentLawBaseline: CURRENT_LAW_BASELINE,
      timed120: elapsedMinutes <= MOCK_DURATION_MINUTES,
      lawChecked: false,
      answers: { ...session.answers },
      score: scored.score,
      rights: scored.sectionScores.rights,
      restrictions: scored.sectionScores.restrictions,
      business: scored.sectionScores.business,
      taxOther: scored.sectionScores.taxOther,
      elapsedMinutes: Math.min(180, elapsedMinutes),
      completedAt
    };
    const previousState = cloneStateForSync(state);
    state.officialExamHistory = normalizeOfficialExamHistory([
      ...(state.officialExamHistory || []),
      entry
    ]);
    state.officialExamSession = null;
    const mission = missionForDate();
    setMissionForDate(todayKey(), {
      minutes: Math.max(mission.minutes, Math.min(180, elapsedMinutes))
    });
    if (!saveState()) {
      state = previousState;
      setOfficialExamStatus(
        "採点結果を保存できませんでした。解答シートはこの画面に保持しています。保存領域と別タブを確認して再度記録してください。",
        true
      );
      renderOfficialExamSession();
      return;
    }
    logStudyEvent("official-past-exam", {
      action: "submit",
      examId: entry.examId,
      attemptType: entry.attemptType,
      score: entry.score,
      elapsedMinutes: entry.elapsedMinutes,
      scoringBasis: OFFICIAL_HISTORICAL_SCORING_BASIS
    });
    renderPassPlan();
    setOfficialExamStatus(
      `${definition.label} ${entry.score}/50を自動採点しました。` +
      `${entry.timed120 ? "安定度へ算入します。" : "120分超過のため参考記録です。"}`
    );
  }

  function setTodayCommandStatus(message, isError = false) {
    if (!elements.todayCommandStatus) return;
    elements.todayCommandStatus.textContent = message;
    elements.todayCommandStatus.classList.toggle("is-error", isError);
  }

  function setOfficialDrillStatus(message, isError = false) {
    if (!elements.officialDrillStatus) return;
    elements.officialDrillStatus.textContent = message;
    elements.officialDrillStatus.classList.toggle("is-error", isError);
  }

  function officialDrillHistory() {
    return Object.entries(state.missionLog || {})
      .map(([date, mission]) => ({
        date,
        drill: normalizeOfficialDrill(mission?.officialDrill)
      }))
      .filter((item) => item.drill?.completed)
      .sort((left, right) =>
        (Date.parse(left.drill.submittedAt) || Date.parse(left.date) || 0) -
        (Date.parse(right.drill.submittedAt) || Date.parse(right.date) || 0)
      );
  }

  function officialPracticeStats() {
    const history = officialDrillHistory();
    const questions = new Set();
    const sets = new Set();
    history.forEach(({ drill }) => {
      const definition = officialDrillDefinitionById(drill.setId);
      if (!definition) return;
      sets.add(definition.id);
      definition.questions.forEach((item) => questions.add(item.number));
    });
    const latest = history.at(-1)?.drill || null;
    const planned = officialDailyDrillDefinition(state.missionLog);
    const plannedAttempts = history.filter(({ drill }) => drill.setId === planned.id).length;
    return {
      attempts: history.length,
      coveredQuestions: questions.size,
      completedSets: sets.size,
      latest,
      planned,
      plannedAttempts
    };
  }

  function ensureOfficialDrillAnswerGrid(
    definition = officialDailyDrillDefinition(state.missionLog)
  ) {
    if (!elements.officialDrillAnswerGrid) return;
    const mission = missionForDate();
    const drill = mission.officialDrill?.setId === definition.id
      ? mission.officialDrill
      : null;
    const position = Math.min(
      definition.questions.length - 1,
      Math.max(0, Math.trunc(Number(drill?.position) || 0))
    );
    const item = definition.questions[position];
    elements.officialDrillAnswerGrid.dataset.setId = definition.id;
    elements.officialDrillAnswerGrid.replaceChildren();

    const fieldset = document.createElement("fieldset");
    fieldset.className = "official-drill-item official-drill-current-item";
    fieldset.dataset.questionNumber = String(item.number);

    const legend = document.createElement("legend");
    const number = document.createElement("strong");
    number.textContent = `問${item.number}`;
    const section = document.createElement("span");
    section.textContent =
      `${OFFICIAL_DRILL_SECTION_LABELS[item.section] || item.section}・` +
      `${item.verifiedAsOf}基準`;
    legend.append(number, section);

    const choices = document.createElement("div");
    choices.className = "official-drill-choices";
    choices.setAttribute("aria-label", `問${item.number}の解答`);
    [1, 2, 3, 4].forEach((choice) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `official-drill-q${item.number}`;
      input.value = String(choice);
      input.dataset.questionNumber = String(item.number);
      input.checked = Number(drill?.answers?.[item.number]) === choice;
      const text = document.createElement("span");
      text.textContent = String(choice);
      label.append(input, text);
      choices.append(label);
    });

    const confidenceGroup = document.createElement("div");
    confidenceGroup.className = "official-drill-confidence";
    confidenceGroup.setAttribute("role", "group");
    confidenceGroup.setAttribute("aria-label", `問${item.number}の根拠判定`);
    [
      ["grounded", "根拠あり"],
      ["uncertain", "消去法・勘"]
    ].forEach(([value, text]) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `official-drill-confidence-q${item.number}`;
      input.value = value;
      input.dataset.confidenceQuestion = String(item.number);
      input.checked = drill?.confidence?.[item.number] === value;
      const caption = document.createElement("span");
      caption.textContent = text;
      label.append(input, caption);
      confidenceGroup.append(label);
    });
    fieldset.append(legend, choices, confidenceGroup);
    elements.officialDrillAnswerGrid.append(fieldset);

    if (
      elements.officialDrillJumpSelect &&
      elements.officialDrillJumpSelect.dataset.setId !== definition.id
    ) {
      elements.officialDrillJumpSelect.replaceChildren();
      definition.questions.forEach((question, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `${index + 1}: 問${question.number}`;
        elements.officialDrillJumpSelect.append(option);
      });
      elements.officialDrillJumpSelect.dataset.setId = definition.id;
    }
    if (elements.officialDrillJumpSelect) {
      elements.officialDrillJumpSelect.value = String(position);
    }
    if (elements.officialDrillProgress) {
      const answeredCount = Object.keys(drill?.answers || {}).length;
      const confidenceCount = Object.keys(drill?.confidence || {}).length;
      elements.officialDrillProgress.textContent =
        `${position + 1} / ${definition.questions.length}・` +
        `解答${answeredCount}・根拠${confidenceCount}`;
    }
    if (elements.officialDrillPrevButton) {
      elements.officialDrillPrevButton.disabled = position === 0;
    }
    if (elements.officialDrillNextButton) {
      elements.officialDrillNextButton.disabled =
        position === definition.questions.length - 1;
    }
  }

  function collectOfficialDrillForm(
    definition = officialDrillDefinitionById(elements.officialDrillAnswerGrid?.dataset.setId) ||
      officialDailyDrillDefinition()
  ) {
    const drill = missionForDate().officialDrill;
    const answers = { ...(drill?.answers || {}) };
    const confidence = { ...(drill?.confidence || {}) };
    const position = Math.min(
      definition.questions.length - 1,
      Math.max(0, Math.trunc(Number(drill?.position) || 0))
    );
    const item = definition.questions[position];
    const selected = elements.officialDrillForm
      ?.querySelector(`input[name="official-drill-q${item.number}"]:checked`);
    if (selected) answers[item.number] = Number(selected.value);
    const confidenceInput = elements.officialDrillForm
      ?.querySelector(`[data-confidence-question="${item.number}"]:checked`);
    const confidenceValue = String(confidenceInput?.value || "");
    if (confidenceValue === "grounded" || confidenceValue === "uncertain") {
      confidence[item.number] = confidenceValue;
    }
    const uncertain = Object.entries(confidence)
      .filter(([, value]) => value === "uncertain")
      .map(([number]) => Number(number))
      .sort((left, right) => left - right);
    return { answers, confidence, uncertain };
  }

  function moveOfficialDrill(position) {
    const mission = missionForDate();
    if (mission.officialDrill?.completed) return;
    const definition = officialDrillDefinitionFor(mission.officialDrill);
    const nextPosition = Math.min(
      definition.questions.length - 1,
      Math.max(0, Math.trunc(Number(position) || 0))
    );
    saveOfficialDrillDraft(nextPosition);
    ensureOfficialDrillAnswerGrid(definition);
  }

  function officialDrillSectionTotals(definition) {
    return definition.questions.reduce((totals, item) => ({
      ...totals,
      [item.section]: (totals[item.section] || 0) + 1
    }), {});
  }

  function officialDrillScoreLabel(score, definition) {
    if (score >= definition.safeScore) return "原問換算・目標超";
    if (score >= definition.targetScore) return "原問換算・目標";
    return "原問換算・要復習";
  }

  function renderOfficialDrillTimer(drill = missionForDate().officialDrill) {
    if (!elements.officialDrillTimer) return;
    const definition = officialDrillDefinitionFor(drill);
    elements.officialDrillTimer.classList.remove("is-over");
    if (drill?.completed) {
      elements.officialDrillTimer.textContent = `${drill.elapsedMinutes}分`;
      return;
    }
    if (!drill?.startedAt) {
      elements.officialDrillTimer.textContent =
        `${String(definition.durationMinutes).padStart(2, "0")}:00`;
      return;
    }
    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(drill.startedAt)) / 1000)
    );
    const plannedSeconds = definition.durationMinutes * 60;
    const remaining = plannedSeconds - elapsedSeconds;
    if (remaining < 0) {
      const over = Math.abs(remaining);
      elements.officialDrillTimer.textContent =
        `+${String(Math.floor(over / 60)).padStart(2, "0")}:${String(over % 60).padStart(2, "0")}`;
      elements.officialDrillTimer.classList.add("is-over");
      return;
    }
    elements.officialDrillTimer.textContent =
      `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  }

  function renderOfficialDrillResult(drill) {
    if (!elements.officialDrillResult) return;
    elements.officialDrillResult.replaceChildren();
    elements.officialDrillResult.hidden = !drill?.completed;
    if (!drill?.completed) return;
    const definition = officialDrillDefinitionFor(drill);
    const sameSetHistory = officialDrillHistory()
      .filter((item) => item.drill.setId === definition.id);
    const currentIndex = sameSetHistory.findIndex((item) =>
      item.drill.submittedAt === drill.submittedAt
    );
    const previous = currentIndex > 0
      ? sameSetHistory[currentIndex - 1].drill
      : null;
    const practice = officialPracticeStats();

    const heading = document.createElement("div");
    const score = document.createElement("strong");
    score.textContent = `${drill.score} / ${definition.questions.length}`;
    const label = document.createElement("span");
    label.textContent = officialDrillScoreLabel(drill.score, definition);
    heading.append(score, label);

    const totals = officialDrillSectionTotals(definition);
    const sections = document.createElement("p");
    sections.textContent = Object.keys(OFFICIAL_DRILL_SECTION_LABELS)
      .map((section) =>
        `${OFFICIAL_DRILL_SECTION_LABELS[section]} ${drill.sectionScores?.[section] || 0}/${totals[section] || 0}`
      )
      .join("・");
    const targets = document.createElement("p");
    targets.textContent = drill.reviewTargets.length
      ? `復習対象：${drill.reviewTargets.map((number) => `問${number}`).join("・")}`
      : "復習対象：誤答・根拠なしともになし";
    const coverage = document.createElement("p");
    coverage.textContent =
      `令和7年度の接触 ${practice.coveredQuestions}/50・完了セット ` +
      `${practice.completedSets}/${OFFICIAL_DAILY_DRILL_DEFINITIONS.length}`;
    const trend = document.createElement("p");
    trend.textContent = previous
      ? `前回 ${previous.score}点 → 今回 ${drill.score}点`
      : "このセットの初回得点";
    const source = document.createElement("a");
    source.href = definition.answerSourceUrl;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = "RETIO公式の問題・解答PDFで照合";
    elements.officialDrillResult.append(
      heading,
      sections,
      targets,
      coverage,
      trend,
      source
    );
  }

  function renderOfficialDrillPanel(mission, step) {
    if (!elements.officialDrillPanel) return;
    const drill = mission.officialDrill;
    const definition = officialDrillDefinitionFor(drill);
    const completedAttempts = officialDrillHistory()
      .filter((item) => item.drill.setId === definition.id).length;
    const attemptNumber = drill?.completed
      ? Math.max(1, completedAttempts)
      : completedAttempts + 1;
    ensureOfficialDrillAnswerGrid(definition);
    const show = step === 2 || (step === 3 && drill?.completed);
    elements.officialDrillPanel.hidden = !show;
    if (!show) return;

    elements.officialDrillTitle.textContent =
      `${definition.label}・${attemptNumber === 1 ? "初回" : `再戦${attemptNumber}`}`;
    elements.officialDrillQuestionRange.textContent = definition.questionRange;
    elements.officialDrillQuestionLink.removeAttribute("href");
    elements.officialDrillQuestionLink.dataset.questionUrl = definition.questionUrl;
    if (drill?.startedAt || drill?.completed) {
      elements.officialDrillPanel.open = true;
    }
    elements.officialDrillSummary.textContent = drill?.completed
      ? `${drill.score} / ${definition.questions.length}・${officialDrillScoreLabel(drill.score, definition)}`
      : `解答${Object.keys(drill?.answers || {}).length}/${definition.questions.length}・根拠${Object.keys(drill?.confidence || {}).length}/${definition.questions.length}`;
    elements.officialDrillForm.hidden = Boolean(drill?.completed);
    elements.officialDrillStartButton.disabled = Boolean(drill?.startedAt);
    elements.officialDrillStartButton.textContent = drill?.completed
      ? "採点済み"
      : drill?.startedAt
        ? "計測中"
        : "35分計測を開始";
    renderOfficialDrillTimer(drill);
    renderOfficialDrillResult(drill);
  }

  function renderMissionReviewInputs(mission, step) {
    if (!elements.todayReviewTargets || !elements.todayReviewInput) return;
    elements.todayReviewTargets.replaceChildren();
    const drill = mission.officialDrill;
    const targets = drill?.completed ? drill.reviewTargets : [];
    const multipleTargets = step === 3 && targets.length > 0;
    elements.todayReviewTargets.hidden = !multipleTargets;
    elements.todayReviewLabel.hidden = multipleTargets;
    elements.todayReviewInput.hidden = multipleTargets;
    elements.todayCommandReviewButton.textContent = multipleTargets
      ? `${targets.length}件を保存`
      : "1行を保存";

    if (multipleTargets) {
      targets.forEach((number) => {
        const label = document.createElement("label");
        label.className = "today-review-target";
        const heading = document.createElement("span");
        heading.textContent = `問${number}`;
        const cause = document.createElement("select");
        cause.dataset.reviewCause = String(number);
        cause.setAttribute("aria-label", `問${number}の誤答原因`);
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "原因を選ぶ";
        cause.append(placeholder);
        MISTAKE_CAUSES.forEach((item) => {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.label;
          cause.append(option);
        });
        cause.value = drill.reviewCauses?.[number] || "";
        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 120;
        input.autocomplete = "off";
        input.dataset.reviewQuestion = String(number);
        input.placeholder = "例：主語を飛ばした → 最初に主体へ線を引く";
        input.value = drill.reviewNotes?.[number] || "";
        label.append(heading, cause, input);
        elements.todayReviewTargets.append(label);
      });
      return;
    }

    elements.todayReviewLabel.textContent =
      drill?.completed && drill.reviewTargets.length === 0
        ? "全問正解・迷いなし：維持ルール"
        : "原因 → 次回ルール";
    if (document.activeElement !== elements.todayReviewInput) {
      elements.todayReviewInput.value = mission.reviewNote;
    }
  }

  function openOfficialDrill() {
    if (!foundationCoverageComplete()) {
      const progress = foundationProgress();
      setTodayCommandStatus(
        `公式20問は基礎一周後に解放します。現在は単元${progress.completedUnits}/${TEXTBOOK_CHAPTERS.length}です。`,
        true
      );
      return;
    }
    if (!dailyQuestIsComplete()) {
      setTodayCommandStatus("先に固定10問を完了してください。", true);
      return;
    }
    const pendingReview = pendingOfficialReview();
    if (pendingReview) {
      setTodayCommandStatus(
        `${pendingReview.date}の未復習を先に保存してください。`,
        true
      );
      return;
    }
    if (elements.officialDrillPanel) {
      elements.officialDrillPanel.hidden = false;
      elements.officialDrillPanel.open = true;
      elements.officialDrillPanel.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  function startOfficialDrill() {
    if (!foundationCoverageComplete()) {
      const progress = foundationProgress();
      setOfficialDrillStatus(
        `公式20問は基礎一周後に解放します。現在は単元${progress.completedUnits}/${TEXTBOOK_CHAPTERS.length}です。`,
        true
      );
      return false;
    }
    const mission = missionForDate();
    const definition = officialDrillDefinitionFor(mission.officialDrill);
    if (!dailyQuestIsComplete()) {
      setOfficialDrillStatus("先に固定10問を完了してください。", true);
      return false;
    }
    const pendingReview = pendingOfficialReview();
    if (pendingReview) {
      setOfficialDrillStatus(
        `${pendingReview.date}の未復習を先に保存してください。`,
        true
      );
      return false;
    }
    if (mission.officialDrill?.completed || mission.officialDrill?.startedAt) {
      renderOfficialDrillTimer(mission.officialDrill);
      return true;
    }
    const previousState = cloneStateForSync(state);
    const startedAt = new Date().toISOString();
    const examId = String(definition.examId || definition.year || "");
    recordOfficialExamExposure(examId, "daily-drill", startedAt);
    setMissionForDate(todayKey(), {
      officialDrill: {
        setId: definition.id,
        position: mission.officialDrill?.position || 0,
        startedAt,
        answers: mission.officialDrill?.answers || {},
        confidence: mission.officialDrill?.confidence || {},
        uncertain: mission.officialDrill?.uncertain || [],
        evidenceVersion: OFFICIAL_DRILL_EVIDENCE_VERSION,
        completed: false
      }
    });
    if (!saveState({ requireNoActiveOfficialExamId: examId })) {
      state = previousState;
      setOfficialDrillStatus(
        "露出記録を保存できないためPDFを開きませんでした。保存領域と別タブを確認してください。",
        true
      );
      return false;
    }
    logStudyEvent("official-daily-drill", {
      action: "start",
      setId: definition.id
    });
    renderPassPlan();
    setOfficialDrillStatus("35分計測を開始しました。問題PDFを開き、検索せずに解いてください。");
    return true;
  }

  function abandonOfficialExam() {
    const session = state.officialExamSession;
    if (!session) return;
    const definition = officialExamDefinition(session.examId);
    const label = definition?.label || session.examId;
    if (!window.confirm(
      `${label}の計測を中断します。\n` +
      "この試験回の接触記録は残り、初見測定には再利用できません。"
    )) return;
    const previousState = cloneStateForSync(state);
    recordOfficialExamExposure(session.examId, "full-exam", session.startedAt);
    state.officialExamSession = null;
    if (!saveState()) {
      state = previousState;
      setOfficialExamStatus(
        "中断状態を保存できませんでした。解答シートは保持しています。保存領域と別タブを確認してください。",
        true
      );
      return;
    }
    renderPassPlan();
    renderBusinessMastery();
    setOfficialExamStatus(
      `${label}を中断しました。この回は接触済みのままです。別の未接触試験回を選べます。`
    );
  }

  function saveOfficialDrillDraft(nextPosition = null) {
    const mission = missionForDate();
    if (mission.officialDrill?.completed) return false;
    const previousState = cloneStateForSync(state);
    const definition = officialDrillDefinitionFor(mission.officialDrill);
    const form = collectOfficialDrillForm(definition);
    const position = Number.isInteger(nextPosition)
      ? nextPosition
      : mission.officialDrill?.position || 0;
    setMissionForDate(todayKey(), {
      officialDrill: {
        setId: definition.id,
        position,
        startedAt: mission.officialDrill?.startedAt || "",
        answers: form.answers,
        confidence: form.confidence,
        uncertain: form.uncertain,
        evidenceVersion: OFFICIAL_DRILL_EVIDENCE_VERSION,
        completed: false
      }
    });
    if (!saveState()) {
      state = previousState;
      setOfficialDrillStatus(
        "解答を自動保存できませんでした。保存領域と別タブを確認してください。",
        true
      );
      return false;
    }
    elements.officialDrillSummary.textContent =
      `解答${Object.keys(form.answers).length}/${definition.questions.length}・` +
      `根拠${Object.keys(form.confidence).length}/${definition.questions.length}`;
    if (elements.officialDrillProgress) {
      elements.officialDrillProgress.textContent =
        `${position + 1} / ${definition.questions.length}・` +
        `解答${Object.keys(form.answers).length}・根拠${Object.keys(form.confidence).length}`;
    }
    return true;
  }

  function submitOfficialDrill(event) {
    event?.preventDefault();
    const mission = missionForDate();
    if (!dailyQuestIsComplete()) {
      setOfficialDrillStatus("先に固定10問を完了してください。", true);
      return;
    }
    if (!mission.officialDrill?.startedAt) {
      setOfficialDrillStatus("先に「35分計測を開始」を押してください。", true);
      return;
    }
    const definition = officialDrillDefinitionFor(mission.officialDrill);
    const form = collectOfficialDrillForm(definition);
    const missing = definition.questions
      .map((item) => item.number)
      .filter((number) => !form.answers[number]);
    if (missing.length) {
      setOfficialDrillStatus(
        `未回答：${missing.map((number) => `問${number}`).join("・")}`,
        true
      );
      if (!saveOfficialDrillDraft(
        definition.questions.findIndex((item) => item.number === missing[0])
      )) return;
      ensureOfficialDrillAnswerGrid(definition);
      return;
    }
    const missingConfidence = definition.questions
      .map((item) => item.number)
      .filter((number) => !form.confidence[number]);
    if (missingConfidence.length) {
      setOfficialDrillStatus(
        `根拠未判定：${missingConfidence.map((number) => `問${number}`).join("・")}`,
        true
      );
      if (!saveOfficialDrillDraft(
        definition.questions.findIndex((item) => item.number === missingConfidence[0])
      )) return;
      ensureOfficialDrillAnswerGrid(definition);
      return;
    }

    const submittedAt = new Date().toISOString();
    const completedDrill = normalizeOfficialDrill({
      setId: definition.id,
      startedAt: mission.officialDrill.startedAt,
      submittedAt,
      answers: form.answers,
      confidence: form.confidence,
      uncertain: form.uncertain,
      evidenceVersion: OFFICIAL_DRILL_EVIDENCE_VERSION,
      position: mission.officialDrill.position || 0,
      completed: true
    });
    const reviewComplete = completedDrill.reviewTargets.length === 0;
    const previousState = cloneStateForSync(state);
    setMissionForDate(todayKey(), {
      officialQuestions: true,
      reviewed: reviewComplete,
      reviewNote: "",
      officialDrill: completedDrill,
      minutes: Math.min(600, mission.minutes + completedDrill.elapsedMinutes)
    });
    if (!saveState()) {
      state = previousState;
      setOfficialDrillStatus(
        "採点結果を保存できませんでした。解答はこの画面に保持しています。保存領域と別タブを確認してください。",
        true
      );
      return;
    }
    logStudyEvent("official-daily-drill", {
      action: "submit",
      setId: completedDrill.setId,
      score: completedDrill.score,
      elapsedMinutes: completedDrill.elapsedMinutes,
      uncertain: completedDrill.uncertain,
      confidence: completedDrill.confidence,
      reviewTargets: completedDrill.reviewTargets
    });
    renderPassPlan();
    setOfficialDrillStatus(
      reviewComplete
        ? `${completedDrill.score}/20を記録しました。誤答・根拠なしは0件です。`
        : `${completedDrill.score}/20を記録しました。次は復習対象${completedDrill.reviewTargets.length}件を1行ずつ処理します。`
    );
    setTodayCommandStatus(
      `${completedDrill.score}/20・${officialDrillScoreLabel(completedDrill.score, definition)}。採点済みです。`
    );
  }

  function foundationRouteDescriptor(route) {
    if (route.kind === "unit") {
      const { chapter, baseIds, baseContacted } = route.snapshot;
      const remaining = Math.max(0, baseIds.length - baseContacted);
      const batchIds = foundationUnitBatchIds(chapter);
      const batchRemaining = batchIds.filter((id) => !isContacted(id)).length;
      const batchStarted = batchIds.some(isContacted);
      const batchText = remaining > batchRemaining
        ? `${batchStarted ? "この回の残り" : "まず"}${batchRemaining}問を解く（単元残り${remaining}問）。`
        : `残り${remaining}問を解く。`;
      return {
        stage: "読む＋読後問題",
        title: chapter.topicLabel,
        text: `${chapter.textbookLabel} p.${chapter.page}〜を読み、${batchText}解答後の「こう解く」で根拠と当てはめを読む。`,
        button: batchStarted ? `残り${batchRemaining}問を続ける` : `読後${batchRemaining}問を始める`,
        action: "unit",
        unitId: chapter.id,
        scopeId: ""
      };
    }
    if (route.kind === "review") {
      const due = route.dueIds?.length || 0;
      return {
        stage: "翌日復習",
        title: due ? `根拠を再現する${due}問` : "復習10問で定着を作る",
        text: due
          ? "昨日以前に触れた問題を、答えの記憶ではなく4肢の根拠から再判定する。"
          : "学習済み範囲だけから10問を作り、古い理解から再確認する。",
        button: "復習10問を始める",
        action: "review",
        unitId: "",
        scopeId: ""
      };
    }
    if (route.kind === "practical") {
      const { chapter, practicalGrounded, practicalItems } = route.snapshot;
      return {
        stage: "任意の実践4問",
        title: `${chapter.topicLabel}を別形式で解く`,
        text: `基礎一周を止めずに使う追加演習。単一選択・組合せ・個数を混ぜ、根拠クリアは${practicalGrounded}/${practicalItems.length}。`,
        button: "任意の実践4問を開く",
        action: "practical",
        unitId: chapter.id,
        scopeId: ""
      };
    }
    if (route.kind === "scope") {
      return {
        stage: "次の分冊へ",
        title: `${route.nextScope.shortLabel}へ進む`,
        text: "今の範囲の読後問題に接触済み。復習対象と任意実践は残したまま、次の未学習範囲を開く。",
        button: `${route.nextScope.shortLabel}を開く`,
        action: "scope",
        unitId: "",
        scopeId: route.nextScope.id
      };
    }
    return {
      stage: "基礎一周完了",
      title: "公式問題で初見力を測る",
      text: "全45単元の読後問題へ接触済み。ここから公式20問と公式50問を測定として使う。",
      button: "実力測定を開く",
      action: "official",
      unitId: "",
      scopeId: ""
    };
  }

  function setRouteAction(button, descriptor, buttonLabel = descriptor.button) {
    if (!button) return;
    button.hidden = false;
    button.textContent = buttonLabel;
    button.dataset.routeAction = descriptor.action;
    button.dataset.unitId = descriptor.unitId || "";
    button.dataset.scopeId = descriptor.scopeId || "";
  }

  function renderFoundationRoutePanel(route = foundationLearningRoute()) {
    if (!elements.foundationRouteTitle) return;
    const progress = foundationProgress();
    const descriptor = foundationRouteDescriptor(route);
    const dailyScope = studyScopeConfig(state.studyScope);
    if (elements.foundationRouteContext) {
      elements.foundationRouteContext.textContent = `日課: ${dailyScope.shortLabel}`;
    }
    elements.foundationRouteStage.textContent = descriptor.stage;
    elements.foundationRouteTitle.textContent = descriptor.title;
    elements.foundationRouteText.textContent = descriptor.text;
    elements.foundationUnitsProgress.textContent = `${progress.completedUnits} / ${TEXTBOOK_CHAPTERS.length}`;
    elements.foundationQuestionsProgress.textContent = `${progress.contactedQuestions} / ${TEXTBOOK_IDS.length}`;
    elements.foundationPracticalProgress.textContent = `${progress.practicalGrounded} / ${PRACTICAL_QUESTION_IDS.length}`;
    setRouteAction(elements.foundationRoutePrimaryButton, descriptor, `日課: ${descriptor.button}`);

    const selected = selectedFoundationChapter();
    const selectedSnapshot = selected ? unitLearningSnapshot(selected) : null;
    const showSecondaryPractical = selectedSnapshot?.baseContacted === selectedSnapshot?.baseIds.length &&
      selectedSnapshot?.practicalGrounded < selectedSnapshot?.practicalItems.length;
    elements.foundationRoutePracticalButton.hidden = !showSecondaryPractical;
    if (showSecondaryPractical) {
      elements.foundationRoutePracticalButton.dataset.routeAction = "practical";
      elements.foundationRoutePracticalButton.dataset.unitId = selected.id;
    }
  }

  function runFoundationRouteAction(button) {
    const action = button?.dataset?.routeAction;
    const unitId = button?.dataset?.unitId || "";
    if (action === "unit") {
      const chapterIndex = CURRICULUM_CHAPTERS.findIndex((chapter) => chapter.id === unitId);
      if (chapterIndex >= 0) selectChapter(chapterIndex);
      elements.quizCard?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (action === "review") {
      startFocusedReviewQuest();
      elements.questCard?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (action === "practical") {
      startPracticalDrillForUnit(unitId);
      return;
    }
    if (action === "scope") {
      setStudyScope(button.dataset.scopeId);
      document.querySelector("#themeDrawer")?.setAttribute("open", "");
      return;
    }
    if (action === "official") {
      if (elements.passPlanPanel) elements.passPlanPanel.open = true;
      elements.passPlanPanel?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  function renderFoundationTodayCommand(mission) {
    const route = foundationLearningRoute();
    const descriptor = foundationRouteDescriptor(route);
    const progress = foundationProgress();
    const scopeChapters = textbookChaptersForScope();
    const scopeBaseIds = [...new Set(scopeChapters.flatMap((chapter) => chapter.ids))];
    const scopePracticalIds = [...new Set(scopeChapters.flatMap((chapter) =>
      practicalQuestionsForUnit(chapter.id).map((question) => question.id)
    ))];
    const due = scopeReviewIds().filter((id) =>
      isContacted(id) && !answeredToday(id) && !isRetained(id)
    ).length;

    elements.todayCommandKicker.textContent = `今やる・${descriptor.stage}`;
    elements.todayCommandTitle.textContent = descriptor.title;
    elements.todayCommandText.textContent = descriptor.text;
    elements.todayCommandPanel.classList.remove("is-complete");
    setRouteAction(elements.todayCommandStartButton, descriptor);
    const practicalScope = practicalScopeForStudyScope();
    const practicalLabel = practicalScopeLabel(practicalScope);
    const practicalStage = state.practicalDrill?.stage || "idle";
    const practicalActionText = ["active", "retry"].includes(practicalStage)
      ? "実践セットを再開する"
      : practicalStage === "complete"
        ? "実践結果を確認する"
        : `${practicalLabel}を10問で振り返る`;
    elements.todayCommandPracticalButton.hidden = false;
    elements.todayCommandPracticalButton.textContent = practicalActionText;
    const calculationStage = state.calculationDrill?.stage || "idle";
    elements.todayCommandCalculationButton.hidden = false;
    elements.todayCommandCalculationButton.textContent = calculationStage === "idle"
      ? "計算・金額を24問で特訓する"
      : calculationStage === "complete"
        ? "計算特訓の結果を確認する"
        : "計算特訓を再開する";
    elements.todayCommandOfficialActions.hidden = true;
    elements.todayCommandReviewActions.hidden = true;
    elements.todayCommandMinutesActions.hidden = true;
    renderOfficialDrillPanel(mission, 0);

    elements.missionBattleLabel.textContent = "読後問題";
    elements.missionOfficialLabel.textContent = "次の単元";
    elements.missionReviewLabel.textContent = "翌日復習";
    elements.missionMinutesLabel.textContent = ["active", "retry"].includes(practicalStage)
      ? "実践を再開"
      : practicalStage === "complete"
        ? "実践結果"
        : `${practicalLabel}を復習`;
    elements.missionMinutesStep.disabled = false;
    elements.missionMinutesStep.dataset.action = "practical";
    elements.missionMinutesStep.setAttribute("aria-label", practicalActionText);
    const activeSnapshot = route.snapshot || null;
    elements.missionBattleStatus.textContent = activeSnapshot
      ? `${activeSnapshot.baseContacted} / ${activeSnapshot.baseIds.length}`
      : `${scopeBaseIds.filter(isContacted).length} / ${scopeBaseIds.length}`;
    elements.missionOfficialStatus.textContent =
      `${scopeBaseIds.filter(isContacted).length} / ${scopeBaseIds.length}`;
    elements.missionReviewStatus.textContent = due ? `${due}件` : "持越しなし";
    elements.missionMinutesStatus.textContent = ["active", "retry"].includes(practicalStage)
      ? `${state.practicalDrill.position + 1}/${state.practicalDrill.queue.length}問を再開`
      : practicalStage === "complete"
        ? "次の進み方を選ぶ"
        : `10問・${scopePracticalIds.filter((id) =>
            state.practicalDrill?.history?.[id]?.lastConfidence === "confident"
          ).length}/${scopePracticalIds.length}定着`;

    const routeStep = route.kind === "unit"
      ? elements.missionBattleStep
      : route.kind === "review"
        ? elements.missionReviewStep
        : route.kind === "scope"
          ? elements.missionOfficialStep
          : elements.missionMinutesStep;
    [
      elements.missionBattleStep,
      elements.missionOfficialStep,
      elements.missionReviewStep,
      elements.missionMinutesStep
    ].forEach((item) => {
      item?.classList.remove("is-done", "is-locked", "is-current");
      item?.classList.toggle("is-current", item === routeStep);
    });
    renderFoundationRoutePanel(route);
  }

  function renderTodayCommand({
    mission,
    battleDone,
    officialDone,
    reviewDone,
    minutesDone,
    pendingReview
  }) {
    if (!elements.todayCommandPanel) return;
    if (!foundationCoverageComplete() && !pendingReview) {
      renderFoundationTodayCommand(mission);
      return;
    }
    const reviewDebt = battleDone && pendingReview?.date < todayKey()
      ? pendingReview
      : null;
    const commandMission = reviewDebt?.mission || mission;
    const step = !battleDone
      ? 1
      : reviewDebt
        ? 3
        : !officialDone
        ? 2
        : !reviewDone
          ? 3
          : !minutesDone
            ? 4
            : 5;
    const target = dailyQuestIds().length || DAILY_TARGET;
    const done = Math.min(dailyQuestDoneCount(), target);
    const remainingMinutes = Math.max(0, DAILY_STUDY_MINUTES - mission.minutes);
    const reviewTargets = commandMission.officialDrill?.reviewTargets || [];
    const drillDefinition = officialDrillDefinitionFor(commandMission.officialDrill);
    const command = step === 1
      ? {
          kicker: "今やる・STEP 1 / 4",
          title: "固定10問を解く",
          text: isMockMode()
            ? "模試を中断して日課へ戻り、各問の「こう解く」と全肢理由を読んで進む。"
            : `残り${Math.max(0, target - done)}問。解答後に「こう解く」と全肢理由を読み、次へ進む。`
        }
      : step === 2
        ? {
            kicker: "今やる・STEP 2 / 4",
            title: `${drillDefinition.label}を35分で解く`,
            text: `${drillDefinition.questionRange}を検索なしで解き、全20問に「根拠あり／消去法・勘」を付けて採点する。`
          }
        : step === 3
          ? {
              kicker: reviewDebt
                ? `持越し解除・${reviewDebt.date}`
                : "今やる・STEP 3 / 4",
              title: reviewTargets.length
                ? `${reviewDebt ? "未復習" : "誤答・根拠なし"}${reviewTargets.length}件を1行化する`
                : `${reviewDebt ? "未復習の" : ""}再現ルールを1行化する`,
              text: reviewTargets.length
                ? `${reviewDebt ? `${reviewDebt.date}の` : ""}${reviewTargets.map((number) => `問${number}`).join("・")}を、それぞれ「原因 → 次回ルール」で保存する。`
                : `${reviewDebt ? `${reviewDebt.date}の結果について、` : ""}次回も再現するための確認順を1行で保存する。`
            }
          : step === 4
            ? {
                kicker: "今やる・STEP 4 / 4",
                title: `合計90分まであと${remainingMinutes}分`,
                text: `今日は${mission.minutes}分。実際の合計学習時間を入力し、90分以上で完了にする。`
              }
            : {
                kicker: "今日の作戦・4 / 4",
                title: "90分クエスト完了",
                text: `固定10問・公式20問・誤答1行・合計${mission.minutes}分を記録済み。今日はここで切れる。`
              };

    elements.todayCommandKicker.textContent = command.kicker;
    elements.todayCommandTitle.textContent = command.title;
    elements.todayCommandText.textContent = command.text;
    elements.todayCommandPracticalButton.hidden = true;
    elements.todayCommandCalculationButton.hidden = true;
    elements.missionBattleLabel.textContent = "固定10問";
    elements.missionOfficialLabel.textContent = "公式問題20問";
    elements.missionReviewLabel.textContent = "誤答を1行化";
    elements.missionMinutesLabel.textContent = "合計90分";
    elements.missionMinutesStep.disabled = step !== 4;
    elements.missionMinutesStep.dataset.action = step === 4 ? "minutes" : "";
    elements.missionMinutesStep.setAttribute("aria-label", step === 4
      ? "今日の合計学習時間を入力する"
      : "合計学習時間の記録");
    elements.todayCommandPanel.classList.toggle("is-complete", step === 5);
    elements.todayCommandStartButton.hidden = step !== 1;
    elements.todayCommandStartButton.dataset.routeAction = "";
    elements.todayCommandStartButton.dataset.unitId = "";
    elements.todayCommandStartButton.dataset.scopeId = "";
    elements.todayCommandStartButton.textContent = isMockMode()
      ? "模試を中断して固定10問へ"
      : done
        ? `残り${Math.max(0, target - done)}問を続ける`
        : "固定10問を始める";
    elements.todayCommandOfficialActions.hidden = step !== 2;
    elements.todayCommandReviewActions.hidden = step !== 3;
    elements.todayCommandMinutesActions.hidden = step !== 4;
    renderMissionReviewInputs(commandMission, step);
    renderOfficialDrillPanel(commandMission, reviewDebt ? 0 : step);
    if (elements.missionMinutesInput && document.activeElement !== elements.missionMinutesInput) {
      elements.missionMinutesInput.value = String(mission.minutes);
    }

    [
      [elements.missionBattleStep, battleDone, 1],
      [elements.missionOfficialStep, officialDone, 2],
      [elements.missionReviewStep, reviewDone, 3],
      [elements.missionMinutesStep, minutesDone, 4]
    ].forEach(([item, doneState, itemStep]) => {
      if (!item) return;
      item.classList.toggle("is-done", doneState);
      item.classList.toggle("is-current", step === itemStep);
      item.classList.toggle("is-locked", step < itemStep && step !== 5);
    });
    if (reviewDebt) {
      elements.missionOfficialStep?.classList.add("is-locked");
      elements.missionReviewStep?.classList.add("is-current");
      elements.missionReviewStep?.classList.remove("is-locked");
    }
  }

  function renderPassPlan() {
    if (!elements.passPlanPanel) return;
    const phase = passPhaseFor();
    const examDays = daysUntil(FIRST_PASS_DEADLINE);
    const mission = missionForDate();
    const pendingReview = pendingOfficialReview();
    const readiness = officialReadinessStats();
    const latestOfficial = latestOfficialExam();
    const officialPractice = officialPracticeStats();
    const foundationComplete = foundationCoverageComplete();
    const battleDone = dailyQuestIsComplete();
    const officialDone = mission.officialQuestions;
    const reviewDone = mission.reviewed;
    const minutesDone = mission.minutes >= DAILY_STUDY_MINUTES;
    const missionCount = [battleDone, officialDone, reviewDone, minutesDone].filter(Boolean).length;

    elements.passPhaseTitle.textContent = phase.title;
    elements.passPhaseText.textContent = phase.text;
    elements.examCountdown.textContent = examDays > 0
      ? `D-${examDays}`
      : examDays === 0
        ? "本試験当日"
        : "本試験終了";
    elements.coreCoverageStatus.textContent = `接触 ${contactedCount()} / ${CURRICULUM_ORDER.length}`;
    elements.coreRetentionStatus.textContent = `定着 ${retainedCount()} / ${CURRICULUM_ORDER.length}`;
    const completedTextbookUnits = TEXTBOOK_CHAPTERS.filter((chapter) =>
      chapter.ids.every(isContacted)
    ).length;
    elements.foundationGateStatus.textContent = `単元 ${completedTextbookUnits} / ${TEXTBOOK_CHAPTERS.length}`;
    elements.foundationGateStatus.title = foundationComplete
      ? "基礎一周完了。公式演習を利用できます。"
      : `残り${TEXTBOOK_CHAPTERS.length - completedTextbookUnits}単元。未学習分野へ公式問題を先行させません。`;
    elements.textbookCoverageStatus.textContent =
      `接触 ${TEXTBOOK_IDS.filter(isContacted).length} / ${TEXTBOOK_IDS.length}`;
    elements.textbookRetentionStatus.textContent =
      `単元完了 ${completedTextbookUnits} / ${TEXTBOOK_CHAPTERS.length}・定着 ${retainedCount(TEXTBOOK_IDS)} / ${TEXTBOOK_IDS.length}`;
    elements.officialReadinessStatus.textContent =
      `${readiness.stability}・初見${readiness.initial.length}/${OFFICIAL_INITIAL_TARGET}` +
      `・再${readiness.retests.length}/${OFFICIAL_RETEST_TARGET}`;
    elements.officialReadinessStatus.title = readiness.latestThree.length
      ? `直近${readiness.latestThree.length}回 平均${readiness.mean.toFixed(1)}・最低${readiness.minimum}`
      : "120分・自動採点・当時法公式キーの記録だけを算入";
    elements.officialPracticeCoverageStatus.textContent =
      foundationComplete
        ? `接触 ${officialPractice.coveredQuestions} / 50`
        : "基礎一周後に解放";
    elements.officialPracticeTrendStatus.textContent = foundationComplete
      ? officialPractice.latest
        ? `直近${officialPractice.latest.score}/20・次は${officialPractice.planned.label.replace("令和7年度・公式20問 ", "")}`
        : `${officialPractice.planned.label.replace("令和7年度・公式20問 ", "")}から開始`
      : "未学習論点を先行させない";
    elements.dailyMissionStatus.textContent = foundationComplete
      ? `${missionCount} / 4`
      : `${completedTextbookUnits} / ${TEXTBOOK_CHAPTERS.length}単元`;
    elements.dailyMissionSummary.textContent = !foundationComplete
      ? "本文→読後問題→実践→翌日復習"
      : missionCount === 4
      ? `本日完了・${mission.minutes}分`
      : pendingReview?.date < todayKey() && battleDone
        ? `${pendingReview.date}の未復習を先に解除`
      : battleDone
        ? `次は${officialDone ? (reviewDone ? "90分まで記録" : "誤答・根拠なしを復習") : "令和7年公式20問"}`
        : `固定10問 ${dailyQuestDoneCount()} / ${dailyQuestIds().length || DAILY_TARGET}`;

    elements.missionBattleStep.classList.toggle("is-done", battleDone);
    elements.missionBattleStatus.textContent =
      `${Math.min(dailyQuestDoneCount(), dailyQuestIds().length || DAILY_TARGET)} / ${dailyQuestIds().length || DAILY_TARGET}`;
    elements.missionOfficialStatus.textContent = mission.officialDrill?.completed
      ? `${mission.officialDrill.score} / 20`
      : officialDone
        ? "完了記録済み"
        : "未完了";
    elements.missionReviewStatus.textContent = pendingReview?.date < todayKey()
      ? `${pendingReview.date} 未復習`
      : reviewDone
      ? mission.officialDrill?.completed && mission.officialDrill.reviewTargets.length === 0
        ? "対象0件"
        : mission.officialDrill?.reviewTargets.length
        ? `${mission.officialDrill.reviewTargets.length}件保存済み`
        : mission.reviewNote
          ? "1行保存済み"
          : "完了記録済み"
      : "未完了";
    elements.missionMinutesStatus.textContent =
      `${Math.min(mission.minutes, DAILY_STUDY_MINUTES)} / ${DAILY_STUDY_MINUTES}分`;
    renderTodayCommand({
      mission,
      battleDone,
      officialDone,
      reviewDone,
      minutesDone,
      pendingReview
    });
    elements.officialLedgerSummary.textContent =
      `初見 ${readiness.initial.length} / ${OFFICIAL_INITIAL_TARGET}・` +
      `再試験 ${readiness.retests.length} / ${OFFICIAL_RETEST_TARGET}`;
    elements.passPlanPanel
      .querySelectorAll("[data-pass-phase]")
      .forEach((item) => item.classList.toggle("is-current", item.dataset.passPhase === phase.id));
    renderOfficialExamYearOptions();
    renderOfficialExamSession();
    renderOfficialExamHistory();
    if (elements.officialExamStartButton) {
      const businessUnlocked = businessFullScoreOfficialUnlocked();
      const selectedDisabled = Boolean(elements.officialExamId?.selectedOptions?.[0]?.disabled);
      elements.officialExamStartButton.disabled =
        (!foundationComplete && !businessUnlocked) ||
        Boolean(activeLearningSession()) ||
        selectedDisabled;
      elements.officialExamStartButton.title = foundationComplete || businessUnlocked
        ? ""
        : `全45単元の読後問題、または業法の基礎44問定着＋変形${BUSINESS_FULLSCORE_EXPECTED_QUESTIONS}問初回走査後に解放（現在${completedTextbookUnits}/${TEXTBOOK_CHAPTERS.length}）`;
    }
    if (elements.officialDrillOpenButton) {
      elements.officialDrillOpenButton.disabled = !foundationComplete;
    }
    renderFoundationRoutePanel();
  }

  function saveMissionReview() {
    const pendingReview = pendingOfficialReview();
    const reviewDate = pendingReview?.date || todayKey();
    const mission = missionForDate(reviewDate);
    if (!dailyQuestIsComplete() || !mission.officialQuestions) {
      setTodayCommandStatus("先に公式20問まで完了してください。", true);
      return;
    }

    const drill = mission.officialDrill;
    if (drill?.completed && drill.reviewTargets.length) {
      const reviewNotes = {};
      const reviewCauses = {};
      let firstInvalid = null;
      drill.reviewTargets.forEach((number) => {
        const input = elements.todayReviewTargets
          ?.querySelector(`[data-review-question="${number}"]`);
        const causeInput = elements.todayReviewTargets
          ?.querySelector(`[data-review-cause="${number}"]`);
        const note = cleanMissionText(input?.value);
        const valid = drill.evidenceVersion >= OFFICIAL_DRILL_EVIDENCE_VERSION
          ? MISTAKE_CAUSE_IDS.has(causeInput?.value) && validReviewRule(note)
          : note.length >= 4;
        if (!valid && !firstInvalid) {
          firstInvalid = MISTAKE_CAUSE_IDS.has(causeInput?.value)
            ? input
            : causeInput;
        }
        if (note) reviewNotes[number] = note;
        if (MISTAKE_CAUSE_IDS.has(causeInput?.value)) {
          reviewCauses[number] = causeInput.value;
        }
      });
      if (firstInvalid) {
        setTodayCommandStatus(
          `問${firstInvalid.dataset.reviewQuestion || firstInvalid.dataset.reviewCause}は原因を選び、「原因 → 具体的に何を見る・書く」の形で入力してください。`,
          true
        );
        firstInvalid.focus();
        return;
      }
      const officialDrill = {
        ...drill,
        reviewNotes,
        reviewCauses
      };
      const reviewNote = cleanMissionText(
        `問${drill.reviewTargets[0]}: ${reviewNotes[drill.reviewTargets[0]]}`
      );
      setMissionForDate(reviewDate, {
        reviewed: true,
        reviewNote,
        officialDrill
      });
      saveState();
      logStudyEvent("pass-mission", {
        field: "reviewed",
        missionDate: reviewDate,
        completed: true,
        reviewTargets: drill.reviewTargets,
        reviewNotes,
        reviewCauses
      });
      renderPassPlan();
      setTodayCommandStatus(
        `${reviewDate}の復習ルール${drill.reviewTargets.length}件を保存しました。最新状態から次の工程を再選定しました。`
      );
      return;
    }

    const reviewNote = cleanMissionText(elements.todayReviewInput?.value);
    if (!validReviewRule(reviewNote)) {
      setTodayCommandStatus("「原因 → 次回ルール」の形で1行入力してください。", true);
      elements.todayReviewInput?.focus();
      return;
    }
    setMissionForDate(reviewDate, { reviewed: true, reviewNote });
    saveState();
    logStudyEvent("pass-mission", {
      field: "reviewed",
      missionDate: reviewDate,
      completed: true,
      reviewNote,
      mission: missionForDate(reviewDate)
    });
    renderPassPlan();
    setTodayCommandStatus(
      `${reviewDate}の再現ルールを保存しました。最新状態から次の工程を再選定しました。`
    );
  }

  function saveMissionMinutes() {
    const value = elements.missionMinutesInput?.valueAsNumber;
    if (!Number.isFinite(value) || value < 0 || value > 600) {
      setTodayCommandStatus("学習時間は0〜600分で入力してください。", true);
      setOfficialExamStatus("学習時間は0〜600分で入力してください。", true);
      return;
    }
    setMissionForDate(todayKey(), { minutes: value });
    saveState();
    logStudyEvent("pass-mission", {
      field: "minutes",
      minutes: boundedInteger(value, 600),
      mission: missionForDate()
    });
    setOfficialExamStatus(`今日の学習時間を${boundedInteger(value, 600)}分で保存しました。`);
    renderPassPlan();
    setTodayCommandStatus(
      value >= DAILY_STUDY_MINUTES
        ? `合計${boundedInteger(value, 600)}分。今日の90分クエスト完了です。`
        : `合計${boundedInteger(value, 600)}分で保存。あと${DAILY_STUDY_MINUTES - boundedInteger(value, 600)}分です。`
    );
  }

  function officialDrillExamIdsTouched() {
    return new Set(
      Object.values(state.missionLog || {})
        .map((mission) => normalizeOfficialDrill(mission?.officialDrill))
        .filter((drill) => drill?.startedAt)
        .map((drill) => {
          const definition = officialDrillDefinitionById(drill.setId);
          return String(definition?.examId || definition?.year || "");
        })
        .filter((examId) => officialExamDefinition(examId))
    );
  }

  function recordOfficialExam(event) {
    event?.preventDefault();
    const fields = {
      examId: String(elements.officialExamYear?.value || ""),
      score: elements.officialExamScore?.valueAsNumber,
      rights: elements.officialRightsScore?.valueAsNumber,
      restrictions: elements.officialRestrictionsScore?.valueAsNumber,
      business: elements.officialBusinessScore?.valueAsNumber,
      taxOther: elements.officialTaxOtherScore?.valueAsNumber,
      elapsedMinutes: elements.officialExamMinutes?.valueAsNumber
    };
    const definition = officialExamDefinition(fields.examId);
    const numericFields = [
      fields.score,
      fields.rights,
      fields.restrictions,
      fields.business,
      fields.taxOther,
      fields.elapsedMinutes
    ];
    if (!definition || numericFields.some((value) => !Number.isFinite(value))) {
      setOfficialExamStatus("試験回・合計・4分野・時間をすべて入力してください。", true);
      return;
    }
    if (numericFields.some((value) => !Number.isInteger(value))) {
      setOfficialExamStatus("得点と時間は整数で入力してください。", true);
      return;
    }
    if (
      fields.score < 0 || fields.score > 50 ||
      fields.rights < 0 || fields.rights > 14 ||
      fields.restrictions < 0 || fields.restrictions > 8 ||
      fields.business < 0 || fields.business > 20 ||
      fields.taxOther < 0 || fields.taxOther > 8 ||
      fields.elapsedMinutes < 1 || fields.elapsedMinutes > 180
    ) {
      setOfficialExamStatus("各欄を表示されている上限内で入力してください。", true);
      return;
    }
    const sectionTotal =
      fields.rights + fields.restrictions + fields.business + fields.taxOther;
    if (sectionTotal !== fields.score) {
      setOfficialExamStatus(
        `分野別の合計${sectionTotal}点と総得点${fields.score}点が一致しません。`,
        true
      );
      return;
    }
    const entry = {
      ...fields,
      recordId: createOpaqueId("official-manual"),
      year: definition.year,
      attemptType: "initial",
      sourceMode: "self-report",
      timed120: false,
      lawChecked: false,
      answers: {},
      completedAt: new Date().toISOString()
    };
    const previousState = cloneStateForSync(state);
    recordOfficialExamExposure(fields.examId, "manual", entry.completedAt);
    state.officialExamHistory = normalizeOfficialExamHistory([
      ...(state.officialExamHistory || []),
      entry
    ]);
    const mission = missionForDate();
    setMissionForDate(todayKey(), {
      minutes: Math.max(mission.minutes, boundedInteger(fields.elapsedMinutes, 180))
    });
    if (!saveState()) {
      state = previousState;
      setOfficialExamStatus(
        "旧記録を保存できませんでした。保存領域と別タブを確認してください。",
        true
      );
      return;
    }
    logStudyEvent("official-past-exam", entry);
    setOfficialExamStatus(
      `${definition.label} ${fields.score}/50を参考記録として保存しました。自己申告のため安定度には算入しません。`
    );
    elements.officialExamManualForm?.reset();
    if (elements.officialExamMinutes) elements.officialExamMinutes.value = "120";
    renderPassPlan();
  }

  function shortDateLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "日時不明";
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function isContacted(id) {
    return effectiveAttempts(statsFor(id)) > 0;
  }

  function legacyProgress(ids = LEGACY_ORDER) {
    return {
      contacted: ids.filter(isContacted).length,
      total: ids.length
    };
  }

  function contactedCount() {
    return CURRICULUM_ORDER.filter(isContacted).length;
  }

  function scopeContactedCount() {
    return scopeNewIds().filter(isContacted).length;
  }

  function remainingExamCoverageCount() {
    return Math.max(0, CURRICULUM_ORDER.length - contactedCount());
  }

  function remainingFirstPassCount() {
    return Math.max(0, scopeNewIds().length - scopeContactedCount());
  }

  function firstPassDaysLeft() {
    const [year, month, day] = FIRST_PASS_DEADLINE.split("-").map(Number);
    const deadline = new Date(year, month - 1, day, 23, 59, 59);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.ceil((deadline - today) / 86400000));
  }

  function firstPassDailyPace() {
    return Math.max(1, Math.ceil(remainingFirstPassCount() / Math.max(1, firstPassDaysLeft())));
  }

  function firstPassPaceText() {
    const remaining = remainingFirstPassCount();
    if (remaining === 0) return "一周完了";
    if (PUBLIC_STATIC_MODE) return `一周まで残り${remaining}問`;
    if (firstPassDaysLeft() === 0) {
      return `${FIRST_PASS_DEADLINE_LABEL}期限超過・今日は固定${Math.min(DAILY_TARGET, remaining)}問から再開`;
    }
    return `${FIRST_PASS_DEADLINE_LABEL}まで1日${firstPassDailyPace()}問`;
  }

  function firstPassRemainingText() {
    if (PUBLIC_STATIC_MODE) {
      return `${studyScopeConfig().shortLabel}の未接触は残り${remainingFirstPassCount()}問`;
    }
    if (firstPassDaysLeft() === 0 && remainingFirstPassCount() > 0) {
      return `期限超過・残り${remainingFirstPassCount()}問`;
    }
    return `${FIRST_PASS_DEADLINE_LABEL}まで残り${remainingFirstPassCount()}問`;
  }

  function currentChapterContactSummary() {
    const question = currentQuestion();
    const chapter = question.chapter;
    if (!chapter) return null;
    const contacted = chapter.ids.filter(isContacted).length;
    return {
      label: chapter.label,
      contacted,
      total: chapter.ids.length,
      remaining: Math.max(0, chapter.ids.length - contacted)
    };
  }

  function setFirstPassUrl(enabled) {
    const url = new URL(window.location.href);
    ["pass", "firstpass", "onepass"].forEach((key) => url.searchParams.delete(key));
    if (enabled) {
      url.searchParams.set("pass", "1");
    }
    window.history.replaceState(null, "", url);
  }

  function nextFirstPassId() {
    const ids = scopeNewIds();
    const currentCurriculumIndex = ids.indexOf(currentId());
    for (let offset = 1; offset <= ids.length; offset += 1) {
      const index = (Math.max(-1, currentCurriculumIndex) + offset) % ids.length;
      const id = ids[index];
      if (!isContacted(id)) {
        return id;
      }
    }
    return null;
  }

  function firstPassStartId() {
    if (!state.answered && scopeNewIds().includes(currentId()) && !isContacted(currentId())) {
      return currentId();
    }
    return nextFirstPassId() || scopeNewIds().find((id) => !isContacted(id)) || scopeNewIds()[0];
  }

  function weaknessScore(id) {
    const stats = statsFor(id);
    // Once the central event snapshot has caught up, its mastery decision is
    // authoritative. Recomputing from lifetime wrong/correct totals can revive
    // an already-cleared weakness (for example, q127 after next-day mastery).
    // Keep the local heuristic only for a newer answer that has not synced yet.
    const centralIsCurrent = typeof stats.centralWeak === "boolean" && !hasNewerLocalAnswer(stats);
    const wrong = centralIsCurrent ? 0 : effectiveWrongCount(stats);
    const correct = centralIsCurrent ? 0 : effectiveCorrectCount(stats);
    const deficit = Math.max(0, wrong - correct);
    const cutDeficit = centralIsCurrent
      ? 0
      : Math.max(0, (stats.cutCheckWrong || 0) - (stats.cutCheckCorrect || 0));
    const manualMark = state.marked[id] && !state.autoMarked[id] ? 2 : 0;
    const autoMark = state.autoMarked[id] ? 1 : 0;
    const firstMiss = wrong > 0 && correct === 0 ? 1 : 0;
    const unsure = !centralIsCurrent && (stats.lastConfidence === "unsure" || stats.lastConfidence === "cuts") ? 1 : 0;
    return deficit * 3 + cutDeficit * 2 + manualMark + autoMark + firstMiss + unsure;
  }

  function weakIds() {
    return ORDER
      .filter((id) => weaknessScore(id) > 0)
      .sort((a, b) => {
        const scoreDiff = weaknessScore(b) - weaknessScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        return (statsFor(a).lastStep || 0) - (statsFor(b).lastStep || 0);
      });
  }

  function curriculumWeakIds() {
    return weakIds().filter((id) => CURRICULUM_ORDER.includes(id));
  }

  function nextTargetId() {
    if (isMockMode()) {
      return mockQuestionIds()[state.mock.position + 1] || null;
    }
    if (isFirstPassMode()) {
      return nextFirstPassId();
    }
    if (isChapterMode()) {
      return nextChapterModeId();
    }
    if (state.index >= ORDER.length - 1) {
      return null;
    }
    if (isDailyQuestQuestion(currentId())) {
      const questId = nextDailyQuestId();
      if (questId && questId !== currentId()) {
        return questId;
      }
      if (dailyQuestDoneCount() >= dailyQuestIds().length) {
        return null;
      }
    }
    if (isChapterEnd()) {
      return null;
    }
    const chapter = idToChapter.get(currentId());
    const localIndex = chapter?.ids.indexOf(currentId()) ?? -1;
    return localIndex >= 0
      ? chapter.ids[localIndex + 1] || null
      : ORDER[state.index + 1] || null;
  }

  function nextActionLabel() {
    if (isMockMode()) {
      return state.mock.position >= mockQuestionIds().length - 1 ? "採点結果を見る" : "次の問題へ";
    }
    if (isChapterMode()) {
      return nextChapterModeId() ? "次のテーマ問題へ" : "テーマ結果を見る";
    }
    if (isDailyQuestQuestion(currentId()) && dailyQuestDoneCount() >= dailyQuestIds().length) {
      const questionCount = dailyQuestIds().length || DAILY_TARGET;
      return state.daily.planMode === "unit"
        ? `読後${questionCount}問を終了`
        : `今日の${questionCount}問を終了`;
    }
    if (isFirstPassMode()) {
      return nextFirstPassId() ? "次の未接触へ" : "一周完了";
    }
    if (state.index >= ORDER.length - 1) {
      return "結果を見る";
    }
    if (isChapterEnd()) {
      return nextFirstPassId() ? "次の未接触へ" : "全問接触完了";
    }
    return state.answered?.correct ? "次の敵へ" : "次の一問へ";
  }

  function renderAnswerDock(question) {
    if (!elements.answerDock) return;
    const answered = state.answered;
    const visible = Boolean(answered && !state.finished && !isDailyQuestPaused());
    elements.answerDock.hidden = !visible;
    document.body.classList.toggle("has-answer-dock", visible);
    if (!visible) return;

    if (isMockMode()) {
      const targetId = nextTargetId();
      const targetQuestion = targetId ? QUESTIONS[targetId] : null;
      elements.dockResultText.textContent = "解答を記録";
      elements.dockTargetText.textContent = targetQuestion
        ? `次 ${state.mock.position + 2}/50 ・ ${targetQuestion.tag}`
        : "50問終了・採点へ";
      elements.dockNextLabel.textContent = nextActionLabel();
      elements.dockExplainButton.hidden = true;
      elements.dockUnsureButton.hidden = true;
      elements.dockNextButton.classList.remove("is-reward", "is-near-reward");
      return;
    }

    elements.dockExplainButton.hidden = false;
    const resultParts = [answered.correct ? "撃破" : "要復習"];
    if (answered.levelUp) resultParts.push(`Lv.${answered.newLevel}`);
    if (answered.chestOpened) resultParts.push(`${answered.chestTier?.label || "銅"}宝箱`);
    if (answered.milestone) resultParts.push(`${answered.milestone}体`);
    (answered.questRewards || []).forEach((item) => resultParts.push(`戦果${item.label}`));
    if (answered.correct && !answered.chestOpened && state.chestProgress === 4) {
      resultParts.push("次で宝箱");
    }
    if (lastSuccessfulSaveAt) resultParts.push("自動保存済み");
    const xpResult = typeof answered.xpReward === "number" ? ` / EXP +${answered.xpReward}` : "";
    elements.dockResultText.textContent = `${resultParts.join("・")}${xpResult}`;

    const dailyComplete = !isChapterMode() && Boolean(
      isDailyQuestQuestion(currentId()) && dailyQuestDoneCount() >= dailyQuestIds().length
    );
    const targetId = nextTargetId();
    const targetQuestion = targetId ? QUESTIONS[targetId] : null;
    if (dailyComplete) {
      const nextFoundationId = nextFirstPassId();
      if (state.daily.planMode === "unit") {
        const questionCount = dailyQuestIds().length || DAILY_TARGET;
        elements.dockTargetText.textContent = nextFoundationId
          ? `読後${questionCount}問完了・次の単元へ`
          : `読後${questionCount}問完了・全45単元接触`;
      } else {
        elements.dockTargetText.textContent = nextFoundationId
          ? "固定10問完走・次はRETIO公式20問"
          : "固定10問完走・全分野接触完了。次は公式20問";
      }
    } else if (targetQuestion) {
      elements.dockTargetText.textContent = `次 ${questionPositionText(targetId)} ・ ${targetQuestion.tag}`;
    } else if (isFirstPassMode()) {
      elements.dockTargetText.textContent = "全分野コア100に接触完了";
    } else if (isChapterEnd()) {
      elements.dockTargetText.textContent = `${question.chapter?.label || "現在のテーマ"}を完了`;
    } else {
      elements.dockTargetText.textContent = "最終結果を表示";
    }
    elements.dockNextLabel.textContent = nextActionLabel();
    if (elements.dockUnsureButton) {
      const uncertain = answered.confidence === "unsure" || answered.confidence === "cuts";
      elements.dockUnsureButton.hidden = !answered.correct;
      elements.dockUnsureButton.disabled = uncertain;
      elements.dockUnsureButton.textContent = uncertain ? "迷い済" : "迷いに残す";
      elements.dockUnsureButton.classList.toggle("is-selected", uncertain);
    }
    elements.dockNextButton.classList.toggle(
      "is-reward",
      Boolean(
        answered.levelUp ||
        answered.chestOpened ||
        answered.milestone ||
        answered.questRewards?.length
      )
    );
    elements.dockNextButton.classList.toggle(
      "is-near-reward",
      Boolean(answered.correct && !answered.chestOpened && state.chestProgress === 4)
    );
  }

  function weakestTopic() {
    const topics = new Map();
    weakIds().forEach((id) => {
      const question = QUESTIONS[id];
      if (!question) return;
      const chapter = idToChapter.get(id);
      const key = question.tag || chapter?.label || "宅建業法";
      const current = topics.get(key) || {
        label: key,
        chapter: chapter?.label || "宅建業法",
        score: 0,
        wrong: 0,
        count: 0
      };
      current.score += weaknessScore(id);
      current.wrong += statsFor(id).wrong || 0;
      current.count += 1;
      topics.set(key, current);
    });
    return [...topics.values()].sort((a, b) => b.score - a.score)[0] || null;
  }

  function goToQuestion(id) {
    const nextIndex = ORDER.indexOf(id);
    if (nextIndex < 0) return;
    state.index = nextIndex;
    state.answered = null;
    state.activeCutCheck = null;
    state.finished = false;
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function formatCalculationYen(value) {
    return `${Number(value).toLocaleString("ja-JP")}円`;
  }

  function currentCalculationQuestion() {
    const drill = state.calculationDrill;
    return CALCULATION_QUESTION_BY_ID[drill?.queue?.[drill.position]] || null;
  }

  function addCalculationId(list, id) {
    return list.includes(id) ? list : [...list, id];
  }

  function removeCalculationId(list, id) {
    return list.filter((item) => item !== id);
  }

  function renderCalculationDrill() {
    if (!elements.calculationDrillPanel || !CALCULATION_QUESTION_IDS.length) return;
    const drill = state.calculationDrill;
    const contacted = CALCULATION_QUESTION_IDS.filter((id) => (drill.history[id]?.attempts || 0) > 0).length;
    const retryCount = drill.retryIds.length;
    elements.calculationDrillSummary.textContent = `累計接触 ${contacted} / ${CALCULATION_QUESTION_IDS.length}・再出題 ${retryCount}`;
    elements.calculationDrillRetryStatus.textContent = `再出題 ${retryCount}`;

    const idle = drill.stage === "idle";
    const complete = drill.stage === "complete";
    if (!idle) elements.calculationDrillPanel.open = true;
    elements.calculationDrillQuestion.hidden = idle || complete;
    elements.calculationDrillComplete.hidden = !complete;
    elements.calculationDrillResetButton.hidden = complete;
    elements.calculationDrillResetButton.textContent = idle ? "24問を始める" : "24問を最初から";
    if (idle) {
      elements.calculationDrillStage.textContent = "計算ルールを確認";
      elements.calculationDrillProgress.textContent = "未開始";
      return;
    }
    if (complete) {
      elements.calculationDrillStage.textContent = "全件クリア";
      elements.calculationDrillProgress.textContent = `${CALCULATION_QUESTION_IDS.length} / ${CALCULATION_QUESTION_IDS.length}`;
      elements.calculationDrillCompleteText.textContent =
        `初回24問と再出題を完了。累計${drill.attempts}解答・正解${drill.correctAttempts}回です。`;
      return;
    }

    const item = currentCalculationQuestion();
    if (!item) return;
    const attempt = drill.currentAttempt;
    elements.calculationDrillStage.textContent = drill.stage === "retry" ? "迷い・誤答を再出題" : "初回24問";
    elements.calculationDrillProgress.textContent = `${drill.position + 1} / ${drill.queue.length}`;
    elements.calculationDrillCategory.textContent = item.category;
    elements.calculationDrillPrompt.textContent = item.prompt;
    elements.calculationDrillChoices.replaceChildren();
    item.choices.forEach((value, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calculation-drill-choice";
      button.textContent = `${index + 1}. ${formatCalculationYen(value)}`;
      button.disabled = Boolean(attempt);
      if (attempt) {
        button.classList.toggle("is-selected", attempt.selected === index);
        button.classList.toggle("is-correct", item.answer === index);
        button.classList.toggle("is-wrong", attempt.selected === index && !attempt.correct);
      }
      button.addEventListener("click", () => answerCalculationDrill(index));
      elements.calculationDrillChoices.append(button);
    });

    elements.calculationDrillFeedback.hidden = !attempt;
    if (!attempt) return;
    elements.calculationDrillVerdict.textContent = attempt.correct
      ? `正解 ${formatCalculationYen(item.choices[item.answer])}`
      : `誤答。正解は ${formatCalculationYen(item.choices[item.answer])}。再出題へ追加した。`;
    elements.calculationDrillFormula.replaceChildren(
      ...item.formula.map((step) => {
        const row = document.createElement("li");
        row.textContent = step;
        return row;
      })
    );
    elements.calculationDrillTrap.textContent = `ひっかけ: ${item.trap}`;
    elements.calculationDrillSource.replaceChildren(
      ...item.sources.map((sourceKey) => {
        const source = CALCULATION_DRILL.SOURCES[sourceKey];
        const link = document.createElement("a");
        link.className = "official-source-link";
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `公式根拠: ${source.label}（基準日 ${CALCULATION_DRILL.LEGAL_BASELINE}）`;
        return link;
      })
    );
    elements.calculationDrillConfidence.hidden = !attempt.correct;
    elements.calculationDrillConfidence
      .querySelectorAll("[data-calculation-confidence]")
      .forEach((button) => {
        button.classList.toggle(
          "is-selected",
          button.dataset.calculationConfidence === attempt.confidence
        );
      });
    elements.calculationDrillNextButton.disabled = attempt.correct && !attempt.confidence;
    elements.calculationDrillNextButton.textContent = drill.position + 1 < drill.queue.length
      ? "次の計算へ"
      : (retryCount ? "再出題へ進む" : "特訓を完了する");
  }

  function answerCalculationDrill(selected) {
    const drill = state.calculationDrill;
    const item = currentCalculationQuestion();
    if (!item || drill.currentAttempt || !Number.isInteger(selected) || selected < 0 || selected > 3) return;
    const correct = selected === item.answer;
    const answeredAt = new Date().toISOString();
    const previous = drill.history[item.id] || {
      attempts: 0,
      correct: 0,
      wrong: 0,
      uncertain: 0
    };
    drill.history[item.id] = {
      ...previous,
      attempts: previous.attempts + 1,
      correct: previous.correct + (correct ? 1 : 0),
      wrong: previous.wrong + (correct ? 0 : 1),
      lastSelected: selected,
      lastCorrect: correct,
      lastConfidence: correct ? "" : "wrong",
      lastAnsweredAt: answeredAt
    };
    drill.attempts += 1;
    drill.correctAttempts += correct ? 1 : 0;
    drill.currentAttempt = {
      id: item.id,
      selected,
      correct,
      confidence: correct ? "" : "wrong"
    };
    if (!correct) {
      drill.retryIds = addCalculationId(drill.retryIds, item.id);
      drill.masteredIds = removeCalculationId(drill.masteredIds, item.id);
    }
    saveState();
    renderCalculationDrill();
  }

  function setCalculationConfidence(confidence) {
    const drill = state.calculationDrill;
    const attempt = drill.currentAttempt;
    const item = currentCalculationQuestion();
    if (!item || !attempt?.correct || !["confident", "uncertain"].includes(confidence)) return;
    const history = drill.history[item.id];
    if (attempt.confidence === "uncertain" && history) {
      history.uncertain = Math.max(0, (history.uncertain || 0) - 1);
    }
    attempt.confidence = confidence;
    if (history) {
      history.uncertain = (history.uncertain || 0) + (confidence === "uncertain" ? 1 : 0);
      history.lastConfidence = confidence;
    }
    if (confidence === "uncertain") {
      drill.retryIds = addCalculationId(drill.retryIds, item.id);
      drill.masteredIds = removeCalculationId(drill.masteredIds, item.id);
    } else {
      drill.retryIds = removeCalculationId(drill.retryIds, item.id);
      drill.masteredIds = addCalculationId(drill.masteredIds, item.id);
    }
    saveState();
    renderCalculationDrill();
  }

  function advanceCalculationDrill() {
    const drill = state.calculationDrill;
    if (!drill.currentAttempt || (drill.currentAttempt.correct && !drill.currentAttempt.confidence)) return;
    if (drill.position + 1 < drill.queue.length) {
      drill.position += 1;
      drill.currentAttempt = null;
    } else if (drill.retryIds.length) {
      drill.stage = "retry";
      drill.queue = [...drill.retryIds];
      drill.position = 0;
      drill.currentAttempt = null;
    } else {
      drill.stage = "complete";
      drill.queue = [];
      drill.position = 0;
      drill.currentAttempt = null;
      drill.completedAt = new Date().toISOString();
    }
    saveState();
    renderCalculationDrill();
    renderPassPlan();
    window.requestAnimationFrame(() =>
      elements.calculationDrillPanel?.scrollIntoView({ block: "start", behavior: "smooth" })
    );
  }

  function startCalculationDrill() {
    state.calculationDrill = {
      ...state.calculationDrill,
      version: CALCULATION_DRILL?.VERSION || 1,
      stage: "active",
      queue: [...CALCULATION_QUESTION_IDS],
      position: 0,
      currentAttempt: null,
      retryIds: [],
      completedAt: ""
    };
    if (elements.calculationDrillPanel) elements.calculationDrillPanel.open = true;
    saveState();
    renderCalculationDrill();
    renderPassPlan();
    window.requestAnimationFrame(() =>
      elements.calculationDrillPanel?.scrollIntoView({ block: "start", behavior: "smooth" })
    );
  }

  function openCalculationDrill() {
    if (state.calculationDrill?.stage === "idle") {
      startCalculationDrill();
      return;
    }
    if (elements.calculationDrillPanel) elements.calculationDrillPanel.open = true;
    renderCalculationDrill();
    window.requestAnimationFrame(() =>
      elements.calculationDrillPanel?.scrollIntoView({ block: "start", behavior: "smooth" })
    );
  }

  function exitCalculationDrill() {
    if (elements.calculationDrillPanel) elements.calculationDrillPanel.open = false;
    elements.todayCommandPanel?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function addPracticalId(list, id) {
    return list.includes(id) ? list : [...list, id];
  }

  function removePracticalId(list, id) {
    return list.filter((item) => item !== id);
  }

  function practicalRetryIdsForBank(bankId) {
    const ids = bankId === BUSINESS_FULLSCORE_BANK_ID
      ? BUSINESS_FULLSCORE_QUESTION_IDS
      : PRACTICAL_QUESTION_IDS;
    return ids.filter((id) =>
      ["wrong", "uncertain"].includes(state.practicalDrill?.history?.[id]?.lastConfidence)
    );
  }

  function diagnosticTagsForPracticalSelection(question, selected, uncertain = false) {
    if (state.practicalDrill?.bankId !== BUSINESS_FULLSCORE_BANK_ID || !question) return [];
    if (!uncertain && typeof BUSINESS_FULLSCORE_BANK?.diagnosticsForSelection === "function") {
      try {
        return normalizeBusinessTagList(
          BUSINESS_FULLSCORE_BANK.diagnosticsForSelection(question, selected)
        );
      } catch {
        // A malformed diagnostic payload must not enter the save.
      }
    }
    return normalizeBusinessTagList(question.diagnosticTags);
  }

  function recordBusinessDiagnostic(history, tags) {
    const valid = normalizeBusinessTagList(tags);
    if (!history || !valid.length) return false;
    const counts = normalizeBusinessMistakeTags(history.mistakeTags);
    valid.forEach((tag) => { counts[tag] = Math.min(10000, (counts[tag] || 0) + 1); });
    history.mistakeTags = counts;
    history.lastMistakeTags = valid;
    return true;
  }

  function practicalScopeLabel(scope) {
    return PRACTICAL_SCOPE_LABELS[scope] || PRACTICAL_SCOPE_LABELS.business;
  }

  function practicalScopeForStudyScope(scope = state.studyScope) {
    if (["business", "rights", "law-other", "all"].includes(scope)) {
      return scope === "law-other" ? "lawOther" : scope;
    }
    return "business";
  }

  function practicalScopeQuestions(scope) {
    return PRACTICAL_QUESTIONS.filter((question) =>
      scope === "all" ||
      question.scopeId === scope ||
      (scope === "lawOther" && ["restrictions", "taxOther"].includes(question.scopeId))
    );
  }

  function fullScoreQuestionsForUnit(unitId) {
    return BUSINESS_FULLSCORE_QUESTIONS.filter((question) => question.unitId === unitId);
  }

  function activePracticalQuestions(drill = state.practicalDrill) {
    return drill?.bankId === BUSINESS_FULLSCORE_BANK_ID
      ? BUSINESS_FULLSCORE_QUESTIONS
      : PRACTICAL_QUESTIONS;
  }

  function activePracticalUnits(drill = state.practicalDrill) {
    return drill?.bankId === BUSINESS_FULLSCORE_BANK_ID
      ? BUSINESS_FULLSCORE_UNITS
      : (PRACTICAL_VARIATIONS?.UNITS || []);
  }

  function presentPracticalQuestion(question, bankId, presentationKey) {
    if (!question || bankId !== BUSINESS_FULLSCORE_BANK_ID) return question || null;
    if (typeof BUSINESS_FULLSCORE_BANK?.presentQuestion === "function") {
      try {
        const presented = normalizeFullScoreQuestion(
          BUSINESS_FULLSCORE_BANK.presentQuestion(question, presentationKey)
        );
        if (presented?.id === question.id && presented.choices.length === 4) return presented;
      } catch {
        // Fall through to the local deterministic presentation. Bank content stays intact.
      }
    }
    const order = BUSINESS_MASTERY.choiceOrder(question.id, presentationKey, question.choices.length);
    const statementExplanations = Array.isArray(question.statementExplanations)
      ? order.map((index) => question.statementExplanations[index]).filter(Boolean)
      : [];
    return {
      ...question,
      choices: order.map((index) => question.choices[index]),
      answer: order.indexOf(question.answer),
      statementExplanations
    };
  }

  function renderPracticalDrillLauncher() {
    if (!elements.practicalDrillStartButton) return;
    const requestedScope = String(elements.practicalDrillScope?.value || state.practicalDrill.scope);
    const scope = PRACTICAL_SCOPES.includes(requestedScope) ? requestedScope : "business";
    const requestedSize = Number(elements.practicalDrillSize?.value || state.practicalDrill.sessionSize);
    const sessionSize = PRACTICAL_SESSION_SIZES.includes(requestedSize) ? requestedSize : 10;
    const visibleSize = Math.min(sessionSize, practicalScopeQuestions(scope).length);
    elements.practicalDrillStartButton.textContent =
      `${practicalScopeLabel(scope)}を${visibleSize}問で始める`;
  }

  function practicalPriority(question, drill = state.practicalDrill) {
    const history = drill.history[question.id] || {};
    if (question.scopeId === "business") {
      return BUSINESS_MASTERY.priorityFor({
        ...history,
        lastConfidence: drill.retryIds.includes(question.id) ? "wrong" : history.lastConfidence
      }, new Date());
    }
    const needsRetry = drill.retryIds.includes(question.id) ||
      ["wrong", "uncertain"].includes(history.lastConfidence);
    if (needsRetry) return 0;
    if (!(history.attempts > 0)) return 1;
    return 2;
  }

  function practicalDiagnosticWeight(question, drill = state.practicalDrill) {
    if (drill?.bankId !== BUSINESS_FULLSCORE_BANK_ID) return 0;
    return Object.values(normalizeBusinessMistakeTags(drill.history?.[question.id]?.mistakeTags))
      .reduce((sum, count) => sum + count, 0);
  }

  function buildPracticalQueueFrom(eligible, requestedSize, units, drill = state.practicalDrill) {
    const target = Math.min(requestedSize, eligible.length);
    const groups = new Map();
    eligible.forEach((question) => {
      const group = groups.get(question.unitId) || [];
      group.push(question);
      groups.set(question.unitId, group);
    });
    const rotation = drill.sessionsCompleted || 0;
    groups.forEach((items) => {
      items.sort((left, right) =>
        practicalPriority(left, drill) - practicalPriority(right, drill) ||
        practicalDiagnosticWeight(right, drill) - practicalDiagnosticWeight(left, drill) ||
        (drill.history[left.id]?.attempts || 0) - (drill.history[right.id]?.attempts || 0) ||
        (((Number(left.queueRank) || 0) - rotation) % 4 + 4) % 4 -
          ((((Number(right.queueRank) || 0) - rotation) % 4 + 4) % 4) ||
        left.id.localeCompare(right.id)
      );
    });
    const unitOrder = (units || [])
      .filter((unit) => groups.has(unit.id))
      .sort((left, right) => {
        const leftBest = Math.min(...groups.get(left.id).map((question) => practicalPriority(question, drill)));
        const rightBest = Math.min(...groups.get(right.id).map((question) => practicalPriority(question, drill)));
        const leftWeight = Math.max(...groups.get(left.id).map((question) => practicalDiagnosticWeight(question, drill)));
        const rightWeight = Math.max(...groups.get(right.id).map((question) => practicalDiagnosticWeight(question, drill)));
        return leftBest - rightBest ||
          rightWeight - leftWeight ||
          (((left.part * 31 + left.page - rotation * 7) % 997) + 997) % 997 -
            ((((right.part * 31 + right.page - rotation * 7) % 997) + 997) % 997);
      });
    const result = [];
    for (const priority of [0, 1, 2, 3, 4, 5]) {
      const priorityGroups = new Map(unitOrder.map((unit) => [
        unit.id,
        (groups.get(unit.id) || []).filter((question) => practicalPriority(question, drill) === priority)
      ]));
      const rounds = Math.max(0, ...[...priorityGroups.values()].map((items) => items.length));
      for (let round = 0; result.length < target && round < rounds; round += 1) {
        unitOrder.forEach((unit) => {
          const question = priorityGroups.get(unit.id)?.[round];
          if (question && result.length < target) result.push(question.id);
        });
      }
      if (result.length >= target) break;
    }
    return result;
  }

  function buildPracticalQueue(scope, requestedSize) {
    return buildPracticalQueueFrom(
      practicalScopeQuestions(scope),
      requestedSize,
      PRACTICAL_VARIATIONS?.UNITS || []
    );
  }

  function buildBusinessFullScoreQueue(requestedSize) {
    return buildPracticalQueueFrom(
      BUSINESS_FULLSCORE_QUESTIONS,
      requestedSize,
      BUSINESS_FULLSCORE_UNITS,
      { ...state.practicalDrill, bankId: BUSINESS_FULLSCORE_BANK_ID }
    );
  }

  function buildPracticalUnitQueue(unitId) {
    const drill = state.practicalDrill;
    const rotation = drill.sessionsCompleted || 0;
    return practicalQuestionsForUnit(unitId)
      .sort((left, right) =>
        practicalPriority(left, drill) - practicalPriority(right, drill) ||
        (drill.history[left.id]?.attempts || 0) - (drill.history[right.id]?.attempts || 0) ||
        ((left.queueRank - rotation) % 4 + 4) % 4 -
          (((right.queueRank - rotation) % 4 + 4) % 4) ||
        left.id.localeCompare(right.id)
      )
      .map((question) => question.id);
  }

  function buildBusinessFullScoreUnitQueue(unitId) {
    const questions = fullScoreQuestionsForUnit(unitId);
    const unit = BUSINESS_FULLSCORE_UNITS.find((item) => item.id === unitId);
    return unit
      ? buildPracticalQueueFrom(
          questions,
          questions.length,
          [unit],
          { ...state.practicalDrill, bankId: BUSINESS_FULLSCORE_BANK_ID }
        )
      : [];
  }

  function currentPracticalQuestion() {
    const drill = state.practicalDrill;
    return practicalQuestionFor(drill?.queue?.[drill.position], drill?.bankId);
  }

  function currentPresentedPracticalQuestion() {
    const drill = state.practicalDrill;
    return presentPracticalQuestion(
      currentPracticalQuestion(),
      drill?.bankId,
      drill?.presentationKey
    );
  }

  function practicalReasoningStep(index, label, text) {
    const item = document.createElement("li");
    const marker = document.createElement("span");
    marker.textContent = String(index);
    const copy = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = label;
    const body = document.createElement("p");
    body.textContent = text;
    copy.append(heading, body);
    item.append(marker, copy);
    return item;
  }

  function renderPracticalDrill() {
    if (!elements.practicalDrillPanel || !PRACTICAL_QUESTION_IDS.length) return;
    const drill = state.practicalDrill;
    const activeQuestions = activePracticalQuestions(drill);
    const activeIds = activeQuestions.map((question) => question.id);
    const contacted = activeIds.filter((id) => (drill.history[id]?.attempts || 0) > 0).length;
    const grounded = activeIds.filter((id) => drill.history[id]?.lastConfidence === "confident").length;
    const knockSession = drill.bankId === BUSINESS_FULLSCORE_BANK_ID && drill.planMode === "knock";
    const bankLabel = knockSession ? "業法ノック" : drill.bankId === BUSINESS_FULLSCORE_BANK_ID ? "満点変形" : "実践";
    const summaryPrefix = drill.bankId === BUSINESS_FULLSCORE_BANK_ID ? `${bankLabel} ` : "";
    elements.practicalDrillSummary.textContent =
      `${summaryPrefix}接触 ${contacted} / ${activeIds.length}・根拠クリア ${grounded}・再出題 ${drill.retryIds.length}`;
    elements.practicalDrillScope.value = drill.scope;
    elements.practicalDrillSize.value = String(drill.sessionSize);
    renderPracticalDrillLauncher();

    const idle = drill.stage === "idle";
    const complete = drill.stage === "complete";
    const unitSession = drill.unitId
      ? activePracticalUnits(drill).find((unit) => unit.id === drill.unitId)
      : null;
    if (!idle && elements.practicalDrillPanel) elements.practicalDrillPanel.open = true;
    elements.practicalDrillOverview.hidden = !idle;
    elements.practicalDrillSession.hidden = idle || complete;
    elements.practicalDrillComplete.hidden = !complete;
    elements.practicalDrillRestartButton.disabled = false;
    if (idle) return;
    if (complete) {
      const scopeLabel = practicalScopeLabel(drill.scope);
      const knockPreset = knockSession ? normalizeBusinessKnockPreset(drill.knockPreset) : null;
      const nextKnockPlan = knockSession ? businessKnockPlan(knockPreset) : null;
      const completionLabel = knockSession
        ? businessKnockModeLabel(knockPreset.mode)
        : unitSession ? unitSession.label : scopeLabel;
      elements.practicalDrillCompleteText.textContent = knockSession
        ? `${completionLabel}の今回${drill.sessionIds.length}問と再出題を完了。累計${drill.attempts}解答です。${nextKnockPlan?.size ? `同じ条件の次セットは${nextKnockPlan.size}問。` : "この条件の対象はすべて回収しました。"}同日正答だけでは長期定着レベルは進みません。`
        : `${completionLabel}の今回${drill.sessionIds.length}問と再出題を完了。累計${drill.attempts}解答、根拠クリア${grounded}問です。`;
      elements.practicalDrillRestartButton.textContent = knockSession
        ? nextKnockPlan?.size
          ? `同じ条件でさらに${nextKnockPlan.size}問`
          : "この条件は完了"
        : unitSession
          ? `同じ単元を${drill.sessionIds.length}問続ける`
          : `${scopeLabel}を${drill.sessionIds.length}問続ける`;
      elements.practicalDrillRestartButton.disabled = knockSession && !(nextKnockPlan?.size > 0);
      return;
    }

    const question = currentPresentedPracticalQuestion();
    if (!question) return;
    const attempt = drill.currentAttempt;
    const sessionRetryCount = drill.retryIds.filter((id) => drill.sessionIds.includes(id)).length;
    elements.practicalDrillStage.textContent = drill.stage === "retry"
      ? "迷い・誤答を再出題"
      : unitSession
        ? `${unitSession.label}・${drill.sessionIds.length}問`
        : `${drill.sessionIds.length}問 ${bankLabel}セット`;
    elements.practicalDrillProgress.textContent = `${drill.position + 1} / ${drill.queue.length}`;
    elements.practicalDrillUnit.textContent = question.unitPage
      ? `${question.unitLabel}・p.${question.unitPage}`
      : question.unitLabel;
    elements.practicalDrillRetryStatus.textContent = `今回の再出題 ${sessionRetryCount}`;
    elements.practicalDrillPrompt.textContent = question.text;
    elements.practicalDrillChoices.replaceChildren();
    question.choices.forEach((choice, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "practical-drill-choice";
      button.textContent = `${index + 1}. ${choice}`;
      button.disabled = Boolean(attempt);
      if (attempt) {
        button.classList.toggle("is-selected", attempt.selected === index);
        button.classList.toggle("is-correct", question.answer === index);
        button.classList.toggle("is-wrong", attempt.selected === index && !attempt.correct);
      }
      button.addEventListener("click", () => answerPracticalDrill(index));
      elements.practicalDrillChoices.append(button);
    });

    elements.practicalDrillFeedback.hidden = !attempt;
    if (!attempt) return;
    elements.practicalDrillVerdict.textContent = attempt.correct
      ? `正解。「${question.choices[question.answer]}」を根拠から再現する。`
      : `誤答。正解は「${question.choices[question.answer]}」。今回の再出題へ追加した。`;
    elements.practicalDrillReasoning.replaceChildren(
      practicalReasoningStep(1, "判断軸", question.explain),
      practicalReasoningStep(2, "各肢への当てはめ", (question.statementExplanations || []).join("\n") || question.explain),
      practicalReasoningStep(3, "間違いやすい境界", question.trap),
      practicalReasoningStep(4, "次に再現する一文", question.memoryRule)
    );
    const sourceLabels = String(question.sourceRef || "").split("／").filter(Boolean);
    elements.practicalDrillSources.replaceChildren(
      ...(question.sourceUrls || []).map((url, index) => {
        const link = document.createElement("a");
        link.className = "official-source-link";
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `公式根拠${question.sourceUrls.length > 1 ? index + 1 : ""}: ${sourceLabels[index] || sourceLabels[0] || "出典"}（基準日 ${question.legalBaseline}）`;
        return link;
      })
    );
    elements.practicalDrillConfidence.hidden = !attempt.correct;
    elements.practicalDrillConfidence
      .querySelectorAll("[data-practical-confidence]")
      .forEach((button) => {
        button.classList.toggle(
          "is-selected",
          button.dataset.practicalConfidence === attempt.confidence
        );
      });
    elements.practicalDrillNextButton.disabled = attempt.correct && !attempt.confidence;
    elements.practicalDrillNextButton.textContent = drill.position + 1 < drill.queue.length
      ? "次の実践問題へ"
      : (sessionRetryCount ? "再出題へ進む" : "今回のセットを完了する");
  }

  function businessFoundationChapters() {
    return TEXTBOOK_CHAPTERS.filter((chapter) =>
      BUSINESS_MASTERY.BUSINESS_UNIT_IDS.includes(chapter.id)
    );
  }

  function businessFoundationSummary() {
    const ids = businessFoundationChapters().flatMap((chapter) => chapter.ids || []);
    return {
      ids,
      total: ids.length,
      contacted: ids.filter(isContacted).length,
      retained: ids.filter(isRetained).length
    };
  }

  function businessTransferSummary(now = new Date()) {
    return BUSINESS_MASTERY.summarizeOverall(
      BUSINESS_FULLSCORE_UNITS,
      BUSINESS_FULLSCORE_QUESTIONS,
      state.practicalDrill?.history || {},
      now
    );
  }

  function latestBusinessMasteryTimestamp(questionIds = BUSINESS_FULLSCORE_QUESTION_IDS) {
    return questionIds
      .map((id) => state.practicalDrill?.history?.[id]?.lastAnsweredAt)
      .filter((value) => Number.isFinite(Date.parse(value)))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || "";
  }

  function businessCurrentLawEvidence(transfer = businessTransferSummary()) {
    const transferReady = transfer?.questions?.total === BUSINESS_FULLSCORE_EXPECTED_QUESTIONS &&
      transfer.questions.durable === BUSINESS_FULLSCORE_EXPECTED_QUESTIONS;
    const masteredQuestionKeys = Object.entries(CURRENT_LAW_DELTA_QUESTION_MAP)
      .filter(([, questionId]) =>
        BUSINESS_MASTERY.stateFor(
          state.practicalDrill?.history?.[questionId] || {},
          new Date()
        ) === "durable"
      )
      .map(([questionKey]) => questionKey);
    return {
      mastery: {
        baseline: CURRENT_LAW_BASELINE,
        totalFactCount: BUSINESS_FULLSCORE_EXPECTED_QUESTIONS,
        masteredFactCount: transferReady ? BUSINESS_FULLSCORE_EXPECTED_QUESTIONS : 0,
        allFactsRetained: transferReady,
        completedAt: transferReady ? latestBusinessMasteryTimestamp() : ""
      },
      supplement: {
        baseline: CURRENT_LAW_BASELINE,
        masteredQuestionKeys,
        completedAt: masteredQuestionKeys.length === Object.keys(CURRENT_LAW_DELTA_QUESTION_MAP).length
          ? latestBusinessMasteryTimestamp(Object.values(CURRENT_LAW_DELTA_QUESTION_MAP))
          : ""
      }
    };
  }

  function officialEvidenceMatchesAnswerKey(item) {
    const definition = officialExamDefinition(item?.examId);
    if (!definition || Object.keys(item?.answers || {}).length !== 50) return false;
    const scored = OFFICIAL_EXAM_DATA?.scoreAnswers(item.examId, item.answers);
    return Boolean(
      scored &&
      Number.isInteger(item.score) && item.score === scored.score &&
      Number.isInteger(item.rights) && item.rights === scored.sectionScores.rights &&
      Number.isInteger(item.restrictions) && item.restrictions === scored.sectionScores.restrictions &&
      Number.isInteger(item.business) && item.business === scored.sectionScores.business &&
      Number.isInteger(item.taxOther) && item.taxOther === scored.sectionScores.taxOther
    );
  }

  function businessOfficialProof() {
    const history = state.officialExamHistory || [];
    const historical = BUSINESS_MASTERY.summarizeOfficialProof(history, {
      lawBaseline: CURRENT_LAW_BASELINE,
      qualifies: (item) =>
        officialAttemptQualifies(item, history) && officialEvidenceMatchesAnswerKey(item)
    });
    const evidence = businessCurrentLawEvidence();
    const currentLawAssessments = (historical.proofInitial || []).map((item) =>
      OFFICIAL_LAW_BASELINE?.assessCurrentLawProof?.({
        examId: item.examId,
        historicalBusinessScore: item.business,
        currentLawMastery: evidence.mastery,
        currentLawSupplement: evidence.supplement
      })
    ).filter(Boolean);
    return {
      ...historical,
      scoringBasis: OFFICIAL_HISTORICAL_SCORING_BASIS,
      currentLawEligible: historical.ready &&
        currentLawAssessments.length >= historical.required &&
        currentLawAssessments.every((item) => item.currentLaw.eligible),
      currentLawAssessments
    };
  }

  function businessFullScoreSummary(now = new Date()) {
    const official = businessOfficialProof();
    return BUSINESS_MASTERY.summarizeFullScore({
      foundation: businessFoundationSummary(),
      transfer: businessTransferSummary(now),
      official: {
        ...official,
        ready: official.ready && official.currentLawEligible
      },
      bankReady: BUSINESS_FULLSCORE_BANK_READY,
      transferTarget: BUSINESS_FULLSCORE_EXPECTED_QUESTIONS
    });
  }

  function businessFullScoreOfficialUnlocked() {
    const summary = businessFullScoreSummary();
    return summary.foundation.ready && summary.transfer?.questions?.untouched === 0;
  }

  function businessNextDueKey() {
    const today = todayKey();
    return BUSINESS_FULLSCORE_QUESTION_IDS
      .map((id) => BUSINESS_MASTERY.normalizeMasteryHistory(state.practicalDrill?.history?.[id]))
      .flatMap((item) => [item.masteryDueKey, ...item.confidentDayKeys])
      .filter((key) => key && key > today)
      .sort()[0] || "";
  }

  function businessFirstStepPending() {
    return BUSINESS_FULLSCORE_QUESTION_IDS.reduce((count, id) => {
      const mastery = BUSINESS_MASTERY.normalizeMasteryHistory(
        state.practicalDrill?.history?.[id]
      );
      return count + (mastery.reviewLevel > 0 ? 0 : 1);
    }, 0);
  }

  function businessPaceForSummary(summary = businessFullScoreSummary()) {
    if (!BUSINESS_PACE?.calculateBusinessPace) return null;
    const questions = summary.transfer?.questions || {};
    return BUSINESS_PACE.calculateBusinessPace({
      todayKey: todayKey(),
      firstStepPending: businessFirstStepPending(),
      plannedDailyNew: 10,
      existingLoad: {
        retry: 0,
        due: Math.max(0, Number(questions.due) || 0),
        overdue: 0,
        learning: Math.max(0, Number(questions.learning) || 0),
        retained: Math.max(0, Number(questions.retained) || 0),
        durable: Math.max(0, Number(questions.durable) || 0),
        nextDueKey: businessNextDueKey()
      }
    });
  }

  function businessOfficialReserve() {
    if (!BUSINESS_PACE?.calculateOfficialReserve) return null;
    const exposure = normalizeOfficialExamExposure(state.officialExamExposure);
    const exposedExams = OFFICIAL_EXAMS.filter((exam) => Boolean(exposure[exam.id])).length;
    return BUSINESS_PACE.calculateOfficialReserve({
      totalExams: OFFICIAL_EXAMS.length,
      exposedExams,
      minimumReserve: 3
    });
  }

  function businessTagLeaders() {
    const totals = {};
    const recent = {};
    BUSINESS_FULLSCORE_QUESTION_IDS.forEach((id) => {
      const item = state.practicalDrill?.history?.[id] || {};
      Object.entries(normalizeBusinessMistakeTags(item.mistakeTags)).forEach(([tag, count]) => {
        totals[tag] = (totals[tag] || 0) + count;
      });
    });
    BUSINESS_FULLSCORE_QUESTION_IDS
      .map((id) => state.practicalDrill?.history?.[id] || {})
      .filter((item) => item.lastMistakeTags?.length && Number.isFinite(Date.parse(item.lastAnsweredAt)))
      .sort((left, right) => Date.parse(right.lastAnsweredAt) - Date.parse(left.lastAnsweredAt))
      .slice(0, 10)
      .forEach((item) => normalizeBusinessTagList(item.lastMistakeTags).forEach((tag) => {
        recent[tag] = (recent[tag] || 0) + 1;
      }));
    const top = (counts) => Object.entries(counts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 3)
      .map(([tag, count]) => `${BUSINESS_DIAGNOSTIC_LABELS[tag]} ${count}`);
    return { recent: top(recent), cumulative: top(totals) };
  }

  function businessDailyRecoveryPlan(pace) {
    const now = new Date();
    const pending = BUSINESS_FULLSCORE_QUESTIONS.filter((question) =>
      BUSINESS_MASTERY.normalizeMasteryHistory(
        state.practicalDrill?.history?.[question.id]
      ).reviewLevel === 0
    );
    const due = BUSINESS_FULLSCORE_QUESTIONS.filter((question) =>
      BUSINESS_MASTERY.stateFor(state.practicalDrill?.history?.[question.id] || {}, now) === "due"
    );
    const pendingTarget = Math.min(
      pending.length,
      pace?.valid && Number.isInteger(pace.todayRequired) ? pace.todayRequired : 10
    );
    const drill = { ...state.practicalDrill, bankId: BUSINESS_FULLSCORE_BANK_ID };
    const pendingIds = buildPracticalQueueFrom(
      pending,
      pendingTarget,
      BUSINESS_FULLSCORE_UNITS,
      drill
    );
    const dueIds = buildPracticalQueueFrom(
      due,
      due.length,
      BUSINESS_FULLSCORE_UNITS,
      drill
    );
    return {
      questionIds: [...new Set([...dueIds, ...pendingIds])],
      pending: pendingIds.length,
      due: dueIds.length
    };
  }

  function businessPrimaryAction(summary = businessFullScoreSummary()) {
    const active = activeLearningSession();
    if (active) return { kind: "resume", label: `${active.label}を再開` };
    if (!BUSINESS_FULLSCORE_BANK_READY) return { kind: "unavailable", label: `変形${BUSINESS_FULLSCORE_EXPECTED_QUESTIONS}問を読み込めません` };
    if (!summary.foundation.ready) return { kind: "foundation", label: "基礎44問の未定着を回収" };
    const questions = summary.transfer.questions;
    const pace = businessPaceForSummary(summary);
    if ((pace?.firstStepPending || 0) > 0 || questions.due > 0) {
      const daily = businessDailyRecoveryPlan(pace);
      return {
        kind: "practice",
        questionIds: daily.questionIds,
        size: daily.questionIds.length,
        label: `今日の定着 ${daily.questionIds.length}問（起点${daily.pending}・期限${daily.due}）`
      };
    }
    const needsOfficial = !summary.official.ready || summary.official.currentMiss;
    const reserve = businessOfficialReserve();
    if (!summary.transferReady && needsOfficial && reserve?.canStartInitial) {
      return { kind: "official", label: summary.official.currentMiss ? "公式50問で再調整" : `公式50問で測定（未見${reserve.unseenExams}回）` };
    }
    const dueKey = businessNextDueKey();
    if (!summary.transferReady && dueKey) return { kind: "wait", label: `次回復習 ${dueKey}` };
    if (!summary.transferReady && questions.learning > 0) {
      return { kind: "practice", states: new Set(["learning"]), label: `根拠未確定 ${Math.min(10, questions.learning)}問` };
    }
    if (needsOfficial) {
      return { kind: "official", label: summary.official.currentMiss ? "公式50問で再調整" : "未接触の公式50問へ" };
    }
    return { kind: "ready", label: "満点圏の証拠を確認" };
  }

  function normalizeBusinessKnockPreset(input = state.practicalDrill?.knockPreset) {
    const mode = BUSINESS_KNOCK_MODES.includes(input?.mode) ? String(input.mode) : "untouched";
    const size = BUSINESS_KNOCK_SIZES.includes(Number(input?.size)) ? Number(input.size) : 20;
    const unitId = BUSINESS_FULLSCORE_UNITS.some((unit) => unit.id === input?.unitId)
      ? String(input.unitId)
      : BUSINESS_FULLSCORE_UNITS[0]?.id || "";
    const lastPresentationOffset = Number.isInteger(input?.lastPresentationOffset) &&
      input.lastPresentationOffset >= 0 && input.lastPresentationOffset <= 3
      ? input.lastPresentationOffset
      : null;
    return { mode, size, unitId, lastPresentationOffset };
  }

  function businessKnockModeLabel(mode) {
    return ({
      "weak-due": "弱点・期限",
      untouched: "未接触",
      unit: "単元指定",
      "all-random": "全範囲混合"
    })[mode] || "業法";
  }

  function businessFullScoreHistory() {
    return Object.fromEntries(BUSINESS_FULLSCORE_QUESTION_IDS
      .filter((id) => state.practicalDrill?.history?.[id])
      .map((id) => [id, state.practicalDrill.history[id]]));
  }

  function businessKnockPlan(preset, seed = "preview") {
    if (!BUSINESS_KNOCK_READY) return null;
    const normalized = normalizeBusinessKnockPreset(preset);
    return BUSINESS_KNOCK.plan({
      questions: BUSINESS_FULLSCORE_QUESTIONS,
      history: businessFullScoreHistory(),
      mode: normalized.mode,
      unitId: normalized.unitId,
      size: normalized.size,
      now: new Date(),
      seed,
      presentationKey: `${todayKey()}:knock:${seed}`
    });
  }

  function renderBusinessKnock() {
    if (!elements.businessKnockPanel) return;
    const preset = normalizeBusinessKnockPreset();
    if (elements.businessKnockUnit && elements.businessKnockUnit.options.length !== BUSINESS_FULLSCORE_UNITS.length) {
      elements.businessKnockUnit.replaceChildren(...BUSINESS_FULLSCORE_UNITS.map((unit) => {
        const option = document.createElement("option");
        option.value = unit.id;
        option.textContent = unit.label;
        return option;
      }));
    }
    if (elements.businessKnockMode) elements.businessKnockMode.value = preset.mode;
    if (elements.businessKnockSize) elements.businessKnockSize.value = String(preset.size);
    if (elements.businessKnockUnit) elements.businessKnockUnit.value = preset.unitId;
    if (elements.businessKnockUnitField) elements.businessKnockUnitField.hidden = preset.mode !== "unit";

    const historySummary = BUSINESS_KNOCK?.summarizeHistory?.(businessFullScoreHistory(), new Date()) || {
      attempts: 0,
      accuracy: 0
    };
    const transfer = businessTransferSummary().questions || {};
    elements.businessKnockAttempts.textContent = String(historySummary.attempts || 0);
    elements.businessKnockAccuracy.textContent = `${historySummary.accuracy || 0}%`;
    elements.businessKnockRecovery.textContent = String((transfer.retry || 0) + (transfer.due || 0));
    elements.businessKnockUntouched.textContent = String(transfer.untouched || 0);

    const active = activeLearningSession();
    const plan = businessKnockPlan(preset);
    const controlsDisabled = Boolean(active) || !BUSINESS_KNOCK_READY;
    [elements.businessKnockMode, elements.businessKnockUnit, elements.businessKnockSize]
      .filter(Boolean)
      .forEach((control) => { control.disabled = controlsDisabled; });
    if (!elements.businessKnockStart || !elements.businessKnockStatus) return;
    if (active) {
      elements.businessKnockStart.disabled = false;
      elements.businessKnockStart.textContent = `${active.label}を再開`;
      elements.businessKnockStatus.textContent = `${active.label}があります。新しいノックで上書きせず、先に再開します。`;
      return;
    }
    if (!BUSINESS_KNOCK_READY || !plan) {
      elements.businessKnockStart.disabled = true;
      elements.businessKnockStart.textContent = "ノック問題を読み込めません";
      elements.businessKnockStatus.textContent = "変形134問またはノック選問エンジンの読込を確認してください。";
      return;
    }
    const modeLabel = businessKnockModeLabel(preset.mode);
    elements.businessKnockStart.disabled = plan.size === 0;
    elements.businessKnockStart.textContent = plan.size
      ? `${modeLabel}を${plan.size}問ノック開始`
      : `${modeLabel}の対象なし`;
    elements.businessKnockStatus.textContent = plan.size
      ? `対象${plan.available}問から${plan.size}問を出題。完了後も同じ条件で次セットへ進めます。`
      : preset.mode === "weak-due"
        ? "現在、誤答・不安・期限到来はありません。未接触または全範囲を選べます。"
        : preset.mode === "untouched"
          ? "134問すべてに接触済みです。弱点・期限、単元、全範囲を選べます。"
          : "この条件で出題できる問題がありません。";
  }

  function updateBusinessKnockPresetFromControls() {
    if (activeLearningSession()) {
      renderBusinessKnock();
      return;
    }
    state.practicalDrill.knockPreset = normalizeBusinessKnockPreset({
      mode: elements.businessKnockMode?.value,
      size: Number(elements.businessKnockSize?.value),
      unitId: elements.businessKnockUnit?.value,
      lastPresentationOffset: state.practicalDrill.knockPreset?.lastPresentationOffset
    });
    saveState();
    renderBusinessKnock();
  }

  function renderBusinessMastery() {
    if (!elements.businessMasteryPanel || !BUSINESS_MASTERY) return;
    const summary = businessFullScoreSummary();
    const actionState = businessPrimaryAction(summary);
    elements.businessMasteryPanel.dataset.masteryStatus = summary.status;
    elements.businessMasteryPanel.dataset.transferReady = String(summary.transferReady);
    elements.businessMasteryPanel.dataset.durableUnits = String(summary.transfer?.durableUnits || 0);
    const statusLabels = {
      "bank-unavailable": `変形${BUSINESS_FULLSCORE_EXPECTED_QUESTIONS}問の読込エラー`,
      foundation: "基礎再現を回収中",
      transfer: businessFirstStepPending() ? "定着起点を回収中" : "長期定着を積上げ中",
      exam: "公式初見20/20を測定中",
      recovery: "公式記録を再調整中",
      ready: "満点圏（アプリ内判定）"
    };
    elements.businessMasteryStatus.textContent = statusLabels[summary.status] || "測定中";
    elements.businessMasteryStatus.dataset.status = summary.status;
    elements.businessFoundationGate.textContent = `${summary.foundation.retained} / 44`;
    elements.businessTransferGate.textContent = `${summary.transfer?.questions?.durable || 0} / ${BUSINESS_FULLSCORE_EXPECTED_QUESTIONS}`;
    elements.businessOfficialGate.textContent = summary.official.currentMiss
      ? `${summary.official.perfect} / 3・再調整`
      : `${summary.official.perfect} / 3`;
    const transfer = summary.transfer?.questions || {};
    elements.businessMasteryMetrics.textContent =
      `基礎 接触${summary.foundation.contacted}/44・定着${summary.foundation.retained}/44 / ` +
      `変形 再挑戦・期限${(transfer.retry || 0) + (transfer.due || 0)}・未接触${transfer.untouched || 0}・定着起点未確立${businessFirstStepPending()}・長期定着${transfer.durable || 0}/${BUSINESS_FULLSCORE_EXPECTED_QUESTIONS} / ` +
      `公式 初見満点${summary.official.perfect}/3`;
    if (elements.businessMasteryPace) {
      const pace = businessPaceForSummary(summary);
      const reserve = businessOfficialReserve();
      elements.businessMasteryPace.dataset.paceStatus = pace?.status || "unknown";
      if (!pace?.valid) {
        elements.businessMasteryPace.textContent =
          `日程警告: 定着起点の期限${pace?.latestFirstExposureKey || "2026-08-23"}を超過しています。` +
          `起点未確立${pace?.firstStepPending ?? businessFirstStepPending()}問を優先し、復習期限と併せて再計画します。`;
      } else if ((pace.firstStepPending || 0) > 0) {
        elements.businessMasteryPace.textContent =
          `試験日ペース: 今日の定着起点${pace.todayRequired}問＋期限復習${pace.existingLoad.knownActionable}問 / ` +
          `起点締切${pace.latestFirstExposureKey} / 追いつく計画の最終確認${pace.catchUpProjectedFinalRecallKey} / ` +
          `公式未接触${reserve?.unseenExams ?? "-"}回`;
      } else {
        elements.businessMasteryPace.textContent =
          `変形${BUSINESS_FULLSCORE_EXPECTED_QUESTIONS}問の定着起点は確立。${businessNextDueKey() ? `次回復習${businessNextDueKey()} / ` : ""}` +
          `公式未接触${reserve?.unseenExams ?? "-"}回（最終証跡用3回を確保）。`;
      }
    }
    if (elements.businessMasteryWeakness) {
      const leaders = businessTagLeaders();
      elements.businessMasteryWeakness.textContent = leaders.recent.length || leaders.cumulative.length
        ? `弱点上位　直近: ${leaders.recent.join("・") || "なし"} / 累積: ${leaders.cumulative.join("・") || "なし"}`
        : "弱点上位　まだ誤答・不安回答の記録はありません。";
    }
    elements.businessMasteryPrimary.textContent = actionState.label;
    elements.businessMasteryPrimary.disabled = actionState.kind === "unavailable" || actionState.kind === "wait";
    elements.businessMasteryPrimary.dataset.action = actionState.kind;
    elements.businessMasteryFull.disabled = Boolean(activeLearningSession()) || !BUSINESS_FULLSCORE_BANK_READY;
    renderBusinessKnock();
    elements.businessMasteryGrid.replaceChildren(...(summary.transfer?.units || []).map((item) => {
      const base = businessFoundationChapters().find((chapter) => chapter.id === item.unit.id);
      const baseIds = base?.ids || [];
      const baseContacted = baseIds.filter(isContacted).length;
      const baseRetained = baseIds.filter(isRetained).length;
      const tile = document.createElement("article");
      tile.className = "business-mastery-tile";
      const topicState = item.retry ? "retry" : item.due ? "due" : item.untouched ? "untouched" :
        item.durable === item.total ? "durable" : item.retained ? "retained" : "learning";
      tile.dataset.masteryState = topicState;
      const title = document.createElement("strong");
      title.textContent = item.unit.label;
      const metrics = document.createElement("small");
      metrics.textContent = `基礎接触 ${baseContacted}/${baseIds.length}・定着 ${baseRetained}/${baseIds.length}・変形接触 ${item.total - item.untouched}/${item.total}・長期定着 ${item.durable}/${item.total}`;
      const stateLabel = document.createElement("span");
      stateLabel.textContent = ({ retry: "再挑戦", due: "期限到来", untouched: "未接触", durable: "長期定着", retained: "定着中", learning: "学習中" })[topicState];
      const action = document.createElement("button");
      action.type = "button";
      action.dataset.businessMasteryUnit = item.unit.id;
      action.disabled = Boolean(activeLearningSession()) || !BUSINESS_FULLSCORE_BANK_READY;
      action.textContent = action.disabled ? "進行中セットを優先" : baseRetained < baseIds.length ? "基礎を回収" : `変形${item.total}問へ`;
      tile.append(title, metrics, stateLabel, action);
      return tile;
    }));
  }

  function startBusinessFoundationUnit(unitId = "") {
    const chapters = businessFoundationChapters();
    const chapter = chapters.find((item) => item.id === unitId) ||
      chapters.find((item) => item.ids.some((id) => !isRetained(id))) || chapters[0];
    if (!chapter) return;
    prepareFoundationUnitPlan(chapter);
    const index = CHAPTERS.findIndex((item) => item.id === chapter.id);
    if (index >= 0) selectChapter(index);
    saveState();
    render();
  }

  function startBusinessFullScoreSession({
    size = 10,
    unitId = "",
    states = null,
    questionIds = null,
    fullScan = false,
    planMode = "mastery",
    knockPreset = null,
    presentationKey = ""
  } = {}) {
    if (resumeActiveLearningSession() || !BUSINESS_FULLSCORE_BANK_READY) return;
    const requestedIds = Array.isArray(questionIds) ? new Set(questionIds) : null;
    const eligible = requestedIds
      ? BUSINESS_FULLSCORE_QUESTIONS.filter((question) => requestedIds.has(question.id))
      : unitId ? fullScoreQuestionsForUnit(unitId) : BUSINESS_FULLSCORE_QUESTIONS;
    const filtered = states instanceof Set
      ? eligible.filter((question) => states.has(BUSINESS_MASTERY.stateFor(state.practicalDrill?.history?.[question.id] || {}, new Date())))
      : eligible;
    const requestedSize = fullScan ? filtered.length : Math.min(Math.max(1, Number(size) || 10), filtered.length);
    const units = unitId
      ? BUSINESS_FULLSCORE_UNITS.filter((unit) => unit.id === unitId)
      : BUSINESS_FULLSCORE_UNITS;
    const queue = buildPracticalQueueFrom(
      filtered,
      requestedSize,
      units,
      { ...state.practicalDrill, bankId: BUSINESS_FULLSCORE_BANK_ID }
    );
    if (!queue.length) return;
    const sessionPlanMode = planMode === "knock" ? "knock" : "mastery";
    const sessionPresentationKey = sessionPlanMode === "knock"
      ? String(presentationKey || `${todayKey()}:knock:${createOpaqueId("cycle")}`)
        .replace(/[^0-9a-z:_-]/gi, "").slice(0, 80)
      : `${todayKey()}:bank-${BUSINESS_FULLSCORE_BANK.VERSION}`;
    const retryIds = BUSINESS_FULLSCORE_QUESTION_IDS.filter((id) =>
      ["wrong", "uncertain"].includes(state.practicalDrill?.history?.[id]?.lastConfidence)
    );
    state.practicalDrill = {
      ...state.practicalDrill,
      version: PRACTICAL_VARIATIONS?.VERSION || 1,
      bankId: BUSINESS_FULLSCORE_BANK_ID,
      bankVersion: BUSINESS_FULLSCORE_BANK.VERSION,
      presentationKey: sessionPresentationKey,
      planMode: sessionPlanMode,
      knockPreset: normalizeBusinessKnockPreset(knockPreset || state.practicalDrill.knockPreset),
      stage: "active",
      scope: "business",
      unitId,
      sessionSize: queue.length,
      sessionIds: [...queue],
      queue: [...queue],
      position: 0,
      currentAttempt: null,
      retryIds,
      sessionStartedAt: new Date().toISOString(),
      completedAt: ""
    };
    if (elements.practicalDrillPanel) elements.practicalDrillPanel.open = true;
    saveState();
    renderPracticalDrill();
    renderBusinessMastery();
    renderPassPlan();
    window.requestAnimationFrame(() =>
      elements.practicalDrillPanel?.scrollIntoView({ block: "start", behavior: "smooth" })
    );
  }

  function nextBusinessKnockPresentation(cycleId, previousOffset) {
    const base = `${todayKey()}:knock:${cycleId}`
      .replace(/[^0-9a-z:_-]/gi, "")
      .slice(0, 76);
    for (const suffix of ["a", "b", "c", "d"]) {
      const key = `${base}:${suffix}`;
      const offset = BUSINESS_FULLSCORE_BANK.presentQuestion(BUSINESS_FULLSCORE_QUESTION_IDS[0], key)
        .presentationOffset;
      if (!Number.isInteger(previousOffset) || offset !== previousOffset) return { key, offset };
    }
    throw new Error("次の業法ノックの肢順を生成できませんでした。");
  }

  function startBusinessKnockSession() {
    if (resumeActiveLearningSession()) return;
    const preset = normalizeBusinessKnockPreset();
    const cycleId = createOpaqueId("cycle");
    const plan = businessKnockPlan(preset, cycleId);
    if (!plan?.ids?.length) {
      renderBusinessKnock();
      return;
    }
    const presentation = nextBusinessKnockPresentation(cycleId, preset.lastPresentationOffset);
    startBusinessFullScoreSession({
      size: plan.size,
      unitId: preset.mode === "unit" ? preset.unitId : "",
      questionIds: plan.ids,
      planMode: "knock",
      knockPreset: { ...preset, lastPresentationOffset: presentation.offset },
      presentationKey: presentation.key
    });
  }

  function startBusinessMasterySession() {
    const summary = businessFullScoreSummary();
    const action = businessPrimaryAction(summary);
    if (action.kind === "resume") {
      resumeActiveLearningSession();
    } else if (action.kind === "foundation") {
      startBusinessFoundationUnit();
    } else if (action.kind === "practice") {
      startBusinessFullScoreSession({
        size: action.size || 10,
        states: action.states,
        questionIds: action.questionIds
      });
    } else if (action.kind === "official") {
      if (elements.passPlanPanel) elements.passPlanPanel.open = true;
      if (elements.officialExamAttemptType) elements.officialExamAttemptType.value = "initial";
      renderOfficialExamYearOptions();
      startOfficialExam();
    } else {
      elements.businessMasteryPanel?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  function startPracticalDrillWith(scope, sessionSize) {
    if (resumeActiveLearningSession()) return;
    const queue = buildPracticalQueue(scope, sessionSize);
    state.practicalDrill = {
      ...state.practicalDrill,
      bankId: LEGACY_PRACTICAL_BANK_ID,
      bankVersion: PRACTICAL_VARIATIONS?.VERSION || 1,
      presentationKey: "",
      planMode: "legacy",
      stage: "active",
      scope,
      unitId: "",
      sessionSize,
      sessionIds: [...queue],
      queue: [...queue],
      position: 0,
      currentAttempt: null,
      retryIds: practicalRetryIdsForBank(LEGACY_PRACTICAL_BANK_ID),
      sessionStartedAt: new Date().toISOString(),
      completedAt: ""
    };
    if (elements.practicalDrillPanel) elements.practicalDrillPanel.open = true;
    saveState();
    renderPracticalDrill();
    renderBusinessMastery();
    renderPassPlan();
    window.requestAnimationFrame(() =>
      elements.practicalDrillPanel?.scrollIntoView({ block: "start", behavior: "smooth" })
    );
  }

  function startPracticalDrill() {
    const requestedScope = String(elements.practicalDrillScope?.value || state.practicalDrill.scope);
    const scope = PRACTICAL_SCOPES.includes(requestedScope) ? requestedScope : "business";
    const requestedSize = Number(elements.practicalDrillSize?.value || state.practicalDrill.sessionSize);
    const sessionSize = PRACTICAL_SESSION_SIZES.includes(requestedSize) ? requestedSize : 10;
    startPracticalDrillWith(scope, sessionSize);
  }

  function startStudyScopePracticalReview() {
    if (state.practicalDrill?.stage !== "idle") {
      if (elements.practicalDrillPanel) elements.practicalDrillPanel.open = true;
      renderPracticalDrill();
      window.requestAnimationFrame(() =>
        elements.practicalDrillPanel?.scrollIntoView({ block: "start", behavior: "smooth" })
      );
      return;
    }
    startPracticalDrillWith(practicalScopeForStudyScope(), 10);
  }

  function startPracticalDrillForUnit(unitId) {
    if (resumeActiveLearningSession()) return;
    const chapter = TEXTBOOK_CHAPTERS.find((item) => item.id === unitId);
    const queue = buildPracticalUnitQueue(unitId);
    if (!chapter || queue.length !== 4) return;
    const snapshot = unitLearningSnapshot(chapter);
    if (snapshot.baseContacted < snapshot.baseIds.length) {
      setTodayCommandStatus(
        `先に${chapter.topicLabel}の読後問題${snapshot.baseIds.length}問へ接触してください。`,
        true
      );
      return;
    }
    const scope = PRACTICAL_QUESTION_BY_ID[queue[0]]?.scopeId || "all";
    state.practicalDrill = {
      ...state.practicalDrill,
      bankId: LEGACY_PRACTICAL_BANK_ID,
      bankVersion: PRACTICAL_VARIATIONS?.VERSION || 1,
      presentationKey: "",
      planMode: "legacy",
      stage: "active",
      scope,
      unitId,
      sessionSize: 4,
      sessionIds: [...queue],
      queue: [...queue],
      position: 0,
      currentAttempt: null,
      retryIds: practicalRetryIdsForBank(LEGACY_PRACTICAL_BANK_ID),
      sessionStartedAt: new Date().toISOString(),
      completedAt: ""
    };
    if (elements.practicalDrillPanel) elements.practicalDrillPanel.open = true;
    saveState();
    renderPracticalDrill();
    renderBusinessMastery();
    renderPassPlan();
    window.requestAnimationFrame(() =>
      elements.practicalDrillPanel?.scrollIntoView({ block: "start", behavior: "smooth" })
    );
  }

  function restartPracticalDrill() {
    if (state.practicalDrill?.bankId === BUSINESS_FULLSCORE_BANK_ID) {
      if (state.practicalDrill.planMode === "knock") {
        startBusinessKnockSession();
        return;
      }
      if (state.practicalDrill.unitId) {
        startBusinessFullScoreSession({ unitId: state.practicalDrill.unitId, fullScan: true });
      } else {
        startBusinessFullScoreSession({
          size: Math.min(BUSINESS_FULLSCORE_EXPECTED_QUESTIONS, Math.max(1, state.practicalDrill.sessionSize || 10)),
          fullScan: state.practicalDrill.sessionSize >= BUSINESS_FULLSCORE_EXPECTED_QUESTIONS
        });
      }
      return;
    }
    if (state.practicalDrill?.unitId) {
      startPracticalDrillForUnit(state.practicalDrill.unitId);
      return;
    }
    startPracticalDrill();
  }

  function answerPracticalDrill(selected) {
    const drill = state.practicalDrill;
    const question = currentPresentedPracticalQuestion();
    if (!question || drill.currentAttempt || !Number.isInteger(selected) || selected < 0 || selected > 3) return;
    const correct = selected === question.answer;
    const answeredAt = new Date().toISOString();
    const previous = drill.history[question.id] || {
      attempts: 0,
      correct: 0,
      wrong: 0,
      uncertain: 0
    };
    drill.history[question.id] = {
      ...previous,
      attempts: previous.attempts + 1,
      correct: previous.correct + (correct ? 1 : 0),
      wrong: previous.wrong + (correct ? 0 : 1),
      lastSelected: selected,
      lastCorrect: correct,
      lastConfidence: correct ? "" : "wrong",
      lastAnsweredAt: answeredAt
    };
    drill.attempts += 1;
    drill.correctAttempts += correct ? 1 : 0;
    drill.currentAttempt = {
      id: question.id,
      selected,
      correct,
      confidence: correct ? "" : "wrong",
      diagnosticRecorded: !correct && recordBusinessDiagnostic(
        drill.history[question.id],
        diagnosticTagsForPracticalSelection(question, selected)
      )
    };
    if (!correct) drill.retryIds = addPracticalId(drill.retryIds, question.id);
    saveState();
    renderPracticalDrill();
    renderBusinessMastery();
    renderPassPlan();
  }

  function setPracticalConfidence(confidence) {
    const drill = state.practicalDrill;
    const attempt = drill.currentAttempt;
    const question = currentPracticalQuestion();
    if (!question || !attempt?.correct || !["confident", "uncertain"].includes(confidence)) return;
    const history = drill.history[question.id];
    if (attempt.confidence === "uncertain" && history) {
      history.uncertain = Math.max(0, (history.uncertain || 0) - 1);
    }
    attempt.confidence = confidence;
    if (history) {
      history.uncertain = (history.uncertain || 0) + (confidence === "uncertain" ? 1 : 0);
      history.lastConfidence = confidence;
    }
    if (confidence === "uncertain" && !attempt.diagnosticRecorded) {
      attempt.diagnosticRecorded = recordBusinessDiagnostic(
        history,
        diagnosticTagsForPracticalSelection(currentPresentedPracticalQuestion(), attempt.selected, true)
      );
    }
    drill.retryIds = confidence === "uncertain"
      ? addPracticalId(drill.retryIds, question.id)
      : removePracticalId(drill.retryIds, question.id);
    saveState();
    renderPracticalDrill();
    renderBusinessMastery();
    renderPassPlan();
  }

  function advancePracticalDrill() {
    const drill = state.practicalDrill;
    if (!drill.currentAttempt || (drill.currentAttempt.correct && !drill.currentAttempt.confidence)) return;
    const answeredQuestion = currentPracticalQuestion();
    const history = answeredQuestion && drill.history[answeredQuestion.id];
    if (answeredQuestion?.scopeId === "business" && history && !drill.currentAttempt.masteryRecorded) {
      Object.assign(history, BUSINESS_MASTERY.recordOutcome(history, { correct: drill.currentAttempt.correct, confidence: drill.currentAttempt.confidence, answeredAt: history.lastAnsweredAt }));
      drill.currentAttempt.masteryRecorded = true;
    }
    if (drill.position + 1 < drill.queue.length) {
      drill.position += 1;
      drill.currentAttempt = null;
    } else {
      const pending = drill.retryIds.filter((id) => drill.sessionIds.includes(id));
      if (pending.length) {
        drill.stage = "retry";
        drill.queue = pending;
        drill.position = 0;
        drill.currentAttempt = null;
      } else {
        drill.stage = "complete";
        drill.queue = [];
        drill.position = 0;
        drill.currentAttempt = null;
        drill.sessionsCompleted += 1;
        drill.completedAt = new Date().toISOString();
      }
    }
    saveState();
    renderPracticalDrill();
    renderBusinessMastery();
    renderPassPlan();
    window.requestAnimationFrame(() =>
      elements.practicalDrillPanel?.scrollIntoView({ block: "start", behavior: "smooth" })
    );
  }

  function cancelPracticalDrill() {
    state.practicalDrill = {
      ...state.practicalDrill,
      stage: "idle",
      planMode: "",
      unitId: "",
      sessionIds: [],
      queue: [],
      position: 0,
      currentAttempt: null,
      sessionStartedAt: "",
      completedAt: ""
    };
    saveState();
    renderPracticalDrill();
    renderBusinessMastery();
    renderPassPlan();
  }

  function changePracticalDrillSettings() {
    const wasBusinessKnock = state.practicalDrill?.bankId === BUSINESS_FULLSCORE_BANK_ID &&
      state.practicalDrill?.planMode === "knock";
    cancelPracticalDrill();
    if (wasBusinessKnock) {
      window.requestAnimationFrame(() =>
        elements.businessKnockPanel?.scrollIntoView({ block: "center", behavior: "smooth" })
      );
    }
  }

  function exitPracticalDrill() {
    cancelPracticalDrill();
    if (elements.practicalDrillPanel) elements.practicalDrillPanel.open = false;
    elements.todayCommandPanel?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function renderCurrentView() {
    if (isMockMode() && state.mock.finalized) {
      showMockFinished();
      return;
    }
    if (isChapterMode() && state.finished) {
      showChapterFinished();
      return;
    }
    render();
  }

  function render() {
    resetQuizCardView();
    renderCalculationDrill();
    renderPracticalDrill();
    renderBusinessMastery();
    const question = currentQuestion();
    const answered = state.answered;
    const isCorrect = answered?.correct === true;
    const isWrong = answered?.correct === false;
    const chapterText = question.chapter?.label || "宅建全分野";
    const enemyType = ((question.chapter?.chapterIndex ?? 0) % CHAPTERS.length) + 1;
    const battleProfile = enemyProfileFor(question);
    const attackTier = isCorrect ? (answered.attackTier || attackTierFor(state.streak, answered.overdrive)) : 0;

    elements.enemyName.textContent = battleProfile.name;
    elements.enemyClassLabel.textContent = battleProfile.classLabel;
    const sourceLocator = question.sourceLocator || question.sourceRef;
    elements.sourceLabel.textContent = sourceLocator
      ? `令和8年度 / ${sourceLocator} / ${chapterText} / 基準日 ${question.legalBaseline}`
      : `旧問題 / 第1分冊 宅建業法 / ${chapterText} / ${question.level || "本試験寄せ"}`;
    elements.enemyStateLabel.textContent = isMockMode() && answered
      ? "ANSWER LOCKED"
      : answered
        ? (isCorrect ? "ONE HIT CLEAR" : "FOCUS BREAK")
        : "一撃で倒せ";
    elements.enemyHpText.textContent = isCorrect ? `0 / ${battleProfile.maxHp}` : `${battleProfile.maxHp} / ${battleProfile.maxHp}`;
    elements.enemyHpFill.style.width = isCorrect ? "0%" : "100%";
    elements.battleField.classList.toggle("is-hit", isCorrect);
    elements.battleField.classList.toggle("is-miss", isWrong);
    elements.battleField.classList.toggle("is-level-up", Boolean(isCorrect && answered?.levelUp));
    elements.battleField.classList.toggle("is-chest-open", Boolean(isCorrect && answered?.chestOpened));
    elements.battleField.classList.toggle("is-milestone", Boolean(isCorrect && answered?.milestone));
    elements.battleField.classList.toggle("is-quest-reward", Boolean(answered?.questRewards?.length));
    elements.battleField.dataset.chestTier = answered?.chestTier?.id || "";
    [1, 2, 3].forEach((tier) => elements.battleField.classList.toggle(`attack-tier-${tier}`, attackTier === tier));
    elements.battleField.dataset.stage = String(enemyType);
    elements.battleField.dataset.enemy = battleProfile.kind;
    elements.enemyVisual.src = battleProfile.asset;
    elements.enemyVisual.className = `enemy-visual is-${battleProfile.kind}`;
    elements.enemyTraitText.textContent = battleProfile.trait;
    elements.damageNumber.textContent = String(battleProfile.maxHp);
    elements.comboText.textContent = state.streak > 0 ? `COMBO ${state.streak}` : "COMBO 0";
    elements.focusText.textContent = `${state.focus}%`;
    elements.focusFill.style.width = `${state.focus}%`;
    elements.crystalText.textContent = `知識C ${state.crystals.toLocaleString("ja-JP")}`;
    elements.rewardBurst.textContent = isCorrect
      ? (answered.repeatClear
          ? "本日報酬済み"
          : typeof answered.xpReward === "number"
          ? `EXP +${answered.xpReward} / 知識C +${answered.reward || 0}`
          : `知識C +${answered.reward || 0}`)
      : "";
    const progressionEvents = [];
    if (answered?.milestone) progressionEvents.push(`${answered.milestone}体討伐`);
    if (answered?.levelUp) progressionEvents.push(`LEVEL UP Lv.${answered.newLevel}`);
    if (answered?.chestOpened) progressionEvents.push(`${answered.chestTier?.label || "銅"}宝箱 OPEN`);
    (answered?.questRewards || []).forEach((item) => progressionEvents.push(`戦果${item.label}`));
    elements.chestBurstTitle.textContent = progressionEvents.join(" / ");
    const titleReward = (answered?.rewardBreakdown || []).find((item) => item.label === "称号昇格");
    elements.chestBurstText.textContent = [
      ...(answered?.lootDrops || []).map((drop) => `${drop.name} +${drop.count}`),
      ...(answered?.questRewards || []).map((item) => `EXP +${item.xp} / 知識C +${item.crystals}`),
      ...(titleReward ? [`称号ボーナス +${titleReward.crystals}`] : [])
    ].join(" / ");
    if (isCorrect) {
      const questReward = answered.questRewards?.[answered.questRewards.length - 1];
      elements.battleAnnouncement.textContent = answered.repeatClear
        ? "再確認完了。本日の追加報酬は獲得済み。"
        : questReward
        ? `戦果${questReward.label}達成。EXP +${questReward.xp} / 知識C +${questReward.crystals}`
        : answered.chestOpened
          ? `${answered.chestTier?.label || "銅"}宝箱を開封。素材 +${answered.chestTier?.lootCount || 1}`
          : answered.overdrive
            ? `奥義発動。知識C +${answered.reward}`
            : answered.sameDayCorrection
              ? `${battleProfile.name}を修正確認。弱点克服は翌日再挑戦で判定。`
              : `${battleProfile.name}を一撃撃破。知識C +${answered.reward}`;
    } else if (isWrong) {
      elements.battleAnnouncement.textContent = `反撃を受けた。FOCUS ${answered.focusDelta}`;
    } else {
      elements.battleAnnouncement.textContent = isMockMode() && answered
        ? "解答を記録。正誤は50問終了後にまとめて採点。"
        : `${battleProfile.trait}。正解で一撃撃破。`;
    }
    elements.comboSubtext.textContent = state.streak >= 5
      ? "奥義圏内。次の正解も最大演出"
      : state.streak >= 3
        ? "連撃中。5連正解で奥義"
        : `あと${Math.max(0, 3 - state.streak)}連正解で連撃`;
    if (elements.rewardBreakdown) {
      const parts = answered?.rewardBreakdown || [];
      elements.rewardBreakdown.textContent = parts.length
        ? parts.map((part) => {
            const amounts = [
              part.xp ? `+${part.xp}EXP` : "",
              part.crystals ? `+${part.crystals}知識C` : ""
            ].filter(Boolean).join("・");
            return `${part.label} ${amounts}`;
          }).join(" / ")
        : (answered?.correct === false
            ? "原因と誤認肢を記録すると分析EXPを獲得"
            : answered?.repeatClear
              ? "同一問題の主報酬は1日1回"
              : "初見・翌日弱点克服・全肢で宝箱品質UP");
      elements.rewardBreakdown.title = parts
        .map((part) => `${part.label}: EXP +${part.xp} / CRYSTAL +${part.crystals}`)
        .join(" / ");
    }
    renderProgression();
    renderCampaignRoute(question);

    const curriculumIndex = CURRICULUM_ORDER.indexOf(question.id);
    const supplementalIndex = SUPPLEMENTAL_ORDER.indexOf(question.id);
    const supplementalPart = question.chapter?.textbookPart;
    const supplementalPartIds = SUPPLEMENTAL_ORDER.filter((id) =>
      idToChapter.get(id)?.textbookPart === supplementalPart
    );
    const dailyIndex = dailyQuestIds().indexOf(question.id);
    const scopeIndex = scopeNewIds().indexOf(question.id);
    const activeChapter = chapterModeChapter();
    const chapterIndex = activeChapter?.ids.indexOf(question.id) ?? -1;
    elements.roundLabel.textContent = isMockMode()
      ? `${state.mock.position + 1} / ${mockQuestionIds().length}`
      : chapterIndex >= 0
        ? `テーマ ${chapterIndex + 1} / ${activeChapter.ids.length}`
      : dailyIndex >= 0 && !isFirstPassMode()
        ? `${state.daily.planMode === "unit" ? "読後" : "今日"} ${dailyIndex + 1} / ${dailyQuestIds().length}`
        : scopeIndex >= 0
          ? `範囲 ${scopeIndex + 1} / ${scopeNewIds().length}`
          : curriculumIndex >= 0
            ? `${curriculumIndex + 1} / ${CURRICULUM_ORDER.length}`
            : supplementalIndex >= 0
              ? `第${supplementalPart}分冊 補助 ${supplementalPartIds.indexOf(question.id) + 1} / ${supplementalPartIds.length}`
              : `旧業法 ${LEGACY_ORDER.indexOf(question.id) + 1} / ${LEGACY_ORDER.length}`;
    elements.tagBadge.textContent = question.format ? `${question.tag}・${question.format}` : question.tag;
    elements.markButton.hidden = isMockMode();
    elements.markButton.classList.toggle("is-marked", Boolean(state.marked[question.id]));
    elements.markButton.textContent = state.marked[question.id] ? "復習中" : "要復習";
    elements.questionText.textContent = question.text;

    renderCutCheck(question);
    renderChoices(question);
    renderFeedback(question);
    renderAnswerDock(question);
    renderStats();
    renderChapters(question.id);
    renderThemeControls(question);
    renderAdaptiveCoach(question);
    renderQuestPanel();
    renderSprint();
    renderPassPlan();
    updateLogStatusText();
  }

  function removeCutCheck() {
    const existing = elements.quizCard?.querySelector(".cut-check-panel");
    if (existing) {
      existing.remove();
    }
  }

  function choiceStatements(question) {
    const statements = String(question.text || "")
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([ア-ン]|[0-9０-９]+)\s+(.+)$/))
      .filter(Boolean)
      .map((match) => ({ label: match[1], text: match[2].trim() }));
    return statements.length === 4 ? statements : [];
  }

  function choiceCutFacts(question) {
    const sourceExplanations = Array.isArray(question.statementExplanations)
      ? question.statementExplanations
      : question.choiceExplanations;
    if (!Array.isArray(sourceExplanations)) {
      return [];
    }
    const lines = sourceExplanations.slice(0, 4);
    if (lines.length !== 4) {
      return [];
    }
    const statements = choiceStatements(question);
    const facts = lines.map((line, index) => {
      const marker = String(line).match(/[○×]/)?.[0];
      if (!marker) return null;
      const reason = String(line)
        .replace(/^\s*(?:[ア-ン]|[0-9０-９]+)\s*[○×]\s*/, "")
        .trim();
      return {
        index,
        truth: marker === "○",
        statement: statements[index]?.text || question.choices[index],
        reason: reason || "解説を確認"
      };
    });
    return facts.every(Boolean) ? facts : [];
  }

  function choiceSourceLabel(question, index) {
    const sourceExplanations = Array.isArray(question.statementExplanations)
      ? question.statementExplanations
      : question.choiceExplanations;
    const sourceLine = String(sourceExplanations?.[index] || "");
    return sourceLine.match(/^\s*([ア-ン]|[0-9０-９]+)/)?.[1] || String(index + 1);
  }

  function mistakeCauseLabel(causeId) {
    return MISTAKE_CAUSES.find((item) => item.id === causeId)?.label || "";
  }

  function hasMistakeTarget(answered = state.answered) {
    return Boolean(
      answered &&
      ((Array.isArray(answered.mistakeItems) && answered.mistakeItems.length > 0) || answered.mistakeUnknown)
    );
  }

  function mistakeRecorded(answered = state.answered) {
    if (!answered || answered.correct !== false) return true;
    return hasMistakeTarget(answered) && MISTAKE_CAUSE_IDS.has(answered.mistakeCause);
  }

  function shouldCutCheck(id) {
    if (isFirstPassMode() || isMockMode()) {
      return false;
    }
    const stats = statsFor(id);
    return !state.answered && Boolean(
      state.marked[id] ||
      state.autoMarked[id] ||
      (stats.wrong || 0) > (stats.correct || 0) ||
      (stats.cutCheckWrong || 0) > (stats.cutCheckCorrect || 0) ||
      stats.lastConfidence === "unsure" ||
      stats.lastConfidence === "cuts"
    );
  }

  function ensureCutCheck(question) {
    const facts = choiceCutFacts(question);
    if (!facts.length || !shouldCutCheck(question.id)) {
      if (state.activeCutCheck?.id === question.id && !state.answered) {
        state.activeCutCheck = null;
      }
      return null;
    }
    if (!state.activeCutCheck || state.activeCutCheck.id !== question.id) {
      state.activeCutCheck = { id: question.id, answers: {} };
    }
    state.activeCutCheck.answers = state.activeCutCheck.answers || {};
    return {
      id: question.id,
      facts,
      answers: state.activeCutCheck.answers
    };
  }

  function cutCheckResult(question) {
    const active = ensureCutCheck(question);
    if (!active) return null;
    const items = active.facts.map((fact) => {
      const selected = active.answers[String(fact.index)];
      return {
        index: fact.index,
        selected,
        expected: fact.truth,
        correct: typeof selected === "boolean" && selected === fact.truth
      };
    });
    const complete = items.every((item) => typeof item.selected === "boolean");
    return {
      complete,
      allCorrect: complete && items.every((item) => item.correct),
      wrongCount: complete ? items.filter((item) => !item.correct).length : null,
      items
    };
  }

  function isCutCheckLocked(question) {
    const result = cutCheckResult(question);
    return Boolean(result && !result.complete);
  }

  function renderCutCheck(question) {
    removeCutCheck();
    const active = ensureCutCheck(question);
    if (!active) return;

    const result = cutCheckResult(question);
    const done = result.items.filter((item) => typeof item.selected === "boolean").length;
    const wrapper = document.createElement("section");
    wrapper.className = "cut-check-panel";

    const head = document.createElement("div");
    head.className = "cut-check-head";
    const title = document.createElement("strong");
    title.textContent = "弱点全肢チェック";
    const status = document.createElement("span");
    status.textContent = result.complete ? "4択回答可" : `${done}/${active.facts.length}肢`;
    head.append(title, status);

    const lead = document.createElement("p");
    lead.textContent = "4択の前に、各肢を○×で切る。";

    const list = document.createElement("div");
    list.className = "cut-check-list";
    active.facts.forEach((fact) => {
      const row = document.createElement("div");
      row.className = "cut-check-row";

      const copy = document.createElement("div");
      copy.className = "cut-check-copy";
      const label = document.createElement("span");
      label.textContent = String(fact.index + 1);
      const text = document.createElement("p");
      text.textContent = fact.statement;
      copy.append(label, text);

      const actions = document.createElement("div");
      actions.className = "cut-check-actions";
      [
        { value: true, label: "○" },
        { value: false, label: "×" }
      ].forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cut-check-button";
        button.textContent = item.label;
        button.classList.toggle("is-selected", active.answers[String(fact.index)] === item.value);
        button.addEventListener("click", () => setCutCheck(fact.index, item.value));
        actions.append(button);
      });

      row.append(copy, actions);
      list.append(row);
    });

    wrapper.append(head, lead);
    wrapper.append(list);
    elements.quizCard.insertBefore(wrapper, elements.choices);
  }

  function setCutCheck(index, value) {
    if (state.answered) return;
    const question = currentQuestion();
    const active = ensureCutCheck(question);
    if (!active) return;
    active.answers[String(index)] = value;
    state.activeCutCheck = {
      id: question.id,
      answers: active.answers
    };
    saveState();
    render();
  }

  function renderChoices(question) {
    elements.choices.replaceChildren();
    elements.choices.classList.toggle("short-choices", question.choices.every((choice) => choice.length <= 4));
    const answered = state.answered;
    const lockedByCutCheck = isCutCheckLocked(question);
    question.choices.forEach((choice, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-button";
      button.disabled = Boolean(answered) || lockedByCutCheck;
      button.classList.toggle("is-locked", lockedByCutCheck && !answered);
      if (lockedByCutCheck && !answered) {
        button.title = "先に全肢○×チェックを完了";
      }
      button.dataset.index = String(index);
      if (answered) {
        if (answered.mock) {
          if (index === answered.selected) button.classList.add("is-mock-selected");
        } else {
          if (index === question.answer) button.classList.add("is-correct");
          if (index === answered.selected && index !== question.answer) button.classList.add("is-wrong");
        }
      }

      const number = document.createElement("span");
      number.className = "choice-number";
      number.textContent = String(index + 1);

      const text = document.createElement("span");
      text.className = "choice-text";
      text.textContent = choice;

      button.append(number, text);
      button.addEventListener("click", () => answer(index));
      elements.choices.append(button);
    });
  }

  function renderBookReference(question) {
    elements.bookRef.replaceChildren();
    if (question.sourceRef && question.sourceUrl) {
      const link = document.createElement("a");
      link.className = "official-source-link";
      link.href = question.sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `公式根拠: ${question.sourceLocator || question.sourceRef}（基準日 ${question.legalBaseline}）`;
      elements.bookRef.append(link);
      return;
    }
    elements.bookRef.textContent =
      TOPIC_REFS[question.tag] || `旧・第1分冊 宅建業法 / ${question.tag}`;
  }

  function renderFeedback(question) {
    const answered = state.answered;
    removeAdaptiveFeedback();
    removeConfidenceCheck();
    removeReasoningPath();
    elements.feedbackBox.querySelector(".answer-save-receipt")?.remove();
    elements.feedbackBox.hidden = !answered;
    if (!answered) {
      return;
    }
    const answerGrid = elements.feedbackBox.querySelector(".answer-grid");
    if (answered.mock) {
      elements.feedbackBox
        .querySelectorAll(".cut-list, .verdict-board, .reasoning-path, .mistake-capture, .memory-rule, .confidence-check, .adaptive-note")
        .forEach((node) => node.remove());
      if (answerGrid) answerGrid.hidden = true;
      elements.feedbackTitle.textContent = "解答を記録しました";
      elements.correctAnswer.textContent = "";
      elements.trapText.textContent = "";
      elements.bookRef.textContent = "";
      elements.explainText.textContent =
        "正誤・正解肢・解説は50問終了後にまとめて表示します。途中で答え合わせはしません。";
      elements.nextButton.textContent = nextActionLabel();
      return;
    }
    if (answerGrid) answerGrid.hidden = false;
    elements.feedbackTitle.textContent = answered.correct
      ? "撃破。根拠でこう解く"
      : "反撃。根拠からこう直す";
    const receipt = document.createElement("p");
    receipt.className = "answer-save-receipt";
    receipt.textContent = lastSuccessfulSaveAt
      ? "解答・進捗をこの端末へ自動保存済み"
      : "解答・進捗はこの端末へ自動保存されます";
    elements.feedbackTitle.insertAdjacentElement("afterend", receipt);
    elements.correctAnswer.textContent = `${question.answer + 1}. ${question.choices[question.answer]}`;
    elements.trapText.textContent = question.trap || "正解肢だけでなく、他の肢を切れる理由まで確認する。";
    renderBookReference(question);
    elements.explainText.textContent = question.explain;
    renderChoiceExplanations(question);
    renderReasoningPath(question);
    renderPriorMistakeRecall(question);
    renderMistakeCapture(question);
    renderMemoryRule(question);
    renderAdaptiveFeedback(question);
    elements.nextButton.textContent = nextActionLabel();
  }

  function renderChoiceExplanations(question) {
    elements.feedbackBox.querySelectorAll(".cut-list, .verdict-board").forEach((node) => node.remove());
    const facts = choiceCutFacts(question);
    if (!facts.length) {
      return;
    }

    const wrapper = document.createElement("section");
    wrapper.className = "verdict-board";
    wrapper.setAttribute("aria-label", "全肢の正誤と理由");

    const head = document.createElement("div");
    head.className = "verdict-head";
    const title = document.createElement("strong");
    title.textContent = "全肢判定";
    const score = document.createElement("span");
    const trueCount = facts.filter((fact) => fact.truth).length;
    score.textContent = `○ ${trueCount} / × ${facts.length - trueCount}`;
    head.append(title, score);

    const grid = document.createElement("div");
    grid.className = "verdict-grid";
    facts.forEach((fact) => {
      const sourceLabel = choiceSourceLabel(question, fact.index);
      const item = document.createElement("article");
      item.className = `verdict-item ${fact.truth ? "is-true" : "is-false"}`;
      item.setAttribute("aria-label", `${sourceLabel} ${fact.truth ? "正しい" : "誤り"} ${fact.statement} 理由 ${fact.reason}`);

      const label = document.createElement("span");
      label.className = "verdict-label";
      label.textContent = sourceLabel;
      const mark = document.createElement("strong");
      mark.className = "verdict-mark";
      mark.textContent = fact.truth ? "○" : "×";
      const copy = document.createElement("div");
      copy.className = "verdict-copy";
      const statement = document.createElement("p");
      statement.className = "verdict-statement";
      statement.textContent = fact.statement;
      const reason = document.createElement("p");
      reason.className = "verdict-reason";
      reason.textContent = `理由: ${fact.reason}`;
      copy.append(statement, reason);
      item.append(label, mark, copy);
      grid.append(item);
    });

    wrapper.append(head, grid);
    const answerGrid = elements.feedbackBox.querySelector(".answer-grid");
    elements.feedbackBox.insertBefore(wrapper, answerGrid || elements.explainText);
  }

  function removeReasoningPath() {
    elements.feedbackBox.querySelector(".reasoning-path")?.remove();
    elements.explainText.hidden = false;
  }

  function reasoningApplicationText(question, facts) {
    if (question.format === "個数問題") {
      const trueLabels = facts
        .filter((fact) => fact.truth)
        .map((fact) => choiceSourceLabel(question, fact.index));
      const countText = question.choices[question.answer] || `${trueLabels.length}個`;
      return `各記述を独立に判定すると、○は${trueLabels.join("・")}の${trueLabels.length}個。したがって答えは「${countText}」。`;
    }

    const correct = facts.find((fact) => fact.index === question.answer);
    const selected = facts.find((fact) => fact.index === state.answered?.selected);
    if (!correct) return "正解肢の理由を全肢判定で確認する。";
    const correctText = `正解肢${choiceSourceLabel(question, correct.index)}: ${correct.reason}`;
    if (!selected || selected.index === correct.index) return correctText;
    return `選んだ肢${choiceSourceLabel(question, selected.index)}: ${selected.reason} ${correctText}`;
  }

  function renderReasoningPath(question) {
    const facts = choiceCutFacts(question);
    if (!facts.length || !state.answered || state.answered.mock) return;

    const wrapper = document.createElement("section");
    wrapper.className = "reasoning-path";
    wrapper.setAttribute("aria-label", "この問題の解き方と根拠");

    const heading = document.createElement("div");
    heading.className = "reasoning-path-head";
    const title = document.createElement("strong");
    title.textContent = "こう解く";
    const subtitle = document.createElement("span");
    subtitle.textContent = "見る条件 → 使う根拠 → 当てはめ";
    heading.append(title, subtitle);

    const list = document.createElement("ol");
    list.className = "reasoning-steps";
    [
      {
        label: "見る条件",
        text: question.memoryCue || question.trap || String(question.text || "").split("\n")[0]
      },
      { label: "使う根拠", text: question.explain },
      { label: "この問題への当てはめ", text: reasoningApplicationText(question, facts) }
    ].forEach((step, index) => {
      const item = document.createElement("li");
      const marker = document.createElement("span");
      marker.textContent = String(index + 1);
      const copy = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = step.label;
      const text = document.createElement("p");
      text.textContent = step.text;
      copy.append(label, text);
      item.append(marker, copy);
      list.append(item);
    });

    wrapper.append(heading, list);
    const verdict = elements.feedbackBox.querySelector(".verdict-board");
    elements.feedbackBox.insertBefore(wrapper, verdict || elements.feedbackBox.firstChild);
    elements.explainText.hidden = true;
  }

  function renderPriorMistakeRecall(question) {
    elements.feedbackBox.querySelector(".mistake-recall")?.remove();
    const currentStats = statsFor(question.id);
    const priorStats = Object.prototype.hasOwnProperty.call(state.answered || {}, "priorMistake")
      ? (state.answered.priorMistake || {})
      : currentStats;
    const priorItems = priorStats.items || priorStats.lastMistakeItems;
    const priorMistakes = Array.isArray(priorItems)
      ? priorItems.map((index) => choiceSourceLabel(question, index))
      : [];
    const priorUnknown = Boolean(priorStats.unknown ?? priorStats.lastMistakeUnknown);
    const priorCause = priorStats.cause ?? priorStats.lastMistakeCause;
    const priorNote = priorStats.note ?? priorStats.lastMistakeNote;
    if (!priorMistakes.length && !priorUnknown && !priorNote) return;
    const recall = document.createElement("div");
    recall.className = "mistake-recall";
    const targetText = priorUnknown
      ? "原因不明"
      : (priorMistakes.length ? `${priorMistakes.join("・")}を誤認` : "メモあり");
    const causeText = mistakeCauseLabel(priorCause);
    const title = document.createElement("strong");
    title.textContent = "前回のミス";
    const copy = document.createElement("p");
    copy.textContent = [targetText, causeText, priorNote].filter(Boolean).join(" / ");
    recall.append(title, copy);
    const verdict = elements.feedbackBox.querySelector(".verdict-board");
    if (verdict) verdict.insertAdjacentElement("afterend", recall);
    else elements.feedbackBox.insertBefore(recall, elements.feedbackBox.querySelector(".answer-grid"));
  }

  function removeMistakeCapture() {
    elements.feedbackBox.querySelector(".mistake-capture")?.remove();
  }

  function renderMemoryRule(question) {
    elements.feedbackBox.querySelector(".memory-rule")?.remove();
    if (!question.memoryRule) return;
    const stats = statsFor(question.id);
    const wrapper = document.createElement("section");
    wrapper.className = "memory-rule";
    const label = document.createElement("span");
    label.textContent = (stats.wrong || 0) >= 2 ? "再発弱点を修正" : "記憶を修正";
    const cue = document.createElement("strong");
    cue.textContent = question.memoryCue || question.trap || "次回の判断軸";
    const rule = document.createElement("p");
    rule.textContent = question.memoryRule;
    wrapper.append(label, cue, rule);
    const anchor = elements.feedbackBox.querySelector(".mistake-capture")
      || elements.feedbackBox.querySelector(".mistake-recall")
      || elements.feedbackBox.querySelector(".verdict-board");
    if (anchor) anchor.insertAdjacentElement("afterend", wrapper);
    else elements.feedbackBox.insertBefore(wrapper, elements.feedbackBox.querySelector(".answer-grid"));
  }

  function renderMistakeCapture(question) {
    removeMistakeCapture();
    const answered = state.answered;
    if (!answered || answered.correct !== false) return;

    answered.mistakeItems = Array.isArray(answered.mistakeItems) ? answered.mistakeItems : [];
    answered.mistakeUnknown = Boolean(answered.mistakeUnknown);
    answered.mistakeNote = String(answered.mistakeNote || "");
    answered.mistakeCause = MISTAKE_CAUSE_IDS.has(answered.mistakeCause) ? answered.mistakeCause : "";
    const selected = new Set(answered.mistakeItems);
    const wrapper = document.createElement("section");
    wrapper.className = "mistake-capture";
    wrapper.classList.toggle("is-complete", mistakeRecorded(answered));
    wrapper.setAttribute("aria-label", "今回のミス記録");

    const head = document.createElement("div");
    head.className = "mistake-capture-head";
    const title = document.createElement("strong");
    title.textContent = "ミス原因を残す（任意）";
    const status = document.createElement("span");
    status.className = "mistake-save-status";
    status.textContent = mistakeRecorded(answered) ? "自動保存済み" : "任意・未記録でも次へ進める";
    head.append(title, status);

    const lead = document.createElement("p");
    lead.className = "mistake-capture-lead";
    lead.textContent = "残したいときだけ、誤認した肢と原因を選ぶ。書かなくても解説を読んで次へ進める。";

    const targets = document.createElement("div");
    targets.className = "mistake-targets";
    choiceCutFacts(question).forEach((fact) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mistake-target-button";
      button.classList.toggle("is-selected", selected.has(fact.index));
      button.setAttribute("aria-pressed", String(selected.has(fact.index)));
      button.innerHTML = `<strong>${choiceSourceLabel(question, fact.index)}</strong><span>誤認</span>`;
      button.addEventListener("click", () => toggleMistakeItem(fact.index));
      targets.append(button);
    });
    const unknownButton = document.createElement("button");
    unknownButton.type = "button";
    unknownButton.className = "mistake-target-button is-unknown";
    unknownButton.classList.toggle("is-selected", answered.mistakeUnknown);
    unknownButton.setAttribute("aria-pressed", String(answered.mistakeUnknown));
    unknownButton.innerHTML = "<strong>?</strong><span>原因不明</span>";
    unknownButton.addEventListener("click", toggleMistakeUnknown);
    targets.append(unknownButton);

    const causeField = document.createElement("fieldset");
    causeField.className = "mistake-cause-field";
    const causeLegend = document.createElement("legend");
    causeLegend.textContent = "原因タグ（任意）";
    const causeButtons = document.createElement("div");
    causeButtons.className = "mistake-causes";
    MISTAKE_CAUSES.forEach((cause) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mistake-cause-button";
      button.classList.toggle("is-selected", answered.mistakeCause === cause.id);
      button.setAttribute("aria-pressed", String(answered.mistakeCause === cause.id));
      button.textContent = cause.label;
      button.addEventListener("click", () => setMistakeCause(cause.id));
      causeButtons.append(button);
    });
    causeField.append(causeLegend, causeButtons);

    const noteLabel = document.createElement("label");
    noteLabel.className = "mistake-note-label";
    const noteTitle = document.createElement("span");
    noteTitle.textContent = "一言メモ（任意）";
    const textarea = document.createElement("textarea");
    textarea.className = "mistake-note-input";
    textarea.maxLength = 160;
    textarea.rows = 2;
    textarea.placeholder = "例：免許換えだと思ったが、同一県内なので変更届";
    textarea.value = answered.mistakeNote;
    textarea.addEventListener("input", (event) => updateMistakeNote(event.target.value));
    noteLabel.append(noteTitle, textarea);

    wrapper.append(head, lead, targets, causeField, noteLabel);
    const verdictBoard = elements.feedbackBox.querySelector(".verdict-board");
    if (verdictBoard) {
      verdictBoard.insertAdjacentElement("afterend", wrapper);
    } else {
      elements.feedbackBox.insertBefore(wrapper, elements.feedbackBox.querySelector(".answer-grid"));
    }
  }

  function syncMistakeStats() {
    const answered = state.answered;
    if (!answered || answered.correct !== false) return;
    const stats = statsFor(answered.id);
    state.questionStats[answered.id] = {
      ...stats,
      lastMistakeItems: [...(answered.mistakeItems || [])],
      lastMistakeUnknown: Boolean(answered.mistakeUnknown),
      lastMistakeCause: answered.mistakeCause || "",
      lastMistakeNote: String(answered.mistakeNote || "").trim(),
      lastMistakeAt: new Date().toISOString()
    };
  }

  function mistakeLogPayload() {
    const question = currentQuestion();
    const answered = state.answered;
    const facts = choiceCutFacts(question);
    return {
      id: question.id,
      tag: question.tag,
      items: (answered.mistakeItems || []).map((index) => ({
        index,
        label: choiceSourceLabel(question, index),
        truth: facts[index]?.truth,
        statement: facts[index]?.statement || "",
        reason: facts[index]?.reason || ""
      })),
      unknown: Boolean(answered.mistakeUnknown),
      cause: answered.mistakeCause || "",
      causeLabel: mistakeCauseLabel(answered.mistakeCause),
      note: String(answered.mistakeNote || "").trim(),
      runMode: state.runMode
    };
  }

  function logMistakeDetail() {
    if (!state.answered || state.answered.correct !== false || !mistakeRecorded()) return;
    logStudyEvent("mistake-detail", mistakeLogPayload());
  }

  function grantMistakeAnalysisReward() {
    const answered = state.answered;
    if (!answered || answered.correct !== false || answered.analysisRewardGranted || !mistakeRecorded()) return false;
    const claimDate = todayKey();
    const claimedIds = new Set(state.analysisRewardClaims[claimDate] || []);
    if (claimedIds.has(answered.id)) {
      answered.analysisRewardGranted = true;
      answered.analysisRewardRepeated = true;
      saveState();
      return false;
    }
    const previousProgression = progressionForXp(state.totalXp);
    const analysisXp = REWARD_SYSTEM.BATTLE_REWARDS.analysis.xp;
    state.totalXp += analysisXp;
    answered.xpReward = (answered.xpReward || 0) + analysisXp;
    answered.rewardBreakdown = [...(answered.rewardBreakdown || []), { label: "分析完了", xp: analysisXp, crystals: 0 }];
    answered.analysisRewardGranted = true;
    state.analysisRewardClaims[claimDate] = [...claimedIds, answered.id];
    const nextProgression = progressionForXp(state.totalXp);
    if (nextProgression.level > previousProgression.level) {
      answered.levelUp = true;
      answered.newLevel = nextProgression.level;
      const rankBonus = rankBonusForLevels(previousProgression.level, nextProgression.level);
      if (rankBonus) {
        state.crystals += rankBonus;
        answered.reward += rankBonus;
        answered.rewardBreakdown.push({ label: "称号昇格", xp: 0, crystals: rankBonus });
      }
    }
    saveState();
    logStudyEvent("analysis-reward", {
      id: answered.id,
      xp: analysisXp,
      totalXp: state.totalXp,
      level: nextProgression.level
    });
    render();
    return true;
  }

  function toggleMistakeItem(index) {
    if (!state.answered || state.answered.correct !== false) return;
    const selected = new Set(state.answered.mistakeItems || []);
    if (selected.has(index)) selected.delete(index);
    else selected.add(index);
    state.answered.mistakeItems = [...selected].sort((left, right) => left - right);
    state.answered.mistakeUnknown = false;
    syncMistakeStats();
    saveState();
    render();
  }

  function toggleMistakeUnknown() {
    if (!state.answered || state.answered.correct !== false) return;
    state.answered.mistakeUnknown = !state.answered.mistakeUnknown;
    if (state.answered.mistakeUnknown) state.answered.mistakeItems = [];
    syncMistakeStats();
    saveState();
    render();
  }

  function setMistakeCause(causeId) {
    if (!state.answered || state.answered.correct !== false || !MISTAKE_CAUSE_IDS.has(causeId)) return;
    state.answered.mistakeCause = causeId;
    syncMistakeStats();
    saveState();
    render();
  }

  function updateMistakeNote(value) {
    if (!state.answered || state.answered.correct !== false) return;
    state.answered.mistakeNote = String(value || "").slice(0, 160);
    syncMistakeStats();
    saveState();
    const status = elements.feedbackBox.querySelector(".mistake-save-status");
    if (status) status.textContent = mistakeRecorded() ? "自動保存済み" : "任意・未記録でも次へ進める";
    elements.dockNextLabel.textContent = nextActionLabel();
    elements.dockTargetText.textContent = nextTargetId()
      ? `次 ${questionPositionText(nextTargetId())} ・ ${QUESTIONS[nextTargetId()].tag}`
      : "次の進行先を確認";
  }

  function removeConfidenceCheck() {
    const existing = elements.feedbackBox.querySelector(".confidence-check");
    if (existing) {
      existing.remove();
    }
  }

  function removeAdaptiveFeedback() {
    const existing = elements.feedbackBox.querySelector(".adaptive-note");
    if (existing) {
      existing.remove();
    }
  }

  function renderAdaptiveFeedback(question) {
    removeAdaptiveFeedback();
    const note = document.createElement("section");
    note.className = "adaptive-note";
    const displayScope = activeDisplayScopeConfig();

    const title = document.createElement("strong");
    title.textContent = isFirstPassMode()
      ? `${displayScope.shortLabel}の追加演習`
      : `${displayScope.shortLabel}の合格ロード`;

    const text = document.createElement("p");
    if (isFirstPassMode()) {
      const remaining = remainingFirstPassCount();
      text.textContent = remaining > 0
        ? `誤答・迷いは弱点に記録し、${studyScopeConfig().shortLabel}の未接触へ進む。残り${remaining}問。`
        : `${studyScopeConfig().shortLabel}は全問接触済み。翌日以降の定着確認へ戻る。`;
      note.append(title, text);
      elements.feedbackBox.insertBefore(note, elements.nextButton);
      return;
    }

    if (remainingFirstPassCount() > 0) {
      text.textContent = state.answered?.correct === false
        ? `${question.tag}を弱点に登録。今日の並びは変えず、翌日以降の固定10問で優先して再テストする。`
        : "この論点は接触済み。一度の正解では定着にせず、翌日以降にもう一度確認する。";
    } else if (state.answered?.correct === false) {
      text.textContent = `${question.tag}を弱点に登録。本日の固定10問は変えず、翌日以降の定着ロードで優先して再テストする。`;
    } else if (curriculumWeakIds().length > 0) {
      text.textContent = "本日の固定比率を保って次問へ進む。弱点は翌日以降の定着ロードで優先する。";
    } else {
      text.textContent = "本日の固定比率を保って次問へ進む。翌日以降は最終接触が古い問題から再テストする。";
    }

    note.append(title, text);
    elements.feedbackBox.insertBefore(note, elements.nextButton);
  }

  function renderStats() {
    if (isMockMode()) {
      const finalized = Boolean(state.mock.finalized);
      const mockScore = (state.mock.results || []).filter((result) => result.correct).length;
      if (elements.attemptLabel) elements.attemptLabel.textContent = "解答";
      if (elements.accuracyLabel) elements.accuracyLabel.textContent = finalized ? "得点" : "正答率";
      if (elements.streakLabel) elements.streakLabel.textContent = finalized ? "所要時間" : "残り時間";
      if (elements.markedLabel) elements.markedLabel.textContent = "要復習";
      elements.attemptCount.textContent = String(mockAnsweredCount());
      elements.accuracyText.textContent = finalized ? `${mockScore}/50` : "採点後";
      elements.streakText.textContent = finalized ? formatElapsed(state.mock.elapsedMs) : mockTimeText();
      elements.markedText.textContent = String(weakIds().length);
      elements.chapterProgressText.textContent = `${state.mock.position + 1} / 50問`;
      if (elements.studyTitle) elements.studyTitle.textContent = `宅建 ${mockFormShortLabel()}`;
      if (elements.todayLabel) elements.todayLabel.textContent = "本試験配分50問・120分";
      if (elements.progressDrawerSummary) {
        elements.progressDrawerSummary.textContent =
          `模試 ${mockAnsweredCount()} / 50・要復習${weakIds().length}`;
      }
      return;
    }
    if (elements.attemptLabel) elements.attemptLabel.textContent = "解答";
    if (elements.accuracyLabel) elements.accuracyLabel.textContent = "正答率";
    if (elements.streakLabel) elements.streakLabel.textContent = "連続正解";
    if (elements.markedLabel) elements.markedLabel.textContent = "要復習";
    const attempts = Math.max(state.attempts, Number(state.centralProgress?.answers) || 0);
    const correct = Math.max(state.correct, Number(state.centralProgress?.correct) || 0);
    elements.attemptCount.textContent = String(attempts);
    elements.accuracyText.textContent = attempts ? `${Math.round((correct / attempts) * 100)}%` : "-";
    elements.streakText.textContent = state.bestStreak ? `${state.streak}/${state.bestStreak}` : String(state.streak);
    elements.markedText.textContent = String(weakIds().length);
    elements.chapterProgressText.textContent =
      `定着${retainedCount()}/${CURRICULUM_ORDER.length}・接触${contactedCount()}`;
    if (elements.studyTitle) {
      elements.studyTitle.textContent = isFirstPassMode()
        ? `宅建 ${studyScopeConfig().shortLabel}追加`
        : `宅建 ${studyScopeConfig().shortLabel}`;
    }
    if (elements.todayLabel) {
      const progress = scopeProgress();
      elements.todayLabel.textContent = isFirstPassMode()
        ? firstPassRemainingText()
        : `定着${progress.retained}/${progress.total}・復習待ち${progress.due}`;
    }
    if (elements.progressDrawerSummary) {
      elements.progressDrawerSummary.textContent =
        `解答${attempts}・定着${retainedCount()} / ${CURRICULUM_ORDER.length}・弱点${weakIds().length}`;
    }
  }

  function renderQuestPanel() {
    if (!elements.dailyQuestTitle) return;
    state.daily = normalizeDailyState(state.daily);
    elements.questCard?.classList.toggle("is-mock", isMockMode());
    elements.questCard?.classList.toggle("is-first-pass", isFirstPassMode());
    const mockReady = remainingExamCoverageCount() === 0;
    [elements.mockAButton, elements.mockBButton].forEach((button) => {
      if (!button) return;
      button.disabled = !mockReady && !isMockMode();
      button.title = mockReady ? "" : `全100問接触後に解放・残り${remainingExamCoverageCount()}問`;
      button.classList.remove("is-active");
    });
    if (isMockMode()) {
      const form = currentMockForm();
      const answered = mockAnsweredCount();
      const remaining = Math.max(0, form.ids.length - answered);
      if (elements.questLabel) elements.questLabel.textContent = "50問確認模試";
      elements.dailyQuestTitle.textContent = `${mockFormShortLabel(form)} ${state.mock.position + 1} / ${form.ids.length}`;
      if (elements.dailyAnswerLabel) elements.dailyAnswerLabel.textContent = "解答";
      if (elements.dailyCorrectLabel) elements.dailyCorrectLabel.textContent = "未回答";
      if (elements.dailyWeakLabel) elements.dailyWeakLabel.textContent = "残り時間";
      elements.dailyAnswerText.textContent = `${answered}問`;
      elements.dailyCorrectText.textContent = `${remaining}問`;
      elements.dailyWeakText.textContent = mockTimeText();
      elements.dailyQuestFill.style.width = `${Math.round((answered / form.ids.length) * 100)}%`;
      if (elements.dailyQuestSource) {
        elements.dailyQuestSource.textContent = "50問・120分・正誤は終了後に採点";
      }
      if (elements.questRewardRail) elements.questRewardRail.hidden = true;
      elements.dailyQuestButton.textContent = "模試を中断";
      elements.dailyQuestButton.disabled = false;
      elements.passQuestButton.disabled = true;
      elements.weakQuestButton.disabled = true;
      elements.sprintButton.disabled = true;
      const activeButton = form.id === "form-a" ? elements.mockAButton : elements.mockBButton;
      activeButton?.classList.add("is-active");
      return;
    }
    elements.dailyQuestButton.disabled = false;
    elements.passQuestButton.disabled = false;
    elements.sprintButton.disabled = false;
    const measurementLocked = !foundationCoverageComplete();
    [elements.mockAButton, elements.mockBButton].forEach((button) => {
      if (!button) return;
      button.disabled = measurementLocked;
      button.title = measurementLocked ? "45単元の読後問題完了後に解放" : "";
    });
    const target = state.daily.target || DAILY_TARGET;
    const fixedIds = dailyQuestIds();
    const fixedTarget = fixedIds.length || target;
    const fixedDone = dailyQuestDoneCount();
    const fixedClear = dailyQuestClearCount();
    const dailyProgressBase = fixedIds.length ? fixedDone : state.daily.answers;
    const dailyRemaining = Math.max(0, fixedTarget - dailyProgressBase);
    const firstPassDone = scopeContactedCount();
    const progressBase = isFirstPassMode()
      ? firstPassDone
      : dailyProgressBase;
    const progressTarget = isFirstPassMode() ? scopeNewIds().length : fixedTarget;
    const progress = Math.min(100, Math.round((progressBase / progressTarget) * 100));
    const firstPassRemaining = remainingFirstPassCount();
    renderQuestRewards(fixedClear, fixedIds.length > 0);
    if (isFirstPassMode()) {
      const chapter = currentChapterContactSummary();
      const paceText = firstPassPaceText();
      if (elements.questLabel) {
        elements.questLabel.textContent = `${studyScopeConfig().shortLabel}追加`;
      }
      elements.dailyQuestTitle.textContent = `${firstPassDone} / ${scopeNewIds().length}接触`;
      if (elements.dailyAnswerLabel) elements.dailyAnswerLabel.textContent = "接触";
      if (elements.dailyCorrectLabel) elements.dailyCorrectLabel.textContent = "残り";
      if (elements.dailyWeakLabel) elements.dailyWeakLabel.textContent = "要復習";
      elements.dailyAnswerText.textContent = `${firstPassDone}問`;
      elements.dailyCorrectText.textContent = `${firstPassRemaining}問`;
      elements.dailyWeakText.textContent = `${weakIds().length}件`;
      if (elements.dailyQuestSource) {
        elements.dailyQuestSource.textContent = chapter
          ? `${paceText} / ${chapter.label} ${chapter.contacted}/${chapter.total}`
          : `${paceText} / 復習割り込みなし`;
      }
      elements.dailyQuestButton.textContent = "日課";
    } else {
      const masteryMode = todayQuest.mode === "mastery";
      const unitMode = todayQuest.mode === "unit";
      if (elements.questLabel) {
        elements.questLabel.textContent = `${studyScopeConfig(todayQuest.scope).shortLabel}・${
          unitMode ? "読後" : masteryMode ? "定着" : "今日"
        }`;
      }
      elements.dailyQuestTitle.textContent = fixedIds.length
        ? `${unitMode ? "読後" : masteryMode ? "定着" : "新規＋復習"}${fixedTarget}問 ${Math.min(fixedDone, fixedTarget)}/${fixedTarget}`
        : `${Math.min(state.daily.answers, target)} / ${target}撃破`;
      if (elements.dailyAnswerLabel) elements.dailyAnswerLabel.textContent = "今日";
      if (elements.dailyCorrectLabel) elements.dailyCorrectLabel.textContent = "正解";
      if (elements.dailyWeakLabel) elements.dailyWeakLabel.textContent = "弱点";
      elements.dailyAnswerText.textContent = `${fixedIds.length ? fixedDone : state.daily.answers}問`;
      elements.dailyCorrectText.textContent = `${fixedIds.length ? fixedClear : state.daily.correct}問`;
      elements.dailyWeakText.textContent = `${state.daily.weakAdded}件`;
      elements.dailyQuestButton.textContent = fixedIds.length
        ? (dailyRemaining > 0
            ? `${unitMode ? "読後" : "固定"}残り${dailyRemaining}`
            : unitMode ? "読後完了" : "本日完走")
        : (dailyRemaining > 0 ? `残り${dailyRemaining}問` : "追加10問");
      elements.dailyQuestButton.disabled = Boolean(fixedIds.length && dailyRemaining === 0);
    }
    elements.dailyQuestFill.style.width = `${progress}%`;
    if (elements.dailyQuestSource) {
      if (!isFirstPassMode()) {
        elements.dailyQuestSource.textContent = todayQuest.message;
      }
    }
    if (elements.passQuestButton) {
      elements.passQuestButton.textContent = isFirstPassMode()
        ? (firstPassRemaining > 0 ? "追加演習中" : "範囲接触済み")
        : (firstPassRemaining > 0 ? "範囲内を続ける" : "範囲接触済み");
      elements.passQuestButton.classList.toggle("is-active", isFirstPassMode());
      elements.passQuestButton.disabled = firstPassRemaining === 0 || isMockMode();
    }
    if (isFirstPassMode()) elements.dailyQuestButton.disabled = false;
    elements.weakQuestButton.disabled = weakIds().length === 0;
  }

  function dailyQuestIsComplete() {
    const ids = dailyQuestIds();
    return Boolean(ids.length && dailyQuestDoneCount() >= ids.length);
  }

  function isDailyQuestPaused() {
    return !isFirstPassMode() &&
      !isChapterMode() &&
      !isMockMode() &&
      dailyQuestIsComplete() &&
      state.dailyFinishedDate === todayKey();
  }

  function finishDailyQuest() {
    if (!dailyQuestIsComplete() || isFirstPassMode() || isChapterMode()) return false;
    state.dailyFinishedDate = todayKey();
    saveState();
    renderPassPlan();
    renderAnswerDock(currentQuestion());
    elements.todayCommandPanel?.scrollIntoView({ block: "start", behavior: "smooth" });
    return true;
  }

  function questClaimsForToday() {
    const claims = state.questRewardClaims?.[todayKey()];
    return Array.isArray(claims) ? claims : [];
  }

  function grantQuestCompletionIfEarned() {
    const completion = REWARD_SYSTEM.QUEST_REWARDS.find((reward) => reward.id === "complete");
    if (
      !completion ||
      dailyQuestDoneCount() < completion.threshold ||
      questClaimsForToday().includes(completion.id)
    ) return false;

    const previousProgression = progressionForXp(state.totalXp);
    state.totalXp += completion.xp;
    state.crystals += completion.crystals;
    state.questRewardClaims[todayKey()] = [
      ...new Set([...questClaimsForToday(), completion.id])
    ];
    if (state.answered) {
      state.answered.xpReward = (state.answered.xpReward || 0) + completion.xp;
      state.answered.reward = (state.answered.reward || 0) + completion.crystals;
      state.answered.questRewards = [
        ...(state.answered.questRewards || []),
        completion
      ];
      state.answered.rewardBreakdown = [
        ...(state.answered.rewardBreakdown || []),
        { label: `戦果${completion.label}`, xp: completion.xp, crystals: completion.crystals }
      ];
    }
    const nextProgression = progressionForXp(state.totalXp);
    if (nextProgression.level > previousProgression.level) {
      const rankBonus = rankBonusForLevels(previousProgression.level, nextProgression.level);
      if (rankBonus) {
        state.crystals += rankBonus;
        if (state.answered) {
          state.answered.reward += rankBonus;
          state.answered.rewardBreakdown.push({ label: "称号昇格", xp: 0, crystals: rankBonus });
        }
      }
    }
    saveState();
    logStudyEvent("daily-quest", {
      rewardClaim: completion.id,
      questDate: todayQuest.date,
      questId: todayQuest.questId || "",
      contacts: dailyQuestDoneCount(),
      correct: dailyQuestClearCount(),
      xp: completion.xp,
      crystals: completion.crystals
    });
    render();
    return true;
  }

  function renderQuestRewards(done, hasFixedQuest) {
    if (!elements.questRewardRail || !elements.questRewardTrack || !elements.questRewardNext) return;
    const hidden = isFirstPassMode() || isMockMode() || todayQuest.mode === "unit" || !hasFixedQuest;
    elements.questRewardRail.hidden = hidden;
    if (hidden) return;

    const claimed = new Set(questClaimsForToday());
    const steps = REWARD_SYSTEM.QUEST_REWARDS;
    const next = steps.find((step) => !claimed.has(step.id));
    elements.questRewardTrack.replaceChildren();
    steps.forEach((step) => {
      const node = document.createElement("span");
      const isClaimed = claimed.has(step.id);
      node.className = "quest-reward-step";
      node.classList.toggle("is-claimed", isClaimed);
      const progress = step.metric === "contacts" ? dailyQuestDoneCount() : done;
      node.classList.toggle("is-ready", !isClaimed && progress >= step.threshold);
      node.innerHTML = `<b>${step.threshold}</b><small>${step.label}</small>`;
      node.title = `${step.label}: EXP +${step.xp} / 知識C +${step.crystals}`;
      elements.questRewardTrack.append(node);
    });
    elements.questRewardNext.textContent = next
      ? `${next.metric === "contacts" ? "接触" : "正解"}あと${Math.max(0, next.threshold - (next.metric === "contacts" ? dailyQuestDoneCount() : done))}問：${next.label} +${next.xp}EXP${next.crystals ? ` / +${next.crystals}C` : ""}`
      : "本日報酬 COMPLETE";
  }

  function sprintRemainingMs() {
    const deadline = Date.parse(state.sprint?.endsAt || "");
    if (!Number.isFinite(deadline)) return 0;
    return Math.max(0, deadline - Date.now());
  }

  function formatTimer(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function renderSprint() {
    if (!elements.sprintTimer) return;
    state.sprint = normalizeSprintState(state.sprint);
    const remaining = sprintRemainingMs();
    const running = remaining > 0;
    elements.sprintTimer.textContent = running ? formatTimer(remaining) : `${SPRINT_MINUTES}:00`;
    elements.sprintStatus.textContent = running ? "集中中" : `完走${state.sprint.completed}回`;
    elements.sprintButton.textContent = running ? "停止" : "25分開始";
    elements.sprintButton.classList.toggle("is-running", running);
  }

  function renderThemeControls(question) {
    if (!elements.chapterSelect || !elements.weakButton) return;

    const activeChapter = question.chapter?.chapterIndex ?? 0;
    elements.chapterSelect.replaceChildren();
    STUDY_GROUPS.forEach((group) => {
      const optionGroup = document.createElement("optgroup");
      optionGroup.label = group.label;
      group.entries.forEach(({ chapter, chapterIndex }) => {
        const snapshot = unitLearningSnapshot(chapter);
        const option = document.createElement("option");
        option.value = String(chapterIndex);
        const pageLabel = chapter.textbookPart ? `（p.${chapter.page}〜）` : "";
        option.textContent =
          `${chapter.topicLabel || chapter.label}${pageLabel} ` +
          `読後${snapshot.baseContacted}/${snapshot.baseIds.length}・任意実践${snapshot.practicalGrounded}/${snapshot.practicalItems.length}`;
        option.selected = chapterIndex === activeChapter;
        optionGroup.append(option);
      });
      elements.chapterSelect.append(optionGroup);
    });
    const legacyGroup = document.createElement("optgroup");
    legacyGroup.label = "以前の100問（解答履歴を保持）";
    LEGACY_CHAPTER_ENTRIES.forEach(({ chapter, chapterIndex }) => {
      const progress = legacyProgress(chapter.ids);
      const option = document.createElement("option");
      option.value = String(chapterIndex);
      option.textContent =
        `${chapter.label.replace(/^旧・業法 \/\s*/, "")} 解答済${progress.contacted}/${progress.total}`;
      option.selected = chapterIndex === activeChapter;
      legacyGroup.append(option);
    });
    elements.chapterSelect.append(legacyGroup);

    const targets = weakIds();
    elements.weakButton.textContent = `弱点 ${targets.length}`;
    elements.weakButton.disabled = isMockMode() || targets.length === 0;
    elements.chapterSelect.disabled = isMockMode();
    if (elements.studyScopeSelect) {
      elements.studyScopeSelect.value = state.studyScope;
      elements.studyScopeSelect.disabled = isMockMode();
    }
    if (elements.themeDrawerSummary) {
      const displayScope = activeDisplayScopeConfig();
      elements.themeDrawerSummary.textContent =
        `${displayScope.shortLabel}・${question.chapter?.topicLabel || question.chapter?.label || "現在のテーマ"}`;
    }
  }

  function renderAdaptiveCoach(question) {
    if (!elements.coachTitle || !elements.coachText) return;

    if (isMockMode()) {
      elements.coachTitle.textContent = `${mockFormShortLabel()}・安全圏目標${MOCK_SAFE_TARGET}点`;
      elements.coachText.textContent =
        "コア100から本試験配分で組んだ50問を120分で解く。途中の正誤・解説は隠す。既習問題の定着確認なので、初見実力は公式過去問で別に測る。";
      return;
    }

    const scopeState = scopeProgress();
    const targetRetained = Math.ceil(scopeState.total * scopeState.scope.targetRate);
    if (isFirstPassMode()) {
      elements.coachTitle.textContent =
        `${scopeState.scope.shortLabel}の追加演習 ${scopeState.contacted}/${scopeState.total}接触`;
      elements.coachText.textContent = remainingFirstPassCount() > 0
        ? `日課後の任意演習。未接触は残り${remainingFirstPassCount()}問。誤答は翌日以降の固定10問へ戻す。`
        : "この範囲は全問接触済み。今日は終了し、翌日以降の定着確認へ戻る。";
      return;
    }

    const activeChapter = chapterModeChapter();
    const selectedChapterIsActive = activeChapter?.id === question.chapter?.id;
    if (
      question.chapter?.textbookPart &&
      (
        selectedChapterIsActive ||
        (
          selectedTextbookChapterId === question.chapter.id &&
          state.studyScope === studyScopeIdForChapter(question.chapter)
        )
      )
    ) {
      const chapter = question.chapter;
      const snapshot = unitLearningSnapshot(chapter);
      elements.coachTitle.textContent =
        `${chapter.topicLabel}・本文p.${chapter.page}直後`;
      elements.coachText.textContent = snapshot.baseContacted < snapshot.baseIds.length
        ? `本文のこの単元を読み切り、読後問題を2〜4問ずつ解く。現在${snapshot.baseContacted}/${snapshot.baseIds.length}。正解でも勘・根拠なしは弱点へ残す。`
        : snapshot.baseRetained < snapshot.baseIds.length
          ? `読後問題は完了。次の未接触単元へ進む。翌日復習と別形式の実践4問は独立して残るため、基礎一周を止めない。`
          : "本文・読後問題・翌日復習を通過。この単元は定着済み。実践4問は必要なときだけ別メニューで使う。";
      return;
    }

    if (scopeState.contacted < scopeState.total) {
      elements.coachTitle.textContent =
        `${scopeState.scope.shortLabel} 接触${scopeState.contacted}/${scopeState.total}・定着${scopeState.retained}/${scopeState.total}`;
      elements.coachText.textContent =
        `未接触を優先しつつ、翌日以降の要復習を最大4問混ぜる。未学習分野は出さない。一度の正解では定着に数えない。`;
      return;
    }

    if (scopeState.retained < targetRetained) {
      elements.coachTitle.textContent =
        `${scopeState.scope.shortLabel} 定着${scopeState.retained}/${targetRetained}目標`;
      elements.coachText.textContent =
        `全問接触済み。異なる2日で正答し、最新の誤答・迷いがない問題だけを定着扱いにする。あと${targetRetained - scopeState.retained}問で次段階の目安。`;
      return;
    }

    const latestMock = scopeState.scope.id === "all" ? latestMockAttempt() : null;
    const priority = latestMock ? mockPriorityRow(latestMock.sectionScores) : null;
    const weakCount = curriculumWeakIds().length;
    elements.coachTitle.textContent =
      `${scopeState.scope.shortLabel} 8割定着・弱点${weakCount}問`;
    if (!latestMock) {
      const nextText = scopeState.scope.id === "business"
        ? "学習段階を②第2分冊・権利関係へ切り替え、業法の復習を残す。"
        : scopeState.scope.id === "rights"
          ? "学習段階を③法令・税その他へ切り替え、業法と権利の復習を残す。"
        : scopeState.scope.id === "law-other"
          ? "学習段階を④全分野へ切り替え、本試験比率で混ぜる。"
          : "全100問接触後に50問確認模試へ進み、初見力はRETIO公式過去問で測る。";
      elements.coachText.textContent = nextText;
      return;
    }
    const form = mockFormById(latestMock.formId);
    const mockLabel = mockFormShortLabel(form);
    elements.coachText.textContent = priority
      ? `直近${mockLabel}は${latestMock.score}/50。最優先は${priority.label}${priority.correct}/${priority.total}（目標${priority.target}）。日課は本試験比率を保って弱点・古い問題から再テストする。`
      : `直近${mockLabel}は${latestMock.score}/50で分野別目標を達成。日課で弱点と最終接触が古い問題を回し、${STUDY_TARGETS.safe}点の再現性を確認する。`;
  }

  function renderChapters(activeId) {
    elements.chapterList.replaceChildren();
    elements.chapterList.classList.toggle(
      "is-selecting",
      Boolean(state.answered) && isChapterEnd() && state.index < ORDER.length - 1
    );

    const progressFor = (entries) => ({
      current: entries.filter(({ chapter }) =>
        chapter.ids.every(isContacted)
      ).length,
      total: entries.length
    });

    const createChapterRow = (chapter, chapterIndex, { legacy = false } = {}) => {
      const snapshot = legacy ? null : unitLearningSnapshot(chapter);
      const contacted = chapter.ids.filter(isContacted).length;
      const progressLabel = legacy ? "解答済" : "読後";
      const progressValue = legacy ? contacted : snapshot.baseContacted;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "chapter-row";
      row.disabled = isMockMode();
      row.classList.toggle("is-active", chapter.ids.includes(activeId));
      row.classList.toggle(
        "is-done",
        legacy
          ? progressValue === chapter.ids.length
          : snapshot.baseContacted === snapshot.baseIds.length
      );
      if (!legacy) row.dataset.learningStage = snapshot.stage;
      row.setAttribute(
        "aria-label",
        `${chapter.label}を選択 ${progressLabel}${progressValue}/${chapter.ids.length}`
      );

      const dot = document.createElement("span");
      dot.className = "chapter-dot";
      dot.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "chapter-label";
      label.textContent = chapter.textbookPart
        ? `${chapter.topicLabel}（p.${chapter.page}〜）`
        : chapter.topicLabel || chapter.label.replace(/^旧・業法 \/\s*/, "");

      const score = document.createElement("span");
      score.className = "chapter-score";
      score.textContent = legacy
        ? `${progressLabel} ${progressValue}/${chapter.ids.length}`
        : `読後 ${snapshot.baseContacted}/${snapshot.baseIds.length}・` +
          `任意実践 ${snapshot.practicalGrounded}/${snapshot.practicalItems.length}`;

      row.append(dot, label, score);
      row.addEventListener("click", () => selectChapter(chapterIndex));
      return row;
    };

    STUDY_GROUPS.forEach((group) => {
      const progress = progressFor(group.entries);
      const groupElement = document.createElement("details");
      groupElement.className = "chapter-group";
      groupElement.dataset.group = group.id;
      groupElement.open = group.entries.some(({ chapter }) => chapter.ids.includes(activeId));

      const summary = document.createElement("summary");
      summary.className = "chapter-group-summary";
      const title = document.createElement("strong");
      title.textContent = group.label;
      const score = document.createElement("span");
      score.textContent = `単元 ${progress.current} / ${progress.total}`;
      summary.append(title, score);

      const list = document.createElement("div");
      list.className = "chapter-group-list";
      group.entries.forEach(({ chapter, chapterIndex }) => {
        list.append(createChapterRow(chapter, chapterIndex));
      });
      groupElement.append(summary, list);

      if (group.id === "business") {
        const optionalIds = LEGACY_CHAPTER_ENTRIES.flatMap(({ chapter }) => chapter.ids);
        const optionalProgress = legacyProgress(optionalIds);
        const optional = document.createElement("details");
        optional.className = "chapter-optional";
        optional.open = LEGACY_CHAPTER_ENTRIES.some(({ chapter }) => chapter.ids.includes(activeId));
        const optionalSummary = document.createElement("summary");
        optionalSummary.innerHTML =
          `<strong>以前の100問</strong><span>問題・履歴を保持　解答済 ${optionalProgress.contacted}/${optionalProgress.total}</span>`;
        const optionalList = document.createElement("div");
        optionalList.className = "chapter-group-list";
        LEGACY_CHAPTER_ENTRIES.forEach(({ chapter, chapterIndex }) => {
          optionalList.append(createChapterRow(chapter, chapterIndex, { legacy: true }));
        });
        optional.append(optionalSummary, optionalList);
        groupElement.append(optional);
      }

      elements.chapterList.append(groupElement);
    });
  }

  function prepareFoundationUnitPlan(chapter) {
    const nextScope = studyScopeIdForChapter(chapter);
    if (STUDY_SCOPE_IDS.has(nextScope)) state.studyScope = nextScope;
    selectedTextbookChapterId = chapter.id;
    const batchIds = foundationUnitBatchIds(chapter);
    state.daily = normalizeDailyState({
      ...createDailyState(),
      target: batchIds.length,
      planIds: [...batchIds],
      planVersion: STUDY_PLAN_VERSION,
      planMode: "unit",
      planScope: state.studyScope,
      planUnitId: chapter.id
    });
    state.dailyFinishedDate = "";
    return batchIds;
  }

  function selectChapter(chapterIndex) {
    const chapter = CHAPTERS[chapterIndex];
    if (!chapter) return;
    selectedTextbookChapterId = chapter.textbookPart ? chapter.id : "";
    state.runMode = RUN_MODE_CHAPTER;
    state.chapterModeId = chapter.id;
    setFirstPassUrl(false);
    const isLegacyChapter = chapter.ids.every((id) => LEGACY_ID_SET.has(id));
    const nextId = isLegacyChapter
      ? chapter.ids.find((id) => !isContacted(id)) ||
        [...chapter.ids].sort((a, b) =>
          weaknessScore(b) - weaknessScore(a) ||
          (Number(statsFor(a).lastStep) || 0) - (Number(statsFor(b).lastStep) || 0)
        )[0]
      : chapter.ids.find((id) => !answeredToday(id) && !isRetained(id)) || chapter.ids[0];
    goToQuestion(nextId);
  }

  function setStudyScope(scopeId) {
    if (!STUDY_SCOPE_IDS.has(scopeId) || scopeId === state.studyScope) return;
    selectedTextbookChapterId = "";
    state.studyScope = scopeId;
    state.daily = createDailyState();
    state.daily.planScope = scopeId;
    state.dailyFinishedDate = "";
    state.runMode = "quest";
    state.chapterModeId = "";
    state.answered = null;
    state.activeCutCheck = null;
    state.finished = false;
    setFirstPassUrl(false);
    if (!foundationCoverageComplete()) {
      const nextUnit = textbookChaptersForScope(scopeId)
        .map(unitLearningSnapshot)
        .find((item) => item.baseContacted < item.baseIds.length);
      if (nextUnit) prepareFoundationUnitPlan(nextUnit.chapter);
    }
    applyTodayQuest(publicTodayQuest());
    const targetId =
      nextDailyQuestId() ||
      scopeNewIds(scopeId).find((id) => !answeredToday(id) && !isRetained(id)) ||
      scopeReviewIds(scopeId)[0];
    logStudyEvent("study-scope", {
      scope: state.studyScope,
      targetId,
      planIds: dailyQuestIds()
    });
    if (targetId) {
      goToQuestion(targetId);
    } else {
      renderCurrentView();
    }
  }

  function jumpToWeakPoint() {
    const targets = weakIds().filter((id) => id !== currentId());
    const nextId = targets[0] || weakIds()[0];
    if (!nextId) return;
    state.runMode = "quest";
    state.chapterModeId = "";
    setFirstPassUrl(false);
    goToQuestion(nextId);
  }

  function nextUnsolvedId() {
    return (
      scopeNewIds().find((id) => !answeredToday(id) && !isContacted(id)) ||
      scopeReviewIds().find((id) => !answeredToday(id) && !isRetained(id))
    );
  }

  function answeredToday(id) {
    const stats = statsFor(id);
    const answeredAt = latestAt(stats.lastAnsweredAt, stats.centralLastAnsweredAt);
    return localDateKey(answeredAt) === todayKey();
  }

  function correctToday(id) {
    const stats = statsFor(id);
    const correctAt = latestAt(stats.lastCorrectAt, stats.centralLastCorrectAt);
    return localDateKey(correctAt) === todayKey();
  }

  function dailyQuestIds() {
    return todayQuest.status === "ready"
      ? todayQuest.ids.filter((id) => ORDER.includes(id) && QUESTIONS[id])
      : [];
  }

  function isDailyQuestQuestion(id) {
    return dailyQuestIds().includes(id);
  }

  function nextDailyQuestId() {
    const ids = dailyQuestIds();
    if (ids.length === 0) return null;
    return ids.find((id) => !answeredToday(id)) || null;
  }

  function dailyQuestDoneCount() {
    return dailyQuestIds().filter((id) => answeredToday(id)).length;
  }

  function dailyQuestClearCount() {
    return dailyQuestIds().filter((id) => correctToday(id)).length;
  }

  function startDailyQuest() {
    state.runMode = "quest";
    state.chapterModeId = "";
    setFirstPassUrl(false);
    if (dailyQuestIsComplete()) {
      finishDailyQuest();
      return;
    }
    const fixedQuestId = nextDailyQuestId();
    const targetId = fixedQuestId || nextUnsolvedId() || scopeReviewIds()[0];
    if (!targetId) return;
    logStudyEvent("daily-quest", {
      targetId,
      questDate: todayQuest.date,
      questSource: todayQuest.source,
      questIds: dailyQuestIds(),
      daily: state.daily,
      weakCount: weakIds().length
    });
    goToQuestion(targetId);
  }

  function startFocusedReviewQuest() {
    state.daily = createDailyState();
    state.daily.planScope = state.studyScope;
    state.dailyFinishedDate = "";
    applyTodayQuest(publicTodayQuest());
    startDailyQuest();
  }

  function startFirstPass() {
    state.dailyFinishedDate = "";
    state.runMode = RUN_MODE_FIRST_PASS;
    state.chapterModeId = "";
    setFirstPassUrl(true);
    if (remainingFirstPassCount() === 0) {
      saveState();
      logStudyEvent("first-pass-complete", {
        contacted: contactedCount(),
        weakCount: weakIds().length
      });
      showFinished();
      return;
    }
    const targetId = firstPassStartId();
    logStudyEvent("first-pass-start", {
      targetId,
      contacted: contactedCount(),
      remaining: remainingFirstPassCount(),
      weakCount: weakIds().length
    });
    if (targetId !== currentId()) {
      goToQuestion(targetId);
      return;
    }
    state.answered = null;
    state.activeCutCheck = null;
    state.finished = false;
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startMock(formId) {
    const active = activeLearningSession();
    if (active && active.kind !== "mock") {
      resumeActiveLearningSession();
      return;
    }
    if (!foundationCoverageComplete()) {
      const progress = foundationProgress();
      setTodayCommandStatus(
        `確認模試は基礎一周後に解放します。現在は単元${progress.completedUnits}/${TEXTBOOK_CHAPTERS.length}です。`,
        true
      );
      elements.todayCommandPanel?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    const form = mockFormById(formId);
    if (!form) return;
    const activeAttempt = isMockMode() && !state.mock.finalized && mockAnsweredCount() > 0;
    if (
      activeAttempt &&
      !window.confirm(`${mockFormShortLabel()}の途中結果を破棄して${form.label}を最初から開始する？`)
    ) {
      return;
    }
    state.runMode = RUN_MODE_MOCK;
    state.chapterModeId = "";
    state.mock = {
      ...createMockState(form.id),
      startedAt: new Date().toISOString()
    };
    state.index = ORDER.indexOf(form.ids[0]);
    state.answered = null;
    state.activeCutCheck = null;
    state.dailyFinishedDate = "";
    state.finished = false;
    setFirstPassUrl(false);
    saveState();
    logStudyEvent("mock-start", {
      formId: form.id,
      questionCount: form.ids.length,
      durationMinutes: MOCK_DURATION_MINUTES
    });
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function leaveMockForDailyQuest() {
    if (!isMockMode()) {
      startDailyQuest();
      return;
    }
    if (!window.confirm("この模試の途中結果を破棄して日課へ戻る？")) return;
    state.runMode = "quest";
    state.chapterModeId = "";
    state.mock = createMockState();
    state.answered = null;
    state.activeCutCheck = null;
    state.finished = false;
    saveState();
    startDailyQuest();
  }

  function toggleSprint() {
    state.sprint = normalizeSprintState(state.sprint);
    if (sprintRemainingMs() > 0) {
      logStudyEvent("sprint-stop", {
        remainingMs: sprintRemainingMs()
      });
      state.sprint.endsAt = null;
      saveState();
      renderSprint();
      return;
    }

    state.sprint.endsAt = new Date(Date.now() + SPRINT_MINUTES * 60 * 1000).toISOString();
    saveState();
    logStudyEvent("sprint-start", {
      minutes: SPRINT_MINUTES
    });
    renderSprint();
  }

  function tickSprint() {
    if (!state.sprint?.endsAt) return;
    if (sprintRemainingMs() > 0) {
      renderSprint();
      return;
    }
    state.sprint.completed = (Number(state.sprint.completed) || 0) + 1;
    state.sprint.endsAt = null;
    const mission = missionForDate();
    setMissionForDate(todayKey(), {
      minutes: Math.min(600, mission.minutes + SPRINT_MINUTES)
    });
    saveState();
    logStudyEvent("sprint-complete", {
      completed: state.sprint.completed,
      daily: state.daily
    });
    renderSprint();
    renderPassPlan();
  }

  function tickMockTimer() {
    if (!isMockMode() || state.mock.finalized) return;
    if (elements.dailyWeakText) elements.dailyWeakText.textContent = mockTimeText();
    if (elements.streakText) elements.streakText.textContent = mockTimeText();
  }

  function answerMock(index) {
    const question = currentQuestion();
    const ids = mockQuestionIds();
    if (!ids.length || question.id !== ids[state.mock.position]) return;
    const result = {
      id: question.id,
      selected: index,
      correct: index === question.answer,
      sectionId: question.sectionId || "",
      tag: question.tag || ""
    };
    state.mock.results = [
      ...state.mock.results.filter((item) => item.id !== question.id),
      result
    ];
    state.answered = {
      id: question.id,
      selected: index,
      correct: null,
      mock: true,
      at: new Date().toISOString()
    };
    state.activeCutCheck = null;
    saveState();
    render();
  }

  function answer(index) {
    if (state.answered) {
      return;
    }
    if (isMockMode()) {
      answerMock(index);
      return;
    }
    const question = currentQuestion();
    const battleProfile = enemyProfileFor(question);
    const cutCheck = cutCheckResult(question);
    if (cutCheck && !cutCheck.complete) {
      render();
      elements.quizCard
        ?.querySelector(".cut-check-panel")
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    const isCorrect = index === question.answer;
    const cutCheckMissed = Boolean(cutCheck && !cutCheck.allCorrect);
    const wasMarked = Boolean(state.marked[question.id]);
    const previous = state.questionStats[question.id] || { attempts: 0, correct: 0, wrong: 0 };
    const alreadyCorrectToday = correctToday(question.id);
    const rewardEligible = Boolean(isCorrect && !alreadyCorrectToday);
    const previousWrongCount = effectiveWrongCount(previous);
    const previousWrongAt = latestAt(
      previous.lastWrongAt,
      previous.lastMistakeAt,
      previous.centralLastWrongAt
    );
    const previousWrongDay = localDateKey(previousWrongAt);
    const nextStreak = isCorrect ? state.streak + 1 : 0;
    const focusBefore = state.focus || 0;
    const overdrive = Boolean(isCorrect && focusBefore >= 80);
    const focusAfter = isCorrect
      ? (overdrive ? 0 : Math.min(100, focusBefore + 20))
      : Math.max(0, focusBefore - 25);
    const firstClear = Boolean(rewardEligible && effectiveAttempts(previous) === 0);
    const weakBreakCandidate = Boolean(
      rewardEligible &&
      wasMarked &&
      previousWrongCount > 0 &&
      Boolean(cutCheck?.allCorrect) &&
      REWARD_SYSTEM.isDelayedRecall(previousWrongDay, todayKey()) &&
      !state.weakRewards[question.id]
    );
    const weakBreak = false;
    const sameDayCorrection = Boolean(
      rewardEligible && wasMarked && previousWrongCount > 0 && previousWrongDay === todayKey()
    );
    const previousProgression = progressionForXp(state.totalXp);
    const nextVictories = state.victories + (rewardEligible ? 1 : 0);
    const milestone = rewardEligible && nextVictories % 10 === 0 ? nextVictories : 0;
    let chestProgress = state.chestProgress;
    let chestQuality = state.chestQuality || 0;
    let chestsOpened = state.chestsOpened;
    let chestOpened = false;
    let chestTier = null;
    const loot = { ...state.loot };
    const lootDrops = [];
    const rewardBreakdown = [];
    let reward = 0;
    let xpReward = 0;
    const addReward = (label, xp = 0, crystals = 0) => {
      const safeXp = Math.max(0, Number(xp) || 0);
      const safeCrystals = Math.max(0, Number(crystals) || 0);
      xpReward += safeXp;
      reward += safeCrystals;
      rewardBreakdown.push({ label, xp: safeXp, crystals: safeCrystals });
    };
    const addLoot = (profile, count = 1) => {
      const safeCount = Math.max(1, Number(count) || 1);
      loot[profile.lootKey] = (loot[profile.lootKey] || 0) + safeCount;
      const existing = lootDrops.find((drop) => drop.key === profile.lootKey);
      if (existing) {
        existing.count += safeCount;
      } else {
        lootDrops.push({ key: profile.lootKey, name: profile.lootName, count: safeCount });
      }
    };
    const questDoneBefore = dailyQuestClearCount();
    const questContactDoneBefore = dailyQuestDoneCount();
    const isQuestQuestion = isDailyQuestQuestion(question.id);
    const advancesQuest = rewardEligible && isQuestQuestion;
    const advancesQuestContact = isQuestQuestion && !answeredToday(question.id);
    const questDoneAfter = questDoneBefore + (advancesQuest ? 1 : 0);
    const questContactDoneAfter = questContactDoneBefore + (advancesQuestContact ? 1 : 0);
    const questRewards = isQuestQuestion
      ? REWARD_SYSTEM.questRewardsForProgress(
          questDoneAfter,
          questClaimsForToday(),
          questContactDoneAfter
        )
      : [];
    const qualityGain = rewardEligible
      ? REWARD_SYSTEM.chestQualityGain({
          firstClear,
          weakBreak,
          fullCut: Boolean(cutCheck && cutCheck.allCorrect),
          streak: nextStreak
        })
      : 0;
    if (rewardEligible) {
      addReward("正答", REWARD_SYSTEM.BATTLE_REWARDS.correct.xp, REWARD_SYSTEM.BATTLE_REWARDS.correct.crystals);
      if (firstClear) addReward("初見撃破", REWARD_SYSTEM.BATTLE_REWARDS.firstClear.xp, REWARD_SYSTEM.BATTLE_REWARDS.firstClear.crystals);
      if (weakBreak) addReward("弱点克服", REWARD_SYSTEM.BATTLE_REWARDS.weakBreak.xp, REWARD_SYSTEM.BATTLE_REWARDS.weakBreak.crystals);
      if (cutCheck && cutCheck.allCorrect) addReward("全肢正解", REWARD_SYSTEM.BATTLE_REWARDS.fullCut.xp, REWARD_SYSTEM.BATTLE_REWARDS.fullCut.crystals);
      const streakXp = Math.min(30, Math.max(0, nextStreak - 1) * 5);
      if (streakXp) addReward("連勝", streakXp, 0);
      if (battleProfile.isBoss) addReward("区画ボス", REWARD_SYSTEM.BATTLE_REWARDS.boss.xp, REWARD_SYSTEM.BATTLE_REWARDS.boss.crystals);

      chestQuality += qualityGain;
      chestProgress += 1;
      if (chestProgress >= 5) {
        chestProgress = 0;
        chestsOpened += 1;
        chestOpened = true;
        chestTier = REWARD_SYSTEM.chestTierForQuality(chestQuality);
        addReward(`${chestTier.label}宝箱`, chestTier.xp, chestTier.crystals);
        addLoot(battleProfile, chestTier.lootCount);
        chestQuality = 0;
      }
      if (battleProfile.isBoss && firstClear && !lootDrops.some((drop) => drop.key === battleProfile.lootKey)) {
        addLoot(battleProfile);
      }
      if (milestone) {
        addReward(`${milestone}体討伐`, REWARD_SYSTEM.BATTLE_REWARDS.milestone.xp, REWARD_SYSTEM.BATTLE_REWARDS.milestone.crystals);
      }
    }
    questRewards.forEach((questReward) => {
      addReward(`戦果${questReward.label}`, questReward.xp, questReward.crystals);
    });
    let nextTotalXp = state.totalXp + xpReward;
    let nextProgression = progressionForXp(nextTotalXp);
    const levelUp = nextProgression.level > previousProgression.level;
    if (levelUp) {
      const rankBonus = rankBonusForLevels(previousProgression.level, nextProgression.level);
      if (rankBonus) addReward("称号昇格", 0, rankBonus);
    }
    state.answered = {
      id: question.id,
      selected: index,
      correct: isCorrect,
      confidence: isCorrect ? "clear" : "wrong",
      previousClearAt: previous.lastClearAt || "",
      mistakeItems: [],
      mistakeUnknown: false,
      mistakeCause: "",
      mistakeNote: "",
      analysisRewardGranted: false,
      priorMistake: {
        items: [...(previous.lastMistakeItems || [])],
        unknown: Boolean(previous.lastMistakeUnknown),
        cause: previous.lastMistakeCause || "",
        note: previous.lastMistakeNote || "",
        at: previous.lastMistakeAt || ""
      },
      attackTier: isCorrect ? attackTierFor(nextStreak, overdrive) : 0,
      overdrive,
      reward,
      xpReward,
      rewardBreakdown,
      chestOpened,
      chestTier,
      chestQualityGain: qualityGain,
      lootDrops,
      milestone,
      questRewards,
      questDoneAfter,
      questContactDoneAfter,
      levelUp,
      newLevel: nextProgression.level,
      firstClear,
      weakBreak,
      weakBreakCandidate,
      weakBreakConfirmed: false,
      sameDayCorrection,
      repeatClear: Boolean(isCorrect && alreadyCorrectToday),
      rewardEligible,
      focusBefore,
      focusAfter,
      focusDelta: focusAfter - focusBefore,
      cutCheck: cutCheck
        ? {
            allCorrect: cutCheck.allCorrect,
            wrongCount: cutCheck.wrongCount,
            items: cutCheck.items
          }
        : null,
      at: new Date().toISOString()
    };
    state.attempts += 1;
    state.step = (state.step || 0) + 1;
    state.correct += isCorrect ? 1 : 0;
    state.streak = nextStreak;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.focus = focusAfter;
    state.crystals += reward;
    state.victories = nextVictories;
    state.totalXp = nextTotalXp;
    state.chestProgress = chestProgress;
    state.chestQuality = chestQuality;
    state.chestsOpened = chestsOpened;
    state.loot = loot;
    if (questRewards.length) {
      state.questRewardClaims[todayKey()] = [
        ...new Set([...questClaimsForToday(), ...questRewards.map((item) => item.id)])
      ];
    }
    if (isCorrect) state.adventureDays[todayKey()] = true;
    state.daily = normalizeDailyState(state.daily);
    state.daily.answers += 1;
    state.daily.correct += isCorrect ? 1 : 0;
    state.daily.wrong += isCorrect ? 0 : 1;
    if (!isCorrect || cutCheckMissed) {
      if (!state.marked[question.id]) {
        state.marked[question.id] = true;
        state.autoMarked[question.id] = true;
        if (!wasMarked) {
          state.daily.weakAdded += 1;
        }
      }
    }
    const nextStats = {
      ...previous,
      attempts: previous.attempts + 1,
      correct: previous.correct + (isCorrect ? 1 : 0),
      wrong: previous.wrong + (isCorrect ? 0 : 1),
      cutCheckAttempts: (previous.cutCheckAttempts || 0) + (cutCheck ? 1 : 0),
      cutCheckCorrect: (previous.cutCheckCorrect || 0) + (cutCheck && cutCheck.allCorrect ? 1 : 0),
      cutCheckWrong: (previous.cutCheckWrong || 0) + (cutCheckMissed ? 1 : 0),
      lastStep: state.step,
      lastAnsweredAt: state.answered.at,
      lastWrongStep: isCorrect ? previous.lastWrongStep : state.step,
      lastCorrectStep: isCorrect ? state.step : previous.lastCorrectStep,
      lastWrongAt: isCorrect ? previous.lastWrongAt : state.answered.at,
      lastCorrectAt: isCorrect ? state.answered.at : previous.lastCorrectAt,
      correctDayKeys: isCorrect
        ? [...new Set([...normalizedCorrectDayKeys(previous), todayKey()])].sort().slice(-8)
        : normalizedCorrectDayKeys(previous),
      clearDayKeys: isCorrect
        ? [...new Set([...normalizedComprehensionDayKeys(previous), todayKey()])].sort().slice(-8)
        : normalizedComprehensionDayKeys(previous),
      understandingDayKeys: normalizedUnderstandingDayKeys(previous),
      lastConfidence: isCorrect ? "clear" : "wrong",
      lastConfidenceAt: state.answered.at,
      lastConfidenceDayKey: todayKey(),
      lastClearAt: isCorrect ? state.answered.at : previous.lastClearAt,
      lastExplanationAt: state.answered.at,
      lastCutCheckAt: cutCheck ? state.answered.at : previous.lastCutCheckAt,
      lastCutCheckAllCorrect: cutCheck ? cutCheck.allCorrect : previous.lastCutCheckAllCorrect
    };
    state.questionStats[question.id] = nextStats;
    state.activeCutCheck = null;
    saveState();
    if (navigator.vibrate) {
      navigator.vibrate(isCorrect
        ? (chestOpened || levelUp || milestone ? [28, 34, 42] : 24)
        : 58);
    }
    logStudyEvent("answer", {
      question: {
        id: question.id,
        tag: question.tag,
        format: question.format,
        chapter: question.chapter?.label || "宅建業法",
        text: question.text,
        choices: question.choices,
        answer: question.answer,
        trap: question.trap,
        explain: question.explain,
        choiceExplanations: question.choiceExplanations || []
      },
      selected: index,
      selectedText: question.choices[index],
      correct: isCorrect,
      correctText: question.choices[question.answer],
      cutCheck: state.answered.cutCheck,
      stats: state.questionStats[question.id],
      autoSaved: true,
      weakBreakConfirmed: false,
      weakCount: weakIds().length,
      daily: state.daily,
      adaptive: state.adaptive,
      runMode: state.runMode,
      battle: {
        enemy: battleProfile.kind,
        reward,
        xpReward,
        totalXp: state.totalXp,
        level: nextProgression.level,
        chestOpened,
        chestTier: chestTier?.id || null,
        chestQualityGain: qualityGain,
        chestQuality,
        chestsOpened,
        chestProgress,
        lootDrops,
        milestone,
        firstClear,
        weakBreak: Boolean(state.answered.weakBreak),
        weakBreakCandidate,
        sameDayCorrection,
        rewardEligible,
        attackTier: state.answered.attackTier,
        overdrive,
        focusBefore,
        focusAfter,
        crystals: state.crystals,
        questRewards: questRewards.map((item) => item.id),
        questCorrect: questDoneAfter,
        questContacts: questContactDoneAfter
      }
    });
    render();
    if (isCorrect) {
      elements.battleField.scrollIntoView({ block: "center", behavior: "auto" });
    } else {
      elements.feedbackBox.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  function confirmWeakBreak(id) {
    const answered = state.answered;
    if (
      !answered?.weakBreakCandidate ||
      answered.weakBreakConfirmed ||
      state.weakRewards[id]
    ) return null;

    const previousProgression = progressionForXp(state.totalXp);
    const weakReward = REWARD_SYSTEM.BATTLE_REWARDS.weakBreak;
    const qualityBonus = Math.max(
      0,
      REWARD_SYSTEM.chestQualityGain({ weakBreak: true }) - REWARD_SYSTEM.chestQualityGain({})
    );
    state.totalXp += weakReward.xp;
    state.crystals += weakReward.crystals;
    state.chestQuality += qualityBonus;
    state.weakRewards[id] = true;
    answered.weakBreak = true;
    answered.weakBreakConfirmed = true;
    answered.xpReward = (answered.xpReward || 0) + weakReward.xp;
    answered.reward = (answered.reward || 0) + weakReward.crystals;
    answered.chestQualityGain = (answered.chestQualityGain || 0) + qualityBonus;
    answered.rewardBreakdown = [
      ...(answered.rewardBreakdown || []),
      { label: "弱点克服", xp: weakReward.xp, crystals: weakReward.crystals }
    ];
    const nextProgression = progressionForXp(state.totalXp);
    if (nextProgression.level > previousProgression.level) {
      answered.levelUp = true;
      answered.newLevel = nextProgression.level;
      const rankBonus = rankBonusForLevels(previousProgression.level, nextProgression.level);
      if (rankBonus) {
        state.crystals += rankBonus;
        answered.reward += rankBonus;
        answered.rewardBreakdown.push({ label: "称号昇格", xp: 0, crystals: rankBonus });
      }
    }
    state.questionStats[id] = {
      ...statsFor(id),
      weakBreakAt: new Date().toISOString()
    };
    if (state.autoMarked[id]) {
      delete state.marked[id];
      delete state.autoMarked[id];
    }
    return {
      xp: weakReward.xp,
      crystals: weakReward.crystals,
      quality: qualityBonus,
      level: nextProgression.level
    };
  }

  function setConfidence(id, value) {
    if (!state.answered || state.answered.id !== id) return;
    const question = currentQuestion();
    const stats = state.questionStats[id] || { attempts: 0, correct: 0, wrong: 0 };
    const wasMarked = Boolean(state.marked[id]);
    const shouldMark = value === "unsure" || value === "cuts";
    const recordedAt = new Date().toISOString();
    const clearDayKeys = normalizedComprehensionDayKeys(stats)
      .filter((day) => day !== todayKey());
    const previousClearAt = localDateKey(stats.lastClearAt) === todayKey()
      ? String(state.answered.previousClearAt || "")
      : stats.lastClearAt;
    if (value === "clear") clearDayKeys.push(todayKey());
    state.answered.confidence = value;
    state.questionStats[id] = {
      ...stats,
      lastConfidence: value,
      lastConfidenceAt: recordedAt,
      lastConfidenceDayKey: todayKey(),
      lastClearAt: value === "clear" ? recordedAt : previousClearAt,
      clearDayKeys: [...new Set(clearDayKeys)].sort().slice(-8)
    };
    state.daily = normalizeDailyState(state.daily);
    if (shouldMark) {
      state.marked[id] = true;
      state.autoMarked[id] = true;
      if (!wasMarked) {
        state.daily.weakAdded += 1;
      }
    } else if (
      state.autoMarked[id] &&
      (stats.wrong || 0) === 0 &&
      stats.correct >= stats.wrong &&
      (stats.cutCheckCorrect || 0) >= (stats.cutCheckWrong || 0)
    ) {
      delete state.marked[id];
      delete state.autoMarked[id];
    }
    const weakBreakReward = value === "clear" ? confirmWeakBreak(id) : null;
    saveState();
    logStudyEvent("confidence", {
      id,
      tag: question.tag,
      chapter: question.chapter?.label || "宅建業法",
      confidence: value,
      marked: Boolean(state.marked[id]),
      weakBreakConfirmed: Boolean(weakBreakReward),
      weakBreakReward,
      runMode: state.runMode
    });
    render();
  }

  function nextQuestion() {
    if (!state.answered || isAdvancing) return;
    if (isMockMode()) {
      setAdvanceBusy(true);
      window.setTimeout(() => {
        setAdvanceBusy(false);
        advanceQuestion();
      }, 120);
      return;
    }
    if (!state.answered.correct && mistakeRecorded()) {
      logMistakeDetail();
      grantMistakeAnalysisReward();
    }
    if (state.answered.correct && state.answered.confidence === "clear") {
      const weakBreakReward = confirmWeakBreak(currentId());
      if (weakBreakReward) {
        saveState();
        logStudyEvent("weak-break", {
          id: currentId(),
          reward: weakBreakReward,
          runMode: state.runMode
        });
      }
    }
    if (
      isDailyQuestQuestion(currentId()) &&
      dailyQuestIsComplete() &&
      !isFirstPassMode() &&
      !isChapterMode()
    ) {
      finishDailyQuest();
      return;
    }
    setAdvanceBusy(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const leadIn = reducedMotion ? 0 : 180;
    const delay = reducedMotion ? 120 : 760;
    elements.battleField.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
    window.setTimeout(() => {
      elements.battleField.classList.add("is-marching");
      window.setTimeout(() => {
        elements.battleField.classList.remove("is-marching");
        setAdvanceBusy(false);
        advanceQuestion();
      }, delay);
    }, leadIn);
  }

  function setAdvanceBusy(busy) {
    isAdvancing = busy;
    elements.nextButton.disabled = busy;
    if (elements.dockNextButton) {
      elements.dockNextButton.disabled = busy;
    }
    if (elements.dockUnsureButton && !elements.dockUnsureButton.hidden) {
      const uncertain = state.answered?.confidence === "unsure" || state.answered?.confidence === "cuts";
      elements.dockUnsureButton.disabled = busy || uncertain;
    }
    if (busy) {
      elements.nextButton.textContent = "進行中";
      elements.dockNextLabel.textContent = "進行中";
      elements.answerDock?.classList.add("is-advancing");
    } else {
      elements.answerDock?.classList.remove("is-advancing");
      if (state.answered) {
        const label = nextActionLabel();
        elements.nextButton.textContent = label;
        elements.dockNextLabel.textContent = label;
      }
    }
  }

  function showFeedback() {
    if (!state.answered) return;
    elements.feedbackBox.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function advanceQuestion() {
    if (isMockMode()) {
      const ids = mockQuestionIds();
      if (state.mock.position >= ids.length - 1) {
        finishMock();
        return;
      }
      state.mock.position += 1;
      state.index = ORDER.indexOf(ids[state.mock.position]);
      state.answered = null;
      state.activeCutCheck = null;
      saveState();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (isFirstPassMode()) {
      const nextId = nextFirstPassId();
      if (nextId) {
        goToQuestion(nextId);
        return;
      }
      showFinished();
      return;
    }
    if (isChapterMode()) {
      const nextId = nextChapterModeId();
      if (nextId) {
        goToQuestion(nextId);
        return;
      }
      showChapterFinished();
      return;
    }
    if (isDailyQuestQuestion(currentId()) && dailyQuestIsComplete()) {
      finishDailyQuest();
      return;
    }
    if (state.index >= ORDER.length - 1) {
      showFinished();
      return;
    }
    if (isDailyQuestQuestion(currentId())) {
      const questId = nextDailyQuestId();
      if (questId && questId !== currentId()) {
        goToQuestion(questId);
        return;
      }
      if (dailyQuestDoneCount() >= dailyQuestIds().length) {
        finishDailyQuest();
        return;
      }
    }
    if (isChapterEnd()) {
      const nextId = nextFirstPassId();
      if (nextId) {
        goToQuestion(nextId);
        return;
      }
      showFinished();
      return;
    }
    const chapter = idToChapter.get(currentId());
    const localIndex = chapter?.ids.indexOf(currentId()) ?? -1;
    const chapterNextId = localIndex >= 0 ? chapter.ids[localIndex + 1] : null;
    if (chapterNextId) {
      goToQuestion(chapterNextId);
      return;
    }
    state.index += 1;
    state.answered = null;
    state.activeCutCheck = null;
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finishMock() {
    const form = currentMockForm();
    if (!form || state.mock.finalized || state.mock.results.length !== form.ids.length) return;
    const finishedAt = new Date().toISOString();
    const elapsedMs = mockElapsedMs();
    const results = state.mock.results.map((result) => ({ ...result }));
    const score = results.filter((result) => result.correct).length;

    results.forEach((result) => {
      const previous = state.questionStats[result.id] || { attempts: 0, correct: 0, wrong: 0 };
      state.step = (state.step || 0) + 1;
      state.questionStats[result.id] = {
        ...previous,
        attempts: (Number(previous.attempts) || 0) + 1,
        correct: (Number(previous.correct) || 0) + (result.correct ? 1 : 0),
        wrong: (Number(previous.wrong) || 0) + (result.correct ? 0 : 1),
        lastStep: state.step,
        lastAnsweredAt: finishedAt,
        lastWrongStep: result.correct ? previous.lastWrongStep : state.step,
        lastCorrectStep: result.correct ? state.step : previous.lastCorrectStep,
        lastWrongAt: result.correct ? previous.lastWrongAt : finishedAt,
        lastCorrectAt: result.correct ? finishedAt : previous.lastCorrectAt,
        correctDayKeys: result.correct
          ? [...new Set([...normalizedCorrectDayKeys(previous), todayKey()])].sort().slice(-8)
          : normalizedCorrectDayKeys(previous),
        clearDayKeys: result.correct
          ? [...new Set([...normalizedComprehensionDayKeys(previous), todayKey()])].sort().slice(-8)
          : normalizedComprehensionDayKeys(previous),
        lastClearAt: result.correct ? finishedAt : previous.lastClearAt,
        lastRunMode: RUN_MODE_MOCK,
        lastMockFormId: form.id
      };
      if (!result.correct && !state.marked[result.id]) {
        state.marked[result.id] = true;
        state.autoMarked[result.id] = true;
      }
    });

    state.attempts += results.length;
    state.correct += score;
    if (score > 0) state.adventureDays[todayKey()] = true;
    const sectionScores = mockSectionScores(results);
    state.mock = {
      ...state.mock,
      finishedAt,
      elapsedMs,
      finalized: true
    };
    state.mockHistory = [
      ...(state.mockHistory || []),
      {
        formId: form.id,
        completedAt: finishedAt,
        score,
        elapsedMs,
        sectionScores
      }
    ].slice(-10);
    state.answered = null;
    state.activeCutCheck = null;
    state.finished = true;
    saveState();
    logStudyEvent("mock-complete", {
      formId: form.id,
      score,
      target: MOCK_SAFE_TARGET,
      elapsedMs,
      sectionScores,
      wrongIds: results.filter((result) => !result.correct).map((result) => result.id)
    });
    showMockFinished();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function resetQuizCardView() {
    elements.quizCard?.querySelector("[data-quiz-result-view]")?.remove();
    [
      elements.roundLabel?.closest(".quiz-meta"),
      elements.questionText,
      elements.choices,
      elements.feedbackBox
    ].forEach((element) => {
      if (element) element.hidden = false;
    });
  }

  function showQuizResult(markup) {
    resetQuizCardView();
    [
      elements.roundLabel?.closest(".quiz-meta"),
      elements.questionText,
      elements.choices,
      elements.feedbackBox
    ].forEach((element) => {
      if (element) element.hidden = true;
    });
    const view = document.createElement("div");
    view.className = "quiz-result-view";
    view.dataset.quizResultView = "";
    view.innerHTML = markup;
    elements.quizCard.append(view);
  }

  function showMockFinished() {
    const form = currentMockForm();
    if (!form || !state.mock.finalized) return;
    state.finished = true;
    renderStats();
    renderQuestPanel();
    renderSprint();
    renderPassPlan();
    if (elements.answerDock) {
      elements.answerDock.hidden = true;
      document.body.classList.remove("has-answer-dock");
    }
    const results = state.mock.results;
    const score = results.filter((result) => result.correct).length;
    const sectionScores = mockSectionScores(results);
    const wrongResults = results.filter((result) => !result.correct);
    const targetReached = score >= MOCK_SAFE_TARGET;
    const strategyTargetReached = score >= STUDY_TARGETS.total;
    const otherFormId = form.id === "form-a" ? "form-b" : "form-a";
    const strategyRows = mockStrategyRows(sectionScores);
    const priority = mockPriorityRow(sectionScores);
    const sectionCards = strategyRows.map((row) => {
      return `
        <div class="mock-section-card ${row.deficit > 0 ? "is-below-target" : "is-on-target"}" data-section="${escapeHtml(row.id)}">
          <span>${escapeHtml(row.label)}</span>
          <strong>${row.correct} / ${row.total}<small>目標 ${row.target}</small></strong>
        </div>`;
    }).join("");
    const scoreMessage = targetReached
      ? `安全圏${MOCK_SAFE_TARGET}点を達成`
      : (strategyTargetReached
          ? `合格戦略目標${STUDY_TARGETS.total}点を達成。安全圏${MOCK_SAFE_TARGET}点まであと${MOCK_SAFE_TARGET - score}点`
          : `合格戦略目標${STUDY_TARGETS.total}点まであと${STUDY_TARGETS.total - score}点`);
    const priorityPanel = priority
      ? `
        <section class="mock-priority is-below-target">
          <span>次の最優先</span>
          <strong>${escapeHtml(priority.label)} ${priority.correct}/${priority.total} → 目標${priority.target}</strong>
          <p>今日は誤答の解説と根拠を確認して終了。翌日の日課で本試験比率を保ちながら、弱点を優先して再テストする。</p>
        </section>`
      : `
        <section class="mock-priority is-on-target">
          <span>次の目標</span>
          <strong>4分野すべて目標達成</strong>
          <p>定着ロードで弱点と最終接触が古い問題を回し、安全圏${MOCK_SAFE_TARGET}点を別フォームでも再現する。</p>
        </section>`;
    const historyItems = [...(state.mockHistory || [])]
      .sort((left, right) => (Date.parse(right.completedAt) || 0) - (Date.parse(left.completedAt) || 0))
      .slice(0, 3)
      .map((item) => `
        <div class="mock-history-item">
          <span>${escapeHtml(shortDateLabel(item.completedAt))} ${escapeHtml(mockFormShortLabel(mockFormById(item.formId)))}</span>
          <strong>${Math.max(0, Number(item.score) || 0)} / 50</strong>
          <small>${escapeHtml(formatElapsed(Math.max(0, Number(item.elapsedMs) || 0)))}</small>
        </div>`)
      .join("");
    const wrongReview = wrongResults.length
      ? wrongResults.map((result) => {
          const question = QUESTIONS[result.id];
          const position = form.ids.indexOf(result.id) + 1;
          return `
            <details class="mock-wrong-item">
              <summary>問${position} ${escapeHtml(question.tag)}：選択${result.selected + 1} → 正解${question.answer + 1}</summary>
              <p>${escapeHtml(question.text)}</p>
              <dl>
                <div><dt>あなたの解答</dt><dd>${result.selected + 1}. ${escapeHtml(question.choices[result.selected])}</dd></div>
                <div><dt>正解</dt><dd>${question.answer + 1}. ${escapeHtml(question.choices[question.answer])}</dd></div>
              </dl>
              <p>${escapeHtml(question.explain)}</p>
              <a class="mock-source-link" href="${escapeHtml(question.sourceUrl)}" target="_blank" rel="noopener noreferrer">公式根拠: ${escapeHtml(question.sourceLocator || question.sourceRef)}（基準日 ${escapeHtml(question.legalBaseline)}）</a>
            </details>`;
        }).join("")
      : `<p class="mock-perfect">全50問正解。誤答レビューはありません。</p>`;

    showQuizResult(`
      <div class="quiz-meta">
        <strong>${escapeHtml(mockFormShortLabel(form))}</strong>
        <span>模試完了</span>
      </div>
      <section class="mock-results" data-mock-result="${escapeHtml(form.id)}">
        <div class="mock-score-hero ${targetReached ? "is-target" : "is-below"}">
          <span>得点</span>
          <strong>${score}<small> / 50</small></strong>
          <p>${scoreMessage}</p>
        </div>
        <div class="mock-result-meta">
          <span>所要時間 <strong>${formatElapsed(state.mock.elapsedMs)}</strong></span>
          <span>誤答 <strong>${wrongResults.length}問</strong></span>
          <span>弱点へ登録 <strong>${wrongResults.length}問</strong></span>
        </div>
        <h3>分野別得点と目標</h3>
        <div class="mock-section-grid">${sectionCards}</div>
        ${priorityPanel}
        <section class="mock-history">
          <h3>直近の模試</h3>
          <div class="mock-history-grid">${historyItems}</div>
        </section>
        <section class="mock-calibration">
          <strong>初見実力は公式過去問で確認</strong>
          <p>フォームA・Bはコア100の再構成。得点は定着確認に使い、初見の合否判定には使わない。過年度問題は法改正で現在法と異なる場合がある。</p>
          <button id="mockOfficialExamButton" class="ghost-button" type="button">露出記録つき公式50問へ</button>
        </section>
        <section class="mock-wrong-review">
          <h3>誤答レビュー</h3>
          <p>誤答は弱点リストへ登録済み。各問を開くと正解と解説を確認できます。</p>
          ${wrongReview}
        </section>
        <div class="finish-actions mock-finish-actions">
          <button id="mockDailyButton" class="next-button" type="button">日課へ戻る</button>
          <button id="mockOtherButton" class="ghost-button" type="button">${otherFormId === "form-a" ? "フォームA" : "フォームB"}へ</button>
          <button id="mockRetryButton" class="ghost-button" type="button">同じフォームを再挑戦</button>
        </div>
      </section>
    `);
    const reloadIntoMock = (targetFormId) => {
      const targetForm = mockFormById(targetFormId);
      state.runMode = RUN_MODE_MOCK;
      state.chapterModeId = "";
      state.mock = {
        ...createMockState(targetForm.id),
        startedAt: new Date().toISOString()
      };
      state.index = ORDER.indexOf(targetForm.ids[0]);
      state.answered = null;
      state.finished = false;
      saveState();
      window.location.reload();
    };
    $("#mockRetryButton")?.addEventListener("click", () => reloadIntoMock(form.id));
    $("#mockOtherButton")?.addEventListener("click", () => reloadIntoMock(otherFormId));
    $("#mockOfficialExamButton")?.addEventListener("click", () => {
      state.runMode = "quest";
      state.chapterModeId = "";
      state.finished = false;
      state.answered = null;
      setFirstPassUrl(false);
      saveState();
      window.location.reload();
    });
    $("#mockDailyButton")?.addEventListener("click", () => {
      state.runMode = "quest";
      state.chapterModeId = "";
      state.finished = false;
      state.answered = null;
      setFirstPassUrl(false);
      saveState();
      window.location.reload();
    });
  }

  function showChapterFinished() {
    const chapter = chapterModeChapter();
    if (!chapter) {
      showFinished();
      return;
    }
    const question = currentQuestion();
    if (question) {
      renderChapters(question.id);
      renderThemeControls(question);
    }
    const nextRoute = chapter.textbookPart
      ? foundationLearningRoute(studyScopeIdForChapter(chapter))
      : null;
    const nextDescriptor = nextRoute ? foundationRouteDescriptor(nextRoute) : null;
    const nextActionLabel = nextRoute?.kind === "unit"
      ? `次の単元「${nextDescriptor.title}」へ`
      : nextDescriptor?.button || "";
    state.finished = true;
    if (elements.answerDock) {
      elements.answerDock.hidden = true;
      document.body.classList.remove("has-answer-dock");
    }
    saveState();
    const answeredCount = chapter.ids.filter(answeredToday).length;
    const correctCount = chapter.ids.filter(correctToday).length;
    const retainedCount = chapter.ids.filter(isRetained).length;
    showQuizResult(`
      <div class="quiz-meta">
        <strong>${chapter.ids.length} / ${chapter.ids.length}</strong>
        <span>テーマ完了</span>
      </div>
      <section class="feedback" data-chapter-result="${escapeHtml(chapter.id)}">
        <h3>${escapeHtml(chapter.label)}</h3>
        <p class="question-text">選択テーマの問題だけを完了。固定10問は変更していません。</p>
        <dl class="answer-grid">
          <div><dt>テーマ問題</dt><dd>${chapter.ids.length}問</dd></div>
          <div><dt>本日解答</dt><dd>${answeredCount}問</dd></div>
          <div><dt>本日正解</dt><dd>${correctCount}問</dd></div>
          <div><dt>定着</dt><dd>${retainedCount}問</dd></div>
        </dl>
        ${nextDescriptor ? `
          <p class="explain-text"><strong>${escapeHtml(nextDescriptor.stage)}：</strong>${escapeHtml(nextDescriptor.title)}。${escapeHtml(nextDescriptor.text)}</p>
        ` : ""}
        <div class="finish-actions chapter-finish-actions">
          ${nextDescriptor ? `<button id="chapterNextButton" class="next-button chapter-next-button" type="button">${escapeHtml(nextActionLabel)}</button>` : ""}
          <button id="chapterRetryButton" class="${nextDescriptor ? "ghost-button" : "next-button"}" type="button">このテーマをもう一度</button>
          <button id="chapterDailyButton" class="ghost-button" type="button">固定10問へ戻る</button>
        </div>
      </section>
    `);
    const chapterNextButton = $("#chapterNextButton");
    if (chapterNextButton && nextDescriptor) {
      setRouteAction(chapterNextButton, nextDescriptor, nextActionLabel);
      chapterNextButton.addEventListener("click", () => runFoundationRouteAction(chapterNextButton));
    }
    $("#chapterRetryButton")?.addEventListener("click", () => {
      state.finished = false;
      state.answered = null;
      state.activeCutCheck = null;
      selectChapter(CHAPTERS.indexOf(chapter));
    });
    $("#chapterDailyButton")?.addEventListener("click", () => {
      state.runMode = "quest";
      state.chapterModeId = "";
      state.finished = false;
      state.answered = null;
      state.activeCutCheck = null;
      saveState();
      startDailyQuest();
    });
  }

  function showFinished() {
    state.finished = true;
    if (elements.answerDock) {
      elements.answerDock.hidden = true;
      document.body.classList.remove("has-answer-dock");
    }
    saveState();
    const accuracy = state.attempts ? `${Math.round((state.correct / state.attempts) * 100)}%` : "-";
    const scopeState = scopeProgress();
    const allContacted = contactedCount() >= CURRICULUM_ORDER.length;
    const scopeComplete = scopeState.contacted >= scopeState.total;
    const finishText = scopeComplete
      ? `${scopeState.scope.shortLabel}${scopeState.total}問に一通り接触。`
      : `${scopeState.scope.shortLabel}の今回ルートを完走。`;
    const nextText = allContacted
      ? "翌日以降の固定10問で定着を確認し、全100問接触後は模試A・Bで50問演習へ進む。"
      : `次は翌日以降の固定10問で定着を確認する。1回の正解だけでは定着扱いにしない。`;
    const finishActions = `<div class="finish-actions">
        <button id="finishDailyButton" class="next-button" type="button">固定10問へ戻る</button>
        <button id="finishResetButton" class="ghost-button finish-reset" type="button">全記録リセット</button>
      </div>`;
    showQuizResult(`
      <div class="quiz-meta">
        <strong>${scopeState.contacted} / ${scopeState.total}</strong>
        <span>完了</span>
      </div>
      <p class="question-text">${finishText}</p>
      <section class="feedback">
        <h3>結果</h3>
        <dl class="answer-grid">
          <div><dt>解答</dt><dd>${state.attempts}問</dd></div>
          <div><dt>範囲接触</dt><dd>${scopeState.contacted}問</dd></div>
          <div><dt>範囲定着</dt><dd>${scopeState.retained}問</dd></div>
          <div><dt>正解</dt><dd>${state.correct}問</dd></div>
          <div><dt>正答率</dt><dd>${accuracy}</dd></div>
        </dl>
        <p class="explain-text">${nextText}</p>
        ${finishActions}
      </section>
    `);
    $("#finishDailyButton")?.addEventListener("click", () => {
      state.runMode = "quest";
      state.chapterModeId = "";
      state.finished = false;
      saveState();
      const url = new URL(window.location.href);
      ["pass", "firstpass", "onepass"].forEach((key) => url.searchParams.delete(key));
      window.location.href = url.toString();
    });
    $("#finishResetButton").addEventListener("click", resetAll);
  }

  function resetAll() {
    if (!window.confirm(
      "学習進捗を全削除して最初からやり直す？\n" +
      "公式試験の接触記録だけは、初見判定を守るため残ります。"
    )) {
      return;
    }
    logStudyEvent("reset", {
      attempts: state.attempts,
      correct: state.correct,
      weakCount: weakIds().length
    });
    const preservedExposure = normalizeOfficialExamExposure(state.officialExamExposure);
    state = createState();
    state.officialExamExposure = preservedExposure;
    if (!saveState({ replace: true, preserveExposure: true })) return;
    window.location.reload();
  }

  function toggleMarked() {
    const id = currentId();
    if (state.marked[id]) {
      delete state.marked[id];
      delete state.autoMarked[id];
    } else {
      state.marked[id] = true;
      delete state.autoMarked[id];
    }
    saveState();
    logStudyEvent("mark", {
      id,
      marked: Boolean(state.marked[id]),
      manual: true
    });
    render();
  }

  function handleStorageSync(event) {
    if (event.storageArea !== localStorage || event.key !== STORAGE_ID || !event.newValue) return;
    try {
      const remote = normalizeState(JSON.parse(event.newValue));
      if (!STATE_SYNC?.mergeStatesDetailed) {
        syncBaseState = cloneStateForSync(remote);
        return;
      }
      const reconciliation = STATE_SYNC.mergeStatesDetailed(
        syncBaseState || state,
        state,
        remote
      );
      if (reconciliation.hasConflict) {
        lastSaveError = "別タブで異なる学習セッションが開始されました。このタブの回答は保持したまま、保存を停止しています。";
        setSaveTransferStatus(lastSaveError, true);
        renderSaveProtectionStatus();
        return;
      }
      state = normalizeState(reconciliation.state);
      syncBaseState = cloneStateForSync(remote);
      lastSaveError = "";
      applyQuestionBalance();
      setSaveTransferStatus("別タブの最新進捗を統合しました。");
      renderCurrentView();
    } catch (error) {
      lastSaveError = `別タブのセーブを統合できませんでした：${error?.message || "形式エラー"}`;
      setSaveTransferStatus(lastSaveError, true);
      renderSaveProtectionStatus();
    }
    return true;
  }

  function bindEvents() {
    elements.nextButton.addEventListener("click", nextQuestion);
    elements.dockNextButton?.addEventListener("click", nextQuestion);
    elements.dockExplainButton?.addEventListener("click", showFeedback);
    elements.dockUnsureButton?.addEventListener("click", () => {
      if (
        state.answered?.correct &&
        state.answered.confidence !== "unsure" &&
        state.answered.confidence !== "cuts"
      ) {
        setConfidence(currentId(), "unsure");
      }
    });
    elements.resetButton.addEventListener("click", resetAll);
    elements.markButton.addEventListener("click", toggleMarked);
    elements.dailyQuestButton?.addEventListener("click", leaveMockForDailyQuest);
    elements.todayCommandStartButton?.addEventListener("click", (event) => {
      if (event.currentTarget.dataset.routeAction) {
        runFoundationRouteAction(event.currentTarget);
        return;
      }
      leaveMockForDailyQuest();
      window.requestAnimationFrame(() =>
        elements.quizCard?.scrollIntoView({ block: "start", behavior: "smooth" })
      );
    });
    elements.todayCommandPracticalButton?.addEventListener("click", startStudyScopePracticalReview);
    elements.todayCommandCalculationButton?.addEventListener("click", openCalculationDrill);
    elements.missionMinutesStep?.addEventListener("click", () => {
      if (elements.missionMinutesStep.dataset.action === "practical") {
        startStudyScopePracticalReview();
        return;
      }
      if (elements.missionMinutesStep.dataset.action !== "minutes") return;
      elements.todayCommandPanel?.scrollIntoView({ block: "start", behavior: "smooth" });
      window.requestAnimationFrame(() => elements.missionMinutesInput?.focus());
    });
    elements.foundationRoutePrimaryButton?.addEventListener("click", (event) => {
      runFoundationRouteAction(event.currentTarget);
    });
    elements.foundationRoutePracticalButton?.addEventListener("click", (event) => {
      runFoundationRouteAction(event.currentTarget);
    });
    elements.officialDrillOpenButton?.addEventListener("click", openOfficialDrill);
    elements.officialDrillStartButton?.addEventListener("click", startOfficialDrill);
    elements.officialDrillQuestionLink?.addEventListener("click", (event) => {
      event.preventDefault();
      if (!startOfficialDrill()) return;
      const definition = officialDrillDefinitionFor(missionForDate().officialDrill);
      if (definition?.questionUrl) {
        window.open(definition.questionUrl, "_blank", "noopener,noreferrer");
      }
    });
    elements.officialDrillForm?.addEventListener("change", () => saveOfficialDrillDraft());
    elements.officialDrillForm?.addEventListener("submit", submitOfficialDrill);
    elements.officialDrillPrevButton?.addEventListener("click", () => {
      const position = missionForDate().officialDrill?.position || 0;
      moveOfficialDrill(position - 1);
    });
    elements.officialDrillNextButton?.addEventListener("click", () => {
      const position = missionForDate().officialDrill?.position || 0;
      moveOfficialDrill(position + 1);
    });
    elements.officialDrillJumpSelect?.addEventListener("change", (event) => {
      moveOfficialDrill(Number(event.target.value));
    });
    elements.todayCommandReviewButton?.addEventListener("click", saveMissionReview);
    elements.todayReviewInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveMissionReview();
      }
    });
    elements.todayReviewTargets?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveMissionReview();
      }
    });
    elements.passQuestButton?.addEventListener("click", startFirstPass);
    elements.mockAButton?.addEventListener("click", () => startMock("form-a"));
    elements.mockBButton?.addEventListener("click", () => startMock("form-b"));
    elements.weakQuestButton?.addEventListener("click", jumpToWeakPoint);
    elements.sprintButton?.addEventListener("click", toggleSprint);
    elements.codexBriefButton?.addEventListener("click", requestCodexBrief);
    elements.armoryButton?.addEventListener("click", forgeNextArmoryRank);
    elements.saveExportButton?.addEventListener("click", downloadSaveBackup);
    elements.saveShareButton?.addEventListener("click", shareSaveTransfer);
    elements.saveRestorePreviousButton?.addEventListener("click", restorePreviousSave);
    elements.saveImportButton?.addEventListener("click", () => elements.saveImportInput?.click());
    elements.saveImportInput?.addEventListener("change", importSaveFile);
    elements.calculationDrillResetButton?.addEventListener("click", startCalculationDrill);
    elements.calculationDrillRestartButton?.addEventListener("click", startCalculationDrill);
    elements.calculationDrillExitButton?.addEventListener("click", exitCalculationDrill);
    elements.calculationDrillNextButton?.addEventListener("click", advanceCalculationDrill);
    elements.calculationDrillConfidence?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-calculation-confidence]");
      if (button) setCalculationConfidence(button.dataset.calculationConfidence);
    });
    elements.practicalDrillStartButton?.addEventListener("click", startPracticalDrill);
    elements.practicalDrillRestartButton?.addEventListener("click", restartPracticalDrill);
    elements.practicalDrillChangeButton?.addEventListener("click", changePracticalDrillSettings);
    elements.practicalDrillExitButton?.addEventListener("click", exitPracticalDrill);
    elements.practicalDrillNextButton?.addEventListener("click", advancePracticalDrill);
    elements.practicalDrillCancelButton?.addEventListener("click", cancelPracticalDrill);
    elements.businessKnockStart?.addEventListener("click", startBusinessKnockSession);
    [elements.businessKnockMode, elements.businessKnockUnit, elements.businessKnockSize]
      .filter(Boolean)
      .forEach((control) => control.addEventListener("change", updateBusinessKnockPresetFromControls));
    elements.practicalDrillScope?.addEventListener("change", renderPracticalDrillLauncher);
    elements.practicalDrillSize?.addEventListener("change", renderPracticalDrillLauncher);
    elements.practicalDrillConfidence?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-practical-confidence]");
      if (button) setPracticalConfidence(button.dataset.practicalConfidence);
    });
    elements.businessMasteryPrimary?.addEventListener("click", startBusinessMasterySession);
    elements.businessMasteryFull?.addEventListener("click", () =>
      startBusinessFullScoreSession({ size: BUSINESS_FULLSCORE_EXPECTED_QUESTIONS, fullScan: true })
    );
    elements.businessMasteryGrid?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-business-mastery-unit]");
      if (!button) return;
      const unitId = button.dataset.businessMasteryUnit;
      if (activeLearningSession()) {
        resumeActiveLearningSession();
        return;
      }
      const chapter = businessFoundationChapters().find((item) => item.id === unitId);
      if (!chapter) return;
      if (chapter.ids.some((id) => !isRetained(id))) {
        startBusinessFoundationUnit(unitId);
      } else {
        startBusinessFullScoreSession({ unitId, fullScan: true });
      }
    });
    elements.missionMinutesButton?.addEventListener("click", saveMissionMinutes);
    elements.missionMinutesInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveMissionMinutes();
      }
    });
    elements.officialExamAttemptType?.addEventListener("change", () => {
      renderOfficialExamYearOptions();
      renderOfficialExamSession();
    });
    elements.officialExamId?.addEventListener("change", () => {
      renderOfficialExamYearOptions();
      renderOfficialExamSession();
    });
    elements.officialExamQuestionLink?.addEventListener("click", (event) => {
      if (state.officialExamSession) return;
      event.preventDefault();
      setOfficialExamStatus(
        "初見証跡を守るため、先に120分計測を開始してください。開始時に露出記録を保存してからPDFを開けます。",
        true
      );
    });
    elements.officialExamStartButton?.addEventListener("click", startOfficialExam);
    elements.officialExamSessionForm?.addEventListener("change", () => {
      saveOfficialExamDraft();
    });
    elements.officialExamSessionForm?.addEventListener("submit", submitOfficialExam);
    elements.officialExamAbandonButton?.addEventListener("click", abandonOfficialExam);
    elements.officialExamPrevButton?.addEventListener("click", () => {
      moveOfficialExam((state.officialExamSession?.position || 0) - 1);
    });
    elements.officialExamNextButton?.addEventListener("click", () => {
      moveOfficialExam((state.officialExamSession?.position || 0) + 1);
    });
    elements.officialExamJumpSelect?.addEventListener("change", (event) => {
      moveOfficialExam(Number(event.target.value));
    });
    elements.officialExamManualForm?.addEventListener("submit", recordOfficialExam);
    elements.chapterSelect?.addEventListener("change", (event) => {
      selectChapter(Number(event.target.value));
    });
    elements.studyScopeSelect?.addEventListener("change", (event) => {
      setStudyScope(String(event.target.value));
    });
    elements.weakButton?.addEventListener("click", jumpToWeakPoint);
    elements.progressDrawerLink?.addEventListener("click", () => {
      if (elements.progressDrawer) elements.progressDrawer.open = true;
    });
    window.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLButtonElement
      ) {
        return;
      }
      if (!state.answered && ["1", "2", "3", "4"].includes(event.key)) {
        answer(Number(event.key) - 1);
      }
      if (state.answered && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        nextQuestion();
      }
    });
    window.addEventListener("storage", handleStorageSync);
  }

  function configurePublicStaticMode() {
    if (!PUBLIC_STATIC_MODE) return;
    if (elements.codexBriefButton) {
      elements.codexBriefButton.hidden = true;
    }
    if (elements.codexBriefLink) {
      elements.codexBriefLink.hidden = true;
    }
    if (elements.coachText) {
      elements.coachText.textContent =
        "正誤・弱点・EXPはこの端末のブラウザ内だけに保存されます。";
    }
    setLogStatus(false, "この端末に保存");
  }

  bindEvents();
  configurePublicStaticMode();
  void consumeSaveTransferHash();
  window.setInterval(() => {
    tickSprint();
    tickMockTimer();
    renderOfficialDrillTimer();
    renderOfficialExamTimer();
    checkDayRollover();
  }, 1000);
  const hasMockResult = isMockMode() && state.mock.finalized;
  const hasChapterResult = isChapterMode() && state.finished;
  if (state.finished && !hasMockResult && !hasChapterResult) {
    state.finished = false;
    saveState();
  }
  renderCurrentView();
  void (async () => {
    await checkStudyServer();
    await syncCentralProgress();
    await loadTodayQuest();
    grantQuestCompletionIfEarned();
    renderCurrentView();
  })();
})();
