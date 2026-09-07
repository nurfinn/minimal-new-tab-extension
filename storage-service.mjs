import { getExtensionApi } from "./extension-api.mjs";

export const STORAGE_VERSION = 1;

const CHUNK_MAX_BYTES = 3500;
const ROOT_FOLDER_ID = "root";
const ID_PATTERN = /^[a-z\d][a-z\d._:-]{0,127}$/i;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const IMAGE_DATA_URL_PATTERN = /^data:image\/[a-z\d.+-]+;base64,[a-z\d+/=\s]+$/i;
const encoder = new TextEncoder();

export const STORAGE_KEYS = Object.freeze({
  manifest: "minimalNewTabSyncManifest",
  backupManifest: "minimalNewTabSyncManifestBackup",
  chunkPrefix: "minimalNewTabSyncChunk:",
  localBackground: "minimalNewTabLocalBackground",
  legacyState: "minimalNewTabState"
});

export function normalizeWebUrl(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return "";

  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (!url.hostname || url.username || url.password) return "";
    if (url.href.length > 4096) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function validateSyncPayload(value) {
  if (!isRecord(value) || value.storageVersion !== STORAGE_VERSION) return false;
  if (!isRecord(value.sites) || !isRecord(value.folders)) return false;
  if (!isRecord(value.layout) || !isRecord(value.theme)) return false;
  if (
    value.preferences !== undefined &&
    (!isRecord(value.preferences) || typeof value.preferences.singleKeyShortcuts !== "boolean")
  ) {
    return false;
  }
  if (!Array.isArray(value.layout.siteOrder) || !Array.isArray(value.layout.folderOrder)) {
    return false;
  }

  const folderIds = Object.keys(value.folders);
  const siteIds = Object.keys(value.sites);
  if (!folderIds.includes(ROOT_FOLDER_ID)) return false;
  if (!hasExactOrder(value.layout.folderOrder, folderIds)) return false;
  if (!hasExactOrder(value.layout.siteOrder, siteIds)) return false;

  for (const [id, folder] of Object.entries(value.folders)) {
    if (!isValidId(id) || !isRecord(folder) || !isNonEmptyString(folder.name, 200)) return false;
  }

  for (const [id, site] of Object.entries(value.sites)) {
    if (!isValidId(id) || !isRecord(site) || !isNonEmptyString(site.title, 500)) return false;
    if (!folderIds.includes(site.folderId)) return false;
    if (normalizeWebUrl(site.url) !== site.url) return false;
  }

  const selectedFolderId = value.layout.selectedFolderId;
  if (
    selectedFolderId !== "all" &&
    selectedFolderId !== ROOT_FOLDER_ID &&
    !folderIds.includes(selectedFolderId)
  ) {
    return false;
  }

  const background = value.theme.background;
  if (!isRecord(background) || !["default", "color", "custom"].includes(background.type)) {
    return false;
  }
  if (background.type === "color" && !COLOR_PATTERN.test(background.value || "")) return false;
  if (background.type === "custom" && !isNonEmptyString(background.localAssetId, 200)) return false;
  if (!Number.isFinite(value.theme.overlay)) return false;
  if (!COLOR_PATTERN.test(value.theme.overlayColor || "")) return false;

  return true;
}

export function createStorageService({
  syncArea = getExtensionApi()?.storage?.sync,
  localArea = getExtensionApi()?.storage?.local,
  lockManager = globalThis.navigator?.locks,
  logger = console
} = {}) {
  let writable = Boolean(syncArea);
  let lastPayloadJson = null;
  let lastValidManifest = null;
  let localBackground = null;
  let saveQueue = Promise.resolve();

  return {
    load: loadSnapshot,

    save(state) {
      const snapshot = structuredClone(state);
      return enqueueSave(() => saveSnapshot(snapshot));
    },

    update(defaultState, transform) {
      return enqueueSave(() =>
        withMutationLock(async () => {
          const loaded = await loadSnapshot(defaultState);
          if (!loaded.ok) {
            return {
              ok: false,
              changed: false,
              error: loaded.source === "read-error" ? "read-failed" : "storage-unavailable",
              state: loaded.state
            };
          }

          let candidate = structuredClone(loaded.state);
          try {
            const transformed = await transform(candidate);
            if (transformed !== undefined) candidate = transformed;
          } catch (error) {
            warn(logger, "Не удалось применить изменение настроек.", error);
            return {
              ok: false,
              changed: false,
              error: "mutation-failed",
              state: loaded.state
            };
          }

          const result = await saveSnapshot(candidate);
          return {
            ...result,
            state: structuredClone(result.ok ? candidate : loaded.state)
          };
        })
      );
    }
  };

  async function loadSnapshot(defaultState) {
      const safeDefaults = structuredClone(defaultState);
      if (!syncArea) {
        writable = false;
        return { ok: false, writable: false, source: "unavailable", state: safeDefaults };
      }

      let stored;
      try {
        stored = await syncArea.get(null);
      } catch (error) {
        writable = false;
        warn(logger, "Не удалось прочитать синхронизированные настройки.", error);
        return { ok: false, writable: false, source: "read-error", state: safeDefaults };
      }

      writable = true;
      const primaryManifest = normalizeManifest(stored[STORAGE_KEYS.manifest]);
      const backupManifest = normalizeManifest(stored[STORAGE_KEYS.backupManifest]);
      const candidates = [
        { descriptor: primaryManifest?.active, source: "sync" },
        { descriptor: primaryManifest?.previous, source: "recovered" },
        { descriptor: backupManifest?.active, source: "recovered" },
        { descriptor: backupManifest?.previous, source: "recovered" }
      ];
      const seenGenerations = new Set();

      for (const candidate of candidates) {
        if (!candidate.descriptor || seenGenerations.has(candidate.descriptor.generationId)) continue;
        seenGenerations.add(candidate.descriptor.generationId);
        const loaded = readGeneration(stored, candidate.descriptor);
        if (!loaded) continue;

        const materialized = await payloadToApplicationState(
          loaded.payload,
          safeDefaults,
          localArea,
          logger
        );
        localBackground = materialized.localBackground;
        lastPayloadJson = loaded.json;
        lastValidManifest = {
          storageVersion: STORAGE_VERSION,
          active: structuredClone(candidate.descriptor),
          previous: null
        };
        return {
          ok: true,
          writable: true,
          source: candidate.source,
          state: materialized.state
        };
      }

      lastPayloadJson = null;
      lastValidManifest = null;
      const migration = await migrateLegacyState(safeDefaults);
      if (migration) return migration;
      return { ok: true, writable: true, source: "defaults", state: safeDefaults };
  }

  function enqueueSave(callback) {
    const operation = saveQueue.then(callback);
    saveQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  async function withMutationLock(callback) {
    if (typeof lockManager?.request !== "function") return callback();

    try {
      return await lockManager.request("minimal-new-tab-state", callback);
    } catch (error) {
      warn(logger, "Не удалось получить блокировку хранилища.", error);
      return { ok: false, changed: false, error: "lock-failed" };
    }
  }

  async function saveSnapshot(state) {
    if (!writable || !syncArea) {
      return { ok: false, changed: false, error: "storage-unavailable" };
    }

    try {
      const preparedBackground = await prepareBackground(state.background);
      const payload = applicationStateToPayload(state, preparedBackground.descriptor);
      if (!validateSyncPayload(payload)) throw new Error("Invalid application state");

      const json = JSON.stringify(payload);
      if (json === lastPayloadJson) return { ok: true, changed: false };

      const generationId = createGenerationId();
      const chunks = splitUtf8(json, CHUNK_MAX_BYTES);
      const chunkKeys = chunks.map(
        (_, index) => `${STORAGE_KEYS.chunkPrefix}${generationId}:${index}`
      );

      for (let index = 0; index < chunks.length; index += 1) {
        await syncArea.set({ [chunkKeys[index]]: chunks[index] });
      }

      const descriptor = {
        storageVersion: STORAGE_VERSION,
        generationId,
        chunkKeys,
        chunkCount: chunkKeys.length,
        byteLength: encoder.encode(json).length,
        createdAt: Date.now()
      };
      const manifest = {
        storageVersion: STORAGE_VERSION,
        active: descriptor,
        previous: lastValidManifest?.active || null
      };
      const backupManifest = lastValidManifest ? structuredClone(lastValidManifest) : null;

      if (backupManifest) {
        await syncArea.set({ [STORAGE_KEYS.backupManifest]: backupManifest });
      }
      await syncArea.set({ [STORAGE_KEYS.manifest]: manifest });
      lastPayloadJson = json;
      lastValidManifest = structuredClone(manifest);
      localBackground = preparedBackground.localBackground;
      if (preparedBackground.removeLocalAfterCommit && localArea) {
        try {
          await localArea.remove(STORAGE_KEYS.localBackground);
          localBackground = null;
        } catch (error) {
          warn(logger, "Не удалось удалить прежний локальный фон.", error);
        }
      }
      await cleanupUnreferencedChunks(syncArea, manifest, backupManifest, logger);
      return { ok: true, changed: true };
    } catch (error) {
      warn(logger, "Не удалось сохранить синхронизированные настройки.", error);
      return { ok: false, changed: false, error: "write-failed" };
    }
  }

  async function prepareBackground(background) {
    if (
      isNonEmptyString(background?.customAssetId, 200) &&
      background.customAssetAvailable === false
    ) {
      return {
        descriptor: { type: "custom", localAssetId: background.customAssetId },
        localBackground,
        removeLocalAfterCommit: false
      };
    }

    if (background?.type === "color" && COLOR_PATTERN.test(background.value || "")) {
      return {
        descriptor: { type: "color", value: background.value },
        localBackground,
        removeLocalAfterCommit: Boolean(localBackground)
      };
    }

    if (isImageDataUrl(background?.value)) {
      if (
        localBackground &&
        localBackground.dataUrl === background.value &&
        (!background.customAssetId || background.customAssetId === localBackground.id)
      ) {
        return {
          descriptor: { type: "custom", localAssetId: localBackground.id },
          localBackground,
          removeLocalAfterCommit: false
        };
      }

      if (!localArea) throw new Error("Local storage is unavailable for a custom background");
      const nextLocalBackground = {
        storageVersion: STORAGE_VERSION,
        id: createBackgroundId(),
        dataUrl: background.value
      };
      await localArea.set({ [STORAGE_KEYS.localBackground]: nextLocalBackground });
      return {
        descriptor: { type: "custom", localAssetId: nextLocalBackground.id },
        localBackground: nextLocalBackground,
        removeLocalAfterCommit: false
      };
    }

    if (isNonEmptyString(background?.customAssetId, 200)) {
      return {
        descriptor: { type: "custom", localAssetId: background.customAssetId },
        localBackground,
        removeLocalAfterCommit: false
      };
    }

    return {
      descriptor: { type: "default" },
      localBackground,
      removeLocalAfterCommit: Boolean(localBackground)
    };
  }

  async function migrateLegacyState(defaultState) {
    if (!localArea) return null;

    let legacy;
    try {
      const stored = await localArea.get(STORAGE_KEYS.legacyState);
      legacy = stored[STORAGE_KEYS.legacyState];
    } catch (error) {
      warn(logger, "Не удалось прочитать данные предыдущей версии.", error);
      return null;
    }
    if (legacy === undefined) return null;

    let migratedState;
    try {
      migratedState = normalizeLegacyState(legacy, defaultState);
    } catch (error) {
      warn(logger, "Данные предыдущей версии повреждены.", error);
      return null;
    }

    const result = await saveSnapshot(migratedState);
    if (!result.ok) {
      return {
        ok: false,
        writable: true,
        source: "migration-error",
        state: migratedState
      };
    }

    try {
      await localArea.remove(STORAGE_KEYS.legacyState);
    } catch (error) {
      warn(logger, "Не удалось удалить данные предыдущей версии.", error);
    }

    return { ok: true, writable: true, source: "migrated", state: migratedState };
  }
}

function applicationStateToPayload(state, backgroundDescriptor = null) {
  if (!isRecord(state) || !Array.isArray(state.folders) || !Array.isArray(state.links)) {
    throw new TypeError("Invalid application state");
  }

  const folders = {};
  const folderOrder = [];
  for (const folder of state.folders) {
    if (!isRecord(folder) || !isValidId(folder.id) || !isNonEmptyString(folder.name, 200)) {
      throw new TypeError("Invalid folder");
    }
    if (Object.hasOwn(folders, folder.id)) throw new TypeError("Duplicate folder id");
    folders[folder.id] = { name: folder.name.trim() };
    folderOrder.push(folder.id);
  }

  const sites = {};
  const siteOrder = [];
  for (const link of state.links) {
    const normalizedUrl = normalizeWebUrl(link?.url);
    if (
      !isRecord(link) ||
      !isValidId(link.id) ||
      !isNonEmptyString(link.title, 500) ||
      !normalizedUrl ||
      !Object.hasOwn(folders, link.folderId)
    ) {
      throw new TypeError("Invalid site");
    }
    if (Object.hasOwn(sites, link.id)) throw new TypeError("Duplicate site id");
    sites[link.id] = {
      title: link.title.trim(),
      url: normalizedUrl,
      folderId: link.folderId
    };
    siteOrder.push(link.id);
  }

  if (!Object.hasOwn(folders, ROOT_FOLDER_ID)) throw new TypeError("Missing root folder");

  const selectedFolderId =
    state.selectedFolderId === ROOT_FOLDER_ID ||
    (state.selectedFolderId !== "all" && !Object.hasOwn(folders, state.selectedFolderId))
      ? "all"
      : state.selectedFolderId;

  const overlay = clampOverlay(state.background?.overlay);
  const overlayColor = COLOR_PATTERN.test(state.background?.overlayColor || "")
    ? state.background.overlayColor
    : "#f4f6f3";
  const background =
    backgroundDescriptor ||
    (state.background?.type === "color" && COLOR_PATTERN.test(state.background.value || "")
      ? { type: "color", value: state.background.value }
      : { type: "default" });
  const preferences =
    typeof state.shortcutsEnabled === "boolean"
      ? { singleKeyShortcuts: state.shortcutsEnabled }
      : null;

  return {
    storageVersion: STORAGE_VERSION,
    sites,
    folders,
    layout: { siteOrder, folderOrder, selectedFolderId },
    theme: { background, overlay, overlayColor },
    ...(preferences ? { preferences } : {})
  };
}

async function payloadToApplicationState(payload, defaultState, localArea, logger) {
  const folders = payload.layout.folderOrder.map((id) => ({ id, name: payload.folders[id].name }));
  const links = payload.layout.siteOrder.map((id) => ({ id, ...payload.sites[id] }));
  const defaultBackground = structuredClone(defaultState.background);
  let background;
  let materializedLocalBackground = null;
  if (payload.theme.background.type === "color") {
    background = {
      type: "color",
      value: payload.theme.background.value,
      overlay: 0,
      overlayColor: payload.theme.overlayColor
    };
  } else if (payload.theme.background.type === "custom") {
    const localAssetId = payload.theme.background.localAssetId;
    materializedLocalBackground = await readLocalBackground(localArea, localAssetId, logger);
    background = {
      ...defaultBackground,
      type: materializedLocalBackground ? "image" : defaultBackground.type,
      value: materializedLocalBackground?.dataUrl || defaultBackground.value,
      overlay: clampOverlay(payload.theme.overlay),
      overlayColor: payload.theme.overlayColor,
      customAssetId: localAssetId,
      customAssetAvailable: Boolean(materializedLocalBackground)
    };
  } else {
    background = {
      ...defaultBackground,
      overlay: clampOverlay(payload.theme.overlay),
      overlayColor: payload.theme.overlayColor
    };
  }

  return {
    localBackground: materializedLocalBackground,
    state: {
      selectedFolderId:
        payload.layout.selectedFolderId === ROOT_FOLDER_ID
          ? "all"
          : payload.layout.selectedFolderId,
      folders,
      links,
      background,
      shortcutsEnabled: payload.preferences?.singleKeyShortcuts !== false
    }
  };
}

function readGeneration(stored, descriptor) {
  if (!isValidDescriptor(descriptor)) return null;
  const chunks = descriptor.chunkKeys.map((key) => stored[key]);
  if (chunks.some((chunk) => typeof chunk !== "string")) return null;

  const json = chunks.join("");
  if (encoder.encode(json).length !== descriptor.byteLength) return null;

  try {
    const payload = JSON.parse(json);
    return validateSyncPayload(payload) ? { json, payload } : null;
  } catch {
    return null;
  }
}

function isValidDescriptor(value) {
  return (
    isRecord(value) &&
    value.storageVersion === STORAGE_VERSION &&
    isNonEmptyString(value.generationId, 200) &&
    Array.isArray(value.chunkKeys) &&
    value.chunkKeys.length > 0 &&
    value.chunkKeys.length === value.chunkCount &&
    value.chunkKeys.every(
      (key, index) =>
        key === `${STORAGE_KEYS.chunkPrefix}${value.generationId}:${index}`
    ) &&
    Number.isSafeInteger(value.byteLength) &&
    value.byteLength > 0 &&
    Number.isFinite(value.createdAt)
  );
}

function normalizeManifest(value) {
  if (!isRecord(value) || value.storageVersion !== STORAGE_VERSION) return null;
  if (!isValidDescriptor(value.active)) return null;
  if (value.previous !== null && value.previous !== undefined && !isValidDescriptor(value.previous)) {
    return null;
  }
  return {
    storageVersion: STORAGE_VERSION,
    active: structuredClone(value.active),
    previous: value.previous ? structuredClone(value.previous) : null
  };
}

function normalizeLegacyState(legacy, defaultState) {
  if (!isRecord(legacy) || !Array.isArray(legacy.folders) || !Array.isArray(legacy.links)) {
    throw new TypeError("Invalid legacy state");
  }

  const folders = [];
  const folderIds = new Set();
  for (const folder of legacy.folders) {
    if (!isRecord(folder) || !isValidId(folder.id) || !isNonEmptyString(folder.name, 200)) {
      throw new TypeError("Invalid legacy folder");
    }
    if (folderIds.has(folder.id)) throw new TypeError("Duplicate legacy folder");
    folderIds.add(folder.id);
    folders.push({ id: folder.id, name: folder.name.trim() });
  }
  if (!folderIds.has(ROOT_FOLDER_ID)) {
    folders.unshift(structuredClone(defaultState.folders[0]));
    folderIds.add(ROOT_FOLDER_ID);
  }

  const linkIds = new Set();
  const links = legacy.links.map((link) => {
    const url = normalizeWebUrl(link?.url);
    if (
      !isRecord(link) ||
      !isValidId(link.id) ||
      linkIds.has(link.id) ||
      !isNonEmptyString(link.title, 500) ||
      !url
    ) {
      throw new TypeError("Invalid legacy site");
    }
    linkIds.add(link.id);
    return {
      id: link.id,
      title: link.title.trim(),
      url,
      folderId: folderIds.has(link.folderId) ? link.folderId : ROOT_FOLDER_ID
    };
  });

  const background = normalizeLegacyBackground(legacy.background, defaultState.background);
  const selectedFolderId =
    legacy.selectedFolderId === "all" ||
    (legacy.selectedFolderId !== ROOT_FOLDER_ID && folderIds.has(legacy.selectedFolderId))
      ? legacy.selectedFolderId
      : "all";

  return { selectedFolderId, folders, links, background };
}

function normalizeLegacyBackground(background, defaultBackground) {
  if (!isRecord(background)) return structuredClone(defaultBackground);
  const overlay = clampOverlay(background.overlay);
  const overlayColor = COLOR_PATTERN.test(background.overlayColor || "")
    ? background.overlayColor
    : defaultBackground.overlayColor;

  if (background.type === "color" && COLOR_PATTERN.test(background.value || "")) {
    return { type: "color", value: background.value, overlay: 0, overlayColor };
  }
  if (background.type === "image" && isImageDataUrl(background.value)) {
    return { type: "image", value: background.value, overlay, overlayColor };
  }
  return { ...structuredClone(defaultBackground), overlay, overlayColor };
}

async function readLocalBackground(localArea, localAssetId, logger) {
  if (!localArea) return null;
  try {
    const stored = await localArea.get(STORAGE_KEYS.localBackground);
    const candidate = stored[STORAGE_KEYS.localBackground];
    return isValidLocalBackground(candidate) && candidate.id === localAssetId
      ? structuredClone(candidate)
      : null;
  } catch (error) {
    warn(logger, "Не удалось прочитать локальный фон.", error);
    return null;
  }
}

function isValidLocalBackground(value) {
  return (
    isRecord(value) &&
    value.storageVersion === STORAGE_VERSION &&
    isNonEmptyString(value.id, 200) &&
    isImageDataUrl(value.dataUrl)
  );
}

function isImageDataUrl(value) {
  return typeof value === "string" && IMAGE_DATA_URL_PATTERN.test(value);
}

function splitUtf8(value, maxBytes) {
  const chunks = [];
  let chunk = "";
  let bytes = 0;

  for (const character of value) {
    const characterBytes = encoder.encode(character).length;
    if (chunk && bytes + characterBytes > maxBytes) {
      chunks.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += character;
    bytes += characterBytes;
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}

async function cleanupUnreferencedChunks(syncArea, primaryManifest, backupManifest, logger) {
  const referencedKeys = new Set();
  for (const manifest of [primaryManifest, backupManifest]) {
    for (const descriptor of [manifest?.active, manifest?.previous]) {
      for (const key of descriptor?.chunkKeys || []) referencedKeys.add(key);
    }
  }

  try {
    const stored = await syncArea.get(null);
    const staleKeys = Object.keys(stored).filter(
      (key) => key.startsWith(STORAGE_KEYS.chunkPrefix) && !referencedKeys.has(key)
    );
    if (staleKeys.length > 0) await syncArea.remove(staleKeys);
  } catch (error) {
    warn(logger, "Не удалось очистить старые поколения настроек.", error);
  }
}

function hasExactOrder(order, ids) {
  return (
    order.length === ids.length &&
    new Set(order).size === order.length &&
    order.every((id) => typeof id === "string" && ids.includes(id))
  );
}

function isValidId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isNonEmptyString(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampOverlay(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.min(100, Math.max(0, numericValue)) : 0;
}

function createGenerationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBackgroundId() {
  return `bg-${createGenerationId()}`;
}

function warn(logger, message, error) {
  if (typeof logger?.warn === "function") logger.warn(message, error);
}
