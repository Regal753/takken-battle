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
    const ranked = mode === "all-random" && !dailyMixed
      ? seededOrder(candidates, seed)
      : candidates.sort((left, right) => {
        const priority = priorityFor(left.entry, now) - priorityFor(right.entry, now);
        if (priority) return priority;
        const attempts = attemptsFor(left.entry) - attemptsFor(right.entry);
        if (attempts) return attempts;
        return clean(left.question.id).localeCompare(clean(right.question.id));
      });
    // Shuffle within an equal-priority/attempt bucket, keeping the learning order deterministic.
    const queue = [];
    for (let start = 0; start < ranked.length;) {
      let end = start + 1;
      while (end < ranked.length && priorityFor(ranked[start].entry, now) === priorityFor(ranked[end].entry, now) && attemptsFor(ranked[start].entry) === attemptsFor(ranked[end].entry)) end += 1;
      queue.push(...seededOrder(ranked.slice(start, end), `${seed}:${start}`));
      start = end;
    }
    const selected = queue.slice(0, Math.min(requestedSize, queue.length));
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
