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
  const MIN_TIMED_MOCK_MINUTES = 30;
  const MIN_RETENTION_RATE = 2 / 3;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
  const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  const SUBJECTS = Object.freeze([
    Object.freeze({ key: "business", label: "宅建業法", target: 18, questions: 20, weeklyMinutes: 180 }),
    Object.freeze({ key: "rights", label: "権利関係", target: 9, questions: 14, weeklyMinutes: 195 }),
    Object.freeze({ key: "restrictions", label: "法令上の制限", target: 7, questions: 8, weeklyMinutes: 150 }),
    Object.freeze({ key: "tax", label: "税・価格", target: 2, questions: 3, weeklyMinutes: 45 }),
    Object.freeze({ key: "other", label: "免除科目等", target: 4, questions: 5, weeklyMinutes: 30 })
  ]);
  const EXAM_PROFILES = Object.freeze({
    general: Object.freeze({ key: "general", label: "一般受験（50問・120分）", questions: 50, minutes: 120, subjectKeys: ["business", "rights", "restrictions", "tax", "other"] }),
    fiveExempt: Object.freeze({ key: "fiveExempt", label: "登録講習修了者（45問・110分）", questions: 45, minutes: 110, subjectKeys: ["business", "rights", "restrictions", "tax"] })
  });
  const CURRENT_LAW_CLUSTERS = Object.freeze(["management-disclosure", "signage", "important-matters", "land-regulation"]);
  const TARGET_TOTAL = 40;
  const QUESTION_TOTAL = 50;

  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function nonNegativeInteger(value) { return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null; }
  function validDayKey(value) {
    if (typeof value !== "string") return "";
    const match = value.match(DATE_KEY); if (!match) return "";
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    if (year < 1000 || month < 1 || month > 12 || day < 1) return "";
    return day <= new Date(Date.UTC(year, month, 0)).getUTCDate() ? value : "";
  }
  const JST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  // String day keys remain authoritative. Date inputs are normalized to the
  // examination timezone so travel or a browser timezone change cannot move a
  // Sunday mock or a retention day.
  function dayKey(value) {
    if (typeof value === "string") return validDayKey(value);
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const parts = Object.fromEntries(
      JST_DATE_FORMATTER.formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    return validDayKey(`${parts.year}-${parts.month}-${parts.day}`);
  }
  function ordinal(key) { const valid = validDayKey(key); if (!valid) return null; const p = valid.split("-").map(Number); return Math.trunc(Date.UTC(p[0], p[1] - 1, p[2]) / MS_PER_DAY); }
  function daysBetween(fromKey, toKey) { const from = ordinal(fromKey), to = ordinal(toKey); return from === null || to === null ? null : to - from; }
  function weekdayFor(key) { const value = ordinal(key); return value === null ? null : new Date(value * MS_PER_DAY).getUTCDay(); }
  function profileFor(value) { return EXAM_PROFILES[value] || EXAM_PROFILES.general; }
  function profileSubjects(profile) { return SUBJECTS.filter((subject) => profile.subjectKeys.includes(subject.key)); }
  function targetTotal(profile) { return profileSubjects(profile).reduce((sum, subject) => sum + subject.target, 0); }
  function ownObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function firstValue(input, keys) { for (const key of keys) if (own(input, key)) return input[key]; return undefined; }
  function normalizeSubject(subject, source) {
    const raw = ownObject(ownObject(source)[subject.key]);
    const totalRaw = firstValue(raw, ["total", "available", "questionCount"]), contactedRaw = firstValue(raw, ["contacted", "contact", "seen", "attempted"]), retainedRaw = firstValue(raw, ["retained", "correct", "durable"]);
    const total = totalRaw == null ? null : nonNegativeInteger(totalRaw), contacted = contactedRaw == null ? null : nonNegativeInteger(contactedRaw), retained = retainedRaw == null ? null : nonNegativeInteger(retainedRaw);
    const metricValid = (totalRaw == null || total !== null) && (contactedRaw == null || contacted !== null) && (retainedRaw == null || retained !== null) && (total === null || contacted === null || contacted <= total) && (contacted === null || retained === null || retained <= contacted);
    const measured = metricValid && contacted !== null && contacted > 0, contactComplete = measured && total !== null && contacted >= total;
    const retentionRate = measured && retained !== null ? retained / contacted : null, weak = measured && retentionRate !== null && retentionRate < MIN_RETENTION_RATE;
    return { ...subject, total, contacted, retained, metricValid, measured, contactComplete, retentionRate, weak, state: !metricValid ? "invalid" : !measured ? "unmeasured" : weak ? "weak" : !contactComplete ? "scanning" : "ready", remainingContact: total !== null && contacted !== null ? Math.max(0, total - contacted) : null };
  }
  function validIsoTimestamp(value) { return typeof value === "string" && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)) ? value : ""; }
  function normalizeTimedAttempt(entry, profile) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const total = nonNegativeInteger(entry.total ?? entry.score), count = nonNegativeInteger(entry.questionCount ?? entry.questions), formId = typeof entry.formId === "string" && entry.formId.trim() ? entry.formId.trim() : "";
    const completedAt = validIsoTimestamp(entry.completedAt), date = validDayKey(entry.dayKey ?? entry.dateKey);
    const elapsedMinutes = Number(entry.elapsedMinutes ?? (Number(entry.elapsedMs) / 60000));
    // A legacy or imported score cannot prove present-law readiness unless the
    // producing form explicitly asserts the 2026 baseline.
    if (
      total === null || count !== profile.questions || total > count ||
      entry.timed !== true || entry.currentLaw !== true || !formId || !completedAt || !date ||
      dayKey(new Date(completedAt)) !== date ||
      !Number.isFinite(elapsedMinutes) || elapsedMinutes < MIN_TIMED_MOCK_MINUTES || elapsedMinutes > profile.minutes
    ) return null;
    const rawSections = ownObject(entry.sections), scores = {}; let sum = 0;
    for (const subject of profileSubjects(profile)) {
      const value = nonNegativeInteger(rawSections[subject.key]);
      if (value === null || value > subject.questions) return null;
      scores[subject.key] = value; sum += value;
    }
    if (sum !== total) return null;
    const sectionTargetsMet = profileSubjects(profile).every((subject) => scores[subject.key] >= subject.target);
    return { total, count, timed: true, formId, completedAt, completedAtMs: Date.parse(completedAt), dateKey: date, elapsedMinutes, sections: scores, sectionsMeasurable: true, sectionTargetsMet };
  }
  function stabilityFrom(history, profile) {
    const raw = Array.isArray(history) ? history : [], attempts = raw.map((entry) => normalizeTimedAttempt(entry, profile)).filter(Boolean).sort((a, b) => a.completedAtMs - b.completedAtMs);
    const recent = attempts.slice(-3), ids = new Set(recent.map((entry) => entry.formId)), days = new Set(recent.map((entry) => entry.dateKey));
    const chronological = recent.length === 3 && recent[0].completedAtMs < recent[1].completedAtMs && recent[1].completedAtMs < recent[2].completedAtMs;
    const diverse = ids.size === 3 && days.size === 3;
    const passedRecentCount = recent.filter((entry) => entry.total >= targetTotal(profile) && entry.sectionTargetsMet).length;
    const stable = recent.length === 3 && chronological && diverse && passedRecentCount === 3;
    return { suppliedCount: raw.length, validTimedCount: attempts.length, validTimed50Count: profile.questions === 50 ? attempts.length : 0, recent, requiredAttempts: 3, passedRecentCount, distinctFormCount: ids.size, distinctDayCount: days.size, chronological, stable, status: attempts.length < 3 ? "unmeasured" : stable ? "stable" : "unstable" };
  }
  function normalizeGateAttempt(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const completedAt = validIsoTimestamp(entry.completedAt), dateKey = validDayKey(entry.dayKey ?? entry.dateKey), correct = entry.correct === true;
    const rawClusters = Array.isArray(entry.clusters) ? entry.clusters : [];
    const clusters = [...new Set(rawClusters.filter((value) => CURRENT_LAW_CLUSTERS.includes(value)))];
    if (!completedAt || !dateKey || dayKey(new Date(completedAt)) !== dateKey || !correct || !clusters.length) return null;
    return { completedAt, completedAtMs: Date.parse(completedAt), dateKey, clusters };
  }
  function currentLawGateFrom(input, todayKey) {
    const raw = ownObject(input), attempts = (Array.isArray(raw.attempts) ? raw.attempts : []).map(normalizeGateAttempt).filter(Boolean).sort((a, b) => a.completedAtMs - b.completedAtMs);
    const recent = attempts.slice(-2), coverage = new Set(recent.flatMap((attempt) => attempt.clusters));
    const latest = recent[recent.length - 1], ageDays = latest ? daysBetween(latest.dateKey, todayKey) : null;
    const recentEnough = ageDays !== null && ageDays >= 0 && ageDays <= 14;
    const consecutive = recent.length === 2 && recent[0].completedAtMs < recent[1].completedAtMs && recent[0].dateKey !== recent[1].dateKey;
    const covered = CURRENT_LAW_CLUSTERS.every((cluster) => coverage.has(cluster));
    const passed = consecutive && covered && recentEnough;
    return { suppliedCount: Array.isArray(raw.attempts) ? raw.attempts.length : 0, validAttemptCount: attempts.length, requiredAttempts: 2, recent, requiredClusters: [...CURRENT_LAW_CLUSTERS], coveredClusters: [...coverage], latestDayKey: latest ? latest.dateKey : "", ageDays, recentEnough, consecutive, covered, passed, status: attempts.length < 2 ? "unmeasured" : passed ? "passed" : "failed" };
  }
  function median(values) { const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2); return sorted.length ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : null; }
  function capacityFrom(history, todayKey) {
    const raw = Array.isArray(history) ? history : [], seen = new Map();
    raw.forEach((entry) => { if (!entry || typeof entry !== "object") return; const key = validDayKey(entry.dayKey ?? entry.dateKey), minutes = nonNegativeInteger(entry.minutes); if (key && minutes !== null) seen.set(key, minutes); });
    const start = ordinal(todayKey) - 6, values = [...seen.entries()].filter(([key]) => ordinal(key) >= start && ordinal(key) <= ordinal(todayKey)).map(([, minutes]) => minutes);
    const observedDays = values.length, medianMinutes = median(values), verified = observedDays >= 4 && medianMinutes !== null && medianMinutes >= 75;
    return { suppliedCount: raw.length, windowDays: 7, observedDays, requiredObservedDays: 4, minutes: values, medianMinutes, minimumMedianMinutes: 75, verified, status: observedDays < 4 ? "unverified" : medianMinutes < 75 ? "below-minimum" : "verified" };
  }
  function currentYearFreshnessFrom(input) {
    if (input === true) return { passed: true, status: "current" };
    const raw = ownObject(input);
    const passed = raw.current === true && raw.failClosed === false;
    return {
      passed,
      status: passed ? "current" : typeof raw.status === "string" && raw.status ? raw.status : "unverified"
    };
  }
  function rotatingTheme(todayKey) { const weekday = weekdayFor(todayKey); const lookup = [{ key: "mock", label: "本試験形式", mode: "mock" }, { key: "rights", label: "権利関係", mode: "drill" }, { key: "restrictions", label: "法令上の制限", mode: "drill" }, { key: "tax-other", label: "税・価格・免除科目等", mode: "drill" }, { key: "rights", label: "権利関係", mode: "drill" }, { key: "restrictions", label: "法令上の制限", mode: "drill" }, { key: "rights", label: "権利関係", mode: "drill" }]; return weekday === null ? null : lookup[weekday]; }
  function buildDailyPlan(todayKey, minutes, profile) {
    const theme = rotatingTheme(todayKey); if (!theme) return null;
    if (theme.mode === "mock") return { availableMinutes: minutes, weekday: weekdayFor(todayKey), mode: "choice", businessKnock: null, theme: { ...theme, minutes: profile.minutes, requiredTimedMinutes: profile.minutes, fitsAvailableMinutes: minutes >= profile.minutes }, choices: [{ key: "full-mock", label: `本試験${profile.questions}問・${profile.minutes}分（今日はこれだけ）`, minutes: profile.minutes, primary: true }, { key: "short-review", label: "短縮75〜90分（宅建業法20＋弱点8＋誤答回収）", minutes: Math.min(90, Math.max(75, minutes)), primary: false }], review: null, note: "日曜は本試験形式か短縮復習のどちらか一方を選ぶ。両方を必須にしない。" };
    const businessMinutes = Math.min(30, Math.floor(minutes / 3)), reviewMinutes = Math.max(10, Math.min(15, Math.floor(minutes / 6)));
    return { availableMinutes: minutes, weekday: weekdayFor(todayKey), mode: "standard", businessKnock: { count: 20, minutes: businessMinutes, label: "宅建業法ノック20" }, theme: { ...theme, minutes: Math.max(0, minutes - businessMinutes - reviewMinutes), requiredTimedMinutes: 0, fitsAvailableMinutes: true }, review: { minutes: reviewMinutes, label: "誤答・保留の即日回収" }, note: "宅建業法ノック20を固定し、曜日テーマは未測定→弱点→保留の順で出題。" };
  }
  function invalidResult(reason, todayKey, dailyAvailableMinutes, profile) { return { valid: false, reason, status: "invalid", onTrack: false, urgent: false, behind: false, todayKey: todayKey || "", dailyAvailableMinutes: dailyAvailableMinutes === null ? null : dailyAvailableMinutes, examDayKey: EXAM_DAY_KEY, lawBaselineDayKey: LAW_BASELINE_DAY_KEY, firstPassDeadlineKey: FIRST_PASS_DEADLINE_KEY, examProfile: profile, targets: { total: targetTotal(profile), questions: profile.questions, subjects: profileSubjects(profile).map((subject) => ({ ...subject })) } }; }
  function calculatePassReadiness(options = {}) {
    const profile = profileFor(options.examProfile), todayKey = validDayKey(options.todayKey ?? options.today), dailyAvailableMinutes = options.dailyAvailableMinutes == null ? DEFAULT_DAILY_MINUTES : nonNegativeInteger(options.dailyAvailableMinutes);
    if (!todayKey) return invalidResult("invalid-today", "", dailyAvailableMinutes, profile);
    if (dailyAvailableMinutes === null || dailyAvailableMinutes === 0) return invalidResult("invalid-daily-available-minutes", todayKey, dailyAvailableMinutes, profile);
    if (todayKey >= EXAM_DAY_KEY) return invalidResult("exam-window-closed", todayKey, dailyAvailableMinutes, profile);
    const activeSubjects = profileSubjects(profile), subjects = activeSubjects.map((subject) => normalizeSubject(subject, options.subjects)), invalidSubjects = subjects.filter((subject) => !subject.metricValid), unmeasuredSubjects = subjects.filter((subject) => subject.state === "unmeasured"), weakSubjects = subjects.filter((subject) => subject.weak);
    const knownRemainingContact = subjects.reduce((sum, subject) => sum + (subject.remainingContact ?? 0), 0), contactUnknown = subjects.some((subject) => subject.remainingContact === null), deadlineDelta = daysBetween(todayKey, FIRST_PASS_DEADLINE_KEY), firstPassWindowOpen = deadlineDelta !== null && deadlineDelta >= 0, firstPassDaysInclusive = firstPassWindowOpen ? deadlineDelta + 1 : 0, requiredContactsPerDay = !contactUnknown && firstPassDaysInclusive > 0 ? Math.ceil(knownRemainingContact / firstPassDaysInclusive) : null;
    const mockHistory = stabilityFrom(options.mockHistory, profile), officialHistory = stabilityFrom(options.officialHistory, profile), currentLawGate = currentLawGateFrom(options.currentLawGate, todayKey), capacity = capacityFrom(options.studyMinutesHistory, todayKey), currentYearFreshness = currentYearFreshnessFrom(options.currentYearFreshness);
    const timed50 = { mock: mockHistory, official: officialHistory, baseStable: mockHistory.stable, currentLawGatePassed: currentLawGate.passed, stable: mockHistory.stable && currentLawGate.passed, status: mockHistory.stable && currentLawGate.passed ? "stable" : mockHistory.validTimedCount < 3 || currentLawGate.status === "unmeasured" ? "unmeasured" : "unstable" };
    const deadlinePassedWithWork = !firstPassWindowOpen && (!contactUnknown ? knownRemainingContact > 0 : unmeasuredSubjects.length > 0);
    const behind = dailyAvailableMinutes < 75 || deadlinePassedWithWork || capacity.status === "below-minimum";
    const readinessBlocked = !timed50.stable || !capacity.verified || !currentYearFreshness.passed;
    const urgent = behind || readinessBlocked || (firstPassWindowOpen && knownRemainingContact > 0 && firstPassDaysInclusive <= 7) || weakSubjects.length > 0;
    const status = invalidSubjects.length ? "invalid" : unmeasuredSubjects.length ? "unmeasured" : behind ? "behind" : urgent ? "urgent" : "on-track";
    const reason = invalidSubjects.length ? "invalid-subject-metric" : deadlinePassedWithWork ? "first-pass-deadline-passed" : dailyAvailableMinutes < 75 ? "daily-time-below-minimum" : capacity.status === "below-minimum" ? "observed-capacity-below-minimum" : unmeasuredSubjects.length ? "subject-unmeasured" : weakSubjects.length ? "weak-retention" : !mockHistory.stable ? "timed-stability-unverified" : !currentLawGate.passed ? "current-law-gate-unverified" : !capacity.verified ? "observed-capacity-unverified" : !currentYearFreshness.passed ? "current-year-freshness-unverified" : "within-plan";
    return { valid: !invalidSubjects.length, reason, status, onTrack: status === "on-track", urgent, behind, todayKey, dailyAvailableMinutes, examDayKey: EXAM_DAY_KEY, lawBaselineDayKey: LAW_BASELINE_DAY_KEY, firstPassDeadlineKey: FIRST_PASS_DEADLINE_KEY, examProfile: profile, daysToExam: daysBetween(todayKey, EXAM_DAY_KEY), firstPass: { deadlineKey: FIRST_PASS_DEADLINE_KEY, daysRemainingInclusive: firstPassDaysInclusive, knownRemainingContact, contactUnknown, requiredContactsPerDay, deadlinePassedWithWork }, targets: { total: targetTotal(profile), questions: profile.questions, subjects: activeSubjects.map((subject) => ({ ...subject })) }, subjects, unmeasuredSubjectKeys: unmeasuredSubjects.map((subject) => subject.key), weakSubjectKeys: weakSubjects.map((subject) => subject.key), timed50, currentLawGate, capacity, currentYearFreshness, dailyPlan: buildDailyPlan(todayKey, dailyAvailableMinutes, profile), mockCadence: { startKey: todayKey <= FIRST_PASS_DEADLINE_KEY ? FIRST_PASS_DEADLINE_KEY : todayKey, frequency: "weekly", day: "Sunday", requiredMinutes: profile.minutes, stabilityRule: `異なるフォーム・JST日付の時間計測${profile.questions}問を3回連続で、合計${targetTotal(profile)}点以上かつ全科目目標以上。改正確認ゲート・当年資料の鮮度も必須。` } };
  }
  return { EXAM_DAY_KEY, LAW_BASELINE_DAY_KEY, FIRST_PASS_DEADLINE_KEY, DEFAULT_DAILY_MINUTES, MIN_TIMED_MOCK_MINUTES, MIN_RETENTION_RATE, SUBJECTS, EXAM_PROFILES, CURRENT_LAW_CLUSTERS, TARGET_TOTAL, QUESTION_TOTAL, validDayKey, dayKey, daysBetween, calculatePassReadiness };
});
