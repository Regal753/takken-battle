"use strict";

global.window = {};
require("./exam-blueprint.js");
require("./exam-question-core.js");
require("./exam-questions-rights.js");
require("./exam-questions-restrictions.js");
require("./exam-questions-tax-other.js");
require("./exam-questions-business.js");

const questions = Object.values(window.TAKKEN_EXAM_QUESTIONS || {});
const questionsById = window.TAKKEN_EXAM_QUESTIONS || {};
const issues = [];

const MLIT_AMENDMENT_INDEX = "https://www.mlit.go.jp/totikensangyo/const/1_6_bt_000268.html";
const MLIT_FEE_NOTICE = "https://www.mlit.go.jp/totikensangyo/const/content/001750232.pdf";
const MLIT_BUILDING_SURVEY_ORDER = "https://www.mlit.go.jp/totikensangyo/const/content/001722719.pdf";
const MLIT_MANAGER_ORDER = "https://www.mlit.go.jp/totikensangyo/const/content/001986558.pdf";

function learningText(question) {
  if (!question) return "";
  return [
    question.text,
    ...(question.choices || []),
    question.explain,
    question.trap,
    ...(question.choiceExplanations || []),
    question.memoryRule
  ].filter(Boolean).join("\n");
}

function requireQuestion(id, key) {
  const question = questionsById[id];
  if (!question) issues.push(`${key}: ${id} is missing`);
  return question;
}

function requireTerms(value, terms, label) {
  terms.forEach((term) => {
    if (!String(value || "").includes(term)) issues.push(`${label}: ${term} is missing`);
  });
}

function rejectTerms(value, terms, label) {
  terms.forEach((term) => {
    if (String(value || "").includes(term)) issues.push(`${label}: stale or misleading phrase remains: ${term}`);
  });
}

function requireSource(question, expectedUrl, label) {
  if (question && question.sourceUrl !== expectedUrl) {
    issues.push(`${label}: official source mismatch (${question.sourceUrl || "missing"})`);
  }
}

function validateAmendment(spec) {
  const before = issues.length;
  const selected = spec.questionIds.map((id) => requireQuestion(id, spec.key)).filter(Boolean);
  const combinedText = selected.map(learningText).join("\n");
  requireTerms(combinedText, spec.contentTerms, `${spec.key}: learning content`);

  Object.entries(spec.locatorTermsByQuestion || {}).forEach(([id, terms]) => {
    requireTerms(questionsById[id]?.sourceLocator, terms, `${spec.key}: ${id} locator`);
  });
  Object.entries(spec.sourcesByQuestion || {}).forEach(([id, url]) => {
    requireSource(questionsById[id], url, `${spec.key}: ${id}`);
  });
  Object.entries(spec.forbiddenTermsByQuestion || {}).forEach(([id, terms]) => {
    rejectTerms(learningText(questionsById[id]), terms, `${spec.key}: ${id}`);
  });

  return { key: spec.key, status: issues.length === before ? "ok" : "ng" };
}

const amendmentSpecs = [
  {
    key: "fees-2024-07-01",
    questionIds: ["b018", "b037"],
    contentTerms: [
      "2024年7月1日",
      "売買代金1,000万円",
      "39万6,000円",
      "800万円以下",
      "33万円",
      "一方の依頼者",
      "現に使用中かどうかを問わず",
      "あらかじめ説明して合意",
      "又は将来にわたり",
      "合計2.2か月分",
      "1.1か月分",
      "0.55か月分",
      "貸主から代理の依頼",
      "相手方からも報酬"
    ],
    locatorTermsByQuestion: {
      b018: ["46条1項", "告示1552号", "第2・第7・第8", "令和6年7月1日施行"],
      b037: ["46条1項", "告示1552号", "第9・第10・第11", "令和6年7月1日施行"]
    },
    sourcesByQuestion: { b018: MLIT_FEE_NOTICE, b037: MLIT_FEE_NOTICE },
    forbiddenTermsByQuestion: { b018: ["特例は考えない"] }
  },
  {
    key: "building-survey-2024-04-01",
    questionIds: ["b024"],
    contentTerms: ["1年以内", "鉄筋コンクリート造", "鉄骨鉄筋コンクリート造", "共同住宅等", "2年以内"],
    locatorTermsByQuestion: { b024: ["35条1項6号の2イ", "16条の2の2", "令和6年4月1日施行"] },
    sourcesByQuestion: { b024: MLIT_BUILDING_SURVEY_ORDER },
    forbiddenTermsByQuestion: { b024: ["一定期間", "35条（貸借）"] }
  },
  {
    key: "manager-ordinary-2026-04-01",
    questionIds: ["b020", "b040"],
    contentTerms: ["建物の貸借以外", "管理組合から委託", "管理事務", "マンション管理業者", "その旨", "2026年4月1日"],
    locatorTermsByQuestion: {
      b020: ["35条1項6号", "16条の2第9号", "令和8年4月1日施行"],
      b040: ["35条1項6号", "16条の2第9号"]
    },
    sourcesByQuestion: { b020: MLIT_MANAGER_ORDER, b040: MLIT_AMENDMENT_INDEX },
    forbiddenTermsByQuestion: { b020: ["16条の4の3"] }
  },
  {
    key: "manager-trust-2026-04-01",
    questionIds: ["b040"],
    contentTerms: ["信託受益権取引", "16条の4の6第9号", "19条の2の5第9号", "2026年4月1日施行"],
    locatorTermsByQuestion: { b040: ["同条3項6号", "16条の4の6第9号", "19条の2の5第9号"] },
    sourcesByQuestion: { b040: MLIT_AMENDMENT_INDEX },
    forbiddenTermsByQuestion: { b040: ["信託受益権取引は2026年10月1日施行である。"] }
  },
  {
    key: "sign-forms-2025-12-01",
    questionIds: ["b040"],
    contentTerms: ["別記様式第9号", "第27号", "横35cm以上", "縦25cm以上", "公布日の2025年12月1日"],
    locatorTermsByQuestion: { b040: ["別記様式第9号・第27号"] },
    sourcesByQuestion: { b040: MLIT_AMENDMENT_INDEX },
    forbiddenTermsByQuestion: {
      b040: [
        "標識の大きさ等の見直しは2026年4月1日施行",
        "標識様式の改正は2026年4月1日施行",
        "令和8年4月1日から新様式"
      ]
    }
  },
  {
    key: "biodiversity-2025-04-01",
    questionIds: ["b040"],
    contentTerms: ["生物多様性増進法", "2025年4月1日"],
    locatorTermsByQuestion: { b040: ["施行令3条1項", "35号"] },
    sourcesByQuestion: { b040: MLIT_AMENDMENT_INDEX }
  },
  {
    key: "port-2025-10-01",
    questionIds: ["b040"],
    contentTerms: ["港湾法", "2025年10月1日"],
    locatorTermsByQuestion: { b040: ["施行令3条1項", "23号"] },
    sourcesByQuestion: { b040: MLIT_AMENDMENT_INDEX }
  },
  {
    key: "forest-2026-04-01",
    questionIds: ["b040"],
    contentTerms: ["森林法", "森林経営管理法", "2026年4月1日"],
    locatorTermsByQuestion: { b040: ["施行令3条1項", "46号・47号"] },
    sourcesByQuestion: { b040: MLIT_AMENDMENT_INDEX }
  }
];

if (questions.length !== 124) issues.push(`expected 124 base questions, got ${questions.length}`);
questions.forEach((question) => {
  if (!String(question.sourceLocator || "").trim()) {
    issues.push(`${question.id}: source locator is missing`);
  }
});

const amendmentChecks = amendmentSpecs.map(validateAmendment);
const amendment = questionsById.b040;
if (amendment?.legalBaseline !== "2026-04-01") issues.push("b040: legal baseline mismatch");
if (amendment?.verifiedAt !== "2026-08-02") issues.push("b040: verification date mismatch");

const report = {
  status: issues.length ? "ng" : "ok",
  questions: questions.length,
  sourceLocators: questions.filter((question) => question.sourceLocator).length,
  amendmentKeys: amendmentChecks,
  legalBaseline: amendment?.legalBaseline || "",
  officialSource: amendment?.sourceUrl || "",
  issues
};

console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
