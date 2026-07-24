"use strict";

(function exposeRewardSystem(root) {
  const VERSION = 4;
  const CHEST_TIERS = [
    { id: "bronze", label: "銅", minQuality: 0, xp: 100, crystals: 40, lootCount: 1 },
    { id: "silver", label: "銀", minQuality: 11, xp: 150, crystals: 70, lootCount: 2 },
    { id: "gold", label: "金", minQuality: 15, xp: 220, crystals: 120, lootCount: 3 }
  ];
  const QUEST_REWARDS = [
    { threshold: 3, metric: "correct", id: "supply", label: "補給", xp: 40, crystals: 0 },
    { threshold: 6, metric: "correct", id: "continue", label: "継続", xp: 70, crystals: 0 },
    { threshold: 10, metric: "contacts", id: "complete", label: "完走", xp: 140, crystals: 100 }
  ];
  const BATTLE_REWARDS = {
    correct: { xp: 80, crystals: 10 },
    firstClear: { xp: 30, crystals: 10 },
    weakBreak: { xp: 50, crystals: 30 },
    fullCut: { xp: 20, crystals: 0 },
    boss: { xp: 70, crystals: 30 },
    milestone: { xp: 150, crystals: 50 },
    analysis: { xp: 12, crystals: 0 },
    titleUnlock: { xp: 0, crystals: 100 }
  };
  const ARMORY_RANKS = [
    { rank: 0, label: "見習い装備", cost: 0 },
    { rank: 1, label: "調査騎士装", cost: 500 },
    { rank: 2, label: "免許攻略装", cost: 1100 },
    { rank: 3, label: "業法剣装", cost: 2200 },
    { rank: 4, label: "法典聖装", cost: 3800 },
    { rank: 5, label: "宅建英雄装", cost: 6000 }
  ];

  function chestQualityGain({ firstClear = false, weakBreak = false, fullCut = false, streak = 0 } = {}) {
    return 1 + (firstClear ? 1 : 0) + (weakBreak ? 2 : 0) + (fullCut ? 1 : 0) + (streak >= 3 ? 1 : 0);
  }

  function chestTierForQuality(quality) {
    const safeQuality = Math.max(0, Number(quality) || 0);
    return CHEST_TIERS.reduce(
      (tier, candidate) => safeQuality >= candidate.minQuality ? candidate : tier,
      CHEST_TIERS[0]
    );
  }

  function projectedChestTier(quality, progress) {
    const remainingVictories = Math.max(1, 5 - Math.max(0, Number(progress) || 0));
    return chestTierForQuality((Number(quality) || 0) + remainingVictories);
  }

  function questRewardsForProgress(correctCount, claimed = [], contactCount = correctCount) {
    const correct = Math.max(0, Number(correctCount) || 0);
    const contacts = Math.max(0, Number(contactCount) || 0);
    const claimedSet = new Set(Array.isArray(claimed) ? claimed : []);
    return QUEST_REWARDS.filter((reward) => {
      const progress = reward.metric === "contacts" ? contacts : correct;
      return progress >= reward.threshold && !claimedSet.has(reward.id);
    });
  }

  function isDelayedRecall(lastWrongDay, currentDay) {
    const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
    return dayPattern.test(String(lastWrongDay || "")) &&
      dayPattern.test(String(currentDay || "")) &&
      lastWrongDay < currentDay;
  }

  function nextArmoryRank(currentRank) {
    const safeRank = Math.max(0, Number(currentRank) || 0);
    return ARMORY_RANKS.find((item) => item.rank === safeRank + 1) || null;
  }

  const api = {
    VERSION,
    CHEST_TIERS,
    QUEST_REWARDS,
    BATTLE_REWARDS,
    ARMORY_RANKS,
    chestQualityGain,
    chestTierForQuality,
    projectedChestTier,
    questRewardsForProgress,
    isDelayedRecall,
    nextArmoryRank
  };

  if (root) root.TAKKEN_REWARDS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : null);
