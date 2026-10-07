import test from "node:test";
import assert from "node:assert/strict";
import { canonicalFeatureJson, hashSiteUrl } from "../feature-state.mjs";
const api = await import("../feature-generation.mjs").catch(() => ({}));
function requireApi() {
  for (const name of ["prepareFeatureGeneration", "readFeatureGeneration", "readFeatureLayer", "resolveFeatureState", "estimateSyncUsage"])
    assert.equal(typeof api[name], "function", `missing codec export: ${name}`);
}
const empty = { featureVersion: 1, showAllFolder: true, sites: {} };
const url = "https://example.com/?q=a#one";
const urlHash = await hashSiteUrl(url);
const chosen = { featureVersion: 1, showAllFolder: false, sites: { site: { urlHash, emoji: "🗺️" } } };
const core = () => ({ storageVersion: 1, sites: { site: { title: "Keep", url, folderId: "work" } }, preferences: { singleKeyShortcuts: true } });
function snapshot(payload, generationId = "a", previousDescriptor = null) {
  const p = api.prepareFeatureGeneration(payload, { generationId, createdAt: 1, previousDescriptor });
  return { p, stored: { ...p.chunks, [api.FEATURE_KEYS.manifest]: p.manifest, ...(p.backupManifest ? { [api.FEATURE_KEYS.backupManifest]: p.backupManifest } : {}) } };
}
const layer = (status, payload = null, descriptor = null) => ({ status, payload, descriptor });

test("encodes independent chunks and rejects incomplete or forged descriptors", () => {
  requireApi();
  const { p, stored } = snapshot(chosen);
  assert.deepEqual(Object.keys(p.chunks), ["minimalNewTabFeatureChunk:a:0"]);
  assert.equal(api.readFeatureGeneration(stored, p.descriptor).payload.sites.site.emoji, "🗺️");
  for (const override of [
    { byteLength: 999 }, { chunkCount: 11 }, { chunkCount: 0 }, { featureVersion: 2 },
    { chunkKeys: ["minimalNewTabSyncChunk:a:0"] }, { chunkKeys: ["minimalNewTabFeatureChunk:a:1"] },
    { generationId: "../escape" }, { byteLength: 32769 }, { createdAt: NaN }
  ]) assert.equal(api.readFeatureGeneration(stored, { ...p.descriptor, ...override }), null);
  assert.equal(api.readFeatureGeneration({}, p.descriptor), null);
});

test("falls back by complete generation, never restores individual fields from history", () => {
  requireApi();
  const first = snapshot(chosen, "first");
  const second = snapshot(empty, "second", first.p.descriptor);
  const stored = { ...first.stored, ...second.stored };
  assert.deepEqual(api.readFeatureLayer(stored).payload, empty);
  delete stored[second.p.descriptor.chunkKeys[0]];
  const recovered = api.readFeatureLayer(stored);
  assert.equal(recovered.status, "recovered");
  assert.deepEqual(recovered.payload, chosen);
  stored[api.FEATURE_KEYS.manifest] = { featureVersion: 1, active: null, previous: null };
  assert.equal(api.readFeatureLayer(stored).descriptor.generationId, "first");
});

test("unknown future versions block even a readable older backup and orphan keys are not absent", () => {
  requireApi();
  const first = snapshot(chosen);
  first.stored[api.FEATURE_KEYS.backupManifest] = first.p.manifest;
  first.stored[api.FEATURE_KEYS.manifest] = { ...first.p.manifest, featureVersion: 2 };
  assert.equal(api.readFeatureLayer(first.stored).status, "unsupported");
  assert.equal(api.readFeatureLayer({ "minimalNewTabFeatureChunk:foreign:0": "{}" }).status, "invalid");
  assert.equal(api.readFeatureLayer({ "unrelated:key": "keep" }).status, "absent");
  assert.equal(api.readFeatureLayer(snapshot(chosen).stored, { generationId: "unknown" }).status, "invalid");
});

test("enforces 32768 UTF-8 bytes and ten chunks including complex emoji", () => {
  requireApi();
  let sites = {};
  for (let i = 0; i < 130; i++) sites[`site-${i}-${"x".repeat(70)}`] = { urlHash, emoji: "🧑🏽‍💻" };
  const value = { ...empty, sites };
  const initial = canonicalFeatureJson(value).length;
  // Increase one valid ASCII ID to reach the hand-sized byte boundary exactly.
  while (new TextEncoder().encode(canonicalFeatureJson(value)).length < 32600) {
    const id = `extra-${Object.keys(value.sites).length}-${"x".repeat(80)}`;
    value.sites[id] = { urlHash, emoji: "🧑🏽‍💻" };
  }
  const bytes = new TextEncoder().encode(canonicalFeatureJson(value)).length;
  assert.ok(bytes > initial);
  const last = Object.keys(value.sites).at(-1);
  const padding = 32768 - bytes;
  if (last.length + padding <= 128) {
    value.sites[last + "x".repeat(padding)] = value.sites[last]; delete value.sites[last];
  } else {
    let remaining = padding;
    for (const id of Object.keys(value.sites)) {
      const add = Math.min(128 - id.length, remaining);
      if (add) { value.sites[id + "x".repeat(add)] = value.sites[id]; delete value.sites[id]; remaining -= add; }
      if (!remaining) break;
    }
    assert.equal(remaining, 0);
  }
  const { p, stored } = snapshot(value);
  assert.equal(p.descriptor.byteLength, 32768);
  assert.equal(p.descriptor.chunkCount, 10);
  for (const chunk of Object.values(p.chunks)) assert.ok(new TextEncoder().encode(chunk).length <= 3500);
  assert.equal(api.readFeatureGeneration(stored, p.descriptor).json, p.json);
  const id = Object.keys(value.sites).find(key => key.length < 128);
  value.sites[id + "x"] = value.sites[id]; delete value.sites[id];
  assert.throws(() => snapshot(value), /32768/);
});

test("accounts for encoded keys and JSON escaping, not raw string length", () => {
  requireApi();
  const usage = api.estimateSyncUsage({ a: "old", b: true }, { a: "\"".repeat(4090) });
  assert.equal(usage.maxItemBytes, 8183); // key a (1) + quotes (2) + 4090 escaped quotes (8180).
  assert.equal(usage.totalBytes, 8188); // key b (1) + true (4).
  assert.equal(usage.itemCount, 2);
  assert.ok(api.estimateSyncUsage({}, { ["x".repeat(20)]: "\"".repeat(4090) }).maxItemBytes > 8192);
});

test("marked complete reset outranks a different or stale feature head", async () => {
  requireApi();
  const marked = { ...core(), featureState: { version: 1, generationId: "reset" } };
  const result = await api.resolveFeatureState(marked, layer("ready", chosen, snapshot(chosen).p.descriptor), layer("invalid"));
  assert.equal(result.writable, true);
  assert.equal(Object.hasOwn(result.payload.sites.site, "emoji"), false);
  assert.equal(result.featurePayload.showAllFolder, true);
  assert.equal(result.bootstrap, false);
});

test("matching layer recovers damaged inline values but malformed marker is never legacy", async () => {
  requireApi();
  const { p } = snapshot(chosen);
  const damaged = { ...core(), featureState: { version: 1, generationId: "a" } };
  damaged.sites.site.emoji = "bad";
  const matched = layer("ready", chosen, p.descriptor);
  const result = await api.resolveFeatureState(damaged, matched, matched);
  assert.equal(result.writable, true);
  assert.equal(result.payload.sites.site.emoji, "🗺️");
  assert.equal(result.payload.preferences.showAllFolder, false);
  const blocked = await api.resolveFeatureState(damaged, matched, layer("invalid"));
  assert.equal(blocked.writable, false);
  assert.equal(blocked.payload.sites.site.title, "Keep");
  for (const marker of [null, {}, { version: 2, generationId: "a" }, { version: 1, generationId: "../bad" }]) {
    const invalid = await api.resolveFeatureState({ ...core(), featureState: marker }, matched, matched);
    assert.equal(invalid.writable, false);
  }
});

test("inconsistent same-ID feature intent cannot undo valid marked inline reset", async () => {
  requireApi();
  const { p } = snapshot(chosen);
  const matched = layer("ready", chosen, p.descriptor);
  const result = await api.resolveFeatureState({ ...core(), featureState: { version: 1, generationId: "a" } }, matched, matched);
  assert.equal(result.source, "inline");
  assert.equal(Object.hasOwn(result.payload.sites.site, "emoji"), false);
  assert.equal(result.featurePayload.sites.site.emoji, null);
});

test("unmarked old writer overlays protected choices before navigation materialization", async () => {
  requireApi();
  const { p } = snapshot(chosen);
  const result = await api.resolveFeatureState(core(), layer("recovered", chosen, p.descriptor), layer("invalid"));
  assert.equal(result.source, "feature-recovered");
  assert.equal(result.payload.sites.site.emoji, "🗺️");
  assert.equal(result.payload.preferences.showAllFolder, false);
  assert.equal(result.bootstrap, false);
});

test("unreadable features preserve core but forbid writing; absent defaults need no bootstrap", async () => {
  requireApi();
  for (const status of ["invalid", "unsupported"]) {
    const result = await api.resolveFeatureState(core(), layer(status), layer(status));
    assert.equal(result.writable, false);
    assert.equal(result.payload.sites.site.title, "Keep");
  }
  const defaults = await api.resolveFeatureState(core(), layer("absent"), layer("absent"));
  assert.equal(defaults.bootstrap, false);
  assert.equal(defaults.writable, true);
  const inline = core(); inline.sites.site.emoji = "🗺️";
  const migrate = await api.resolveFeatureState(inline, layer("absent"), layer("absent"));
  assert.equal(migrate.bootstrap, true);
  assert.equal(migrate.featurePayload.sites.site.emoji, "🗺️");
});
