"use strict";

(() => {
  const SAVE_FORMAT = "takken-battle-save-v1";
  const PROGRESS_FORMAT = "takken-battle-progress-v1";
  const MAX_PACKAGE_CHARS = 750_000;
  const MAX_TRANSFER_URL_CHARS = 180_000;
  const MAX_PACKAGE_BYTES = MAX_PACKAGE_CHARS * 4;
  const MAX_COUNTER = 1_000_000;

  function plainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function integer(value, maximum = MAX_COUNTER) {
    return Math.min(maximum, Math.max(0, Math.trunc(Number(value) || 0)));
  }

  function text(value, maximum = 500) {
    return String(value || "").slice(0, maximum);
  }

  function safeClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sanitizeQuestClaims(input) {
    if (!plainObject(input)) return {};
    return Object.fromEntries(
      Object.entries(input)
        .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
        .map(([date, claims]) => [
          date,
          [...new Set((Array.isArray(claims) ? claims : []).map((claim) => text(claim, 40)).filter(Boolean))]
            .slice(0, 20)
        ])
    );
  }

  function sanitizeProgress(input, allowedIds) {
    if (!plainObject(input)) throw new Error("進捗データがありません。");
    const allowed = new Set(allowedIds);
    const perQuestion = {};

    Object.entries(plainObject(input.perQuestion) ? input.perQuestion : {}).forEach(([id, raw]) => {
      if (!allowed.has(id) || !plainObject(raw)) return;
      const correct = integer(raw.correct);
      const wrong = integer(raw.wrong);
      perQuestion[id] = {
        attempts: Math.max(integer(raw.attempts), correct + wrong),
        correct,
        wrong,
        correctDayKeys: [...new Set((Array.isArray(raw.correctDayKeys) ? raw.correctDayKeys : [])
          .map((day) => text(day, 10))
          .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))].slice(-8),
        lastAnsweredAt: text(raw.lastAnsweredAt, 64),
        lastCorrectAt: text(raw.lastCorrectAt, 64),
        lastWrongAt: text(raw.lastWrongAt, 64),
        lastSelected: text(raw.lastSelected, 600),
        weak: Boolean(raw.weak),
        weakReason: text(raw.weakReason, 160),
        masteredAt: text(raw.masteredAt, 64),
        lastMistakeItems: [...new Set((Array.isArray(raw.lastMistakeItems) ? raw.lastMistakeItems : [])
          .map((item) => integer(item, 3)))].slice(0, 4),
        lastMistakeUnknown: Boolean(raw.lastMistakeUnknown),
        lastMistakeCause: text(raw.lastMistakeCause, 40),
        lastMistakeNote: text(raw.lastMistakeNote, 160),
        lastMistakeAt: text(raw.lastMistakeAt, 64)
      };
    });

    const weakIds = [...new Set((Array.isArray(input.weakIds) ? input.weakIds : [])
      .map(String)
      .filter((id) => allowed.has(id)))];

    return {
      generatedAt: text(input.generatedAt, 64),
      sourceEvents: integer(input.sourceEvents),
      lastEventAt: text(input.lastEventAt, 64),
      answers: integer(input.answers),
      correct: integer(input.correct),
      wrong: integer(input.wrong),
      weakIds,
      questClaims: sanitizeQuestClaims(input.questClaims),
      perQuestion
    };
  }

  function sanitizeCounterMap(input, keyPattern = /^[a-z0-9_-]{1,80}$/i) {
    if (!plainObject(input)) return {};
    return Object.fromEntries(
      Object.entries(input)
        .filter(([key]) => keyPattern.test(key))
        .map(([key, value]) => [key, integer(value)])
        .filter(([, value]) => value > 0)
    );
  }

  function sanitizeAdventureDays(input) {
    if (!plainObject(input)) return {};
    return Object.fromEntries(
      Object.entries(input)
        .filter(([date, active]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Boolean(active))
        .map(([date]) => [date, true])
    );
  }

  function sanitizeResume(input, allowedIds) {
    if (!plainObject(input)) return {};
    const allowed = new Set(allowedIds);
    const attempts = integer(input.attempts);
    const correct = Math.min(attempts, integer(input.correct));
    return {
      currentId: allowed.has(String(input.currentId || "")) ? String(input.currentId) : "",
      attempts,
      correct,
      streak: integer(input.streak, attempts),
      bestStreak: integer(input.bestStreak, attempts),
      focus: integer(input.focus, 100),
      crystals: integer(input.crystals),
      victories: integer(input.victories),
      totalXp: integer(input.totalXp),
      chestProgress: integer(input.chestProgress, 4),
      chestQuality: integer(input.chestQuality),
      chestsOpened: integer(input.chestsOpened),
      armoryRank: integer(input.armoryRank, 100),
      step: integer(input.step),
      loot: sanitizeCounterMap(input.loot),
      adventureDays: sanitizeAdventureDays(input.adventureDays)
    };
  }

  function validatePackage(input, allowedIds = []) {
    if (!plainObject(input)) throw new Error("セーブデータの形式が正しくありません。");
    const serialized = JSON.stringify(input);
    if (serialized.length > MAX_PACKAGE_CHARS) throw new Error("セーブデータが大きすぎます。");

    if (input.format === SAVE_FORMAT) {
      if (!plainObject(input.state)) throw new Error("端末セーブ本体がありません。");
      return {
        format: SAVE_FORMAT,
        version: 1,
        exportedAt: text(input.exportedAt, 64),
        state: safeClone(input.state)
      };
    }

    if (input.format === PROGRESS_FORMAT) {
      return {
        format: PROGRESS_FORMAT,
        version: 1,
        exportedAt: text(input.exportedAt, 64),
        progress: sanitizeProgress(input.progress, allowedIds),
        resume: sanitizeResume(input.resume, allowedIds)
      };
    }

    throw new Error("対応していないセーブ形式です。");
  }

  function createSavePackage(state) {
    if (!plainObject(state)) throw new Error("保存する状態がありません。");
    return {
      format: SAVE_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      state: safeClone(state)
    };
  }

  function stateFromProgressPackage(input, baseState, allowedIds) {
    const parsed = validatePackage(input, allowedIds);
    if (parsed.format !== PROGRESS_FORMAT) throw new Error("中央進捗形式ではありません。");
    const { progress, resume } = parsed;
    const questionStats = {};

    Object.entries(progress.perQuestion).forEach(([id, stats]) => {
      questionStats[id] = {
        attempts: stats.attempts,
        correct: stats.correct,
        wrong: stats.wrong,
        lastStep: stats.attempts,
        lastCorrectStep: stats.lastCorrectAt ? stats.attempts : 0,
        lastWrongStep: stats.lastWrongAt ? stats.attempts : 0,
        lastAnsweredAt: stats.lastAnsweredAt,
        lastCorrectAt: stats.lastCorrectAt,
        lastWrongAt: stats.lastWrongAt,
        correctDayKeys: stats.correctDayKeys,
        lastSelected: stats.lastSelected,
        centralAttempts: stats.attempts,
        centralCorrect: stats.correct,
        centralWrong: stats.wrong,
        centralLastAnsweredAt: stats.lastAnsweredAt,
        centralLastCorrectAt: stats.lastCorrectAt,
        centralLastWrongAt: stats.lastWrongAt,
        centralWeak: stats.weak,
        weakReason: stats.weakReason,
        masteredAt: stats.masteredAt,
        lastMistakeItems: stats.lastMistakeItems,
        lastMistakeUnknown: stats.lastMistakeUnknown,
        lastMistakeCause: stats.lastMistakeCause,
        lastMistakeNote: stats.lastMistakeNote,
        lastMistakeAt: stats.lastMistakeAt
      };
    });

    const marked = Object.fromEntries(progress.weakIds.map((id) => [id, true]));
    const attempts = resume.attempts || progress.answers;
    const correct = Math.min(attempts, resume.correct || progress.correct);
    const index = resume.currentId ? Math.max(0, allowedIds.indexOf(resume.currentId)) : 0;

    return {
      ...safeClone(baseState),
      index,
      answered: null,
      attempts,
      correct,
      streak: resume.streak,
      bestStreak: Math.max(resume.bestStreak, resume.streak),
      focus: resume.focus,
      crystals: resume.crystals,
      victories: resume.victories || correct,
      progressionVersion: 2,
      totalXp: resume.totalXp,
      chestProgress: resume.chestProgress,
      chestQuality: resume.chestQuality,
      chestsOpened: resume.chestsOpened,
      loot: resume.loot,
      armoryRank: resume.armoryRank,
      adventureDays: resume.adventureDays,
      questRewardClaims: progress.questClaims,
      step: resume.step || attempts,
      runMode: "quest",
      questionStats,
      centralMarked: marked,
      centralProgress: {
        generatedAt: progress.generatedAt,
        sourceEvents: progress.sourceEvents,
        lastEventAt: progress.lastEventAt,
        answers: progress.answers,
        correct: progress.correct,
        wrong: progress.wrong
      },
      marked,
      autoMarked: marked,
      activeCutCheck: null,
      dailyFinishedDate: "",
      finished: false
    };
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(base64, "base64"));
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function encodePackage(input) {
    const bytes = new TextEncoder().encode(JSON.stringify(input));
    return bytesToBase64(bytes)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function decodePackage(token) {
    const compact = String(token || "").trim();
    if (!compact || compact.length > MAX_PACKAGE_CHARS * 2) {
      throw new Error("移行リンクのセーブデータが正しくありません。");
    }
    const padded = compact.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(Math.ceil(compact.length / 4) * 4, "=");
    const json = new TextDecoder().decode(base64ToBytes(padded));
    return JSON.parse(json);
  }

  function base64UrlFromBytes(bytes) {
    return bytesToBase64(bytes)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function bytesFromBase64Url(token) {
    const compact = String(token || "").trim();
    if (!compact || compact.length > MAX_TRANSFER_URL_CHARS) {
      throw new Error("圧縮引継ぎリンクのセーブデータが正しくありません。");
    }
    const padded = compact.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(Math.ceil(compact.length / 4) * 4, "=");
    return base64ToBytes(padded);
  }

  async function readByteStream(stream, maximumBytes) {
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maximumBytes) {
          await reader.cancel();
          throw new Error("圧縮引継ぎリンクのセーブデータが大きすぎます。");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const output = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    });
    return output;
  }

  async function encodeCompressedPackage(input) {
    if (typeof CompressionStream !== "function") return "";
    const bytes = new TextEncoder().encode(JSON.stringify(input));
    const compressed = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    return base64UrlFromBytes(await readByteStream(compressed, MAX_PACKAGE_BYTES));
  }

  async function decodeCompressedPackage(token) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("このブラウザは圧縮引継ぎに未対応です。最新版へ更新してください。");
    }
    const compressed = bytesFromBase64Url(token);
    const decompressed = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const bytes = await readByteStream(decompressed, MAX_PACKAGE_BYTES);
    const json = new TextDecoder().decode(bytes);
    if (json.length > MAX_PACKAGE_CHARS) {
      throw new Error("圧縮引継ぎリンクのセーブデータが大きすぎます。");
    }
    return JSON.parse(json);
  }

  function createTransferUrl(input, baseUrl) {
    if (!plainObject(input) || input.format !== SAVE_FORMAT) {
      throw new Error("本人用引継ぎリンクには端末セーブ形式が必要です。");
    }
    const url = new URL(String(baseUrl || ""));
    if (!["https:", "http:"].includes(url.protocol)) {
      throw new Error("引継ぎリンクの公開URLが正しくありません。");
    }
    url.hash = new URLSearchParams({ save: encodePackage(input) }).toString();
    const output = url.toString();
    if (output.length > MAX_TRANSFER_URL_CHARS) {
      throw new Error("セーブが大きいためリンク化できません。JSONバックアップを使ってください。");
    }
    return output;
  }

  async function createCompressedTransferUrl(input, baseUrl) {
    if (!plainObject(input) || input.format !== SAVE_FORMAT) {
      throw new Error("本人用引継ぎリンクには端末セーブ形式が必要です。");
    }
    const token = await encodeCompressedPackage(input);
    if (!token) return createTransferUrl(input, baseUrl);
    const url = new URL(String(baseUrl || ""));
    if (!["https:", "http:"].includes(url.protocol)) {
      throw new Error("引継ぎリンクの公開URLが正しくありません。");
    }
    url.hash = new URLSearchParams({ savegz: token }).toString();
    const output = url.toString();
    if (output.length > MAX_TRANSFER_URL_CHARS) {
      throw new Error("セーブが大きいためリンク化できません。JSONバックアップを使ってください。");
    }
    return output;
  }

  const api = {
    SAVE_FORMAT,
    PROGRESS_FORMAT,
    createCompressedTransferUrl,
    createSavePackage,
    createTransferUrl,
    decodeCompressedPackage,
    decodePackage,
    encodePackage,
    stateFromProgressPackage,
    validatePackage
  };

  if (typeof window !== "undefined") window.TAKKEN_SAVE_TRANSFER = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
