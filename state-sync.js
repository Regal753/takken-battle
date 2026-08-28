"use strict";

(function exposeStateSync(root) {
  const MISSING = Symbol("missing");
  const COUNTER_KEYS = new Set([
    "attempts", "correct", "wrong", "step", "correctAttempts", "sessionsCompleted",
    "answers", "weakAdded", "cutCheckAttempts", "cutCheckCorrect", "cutCheckWrong",
    "victories", "totalXp", "crystalSpent", "chestsOpened", "sourceEvents"
  ]);
  const SET_ARRAY_KEYS = new Set([
    "correctDayKeys", "clearDayKeys", "understandingDayKeys", "confidentDayKeys",
    "clearAtHistory", "masteredIds", "retryIds", "reviewTargets", "sessionIds"
  ]);
  const RECORD_ARRAY_KEYS = new Set(["mockHistory", "officialExamHistory"]);
  const PRACTICAL_SESSION_FIELDS = [
    "version", "bankId", "bankVersion", "presentationKey", "presentationOverrides", "planMode", "knockPreset", "stage", "scope", "unitId",
    "sessionSize", "sessionIds", "queue", "position", "preAnswerConfidence", "currentAttempt", "retryIds",
    "sessionStartedAt", "completedAt"
  ];

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    if (value === undefined || value === MISSING) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!isObject(value)) return value;
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])])
    );
  }

  function equal(left, right) {
    if (left === MISSING || right === MISSING) return left === right;
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
  }

  function parsedTime(value) {
    const timestamp = Date.parse(value || "");
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
  }

  function validTimestamp(value) {
    return Number.isFinite(Date.parse(value || "")) ? String(value) : "";
  }

  function latestTimestamp(...values) {
    return values
      .map(validTimestamp)
      .filter(Boolean)
      .sort((left, right) => parsedTime(right) - parsedTime(left))[0] || "";
  }

  function earliestTimestamp(...values) {
    return values
      .map(validTimestamp)
      .filter(Boolean)
      .sort((left, right) => parsedTime(left) - parsedTime(right))[0] || "";
  }

  function normalizedClock(state) {
    const meta = isObject(state?.syncMeta) ? state.syncMeta : {};
    const entries = Object.entries(isObject(meta.clock) ? meta.clock : {})
      .map(([writerId, revision]) => [
        String(writerId).slice(0, 180),
        Math.max(0, Math.trunc(Number(revision) || 0))
      ])
      .filter(([writerId, revision]) => writerId && revision > 0);
    const legacyWriter = String(meta.writerId || state?.writerId || "").slice(0, 180);
    const legacyRevision = Math.max(0, Math.trunc(Number(meta.revision ?? state?.revision) || 0));
    if (legacyWriter && legacyRevision > 0) entries.push([legacyWriter, legacyRevision]);
    const merged = new Map();
    entries.forEach(([writerId, revision]) => {
      merged.set(writerId, Math.max(revision, merged.get(writerId) || 0));
    });
    return Object.fromEntries(
      [...merged.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    );
  }

  function mergeClocks(...states) {
    const merged = new Map();
    states.forEach((state) => {
      Object.entries(normalizedClock(state)).forEach(([writerId, revision]) => {
        merged.set(writerId, Math.max(Number(revision) || 0, merged.get(writerId) || 0));
      });
    });
    return Object.fromEntries(
      [...merged.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    );
  }

  function clockStrictlyDominates(left, right) {
    const leftEntries = Object.entries(left || {});
    const rightEntries = Object.entries(right || {});
    if (!leftEntries.length || !rightEntries.length) return false;
    const covers = rightEntries.every(([writerId, revision]) =>
      (Number(left?.[writerId]) || 0) >= (Number(revision) || 0)
    );
    if (!covers) return false;
    return leftEntries.some(([writerId, revision]) =>
      (Number(revision) || 0) > (Number(right?.[writerId]) || 0)
    );
  }

  function mergeMonotonicCounter(base, local, remote, context = {}) {
    const baseValue = Math.max(0, Number(base) || 0);
    const localValue = Math.max(0, Number(local) || 0);
    const remoteValue = Math.max(0, Number(remote) || 0);
    if (localValue === baseValue) return remoteValue;
    if (remoteValue === baseValue) return localValue;
    if (localValue === remoteValue && context.clocksEqual) return localValue;
    if (context.localDominatesRemote) return localValue;
    if (context.remoteDominatesLocal) return remoteValue;
    return baseValue +
      Math.max(0, localValue - baseValue) +
      Math.max(0, remoteValue - baseValue);
  }

  function validDayKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
  }

  function localDayKey(value) {
    const date = new Date(value || "");
    if (!Number.isFinite(date.getTime())) return "";
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function syncStamp(state) {
    const meta = isObject(state?.syncMeta) ? state.syncMeta : {};
    return {
      generation: Math.max(0, Math.trunc(Number(meta.generation) || 0)),
      revision: Math.max(0, Math.trunc(Number(meta.revision ?? state?.revision) || 0)),
      updatedAt: validTimestamp(meta.updatedAt || state?.updatedAt),
      writerId: String(meta.writerId || state?.writerId || ""),
      clock: normalizedClock(state)
    };
  }

  function compareSync(left, right) {
    const leftStamp = syncStamp(left);
    const rightStamp = syncStamp(right);
    let winner = "equal";
    let reason = "equal";
    if (leftStamp.generation !== rightStamp.generation) {
      winner = leftStamp.generation > rightStamp.generation ? "left" : "right";
      reason = "generation";
    } else if (leftStamp.revision !== rightStamp.revision) {
      winner = leftStamp.revision > rightStamp.revision ? "left" : "right";
      reason = "revision";
    } else if (parsedTime(leftStamp.updatedAt) !== parsedTime(rightStamp.updatedAt)) {
      winner = parsedTime(leftStamp.updatedAt) > parsedTime(rightStamp.updatedAt) ? "left" : "right";
      reason = "updatedAt";
    }
    return { left: leftStamp, right: rightStamp, winner, reason };
  }

  function preferredSide(local, remote) {
    const comparison = compareSync(local, remote);
    return comparison.winner === "right" ? "remote" : "local";
  }

  function unionPrimitiveArrays(...arrays) {
    return [...new Set(arrays.flatMap((items) => Array.isArray(items) ? items : []))];
  }

  function recordKey(item) {
    if (!isObject(item)) return JSON.stringify(canonical(item));
    if (item.recordId) return `record:${item.recordId}`;
    if (item.examId && item.startedAt) return `exam:${item.examId}:${item.startedAt}`;
    if (item.formId && (item.startedAt || item.completedAt)) {
      return `form:${item.formId}:${item.startedAt || item.completedAt}`;
    }
    if (item.sessionId || item.id) return `id:${item.sessionId || item.id}`;
    return `value:${JSON.stringify(canonical(item))}`;
  }

  function recordTimestamp(item) {
    return latestTimestamp(item?.updatedAt, item?.completedAt, item?.savedAt, item?.startedAt);
  }

  function mergeRecordArrays(base = [], local = [], remote = [], context = {}) {
    const baseRecords = new Map((Array.isArray(base) ? base : []).map((item) => [recordKey(item), item]));
    const localRecords = new Map((Array.isArray(local) ? local : []).map((item) => [recordKey(item), item]));
    const remoteRecords = new Map((Array.isArray(remote) ? remote : []).map((item) => [recordKey(item), item]));
    const keys = new Set([...baseRecords.keys(), ...localRecords.keys(), ...remoteRecords.keys()]);
    const result = [];
    keys.forEach((key) => {
      const baseItem = baseRecords.has(key) ? baseRecords.get(key) : MISSING;
      const localItem = localRecords.has(key) ? localRecords.get(key) : MISSING;
      const remoteItem = remoteRecords.has(key) ? remoteRecords.get(key) : MISSING;
      if (baseItem !== MISSING && localItem === MISSING && remoteItem === MISSING) {
        result.push(clone(baseItem));
        return;
      }
      const merged = mergeValue(baseItem, localItem, remoteItem, ["record"], context);
      if (merged !== MISSING) result.push(merged);
    });
    return result.sort((left, right) => {
      const delta = parsedTime(recordTimestamp(left)) - parsedTime(recordTimestamp(right));
      return delta || recordKey(left).localeCompare(recordKey(right));
    });
  }

  function mergeValue(base, local, remote, path = [], context = {}) {
    if (equal(local, base)) return remote === MISSING ? MISSING : clone(remote);
    if (equal(remote, base)) return local === MISSING ? MISSING : clone(local);
    if (local === MISSING) return remote === MISSING ? MISSING : clone(remote);
    if (remote === MISSING) return clone(local);

    const key = path[path.length - 1] || "";
    if (
      COUNTER_KEYS.has(key) &&
      [local, remote].every((value) => Number.isFinite(Number(value)))
    ) {
      if (equal(local, remote) && context.clocksEqual) return clone(local);
      const additive = key !== "weakAdded" &&
        (key !== "answers" || path.includes("centralProgress"));
      return additive
        ? mergeMonotonicCounter(base, local, remote, context)
        : Math.max(0, Number(local), Number(remote));
    }

    if (equal(local, remote)) return clone(local);

    if (typeof local === "string" && typeof remote === "string") {
      if (/^first.*At$/i.test(key)) return earliestTimestamp(local, remote) || local || remote;
      if (/At$/.test(key)) return latestTimestamp(local, remote) || local || remote;
      if (/DayKey$|Date$/.test(key)) return local >= remote ? local : remote;
    }

    if (Array.isArray(local) && Array.isArray(remote)) {
      if (SET_ARRAY_KEYS.has(key)) return unionPrimitiveArrays(remote, local).sort();
      if (RECORD_ARRAY_KEYS.has(key)) {
        return mergeRecordArrays(
          Array.isArray(base) ? base : [],
          local,
          remote,
          context
        );
      }
      return clone(context.preferred === "remote" ? remote : local);
    }

    if (isObject(local) && isObject(remote)) {
      const baseObject = isObject(base) ? base : {};
      const keys = new Set([
        ...Object.keys(baseObject),
        ...Object.keys(local),
        ...Object.keys(remote)
      ]);
      const result = {};
      keys.forEach((childKey) => {
        const merged = mergeValue(
          own(baseObject, childKey) ? baseObject[childKey] : MISSING,
          own(local, childKey) ? local[childKey] : MISSING,
          own(remote, childKey) ? remote[childKey] : MISSING,
          [...path, childKey],
          context
        );
        if (merged !== MISSING) result[childKey] = merged;
      });
      return result;
    }

    return clone(context.preferred === "remote" ? remote : local);
  }

  function mergeOfficialExamExposureLedgers(...ledgers) {
    const result = {};
    const ids = new Set(
      ledgers.flatMap((ledger) => isObject(ledger) ? Object.keys(ledger) : [])
    );
    ids.forEach((examId) => {
      const candidates = ledgers
        .map((ledger) => isObject(ledger) ? ledger[examId] : null)
        .filter(isObject);
      if (!candidates.length) return;
      const oldest = candidates
        .filter((item) => validTimestamp(item.firstOpenedAt))
        .sort((left, right) => parsedTime(left.firstOpenedAt) - parsedTime(right.firstOpenedAt))[0];
      const fallback = candidates[candidates.length - 1];
      result[examId] = clone(oldest || fallback);
      if (oldest) {
        result[examId].firstOpenedAt = oldest.firstOpenedAt;
        if (oldest.firstOpenedDayKey) result[examId].firstOpenedDayKey = oldest.firstOpenedDayKey;
        if (oldest.source) result[examId].source = oldest.source;
      }
    });
    return result;
  }

  function mapEntries(input) {
    return isObject(input) ? input : {};
  }

  function mostRecentObject(local, remote, timestampFields, preferred = "local") {
    const localAt = latestTimestamp(...timestampFields.map((key) => local?.[key]));
    const remoteAt = latestTimestamp(...timestampFields.map((key) => remote?.[key]));
    if (parsedTime(localAt) !== parsedTime(remoteAt)) {
      return parsedTime(localAt) > parsedTime(remoteAt) ? local : remote;
    }
    return preferred === "remote" ? remote : local;
  }

  function maxNumericFields(target, candidates, keys) {
    keys.forEach((key) => {
      const values = candidates
        .filter(isObject)
        .map((item) => Number(item[key]))
        .filter(Number.isFinite);
      if (values.length) target[key] = Math.max(0, ...values);
    });
  }

  function mergeNumberMap(base, local, remote, context) {
    const result = {};
    const maps = [base, local, remote];
    const keys = new Set(maps.flatMap((map) => isObject(map) ? Object.keys(map) : []));
    keys.forEach((key) => {
      result[key] = mergeMonotonicCounter(base?.[key], local?.[key], remote?.[key], context);
    });
    return result;
  }

  function mergePracticalHistoryEntry(base, local, remote, context) {
    const safeBase = isObject(base) ? base : {};
    const safeLocal = isObject(local) ? local : {};
    const safeRemote = isObject(remote) ? remote : {};
    const winner = mostRecentObject(
      safeLocal,
      safeRemote,
      ["lastAnsweredAt", "lastConfidenceAt"],
      context.preferred
    );
    const merged = mergeValue(safeBase, safeLocal, safeRemote, ["practicalDrill", "history", "item"], context);
    const outcomeFields = [
      "lastSelected", "lastCorrect", "lastConfidence", "lastConfidenceAt", "lastAnsweredAt",
      "lastPredictedConfidence", "reviewLevel", "masteryDueKey"
    ];
    outcomeFields.forEach((key) => {
      if (own(winner, key)) merged[key] = clone(winner[key]);
    });
    const retryClockAvailable = Boolean(validTimestamp(safeLocal.retryNotBeforeAt) || validTimestamp(safeRemote.retryNotBeforeAt));
    const retryWinner = retryClockAvailable
      ? mostRecentObject(safeLocal, safeRemote, ["retryNotBeforeAt"], context.preferred)
      : winner;
    ["retryNotBeforeKey", "retryNotBeforeAt"].forEach((key) => {
      if (own(retryWinner, key)) merged[key] = clone(retryWinner[key]);
      else delete merged[key];
    });
    ["attempts", "correct", "wrong", "overconfidentWrong", "hesitantCorrect"].forEach((key) => {
      merged[key] = mergeMonotonicCounter(safeBase[key], safeLocal[key], safeRemote[key], context);
    });
    // `uncertain` can decrease when the latest correct answer is confirmed, so it follows the latest outcome.
    if (Number.isFinite(Number(winner.uncertain))) merged.uncertain = Math.max(0, Number(winner.uncertain));
    merged.mistakeTags = mergeNumberMap(
      safeBase.mistakeTags,
      safeLocal.mistakeTags,
      safeRemote.mistakeTags,
      context
    );
    const lastTags = unionPrimitiveArrays(
      safeLocal.lastMistakeTags,
      safeRemote.lastMistakeTags
    );
    if (lastTags.length) merged.lastMistakeTags = lastTags;
    const confidentDayKeys = unionPrimitiveArrays(
      safeBase.confidentDayKeys,
      safeLocal.confidentDayKeys,
      safeRemote.confidentDayKeys
    ).sort();
    if (confidentDayKeys.length) merged.confidentDayKeys = confidentDayKeys;
    return merged;
  }

  function mergeObjectMap(base, local, remote, merger, context) {
    const safeBase = mapEntries(base);
    const safeLocal = mapEntries(local);
    const safeRemote = mapEntries(remote);
    const keys = new Set([
      ...Object.keys(safeBase),
      ...Object.keys(safeLocal),
      ...Object.keys(safeRemote)
    ]);
    const result = {};
    keys.forEach((key) => {
      if (own(safeBase, key) && !own(safeLocal, key) && !own(safeRemote, key)) {
        result[key] = clone(safeBase[key]);
        return;
      }
      const merged = merger(
        own(safeBase, key) ? safeBase[key] : MISSING,
        own(safeLocal, key) ? safeLocal[key] : MISSING,
        own(safeRemote, key) ? safeRemote[key] : MISSING,
        context
      );
      if (merged !== MISSING) result[key] = merged;
    });
    return result;
  }

  function copyGroupFromWinner(target, winner, fields) {
    fields.forEach((key) => {
      if (own(winner, key)) target[key] = clone(winner[key]);
    });
  }

  function preserveLatestTimestamps(target, candidates, fields) {
    fields.forEach((key) => {
      const value = latestTimestamp(...candidates.map((item) => item?.[key]));
      if (value) target[key] = value;
    });
  }

  function mergeQuestionStatsEntry(base, local, remote, context) {
    if (local === MISSING) return remote === MISSING ? MISSING : clone(remote);
    if (remote === MISSING) return clone(local);
    const safeBase = isObject(base) ? base : {};
    const safeLocal = isObject(local) ? local : {};
    const safeRemote = isObject(remote) ? remote : {};
    const merged = mergeValue(safeBase, safeLocal, safeRemote, ["questionStats", "item"], context);
    [
      "attempts", "correct", "wrong", "cutCheckAttempts", "cutCheckCorrect", "cutCheckWrong",
      "centralAttempts", "centralCorrect", "centralWrong"
    ].forEach((key) => {
      merged[key] = mergeMonotonicCounter(safeBase[key], safeLocal[key], safeRemote[key], context);
    });
    maxNumericFields(merged, [safeBase, safeLocal, safeRemote], [
      "lastStep", "lastCorrectStep", "lastWrongStep"
    ]);

    const outcomeWinner = mostRecentObject(
      safeLocal,
      safeRemote,
      ["lastAnsweredAt", "lastConfidenceAt"],
      context.preferred
    );
    copyGroupFromWinner(merged, outcomeWinner, [
      "lastSelected", "lastCorrect", "lastConfidence", "lastConfidenceAt", "lastAnsweredAt",
      "lastConfidenceDayKey", "lastCorrectAt", "lastWrongAt", "lastClearAt", "lastExplanationAt", "lastExplanationShownAt", "lastCutCheckAt",
      "lastCutCheckAllCorrect", "lastRunMode", "lastMockFormId"
    ]);

    const mistakeWinner = mostRecentObject(
      safeLocal,
      safeRemote,
      ["lastMistakeAt"],
      context.preferred
    );
    copyGroupFromWinner(merged, mistakeWinner, [
      "lastMistakeItems", "lastMistakeUnknown", "lastMistakeCause", "lastMistakeNote", "lastMistakeAt"
    ]);

    const centralWinner = mostRecentObject(
      safeLocal,
      safeRemote,
      ["centralLastAnsweredAt", "centralLastCorrectAt", "centralLastWrongAt"],
      context.preferred
    );
    copyGroupFromWinner(merged, centralWinner, [
      "centralLastAnsweredAt", "centralLastCorrectAt", "centralLastWrongAt", "centralWeak"
    ]);

    const understandingWinner = mostRecentObject(
      safeLocal,
      safeRemote,
      ["lastUnderstandingAt", "lastUnderstandingPassedAt"],
      context.preferred
    );
    copyGroupFromWinner(merged, understandingWinner, [
      "lastUnderstandingAt", "lastUnderstandingPassedAt", "lastUnderstandingPassed"
    ]);
    preserveLatestTimestamps(merged, [safeBase, safeLocal, safeRemote], [
      "lastAnsweredAt", "lastCorrectAt", "lastWrongAt", "lastConfidenceAt",
      "lastExplanationAt", "lastExplanationShownAt", "lastCutCheckAt", "lastMistakeAt", "weakBreakAt",
      "centralLastAnsweredAt", "centralLastCorrectAt", "centralLastWrongAt",
      "lastUnderstandingAt", "lastUnderstandingPassedAt"
    ]);

    ["correctDayKeys", "clearDayKeys", "understandingDayKeys", "currentLawGateDayKeys"].forEach((key) => {
      let values = unionPrimitiveArrays(safeBase[key], safeLocal[key], safeRemote[key]).sort();
      if (["clearDayKeys", "currentLawGateDayKeys"].includes(key) &&
          ["unsure", "cuts", "wrong"].includes(outcomeWinner.lastConfidence)) {
        const invalidatedDay = validDayKey(outcomeWinner.lastConfidenceDayKey) ||
          localDayKey(outcomeWinner.lastConfidenceAt);
        if (invalidatedDay) values = values.filter((day) => day !== invalidatedDay);
      }
      if (values.length) merged[key] = values;
      else if (["clearDayKeys", "currentLawGateDayKeys"].includes(key)) merged[key] = [];
    });
    let clearAtHistory = unionPrimitiveArrays(
      safeBase.clearAtHistory,
      safeLocal.clearAtHistory,
      safeRemote.clearAtHistory
    )
      .map(validTimestamp)
      .filter(Boolean)
      .sort((left, right) => parsedTime(left) - parsedTime(right));
    if (["unsure", "cuts", "wrong"].includes(outcomeWinner.lastConfidence)) {
      const invalidatedDay = validDayKey(outcomeWinner.lastConfidenceDayKey) ||
        localDayKey(outcomeWinner.lastConfidenceAt);
      if (invalidatedDay) {
        clearAtHistory = clearAtHistory.filter((value) => localDayKey(value) !== invalidatedDay);
      }
    }
    if (clearAtHistory.length || [safeBase, safeLocal, safeRemote].some((item) => own(item, "clearAtHistory"))) {
      merged.clearAtHistory = [...new Set(clearAtHistory)].slice(-16);
    }
    const firstAttemptAt = earliestTimestamp(
      safeBase.firstAttemptAt,
      safeLocal.firstAttemptAt,
      safeRemote.firstAttemptAt
    );
    if (firstAttemptAt) {
      const firstOwner = [safeBase, safeLocal, safeRemote]
        .find((item) => item.firstAttemptAt === firstAttemptAt);
      merged.firstAttemptAt = firstAttemptAt;
      if (own(firstOwner, "firstAttemptCorrect")) {
        merged.firstAttemptCorrect = Boolean(firstOwner.firstAttemptCorrect);
      }
    }
    return merged;
  }

  function centralRank(state) {
    const progress = isObject(state?.centralProgress) ? state.centralProgress : {};
    return {
      events: Math.max(0, Number(progress.sourceEvents) || 0),
      at: latestTimestamp(progress.lastEventAt, progress.generatedAt)
    };
  }

  function compareCentral(left, right, fallback = "local") {
    const leftRank = centralRank(left);
    const rightRank = centralRank(right);
    if (leftRank.events !== rightRank.events) return leftRank.events > rightRank.events ? "local" : "remote";
    if (parsedTime(leftRank.at) !== parsedTime(rightRank.at)) {
      return parsedTime(leftRank.at) > parsedTime(rightRank.at) ? "local" : "remote";
    }
    return fallback;
  }

  function activeSessionDescriptor(state) {
    if (isObject(state?.officialExamSession) && state.officialExamSession.examId) {
      return {
        kind: "official",
        id: `${state.officialExamSession.examId}:${state.officialExamSession.startedAt || "unknown"}`
      };
    }
    const mock = state?.mock;
    if (isObject(mock) && mock.formId && mock.startedAt && !mock.finalized) {
      return { kind: "mock", id: `${mock.formId}:${mock.startedAt}` };
    }
    const calculation = state?.calculationDrill;
    if (isObject(calculation) && ["active", "first", "retry"].includes(calculation.stage)) {
      return {
        kind: "calculation",
        id: `${calculation.version || 1}:${(calculation.queue || []).join(",")}`
      };
    }
    const practical = state?.practicalDrill;
    if (isObject(practical) && ["active", "retry"].includes(practical.stage)) {
      return {
        kind: "practical",
        id: `${practical.bankId || "legacy"}:${practical.sessionStartedAt || practical.presentationKey || (practical.sessionIds || []).join(",")}`
      };
    }
    return null;
  }

  function activeSessionPayload(state, descriptor = activeSessionDescriptor(state)) {
    if (!descriptor) return null;
    if (descriptor.kind === "official") return state?.officialExamSession || null;
    if (descriptor.kind === "mock") return state?.mock || null;
    if (descriptor.kind === "calculation") return state?.calculationDrill || null;
    if (descriptor.kind === "practical") return practicalSessionView(state?.practicalDrill);
    return null;
  }

  function detectActiveSessionConflicts(base = {}, local = {}, remote = {}) {
    const baseSession = activeSessionDescriptor(base);
    const localSession = activeSessionDescriptor(local);
    const remoteSession = activeSessionDescriptor(remote);
    const basePayload = activeSessionPayload(base, baseSession);
    const localChanged = !equal(localSession, baseSession) ||
      !equal(activeSessionPayload(local, localSession), basePayload);
    const remoteChanged = !equal(remoteSession, baseSession) ||
      !equal(activeSessionPayload(remote, remoteSession), basePayload);
    if (!localChanged || !remoteChanged) return [];
    if (equal(localSession, remoteSession)) {
      const samePayload = equal(
        activeSessionPayload(local, localSession),
        activeSessionPayload(remote, remoteSession)
      );
      if (samePayload || localSession?.kind !== "practical") return [];
    }
    return [{
      code: "concurrent-active-session",
      base: clone(baseSession),
      local: clone(localSession),
      remote: clone(remoteSession)
    }];
  }

  function mergeOfficialSession(base, local, remote, context) {
    if (equal(local, base)) return clone(remote);
    if (equal(remote, base)) return clone(local);
    if (equal(local, remote)) return clone(local);
    if (!isObject(local)) return clone(context.preferred === "remote" ? remote : local);
    if (!isObject(remote)) return clone(context.preferred === "remote" ? remote : local);
    const localId = `${local.examId || ""}:${local.startedAt || ""}`;
    const remoteId = `${remote.examId || ""}:${remote.startedAt || ""}`;
    if (localId !== remoteId) return clone(context.preferred === "remote" ? remote : local);
    const winner = context.preferred === "remote" ? remote : local;
    const loser = context.preferred === "remote" ? local : remote;
    return {
      ...clone(loser),
      ...clone(winner),
      answers: { ...(loser.answers || {}), ...(winner.answers || {}) },
      position: Math.max(Number(local.position) || 0, Number(remote.position) || 0),
      lawChecked: Boolean(local.lawChecked || remote.lawChecked),
      appUnseenAtStart: Boolean(local.appUnseenAtStart || remote.appUnseenAtStart)
    };
  }

  function practicalSessionView(drill) {
    const safe = isObject(drill) ? drill : {};
    return Object.fromEntries(
      PRACTICAL_SESSION_FIELDS.filter((key) => own(safe, key)).map((key) => [key, safe[key]])
    );
  }

  function mergePracticalDrill(base, local, remote, context) {
    const safeBase = isObject(base) ? base : {};
    const safeLocal = isObject(local) ? local : {};
    const safeRemote = isObject(remote) ? remote : {};
    const merged = mergeValue(safeBase, safeLocal, safeRemote, ["practicalDrill"], context);
    merged.history = mergeObjectMap(
      safeBase.history,
      safeLocal.history,
      safeRemote.history,
      mergePracticalHistoryEntry,
      context
    );
    ["attempts", "correctAttempts", "sessionsCompleted"].forEach((key) => {
      merged[key] = mergeMonotonicCounter(safeBase[key], safeLocal[key], safeRemote[key], context);
    });
    const baseSession = practicalSessionView(safeBase);
    const localSession = practicalSessionView(safeLocal);
    const remoteSession = practicalSessionView(safeRemote);
    let sessionWinner;
    if (equal(localSession, baseSession)) sessionWinner = remoteSession;
    else if (equal(remoteSession, baseSession)) sessionWinner = localSession;
    else if (equal(localSession, remoteSession)) sessionWinner = localSession;
    else sessionWinner = context.preferred === "remote" ? remoteSession : localSession;
    PRACTICAL_SESSION_FIELDS.forEach((key) => {
      if (own(sessionWinner, key)) merged[key] = clone(sessionWinner[key]);
      else delete merged[key];
    });
    const currentAttemptId = String(merged.currentAttempt?.id || "");
    const currentHistory = currentAttemptId && isObject(merged.history?.[currentAttemptId])
      ? merged.history[currentAttemptId]
      : null;
    if (
      isObject(merged.currentAttempt) &&
      ["confident", "uncertain"].includes(currentHistory?.lastPredictedConfidence)
    ) {
      merged.currentAttempt = {
        ...merged.currentAttempt,
        predictedConfidence: currentHistory.lastPredictedConfidence
      };
      merged.preAnswerConfidence = currentHistory.lastPredictedConfidence;
    }
    if (
      isObject(merged.currentAttempt) &&
      merged.currentAttempt.correct === true &&
      ["confident", "uncertain"].includes(currentHistory?.lastConfidence)
    ) {
      merged.currentAttempt = {
        ...merged.currentAttempt,
        confidence: currentHistory.lastConfidence
      };
    }
    return merged;
  }

  function mergeCentralProgress(base, local, remote, context) {
    const merged = mergeValue(
      isObject(base) ? base : {},
      isObject(local) ? local : {},
      isObject(remote) ? remote : {},
      ["centralProgress"],
      context
    );
    ["sourceEvents", "answers", "correct", "wrong"].forEach((key) => {
      merged[key] = mergeMonotonicCounter(base?.[key], local?.[key], remote?.[key], context);
    });
    merged.generatedAt = latestTimestamp(base?.generatedAt, local?.generatedAt, remote?.generatedAt);
    merged.lastEventAt = latestTimestamp(base?.lastEventAt, local?.lastEventAt, remote?.lastEventAt);
    return merged;
  }

  function mergeStatesDetailed(base = {}, local = {}, remote = {}, options = {}) {
    const safeBase = isObject(base) ? base : {};
    const safeLocal = isObject(local) ? local : {};
    const safeRemote = isObject(remote) ? remote : {};
    const comparison = compareSync(safeLocal, safeRemote);
    const baseStamp = syncStamp(safeBase);
    const localStamp = syncStamp(safeLocal);
    const remoteStamp = syncStamp(safeRemote);
    const maximumGeneration = Math.max(
      baseStamp.generation,
      localStamp.generation,
      remoteStamp.generation
    );
    const minimumGeneration = Math.min(
      baseStamp.generation,
      localStamp.generation,
      remoteStamp.generation
    );
    if (maximumGeneration > minimumGeneration) {
      const winner = remoteStamp.generation === maximumGeneration
        ? safeRemote
        : localStamp.generation === maximumGeneration
          ? safeLocal
          : safeBase;
      const replacement = clone(winner);
      replacement.officialExamExposure = mergeOfficialExamExposureLedgers(
        safeBase.officialExamExposure,
        safeLocal.officialExamExposure,
        safeRemote.officialExamExposure
      );
      const requestedAt = validTimestamp(options.updatedAt);
      const maximumRevision = Math.max(
        baseStamp.revision,
        localStamp.revision,
        remoteStamp.revision
      );
      const replacementWriterId = String(options.writerId || replacement.syncMeta?.writerId || "").slice(0, 180);
      const replacementRevision = maximumRevision + (options.incrementRevision ? 1 : 0);
      const replacementClock = normalizedClock(winner);
      if (options.incrementRevision && replacementWriterId) {
        replacementClock[replacementWriterId] = replacementRevision;
      }
      replacement.syncMeta = {
        ...(isObject(replacement.syncMeta) ? replacement.syncMeta : {}),
        generation: maximumGeneration,
        revision: replacementRevision,
        updatedAt: requestedAt || latestTimestamp(
          baseStamp.updatedAt,
          localStamp.updatedAt,
          remoteStamp.updatedAt
        ),
        writerId: replacementWriterId,
        baseRevision: baseStamp.revision,
        clock: replacementClock
      };
      return {
        state: replacement,
        conflicts: [],
        hasConflict: false,
        requiresResolution: false,
        replacementApplied: true,
        comparison,
        baseStamp,
        localStamp,
        remoteStamp,
        appliedRevision: replacement.syncMeta.revision,
        appliedUpdatedAt: replacement.syncMeta.updatedAt
      };
    }
    const localClock = normalizedClock(safeLocal);
    const remoteClock = normalizedClock(safeRemote);
    const effectiveLocalClock = { ...localClock };
    const pendingWriterId = String(options.writerId || "").slice(0, 180);
    if (options.incrementRevision && pendingWriterId) {
      const pendingRevision = Math.max(
        baseStamp.revision,
        localStamp.revision,
        remoteStamp.revision
      ) + 1;
      effectiveLocalClock[pendingWriterId] = Math.max(
        Number(effectiveLocalClock[pendingWriterId]) || 0,
        pendingRevision
      );
    }
    const context = {
      preferred: preferredSide(safeLocal, safeRemote),
      localDominatesRemote: clockStrictlyDominates(effectiveLocalClock, remoteClock),
      remoteDominatesLocal: clockStrictlyDominates(remoteClock, effectiveLocalClock),
      clocksEqual: equal(effectiveLocalClock, remoteClock)
    };
    const merged = mergeValue(safeBase, safeLocal, safeRemote, [], context);
    merged.stateSchemaVersion = Math.max(
      0,
      Number(safeBase.stateSchemaVersion) || 0,
      Number(safeLocal.stateSchemaVersion) || 0,
      Number(safeRemote.stateSchemaVersion) || 0
    );

    merged.officialExamExposure = mergeOfficialExamExposureLedgers(
      safeBase.officialExamExposure,
      safeRemote.officialExamExposure,
      safeLocal.officialExamExposure
    );
    merged.officialExamHistory = mergeRecordArrays(
      safeBase.officialExamHistory,
      safeLocal.officialExamHistory,
      safeRemote.officialExamHistory,
      context
    );
    merged.officialExamSession = mergeOfficialSession(
      safeBase.officialExamSession,
      safeLocal.officialExamSession,
      safeRemote.officialExamSession,
      context
    );
    merged.practicalDrill = mergePracticalDrill(
      safeBase.practicalDrill,
      safeLocal.practicalDrill,
      safeRemote.practicalDrill,
      context
    );
    merged.questionStats = mergeObjectMap(
      safeBase.questionStats,
      safeLocal.questionStats,
      safeRemote.questionStats,
      mergeQuestionStatsEntry,
      context
    );
    merged.centralProgress = mergeCentralProgress(
      safeBase.centralProgress,
      safeLocal.centralProgress,
      safeRemote.centralProgress,
      context
    );
    const centralPreferred = compareCentral(safeLocal, safeRemote, context.preferred);
    merged.centralMarked = clone(
      centralPreferred === "remote" ? safeRemote.centralMarked || {} : safeLocal.centralMarked || {}
    );
    const lifetimeCrystals = mergeMonotonicCounter(
      Math.max(0, Number(safeBase.crystals) || 0) + Math.max(0, Number(safeBase.crystalSpent) || 0),
      Math.max(0, Number(safeLocal.crystals) || 0) + Math.max(0, Number(safeLocal.crystalSpent) || 0),
      Math.max(0, Number(safeRemote.crystals) || 0) + Math.max(0, Number(safeRemote.crystalSpent) || 0),
      context
    );
    merged.crystalSpent = Math.max(
      0,
      Number(safeBase.crystalSpent) || 0,
      Number(safeLocal.crystalSpent) || 0,
      Number(safeRemote.crystalSpent) || 0
    );
    merged.crystals = Math.max(0, lifetimeCrystals - merged.crystalSpent);
    merged.armoryRank = Math.max(
      0,
      Number(safeBase.armoryRank) || 0,
      Number(safeLocal.armoryRank) || 0,
      Number(safeRemote.armoryRank) || 0
    );

    const conflicts = detectActiveSessionConflicts(safeBase, safeLocal, safeRemote);
    const stamps = [syncStamp(safeBase), syncStamp(safeLocal), syncStamp(safeRemote)];
    const maximumRevision = Math.max(...stamps.map((stamp) => stamp.revision));
    const shouldIncrement = Boolean(options.incrementRevision);
    const requestedAt = validTimestamp(options.updatedAt);
    const mergedUpdatedAt = requestedAt || latestTimestamp(...stamps.map((stamp) => stamp.updatedAt));
    const mergedClock = mergeClocks(safeBase, safeLocal, safeRemote);
    const mergedWriterId = String(options.writerId || merged.syncMeta?.writerId || "").slice(0, 180);
    if (shouldIncrement && mergedWriterId) mergedClock[mergedWriterId] = maximumRevision + 1;
    merged.syncMeta = {
      ...(isObject(merged.syncMeta) ? merged.syncMeta : {}),
      generation: maximumGeneration,
      revision: maximumRevision + (shouldIncrement ? 1 : 0),
      updatedAt: mergedUpdatedAt,
      writerId: mergedWriterId,
      baseRevision: syncStamp(safeBase).revision,
      clock: mergedClock
    };

    return {
      state: merged,
      conflicts,
      hasConflict: conflicts.length > 0,
      requiresResolution: conflicts.length > 0,
      comparison,
      baseStamp: syncStamp(safeBase),
      localStamp: syncStamp(safeLocal),
      remoteStamp: syncStamp(safeRemote),
      appliedRevision: merged.syncMeta.revision,
      appliedUpdatedAt: merged.syncMeta.updatedAt
    };
  }

  function mergeStates(base = {}, local = {}, remote = {}, options = {}) {
    return mergeStatesDetailed(base, local, remote, options).state;
  }

  function reconcileForSave(base = {}, local = {}, remote = {}, options = {}) {
    return mergeStatesDetailed(base, local, remote, {
      ...options,
      incrementRevision: true
    });
  }

  const api = {
    VERSION: 1,
    clone,
    syncStamp,
    compareSync,
    mergeOfficialExamExposureLedgers,
    mergeRecordArrays,
    detectActiveSessionConflicts,
    mergeStatesDetailed,
    mergeStates,
    reconcileForSave
  };
  if (root) root.TAKKEN_STATE_SYNC = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : null);
