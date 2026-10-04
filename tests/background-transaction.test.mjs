import test from "node:test";
import assert from "node:assert/strict";
import { createStorageService, STORAGE_KEYS } from "../storage-service.mjs";
import { createStorageService as legacyService } from "./fixtures/published-v1.6/storage-service.mjs";
import { makeArea, makeState } from "./helpers/feature-storage-fixtures.mjs";

const IMAGE_A = "data:image/png;base64,AA==";
const IMAGE_B = "data:image/png;base64,AQ==";
const defaults = () => makeState({ emoji: null, showAllFolder: true });
const service = (syncArea, localArea) => createStorageService({ syncArea, localArea, logger: null });
const imageState = (value) => ({ ...makeState(), background: {
  type: "image", value, overlay: 24, overlayColor: "#112233"
} });

async function seed(syncHooks = {}, localHooks = {}) {
  const sync = makeArea({}, syncHooks), local = makeArea({}, localHooks);
  const current = service(sync, local);
  assert.equal((await current.save(imageState(IMAGE_A))).ok, true);
  const previous = structuredClone(local.data[STORAGE_KEYS.localBackground]);
  assert.equal(previous.dataUrl, IMAGE_A);
  sync.calls.length = 0; local.calls.length = 0;
  return { sync, local, current, previous };
}

for (const phase of ["chunk", "backup", "head"]) {
  test(`rejected replacement ${phase} retains the previous image across a fresh load`, async () => {
    let reject = false;
    const { sync, local, current, previous } = await seed({ beforeSet: items => {
      const matches = phase === "chunk" ? Object.keys(items).some(key => key.startsWith(STORAGE_KEYS.chunkPrefix)) :
        Object.hasOwn(items, phase === "backup" ? STORAGE_KEYS.backupManifest : STORAGE_KEYS.manifest);
      if (reject && matches) throw new Error("Injected sync rejection");
    } });
    reject = true;
    assert.equal((await current.save(imageState(IMAGE_B))).ok, false);
    assert.deepEqual(local.data[STORAGE_KEYS.localBackground], previous);
    reject = false;
    const loaded = await service(sync, local).load(defaults());
    assert.equal(loaded.state.background.value, IMAGE_A);
    assert.equal(loaded.state.background.customAssetAvailable, true);
    assert.equal(loaded.state.links[0].emoji, "🗺️");
    assert.equal(loaded.state.showAllFolder, false);
  });
}

test("a partially applied local image rejection does not overwrite the previous image", async () => {
  let reject = false;
  const { sync, local, current, previous } = await seed({}, { afterSet: () => {
    if (reject) throw new Error("Local write applied but rejected");
  } });
  const head = structuredClone(sync.data[STORAGE_KEYS.manifest]);
  reject = true;
  assert.equal((await current.save(imageState(IMAGE_B))).ok, false);
  assert.deepEqual(local.data[STORAGE_KEYS.localBackground], previous);
  assert.deepEqual(sync.data[STORAGE_KEYS.manifest], head);
  reject = false;
  assert.equal((await service(sync, local).load(defaults())).state.background.value, IMAGE_A);
});

test("local readback must confirm the staged bytes before publishing a custom reference", async () => {
  let hideNewImage = false;
  const { sync, local, current, previous } = await seed({}, { afterGet: (_keys, _area, result) => {
    if (!hideNewImage) return;
    for (const [key, value] of Object.entries(result)) {
      if (value?.dataUrl === IMAGE_B) delete result[key];
    }
  } });
  const head = structuredClone(sync.data[STORAGE_KEYS.manifest]);
  hideNewImage = true;
  assert.equal((await current.save(imageState(IMAGE_B))).ok, false);
  assert.deepEqual(sync.data[STORAGE_KEYS.manifest], head);
  assert.deepEqual(local.data[STORAGE_KEYS.localBackground], previous);
  hideNewImage = false;
  assert.equal((await service(sync, local).load(defaults())).state.background.value, IMAGE_A);
});

test("a partially applied sync head rejection retains both old and referenced new bytes", async () => {
  let reject = false;
  const { sync, local, current, previous } = await seed({ beforeSet: (items, area) => {
    if (!reject || !Object.hasOwn(items, STORAGE_KEYS.manifest)) return;
    Object.assign(area.data, structuredClone(items));
    throw new Error("Head applied but rejected");
  } });
  reject = true;
  const result = await current.save(imageState(IMAGE_B));
  assert.equal(result.ok, false);
  assert.equal(result.error, "write-failed");
  assert.deepEqual(local.data[STORAGE_KEYS.localBackground], previous);
  assert.equal(Object.values(local.data).some(value => value?.dataUrl === IMAGE_B), true);
  reject = false;
  const loaded = await service(sync, local).load(defaults());
  assert.equal(loaded.state.background.value, IMAGE_B);
  assert.equal(loaded.state.background.customAssetAvailable, true);
});

test("sync readback failure keeps the previous image and a readable committed candidate", async () => {
  let enabled = false, failRead = false;
  const { sync, local, current, previous } = await seed({
    afterSet: items => { if (enabled && Object.hasOwn(items, STORAGE_KEYS.manifest)) failRead = true; },
    beforeGet: () => { if (failRead) throw new Error("Sync readback unavailable"); }
  });
  enabled = true;
  assert.equal((await current.save(imageState(IMAGE_B))).ok, false);
  assert.deepEqual(local.data[STORAGE_KEYS.localBackground], previous);
  enabled = false; failRead = false;
  assert.equal((await service(sync, local).load(defaults())).state.background.value, IMAGE_B);
});

test("invalid application state cannot replace local wallpaper before validation", async () => {
  const { sync, local, current, previous } = await seed();
  const changed = imageState(IMAGE_B);
  changed.links[0].url = "javascript:alert(1)";
  assert.equal((await current.save(changed)).ok, false);
  assert.deepEqual(local.data[STORAGE_KEYS.localBackground], previous);
  assert.equal(local.calls.some(call => call.method === "set"), false);
  assert.equal((await service(sync, local).load(defaults())).state.background.value, IMAGE_A);
});

test("sync quota preflight failure leaves the previous wallpaper untouched", async () => {
  const { sync, local, current, previous } = await seed();
  for (let index = 0; index < 512; index++) sync.data[`unrelated-${index}`] = "preserve";
  assert.equal((await current.save(imageState(IMAGE_B))).ok, false);
  assert.deepEqual(local.data[STORAGE_KEYS.localBackground], previous);
  assert.equal(local.calls.some(call => call.method === "set"), false);
  assert.equal((await service(sync, local).load(defaults())).state.background.value, IMAGE_A);
});

test("every write-boundary snapshot reloads the image referenced by its committed core", async () => {
  let record = false;
  const snapshots = [];
  let sync, local, previous;
  const capture = () => {
    if (record) snapshots.push({ sync: structuredClone(sync.data), local: structuredClone(local.data) });
  };
  ({ sync, local, previous } = await seed({ afterSet: capture }, { afterSet: capture }));
  record = true;
  assert.equal((await service(sync, local).save(imageState(IMAGE_B))).ok, true);
  assert.ok(snapshots.length >= 4);
  for (const snapshot of snapshots) {
    const head = snapshot.sync[STORAGE_KEYS.manifest].active;
    const core = JSON.parse(head.chunkKeys.map(key => snapshot.sync[key]).join(""));
    const expected = core.theme.background.localAssetId === previous.id
      ? IMAGE_A : IMAGE_B;
    const loaded = await service(makeArea(snapshot.sync), makeArea(snapshot.local)).load(defaults());
    assert.equal(loaded.state.background.value, expected);
    assert.equal(loaded.state.background.customAssetAvailable, true);
  }
});

test("a post-commit legacy-cache write failure cannot discard the committed candidate", async () => {
  let failPromotion = false;
  const { sync, local, current, previous } = await seed({}, { beforeSet: items => {
    if (failPromotion && Object.hasOwn(items, STORAGE_KEYS.localBackground)) throw new Error("Cache promotion rejected");
  } });
  failPromotion = true;
  assert.equal((await current.save(imageState(IMAGE_B))).ok, true);
  assert.deepEqual(local.data[STORAGE_KEYS.localBackground], previous);
  const loaded = await service(sync, local).load(defaults());
  assert.equal(loaded.state.background.value, IMAGE_B);
  assert.equal(loaded.state.background.customAssetAvailable, true);
});

test("a new candidate cannot overwrite the only available committed image before its promotion", async () => {
  let failPromotion = false;
  const { sync, local, current } = await seed({}, { beforeSet: items => {
    if (failPromotion && Object.hasOwn(items, STORAGE_KEYS.localBackground)) throw new Error("Promotion unavailable");
  } });
  failPromotion = true;
  assert.equal((await current.save(imageState(IMAGE_B))).ok, true);
  const currentHead = structuredClone(sync.data[STORAGE_KEYS.manifest]);
  const fresh = service(sync, local);
  assert.equal((await fresh.save(imageState("data:image/png;base64,Ag=="))).ok, false);
  assert.deepEqual(sync.data[STORAGE_KEYS.manifest], currentHead);
  assert.equal((await service(sync, local).load(defaults())).state.background.value, IMAGE_B);
  failPromotion = false;
  assert.equal((await fresh.save(imageState("data:image/png;base64,Ag=="))).ok, true);
  assert.equal((await service(sync, local).load(defaults())).state.background.value, "data:image/png;base64,Ag==");
});

for (const failPreservation of [false, true]) {
  test(`a transient image read failure preserves the committed pending image when ${failPreservation ? "promotion" : "sync"} rejects the next replacement`, async () => {
    let failPromotion = false, failNextRead = false, rejectSync = false, readFailures = 0;
    const { sync, local, current } = await seed({ beforeSet: () => {
      if (rejectSync) throw new Error("Next sync publication rejected");
    } }, {
      beforeGet: keys => {
        if (failNextRead && Array.isArray(keys) && keys.includes(STORAGE_KEYS.pendingBackground)) {
          failNextRead = false;
          readFailures++;
          throw new Error("One-shot local materialization read failure");
        }
      },
      beforeSet: items => {
        if (failPromotion && Object.hasOwn(items, STORAGE_KEYS.localBackground)) throw new Error("Promotion unavailable");
      }
    });
    failPromotion = true;
    assert.equal((await current.save(imageState(IMAGE_B))).ok, true);
    assert.equal(local.data[STORAGE_KEYS.pendingBackground].dataUrl, IMAGE_B);
    const head = structuredClone(sync.data[STORAGE_KEYS.manifest]);
    failPromotion = failPreservation;
    failNextRead = true;
    rejectSync = true;
    assert.equal((await service(sync, local).save(imageState("data:image/png;base64,Ag=="))).ok, false);
    assert.equal(readFailures, 1);
    assert.deepEqual(sync.data[STORAGE_KEYS.manifest], head);
    assert.equal(Object.values(local.data).some(value => value?.dataUrl === IMAGE_B), true);
    const loaded = await service(sync, local).load(defaults());
    assert.equal(loaded.state.background.value, IMAGE_B);
    assert.equal(loaded.state.background.customAssetAvailable, true);
  });
}

test("a same-intent no-op finishes interrupted local promotion without writing sync again", async () => {
  let failPromotion = false;
  const { sync, local, current } = await seed({}, { beforeSet: items => {
    if (failPromotion && Object.hasOwn(items, STORAGE_KEYS.localBackground)) throw new Error("Promotion rejected");
  } });
  failPromotion = true;
  assert.equal((await current.save(imageState(IMAGE_B))).ok, true);
  const fresh = service(sync, local), loaded = await fresh.load(defaults());
  sync.calls.length = 0;
  failPromotion = false;
  const retry = await fresh.save(loaded.state);
  assert.equal(retry.ok, true);
  assert.equal(retry.changed, false);
  assert.equal(sync.calls.some(call => call.method === "set"), false);
  assert.equal(local.data[STORAGE_KEYS.localBackground].dataUrl, IMAGE_B);
  assert.equal(Object.hasOwn(local.data, STORAGE_KEYS.pendingBackground), false);
});

test("a partially applied promotion remains readable and can be cleaned up on retry", async () => {
  let reject = false;
  const { sync, local, current } = await seed({}, { afterSet: items => {
    if (reject && Object.hasOwn(items, STORAGE_KEYS.localBackground)) throw new Error("Promotion applied but rejected");
  } });
  reject = true;
  assert.equal((await current.save(imageState(IMAGE_B))).ok, true);
  assert.equal(local.data[STORAGE_KEYS.pendingBackground].dataUrl, IMAGE_B);
  assert.equal((await service(sync, local).load(defaults())).state.background.value, IMAGE_B);
  reject = false;
  const fresh = service(sync, local), loaded = await fresh.load(defaults());
  assert.equal((await fresh.save(loaded.state)).ok, true);
  assert.equal(Object.hasOwn(local.data, STORAGE_KEYS.pendingBackground), false);
});

test("repeated replacements retain at most two local image copies even if cleanup fails", async () => {
  let failCleanup = false, maximumCopies = 0;
  const { sync, local, current } = await seed({}, {
    afterSet: (_items, area) => {
      maximumCopies = Math.max(maximumCopies, Object.values(area.data).filter(value => value?.dataUrl).length);
    },
    beforeRemove: () => { if (failCleanup) throw new Error("Cleanup unavailable"); }
  });
  failCleanup = true;
  for (const image of [IMAGE_B, "data:image/png;base64,Ag==", "data:image/png;base64,Aw==", IMAGE_A]) {
    assert.equal((await current.save(imageState(image))).ok, true);
    assert.equal((await service(sync, local).load(defaults())).state.background.value, image);
  }
  assert.equal(maximumCopies, 2);
  assert.equal(Object.values(local.data).filter(value => value?.dataUrl).length, 2);
});

test("a successful replacement keeps the published 1.6 local-image reader compatible", async () => {
  const { sync, local, current } = await seed();
  assert.equal((await current.save(imageState(IMAGE_B))).ok, true);
  const old = legacyService({ syncArea: sync, localArea: local, logger: null });
  const loaded = await old.load(defaults());
  assert.equal(loaded.state.background.value, IMAGE_B);
  assert.equal(loaded.state.background.customAssetAvailable, true);
  assert.equal(JSON.stringify(sync.data).includes("data:image"), false);
});

for (const type of ["default", "color"]) {
  test(`a rejected switch to ${type} keeps the old custom image; a confirmed switch clears it`, async () => {
    let reject = false;
    const { sync, local, current, previous } = await seed({ beforeSet: items => {
      if (reject && Object.hasOwn(items, STORAGE_KEYS.manifest)) throw new Error("Head rejection");
    } });
    const changed = imageState(IMAGE_B);
    changed.background = { type, value: type === "color" ? "#335577" : "", overlay: 0, overlayColor: "#112233" };
    reject = true;
    assert.equal((await current.save(changed)).ok, false);
    assert.deepEqual(local.data[STORAGE_KEYS.localBackground], previous);
    assert.equal((await service(sync, local).load(defaults())).state.background.value, IMAGE_A);
    reject = false;
    assert.equal((await current.save(changed)).ok, true);
    assert.equal(Object.hasOwn(local.data, STORAGE_KEYS.localBackground), false);
    assert.equal(Object.hasOwn(local.data, STORAGE_KEYS.pendingBackground), false);
    const loaded = await service(sync, local).load(defaults());
    assert.equal(loaded.state.background.type, type);
    if (type === "color") assert.equal(loaded.state.background.value, "#335577");
  });
}

test("a staged image with a different ID never substitutes for a missing referenced image", async () => {
  const { sync, local, previous } = await seed();
  delete local.data[STORAGE_KEYS.localBackground];
  local.data[STORAGE_KEYS.pendingBackground] = { storageVersion: 1, id: "different-image", dataUrl: IMAGE_B };
  const loaded = await service(sync, local).load(defaults());
  assert.equal(loaded.state.background.customAssetId, previous.id);
  assert.equal(loaded.state.background.customAssetAvailable, false);
  assert.equal(loaded.state.background.value, "");
});

test("an unknown future pending image is retained instead of overwritten by a replacement", async () => {
  const { sync, local, current, previous } = await seed();
  const future = { storageVersion: 2, id: "future-format", dataUrl: "data:image/png;base64,Ag==" };
  local.data[STORAGE_KEYS.pendingBackground] = structuredClone(future);
  const head = structuredClone(sync.data[STORAGE_KEYS.manifest]);
  assert.equal((await current.save(imageState(IMAGE_B))).ok, false);
  assert.deepEqual(local.data[STORAGE_KEYS.pendingBackground], future);
  assert.deepEqual(local.data[STORAGE_KEYS.localBackground], previous);
  assert.deepEqual(sync.data[STORAGE_KEYS.manifest], head);
});

test("confirmed default restoration removes known images but not an unknown future pending format", async () => {
  const { sync, local, current } = await seed();
  const future = { storageVersion: 2, id: "future-format", dataUrl: IMAGE_B };
  local.data[STORAGE_KEYS.pendingBackground] = structuredClone(future);
  assert.equal((await current.save(makeState())).ok, true);
  assert.equal(Object.hasOwn(local.data, STORAGE_KEYS.localBackground), false);
  assert.deepEqual(local.data[STORAGE_KEYS.pendingBackground], future);
  assert.equal((await service(sync, local).load(defaults())).state.background.type, "default");
});

for (const replacing of [false, true]) {
  test(`${replacing ? "replacement" : "no-op recovery"} never overwrites an unknown future primary image format`, async () => {
    const { sync, local, previous } = await seed();
    const future = { storageVersion: 2, id: "future-primary", dataUrl: IMAGE_B };
    local.data[STORAGE_KEYS.pendingBackground] = structuredClone(previous);
    local.data[STORAGE_KEYS.localBackground] = structuredClone(future);
    const current = service(sync, local), loaded = await current.load(defaults());
    assert.equal(loaded.state.background.value, IMAGE_A);
    const result = await current.save(replacing ? imageState(IMAGE_B) : loaded.state);
    assert.equal(result.ok, !replacing);
    assert.deepEqual(local.data[STORAGE_KEYS.localBackground], future);
    assert.deepEqual(local.data[STORAGE_KEYS.pendingBackground], previous);
    assert.equal((await service(sync, local).load(defaults())).state.background.value, IMAGE_A);
  });
}
