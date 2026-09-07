import assert from "node:assert/strict";
import test from "node:test";

import {
  STORAGE_KEYS,
  createStorageService,
  normalizeWebUrl,
  validateSyncPayload
} from "../storage-service.mjs";

class FakeStorageArea {
  constructor(initial = {}) {
    this.data = structuredClone(initial);
    this.calls = [];
    this.failGetError = null;
    this.failSet = null;
    this.failRemoveError = null;
    this.setAttempts = 0;
  }

  async get(keys = null) {
    this.calls.push({ method: "get", keys: structuredClone(keys) });
    if (this.failGetError) throw this.failGetError;
    if (keys === null) return structuredClone(this.data);

    const requested = typeof keys === "string" ? [keys] : keys;
    return Object.fromEntries(
      requested
        .filter((key) => Object.hasOwn(this.data, key))
        .map((key) => [key, structuredClone(this.data[key])])
    );
  }

  async set(items) {
    this.setAttempts += 1;
    this.calls.push({ method: "set", items: structuredClone(items) });
    if (this.failSet?.(structuredClone(items), this.setAttempts)) {
      throw new Error("Configured storage write failure");
    }
    Object.assign(this.data, structuredClone(items));
  }

  async remove(keys) {
    this.calls.push({ method: "remove", keys: structuredClone(keys) });
    if (this.failRemoveError) throw this.failRemoveError;
    for (const key of Array.isArray(keys) ? keys : [keys]) delete this.data[key];
  }
}

class FakeLockManager {
  constructor() {
    this.tail = Promise.resolve();
  }

  request(name, callback) {
    const operation = this.tail.then(() => callback({ name }));
    this.tail = operation.catch(() => undefined);
    return operation;
  }
}

function makeDefaultState() {
  return {
    selectedFolderId: "all",
    shortcutsEnabled: true,
    folders: [{ id: "root", name: "Избранное" }],
    links: [
      {
        id: "default-google",
        title: "Google",
        url: "https://www.google.com/",
        folderId: "root"
      }
    ],
    background: {
      type: "color",
      value: "#457b9d",
      overlay: 0,
      overlayColor: "#457b9d"
    }
  };
}

function makeChangedState(title = "Example") {
  const state = makeDefaultState();
  state.links.unshift({
    id: "example",
    title,
    url: "https://example.com/",
    folderId: "root"
  });
  return state;
}

function getActivePayloadJson(syncArea) {
  const manifest = syncArea.data[STORAGE_KEYS.manifest];
  return manifest.active.chunkKeys.map((key) => syncArea.data[key]).join("");
}

test("normalizes a host without a scheme to canonical HTTPS", () => {
  assert.equal(normalizeWebUrl(" example.com "), "https://example.com/");
  assert.equal(normalizeWebUrl("github.com"), "https://github.com/");
});

test("accepts only HTTP URLs with a hostname and no credentials", () => {
  assert.equal(normalizeWebUrl("http://example.com/path"), "http://example.com/path");
  assert.equal(normalizeWebUrl("javascript:alert(1)"), "");
  assert.equal(normalizeWebUrl("data:text/plain,hello"), "");
  assert.equal(normalizeWebUrl("file:///tmp/test"), "");
  assert.equal(normalizeWebUrl("https://user:secret@example.com"), "");
  assert.equal(normalizeWebUrl("https://"), "");
  assert.equal(normalizeWebUrl(`https://example.com/${"x".repeat(4096)}`), "");
});

test("loads defaults without writing when sync storage is empty", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const service = createStorageService({ syncArea, localArea, logger: null });
  const defaults = makeDefaultState();

  const result = await service.load(defaults);

  assert.equal(result.ok, true);
  assert.equal(result.source, "defaults");
  assert.deepEqual(result.state, defaults);
  assert.equal(syncArea.calls.some(({ method }) => method === "set"), false);
});

test("updates the latest stored state so stale tabs cannot remove a newly added site", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const lockManager = new FakeLockManager();
  const defaults = makeDefaultState();
  defaults.folders.push({ id: "work", name: "Work" });
  const firstTab = createStorageService({ syncArea, localArea, lockManager, logger: null });
  const staleTab = createStorageService({ syncArea, localArea, lockManager, logger: null });
  await Promise.all([firstTab.load(defaults), staleTab.load(defaults)]);

  const [added, selected] = await Promise.all([
    firstTab.update(defaults, (latest) => {
      latest.links.unshift({
        id: "new-in-first-tab",
        title: "New in first tab",
        url: "https://example.com/new/",
        folderId: "root"
      });
      return latest;
    }),
    staleTab.update(defaults, (latest) => {
      latest.selectedFolderId = "work";
      return latest;
    })
  ]);

  assert.equal(added.ok, true);
  assert.equal(selected.ok, true);
  assert.equal(selected.state.selectedFolderId, "work");
  assert.equal(selected.state.links.some(({ id }) => id === "new-in-first-tab"), true);

  const reloaded = await createStorageService({ syncArea, localArea, logger: null }).load(defaults);
  assert.equal(reloaded.state.selectedFolderId, "work");
  assert.equal(reloaded.state.links.some(({ id }) => id === "new-in-first-tab"), true);
});

test("does not write defaults when an update cannot read sync storage", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  syncArea.failGetError = new Error("sync unavailable");
  const service = createStorageService({ syncArea, localArea, logger: null });

  const result = await service.update(makeDefaultState(), (latest) => {
    latest.links = [];
    return latest;
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "read-failed");
  assert.equal(syncArea.calls.some(({ method }) => method === "set"), false);
});

test("defaults old sync payloads to enabled single-key shortcuts", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const service = createStorageService({ syncArea, localArea, logger: null });
  const legacyState = makeDefaultState();
  delete legacyState.shortcutsEnabled;
  await service.save(legacyState);

  const defaults = makeDefaultState();
  const reloaded = await createStorageService({ syncArea, localArea, logger: null }).load(defaults);

  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.state.shortcutsEnabled, true);
  assert.equal(Object.hasOwn(JSON.parse(getActivePayloadJson(syncArea)), "preferences"), false);
});

test("round-trips the optional single-key shortcut preference without changing schema version", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  defaults.shortcutsEnabled = true;
  const state = structuredClone(defaults);
  state.shortcutsEnabled = false;

  const service = createStorageService({ syncArea, localArea, logger: null });
  assert.equal((await service.save(state)).ok, true);

  const payload = JSON.parse(getActivePayloadJson(syncArea));
  assert.equal(payload.storageVersion, 1);
  assert.deepEqual(payload.preferences, { singleKeyShortcuts: false });

  const reloaded = await createStorageService({ syncArea, localArea, logger: null }).load(defaults);
  assert.equal(reloaded.state.shortcutsEnabled, false);
});

test("prefers the Promise-based Firefox browser storage namespace", async () => {
  const originalBrowser = Object.getOwnPropertyDescriptor(globalThis, "browser");
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const browserSync = new FakeStorageArea();
  const browserLocal = new FakeStorageArea();
  const chromeSync = new FakeStorageArea();
  const chromeLocal = new FakeStorageArea();

  Object.defineProperty(globalThis, "browser", {
    configurable: true,
    value: { storage: { sync: browserSync, local: browserLocal } }
  });
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: { storage: { sync: chromeSync, local: chromeLocal } }
  });

  try {
    const result = await createStorageService({ logger: null }).load(makeDefaultState());

    assert.equal(result.ok, true);
    assert.equal(browserSync.calls.some(({ method }) => method === "get"), true);
    assert.equal(browserLocal.calls.some(({ method }) => method === "get"), true);
    assert.equal(chromeSync.calls.length, 0);
    assert.equal(chromeLocal.calls.length, 0);
  } finally {
    restoreGlobal("browser", originalBrowser);
    restoreGlobal("chrome", originalChrome);
  }
});

test("commits chunks before the manifest and restores ordered state", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const service = createStorageService({ syncArea, localArea, logger: null });
  await service.load(defaults);

  const changedState = structuredClone(defaults);
  changedState.folders.push({ id: "work", name: "Работа" });
  changedState.links.unshift({
    id: "example",
    title: "Example",
    url: "https://example.com/",
    folderId: "work"
  });
  changedState.selectedFolderId = "work";

  const saveResult = await service.save(changedState);
  const manifest = syncArea.data[STORAGE_KEYS.manifest];
  const setKeys = syncArea.calls
    .filter(({ method }) => method === "set")
    .map(({ items }) => Object.keys(items)[0]);

  assert.equal(saveResult.ok, true);
  assert.equal(manifest.active.chunkKeys.length, 1);
  assert.equal(setKeys.at(-1), STORAGE_KEYS.manifest);
  assert.equal(setKeys[0], manifest.active.chunkKeys[0]);
  assert.equal(getActivePayloadJson(syncArea).includes('"favicon"'), false);
  assert.equal(getActivePayloadJson(syncArea).includes('/s2/favicons'), false);

  const reloaded = await createStorageService({ syncArea, localArea }).load(defaults);
  assert.equal(reloaded.source, "sync");
  assert.deepEqual(reloaded.state, changedState);
  assert.equal(reloaded.state.links.some((link) => Object.hasOwn(link, "favicon")), false);
});

test("splits a larger snapshot into multiple chunks and restores its order", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const service = createStorageService({ syncArea, localArea });
  await service.load(defaults);

  const changedState = structuredClone(defaults);
  changedState.links = Array.from({ length: 80 }, (_, index) => ({
    id: `site-${index}`,
    title: `Сайт ${index} ${"x".repeat(60)}`,
    url: `https://example.com/page/${index}`,
    folderId: "root"
  }));

  assert.equal((await service.save(changedState)).ok, true);
  const manifest = syncArea.data[STORAGE_KEYS.manifest];
  assert.ok(manifest.active.chunkKeys.length > 1);
  for (const key of manifest.active.chunkKeys) {
    const itemBytes = Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(syncArea.data[key]));
    assert.ok(itemBytes < 8192);
  }

  const reloaded = await createStorageService({ syncArea, localArea }).load(defaults);
  assert.deepEqual(
    reloaded.state.links.map(({ id }) => id),
    changedState.links.map(({ id }) => id)
  );
});

test("rejects a stored payload with an invalid URL", () => {
  assert.equal(
    validateSyncPayload({
      storageVersion: 1,
      sites: { bad: { title: "Bad", url: "javascript:alert(1)", folderId: "root" } },
      folders: { root: { name: "Избранное" } },
      layout: {
        siteOrder: ["bad"],
        folderOrder: ["root"],
        selectedFolderId: "all"
      },
      theme: {
        background: { type: "default" },
        overlay: 0,
        overlayColor: "#f4f6f3"
      }
    }),
    false
  );
});

test("loads the previous generation when the active generation is incomplete", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const service = createStorageService({ syncArea, localArea });
  await service.load(defaults);
  const previousState = makeChangedState("Previous");
  await service.save(previousState);
  await service.save(makeChangedState("Active"));

  const activeChunk = syncArea.data[STORAGE_KEYS.manifest].active.chunkKeys[0];
  delete syncArea.data[activeChunk];

  const result = await createStorageService({ syncArea, localArea }).load(defaults);
  assert.equal(result.source, "recovered");
  assert.deepEqual(result.state, previousState);
});

test("loads the backup manifest when the primary manifest is corrupted", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const service = createStorageService({ syncArea, localArea });
  await service.load(defaults);
  const previousState = makeChangedState("Previous");
  await service.save(previousState);
  await service.save(makeChangedState("Active"));

  syncArea.data[STORAGE_KEYS.manifest] = { broken: true };

  const result = await createStorageService({ syncArea, localArea }).load(defaults);
  assert.equal(result.source, "recovered");
  assert.deepEqual(result.state, previousState);
});

test("rejects chunk keys that do not belong to their generation", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const service = createStorageService({ syncArea, localArea });
  await service.load(defaults);
  await service.save(makeChangedState());

  const manifest = syncArea.data[STORAGE_KEYS.manifest];
  const originalKey = manifest.active.chunkKeys[0];
  const alienKey = `${STORAGE_KEYS.chunkPrefix}alien-generation:0`;
  syncArea.data[alienKey] = syncArea.data[originalKey];
  manifest.active.chunkKeys = [alienKey];

  const result = await createStorageService({ syncArea, localArea }).load(defaults);
  assert.equal(result.source, "defaults");
  assert.deepEqual(result.state, defaults);
});

test("keeps the committed manifest when a later chunk write fails", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const service = createStorageService({ syncArea, localArea, logger: null });
  await service.load(defaults);
  const committedState = makeChangedState("Committed");
  await service.save(committedState);
  const committedManifest = structuredClone(syncArea.data[STORAGE_KEYS.manifest]);

  let newChunkWrites = 0;
  syncArea.failSet = (items) => {
    const key = Object.keys(items)[0];
    if (!key.startsWith(STORAGE_KEYS.chunkPrefix)) return false;
    newChunkWrites += 1;
    return newChunkWrites === 2;
  };
  const largeState = makeDefaultState();
  largeState.links = Array.from({ length: 80 }, (_, index) => ({
    id: `partial-${index}`,
    title: `Partial ${index} ${"x".repeat(60)}`,
    url: `https://example.com/partial/${index}`,
    folderId: "root"
  }));

  assert.equal((await service.save(largeState)).ok, false);
  assert.deepEqual(syncArea.data[STORAGE_KEYS.manifest], committedManifest);
  syncArea.failSet = null;
  const reloaded = await createStorageService({ syncArea, localArea }).load(defaults);
  assert.deepEqual(reloaded.state, committedState);
});

test("keeps the old generation loadable when the final manifest write fails", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const service = createStorageService({ syncArea, localArea, logger: null });
  await service.load(defaults);
  const committedState = makeChangedState("Committed");
  await service.save(committedState);
  const committedManifest = structuredClone(syncArea.data[STORAGE_KEYS.manifest]);

  syncArea.failSet = (items) => Object.hasOwn(items, STORAGE_KEYS.manifest);
  assert.equal((await service.save(makeChangedState("Rejected"))).ok, false);
  assert.deepEqual(syncArea.data[STORAGE_KEYS.manifest], committedManifest);

  syncArea.failSet = null;
  const reloaded = await createStorageService({ syncArea, localArea }).load(defaults);
  assert.deepEqual(reloaded.state, committedState);
});

test("does not replace the primary manifest when the backup write fails", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const service = createStorageService({ syncArea, localArea, logger: null });
  await service.load(defaults);
  await service.save(makeChangedState("Committed"));
  const committedManifest = structuredClone(syncArea.data[STORAGE_KEYS.manifest]);

  syncArea.failSet = (items) => Object.hasOwn(items, STORAGE_KEYS.backupManifest);
  assert.equal((await service.save(makeChangedState("Rejected"))).ok, false);
  assert.deepEqual(syncArea.data[STORAGE_KEYS.manifest], committedManifest);
});

test("does not write fallback state after a sync read error", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  syncArea.failGetError = new Error("sync unavailable");
  const service = createStorageService({ syncArea, localArea, logger: null });

  const loadResult = await service.load(makeDefaultState());
  const saveResult = await service.save(makeChangedState());

  assert.equal(loadResult.source, "read-error");
  assert.equal(loadResult.writable, false);
  assert.equal(saveResult.ok, false);
  assert.equal(syncArea.calls.some(({ method }) => method === "set"), false);
});

test("deduplicates an unchanged snapshot", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const service = createStorageService({ syncArea, localArea });
  await service.load(defaults);
  const state = makeChangedState();
  await service.save(state);
  const setCount = syncArea.calls.filter(({ method }) => method === "set").length;

  const result = await service.save(structuredClone(state));

  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(syncArea.calls.filter(({ method }) => method === "set").length, setCount);
});

test("stores custom background bytes only in local storage", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const service = createStorageService({ syncArea, localArea });
  await service.load(defaults);
  const state = makeChangedState();
  state.background = {
    type: "image",
    value: "data:image/png;base64,AA==",
    overlay: 24,
    overlayColor: "#112233"
  };

  assert.equal((await service.save(state)).ok, true);
  const localMedia = localArea.data[STORAGE_KEYS.localBackground];
  assert.equal(localMedia.dataUrl, state.background.value);
  assert.equal(getActivePayloadJson(syncArea).includes("base64"), false);

  const reloaded = await createStorageService({ syncArea, localArea }).load(defaults);
  assert.equal(reloaded.state.background.type, "image");
  assert.equal(reloaded.state.background.value, state.background.value);
  assert.equal(reloaded.state.background.customAssetId, localMedia.id);
  assert.equal(reloaded.state.background.customAssetAvailable, true);
});

test("falls back when a synchronized custom background is absent locally", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const service = createStorageService({ syncArea, localArea });
  await service.load(defaults);
  const state = makeChangedState();
  state.background.value = "data:image/png;base64,AA==";
  await service.save(state);
  const localAssetId = localArea.data[STORAGE_KEYS.localBackground].id;
  delete localArea.data[STORAGE_KEYS.localBackground];

  const reloaded = await createStorageService({ syncArea, localArea }).load(defaults);

  assert.equal(reloaded.state.background.value, defaults.background.value);
  assert.equal(reloaded.state.background.customAssetId, localAssetId);
  assert.equal(reloaded.state.background.customAssetAvailable, false);
  assert.equal(reloaded.state.links[0].title, "Example");
});

test("preserves a missing custom background reference during an unrelated save", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const firstService = createStorageService({ syncArea, localArea });
  await firstService.load(defaults);
  const state = makeChangedState();
  state.background.value = "data:image/png;base64,AA==";
  await firstService.save(state);
  const localAssetId = localArea.data[STORAGE_KEYS.localBackground].id;
  delete localArea.data[STORAGE_KEYS.localBackground];

  const secondService = createStorageService({ syncArea, localArea });
  const loaded = await secondService.load(defaults);
  loaded.state.links[0].title = "Edited elsewhere";
  assert.equal((await secondService.save(loaded.state)).ok, true);

  const payload = JSON.parse(getActivePayloadJson(syncArea));
  assert.deepEqual(payload.theme.background, { type: "custom", localAssetId });
});

test("does not create a sync custom reference when local background storage fails", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const service = createStorageService({ syncArea, localArea, logger: null });
  await service.load(defaults);
  localArea.failSet = () => true;
  const state = makeChangedState();
  state.background.value = "data:image/png;base64,AA==";

  assert.equal((await service.save(state)).ok, false);
  assert.equal(Object.hasOwn(syncArea.data, STORAGE_KEYS.manifest), false);
});

test("cleans only generations older than the primary and backup manifests", async () => {
  const syncArea = new FakeStorageArea();
  const localArea = new FakeStorageArea();
  const defaults = makeDefaultState();
  const service = createStorageService({ syncArea, localArea });
  await service.load(defaults);

  await service.save(makeChangedState("One"));
  const firstChunks = structuredClone(syncArea.data[STORAGE_KEYS.manifest].active.chunkKeys);
  await service.save(makeChangedState("Two"));
  await service.save(makeChangedState("Three"));
  await service.save(makeChangedState("Four"));

  assert.equal(firstChunks.some((key) => Object.hasOwn(syncArea.data, key)), false);
  const primary = syncArea.data[STORAGE_KEYS.manifest];
  const backup = syncArea.data[STORAGE_KEYS.backupManifest];
  for (const descriptor of [primary.active, primary.previous, backup.active, backup.previous]) {
    if (!descriptor) continue;
    assert.equal(
      descriptor.chunkKeys.every((key) => Object.hasOwn(syncArea.data, key)),
      true
    );
  }
});

test("migrates v1.4 local state and extracts its custom background", async () => {
  const syncArea = new FakeStorageArea();
  const legacyState = makeChangedState("Migrated");
  legacyState.links[0].url = "example.com";
  legacyState.background = {
    type: "image",
    value: "data:image/png;base64,AA==",
    overlay: 15,
    overlayColor: "#334455"
  };
  const localArea = new FakeStorageArea({ [STORAGE_KEYS.legacyState]: legacyState });

  const result = await createStorageService({ syncArea, localArea }).load(makeDefaultState());

  assert.equal(result.source, "migrated");
  assert.equal(result.state.links[0].url, "https://example.com/");
  assert.equal(Object.hasOwn(result.state.links[0], "favicon"), false);
  assert.equal(result.state.background.value, legacyState.background.value);
  assert.ok(syncArea.data[STORAGE_KEYS.manifest]);
  assert.equal(Object.hasOwn(localArea.data, STORAGE_KEYS.legacyState), false);
  assert.equal(
    localArea.data[STORAGE_KEYS.localBackground].dataUrl,
    legacyState.background.value
  );
  assert.equal(getActivePayloadJson(syncArea).includes("base64"), false);
});

test("keeps legacy data when migration cannot commit", async () => {
  const syncArea = new FakeStorageArea();
  syncArea.failSet = () => true;
  const legacyState = makeChangedState("Legacy");
  const localArea = new FakeStorageArea({ [STORAGE_KEYS.legacyState]: legacyState });

  const result = await createStorageService({
    syncArea,
    localArea,
    logger: null
  }).load(makeDefaultState());

  assert.equal(result.source, "migration-error");
  assert.equal(result.state.links[0].title, "Legacy");
  assert.deepEqual(localArea.data[STORAGE_KEYS.legacyState], legacyState);
});

function restoreGlobal(name, descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    delete globalThis[name];
  }
}
