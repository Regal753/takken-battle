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
  const DAILY_TARGET = 10;
  const SPRINT_MINUTES = 25;
  const TODAY_QUEST_PARAM = URL_PARAMS.has("today") || URL_PARAMS.has("quest");
  const FIRST_PASS_PARAM = URL_PARAMS.has("pass") || URL_PARAMS.has("firstpass") || URL_PARAMS.has("onepass");
  const RUN_MODE_FIRST_PASS = "first-pass";
  const FIRST_PASS_DEADLINE = "2026-07-14";
  const FIRST_PASS_DEADLINE_LABEL = "7/14";
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
    { level: 5, title: "免許攻略兵" },
    { level: 8, title: "業法剣士" },
    { level: 12, title: "重要事項の守人" },
    { level: 18, title: "契約執行官" },
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
  const ORDER = [
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

  const CHAPTERS = [
    { label: "免許・免許換え", ids: ["q116", "q117", "q118", "q119", "q120", "q121", "q122", "q123", "q124", "q125", "q126", "q127", "q128", "q129", "q130", "q131", "q132", "q133", "q134", "q135", "q136"] },
    { label: "宅建士・従業者", ids: ["q6", "q7", "q8", "q9", "q41", "q42", "q43", "q44", "q45", "q88", "q89", "q90", "q91"] },
    { label: "標識・案内所・広告", ids: ["q4", "q10", "q46", "q47", "q48", "q49", "q50", "q92", "q93", "q94", "q95"] },
    { label: "35条 重要事項説明", ids: ["q11", "q13", "q51", "q52", "q53", "q54", "q55", "q96", "q97", "q98", "q99"] },
    { label: "37条・契約制限", ids: ["q12", "q56", "q57", "q58", "q59", "q60", "q100", "q101", "q102", "q103"] },
    { label: "媒介契約", ids: ["q14", "q15", "q61", "q62", "q63", "q64", "q65", "q104", "q105", "q106", "q107"] },
    { label: "報酬・金銭", ids: ["q16", "q66", "q67", "q68", "q69", "q70", "q108", "q109", "q110", "q111"] },
    { label: "保証金・監督処分", ids: ["q17", "q18", "q19", "q20", "q71", "q72", "q73", "q74", "q75", "q112", "q113", "q114", "q115"] }
  ];

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

  const QUESTIONS = window.TAKKEN_QUESTIONS || {};
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
    attemptCount: $("#attemptCount"),
    accuracyText: $("#accuracyText"),
    streakText: $("#streakText"),
    markedText: $("#markedText"),
    chapterProgressText: $("#chapterProgressText"),
    studyTitle: $("#studyTitle"),
    todayLabel: $("#todayLabel"),
    chapterList: $("#chapterList"),
    themeBar: $("#themeBar"),
    chapterSelect: $("#chapterSelect"),
    adaptiveButton: $("#adaptiveButton"),
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
    dailyCompletePanel: $("#dailyCompletePanel"),
    dailyCompleteSummary: $("#dailyCompleteSummary"),
    dailyContinueButton: $("#dailyContinueButton"),
    passQuestButton: $("#passQuestButton"),
    weakQuestButton: $("#weakQuestButton"),
    sprintButton: $("#sprintButton"),
    sprintTimer: $("#sprintTimer"),
    sprintStatus: $("#sprintStatus"),
    saveExportButton: $("#saveExportButton"),
    saveImportInput: $("#saveImportInput"),
    saveTransferStatus: $("#saveTransferStatus")
  };

  const createState = () => ({
    index: 0,
    answered: null,
    attempts: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    focus: 0,
    crystals: 0,
    victories: 0,
    progressionVersion: PROGRESSION_VERSION,
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
    sessionId: `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    runMode: FIRST_PASS_PARAM ? RUN_MODE_FIRST_PASS : "quest",
    adaptive: true,
    questionStats: {},
    centralMarked: {},
    centralProgress: {},
    marked: {},
    autoMarked: {},
    activeCutCheck: null,
    dailyFinishedDate: "",
    daily: createDailyState(),
    sprint: {
      endsAt: null,
      completed: 0
    },
    finished: false
  });

  let state = loadState();
  applyQuestionBalance();
  saveState();
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

  function createDailyState() {
    return {
      date: todayKey(),
      answers: 0,
      correct: 0,
      wrong: 0,
      weakAdded: 0,
      target: DAILY_TARGET
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
      weakAdded: Number(input.weakAdded) || 0
    };
  }

  function normalizeSprintState(input) {
    return {
      endsAt: input?.endsAt || null,
      completed: Number(input?.completed) || 0
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
    const raw = localStorage.getItem(STORAGE_ID);
    try {
      const saved = JSON.parse(raw || "null");
      return normalizeState(saved || createState());
    } catch {
      if (raw) {
        try {
          localStorage.setItem(`${STORAGE_ID}-corrupt-${Date.now()}`, raw);
        } catch {
          // Recovery backup is best-effort; the fresh state remains usable.
        }
      }
      return createState();
    }
  }

  function normalizeState(input) {
    const previousProgressionVersion = Number(input?.progressionVersion) || 0;
    const hasProgressionV1 = previousProgressionVersion >= 1;
    const next = { ...createState(), ...input };
    next.index = Math.min(Math.max(Number(next.index) || 0, 0), ORDER.length - 1);
    next.step = Number(next.step) || next.attempts || 0;
    next.sessionId = next.sessionId || `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    next.runMode = FIRST_PASS_PARAM || next.runMode === RUN_MODE_FIRST_PASS ? RUN_MODE_FIRST_PASS : "quest";
    next.adaptive = next.adaptive !== false;
    next.questionStats = next.questionStats || {};
    next.centralMarked = next.centralMarked || {};
    next.centralProgress = next.centralProgress || {};
    next.questionChoiceOrders = next.questionChoiceOrders || {};
    next.questionBalanceAudit = next.questionBalanceAudit || {};
    next.questionBalanceVersion = Number(next.questionBalanceVersion) || 0;
    next.marked = next.marked || {};
    next.autoMarked = next.autoMarked || {};
    next.focus = Math.min(100, Math.max(0, Number(next.focus) || 0));
    next.crystals = Math.max(0, Number(next.crystals) || 0);
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
    next.activeCutCheck = next.activeCutCheck && next.activeCutCheck.id === ORDER[next.index] && !next.answered
      ? { id: next.activeCutCheck.id, answers: next.activeCutCheck.answers || {} }
      : null;
    next.dailyFinishedDate = String(next.dailyFinishedDate || "");
    next.daily = normalizeDailyState(next.daily);
    next.sprint = normalizeSprintState(next.sprint);
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

  function saveState() {
    localStorage.setItem(STORAGE_ID, JSON.stringify(state));
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
      return `${contacted}/100問・弱点${weak}問・中央台帳${parsed.progress.answers}解答`;
    }
    const stats = parsed.state.questionStats || {};
    const contacted = Object.values(stats).filter((item) =>
      Math.max(Number(item?.attempts) || 0, Number(item?.centralAttempts) || 0) > 0
    ).length;
    return `${contacted}/100問・端末${Number(parsed.state.attempts) || 0}解答`;
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

    localStorage.setItem(
      `${STORAGE_ID}-before-import-${Date.now()}`,
      JSON.stringify(state)
    );
    const imported = parsed.format === SAVE_TRANSFER.PROGRESS_FORMAT
      ? SAVE_TRANSFER.stateFromProgressPackage(parsed, createState(), ORDER)
      : parsed.state;
    state = normalizeState(imported);
    applyQuestionBalance();
    saveState();
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
      link.href = URL.createObjectURL(blob);
      link.download = `takken-battle-save-${day}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      setSaveTransferStatus("セーブのバックアップを保存しました。");
    } catch (error) {
      setSaveTransferStatus(error?.message || "バックアップに失敗しました。", true);
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

  function consumeSaveTransferHash() {
    if (!PUBLIC_STATIC_MODE || !SAVE_TRANSFER || !window.location.hash) return;
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const token = hashParams.get("save");
    if (!token) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    try {
      importSavePackage(SAVE_TRANSFER.decodePackage(token), "旧ローカル版");
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
      order: ORDER,
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
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
      target: Number(payload?.target) || DAILY_TARGET,
      message: ids.length > 0
        ? `固定10問: ${
            source === "api"
              ? "自動生成"
              : source === "browser"
                ? "ブラウザ生成"
                : "前回生成"
          }`
        : "固定10問: 未生成"
    };
  }

  function publicTodayQuest() {
    const date = todayKey();
    let seed = 2166136261;
    for (const char of date) {
      seed ^= char.charCodeAt(0);
      seed = Math.imul(seed, 16777619);
    }
    const ids = ORDER.filter((id) => QUESTIONS[id]);
    for (let index = ids.length - 1; index > 0; index -= 1) {
      seed = Math.imul(seed ^ (seed >>> 15), 2246822519);
      seed ^= seed >>> 13;
      const swapIndex = Math.abs(seed) % (index + 1);
      [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
    }
    return normalizeTodayQuestPayload({
      date,
      questId: `public-${date}`,
      ids: ids.slice(0, DAILY_TARGET),
      target: DAILY_TARGET
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
      render();
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
    void loadTodayQuest();
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
    elements.routeSectorLabel.textContent = `${question.chapter?.label || "宅建業法"} / 区画${position.sectorNumber}`;
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

  function isContacted(id) {
    return effectiveAttempts(statsFor(id)) > 0;
  }

  function contactedCount() {
    return ORDER.filter(isContacted).length;
  }

  function remainingFirstPassCount() {
    return Math.max(0, ORDER.length - contactedCount());
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
      return `全100問のうち残り${remainingFirstPassCount()}問`;
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
    for (let offset = 1; offset <= ORDER.length; offset += 1) {
      const index = (state.index + offset) % ORDER.length;
      const id = ORDER[index];
      if (!isContacted(id)) {
        return id;
      }
    }
    return null;
  }

  function firstPassStartId() {
    if (!state.answered && !isContacted(currentId())) {
      return currentId();
    }
    return nextFirstPassId() || ORDER.find((id) => !isContacted(id)) || currentId();
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

  function adaptiveCandidates({ currentChapterOnly = false } = {}) {
    const question = currentQuestion();
    const currentChapter = question.chapter;
    return weakIds().filter((id) => {
      if (id === currentId()) return false;
      if (currentChapterOnly && !currentChapter?.ids.includes(id)) return false;
      const stats = statsFor(id);
      return localDateKey(latestAt(stats.lastAnsweredAt, stats.centralLastAnsweredAt)) !== todayKey();
    });
  }

  function nextAdaptiveId() {
    if (!state.adaptive || isFirstPassMode()) return null;
    return adaptiveCandidates({ currentChapterOnly: true })[0] || adaptiveCandidates()[0] || null;
  }

  function nextTargetId() {
    if (isFirstPassMode()) {
      return nextFirstPassId();
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
    const adaptiveId = nextAdaptiveId();
    if (adaptiveId) {
      return adaptiveId;
    }
    if (isChapterEnd()) {
      return null;
    }
    return ORDER[state.index + 1] || null;
  }

  function nextActionLabel() {
    if (state.answered?.correct === false && !mistakeRecorded()) {
      return "ミス入力へ";
    }
    if (state.answered?.weakBreakCandidate && !state.answered.confidence) {
      return "根拠を確認";
    }
    if (isDailyQuestQuestion(currentId()) && dailyQuestDoneCount() >= dailyQuestIds().length) {
      return "今日の10問を終了";
    }
    if (isFirstPassMode()) {
      return nextFirstPassId() ? "次の未接触へ" : "一周完了";
    }
    if (state.index >= ORDER.length - 1) {
      return "結果を見る";
    }
    if (nextAdaptiveId()) {
      return state.answered?.correct ? "弱点の敵へ" : "復習候補へ";
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

    const resultParts = [answered.correct ? "撃破" : "要復習"];
    if (answered.levelUp) resultParts.push(`Lv.${answered.newLevel}`);
    if (answered.chestOpened) resultParts.push(`${answered.chestTier?.label || "銅"}宝箱`);
    if (answered.milestone) resultParts.push(`${answered.milestone}体`);
    (answered.questRewards || []).forEach((item) => resultParts.push(`戦果${item.label}`));
    if (answered.correct && !answered.chestOpened && state.chestProgress === 4) {
      resultParts.push("次で宝箱");
    }
    const xpResult = typeof answered.xpReward === "number" ? ` / EXP +${answered.xpReward}` : "";
    elements.dockResultText.textContent = `${resultParts.join("・")}${xpResult}`;

    const needsMasteryCheck = Boolean(answered.weakBreakCandidate && !answered.confidence);
    const dailyComplete = Boolean(
      isDailyQuestQuestion(currentId()) && dailyQuestDoneCount() >= dailyQuestIds().length
    );
    const targetId = needsMasteryCheck ? null : nextTargetId();
    const targetQuestion = targetId ? QUESTIONS[targetId] : null;
    if (needsMasteryCheck) {
      elements.dockTargetText.textContent = "弱点克服候補・根拠確認で報酬確定";
    } else if (dailyComplete) {
      elements.dockTargetText.textContent = nextFirstPassId()
        ? "固定10問完走・今日はここまででOK"
        : "固定10問完走・宅建業法100問に接触完了";
    } else if (targetQuestion) {
      elements.dockTargetText.textContent = `次 ${ORDER.indexOf(targetId) + 1}/${ORDER.length} ・ ${targetQuestion.tag}`;
    } else if (isFirstPassMode()) {
      elements.dockTargetText.textContent = "宅建業法100問に接触完了";
    } else if (isChapterEnd()) {
      elements.dockTargetText.textContent = `${question.chapter?.label || "現在のテーマ"}を完了`;
    } else {
      elements.dockTargetText.textContent = "最終結果を表示";
    }
    elements.dockNextLabel.textContent = nextActionLabel();
    if (elements.dockUnsureButton) {
      const uncertain = answered.confidence === "unsure" || answered.confidence === "cuts";
      elements.dockUnsureButton.hidden = !answered.correct || answered.confidence === "clear";
      elements.dockUnsureButton.disabled = uncertain;
      elements.dockUnsureButton.textContent = uncertain ? "迷い済" : "勘・迷い";
      elements.dockUnsureButton.classList.toggle("is-selected", uncertain);
    }
    if (answered.correct === false && !mistakeRecorded(answered)) {
      elements.dockTargetText.textContent = mistakeRequirementText(answered);
    }
    elements.dockNextButton.classList.toggle(
      "is-reward",
      Boolean(
        needsMasteryCheck ||
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

  function render() {
    const question = currentQuestion();
    const answered = state.answered;
    const isCorrect = answered?.correct === true;
    const isWrong = answered?.correct === false;
    const chapterText = question.chapter?.label || "宅建業法";
    const enemyType = ((question.chapter?.chapterIndex ?? 0) % CHAPTERS.length) + 1;
    const battleProfile = enemyProfileFor(question);
    const attackTier = isCorrect ? (answered.attackTier || attackTierFor(state.streak, answered.overdrive)) : 0;

    elements.enemyName.textContent = battleProfile.name;
    elements.enemyClassLabel.textContent = battleProfile.classLabel;
    elements.sourceLabel.textContent = `2026年度版 / 第1分冊 宅建業法 / ${chapterText} / ${question.level || "本試験寄せ"}`;
    elements.enemyStateLabel.textContent = answered ? (isCorrect ? "ONE HIT CLEAR" : "FOCUS BREAK") : "一撃で倒せ";
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
      elements.battleAnnouncement.textContent = `${battleProfile.trait}。正解で一撃撃破。`;
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

    elements.roundLabel.textContent = `${state.index + 1} / ${ORDER.length}`;
    elements.tagBadge.textContent = question.format ? `${question.tag}・${question.format}` : question.tag;
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
    renderDailyCompletionPanel();
    renderSprint();
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

  function mistakeRequirementText(answered = state.answered) {
    if (!hasMistakeTarget(answered)) return "誤認した肢か原因不明を選択";
    if (!MISTAKE_CAUSE_IDS.has(answered?.mistakeCause)) return "原因タグを選択";
    return "ミス記録済み";
  }

  function mistakeRecorded(answered = state.answered) {
    if (!answered || answered.correct !== false) return true;
    return hasMistakeTarget(answered) && MISTAKE_CAUSE_IDS.has(answered.mistakeCause);
  }

  function shouldCutCheck(id) {
    if (isFirstPassMode()) {
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
        if (index === question.answer) button.classList.add("is-correct");
        if (index === answered.selected && index !== question.answer) button.classList.add("is-wrong");
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

  function renderFeedback(question) {
    const answered = state.answered;
    removeAdaptiveFeedback();
    removeConfidenceCheck();
    elements.feedbackBox.hidden = !answered;
    if (!answered) {
      return;
    }
    elements.feedbackTitle.textContent = answered.correct
      ? "撃破。4肢の判定を確認"
      : "反撃。誤りの肢を確認";
    elements.correctAnswer.textContent = `${question.answer + 1}. ${question.choices[question.answer]}`;
    elements.trapText.textContent = question.trap || "正解肢だけでなく、他の肢を切れる理由まで確認する。";
    elements.bookRef.textContent = TOPIC_REFS[question.tag] || `第1分冊 宅建業法 / ${question.tag}`;
    elements.explainText.textContent = question.explain;
    renderConfidenceCheck(question);
    renderChoiceExplanations(question);
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
    title.textContent = "どこを間違えた？";
    const status = document.createElement("span");
    status.className = "mistake-save-status";
    status.textContent = mistakeRecorded(answered) ? "記録済み" : mistakeRequirementText(answered);
    head.append(title, status);

    const lead = document.createElement("p");
    lead.className = "mistake-capture-lead";
    lead.textContent = "誤認した肢と原因を選択。肢は複数可、特定できなければ原因不明でよい。";

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
    causeLegend.textContent = "原因タグ（必須）";
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
    if (status) status.textContent = mistakeRecorded() ? "自動保存済み" : mistakeRequirementText();
    elements.dockNextLabel.textContent = nextActionLabel();
    if (mistakeRecorded()) {
      elements.dockTargetText.textContent = nextTargetId()
        ? `次 ${ORDER.indexOf(nextTargetId()) + 1}/${ORDER.length} ・ ${QUESTIONS[nextTargetId()].tag}`
        : "次の進行先を確認";
    } else {
      elements.dockTargetText.textContent = mistakeRequirementText();
    }
  }

  function removeConfidenceCheck() {
    const existing = elements.feedbackBox.querySelector(".confidence-check");
    if (existing) {
      existing.remove();
    }
  }

  function renderConfidenceCheck(question) {
    removeConfidenceCheck();
    const wrapper = document.createElement("section");
    wrapper.className = "confidence-check";

    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "根拠チェック";
    const lead = document.createElement("p");
    lead.textContent = state.answered?.weakBreakCandidate
      ? "翌日再テスト成功。根拠まで説明できれば弱点克服を確定。"
      : "正解でも迷った問題は弱点に残す。";
    copy.append(title, lead);

    const actions = document.createElement("div");
    actions.className = "confidence-actions";
    [
      { value: "clear", label: "根拠までOK" },
      { value: "unsure", label: "迷った" },
      { value: "cuts", label: "全肢切れない" }
    ].forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "confidence-button";
      button.textContent = item.label;
      button.classList.toggle("is-selected", state.answered?.confidence === item.value);
      button.addEventListener("click", () => setConfidence(question.id, item.value));
      actions.append(button);
    });

    wrapper.append(copy, actions);
    elements.feedbackBox.insertBefore(wrapper, elements.nextButton);
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

    const title = document.createElement("strong");
    title.textContent = isFirstPassMode() ? "一周モード" : "自動補強";

    const text = document.createElement("p");
    if (isFirstPassMode()) {
      const remaining = remainingFirstPassCount();
      text.textContent = remaining > 0
        ? `誤答・迷いは弱点に記録するが、次問は未接触へ進む。残り${remaining}問、${firstPassPaceText()}。`
        : "宅建業法100問に一通り接触。弱点回収は日次クエストへ戻して処理する。";
      note.append(title, text);
      elements.feedbackBox.insertBefore(note, elements.nextButton);
      return;
    }

    const nextId = nextAdaptiveId();
    if (state.answered?.correct === false) {
      text.textContent = `${question.tag}を弱点に登録。同日の自動再出題はせず、翌日以降に戻す。`;
    } else if (nextId) {
      const nextQuestion = QUESTIONS[nextId];
      text.textContent = `次は過去に落とした「${nextQuestion.tag}」を優先して確認する。`;
    } else if (weakIds().length > 0) {
      text.textContent = "弱点は保持中。同日の自動再出題はせず、翌日以降に戻す。";
    } else {
      text.textContent = "この論点は処理済み。未解答問題を進める。";
    }

    note.append(title, text);
    elements.feedbackBox.insertBefore(note, elements.nextButton);
  }

  function renderStats() {
    const attempts = Math.max(state.attempts, Number(state.centralProgress?.answers) || 0);
    const correct = Math.max(state.correct, Number(state.centralProgress?.correct) || 0);
    elements.attemptCount.textContent = String(attempts);
    elements.accuracyText.textContent = attempts ? `${Math.round((correct / attempts) * 100)}%` : "-";
    elements.streakText.textContent = state.bestStreak ? `${state.streak}/${state.bestStreak}` : String(state.streak);
    elements.markedText.textContent = String(weakIds().length);
    elements.chapterProgressText.textContent = `${contactedCount()} / ${ORDER.length}問接触`;
    if (elements.studyTitle) {
      elements.studyTitle.textContent = isFirstPassMode() ? "宅建業法 一周" : "宅建業法";
    }
    if (elements.todayLabel) {
      elements.todayLabel.textContent = isFirstPassMode() ? firstPassRemainingText() : "今日の演習";
    }
  }

  function renderQuestPanel() {
    if (!elements.dailyQuestTitle) return;
    state.daily = normalizeDailyState(state.daily);
    const target = state.daily.target || DAILY_TARGET;
    const fixedIds = dailyQuestIds();
    const fixedTarget = fixedIds.length || target;
    const fixedDone = dailyQuestDoneCount();
    const fixedClear = dailyQuestClearCount();
    const dailyProgressBase = fixedIds.length ? fixedDone : state.daily.answers;
    const dailyRemaining = Math.max(0, fixedTarget - dailyProgressBase);
    const firstPassDone = contactedCount();
    const progressBase = isFirstPassMode()
      ? firstPassDone
      : dailyProgressBase;
    const progressTarget = isFirstPassMode() ? ORDER.length : fixedTarget;
    const progress = Math.min(100, Math.round((progressBase / progressTarget) * 100));
    const firstPassRemaining = remainingFirstPassCount();
    renderQuestRewards(fixedClear, fixedIds.length > 0);
    elements.questCard?.classList.toggle("is-first-pass", isFirstPassMode());
    if (isFirstPassMode()) {
      const chapter = currentChapterContactSummary();
      const paceText = firstPassPaceText();
      if (elements.questLabel) {
        elements.questLabel.textContent = "一周モード";
      }
      elements.dailyQuestTitle.textContent = `${firstPassDone} / ${ORDER.length}接触`;
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
      if (elements.questLabel) {
        elements.questLabel.textContent = "今日のクエスト";
      }
      elements.dailyQuestTitle.textContent = fixedIds.length
        ? `固定${fixedTarget}問 ${Math.min(fixedDone, fixedTarget)}/${fixedTarget}接触`
        : `${Math.min(state.daily.answers, target)} / ${target}撃破`;
      if (elements.dailyAnswerLabel) elements.dailyAnswerLabel.textContent = "今日";
      if (elements.dailyCorrectLabel) elements.dailyCorrectLabel.textContent = "正解";
      if (elements.dailyWeakLabel) elements.dailyWeakLabel.textContent = "弱点";
      elements.dailyAnswerText.textContent = `${fixedIds.length ? fixedDone : state.daily.answers}問`;
      elements.dailyCorrectText.textContent = `${fixedIds.length ? fixedClear : state.daily.correct}問`;
      elements.dailyWeakText.textContent = `${state.daily.weakAdded}件`;
      elements.dailyQuestButton.textContent = fixedIds.length
        ? (dailyRemaining > 0
            ? `固定残り${dailyRemaining}`
            : "本日完走")
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
        ? (firstPassRemaining > 0 ? "一周中" : "完了")
        : "一周";
      elements.passQuestButton.classList.toggle("is-active", isFirstPassMode());
    }
    if (isFirstPassMode()) elements.dailyQuestButton.disabled = false;
    elements.weakQuestButton.disabled = weakIds().length === 0;
  }

  function dailyQuestIsComplete() {
    const ids = dailyQuestIds();
    return Boolean(ids.length && dailyQuestDoneCount() >= ids.length);
  }

  function isDailyQuestPaused() {
    return !isFirstPassMode() && dailyQuestIsComplete() && state.dailyFinishedDate === todayKey();
  }

  function renderDailyCompletionPanel() {
    if (!elements.dailyCompletePanel) return;
    const visible = isDailyQuestPaused();
    elements.dailyCompletePanel.hidden = !visible;
    if (!visible) return;
    const correct = dailyQuestClearCount();
    const target = dailyQuestIds().length || DAILY_TARGET;
    elements.dailyCompleteSummary.textContent = `${target}問接触・${correct}問正解。ここで終了してOK。続けたい日だけ未接触へ進む。`;
    elements.dailyContinueButton.disabled = !nextFirstPassId();
    elements.dailyContinueButton.textContent = nextFirstPassId() ? "未接触を続ける" : "全問接触完了";
  }

  function finishDailyQuest() {
    if (!dailyQuestIsComplete() || isFirstPassMode()) return false;
    state.dailyFinishedDate = todayKey();
    saveState();
    renderDailyCompletionPanel();
    renderAnswerDock(currentQuestion());
    elements.dailyCompletePanel?.scrollIntoView({ block: "center", behavior: "smooth" });
    return true;
  }

  function continueAfterDailyQuest() {
    const targetId = nextFirstPassId();
    if (!targetId) {
      showFinished();
      return;
    }
    state.dailyFinishedDate = "";
    state.runMode = RUN_MODE_FIRST_PASS;
    setFirstPassUrl(true);
    goToQuestion(targetId);
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
    const hidden = isFirstPassMode() || !hasFixedQuest;
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
    CHAPTERS.forEach((chapter, chapterIndex) => {
      const solved = chapter.ids.filter((id) => effectiveCorrectCount(statsFor(id)) > 0).length;
      const option = document.createElement("option");
      option.value = String(chapterIndex);
      option.textContent = `${chapter.label} ${solved}/${chapter.ids.length}`;
      option.selected = chapterIndex === activeChapter;
      elements.chapterSelect.append(option);
    });

    const targets = weakIds();
    elements.weakButton.textContent = `弱点 ${targets.length}`;
    elements.weakButton.disabled = targets.length === 0;
    if (elements.adaptiveButton) {
      elements.adaptiveButton.textContent = isFirstPassMode()
        ? "補強は記録のみ"
        : (state.adaptive ? "自動補強 ON" : "自動補強 OFF");
      elements.adaptiveButton.classList.toggle("is-active", state.adaptive && !isFirstPassMode());
    }
  }

  function renderAdaptiveCoach(question) {
    if (!elements.coachTitle || !elements.coachText) return;

    if (isFirstPassMode()) {
      const remaining = remainingFirstPassCount();
      const chapter = currentChapterContactSummary();
      elements.coachTitle.textContent = `一周 ${contactedCount()}/${ORDER.length}接触`;
      elements.coachText.textContent = remaining > 0
        ? `弱点は記録だけ。${chapter ? `${chapter.label}は残り${chapter.remaining}問。` : ""}全体は残り${remaining}問。${firstPassPaceText()}。`
        : "宅建業法100問は接触済み。日次クエストへ戻して弱点回収に入る。";
      return;
    }

    const topic = weakestTopic();
    const nextId = nextAdaptiveId();
    if (!topic) {
      elements.coachTitle.textContent = "弱点なし";
      elements.coachText.textContent = state.adaptive
        ? "間違えた論点が出たら、復習候補と次の一問に自動で反映する。"
        : "自動補強はOFF。弱点ボタンから手動で復習できる。";
      return;
    }

    if (!state.adaptive) {
      elements.coachTitle.textContent = `${topic.label}を手動復習`;
      elements.coachText.textContent = `${topic.chapter}で弱点${topic.count}問。自動補強をONにすると次問候補へ混ぜる。`;
      return;
    }

    if (nextId) {
      const nextQuestion = QUESTIONS[nextId];
      elements.coachTitle.textContent = `次は${nextQuestion.tag}を補強`;
      elements.coachText.textContent = `${topic.chapter}で弱点${topic.count}問。通常問題を挟みながら、落とした論点へ戻す。`;
      return;
    }

    elements.coachTitle.textContent = `${topic.label}を保持中`;
    elements.coachText.textContent = `${question.tag}の解答後、間隔を空けて復習候補に戻す。`;
  }

  function renderChapters(activeId) {
    elements.chapterList.replaceChildren();
    elements.chapterList.classList.toggle(
      "is-selecting",
      Boolean(state.answered) && isChapterEnd() && state.index < ORDER.length - 1
    );
    CHAPTERS.forEach((chapter, chapterIndex) => {
      const solved = chapter.ids.filter((id) => effectiveCorrectCount(statsFor(id)) > 0).length;
      const contacted = chapter.ids.filter(isContacted).length;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "chapter-row";
      row.classList.toggle("is-active", chapter.ids.includes(activeId));
      row.classList.toggle("is-done", (isFirstPassMode() ? contacted : solved) === chapter.ids.length);
      row.setAttribute("aria-label", `${chapter.label}を選択 ${isFirstPassMode() ? contacted : solved}/${chapter.ids.length}`);

      const dot = document.createElement("span");
      dot.className = "chapter-dot";
      dot.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "chapter-label";
      label.textContent = chapter.label;

      const score = document.createElement("span");
      score.className = "chapter-score";
      score.textContent = `${isFirstPassMode() ? contacted : solved} / ${chapter.ids.length}`;

      row.append(dot, label, score);
      row.addEventListener("click", () => selectChapter(chapterIndex));
      elements.chapterList.append(row);
    });
  }

  function selectChapter(chapterIndex) {
    const chapter = CHAPTERS[chapterIndex];
    if (!chapter) return;
    state.runMode = "quest";
    setFirstPassUrl(false);
    const nextId = chapter.ids.find((id) => effectiveCorrectCount(statsFor(id)) === 0) || chapter.ids[0];
    goToQuestion(nextId);
  }

  function jumpToWeakPoint() {
    const targets = weakIds().filter((id) => id !== currentId());
    const nextId = targets[0] || weakIds()[0];
    if (!nextId) return;
    state.runMode = "quest";
    setFirstPassUrl(false);
    goToQuestion(nextId);
  }

  function nextUnsolvedId() {
    return ORDER.find((id) => effectiveCorrectCount(statsFor(id)) === 0);
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
    setFirstPassUrl(false);
    if (dailyQuestIsComplete()) {
      finishDailyQuest();
      return;
    }
    const fixedQuestId = nextDailyQuestId();
    const adaptiveId = fixedQuestId ? null : nextAdaptiveId();
    const targetId = fixedQuestId || adaptiveId || nextUnsolvedId() || ORDER[(state.index + 1) % ORDER.length];
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

  function startFirstPass() {
    state.dailyFinishedDate = "";
    state.runMode = RUN_MODE_FIRST_PASS;
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
    saveState();
    logStudyEvent("sprint-complete", {
      completed: state.sprint.completed,
      daily: state.daily
    });
    renderSprint();
  }

  function answer(index) {
    if (state.answered) {
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
      confidence: null,
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
      stats: nextStats,
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
        weakBreak,
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
    state.answered.confidence = value;
    state.questionStats[id] = {
      ...stats,
      lastConfidence: value,
      lastConfidenceAt: new Date().toISOString()
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
    if (!state.answered.correct) {
      if (!mistakeRecorded()) {
        showMistakeCapture();
        return;
      }
      logMistakeDetail();
      grantMistakeAnalysisReward();
      setAdvanceBusy(true);
      window.setTimeout(() => {
        setAdvanceBusy(false);
        advanceQuestion();
      }, 360);
      return;
    }
    if (state.answered.weakBreakCandidate && !state.answered.confidence) {
      showConfidenceCheck();
      return;
    }
    if (dailyQuestIsComplete() && !isFirstPassMode()) {
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
      elements.dockUnsureButton.disabled = busy || Boolean(state.answered?.confidence);
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

  function showConfidenceCheck() {
    const confidence = elements.feedbackBox.querySelector(".confidence-check");
    if (!confidence) return;
    confidence.scrollIntoView({ block: "center", behavior: "smooth" });
    window.setTimeout(() => {
      confidence.querySelector(".confidence-button")?.focus({ preventScroll: true });
    }, 260);
  }

  function showMistakeCapture() {
    const capture = elements.feedbackBox.querySelector(".mistake-capture");
    if (!capture) return;
    capture.classList.remove("needs-entry");
    void capture.offsetWidth;
    capture.classList.add("needs-entry");
    capture.scrollIntoView({ block: "center", behavior: "smooth" });
    window.setTimeout(() => {
      const selector = hasMistakeTarget()
        ? ".mistake-cause-button"
        : ".mistake-target-button";
      capture.querySelector(selector)?.focus({ preventScroll: true });
    }, 260);
  }

  function advanceQuestion() {
    if (isFirstPassMode()) {
      const nextId = nextFirstPassId();
      if (nextId) {
        goToQuestion(nextId);
        return;
      }
      showFinished();
      return;
    }
    if (dailyQuestIsComplete()) {
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
    const adaptiveId = nextAdaptiveId();
    if (adaptiveId) {
      goToQuestion(adaptiveId);
      return;
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
    state.index += 1;
    state.answered = null;
    state.activeCutCheck = null;
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showFinished() {
    state.finished = true;
    if (elements.answerDock) {
      elements.answerDock.hidden = true;
      document.body.classList.remove("has-answer-dock");
    }
    saveState();
    const accuracy = state.attempts ? `${Math.round((state.correct / state.attempts) * 100)}%` : "-";
    const contacted = contactedCount();
    const firstPassComplete = contacted >= ORDER.length;
    const finishText = firstPassComplete
      ? `宅建業法${ORDER.length}問に一通り接触。`
      : `宅建業法${ORDER.length}問を完走。`;
    const nextText = firstPassComplete
      ? "次は法令上の制限へ進める。要復習に残した論点は日次クエストで回収する。"
      : "要復習に残した論点と誤答した論点を、次の周回で先に潰す。";
    const finishActions = firstPassComplete
      ? `<div class="finish-actions">
          <button id="finishDailyButton" class="next-button" type="button">日課で弱点回収</button>
          <button id="finishResetButton" class="ghost-button finish-reset" type="button">全記録リセット</button>
        </div>`
      : `<button id="finishResetButton" class="next-button" type="button">全記録リセット</button>`;
    elements.quizCard.innerHTML = `
      <div class="quiz-meta">
        <strong id="roundLabel">${ORDER.length} / ${ORDER.length}</strong>
        <span id="tagBadge">完了</span>
      </div>
      <p class="question-text">${finishText}</p>
      <section class="feedback">
        <h3>結果</h3>
        <dl class="answer-grid">
          <div><dt>解答</dt><dd>${state.attempts}問</dd></div>
          <div><dt>接触</dt><dd>${contacted}問</dd></div>
          <div><dt>正解</dt><dd>${state.correct}問</dd></div>
          <div><dt>正答率</dt><dd>${accuracy}</dd></div>
        </dl>
        <p class="explain-text">${nextText}</p>
        ${finishActions}
      </section>
    `;
    $("#finishDailyButton")?.addEventListener("click", () => {
      state.runMode = "quest";
      state.finished = false;
      saveState();
      const url = new URL(window.location.href);
      ["pass", "firstpass", "onepass"].forEach((key) => url.searchParams.delete(key));
      window.location.href = url.toString();
    });
    $("#finishResetButton").addEventListener("click", resetAll);
  }

  function resetAll() {
    if (!window.confirm("学習記録を全削除して最初からやり直す？")) {
      return;
    }
    logStudyEvent("reset", {
      attempts: state.attempts,
      correct: state.correct,
      weakCount: weakIds().length
    });
    state = createState();
    saveState();
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

  function bindEvents() {
    elements.nextButton.addEventListener("click", nextQuestion);
    elements.dockNextButton?.addEventListener("click", nextQuestion);
    elements.dockExplainButton?.addEventListener("click", showFeedback);
    elements.dockUnsureButton?.addEventListener("click", () => {
      if (state.answered?.correct && !state.answered.confidence) {
        setConfidence(currentId(), "unsure");
      }
    });
    elements.resetButton.addEventListener("click", resetAll);
    elements.markButton.addEventListener("click", toggleMarked);
    elements.adaptiveButton?.addEventListener("click", () => {
      state.adaptive = !state.adaptive;
      saveState();
      logStudyEvent("adaptive-toggle", { adaptive: state.adaptive });
      render();
    });
    elements.dailyQuestButton?.addEventListener("click", startDailyQuest);
    elements.dailyContinueButton?.addEventListener("click", continueAfterDailyQuest);
    elements.passQuestButton?.addEventListener("click", startFirstPass);
    elements.weakQuestButton?.addEventListener("click", jumpToWeakPoint);
    elements.sprintButton?.addEventListener("click", toggleSprint);
    elements.codexBriefButton?.addEventListener("click", requestCodexBrief);
    elements.armoryButton?.addEventListener("click", forgeNextArmoryRank);
    elements.saveExportButton?.addEventListener("click", downloadSaveBackup);
    elements.saveImportInput?.addEventListener("change", importSaveFile);
    elements.chapterSelect?.addEventListener("change", (event) => {
      selectChapter(Number(event.target.value));
    });
    elements.weakButton?.addEventListener("click", jumpToWeakPoint);
    window.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!state.answered && ["1", "2", "3", "4"].includes(event.key)) {
        answer(Number(event.key) - 1);
      }
      if (state.answered && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        nextQuestion();
      }
    });
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
  consumeSaveTransferHash();
  window.setInterval(() => {
    tickSprint();
    checkDayRollover();
  }, 1000);
  if (state.finished) {
    state.finished = false;
    saveState();
  }
  render();
  void (async () => {
    await checkStudyServer();
    await syncCentralProgress();
    await loadTodayQuest();
    grantQuestCompletionIfEarned();
    render();
  })();
})();
