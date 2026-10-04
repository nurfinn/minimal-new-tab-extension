import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { normalizeWebUrl } from "../storage-service.mjs";

const feature = await import("../feature-state.mjs").catch(() => ({}));
const api = ["hashSiteUrl", "validateFeaturePayload", "canonicalFeatureJson", "buildFeaturePayload", "applyFeaturePayload"];
const requireApi = () => api.forEach(name => assert.equal(typeof feature[name], "function", `missing feature export: ${name}`));
const url = "https://example.com/?q=a#one";
const hash = createHash("sha256").update(url).digest("hex");

test("models a chosen emoji and retains an explicit live reset with All shown", async () => {
  requireApi();
  const original = { sites: { site: { url, emoji: "🗺️", title: "ignored" } }, showAllFolder: false };
  const before = structuredClone(original);
  const chosen = await feature.buildFeaturePayload(original);
  assert.deepEqual(chosen, { featureVersion: 1, showAllFolder: false, sites: { site: { urlHash: hash, emoji: "🗺️" } } });
  const reset = await feature.buildFeaturePayload({ sites: { site: { url } }, showAllFolder: true }, chosen);
  assert.equal(reset.sites.site.emoji, null);
  assert.equal(reset.showAllFolder, true);
  assert.deepEqual(original, before);
  assert.equal(Object.hasOwn((await feature.buildFeaturePayload({ sites: { never: { url } }, showAllFolder: true })).sites, "never"), false);
});

test("canonical feature JSON is stable across site reorder and excludes unrelated state", async () => {
  requireApi();
  const a = { url, emoji: "🚀" }, b = { url: "https://b.example/", emoji: "🎉" };
  const one = await feature.buildFeaturePayload({ sites: { b, a }, showAllFolder: true });
  const two = await feature.buildFeaturePayload({ sites: { a, b }, showAllFolder: true });
  assert.equal(feature.canonicalFeatureJson(one), feature.canonicalFeatureJson(two));
  assert.deepEqual(Object.keys(one.sites), ["a", "b"]);
});

test("binds the full canonical Unicode URL, including query and fragment", async () => {
  requireApi();
  for (const raw of ["пример.рф/путь?q=💡#часть", "https://example.com/a b?q=one%20two#x", url]) {
    const normalized = normalizeWebUrl(raw);
    assert.equal(await feature.hashSiteUrl(normalized), createHash("sha256").update(normalized).digest("hex"));
  }
  assert.notEqual(await feature.hashSiteUrl(url), await feature.hashSiteUrl("https://example.com/?q=b#one"));
  assert.notEqual(await feature.hashSiteUrl(url), await feature.hashSiteUrl("https://example.com/?q=a#two"));
});

test("applies only matching existing identities and never recreates a deleted site", async () => {
  requireApi();
  const protectedData = await feature.buildFeaturePayload({ sites: { site: { url, emoji: "🗺️" }, deleted: { url, emoji: "🚀" } }, showAllFolder: false });
  const core = { sites: { site: { url, title: "New name", folderId: "work", emoji: "🎉" }, changed: { url: "https://different.example/", emoji: "🎉" } }, preferences: { singleKeyShortcuts: false }, layout: { siteOrder: ["site", "changed"] } };
  const before = structuredClone(core);
  const result = await feature.applyFeaturePayload(core, protectedData);
  assert.equal(result.sites.site.emoji, "🗺️");
  assert.equal(Object.hasOwn(result.sites.changed, "emoji"), false);
  assert.equal(Object.hasOwn(result.sites, "deleted"), false);
  assert.equal(result.sites.site.title, "New name");
  assert.equal(result.sites.site.folderId, "work");
  assert.deepEqual(result.preferences, { singleKeyShortcuts: false, showAllFolder: false });
  assert.deepEqual(core, before);
  const pruned = await feature.buildFeaturePayload({ sites: {}, showAllFolder: true }, protectedData);
  assert.deepEqual(pruned.sites, {});
});

test("explicit reset and absent complete record both remove inline emoji", async () => {
  requireApi();
  const core = { sites: { site: { url, emoji: "🗺️" } }, preferences: { singleKeyShortcuts: true, showAllFolder: false } };
  for (const sites of [{}, { site: { urlHash: hash, emoji: null } }, { site: { urlHash: "0".repeat(64), emoji: "🚀" } }]) {
    const result = await feature.applyFeaturePayload(core, { featureVersion: 1, showAllFolder: true, sites });
    assert.equal(Object.hasOwn(result.sites.site, "emoji"), false);
    assert.equal(result.preferences.showAllFolder, true);
  }
});

test("rejects malformed or future metadata without accepting prototype injection", () => {
  requireApi();
  const valid = { featureVersion: 1, showAllFolder: true, sites: { site: { urlHash: hash, emoji: "🗺️" } } };
  assert.equal(feature.validateFeaturePayload(valid), true);
  for (const invalid of [
    { ...valid, featureVersion: 2 }, { ...valid, showAllFolder: "false" },
    { ...valid, extra: true }, { ...valid, sites: { site: { urlHash: hash.toUpperCase(), emoji: null } } },
    { ...valid, sites: { site: { urlHash: hash, emoji: "text" } } },
    { ...valid, sites: { "-bad": { urlHash: hash, emoji: null } } },
    JSON.parse(`{"featureVersion":1,"showAllFolder":true,"sites":{"__proto__":{"urlHash":"${hash}","emoji":null}}}`)
  ]) {
    assert.equal(feature.validateFeaturePayload(invalid), false);
    assert.throws(() => feature.canonicalFeatureJson(invalid));
  }
});

test("valid constructor IDs are safe own keys rather than retroactively forbidden IDs", async () => {
  requireApi();
  const input = { sites: { constructor: { url, emoji: "🚀" }, toString: { url, emoji: "🎉" } }, showAllFolder: false };
  const payload = await feature.buildFeaturePayload(input);
  assert.equal(Object.hasOwn(payload.sites, "constructor"), true);
  assert.equal(payload.sites.constructor.emoji, "🚀");
  assert.equal(Object.getPrototypeOf(payload.sites), Object.prototype);
  const result = await feature.applyFeaturePayload(input, payload);
  assert.equal(result.sites.constructor.emoji, "🚀");
});

test("hashing rejection is propagated instead of using a weak identity fallback", async () => {
  requireApi();
  await assert.rejects(feature.hashSiteUrl(url, { digest: async () => { throw new Error("digest failed"); } }), /digest failed/);
  await assert.rejects(feature.buildFeaturePayload({ sites: { site: { url, emoji: "🚀" } }, showAllFolder: true }, null, { hashUrl: async () => { throw new Error("unavailable"); } }), /unavailable/);
});
