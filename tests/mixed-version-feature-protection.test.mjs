import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createStorageService, STORAGE_KEYS } from "../storage-service.mjs";
import { FEATURE_KEYS, readFeatureLayer } from "../feature-generation.mjs";
import { createStorageService as legacyService } from "./fixtures/published-v1.6/storage-service.mjs";
import { makeArea, makeState, corePayload, seedCore } from "./helpers/feature-storage-fixtures.mjs";
import { parseBackupText, serializeBackup, buildImportedState } from "../backup-service.mjs";
import { getVisibleFolderIds, normalizeFolderNavigation } from "../newtab-core.mjs";

const defaults = () => makeState({ emoji: null, showAllFolder: true });
const current = (syncArea, options = {}) => createStorageService({ syncArea, localArea: makeArea(), logger: null, ...options });
const legacy = syncArea => legacyService({ syncArea, localArea: makeArea(), logger: null });
const featureKeys = area => Object.fromEntries(Object.entries(area.data).filter(([key]) => key.startsWith("minimalNewTabFeature")));
const writes = area => area.calls.filter(call => call.method === "set");

test("legacy regression uses exact modules from both hash-verified published packages", async () => {
  const provenance = JSON.parse(await readFile(new URL("./fixtures/published-v1.6/provenance.json", import.meta.url)));
  for (const [name, hash] of Object.entries(provenance.files))
    assert.equal(createHash("sha256").update(await readFile(new URL("./fixtures/published-v1.6/" + name, import.meta.url))).digest("hex"), hash);
});

test("actual 1.6 rename/move/reorder accepts core changes without erasing protected emoji or hidden All", async () => {
  const area = makeArea();
  assert.equal((await current(area).save(makeState())).ok, true);
  const initialCore = area.data[STORAGE_KEYS.manifest].active;
  const protectedBefore = featureKeys(area);
  const old = legacy(area);
  assert.equal((await old.load(defaults())).ok, true);
  for (let i = 0; i < 5; i++) {
    const changed = await old.update(defaults(), state => {
      state.links.find(site => site.id === "site").title = "Legacy rename " + i;
      state.links.find(site => site.id === "site").folderId = "personal";
      state.links.reverse();
    });
    assert.equal(changed.ok, true);
  }
  const loaded = await current(area).load(defaults());
  const site = loaded.state.links.find(site => site.id === "site");
  assert.equal(site.title, "Legacy rename 4");
  assert.equal(site.folderId, "personal");
  assert.equal(site.emoji, "🗺️");
  assert.equal(loaded.state.showAllFolder, false);
  assert.equal(initialCore.chunkKeys.some(key => Object.hasOwn(area.data, key)), false);
  assert.deepEqual(featureKeys(area), protectedBefore);
});

test("explicit favicon and All shown remain reset after an old write", async () => {
  const area = makeArea(), service = current(area);
  await service.save(makeState());
  await service.update(defaults(), state => { delete state.links[0].emoji; state.showAllFolder = true; });
  await legacy(area).update(defaults(), state => { state.links[0].title = "Old rename"; });
  const loaded = await current(area).load(defaults());
  assert.equal(Object.hasOwn(loaded.state.links[0], "emoji"), false);
  assert.equal(loaded.state.showAllFolder, true);
  assert.equal(readFeatureLayer(area.data).payload.sites.site.emoji, null);
});

for (const changedUrl of ["https://example.com/?q=b#one", "https://example.com/?q=a#two", "https://new.example/"]) {
  test("old URL change cannot borrow the prior URL's emoji: " + changedUrl, async () => {
    const area = makeArea();
    await current(area).save(makeState());
    await legacy(area).update(defaults(), state => { state.links[0].url = changedUrl; });
    const loaded = await current(area).load(defaults());
    assert.equal(loaded.state.links[0].url, changedUrl);
    assert.equal(Object.hasOwn(loaded.state.links[0], "emoji"), false);
  });
}

test("deleted old-client site never resurrects; next successful new write prunes metadata", async () => {
  const area = makeArea();
  await current(area).save(makeState());
  await legacy(area).update(defaults(), state => { state.links = state.links.filter(site => site.id !== "site"); });
  const loaded = await current(area).load(defaults());
  assert.equal(loaded.state.links.some(site => site.id === "site"), false);
  assert.equal(Object.hasOwn(readFeatureLayer(area.data).payload.sites, "site"), true);
  await current(area).update(defaults(), state => { state.links[0].title = "New edit"; });
  assert.equal(Object.hasOwn(readFeatureLayer(area.data).payload.sites, "site"), false);
});

test("published defaults read causes no sets and no feature bootstrap", async () => {
  const area = makeArea();
  await legacy(area).save(defaults());
  area.calls.length = 0;
  const loaded = await current(area).load(defaults());
  assert.equal(loaded.ok, true);
  assert.equal(writes(area).length, 0);
  assert.deepEqual(featureKeys(area), {});
});

test("unchanged published defaults save is a no-op; first real edit creates even an empty protected layer", async () => {
  const area = makeArea();
  await legacy(area).save(defaults());
  const active = current(area), loaded = await active.load(defaults());
  area.calls.length = 0;
  assert.equal((await active.save(loaded.state)).changed, false);
  assert.equal(writes(area).length, 0);
  assert.equal((await active.update(defaults(), state => { state.links[0].title = "First real edit"; })).ok, true);
  const layer = readFeatureLayer(area.data);
  assert.equal(layer.status, "ready");
  assert.deepEqual(layer.payload, { featureVersion: 1, showAllFolder: true, sites: {} });
  const head = area.data[STORAGE_KEYS.manifest];
  const payload = JSON.parse(head.active.chunkKeys.map(key => area.data[key]).join(""));
  assert.deepEqual(payload.featureState, { version: 1, generationId: layer.descriptor.generationId });
});

test("unmarked current-test features bootstrap once without rewriting core", async () => {
  const area = makeArea();
  await seedCore(area, corePayload());
  const beforeCore = structuredClone(area.data);
  const loaded = await current(area).load(defaults());
  assert.equal(loaded.ok, true);
  assert.equal(loaded.state.links[0].emoji, "🗺️");
  assert.equal(readFeatureLayer(area.data).status, "ready");
  for (const [key, value] of Object.entries(beforeCore)) assert.deepEqual(area.data[key], value);
  assert.equal(writes(area).every(call => Object.keys(call.items).every(key => key.startsWith("minimalNewTabFeature"))), true);
  area.calls.length = 0;
  await current(area).load(defaults());
  assert.equal(writes(area).length, 0);
  await legacy(area).update(defaults(), state => { state.links[0].title = "After bootstrap"; });
  assert.equal((await current(area).load(defaults())).state.links[0].emoji, "🗺️");
});

test("normalized effective no-op after old serialization creates no writes or marker", async () => {
  const area = makeArea();
  await current(area).save(makeState());
  await legacy(area).update(defaults(), state => { state.links[0].title = "Rename"; });
  const service = current(area), loaded = await service.load(defaults());
  area.calls.length = 0;
  const result = await service.save(loaded.state);
  assert.equal(result.changed, false);
  assert.equal(writes(area).length, 0);
});

test("core-only selection/reorder/rename reuses the same feature descriptor without feature writes", async () => {
  const area = makeArea(), service = current(area);
  await service.save(makeState());
  const before = featureKeys(area);
  area.calls.length = 0;
  for (let i = 0; i < 4; i++) await service.update(defaults(), state => {
    state.selectedFolderId = i % 2 ? "work" : "personal"; state.links.reverse(); state.links[0].title = "Rename " + i;
  });
  assert.deepEqual(featureKeys(area), before);
  assert.equal(writes(area).some(call => Object.keys(call.items).some(key => key.startsWith("minimalNewTabFeature"))), false);
});

test("two loads share a single non-nested lock and bootstrap from a fresh reread", async () => {
  let rereads = 0;
  const area = makeArea({}, { beforeGet: (keys, area) => {
    if (++rereads === 2) {
      const descriptor = area.data[STORAGE_KEYS.manifest].active;
      const p = JSON.parse(area.data[descriptor.chunkKeys[0]]);
      p.sites.site.emoji = "🚀";
      const json = JSON.stringify(p); area.data[descriptor.chunkKeys[0]] = json; descriptor.byteLength = Buffer.byteLength(json);
    }
  } });
  await seedCore(area, corePayload());
  let tail = Promise.resolve(), running = 0;
  const lockManager = { request(name, callback) {
    const task = tail.then(async () => { assert.equal(running++, 0); try { return await callback(); } finally { running--; } });
    tail = task.catch(() => {}); return task;
  } };
  await Promise.all([current(area, { lockManager }).load(defaults()), current(area, { lockManager }).load(defaults())]);
  assert.equal(readFeatureLayer(area.data).payload.sites.site.emoji, "🚀");
  assert.equal(writes(area).filter(call => Object.hasOwn(call.items, FEATURE_KEYS.manifest)).length, 1);
});

for (const version of [1, 2]) {
  test("new JSON v" + version + " import is explicit even for identical protected ID/URL", async () => {
    const area = makeArea(), local = makeArea(), target = makeState();
    target.shortcutsEnabled = false;
    target.background = { type: "image", value: "data:image/png;base64,YWJjZA==", overlay: 13, overlayColor: "#141026" };
    const active = current(area, { localArea: local });
    await active.save(target);
    const localBefore = structuredClone(local.data);
    const document = JSON.parse(serializeBackup(makeState({ emoji: version === 2 ? "🚀" : null })));
    document.backupVersion = version;
    document.data.links = document.data.links.filter(site => site.id === "site");
    const parsed = parseBackupText(JSON.stringify(document));
    assert.equal(parsed.ok, true);
    assert.equal((await active.update(defaults(), latest => normalizeFolderNavigation({
      ...buildImportedState(latest, parsed.data), showAllFolder: latest.showAllFolder, shortcutsEnabled: latest.shortcutsEnabled
    }))).ok, true);
    await legacy(area).update(defaults(), state => { state.links[0].title = "Old edit after import"; });
    const after = (await current(area, { localArea: local }).load(defaults())).state;
    assert.equal(after.links.length, 1);
    assert.equal(after.links[0].emoji, version === 2 ? "🚀" : undefined);
    assert.equal(after.showAllFolder, false);
    assert.equal(after.shortcutsEnabled, false);
    assert.deepEqual(local.data, localBefore);
    assert.equal(after.background.value, target.background.value);
    assert.equal(JSON.stringify(document).includes("Feature"), false);
    assert.equal(JSON.stringify(document).includes("urlHash"), false);
  });
}

test("new v2 import with omitted emoji resets, while identical old replacement cannot express reset", async () => {
  const area = makeArea();
  await current(area).save(makeState());
  await legacy(area).save(defaults());
  assert.equal((await current(area).load(defaults())).state.links[0].emoji, "🗺️");
  const parsed = parseBackupText(serializeBackup(defaults()));
  await current(area).update(defaults(), latest => ({
    ...buildImportedState(latest, parsed.data), showAllFolder: latest.showAllFolder, shortcutsEnabled: latest.shortcutsEnabled
  }));
  await legacy(area).update(defaults(), state => { state.links[0].title = "After reset"; });
  assert.equal((await current(area).load(defaults())).state.links[0].emoji, undefined);
});

test("feature overlay preserves selected unfiled root before materialization and usable All after final folder deletion", async () => {
  const area = makeArea();
  await current(area).save(makeState({ selectedFolderId: "root" }));
  await legacy(area).update(defaults(), state => { state.selectedFolderId = "root"; });
  const protectedCore = area.data[STORAGE_KEYS.manifest];
  // Actual 1.6 canonicalizes root to all; restore an explicit valid root as a remote core-only selection.
  const payload = JSON.parse(area.data[protectedCore.active.chunkKeys[0]]);
  payload.layout.selectedFolderId = "root";
  const json = JSON.stringify(payload); area.data[protectedCore.active.chunkKeys[0]] = json;
  protectedCore.active.byteLength = Buffer.byteLength(json);
  const loaded = (await current(area).load(defaults())).state;
  assert.equal(loaded.selectedFolderId, "root");
  assert.deepEqual(getVisibleFolderIds(loaded), ["work", "personal", "root"]);
  await current(area).update(defaults(), state => {
    state.folders = state.folders.filter(folder => folder.id === "root");
    state.links.forEach(site => { site.folderId = "root"; });
    return normalizeFolderNavigation(state);
  });
  const after = (await current(area).load(defaults())).state;
  assert.equal(after.showAllFolder, true);
  assert.equal(after.selectedFolderId, "all");
  assert.equal(after.links.length, 2);
  assert.equal(after.links[0].emoji, "🗺️");
});
