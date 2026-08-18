"use strict";

(function attachBusinessFullScoreSupplement(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TAKKEN_BUSINESS_FULLSCORE_SUPPLEMENT = api;
  if (root.window && root.window !== root) {
    root.window.TAKKEN_BUSINESS_FULLSCORE_SUPPLEMENT = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createBusinessFullScoreSupplement() {
  const VERSION = 2;
  const LEGAL_BASELINE = "2026-04-01";
  const VERIFIED_AT = "2026-08-15";

  const rawAnchors = [
    {
      id: "bs001",
      unitId: "business-book-01",
      tag: "宅地・宅建業の定義",
      prompt: "宅地と宅地建物取引業の範囲を、土地の現況と取引類型から判定する。",
      statements: [
        "用途地域内の土地は、道路・公園・河川その他政令で定める公共施設の用地を除き、現況が資材置場でも宅建業法上の宅地に当たり得る。",
        "建物の敷地に供せられる土地でも、用途地域外にあれば宅建業法上の宅地には当たらない。",
        "自己所有の宅地を反復継続して売却する行為は、自ら行う売買として宅建業に含まれる。",
        "自己所有の建物を反復継続して賃貸する行為そのものは、宅建業法上の宅建業に含まれる。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "法2条1号は、建物の敷地に供せられる土地のほか、用途地域内の土地を宅地とし、道路・公園・河川その他政令で定める公共施設の用地を除外する。",
        "建物の敷地に供せられる土地は、用途地域の内外を問わず宅地に含まれる。",
        "法2条2号は、自ら行う宅地・建物の売買又は交換を業として行う場合を宅建業に含める。",
        "自ら行う貸借は法2条2号の取引類型に含まれない。他人間の貸借の代理・媒介は含まれる。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/327AC1000000176",
      sourceLocator: "宅地建物取引業法2条1号・2号、同法施行令1条",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["transaction-type", "principle-exception"]
    },
    {
      id: "bs002",
      unitId: "business-book-02",
      tag: "免許の更新・免許換え・廃業等届出",
      prompt: "免許の有効期間、免許換え、変更届出及び廃業等届出の期限と届出者を判定する。",
      statements: [
        "免許の有効期間は5年で、更新申請に対する処分が満了日までにされないときは、その処分まで従前の免許が効力を有する。",
        "知事免許業者が事務所の全部を他の一つの都道府県へ移す場合、30日以内の変更届出だけで営業を続けられる。",
        "個人業者が死亡したときは相続人が死亡を知った日から30日以内に、法人が合併で消滅したときは消滅法人の代表役員であった者が30日以内に届け出る。",
        "商号、役員又は事務所など業者名簿の登載事項に変更があった場合の届出期限は、その日から90日以内である。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "法3条2項から4項により有効期間は5年で、更新処分が間に合わない場合は処分まで旧免許が存続する。",
        "一つの都道府県から別の一つの都道府県へ事務所を移す知事免許業者は、法7条の免許換えを要する。",
        "法11条1項は、死亡では相続人に知った日から30日、合併消滅では代表役員であった者に消滅日から30日の届出を課す。",
        "法9条の変更届出期限は30日以内である。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/327AC1000000176",
      sourceLocator: "宅地建物取引業法3条2項から4項、7条、9条、11条1項",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["subject", "timing", "number"]
    },
    {
      id: "bs003",
      unitId: "business-book-02",
      tag: "2024・2025年の免許手続改正",
      prompt: "大臣免許申請の経由廃止、eMLIT及び2025年の添付・閲覧書類改正を施行日込みで判定する。",
      statements: [
        "2024年5月25日以降、国土交通大臣免許の申請等は都道府県知事を経由せず、地方整備局等へ直接申請する。",
        "2024年5月25日から、知事免許と宅地建物取引士関係の手続も全国一律にeMLITで受付を開始した。",
        "2025年4月1日の添付・閲覧書類等の見直しにより、免許申請等の添付書類として提出する略歴書から住所、電話番号及び生年月日の記入欄が削除された。",
        "指定流通機構の登録事項に取引の申込みの受付状況を追加した改正の施行日は、2025年4月1日である。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "都道府県知事の経由事務は2024年5月25日に廃止され、大臣免許の申請等は地方整備局等への直接申請となった。",
        "同日にeMLIT受付を開始したのは国土交通大臣への免許申請等であり、知事免許・取引士手続は各都道府県で順次運用とされた。",
        "令和6年国土交通省令70号による見直しで、免許申請等の添付書類として提出する略歴書から3項目の欄が削除され、2025年4月1日に施行された。",
        "申込みの受付状況を指定流通機構の登録事項に加えた施行規則15条の11の改正は、他の主要部分より早い2025年1月1日施行である。"
      ],
      sourceUrl: "https://www.mlit.go.jp/totikensangyo/const/1_6_bt_000268.html",
      sourceLocator: "国土交通省『宅地建物取引業法 法令改正・解釈について』令和6年省令4号・70号欄／同省『宅地建物取引業の免許申請等のオンライン化について』2024年5月25日案内／同省『宅地建物取引業関係の申請様式等』現行様式一覧／省令70号附則",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["subject", "timing", "amendment"]
    },
    {
      id: "bs004",
      unitId: "business-book-03",
      tag: "取引士登録・移転・取引士証",
      prompt: "宅地建物取引士の登録要件、登録移転、取引士証の交付・返納及び専任不足への対応を判定する。",
      statements: [
        "資格登録には、試験合格に加えて2年以上の実務経験又は国土交通大臣の登録を受けた登録実務講習の修了などが必要である。",
        "登録都道府県外へ住所を移しただけで、勤務先又は勤務予定先がなくても登録移転を申請できる。",
        "取引士証の交付申請では原則として申請前6か月以内の法定講習を要し、有効期間は5年で、効力を失った証は速やかに返納する。",
        "専任の宅地建物取引士が法定数を下回った場合、補充期限は不足発生日から30日以内である。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "法18条1項と施行規則13条の15・13条の16により、2年の実務経験又は登録実務講習修了などの要件を満たす必要がある。",
        "法19条の2は、登録都道府県外の宅建業者の事務所で業務に従事し、又は従事しようとするときに、現登録知事を経由して移転先知事へ申請できるとする。",
        "法22条の2第2項・3項・6項による。試験合格から1年以内などには講習の例外がある。",
        "法31条の3第3項による補充期限は2週間以内である。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/327AC1000000176",
      sourceLocator: "宅地建物取引業法18条1項、19条の2、22条の2第2項・3項・6項、31条の3第3項／同法施行規則13条の15・13条の16",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["subject", "timing", "number", "principle-exception"]
    },
    {
      id: "bs005",
      unitId: "business-book-04",
      tag: "営業保証金の供託と取戻し",
      prompt: "営業保証金の供託所、金額、供託方法、営業開始及び取戻し公告を判定する。",
      statements: [
        "営業保証金は主たる事務所の最寄りの供託所に、本店1000万円と支店1か所ごと500万円の合計額を供託する。",
        "支店分の営業保証金500万円は、その支店の最寄りの供託所へ本店分とは別に供託しなければならない。",
        "営業保証金には所定の有価証券を充てることができ、供託後に免許権者へ届け出るまでは事業を開始できない。",
        "免許期間満了などを理由に営業保証金を取り戻すための債権者公告期間は、3か月以上あれば足りる。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "法25条1項・2項と施行令2条の4により、全事務所分を主たる事務所の最寄りの供託所へ供託する。",
        "支店分も主たる事務所の最寄りの供託所へまとめて供託する。支店の最寄りではない。",
        "法25条3項は有価証券を認め、同条4項・5項は供託した旨の届出前の事業開始を禁じる。",
        "法30条2項は、権利者に申し出るよう公告する期間を6か月以上とする。法定の例外を除き、3か月では足りない。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/327AC1000000176",
      sourceLocator: "宅地建物取引業法25条1項から5項、30条2項／同法施行令2条の4",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["timing", "number", "principle-exception"]
    },
    {
      id: "bs006",
      unitId: "business-book-05",
      tag: "保証協会と弁済業務保証金",
      prompt: "保証協会への加入、事務所増設、還付後の補充及び社員の地位喪失を判定する。",
      statements: [
        "保証協会へ加入する宅建業者は、加入日までに本店60万円・支店1か所ごと30万円の分担金を納付し、加入後の支店増設分は2週間以内に納付する。",
        "弁済を受けようとする取引相手は、保証協会の認証を受けずに供託所へ直接還付請求できる。",
        "弁済業務保証金が還付されたとき、保証協会は通知から2週間以内に供託を補充し、社員は保証協会の通知から2週間以内に還付充当金を納付する。",
        "保証協会の社員の地位を失った宅建業者が営業を続ける場合、営業保証金の供託期限は地位喪失日から2週間以内である。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "法64条の9第1項・2項と施行令7条による。加入時は加入日まで、増設時は2週間以内である。",
        "法64条の8第2項により、還付請求には保証協会の認証が必要である。",
        "保証協会の補充期限は法64条の8第3項、社員の還付充当金納付期限は法64条の10第2項により、いずれも通知から2週間以内である。",
        "法64条の15により、社員の地位喪失後の営業保証金供託は1週間以内である。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/327AC1000000176",
      sourceLocator: "宅地建物取引業法64条の8第2項・3項、64条の9、64条の10第2項、64条の15／同法施行令7条",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["counterparty", "timing", "number"]
    },
    {
      id: "bs007",
      unitId: "business-book-06",
      tag: "従業者名簿・案内所・標識",
      prompt: "2025年改正後の従業者名簿、案内所等の専任宅建士・届出・標識を判定する。",
      statements: [
        "従業者名簿は最終記載日から10年間保存し、2025年4月1日以降の記載事項には性別と生年月日を含めない。",
        "契約を締結し、又は契約の申込みを受ける案内所等には、少なくとも1人の専任の宅地建物取引士を置く。",
        "案内所等に専任の宅地建物取引士を置けば、業務開始10日前までの届出とその場所の標識掲示は省略できる。",
        "2025年4月1日から、様式第9号・第27号の標識は専任宅建士の氏名欄を削除し、事務所の代表者名と専任宅建士の人数を追加した。"
      ],
      truths: [true, true, false, true],
      reasons: [
        "施行規則17条の2第1項・4項と令和6年国土交通省令70号による。現行の従業者名簿は性別・生年月日を記載せず、最終記載から10年間保存する。",
        "法31条の3第1項と施行規則15条の5の2・15条の5の3により、契約締結又は申込み受付を行う所定の場所には1人以上の専任宅建士を置く。",
        "法50条と施行規則19条により、所定の案内所等は業務開始10日前までの届出と標識掲示の双方を要する。",
        "令和6年国土交通省令70号による別記様式改正で、氏名の公開を人数等へ置き換えた。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/332M50004000012",
      sourceLocator: "宅地建物取引業法31条の3第1項、50条／同法施行規則15条の5の2・15条の5の3、17条の2、19条、別記様式9号・27号／令和6年国土交通省令70号",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["subject", "timing", "number", "amendment"]
    },
    {
      id: "bs008",
      unitId: "business-book-07",
      tag: "広告・取引態様・勧誘",
      prompt: "広告と勧誘の各時点で必要な表示・告知及び禁止行為を判定する。",
      statements: [
        "売買・交換・貸借の広告では取引態様を明示し、広告で明示済みでも注文を受けたときは遅滞なく注文者へ取引態様を明らかにする。",
        "著しく事実と異なる広告でも、広告後に契約が成立しなければ誇大広告等の禁止には違反しない。",
        "勧誘に先立ち、宅建業者の商号又は名称、勧誘者の氏名及び契約締結を勧誘する目的を告げ、相手が拒絶の意思を示した後は勧誘を継続しない。",
        "契約成立前であれば、手付を貸し付けるなど信用を供与して契約締結を誘引しても禁止行為には当たらない。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "法34条1項・2項は広告時と注文受付時を別の明示時点として定める。",
        "法32条は誇大広告等を広告行為の段階で禁止しており、契約成立は違反成立の要件ではない。",
        "施行規則16条の11第1号ハ・ニは、勧誘前の3事項の告知と拒絶後の勧誘継続禁止を定める。",
        "法47条3号は、手付の貸付けその他の信用供与による契約締結の誘引を禁止する。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/327AC1000000176",
      sourceLocator: "宅地建物取引業法32条、34条、47条3号、47条の2第3項／同法施行規則16条の11第1号ハ・ニ",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["timing", "transaction-type", "principle-exception"]
    },
    {
      id: "bs009",
      unitId: "business-book-07",
      tag: "媒介契約・指定流通機構",
      prompt: "専任・専属専任媒介の登録期限、報告頻度、有効期間及びREINS登録事項を判定する。",
      statements: [
        "指定流通機構への登録期限は、専属専任媒介が契約締結日から5日以内、専任媒介が7日以内で、いずれも休業日を算入しない。",
        "業務処理状況の法定報告頻度は、専任媒介が1週間に1回以上、専属専任媒介が2週間に1回以上である。",
        "専任媒介契約の有効期間は3か月を超えられず、更新には依頼者の申出を要するため、自動更新特約は有効にならない。",
        "取引の申込みの受付状況が指定流通機構の登録事項に追加されたのは、2025年4月1日である。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "施行規則15条の10により専属専任5日・専任7日で、期間計算から休業日を除く。",
        "法34条の2第9項は、専任を2週間に1回以上、専属専任を1週間に1回以上とする。",
        "法34条の2第3項・4項・10項により最長3か月で、更新は依頼者の申出による。反する特約は無効である。",
        "施行規則15条の11第2号への追加は、令和6年国土交通省令70号により2025年1月1日に施行された。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/332M50004000012",
      sourceLocator: "宅地建物取引業法34条の2第3項・4項・9項・10項／同法施行規則15条の10・15条の11／令和6年国土交通省令70号附則",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["timing", "number", "amendment"]
    },
    {
      id: "bs010",
      unitId: "business-book-07",
      tag: "35条書面・物件別重要事項",
      prompt: "35条の説明・書面交付について、相手方属性と物件・取引類型による差を判定する。",
      statements: [
        "相手方等が宅建業者でない通常取引では、契約成立前に宅建士が取引士証を提示し、35条書面を交付して重要事項を説明する。",
        "宅建業者が相手方等である業者間取引では、重要事項の説明だけでなく35条書面の交付も不要になる。",
        "私道に関する負担は、宅地の売買・交換・貸借及び建物の売買・交換では説明事項となるが、建物の貸借では法定説明事項から除かれる。",
        "既存建物について、建物状況調査を実施しているか、その結果の概要及び所定の設計図書等の保存状況は35条の説明対象ではない。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "法35条1項・4項・5項により、契約成立前の書面交付・宅建士による説明・取引士証提示を要する。",
        "法35条6項・7項は業者間では説明と取引士証提示を不要とするが、35条書面の交付と宅建士の記名は残す。",
        "法35条1項3号は『建物の貸借の契約以外』について私道負担を説明事項とする。",
        "法35条1項6号の2イ・ロにより、所定期間内の建物状況調査の有無・結果概要と所定書類の保存状況は既存建物の説明事項である。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/327AC1000000176",
      sourceLocator: "宅地建物取引業法35条1項3号・6号の2、4項から7項",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["counterparty", "article-35", "transaction-type", "principle-exception"]
    },
    {
      id: "bs011",
      unitId: "business-book-07",
      tag: "37条書面・交付先・記載事項",
      prompt: "37条書面の交付先、業者間取引、売買と貸借の記載事項及び宅建士の関与を判定する。",
      statements: [
        "売買で宅建業者が自ら当事者なら相手方へ、代理なら相手方と代理依頼者へ、媒介なら契約の各当事者へ37条書面を交付する。",
        "契約当事者がいずれも宅建業者である場合、37条書面の交付義務は適用されない。",
        "既存建物の売買では双方が確認した構造耐力上主要な部分等の状況と移転登記申請時期を記載するが、建物貸借の37条書面にはこれらを記載しない。",
        "37条書面は宅建士が記名して口頭説明し、説明時には取引士証を提示しなければならない。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "法37条1項は、自己取引・代理・媒介ごとに交付先を区別して定める。",
        "37条には業者間取引の適用除外がなく、相手方等が宅建業者でも交付を要する。",
        "法37条1項2号の2・5号と同条2項により、既存建物の確認事項と移転登記申請時期は売買・交換の記載事項で、貸借の列挙事項にはない。",
        "法37条3項は宅建士の記名を求めるが、35条と異なり口頭説明及び取引士証提示を義務付けていない。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/327AC1000000176",
      sourceLocator: "宅地建物取引業法37条1項・2項・3項",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["counterparty", "article-37", "transaction-type"]
    },
    {
      id: "bs012",
      unitId: "business-book-08",
      tag: "8種制限の適用・解約手付",
      prompt: "8種制限の適用主体と、手付額・手付解除の規律を判定する。",
      statements: [
        "8種制限は宅建業者が自ら売主となり、買主が宅建業者でない売買に適用され、宅建業者相互間の取引には適用されない。",
        "手付金等について保全措置を講じれば、宅建業者でない買主から代金の20%を超える手付を受領できる。",
        "宅建業者が自ら売主となる取引で受領した手付は、名称を問わず解約手付とされ、相手方が契約の履行に着手するまでは買主の放棄又は売主の倍額償還で解除できる。",
        "売主が手付の倍額を支払う意思を買主へ通知すれば、現実の提供をしなくても手付解除の効力が生じる。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "法78条2項は、法37条の2から43条までなどを宅建業者相互間の取引から除外する。一般に自ら売主・非業者買主の場面が8種制限の対象となる。",
        "法39条1項の20%上限は保全措置の有無にかかわらず適用される。保全は上限超過を許す制度ではない。",
        "法39条2項は、手付の性質を解約手付とし、相手方が履行に着手するまでの放棄又は倍額償還による解除を認める。",
        "売主の解除には、手付の倍額の現実の提供が必要で、意思表示だけでは足りない。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/327AC1000000176",
      sourceLocator: "宅地建物取引業法39条、78条2項",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["counterparty", "number", "eight-restrictions"]
    },
    {
      id: "bs013",
      unitId: "business-book-08",
      tag: "手付金等保全・クーリングオフ",
      prompt: "未完成・完成物件の保全措置の要否とクーリングオフの期間・効力発生・終了条件を判定する。",
      statements: [
        "未完成物件では、受領する手付金等が代金の5%以下かつ1000万円以下なら、手付金等の保全措置を講じなくても受領できる。",
        "完成物件では、受領する手付金等が代金の10%以下又は1000万円以下のいずれか一方を満たせば、保全措置は不要である。",
        "所定の方法で撤回できる旨等を告げられた日から8日を経過するまでは、買主は原則として書面で撤回等を行え、その効力は書面を発した時に生じる。",
        "買主が物件の引渡しを受ければ、代金の全部を支払っていなくてもクーリングオフによる解除はできなくなる。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "法41条1項ただし書と施行令3条の5により、未完成物件の保全不要範囲は5%以下と1000万円以下の両方を満たす場合である。",
        "法41条の2第1項ただし書による完成物件の保全不要範囲は、10%以下かつ1000万円以下であり、どちらか一方だけでは足りない。",
        "法37条の2第1項1号・2項による。告知日から起算して8日経過が期間の終了事由で、撤回等は書面の発送時に効力を生じる。",
        "法37条の2第1項2号の終了要件は、物件の引渡しを受け、かつ、代金全額を支払ったことである。引渡しだけでは終了しない。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/327AC1000000176",
      sourceLocator: "宅地建物取引業法37条の2第1項・2項、41条1項ただし書、41条の2第1項ただし書／同法施行令3条の5",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["timing", "number", "principle-exception", "eight-restrictions"]
    },
    {
      id: "bs014",
      unitId: "business-book-09",
      tag: "通常報酬・権利金・代理・複数業者",
      prompt: "通常の貸借媒介、権利金、売買代理及び同一依頼者に複数業者が関与する場合の報酬上限を判定する。",
      statements: [
        "通常の居住用建物の貸借媒介では双方合計が借賃1.1か月分以内で、依頼時の承諾がない一方当事者からは0.55か月分以内である。",
        "店舗の貸借で返還されない権利金が授受されても、その権利金を売買代金とみなして媒介報酬を計算することはできない。",
        "売買・交換の代理で一方の依頼者から受けられる報酬上限は媒介上限の2倍だが、相手方からも報酬を受けるときは合計上限内に収める。",
        "一つの売買に複数の宅建業者が関与し、同一の依頼者（例：売主）から各業者がそれぞれ法定上限の全額を受けても、その依頼者から受領する総額は制限されない。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "報酬告示第4は貸借媒介の双方合計を借賃1.1か月分以内とし、居住用で依頼時承諾がない一方の上限を0.55か月分とする。",
        "居住用建物を除く貸借で返還されない権利金等を授受する場合は、告示所定の範囲でその額を売買代金とみなす計算ができる。",
        "報酬告示の代理規定により一方の依頼者から媒介上限の2倍まで受け得るが、相手方から受ける額との合計にも上限がある。",
        "複数業者が同一の依頼者（例：売主）から受領する報酬額の総額は、告示第二の上限を超えられない。売主側・買主側のように依頼者が別であれば、各依頼者から受ける額についてそれぞれ上限を適用する。"
      ],
      sourceUrl: "https://www.mlit.go.jp/totikensangyo/const/content/001750232.pdf",
      sourceLocator: "宅地建物取引業法46条1項／昭和45年建設省告示1552号第2から第6（令和6年国土交通省告示949号改正後）",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["counterparty", "number", "transaction-type", "principle-exception"]
    },
    {
      id: "bs015",
      unitId: "business-book-10",
      tag: "監督処分・宅建士処分・罰則",
      prompt: "監督処分の権限・期間、必要的免許取消し、宅建士処分及び現行の法定刑を判定する。",
      statements: [
        "業務地の都道府県知事は、区域内で違反した他県免許業者にも指示又は最長1年の業務停止を命じ得るが、その業者の免許取消しは免許権者が行う。",
        "法66条の必要的免許取消事由があっても、免許権者は先に指示処分又は業務停止処分を行わなければ免許を取り消せない。",
        "宅建士には指示処分と最長1年の事務禁止処分があり、法定の登録消除事由に当たるときは登録が消除される。",
        "無免許営業の法定刑は2年以下の拘禁刑又は200万円以下の罰金であり、両方を併科することはできない。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "法65条2項・4項により業務停止は最長1年で、業務地知事にも区域内の行為について指示・停止権限がある。免許取消しは法66条により免許権者が行う。",
        "法66条の必要的取消事由では、指示又は業務停止を先行させることは取消しの要件ではない。",
        "法68条は指示・最長1年の事務禁止を、法68条の2は所定事由での登録消除を定める。",
        "法79条の現行刑は3年以下の拘禁刑若しくは300万円以下の罰金、又はその併科である。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/327AC1000000176",
      sourceLocator: "宅地建物取引業法65条2項から4項、66条、68条、68条の2、79条",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["subject", "timing", "number", "principle-exception"]
    },
    {
      id: "bs016",
      unitId: "business-book-10",
      tag: "犯罪収益移転防止法",
      prompt: "宅建業者の取引時確認、記録保存及び疑わしい取引の届出を判定する。",
      statements: [
        "個人顧客の取引時確認では、本人特定事項である氏名・住居・生年月日のほか、取引目的と職業も確認する。",
        "法人顧客では名称と本店所在地だけを確認すれば足り、取引目的、事業内容及び実質的支配者の確認は求められない。",
        "確認記録は所定の契約終了日等から7年間、取引記録等は取引日から7年間保存し、疑わしいと認める取引は速やかに行政庁へ届け出る。",
        "疑わしい取引を行政庁へ届け出る前に顧客の同意を得て、届出を行うことを顧客へ知らせなければならない。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "犯罪収益移転防止法4条1項は、個人の本人特定事項、取引目的及び職業などを確認事項とする。",
        "法人では名称・本店所在地に加え、取引目的、事業内容及び該当する実質的支配者の本人特定事項も確認する。",
        "同法6条2項・7条3項は各記録を7年間保存するとし、8条1項は疑わしい取引の速やかな届出を求める。",
        "顧客の同意は要件ではなく、同法8条4項は届出を行おうとすること又は行ったことを顧客等へ漏らす行為を禁止する。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/419AC0000000022",
      sourceLocator: "犯罪による収益の移転防止に関する法律4条1項、6条2項、7条3項、8条1項・4項",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["subject", "counterparty", "timing", "number"]
    },
    {
      id: "bs017",
      unitId: "business-book-11",
      tag: "新築住宅の10年責任・資力確保",
      prompt: "新築住宅の定義、10年責任、基準日・供託届出期限及び新規契約制限を判定する。",
      statements: [
        "新築住宅とは、新たに建設され、まだ人の居住の用に供したことがなく、工事完了日から1年を経過していない住宅である。",
        "新築住宅売主の10年間の責任は構造耐力上主要な部分だけを対象とし、雨水の浸入を防止する部分は対象外である。",
        "資力確保措置の基準日は毎年3月31日で、基準日から3週間を経過する日までに、基準日前10年間に引き渡した対象新築住宅について供託等を整える。",
        "基準日に必要な供託と届出をしない宅建業者は、基準日の翌日から新たな新築住宅の売買契約を締結できない。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "住宅品質確保法2条2項は、未入居かつ工事完了から1年以内の住宅を新築住宅とする。",
        "同法94条1項・95条1項の10年責任は、構造耐力上主要な部分と雨水の浸入を防止する部分の双方を対象とする。",
        "住宅瑕疵担保履行法11条1項は基準日を3月31日とし、そこから3週間以内に基準日前10年間の引渡しを基礎とする資力確保を求める。",
        "同法13条の新規契約制限は、必要な供託・届出がないまま基準日の翌日から起算して50日を経過した日以後にかかる。基準日の翌日からではない。"
      ],
      sourceUrl: "https://laws.e-gov.go.jp/law/419AC0000000066",
      sourceLocator: "特定住宅瑕疵担保責任の履行の確保等に関する法律2条、11条、13条／住宅品質確保法2条2項、94条1項、95条1項",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["counterparty", "timing", "number", "principle-exception"]
    },
    {
      id: "bs018",
      unitId: "business-book-07",
      tag: "2022年の押印廃止・書面電子化",
      prompt: "35条・37条等の書面電子化と、宅地建物取引士の記名・押印の現行要件を判定する。",
      statements: [
        "2022年5月18日以降、相手方の承諾等の要件を満たせば、35条書面や37条書面を電磁的方法で提供できる。",
        "37条書面には現在も宅地建物取引士の記名押印が必要であり、押印を欠く書面は交付義務を満たさない。",
        "37条書面には宅地建物取引士の記名が必要だが、2022年5月18日施行の改正後は押印を要しない。",
        "35条書面を電磁的方法で提供する場合は、相手方の承諾を得なくても、送信後に閲覧できたことを確認すれば足りる。"
      ],
      truths: [true, false, true, false],
      reasons: [
        "2022年5月18日施行の改正により、相手方の承諾等を前提として35条書面・37条書面等を電磁的方法で提供できるようになった。",
        "改正後も宅地建物取引士の記名は必要だが、押印は不要である。『記名押印』を要求する過去問の肢は現行法では誤りとなる。",
        "法37条3項により宅地建物取引士の記名は必要だが、2022年5月18日施行の改正後は押印は不要である。",
        "電磁的方法による提供には、相手方の承諾等の法定要件を満たす必要がある。送信後の確認だけで一方的に電子化できない。"
      ],
      sourceUrl: "https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo16_hh_000001_00036.html",
      sourceLocator: "宅地建物取引業法35条・37条3項／国土交通省『不動産取引時の書面が電子書面で提供できるようになります』2022年5月18日施行",
      verifiedAt: VERIFIED_AT,
      diagnosticTags: ["article-35", "article-37", "amendment", "principle-exception"]
    }
  ];

  function freezeStrings(values) {
    return Object.freeze(values.map((value) => String(value).trim()));
  }

  function pinnedSourceUrl(value) {
    const source = String(value || "").trim();
    if (!source.startsWith("https://laws.e-gov.go.jp/law/") || source.includes("occasion_date=")) {
      return source;
    }
    return `${source}${source.includes("?") ? "&" : "?"}occasion_date=${LEGAL_BASELINE.replaceAll("-", "")}`;
  }

  function freezeAnchor(anchor) {
    return Object.freeze({
      id: anchor.id,
      unitId: anchor.unitId,
      tag: anchor.tag,
      prompt: anchor.prompt,
      statements: freezeStrings(anchor.statements),
      truths: Object.freeze(anchor.truths.map(Boolean)),
      reasons: freezeStrings(anchor.reasons),
      sourceUrl: pinnedSourceUrl(anchor.sourceUrl),
      sourceLocator: anchor.sourceLocator,
      verifiedAt: anchor.verifiedAt,
      diagnosticTags: freezeStrings(anchor.diagnosticTags)
    });
  }

  const ANCHORS = Object.freeze(rawAnchors.map(freezeAnchor));
  const FACTS = Object.freeze(ANCHORS.flatMap((anchor) =>
    anchor.statements.map((statement, statementIndex) => Object.freeze({
      key: `${anchor.id}:${statementIndex}`,
      anchorId: anchor.id,
      statementIndex,
      unitId: anchor.unitId,
      tag: anchor.tag,
      prompt: anchor.prompt,
      statement,
      truth: anchor.truths[statementIndex],
      reason: anchor.reasons[statementIndex],
      sourceUrl: anchor.sourceUrl,
      sourceLocator: anchor.sourceLocator,
      verifiedAt: anchor.verifiedAt,
      diagnosticTags: anchor.diagnosticTags
    }))
  ));
  const ANCHORS_BY_ID = Object.freeze(Object.fromEntries(
    ANCHORS.map((anchor) => [anchor.id, anchor])
  ));
  const FACTS_BY_KEY = Object.freeze(Object.fromEntries(
    FACTS.map((fact) => [fact.key, fact])
  ));

  return Object.freeze({
    VERSION,
    LEGAL_BASELINE,
    ANCHORS,
    FACTS,
    ANCHORS_BY_ID,
    FACTS_BY_KEY
  });
});
