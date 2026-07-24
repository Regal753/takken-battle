"use strict";

(function exposeQuestionBalance(root) {
  const VERSION = 2;
  const IDENTITY_ORDER = [0, 1, 2, 3];

  function cloneQuestion(question) {
    const copy = {
      ...question,
      choices: [...(question.choices || [])],
      choiceExplanations: [...(question.choiceExplanations || [])]
    };
    if (Array.isArray(question.statementExplanations)) {
      copy.statementExplanations = [...question.statementExplanations];
    }
    return copy;
  }

  function explanationParts(line) {
    const match = String(line || "").match(/^\s*(?:[アイウエ]|[1-4])?\s*([○×])\s*(.*)$/);
    return match ? { marker: match[1], reason: match[2].trim() } : null;
  }

  function statementLines(question) {
    const lines = String(question.text || "").split("\n").slice(1);
    if (lines.length !== 4) return [];
    return lines.map((line) => line.replace(/^\s*[アイウエ]\s*/, "").trim());
  }

  function combinationLabels(indexes) {
    const labels = ["ア", "イ", "ウ", "エ"];
    return indexes.map((index) => labels[index]).join("・");
  }

  function allCombinations(size) {
    const output = [];
    const visit = (start, current) => {
      if (current.length === size) {
        output.push([...current]);
        return;
      }
      for (let index = start; index < 4; index += 1) {
        current.push(index);
        visit(index + 1, current);
        current.pop();
      }
    };
    visit(0, []);
    return output;
  }

  function stringHash(value) {
    return [...String(value || "")].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 0);
  }

  function convertCountQuestion(question) {
    const copy = cloneQuestion(question);
    if (copy.format !== "個数問題") return copy;

    const statements = statementLines(copy);
    const explanations = copy.choiceExplanations.map(explanationParts);
    if (statements.length !== 4 || explanations.some((item) => !item)) return copy;

    const truths = explanations.map((item) => item.marker === "○");
    if (truths.filter(Boolean).length !== copy.answer + 1) return copy;

    const heading = String(copy.text).split("\n")[0];
    const trueIndexes = truths.map((truth, index) => truth ? index : -1).filter((index) => index >= 0);
    if (trueIndexes.length === 1 || trueIndexes.length === 3) {
      const askForTruth = trueIndexes.length === 1;
      const targetIndex = truths.findIndex((truth) => truth === askForTruth);
      const replacement = askForTruth ? "正しいものはどれか。" : "誤っているものはどれか。";
      copy.text = heading.replace(/正しいものはいくつあるか。$/, replacement);
      copy.choices = statements;
      copy.choiceExplanations = explanations.map(
        (item, index) => `${index + 1} ${item.marker} ${item.reason}`
      );
      copy.answer = targetIndex;
    } else if (trueIndexes.length === 2) {
      const replacement = "正しいものの組合せはどれか。";
      const lines = String(copy.text).split("\n");
      lines[0] = heading.replace(/正しいものはいくつあるか。$/, replacement);
      copy.text = lines.join("\n");
      copy.statementExplanations = explanations.map(
        (item, index) => `${["ア", "イ", "ウ", "エ"][index]} ${item.marker} ${item.reason}`
      );
      const correct = combinationLabels(trueIndexes);
      const distractorSize = trueIndexes.length;
      const distractors = allCombinations(distractorSize)
        .map(combinationLabels)
        .filter((label) => label !== correct);
      const offset = distractors.length ? stringHash(copy.id) % distractors.length : 0;
      const rotated = distractors.slice(offset).concat(distractors.slice(0, offset));
      copy.choices = [correct, ...rotated.slice(0, 3)];
      copy.choiceExplanations = copy.choices.map((label, index) => index === 0
        ? `${index + 1} ○ 正しい肢の組合せは${correct}。`
        : `${index + 1} × ${label}は正しい肢の組合せと一致しない。`
      );
      copy.answer = 0;
    } else {
      return copy;
    }
    copy.format = "単一選択";
    copy.balanceSourceFormat = "個数問題";
    copy.balanceVersion = VERSION;
    return copy;
  }

  function canConvertCountQuestion(question) {
    const converted = convertCountQuestion(question);
    return converted.format === "単一選択" && converted.balanceSourceFormat === "個数問題";
  }

  function selectConversionIds(questions, order, targetSingle) {
    const existingSingle = order.filter((id) => questions[id]?.format === "単一選択").length;
    const conversionsNeeded = Math.max(0, targetSingle - existingSingle);
    const countRemaining = new Array(order.length + 1).fill(0);
    for (let index = order.length - 1; index >= 0; index -= 1) {
      countRemaining[index] = countRemaining[index + 1] +
        (canConvertCountQuestion(questions[order[index]]) ? 1 : 0);
    }

    for (let limit = 2; limit <= 5; limit += 1) {
      const memo = new Map();
      const solve = (index, converted, lastFormat, run) => {
        if (converted > conversionsNeeded) return null;
        if (converted + countRemaining[index] < conversionsNeeded) return null;
        if (index >= order.length) return converted === conversionsNeeded ? [] : null;
        const key = `${index}|${converted}|${lastFormat}|${run}`;
        if (memo.has(key)) return memo.get(key);

        const id = order[index];
        const original = questions[id]?.format === "単一選択" ? "S" : "C";
        const convertible = canConvertCountQuestion(questions[id]);
        const options = original === "S"
          ? [{ format: "S", converts: false }]
          : (!convertible
              ? [{ format: "C", converts: false }]
              : lastFormat === "C"
              ? [{ format: "S", converts: true }, { format: "C", converts: false }]
              : [{ format: "C", converts: false }, { format: "S", converts: true }]);

        for (const option of options) {
          const nextRun = option.format === lastFormat ? run + 1 : 1;
          if (nextRun > limit) continue;
          const tail = solve(
            index + 1,
            converted + (option.converts ? 1 : 0),
            option.format,
            nextRun
          );
          if (tail) {
            const result = option.converts ? [id, ...tail] : tail;
            memo.set(key, result);
            return result;
          }
        }
        memo.set(key, null);
        return null;
      };
      const selected = solve(0, 0, "", 0);
      if (selected) return new Set(selected);
    }
    return new Set();
  }

  function validChoiceOrder(input) {
    return Array.isArray(input) &&
      input.length === 4 &&
      [...input].sort((left, right) => left - right).every((value, index) => value === index);
  }

  function orderForTarget(answerIndex, targetIndex) {
    const order = IDENTITY_ORDER.filter((index) => index !== answerIndex);
    order.splice(targetIndex, 0, answerIndex);
    return order;
  }

  function applyChoiceOrder(question, inputOrder) {
    const copy = cloneQuestion(question);
    const order = validChoiceOrder(inputOrder) ? [...inputOrder] : [...IDENTITY_ORDER];
    if (copy.choices.length !== 4 || copy.choiceExplanations.length !== 4) return copy;
    const explanations = copy.choiceExplanations.map(explanationParts);
    if (explanations.some((item) => !item)) return copy;

    copy.choices = order.map((index) => copy.choices[index]);
    copy.choiceExplanations = order.map((index, position) => {
      const item = explanations[index];
      return `${position + 1} ${item.marker} ${item.reason}`;
    });
    copy.answer = order.indexOf(copy.answer);
    copy.choiceOriginIndexes = order;
    return copy;
  }

  function auditQuestions(questions, order) {
    const formats = {};
    const answers = [0, 0, 0, 0];
    let lastFormat = "";
    let run = 0;
    let maxFormatRun = 0;
    let converted = 0;

    order.forEach((id) => {
      const question = questions[id];
      if (!question) return;
      formats[question.format] = (formats[question.format] || 0) + 1;
      if (Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4) {
        answers[question.answer] += 1;
      }
      converted += question.balanceSourceFormat === "個数問題" ? 1 : 0;
      if (question.format === lastFormat) run += 1;
      else {
        lastFormat = question.format;
        run = 1;
      }
      maxFormatRun = Math.max(maxFormatRun, run);
    });

    return { version: VERSION, total: order.length, formats, answers, converted, maxFormatRun };
  }

  function rebalanceQuestions({ questions, order, choiceOrders = {}, lockedIds = [], currentAnsweredId = null }) {
    const prepared = {};
    const nextChoiceOrders = { ...choiceOrders };
    const locked = new Set(lockedIds);
    if (currentAnsweredId) locked.add(currentAnsweredId);
    const answerCounts = [0, 0, 0, 0];
    const candidates = [];
    const conversionIds = selectConversionIds(questions, order, Math.round(order.length * 0.55));

    order.forEach((id) => {
      const source = questions[id];
      if (!source) return;
      const question = id === currentAnsweredId || !conversionIds.has(id)
        ? cloneQuestion(source)
        : convertCountQuestion(source);
      prepared[id] = question;

      if (question.format !== "単一選択") {
        answerCounts[question.answer] += 1;
        return;
      }

      const savedOrder = nextChoiceOrders[id];
      if (validChoiceOrder(savedOrder)) {
        prepared[id] = applyChoiceOrder(question, savedOrder);
        answerCounts[prepared[id].answer] += 1;
        return;
      }

      if (locked.has(id)) {
        nextChoiceOrders[id] = [...IDENTITY_ORDER];
        answerCounts[question.answer] += 1;
        return;
      }

      candidates.push(id);
    });

    candidates.forEach((id) => {
      const question = prepared[id];
      const target = answerCounts.indexOf(Math.min(...answerCounts));
      const choiceOrder = orderForTarget(question.answer, target);
      nextChoiceOrders[id] = choiceOrder;
      prepared[id] = applyChoiceOrder(question, choiceOrder);
      answerCounts[prepared[id].answer] += 1;
    });

    return {
      questions: prepared,
      choiceOrders: nextChoiceOrders,
      audit: auditQuestions(prepared, order)
    };
  }

  const api = {
    VERSION,
    applyChoiceOrder,
    auditQuestions,
    convertCountQuestion,
    rebalanceQuestions
  };

  if (root) root.TAKKEN_BALANCE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : null);
