import { normalizeWebUrl } from './storage-service.mjs';

export { buildFaviconSources } from './favicon-service.mjs';

export const MAX_BACKGROUND_BYTES = 3 * 1024 * 1024;
export const MAX_BACKGROUND_DIMENSION = 4096;
export const SITE_TITLE_MAX_LENGTH = 500;
export const FOLDER_NAME_MAX_LENGTH = 200;

export function validateSiteDraft({ title, url } = {}) {
  const normalizedTitle = String(title ?? '').trim();
  if (normalizedTitle.length > SITE_TITLE_MAX_LENGTH) {
    return { ok: false, field: 'title', error: 'title-too-long' };
  }

  const normalizedUrl = normalizeWebUrl(url);
  if (!normalizedUrl) {
    return { ok: false, field: 'url', error: 'invalid-url' };
  }

  return { ok: true, url: normalizedUrl };
}

export function validateFolderName(value) {
  const name = String(value ?? '').trim();
  if (!name) return { ok: false, error: 'required' };
  if (name.length > FOLDER_NAME_MAX_LENGTH) {
    return { ok: false, error: 'name-too-long' };
  }

  return { ok: true, name };
}

export function moveItemByDelta(ids, id, delta) {
  const nextIds = [...ids];
  const sourceIndex = nextIds.indexOf(id);
  if (sourceIndex === -1) return { ids: nextIds, moved: false, position: 0 };

  const targetIndex = Math.min(
    nextIds.length - 1,
    Math.max(0, sourceIndex + Math.trunc(Number(delta) || 0)),
  );
  if (targetIndex === sourceIndex) {
    return { ids: nextIds, moved: false, position: sourceIndex + 1 };
  }

  nextIds.splice(sourceIndex, 1);
  nextIds.splice(targetIndex, 0, id);
  return { ids: nextIds, moved: true, position: targetIndex + 1 };
}

export function getGlobalShortcutAction({
  code,
  key,
  ctrlKey = false,
  metaKey = false,
  altKey = false,
  shiftKey = false,
  repeat = false,
  isEditable = false,
  isDialogOpen = false,
} = {}) {
  if (
    ctrlKey ||
    metaKey ||
    altKey ||
    shiftKey ||
    repeat ||
    isEditable ||
    isDialogOpen
  ) {
    return null;
  }

  const shortcutByCode = {
    KeyA: 'add-site',
    KeyF: 'add-folder',
    KeyS: 'settings',
  };
  if (code) return shortcutByCode[code] || null;

  return {
    a: 'add-site',
    f: 'add-folder',
    s: 'settings',
  }[String(key || '').toLowerCase()] || null;
}

export function validateBackgroundImage({ type, size, width, height }) {
  if (typeof type !== 'string' || !type.startsWith('image/')) {
    return { ok: false, error: 'invalid-type' };
  }

  if (!Number.isFinite(size) || size < 0 || size > MAX_BACKGROUND_BYTES) {
    return { ok: false, error: 'file-too-large' };
  }

  if (width === undefined && height === undefined) {
    return { ok: true };
  }

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, error: 'decode-failed' };
  }

  if (width > MAX_BACKGROUND_DIMENSION || height > MAX_BACKGROUND_DIMENSION) {
    return { ok: false, error: 'dimensions-too-large' };
  }

  return { ok: true };
}

export function isUsableFavicon({ naturalWidth, naturalHeight }) {
  const width = Number(naturalWidth);
  const height = Number(naturalHeight);

  return width > 0 && height > 0 && (width > 16 || height > 16);
}

export function deriveTitleFromUrl(value, fallback = 'Site') {
  const hostAliases = {
    'calendar.google.com': 'Google Calendar',
    'docs.google.com': 'Google Docs',
    'drive.google.com': 'Google Drive',
    'mail.google.com': 'Gmail',
    'sheets.google.com': 'Google Sheets',
    'slides.google.com': 'Google Slides',
  };
  const brandAliases = {
    chatgpt: 'ChatGPT',
    figma: 'Figma',
    github: 'GitHub',
    google: 'Google',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    notion: 'Notion',
    openai: 'OpenAI',
    reddit: 'Reddit',
    telegram: 'Telegram',
    whatsapp: 'WhatsApp',
    x: 'X',
    ycombinator: 'Hacker News',
    youtube: 'YouTube',
  };

  try {
    const hostname = new URL(value).hostname.replace(/^www\./, '');
    if (hostAliases[hostname]) return hostAliases[hostname];

    const labels = hostname.split('.').filter(Boolean);
    const commonSecondLevelDomains = new Set(['ac', 'co', 'com', 'gov', 'net', 'org']);
    let brandIndex = Math.max(0, labels.length - 2);
    if (
      labels.length >= 3 &&
      labels.at(-1).length === 2 &&
      commonSecondLevelDomains.has(labels.at(-2))
    ) {
      brandIndex = labels.length - 3;
    }

    const brand = labels[brandIndex] || labels[0] || fallback;
    if (brandAliases[brand]) return brandAliases[brand];
    return brand
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || fallback;
  } catch {
    return fallback;
  }
}

export function normalizeLegacyColorBackground(background, defaultBackground) {
  if (background?.type !== 'color' || !/^#[0-9a-f]{6}$/i.test(background.value || '')) {
    return structuredClone(background);
  }

  if (defaultBackground?.type === 'color') {
    return structuredClone(background);
  }

  return {
    ...structuredClone(defaultBackground),
    overlay: 100,
    overlayColor: background.value,
  };
}

export function renameFolder(folders, folderId, value) {
  const validation = validateFolderName(value);
  const folderIndex = folders.findIndex(({ id }) => id === folderId);

  if (!validation.ok || folderIndex === -1) {
    return { folders, renamed: false };
  }

  const nextFolders = [...folders];
  nextFolders[folderIndex] = { ...nextFolders[folderIndex], name: validation.name };

  return { folders: nextFolders, renamed: true };
}

export function getFolderScrollState(
  { scrollLeft, clientWidth, scrollWidth },
  threshold = 1,
) {
  const max = Math.max(0, scrollWidth - clientWidth);

  return {
    canScrollLeft: scrollLeft > threshold,
    canScrollRight: scrollLeft < max - threshold,
  };
}

export function getWheelScrollDelta(deltaX, deltaY) {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  return absX > absY ? deltaX : deltaY;
}

export function getFolderRevealScrollLeft(
  {
    scrollLeft,
    clientWidth,
    scrollWidth,
    activeOffsetLeft,
    activeOffsetWidth,
  },
  padding = 24,
) {
  const max = Math.max(0, scrollWidth - clientWidth);
  const current = Math.min(max, Math.max(0, scrollLeft));
  const activeRight = activeOffsetLeft + activeOffsetWidth;
  let target = current;

  if (activeOffsetLeft < current + padding) {
    target = activeOffsetLeft - padding;
  } else if (activeRight > current + clientWidth - padding) {
    target = activeRight + padding - clientWidth;
  }

  return Math.min(max, Math.max(0, target));
}

export function getFolderWheelScrollLeft(
  { scrollLeft, clientWidth, scrollWidth },
  delta,
) {
  const max = Math.max(0, scrollWidth - clientWidth);

  return Math.min(max, Math.max(0, scrollLeft + delta));
}
