import assert from 'node:assert/strict';
import test from 'node:test';

import * as newtabCore from '../newtab-core.mjs';

import {
  FOLDER_NAME_MAX_LENGTH,
  MAX_BACKGROUND_BYTES,
  MAX_BACKGROUND_DIMENSION,
  SITE_TITLE_MAX_LENGTH,
  buildFaviconSources,
  deriveTitleFromUrl,
  getFolderRevealScrollLeft,
  getFolderScrollState,
  getFolderWheelScrollLeft,
  getWheelScrollDelta,
  isUsableFavicon,
  moveItemByDelta,
  normalizeLegacyColorBackground,
  renameFolder,
  validateBackgroundImage,
  validateFolderName,
  validateSiteDraft,
} from '../newtab-core.mjs';

const pageUrl = 'https://sheets.google.com/spreadsheets/d/example?usp=sharing';

test('validates and normalizes a site draft before it reaches storage', () => {
  assert.equal(SITE_TITLE_MAX_LENGTH, 500);
  assert.deepEqual(validateSiteDraft({ title: '', url: 'github.com' }), {
    ok: true,
    url: 'https://github.com/',
  });
  assert.deepEqual(validateSiteDraft({ title: 'x'.repeat(500), url: 'https://example.com' }), {
    ok: true,
    url: 'https://example.com/',
  });
});

test('rejects invalid site URLs and titles beyond the persisted limit', () => {
  assert.deepEqual(validateSiteDraft({ title: '', url: 'https://' }), {
    ok: false,
    field: 'url',
    error: 'invalid-url',
  });
  assert.deepEqual(validateSiteDraft({ title: '', url: 'javascript:alert(1)' }), {
    ok: false,
    field: 'url',
    error: 'invalid-url',
  });
  assert.deepEqual(validateSiteDraft({ title: 'x'.repeat(501), url: 'example.com' }), {
    ok: false,
    field: 'title',
    error: 'title-too-long',
  });
});

test('validates folder names against the persisted limit', () => {
  assert.equal(FOLDER_NAME_MAX_LENGTH, 200);
  assert.deepEqual(validateFolderName('  Work  '), { ok: true, name: 'Work' });
  assert.deepEqual(validateFolderName('x'.repeat(200)), {
    ok: true,
    name: 'x'.repeat(200),
  });
  assert.deepEqual(validateFolderName('   '), { ok: false, error: 'required' });
  assert.deepEqual(validateFolderName('x'.repeat(201)), {
    ok: false,
    error: 'name-too-long',
  });
});

test('moves an item one position without mutating the input order', () => {
  const ids = ['one', 'two', 'three'];

  assert.deepEqual(moveItemByDelta(ids, 'two', -1), {
    ids: ['two', 'one', 'three'],
    moved: true,
    position: 1,
  });
  assert.deepEqual(moveItemByDelta(ids, 'two', 1), {
    ids: ['one', 'three', 'two'],
    moved: true,
    position: 3,
  });
  assert.deepEqual(ids, ['one', 'two', 'three']);
});

test('keeps order stable at keyboard reorder boundaries and for stale ids', () => {
  assert.deepEqual(moveItemByDelta(['one', 'two'], 'one', -1), {
    ids: ['one', 'two'],
    moved: false,
    position: 1,
  });
  assert.deepEqual(moveItemByDelta(['one', 'two'], 'two', 1), {
    ids: ['one', 'two'],
    moved: false,
    position: 2,
  });
  assert.deepEqual(moveItemByDelta(['one', 'two'], 'missing', 1), {
    ids: ['one', 'two'],
    moved: false,
    position: 0,
  });
});

test('derives concise titles locally without reading website content', () => {
  assert.equal(deriveTitleFromUrl('https://sheets.google.com/'), 'Google Sheets');
  assert.equal(deriveTitleFromUrl('https://github.com/org/repo'), 'GitHub');
  assert.equal(deriveTitleFromUrl('https://app.callgear.com/'), 'Callgear');
  assert.equal(deriveTitleFromUrl('not a url', 'Site'), 'Site');
});

test('uses the page-specific Chrome favicon before the Google hostname fallback', () => {
  const runtime = {
    getURL(path) {
      return `chrome-extension://test-extension${path}`;
    },
  };

  const sources = buildFaviconSources(pageUrl, runtime);
  const chromeSource = new URL(sources[0]);
  const googleSource = new URL(sources[1]);

  assert.equal(googleSource.origin, 'https://www.google.com');
  assert.equal(googleSource.pathname, '/s2/favicons');
  assert.equal(googleSource.searchParams.get('domain'), 'sheets.google.com');
  assert.equal(googleSource.searchParams.get('sz'), '64');
  assert.equal(chromeSource.protocol, 'chrome-extension:');
  assert.equal(chromeSource.host, 'test-extension');
  assert.equal(chromeSource.pathname, '/_favicon/');
  assert.equal(chromeSource.searchParams.get('pageUrl'), pageUrl);
  assert.equal(chromeSource.searchParams.get('size'), '64');
});

test('starts with Google S2 outside an extension runtime', () => {
  const sources = buildFaviconSources(pageUrl, null);
  assert.equal(sources.length, 1);
  const source = new URL(sources[0]);
  assert.equal(source.searchParams.get('domain'), 'sheets.google.com');
  assert.equal(source.searchParams.get('sz'), '64');
});

test('returns no favicon sources for invalid or non-web URLs', () => {
  assert.deepEqual(buildFaviconSources('github.com', null), []);
  assert.deepEqual(buildFaviconSources('javascript:alert(1)', null), []);
  assert.deepEqual(buildFaviconSources('not a URL', null), []);
});

test('rejects empty images and the 16px service placeholder', () => {
  assert.equal(isUsableFavicon({ naturalWidth: 0, naturalHeight: 0 }), false);
  assert.equal(isUsableFavicon({ naturalWidth: 16, naturalHeight: 16 }), false);
});

test('accepts loaded favicons larger than the service placeholder', () => {
  assert.equal(isUsableFavicon({ naturalWidth: 28, naturalHeight: 28 }), true);
  assert.equal(isUsableFavicon({ naturalWidth: 32, naturalHeight: 32 }), true);
  assert.equal(isUsableFavicon({ naturalWidth: 64, naturalHeight: 64 }), true);
  assert.equal(isUsableFavicon({ naturalWidth: 32, naturalHeight: 16 }), true);
});

test('maps plain A, F, and S keys to global actions', () => {
  assert.equal(typeof newtabCore.getGlobalShortcutAction, 'function');
  const { getGlobalShortcutAction } = newtabCore;
  assert.equal(getGlobalShortcutAction({ key: 'a' }), 'add-site');
  assert.equal(getGlobalShortcutAction({ key: 'F' }), 'add-folder');
  assert.equal(getGlobalShortcutAction({ key: 's' }), 'settings');
  assert.equal(getGlobalShortcutAction({ key: 'x' }), null);
});

test('maps physical A, F, and S keys independently of the active layout', () => {
  const { getGlobalShortcutAction } = newtabCore;
  assert.equal(getGlobalShortcutAction({ code: 'KeyA', key: 'ф' }), 'add-site');
  assert.equal(getGlobalShortcutAction({ code: 'KeyF', key: 'а' }), 'add-folder');
  assert.equal(getGlobalShortcutAction({ code: 'KeyS', key: 'ы' }), 'settings');
  assert.equal(getGlobalShortcutAction({ code: 'KeyX', key: 'ч' }), null);
});

test('uses event.key only when a physical code is unavailable', () => {
  const { getGlobalShortcutAction } = newtabCore;
  assert.equal(getGlobalShortcutAction({ key: 'a' }), 'add-site');
  assert.equal(getGlobalShortcutAction({ key: 'F' }), 'add-folder');
  assert.equal(getGlobalShortcutAction({ code: 'KeyX', key: 'a' }), null);
});

test('ignores global shortcuts while editing, in dialogs, on repeats, or with modifiers', () => {
  assert.equal(typeof newtabCore.getGlobalShortcutAction, 'function');
  const { getGlobalShortcutAction } = newtabCore;
  for (const blockedState of [
    { isEditable: true },
    { isDialogOpen: true },
    { repeat: true },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
  ]) {
    assert.equal(getGlobalShortcutAction({ key: 'a', ...blockedState }), null);
  }
});

test('uses conservative custom background limits that fit local storage safely', () => {
  assert.equal(MAX_BACKGROUND_BYTES, 3 * 1024 * 1024);
  assert.equal(MAX_BACKGROUND_DIMENSION, 4096);

  assert.deepEqual(
    validateBackgroundImage({
      type: 'image/webp',
      size: 3 * 1024 * 1024,
      width: 4096,
      height: 4096,
    }),
    { ok: true },
  );
  assert.deepEqual(
    validateBackgroundImage({ type: 'text/plain', size: 100, width: 100, height: 100 }),
    { ok: false, error: 'invalid-type' },
  );
  assert.deepEqual(
    validateBackgroundImage({ type: 'image/png', size: 3 * 1024 * 1024 + 1 }),
    { ok: false, error: 'file-too-large' },
  );
  assert.deepEqual(
    validateBackgroundImage({ type: 'image/jpeg', size: 100, width: 4097, height: 200 }),
    { ok: false, error: 'dimensions-too-large' },
  );
  assert.deepEqual(
    validateBackgroundImage({ type: 'image/png', size: 100, width: 0, height: 200 }),
    { ok: false, error: 'decode-failed' },
  );
});

test('maps a legacy solid color to the default image with a 100 percent overlay', () => {
  const legacy = { type: 'color', value: '#123456', overlay: 0, overlayColor: '#ffffff' };
  const defaults = {
    type: 'image',
    value: 'images/default-background.webp',
    overlay: 0,
    overlayColor: '#f4f6f3',
  };

  assert.deepEqual(normalizeLegacyColorBackground(legacy, defaults), {
    type: 'image',
    value: 'images/default-background.webp',
    overlay: 100,
    overlayColor: '#123456',
  });
  assert.equal(legacy.type, 'color');
});

test('keeps a solid color background when the default background is also solid', () => {
  const background = { type: 'color', value: '#123456', overlay: 0, overlayColor: '#123456' };
  const defaults = { type: 'color', value: '#457b9d', overlay: 0, overlayColor: '#457b9d' };
  const normalized = normalizeLegacyColorBackground(background, defaults);

  assert.deepEqual(normalized, background);
  assert.notEqual(normalized, background);
});

test('clones a non-color background without changing it', () => {
  const background = {
    type: 'image',
    value: 'data:image/png;base64,AAAA',
    overlay: 25,
    overlayColor: '#abcdef',
    customAssetId: 'local',
  };
  const normalized = normalizeLegacyColorBackground(background, {});

  assert.deepEqual(normalized, background);
  assert.notEqual(normalized, background);
});

test('reports whether the folder row can scroll in either direction', () => {
  assert.deepEqual(
    getFolderScrollState({ scrollLeft: 0, clientWidth: 400, scrollWidth: 700 }),
    { canScrollLeft: false, canScrollRight: true },
  );
  assert.deepEqual(
    getFolderScrollState({ scrollLeft: 300, clientWidth: 400, scrollWidth: 700 }),
    { canScrollLeft: true, canScrollRight: false },
  );
  assert.deepEqual(
    getFolderScrollState({ scrollLeft: 0, clientWidth: 400, scrollWidth: 300 }),
    { canScrollLeft: false, canScrollRight: false },
  );
});

test('uses the dominant wheel axis for horizontal folder scrolling', () => {
  assert.equal(getWheelScrollDelta(4, 80), 80);
  assert.equal(getWheelScrollDelta(-60, 10), -60);
});

test('keeps the current folder scroll position when the active chip is visible', () => {
  assert.equal(
    getFolderRevealScrollLeft({
      scrollLeft: 100,
      clientWidth: 400,
      scrollWidth: 800,
      activeOffsetLeft: 200,
      activeOffsetWidth: 100,
    }),
    100,
  );
});

test('reveals folder chips clipped by either viewport edge with padding', () => {
  assert.equal(
    getFolderRevealScrollLeft({
      scrollLeft: 200,
      clientWidth: 400,
      scrollWidth: 800,
      activeOffsetLeft: 210,
      activeOffsetWidth: 80,
    }),
    186,
  );
  assert.equal(
    getFolderRevealScrollLeft({
      scrollLeft: 100,
      clientWidth: 400,
      scrollWidth: 800,
      activeOffsetLeft: 430,
      activeOffsetWidth: 80,
    }),
    134,
  );
});

test('clamps folder reveal targets to the available scroll range', () => {
  const row = { clientWidth: 400, scrollWidth: 800, activeOffsetWidth: 70 };

  assert.equal(
    getFolderRevealScrollLeft({
      ...row,
      scrollLeft: 300,
      activeOffsetLeft: 0,
    }),
    0,
  );
  assert.equal(
    getFolderRevealScrollLeft({
      ...row,
      scrollLeft: 0,
      activeOffsetLeft: 720,
    }),
    400,
  );
});

test('clamps wheel scrolling and is a no-op at both row edges', () => {
  const row = { clientWidth: 400, scrollWidth: 700 };

  assert.equal(getFolderWheelScrollLeft({ ...row, scrollLeft: 0 }, -80), 0);
  assert.equal(getFolderWheelScrollLeft({ ...row, scrollLeft: 300 }, 80), 300);
  assert.equal(getFolderWheelScrollLeft({ ...row, scrollLeft: 100 }, 80), 180);
  assert.equal(
    getFolderWheelScrollLeft({ scrollLeft: 0, clientWidth: 400, scrollWidth: 300 }, 80),
    0,
  );
});

test('renames a folder with a trimmed name without mutating the original array', () => {
  const folders = [
    { id: 'root', name: 'Все' },
    { id: 'work', name: 'Работа' },
    { id: 'life', name: 'Личное' },
  ];

  const result = renameFolder(folders, 'work', '  Проекты  ');

  assert.equal(result.renamed, true);
  assert.notEqual(result.folders, folders);
  assert.deepEqual(result.folders, [
    { id: 'root', name: 'Все' },
    { id: 'work', name: 'Проекты' },
    { id: 'life', name: 'Личное' },
  ]);
  assert.equal(folders[1].name, 'Работа');
});

test('does not rename a folder for a blank name or stale id', () => {
  const folders = [
    { id: 'root', name: 'Все' },
    { id: 'work', name: 'Работа' },
    { id: 'life', name: 'Личное' },
  ];

  const blankResult = renameFolder(folders, 'work', '   ');
  const staleResult = renameFolder(folders, 'missing', 'Проекты');

  assert.deepEqual(blankResult, { folders, renamed: false });
  assert.equal(blankResult.folders, folders);
  assert.deepEqual(staleResult, { folders, renamed: false });
  assert.equal(staleResult.folders, folders);
});

test('allows duplicate folder names without changing ids or order', () => {
  const folders = [
    { id: 'root', name: 'Все' },
    { id: 'work', name: 'Работа' },
    { id: 'life', name: 'Личное' },
  ];

  const result = renameFolder(folders, 'work', 'Личное');

  assert.equal(result.renamed, true);
  assert.deepEqual(result.folders.map(({ id }) => id), ['root', 'work', 'life']);
  assert.deepEqual(result.folders.map(({ name }) => name), ['Все', 'Личное', 'Личное']);
});
