import { getExtensionApi } from "./extension-api.mjs";
import { normalizeSiteEmoji } from "./site-icon.mjs";
import { buildFeaturePayload, canonicalFeatureJson } from "./feature-state.mjs";
import {
  FEATURE_KEYS, prepareFeatureGeneration, readFeatureGeneration, readFeatureLayer,
  resolveFeatureState, estimateSyncUsage
} from "./feature-generation.mjs";

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
  pendingBackground: "minimalNewTabLocalBackgroundPending",
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
  let lastEffectiveJson = null;
  let lastValidManifest = null;
  let lastFeaturePayload = null;
  let lastFeatureDescriptor = null;
  let needsFeatureRepair = false;
  let lastStored = {};
  let pendingBootstrap = false;
  let retryInitialFeatures = false;
  const ownedFeatureChunks = new Set();
  let localBackground = null;
  let saveQueue = Promise.resolve();

  return {
    load(defaultState) {
      return enqueueSave(async () => {
        const loaded = await withMutationLock(() => loadSnapshot(defaultState));
        if (loaded.error !== "lock-failed") return loaded;
        // Reading is safe without the lock; bootstrap and migration writes are not.
        const readOnly = await loadSnapshot(defaultState, false);
        writable = false;
        return { ...readOnly, ok: false, writable: false, error: "lock-failed" };
      });
    },

    save(state) {
      const snapshot = structuredClone(state);
      return enqueueSave(() => withMutationLock(async () => {
        const loaded = await loadSnapshot(snapshot);
        if (!loaded.ok || !loaded.writable) return { ok: false, changed: false, error: "storage-unavailable" };
        return saveSnapshot(snapshot);
      }));
    },

    update(defaultState, transform) {
      return enqueueSave(() =>
        withMutationLock(async () => {
          const loaded = await loadSnapshot(defaultState);
          if (!loaded.ok || !loaded.writable) {
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

  async function loadSnapshot(defaultState, allowWrites = true) {
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

      lastStored = stored;
      writable = true;
      pendingBootstrap = false;
      let layer = readFeatureLayer(stored);
      const featureKeys = Object.keys(stored).filter(key => key.startsWith("minimalNewTabFeature"));
      // Only an operation this service actually attempted can retry orphan staging.
      // Unknown chunks in a fresh service remain read-only rather than being guessed away.
      if (retryInitialFeatures && layer.status === "invalid" &&
        !Object.hasOwn(stored, FEATURE_KEYS.manifest) && !Object.hasOwn(stored, FEATURE_KEYS.backupManifest) &&
        featureKeys.every(key => ownedFeatureChunks.has(key))) {
        layer = { status: "absent", payload: null, descriptor: null };
      }
      if (["ready", "recovered"].includes(layer.status)) retryInitialFeatures = false;
      for (const manifest of [stored[FEATURE_KEYS.manifest], stored[FEATURE_KEYS.backupManifest]]) {
        for (const descriptor of [manifest?.active, manifest?.previous]) {
          if (readFeatureGeneration(stored, descriptor)) descriptor.chunkKeys.forEach(key => ownedFeatureChunks.add(key));
        }
      }
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

        const resolved = await resolveFeatureState(loaded.payload, layer,
          readFeatureLayer(stored, { generationId: loaded.payload.featureState?.generationId ?? "" }));
        const materialized = await payloadToApplicationState(
          resolved.payload,
          safeDefaults,
          localArea,
          logger
        );
        localBackground = materialized.localBackground;
        writable = resolved.writable;
        lastFeaturePayload = resolved.featurePayload;
        lastFeatureDescriptor = resolved.featureDescriptor;
        needsFeatureRepair = resolved.writable && Object.hasOwn(loaded.payload, "featureState") && !resolved.featureDescriptor;
        pendingBootstrap = resolved.bootstrap;
        lastEffectiveJson = effectivePayloadJson(applicationStateToPayload(materialized.state, loaded.payload.theme.background));
        lastValidManifest = {
          storageVersion: STORAGE_VERSION,
          active: structuredClone(candidate.descriptor),
          previous: null
        };
        if (allowWrites && pendingBootstrap && writable) {
          // The mutation lock is already held. Reread rather than publishing a stale first observation.
          const fresh = await loadSnapshot(safeDefaults, false);
          if (!fresh.ok || !fresh.writable || !pendingBootstrap) return fresh;
          try {
            await bootstrapFeatures();
            retryInitialFeatures = false;
            return await loadSnapshot(safeDefaults, false);
          } catch (error) {
            retryInitialFeatures = true;
            writable = false;
            warn(logger, "Не удалось защитить новые настройки.", error);
            return { ...fresh, ok: false, writable: false, source: "feature-error", error: "write-failed" };
          }
        }
        return {
          ok: true,
          writable,
          source: candidate.source,
          state: materialized.state
        };
      }

      lastEffectiveJson = null;
      lastValidManifest = null;
      lastFeaturePayload = null;
      lastFeatureDescriptor = null;
      needsFeatureRepair = false;
      if (layer.status !== "absent") {
        writable = false;
        return { ok: true, writable: false, source: "defaults", state: safeDefaults };
      }
      const migration = await migrateLegacyState(safeDefaults, allowWrites);
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

    const initialFeaturePublication = !lastFeatureDescriptor;
    try {
      const preparedBackground = await prepareBackground(state.background);
      const payload = applicationStateToPayload(state, preparedBackground.descriptor);
      if (!validateSyncPayload(payload)) throw new Error("Invalid application state");
      const effectiveJson = effectivePayloadJson(payload);
      if (effectiveJson === lastEffectiveJson && !needsFeatureRepair) {
        await finalizeBackground(preparedBackground);
        return { ok: true, changed: false };
      }
      const featurePayload = await buildFeaturePayload({
        sites: payload.sites, showAllFolder: state.showAllFolder !== false
      }, lastFeaturePayload);
      const featureJson = canonicalFeatureJson(featurePayload);
      const featureChanged = !lastFeatureDescriptor || !lastFeaturePayload ||
        featureJson !== canonicalFeatureJson(lastFeaturePayload);
      const feature = featureChanged ? prepareFeatureGeneration(featurePayload, {
        generationId: createGenerationId(), createdAt: Date.now(), previousDescriptor: lastFeatureDescriptor
      }) : null;
      const featureDescriptor = feature?.descriptor ?? lastFeatureDescriptor;
      payload.featureState = { version: 1, generationId: featureDescriptor.generationId };
      const json = JSON.stringify(payload);

      const generationId = createGenerationId();
      const chunks = splitUtf8(json, CHUNK_MAX_BYTES);
      const chunkKeys = chunks.map(
        (_, index) => `${STORAGE_KEYS.chunkPrefix}${generationId}:${index}`
      );

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
      const stages = chunks.map((chunk, index) => ({ [chunkKeys[index]]: chunk }));
      if (feature) stages.push(feature.chunks);
      const backups = {
        ...(backupManifest ? { [STORAGE_KEYS.backupManifest]: backupManifest } : {}),
        ...(feature?.backupManifest ? { [FEATURE_KEYS.backupManifest]: feature.backupManifest } : {})
      };
      if (Object.keys(backups).length) stages.push(backups);
      const heads = { [STORAGE_KEYS.manifest]: manifest, ...(feature ? { [FEATURE_KEYS.manifest]: feature.manifest } : {}) };
      stages.push(heads);
      checkWriteBudget(stages);
      await stageBackground(preparedBackground);
      if (feature) feature.descriptor.chunkKeys.forEach(key => ownedFeatureChunks.add(key));
      for (const items of stages) await syncArea.set(items);
      const verified = await syncArea.get(null);
      const readCore = readGeneration(verified, verified[STORAGE_KEYS.manifest]?.active);
      const readFeatures = readFeatureLayer(verified, { generationId: featureDescriptor.generationId });
      if (verified[STORAGE_KEYS.manifest]?.active?.generationId !== generationId ||
        readCore?.json !== json || !readFeatures.payload || canonicalFeatureJson(readFeatures.payload) !== featureJson) {
        throw new Error("Protected settings readback failed");
      }
      lastStored = verified;
      lastEffectiveJson = effectiveJson;
      lastValidManifest = structuredClone(manifest);
      lastFeaturePayload = featurePayload;
      lastFeatureDescriptor = featureDescriptor;
      needsFeatureRepair = false;
      retryInitialFeatures = false;
      localBackground = preparedBackground.localBackground;
      await finalizeBackground(preparedBackground);
      await cleanupUnreferencedChunks(syncArea, manifest, backupManifest, logger);
      await cleanupFeatureChunks();
      return { ok: true, changed: true };
    } catch (error) {
      // Rejection can follow partial application. Do not roll back or remove prepared generations.
      if (initialFeaturePublication) retryInitialFeatures = true;
      try { lastStored = await syncArea.get(null); } catch { writable = false; }
      warn(logger, "Не удалось сохранить синхронизированные настройки.", error);
      return { ok: false, changed: false, error: "write-failed" };
    }
  }

  function checkWriteBudget(stages) {
    let simulated = lastStored;
    for (const items of stages) {
      const usage = estimateSyncUsage(simulated, items);
      if (usage.totalBytes > 102400 || usage.maxItemBytes > 8192 || usage.itemCount > 512) {
        throw new RangeError("Sync storage quota exceeded");
      }
      simulated = { ...simulated, ...items };
    }
  }

  async function bootstrapFeatures() {
    const feature = prepareFeatureGeneration(lastFeaturePayload, { generationId: createGenerationId(), createdAt: Date.now() });
    const stages = [feature.chunks, { [FEATURE_KEYS.manifest]: feature.manifest }];
    checkWriteBudget(stages);
    feature.descriptor.chunkKeys.forEach(key => ownedFeatureChunks.add(key));
    for (const items of stages) await syncArea.set(items);
    const stored = await syncArea.get(null);
    const read = readFeatureLayer(stored, { generationId: feature.descriptor.generationId });
    if (stored[FEATURE_KEYS.manifest]?.active?.generationId !== feature.descriptor.generationId ||
      !read.payload || canonicalFeatureJson(read.payload) !== feature.json) throw new Error("Feature bootstrap readback failed");
    await cleanupFeatureChunks();
  }

  async function cleanupFeatureChunks() {
    try {
      const stored = await syncArea.get(null);
      if (readFeatureLayer(stored).status !== "ready") return;
      const referenced = new Set();
      for (const manifest of [stored[FEATURE_KEYS.manifest], stored[FEATURE_KEYS.backupManifest]]) {
        for (const descriptor of [manifest?.active, manifest?.previous]) {
          if (descriptor && !readFeatureGeneration(stored, descriptor)) return;
          descriptor?.chunkKeys.forEach(key => referenced.add(key));
        }
      }
      const stale = [...ownedFeatureChunks].filter(key => Object.hasOwn(stored, key) && !referenced.has(key));
      if (stale.length) await syncArea.remove(stale);
      stale.forEach(key => ownedFeatureChunks.delete(key));
    } catch (error) { warn(logger, "Не удалось очистить прежние настройки иконок.", error); }
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
      return {
        descriptor: { type: "custom", localAssetId: nextLocalBackground.id },
        localBackground: nextLocalBackground,
        stageLocalBeforeCommit: true,
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

  async function stageBackground(prepared) {
    if (!prepared.stageLocalBeforeCommit) return;
    const existing = await localArea.get([STORAGE_KEYS.localBackground, STORAGE_KEYS.pendingBackground]);
    for (const key of [STORAGE_KEYS.localBackground, STORAGE_KEYS.pendingBackground]) {
      if (Object.hasOwn(existing, key) && !isValidLocalBackground(existing[key])) {
        throw new Error("Unsupported local background data");
      }
    }
    // A previous interrupted commit may be readable only from pending. Use the
    // validated core reference, not materialization (which can miss a transient
    // local read failure), to preserve that image before reusing the slot.
    const committed = readGeneration(lastStored, lastValidManifest?.active)?.payload.theme.background;
    const committedImage = committed?.type === "custom"
      ? [existing[STORAGE_KEYS.localBackground], existing[STORAGE_KEYS.pendingBackground]]
        .find(value => isValidLocalBackground(value) && value.id === committed.localAssetId)
      : null;
    if (committedImage && !sameLocalBackground(existing[STORAGE_KEYS.localBackground], committedImage)) {
      await localArea.set({ [STORAGE_KEYS.localBackground]: committedImage });
      const verified = await localArea.get(STORAGE_KEYS.localBackground);
      if (!sameLocalBackground(verified[STORAGE_KEYS.localBackground], committedImage)) {
        throw new Error("Previous local background readback failed");
      }
    }
    await localArea.set({ [STORAGE_KEYS.pendingBackground]: prepared.localBackground });
    const staged = await localArea.get(STORAGE_KEYS.pendingBackground);
    if (!sameLocalBackground(staged[STORAGE_KEYS.pendingBackground], prepared.localBackground)) {
      throw new Error("Staged local background readback failed");
    }
  }

  async function finalizeBackground(prepared) {
    if (!localArea) return;
    try {
      if (prepared.descriptor.type === "custom" && prepared.localBackground) {
        const stored = await localArea.get([STORAGE_KEYS.localBackground, STORAGE_KEYS.pendingBackground]);
        if (!sameLocalBackground(stored[STORAGE_KEYS.localBackground], prepared.localBackground)) {
          if (Object.hasOwn(stored, STORAGE_KEYS.localBackground) && !isValidLocalBackground(stored[STORAGE_KEYS.localBackground])) {
            throw new Error("Unsupported local background cache");
          }
          if (!sameLocalBackground(stored[STORAGE_KEYS.pendingBackground], prepared.localBackground)) {
            throw new Error("Committed local background is unavailable");
          }
          // Sync has been verified (or freshly read as an effective no-op).
          // Promotion is a compatibility cache; the pending copy remains usable
          // if promotion fails, including a partially applied local write.
          await localArea.set({ [STORAGE_KEYS.localBackground]: prepared.localBackground });
          const verified = await localArea.get(STORAGE_KEYS.localBackground);
          if (!sameLocalBackground(verified[STORAGE_KEYS.localBackground], prepared.localBackground)) {
            throw new Error("Committed local background readback failed");
          }
        }
        const pending = await localArea.get(STORAGE_KEYS.pendingBackground);
        if (sameLocalBackground(pending[STORAGE_KEYS.pendingBackground], prepared.localBackground)) {
          await localArea.remove(STORAGE_KEYS.pendingBackground);
        }
      } else if (prepared.removeLocalAfterCommit) {
        const stored = await localArea.get([STORAGE_KEYS.localBackground, STORAGE_KEYS.pendingBackground]);
        const known = [STORAGE_KEYS.localBackground, STORAGE_KEYS.pendingBackground]
          .filter(key => isValidLocalBackground(stored[key]));
        if (known.length) await localArea.remove(known);
        localBackground = null;
      }
    } catch (error) {
      // Cleanup/cache failure does not undo verified sync or erase its pending image.
      warn(logger, "Не удалось завершить сохранение локального фона.", error);
    }
  }

  async function migrateLegacyState(defaultState, allowWrites = true) {
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

    if (!allowWrites) return { ok: true, writable: false, source: "legacy", state: migratedState };

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

function effectivePayloadJson(payload) {
  const value = structuredClone(payload);
  delete value.featureState;
  if (value.preferences?.singleKeyShortcuts !== false && value.preferences?.showAllFolder !== false) {
    delete value.preferences;
  } else {
    value.preferences = {
      singleKeyShortcuts: value.preferences.singleKeyShortcuts !== false,
      ...(value.preferences.showAllFolder === false ? { showAllFolder: false } : {})
    };
  }
  return JSON.stringify(value);
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
    const emoji = normalizeSiteEmoji(link.emoji);
    sites[link.id] = {
      title: link.title.trim(),
      url: normalizedUrl,
      folderId: link.folderId,
      ...(emoji ? { emoji } : {})
    };
    siteOrder.push(link.id);
  }

  if (!Object.hasOwn(folders, ROOT_FOLDER_ID)) throw new TypeError("Missing root folder");

  const selectedFolderId =
    (state.selectedFolderId === ROOT_FOLDER_ID && state.showAllFolder !== false) ||
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
    typeof state.shortcutsEnabled === "boolean" || state.showAllFolder === false
      ? {
          singleKeyShortcuts: state.shortcutsEnabled !== false,
          ...(state.showAllFolder === false ? { showAllFolder: false } : {})
        }
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
  const links = payload.layout.siteOrder.map((id) => {
    const site = payload.sites[id];
    const emoji = normalizeSiteEmoji(site.emoji);
    return {
      id,
      title: site.title,
      url: site.url,
      folderId: site.folderId,
      ...(emoji ? { emoji } : {})
    };
  });
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
        payload.layout.selectedFolderId === ROOT_FOLDER_ID && payload.preferences?.showAllFolder !== false
          ? "all"
          : payload.layout.selectedFolderId,
      folders,
      links,
      background,
      shortcutsEnabled: payload.preferences?.singleKeyShortcuts !== false,
      // Optional display data: malformed values fall back without discarding sites.
      ...(Object.hasOwn(defaultState, "showAllFolder") || Object.hasOwn(payload.preferences || {}, "showAllFolder")
        ? { showAllFolder: payload.preferences?.showAllFolder !== false }
        : {})
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
    const stored = await localArea.get([STORAGE_KEYS.localBackground, STORAGE_KEYS.pendingBackground]);
    const candidate = [stored[STORAGE_KEYS.localBackground], stored[STORAGE_KEYS.pendingBackground]]
      .find(value => isValidLocalBackground(value) && value.id === localAssetId);
    return candidate ? structuredClone(candidate) : null;
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

function sameLocalBackground(candidate, expected) {
  return isValidLocalBackground(candidate) && candidate.id === expected.id && candidate.dataUrl === expected.dataUrl;
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
