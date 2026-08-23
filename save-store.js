"use strict";

(() => {
  const PREVIOUS_SUFFIX = "-previous";
  const CORRUPT_SUFFIX = "-corrupt-";
  const BEFORE_RESTORE_SUFFIX = "-before-restore-";
  const BEFORE_IMPORT_SUFFIX = "-before-import-";
  const TIMESTAMPED_BACKUP_SUFFIXES = Object.freeze([
    CORRUPT_SUFFIX,
    BEFORE_RESTORE_SUFFIX,
    BEFORE_IMPORT_SUFFIX
  ]);

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

  function storageKeys(storage) {
    const keys = [];
    const length = Math.max(0, Number(storage?.length) || 0);
    if (typeof storage?.key !== "function") return keys;
    for (let index = 0; index < length; index += 1) {
      const key = storage.key(index);
      if (typeof key === "string") keys.push(key);
    }
    return keys;
  }

  function backupTimestamp(key, prefix) {
    const suffix = key.slice(prefix.length);
    const timestamp = Number(suffix);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function pruneBackups(storage, storageId, maximumPerType = 3) {
    if (typeof storage?.removeItem !== "function") return [];
    const keep = Math.max(0, Math.trunc(Number(maximumPerType) || 0));
    const removed = [];
    const keys = storageKeys(storage);
    TIMESTAMPED_BACKUP_SUFFIXES.forEach((suffix) => {
      const prefix = `${storageId}${suffix}`;
      keys
        .filter((key) => key.startsWith(prefix))
        .sort((left, right) =>
          backupTimestamp(right, prefix) - backupTimestamp(left, prefix) ||
          right.localeCompare(left)
        )
        .slice(keep)
        .forEach((key) => {
          try {
            storage.removeItem(key);
            removed.push(key);
          } catch {
            // Backup pruning is best effort and must never block a current save.
          }
        });
    });
    return removed;
  }

  function backupCurrent(
    storage,
    storageId,
    suffix = BEFORE_IMPORT_SUFFIX,
    now = Date.now(),
    raw = ""
  ) {
    if (!TIMESTAMPED_BACKUP_SUFFIXES.includes(suffix)) {
      throw new Error("未対応のバックアップ種別です。");
    }
    const currentRaw = raw || storage.getItem(storageId) || "";
    if (!currentRaw) return { backupKey: "", removed: [] };
    const backupKey = `${storageId}${suffix}${now}`;
    storage.setItem(backupKey, currentRaw);
    const removed = pruneBackups(storage, storageId);
    return { backupKey, removed };
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
      if (previousSchema === schemaVersion) {
        return {
          value,
          source: "primary",
          notice: "",
          isError: false,
          skipPreviousRotation: false,
          backupKey: ""
        };
      }

      if (previousSchema > schemaVersion) {
        return {
          value,
          source: "future",
          notice: `このセーブは新しい保存形式v${previousSchema}です。アプリを更新するまで読み取り専用で開きます。`,
          isError: true,
          writeBlocked: true,
          skipPreviousRotation: true,
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
      pruneBackups(storage, storageId);
      const previousRaw = storage.getItem(`${storageId}${PREVIOUS_SUFFIX}`) || "";
      try {
        const value = parsedObject(previousRaw);
        if (value) {
          const previousSchema = Math.max(0, Math.trunc(Number(value.stateSchemaVersion) || 0));
          if (previousSchema > schemaVersion) {
            return {
              value,
              source: "future-previous",
              notice:
                `破損したセーブを退避しました。直前セーブは新しい保存形式v${previousSchema}です。` +
                "アプリを更新するまで読み取り専用で開きます。",
              isError: true,
              writeBlocked: true,
              skipPreviousRotation: true,
              backupKey: corruptKey
            };
          }
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
    if (currentRaw) {
      try {
        const current = parsedObject(currentRaw);
        const currentSchema = Math.max(0, Math.trunc(Number(current?.stateSchemaVersion) || 0));
        const nextSchema = Math.max(0, Math.trunc(Number(value.stateSchemaVersion) || 0));
        if (currentSchema > nextSchema) {
          throw new RangeError(
            `新しい保存形式v${currentSchema}を古い形式v${nextSchema}で上書きできません。アプリを更新してください。`
          );
        }
      } catch (error) {
        if (error instanceof RangeError) throw error;
        // A corrupt primary can only be rewritten by an older runtime when its
        // valid previous copy is not from a newer schema.
        try {
          const previous = parsedObject(storage.getItem(`${storageId}${PREVIOUS_SUFFIX}`) || "");
          const previousSchema = Math.max(0, Math.trunc(Number(previous?.stateSchemaVersion) || 0));
          const nextSchema = Math.max(0, Math.trunc(Number(value.stateSchemaVersion) || 0));
          if (previousSchema > nextSchema) {
            throw new RangeError(
              `直前セーブの新しい保存形式v${previousSchema}を古い形式v${nextSchema}で上書きできません。アプリを更新してください。`
            );
          }
        } catch (previousError) {
          if (previousError instanceof RangeError) throw previousError;
          // load() retains malformed copies; preserve the established recovery path.
        }
      }
    }
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
    pruneBackups(storage, storageId);
    storage.setItem(storageId, previousRaw);
    if (storage.getItem(storageId) !== previousRaw) {
      throw new Error("直前セーブの復元確認に失敗しました。");
    }
    if (currentRaw) safeSet(storage, previousKey, currentRaw);
    return { value, backupKey };
  }

  const api = {
    BEFORE_IMPORT_SUFFIX,
    BEFORE_RESTORE_SUFFIX,
    CORRUPT_SUFFIX,
    PREVIOUS_SUFFIX,
    TIMESTAMPED_BACKUP_SUFFIXES,
    backupCurrent,
    getPrevious,
    load,
    pruneBackups,
    restorePrevious,
    save
  };

  if (typeof window !== "undefined") window.TAKKEN_SAVE_STORE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
