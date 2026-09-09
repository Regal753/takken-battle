"use strict";

// Structured-question view shared by app.js and standalone audits.
// It keeps saved question ids and attempt records unchanged.
(function (root, factory) {
  const api = factory(root || {});
  if (root) root.TAKKEN_REIWA_QUESTION_VIEW = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const KANA = ["ア", "イ", "ウ", "エ"];
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const lines = (value) => String(value || "").split(/\r?\n/).map(clean).filter(Boolean);

  function splitLegacy(question) {
    const source = lines(question.text);
    const statementLines = source.filter((line) => /^[ア-エ]\s+/.test(line));
    const body = source.filter((line) => !/^[ア-エ]\s+/.test(line));
    return {
      premise: body.slice(0, Math.max(0, body.length - (statementLines.length ? 1 : 0))).join(" "),
      stem: statementLines.length ? body[body.length - 1] || "" : body.join(" "),
      statements: statementLines
    };
  }

  function normalizeQuestion(question) {
    if (!question || typeof question !== "object") throw new TypeError("question is required");
    const legacy = splitLegacy(question);
    const statements = Array.isArray(question.statements) && question.statements.length
      ? question.statements.map((item, index) => ({
        id: item && typeof item === "object" ? String(item.id || KANA[index] || index + 1) : KANA[index] || String(index + 1),
        text: clean(item && typeof item === "object" ? item.text : item)
      })).filter((item) => item.text)
      : legacy.statements.map((text, index) => ({ id: text.slice(0, 1) || KANA[index], text }));
    const choices = Array.isArray(question.choices) ? question.choices.map(clean) : [];
    return Object.freeze({
      id: String(question.id || "legacy-question"),
      format: clean(question.format || question.formatFamily || (statements.length ? "個数問題" : "単一選択")),
      premise: clean(question.premise || legacy.premise),
      stem: clean(question.stem || legacy.stem || question.text),
      statements: Object.freeze(statements),
      choices: Object.freeze(choices),
      answer: Number.isInteger(question.answer) ? question.answer : null,
      explanations: Object.freeze(Array.isArray(question.choiceExplanations) ? question.choiceExplanations.map(clean) : []),
      legacy: !question.premise && !question.stem && !Array.isArray(question.statements)
    });
  }

  function describeQuestion(question, attempt) {
    const item = normalizeQuestion(question);
    const answered = Boolean(attempt && attempt.answered);
    const selectedIndex = Number.isInteger(attempt && attempt.selectedIndex) ? attempt.selectedIndex : null;
    return Object.freeze({
      id: item.id,
      landmarkLabel: `${item.format} ${item.id}`,
      anchors: Object.freeze(["question", "choices", ...(answered ? ["feedback"] : [])]),
      premiseCount: item.premise ? 1 : 0,
      statementCount: item.statements.length,
      explanationVisible: answered,
      selectedIndex,
      answerIndex: item.answer,
      selectedExplanation: answered && selectedIndex !== null ? item.explanations[selectedIndex] || "" : ""
    });
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function scrollToAnchor(host, anchor, reducedMotion) {
    const target = host.querySelector(`[data-reiwa-anchor="${anchor}"]`);
    if (!target) return false;
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: reducedMotion ? "auto" : "smooth" });
    return true;
  }

  function renderQuestion(host, question, attempt, options) {
    if (!host || typeof document === "undefined") throw new Error("renderQuestion requires a DOM host");
    const item = normalizeQuestion(question);
    const state = attempt || {};
    const answered = Boolean(state.answered);
    const selectedIndex = Number.isInteger(state.selectedIndex) ? state.selectedIndex : null;
    const reducedMotion = Boolean(options && options.reducedMotion) ||
      Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const fragment = document.createDocumentFragment();
    const article = node("article", "reiwa-question-view");
    article.setAttribute("aria-label", `${item.format} ${item.id}`);
    const heading = node("h2", "reiwa-question-heading", item.stem);
    heading.dataset.reiwaAnchor = "question";
    heading.tabIndex = -1;
    if (item.premise) {
      const premise = node("section", "reiwa-question-premise");
      premise.setAttribute("aria-label", "共通前提");
      premise.append(node("strong", "reiwa-eyebrow", "共通前提"), node("p", "", item.premise));
      article.append(premise);
    }
    article.append(heading);
    if (item.statements.length) {
      const list = node("ol", "reiwa-statement-list");
      list.setAttribute("aria-label", "記述");
      item.statements.forEach((statement) => {
        const row = node("li", "reiwa-statement");
        row.append(node("strong", "reiwa-statement-label", statement.id), node("span", "", statement.text));
        list.append(row);
      });
      article.append(list);
    }
    const fieldset = node("fieldset", "reiwa-choice-fieldset");
    fieldset.dataset.reiwaAnchor = "choices";
    fieldset.append(node("legend", "", `${item.format}：解答を1つ選ぶ`));
    item.choices.forEach((choice, index) => {
      const button = node("button", "reiwa-choice", choice);
      button.type = "button";
      button.dataset.choiceIndex = String(index);
      button.setAttribute("aria-pressed", String(selectedIndex === index));
      button.disabled = answered;
      if (answered && index === item.answer) button.classList.add("is-correct");
      if (answered && index === selectedIndex && index !== item.answer) button.classList.add("is-selected-wrong");
      if (!answered && options && typeof options.onAnswer === "function") {
        button.addEventListener("click", () => options.onAnswer(index));
      }
      fieldset.append(button);
    });
    article.append(fieldset);
    if (answered) {
      const feedback = node("section", "reiwa-feedback");
      feedback.dataset.reiwaAnchor = "feedback";
      feedback.setAttribute("role", "status");
      const correct = selectedIndex === item.answer;
      feedback.append(node("h3", "", correct ? "正解" : "不正解"));
      if (selectedIndex !== null && item.explanations[selectedIndex]) {
        feedback.append(node("p", "reiwa-selected-explanation", item.explanations[selectedIndex]));
      }
      const details = node("details", "reiwa-all-explanations");
      details.append(node("summary", "", "全肢の判定と理由を開く"));
      item.explanations.forEach((explanation, index) => details.append(node("p", "", `${index + 1}. ${explanation}`)));
      feedback.append(details);
      article.append(feedback);
    }
    fragment.append(article);
    host.replaceChildren(fragment);
    if (options && options.anchor) scrollToAnchor(host, options.anchor, reducedMotion);
    return describeQuestion(question, attempt);
  }

  return Object.freeze({ normalizeQuestion, describeQuestion, renderQuestion, scrollToAnchor });
});
