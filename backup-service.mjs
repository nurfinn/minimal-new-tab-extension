import { normalizeWebUrl } from './storage-service.mjs';

export const BACKUP_FORMAT = 'minimal-new-tab-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 1024 * 1024;
export const MAX_BACKUP_SITES = 500;
export const MAX_BACKUP_FOLDERS = 100;

const ROOT_FOLDER_ID = 'root';
const ID_PATTERN = /^[a-z\d][a-z\d._:-]{0,127}$/i;
const encoder = new TextEncoder();

export function serializeBackup(
  state,
  { now = new Date(), appVersion = '1.5.1' } = {},
) {
  if (!isRecord(state) || !Array.isArray(state.folders) || !Array.isArray(state.links)) {
    throw new TypeError('Invalid application state');
  }

  const portableData = {
    selectedFolderId: state.selectedFolderId,
    folders: state.folders.map(({ id, name }) => ({ id, name })),
    links: state.links.map(({ id, title, url, folderId }) => ({
      id,
      title,
      url,
      folderId,
    })),
  };
  const data = normalizeBackupData(portableData);
  if (!data) throw new TypeError('Invalid application state');

  const createdAt = toIsoString(now);
  if (!createdAt || !isNonEmptyString(appVersion, 32)) {
    throw new TypeError('Invalid backup metadata');
  }

  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      backupVersion: BACKUP_VERSION,
      createdAt,
      appVersion: appVersion.trim(),
      data,
    },
    null,
    2,
  );
}

export function parseBackupText(text) {
  if (typeof text !== 'string') return failure('invalid-json');
  if (encoder.encode(text).length > MAX_BACKUP_BYTES) {
    return failure('file-too-large');
  }

  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return failure('invalid-json');
  }

  if (
    !isRecord(document) ||
    document.format !== BACKUP_FORMAT ||
    document.backupVersion !== BACKUP_VERSION
  ) {
    return failure('unsupported-backup');
  }

  if (
    !hasExactKeys(document, ['format', 'backupVersion', 'createdAt', 'appVersion', 'data']) ||
    !isIsoString(document.createdAt) ||
    !isNonEmptyString(document.appVersion, 32)
  ) {
    return failure('invalid-backup-data');
  }

  const data = normalizeBackupData(document.data);
  if (!data) return failure('invalid-backup-data');

  return {
    ok: true,
    data,
    preview: {
      createdAt: document.createdAt,
      siteCount: data.links.length,
      folderCount: data.folders.filter(({ id }) => id !== ROOT_FOLDER_ID).length,
    },
  };
}

export function buildImportedState(currentState, importedData) {
  if (!isRecord(currentState) || !isRecord(currentState.background)) {
    throw new TypeError('Invalid current state');
  }

  const data = normalizeBackupData(importedData);
  if (!data) throw new TypeError('Invalid imported data');

  return {
    selectedFolderId: data.selectedFolderId,
    folders: structuredClone(data.folders),
    links: structuredClone(data.links),
    background: structuredClone(currentState.background),
  };
}

export function getBackupFilename(now = new Date()) {
  const createdAt = toIsoString(now);
  if (!createdAt) throw new TypeError('Invalid backup date');
  return `minimal-new-tab-backup-${createdAt.slice(0, 10)}.json`;
}

function normalizeBackupData(value) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['selectedFolderId', 'folders', 'links']) ||
    !Array.isArray(value.folders) ||
    !Array.isArray(value.links) ||
    value.folders.length === 0 ||
    value.folders.length > MAX_BACKUP_FOLDERS ||
    value.links.length > MAX_BACKUP_SITES
  ) {
    return null;
  }

  const folders = [];
  const folderIds = new Set();
  for (const folder of value.folders) {
    if (
      !isRecord(folder) ||
      !hasExactKeys(folder, ['id', 'name']) ||
      !isValidId(folder.id) ||
      !isNonEmptyString(folder.name, 200) ||
      folderIds.has(folder.id)
    ) {
      return null;
    }
    folderIds.add(folder.id);
    folders.push({ id: folder.id, name: folder.name.trim() });
  }
  if (!folderIds.has(ROOT_FOLDER_ID)) return null;

  const links = [];
  const linkIds = new Set();
  for (const link of value.links) {
    if (
      !isRecord(link) ||
      !hasExactKeys(link, ['id', 'title', 'url', 'folderId']) ||
      !isValidId(link.id) ||
      !isNonEmptyString(link.title, 500) ||
      !folderIds.has(link.folderId) ||
      linkIds.has(link.id)
    ) {
      return null;
    }

    const url = normalizeWebUrl(link.url);
    if (!url) return null;
    linkIds.add(link.id);
    links.push({
      id: link.id,
      title: link.title.trim(),
      url,
      folderId: link.folderId,
    });
  }

  const selectedFolderId =
    value.selectedFolderId === ROOT_FOLDER_ID ? 'all' : value.selectedFolderId;
  if (
    selectedFolderId !== 'all' &&
    (!isValidId(selectedFolderId) || !folderIds.has(selectedFolderId))
  ) {
    return null;
  }

  return { selectedFolderId, folders, links };
}

function hasExactKeys(value, expected) {
  const keys = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return keys.length === allowed.length && keys.every((key, index) => key === allowed[index]);
}

function isValidId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isIsoString(value) {
  return typeof value === 'string' && toIsoString(value) === value;
}

function toIsoString(value) {
  try {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : '';
  } catch {
    return '';
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure(error) {
  return { ok: false, error };
}
