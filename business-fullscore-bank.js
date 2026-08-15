"use strict";

(function attachBusinessFullScoreBank(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_BUSINESS_FULLSCORE_BANK = api;
  if (root.window && root.window !== root) root.window.TAKKEN_BUSINESS_FULLSCORE_BANK = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBusinessFullScoreBank(runtime) {
  const blueprint = runtime.TAKKEN_EXAM_BLUEPRINT || runtime.window?.TAKKEN_EXAM_BLUEPRINT;
  const baseQuestions = runtime.TAKKEN_EXAM_QUESTIONS || runtime.window?.TAKKEN_EXAM_QUESTIONS;
  const supplement = runtime.TAKKEN_BUSINESS_FULLSCORE_SUPPLEMENT ||
    runtime.window?.TAKKEN_BUSINESS_FULLSCORE_SUPPLEMENT;
  if (!blueprint || !baseQuestions || !supplement) {
    throw new Error("business full-score bank requires exam blueprint, base questions and full-score supplement");
  }

  const VERSION = 2;
  const kana = Object.freeze(["ア", "イ", "ウ", "エ"]);
  const countLabels = Object.freeze(["一つ", "二つ", "三つ", "四つ"]);
  const formatLabels = Object.freeze({
    single: "単一選択",
    combination: "組合せ問題",
    count: "個数問題",
    case: "ケース問題"
  });
  const allowedDiagnosticTags = Object.freeze([
    "subject",
    "timing",
    "counterparty",
    "number",
    "principle-exception",
    "article-35",
    "article-37",
    "eight-restrictions",
    "transaction-type",
    "amendment"
  ]);
  const allowedDiagnosticTagSet = new Set(allowedDiagnosticTags);
  // These are complete proposition-level rewrites, not word deletions. The source
  // statement, truth value and reason remain available in sourceFacts; only the
  // learner-facing statement is neutralized so an absolute word is not an answer cue.
  const neutralStatementOverrides = Object.freeze({
    "b002:0": "国土交通大臣免許業者に対しては、業務地の都道府県知事に監督権限が認められない。",
    "b002:3": "事務所が二つ以上あることだけで、同一都道府県内の配置でも国土交通大臣免許となる。",
    "b003:2": "道路交通法上の反則金を一度納付した者は、その後も欠格状態が解消しない。",
    "b005:1": "宅建業者への就職が、資格登録の必須要件である。",
    "b005:2": "資格登録は5年ごとの更新制であり、更新手続をしないと効力を失う。",
    "b005:3": "破産手続開始決定を受けた者は、復権後も登録資格を回復しない。",
    "b007:1": "専任宅建士が不足した場合について、法定の補充期限は定められていない。",
    "b009:2": "免許通知を受けていれば、営業保証金の供託を終える前から営業を開始できる。",
    "b009:3": "営業保証金の供託には、国債証券を用いることが認められていない。",
    "b010:1": "還付請求の対象額は、供託額ではなく宅建業者の全財産額を限度とする。",
    "b011:3": "保証協会の社員も、弁済業務保証金分担金とは別に営業保証金の全額を供託する。",
    "b012:0": "宅建業者である相手方も、一般消費者と同じ要件で弁済を受けられる。",
    "b013:0": "帳簿は本店に一冊備えれば足り、支店に備える義務はない。",
    "b015:3": "広告開始と契約締結の時期は、物件や取引態様を区別せず同一の許認可取得時を基準とする。",
    "b016:3": "将来利益の断定的判断は、口頭で提供する限り適法である。",
    "b017:1": "一般媒介契約にも、指定流通機構への登録義務が課される。",
    "b018:1": "低廉な空家等の売買媒介特例は売主側に限られ、買主である依頼者には適用されない。",
    "b020:1": "オンラインで重要事項説明を行う場合は、宅建士証を提示する義務が適用されない。",
    "b023:0": "管理費等の滞納は売主の個人的事情として扱われ、重要事項説明の対象から外れる。",
    "b024:0": "宅建業者は、既存住宅を扱うたびに、自ら建物状況調査を実施する義務を負う。",
    "b024:2": "建物状況調査の結果を説明すると、売主の契約不適合責任は残らない。",
    "b025:2": "37条書面の内容は、宅建士が口頭でも説明する義務を負う。",
    "b026:1": "移転登記の申請時期を契約で定めても、37条書面の記載対象にならない。",
    "b029:1": "Aの事務所で申込みをしたBにも、クーリングオフによる解除権が認められる。",
    "b030:0": "買主が宅建業者でない取引でも、20%制限を排除する特約は有効となる。",
    "b030:3": "受領した手付は、その名称を問わず違約手付として扱われる。",
    "b031:1": "民法より買主に不利な特約も、書面で合意すれば有効となる。",
    "b031:3": "Aの契約不適合責任の全部を免除する特約は、Bに不利な内容でも有効となる。",
    "b032:1": "停止条件付取得契約が存在すれば、条件成就が不確実な段階でもBへ売却できる。",
    "b033:2": "損害賠償額の予定と違約金の合計が20%を超えると、契約の効力が失われる。",
    "b034:3": "買主に不利な特約も、買主が署名したことにより有効となる。",
    "b035:0": "買主への所有権移転登記が済んだ後も、同じ手付金等の保全措置を講じる義務が続く。",
    "b036:3": "Bが1日支払を遅滞すると、Aは催告手続を経ず契約解除と残額一括請求を行える。",
    "b037:0": "通常の広告費や取引不成立時の成功報酬は、依頼者の特別な依頼がなくても、費用名目で法定報酬に加えて請求できる。",
    "b038:0": "他県業者に対して処分できるのは免許権者だけで、業務地の知事には処分権限がない。",
    "b038:2": "軽微な違反にも指示や業務停止を経ず、免許取消処分を選択することになる。",
    "b038:3": "業務停止処分は期間の上限を設けずに定めることができる。",
    "b039:2": "宅建業法違反は行政上の措置に限られ、懲役又は罰金の対象にならない。",
    "b103:0": "中古住宅の媒介だけを行う宅建業者にも、新築住宅を自ら販売する場合と同額の保証金供託義務が生じる。",
    "b103:1": "AとBが資力確保措置を不要と合意すれば、法律上の措置義務は免除される。",
    "b103:3": "買主Bが個人である取引では、Aに供託又は保険契約による資力確保義務は生じない。",
    "b104:2": "Aが保証金を供託している場合、Bへの供託所に関する説明は認められない。"
  });
  const targetByUnit = Object.freeze({
    "business-book-01": Object.freeze({ single: 2, combination: 2, count: 2, case: 2 }),
    "business-book-02": Object.freeze({ single: 2, combination: 2, count: 2, case: 2 }),
    "business-book-03": Object.freeze({ single: 2, combination: 2, count: 2, case: 2 }),
    "business-book-04": Object.freeze({ single: 2, combination: 2, count: 2, case: 2 }),
    "business-book-05": Object.freeze({ single: 2, combination: 2, count: 2, case: 2 }),
    "business-book-06": Object.freeze({ single: 2, combination: 2, count: 2, case: 2 }),
    "business-book-07": Object.freeze({ single: 4, combination: 4, count: 4, case: 4 }),
    "business-book-08": Object.freeze({ single: 3, combination: 3, count: 3, case: 3 }),
    "business-book-09": Object.freeze({ single: 2, combination: 2, count: 2, case: 2 }),
    "business-book-10": Object.freeze({ single: 2, combination: 2, count: 2, case: 2 }),
    "business-book-11": Object.freeze({ single: 2, combination: 2, count: 2, case: 2 })
  });
  const combinationPatterns = Object.freeze([
    Object.freeze({ key: "a-only", a: true, b: false, label: "アのみ正しい" }),
    Object.freeze({ key: "b-only", a: false, b: true, label: "イのみ正しい" }),
    Object.freeze({ key: "both", a: true, b: true, label: "ア・イとも正しい" }),
    Object.freeze({ key: "neither", a: false, b: false, label: "ア・イとも誤り" })
  ]);

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function stableHash(value) {
    return [...String(value || "")].reduce(
      (hash, character) => ((hash * 31) + character.codePointAt(0)) >>> 0,
      2166136261
    );
  }

  function uniqueStrings(values) {
    return [...new Set((values || []).map(cleanText).filter(Boolean))];
  }

  function rotate(values, offset) {
    if (!values.length) return [];
    const start = ((offset % values.length) + values.length) % values.length;
    return [...values.slice(start), ...values.slice(0, start)];
  }

  function placeTargetAtSlot(target, distractors, slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 3 || distractors.length !== 3) {
      throw new Error("invalid answer-slot construction");
    }
    const result = [...distractors];
    result.splice(slot, 0, target);
    return result;
  }

  function reasonText(line) {
    return cleanText(line).replace(/^\s*(?:[ア-ン]|[0-9０-９]+)\s*[○×]\s*/, "");
  }

  function validSourceUrl(value) {
    try {
      const parsed = new URL(String(value || ""));
      return parsed.protocol === "https:" ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function statementTexts(question) {
    if (question.format !== "個数問題") return question.choices.map(cleanText);
    const statements = String(question.text || "")
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([アイウエ])\s+(.+)$/))
      .filter(Boolean)
      .map((match) => cleanText(match[2]));
    if (statements.length !== 4) {
      throw new Error(`${question.id}: count-question statements could not be extracted`);
    }
    return statements;
  }

  function defaultDiagnosticTag(unitId) {
    return ({
      "business-book-01": "transaction-type",
      "business-book-02": "subject",
      "business-book-03": "subject",
      "business-book-04": "number",
      "business-book-05": "counterparty",
      "business-book-06": "subject",
      "business-book-07": "principle-exception",
      "business-book-08": "eight-restrictions",
      "business-book-09": "number",
      "business-book-10": "subject",
      "business-book-11": "counterparty"
    })[unitId] || "principle-exception";
  }

  function diagnosticTagsForFact(fact, unitId) {
    const blob = [
      fact.tag,
      fact.context,
      fact.statement,
      fact.reason,
      fact.sourceRef,
      fact.sourceLocator
    ].join(" ");
    const tags = [];
    if (/(宅建業者|宅建士|免許権者|知事|大臣|相続人|役員|従業者|本人|法人|A|B|甲|乙)/.test(blob)) tags.push("subject");
    if (/(日以内|日前|か月|年間|年以内|期間|期限|遅滞なく|契約前|契約後|引渡し|開始前|終了|更新|施行日|基準日)/.test(blob)) tags.push("timing");
    if (/(相手方|買主|売主|依頼者|一般消費者|取引関係者|宅建業者との取引|宅建業者でない)/.test(blob)) tags.push("counterparty");
    if (/[0-9０-９]|一つ|二つ|三つ|四つ|五人|割合|上限|合計|万円|%|％/.test(blob)) tags.push("number");
    if (/(原則|例外|除き|場合|ただし|できない|不要|必要|有効|無効|制限|免除|足りる)/.test(blob)) tags.push("principle-exception");
    if (/(35条|重要事項説明|重要事項)/.test(blob)) tags.push("article-35");
    if (/(37条|契約内容確認)/.test(blob)) tags.push("article-37");
    if (unitId === "business-book-08" || /(8種制限|クーリングオフ|手付金等|割賦販売|損害賠償額|契約不適合|所有に属しない)/.test(blob)) tags.push("eight-restrictions");
    if (unitId === "business-book-01" || /(売買|交換|貸借|賃貸|媒介|代理|取引類型|宅建業に含)/.test(blob)) tags.push("transaction-type");
    if (/(令和8|2026|改正|管理業者管理者|生物多様性|森林経営管理法|港湾法)/.test(blob)) tags.push("amendment");
    const normalized = uniqueStrings(tags).filter((tag) => allowedDiagnosticTagSet.has(tag));
    return Object.freeze(normalized.length ? normalized : [defaultDiagnosticTag(unitId)]);
  }

  function factsForQuestion(question, unit) {
    if (!question || question.sectionId !== "business") {
      throw new Error(`${question?.id || "unknown"}: expected a business base question`);
    }
    if (!Array.isArray(question.choices) || question.choices.length !== 4) {
      throw new Error(`${question.id}: four choices are required`);
    }
    const explanations = Array.isArray(question.statementExplanations)
      ? question.statementExplanations
      : question.choiceExplanations;
    if (!Array.isArray(explanations) || explanations.length !== 4) {
      throw new Error(`${question.id}: four source explanations are required`);
    }
    const context = cleanText(String(question.text || "").split(/\r?\n/)[0]);
    const statements = statementTexts(question);
    const sourceUrl = validSourceUrl(question.sourceUrl);
    if (!sourceUrl) throw new Error(`${question.id}: official HTTPS source URL is required`);
    return explanations.map((line, index) => {
      const marker = String(line).match(/[○×]/)?.[0];
      if (!marker) throw new Error(`${question.id}/${index + 1}: truth marker is missing`);
      const partial = {
        sourceType: "base",
        key: `${question.id}:${index}`,
        questionId: question.id,
        anchorId: "",
        choiceIndex: index,
        statementIndex: index,
        tag: cleanText(question.tag),
        context,
        statement: statements[index],
        truth: marker === "○",
        reason: reasonText(line),
        explain: cleanText(question.explain),
        trap: cleanText(question.trap),
        memoryRule: cleanText(question.memoryRule),
        sourceRef: cleanText(question.sourceRef),
        sourceLocator: cleanText(question.sourceLocator),
        sourceUrl,
        verifiedAt: cleanText(question.verifiedAt)
      };
      return Object.freeze({
        ...partial,
        presentedStatement: neutralStatementOverrides[partial.key] || partial.statement,
        diagnosticTags: diagnosticTagsForFact(partial, unit.id)
      });
    });
  }

  const textbookRange = blueprint.textbookRanges?.business;
  const baseUnits = textbookRange?.chapters;
  if (!Array.isArray(baseUnits) || baseUnits.length !== 11) {
    throw new Error("business full-score bank requires exactly 11 business textbook units");
  }
  if (cleanText(blueprint.legalBaseline) === "") {
    throw new Error("business full-score bank requires a legal baseline");
  }

  const unitInputs = baseUnits.map((unit) => {
    const target = targetByUnit[unit.id];
    if (!target) throw new Error(`${unit.id}: full-score target is missing`);
    const questions = unit.ids.map((id) => baseQuestions[id]);
    if (questions.some((question) => !question)) {
      throw new Error(`${unit.id}: a configured base question is missing`);
    }
    const facts = questions.flatMap((question) => factsForQuestion(question, unit));
    if (facts.length !== unit.ids.length * 4) {
      throw new Error(`${unit.id}: source fact count is inconsistent`);
    }
    return Object.freeze({ unit, target, facts: Object.freeze(facts) });
  });

  const allBaseFactKeys = unitInputs.flatMap((input) => input.facts.map((fact) => fact.key));
  if (allBaseFactKeys.length !== 176 || new Set(allBaseFactKeys).size !== 176) {
    throw new Error(`business full-score bank requires 176 unique base facts, got ${allBaseFactKeys.length}`);
  }

  const unitById = Object.fromEntries(baseUnits.map((unit) => [unit.id, unit]));

  function validateSupplementDiagnosticTags(tags, owner) {
    if (!Array.isArray(tags) || !tags.length) {
      throw new Error(`${owner}: supplement diagnostic tags are required`);
    }
    const normalized = uniqueStrings(tags);
    if (normalized.length !== tags.length || normalized.some((tag) => !allowedDiagnosticTagSet.has(tag))) {
      throw new Error(`${owner}: supplement diagnostic tags are invalid`);
    }
    return normalized;
  }

  function validateSupplement() {
    if (supplement.VERSION !== 1 || cleanText(supplement.LEGAL_BASELINE) !== cleanText(blueprint.legalBaseline)) {
      throw new Error("business full-score supplement version or legal baseline is incompatible");
    }
    if (!Array.isArray(supplement.ANCHORS) || supplement.ANCHORS.length !== 17 ||
        !Array.isArray(supplement.FACTS) || supplement.FACTS.length !== 68 ||
        !supplement.ANCHORS_BY_ID || typeof supplement.ANCHORS_BY_ID !== "object" ||
        !supplement.FACTS_BY_KEY || typeof supplement.FACTS_BY_KEY !== "object") {
      throw new Error("business full-score supplement must contain 17 anchors and 68 facts");
    }
    const anchorIds = supplement.ANCHORS.map((anchor) => cleanText(anchor?.id));
    const factKeys = supplement.FACTS.map((fact) => cleanText(fact?.key));
    if (anchorIds.some((id) => !/^bs\d{3}$/.test(id)) || new Set(anchorIds).size !== 17 ||
        factKeys.some((key) => !/^bs\d{3}:[0-3]$/.test(key)) || new Set(factKeys).size !== 68 ||
        factKeys.some((key) => allBaseFactKeys.includes(key))) {
      throw new Error("business full-score supplement IDs must be unique and collision-free");
    }
    supplement.ANCHORS.forEach((anchor) => {
      const owner = cleanText(anchor.id);
      if (supplement.ANCHORS_BY_ID[owner] !== anchor || !unitById[anchor.unitId] ||
          !cleanText(anchor.tag) || !cleanText(anchor.prompt) ||
          !Array.isArray(anchor.statements) || anchor.statements.length !== 4 ||
          !Array.isArray(anchor.truths) || anchor.truths.length !== 4 ||
          !Array.isArray(anchor.reasons) || anchor.reasons.length !== 4 ||
          anchor.statements.some((value) => !cleanText(value)) ||
          anchor.reasons.some((value) => !cleanText(value)) ||
          anchor.truths.some((value) => typeof value !== "boolean") ||
          !validSourceUrl(anchor.sourceUrl) || !cleanText(anchor.sourceLocator) || !cleanText(anchor.verifiedAt)) {
        throw new Error(`${owner}: supplement anchor is invalid`);
      }
      validateSupplementDiagnosticTags(anchor.diagnosticTags, owner);
      const anchorFacts = supplement.FACTS.filter((fact) => fact.anchorId === owner);
      if (anchorFacts.length !== 4 || new Set(anchorFacts.map((fact) => fact.statementIndex)).size !== 4) {
        throw new Error(`${owner}: supplement anchor must expose four indexed facts`);
      }
    });
    supplement.FACTS.forEach((fact) => {
      const owner = cleanText(fact?.key);
      const anchor = supplement.ANCHORS_BY_ID[fact?.anchorId];
      const index = fact?.statementIndex;
      if (supplement.FACTS_BY_KEY[owner] !== fact || !anchor || !Number.isInteger(index) || index < 0 || index > 3 ||
          owner !== `${anchor.id}:${index}` || fact.unitId !== anchor.unitId || cleanText(fact.tag) !== cleanText(anchor.tag) ||
          cleanText(fact.prompt) !== cleanText(anchor.prompt) || cleanText(fact.statement) !== cleanText(anchor.statements[index]) ||
          fact.truth !== anchor.truths[index] || cleanText(fact.reason) !== cleanText(anchor.reasons[index]) ||
          cleanText(fact.sourceUrl) !== cleanText(anchor.sourceUrl) ||
          cleanText(fact.sourceLocator) !== cleanText(anchor.sourceLocator) ||
          cleanText(fact.verifiedAt) !== cleanText(anchor.verifiedAt)) {
        throw new Error(`${owner}: supplement fact is not traceable to its anchor`);
      }
      validateSupplementDiagnosticTags(fact.diagnosticTags, owner);
    });
  }

  validateSupplement();

  const supplementFacts = Object.freeze(supplement.FACTS.map((fact) => {
    const partial = {
      sourceType: "supplement",
      key: cleanText(fact.key),
      questionId: cleanText(fact.anchorId),
      anchorId: cleanText(fact.anchorId),
      choiceIndex: fact.statementIndex,
      statementIndex: fact.statementIndex,
      tag: cleanText(fact.tag),
      context: cleanText(fact.prompt),
      statement: cleanText(fact.statement),
      truth: fact.truth,
      reason: cleanText(fact.reason),
      explain: cleanText(fact.reason),
      trap: cleanText(fact.reason),
      memoryRule: cleanText(fact.reason),
      sourceRef: `宅建業法補強・${cleanText(fact.tag)}`,
      sourceLocator: cleanText(fact.sourceLocator),
      sourceUrl: validSourceUrl(fact.sourceUrl),
      verifiedAt: cleanText(fact.verifiedAt)
    };
    const suppliedTags = validateSupplementDiagnosticTags(fact.diagnosticTags, fact.key);
    return Object.freeze({
      ...partial,
      presentedStatement: partial.statement,
      diagnosticTags: Object.freeze(uniqueStrings([
        ...suppliedTags,
        ...diagnosticTagsForFact(partial, fact.unitId)
      ]).filter((tag) => allowedDiagnosticTagSet.has(tag)))
    });
  }));
  const allSupplementFactKeys = supplementFacts.map((fact) => fact.key);
  const allFactKeys = Object.freeze([...allBaseFactKeys, ...allSupplementFactKeys]);
  if (allFactKeys.length !== 244 || new Set(allFactKeys).size !== 244) {
    throw new Error(`business full-score bank requires 244 unique facts, got ${allFactKeys.length}`);
  }

  function orderedFacts(facts, usage, seed, truth) {
    return facts
      .filter((fact) => truth === undefined || fact.truth === truth)
      .sort((left, right) =>
        (usage[left.key] - usage[right.key]) ||
        (stableHash(`${seed}:${left.key}`) - stableHash(`${seed}:${right.key}`)) ||
        left.key.localeCompare(right.key)
      );
  }

  function registerFacts(selected, usage) {
    if (selected.length !== 4 || new Set(selected.map((fact) => fact.key)).size !== 4) {
      throw new Error("a full-score question must use four distinct source facts");
    }
    selected.forEach((fact) => { usage[fact.key] += 1; });
    return Object.freeze(selected);
  }

  function selectAnyFour(facts, usage, seed) {
    return registerFacts(orderedFacts(facts, usage, seed).slice(0, 4), usage);
  }

  function selectCountFour(facts, usage, seed) {
    const selected = orderedFacts(facts, usage, seed).slice(0, 4);
    if (!selected.some((fact) => fact.truth)) {
      const replacement = orderedFacts(facts, usage, `${seed}:true`, true)
        .find((fact) => !selected.some((item) => item.key === fact.key));
      if (!replacement) throw new Error("count question requires at least one true source fact");
      selected[selected.length - 1] = replacement;
    }
    return registerFacts(selected, usage);
  }

  function selectCaseFour(facts, usage, seed) {
    const ordered = orderedFacts(facts, usage, seed);
    const selected = [ordered[0]];
    const crossQuestion = ordered.find((fact) =>
      fact.questionId !== selected[0].questionId
    );
    if (!crossQuestion) throw new Error("a case question requires at least two source questions");
    selected.push(crossQuestion);
    selected.push(...ordered.filter((fact) =>
      !selected.some((item) => item.key === fact.key)
    ).slice(0, 2));
    return registerFacts(selected, usage);
  }

  function selectOneFact(facts, usage, seed, truth, excluded, preferUnused = true) {
    const excludedKeys = new Set(excluded.map((fact) => fact.key));
    const candidates = orderedFacts(facts, usage, seed, truth)
      .filter((fact) => !excludedKeys.has(fact.key));
    const preferred = preferUnused ? candidates.find((fact) => usage[fact.key] === 0) : null;
    const selected = preferred || candidates[0];
    if (!selected) throw new Error("single-choice source selection failed");
    return selected;
  }

  function chooseSingleOrientations(facts, usage, count) {
    const uncoveredTrue = facts.filter((fact) => fact.truth && usage[fact.key] === 0).length;
    const uncoveredFalse = facts.filter((fact) => !fact.truth && usage[fact.key] === 0).length;
    const trueCount = facts.filter((fact) => fact.truth).length;
    const falseCount = facts.length - trueCount;
    const options = [];
    for (let askTruthCount = 0; askTruthCount <= count; askTruthCount += 1) {
      const askFalseCount = count - askTruthCount;
      if (askTruthCount && (trueCount < 1 || falseCount < 3)) continue;
      if (askFalseCount && (falseCount < 1 || trueCount < 3)) continue;
      const trueCapacity = askTruthCount + (askFalseCount * 3);
      const falseCapacity = (askTruthCount * 3) + askFalseCount;
      if (trueCapacity < uncoveredTrue || falseCapacity < uncoveredFalse) continue;
      options.push({
        askTruthCount,
        surplus: (trueCapacity - uncoveredTrue) + (falseCapacity - uncoveredFalse)
      });
    }
    if (!options.length) throw new Error("single-choice orientations cannot cover remaining source facts");
    options.sort((left, right) =>
      (left.surplus - right.surplus) || (right.askTruthCount - left.askTruthCount)
    );
    const askTruthCount = options[0].askTruthCount;
    return [
      ...Array.from({ length: askTruthCount }, () => true),
      ...Array.from({ length: count - askTruthCount }, () => false)
    ];
  }

  function selectSingleSpecs(facts, usage, count, unitId) {
    const orientations = rotate(
      chooseSingleOrientations(facts, usage, count),
      stableHash(unitId) % Math.max(1, count)
    );
    return orientations.map((askForTruth, index) => {
      const targetTruth = askForTruth;
      const distractorTruth = !askForTruth;
      const chosen = [];
      const target = selectOneFact(
        facts,
        usage,
        `${unitId}:single:${index}:target`,
        targetTruth,
        chosen
      );
      chosen.push(target);
      const distractors = [];
      for (let slot = 0; slot < 3; slot += 1) {
        const distractor = selectOneFact(
          facts,
          usage,
          `${unitId}:single:${index}:distractor:${slot}`,
          distractorTruth,
          chosen
        );
        chosen.push(distractor);
        distractors.push(distractor);
      }
      registerFacts(chosen, usage);
      return Object.freeze({ target, distractors: Object.freeze(distractors), askForTruth });
    });
  }

  function sourceFactView(fact, presentedStatement = "") {
    return Object.freeze({
      sourceType: fact.sourceType,
      key: fact.key,
      questionId: fact.questionId,
      anchorId: fact.anchorId,
      choiceIndex: fact.choiceIndex,
      statementIndex: fact.statementIndex,
      tag: fact.tag,
      truth: fact.truth,
      context: fact.context,
      statement: fact.statement,
      presentedStatement: presentedStatement || fact.presentedStatement || fact.statement,
      reason: fact.reason,
      sourceRef: fact.sourceRef,
      sourceLocator: fact.sourceLocator,
      sourceUrl: fact.sourceUrl,
      verifiedAt: fact.verifiedAt,
      diagnosticTags: fact.diagnosticTags
    });
  }

  function commonFields(id, unit, formatKey, facts, answer, globalIndex, presentedStatements = []) {
    const diagnosticTags = Object.freeze(uniqueStrings(
      facts.flatMap((fact) => fact.diagnosticTags)
    ).filter((tag) => allowedDiagnosticTagSet.has(tag)));
    if (!diagnosticTags.length) throw new Error(`${id}: diagnostic tags are required`);
    const sourceFacts = Object.freeze(facts.map((fact, index) =>
      sourceFactView(fact, presentedStatements[index])
    ));
    const sourceQuestionIds = Object.freeze(uniqueStrings(facts.map((fact) => fact.questionId)));
    const sourceAnchorIds = Object.freeze(uniqueStrings(facts.map((fact) => fact.anchorId)));
    const sourceTypes = Object.freeze(uniqueStrings(facts.map((fact) => fact.sourceType)));
    const sourceUrls = Object.freeze(uniqueStrings(facts.map((fact) => fact.sourceUrl)));
    const sourceRefs = Object.freeze(uniqueStrings(facts.map((fact) => fact.sourceRef)));
    const sourceLocators = Object.freeze(uniqueStrings(facts.map((fact) => fact.sourceLocator)));
    return {
      id,
      masteryId: id,
      unitId: unit.id,
      unitLabel: unit.label,
      unitPage: unit.page,
      sectionId: "business",
      scopeId: "business",
      formatKey,
      format: formatLabels[formatKey],
      answer,
      sourceQuestionIds,
      sourceAnchorIds,
      sourceTypes,
      sourceFacts,
      sourceUrls,
      sourceRefs,
      sourceLocators,
      sourceRef: sourceRefs.join("／"),
      sourceLocator: sourceLocators.join("／"),
      legalBaseline: blueprint.legalBaseline,
      verifiedAt: facts.map((fact) => fact.verifiedAt).filter(Boolean).sort().at(-1) || "",
      diagnosticTags,
      bankIndex: globalIndex,
      qualityVersion: VERSION
    };
  }

  function reasoningSteps(facts, judgment, boundary) {
    return Object.freeze([
      Object.freeze({ label: "判断対象", text: uniqueStrings(facts.map((fact) => fact.context)).join("／") }),
      Object.freeze({ label: "結論", text: judgment }),
      Object.freeze({ label: "根拠", text: uniqueStrings(facts.map((fact) => fact.reason)).join("／") }),
      Object.freeze({ label: "境界", text: boundary || uniqueStrings(facts.map((fact) => fact.trap)).join("／") })
    ]);
  }

  function resolvedAnswerSlot(globalIndex, answerSlotOverride) {
    const answerSlot = answerSlotOverride === undefined ? globalIndex % 4 : answerSlotOverride;
    if (!Number.isInteger(answerSlot) || answerSlot < 0 || answerSlot > 3) {
      throw new Error("answer slot must be an integer from zero to three");
    }
    return answerSlot;
  }

  function buildSingleQuestion(unit, spec, questionIndex, globalIndex, stableId = "", answerSlotOverride) {
    const id = stableId || `bf-${unit.id}-single-${String(questionIndex + 1).padStart(2, "0")}`;
    const answerSlot = resolvedAnswerSlot(globalIndex, answerSlotOverride);
    const displayedFacts = placeTargetAtSlot(spec.target, spec.distractors, answerSlot);
    const askLabel = spec.askForTruth ? "正しい" : "誤っている";
    const judgment = `選ぶのは「${spec.target.presentedStatement}」。${spec.target.reason}`;
    const fields = commonFields(
      id,
      unit,
      "single",
      displayedFacts,
      answerSlot,
      globalIndex,
      displayedFacts.map((fact) => fact.presentedStatement)
    );
    const choices = Object.freeze(displayedFacts.map((fact) =>
      `【前提】${fact.context} 【判断】${fact.presentedStatement}`
    ));
    const choiceExplanations = Object.freeze(displayedFacts.map((fact, index) =>
      `${index + 1} ${fact.truth ? "○" : "×"} ${fact.reason}`
    ));
    return Object.freeze({
      ...fields,
      variationKind: "fullscore-source-comparison-single",
      text: `同一単元の異なる場面を比較する。次の記述のうち、${askLabel}ものはどれか。`,
      choices,
      choiceExplanations,
      choiceDiagnosticTags: Object.freeze(displayedFacts.map((fact) => fact.diagnosticTags)),
      explain: judgment,
      trap: uniqueStrings(displayedFacts.map((fact) => fact.trap)).join("／"),
      memoryRule: uniqueStrings(displayedFacts.map((fact) => fact.memoryRule)).join("／"),
      reasoningSteps: reasoningSteps(displayedFacts, judgment)
    });
  }

  function compoundFor(left, right, label) {
    const truth = left.truth && right.truth;
    return Object.freeze({
      label,
      truth,
      text: `${left.presentedStatement} また、${right.presentedStatement}`,
      reason: `${left.truth ? "前半○" : "前半×"}（${left.reason}）／${right.truth ? "後半○" : "後半×"}（${right.reason}）`
    });
  }

  function buildCombinationQuestion(unit, facts, questionIndex, globalIndex, stableId = "", answerSlotOverride) {
    const id = stableId || `bf-${unit.id}-combination-${String(questionIndex + 1).padStart(2, "0")}`;
    const answerSlot = resolvedAnswerSlot(globalIndex, answerSlotOverride);
    const left = compoundFor(facts[0], facts[1], "ア");
    const right = compoundFor(facts[2], facts[3], "イ");
    const target = combinationPatterns.find((pattern) =>
      pattern.a === left.truth && pattern.b === right.truth
    );
    if (!target) throw new Error(`${id}: combination truth pattern is invalid`);
    const distractors = rotate(
      combinationPatterns.filter((pattern) => pattern.key !== target.key),
      stableHash(id) % 3
    );
    const displayedPatterns = placeTargetAtSlot(target, distractors, answerSlot);
    const fields = commonFields(
      id,
      unit,
      "combination",
      facts,
      answerSlot,
      globalIndex,
      facts.map((fact) => fact.presentedStatement)
    );
    const actual = `ア${left.truth ? "○" : "×"}・イ${right.truth ? "○" : "×"}`;
    const choiceExplanations = Object.freeze(displayedPatterns.map((pattern, index) =>
      index === answerSlot
        ? `${index + 1} ○ 実際は${actual}なので一致する。`
        : `${index + 1} × 実際は${actual}なので一致しない。`
    ));
    const judgment = `${actual}。アは${left.reason}。イは${right.reason}。`;
    return Object.freeze({
      ...fields,
      variationKind: "fullscore-four-fact-combination",
      text: `次のア・イを判定し、正しい組合せを選べ。\nア 【前提】${facts[0].context}／${facts[1].context} 【判断】${left.text}\nイ 【前提】${facts[2].context}／${facts[3].context} 【判断】${right.text}`,
      choices: Object.freeze(displayedPatterns.map((pattern) => pattern.label)),
      choiceExplanations,
      choiceDiagnosticTags: Object.freeze(displayedPatterns.map(() => fields.diagnosticTags)),
      explain: judgment,
      trap: uniqueStrings(facts.map((fact) => fact.trap)).join("／"),
      memoryRule: uniqueStrings(facts.map((fact) => fact.memoryRule)).join("／"),
      reasoningSteps: reasoningSteps(facts, judgment)
    });
  }

  function buildCountQuestion(unit, facts, questionIndex, globalIndex, stableId = "", answerSlotOverride) {
    const id = stableId || `bf-${unit.id}-count-${String(questionIndex + 1).padStart(2, "0")}`;
    const answerSlot = resolvedAnswerSlot(globalIndex, answerSlotOverride);
    const correctCount = facts.filter((fact) => fact.truth).length;
    if (correctCount < 1 || correctCount > 4) throw new Error(`${id}: count must be between one and four`);
    const target = countLabels[correctCount - 1];
    const distractors = rotate(countLabels.filter((label) => label !== target), stableHash(id) % 3);
    const displayedLabels = placeTargetAtSlot(target, distractors, answerSlot);
    const fields = commonFields(
      id,
      unit,
      "count",
      facts,
      answerSlot,
      globalIndex,
      facts.map((fact) => fact.presentedStatement)
    );
    const choiceExplanations = Object.freeze(displayedLabels.map((label, index) =>
      index === answerSlot
        ? `${index + 1} ○ 正しい記述は${correctCount}つなので一致する。`
        : `${index + 1} × 正しい記述は${correctCount}つなので「${label}」ではない。`
    ));
    const correctKana = facts.map((fact, index) => fact.truth ? kana[index] : "").filter(Boolean);
    const judgment = `正しいのは${correctKana.join("・")}の${correctCount}つ。`;
    return Object.freeze({
      ...fields,
      variationKind: "fullscore-source-fact-count",
      text: `次の4場面について、正しい記述はいくつあるか。\n${facts.map((fact, index) => `${kana[index]} 【前提】${fact.context} 【判断】${fact.presentedStatement}`).join("\n")}`,
      choices: Object.freeze(displayedLabels),
      choiceExplanations,
      choiceDiagnosticTags: Object.freeze(displayedLabels.map(() => fields.diagnosticTags)),
      explain: judgment,
      trap: uniqueStrings(facts.map((fact) => fact.trap)).join("／"),
      memoryRule: uniqueStrings(facts.map((fact) => fact.memoryRule)).join("／"),
      reasoningSteps: reasoningSteps(facts, judgment)
    });
  }

  function reframeSubject(value) {
    const source = cleanText(value);
    return source
      .replace(/宅建業者A/g, "宅建業者甲")
      .replace(/宅建士A/g, "宅建士甲")
      .replace(/一般消費者B/g, "一般消費者乙")
      .replace(/買主B/g, "買主乙")
      .replace(/売主A/g, "売主甲")
      .replace(/A社/g, "甲社")
      .replace(/B社/g, "乙社")
      .replace(/(^|[^A-Za-z0-9])A(?=$|[^A-Za-z0-9])/g, "$1甲")
      .replace(/(^|[^A-Za-z0-9])B(?=$|[^A-Za-z0-9])/g, "$1乙");
  }

  function truthMaskLabel(mask) {
    const labels = kana.filter((_, index) => (mask & (1 << index)) !== 0);
    if (!labels.length) return "正しい判断はない";
    if (labels.length === 4) return "ア・イ・ウ・エが正しい";
    return `正しいのは${labels.join("・")}`;
  }

  function buildCaseQuestion(unit, facts, questionIndex, globalIndex, stableId = "", answerSlotOverride) {
    const id = stableId || `bf-${unit.id}-case-${String(questionIndex + 1).padStart(2, "0")}`;
    const answerSlot = resolvedAnswerSlot(globalIndex, answerSlotOverride);
    const presentedContexts = facts.map((fact) => reframeSubject(fact.context));
    if (!presentedContexts.some((context, index) => context !== facts[index].context)) {
      presentedContexts[0] = `当事者甲の別事例として、${presentedContexts[0]}`;
    }
    const presentedStatements = facts.map((fact) => reframeSubject(fact.presentedStatement));
    const targetMask = facts.reduce(
      (mask, fact, index) => mask | (fact.truth ? (1 << index) : 0),
      0
    );
    const distractorMasks = rotate(
      Array.from({ length: 16 }, (_, mask) => mask).filter((mask) => mask !== targetMask),
      stableHash(id) % 15
    ).slice(0, 3);
    const displayedMasks = placeTargetAtSlot(targetMask, distractorMasks, answerSlot);
    const fields = commonFields(
      id,
      unit,
      "case",
      facts,
      answerSlot,
      globalIndex,
      presentedStatements
    );
    const actualLabel = truthMaskLabel(targetMask);
    const choiceExplanations = Object.freeze(displayedMasks.map((mask, index) =>
      index === answerSlot
        ? `${index + 1} ○ 4場面を個別に判定すると「${actualLabel}」。`
        : `${index + 1} × 4場面の判定結果は「${actualLabel}」。`
    ));
    const judgment = facts.map((fact, index) =>
      `${kana[index]}${fact.truth ? "○" : "×"} ${fact.reason}`
    ).join("／");
    return Object.freeze({
      ...fields,
      variationKind: "fullscore-source-traceable-subject-reframed-case",
      frameRule: "subject-alias-only",
      text: `主体を甲・乙に置き換えた独立4事例である。各判断を個別に切り、正しいものの組合せを選べ。\n${presentedStatements.map((statement, index) => `${kana[index]} 【前提】${presentedContexts[index]} 【判断】${statement}`).join("\n")}`,
      choices: Object.freeze(displayedMasks.map(truthMaskLabel)),
      choiceExplanations,
      choiceDiagnosticTags: Object.freeze(displayedMasks.map(() => fields.diagnosticTags)),
      explain: judgment,
      trap: uniqueStrings(facts.map((fact) => fact.trap)).join("／"),
      memoryRule: uniqueStrings(facts.map((fact) => fact.memoryRule)).join("／"),
      reasoningSteps: reasoningSteps(
        facts,
        judgment,
        "主体名だけを変更し、法的条件・期限・金額・結論は出典肢から変更していない。"
      )
    });
  }

  function selectBaseSupportPair(requiredFacts, unitId, formatKey, usage, seed) {
    const input = unitInputs.find((candidate) => candidate.unit.id === unitId);
    if (!input || requiredFacts.length !== 2) {
      throw new Error(`${unitId}: supplement support selection is invalid`);
    }
    const candidates = [];
    for (let leftIndex = 0; leftIndex < input.facts.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < input.facts.length; rightIndex += 1) {
        const left = input.facts[leftIndex];
        const right = input.facts[rightIndex];
        if (usage[left.key] >= 5 || usage[right.key] >= 5) continue;
        const combined = [...requiredFacts, left, right];
        const truthCount = combined.filter((fact) => fact.truth).length;
        if (formatKey === "single" && truthCount !== 1 && truthCount !== 3) continue;
        if (formatKey === "count" && truthCount < 1) continue;
        candidates.push({
          pair: [left, right],
          maximumUse: Math.max(usage[left.key], usage[right.key]),
          totalUse: usage[left.key] + usage[right.key],
          sameSourcePenalty: left.questionId === right.questionId ? 1 : 0,
          order: stableHash(`${seed}:${left.key}:${right.key}`)
        });
      }
    }
    candidates.sort((left, right) =>
      (left.maximumUse - right.maximumUse) ||
      (left.totalUse - right.totalUse) ||
      (left.sameSourcePenalty - right.sameSourcePenalty) ||
      (left.order - right.order)
    );
    if (!candidates.length) {
      throw new Error(`${unitId}: no legally traceable base support pair for ${formatKey}`);
    }
    return candidates[0].pair;
  }

  function singleSpecForFacts(facts, id) {
    const trueFacts = facts.filter((fact) => fact.truth);
    const falseFacts = facts.filter((fact) => !fact.truth);
    const askForTruth = trueFacts.length === 1;
    const targetGroup = askForTruth ? trueFacts : falseFacts;
    const distractors = askForTruth ? falseFacts : trueFacts;
    if (targetGroup.length !== 1 || distractors.length !== 3) {
      throw new Error(`${id}: supplement single-choice truth pattern is invalid`);
    }
    return Object.freeze({
      target: targetGroup[0],
      distractors: Object.freeze(distractors),
      askForTruth
    });
  }

  function factsForSupplementAnchor(anchor) {
    const facts = supplementFacts
      .filter((fact) => fact.anchorId === anchor.id)
      .sort((left, right) => left.statementIndex - right.statementIndex);
    if (facts.length !== 4) throw new Error(`${anchor.id}: normalized supplement facts are incomplete`);
    return facts;
  }

  function supplementalId(unitId, anchorIds, variantIndex) {
    return `bf-${unitId}-supplement-${anchorIds.join("-x-")}-${String(variantIndex + 1).padStart(2, "0")}`;
  }

  const answerSlotOffset = Object.freeze({ single: 0, combination: 1, count: 2, case: 3 });
  const formatQuestionIndex = { single: 0, combination: 0, count: 0, case: 0 };
  function nextAnswerSlot(formatKey) {
    if (!Object.hasOwn(formatQuestionIndex, formatKey)) throw new Error(`${formatKey}: unknown format`);
    const answerSlot = (formatQuestionIndex[formatKey] + answerSlotOffset[formatKey]) % 4;
    formatQuestionIndex[formatKey] += 1;
    return answerSlot;
  }

  const questions = [];
  let globalIndex = 0;
  for (const input of unitInputs) {
    const { unit, target, facts } = input;
    const usage = Object.fromEntries(facts.map((fact) => [fact.key, 0]));
    const combinationSets = Array.from({ length: target.combination }, (_, index) =>
      selectAnyFour(facts, usage, `${unit.id}:combination:${index}`)
    );
    const countSets = Array.from({ length: target.count }, (_, index) =>
      selectCountFour(facts, usage, `${unit.id}:count:${index}`)
    );
    const caseSets = Array.from({ length: target.case }, (_, index) =>
      selectCaseFour(facts, usage, `${unit.id}:case:${index}`)
    );
    const singleSpecs = selectSingleSpecs(facts, usage, target.single, unit.id);
    const uncovered = Object.entries(usage).filter(([, count]) => count === 0).map(([key]) => key);
    if (uncovered.length) {
      throw new Error(`${unit.id}: source facts remain uncovered: ${uncovered.join(",")}`);
    }

    const unitQuestions = [];
    singleSpecs.forEach((spec, index) => {
      unitQuestions.push(buildSingleQuestion(unit, spec, index, globalIndex, "", nextAnswerSlot("single")));
      globalIndex += 1;
    });
    combinationSets.forEach((set, index) => {
      unitQuestions.push(buildCombinationQuestion(unit, set, index, globalIndex, "", nextAnswerSlot("combination")));
      globalIndex += 1;
    });
    countSets.forEach((set, index) => {
      unitQuestions.push(buildCountQuestion(unit, set, index, globalIndex, "", nextAnswerSlot("count")));
      globalIndex += 1;
    });
    caseSets.forEach((set, index) => {
      unitQuestions.push(buildCaseQuestion(unit, set, index, globalIndex, "", nextAnswerSlot("case")));
      globalIndex += 1;
    });
    questions.push(...unitQuestions);
  }

  if (globalIndex !== 100) throw new Error(`legacy full-score question count changed: ${globalIndex}`);

  const usage = Object.fromEntries(allFactKeys.map((key) => [key, 0]));
  questions.forEach((question) => question.sourceFacts.forEach((fact) => { usage[fact.key] += 1; }));

  const anchors = [...supplement.ANCHORS];
  const anchorsByUnit = Object.groupBy
    ? Object.groupBy(anchors, (anchor) => anchor.unitId)
    : anchors.reduce((groups, anchor) => {
      (groups[anchor.unitId] ||= []).push(anchor);
      return groups;
    }, {});
  const preferredSharedGroup = anchorsByUnit["business-book-10"]?.length >= 2
    ? anchorsByUnit["business-book-10"]
    : Object.values(anchorsByUnit).find((group) => group.length >= 2);
  if (!preferredSharedGroup) throw new Error("supplement requires two anchors in one unit for cross-anchor application");
  const sharedAnchors = preferredSharedGroup.slice(0, 2);
  const sharedAnchorIds = new Set(sharedAnchors.map((anchor) => anchor.id));
  const standardBins = [];
  anchors.filter((anchor) => !sharedAnchorIds.has(anchor.id)).forEach((anchor) => {
    const facts = factsForSupplementAnchor(anchor);
    standardBins.push(Object.freeze({
      unitId: anchor.unitId,
      anchorIds: Object.freeze([anchor.id]),
      variantIndex: 0,
      requiredFacts: Object.freeze([facts[0], facts[2]]),
      crossAnchor: false
    }));
    standardBins.push(Object.freeze({
      unitId: anchor.unitId,
      anchorIds: Object.freeze([anchor.id]),
      variantIndex: 1,
      requiredFacts: Object.freeze([facts[1], facts[3]]),
      crossAnchor: false
    }));
  });
  if (standardBins.length !== 30) throw new Error(`supplement requires 30 mixed bins, got ${standardBins.length}`);
  const sharedFacts = sharedAnchors.map(factsForSupplementAnchor);
  const sharedBins = [0, 1].map((variantIndex) => Object.freeze({
    unitId: sharedAnchors[0].unitId,
    anchorIds: Object.freeze(sharedAnchors.map((anchor) => anchor.id)),
    variantIndex,
    requiredFacts: Object.freeze(variantIndex === 0
      ? [sharedFacts[0][0], sharedFacts[0][2], sharedFacts[1][0], sharedFacts[1][2]]
      : [sharedFacts[0][1], sharedFacts[0][3], sharedFacts[1][1], sharedFacts[1][3]]),
    crossAnchor: true
  }));

  const formatCycle = ["single", "combination", "count", "case"];
  const standardFormats = standardBins.map((_, index) =>
    index < 28 ? formatCycle[index % 4] : (index === 28 ? "single" : "count")
  );
  const supplementalPlan = [
    ...standardBins.map((bin, index) => ({ ...bin, formatKey: standardFormats[index] })),
    { ...sharedBins[0], formatKey: "combination" },
    { ...sharedBins[1], formatKey: "case" }
  ];
  if (supplementalPlan.length !== 32) throw new Error("supplement question plan must contain 32 questions");

  supplementalPlan.forEach((plan, questionIndex) => {
    const unit = unitById[plan.unitId];
    if (!unit) throw new Error(`${plan.unitId}: supplement unit is unknown`);
    const id = supplementalId(plan.unitId, plan.anchorIds, plan.variantIndex);
    const selected = plan.crossAnchor
      ? [...plan.requiredFacts]
      : [
        ...plan.requiredFacts,
        ...selectBaseSupportPair(plan.requiredFacts, plan.unitId, plan.formatKey, usage, id)
      ];
    registerFacts(selected, usage);
    let question;
    const answerSlot = nextAnswerSlot(plan.formatKey);
    if (plan.formatKey === "single") {
      question = buildSingleQuestion(unit, singleSpecForFacts(selected, id), questionIndex, globalIndex, id, answerSlot);
    } else if (plan.formatKey === "combination") {
      question = buildCombinationQuestion(unit, Object.freeze(selected), questionIndex, globalIndex, id, answerSlot);
    } else if (plan.formatKey === "count") {
      question = buildCountQuestion(unit, Object.freeze(selected), questionIndex, globalIndex, id, answerSlot);
    } else {
      question = buildCaseQuestion(unit, Object.freeze(selected), questionIndex, globalIndex, id, answerSlot);
    }
    questions.push(question);
    globalIndex += 1;
  });

  const uncoveredFacts = Object.entries(usage).filter(([, count]) => count === 0).map(([key]) => key);
  const overusedFacts = Object.entries(usage).filter(([, count]) => count > 5).map(([key, count]) => `${key}:${count}`);
  const supplementReuse = allSupplementFactKeys.filter((key) => usage[key] !== 1);
  if (uncoveredFacts.length || overusedFacts.length || supplementReuse.length) {
    throw new Error(`full-score fact allocation invalid; uncovered=${uncoveredFacts.join(",")}; overused=${overusedFacts.join(",")}; supplement=${supplementReuse.join(",")}`);
  }
  if (Object.values(formatQuestionIndex).some((count) => count !== 33)) {
    throw new Error(`full-score format answer plan is invalid: ${JSON.stringify(formatQuestionIndex)}`);
  }

  const unitRecords = unitInputs.map(({ unit }) => {
    const unitQuestions = questions.filter((question) => question.unitId === unit.id);
    const formatCounts = Object.freeze(Object.fromEntries(
      Object.keys(formatLabels).map((formatKey) => [
        formatKey,
        unitQuestions.filter((question) => question.formatKey === formatKey).length
      ])
    ));
    return Object.freeze({
      id: unit.id,
      label: unit.label,
      page: unit.page,
      sourceQuestionIds: Object.freeze([...unit.ids]),
      sourceAnchorIds: Object.freeze(anchors.filter((anchor) => anchor.unitId === unit.id).map((anchor) => anchor.id)),
      questionIds: Object.freeze(unitQuestions.map((question) => question.id)),
      formatCounts
    });
  });

  const questionsById = Object.freeze(Object.fromEntries(
    questions.map((question) => [question.id, question])
  ));
  if (questions.length !== 132 || Object.keys(questionsById).length !== 132) {
    throw new Error(`business full-score bank must contain 132 unique questions, got ${questions.length}`);
  }

  function validDateKey(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    const year = Number(match[1]);
    const month = Number(match[2]);
    const date = Number(match[3]);
    const parsed = new Date(year, month - 1, date, 12);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === date
      ? String(value)
      : "";
  }

  function localDayKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new TypeError("a valid date is required");
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function normalizePresentationKey(value) {
    if (value === undefined) return localDayKey();
    if (typeof value !== "string") throw new TypeError("presentation key must be a string");
    const key = value.trim();
    if (!key || key !== value || key.length > 120 || /[\u0000-\u001f\u007f]/.test(key)) {
      throw new TypeError("presentation key is invalid");
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(key) && !validDateKey(key)) {
      throw new TypeError("presentation date key is invalid");
    }
    return key;
  }

  function presentationOffset(key) {
    const dateKey = validDateKey(key);
    if (dateKey) {
      const [year, month, date] = dateKey.split("-").map(Number);
      return ((Math.floor(Date.UTC(year, month - 1, date) / 86400000) % 4) + 4) % 4;
    }
    return stableHash(key) % 4;
  }

  function stableQuestion(questionOrId) {
    if (typeof questionOrId === "string") {
      const found = questionsById[questionOrId];
      if (!found) throw new RangeError(`unknown full-score question id: ${questionOrId}`);
      return found;
    }
    if (!questionOrId || typeof questionOrId !== "object") {
      throw new TypeError("a full-score question or id is required");
    }
    const found = questionsById[questionOrId.id];
    if (!found || questionOrId.masteryId !== found.id) {
      throw new RangeError("question does not belong to the full-score bank");
    }
    return found;
  }

  function presentQuestion(questionOrId, suppliedPresentationKey) {
    const question = stableQuestion(questionOrId);
    const key = normalizePresentationKey(suppliedPresentationKey);
    const offset = presentationOffset(key);
    const order = Object.freeze([0, 1, 2, 3].map((index) => (index + offset) % 4));
    const answer = order.indexOf(question.answer);
    if (answer < 0) throw new Error("presented answer could not be resolved");
    return Object.freeze({
      ...question,
      id: question.id,
      masteryId: question.id,
      choices: Object.freeze(order.map((index) => question.choices[index])),
      answer,
      choiceExplanations: Object.freeze(order.map((index) => question.choiceExplanations[index])),
      choiceDiagnosticTags: Object.freeze(order.map((index) => question.choiceDiagnosticTags[index])),
      presentationKey: key,
      presentationOffset: offset,
      presentationOrder: order
    });
  }

  function diagnosticsForSelection(questionOrId, selected) {
    if (!Number.isInteger(selected) || selected < 0 || selected > 3) {
      throw new RangeError("selected choice must be an integer from 0 to 3");
    }
    let question;
    if (questionOrId && typeof questionOrId === "object" && questionOrId.presentationKey) {
      const stable = stableQuestion(questionOrId);
      if (!Array.isArray(questionOrId.choices) || questionOrId.choices.length !== 4 ||
          questionOrId.masteryId !== stable.id || !Number.isInteger(questionOrId.answer)) {
        throw new RangeError("presented question is invalid");
      }
      question = questionOrId;
    } else {
      question = stableQuestion(questionOrId);
    }
    if (selected === question.answer) return Object.freeze([]);
    const tags = uniqueStrings([
      ...(question.choiceDiagnosticTags?.[selected] || []),
      ...(question.choiceDiagnosticTags?.[question.answer] || []),
      ...(question.diagnosticTags || [])
    ]).filter((tag) => allowedDiagnosticTagSet.has(tag));
    if (!tags.length) throw new Error("wrong selection did not resolve diagnostic tags");
    return Object.freeze(tags);
  }

  return Object.freeze({
    VERSION,
    LEGAL_BASELINE: blueprint.legalBaseline,
    FORMAT_LABELS: formatLabels,
    ALLOWED_DIAGNOSTIC_TAGS: allowedDiagnosticTags,
    BASE_FACT_KEYS: Object.freeze([...allBaseFactKeys]),
    SUPPLEMENT_FACT_KEYS: Object.freeze([...allSupplementFactKeys]),
    FACT_KEYS: allFactKeys,
    QUESTIONS: Object.freeze(questions),
    QUESTIONS_BY_ID: questionsById,
    UNITS: Object.freeze(unitRecords),
    localDayKey,
    presentQuestion,
    diagnosticsForSelection
  });
});
