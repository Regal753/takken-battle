"use strict";

// Independent 2026-current-law scenarios for the restrictions sprint.
// These questions intentionally live outside the fixed 100-question core so
// existing mock forms, curriculum IDs and saved core progress remain stable.
(function attachRestrictionsSupplement(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_RESTRICTIONS_SUPPLEMENT_BANK = api;
  if (root.window && root.window !== root) root.window.TAKKEN_RESTRICTIONS_SUPPLEMENT_BANK = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRestrictionsSupplement() {
  const VERSION = 2;
  const LEGAL_BASELINE = "2026-04-01";
  const VERIFIED_AT = "2026-09-10";
  const kana = Object.freeze(["ア", "イ", "ウ", "エ"]);
  const countLabels = Object.freeze(["一つ", "二つ", "三つ", "四つ"]);

  function numericId(id) {
    return Number.parseInt(String(id).replace(/\D/g, ""), 10) || 1;
  }

  function common(input) {
    const sourceUrls = (Array.isArray(input.sourceUrls) ? input.sourceUrls : [input.sourceUrl])
      .map(String)
      .filter(Boolean);
    const groundingFrame = input.groundingFrame && typeof input.groundingFrame === "object"
      ? Object.freeze(Object.fromEntries(["area", "action", "actor", "threshold"].map((key) => [
          key,
          String(input.groundingFrame[key] || "").trim()
        ])))
      : null;
    return {
      id: input.id,
      sectionId: "restrictions",
      tag: input.tag,
      sourceAnchor: input.sourceAnchor,
      explain: input.explain,
      trap: input.trap,
      memoryRule: input.memoryRule || input.explain,
      sourceRef: input.sourceRef,
      sourceLocator: input.sourceLocator,
      sourceUrl: input.sourceUrl,
      sourceUrls: Object.freeze(sourceUrls),
      legalBaseline: LEGAL_BASELINE,
      verifiedAt: VERIFIED_AT,
      level: input.level || "本試験標準・独立事例",
      qualityVersion: 2,
      ...(groundingFrame ? { groundingFrame } : {})
    };
  }

  function single(input) {
    const ask = input.ask === "incorrect" ? "incorrect" : "correct";
    const candidates = input.truths
      .map((truth, index) => ({ truth: Boolean(truth), index }))
      .filter((item) => ask === "incorrect" ? !item.truth : item.truth);
    if (candidates.length !== 1) throw new Error(`${input.id}: single question needs exactly one answer`);
    const answer = (numericId(input.id) - 1) % 4;
    const shift = (candidates[0].index - answer + 4) % 4;
    const order = [0, 1, 2, 3].map((_, index) => (index + shift) % 4);
    const choices = order.map((index) => input.choices[index]);
    const truths = order.map((index) => Boolean(input.truths[index]));
    const notes = order.map((index) => input.notes[index]);
    return Object.freeze({
      ...common(input),
      format: "単一選択",
      text: `${input.prompt}\n次の記述のうち、${ask === "incorrect" ? "誤っている" : "正しい"}ものはどれか。`,
      choices: Object.freeze(choices),
      answer,
      choiceExplanations: Object.freeze(notes.map((note, index) =>
        `${index + 1} ${truths[index] ? "○" : "×"} ${note}`
      )),
      choiceOriginIndexes: Object.freeze(order)
    });
  }

  function count(input) {
    const correctCount = input.truths.filter(Boolean).length;
    if (correctCount < 1 || correctCount > 4) throw new Error(`${input.id}: invalid true-statement count`);
    return Object.freeze({
      ...common(input),
      format: "個数問題",
      text: `${input.prompt}\n${input.statements.map((statement, index) => `${kana[index]} ${statement}`).join("\n")}`,
      choices: countLabels,
      answer: correctCount - 1,
      choiceExplanations: Object.freeze(input.notes.map((note, index) =>
        `${kana[index]} ${input.truths[index] ? "○" : "×"} ${note}`
      ))
    });
  }

  const cityPlanningUrl = "https://laws.e-gov.go.jp/law/343AC0000000100?occasion_date=20260401";
  const buildingLawUrl = "https://laws.e-gov.go.jp/law/325AC0000000201?occasion_date=20260401";
  const buildingRevisionUrl = "https://www.mlit.go.jp/jutakukentiku/build/r4kaisei_kijunhou0001.html";
  const buildingUseChangeUrl = "https://www.mlit.go.jp/sogoseisaku/kanminrenkei/content/001762205.pdf";
  const floorAreaRatioUrl = "https://www.mlit.go.jp/common/001205298.pdf";
  const northSlantUrl = "https://www.mlit.go.jp/jutakukentiku/house/content/001854167.pdf";
  const developmentPermitUrl = "https://www.mlit.go.jp/toshi/city_plan/toshi_city_plan_fr_000046.html";
  const nationalLandUrl = "https://laws.e-gov.go.jp/law/349AC0000000092?occasion_date=20260401";
  const nationalLandOperationalUrl = "https://www.mlit.go.jp/common/001199260.pdf";
  const nationalLandRevisionUrl = "https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo02_hh_000001_00106.html";
  const agriculturalUrl = "https://laws.e-gov.go.jp/law/327AC0000000229?occasion_date=20260401";
  const readjustmentUrl = "https://laws.e-gov.go.jp/law/329AC0000000119?occasion_date=20260401";
  const readjustmentGuidanceUrl = "https://www.mlit.go.jp/notice/noticedata/sgml/043/77000130/77000130.html";
  const fillUrl = "https://laws.e-gov.go.jp/law/336AC0000000191?occasion_date=20260401";
  const culturalUrl = "https://laws.e-gov.go.jp/law/325AC1000000214?occasion_date=20260401";
  const roadUrl = "https://laws.e-gov.go.jp/law/327AC1000000180?occasion_date=20260401";
  const roadTrafficUrl = "https://laws.e-gov.go.jp/law/335AC0000000105?occasion_date=20260401";

  const questions = [
    single({
      id: "rs001",
      tag: "開発工事の完了検査・公告",
      sourceAnchor: "都市計画法",
      prompt: "Aは開発許可を受けた工事を完了した。都市計画法上の完了手続に関する事例である。",
      choices: [
        "Aは工事を完了したとき、都道府県知事へ届け出なければならない。",
        "知事は現地を検査せず、Aの届出だけで検査済証を交付しなければならない。",
        "完了の届出後であれば、完了公告前でも予定建築物を当然に自由に建築できる。",
        "工事完了公告は、開発許可をした時点で先に行われる。"
      ],
      truths: [true, false, false, false],
      notes: [
        "開発許可を受けた者は工事完了時に知事へ届け出る。",
        "知事は工事が許可内容に適合するか検査し、適合すると認めたときに検査済証を交付する。",
        "完了公告前は原則として建築物の建築等が制限され、届出だけで当然に解除されない。",
        "公告は完了検査を経た後に行われるので、開発許可時ではない。"
      ],
      explain: "開発工事は、完了届出→知事の検査→検査済証→完了公告の順で処理する。",
      trap: "届出をした時点と、知事が完了公告をした時点を同じにしない。",
      memoryRule: "完了届→検査→検査済証→公告。公告前の建築は原則制限。",
      sourceRef: "都市計画法",
      sourceLocator: "都市計画法36条・37条",
      sourceUrl: cityPlanningUrl
    }),
    count({
      id: "rs002",
      tag: "市街化調整区域の建築許可",
      sourceAnchor: "都市計画法",
      prompt: "市街化調整区域内のうち、開発許可を受けた開発区域以外の土地における建築等を判定する。",
      statements: [
        "建築物を新築し、改築し、又は用途を変更する場合、原則として知事の許可が問題となる。",
        "敷地面積が小さければ、建築物の用途を問わず当然に許可不要となる。",
        "建築基準法に適合する建物であれば、都市計画法上の許可は常に不要である。",
        "既存建築物の用途変更も、都市計画法上の許可対象となる場合がある。"
      ],
      truths: [true, false, false, true],
      notes: [
        "市街化調整区域では、区域外建築等について43条許可が原則となる。",
        "市街化区域の規模基準をそのまま使う制度ではなく、小規模というだけで全面的に外れない。",
        "建築基準法への適合と都市計画法43条の許可要否は別に判定する。",
        "新築・改築だけでなく用途変更も43条の規制対象に含まれる。"
      ],
      explain: "調整区域では、場所・行為・例外の順に43条許可を判定する。",
      trap: "建築確認が通ることと、調整区域で建築できることを混同しない。",
      memoryRule: "調整区域で開発許可を受けた開発区域外の建築等は43条。新築・改築・用途変更を確認。",
      sourceRef: "都市計画法",
      sourceLocator: "都市計画法43条",
      sourceUrl: cityPlanningUrl
    }),
    count({
      id: "rs003",
      tag: "令和7年建築確認対象見直し",
      sourceAnchor: "建築基準法",
      prompt: "令和7年4月施行の見直し後、都市計画区域・準都市計画区域・準景観地区等の区域外で判定する。用途による特別規制は考えない。",
      statements: [
        "都市計画区域等の外でも、木造2階建て住宅の新築は延べ面積200平方メートル以下であっても建築確認の対象となる。",
        "都市計画区域等の外では、構造を問わず2階以上又は延べ面積200平方メートル超の建築物が建築確認の対象となる。",
        "都市計画区域等の外に建てる平家・延べ面積200平方メートルの一般住宅は、規模だけを理由に必ず建築確認の対象となる。",
        "見直し後も木造建築物の確認対象となる規模は従前と全く変わらない。"
      ],
      truths: [true, true, false, false],
      notes: [
        "区域外でも2階以上なら、200平方メートル以下かどうかを問わず確認対象となる。",
        "区域外の基準は構造共通で『2階以上又は200平方メートル超』。",
        "平家かつ200平方メートル以下は、この規模基準だけでは確認対象に入らない。200平方メートル『超』との違いに注意する。",
        "令和7年4月の見直しで木造建築物の確認・検査対象が拡大された。"
      ],
      explain: "区域外は『2階以上又は200平方メートル超』。200平方メートルちょうどと超過を分ける。",
      trap: "旧4号建築物の感覚で、2階建て木造を確認不要にしない。",
      memoryRule: "区域外でも2階以上か200平方メートル超なら確認。",
      sourceRef: "建築基準法",
      sourceLocator: "建築基準法6条1項3号／国土交通省『建築確認・検査の対象となる建築物の規模等の見直し』",
      sourceUrl: buildingRevisionUrl,
      level: "2026改正対応"
    }),
    single({
      id: "rs004",
      tag: "木造戸建ての大規模修繕",
      sourceAnchor: "建築基準法",
      prompt: "令和7年4月施行の見直し後、新2号建築物に該当する木造2階建て戸建住宅について、主要構造部の一種以上の過半を修繕又は模様替する事例である。",
      choices: [
        "大規模の修繕又は大規模の模様替に当たり、原則として工事着手前に建築確認を受けなければならない。",
        "新築ではないため、工事規模や内容を問わず建築確認は不要である。",
        "確認が必要でも、工事着手後に申請すれば必ず足りる。",
        "構造関係規定の審査を省略できる場合は、建築確認そのものも受けたことになる。"
      ],
      truths: [true, false, false, false],
      notes: [
        "新2号建築物に当たる木造戸建ての大規模修繕・模様替は確認対象となる。",
        "リフォームでも主要構造部の過半を扱う大規模修繕・模様替は確認手続の対象となる。",
        "建築確認は工事着手前に受ける手続であり、後追い申請を原則としない。",
        "審査省略は確認手続そのものの免除ではなく、審査する規定の範囲に関する制度である。"
      ],
      explain: "『新築でないから確認不要』ではなく、建物区分と大規模修繕・模様替の該当性で判定する。",
      trap: "4号特例の縮小と、建築確認そのものの要否を混同しない。",
      memoryRule: "木造2階の大規模リフォームも、着工前確認を検討。",
      sourceRef: "建築基準法",
      sourceLocator: "建築基準法2条14号・15号、6条1項2号／国土交通省の令和7年4月見直し資料",
      sourceUrl: buildingRevisionUrl,
      level: "2026改正対応"
    }),
    count({
      id: "rs005",
      tag: "国土法の国籍等届出事項",
      sourceAnchor: "国土利用計画法",
      prompt: "国土利用計画法23条の大規模土地取引に係る届出事項について、令和8年4月1日現在で判定する。",
      statements: [
        "権利取得者が個人である場合の国籍等は、令和7年7月から届出事項に加えられている。",
        "権利取得者が法人である場合の設立準拠法国は、令和7年7月から届出事項に加えられている。",
        "法人代表者の国籍等や、同一国籍等の者が役員又は議決権の過半数を占める場合の当該国籍等は、令和8年4月から届出事項に加えられた。",
        "国籍等の届出事項が追加されたため、土地の利用目的を届け出る必要はなくなった。"
      ],
      truths: [true, true, true, false],
      notes: [
        "令和7年7月施行の省令改正で、個人の国籍等が追加された。",
        "同じ改正で、法人には設立準拠法国が追加された。",
        "令和8年4月施行の改正で、法人代表者や役員・議決権の過半数に関する国籍等が追加された。",
        "利用目的の届出は制度の中心であり、追加項目によって廃止されていない。"
      ],
      explain: "従来の利用目的等に、権利取得者の属性を把握する項目が段階的に追加された。",
      trap: "届出事項の追加を、届出制度や利用目的審査の廃止と読み違えない。",
      memoryRule: "R7は個人国籍・法人準拠国、R8は法人代表者と過半数情報。",
      sourceRef: "国土利用計画法",
      sourceLocator: "国土交通省 令和8年2月2日報道発表／国土利用計画法施行規則（届出書様式）",
      sourceUrl: nationalLandRevisionUrl,
      level: "2026改正対応"
    }),
    single({
      id: "rs006",
      tag: "事後届出後の勧告・公表",
      sourceAnchor: "国土利用計画法",
      prompt: "大規模な土地売買等について、権利取得者が国土利用計画法23条の事後届出をした。",
      choices: [
        "知事は届出された土地の利用目的を審査し、必要があると認めるときは利用目的の変更等を勧告できる。",
        "届出後の審査で問題があれば、知事は売買契約を当然に私法上無効にできる。",
        "事後届出は常に売主だけが行い、権利取得者は届出義務を負わない。",
        "事後届出制度では取引価格だけを審査し、土地の利用目的は審査しない。"
      ],
      truths: [true, false, false, false],
      notes: [
        "知事は利用目的を審査し、土地利用基本計画等に適合しない場合などに利用目的変更等を勧告できる。",
        "勧告・公表等の公法上の手続と、当事者間の契約効力は別である。",
        "事後届出をする主体は、買主などの土地に関する権利取得者である。",
        "通常の事後届出では利用目的が審査の中心となる。"
      ],
      explain: "事後届出は、取得後の土地利用目的を審査し、必要なら変更等を勧告する制度。",
      trap: "届出違反・勧告と、売買契約の私法上の効力を直結させない。",
      memoryRule: "買主が届出、知事は利用目的を審査、必要なら勧告。",
      sourceRef: "国土利用計画法",
      sourceLocator: "国土利用計画法23条・24条・26条",
      sourceUrl: nationalLandUrl
    }),
    count({
      id: "rs007",
      tag: "市街化区域内の農地転用届出",
      sourceAnchor: "農地法",
      prompt: "市街化区域内の農地について、農地法3条・4条・5条を区別する。",
      statements: [
        "所有者が自分の農地を自ら宅地へ転用する場合、あらかじめ農業委員会へ届け出れば4条許可が不要となる特例がある。",
        "農地を宅地へ転用する目的で売買する場合、当事者があらかじめ農業委員会へ届け出れば5条許可が不要となる特例がある。",
        "農地を農地のまま売買する場合も、市街化区域内なら3条許可は一律に届出へ置き換わる。",
        "一時転用であれば、市街化区域内でも許可・届出を一切検討しなくてよい。"
      ],
      truths: [true, true, false, false],
      notes: [
        "市街化区域内の自己転用は、事前届出により4条許可が不要となる場合がある。",
        "市街化区域内の転用目的権利移動は、事前届出により5条許可が不要となる場合がある。",
        "市街化区域の届出特例は4条・5条の転用であり、農地のままの3条へ一律に広がらない。",
        "一時転用も転用であり、短期間というだけで手続不要にはならない。"
      ],
      explain: "市街化区域の届出特例は転用の4条・5条。農地のまま動かす3条と切り分ける。",
      trap: "『市街化区域なら全部届出』と覚えない。",
      memoryRule: "市街化区域の届出は転用4・5。農地のまま3は別。",
      sourceRef: "農地法",
      sourceLocator: "農地法3条・4条・5条（市街化区域内の届出特例）",
      sourceUrl: agriculturalUrl
    }),
    single({
      id: "rs008",
      tag: "農地取得の効力・相続・一時転用",
      sourceAnchor: "農地法",
      ask: "incorrect",
      prompt: "農地法の許可の効力、相続及び一時転用に関する事例である。",
      choices: [
        "3条許可が必要な農地売買は、その許可を受けなければ所有権移転の効力を生じない。",
        "相続による農地取得には3条許可を要しないが、農業委員会への届出が問題となる。",
        "農地を資材置場として一時的に使う場合も、転用手続を検討する。",
        "一時転用は期間が短いので、場所や目的を問わず農地法の許可・届出が一切不要である。"
      ],
      truths: [true, true, true, false],
      notes: [
        "必要な3条許可を欠く法律行為は、農地法上その効力を生じない。",
        "相続は3条許可の対象外だが、取得を知った後の届出制度がある。",
        "一時的に農地以外へ用いる場合も農地転用に当たり得る。",
        "短期間であることだけを理由に、転用規制から一律に外れることはない。"
      ],
      explain: "権利移動の効力、相続の例外、一時転用の規制を別々に判断する。",
      trap: "許可不要の相続と、期間が短い一時転用を同じ例外にしない。",
      memoryRule: "無許可3条は効力なし。相続は許可不要・届出。一時転用も規制。",
      sourceRef: "農地法",
      sourceLocator: "農地法3条（許可・効力）・3条の3（相続等の届出）・4条・5条",
      sourceUrl: agriculturalUrl
    }),
    single({
      id: "rs009",
      tag: "換地処分公告後の権利移転",
      sourceAnchor: "土地区画整理法",
      prompt: "土地区画整理事業の換地処分について公告がされた。",
      choices: [
        "換地計画で定められた換地は、公告日の翌日から従前の宅地とみなされる。",
        "所有権は仮換地の指定日に当然に仮換地へ移転済みなので、換地処分公告は権利関係に影響しない。",
        "換地処分公告があっても、従前地と換地の権利関係は永久に併存する。",
        "換地処分によって、従前地上の抵当権その他の権利は例外なく全て消滅する。"
      ],
      truths: [true, false, false, false],
      notes: [
        "換地は換地処分公告日の翌日から従前の宅地とみなされ、権利関係が移行する。",
        "仮換地指定は使用収益する場所を動かす制度で、所有権の対象変更は換地処分で起こる。",
        "公告翌日に換地へ権利関係が移るため、二つの土地へ永久に併存する制度ではない。",
        "従前地上の権利は原則として換地へ移行し、抵当権が一律消滅するわけではない。"
      ],
      explain: "仮換地は使用収益、換地処分公告の翌日は権利の対象変更という時系列で整理する。",
      trap: "仮換地指定日に所有権まで移ったと考えない。",
      memoryRule: "公告翌日、換地を従前地とみなして権利が移る。",
      sourceRef: "土地区画整理法",
      sourceLocator: "土地区画整理法103条・104条",
      sourceUrl: readjustmentUrl
    }),
    count({
      id: "rs010",
      tag: "減歩・清算金",
      sourceAnchor: "土地区画整理法",
      prompt: "土地区画整理事業における換地、減歩及び清算金を判定する。",
      statements: [
        "従前の宅地と換地の評価上の不均衡を調整するため、清算金を徴収し又は交付する場合がある。",
        "道路・公園等の公共施設用地や事業費を生み出すため、換地の面積が従前地より小さくなる減歩が生じる場合がある。",
        "全ての地権者には、従前地と必ず同一面積の換地を指定しなければならない。",
        "清算金が定められると、換地処分全体が当然に無効となる。"
      ],
      truths: [true, true, false, false],
      notes: [
        "換地相互の不均衡は、金銭の徴収又は交付で調整できる。",
        "公共減歩・保留地減歩により、換地面積が従前地より小さくなることがある。",
        "照応の原則は面積の完全一致を意味せず、位置・地積・環境等を総合して定める。",
        "清算金は換地の不均衡を調整する制度であり、その存在だけで換地処分を無効にしない。"
      ],
      explain: "面積の完全一致ではなく照応で換地を定め、残る不均衡を清算金で調整する。",
      trap: "減歩と収用を同一視せず、清算金を全員一律の補償金と考えない。",
      memoryRule: "換地は照応、面積は減歩あり、不均衡は清算金。",
      sourceRef: "土地区画整理法",
      sourceLocator: "土地区画整理法89条・94条",
      sourceUrl: readjustmentUrl
    }),
    count({
      id: "rs011",
      tag: "盛土規制法の対象・区域",
      sourceAnchor: "宅地造成及び特定盛土等規制法",
      prompt: "宅地造成及び特定盛土等規制法の対象と規制区域を判定する。",
      statements: [
        "盛土等を行う土地の用途や目的にかかわらず、危険な盛土等を包括的に規制する制度である。",
        "宅地造成等工事規制区域と特定盛土等規制区域という二つの規制区域がある。",
        "一定規模の土石の堆積は、土地を恒久的な宅地にしないため規制対象から一律に除外される。",
        "規制区域を指定できるのは市町村長だけで、都道府県知事等は指定に関与しない。"
      ],
      truths: [true, true, false, false],
      notes: [
        "令和5年施行の盛土規制法は、用途・目的を問わず危険な盛土等を包括的に規制する。",
        "市街地等を広く囲む区域と、市街地等から離れていても危険な盛土等を規制する区域がある。",
        "一定規模以上の土石の堆積も規制対象となり得る。",
        "都道府県知事等が基礎調査を踏まえて規制区域を指定する。"
      ],
      explain: "旧宅造法の『宅地だけ』という見方を捨て、用途横断・二区域・土石堆積まで確認する。",
      trap: "法律名に宅地造成とあっても、農地・森林や土石堆積を自動的に除外しない。",
      memoryRule: "用途横断、二区域、盛土・切土・土石堆積。",
      sourceRef: "国土交通省盛土規制法ポータル／宅地造成及び特定盛土等規制法",
      sourceLocator: "盛土規制法10条・26条／国土交通省盛土規制法ポータル",
      sourceUrl: "https://www.mlit.go.jp/toshi/morido-portal.html",
      sourceUrls: ["https://www.mlit.go.jp/toshi/morido-portal.html", fillUrl]
    }),
    count({
      id: "rs012",
      tag: "盛土許可申請前後の義務",
      sourceAnchor: "宅地造成及び特定盛土等規制法",
      prompt: "宅地造成等工事規制区域内で、許可を要する盛土工事を計画する工事主Aについて判定する。",
      statements: [
        "Aは許可申請前に、省令所定の説明会の開催その他の措置により、周辺地域の住民へ工事内容を周知しなければならない。",
        "Aは原則として、工事を行う土地について所有権、地上権、賃借権その他の使用又は収益を目的とする権利を有する者全員の同意を得なければならない。",
        "許可を受ければ、工事の規模を問わず中間検査や完了検査を一切受けなくてよい。",
        "工事完了後は、土地所有者等に盛土等を安全な状態に維持する責務はない。"
      ],
      truths: [true, true, false, false],
      notes: [
        "許可申請前に、省令所定の説明会の開催その他の措置による周辺住民への周知が必要となる。",
        "土地について所有権、地上権、賃借権その他の使用又は収益を目的とする権利を有する者全員の同意が原則必要となる。",
        "一定規模の工事には中間検査があり、工事完了後には完了検査を受ける。",
        "土地所有者等には、盛土等に伴う災害が生じないよう安全な状態を維持する責務がある。"
      ],
      explain: "許可だけで終わらず、申請前の周知・権利者同意から施工中検査、完了後の維持まで続く。",
      trap: "許可取得をゴールにせず、前後の義務を時系列で並べる。",
      memoryRule: "申請前は住民周知・権利者同意、施工中検査、完了後も安全維持。",
      sourceRef: "宅地造成及び特定盛土等規制法",
      sourceLocator: "盛土規制法11条・12条2項・17条・18条・22条",
      sourceUrl: fillUrl
    }),
    single({
      id: "rs013",
      tag: "遺跡発見時の届出",
      sourceAnchor: "文化財保護法",
      prompt: "周知の埋蔵文化財包蔵地ではない土地で工事中、Aが遺跡と認められるものを発見した。",
      choices: [
        "土地の所有者又は占有者は、原則として現状を変更せず、遅滞なく文化庁長官へ届け出なければならない。",
        "周知の包蔵地でなかった以上、発見後も文化財保護法上の届出は一切不要である。",
        "発見時の届出は、工事着手60日前までにさかのぼって行わなければならない。",
        "遺跡を発見した瞬間に、その土地の所有権は当然に国へ移転する。"
      ],
      truths: [true, false, false, false],
      notes: [
        "周知の包蔵地外で遺跡を発見した場合にも、所有者・占有者は原則として現状を変更せず文化庁長官へ届け出る。97条による権限委譲先が窓口となる場合がある。",
        "事前に周知されていなくても、発見した後の届出義務は別に判断する。",
        "60日前の事前届出は周知の包蔵地で発掘する93条の手続。発見後の96条届出とは時点が異なる。",
        "発見届は保護措置を検討する手続で、発見だけで土地所有権が当然移転する制度ではない。"
      ],
      explain: "既知の包蔵地は着手前、未知の遺跡を発見した場合は発見後の届出と区別する。",
      trap: "93条の60日前届出と、96条の発見届を混ぜない。",
      memoryRule: "既知は60日前、未知を発見したら現状を変えず遅滞なく届出。",
      sourceRef: "文化財保護法",
      sourceLocator: "文化財保護法93条1項・96条1項・97条（権限委譲）",
      sourceUrl: culturalUrl
    }),
    single({
      id: "rs014",
      tag: "道路占用許可と道路使用許可",
      sourceAnchor: "道路法",
      prompt: "事業者Aは道路地下へ管路を設ける工事を行い、完成後も継続して道路を使用する。",
      choices: [
        "道路管理者の道路占用許可と、工事方法等に応じた警察署長の道路使用許可は、別制度として両方必要となる場合がある。",
        "警察署長の道路使用許可を受ければ、道路管理者の占用許可は常に不要となる。",
        "地下に設ける管路は道路法上の占用物件に含まれない。",
        "一度道路占用許可を受ければ、占用期間や許可条件を問わず永久に自由使用できる。"
      ],
      truths: [true, false, false, false],
      notes: [
        "継続使用の占用許可と、工事等による交通への影響を扱う道路使用許可は別で、双方が必要となり得る。",
        "道路使用許可は道路占用許可を当然に代替しない。",
        "水管・下水道管・ガス管など地下埋設物も道路占用物件に含まれる。",
        "占用許可には期間・場所・構造等の条件があり、無期限無条件の権利ではない。"
      ],
      explain: "道路管理者は道路空間の継続使用、警察は道路上の作業・交通影響を別々に審査する。",
      trap: "『道路の許可』を一つにまとめず、占用と使用を分ける。",
      memoryRule: "継続占用は道路管理者、工事の道路使用は警察。両方あり得る。",
      sourceRef: "道路法／道路交通法",
      sourceLocator: "道路法32条／道路交通法77条",
      sourceUrl: roadUrl,
      sourceUrls: [roadUrl, roadTrafficUrl]
    }),
    count({
      id: "rs015",
      tag: "開発許可の適用除外",
      sourceAnchor: "都市計画法",
      prompt: "都市計画法29条の開発許可と適用除外を、区域・目的・主体に分けて判定する。",
      statements: [
        "市街化区域、非線引き都市計画区域又は準都市計画区域では、区域ごとに政令で定める規模未満の開発行為が許可不要となる場合がある。",
        "市街化調整区域では、開発区域が小さければ予定建築物の用途を問わず当然に開発許可が不要となる。",
        "図書館や公民館等のうち、政令で定める公益上必要な建築物の建築目的の開発行為は許可不要となり得る。",
        "国又は都道府県等が行う開発行為は、29条各号の適用除外に当たらなくても知事との協議を一切要しない。"
      ],
      truths: [true, false, true, false],
      notes: [
        "29条1項1号は、市街化区域・非線引き都市計画区域・準都市計画区域について区域別の小規模除外を置く。",
        "市街化調整区域には、面積が小さいというだけで使える一律の小規模除外はない。予定建築物の用途等も確認する。",
        "周辺の適正・合理的な土地利用や環境保全に支障がないものとして政令で定める公益施設は29条1項3号の対象となる。",
        "国又は都道府県等の開発は、適用除外でなければ知事との協議成立をもって許可があったものとみなす。協議自体が不要になるわけではない。"
      ],
      explain: "『小規模・公益施設・公的主体』を一括で許可不要にせず、区域と例外条文を順番に当てはめる。",
      trap: "調整区域の小規模開発と、公的主体の協議を自動的な許可不要へ置き換えない。",
      memoryRule: "29条は原則許可。区域別小規模、政令所定の公益施設、国等の協議を別々に判定。",
      groundingFrame: {
        area: "市街化・調整・非線引き・準都市のどこか",
        action: "建築物等のための土地の区画形質変更か",
        actor: "原則は知事許可。国等は協議成立を許可扱い",
        threshold: "小規模除外は区域別。調整区域に面積だけの一律除外なし"
      },
      sourceRef: "都市計画法／国土交通省 開発許可制度の概要",
      sourceLocator: "都市計画法29条1項1号・3号、34条の2",
      sourceUrl: cityPlanningUrl,
      sourceUrls: [cityPlanningUrl, developmentPermitUrl]
    }),
    single({
      id: "rs016",
      tag: "市街化調整区域の立地基準",
      sourceAnchor: "都市計画法",
      prompt: "市街化調整区域内で開発許可を申請する場合の、都市計画法33条・34条の関係を判定する。",
      choices: [
        "33条の技術基準に適合すれば、予定建築物の用途を問わず必ず許可される。",
        "周辺住民の日常生活に必要な物品を販売する店舗等のための開発行為は、34条の立地基準に該当し得る。",
        "雇用が増える事業であれば、その内容を問わず34条の立地基準を満たす。",
        "開発審査会の議を経れば、市街化を促進するおそれがある開発行為でも必ず許可される。"
      ],
      truths: [false, true, false, false],
      notes: [
        "市街化調整区域では33条の一般的な技術基準に加え、34条各号の立地基準への該当が必要となる。",
        "周辺住民向けの公益施設や日常生活に必要な店舗・事業場等は34条1号の対象となり得る。",
        "雇用創出だけを理由に全ての事業が許可対象となる包括的な規定ではない。",
        "34条14号も、周辺の市街化を促進するおそれがないこと等が前提であり、審査会だけで要件を飛ばせない。"
      ],
      explain: "調整区域は『33条の技術基準＋34条の立地基準』の二段階で見る。",
      trap: "建物の安全性や排水計画が適切でも、それだけで調整区域の立地が許されるとは限らない。",
      memoryRule: "調整区域は33条だけで終わらない。34条各号に立地理由が必要。",
      groundingFrame: {
        area: "市街化調整区域",
        action: "予定建築物等のための開発行為",
        actor: "知事が33条と34条を審査",
        threshold: "34条各号の用途・立地要件。14号も市街化促進のおそれなし"
      },
      sourceRef: "都市計画法",
      sourceLocator: "都市計画法33条・34条1号・14号",
      sourceUrl: cityPlanningUrl,
      sourceUrls: [cityPlanningUrl, developmentPermitUrl]
    }),
    count({
      id: "rs017",
      tag: "特殊建築物への用途変更",
      sourceAnchor: "建築基準法",
      prompt: "既存建築物の用途を変更して特殊建築物とする場合の確認手続を判定する。",
      statements: [
        "類似用途相互間の変更でない場合、特殊建築物の用途に供する部分が200平方メートルを超える用途変更は原則として確認対象となる。",
        "特殊建築物の用途に供する部分が200平方メートルちょうどであっても、面積だけで必ず確認対象となる。",
        "政令で指定する類似用途相互間の変更でも、面積を問わず必ず用途変更の確認申請が必要である。",
        "用途変更の確認申請が不要な規模でも、変更後の用途に応じた建築基準法上の実体規定を検討する必要がある。"
      ],
      truths: [true, false, false, true],
      notes: [
        "87条は、類似用途相互間を除き、6条1項1号の200平方メートル超の特殊建築物への用途変更へ確認手続を準用する。",
        "基準は200平方メートル『超』であり、ちょうど200平方メートルを面積だけで対象にしない。",
        "政令指定の類似用途相互間の変更は、87条の確認手続準用から除かれる。",
        "確認申請の要否と、変更後用途に適用される防火・避難等の実体規定への適合は別に検討する。"
      ],
      explain: "用途変更は『変更後が特殊建築物か・200平方メートル超か・類似用途か』の三点で確認要否を判定する。",
      trap: "確認不要を、建築基準法の規制が一切かからないという意味にしない。",
      memoryRule: "特殊用途へ200平方メートル超、類似用途でなければ確認。200ちょうどは境界外。",
      groundingFrame: {
        area: "区域より変更後用途が特殊建築物かを先に確認",
        action: "既存建築物の用途変更",
        actor: "建築主が確認申請。類似用途相互間は除外",
        threshold: "特殊用途部分が200平方メートル超。200ちょうどではない"
      },
      sourceRef: "建築基準法／国土交通省 用途変更資料",
      sourceLocator: "建築基準法6条1項1号・87条1項",
      sourceUrl: buildingLawUrl,
      sourceUrls: [buildingLawUrl, buildingUseChangeUrl]
    }),
    single({
      id: "rs018",
      tag: "前面道路による容積率計算",
      sourceAnchor: "建築基準法",
      prompt: "住居系用途地域内で、指定容積率200％、前面道路幅員4メートル、法定乗数10分の4とする敷地について判定する。特例は考えない。",
      choices: [
        "指定容積率200％だけを使うので、容積率の上限は200％である。",
        "前面道路幅員4メートルに10分の4を乗じた160％と指定容積率200％を比べ、上限は160％となる。",
        "前面道路幅員4メートルに10分の6を乗じればよいので、上限は240％となる。",
        "前面道路が12メートル未満なら、用途地域と指定容積率を問わず建築できない。"
      ],
      truths: [false, true, false, false],
      notes: [
        "前面道路幅員が12メートル未満のため、指定容積率と道路幅員による限度の厳しい方を使う。",
        "4メートル×0.4＝1.6、すなわち160％。指定200％より厳しい160％が上限となる。",
        "設問は住居系・法定乗数10分の4としているため、10分の6を使わない。",
        "12メートル未満の道路では幅員による容積率制限を計算するのであり、直ちに建築禁止とはならない。"
      ],
      explain: "指定容積率と、前面道路幅員×法定乗数による基準容積率を計算し、小さい方を採る。",
      trap: "建蔽率と混ぜず、パーセントへ直す。4×0.4＝1.6＝160％。",
      memoryRule: "前面道路12メートル未満は幅員×乗数。指定値と比べて厳しい方。",
      groundingFrame: {
        area: "住居系用途地域",
        action: "新築計画の容積率上限を計算",
        actor: "建築主が指定値と道路幅員制限を照合",
        threshold: "4m×0.4＝160％。指定200％との小さい方"
      },
      sourceRef: "建築基準法／国土交通省 容積率資料",
      sourceLocator: "建築基準法52条2項／国土交通省『容積率（法第52条）』",
      sourceUrl: buildingLawUrl,
      sourceUrls: [buildingLawUrl, floorAreaRatioUrl]
    }),
    count({
      id: "rs019",
      tag: "北側斜線制限",
      sourceAnchor: "建築基準法",
      prompt: "建築基準法56条1項3号の北側斜線制限について判定する。特例許可・天空率は考えない。",
      statements: [
        "北側斜線制限は、建築物の北側にある敷地等への日照・採光等への影響を抑えるための高さ制限である。",
        "第一種・第二種低層住居専用地域では、真北方向の境界線等から5メートルを起点に1.25の勾配で制限するのが原則である。",
        "第一種・第二種中高層住居専用地域では、日影規制の対象区域内でも北側斜線制限が必ず重ねて適用される。",
        "北側斜線の方向は磁北を基準とし、真北は用いない。"
      ],
      truths: [true, true, false, false],
      notes: [
        "建築物の北側にある敷地等への日照・採光等への影響が大きいため、真北方向の境界から各部分の高さを制限する。",
        "低層住居専用地域は原則として、前面道路の反対側境界線又は隣地境界線から真北方向へ起点5メートル、勾配1.25で判定する。別途10メートル又は12メートルの絶対高さも確認する。",
        "中高層住居専用地域では、条例による日影規制の対象区域内は北側斜線が適用除外となる。",
        "方向は磁北ではなく真北を用いる。"
      ],
      explain: "北側斜線は、用途地域・真北方向・起点高さ・勾配・日影規制による除外の順で判定する。",
      trap: "低層の5メートルと中高層の10メートル、真北と磁北を入れ替えない。",
      memoryRule: "低層は真北へ5m＋1.25。第一・第二種中高層は10m＋1.25だが、日影規制対象区域は除外。",
      groundingFrame: {
        area: "低層又は中高層住居専用地域",
        action: "建築物各部分の北側高さを判定",
        actor: "真北方向の敷地境界線・道路反対側境界線を基準",
        threshold: "低層5m、中高層10mを起点に勾配1.25。日影規制除外も確認"
      },
      sourceRef: "建築基準法／国土交通省 北側斜線制限資料",
      sourceLocator: "建築基準法56条1項3号・別表第三／国土交通省「北側斜線制限」",
      sourceUrl: buildingLawUrl,
      sourceUrls: [buildingLawUrl, northSlantUrl]
    }),
    single({
      id: "rs020",
      tag: "一団の土地と面積合算",
      sourceAnchor: "国土利用計画法",
      prompt: "買主Aは市街化区域内で隣接する1,200平方メートルと900平方メートルの土地を別契約で取得し、一体利用する計画である。注視区域等ではなく、適用除外もない。",
      choices: [
        "各契約が2,000平方メートル未満なので、一体利用の計画があっても届出は不要である。",
        "一団の土地として合計2,100平方メートルとなるため、Aは各契約について契約締結日から起算して2週間以内に事後届出をしなければならない。",
        "売主だけが届出義務者なので、権利取得者Aは届出をしない。",
        "届出期限は全ての土地の引渡し完了日から30日以内である。"
      ],
      truths: [false, true, false, false],
      notes: [
        "取得する土地を一体利用する一団の土地として基準面積以上となる場合、契約を分けても面積要件を免れない。",
        "市街化区域の基準は2,000平方メートル以上。主体が同じA、隣接地、当初から一体利用する計画なので、合計2,100平方メートルの一団として、Aが各契約を2週間以内に届け出る。",
        "事後届出の主体は買主等の権利取得者である。",
        "期限は原則として土地売買等の契約を締結した日から2週間以内であり、引渡し完了から30日ではない。"
      ],
      explain: "国土法は契約書1枚ごとの面積だけでなく、一連の計画・物理的一体性・主体の同一性がある一団の土地で基準を判定する。",
      trap: "分筆・別契約を、そのまま面積基準の分断に使わない。期限の起算点は契約締結日。",
      memoryRule: "買主目線で一団を合算。市街化2,000、契約から2週間。",
      groundingFrame: {
        area: "市街化区域",
        action: "隣接地を別契約で取得し一体利用",
        actor: "権利取得者Aが事後届出",
        threshold: "1,200＋900＝2,100平方メートル、契約締結日から2週間"
      },
      sourceRef: "国土利用計画法",
      sourceLocator: "国土利用計画法23条1項・2項1号イ",
      sourceUrl: nationalLandUrl,
      sourceUrls: [nationalLandUrl, nationalLandOperationalUrl]
    }),
    count({
      id: "rs021",
      tag: "農地法3条・4条・5条の仕分け",
      sourceAnchor: "農地法",
      prompt: "市街化区域内の届出特例は考えず、農地法3条・4条・5条の対象行為を判定する。",
      statements: [
        "農地を農地のまま耕作者へ売買する権利移動は、3条の問題となる。",
        "農地所有者が自分で駐車場へ転用する自己転用は、4条の問題となる。",
        "宅地へ転用する目的で農地を不動産会社へ売買する権利移動は、5条の問題となる。",
        "相続による農地取得は、常に3条許可を受けなければ効力が生じない。"
      ],
      truths: [true, true, true, false],
      notes: [
        "農地として使い続けるための所有権移転等は3条で判定する。",
        "権利移動を伴わず、所有者自身が農地を農地以外へ変える自己転用は4条で判定する。",
        "転用目的の所有権移転・賃借権設定等は5条で判定する。",
        "相続は3条許可の対象外だが、農業委員会への届出が別に問題となる。"
      ],
      explain: "農地のまま権利移動は3条、自己転用は4条、転用目的の権利移動は5条。",
      trap: "『売買なら全部3条』ではなく、取得後も農地として使うかを先に見る。",
      memoryRule: "農地のまま移す3、自己で変える4、変えるために移す5。相続は許可不要・届出。",
      groundingFrame: {
        area: "農地。市街化区域の届出特例なし",
        action: "農地のまま移転／自己転用／転用目的移転",
        actor: "当事者と農業委員会・都道府県知事等",
        threshold: "面積より、権利移動と転用の有無で3・4・5条を仕分け"
      },
      sourceRef: "農地法",
      sourceLocator: "農地法3条・4条・5条・3条の3",
      sourceUrl: agriculturalUrl
    }),
    single({
      id: "rs022",
      tag: "保留地の帰属時点",
      sourceAnchor: "土地区画整理法",
      prompt: "土地区画整理事業の換地計画で、事業費に充てるため保留地が定められた。",
      choices: [
        "保留地は必ず従前の特定宅地に対応する換地として定める。",
        "保留地予定地を換地処分前に販売すれば、その契約時に施行者が当然に所有権を取得する。",
        "保留地は換地処分公告の日の翌日に施行者が取得し、処分金を事業費等へ充てることができる。",
        "保留地と清算金は同じ制度なので、保留地を定めた換地計画では清算金を定められない。"
      ],
      truths: [false, false, true, false],
      notes: [
        "保留地は換地計画で換地として定めず、施行者が事業費等のために処分する土地である。特定の従前地へ対応させない。",
        "換地処分前の保留地予定地について施行者が設定できるのは使用収益権にとどまり、所有権取得は換地処分の効果を待つ。",
        "保留地は換地処分公告日の翌日に施行者が原始取得し、換地計画に定め、施行規程等に従って処分金を事業費に充てることができる。",
        "保留地は事業費等を生む土地、清算金は換地の不均衡を金銭調整する制度で、役割が異なる。"
      ],
      explain: "保留地予定地の処分契約と、施行者が所有権を取得する換地処分公告翌日を分ける。",
      trap: "先行販売を所有権移転と考えず、仮換地・保留地・清算金の役割を混同しない。",
      memoryRule: "保留地は従前地へ対応させず、公告翌日に施行者が取得して事業費へ。",
      groundingFrame: {
        area: "土地区画整理事業の施行地区",
        action: "換地計画で保留地を設定・処分",
        actor: "施行者が公告翌日に取得",
        threshold: "契約時ではなく換地処分公告日の翌日"
      },
      sourceRef: "土地区画整理法／国土交通省通知",
      sourceLocator: "土地区画整理法96条2項・104条11項・108条",
      sourceUrl: readjustmentUrl,
      sourceUrls: [readjustmentUrl, readjustmentGuidanceUrl]
    })
  ];

  const questionsById = Object.freeze(Object.fromEntries(questions.map((question) => [question.id, question])));
  return Object.freeze({
    VERSION,
    LEGAL_BASELINE,
    QUESTIONS: Object.freeze(questions),
    QUESTIONS_BY_ID: questionsById,
    COVERAGE: Object.freeze({
      total: questions.length,
      sourceAnchors: Object.freeze([...new Set(questions.map((question) => question.sourceAnchor))])
    })
  });
});
