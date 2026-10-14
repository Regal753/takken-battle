"use strict";

(function attach(root, factory) {
  const mastery = typeof module === "object" && module.exports
    ? require("./business-mastery.js") : root.TAKKEN_BUSINESS_MASTERY;
  const api = factory(mastery);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_REFORM_2026_QUEUE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (mastery) {
  if (typeof mastery?.priorityFor !== "function") return null;

  function seedFor(value) {
    let seed = 2166136261;
    for (const character of String(value)) {
      seed = Math.imul(seed ^ character.codePointAt(0), 16777619);
    }
    // Avalanche the whole key so nearby question IDs and cycle IDs do not
    // preserve their numeric order when selecting only part of the bank.
    seed = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b);
    seed = Math.imul(seed ^ (seed >>> 13), 0xc2b2ae35);
    return (seed ^ (seed >>> 16)) >>> 0;
  }

  function shuffled(items, key) {
    const result = [...items];
    let seed = seedFor(key);
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let value = Math.imul(seed ^ (seed >>> 15), seed | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  function buildQueue(questions, { mode = "all", size = "10", history = {}, sessionKey = "", now = new Date() } = {}) {
    const eligible = Array.isArray(questions) ? questions : [];
    const requested = size === "all" ? eligible.length : Math.max(0, Math.trunc(Number(size) || 10));
    const target = Math.min(eligible.length, requested);
    const priorities = new Map();
    eligible.forEach((question) => {
      const priority = mode === "weak" ? mastery.priorityFor(history[question.id] || {}, now) : 0;
      if (!priorities.has(priority)) priorities.set(priority, new Map());
      const topics = priorities.get(priority);
      if (!topics.has(question.unitId)) topics.set(question.unitId, []);
      topics.get(question.unitId).push(question);
    });
    const queue = [];
    for (const priority of [...priorities.keys()].sort((left, right) => left - right)) {
      const groups = priorities.get(priority);
      const topicIds = shuffled([...groups.keys()], `${sessionKey}:priority-${priority}:topics`);
      const orders = new Map(topicIds.map(topicId => [topicId,
        shuffled(groups.get(topicId), `${sessionKey}:priority-${priority}:topic-${topicId}`)]));
      const rounds = Math.max(0, ...[...orders.values()].map(items => items.length));
      // Spread a mixed set across all eligible themes before taking a second
      // question from any theme. Never cross the weak-mode priority boundary.
      for (let round = 0; round < rounds && queue.length < target; round += 1) {
        for (const topicId of topicIds) {
          const question = orders.get(topicId)[round];
          if (question && queue.length < target) queue.push(question.id);
        }
      }
      if (queue.length >= target) break;
    }
    return queue;
  }

  return Object.freeze({ VERSION: 1, buildQueue });
});
