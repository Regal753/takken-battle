(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_EXAM_DAILY_COVERAGE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Storage IDs and bank scopes stay stable. Exam categories are a policy layer.
  const PRICE_IDS = Object.freeze(["o001", "o002", "o101", "o102"]);
  const EXEMPT_IDS = Object.freeze(["o003", "o004", "o005", "o006", "o007", "o008", "o009", "o010"]);
  function category(question) {
    if (!question) return "";
    const id = question.sourceQuestionId || question.id;
    if (PRICE_IDS.includes(id)) return "price";
    if (EXEMPT_IDS.includes(id)) return "exempt";
    const section = question.sectionId || question.scopeId;
    return section === "taxOther" ? "tax" : section === "other" ? "exempt" : section || "";
  }
  function lanes(profile = "general") {
    return [
      { category: "tax", scope: "taxOther", topic: "", target: 4, label: "税" },
      { category: "price", scope: "other", topic: "price", target: 2, label: "価格" },
      ...(profile === "fiveExempt" ? [] : [{ category: "exempt", scope: "other", topic: "exempt", target: 6, label: "問46〜50" }])
    ];
  }
  function eligible(question, profile) { return category(question) !== "exempt" || profile !== "fiveExempt"; }
  function nextLane(profile, counts = {}) { return lanes(profile).find(lane => (counts[lane.category] || 0) < lane.target) || null; }
  function completedCount(profile, counts = {}) { return lanes(profile).reduce((sum, lane) => sum + Math.min(lane.target, Math.max(0, Number(counts[lane.category]) || 0)), 0); }
  return Object.freeze({ PRICE_IDS, EXEMPT_IDS, category, lanes, eligible, nextLane, completedCount });
});
