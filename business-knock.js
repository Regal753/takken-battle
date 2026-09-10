"use strict";

// Pure planner: callers own rendering, answer recording and persistence.
(function attachBusinessKnock(root, factory) {
  const api = factory(root, typeof require === "function" ? (() => {
    try { return require("./business-mastery.js"); } catch { return null; }
  })() : null);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_BUSINESS_KNOCK = api;
  if (root.window && root.window !== root) root.window.TAKKEN_BUSINESS_KNOCK = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBusinessKnock(runtime, requiredMastery) {
  const mastery = requiredMastery || runtime.TAKKEN_BUSINESS_MASTERY || runtime.window?.TAKKEN_BUSINESS_MASTERY || null;
  const MODES = Object.freeze(["weak-retry", "weak-due", "due", "untouched", "all-random", "unit"]);
  const SIZES = Object.freeze([10, 20, 50, 100]);
  const clean = (value) => String(value || "").trim();
  const hash = (value) => [...clean(value)].reduce((state, char) => ((state * 31) + char.codePointAt(0)) >>> 0, 2166136261);
  const dayKey = (value) => {
    const match = clean(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  };
  function normalizedNow(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString();
    const text = clean(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
  }
  const historyEntry = (history, id) => history && typeof history === "object" ? history[id] || {} : {};
  const attemptsFor = (entry) => Math.max(0, Math.trunc(Number(entry?.attempts) || 0));
  const confidenceIsRetry = (entry) => ["wrong", "uncertain"].includes(entry?.lastConfidence);
  function stateFor(entry, now) {
    const current = normalizedNow(now);
    if (confidenceIsRetry(entry)) return "retry";
    if (!attemptsFor(entry)) return "untouched";
    if (mastery?.stateFor) return mastery.stateFor(entry, current);
    const due = dayKey(entry?.masteryDueKey);
    return due && due <= dayKey(current) ? "due" : "learning";
  }
  function priorityFor(entry, now) {
    const state = stateFor(entry, now);
    return ({ retry: 0, due: 1, untouched: 2, learning: 3, retained: 4, durable: 5 })[state] ?? 6;
  }
  function seededOrder(items, seed) {
    const ordered = [...items];
    let random = hash(seed);
    for (let index = ordered.length - 1; index > 0; index -= 1) {
      random = ((random * 1664525) + 1013904223) >>> 0;
      const target = random % (index + 1);
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    }
    return ordered;
  }
  function valuesFor(question, pluralKey, singularKey) {
    const plural = Array.isArray(question?.[pluralKey]) ? question[pluralKey] : [];
    return [...new Set([...plural, question?.[singularKey]].map(clean).filter(Boolean))].sort();
  }
  function diversityMetadata(question) {
    return {
      anchors: valuesFor(question, "sourceAnchorIds", "sourceAnchor"),
      tags: valuesFor(question, "diagnosticTags", "diagnosticTag"),
      unitId: clean(question?.unitId)
    };
  }
  function overlap(left, right) {
    return left.some((value) => right.includes(value));
  }
  function sharesSourceAnchor(left, right) {
    return overlap(left.anchors, right.anchors);
  }
  function similarityFor(left, right) {
    // Anchors identify the same underlying rule most precisely. Tags are a
    // weaker but useful fallback; unit is deliberately the lowest penalty so
    // focused unit rounds still work when their bank is necessarily narrow.
    // Make an exact source-anchor repeat dominate every possible combination
    // of the broader tag/unit penalties across the two-question lookback.
    return (sharesSourceAnchor(left, right) ? 64 : 0)
      + (overlap(left.tags, right.tags) ? 4 : 0)
      + (left.unitId && left.unitId === right.unitId ? 1 : 0);
  }
  function diversifyBucket(items, seed, recentQuestions = [], unitCounts = new Map(), hard = false, unitWeights = new Map()) {
    const pending = seededOrder(items, seed).map((item) => ({
      item,
      metadata: diversityMetadata(item.question)
    }));
    const selected = [];
    const recent = [...recentQuestions].slice(-2).map(diversityMetadata);
    const remainingAnchorCounts = new Map();
    pending.forEach(({ metadata }) => metadata.anchors.forEach((anchor) =>
      remainingAnchorCounts.set(anchor, (remainingAnchorCounts.get(anchor) || 0) + 1)
    ));
    const scoreBefore = (left, right) => {
      if (!right) return true;
      for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return left[index] < right[index];
      }
      return false;
    };
    while (pending.length) {
      let bestIndex = 0;
      let bestScore = null;
      for (let index = 0; index < pending.length; index += 1) {
        const candidate = pending[index].metadata;
        const anchorPenalty = recent.reduce((total, prior, recentIndex) =>
          total + (sharesSourceAnchor(candidate, prior) ? (recentIndex === recent.length - 1 ? 2 : 1) : 0), 0);
        const pendingAnchorCopies = candidate.anchors.length
          ? Math.max(...candidate.anchors.map((anchor) => remainingAnchorCounts.get(anchor) || 1))
          : 1;
        const broadPenalty = recent.reduce((total, prior) => total + similarityFor(candidate, prior), 0);
        // Prefer a repeated anchor early when the recent window is clear. This
        // leaves enough unrelated questions to separate its later variants,
        // instead of stranding a same-rule pair at the end of the bucket.
        // Authored daily cases should cover the syllabus, not exhaust the
        // largest unit first. Balance only equally urgent/attempted items:
        // an overdue/wrong answer must still precede a fresh easy-to-schedule one.
        const score = hard
          ? [(unitCounts.get(candidate.unitId) || 0) / (unitWeights.get(candidate.unitId) || 1), anchorPenalty, broadPenalty, -(pendingAnchorCopies - 1)]
          : [anchorPenalty, -(pendingAnchorCopies - 1), broadPenalty];
        // The seeded order is the deterministic tie-breaker, preserving the
        // existing behaviour when questions have no diversity metadata.
        if (scoreBefore(score, bestScore)) {
          bestScore = score;
          bestIndex = index;
        }
      }
      const [next] = pending.splice(bestIndex, 1);
      selected.push(next.item);
      unitCounts.set(next.metadata.unitId, (unitCounts.get(next.metadata.unitId) || 0) + 1);
      recent.push(next.metadata);
      if (recent.length > 2) recent.shift();
      next.metadata.anchors.forEach((anchor) => {
        const remaining = (remainingAnchorCounts.get(anchor) || 1) - 1;
        if (remaining) remainingAnchorCounts.set(anchor, remaining);
        else remainingAnchorCounts.delete(anchor);
      });
    }
    return selected;
  }
  function normalizeQuestions(questions) {
    const ids = new Set();
    return (Array.isArray(questions) ? questions : []).filter((question) => {
      const id = clean(question?.id);
      if (!id || ids.has(id)) return false;
      ids.add(id);
      return true;
    });
  }
  function questionsFor(input) {
    const supplied = normalizeQuestions(input?.questions);
    if (supplied.length) return supplied;
    const bank = input?.bank || runtime.TAKKEN_BUSINESS_FULLSCORE_BANK || runtime.window?.TAKKEN_BUSINESS_FULLSCORE_BANK;
    return normalizeQuestions(bank?.QUESTIONS);
  }
  function presentationKeyFor(input, question, index) {
    const base = clean(input?.presentationKey) || `business-knock:${clean(input?.seed) || "default"}`;
    return `${base}:${String(index + 1).padStart(3, "0")}:${question.id}`.slice(0, 120);
  }
  function plan(input = {}) {
    const mode = MODES.includes(input.mode) ? input.mode : "weak-retry";
    const now = normalizedNow(input.now);
    const history = input.history && typeof input.history === "object" ? input.history : {};
    const all = questionsFor(input);
    // The panel accepts only named presets. The daily command sends its exact
    // remainder separately, so arbitrary public `size` input remains
    // fail-closed to 10.
    const remainder = Number(input.dailyRemainder);
    const dailyMixed = Number.isInteger(remainder) && remainder > 0;
    const requestedSize = dailyMixed
      ? Math.min(all.length, remainder)
      : SIZES.includes(Number(input.size)) ? Number(input.size) : 10;
    const unitId = clean(input.unitId);
    const eligible = mode === "unit" ? all.filter((question) => question.unitId === unitId) : all;
    const classified = eligible.map((question) => ({ question, entry: historyEntry(history, question.id) }));
    const answeredTodayIds = new Set(
      (Array.isArray(input.answeredTodayIds) ? input.answeredTodayIds : []).map(clean).filter(Boolean)
    );
    let candidates;
    if (dailyMixed) candidates = classified.filter(({ question }) => !answeredTodayIds.has(question.id));
    else if (mode === "weak-retry") candidates = classified.filter(({ entry }) => confidenceIsRetry(entry));
    else if (mode === "weak-due") candidates = classified.filter(({ entry }) => confidenceIsRetry(entry) || stateFor(entry, now) === "due");
    else if (mode === "due") candidates = classified.filter(({ entry }) => stateFor(entry, now) === "due");
    else if (mode === "untouched") candidates = classified.filter(({ entry }) => !attemptsFor(entry));
    else candidates = classified;
    const seed = clean(input.seed) || clean(input.presentationKey) || "default";
    const hard = candidates.length > 0 && candidates.every(({ question }) => question.difficulty === "hard");
    const ranked = mode === "all-random" && !dailyMixed && !hard
      ? seededOrder(candidates, seed)
      : candidates.sort((left, right) => {
        const priority = priorityFor(left.entry, now) - priorityFor(right.entry, now);
        if (priority) return priority;
        const attempts = attemptsFor(left.entry) - attemptsFor(right.entry);
        if (attempts) return attempts;
        return clean(left.question.id).localeCompare(clean(right.question.id));
      });
    // Diversify only inside an equal-priority/attempt bucket. This preserves
    // the retry/due/untouched ordering while avoiding consecutive variants of
    // the same rule whenever another equally urgent question is available.
    const queue = [];
    const unitCounts = new Map();
    const unitWeights = new Map();
    eligible.forEach(question => unitWeights.set(question.unitId, (unitWeights.get(question.unitId) || 0) + 1));
    for (let start = 0; start < ranked.length;) {
      let end = start + 1;
      while (end < ranked.length && priorityFor(ranked[start].entry, now) === priorityFor(ranked[end].entry, now) && attemptsFor(ranked[start].entry) === attemptsFor(ranked[end].entry)) end += 1;
      queue.push(...diversifyBucket(ranked.slice(start, end), `${seed}:${start}`, queue.slice(-2).map(({ question }) => question), unitCounts, hard, unitWeights));
      start = end;
    }
    let selected = queue.slice(0, Math.min(requestedSize, queue.length));
    if (hard && (dailyMixed || mode === "all-random")) {
      // Keep a fresh-case lane while unseen material exists. Otherwise the
      // first day's twenty due reviews can occupy the entire next day, giving
      // the appearance of a larger bank without exposing its other cases.
      // Explicit weak/due modes deliberately remain review-only.
      const freshCount = queue.filter(({ entry }) => !attemptsFor(entry)).length;
      const freshReserve = Math.min(freshCount, Math.ceil(requestedSize * 0.4));
      const urgent = queue.filter(({ entry }) => priorityFor(entry, now) < 2);
      const other = queue.filter(({ entry }) => priorityFor(entry, now) >= 2);
      const head = urgent.slice(0, Math.max(0, requestedSize - freshReserve));
      selected = [...head, ...other, ...urgent.slice(head.length)].slice(0, requestedSize);
    }
    return Object.freeze({
      mode, unitId, requestedSize, size: selected.length, available: candidates.length,
      capped: selected.length < requestedSize, seed,
      ids: Object.freeze(selected.map(({ question }) => question.id)),
      items: Object.freeze(selected.map(({ question, entry }, index) => Object.freeze({
        id: question.id, unitId: question.unitId || "", priority: priorityFor(entry, now),
        presentationKey: presentationKeyFor(input, question, index)
      })))
    });
  }
  function summarizeHistory(history, now) {
    const entries = Object.values(history && typeof history === "object" ? history : {});
    const totals = entries.reduce((result, entry) => ({
      attempts: result.attempts + attemptsFor(entry), correct: result.correct + Math.max(0, Number(entry?.correct) || 0),
      wrong: result.wrong + Math.max(0, Number(entry?.wrong) || 0), uncertain: result.uncertain + Math.max(0, Number(entry?.uncertain) || 0),
      retry: result.retry + (stateFor(entry, now) === "retry" ? 1 : 0), due: result.due + (stateFor(entry, now) === "due" ? 1 : 0)
    }), { attempts: 0, correct: 0, wrong: 0, uncertain: 0, retry: 0, due: 0 });
    return Object.freeze({ rounds: totals.attempts, ...totals, accuracy: totals.attempts ? Math.round((totals.correct / totals.attempts) * 1000) / 10 : 0 });
  }
  return Object.freeze({ MODES, SIZES, stateFor, priorityFor, plan, summarizeHistory });
});
