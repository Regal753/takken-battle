#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const view = require("./reiwa-question-view.js");

const structured = {
  id: "reiwa-a-44", format: "組合せ問題", premise: "A、B、C及びDの時系列を前提とする。",
  stem: "正しい組合せはどれか。", statements: ["ア Aの記述", "イ Bの記述", "ウ Cの記述", "エ Dの記述"],
  choices: ["ア・イ", "ア・ウ", "イ・エ", "ウ・エ"], answer: 1,
  choiceExplanations: ["ア × 理由", "イ ○ 理由", "ウ ○ 理由", "エ × 理由"]
};
const legacy = { id: "legacy-1", format: "個数問題", text: "共通事情である。\n正しい記述はいくつあるか。\nア 記述A\nイ 記述B\nウ 記述C\nエ 記述D", choices: ["一つ", "二つ", "三つ", "四つ"], answer: 1 };

const normalized = view.normalizeQuestion(structured);
assert.equal(normalized.premise, structured.premise);
assert.equal(normalized.statements.length, 4);
assert.equal(normalized.choices[1], "ア・ウ");
const legacyNormalized = view.normalizeQuestion(legacy);
assert.equal(legacyNormalized.legacy, true);
assert.equal(legacyNormalized.premise, "共通事情である。");
assert.equal(legacyNormalized.statements.length, 4);
const before = view.describeQuestion(structured, { answered: false });
assert.equal(before.premiseCount, 1);
assert.equal(before.explanationVisible, false);
assert.deepEqual(before.anchors, ["question", "choices"]);
const after = view.describeQuestion(structured, { answered: true, selectedIndex: 0 });
assert.equal(after.explanationVisible, true);
assert.equal(after.selectedExplanation, "ア × 理由");
assert.deepEqual(after.anchors, ["question", "choices", "feedback"]);
const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "reiwa-question-view.js"), "utf8");
assert.match(source, /typeof document === "undefined"/);
assert.match(source, /<details>|node\("details"/);
assert.match(source, /aria-pressed/);
console.log(JSON.stringify({ status: "ok", checks: ["structured", "legacy", "answer-before-explanation", "semantic-anchors", "domless-static"] }));
