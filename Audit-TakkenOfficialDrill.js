"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("app.js", "utf8");
const match = source.match(
  /const OFFICIAL_DAILY_DRILL_DEFINITIONS = (Object\.freeze\(\[[\s\S]*?\]\));\s+const OFFICIAL_DRILL_SECTION_LABELS/
);
assert.ok(match, "official drill definitions not found");
const definitions = vm.runInNewContext(`
  (() => {
    const officialDrillQuestions = (items) => Object.freeze(
      items.map((item) => Object.freeze({
        ...item,
        verifiedAsOf: "2025-04-01",
        lawStatus: "historical"
      }))
    );
    return ${match[1]};
  })()
`);
assert.equal(definitions.length, 3);

const officialAnswerKey = [
  3, 3, 3, 4, 4, 1, 1, 2, 1, 3,
  3, 3, 3, 1, 4, 4, 2, 2, 2, 4,
  4, 4, 1, 2, 1, 4, 1, 2, 2, 3,
  4, 2, 3, 3, 1, 4, 4, 3, 4, 3,
  1, 2, 4, 2, 4, 2, 3, 2, 1, 1
];
const ids = new Set();
const allQuestions = new Set();

for (const definition of definitions) {
  assert.ok(!ids.has(definition.id), `duplicate set id: ${definition.id}`);
  ids.add(definition.id);
  assert.equal(definition.questions.length, 20, `${definition.id} length`);
  assert.equal(new Set(definition.questions.map((item) => item.number)).size, 20);
  assert.equal(definition.durationMinutes, 35);
  assert.equal(definition.targetScore, 15);
  assert.equal(definition.safeScore, 16);
  assert.equal(definition.year, 2025);
  assert.equal(definition.lawAsOf, "2025-04-01");
  assert.match(definition.questionUrl, /^https:\/\/goukaku\.retio\.or\.jp\//);
  assert.match(definition.answerSourceUrl, /^https:\/\/www\.retio\.or\.jp\//);

  const sections = definition.questions.reduce((counts, item) => {
    assert.ok(item.number >= 1 && item.number <= 50);
    assert.equal(item.answer, officialAnswerKey[item.number - 1], `Q${item.number}`);
    assert.equal(item.verifiedAsOf, "2025-04-01");
    assert.equal(item.lawStatus, "historical");
    counts[item.section] = (counts[item.section] || 0) + 1;
    allQuestions.add(item.number);
    return counts;
  }, {});
  assert.deepEqual(
    JSON.parse(JSON.stringify(sections)),
    { rights: 6, restrictions: 3, taxOther: 3, business: 8 }
  );
}

const setA = new Set(definitions[0].questions.map((item) => item.number));
const setB = new Set(definitions[1].questions.map((item) => item.number));
const setC = new Set(definitions[2].questions.map((item) => item.number));
assert.equal([...setA].filter((number) => setB.has(number)).length, 0);
assert.equal(new Set([...setA, ...setB]).size, 40);
assert.equal([...setC].filter((number) => !setA.has(number) && !setB.has(number)).length, 10);
assert.equal(allQuestions.size, 50);
assert.deepEqual([...allQuestions].sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i + 1));

console.log(JSON.stringify({
  status: "ok",
  sets: definitions.length,
  questionsPerSet: 20,
  uniqueCoverage: allQuestions.size,
  setCNewQuestions: 10,
  distribution: { rights: 6, restrictions: 3, business: 8, taxOther: 3 }
}));
