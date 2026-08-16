(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_BUSINESS_MASTERY = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30];
  const DURABLE_LEVEL = REVIEW_INTERVAL_DAYS.length + 1;
  const FULL_SCORE_REQUIRED_EXAMS = 3;
  const FULL_SCORE_EVIDENCE_VERSION = 3;
  const LEGACY_FULL_SCORE_EVIDENCE_VERSION = 2;
  const HISTORICAL_SCORING_BASIS = "historical-official-key";
  const FULL_SCORE_TARGET = 20;
  const BUSINESS_UNIT_IDS = [
    "business-book-01", "business-book-02", "business-book-03", "business-book-04",
    "business-book-05", "business-book-06", "business-book-07", "business-book-08",
    "business-book-09", "business-book-10", "business-book-11"
  ];
  const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const validDateKey = (value) => {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    const year = Number(match[1]);
    const month = Number(match[2]);
    const date = Number(match[3]);
    const parsed = new Date(year, month - 1, date, 12);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 &&
      parsed.getDate() === date ? String(value) : "";
  };
  const dayKey = (value) => {
    if (typeof value === "string" && DATE_KEY_PATTERN.test(value)) return validDateKey(value);
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-") : "";
  };
  const dayKeyAtUtcOffset = (value, offsetMinutes) => {
    const timestamp = Date.parse(value);
    const offset = Number(offsetMinutes);
    if (!Number.isFinite(timestamp) || !Number.isInteger(offset) || offset < -840 || offset > 840) return "";
    return new Date(timestamp - offset * 60000).toISOString().slice(0, 10);
  };
  const addDays = (key, days) => {
    const match = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    date.setDate(date.getDate() + days);
    return dayKey(date);
  };
  const dueKey = (answeredAt, level) => {
    const answeredKey = dayKey(answeredAt);
    if (!answeredKey || level < 1 || level > REVIEW_INTERVAL_DAYS.length) return "";
    return addDays(answeredKey, REVIEW_INTERVAL_DAYS[level - 1]);
  };
  function evidenceChain(input) {
    const days = [...new Set((Array.isArray(input) ? input : []).map(dayKey).filter(Boolean))].sort();
    if (!days.length) return [];
    const chain = [days[0]];
    for (const candidate of days.slice(1)) {
      if (chain.length >= DURABLE_LEVEL) break;
      const required = addDays(chain.at(-1), REVIEW_INTERVAL_DAYS[chain.length - 1]);
      if (required && candidate >= required) chain.push(candidate);
    }
    return chain;
  }
  function stableHash(value) {
    return [...String(value || "")].reduce(
      (hash, character) => ((hash * 31) + character.codePointAt(0)) >>> 0,
      2166136261
    );
  }
  function choiceOrder(questionId, presentationKey, count = 4) {
    const size = Math.max(0, Math.trunc(Number(count) || 0));
    const order = Array.from({ length: size }, (_, index) => index);
    let seed = stableHash(`${presentationKey || "default"}:${questionId || "question"}`);
    for (let index = order.length - 1; index > 0; index -= 1) {
      seed = ((seed * 1664525) + 1013904223) >>> 0;
      const target = seed % (index + 1);
      [order[index], order[target]] = [order[target], order[index]];
    }
    return order;
  }
  function normalizeMasteryHistory(entry) {
    const source = entry && typeof entry === "object" ? entry : {};
    const answeredAt = typeof source.lastAnsweredAt === "string" && dayKey(source.lastAnsweredAt) ? source.lastAnsweredAt : "";
    const days = Array.isArray(source.confidentDayKeys) ? source.confidentDayKeys.map(dayKey).filter(Boolean) : [];
    const legacyConfident = source.lastConfidence === "confident" && !Number.isInteger(source.reviewLevel);
    if (legacyConfident && answeredAt) days.push(dayKey(answeredAt));
    const answeredDay = dayKey(answeredAt);
    const candidateChain = evidenceChain(
      answeredDay ? days.filter((key) => key <= answeredDay) : days
    );
    const requestedLevel = Number.isInteger(source.reviewLevel) &&
      source.reviewLevel >= 0 && source.reviewLevel <= DURABLE_LEVEL
      ? source.reviewLevel
      : 0;
    const levelHasEvidence = Boolean(answeredAt) && requestedLevel > 0 &&
      candidateChain.length >= requestedLevel;
    const wasDemoted = ["wrong", "uncertain"].includes(source.lastConfidence);
    const level = wasDemoted ? 0 : legacyConfident ? 1 : levelHasEvidence ? requestedLevel : 0;
    const confidentDayKeys = level > 0 ? candidateChain.slice(0, level) : [];
    const lastEvidenceDay = confidentDayKeys.at(-1) || "";
    return {
      reviewLevel: level,
      masteryDueKey: level > 0 && level < DURABLE_LEVEL
        ? dueKey(lastEvidenceDay || answeredAt, level)
        : "",
      confidentDayKeys
    };
  }
  function recordOutcome(entry, outcome) {
    const previous = normalizeMasteryHistory(entry);
    const answeredAt = outcome?.answeredAt || new Date().toISOString();
    const key = dayKey(answeredAt);
    if (!outcome?.correct || outcome?.confidence !== "confident") {
      return { reviewLevel: 0, masteryDueKey: "", confidentDayKeys: [] };
    }
    const canAdvance = previous.reviewLevel > 0 && previous.masteryDueKey &&
      key >= previous.masteryDueKey &&
      !previous.confidentDayKeys.includes(key);
    const reviewLevel = previous.reviewLevel === 0
      ? 1
      : (canAdvance ? Math.min(DURABLE_LEVEL, previous.reviewLevel + 1) : previous.reviewLevel);
    const confidentDayKeys = previous.reviewLevel === 0 || canAdvance
      ? [...previous.confidentDayKeys, key].filter(Boolean).slice(-DURABLE_LEVEL)
      : [...previous.confidentDayKeys];
    const masteryDueKey = previous.reviewLevel === 0 || canAdvance
      ? dueKey(answeredAt, reviewLevel)
      : previous.masteryDueKey;
    return { reviewLevel, masteryDueKey, confidentDayKeys };
  }
  function stateFor(entry, now = new Date()) {
    const mastery = normalizeMasteryHistory(entry);
    if (["wrong", "uncertain"].includes(entry?.lastConfidence)) return "retry";
    if (!(entry?.attempts > 0)) return "untouched";
    if (!mastery.reviewLevel) return "learning";
    const todayKey = dayKey(now);
    if (mastery.confidentDayKeys.some((key) => key > todayKey)) return "learning";
    if (mastery.masteryDueKey && todayKey >= mastery.masteryDueKey) return "due";
    if (mastery.reviewLevel >= DURABLE_LEVEL) return "durable";
    return mastery.reviewLevel >= 2 ? "retained" : "learning";
  }
  const priorityFor = (entry, now) => ({ retry: 0, due: 1, untouched: 2, learning: 3, retained: 4, durable: 5 }[stateFor(entry, now)]);
  function summarizeQuestions(questions, history, now) {
    const states = { retry: 0, due: 0, untouched: 0, learning: 0, retained: 0, durable: 0 };
    (questions || []).forEach((question) => { states[stateFor(history?.[question.id] || {}, now)] += 1; });
    return { total: (questions || []).length, ...states };
  }
  function summarizeUnit(unit, questions, history, now) { return { unit, ...summarizeQuestions((questions || []).filter((q) => q.unitId === unit.id), history, now) }; }
  function summarizeOverall(units, questions, history, now) {
    const summaries = (units || []).map((unit) => summarizeUnit(unit, questions, history, now));
    return { questions: summarizeQuestions(questions, history, now), units: summaries, durableUnits: summaries.filter((x) => x.durable === x.total && x.total > 0).length, retainedUnits: summaries.filter((x) => x.retained + x.durable === x.total && x.total > 0).length };
  }
  function officialEvidenceQualifies(item, options = {}) {
    const baseline = String(options.lawBaseline || "2026-04-01");
    const answers = item?.answers && typeof item.answers === "object" && !Array.isArray(item.answers)
      ? item.answers
      : {};
    const callback = typeof options.qualifies === "function" ? options.qualifies : null;
    const startedAt = Date.parse(item?.startedAt || "");
    const completedAt = Date.parse(item?.completedAt || "");
    const profile = item?.examProfile === "fiveExempt" ? "fiveExempt" : "general";
    const questionCount = profile === "fiveExempt" ? 45 : 50;
    const durationMinutes = profile === "fiveExempt" ? 110 : 120;
    const elapsedMinutes = item?.elapsedMinutes;
    const expectedKeys = Array.from({ length: questionCount }, (_, index) => String(index + 1));
    const answerKeys = Object.keys(answers).sort((left, right) => Number(left) - Number(right));
    const evidenceVersion = Number(item?.evidenceVersion) || 0;
    const currentEvidence = evidenceVersion >= FULL_SCORE_EVIDENCE_VERSION &&
      item?.scoringBasis === HISTORICAL_SCORING_BASIS;
    const legacyEvidence = !currentEvidence &&
      evidenceVersion >= LEGACY_FULL_SCORE_EVIDENCE_VERSION &&
      item?.lawChecked === true && item?.lawBaseline === baseline;
    const offsetDayKey = dayKeyAtUtcOffset(item?.startedAt, item?.startedUtcOffsetMinutes);
    const storedDayMatches = validDateKey(item?.startedDayKey) &&
      (offsetDayKey ? offsetDayKey === item.startedDayKey : dayKey(item.startedAt) === item.startedDayKey);
    return Boolean(
      item &&
      (!callback || callback(item)) &&
      String(item.examId || "") &&
      item.sourceMode === "timed-answer-sheet" &&
      (currentEvidence || legacyEvidence) &&
      item.timed120 === true &&
      Number(item?.questionCount ?? questionCount) === questionCount &&
      Number.isInteger(elapsedMinutes) && elapsedMinutes >= 1 && elapsedMinutes <= durationMinutes &&
      answerKeys.length === questionCount &&
      answerKeys.every((key, index) => key === expectedKeys[index] &&
        Number.isInteger(answers[key]) && answers[key] >= 1 && answers[key] <= 4) &&
      Number.isFinite(startedAt) && Number.isFinite(completedAt) && completedAt >= startedAt &&
      storedDayMatches &&
      Number.isInteger(item.business) && item.business >= 0 && item.business <= FULL_SCORE_TARGET
    );
  }
  function summarizeOfficialProof(history, options = {}) {
    const evidence = (Array.isArray(history) ? history : [])
      .filter((item) => officialEvidenceQualifies(item, options))
      .sort((left, right) =>
        (Date.parse(left.completedAt || left.startedAt) || 0) -
        (Date.parse(right.completedAt || right.startedAt) || 0)
      );
    const freshInitial = evidence.filter((item) =>
      item.attemptType === "initial" && item.appUnseenAtStart === true
    );
    const latestByExam = new Map();
    freshInitial.forEach((item) => latestByExam.set(String(item.examId), item));
    const latestByDay = new Map();
    [...latestByExam.values()]
      .sort((left, right) =>
        (Date.parse(left.completedAt || left.startedAt) || 0) -
        (Date.parse(right.completedAt || right.startedAt) || 0)
      )
      .forEach((item) => latestByDay.set(item.startedDayKey, item));
    const distinctInitial = [...latestByDay.values()];
    const perfectInitial = distinctInitial.filter((item) => item.business === FULL_SCORE_TARGET);
    const initialReady = perfectInitial.length >= FULL_SCORE_REQUIRED_EXAMS;
    const proofCompletedAt = initialReady
      ? Date.parse(perfectInitial[FULL_SCORE_REQUIRED_EXAMS - 1].completedAt || "") || 0
      : 0;
    const latestEvidence = evidence.at(-1) || null;
    const currentMiss = Boolean(
      initialReady && latestEvidence &&
      (Date.parse(latestEvidence.completedAt || "") || 0) > proofCompletedAt &&
      latestEvidence.business < FULL_SCORE_TARGET
    );
    return {
      required: FULL_SCORE_REQUIRED_EXAMS,
      qualifying: evidence.length,
      qualifyingInitial: distinctInitial.length,
      latestInitial: distinctInitial.slice(-FULL_SCORE_REQUIRED_EXAMS),
      proofInitial: perfectInitial.slice(-FULL_SCORE_REQUIRED_EXAMS),
      perfect: Math.min(FULL_SCORE_REQUIRED_EXAMS, perfectInitial.length),
      initialReady,
      latestScore: latestEvidence ? Number(latestEvidence.business) : null,
      latestExamId: latestEvidence ? String(latestEvidence.examId || "") : "",
      currentMiss,
      ready: initialReady && !currentMiss
    };
  }
  function summarizeFullScore({ foundation, transfer, official, bankReady = true, transferTarget = 134 } = {}) {
    const base = {
      total: Math.max(0, Number(foundation?.total) || 0),
      contacted: Math.max(0, Number(foundation?.contacted) || 0),
      retained: Math.max(0, Number(foundation?.retained) || 0)
    };
    base.ready = base.total === 44 && base.retained === base.total;
    const transferQuestions = transfer?.questions || {};
    const transferTotal = Math.max(0, Number(transferQuestions.total) || 0);
    const transferDurable = Math.max(0, Number(transferQuestions.durable) || 0);
    const transferReady = Boolean(
      bankReady && transferTotal === transferTarget && transferDurable === transferTotal &&
      Number(transfer?.durableUnits) === 11
    );
    const officialSummary = official || {
      required: FULL_SCORE_REQUIRED_EXAMS,
      perfect: 0,
      initialReady: false,
      currentMiss: false,
      ready: false
    };
    const status = !bankReady
      ? "bank-unavailable"
      : !base.ready
        ? "foundation"
        : officialSummary.currentMiss
          ? "recovery"
          : !transferReady
            ? "transfer"
            : !officialSummary.ready
              ? "exam"
              : "ready";
    return {
      foundation: base,
      transfer,
      transferReady,
      official: officialSummary,
      status,
      ready: status === "ready"
    };
  }
  return {
    REVIEW_INTERVAL_DAYS,
    DURABLE_LEVEL,
    FULL_SCORE_REQUIRED_EXAMS,
    FULL_SCORE_EVIDENCE_VERSION,
    LEGACY_FULL_SCORE_EVIDENCE_VERSION,
    HISTORICAL_SCORING_BASIS,
    FULL_SCORE_TARGET,
    BUSINESS_UNIT_IDS,
    dayKey,
    choiceOrder,
    normalizeMasteryHistory,
    recordOutcome,
    stateFor,
    priorityFor,
    summarizeUnit,
    summarizeQuestions,
    summarizeOverall,
    officialEvidenceQualifies,
    summarizeOfficialProof,
    summarizeFullScore
  };
});
