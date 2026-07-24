"use strict";

const assert = require("assert");
const rewards = require("./reward-system.js");

assert.equal(rewards.chestQualityGain({}), 1);
assert.equal(rewards.chestQualityGain({ firstClear: true, weakBreak: true, fullCut: true, streak: 3 }), 6);
assert.equal(rewards.chestTierForQuality(5).id, "bronze");
assert.equal(rewards.chestTierForQuality(10).id, "bronze");
assert.equal(rewards.chestTierForQuality(11).id, "silver");
assert.equal(rewards.chestTierForQuality(15).id, "gold");
assert.equal(rewards.projectedChestTier(10, 4).id, "silver");
assert.deepEqual(rewards.questRewardsForProgress(2, []), []);
assert.deepEqual(rewards.questRewardsForProgress(6, []).map((item) => item.id), ["supply", "continue"]);
assert.deepEqual(rewards.questRewardsForProgress(10, ["supply", "continue"]).map((item) => item.id), ["complete"]);
assert.deepEqual(rewards.questRewardsForProgress(7, ["supply", "continue"], 10).map((item) => item.id), ["complete"]);
assert.deepEqual(rewards.questRewardsForProgress(7, ["supply", "continue"], 9), []);
assert.equal(rewards.isDelayedRecall("2026-07-10", "2026-07-11"), true);
assert.equal(rewards.isDelayedRecall("2026-07-11", "2026-07-11"), false);
assert.equal(rewards.nextArmoryRank(0).label, "調査騎士装");
assert.equal(rewards.nextArmoryRank(5), null);
assert.equal(rewards.BATTLE_REWARDS.correct.crystals, 10);
assert.deepEqual(rewards.questRewardsForProgress(0, []), []);

const firstPassQuality = [1, 2, 3, 4, 5].reduce(
  (quality, streak) => quality + rewards.chestQualityGain({ firstClear: true, streak }),
  0
);
const fullCutQuality = [1, 2, 3, 4, 5].reduce(
  (quality, streak) => quality + rewards.chestQualityGain({ firstClear: true, fullCut: true, streak }),
  0
);
assert.equal(rewards.chestTierForQuality(firstPassQuality).id, "silver");
assert.equal(rewards.chestTierForQuality(fullCutQuality).id, "gold");

const perfectFirstPassCrystalUpperBound =
  100 * (rewards.BATTLE_REWARDS.correct.crystals + rewards.BATTLE_REWARDS.firstClear.crystals) +
  20 * rewards.CHEST_TIERS[1].crystals +
  10 * rewards.BATTLE_REWARDS.milestone.crystals +
  10 * rewards.QUEST_REWARDS.reduce((total, item) => total + item.crystals, 0) +
  20 * rewards.BATTLE_REWARDS.boss.crystals +
  7 * rewards.BATTLE_REWARDS.titleUnlock.crystals;
assert.ok(perfectFirstPassCrystalUpperBound <= 6500);

console.log(JSON.stringify({
  version: rewards.VERSION,
  chestTiers: rewards.CHEST_TIERS.map((item) => item.id),
  questSteps: rewards.QUEST_REWARDS.map((item) => item.threshold),
  armoryRanks: rewards.ARMORY_RANKS.length,
  perfectFirstPassCrystalUpperBound,
  issues: []
}, null, 2));
