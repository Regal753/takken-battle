(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_RIGHTS_TRANSFER_BANK = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const LEGAL_BASELINE = "2026-04-01";
  const SOURCE_URL = "https://laws.e-gov.go.jp/law/129AC0000000089/20260401_506AC0000000033";
  const QUESTIONS = [
    {
      id: "rt-guarantee-scope", topic: "保証の対象範囲", sourceIds: ["r008"], articles: ["446", "465_2"], locator: "民法446条・465条の2",
      premise: "2026年、自然人Cが書面で保証する二つの契約を比較する。甲は既に発生したBの未払賃料60万円だけを特定して保証する。乙は今後の賃貸借から生じる不特定の賃料・原状回復費を連帯保証する。いずれも極度額を定めていない。貸金等債務は含まない。",
      stem: "極度額の定めについて、正しい判断はどれか。",
      choices: ["甲も乙も、個人が保証するので極度額がない限り効力を生じない。", "甲は根保証ではないため、極度額がないという理由では無効にならない。乙は個人根保証なので効力を生じない。", "乙は連帯保証なので、極度額を定めなくても効力を生じる。", "甲は極度額が必要だが、乙は賃貸借なので極度額が不要である。"], answer: 1,
      reasons: ["個人による保証がすべて根保証になるわけではない。特定済みの一つの債務を保証する甲は、465条の2の個人根保証ではない。", "甲は特定債務、乙は一定範囲の不特定債務の保証。乙は自然人による根保証なので極度額が必要。『連帯』にしてもこの条件は変わらない。", "連帯保証は催告・検索の抗弁の扱いを変えるが、個人根保証の極度額要件を免除しない。", "貸金だけでなく賃貸借による不特定債務の個人根保証にも極度額が必要。対象の範囲を逆に読んでいる。"],
      contrast: "保証人が個人か、債務が特定か不特定か、連帯かを別々に判定する。"
    },
    {
      id: "rt-guarantee-search", topic: "普通保証と連帯保証", sourceIds: ["r008"], articles: ["453", "454"], locator: "民法453条・454条",
      premise: "債権者Aは主債務者Bに催告したが弁済を受けられず、保証人Cに請求した。CはBに弁済資力があり、その財産への執行も容易であることを証明した。保証契約は有効で、Bは破産しておらず所在も分かる。",
      stem: "Cの保証を普通保証と連帯保証に分けたとき、正しいものはどれか。",
      choices: ["普通保証でも連帯保証でも、Cの証明だけでは先にBへ執行するよう求められない。", "普通保証でも連帯保証でも、Aは必ず先にBの財産へ執行しなければならない。", "普通保証ならCは先にBの財産へ執行するよう求められるが、連帯保証なら検索の抗弁を有しない。", "普通保証ならCは保証を解除でき、連帯保証なら保証債務が半額になる。"], answer: 2,
      reasons: ["普通保証では453条の証明を満たすため検索の抗弁を主張できる。両方を不可とするのは誤り。", "454条により連帯保証人は検索の抗弁を有しない。Bの資力を証明してもこの特則は変わらない。", "普通保証の検索の抗弁は、資力と執行の容易さの証明が条件。連帯保証にはその抗弁がない。", "検索の抗弁は執行の順序に関する権利で、保証契約の解除や保証額の自動減額ではない。"],
      contrast: "『先に請求』という催告の抗弁と、『先に財産へ執行』という検索の抗弁も区別する。"
    },
    {
      id: "rt-guarantee-death", topic: "個人根保証の元本確定", sourceIds: ["r008"], articles: ["465_2", "465_4"], locator: "民法465条の2・465条の4第1項3号",
      premise: "2026年の店舗賃貸借で、自然人CがBの賃料等の不特定債務を、書面で極度額200万円として保証した。貸金等債務は含まない。Cが死亡した時点で既に未払賃料があり、死亡後にも新たな賃料元本が発生した。相続人Dは単純承認し、既存賃料の遅延損害金も発生している。",
      stem: "Dが相続する保証債務について正しいものはどれか。",
      choices: ["Cの死亡で元本が確定するため、死亡時までの未払賃料とそれに係る損害金等が極度額内の保証対象となり、その後の新たな賃料元本は含まれない。", "Cの死亡で保証債務がすべて消滅し、未払賃料も相続されない。", "賃貸借が続く限り、死亡後に新たに発生する賃料元本も必ず保証対象となる。", "未払賃料元本は極度額内なら相続されるが、それに係る損害金は極度額を超えても全額保証対象になる。"], answer: 0,
      reasons: ["個人根保証では保証人の死亡で主債務の元本が確定する。死亡前の元本に係る付随債務と死亡後の新規元本を分け、全部に極度額を適用する。", "元本確定は既に生じた保証債務を消す制度ではない。単純承認したDは既存の保証債務を相続する。", "死亡により元本が確定した後の新規賃料元本まで保証範囲を広げない。", "極度額は元本だけでなく利息・損害金等を合わせた全部の上限である。"],
      contrast: "死亡による元本確定と、既に生じた保証債務の消滅は同じではない。"
    },
    {
      id: "rt-assignment-payment", topic: "譲渡前後の弁済", sourceIds: ["r009"], articles: ["467", "468"], locator: "民法467条1項・468条1項",
      premise: "AはBに対する貸金債権をCに譲渡した。その後、譲渡を知らないBは、Aからの譲渡通知を受ける前にAへ全額弁済した。Bは譲渡を承諾していない。さらに後でAからBへの譲渡通知が到達した。債権譲渡登記等の特例はない。",
      stem: "CがBに同じ貸金の全額支払を請求したとき、正しいものはどれか。",
      choices: ["譲渡後の弁済は常に無効なので、BはCにも全額を支払う。", "通知が後から到達したので、Aへの弁済は遡って無効になる。", "弁済の事実はAとの間だけの事情なので、BはCに一切主張できない。", "Bは対抗要件が具備されるまでに生じた弁済による消滅をCに対抗でき、同じ貸金を二重に支払う義務はない。"], answer: 3,
      reasons: ["譲渡の当事者間の効力と、債務者Bへの対抗要件を混同している。通知・承諾前の弁済の扱いを確認する。", "後からの通知が、既に対抗できる弁済による消滅を遡って取り消すわけではない。", "468条は対抗要件具備時までに譲渡人に対して生じた事由を譲受人に対抗できるとする。", "Aへの弁済はBへの対抗要件が具備される前に生じている。Bはこの消滅事由をCにも対抗できる。"],
      contrast: "譲渡日・弁済日・通知到達日を時系列で置く。通知後の弁済を扱う問題とは条件が違う。"
    },
    {
      id: "rt-assignment-opponent", topic: "対抗する相手の違い", sourceIds: ["r009"], articles: ["467"], locator: "民法467条1・2項",
      premise: "AがBに対する債権をCへ譲渡し、AからBへの通知が到達した。通知の証書に確定日付はない。Bは承諾していない。Dは同じ債権についてCと両立しない権利を持つ第三者であり、登記等の特例はない。",
      stem: "この通知だけによるCの対抗について正しいものはどれか。",
      choices: ["債務者Bに対抗できるが、B以外の第三者Dへの対抗要件は満たさない。", "確定日付がないので、BにもDにも対抗できない。", "Aからの通知なら、確定日付がなくてもBとDの双方に対抗できる。", "Bには承諾が必須なので対抗できないが、Dには通知だけで対抗できる。"], answer: 0,
      reasons: ["Bへの対抗には譲渡人の通知又はBの承諾が必要。第三者Dへの対抗には確定日付のある証書による通知又は承諾が必要。", "確定日付が必要なのは債務者以外の第三者への対抗。Bへの対抗要件まで否定している。", "譲渡人からの通知でも、第三者への対抗には確定日付の要件が加わる。", "Bの承諾とAからの通知は択一的な対抗要件。第三者への要件も逆になっている。"],
      contrast: "ここでは対抗要件の充足だけを判定し、二重譲渡の優先順位は判定しない。"
    },
    {
      id: "rt-assignment-setoff", topic: "取得時点と原因の時点", sourceIds: ["r009"], articles: ["469"], locator: "民法469条1項・2項1号・同項ただし書",
      premise: "AのBに対する貸金債権がCに譲渡され、Aの通知がBに到達した。通知後、甲ではBが通知前の原因に基づいてAへの損害賠償債権を取得した。乙ではBが他人のAに対する既存債権を通知後に買い取った。各債権は同種の金銭債権で弁済期にあり、相殺禁止特約等の他の障害はない。",
      stem: "Bが反対債権による相殺をCに対抗できるかについて、正しいものはどれか。",
      choices: ["通知後に取得したので、甲も乙も対抗できない。", "甲は対抗できるが、乙はこの例外に当たらず対抗できない。", "甲も乙も、元の債権者がAなので必ず対抗できる。", "甲は対抗できないが、乙は債権の売買なので対抗できる。"], answer: 1,
      reasons: ["取得は通知後でも、甲は対抗要件具備前の原因に基づく債権なので469条2項1号の例外に入る。", "甲では原因が通知前であり例外が適用される。乙は通知後に他人の債権を取得したので同項ただし書によりその例外から除かれる。", "通知後に他人の債権を取得した乙まで、元の債権者が同じというだけで保護しない。", "原因の時点による甲の保護と、他人からの取得を除外する乙の条件を逆に読んでいる。"],
      contrast: "通知前後の『取得』だけでなく、『原因』と『他人から取得したか』を確認する。差押えの511条との区別も必要。"
    }
  ].map(q => Object.freeze({ ...q, choices: Object.freeze(q.choices), reasons: Object.freeze(q.reasons), sourceIds: Object.freeze(q.sourceIds), articles: Object.freeze(q.articles), sourceUrl: SOURCE_URL, legalBaseline: LEGAL_BASELINE, verifiedAt: "2026-10-04" }));
  const BY_ID = Object.freeze(Object.fromEntries(QUESTIONS.map(q => [q.id, q])));
  const ids = Object.freeze(QUESTIONS.map(q => q.id));
  const clone = value => JSON.parse(JSON.stringify(value));
  const validTime = value => typeof value === "string" && Number.isFinite(Date.parse(value));
  function normalize(raw) {
    if (raw?.version > 1) return clone(raw);
    const ledger = { version: 1, firstSessionId: "", firstStartedAt: "", firstResult: null, session: null, lastResult: null };
    if (!raw || raw.version !== 1) return ledger;
    ledger.firstSessionId = typeof raw.firstSessionId === "string" ? raw.firstSessionId.slice(0, 100) : "";
    ledger.firstStartedAt = validTime(raw.firstStartedAt) ? raw.firstStartedAt : "";
    for (const field of ["firstResult", "lastResult"]) if (raw[field]?.answers) {
      const answers = Object.fromEntries(ids.filter(id => Number.isInteger(raw[field].answers[id]?.selected) && raw[field].answers[id].selected >= 0 && raw[field].answers[id].selected < 4 && validTime(raw[field].answers[id].answeredAt)).map(id => [id, clone(raw[field].answers[id])]));
      if (Object.keys(answers).length === ids.length && validTime(raw[field].completedAt)) ledger[field] = { ...raw[field], answers, score: ids.filter(id => answers[id].selected === BY_ID[id].answer).length, total: ids.length };
    }
    if (raw.session?.id && validTime(raw.session.startedAt) && raw.session.legalBaseline === LEGAL_BASELINE) {
      const answers = Object.fromEntries(ids.filter(id => Number.isInteger(raw.session.answers?.[id]?.selected) && raw.session.answers[id].selected >= 0 && raw.session.answers[id].selected < 4 && validTime(raw.session.answers[id].answeredAt)).map(id => [id, clone(raw.session.answers[id])]));
      ledger.session = { id: String(raw.session.id).slice(0, 100), startedAt: raw.session.startedAt, legalBaseline: LEGAL_BASELINE, answers, completedAt: Object.keys(answers).length === ids.length && validTime(raw.session.completedAt) ? raw.session.completedAt : "" };
    }
    return ledger;
  }
  function start(raw, sessionId, now) {
    const ledger = normalize(raw);
    if (ledger.version !== 1 || !sessionId || !validTime(now)) throw new Error("transfer session cannot start");
    if (ledger.session && !ledger.session.completedAt) return ledger;
    if (!ledger.firstSessionId) { ledger.firstSessionId = sessionId; ledger.firstStartedAt = now; }
    ledger.session = { id: sessionId, startedAt: now, legalBaseline: LEGAL_BASELINE, answers: {}, completedAt: "" };
    return ledger;
  }
  function current(raw) { const session = normalize(raw).session; return session && !session.completedAt ? QUESTIONS.find(q => !session.answers[q.id]) || null : null; }
  function answer(raw, id, selected, now) {
    const ledger = normalize(raw), q = current(ledger);
    if (ledger.version !== 1 || q?.id !== id || !Number.isInteger(selected) || selected < 0 || selected > 3 || !validTime(now)) throw new Error("invalid transfer answer");
    ledger.session.answers[id] = { selected, answeredAt: now };
    if (ids.every(id => ledger.session.answers[id])) {
      ledger.session.completedAt = now;
      const result = { sessionId: ledger.session.id, startedAt: ledger.session.startedAt, completedAt: now, legalBaseline: LEGAL_BASELINE, answers: clone(ledger.session.answers), total: ids.length, score: ids.filter(id => ledger.session.answers[id].selected === BY_ID[id].answer).length };
      ledger.lastResult = result;
      if (ledger.session.id === ledger.firstSessionId && !ledger.firstResult) ledger.firstResult = clone(result);
    }
    return ledger;
  }
  return Object.freeze({ VERSION: 1, LEGAL_BASELINE, QUESTIONS: Object.freeze(QUESTIONS), BY_ID, QUESTION_IDS: ids, normalize, start, current, answer });
});
