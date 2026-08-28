"use strict";

/* 保証協会は「金額」だけでなく、誰がどこへ・いつまでに、を一組で覚える。 */
(() => {
  const VERSION = 2;
  const LEGAL_BASELINE = "2026-04-01";
  const VERIFIED_AT = "2026-08-28";
  const URLS = Object.freeze({
    act: "https://laws.e-gov.go.jp/law/327AC1000000176?occasion_date=20260401",
    decree: "https://laws.e-gov.go.jp/law/339CO0000000383?occasion_date=20260401",
    regulation: "https://laws.e-gov.go.jp/law/332M50004000012?occasion_date=20260401",
    jointRule: "https://laws.e-gov.go.jp/law/348M50004010002"
  });
  const UNITS = Object.freeze([Object.freeze({ id: "guarantee-association-special", label: "保証協会・営業保証金 特訓" })]);
  const freeze = (value) => Object.freeze(value);
  const diagnosticTagAliases = Object.freeze({
    calculation: "number",
    procedure: "counterparty",
    effect: "principle-exception"
  });
  const allowedDiagnosticTags = new Set([
    "subject", "timing", "counterparty", "number", "principle-exception",
    "article-35", "article-37", "eight-restrictions", "transaction-type", "amendment"
  ]);
  const tags = (extra) => freeze([...new Set(extra
    .map((tag) => diagnosticTagAliases[tag] || tag)
    .filter((tag) => allowedDiagnosticTags.has(tag))) ]);
  const fact = (key, statement, truth, reason, locator, url, diagnosticTags) => freeze({ key, statement, presentedStatement: statement, truth, reason, sourceLocator: locator, sourceUrl: url, diagnosticTags: tags(diagnosticTags) });
  function make(id, format, text, answer, rows, explain, trap, memoryRule, diagnosticTags) {
    const choices = freeze(rows.map((row) => row[0]));
    const sourceFacts = freeze(rows.map((row, index) => fact(`${id}-f${index + 1}`, row[0], index === answer, row[1], row[2], row[3], diagnosticTags)));
    const choiceExplanations = freeze(sourceFacts.map((item) => freeze({ judgment: item.statement, correct: item.truth, reason: item.reason, sourceLocator: item.sourceLocator, sourceUrl: item.sourceUrl })));
    return freeze({ id, masteryId: id, unitId: UNITS[0].id, format, formatKey: format, text, choices, answer, sourceFacts, choiceExplanations, statementExplanations: choiceExplanations, explain, trap, memoryRule, diagnosticTags: tags(diagnosticTags), legalBaseline: LEGAL_BASELINE, verifiedAt: VERIFIED_AT, sourceUrl: URLS.act });
  }
  const A = URLS.act, D = URLS.decree, R = URLS.regulation, J = URLS.jointRule;
  const L = (article) => `宅地建物取引業法 ${article}`;
  const O = (article) => `宅地建物取引業法施行令 ${article}`;
  const G = (article) => `宅地建物取引業法施行規則 ${article}`;
  const Q = [
    make("ga001", "単一選択", "営業保証金の主たる事務所の供託額として正しいものはどれか。", 0, [["1,000万円", "主たる事務所は1,000万円。", `${O("2条の4")}`, D], ["500万円", "500万円は従たる事務所1か所ごとの額。", `${O("2条の4")}`, D], ["60万円", "60万円は保証協会の主たる事務所分担金。", `${O("7条")}`, D], ["30万円", "30万円は保証協会の従たる事務所分担金。", `${O("7条")}`, D]], "営業保証金は主1000・従500。保証協会の60・30と絶対に混ぜない。", "『保証協会なら1000万円』と制度を混同する。", "営業保証金=1000/500、保証協会=60/30。", ["number"]),
    make("ga002", "計算問題", "保証協会の社員が主たる事務所1、従たる事務所3を置く。納付すべき弁済業務保証金分担金はいくらか。", 2, [["90万円", "60万円+30万円では従たる事務所1か所分しか加算していない。", `${O("7条")}`, D], ["120万円", "60万円+30万円×2の計算であり、従たる事務所が1か所不足する。", `${O("7条")}`, D], ["150万円", "60万円+30万円×3=150万円。", `${O("7条")}`, D], ["2,500万円", "これは営業保証金主1+従3の計算で、保証協会の分担金ではない。", `${O("2条の4")}`, D]], "保証協会は60+30×従。主従の数を式にして処理する。", "主1000・従500をそのまま使う。", "保証協会の式=60+30n。", ["number", "calculation"]),
    make("ga003", "事例問題", "保証協会の社員となろうとする宅建業者が、分担金を納付する相手として正しいものはどれか。", 1, [["最寄りの供託所", "社員はまず保証協会へ分担金を納付する。供託所へ直接納付しない。", `${L("64条の9")}`, A], ["加入する保証協会", "社員となろうとする者は保証協会に分担金を納付する。", `${L("64条の9")}`, A], ["国土交通大臣", "大臣に分担金を納付する制度ではない。", `${L("64条の9")}`, A], ["取引相手", "取引相手への納付ではない。", `${L("64条の9")}`, A]], "社員→保証協会→供託所。この矢印が基本。", "協会が供託するので、社員も供託所へ払うと思い込む。", "社員は協会へ、協会が供託所へ。", ["counterparty"]),
    make("ga004", "単一選択", "保証協会が、社員から受領した分担金相当額を弁済業務保証金として供託する相手はどれか。", 3, [["社員", "供託の相手は社員ではない。", `${L("64条の7")}`, A], ["被害を受けた取引相手", "還付前に取引相手へ直接交付する制度ではない。", `${L("64条の7")}`, A], ["国土交通大臣", "供託先は大臣ではない。", `${L("64条の7")}`, A], ["供託所", "保証協会は弁済業務保証金を供託所に供託する。", `${L("64条の7")}`, A]], "分担金の受領者と、保証金の供託先を分ける。", "協会が消費者に払う流れと供託の流れを混同する。", "協会→供託所。", ["counterparty"]),
    make("ga005", "単一選択", "保証協会の社員となろうとする宅建業者が、分担金を納付すべき期限はいつか。", 0, [["社員となろうとする日まで", "社員となろうとする者は、その日までに分担金を納付する。", `${L("64条の9")}`, A], ["社員となった日から1週間以内", "1週間は協会の供託期限であり、社員の加入前納付期限ではない。", `${L("64条の9")}`, A], ["社員となった日から2週間以内", "2週間は新設事務所分の納付期限である。", `${L("64条の9")}`, A], ["免許日から1か月以内", "この期限は定められていない。", `${L("64条の9")}`, A]], "加入は『なる前』に納付。", "加入後2週間と新設事務所2週間を取り違える。", "加入=前払い。", ["timing"]),
    make("ga006", "事例問題", "保証協会の社員が従たる事務所を1か所新設した。追加分担金の納付期限はいつか。", 1, [["新設前日まで", "加入時と異なり、新設事務所分は新設後の期限である。", `${L("64条の9")}`, A], ["新設の日から2週間以内", "新たに事務所を設置した社員は、2週間以内に追加分担金を納付する。", `${L("64条の9")}`, A], ["新設の日から1週間以内", "1週間は協会が供託所へ供託する期限。", `${L("64条の7")}`, A], ["新設の日から1か月以内", "1か月は特別弁済業務保証金分担金の納付期限。", `${L("64条の12")}`, A]], "加入前、増設後2週、協会受領後1週。", "すべての期限を1週間に寄せる。", "新設=2週。", ["timing", "number"]),
    make("ga007", "単一選択", "保証協会が社員から分担金を受領したとき、弁済業務保証金を供託すべき期限はいつか。", 2, [["受領前日まで", "受領前に供託することはできない。", `${L("64条の7")}`, A], ["受領日から2週間以内", "2週間は社員の新設事務所分の納付期限。", `${L("64条の9")}`, A], ["受領日から1週間以内", "保証協会は受領した分担金相当額を1週間以内に供託する。", `${L("64条の7")}`, A], ["受領日から1か月以内", "1か月の期限ではない。", `${L("64条の7")}`, A]], "社員の2週と協会の1週は別。", "『新設2週』を協会の供託にも流用する。", "協会が受領→1週で供託。", ["timing", "counterparty"]),
    make("ga008", "単一選択", "保証協会の社員に関する説明として正しいものはどれか。", 3, [["宅建業者は二以上の保証協会の社員となることができる", "宅建業者は二以上の保証協会の社員となれない。", `${L("64条の4")}`, A], ["宅建業者が社員となった旨を直ちに免許権者へ報告する", "報告する主体は宅建業者ではなく保証協会である。", `${L("64条の4")}`, A], ["保証協会は加入又は地位喪失を1か月以内に報告する", "保証協会は加入又は地位喪失を直ちに免許権者へ報告する。", `${L("64条の4")}`, A], ["宅建業者は二以上の保証協会の社員となれず、保証協会が加入又は地位喪失を直ちに免許権者へ報告する", "二重加入禁止と、保証協会による直ちの報告が正しい。", `${L("64条の4")}`, A]], "一社だけ。報告の主語は保証協会。", "報告の主語を宅建業者にすり替える。", "二重不可・協会が直ちに報告。", ["timing", "counterparty"]),
    make("ga009", "単一選択", "保証協会の社員と取引した者が弁済業務保証金から還付を受けられる者として正しいものはどれか。", 1, [["宅建業者である取引相手だけ", "宅建業者は還付請求権者から除かれる。", `${L("64条の8")}`, A], ["宅建業者でない取引相手で、社員となる前の取引による債権者も含む", "弁済業務開始日以後の還付請求では、宅建業者以外の者で、社員となる前の取引から生じた債権者も含まれる。", `${L("64条の8")}`, A], ["社員となった後の取引に限る", "弁済業務開始日以後の還付請求でも、加入前の取引による債権者を排除しない。", `${L("64条の8")}`, A], ["保証協会の社員だけ", "社員自身のための還付制度ではない。", `${L("64条の8")}`, A]], "消費者保護。相手が宅建業者なら除外、加入前債権も入る。弁済業務開始日以後という時点も添える。", "加入前取引は対象外と思い込む。", "非業者＋前の債権も可（開始日以後）。", ["subject", "transaction-type"]),
    make("ga010", "計算問題", "既に認証された還付額0円・還付充当金0円で、主たる事務所1、従たる事務所2の保証協会社員について、取引相手が還付を受けられる上限はいくらか。", 2, [["120万円", "分担金額（60+30×2）を上限とするわけではない。", `${L("64条の8")}`, A], ["1,500万円", "従たる事務所1か所分が不足する。", `${L("25条1項")}`, A], ["2,000万円", "既認証額・還付充当金が0円の前提では、営業保証金を供託していたなら必要な額1,000万円+500万円×2が還付上限。", `${L("64条の8")}`, A], ["無制限", "還付には営業保証金相当額という上限がある。", `${L("64条の8")}`, A]], "還付上限は60・30ではなく、営業保証金なら必要だった1000・500。認証済額等がある問題では別途控除を読む。", "分担金額がそのまま被害者上限だと誤解する。", "被害者上限=営業保証金換算（既認証0・充当0）。", ["number", "calculation"]),
    make("ga011", "手続順序", "弁済業務保証金から還付を受けるための最初の必須手続として正しいものはどれか。", 0, [["保証協会から認証を受ける", "還付を受けようとする者は、まず保証協会の認証を受ける。", `${L("64条の8")}`, A], ["供託所に直接還付請求する", "認証を経ずに供託所へ直接請求する順序ではない。", `${L("64条の8")}`, A], ["社員に分担金の返還を請求する", "被害者の還付手続ではない。", `${L("64条の8")}`, A], ["免許権者の許可を受ける", "免許権者の許可は要件ではない。", `${L("64条の8")}`, A]], "認証→供託所。入口は保証協会。", "営業保証金の還付と同じく供託所直行と誤る。", "還付前に認証。", ["procedure", "counterparty"]),
    make("ga012", "単一選択", "弁済業務保証金の還付請求に必要な保証協会の認証申出書は何通作成するか。", 2, [["1通", "申出書は3通作成する。", `${G("26条の5")}`, R], ["2通", "申出書は3通作成する。", `${G("26条の5")}`, R], ["3通", "認証申出書は3通。債権発生の事実・取引時期・債権額・申出経緯の書面、権利を証する書面に加え、法人なら代表資格、代理なら代理権の書面を添付する。", `${G("26条の5")}`, R], ["4通", "4通ではない。", `${G("26条の5")}`, R]], "認証申出書は3通。事実・時期・額・経緯、権利証明、必要に応じ代表資格・代理権の書面までセット。", "部数だけ覚えて添付書類を落とす。", "認証=3通＋事実/時期/額/経緯＋権利証明。", ["number", "procedure"]),
    make("ga013", "単一選択", "還付により弁済業務保証金が減少した後、保証協会が不足額を供託する期限の起算点として正しいものはどれか。", 1, [["還付請求者が申出をした日", "認証申出日を起算点とする規定ではない。", `${L("64条の8")}`, A], ["法務省令・国土交通省令で定める日から2週間以内", "定める日は保証協会が通知書の送付を受けた日。単に『還付日』と短絡しない。", "法務省令・国土交通省令1条", J], ["保証協会が任意に決めた日から2週間以内", "起算点は法令上定められる。", `${L("64条の8")}`, A], ["社員が通知を受けた日から1週間以内", "これは協会の補充供託期限ではない。", `${L("64条の8")}`, A]], "補充は『還付日』ではなく、協会が通知書送付を受けた日から2週。", "条文の起算点を雑に還付日と呼ぶ。", "補充=通知書送付受領日+2週。", ["timing", "procedure"]),
    make("ga014", "事例問題", "弁済業務保証金の還付後、保証協会が還付充当金を求める場合の説明として正しいものはどれか。", 3, [["保証協会からの通知は不要である", "保証協会は還付に係る社員又は元社員へ還付充当金の納付を通知する。", `${L("64条の10")}`, A], ["現在の社員だけが対象で、社員であった者は対象外である", "還付に係る社員だけでなく社員であった者も通知・納付の対象となる。", `${L("64条の10")}`, A], ["通知を受けた日から1週間以内に納付する", "納付期限は通知を受けた日から2週間以内である。", `${L("64条の10")}`, A], ["社員又は社員であった者は、通知を受けた日から2週間以内に保証協会へ納付する", "対象者・起算点・期限・納付先がすべて正しい。", `${L("64条の10")}`, A]], "還付後は協会→社員・元社員へ通知、通知受領から2週。", "協会の補充供託と、社員等の還付充当金納付を同じ義務だと思う。", "還付充当金=通知を受けた社員等が協会へ2週。", ["timing", "counterparty"]),
    make("ga015", "単一選択", "還付充当金として通知された額を期限までに納付しない保証協会の社員の地位はどうなるか。", 1, [["直ちに免許が失効する", "直ちに免許失効ではなく、保証協会の社員資格を失う。", `${L("64条の10")}`, A], ["保証協会の社員資格を失う", "期限までに納付しないと社員資格を失う。", `${L("64条の10")}`, A], ["営業保証金制度へ自動移行するが期限はない", "資格喪失後には営業保証金を供託すべき期限がある。", `${L("64条の15")}`, A], ["罰金のみで社員資格は維持される", "資格喪失の効果が定められている。", `${L("64条の10")}`, A]], "不納付=社員資格喪失。その後は営業保証金へ。", "免許失効と社員資格喪失を同一視する。", "払わない→資格喪失。", ["effect", "timing"]),
    make("ga016", "事例問題", "指定取消し・解散の特則ではない通常の理由で保証協会の社員資格を失った宅建業者が営業を続けるため、営業保証金を供託すべき期限はいつか。", 2, [["資格喪失前日まで", "資格喪失前に営業保証金の供託義務が生じるわけではない。", `${L("64条の15")}`, A], ["資格喪失から2週間以内", "通常の地位喪失は2週間ではなく1週間。", `${L("64条の15")}`, A], ["資格喪失から1週間以内", "通常の理由で社員資格を失った者は1週間以内に営業保証金を供託する。指定取消し・解散は別特則。", `${L("64条の15")}`, A], ["資格喪失から1か月以内", "1か月ではない。", `${L("64条の15")}`, A]], "通常の資格喪失→営業保証金1週。指定取消し・解散は公示後2週の特則。", "新設事務所2週や特則を混同する。", "通常喪失=1週、取消し・解散=公示後2週。", ["timing", "effect", "principle-exception"]),
    make("ga017", "単一選択", "保証協会が指定を取り消され、又は解散した場合、元社員が営業保証金を供託すべき期限はどれか。", 1, [["社員資格を失った日から1週間以内", "通常の社員資格喪失は1週間だが、保証協会の指定取消し・解散には別の起算点がある。", `${L("64条の15")}`, A], ["その旨の公示の日から2週間以内", "指定取消し・解散時は公示の日から2週間以内に営業保証金を供託する。", `${L("64条の23")}`, A], ["その旨の公示の日から1か月以内", "公示日から1か月ではなく2週間以内である。", `${L("64条の23")}`, A], ["6か月を下らない期間内", "6か月以上は認証申出公告の期間であり、元社員自身の営業保証金供託期限ではない。通常の地位喪失時と取消し・解散時の旧協会公告の双方に6か月以上の期間がある。", `${L("64条の11")}・${L("64条の24")}`, A]], "通常の資格喪失は喪失日から1週、協会の取消し・解散は公示日から2週。", "資格喪失の原因を読まず、すべて1週にする。", "通常喪失1週／取消し・解散の公示後2週。", ["timing", "principle-exception"]),
    make("ga018", "単一選択", "保証協会の社員の地位を失ったとき、債権者へ認証の申出を求める公告期間はどれか。", 3, [["2週間以上", "2週間は保証協会の指定取消し・解散後に元社員が営業保証金を供託する期限と混同している。", `${L("64条の23")}`, A], ["1か月以上", "認証の申出期間は1か月では足りない。", `${L("64条の11")}`, A], ["3か月以上", "認証の申出期間は3か月では足りない。", `${L("64条の11")}`, A], ["6か月を下らない期間", "社員の地位喪失時、保証協会は6か月以上の期間を定めて認証の申出を公告する。", `${L("64条の11")}`, A]], "社員の地位喪失時の認証申出公告は6か月以上。取消し・解散後の営業保証金供託2週と分ける。", "どちらも資格喪失後の話として期限を混ぜる。", "認証申出公告=6か月以上。", ["timing", "principle-exception"]),
    make("ga019", "単一選択", "特別弁済業務保証金分担金を納付すべき社員が期限までに納付しない場合の説明として正しいものはどれか。", 0, [["通知を受けた日から1か月以内に納付しなければ社員資格を失う", "特別分担金は通知を受けた日から1か月以内。未納なら社員資格を失う。", `${L("64条の12")}`, A], ["通知を受けた日から2週間以内であり、未納でも資格を失わない", "期限は1か月であり、未納なら社員資格喪失の規定が準用される。", `${L("64条の12")}`, A], ["社員となる前日までに納付する", "加入時の通常分担金は加入日までであり、特別分担金とは別である。", `${L("64条の9")}`, A], ["供託所へ直接納付する", "社員は特別分担金を保証協会へ納付する。", `${L("64条の12")}`, A]], "特別分担金は通知から1か月、未納なら資格喪失。", "通常の補充・通常分担金の期限を当てる。", "特別=通知+1か月。", ["timing", "principle-exception", "number"]),
    make("ga020", "単一選択", "指定取消し・解散の特則ではない通常の地位喪失を前提に、次の期限対応のうち、すべて正しく対応しているものはどれか。", 2, [["加入=加入後2週／新設=1週／協会受領=2週／資格喪失=1週", "加入は加入前、新設は2週、協会受領は1週なので誤り。", `${L("64条の9")}・${L("64条の7")}・${L("64条の15")}`, A], ["加入=加入前／新設=2週／協会受領=1週／資格喪失=2週", "通常の資格喪失後の営業保証金は1週であり、最後が誤り。", `${L("64条の9")}・${L("64条の7")}・${L("64条の15")}`, A], ["加入=加入前／新設=2週／協会受領=1週／資格喪失=1週", "加入前・新設2週・協会受領1週・通常の資格喪失1週の対応が正しい。", `${L("64条の9")}・${L("64条の7")}・${L("64条の15")}`, A], ["加入=加入前／新設=1か月／協会受領=1週／資格喪失=1週", "新設事務所分は1か月ではなく2週間以内。", `${L("64条の9")}・${L("64条の7")}・${L("64条の15")}`, A]], "期限を孤立暗記せず、当事者と並べて比較する。通常喪失と指定取消し・解散の特則を分ける。", "資格喪失後の営業保証金を2週とする。", "通常喪失=1週（取消し・解散は別）。", ["timing", "procedure", "counterparty", "principle-exception"]),
    make("ga021", "手続順序", "保証協会の社員でない宅建業者が営業を開始するまでの営業保証金手続として正しい順序はどれか。", 1, [["営業開始→主たる事務所最寄りの供託所へ供託→供託書写しを添付して届出", "営業開始は届出後でなければならず、順序が逆。", `${L("25条")}`, A], ["主たる事務所最寄りの供託所へ供託→供託書写しを添付して免許権者へ届出→届出後に営業開始", "法25条は主たる事務所の最寄りの供託所への供託、供託書の写しを添付した届出、届出後の営業開始を要求する。", `${L("25条")}`, A], ["保証協会へ分担金納付→営業開始→供託所へ届出", "非社員の営業保証金手続に保証協会への分担金納付はない。", `${L("25条")}`, A], ["供託書写しを添付せず届出→営業開始→後で供託", "供託と供託書写し添付届出が先。", `${L("25条")}`, A]], "非社員は最寄供託所→写し添付届出→開業。", "供託だけで開業できる、又は届出を先にすると誤る。", "25条=最寄供託所→写し→届出後開業。", ["procedure", "counterparty", "timing"]),
    make("ga022", "単一選択", "営業保証金又は弁済業務保証金の供託に関する説明として正しいものはどれか。", 3, [["必ず現金だけで供託しなければならない", "法は現金に限らず、有価証券を供託することも認める。", `${L("25条3項")}・${L("64条の7")}`, A], ["有価証券は営業保証金には使えるが弁済業務保証金には使えない", "弁済業務保証金にも25条3項が準用され、有価証券供託が認められる。", `${L("64条の7")}`, A], ["有価証券の種類・評価額は宅建業者が自由に決める", "有価証券の種類・評価額は法令に従う。", `${L("25条3項")}`, A], ["営業保証金も弁済業務保証金も、法令に従い有価証券を供託できる", "営業保証金・弁済業務保証金はいずれも、法令に従い有価証券供託ができる。", `${L("25条3項")}・${L("64条の7")}`, A]], "供託=現金だけ、ではない。種類・評価額は法令。", "保証協会制度だけ現金と思い込む。", "25条③は有価証券可、64条の7③で弁済保証金にも準用。", ["principle-exception", "transaction-type"]),
    make("ga023", "単一選択", "宅建業者が宅建業者でない相手方へ、契約成立までに行う供託所等の説明として正しい組合せはどれか。", 2, [["非社員は説明不要／社員は開始日前後を問わず保証協会名だけを説明", "非社員にも営業保証金の供託所等の説明が必要で、社員の説明事項も協会名だけではない。", `${L("35条の2")}`, A], ["非社員は保証協会の名称を説明／社員は主たる事務所最寄りの供託所だけを説明", "非社員と社員の説明事項が逆である。", `${L("35条の2")}`, A], ["非社員は営業保証金の供託所・所在地／社員は開始日前なら非社員事項と協会事項の両方、開始日以後なら社員である旨・協会情報・協会の供託所等", "35条の2の非社員、弁済業務開始日前の社員、開始日以後の社員の三分岐が正しい。", `${L("35条の2")}`, A], ["社員・非社員とも、免許権者と免許番号だけを説明", "35条の2が求める供託所・保証協会に関する事項ではない。", `${L("35条の2")}`, A]], "35条の2は非社員=営業保証金供託所、社員=協会情報と協会の供託所。開始日前の社員は両方。", "営業開始制限の条文と、契約前の相手方説明を混同する。", "35条の2=非社員①／社員は開始前①②・開始後②。", ["subject", "timing", "procedure"]),
    make("ga024", "事例問題", "弁済業務開始日後に社員となった宅建業者について、保証協会が、その加入前取引の債権を弁済すると業務の円滑な運営に支障のおそれがあると認めた場合、当該社員に求められるものはどれか。", 0, [["担保の提供", "保証協会は、加入前取引の債権に関して弁済が行われると業務に支障のおそれがある場合、社員に担保の提供を求めることができる。", `${L("64条の4第3項")}`, A], ["加入前取引債務の当然免除", "免除制度ではなく、保証協会が担保提供を求められる規定。", `${L("64条の4第3項")}`, A], ["国への特別分担金の納付", "担保の提供先を国とする特別分担金制度ではない。", `${L("64条の4第3項")}`, A], ["加入前取引の全件取消し", "取引を取り消す規定ではない。", `${L("64条の4第3項")}`, A]], "通常は加入前取引が対象。弁済業務開始日前から社員だった者は、開始日前取引を基準にする。支障のおそれがあれば協会が社員へ担保提供を求められる。", "加入前取引は一切対象外だと思う。", "64条の4③=通常は加入前（開始日前加入者は開始日前）＋支障のおそれ→担保提供を請求可。", ["transaction-type", "principle-exception", "counterparty"]),
    make("ga025", "単一選択", "社員の地位喪失後の弁済業務保証金の取戻し・分担金返還について正しいものはどれか。", 3, [["地位喪失と同時に、公告なしで当然に全額を返還する", "6か月以上の認証申出公告期間の経過などを待つ必要がある。", `${L("64条の11")}`, A], ["公告期間中に認証申出が1件でもあれば、無条件で全額を返還する", "認証や還付充当金に関する債権への弁済を終えずに無条件返還はできない。", `${L("64条の11")}`, A], ["公告期間さえ終われば、協会が元社員に有する債権を無視して返還する", "協会が元社員等に債権を持つ場合は、その弁済完了後に返還する。", `${L("64条の11")}`, A], ["6か月以上の認証申出公告期間が経過し、協会の債権等があればその弁済完了後、協会が弁済業務保証金を取り戻したときは分担金を返還する", "64条の11は、公告期間の経過等により協会が弁済業務保証金を取り戻せる場合を定め、実際に取り戻したときに分担金を返還させる。協会の債権等があれば、その弁済完了後に返還する。", `${L("64条の11")}`, A]], "地位喪失時は『6か月以上の公告等→協会が保証金を取戻し→分担金返還』。協会債権等があれば弁済後。", "公告期間が終われば、取戻しの有無にかかわらず当然に返ると思い込む。", "返還=6か月公告等→保証金取戻し→協会債権等の弁済後。", ["timing", "procedure", "principle-exception"]),
    make("ga026", "単一選択", "保証協会が指定を取り消され、又は解散した場合、旧協会が行う認証申出公告として正しいものはどれか。", 1, [["指定取消し・解散前に、期間を定めず公告する", "旧協会は公示後1週間以内に、6か月以上の期間を定めて公告する。", `${L("64条の24")}`, A], ["公示後1週間以内に、6か月を下らない期間を定めて認証申出を公告する", "旧協会は、公示後1週間以内に、6か月を下らない期間を定めて認証の申出をすべき旨を公告する。", `${L("64条の24")}`, A], ["公示後2週間以内に、2週間以上の期間を定めて公告する", "公告着手期限も申出期間も異なる。", `${L("64条の24")}`, A], ["元社員だけが任意の時期に公告する", "公告義務の主体は旧協会である。", `${L("64条の24")}`, A]], "取消し・解散時は旧協会が公示後1週以内に、認証申出期間を6か月以上として公告する。", "元社員の営業保証金供託2週と、旧協会の公告着手1週を混ぜる。", "64条の24=旧協会→公示後1週以内→6か月以上公告。", ["subject", "timing", "procedure"])
  ];
  const formatKeys = Object.freeze({ "単一選択": "single", "事例問題": "case", "計算問題": "calculation", "個数問題": "count", "手続順序": "procedure" });
  // Each row carries its reading-friendly source note above. This table is the
  // canonical per-question/per-choice source projection used by the frozen API,
  // so presentation rotation never changes a legal locator or its e-Gov URL.
  function exactSource(questionId, index) {
    if (questionId === "ga001") return index < 2 ? [O("2条の4"), D] : [O("7条"), D];
    if (questionId === "ga002") return index < 3 ? [O("7条"), D] : [O("2条の4"), D];
    if (["ga003", "ga005"].includes(questionId)) return [L("64条の9"), A];
    if (questionId === "ga006") return index < 2 ? [L("64条の9"), A] : index === 2 ? [L("64条の7"), A] : [L("64条の12"), A];
    if (questionId === "ga004") return [L("64条の7"), A];
    if (questionId === "ga007") return index === 1 ? [L("64条の9"), A] : [L("64条の7"), A];
    if (questionId === "ga008") return [L("64条の4"), A];
    if (["ga009", "ga011"].includes(questionId)) return [L("64条の8"), A];
    if (questionId === "ga013") return [`${L("64条の8")}・宅地建物取引業保証協会弁済業務保証金規則 1条`, J, freeze([A, J])];
    if (questionId === "ga010") return index <= 2 ? [`${L("64条の8")}・${O("2条の4")}`, D, freeze([A, D])] : [L("64条の8"), A];
    if (questionId === "ga012") return [G("26条の5"), R];
    if (questionId === "ga014") return [L("64条の10"), A];
    if (questionId === "ga015") return index === 2 ? [L("64条の15"), A] : [L("64条の10"), A];
    if (questionId === "ga016") return [L("64条の15"), A];
    if (questionId === "ga017") return index === 0 ? [L("64条の15"), A] : index === 3 ? [`${L("64条の11")}・${L("64条の24")}`, A] : [L("64条の23"), A];
    if (questionId === "ga018") return index === 0 ? [L("64条の23"), A] : [L("64条の11"), A];
    if (questionId === "ga019") return index === 2 ? [L("64条の9"), A] : [L("64条の12"), A];
    if (questionId === "ga021") return [L("25条"), A];
    if (questionId === "ga022") return [index === 1 ? L("64条の7") : `${L("25条3項")}・${L("64条の7")}`, A];
    if (questionId === "ga023") return [L("35条の2"), A];
    if (questionId === "ga024") return [L("64条の4第3項"), A];
    if (questionId === "ga025") return [L("64条の11"), A];
    if (questionId === "ga026") return [L("64条の24"), A];
    return [`${L("64条の9")}・${L("64条の7")}・${L("64条の15")}`, A];
  }
  const QUESTIONS = freeze(Q.map((question) => {
    const sourceFacts = freeze(question.sourceFacts.map((item, index) => {
      const [sourceLocator, sourceUrl, sourceUrls] = exactSource(question.id, index);
      return freeze({ ...item, sourceLocator, sourceUrl, sourceUrls: sourceUrls || freeze([sourceUrl]) });
    }));
    const choiceExplanations = freeze(sourceFacts.map((item) => `${item.truth ? "○" : "×"} ${item.reason}（${item.sourceLocator}）`));
    const sourceUrls = freeze([...new Set(sourceFacts.flatMap((item) => item.sourceUrls))]);
    const sourceRef = sourceUrls.map((sourceUrl) => [...new Set(sourceFacts
      .filter((item) => item.sourceUrls.includes(sourceUrl))
      .map((item) => item.sourceLocator))].join("・")).join("／");
    return freeze({ ...question, unitLabel: UNITS[0].label, formatKey: formatKeys[question.format], sourceFacts, choiceExplanations, statementExplanations: choiceExplanations, sourceRef, sourceUrl: sourceFacts[0].sourceUrl, sourceUrls });
  }));
  const QUESTIONS_BY_ID = freeze(Object.fromEntries(QUESTIONS.map((question) => [question.id, question])));
  function stableHash(value) { return [...String(value)].reduce((hash, ch) => Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261); }
  // 4! = 24. The table is generated by Fisher-Yates-equivalent insertion so a
  // presentation key selects among every possible relative order, not a mere rotation.
  const PRESENTATION_PERMUTATIONS = freeze((() => {
    const build = (items) => items.length === 0 ? [[]] : build(items.slice(1)).flatMap((tail) => Array.from({ length: tail.length + 1 }, (_, position) => [...tail.slice(0, position), items[0], ...tail.slice(position)]));
    return build([0, 1, 2, 3]).map((order) => freeze(order));
  })());
  function presentQuestion(questionOrId, presentationKey = "") {
    const question = typeof questionOrId === "string" ? QUESTIONS_BY_ID[questionOrId] : questionOrId;
    if (!question || !QUESTIONS_BY_ID[question.id]) throw new Error("unknown guarantee-association question");
    const key = String(presentationKey || question.id);
    const permutationIndex = stableHash(`${question.id}\u0000${key}`) % PRESENTATION_PERMUTATIONS.length;
    const order = PRESENTATION_PERMUTATIONS[permutationIndex];
    return freeze({ ...question, choices: freeze(order.map((index) => question.choices[index])), sourceFacts: freeze(order.map((index) => question.sourceFacts[index])), choiceExplanations: freeze(order.map((index) => question.choiceExplanations[index])), statementExplanations: freeze(order.map((index) => question.statementExplanations[index])), answer: order.indexOf(question.answer), presentationOrder: order, presentationOffset: order[0], presentationPermutationIndex: permutationIndex, presentationKey: String(presentationKey || question.id) });
  }
  function diagnosticsForSelection(questionOrId, selected, uncertain = false) {
    const question = typeof questionOrId === "string" ? QUESTIONS_BY_ID[questionOrId] : questionOrId;
    if (!question || uncertain || selected !== question.answer) return question ? question.diagnosticTags : freeze([]);
    return freeze([]);
  }
  const api = freeze({ VERSION, LEGAL_BASELINE, VERIFIED_AT, UNITS, QUESTIONS, QUESTIONS_BY_ID, presentQuestion, diagnosticsForSelection });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof globalThis !== "undefined") globalThis.TAKKEN_GUARANTEE_ASSOCIATION_DRILL = api;
})();
