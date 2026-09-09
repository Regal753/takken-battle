"use strict";

(() => {
  const base = window.TAKKEN_EXAM_QUESTIONS;
  const blueprint = window.TAKKEN_EXAM_BLUEPRINT;
  if (!base || !blueprint) throw new Error("v50 core and blueprint are required");

  const LABELS = ["ア", "イ", "ウ", "エ"];
  const FORM_KEYS = ["a", "b", "c"];
  const SECTIONS = ["rights", "restrictions", "tax", "business", "other"];
  const SECTION_PLAN = Object.freeze({
    rights: Object.freeze({ single: 10, count: 2, combination: 2 }),
    restrictions: Object.freeze({ single: 6, count: 1, combination: 1 }),
    tax: Object.freeze({ single: 2, count: 1, combination: 0 }),
    business: Object.freeze({ single: 14, count: 4, combination: 2 }),
    other: Object.freeze({ single: 4, count: 0, combination: 1 })
  });
  const GUARANTEE_ASSOCIATION = /保証協会|弁済業務保証金|弁済業務保証金分担金|還付充当金/;

  const CURRENT_LAW_BY_SOURCE = Object.freeze({
    r025: Object.freeze(["condominium-r8-enforcement"]),
    r026: Object.freeze(["condominium-r8-enforcement"]),
    r028: Object.freeze(["address-change-registration-r8"]),
    b020: Object.freeze(["takken-35-mansion-manager-r8"]),
    b040: Object.freeze(["takken-35-mansion-manager-r8"]),
    t004: Object.freeze(["registration-tax-land-sale-extension"]),
    t005: Object.freeze(["stamp-tax-real-estate-contract-relief"]),
    o009: Object.freeze(["land-price-publication-r8"]),
    o010: Object.freeze(["land-price-publication-r8", "housing-starts-fy-r7"])
  });
  const CURRENT_LAW_FALLBACK = Object.freeze({
    "condominium-r8-enforcement": Object.freeze({ id: "condominium-r8-enforcement", sourceUrl: "https://www.moj.go.jp/MINJI/minji07_00375.html", verifiedAt: "2026-09-10" }),
    "address-change-registration-r8": Object.freeze({ id: "address-change-registration-r8", sourceUrl: "https://www.moj.go.jp/MINJI/jushohenko/", verifiedAt: "2026-09-10" }),
    "takken-35-mansion-manager-r8": Object.freeze({ id: "takken-35-mansion-manager-r8", sourceUrl: "https://www.mlit.go.jp/totikensangyo/const/1_6_bt_000268.html", verifiedAt: "2026-09-10" }),
    "registration-tax-land-sale-extension": Object.freeze({ id: "registration-tax-land-sale-extension", sourceUrl: "https://www.mlit.go.jp/totikensangyo/totikensangyo_tk5_000072.html", verifiedAt: "2026-09-10" }),
    "stamp-tax-real-estate-contract-relief": Object.freeze({ id: "stamp-tax-real-estate-contract-relief", sourceUrl: "https://www.nta.go.jp/law/shitsugi/inshi/08/10.htm", verifiedAt: "2026-09-10" }),
    "land-price-publication-r8": Object.freeze({ id: "land-price-publication-r8", sourceUrl: "https://www.mlit.go.jp/totikensangyo/content/001985434.pdf", verifiedAt: "2026-09-10" }),
    "housing-starts-fy-r7": Object.freeze({ id: "housing-starts-fy-r7", sourceUrl: "https://www.mlit.go.jp/report/press/joho04_hh_001367.html", verifiedAt: "2026-09-10" })
  });
  const currentLawById = new Map(Object.values(CURRENT_LAW_FALLBACK).map((item) => [item.id, item]));
  (window.TAKKEN_CURRENT_LAW_SOURCE_LEDGER?.ledger || []).forEach((item) => currentLawById.set(item.id, item));

  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const semanticFact = (value) => clean(value).replace(/[\s、。・「」『』（）()，,]/g, "");
  const truthMarker = (value) => /^\s*(?:[1-4]|[アイウエ])\s*([○×])\s*/.exec(value || "")?.[1];
  const explanationReason = (value) => String(value || "")
    .replace(/^\s*(?:[1-4]|[アイウエ])\s*[○×]\s*/, "")
    .trim()
    .replace(/^(?:[アイウエ]|第[1-4]肢)は[、，]?\s*/, "");
  const hash = (value) => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  };
  const compareScore = (left, right) => {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }
    return 0;
  };

  function eligibleSource(question, sectionId) {
    return question?.sectionId === sectionId
      && ["単一選択", "個数問題"].includes(question.format)
      && Array.isArray(question.choiceFacts) && question.choiceFacts.length === 4
      && Array.isArray(question.choiceTruths) && question.choiceTruths.length === 4
      && Array.isArray(question.choiceExplanations) && question.choiceExplanations.length === 4
      && !GUARANTEE_ASSOCIATION.test([question.tag, question.text, ...question.choiceFacts].join(" "));
  }

  function optionPremise(question) {
    const prompt = clean(String(question.text || "").split("\n")[0]);
    if (question.format === "個数問題") return `${question.tag}について、`;
    if (/^次の.+(?:判断|確認)する。$/.test(prompt)) return `${question.tag}について、`;
    const streamlined = prompt.replace(/に関する(?:次の)?(?:事例|記述)である。/g, "について、");
    if (streamlined !== prompt) return streamlined;
    return /[。！？、]$/.test(prompt) ? prompt : `${prompt}。`;
  }

  function makeAtom(question, choiceIndex) {
    const marker = truthMarker(question.choiceExplanations[choiceIndex]);
    if (!marker) throw new Error(`${question.id}:${choiceIndex}: missing truth marker`);
    const truth = marker === "○";
    if (Boolean(question.choiceTruths[choiceIndex]) !== truth) throw new Error(`${question.id}:${choiceIndex}: truth metadata drift`);
    return Object.freeze({
      atomId: `${question.id}#${choiceIndex}`,
      questionId: question.id,
      choiceIndex,
      sourcePrompt: question.text,
      sourceChoice: question.choiceFacts[choiceIndex],
      truth,
      sourceExplanation: question.choiceExplanations[choiceIndex],
      reason: explanationReason(question.choiceExplanations[choiceIndex])
    });
  }

  function buildSectionSource(sectionId) {
    const questions = Object.values(base).filter((question) => eligibleSource(question, sectionId)).sort((left, right) => left.id.localeCompare(right.id, "en"));
    const atomsByQuestion = new Map();
    const pairs = [];
    questions.forEach((question) => {
      const atoms = question.choiceFacts.map((_, choiceIndex) => makeAtom(question, choiceIndex));
      atomsByQuestion.set(question.id, atoms);
      for (let first = 0; first < atoms.length - 1; first += 1) {
        for (let second = first + 1; second < atoms.length; second += 1) {
          if (semanticFact(atoms[first].sourceChoice) === semanticFact(atoms[second].sourceChoice)) continue;
          const pairKey = [atoms[first].atomId, atoms[second].atomId].sort().join("+");
          const semanticPairKey = `${question.id}|${[semanticFact(atoms[first].sourceChoice), semanticFact(atoms[second].sourceChoice)].sort().join("+")}`;
          pairs.push(Object.freeze({ question, first: atoms[first], second: atoms[second], pairKey, semanticPairKey, truth: atoms[first].truth && atoms[second].truth }));
        }
      }
    });
    return Object.freeze({ questions: Object.freeze(questions), atomsByQuestion, pairs: Object.freeze(pairs) });
  }

  const sectionSources = Object.fromEntries(SECTIONS.map((sectionId) => [sectionId, buildSectionSource(sectionId)]));
  const selectionState = Object.fromEntries(SECTIONS.map((sectionId) => {
    const source = sectionSources[sectionId];
    return [sectionId, {
      sourceUsage: new Map(source.questions.map((question) => [question.id, 0])),
      atomUsage: new Map(source.questions.flatMap((question) => source.atomsByQuestion.get(question.id)).map((atom) => [atom.atomId, 0])),
      pairUsage: new Map(source.pairs.map((pair) => [pair.semanticPairKey, 0])),
      pairForms: new Map(source.pairs.map((pair) => [pair.semanticPairKey, new Set()])),
      trueSourceFormUsage: new Map(source.questions.map((question) => [question.id, [0, 0, 0]])),
      falsePatternUsage: new Map([["FT", 0], ["TF", 0], ["FF", 0]])
    }];
  }));
  const usedSourceQuartets = new Set();

  function buildAnswerPlan(counts, seed) {
    const remaining = counts.slice();
    const result = [];
    while (remaining.some((count) => count > 0)) {
      const candidates = remaining.map((count, index) => ({ count, index }))
        .filter((item) => item.count > 0)
        .filter((item) => result.length < 2 || result.at(-1) !== item.index || result.at(-2) !== item.index)
        .sort((left, right) => right.count - left.count
          || hash(`${seed}|${result.length}|${left.index}`) - hash(`${seed}|${result.length}|${right.index}`)
          || left.index - right.index);
      if (!candidates.length) throw new Error(`${seed}: cannot avoid an answer run of three`);
      result.push(candidates[0].index);
      remaining[candidates[0].index] -= 1;
    }
    return Object.freeze(result);
  }

  const ANSWER_PLANS = Object.freeze(FORM_KEYS.map((formKey, formIndex) => Object.freeze({
    single: buildAnswerPlan([9, 9, 9, 9], `${formKey}|single`),
    count: buildAnswerPlan([2, 2, 2, 2], `${formKey}|count`),
    combination: buildAnswerPlan([0, 1, 2, 3].map((index) => ((index + formIndex) % 4 < 2 ? 2 : 1)), `${formKey}|combination`)
  })));

  function buildIncorrectOrdinals(answerPlan, formIndex) {
    const targets = [3, 12, 24, 33].map((value) => Math.min(35, value + formIndex));
    const selected = new Set();
    [0, 1, 2, 3].forEach((answer) => {
      const ordinal = answerPlan.map((value, index) => ({ value, index }))
        .filter((item) => item.value === answer && !selected.has(item.index))
        .sort((left, right) => Math.abs(left.index - targets[answer]) - Math.abs(right.index - targets[answer]) || left.index - right.index)[0].index;
      selected.add(ordinal);
    });
    return selected;
  }

  const INCORRECT_SINGLE_ORDINALS = ANSWER_PLANS.map((plans, formIndex) => buildIncorrectOrdinals(plans.single, formIndex));
  const TRUE_POSITION_PAIRS = Object.freeze([[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]].map(Object.freeze));

  function combinationsOfTruePositions(count) {
    const patterns = [];
    for (let mask = 0; mask < 16; mask += 1) {
      const pattern = [0, 1, 2, 3].map((index) => Boolean(mask & (1 << index)));
      if (pattern.filter(Boolean).length === count) patterns.push(pattern);
    }
    return patterns;
  }

  function truthPattern(formatFamily, formIndex, familyOrdinal, answer) {
    if (formatFamily === "single") {
      const askIncorrect = INCORRECT_SINGLE_ORDINALS[formIndex].has(familyOrdinal);
      return { askIncorrect, values: [0, 1, 2, 3].map((index) => askIncorrect ? index !== answer : index === answer) };
    }
    if (formatFamily === "count") {
      const candidates = combinationsOfTruePositions(answer + 1);
      const occurrence = Math.floor(familyOrdinal / 4);
      return { askIncorrect: false, values: candidates[(answer + occurrence + (formIndex * 2)) % candidates.length] };
    }
    const pair = TRUE_POSITION_PAIRS[(familyOrdinal + (formIndex * 2)) % TRUE_POSITION_PAIRS.length];
    return { askIncorrect: false, values: [0, 1, 2, 3].map((index) => pair.includes(index)) };
  }

  const STEMS = Object.freeze({
    singleCorrect: Object.freeze([
      "令和8年4月1日現在の法令によれば、次の記述のうち、正しいものはどれか。",
      "次の記述のうち、令和8年4月1日現在の法令上、正しいものはどれか。",
      "令和8年4月1日現在の法令に照らし、次の記述のうち、正しいものはどれか。"
    ]),
    singleIncorrect: Object.freeze([
      "令和8年4月1日現在の法令によれば、次の記述のうち、誤っているものはどれか。",
      "次の記述のうち、令和8年4月1日現在の法令上、誤っているものはどれか。",
      "令和8年4月1日現在の法令に照らし、次の記述のうち、誤っているものはどれか。"
    ]),
    count: Object.freeze([
      "令和8年4月1日現在の法令によれば、次のアからエまでの記述のうち、正しいものはいくつあるか。",
      "次のアからエまでの記述のうち、令和8年4月1日現在の法令上、正しいものはいくつあるか。",
      "令和8年4月1日現在の法令に照らし、次のアからエまでの記述のうち、正しいものの数はいくつか。"
    ]),
    combination: Object.freeze([
      "令和8年4月1日現在の法令によれば、次のアからエまでの記述のうち、正しいものの組合せはどれか。",
      "次のアからエまでの記述のうち、令和8年4月1日現在の法令上、正しいものの組合せはどれか。",
      "令和8年4月1日現在の法令に照らし、次のアからエまでの記述のうち、正しいものの組合せはどれか。"
    ])
  });

  function pairCandidates(sectionId, wantedTruth, formIndex, usedSourceIds, localSourceUsage, localAtomUsage, localPairUsage, seed) {
    const state = selectionState[sectionId];
    return sectionSources[sectionId].pairs
      .filter((pair) => pair.truth === wantedTruth && !usedSourceIds.has(pair.question.id))
      .filter((pair) => !state.pairForms.get(pair.semanticPairKey).has(formIndex))
      .map((pair) => {
        const firstUsage = (state.atomUsage.get(pair.first.atomId) || 0) + (localAtomUsage.get(pair.first.atomId) || 0);
        const secondUsage = (state.atomUsage.get(pair.second.atomId) || 0) + (localAtomUsage.get(pair.second.atomId) || 0);
        const sourceUsage = (state.sourceUsage.get(pair.question.id) || 0) + (localSourceUsage.get(pair.question.id) || 0);
        const pairUsage = (state.pairUsage.get(pair.semanticPairKey) || 0) + (localPairUsage.get(pair.semanticPairKey) || 0);
        const pattern = `${pair.first.truth ? "T" : "F"}${pair.second.truth ? "T" : "F"}`;
        const truePairCapacity = sectionSources[sectionId].pairs.filter((candidate) => candidate.question.id === pair.question.id && candidate.truth).length;
        const formCapacityPressure = wantedTruth ? Math.round((((state.trueSourceFormUsage.get(pair.question.id)?.[formIndex] || 0) + 1) * 100) / truePairCapacity) : 0;
        return {
          ...pair,
          pattern,
          score: [
            pairUsage,
            formCapacityPressure,
            sourceUsage,
            Math.max(firstUsage + 1, secondUsage + 1),
            firstUsage + secondUsage,
            wantedTruth ? 0 : state.falsePatternUsage.get(pattern) || 0,
            hash(`${seed}|${pair.semanticPairKey}|${pattern}`)
          ]
        };
      })
      .sort((left, right) => compareScore(left.score, right.score));
  }

  function selectQuestionPairs(sectionId, truthValues, formIndex, seed) {
    const chosen = [];
    const usedSourceIds = new Set();
    const localSourceUsage = new Map();
    const localAtomUsage = new Map();
    const localPairUsage = new Map();

    function visit(displayIndex) {
      if (displayIndex === truthValues.length) {
        const quartetKey = [...usedSourceIds].sort().join(",");
        return !usedSourceQuartets.has(quartetKey);
      }
      const candidates = pairCandidates(sectionId, truthValues[displayIndex], formIndex, usedSourceIds, localSourceUsage, localAtomUsage, localPairUsage, `${seed}|${displayIndex}`);
      for (const candidate of candidates.slice(0, 80)) {
        chosen.push(candidate);
        usedSourceIds.add(candidate.question.id);
        localSourceUsage.set(candidate.question.id, 1);
        [candidate.first, candidate.second].forEach((atom) => localAtomUsage.set(atom.atomId, (localAtomUsage.get(atom.atomId) || 0) + 1));
        localPairUsage.set(candidate.semanticPairKey, (localPairUsage.get(candidate.semanticPairKey) || 0) + 1);
        if (visit(displayIndex + 1)) return true;
        localPairUsage.delete(candidate.semanticPairKey);
        [candidate.first, candidate.second].forEach((atom) => localAtomUsage.delete(atom.atomId));
        localSourceUsage.delete(candidate.question.id);
        usedSourceIds.delete(candidate.question.id);
        chosen.pop();
      }
      return false;
    }

    if (!visit(0)) throw new Error(`${sectionId}/${seed}: unable to select four same-scenario two-atom options`);
    const quartetKey = chosen.map((pair) => pair.question.id).sort().join(",");
    if (usedSourceQuartets.has(quartetKey)) throw new Error(`${sectionId}/${seed}: duplicate source quartet ${quartetKey}`);
    usedSourceQuartets.add(quartetKey);
    const state = selectionState[sectionId];
    chosen.forEach((pair) => {
      state.sourceUsage.set(pair.question.id, (state.sourceUsage.get(pair.question.id) || 0) + 1);
      [pair.first, pair.second].forEach((atom) => state.atomUsage.set(atom.atomId, (state.atomUsage.get(atom.atomId) || 0) + 1));
      state.pairUsage.set(pair.semanticPairKey, (state.pairUsage.get(pair.semanticPairKey) || 0) + 1);
      state.pairForms.get(pair.semanticPairKey).add(formIndex);
      if (pair.truth) state.trueSourceFormUsage.get(pair.question.id)[formIndex] += 1;
      if (!pair.truth) state.falsePatternUsage.set(pair.pattern, (state.falsePatternUsage.get(pair.pattern) || 0) + 1);
    });
    return chosen;
  }

  function pairExplanation(option, displayIndex) {
    const [first, second] = option.components;
    let conclusion;
    if (option.truth) conclusion = "第1判定・第2判定がともに正しいため、肢全体は○。";
    else if (!first.truth && !second.truth) conclusion = "第1判定・第2判定がともに誤っているため、肢全体は×。";
    else conclusion = `${first.truth ? "第2判定" : "第1判定"}が誤っているため、肢全体は×。`;
    return `${LABELS[displayIndex]} ${option.truth ? "○" : "×"} 第1判定${first.truth ? "○" : "×"}：${first.reason} 第2判定${second.truth ? "○" : "×"}：${second.reason} ${conclusion}`;
  }

  function makeQuestion(sectionId, formatFamily, formIndex, number, familyOrdinal) {
    const answerTarget = ANSWER_PLANS[formIndex][formatFamily][familyOrdinal];
    const pattern = truthPattern(formatFamily, formIndex, familyOrdinal, answerTarget);
    const pairs = selectQuestionPairs(sectionId, pattern.values, formIndex, `${formIndex}|${number}|${formatFamily}`);
    const optionRows = pairs.map((pair, displayIndex) => {
      const orderedAtoms = hash(`${formIndex}|${number}|${displayIndex}|${pair.pairKey}`) % 2 ? [pair.first, pair.second] : [pair.second, pair.first];
      const premise = optionPremise(pair.question);
      const displayText = `${premise}${orderedAtoms[0].sourceChoice} また、${orderedAtoms[1].sourceChoice}`;
      const components = orderedAtoms.map((atom, componentIndex) => ({
        position: componentIndex === 0 ? "第1判定" : "第2判定",
        atomId: atom.atomId,
        questionId: atom.questionId,
        choiceIndex: atom.choiceIndex,
        sourcePrompt: atom.sourcePrompt,
        sourceChoice: atom.sourceChoice,
        displayText: atom.sourceChoice,
        truth: atom.truth,
        sourceExplanation: atom.sourceExplanation,
        reason: atom.reason
      }));
      return {
        label: LABELS[displayIndex],
        questionId: pair.question.id,
        premise,
        displayText,
        truth: components.every((component) => component.truth),
        semanticPairKey: pair.semanticPairKey,
        components
      };
    });

    const stemGroup = formatFamily === "single" ? (pattern.askIncorrect ? STEMS.singleIncorrect : STEMS.singleCorrect) : STEMS[formatFamily];
    const stem = stemGroup[(number + formIndex) % stemGroup.length];
    const statements = optionRows.map((row) => `${row.label}　${row.displayText}`);
    let choices;
    let answer;
    if (formatFamily === "single") {
      choices = optionRows.map((row) => row.displayText);
      answer = answerTarget;
    } else if (formatFamily === "count") {
      choices = ["一つ", "二つ", "三つ", "四つ"];
      answer = optionRows.filter((row) => row.truth).length - 1;
    } else {
      const correctPair = optionRows.filter((row) => row.truth).map((row) => row.label).join("・");
      const allPairs = TRUE_POSITION_PAIRS.map((pair) => pair.map((index) => LABELS[index]).join("・"));
      const correctPairIndex = allPairs.indexOf(correctPair);
      const distractors = [1, 3, 5]
        .map((offset) => allPairs[(correctPairIndex + offset + formIndex + familyOrdinal) % allPairs.length])
        .filter((value, index, values) => value !== correctPair && values.indexOf(value) === index);
      for (const candidate of allPairs) {
        if (distractors.length >= 3) break;
        if (candidate !== correctPair && !distractors.includes(candidate)) distractors.push(candidate);
      }
      choices = distractors.slice(0, 3);
      choices.splice(answerTarget, 0, correctPair);
      answer = answerTarget;
    }

    const sourceQuestionIds = optionRows.map((row) => row.questionId);
    const flattenedComponents = optionRows.flatMap((row) => row.components);
    const legalSources = sourceQuestionIds.map((id) => ({ id, label: base[id].sourceRef, url: base[id].sourceUrl }));
    const sourceUrls = [...new Set(legalSources.map((item) => item.url))];
    const currentLawSourceIds = [...new Set(sourceQuestionIds.flatMap((id) => CURRENT_LAW_BY_SOURCE[id] || []))];
    const currentLawSources = currentLawSourceIds.map((id) => {
      const item = currentLawById.get(id);
      if (!item) throw new Error(`${id}: missing current-law ledger bridge`);
      return { id, url: item.sourceUrl, verifiedAt: item.verifiedAt };
    });
    const verifiedAt = [...sourceQuestionIds.map((id) => base[id].verifiedAt), ...currentLawSources.map((item) => item.verifiedAt)].filter(Boolean).sort().at(-1);
    const topicKey = optionRows.map((row) => row.semanticPairKey).sort().join("|");
    const text = `${stem}\n${formatFamily === "single" ? choices.map((choice, index) => `${LABELS[index]}　${choice}`).join("\n") : statements.join("\n")}`;

    return {
      id: `reiwa-${FORM_KEYS[formIndex]}-${String(number).padStart(2, "0")}`,
      formId: `reiwa-form-${FORM_KEYS[formIndex]}`,
      number,
      sectionId,
      tag: `令和複合・${sourceQuestionIds.map((id) => base[id].tag).join("・").slice(0, 80)}`,
      formatFamily,
      format: formatFamily === "single" ? "単一選択" : formatFamily === "count" ? "個数問題" : "組合せ問題",
      premise: "",
      stem,
      statements: formatFamily === "single" ? [] : statements,
      facts: optionRows.map((row) => row.displayText),
      actors: [...new Set((text.match(/[Ａ-ＤA-D]/g) || []).map((actor) => actor.normalize("NFKC")))],
      topicKey,
      sourceQuestionIds,
      sourceAtomIds: flattenedComponents.map((component) => component.atomId),
      sourceChoices: optionRows,
      legalSources,
      sourceRef: [...new Set(legalSources.map((item) => item.label))].join("／"),
      sourceUrls,
      sourceUrl: sourceUrls[0],
      sourceLocator: flattenedComponents.map((component) => `${component.questionId}:肢${component.choiceIndex + 1}`).join(" | "),
      currentLawSourceIds,
      currentLawSources,
      effectiveDate: blueprint.legalBaseline,
      legalBaseline: blueprint.legalBaseline,
      verifiedAt,
      scenarioDate: "2026-04-01",
      changeNote: "一つの元設問の共通事例へ二つの原子肢を組み合わせ、二段階の法的判断を要する複合肢へ再構成。",
      explain: "各肢の共通事例を一度だけ読み、第1判定と第2判定を別々に確認し、両方が正しい場合に限り肢全体を正しいとする。",
      trap: "同じ当事者・取引・時点を維持したまま、二つの要件又は効果を個別に判定する。",
      memoryRule: "一事例二判定。第1・第2を○×に分け、最後にANDで肢全体を確定する。",
      choiceFacts: optionRows.map((row) => row.displayText),
      choiceTruths: optionRows.map((row) => row.truth),
      text,
      choices,
      answer,
      choiceExplanations: optionRows.map(pairExplanation)
    };
  }

  const forms = FORM_KEYS.map((formKey, formIndex) => {
    let number = 0;
    const familyOrdinals = { single: 0, count: 0, combination: 0 };
    const questions = [];
    for (const sectionId of SECTIONS) {
      for (const formatFamily of ["single", "count", "combination"]) {
        for (let offset = 0; offset < SECTION_PLAN[sectionId][formatFamily]; offset += 1) {
          questions.push(makeQuestion(sectionId, formatFamily, formIndex, number + 1, familyOrdinals[formatFamily]));
          number += 1;
          familyOrdinals[formatFamily] += 1;
        }
      }
    }
    return Object.freeze({ id: `reiwa-form-${formKey}`, label: `令和実戦フォーム${formKey.toUpperCase()}`, questions: Object.freeze(questions) });
  });

  const scheduling = Object.freeze(Object.fromEntries(SECTIONS.map((sectionId) => {
    const state = selectionState[sectionId];
    const sourceUsage = Object.fromEntries(state.sourceUsage);
    const atomUsage = Object.fromEntries(state.atomUsage);
    const pairUsage = Object.fromEntries(state.pairUsage);
    return [sectionId, Object.freeze({
      sourceCount: sectionSources[sectionId].questions.length,
      sourceUsage: Object.freeze(sourceUsage),
      atomCount: state.atomUsage.size,
      atomUsage: Object.freeze(atomUsage),
      pairCount: state.pairUsage.size,
      pairUsage: Object.freeze(pairUsage),
      maxPairReuse: Math.max(...Object.values(pairUsage)),
      falsePatternUsage: Object.freeze(Object.fromEntries(state.falsePatternUsage))
    })];
  })));

  window.TAKKEN_REIWA_EXAM_BANK = Object.freeze({ version: 51, forms: Object.freeze(forms), scheduling });
})();
