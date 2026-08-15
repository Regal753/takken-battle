(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_BUSINESS_PACE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EXAM_DAY_KEY = "2026-10-18";
  const LAST_SUCCESS_DAY_KEY = "2026-10-17";
  const REVIEW_INTERVAL_DAYS = Object.freeze([1, 3, 7, 14, 30]);
  const REVIEW_LAG_DAYS = REVIEW_INTERVAL_DAYS.reduce((sum, days) => sum + days, 0);
  const DEFAULT_PLANNED_DAILY_NEW = 10;
  const MINIMUM_OFFICIAL_RESERVE = 3;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

  function validDayKey(value) {
    if (typeof value !== "string") return "";
    const match = value.match(DATE_KEY_PATTERN);
    if (!match) return "";
    const year = Number(match[1]);
    const month = Number(match[2]);
    const date = Number(match[3]);
    // Keep Date.UTC's special handling of years 0..99 outside the accepted
    // domain; the exam scheduler only handles four-digit modern calendar years.
    if (year < 1000 || month < 1 || month > 12 || date < 1) return "";
    const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return date <= lastDate ? value : "";
  }

  function dayKey(value) {
    if (typeof value === "string" && DATE_KEY_PATTERN.test(value)) return validDayKey(value);
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return validDayKey([
      String(date.getFullYear()).padStart(4, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-"));
  }

  function ordinalFor(key) {
    const valid = validDayKey(key);
    if (!valid) return null;
    const [year, month, date] = valid.split("-").map(Number);
    return Math.trunc(Date.UTC(year, month - 1, date) / MS_PER_DAY);
  }

  function keyForOrdinal(ordinal) {
    if (!Number.isInteger(ordinal)) return "";
    const date = new Date(ordinal * MS_PER_DAY);
    if (!Number.isFinite(date.getTime())) return "";
    return [
      String(date.getUTCFullYear()).padStart(4, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function addDays(key, days) {
    const ordinal = ordinalFor(key);
    return ordinal === null || !Number.isInteger(days) ? "" : keyForOrdinal(ordinal + days);
  }

  function daysBetween(fromKey, toKey) {
    const from = ordinalFor(fromKey);
    const to = ordinalFor(toKey);
    return from === null || to === null ? null : to - from;
  }

  function nonNegativeInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0
      ? value
      : null;
  }

  function normalizeExistingLoad(source) {
    const input = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    const countKeys = ["retry", "due", "overdue", "learning", "retained", "durable"];
    const counts = {};
    let valid = true;
    countKeys.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(input, key)) {
        counts[key] = null;
        return;
      }
      counts[key] = nonNegativeInteger(input[key]);
      if (counts[key] === null) valid = false;
    });
    // `due` is the mastery module's inclusive bucket (overdue questions are a
    // display-only subset), so adding `overdue` again would double-count work.
    const actionableKeys = ["retry", "due"];
    const actionableComplete = actionableKeys.every((key) => counts[key] !== null);
    const knownActionable = actionableKeys.reduce(
      (sum, key) => sum + (counts[key] === null ? 0 : counts[key]),
      0
    );
    const nextDueKey = input.nextDueKey == null || input.nextDueKey === ""
      ? ""
      : validDayKey(input.nextDueKey);
    const projectedFinalRecallKey = input.projectedFinalRecallKey == null || input.projectedFinalRecallKey === ""
      ? ""
      : validDayKey(input.projectedFinalRecallKey);
    if (input.nextDueKey && !nextDueKey) valid = false;
    if (input.projectedFinalRecallKey && !projectedFinalRecallKey) valid = false;
    return {
      valid,
      ...counts,
      knownActionable,
      actionableComplete,
      nextDueKey,
      projectedFinalRecallKey
    };
  }

  function paceFailure(reason, todayKey, untouched, plannedDailyNew, existingLoad) {
    const latestFirstExposureKey = addDays(LAST_SUCCESS_DAY_KEY, -REVIEW_LAG_DAYS);
    return {
      valid: false,
      scope: "untouched-first-exposure",
      reason,
      status: "impossible",
      onTrack: false,
      urgent: false,
      impossible: true,
      examDayKey: EXAM_DAY_KEY,
      lastSuccessDayKey: LAST_SUCCESS_DAY_KEY,
      reviewIntervals: [...REVIEW_INTERVAL_DAYS],
      reviewLagDays: REVIEW_LAG_DAYS,
      latestFirstExposureKey,
      todayKey: todayKey || "",
      untouched,
      plannedDailyNew,
      calendarDaysUntilLatest: null,
      remainingSafeDays: 0,
      remainingSafeDaysIncludesTodayAndLatest: true,
      requiredPerDay: null,
      todayRequired: null,
      currentPlanShortfallPerDay: null,
      projectedLastFirstExposureKey: "",
      projectedFinalRecallKey: "",
      catchUpProjectedFinalRecallKey: "",
      existingLoad,
      todayLoad: {
        firstExposure: null,
        knownExistingActionable: existingLoad.knownActionable,
        knownTotal: null,
        complete: false
      }
    };
  }

  /**
   * Returns the pace required for every untouched question to receive its first
   * successful exposure early enough for the 1/3/7/14/30-day chain to finish on
   * the day before the exam. `remainingSafeDays` is inclusive of both today and
   * `latestFirstExposureKey`; `calendarDaysUntilLatest` is the exclusive gap.
   */
  function calculateBusinessPace(options = {}) {
    const todayKey = dayKey(options.todayKey ?? options.today);
    const untouched = nonNegativeInteger(options.untouched);
    const plannedDailyNew = options.plannedDailyNew == null
      ? DEFAULT_PLANNED_DAILY_NEW
      : nonNegativeInteger(options.plannedDailyNew);
    const existingLoad = normalizeExistingLoad(options.existingLoad);
    if (!todayKey) return paceFailure("invalid-today", "", untouched, plannedDailyNew, existingLoad);
    if (untouched === null) return paceFailure("invalid-untouched", todayKey, null, plannedDailyNew, existingLoad);
    if (plannedDailyNew === null) {
      return paceFailure("invalid-planned-daily-new", todayKey, untouched, null, existingLoad);
    }
    if (todayKey > LAST_SUCCESS_DAY_KEY) {
      return paceFailure("exam-window-closed", todayKey, untouched, plannedDailyNew, existingLoad);
    }

    const latestFirstExposureKey = addDays(LAST_SUCCESS_DAY_KEY, -REVIEW_LAG_DAYS);
    const calendarDaysUntilLatest = daysBetween(todayKey, latestFirstExposureKey);
    const remainingSafeDays = Math.max(0, calendarDaysUntilLatest + 1);
    const timelineFeasible = untouched === 0 || remainingSafeDays > 0;
    if (!timelineFeasible) {
      return {
        ...paceFailure("first-exposure-deadline-passed", todayKey, untouched, plannedDailyNew, existingLoad),
        calendarDaysUntilLatest,
        remainingSafeDays
      };
    }

    const requiredPerDay = untouched === 0 ? 0 : Math.ceil(untouched / remainingSafeDays);
    const todayRequired = Math.min(untouched, requiredPerDay);
    const plannedDaysNeeded = untouched === 0
      ? 0
      : plannedDailyNew > 0 ? Math.ceil(untouched / plannedDailyNew) : null;
    const projectedLastFirstExposureKey = plannedDaysNeeded === null
      ? ""
      : plannedDaysNeeded === 0 ? "" : addDays(todayKey, plannedDaysNeeded - 1);
    const projectedFinalRecallKey = projectedLastFirstExposureKey
      ? addDays(projectedLastFirstExposureKey, REVIEW_LAG_DAYS)
      : "";
    const catchUpDaysNeeded = untouched === 0 ? 0 : Math.ceil(untouched / requiredPerDay);
    const catchUpLastFirstExposureKey = catchUpDaysNeeded === 0
      ? ""
      : addDays(todayKey, catchUpDaysNeeded - 1);
    const catchUpProjectedFinalRecallKey = catchUpLastFirstExposureKey
      ? addDays(catchUpLastFirstExposureKey, REVIEW_LAG_DAYS)
      : "";
    const currentPlanOnTrack = untouched === 0 || Boolean(
      projectedFinalRecallKey && projectedFinalRecallKey <= LAST_SUCCESS_DAY_KEY
    );
    const impossible = false;
    const urgent = !currentPlanOnTrack || (untouched > 0 && remainingSafeDays === 1);
    const onTrack = !urgent;
    const todayLoadComplete = existingLoad.actionableComplete;
    const knownTotal = todayRequired + existingLoad.knownActionable;

    return {
      valid: true,
      scope: "untouched-first-exposure",
      reason: !currentPlanOnTrack
        ? "daily-plan-below-required"
        : urgent ? "last-safe-first-exposure-day" : "within-first-exposure-window",
      status: urgent ? "urgent" : "on-track",
      onTrack,
      urgent,
      impossible,
      examDayKey: EXAM_DAY_KEY,
      lastSuccessDayKey: LAST_SUCCESS_DAY_KEY,
      reviewIntervals: [...REVIEW_INTERVAL_DAYS],
      reviewLagDays: REVIEW_LAG_DAYS,
      latestFirstExposureKey,
      todayKey,
      untouched,
      plannedDailyNew,
      calendarDaysUntilLatest,
      remainingSafeDays,
      remainingSafeDaysIncludesTodayAndLatest: true,
      requiredPerDay,
      todayRequired,
      currentPlanShortfallPerDay: Math.max(0, requiredPerDay - plannedDailyNew),
      projectedLastFirstExposureKey,
      projectedFinalRecallKey,
      catchUpProjectedFinalRecallKey,
      existingLoad,
      todayLoad: {
        firstExposure: todayRequired,
        knownExistingActionable: existingLoad.knownActionable,
        knownTotal,
        complete: todayLoadComplete
      }
    };
  }

  /**
   * Controls consumption of unseen official exams. A new initial attempt is
   * allowed only when it would still leave at least `minimumReserve` unseen.
   */
  function calculateOfficialReserve(options = {}) {
    const totalExams = nonNegativeInteger(options.totalExams);
    const exposedExams = nonNegativeInteger(options.exposedExams);
    const minimumReserve = options.minimumReserve == null
      ? MINIMUM_OFFICIAL_RESERVE
      : nonNegativeInteger(options.minimumReserve);
    const valid = totalExams !== null && exposedExams !== null && minimumReserve !== null &&
      exposedExams <= totalExams;
    if (!valid) {
      return {
        valid: false,
        status: "invalid",
        totalExams,
        exposedExams,
        unseenExams: null,
        minimumReserve,
        reserveSatisfied: false,
        safeStartsRemaining: 0,
        canStartInitial: false,
        hypotheticalUnseenAfterNext: null
      };
    }
    const unseenExams = totalExams - exposedExams;
    const safeStartsRemaining = Math.max(0, unseenExams - minimumReserve);
    const canStartInitial = safeStartsRemaining > 0;
    const reserveSatisfied = unseenExams >= minimumReserve;
    return {
      valid: true,
      status: unseenExams > minimumReserve
        ? "safe"
        : unseenExams === minimumReserve ? "hold" : "depleted",
      totalExams,
      exposedExams,
      unseenExams,
      minimumReserve,
      reserveSatisfied,
      safeStartsRemaining,
      canStartInitial,
      hypotheticalUnseenAfterNext: unseenExams > 0 ? unseenExams - 1 : 0
    };
  }

  return {
    EXAM_DAY_KEY,
    LAST_SUCCESS_DAY_KEY,
    REVIEW_INTERVAL_DAYS,
    REVIEW_LAG_DAYS,
    DEFAULT_PLANNED_DAILY_NEW,
    MINIMUM_OFFICIAL_RESERVE,
    validDayKey,
    dayKey,
    addDays,
    daysBetween,
    calculateBusinessPace,
    calculateOfficialReserve
  };
});
