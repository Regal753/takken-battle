(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_PASS_READINESS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EXAM_DAY_KEY = "2026-10-18";
  const LAW_BASELINE_DAY_KEY = "2026-04-01";
  const FIRST_PASS_DEADLINE_KEY = "2026-08-31";
  const DEFAULT_DAILY_MINUTES = 90;
  // A subject at its score floor is not marked weak just because a three-question
  // section cannot express a 70% fraction (2/3 is the required tax score).
  const MIN_RETENTION_RATE = 2 / 3;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
  const SUBJECTS = Object.freeze([
    Object.freeze({ key: "business", label: "宅建業法", target: 18, questions: 20, weeklyMinutes: 180 }),
    Object.freeze({ key: "rights", label: "権利関係", target: 9, questions: 14, weeklyMinutes: 195 }),
    Object.freeze({ key: "restrictions", label: "法令上の制限", target: 7, questions: 8, weeklyMinutes: 150 }),
    Object.freeze({ key: "tax", label: "税・価格", target: 2, questions: 3, weeklyMinutes: 45 }),
    Object.freeze({ key: "other", label: "免除科目等", target: 4, questions: 5, weeklyMinutes: 30 })
  ]);
  const TARGET_TOTAL = SUBJECTS.reduce((sum, subject) => sum + subject.target, 0);
  const QUESTION_TOTAL = SUBJECTS.reduce((sum, subject) => sum + subject.questions, 0);

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function nonNegativeInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
  }

  function validDayKey(value) {
    if (typeof value !== "string") return "";
    const match = value.match(DATE_KEY);
    if (!match) return "";
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1000 || month < 1 || month > 12 || day < 1) return "";
    return day <= new Date(Date.UTC(year, month, 0)).getUTCDate() ? value : "";
  }

  function dayKey(value) {
    if (typeof value === "string") return validDayKey(value);
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return validDayKey([
      String(date.getFullYear()).padStart(4, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-"));
  }

  function ordinal(key) {
    const valid = validDayKey(key);
    if (!valid) return null;
    const parts = valid.split("-").map(Number);
    return Math.trunc(Date.UTC(parts[0], parts[1] - 1, parts[2]) / MS_PER_DAY);
  }

  function daysBetween(fromKey, toKey) {
    const from = ordinal(fromKey);
    const to = ordinal(toKey);
    return from === null || to === null ? null : to - from;
  }

  function weekdayFor(key) {
    const value = ordinal(key);
    if (value === null) return null;
    // Date#getUTCDay: Sunday is 0.
    return new Date(value * MS_PER_DAY).getUTCDay();
  }

  function subjectInput(source, key) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    const raw = source[key];
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }

  function firstValue(input, keys) {
    for (const key of keys) if (own(input, key)) return input[key];
    return undefined;
  }

  function normalizeSubject(subject, source) {
    const raw = subjectInput(source, subject.key);
    const totalRaw = firstValue(raw, ["total", "available", "questionCount"]);
    const contactedRaw = firstValue(raw, ["contacted", "contact", "seen", "attempted"]);
    const retainedRaw = firstValue(raw, ["retained", "correct", "durable"]);
    const total = totalRaw == null ? null : nonNegativeInteger(totalRaw);
    const contacted = contactedRaw == null ? null : nonNegativeInteger(contactedRaw);
    const retained = retainedRaw == null ? null : nonNegativeInteger(retainedRaw);
    const metricValid = (totalRaw == null || total !== null) &&
      (contactedRaw == null || contacted !== null) &&
      (retainedRaw == null || retained !== null) &&
      (total === null || contacted === null || contacted <= total) &&
      (contacted === null || retained === null || retained <= contacted);
    const measured = metricValid && contacted !== null && contacted > 0;
    const contactComplete = measured && total !== null && contacted >= total;
    const retentionRate = measured && retained !== null && contacted > 0 ? retained / contacted : null;
    const weak = measured && retentionRate !== null && retentionRate < MIN_RETENTION_RATE;
    const state = !metricValid ? "invalid" : !measured ? "unmeasured" : weak ? "weak" : !contactComplete ? "scanning" : "ready";
    return {
      ...subject,
      total,
      contacted,
      retained,
      metricValid,
      measured,
      contactComplete,
      retentionRate,
      weak,
      state,
      remainingContact: total !== null && contacted !== null ? Math.max(0, total - contacted) : null
    };
  }

  function normalizeTimedAttempt(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const total = nonNegativeInteger(entry.total ?? entry.score);
    const count = nonNegativeInteger(entry.questionCount ?? entry.questions ?? 50);
    const timed = entry.timed === true;
    if (total === null || count !== 50 || total > 50 || !timed) return null;
    const sections = entry.sections && typeof entry.sections === "object" && !Array.isArray(entry.sections)
      ? entry.sections : null;
    const sectionScores = {};
    let sectionValid = true;
    SUBJECTS.forEach((subject) => {
      const value = sections && own(sections, subject.key) ? nonNegativeInteger(sections[subject.key]) : null;
      if (value !== null && value > subject.questions) sectionValid = false;
      sectionScores[subject.key] = value;
    });
    if (!sectionValid) return null;
    const date = entry.dayKey == null && entry.dateKey == null ? "" : validDayKey(entry.dayKey ?? entry.dateKey);
    if ((entry.dayKey || entry.dateKey) && !date) return null;
    const sectionsMeasurable = SUBJECTS.every((subject) => sectionScores[subject.key] !== null);
    const sectionTargetsMet = sectionsMeasurable && SUBJECTS.every(
      (subject) => sectionScores[subject.key] >= subject.target
    );
    return { total, count, timed, dateKey: date, sections: sectionScores, sectionsMeasurable, sectionTargetsMet };
  }

  function stabilityFrom(history) {
    const raw = Array.isArray(history) ? history : [];
    const attempts = raw.map(normalizeTimedAttempt).filter(Boolean);
    const recent = attempts.slice(-3);
    const stableAttempts = recent.filter((attempt) => attempt.total >= TARGET_TOTAL && attempt.sectionTargetsMet);
    const status = recent.length < 3 ? "unmeasured" : stableAttempts.length === 3 ? "stable" : "unstable";
    return {
      suppliedCount: raw.length,
      validTimed50Count: attempts.length,
      recent,
      requiredAttempts: 3,
      passedRecentCount: stableAttempts.length,
      status,
      stable: status === "stable"
    };
  }

  function rotatingTheme(todayKey) {
    const weekday = weekdayFor(todayKey);
    const lookup = [
      { key: "mock", label: "50問通し（時間計測）", mode: "mock" },
      { key: "rights", label: "権利関係", mode: "drill" },
      { key: "restrictions", label: "法令上の制限", mode: "drill" },
      { key: "tax-other", label: "税・価格・免除科目等", mode: "drill" },
      { key: "rights", label: "権利関係", mode: "drill" },
      { key: "restrictions", label: "法令上の制限", mode: "drill" },
      { key: "rights", label: "権利関係", mode: "drill" }
    ];
    return weekday === null ? null : lookup[weekday];
  }

  function buildDailyPlan(todayKey, minutes) {
    const theme = rotatingTheme(todayKey);
    if (!theme) return null;
    const mock = theme.mode === "mock";
    const businessMinutes = mock ? Math.min(25, Math.floor(minutes / 3)) : Math.min(30, Math.floor(minutes / 3));
    const reviewMinutes = Math.max(10, Math.min(15, Math.floor(minutes / 6)));
    const themeMinutes = Math.max(0, minutes - businessMinutes - reviewMinutes);
    return {
      availableMinutes: minutes,
      weekday: weekdayFor(todayKey),
      businessKnock: { count: 20, minutes: businessMinutes, label: "宅建業法ノック20" },
      theme: {
        ...theme,
        minutes: themeMinutes,
        requiredTimedMinutes: mock ? 120 : 0,
        fitsAvailableMinutes: !mock || minutes >= 120
      },
      review: { minutes: reviewMinutes, label: "誤答・保留の即日回収" },
      note: mock && minutes < 120
        ? "日曜の50問通しは120分を別枠で確保。今日の枠では宅建業法ノック20と復習を先行。"
        : "宅建業法ノック20を固定し、曜日テーマは未測定→弱点→保留の順で出題。"
    };
  }

  function invalidResult(reason, todayKey, dailyAvailableMinutes) {
    return {
      valid: false,
      reason,
      status: "invalid",
      onTrack: false,
      urgent: false,
      behind: false,
      todayKey: todayKey || "",
      dailyAvailableMinutes: dailyAvailableMinutes === null ? null : dailyAvailableMinutes,
      examDayKey: EXAM_DAY_KEY,
      lawBaselineDayKey: LAW_BASELINE_DAY_KEY,
      firstPassDeadlineKey: FIRST_PASS_DEADLINE_KEY,
      targets: { total: TARGET_TOTAL, questions: QUESTION_TOTAL, subjects: SUBJECTS.map((subject) => ({ ...subject })) }
    };
  }

  /**
   * Computes a conservative, display-ready readiness snapshot. Unknown subject
   * metrics are deliberately reported as `unmeasured`, never treated as weak
   * or complete. Timed stability requires three valid current-law internal
   * 50-question attempts meeting the total and every section target;
   * historical official scores are retained as display-only context.
   */
  function calculatePassReadiness(options = {}) {
    const todayKey = dayKey(options.todayKey ?? options.today);
    const dailyAvailableMinutes = options.dailyAvailableMinutes == null
      ? DEFAULT_DAILY_MINUTES : nonNegativeInteger(options.dailyAvailableMinutes);
    if (!todayKey) return invalidResult("invalid-today", "", dailyAvailableMinutes);
    if (dailyAvailableMinutes === null || dailyAvailableMinutes === 0) {
      return invalidResult("invalid-daily-available-minutes", todayKey, dailyAvailableMinutes);
    }
    if (todayKey >= EXAM_DAY_KEY) return invalidResult("exam-window-closed", todayKey, dailyAvailableMinutes);

    const subjects = SUBJECTS.map((subject) => normalizeSubject(subject, options.subjects));
    const invalidSubjects = subjects.filter((subject) => !subject.metricValid);
    const unmeasuredSubjects = subjects.filter((subject) => subject.state === "unmeasured");
    const weakSubjects = subjects.filter((subject) => subject.weak);
    const knownRemainingContact = subjects.reduce((sum, subject) => sum + (subject.remainingContact ?? 0), 0);
    const contactUnknown = subjects.some((subject) => subject.remainingContact === null);
    const daysToFirstPassDeadline = daysBetween(todayKey, FIRST_PASS_DEADLINE_KEY);
    const firstPassWindowOpen = daysToFirstPassDeadline !== null && daysToFirstPassDeadline >= 0;
    const firstPassDaysInclusive = firstPassWindowOpen ? daysToFirstPassDeadline + 1 : 0;
    const requiredContactsPerDay = !contactUnknown && firstPassDaysInclusive > 0
      ? Math.ceil(knownRemainingContact / firstPassDaysInclusive) : null;
    const mockHistory = stabilityFrom(options.mockHistory);
    const officialHistory = stabilityFrom(options.officialHistory);
    const timed50 = {
      mock: mockHistory,
      official: officialHistory,
      // Historical official editions remain useful score context, but their
      // original answer keys cannot establish 2026-current-law stability.
      stable: mockHistory.stable,
      status: mockHistory.stable
        ? "stable"
        : mockHistory.validTimed50Count < 3 ? "unmeasured" : "unstable"
    };
    const deadlinePassedWithWork = !firstPassWindowOpen && (!contactUnknown ? knownRemainingContact > 0 : unmeasuredSubjects.length > 0);
    const behind = dailyAvailableMinutes < 75 || deadlinePassedWithWork;
    const urgent = behind || (firstPassWindowOpen && knownRemainingContact > 0 && firstPassDaysInclusive <= 7) || weakSubjects.length > 0;
    const status = invalidSubjects.length ? "invalid"
      : unmeasuredSubjects.length ? "unmeasured"
      : behind ? "behind"
      : urgent ? "urgent"
      : "on-track";
    const onTrack = status === "on-track";
    const dailyPlan = buildDailyPlan(todayKey, dailyAvailableMinutes);
    return {
      valid: invalidSubjects.length === 0,
      reason: invalidSubjects.length ? "invalid-subject-metric"
        : deadlinePassedWithWork ? "first-pass-deadline-passed"
        : dailyAvailableMinutes < 75 ? "daily-time-below-minimum"
        : unmeasuredSubjects.length ? "subject-unmeasured"
        : weakSubjects.length ? "weak-retention"
        : "within-plan",
      status,
      onTrack,
      urgent,
      behind,
      todayKey,
      dailyAvailableMinutes,
      examDayKey: EXAM_DAY_KEY,
      lawBaselineDayKey: LAW_BASELINE_DAY_KEY,
      firstPassDeadlineKey: FIRST_PASS_DEADLINE_KEY,
      daysToExam: daysBetween(todayKey, EXAM_DAY_KEY),
      firstPass: {
        deadlineKey: FIRST_PASS_DEADLINE_KEY,
        daysRemainingInclusive: firstPassDaysInclusive,
        knownRemainingContact,
        contactUnknown,
        requiredContactsPerDay,
        deadlinePassedWithWork
      },
      targets: { total: TARGET_TOTAL, questions: QUESTION_TOTAL, subjects: SUBJECTS.map((subject) => ({ ...subject })) },
      subjects,
      unmeasuredSubjectKeys: unmeasuredSubjects.map((subject) => subject.key),
      weakSubjectKeys: weakSubjects.map((subject) => subject.key),
      timed50,
      dailyPlan,
      mockCadence: {
        startKey: todayKey <= FIRST_PASS_DEADLINE_KEY ? FIRST_PASS_DEADLINE_KEY : todayKey,
        frequency: "weekly",
        day: "Sunday",
        requiredMinutes: 120,
        stabilityRule: "直近の時間計測50問を3回連続で、合計40点以上かつ全科目目標以上"
      }
    };
  }

  return {
    EXAM_DAY_KEY,
    LAW_BASELINE_DAY_KEY,
    FIRST_PASS_DEADLINE_KEY,
    DEFAULT_DAILY_MINUTES,
    MIN_RETENTION_RATE,
    SUBJECTS,
    TARGET_TOTAL,
    QUESTION_TOTAL,
    validDayKey,
    dayKey,
    daysBetween,
    calculatePassReadiness
  };
});
