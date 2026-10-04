import { normalizeSiteEmoji } from "./site-icon.mjs";

const ID_PATTERN = /^[a-z\d][a-z\d._:-]{0,127}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();
const MAX_BYTES = 32768;
const record = value => Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exactKeys = (value, keys) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export async function hashSiteUrl(normalizedUrl, { digest } = {}) {
  if (typeof normalizedUrl !== "string" || !normalizedUrl) throw new TypeError("Invalid site URL");
  const hash = digest ?? globalThis.crypto?.subtle?.digest.bind(globalThis.crypto.subtle);
  if (!hash) throw new Error("SHA-256 is unavailable");
  const bytes = new Uint8Array(await hash("SHA-256", encoder.encode(normalizedUrl)));
  if (bytes.length !== 32) throw new Error("Invalid SHA-256 result");
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function validateFeaturePayload(value) {
  if (!record(value) || !exactKeys(value, ["featureVersion", "showAllFolder", "sites"]) ||
    value.featureVersion !== 1 || typeof value.showAllFolder !== "boolean" || !record(value.sites)) return false;
  return Object.entries(value.sites).every(([id, site]) =>
    ID_PATTERN.test(id) && record(site) && exactKeys(site, ["urlHash", "emoji"]) &&
    typeof site.urlHash === "string" && HASH_PATTERN.test(site.urlHash) &&
    (site.emoji === null || (typeof site.emoji === "string" && Boolean(site.emoji) && normalizeSiteEmoji(site.emoji) === site.emoji)));
}

export function canonicalFeatureJson(payload) {
  if (!validateFeaturePayload(payload)) throw new TypeError("Invalid feature payload");
  const sites = Object.fromEntries(Object.keys(payload.sites).sort().map(id => [id, {
    urlHash: payload.sites[id].urlHash, emoji: payload.sites[id].emoji
  }]));
  const json = JSON.stringify({ featureVersion: 1, showAllFolder: payload.showAllFolder, sites });
  if (encoder.encode(json).length > MAX_BYTES) throw new RangeError("Feature payload exceeds 32768 bytes");
  return json;
}

export async function buildFeaturePayload({ sites, showAllFolder }, previousPayload = null, { hashUrl = hashSiteUrl } = {}) {
  if (!record(sites) || typeof showAllFolder !== "boolean" ||
    (previousPayload !== null && !validateFeaturePayload(previousPayload))) throw new TypeError("Invalid feature input");
  const entries = [];
  for (const id of Object.keys(sites).sort()) {
    const site = sites[id];
    if (!ID_PATTERN.test(id) || !record(site)) throw new TypeError("Invalid feature site");
    const emoji = normalizeSiteEmoji(site.emoji);
    if (emoji || (previousPayload && Object.hasOwn(previousPayload.sites, id))) {
      entries.push([id, { urlHash: await hashUrl(site.url), emoji: emoji || null }]);
    }
  }
  const payload = { featureVersion: 1, showAllFolder, sites: Object.fromEntries(entries) };
  canonicalFeatureJson(payload);
  return payload;
}

export async function applyFeaturePayload(corePayload, featurePayload, { hashUrl = hashSiteUrl } = {}) {
  canonicalFeatureJson(featurePayload);
  const result = structuredClone(corePayload);
  for (const [id, site] of Object.entries(result.sites)) {
    delete site.emoji;
    const metadata = Object.hasOwn(featurePayload.sites, id) ? featurePayload.sites[id] : null;
    if (metadata?.emoji && metadata.urlHash === await hashUrl(site.url)) site.emoji = metadata.emoji;
  }
  result.preferences = { ...result.preferences, showAllFolder: featurePayload.showAllFolder };
  return result;
}
