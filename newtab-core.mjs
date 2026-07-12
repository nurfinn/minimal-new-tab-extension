export function buildFaviconSources(value, runtime = globalThis.chrome?.runtime) {
  let pageUrl;
  try {
    pageUrl = new URL(value);
  } catch {
    return [];
  }

  if (!['http:', 'https:'].includes(pageUrl.protocol) || !pageUrl.hostname) {
    return [];
  }

  const sources = [];

  if (typeof runtime?.getURL === 'function') {
    const chromeFaviconUrl = new URL(runtime.getURL('/_favicon/'));
    chromeFaviconUrl.searchParams.set('pageUrl', pageUrl.href);
    chromeFaviconUrl.searchParams.set('size', '64');
    sources.push(chromeFaviconUrl.href);
  }

  const googleFaviconUrl = new URL('https://www.google.com/s2/favicons');
  googleFaviconUrl.searchParams.set('domain', pageUrl.hostname);
  googleFaviconUrl.searchParams.set('sz', '64');
  sources.push(googleFaviconUrl.href);

  return [...new Set(sources)];
}

export const MAX_BACKGROUND_BYTES = 3 * 1024 * 1024;
export const MAX_BACKGROUND_DIMENSION = 4096;

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
  const name = String(value ?? '').trim();
  const folderIndex = folders.findIndex(({ id }) => id === folderId);

  if (!name || folderIndex === -1) {
    return { folders, renamed: false };
  }

  const nextFolders = [...folders];
  nextFolders[folderIndex] = { ...nextFolders[folderIndex], name };

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
