import test from "node:test";
import assert from "node:assert/strict";
import { createStorageService, STORAGE_KEYS } from "../storage-service.mjs";
import { estimateSyncUsage, FEATURE_KEYS } from "../feature-generation.mjs";
import { createStorageService as releasedService } from "./fixtures/published-v1.6/storage-service.mjs";
import { makeArea, makeState } from "./helpers/feature-storage-fixtures.mjs";

const collection = count => ({ ...makeState({ emoji: "", showAllFolder: true }),
  links: Array.from({ length: count }, (_, i) => ({ id: `site-${i}`, title: `Example ${i}`,
    url: `https://example.com/${i}`, folderId: "work" })) });
const service = (syncArea, localArea) => createStorageService({ syncArea, localArea, logger: null });
function limitedArea(hooks = {}) {
  return makeArea({}, { ...hooks, async beforeSet(items, area) {
    const usage = estimateSyncUsage(area.data, items);
    if (usage.totalBytes > 102400 || usage.itemCount > 512 || usage.maxItemBytes > 8192) throw new Error("Browser sync quota");
    await hooks.beforeSet?.(items, area);
  } });
}
const core = area => {
  const head = area.data[STORAGE_KEYS.manifest].active;
  return JSON.parse(head.chunkKeys.map(key => area.data[key]).join(""));
};

test("failed staged writes remain recoverable after repeated restarts", async () => {
  let fail = false;
  const area = limitedArea({ beforeSet(items) {
    if (fail && Object.hasOwn(items, STORAGE_KEYS.manifest)) throw new Error("Transient head failure");
  } }), local = makeArea(), state = collection(80);
  assert.equal((await service(area, local).save(state)).ok, true);
  fail = true;
  for (let i = 0; i < 12; i++) {
    state.links[0].title = `Rejected ${i}`;
    assert.equal((await service(area, local).save(state)).ok, false);
    assert.equal((await service(area, local).load(state)).state.links[0].title, "Example 0");
  }
  fail = false;
  const renamed = await service(area, local).update(state, current => { current.links[0].title = "Recovered"; });
  assert.equal(renamed.ok, true);
  const deleted = await service(area, local).update(state, current => { current.links.pop(); });
  assert.equal(deleted.ok, true);
  assert.equal((await service(area, local).load(state)).state.links.length, 79);
  assert.ok(estimateSyncUsage(area.data, {}).totalBytes < 40000);
});

test("recovery preserves foreign staged core and feature chunks", async () => {
  const area = limitedArea(), local = makeArea();
  assert.equal((await service(area, local).save(collection(80))).ok, true);
  const foreign = {
    [STORAGE_KEYS.chunkPrefix + "another-device:0"]: "remote pending core",
    [FEATURE_KEYS.chunkPrefix + "another-device:0"]: "remote pending features"
  };
  Object.assign(area.data, foreign);
  assert.equal((await service(area, local).update(collection(80), current => { current.links[0].title = "Changed"; })).ok, true);
  for (const [key, value] of Object.entries(foreign)) assert.equal(area.data[key], value);
});

test("an accepted 300-site collection stays editable and deletable across restarts", async () => {
  const area = limitedArea(), local = makeArea(), state = collection(300);
  assert.equal((await service(area, local).save(state)).ok, true);
  for (let i = 0; i < 6; i++) {
    assert.equal((await service(area, local).update(state, current => { current.links[0].title = `Changed ${i}`; })).ok, true);
    assert.equal((await service(area, local).load(state)).state.links[0].title, `Changed ${i}`);
  }
  assert.equal((await service(area, local).update(state, current => { current.links.pop(); })).ok, true);
  assert.equal((await service(area, local).load(state)).state.links.length, 299);
});

test("a collection too large for a later edit is rejected before replacing valid data", async () => {
  const area = limitedArea(), local = makeArea(), initial = collection(2);
  initial.links[0].emoji = "🗺️";
  initial.background = { type: "image", value: "data:image/png;base64,YWJjZA==", overlay: 12, overlayColor: "#141026" };
  assert.equal((await service(area, local).save(initial)).ok, true);
  const before = structuredClone(area.data), wallpaper = structuredClone(local.data[STORAGE_KEYS.localBackground]);
  const rejected = await service(area, local).save(collection(500));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, "capacity-exceeded");
  assert.deepEqual(area.data, before);
  assert.deepEqual(local.data[STORAGE_KEYS.localBackground], wallpaper);
  assert.equal((await service(area, local).load(initial)).state.links[0].emoji, "🗺️");
});

test("a fresh oversized collection does not leave partially initialized data", async () => {
  const area = limitedArea(), local = makeArea();
  const result = await service(area, local).save(collection(500));
  assert.equal(result.ok, false);
  assert.equal(result.error, "capacity-exceeded");
  assert.deepEqual(area.data, {});
});

test("a large collection from the old writer can be safely reduced", async () => {
  const area = limitedArea(), local = makeArea(), state = collection(500);
  assert.equal((await releasedService({ syncArea: area, localArea: local, logger: null }).save(state)).ok, true);
  const reduced = await service(area, local).update(state, current => { current.links = current.links.slice(0, 300); });
  assert.equal(reduced.ok, true);
  assert.equal((await service(area, local).load(state)).state.links.length, 300);
  assert.equal((await service(area, local).update(state, current => { current.links.pop(); })).ok, true);
});

for (const phase of ["backup", "head", "readback", "remove"]) {
  test(`interrupted capacity compaction at ${phase} preserves the last confirmed collection`, async () => {
    let enabled = false, readFailure = false, triggered = false;
    const area = limitedArea({
      beforeSet(items) {
        if (!enabled) return;
        const compact = key => items[key]?.active && items[key].previous === null;
        if ((phase === "backup" && compact(STORAGE_KEYS.backupManifest)) ||
            (phase === "head" && compact(STORAGE_KEYS.manifest))) { triggered = true; throw new Error("Compaction interrupted"); }
      },
      afterSet(items) {
        if (enabled && phase === "readback" && items[STORAGE_KEYS.manifest]?.previous === null) { triggered = true; readFailure = true; }
      },
      beforeGet() { if (readFailure) throw new Error("Read unavailable"); },
      beforeRemove() { if (enabled && phase === "remove") { triggered = true; throw new Error("Removal unavailable"); } }
    }), local = makeArea(), state = collection(300);
    assert.equal((await service(area, local).save(state)).ok, true);
    state.links[0].title = "Last confirmed";
    assert.equal((await service(area, local).save(state)).ok, true);
    enabled = true;
    const failed = await service(area, local).update(state, current => { current.links[0].title = "Not confirmed"; });
    assert.equal(failed.ok, false);
    assert.equal(triggered, true);
    enabled = false; readFailure = false;
    assert.equal((await service(area, local).load(state)).state.links[0].title, "Last confirmed");
    assert.equal(core(area).sites["site-0"].title, "Last confirmed");
    assert.equal((await service(area, local).update(state, current => { current.links.pop(); })).ok, true);
  });
}

test("capacity compaction never removes the active snapshot before a replacement is verified", async () => {
  let capture = false;
  const snapshots = [];
  const area = limitedArea({ afterSet(_, area) { if (capture) snapshots.push(structuredClone(area.data)); },
    beforeRemove(keys, area) {
      if (!capture) return;
      const active = area.data[STORAGE_KEYS.manifest].active.chunkKeys;
      assert.equal(keys.some(key => active.includes(key)), false);
    }
  }), local = makeArea(), state = collection(300);
  assert.equal((await service(area, local).save(state)).ok, true);
  state.links[0].title = "Second";
  assert.equal((await service(area, local).save(state)).ok, true);
  capture = true;
  assert.equal((await service(area, local).update(state, current => { current.links[0].title = "Third"; })).ok, true);
  for (const snapshot of snapshots) {
    const loaded = await service(makeArea(snapshot), local).load(state);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.state.links.length, 300);
    assert.ok(["Second", "Third"].includes(loaded.state.links[0].title));
  }
});

test("unknown recovery metadata is preserved without publishing a new collection", async () => {
  const area = limitedArea(), local = makeArea(), state = collection(80);
  assert.equal((await service(area, local).save(state)).ok, true);
  const before = structuredClone(area.data);
  const future = { version: 2, chunkKeys: ["future-data"] };
  local.data[STORAGE_KEYS.pendingSyncWrites] = structuredClone(future);
  assert.equal((await service(area, local).update(state, current => { current.links[0].title = "Changed"; })).ok, false);
  assert.deepEqual(area.data, before);
  assert.deepEqual(local.data[STORAGE_KEYS.pendingSyncWrites], future);
});

test("a failed local recovery journal write stops before any sync staging", async () => {
  const area = limitedArea(), local = makeArea({}, { beforeSet() { throw new Error("Local write unavailable"); } });
  assert.equal((await service(area, local).save(collection(80))).ok, false);
  assert.deepEqual(area.data, {});
});

test("large protected emoji collections survive compaction of both layers", async () => {
  const area = limitedArea(), local = makeArea(), state = collection(180);
  state.showAllFolder = false;
  state.links.forEach(site => { site.emoji = "🗺️"; });
  assert.equal((await service(area, local).save(state)).ok, true);
  for (const emoji of ["🚀", "🎉", "🌿", "🗺️"]) {
    assert.equal((await service(area, local).update(state, current => { current.links[0].emoji = emoji; })).ok, true);
    const loaded = await service(area, local).load(state);
    assert.equal(loaded.state.links[0].emoji, emoji);
    assert.equal(loaded.state.links[179].emoji, "🗺️");
    assert.equal(loaded.state.showAllFolder, false);
  }
});

test("an unread recovery journal is not discarded by a later successful local read", async () => {
  let fail = false;
  const area = limitedArea(), local = makeArea({}, { beforeGet() {
    if (fail) { fail = false; throw new Error("Transient local read failure"); }
  } }), state = collection(80);
  assert.equal((await service(area, local).save(state)).ok, true);
  const pendingKey = STORAGE_KEYS.chunkPrefix + "previous-attempt:0";
  area.data[pendingKey] = "old staged bytes";
  local.data[STORAGE_KEYS.pendingSyncWrites] = { version: 1, chunkKeys: [pendingKey] };
  const before = structuredClone(local.data);
  fail = true;
  assert.equal((await service(area, local).update(state, current => { current.links[0].title = "Changed"; })).ok, false);
  assert.deepEqual(local.data, before);
  assert.equal(core(area).sites["site-0"].title, "Example 0");
});
