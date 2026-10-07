import { STORAGE_KEYS } from "../../storage-service.mjs";

export function makeState({ emoji = "🗺️", showAllFolder = false, selectedFolderId = "work" } = {}) {
  return {
    selectedFolderId, shortcutsEnabled: true, showAllFolder,
    folders: [{ id: "root", name: "Unfiled" }, { id: "work", name: "Work" }, { id: "personal", name: "Personal" }],
    links: [
      { id: "site", title: "Example", url: "https://example.com/?q=a#one", folderId: "work", ...(emoji ? { emoji } : {}) },
      { id: "unfiled", title: "Unfiled", url: "https://unfiled.example/", folderId: "root" }
    ],
    background: { type: "default", value: "", overlay: 0, overlayColor: "#141026" }
  };
}

export function makeArea(initial = {}, hooks = {}) {
  const area = {
    data: structuredClone(initial), calls: [],
    async get(keys = null) {
      area.calls.push({ method: "get", keys: structuredClone(keys) });
      await hooks.beforeGet?.(keys, area);
      const selected = keys === null ? area.data : Object.fromEntries((typeof keys === "string" ? [keys] : keys)
        .filter(key => Object.hasOwn(area.data, key)).map(key => [key, area.data[key]]));
      const result = structuredClone(selected);
      await hooks.afterGet?.(keys, area, result);
      return result;
    },
    async set(items) {
      area.calls.push({ method: "set", items: structuredClone(items) });
      await hooks.beforeSet?.(items, area);
      Object.assign(area.data, structuredClone(items));
      await hooks.afterSet?.(items, area);
    },
    async remove(keys) {
      area.calls.push({ method: "remove", keys: structuredClone(keys) });
      await hooks.beforeRemove?.(keys, area);
      for (const key of Array.isArray(keys) ? keys : [keys]) delete area.data[key];
    }
  };
  return area;
}

export function corePayload(state = makeState()) {
  return {
    storageVersion: 1,
    sites: Object.fromEntries(state.links.map(({ id, title, url, folderId, emoji }) => [id, { title, url, folderId, ...(emoji ? { emoji } : {}) }])),
    folders: Object.fromEntries(state.folders.map(({ id, name }) => [id, { name }])),
    layout: { siteOrder: state.links.map(site => site.id), folderOrder: state.folders.map(folder => folder.id), selectedFolderId: state.selectedFolderId },
    theme: { background: { type: "default" }, overlay: 0, overlayColor: "#141026" },
    preferences: { singleKeyShortcuts: state.shortcutsEnabled, ...(state.showAllFolder === false ? { showAllFolder: false } : {}) }
  };
}

export async function seedCore(area, payload, { generationId = "core-fixture" } = {}) {
  const json = JSON.stringify(payload), chunkKeys = [STORAGE_KEYS.chunkPrefix + generationId + ":0"];
  const descriptor = { storageVersion: 1, generationId, chunkKeys, chunkCount: 1, byteLength: new TextEncoder().encode(json).length, createdAt: 1 };
  await area.set({ [chunkKeys[0]]: json, [STORAGE_KEYS.manifest]: { storageVersion: 1, active: descriptor, previous: null } });
  area.calls.length = 0;
  return descriptor;
}
