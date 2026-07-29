"use strict";

const assert = require("node:assert/strict");
const store = require("./save-store.js");

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }
}

class FailingStorage extends MemoryStorage {
  constructor(entries, failKey) {
    super(entries);
    this.failKey = failKey;
  }

  setItem(key, value) {
    if (key === this.failKey) throw new Error("quota");
    super.setItem(key, value);
  }
}

const id = "takken-battle-study-clean-v2-hard";
const legacyState = {
  attempts: 33,
  correct: 28,
  totalXp: 4896,
  crystals: 1200,
  questionStats: {
    q1: { attempts: 3, correct: 2, wrong: 1 }
  },
  centralProgress: { answers: 162 }
};
const legacyRaw = JSON.stringify(legacyState);
const storage = new MemoryStorage({ [id]: legacyRaw });

const upgrade = store.load(storage, id, 3, 1000);
assert.equal(upgrade.source, "upgrade");
assert.deepEqual(upgrade.value, legacyState);
assert.equal(
  storage.getItem(`${id}-before-upgrade-v0-to-v3`),
  legacyRaw
);

const upgradedState = {
  ...upgrade.value,
  stateSchemaVersion: 3,
  missionLog: {
    "2026-07-30": { minutes: 90 }
  }
};
store.save(storage, id, upgradedState);
assert.equal(storage.getItem(`${id}${store.PREVIOUS_SUFFIX}`), legacyRaw);
assert.deepEqual(JSON.parse(storage.getItem(id)), upgradedState);

const newerState = {
  ...upgradedState,
  attempts: 34,
  correct: 29,
  totalXp: 4996
};
store.save(storage, id, newerState);
assert.deepEqual(
  JSON.parse(storage.getItem(`${id}${store.PREVIOUS_SUFFIX}`)),
  upgradedState
);

storage.setItem(id, "{broken");
const recovered = store.load(storage, id, 3, 2000);
assert.equal(recovered.source, "previous");
assert.equal(recovered.skipPreviousRotation, true);
assert.deepEqual(recovered.value, upgradedState);
assert.equal(storage.getItem(`${id}${store.CORRUPT_SUFFIX}2000`), "{broken");

store.save(storage, id, recovered.value, { skipPreviousRotation: true });
assert.deepEqual(JSON.parse(storage.getItem(id)), upgradedState);
assert.deepEqual(
  JSON.parse(storage.getItem(`${id}${store.PREVIOUS_SUFFIX}`)),
  upgradedState
);

store.save(storage, id, newerState);
const restored = store.restorePrevious(storage, id, 3000);
assert.deepEqual(restored.value, upgradedState);
assert.deepEqual(JSON.parse(storage.getItem(id)), upgradedState);
assert.deepEqual(
  JSON.parse(storage.getItem(`${id}${store.PREVIOUS_SUFFIX}`)),
  newerState
);
assert.deepEqual(
  JSON.parse(storage.getItem(`${id}${store.BEFORE_RESTORE_SUFFIX}3000`)),
  newerState
);

const failing = new FailingStorage({ [id]: legacyRaw }, id);
assert.throws(
  () => store.save(failing, id, upgradedState),
  /quota/
);
assert.equal(failing.getItem(id), legacyRaw);
assert.equal(failing.getItem(`${id}${store.PREVIOUS_SUFFIX}`), legacyRaw);

console.log(JSON.stringify({
  status: "ok",
  schemaUpgradeBackup: true,
  corruptRecovery: true,
  previousRestore: true,
  failedWriteKeepsPrimary: true,
  preservedAttempts: restored.value.attempts,
  preservedCentralAnswers: restored.value.centralProgress.answers
}));
