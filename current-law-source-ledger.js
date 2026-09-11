"use strict";

// Current-law ledger for the 2026 (Reiwa 8) exam.  A question may cite an
// evergreen statute separately, but a time-limited measure or annual figure
// must cite one of these dated primary materials as well.
(() => {
  const ledger = [
    {
      id: "condominium-r8-enforcement",
      topic: "改正区分所有法の施行・経過措置",
      sourceRef: "法務省 老朽化マンション等の管理及び再生の円滑化等を図るための建物の区分所有等に関する法律等の一部を改正する法律",
      sourceUrl: "https://www.moj.go.jp/MINJI/minji07_00375.html",
      sourceLocator: "『改正法の施行日・経過措置等』PDF、施行日・経過措置の章",
      verifiedAt: "2026-09-10",
      effectiveFrom: "2026-04-01",
      effectiveTo: null,
      reviewBy: "2026-10-18",
      status: "current",
      coveragePolicy: "reference-when-matching-atom",
      currentNote: "改正区分所有法・被災区分所有法は令和8年4月1日施行。原則として既存区分所有建物にも適用し、改正前法により既に生じた効力には影響しない。",
      historicalNote: "令和7年度以前の公式問題は改正前法を前提にし得るため、当時法の正誤を令和8年度の現行法解答へ流用しない。",
      reiwaSourceLabels: ["区分所有法・令和8年改正"]
    },
    {
      id: "address-change-registration-r8",
      topic: "住所等変更登記の義務化",
      sourceRef: "法務省 住所等変更登記の義務化",
      sourceUrl: "https://www.moj.go.jp/MINJI/jushohenko/",
      sourceLocator: "本文『令和8年4月1日から 変更した日から2年以内』及び罰則案内",
      verifiedAt: "2026-09-10",
      effectiveFrom: "2026-04-01",
      effectiveTo: null,
      reviewBy: "2026-10-18",
      status: "current",
      coveragePolicy: "reference-when-matching-atom",
      currentNote: "所有権登記名義人の氏名・住所変更登記は原則2年以内。正当な理由なく怠ると5万円以下の過料。施行前変更には経過措置を問う。",
      historicalNote: "令和7年度以前の問題で任意申請として扱う記述は、令和8年度の事案日付を確認して再判定する。",
      reiwaSourceLabels: ["不動産登記法・住所等変更登記"]
    },
    {
      id: "takken-35-mansion-manager-r8",
      topic: "35条重要事項説明・管理業者管理者方式・標準様式",
      sourceRef: "国土交通省 宅地建物取引業法 法令改正・解釈について",
      sourceUrl: "https://www.mlit.go.jp/totikensangyo/const/1_6_bt_000268.html",
      sourceLocator: "『令和8年4月1日以降はこちら』の宅地建物取引業法の解釈・運用の考え方、管理業者管理者方式が導入されている場合の追加説明事項",
      verifiedAt: "2026-09-10",
      effectiveFrom: "2026-04-01",
      effectiveTo: null,
      reviewBy: "2026-10-18",
      status: "current",
      coveragePolicy: "reference-when-matching-atom",
      currentNote: "管理業者管理者方式が導入された区分所有建物の取引では、令和8年4月1日以後の解釈・運用と重要事項説明書様式を用いる。",
      historicalNote: "旧35条問題は電子提供・IT重説の一般論と、令和8年追加事項を分けて出題する。",
      reiwaSourceLabels: ["宅地建物取引業法"]
    },
    {
      id: "registered-course-five-question-exemption",
      topic: "登録講習修了者の5問免除",
      sourceRef: "RETIO 宅建試験 登録講習について",
      sourceUrl: "https://www.retio.or.jp/exam/tourokukosyu/",
      sourceLocator: "『登録講習（試験の一部（5問）免除）について』、従業者証明書・修了試験合格後3年以内の段落",
      verifiedAt: "2026-09-10",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-10-18",
      reviewBy: "2026-10-18",
      status: "current",
      coveragePolicy: "ledger-only-exam-operation",
      currentNote: "宅建業従事者が登録講習修了試験に合格し、合格後3年以内に行われる試験が5問免除の対象。受験申込み時までの修了が必要。令和8年度は45問で扱う。",
      historicalNote: "修了試験合格前の受講中、一般受験者、又は期限外を45問扱いにしない。年度案内の申込条件を優先する。",
      reiwaSourceLabels: []
    },
    {
      id: "registration-tax-land-sale-extension",
      topic: "土地売買の所有権移転登記・登録免許税の時限軽減",
      sourceRef: "国土交通省 土地の取得に係る税制の概要（参考）",
      sourceUrl: "https://www.mlit.go.jp/totikensangyo/totikensangyo_tk5_000072.html",
      sourceLocator: "表『登録免許税』の『土地の売買による所有権の移転登記』、令和11年3月31日まで・税率1,000分の15",
      verifiedAt: "2026-09-10",
      effectiveFrom: "2026-04-01",
      effectiveTo: "2029-03-31",
      reviewBy: "2026-10-18",
      status: "current",
      coveragePolicy: "reference-when-matching-atom",
      currentNote: "土地売買の所有権移転登記は、令和11年3月31日まで税率1,000分の15。課税標準・住宅用家屋特例とは別に判定する。",
      historicalNote: "NTA No.7191の旧・令和7年4月1日版は令和8年3月31日までだった。現在の令和8年4月1日版は令和11年3月31日までへ更新済み。保存した旧版の期限を混ぜない。",
      reiwaSourceLabels: ["登録免許税法"]
    },
    {
      id: "stamp-tax-real-estate-contract-relief",
      topic: "不動産譲渡契約書の印紙税軽減",
      sourceRef: "国税庁 不動産売買契約書の印紙税の軽減措置",
      sourceUrl: "https://www.nta.go.jp/law/shitsugi/inshi/08/10.htm",
      sourceLocator: "『軽減措置の対象となる契約書』、平成26年4月1日から令和9年3月31日まで・記載金額10万円超",
      verifiedAt: "2026-09-10",
      effectiveFrom: "2014-04-01",
      effectiveTo: "2027-03-31",
      reviewBy: "2026-10-18",
      status: "current",
      coveragePolicy: "reference-when-matching-atom",
      currentNote: "不動産譲渡契約書の軽減は作成日と記載金額10万円超を要件とし、令和9年3月31日まで。",
      historicalNote: "契約の私法上の有効性、文書ごとの課税、軽減の適用期間を混同しない。",
      reiwaSourceLabels: ["印紙税法"]
    },
    {
      id: "land-price-publication-r8",
      topic: "令和8年地価公示",
      sourceRef: "国土交通省 令和8年地価公示 全国の地価動向",
      sourceUrl: "https://www.mlit.go.jp/totikensangyo/content/001985434.pdf",
      sourceLocator: "1頁『全国平均』及び標準地数注記。標準地総数26,000地点、調査実施25,565地点（435地点休止）。",
      verifiedAt: "2026-09-10",
      effectiveFrom: "2026-03-17",
      effectiveTo: "2027-03-16",
      reviewBy: "2026-10-18",
      status: "current",
      coveragePolicy: "reference-when-matching-atom",
      currentNote: "令和8年地価公示は標準地総数26,000地点、うち調査実施25,565地点（435地点休止）。全国平均で全用途平均・住宅地・商業地はいずれも5年連続上昇。",
      historicalNote: "数値統計は法令基準日と別管理し、令和9年地価公示の公表後は更新前の現行統計として出題しない。",
      reiwaSourceLabels: ["国土交通省 土地・不動産統計", "地価公示法・不動産鑑定評価基準"]
    },
    {
      id: "housing-starts-fy-r7",
      topic: "令和7年度 建築着工統計・新設住宅着工戸数",
      sourceRef: "国土交通省 建築着工統計調査報告（令和7年度計分）",
      sourceUrl: "https://www.mlit.go.jp/report/press/joho04_hh_001367.html",
      sourceLocator: "報道発表本文及び『令和7年度計 着工新設住宅戸数』表、総数711,171戸・前年度比12.9%減",
      verifiedAt: "2026-09-10",
      effectiveFrom: "2026-04-30",
      effectiveTo: "2027-04-29",
      reviewBy: "2026-10-18",
      status: "current",
      coveragePolicy: "reference-when-matching-atom",
      currentNote: "令和7年度の新設住宅着工戸数は711,171戸、前年度比12.9%減。統計問題では年度計と暦年計を混同しない。",
      historicalNote: "次年度計の公表後は、この年度値を『最新』と表現しない。住宅性能表示制度資料を建築着工統計の根拠にしない。",
      reiwaSourceLabels: ["国土交通省 土地・不動産統計"]
    }
  ];

  const api = Object.freeze({ version: 1, asOf: "2026-09-10", ledger: Object.freeze(ledger.map(Object.freeze)) });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.TAKKEN_CURRENT_LAW_SOURCE_LEDGER = api;
})();
