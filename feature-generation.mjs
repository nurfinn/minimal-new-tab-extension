import { normalizeSiteEmoji } from "./site-icon.mjs";
import { applyFeaturePayload, buildFeaturePayload, canonicalFeatureJson, hashSiteUrl } from "./feature-state.mjs";

export const FEATURE_KEYS = Object.freeze({
  manifest: "minimalNewTabFeatureManifest",
  backupManifest: "minimalNewTabFeatureManifestBackup",
  chunkPrefix: "minimalNewTabFeatureChunk:"
});
const encoder = new TextEncoder();
const idPattern = /^[a-z\d][a-z\d._:-]{0,127}$/i;
const record = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const bytes = value => encoder.encode(value).length;

function validDescriptor(value) {
  return record(value) && value.featureVersion === 1 && typeof value.generationId === "string" &&
    idPattern.test(value.generationId) && Number.isInteger(value.chunkCount) && value.chunkCount >= 1 &&
    value.chunkCount <= 10 && Array.isArray(value.chunkKeys) && value.chunkKeys.length === value.chunkCount &&
    value.chunkKeys.every((key, index) => key === `${FEATURE_KEYS.chunkPrefix}${value.generationId}:${index}`) &&
    Number.isInteger(value.byteLength) && value.byteLength > 0 && value.byteLength <= 32768 &&
    Number.isFinite(value.createdAt) && value.createdAt >= 0;
}

export function prepareFeatureGeneration(payload, { generationId, createdAt, previousDescriptor = null }) {
  const json = canonicalFeatureJson(payload);
  const parts = [];
  let part = "", size = 0;
  for (const character of json) {
    const length = bytes(character);
    if (size + length > 3500) { parts.push(part); part = ""; size = 0; }
    part += character; size += length;
  }
  if (part) parts.push(part);
  const chunkKeys = parts.map((_, index) => `${FEATURE_KEYS.chunkPrefix}${generationId}:${index}`);
  const descriptor = { featureVersion: 1, generationId, chunkKeys, chunkCount: parts.length, byteLength: bytes(json), createdAt };
  if (!validDescriptor(descriptor) || (previousDescriptor !== null && !validDescriptor(previousDescriptor))) {
    throw new TypeError("Invalid feature generation");
  }
  return {
    json, descriptor, chunks: Object.fromEntries(parts.map((part, index) => [chunkKeys[index], part])),
    manifest: { featureVersion: 1, active: descriptor, previous: previousDescriptor },
    backupManifest: previousDescriptor ? { featureVersion: 1, active: previousDescriptor, previous: null } : null
  };
}

export function readFeatureGeneration(stored, descriptor) {
  if (!validDescriptor(descriptor)) return null;
  const parts = descriptor.chunkKeys.map(key => Object.hasOwn(stored, key) ? stored[key] : undefined);
  if (parts.some(part => typeof part !== "string" || !part || bytes(part) > 3500)) return null;
  const json = parts.join("");
  if (bytes(json) !== descriptor.byteLength) return null;
  try {
    const payload = JSON.parse(json);
    canonicalFeatureJson(payload);
    return { payload, json, descriptor: structuredClone(descriptor) };
  } catch { return null; }
}

export function readFeatureLayer(stored, { generationId = null } = {}) {
  const result = (status, generation = null) => ({ status, payload: generation?.payload ?? null, descriptor: generation?.descriptor ?? null });
  const manifests = [stored[FEATURE_KEYS.manifest], stored[FEATURE_KEYS.backupManifest]];
  const future = value => record(value) && Number.isInteger(value.featureVersion) && value.featureVersion > 1;
  if (manifests.some(manifest => future(manifest) || future(manifest?.active) || future(manifest?.previous))) return result("unsupported");
  const present = Object.keys(stored).some(key => key === FEATURE_KEYS.manifest || key === FEATURE_KEYS.backupManifest || key.startsWith(FEATURE_KEYS.chunkPrefix));
  if (!present) return result("absent");
  const candidates = manifests.flatMap(manifest =>
    record(manifest) && manifest.featureVersion === 1 ? [manifest.active, manifest.previous] : [null, null]);
  for (const [index, descriptor] of candidates.entries()) {
    if (generationId !== null && descriptor?.generationId !== generationId) continue;
    const read = readFeatureGeneration(stored, descriptor);
    if (read) return result(index === 0 ? "ready" : "recovered", read);
  }
  return result("invalid");
}

export async function resolveFeatureState(corePayload, layer, matchedLayer, { hashUrl = hashSiteUrl } = {}) {
  const result = (payload, featurePayload, featureDescriptor, writable, bootstrap, source) =>
    ({ payload, featurePayload, featureDescriptor, writable, bootstrap, source });
  const blocked = () => result(structuredClone(corePayload), null, null, false, false, "feature-error");
  const available = value => ["ready", "recovered"].includes(value.status);
  if (layer.status === "unsupported" || matchedLayer.status === "unsupported") return blocked();
  const hasMarker = Object.hasOwn(corePayload, "featureState");
  const marker = corePayload.featureState;
  const markerValid = record(marker) && marker.version === 1 && typeof marker.generationId === "string" && idPattern.test(marker.generationId);
  const inlineValid = Object.values(corePayload.sites).every(site =>
    !Object.hasOwn(site, "emoji") || Boolean(normalizeSiteEmoji(site.emoji))) &&
    (!Object.hasOwn(corePayload.preferences ?? {}, "showAllFolder") || typeof corePayload.preferences.showAllFolder === "boolean");
  try {
    if (hasMarker) {
      if (!markerValid) return blocked();
      if (!inlineValid) {
        if (!available(matchedLayer) || matchedLayer.descriptor.generationId !== marker.generationId) return blocked();
        return result(await applyFeaturePayload(corePayload, matchedLayer.payload, { hashUrl }),
          matchedLayer.payload, matchedLayer.descriptor, true, false, "features");
      }
      const previous = available(matchedLayer) ? matchedLayer.payload : available(layer) ? layer.payload : null;
      const inline = await buildFeaturePayload({ sites: corePayload.sites, showAllFolder: corePayload.preferences?.showAllFolder !== false }, previous, { hashUrl });
      const consistent = available(matchedLayer) && matchedLayer.descriptor.generationId === marker.generationId &&
        canonicalFeatureJson(inline) === canonicalFeatureJson(matchedLayer.payload);
      return result(structuredClone(corePayload), inline, consistent ? matchedLayer.descriptor : null,
        true, false, consistent ? "features" : "inline");
    }
    if (available(layer)) {
      return result(await applyFeaturePayload(corePayload, layer.payload, { hashUrl }), layer.payload, layer.descriptor,
        true, false, layer.status === "recovered" ? "feature-recovered" : "features");
    }
    if (layer.status !== "absent" || !inlineValid) return blocked();
    const inline = await buildFeaturePayload({ sites: corePayload.sites, showAllFolder: corePayload.preferences?.showAllFolder !== false }, null, { hashUrl });
    return result(structuredClone(corePayload), inline, null, true,
      !inline.showAllFolder || Object.keys(inline.sites).length > 0, "legacy");
  } catch { return blocked(); }
}

export function estimateSyncUsage(stored, writes) {
  const entries = Object.entries({ ...stored, ...writes });
  const sizes = entries.map(([key, value]) => bytes(key) + bytes(JSON.stringify(value)));
  return { totalBytes: sizes.reduce((sum, size) => sum + size, 0), maxItemBytes: Math.max(0, ...sizes), itemCount: entries.length };
}
