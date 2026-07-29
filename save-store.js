"use strict";

(() => {
  const PREVIOUS_SUFFIX = "-previous";
  const CORRUPT_SUFFIX = "-corrupt-";
  const BEFORE_RESTORE_SUFFIX = "-before-restore-";

  function plainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function parsedObject(raw) {
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!plainObject(value)) throw new Error("保存内容がオブジェクトではありません。");
    return value;
  }

  function safeSet(storage, key, value) {
    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function load(storage, storageId, schemaVersion, now = Date.now()) {
    let raw = "";
    try {
      raw = storage.getItem(storageId) || "";
    } catch {
      return {
        value: null,
        source: "unavailable",
        notice: "端末セーブへアクセスできません。ブラウザのサイトデータ設定を確認してください。",
        isError: true,
        skipPreviousRotation: false,
        backupKey: ""
      };
    }

    if (!raw) {
      return {
        value: null,
        source: "empty",
        notice: "",
        isError: false,
        skipPreviousRotation: false,
        backupKey: ""
      };
    }

    try {
      const value = parsedObject(raw);
      const previousSchema = Math.max(0, Math.trunc(Number(value.stateSchemaVersion) || 0));
      if (previousSchema >= schemaVersion) {
        return {
          value,
          source: "primary",
          notice: "",
          isError: false,
          skipPreviousRotation: false,
          backupKey: ""
        };
      }

      const backupKey =
        `${storageId}-before-upgrade-v${previousSchema}-to-v${schemaVersion}`;
      if (!storage.getItem(backupKey)) safeSet(storage, backupKey, raw);
      return {
        value,
        source: "upgrade",
        notice: "更新前のセーブを自動退避してから引き継ぎました。",
        isError: false,
        skipPreviousRotation: false,
        backupKey
      };
    } catch {
      const corruptKey = `${storageId}${CORRUPT_SUFFIX}${now}`;
      safeSet(storage, corruptKey, raw);
      const previousRaw = storage.getItem(`${storageId}${PREVIOUS_SUFFIX}`) || "";
      try {
        const value = parsedObject(previousRaw);
        if (value) {
          return {
            value,
            source: "previous",
            notice: "破損したセーブを退避し、直前の正常セーブへ自動復旧しました。",
            isError: false,
            skipPreviousRotation: true,
            backupKey: corruptKey
          };
        }
      } catch {
        // Both copies are retained. The app can start fresh without overwriting them.
      }
      return {
        value: null,
        source: "fresh-after-corrupt",
        notice: "セーブを読み込めませんでした。破損データは退避済みです。",
        isError: true,
        skipPreviousRotation: true,
        backupKey: corruptKey
      };
    }
  }

  function save(
    storage,
    storageId,
    value,
    { skipPreviousRotation = false } = {}
  ) {
    if (!plainObject(value)) throw new Error("保存する状態がありません。");
    const serialized = JSON.stringify(value);
    const currentRaw = storage.getItem(storageId) || "";
    let previousCreated = false;

    if (!skipPreviousRotation && currentRaw && currentRaw !== serialized) {
      previousCreated = safeSet(
        storage,
        `${storageId}${PREVIOUS_SUFFIX}`,
        currentRaw
      );
    }

    storage.setItem(storageId, serialized);
    if (storage.getItem(storageId) !== serialized) {
      throw new Error("端末セーブの書き戻し確認に失敗しました。");
    }
    return {
      serializedChars: serialized.length,
      previousCreated
    };
  }

  function getPrevious(storage, storageId) {
    try {
      return parsedObject(storage.getItem(`${storageId}${PREVIOUS_SUFFIX}`) || "");
    } catch {
      return null;
    }
  }

  function restorePrevious(storage, storageId, now = Date.now()) {
    const previousKey = `${storageId}${PREVIOUS_SUFFIX}`;
    const currentRaw = storage.getItem(storageId) || "";
    const previousRaw = storage.getItem(previousKey) || "";
    const value = parsedObject(previousRaw);
    if (!value) throw new Error("戻せる直前セーブがありません。");

    const backupKey = `${storageId}${BEFORE_RESTORE_SUFFIX}${now}`;
    if (currentRaw) storage.setItem(backupKey, currentRaw);
    storage.setItem(storageId, previousRaw);
    if (storage.getItem(storageId) !== previousRaw) {
      throw new Error("直前セーブの復元確認に失敗しました。");
    }
    if (currentRaw) safeSet(storage, previousKey, currentRaw);
    return { value, backupKey };
  }

  const api = {
    BEFORE_RESTORE_SUFFIX,
    CORRUPT_SUFFIX,
    PREVIOUS_SUFFIX,
    getPrevious,
    load,
    restorePrevious,
    save
  };

  if (typeof window !== "undefined") window.TAKKEN_SAVE_STORE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
