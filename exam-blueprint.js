"use strict";

// 令和8年度（2026年度）宅建試験向けの固定カリキュラム。
// 公開版の日次問題をランダム化せず、本試験の50問配分を2周する。
(() => {
  const range = (prefix, start, end) =>
    Array.from({ length: end - start + 1 }, (_, index) =>
      `${prefix}${String(start + index).padStart(3, "0")}`
    );

  const sections = [
    {
      id: "rights",
      label: "権利関係",
      shortLabel: "権利",
      examQuestions: 14,
      coreQuestions: 28,
      chapters: [
        { id: "rights-intent", label: "意思表示・代理・時効", ids: range("r", 1, 6) },
        { id: "rights-obligation", label: "債権・保証・契約解除", ids: range("r", 7, 12) },
        { id: "rights-property", label: "物権変動・担保・共有", ids: range("r", 13, 18) },
        { id: "rights-lease", label: "賃貸借・借地借家", ids: range("r", 19, 22) },
        { id: "rights-inheritance", label: "相続", ids: range("r", 23, 24) },
        { id: "rights-condominium", label: "区分所有法（令和8年改正）", ids: range("r", 25, 26) },
        { id: "rights-registration", label: "不動産登記法（住所変更義務化）", ids: range("r", 27, 28) }
      ]
    },
    {
      id: "restrictions",
      label: "法令上の制限",
      shortLabel: "法令",
      examQuestions: 8,
      coreQuestions: 16,
      chapters: [
        { id: "restrictions-city", label: "都市計画法", ids: range("l", 1, 4) },
        { id: "restrictions-building", label: "建築基準法", ids: range("l", 5, 8) },
        { id: "restrictions-land", label: "国土利用計画法", ids: range("l", 9, 10) },
        { id: "restrictions-agri", label: "農地法", ids: range("l", 11, 12) },
        { id: "restrictions-readjust", label: "土地区画整理法", ids: range("l", 13, 14) },
        { id: "restrictions-fill", label: "盛土規制法", ids: range("l", 15, 16) }
      ]
    },
    {
      id: "tax",
      label: "税",
      shortLabel: "税",
      examQuestions: 3,
      coreQuestions: 6,
      chapters: [
        { id: "tax-local", label: "不動産取得税・固定資産税", ids: range("t", 1, 3) },
        { id: "tax-national", label: "登録免許税・印紙税・譲渡所得", ids: range("t", 4, 6) }
      ]
    },
    {
      id: "business",
      label: "宅建業法",
      shortLabel: "業法",
      examQuestions: 20,
      coreQuestions: 40,
      chapters: [
        { id: "business-license", label: "免許・欠格・宅建士", ids: range("b", 1, 8) },
        { id: "business-guarantee", label: "営業保証金・保証協会", ids: range("b", 9, 12) },
        { id: "business-operation", label: "業務規制・広告・媒介", ids: range("b", 13, 18) },
        { id: "business-35", label: "35条重要事項説明", ids: range("b", 19, 24) },
        { id: "business-37", label: "37条書面", ids: range("b", 25, 28) },
        { id: "business-eight", label: "8種制限", ids: range("b", 29, 36) },
        { id: "business-supervision", label: "報酬・監督・罰則", ids: range("b", 37, 40) }
      ]
    },
    {
      id: "other",
      label: "税以外のその他",
      shortLabel: "その他",
      examQuestions: 5,
      coreQuestions: 10,
      chapters: [
        { id: "other-price", label: "地価公示・鑑定評価", ids: range("o", 1, 2) },
        { id: "other-finance", label: "住宅金融支援機構", ids: range("o", 3, 4) },
        { id: "other-display", label: "景品表示・公正競争規約", ids: range("o", 5, 6) },
        { id: "other-land-building", label: "土地・建物", ids: range("o", 7, 8) },
        { id: "other-statistics", label: "統計・需給", ids: range("o", 9, 10) }
      ]
    }
  ];

  const idsBySection = Object.fromEntries(
    sections.map((section) => [
      section.id,
      section.chapters.flatMap((chapter) => chapter.ids)
    ])
  );

  // 市販テキスト第2分冊の読後演習。コア100と確認模試の配分は変えず、
  // 権利関係をテキストの21単元どおりに選んで解ける補助範囲を足す。
  const textbookRanges = {
    rights: {
      part: 2,
      label: "第2分冊 権利関係",
      chapters: [
        { id: "rights-book-01", unit: 1, page: 163, label: "02-01 制限行為能力者", ids: ["r001", "r101"] },
        { id: "rights-book-02", unit: 2, page: 172, label: "02-02 意思表示", ids: ["r002", "r102"] },
        { id: "rights-book-03", unit: 3, page: 182, label: "02-03 代理", ids: ["r003", "r004"] },
        { id: "rights-book-04", unit: 4, page: 197, label: "02-04 時効", ids: ["r005", "r014"] },
        { id: "rights-book-05", unit: 5, page: 208, label: "02-05 債務不履行・解除", ids: ["r010", "r103"] },
        { id: "rights-book-06", unit: 6, page: 219, label: "02-06 危険負担", ids: ["r104", "r105"] },
        { id: "rights-book-07", unit: 7, page: 222, label: "02-07 弁済・相殺・債権譲渡", ids: ["r009", "r106"] },
        { id: "rights-book-08", unit: 8, page: 233, label: "02-08 売買", ids: ["r011", "r012"] },
        { id: "rights-book-09", unit: 9, page: 243, label: "02-09 物権変動", ids: ["r013", "r107"] },
        { id: "rights-book-10", unit: 10, page: 253, label: "02-10 抵当権", ids: ["r016", "r017", "r018"] },
        { id: "rights-book-11", unit: 11, page: 269, label: "02-11 連帯債務・保証・連帯債権", ids: ["r007", "r008", "r108"] },
        { id: "rights-book-12", unit: 12, page: 284, label: "02-12 賃貸借", ids: ["r019", "r109"] },
        { id: "rights-book-13", unit: 13, page: 297, label: "02-13 借地借家法（借地）", ids: ["r020", "r110"] },
        { id: "rights-book-14", unit: 14, page: 312, label: "02-14 借地借家法（借家）", ids: ["r021", "r022"] },
        { id: "rights-book-15", unit: 15, page: 327, label: "02-15 請負", ids: ["r111", "r112"] },
        { id: "rights-book-16", unit: 16, page: 331, label: "02-16 不法行為", ids: ["r113", "r114"] },
        { id: "rights-book-17", unit: 17, page: 338, label: "02-17 相続", ids: ["r023", "r024"] },
        { id: "rights-book-18", unit: 18, page: 350, label: "02-18 共有", ids: ["r015", "r115"] },
        { id: "rights-book-19", unit: 19, page: 357, label: "02-19 区分所有法", ids: ["r025", "r026"] },
        { id: "rights-book-20", unit: 20, page: 375, label: "02-20 不動産登記法", ids: ["r027", "r028"] },
        { id: "rights-book-21", unit: 21, page: 385, label: "02-21 参考論点", ids: ["r006", "r116"] }
      ]
    }
  };
  const supplementalOrder = Object.values(textbookRanges)
    .flatMap((rangeDefinition) => rangeDefinition.chapters)
    .flatMap((chapter) => chapter.ids)
    .filter((id, index, ids) =>
      !idsBySection.rights.includes(id) && ids.indexOf(id) === index
    );

  // 合格プロジェクトの分野別目標。年度で変動する合格基準点ではなく、
  // 37点を再現するための学習上の目安として使う。
  const studyTargets = {
    total: 37,
    safe: 40,
    rights: 8,
    restrictions: 6,
    business: 18,
    taxOther: 5
  };

  // 全100問接触後の日課も本試験比率を崩さない。
  // 税3問とその他5問は、10問日課では一つの枠として最終接触が古い方を出す。
  const masteryDailyQuotas = {
    rights: 3,
    restrictions: 2,
    business: 4,
    taxOther: 1
  };

  // 毎日10問の固定ブロック。全10ブロックを完走すると
  // 業法40・権利28・法令16・税その他16となり、本試験比率に一致する。
  const dailyBlocks = [];
  let b = 0;
  let r = 0;
  let l = 0;
  let x = 0;
  const otherPool = [...idsBySection.tax, ...idsBySection.other];
  for (let block = 0; block < 10; block += 1) {
    const rightsCount = block < 8 ? 3 : 2;
    const restrictionsCount = block < 6 ? 2 : 1;
    const otherCount = 10 - 4 - rightsCount - restrictionsCount;
    const pools = {
      business: idsBySection.business.slice(b, b += 4),
      rights: idsBySection.rights.slice(r, r += rightsCount),
      restrictions: idsBySection.restrictions.slice(l, l += restrictionsCount),
      other: otherPool.slice(x, x += otherCount)
    };
    const layout = [
      "rights", "business", "restrictions", "business", "other",
      "business", "rights", "business", "restrictions", "rights", "other", "other"
    ];
    dailyBlocks.push(layout.flatMap((sectionId) => pools[sectionId].splice(0, 1)).slice(0, 10));
  }
  const curriculumOrder = dailyBlocks.flat();

  const mockForms = [
    {
      id: "form-a",
      label: "本試験フォームA",
      ids: [
        ...idsBySection.rights.slice(0, 14),
        ...idsBySection.restrictions.slice(0, 8),
        ...idsBySection.tax.slice(0, 3),
        ...idsBySection.business.slice(0, 20),
        ...idsBySection.other.slice(0, 5)
      ]
    },
    {
      id: "form-b",
      label: "本試験フォームB",
      ids: [
        ...idsBySection.rights.slice(14, 28),
        ...idsBySection.restrictions.slice(8, 16),
        ...idsBySection.tax.slice(3, 6),
        ...idsBySection.business.slice(20, 40),
        ...idsBySection.other.slice(5, 10)
      ]
    }
  ];

  const sources = {
    civil: {
      label: "民法",
      url: "https://elaws.e-gov.go.jp/document?lawid=129AC0000000089"
    },
    lease: {
      label: "借地借家法",
      url: "https://elaws.e-gov.go.jp/document?lawid=403AC0000000090"
    },
    condominium: {
      label: "区分所有法・令和8年改正",
      url: "https://www.moj.go.jp/MINJI/minji07_00375.html"
    },
    registration: {
      label: "不動産登記法・住所等変更登記",
      url: "https://www.moj.go.jp/MINJI/minji05_00693.html"
    },
    cityPlanning: {
      label: "都市計画法",
      url: "https://elaws.e-gov.go.jp/document?lawid=343AC0000000100"
    },
    building: {
      label: "建築基準法",
      url: "https://elaws.e-gov.go.jp/document?lawid=325AC0000000201"
    },
    landUse: {
      label: "国土利用計画法",
      url: "https://elaws.e-gov.go.jp/document?lawid=349AC0000000092"
    },
    agricultural: {
      label: "農地法",
      url: "https://elaws.e-gov.go.jp/document?lawid=327AC0000000229"
    },
    readjustment: {
      label: "土地区画整理法",
      url: "https://elaws.e-gov.go.jp/document?lawid=329AC0000000119"
    },
    fill: {
      label: "宅地造成及び特定盛土等規制法",
      url: "https://elaws.e-gov.go.jp/document?lawid=336AC0000000191"
    },
    localTax: {
      label: "地方税法",
      url: "https://elaws.e-gov.go.jp/document?lawid=325AC0000000226"
    },
    registrationTax: {
      label: "登録免許税法",
      url: "https://elaws.e-gov.go.jp/document?lawid=342AC0000000035"
    },
    stampTax: {
      label: "印紙税法",
      url: "https://elaws.e-gov.go.jp/document?lawid=342AC0000000023"
    },
    incomeTax: {
      label: "所得税法",
      url: "https://elaws.e-gov.go.jp/document?lawid=340AC0000000033"
    },
    business: {
      label: "宅地建物取引業法",
      url: "https://elaws.e-gov.go.jp/document?lawid=327AC1000000176"
    },
    retio: {
      label: "RETIO 宅建試験の概要・公式問題",
      url: "https://www.retio.or.jp/exam/exam_detail/"
    },
    appraisal: {
      label: "地価公示法・不動産鑑定評価基準",
      url: "https://www.mlit.go.jp/totikensangyo/kanteishi/"
    },
    housingFinance: {
      label: "住宅金融支援機構",
      url: "https://www.jhf.go.jp/"
    },
    fairCompetition: {
      label: "不動産の表示に関する公正競争規約",
      url: "https://www.rftc.jp/"
    },
    landBuilding: {
      label: "国土交通省 土地・建物資料",
      url: "https://www.mlit.go.jp/"
    },
    statistics: {
      label: "国土交通省 土地・不動産統計",
      url: "https://www.mlit.go.jp/statistics/"
    }
  };

  window.TAKKEN_EXAM_BLUEPRINT = {
    version: 2,
    legalBaseline: "2026-04-01",
    label: "令和8年度 全分野コア100",
    sections,
    idsBySection,
    dailyBlocks,
    curriculumOrder,
    supplementalOrder,
    textbookRanges,
    mockForms,
    studyTargets,
    masteryDailyQuotas,
    sources
  };
})();
