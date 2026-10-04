import test from "node:test";
import assert from "node:assert/strict";
import { createStorageService, STORAGE_KEYS } from "../storage-service.mjs";
import { FEATURE_KEYS, readFeatureLayer, prepareFeatureGeneration } from "../feature-generation.mjs";
import { createStorageService as legacyService } from "./fixtures/published-v1.6/storage-service.mjs";
import { makeArea, makeState, corePayload, seedCore } from "./helpers/feature-storage-fixtures.mjs";

const defaults = () => makeState({ emoji: null, showAllFolder: true });
const service = (area, localArea = makeArea()) => createStorageService({ syncArea: area, localArea, logger: null });
const sets = area => area.calls.filter(call => call.method === "set");
async function protectedArea(hooks = {}) {
  const area = makeArea({}, hooks), local = makeArea();
  assert.equal((await service(area, local).save(makeState())).ok, true);
  area.calls.length = 0;
  return { area, local };
}
async function replaceCore(area, mutate) {
  const manifest = area.data[STORAGE_KEYS.manifest];
  const payload = JSON.parse(manifest.active.chunkKeys.map(key => area.data[key]).join(""));
  mutate(payload);
  const json = JSON.stringify(payload);
  assert.equal(manifest.active.chunkCount, 1);
  area.data[manifest.active.chunkKeys[0]] = json;
  manifest.active.byteLength = Buffer.byteLength(json);
}

for (const phase of ["core-chunk", "feature-chunk", "backup", "heads"]) {
  test("failed " + phase + " keeps prior active data and performs no unsafe cleanup", async () => {
    let enabled = false;
    const { area, local } = await protectedArea({ beforeSet: items => {
      const keys = Object.keys(items);
      if (!enabled) return;
      const match = phase === "core-chunk" ? keys.some(key => key.startsWith(STORAGE_KEYS.chunkPrefix)) :
        phase === "feature-chunk" ? keys.some(key => key.startsWith(FEATURE_KEYS.chunkPrefix)) :
        phase === "backup" ? Object.hasOwn(items, STORAGE_KEYS.backupManifest) : Object.hasOwn(items, STORAGE_KEYS.manifest);
      if (match) throw new Error("write rejected at " + phase);
    } });
    const heads = [structuredClone(area.data[STORAGE_KEYS.manifest]), structuredClone(area.data[FEATURE_KEYS.manifest])];
    const beforeLocal = structuredClone(local.data);
    area.data["minimalNewTabFeatureChunk:foreign-pending:0"] = "unpublished";
    enabled = true;
    const changed = makeState({ emoji: "🚀" }); changed.links[0].title = "Changed";
    const result = await service(area, local).save(changed);
    assert.equal(result.ok, false);
    assert.equal(result.error, "write-failed");
    assert.deepEqual(area.data[STORAGE_KEYS.manifest], heads[0]);
    assert.deepEqual(area.data[FEATURE_KEYS.manifest], heads[1]);
    assert.equal(area.calls.some(call => call.method === "remove"), false);
    enabled = false;
    const loaded = await service(area, local).load(defaults());
    assert.equal(loaded.state.links[0].title, "Example");
    assert.equal(loaded.state.links[0].emoji, "🗺️");
    assert.equal(area.data["minimalNewTabFeatureChunk:foreign-pending:0"], "unpublished");
    assert.deepEqual(local.data, beforeLocal);
  });
}

for (const partial of ["core-only", "all-heads"]) {
  test("partially applied " + partial + " commit rejection is never rolled back or reported successful", async () => {
    let reject = false;
    const { area } = await protectedArea({ beforeSet: (items, area) => {
      if (!reject || !Object.hasOwn(items, STORAGE_KEYS.manifest)) return;
      const apply = partial === "core-only" ? { [STORAGE_KEYS.manifest]: items[STORAGE_KEYS.manifest] } : items;
      Object.assign(area.data, structuredClone(apply));
      throw new Error("applied but rejected");
    } });
    reject = true;
    const result = await service(area).save(makeState({ emoji: null, showAllFolder: true }));
    assert.equal(result.ok, false);
    assert.equal(result.error, "write-failed");
    assert.equal(area.calls.some(call => call.method === "remove"), false);
    reject = false;
    const loaded = await service(area).load(defaults());
    assert.equal(loaded.state.links.length, 2);
    assert.equal(Object.hasOwn(loaded.state.links[0], "emoji"), false);
    assert.equal(loaded.state.showAllFolder, true);
    assert.equal(loaded.writable, true);
    const retry = makeState({ emoji: "🎉", showAllFolder: true });
    assert.equal((await service(area).save(retry)).ok, true);
    assert.equal((await service(area).load(defaults())).state.links[0].emoji, "🎉");
  });
}

test("readback failure returns failure without cleanup and next fresh read recovers committed intent", async () => {
  let failRead = false, enabled = false;
  const { area } = await protectedArea({
    afterSet: items => { if (enabled && Object.hasOwn(items, STORAGE_KEYS.manifest)) failRead = true; },
    beforeGet: () => { if (failRead) throw new Error("readback unavailable"); }
  });
  enabled = true;
  const result = await service(area).save(makeState({ emoji: "🚀" }));
  assert.equal(result.ok, false);
  assert.equal(area.calls.some(call => call.method === "remove"), false);
  failRead = false;
  assert.equal((await service(area).load(defaults())).state.links[0].emoji, "🚀");
});

test("confirmed publication remains successful when cleanup removal fails", async () => {
  let failRemove = false;
  const { area } = await protectedArea({ beforeRemove: () => { if (failRemove) throw new Error("remove failed"); } });
  failRemove = true;
  for (const emoji of ["🚀", "🎉", "💼"]) assert.equal((await service(area).save(makeState({ emoji }))).ok, true);
  assert.equal((await service(area).load(defaults())).state.links[0].emoji, "💼");
});

test("restarting after each local publication phase always keeps a usable core and whole feature intent", async () => {
  let record = false;
  const snapshots = [];
  const { area } = await protectedArea({ afterSet: (items, area) => {
    if (record) snapshots.push({ keys: Object.keys(items), stored: structuredClone(area.data) });
  } });
  record = true;
  assert.equal((await service(area).save(makeState({ emoji: null, showAllFolder: true }))).ok, true);
  assert.equal(snapshots.some(item => item.keys.includes(STORAGE_KEYS.manifest) && item.keys.includes(FEATURE_KEYS.manifest)), true);
  for (const item of snapshots) {
    const loaded = await service(makeArea(item.stored)).load(defaults());
    assert.equal(loaded.state.links.length, 2);
    assert.equal(loaded.writable, true);
    if (item.keys.includes(STORAGE_KEYS.manifest)) {
      assert.equal(loaded.state.showAllFolder, true);
      assert.equal(Object.hasOwn(loaded.state.links[0], "emoji"), false);
    } else {
      assert.equal(loaded.state.showAllFolder, false);
      assert.equal(loaded.state.links[0].emoji, "🗺️");
    }
  }
});

test("cleanup retires proven prior generations but never foreign staged chunks", async () => {
  const { area } = await protectedArea();
  const original = readFeatureLayer(area.data).descriptor;
  area.data["minimalNewTabFeatureChunk:other-operation:0"] = "foreign prepared data";
  for (const emoji of ["🚀", "🎉", "💼"]) await service(area).save(makeState({ emoji }));
  assert.equal(original.chunkKeys.some(key => Object.hasOwn(area.data, key)), false);
  assert.equal(area.data["minimalNewTabFeatureChunk:other-operation:0"], "foreign prepared data");
  const current = area.data[FEATURE_KEYS.manifest], backup = area.data[FEATURE_KEYS.backupManifest];
  assert.deepEqual(backup.active, current.previous);
  assert.equal(backup.previous, null);
});

for (const damage of ["future-manifest", "future-payload", "future-marker", "malformed-marker", "unreadable-layer"]) {
  test(damage + " leaves valid sites accessible but rejects transform/write", async () => {
    const { area } = await protectedArea();
    if (damage === "future-manifest") area.data[FEATURE_KEYS.manifest].featureVersion = 2;
    if (damage === "future-payload") {
      const d = area.data[FEATURE_KEYS.manifest].active;
      const p = JSON.parse(area.data[d.chunkKeys[0]]); p.featureVersion = 2;
      area.data[d.chunkKeys[0]] = JSON.stringify(p); d.byteLength = Buffer.byteLength(area.data[d.chunkKeys[0]]);
    }
    if (damage === "future-marker") await replaceCore(area, p => { p.featureState.version = 2; });
    if (damage === "malformed-marker") await replaceCore(area, p => { p.featureState = null; });
    if (damage === "unreadable-layer") {
      await legacyService({ syncArea: area, localArea: makeArea(), logger: null }).update(defaults(), s => { s.links[0].title = "Old core"; });
      delete area.data[area.data[FEATURE_KEYS.manifest].active.chunkKeys[0]];
    }
    const current = service(area), loaded = await current.load(defaults());
    assert.equal(loaded.state.links.length, 2);
    assert.equal(loaded.state.links[0].id, "site");
    assert.equal(loaded.writable, false);
    area.calls.length = 0;
    let transformed = false;
    const result = await current.update(defaults(), () => { transformed = true; });
    assert.equal(result.error, "storage-unavailable");
    assert.equal(transformed, false);
    assert.equal(sets(area).length, 0);
    assert.equal((await current.save(defaults())).ok, false);
  });
}

test("corrupt active layer uses only the complete previous snapshot under an unmarked old writer", async () => {
  const { area } = await protectedArea();
  await service(area).save(makeState({ emoji: null, showAllFolder: true }));
  await legacyService({ syncArea: area, localArea: makeArea(), logger: null }).update(defaults(), state => { state.links[0].title = "Old"; });
  delete area.data[area.data[FEATURE_KEYS.manifest].active.chunkKeys[0]];
  const result = await service(area).load(defaults());
  assert.equal(result.state.links[0].emoji, "🗺️");
  assert.equal(result.state.showAllFolder, false);
  assert.equal(result.state.links[0].title, "Old");
  assert.equal(result.writable, true);
});

test("core-first and feature-first delivery converge, while marked reset ignores stale heads", async () => {
  const { area } = await protectedArea();
  const before = structuredClone(area.data);
  await service(area).save(makeState({ emoji: null, showAllFolder: true }));
  const after = structuredClone(area.data);
  const coreFirst = { ...after, ...Object.fromEntries(Object.entries(before).filter(([key]) => key.startsWith("minimalNewTabFeature"))) };
  const featureFirst = { ...before, ...Object.fromEntries(Object.entries(after).filter(([key]) => key.startsWith("minimalNewTabFeature"))) };
  const reset = await service(makeArea(coreFirst)).load(defaults());
  assert.equal(reset.state.showAllFolder, true);
  assert.equal(Object.hasOwn(reset.state.links[0], "emoji"), false);
  const old = await service(makeArea(featureFirst)).load(defaults());
  assert.equal(old.state.links[0].emoji, "🗺️");
  assert.equal(old.state.showAllFolder, false);
  const converged = await service(makeArea(after)).load(defaults());
  assert.equal(converged.state.showAllFolder, true);
  assert.equal(Object.hasOwn(converged.state.links[0], "emoji"), false);
});

test("failed bootstrap keeps core inline intact and a later attempt can retry", async () => {
  let fail = true;
  const area = makeArea({}, { beforeSet: items => { if (fail && Object.keys(items).some(k => k.startsWith(FEATURE_KEYS.chunkPrefix))) throw new Error("bootstrap rejected"); } });
  await seedCore(area, corePayload());
  const coreBefore = structuredClone(area.data);
  const current = service(area), failed = await current.load(defaults());
  assert.equal(failed.ok, false);
  assert.equal(failed.state.links[0].emoji, "🗺️");
  for (const [key, value] of Object.entries(coreBefore)) assert.deepEqual(area.data[key], value);
  fail = false;
  assert.equal((await current.load(defaults())).ok, true);
  assert.equal(readFeatureLayer(area.data).status, "ready");
});

test("bootstrap head rejection can retry its own staged chunks without treating foreign keys as absent", async () => {
  let fail = true;
  const area = makeArea({}, { beforeSet: items => { if (fail && Object.hasOwn(items, FEATURE_KEYS.manifest)) throw new Error("head rejected"); } });
  await seedCore(area, corePayload());
  const current = service(area);
  assert.equal((await current.load(defaults())).ok, false);
  fail = false;
  const retry = await current.load(defaults());
  assert.equal(retry.ok, true);
  assert.equal(retry.writable, true);
  assert.equal(readFeatureLayer(area.data).status, "ready");
  const foreign = makeArea({ "minimalNewTabFeatureChunk:foreign:0": "unknown" });
  await seedCore(foreign, corePayload());
  const blocked = await service(foreign).load(defaults());
  assert.equal(blocked.writable, false);
  assert.equal(sets(foreign).length, 0);
});

for (const broken of ["missing-head", "missing-chunk", "different-head"]) {
  test("marked reset stays reset after " + broken + " instead of restoring older choices", async () => {
    const { area } = await protectedArea();
    const oldHead = structuredClone(area.data[FEATURE_KEYS.manifest]);
    await service(area).save(makeState({ emoji: null, showAllFolder: true }));
    if (broken === "missing-head") delete area.data[FEATURE_KEYS.manifest];
    if (broken === "missing-chunk") delete area.data[area.data[FEATURE_KEYS.manifest].active.chunkKeys[0]];
    if (broken === "different-head") area.data[FEATURE_KEYS.manifest] = oldHead;
    const loaded = await service(area).load(defaults());
    assert.equal(loaded.writable, true);
    assert.equal(loaded.state.showAllFolder, true);
    assert.equal(Object.hasOwn(loaded.state.links[0], "emoji"), false);
    assert.equal(loaded.state.links[0].title, "Example");
  });
}

test("failed writes with an unchanged existing local image never alter its bytes", async () => {
  let fail = false;
  const area = makeArea({}, { beforeSet: () => { if (fail) throw new Error("no sync"); } }), local = makeArea();
  const state = makeState();
  state.background = { type: "image", value: "data:image/png;base64,YWJjZA==", overlay: 0.3, overlayColor: "#141026" };
  assert.equal((await service(area, local).save(state)).ok, true);
  const before = structuredClone(local.data);
  fail = true;
  state.links[0].emoji = "🚀";
  assert.equal((await service(area, local).save(state)).ok, false);
  assert.deepEqual(local.data, before);
});

for (const limit of ["items", "total-peak", "escaped-item"]) {
  test("quota " + limit + " rejects before staging without deleting a valid generation", async () => {
    const { area } = await protectedArea();
    if (limit === "items") {
      for (let i = Object.keys(area.data).length; i < 512; i++) area.data["other-" + i] = 0;
    } else if (limit === "total-peak") {
      for (let i = 0; i < 12; i++) area.data["other-" + i] = "x".repeat(8000);
      area.data["remainder"] = "x".repeat(4000);
    } else {
      area.data["other"] = "\"".repeat(4096);
    }
    const before = structuredClone(area.data);
    const result = await service(area).save(makeState({ emoji: "🚀" }));
    assert.equal(result.ok, false);
    assert.equal(sets(area).length, 0);
    assert.deepEqual(area.data, before);
  });
}

test("oversized metadata refuses writes rather than dropping any selected emoji", async () => {
  const area = makeArea(), state = makeState();
  state.links = Array.from({ length: 240 }, (_, i) => ({ id: "site-" + i + "-" + "x".repeat(95), title: "Site", url: "https://example.com/", folderId: "work", emoji: "🧑🏽‍💻" }));
  const result = await service(area).save(state);
  assert.equal(result.ok, false);
  assert.equal(sets(area).length, 0);
});

test("twenty ordinary selection/reorder/rename operations add no feature writes", async () => {
  const { area } = await protectedArea(), current = service(area);
  const head = structuredClone(area.data[FEATURE_KEYS.manifest]);
  area.calls.length = 0;
  for (let i = 0; i < 20; i++) assert.equal((await current.update(defaults(), state => {
    state.selectedFolderId = i % 2 ? "personal" : "work"; state.links.reverse(); state.links[0].title = "Title " + i;
  })).ok, true);
  assert.deepEqual(area.data[FEATURE_KEYS.manifest], head);
  assert.equal(sets(area).some(call => Object.keys(call.items).some(key => key.startsWith("minimalNewTabFeature"))), false);
});

test("SHA-256 failure never publishes either head or silently falls back", async () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { subtle: { digest: async () => { throw new Error("digest unavailable"); } } } });
  try {
    const area = makeArea();
    const result = await service(area).save(makeState());
    assert.equal(result.ok, false);
    assert.equal(sets(area).length, 0);
  } finally { Object.defineProperty(globalThis, "crypto", { configurable: true, value: original }); }
});

test("a rejected mutation lock still exposes the saved core read-only instead of displaying defaults", async () => {
  const { area } = await protectedArea();
  const current = createStorageService({ syncArea: area, localArea: makeArea(), logger: null,
    lockManager: { request: async () => { throw new Error("lock unavailable"); } } });
  const loaded = await current.load({ ...defaults(), links: [] });
  assert.equal(loaded.state.links[0].title, "Example");
  assert.equal(loaded.state.links[0].emoji, "🗺️");
  assert.equal(loaded.writable, false);
  assert.equal(sets(area).length, 0);
  assert.equal((await current.save(defaults())).ok, false);
});

for (const format of ["unmarked-inline", "local-legacy"]) {
  test("lock failure reads " + format + " without bootstrapping or migrating it", async () => {
    const area = makeArea();
    if (format === "unmarked-inline") await seedCore(area, corePayload(makeState()));
    const local = makeArea(format === "local-legacy" ? { [STORAGE_KEYS.legacyState]: makeState() } : {});
    const beforeSync = structuredClone(area.data), beforeLocal = structuredClone(local.data);
    const current = createStorageService({ syncArea: area, localArea: local, logger: null,
      lockManager: { request: async () => { throw new Error("lock unavailable"); } } });
    const loaded = await current.load({ ...defaults(), links: [] });
    assert.equal(loaded.state.links[0].title, "Example");
    assert.equal(loaded.writable, false);
    assert.equal(loaded.error, "lock-failed");
    assert.equal(sets(area).length, 0);
    assert.equal(sets(local).length, 0);
    assert.deepEqual(area.data, beforeSync);
    assert.deepEqual(local.data, beforeLocal);
  });
}
