"use strict";

const fs = require("fs");
const vm = require("vm");

global.window = {};
require("./question-bank.js");
const balance = require("./question-balance.js");

const appSource = fs.readFileSync("app.js", "utf8");
const orderMatch = appSource.match(/const LEGACY_ORDER = \[([\s\S]*?)\n  \];/);
if (!orderMatch) throw new Error("LEGACY_ORDER not found in app.js");
const order = vm.runInNewContext(`[${orderMatch[1]}]`);
const result = balance.rebalanceQuestions({
  questions: window.TAKKEN_QUESTIONS,
  order
});

const issues = [];
const single = result.audit.formats["単一選択"] || 0;
const count = result.audit.formats["個数問題"] || 0;
const answerSpread = Math.max(...result.audit.answers) - Math.min(...result.audit.answers);
const metaOnlyCombinationReason = /^(?:正しい肢の組合せは[ア-エ・]+|[ア-エ・]+は正しい肢の組合せと一致しない)[。.]?$/;
const officialSourceHosts = new Set(["laws.e-gov.go.jp", "www.mlit.go.jp"]);
const regulationUrl = "https://laws.e-gov.go.jp/law/332M50004000012?occasion_date=20260401";
const decreeUrl = "https://laws.e-gov.go.jp/law/339CO0000000383?occasion_date=20260401";
const remunerationNoticeUrl = "https://www.mlit.go.jp/totikensangyo/const/content/001750229.pdf";
const electronicDeliveryQuestionIds = ["q53", "q12", "q61", "q96", "q100", "q106"];
const directSourceExpectations = [
  { ids: ["q37", "q85", "q122", "q136"], url: regulationUrl, locator: /施行規則3条/ },
  { ids: ["q6", "q41", "q91"], url: regulationUrl, locator: /15条の5の2・15条の5の3/ },
  { ids: ["q10", "q94"], url: regulationUrl, locator: /施行規則19条1項・2項/ },
  { ids: ["q46", "q95"], url: regulationUrl, locator: /15条の5の2・15条の5の3・19条/ },
  { ids: ["q47"], url: regulationUrl, locator: /施行規則19条3項/ },
  { ids: ["q9", "q88"], url: regulationUrl, locator: /14条の2の2・14条の7・14条の13/ },
  { ids: ["q52"], url: regulationUrl, locator: /16条の4の3/ },
  { ids: ["q99"], url: regulationUrl, locator: /施行規則16条の2第2・3・6号/ },
  { ids: ["q14", "q15", "q62", "q104"], url: regulationUrl, locator: /施行規則15条の10/ },
  { ids: ["q17"], url: decreeUrl, locator: /施行令2条の4・7条/ },
  { ids: ["q71", "q113"], url: decreeUrl, locator: /施行令7条/ },
  { ids: ["q16", "q66", "q111"], url: remunerationNoticeUrl, locator: /告示1552号第2・第7/ },
  { ids: ["q67", "q108"], url: remunerationNoticeUrl, locator: /告示1552号第2/ },
  { ids: ["q68", "q110"], url: remunerationNoticeUrl, locator: /告示1552号第4/ },
  { ids: ["q69", "q109"], url: remunerationNoticeUrl, locator: /告示1552号第3・第5/ },
  { ids: ["q70"], url: remunerationNoticeUrl, locator: /告示1552号第2〜第7/ }
];

function explanationReason(line) {
  const match = String(line || "").match(/^\s*(?:[アイウエ]|[1-4])?\s*[○×]\s*(.*)$/);
  return match ? match[1].trim() : "";
}

function statementLines(question) {
  return String(question?.text || "")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.replace(/^\s*[アイウエ]\s*/, "").trim())
    .filter(Boolean);
}
if (single < 50 || single > 60) issues.push(`single-choice ratio out of range: ${single}/${order.length}`);
if (count < 40 || count > 50) issues.push(`count-question ratio out of range: ${count}/${order.length}`);
if (answerSpread > 4) issues.push(`answer position spread too wide: ${result.audit.answers.join("/")}`);

order.forEach((id) => {
  const question = result.questions[id];
  const source = window.TAKKEN_QUESTIONS[id];
  if (!question) {
    issues.push(`missing question: ${id}`);
    return;
  }
  if (question.choices.length !== 4 || question.choiceExplanations.length !== 4) {
    issues.push(`incomplete choices: ${id}`);
  }
  if (!question.choiceExplanations.every((line) => /[○×]/.test(line))) {
    issues.push(`missing verdict marker: ${id}`);
  }
  if (question.answer < 0 || question.answer > 3) {
    issues.push(`invalid answer: ${id}`);
  }
  ["sourceRef", "sourceLocator", "sourceUrl", "legalBaseline", "verifiedAt"].forEach((field) => {
    if (!String(source?.[field] || "").trim()) issues.push(`missing ${field}: ${id}`);
  });
  if (source?.legalBaseline !== "2026-04-01") {
    issues.push(`legacy legal baseline mismatch: ${id}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(source?.verifiedAt || ""))) {
    issues.push(`legacy verification date mismatch: ${id}`);
  }
  const sourceUrls = Array.isArray(source?.sourceUrls)
    ? source.sourceUrls.map(String).filter(Boolean)
    : source?.sourceUrl ? [String(source.sourceUrl)] : [];
  if (!sourceUrls.length) issues.push(`missing source URL set: ${id}`);
  sourceUrls.forEach((url) => {
    try {
      if (!officialSourceHosts.has(new URL(url).hostname)) {
        issues.push(`non-official source host: ${id}`);
      }
    } catch {
      issues.push(`invalid source URL: ${id}`);
    }
  });
  if (/告示/.test(String(source?.sourceLocator || "")) && !sourceUrls.includes(remunerationNoticeUrl)) {
    issues.push(`remuneration notice source missing: ${id}`);
  }
  const sourceVerdicts = source?.choiceExplanations || [];
  const sourceAllTrue = source?.format === "個数問題" &&
    sourceVerdicts.length === 4 &&
    sourceVerdicts.every((line) => /○/.test(line));
  if (sourceAllTrue && question.balanceSourceFormat === "個数問題") {
    issues.push(`all-true count question was converted: ${id}`);
  }
  if (/正しいものの組合せ/.test(question.text) && question.balanceSourceFormat === "個数問題") {
    if (!Array.isArray(question.statementExplanations) || question.statementExplanations.length !== 4) {
      issues.push(`combination question lacks statement verdicts: ${id}`);
    }
    const statementReasons = (question.statementExplanations || []).map(explanationReason);
    if (statementReasons.some((reason) => !reason || metaOnlyCombinationReason.test(reason))) {
      issues.push(`combination question has a non-substantive statement reason: ${id}`);
    }
    const choiceReasons = question.choiceExplanations.map(explanationReason);
    if (choiceReasons.some((reason) => !reason || metaOnlyCombinationReason.test(reason))) {
      issues.push(`combination question has a count-only choice explanation: ${id}`);
    }
  }
  if (question.balanceSourceFormat === "個数問題" && !Array.isArray(question.statementExplanations)) {
    const sourceStatements = statementLines(source);
    const displayOrder = question.choiceOriginIndexes || [];
    const nonIdentity = displayOrder.some((originIndex, index) => originIndex !== index);
    if (nonIdentity) {
      if (!Array.isArray(displayOrder) || displayOrder.length !== 4) {
        issues.push(`reordered count question lacks choice origin indexes: ${id}`);
      } else {
        displayOrder.forEach((originIndex, index) => {
          if (question.choices[index] !== sourceStatements[originIndex]) {
            issues.push(`reordered count question choice mismatch: ${id}/${index + 1}`);
          }
          if (explanationReason(question.choiceExplanations[index]) !== explanationReason(source.choiceExplanations[originIndex])) {
            issues.push(`reordered count question explanation mismatch: ${id}/${index + 1}`);
          }
        });
      }
    }
  }
});

electronicDeliveryQuestionIds.forEach((id) => {
  const source = window.TAKKEN_QUESTIONS[id];
  const learnerFacing = [source?.text, source?.explain, ...(source?.choiceExplanations || [])].join(" ");
  if (!/電磁的方法/.test(learnerFacing) || !/承諾/.test(learnerFacing)) {
    issues.push(`current electronic delivery exception missing: ${id}`);
  }
});
if ((window.TAKKEN_QUESTIONS.q96?.text.match(/相手方等が宅建業者でない取引では/g) || []).length < 2) {
  issues.push("q96 does not preserve the article 35 business-counterparty explanation exception");
}
if (window.TAKKEN_QUESTIONS.q52?.answer !== 2 || !/^エ\s*×/.test(window.TAKKEN_QUESTIONS.q52?.choiceExplanations?.[3] || "")) {
  issues.push("q52 incorrectly treats general building surrender terms as an article 35 disclosure item");
}
for (const id of ["q16", "q66", "q111"]) {
  const source = window.TAKKEN_QUESTIONS[id];
  if (!/低廉な空家等の特例を適用しない/.test(String(source?.text || "")) || !/第7/.test(String(source?.sourceLocator || ""))) {
    issues.push(`ordinary remuneration question does not exclude and source the low-price vacant-property exception: ${id}`);
  }
}
if (!/課税事業者/.test(String(window.TAKKEN_QUESTIONS.q68?.text || "")) ||
    !/1\.1倍/.test(String(window.TAKKEN_QUESTIONS.q68?.text || "")) ||
    !/0\.55倍/.test(String(window.TAKKEN_QUESTIONS.q68?.explain || ""))) {
  issues.push("q68 does not state the current tax-inclusive residential lease remuneration limits");
}
const q110 = window.TAKKEN_QUESTIONS.q110;
if (!/課税事業者/.test(String(q110?.text || "")) ||
    !/借賃（税抜）1か月分の1\.1倍/.test(String(q110?.text || "")) ||
    !/双方から受ける税込報酬の合計/.test(String(q110?.explain || "")) ||
    !/原則0\.55倍以内/.test(String(q110?.explain || "")) ||
    !/媒介を依頼される際に/.test(String(q110?.explain || "")) ||
    !/双方合計の上限内/.test(String(q110?.explain || ""))) {
  issues.push("q110 does not state the complete current tax-inclusive residential lease remuneration limits");
}
directSourceExpectations.forEach(({ ids, url, locator }) => {
  ids.forEach((id) => {
    const source = window.TAKKEN_QUESTIONS[id];
    if (!source?.sourceUrls?.includes(url)) issues.push(`direct delegated source URL missing: ${id}`);
    if (!locator.test(String(source?.sourceLocator || ""))) issues.push(`direct delegated source locator missing: ${id}`);
  });
});

const answerEvent = appSource.match(/logStudyEvent\("answer", \{([\s\S]*?)\n    \}\);/);
if (!answerEvent || !/statementExplanations:\s*question\.statementExplanations\s*\|\|\s*\[\]/.test(answerEvent[1])) {
  issues.push("answer study event drops statement explanations");
}
if (!/function displayedChoiceStatements\(question\)[\s\S]*?question\.balanceSourceFormat === "個数問題"[\s\S]*?return question\.choices\.map/.test(appSource)) {
  issues.push("reordered count questions do not use displayed choices as statement labels");
}
if (!/button\.setAttribute\("aria-pressed", String\(active\.answers\[String\(fact\.index\)\] === item\.value\)\)/.test(appSource)) {
  issues.push("weakness cut-check buttons lack aria-pressed state");
}
if (!/function renderBookReference\(question\)[\s\S]*?Array\.isArray\(question\.sourceUrls\)[\s\S]*?sourceUrls\.forEach/.test(appSource)) {
  issues.push("legacy question view does not render every official source URL");
}

if (result.audit.maxFormatRun > 3) issues.push(`first-pass format run too long: ${result.audit.maxFormatRun}`);

const report = {
  ...result.audit,
  answerSpread,
  sourceMetadata: order.filter((id) => window.TAKKEN_QUESTIONS[id]?.sourceUrl).length,
  remunerationNoticeSources: order.filter((id) =>
    window.TAKKEN_QUESTIONS[id]?.sourceUrls?.includes(remunerationNoticeUrl)
  ).length,
  directSourceOverrides: new Set(directSourceExpectations.flatMap(({ ids }) => ids)).size,
  electronicDeliveryQuestions: electronicDeliveryQuestionIds.length,
  issues
};
console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exit(1);
