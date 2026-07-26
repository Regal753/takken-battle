"use strict";

const assert = require("node:assert/strict");
const transfer = require("./save-transfer.js");

const allowedIds = ["q1", "q2", "q3"];
const progressPackage = {
  format: transfer.PROGRESS_FORMAT,
  version: 1,
  exportedAt: "2026-01-03T12:00:00Z",
  progress: {
    generatedAt: "2026-01-03T01:25:38+09:00",
    sourceEvents: 12,
    lastEventAt: "2026-01-02T11:53:50.431Z",
    answers: 5,
    correct: 3,
    wrong: 2,
    weakIds: ["q2", "q999"],
    questClaims: { "2026-07-21": ["complete", "complete", "continue"] },
    perQuestion: {
      q1: { attempts: 2, correct: 2, wrong: 0, lastSelected: "肢1", weak: false },
      q2: {
        attempts: 3,
        correct: 1,
        wrong: 2,
        weak: true,
        weakReason: "根拠不安",
        lastMistakeItems: [1, 3],
        lastMistakeCause: "knowledge",
        lastMistakeNote: "条文を再確認"
      },
      q999: { attempts: 99, correct: 99, wrong: 0, weak: false }
    }
  },
  resume: {
    currentId: "q2",
    attempts: 4,
    correct: 3,
    totalXp: 475,
    crystals: 40,
    victories: 3,
    chestProgress: 3,
    chestsOpened: 0,
    focus: 20,
    step: 4,
    adventureDays: { "2026-01-02": true },
    loot: { "license-shard": 2 }
  }
};

const encoded = transfer.encodePackage(progressPackage);
const decoded = transfer.decodePackage(encoded);
const imported = transfer.stateFromProgressPackage(decoded, {
  sessionId: "fresh-session",
  daily: { date: "2026-07-25", answers: 0, correct: 0, wrong: 0, weakAdded: 0, target: 10 }
}, allowedIds);

assert.equal(imported.index, 1);
assert.equal(imported.attempts, 4);
assert.equal(imported.correct, 3);
assert.equal(imported.totalXp, 475);
assert.equal(imported.centralProgress.answers, 5);
assert.equal(imported.questionStats.q1.attempts, 2);
assert.equal(imported.questionStats.q1.lastWrongStep, 0);
assert.equal(imported.questionStats.q2.lastCorrectStep, 0);
assert.equal(imported.questionStats.q2.centralWeak, true);
assert.deepEqual(imported.questionStats.q2.lastMistakeItems, [1, 3]);
assert.equal(imported.questionStats.q2.lastMistakeNote, "条文を再確認");
assert.deepEqual(Object.keys(imported.questionStats).sort(), ["q1", "q2"]);
assert.deepEqual(imported.marked, { q2: true });
assert.deepEqual(imported.questRewardClaims["2026-07-21"], ["complete", "continue"]);
assert.equal(imported.sessionId, "fresh-session");

const savePackage = transfer.createSavePackage(imported);
const restored = transfer.validatePackage(
  transfer.decodePackage(transfer.encodePackage(savePackage)),
  allowedIds
);
assert.equal(restored.format, transfer.SAVE_FORMAT);
assert.equal(restored.state.totalXp, 475);

const handoffUrl = transfer.createTransferUrl(
  savePackage,
  "https://regal753.github.io/takken-battle/?v=manual#old"
);
const parsedHandoffUrl = new URL(handoffUrl);
assert.equal(parsedHandoffUrl.origin, "https://regal753.github.io");
assert.equal(parsedHandoffUrl.pathname, "/takken-battle/");
assert.equal(parsedHandoffUrl.searchParams.get("v"), "manual");
assert.ok(!handoffUrl.includes('"totalXp"'));
const handoffToken = new URLSearchParams(parsedHandoffUrl.hash.slice(1)).get("save");
const handoffState = transfer.validatePackage(transfer.decodePackage(handoffToken), allowedIds);
assert.equal(handoffState.state.totalXp, 475);
assert.equal(handoffState.state.centralProgress.answers, 5);

assert.throws(
  () => transfer.createTransferUrl(progressPackage, "https://regal753.github.io/takken-battle/"),
  /端末セーブ形式/
);
assert.throws(
  () => transfer.createTransferUrl(savePackage, "file:///takken-battle/index.html"),
  /公開URL/
);
assert.throws(
  () => transfer.createTransferUrl(
    transfer.createSavePackage({ oversized: "x".repeat(140_000) }),
    "https://regal753.github.io/takken-battle/"
  ),
  /JSONバックアップ/
);
assert.throws(
  () => transfer.validatePackage({ format: "unknown", state: {} }, allowedIds),
  /対応していない/
);

void (async () => {
  const compressedUrl = await transfer.createCompressedTransferUrl(
    savePackage,
    "https://regal753.github.io/takken-battle/?v=compressed#old"
  );
  const parsedCompressedUrl = new URL(compressedUrl);
  const compressedToken = new URLSearchParams(parsedCompressedUrl.hash.slice(1)).get("savegz");
  assert.ok(compressedToken);
  assert.ok(compressedUrl.length < handoffUrl.length);
  const compressedState = transfer.validatePackage(
    await transfer.decodeCompressedPackage(compressedToken),
    allowedIds
  );
  assert.equal(compressedState.state.totalXp, 475);
  assert.equal(compressedState.state.centralProgress.answers, 5);

  console.log(JSON.stringify({
    status: "ok",
    encodedChars: encoded.length,
    handoffUrlChars: handoffUrl.length,
    compressedUrlChars: compressedUrl.length,
    migratedQuestions: Object.keys(imported.questionStats).length,
    centralAnswers: imported.centralProgress.answers
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
