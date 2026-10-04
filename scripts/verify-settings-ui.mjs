// Optional browser regression suite. Test profiles and API doubles only.
// Run with PLAYWRIGHT_MODULE and optionally SETTINGS_QA_OUTPUT.
// SETTINGS_REAL_CHROME=1 also exercises the installed build and real storage in
// an isolated Chromium profile, including full close/reopen.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChromeRelease } from './build-chrome.mjs';
import { buildFirefoxRelease } from './build-firefox.mjs';
import { createStorageService, STORAGE_KEYS } from '../storage-service.mjs';
import { FEATURE_KEYS } from '../feature-generation.mjs';
import { serializeBackup } from '../backup-service.mjs';

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const output = process.env.SETTINGS_QA_OUTPUT ? resolve(process.env.SETTINGS_QA_OUTPUT)
  : await mkdtemp(join(tmpdir(), 'minimal-tab-settings-'));
await mkdir(output, { recursive: true });
const report = { output, checks: [], layouts: [], consoleErrors: [], limitations: [
  'Storage and Firefox permission APIs are doubled; application/service/builds are unchanged.',
  'No personal profile, signed add-on, Google account, cross-device sync, or native consent popup is tested.',
  'Synthetic events are not physical trackpad gestures. Gesture regression is a separate suite.',
  '125% layout is modeled with a reduced CSS viewport and DPR 1.25, not a native browser zoom control.',
] };
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const path = resolve(output, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
    if (!path.startsWith(output + sep)) throw new Error('Outside QA root');
    const data = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    response.end(data);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((yes) => server.listen(0, '127.0.0.1', yes));
const origin = `http://127.0.0.1:${server.address().port}`;

function area() {
  return {
    data: {}, commits: 0, failSet: false,
    async get(keys = null) {
      if (keys === null) return structuredClone(this.data);
      return Object.fromEntries((typeof keys === 'string' ? [keys] : keys)
        .filter((key) => Object.hasOwn(this.data, key)).map((key) => [key, structuredClone(this.data[key])]));
    },
    async set(values) {
      if (this.delaySet) await new Promise((resolve) => setTimeout(resolve, this.delaySet));
      if (this.failSet || (this.failManifest && Object.hasOwn(values, STORAGE_KEYS.manifest))) throw new Error('QA write failed');
      Object.assign(this.data, structuredClone(values));
      if (Object.hasOwn(values, STORAGE_KEYS.manifest)) this.commits += 1;
    },
    async remove(keys) {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete this.data[key];
    },
  };
}

function fixture(image = 'images/default-background.png') {
  return {
    selectedFolderId: 'all', shortcutsEnabled: true,
    folders: [{ id: 'root', name: 'Favorites' }, { id: 'work', name: 'Work' },
      { id: 'entertainment', name: 'Entertainment' }, { id: 'long', name: 'A very long folder name for layout testing' }],
    links: Array.from({ length: 25 }, (_, i) => ({ id: `site-${i}`, title: `Site ${i + 1}`,
      url: `https://example.com/${i}`, folderId: i < 10 ? 'work' : 'entertainment' })),
    background: { type: 'image', value: image, overlay: 0, overlayColor: '#17122b' },
  };
}

async function check(name, action) {
  try { await action(); report.checks.push({ name, ok: true }); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { report.checks.push({ name, ok: false, error: error.stack }); process.stdout.write(`FAIL ${name}: ${error.message}\n`); }
}

async function openSettings(page) {
  if (!(await page.locator('#settingsDialog').isVisible())) await page.locator('#settingsButton').click();
  await page.locator('#settingsDialog[open]').waitFor();
}

async function run(platform, build) {
  const root = join(output, platform);
  await build({ sourceRoot, outputDir: root, archivePath: join(output, `minimal-tab-${platform}-ui-test.zip`) });
  const browser = await (platform === 'chrome' ? playwright.chromium : playwright.firefox).launch({ headless: true });
  const image = await readFile(join(root, 'images/default-background.png'));
  const imageData = `data:image/png;base64,${image.toString('base64')}`;
  const sync = area();
  const local = area();
  const service = createStorageService({ syncArea: sync, localArea: local, logger: null });
  const seed = fixture(imageData);
  assert.equal((await service.save(seed)).ok, true);
  const permission = { enabled: true, pending: null, calls: 0 };
  let context;
  let page;
  const url = `${origin}/${platform}/newtab.html`;
  async function createContext(locale = 'en', viewport = { width: 1280, height: 800 }, deviceScaleFactor = 1) {
    const messages = JSON.parse(await readFile(join(root, `_locales/${locale}/messages.json`), 'utf8'));
    const ctx = await browser.newContext({ viewport, deviceScaleFactor, reducedMotion: 'reduce' });
    ctx.setDefaultTimeout(5000);
    await ctx.exposeBinding('__settingsStorage', (_, name, method, value) => ({ sync, local })[name][method](value));
    await ctx.exposeBinding('__settingsPermission', (_, method) => {
      if (method === 'getAll') return { data_collection: permission.enabled ? ['browsingActivity'] : [] };
      if (method === 'remove') { permission.enabled = false; return true; }
      permission.calls += 1;
      return new Promise((yes, no) => { permission.pending = { resolve: (value) => {
        permission.enabled = value; permission.pending = null; yes(value);
      }, reject: () => { permission.pending = null; no(new Error('QA permission error')); } }; });
    });
    await ctx.addInitScript(({ messages, platform, locale }) => {
      const apiArea = (name) => Object.fromEntries(['get', 'set', 'remove']
        .map((method) => [method, (value) => globalThis.__settingsStorage(name, method, value)]));
      const listeners = new Set();
      const api = {
        storage: { sync: apiArea('sync'), local: apiArea('local') },
        i18n: { getUILanguage: () => locale,
          getMessage: (key, substitutions = []) => {
            if (key === '@@ui_locale') return locale;
            const entry = messages[key];
            const values = Array.isArray(substitutions) ? substitutions : [substitutions];
            return (entry?.message || '').replace(/\$([a-z][a-z0-9_]*)\$/gi, (_, name) =>
              Object.entries(entry.placeholders || {}).find(([id]) => id.toLowerCase() === name.toLowerCase())?.[1].content || '')
              .replace(/\$(\d+)/g, (_, index) => String(values[Number(index) - 1] ?? ''));
          } },
        runtime: { getURL: (path) => new URL(path, location.href).href },
        permissions: { getAll: () => globalThis.__settingsPermission('getAll'),
          request: () => globalThis.__settingsPermission('request'), remove: () => globalThis.__settingsPermission('remove'),
          onAdded: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) },
          onRemoved: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) } },
      };
      globalThis.__qaEmitPermissionChange = () => { for (const fn of listeners) fn(); };
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      globalThis.__qaObjectUrls = new Set();
      URL.createObjectURL = (...args) => { const result = create(...args); __qaObjectUrls.add(result); return result; };
      URL.revokeObjectURL = (value) => { __qaObjectUrls.delete(value); revoke(value); };
      Object.defineProperty(globalThis, platform === 'firefox' ? 'browser' : 'chrome', { configurable: true, value: api });
    }, { messages, platform, locale });
    await ctx.route('**/*', (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    ctx.on('page', (p) => p.on('pageerror', (error) => report.consoleErrors.push(`${platform}: ${error.message}`)));
    return ctx;
  }
  async function reloadSeed() {
    sync.failSet = false;
    assert.equal((await service.save(seed)).ok, true);
    await page.goto(url);
    await page.locator('#folderRow [data-folder]').first().waitFor();
    await openSettings(page);
  }
  try {
    context = await createContext();
    page = await context.newPage();
    await reloadSeed();
    await check(`${platform}: default is a cancellable draft, not an immediate write`, async () => {
      const commits = sync.commits;
      await page.locator('#resetBackgroundButton').click();
      assert.equal(await page.locator('#settingsDialog[open]').count(), 1);
      assert.equal(sync.commits, commits);
      await page.locator('#singleKeyShortcuts').uncheck();
      await page.locator('#settingsDialog [data-close="settingsDialog"]').last().click();
      assert.equal(sync.commits, commits);
      const loaded = await service.load(seed);
      assert.ok(loaded.state.background.customAssetId);
      await openSettings(page);
      assert.equal(await page.locator('#singleKeyShortcuts').isChecked(), true);
    });
    await reloadSeed();
    await check(`${platform}: choosing, changing tabs and Cancel preserve draft without writes`, async () => {
      const commits = sync.commits;
      await page.locator('#backgroundImage').setInputFiles({ name: 'wallpaper.png', mimeType: 'image/png', buffer: image });
      await page.waitForFunction(() => document.getElementById('backgroundPreviewImage').style.backgroundImage.includes('blob:'));
      assert.equal(await page.locator('#backgroundSelectedFile').textContent(), 'Selected for saving: wallpaper.png');
      await page.locator('#singleKeyShortcuts').uncheck();
      await page.locator('#backupSettingsTab').click();
      await page.locator('#backgroundSettingsTab').click();
      assert.equal(await page.locator('#singleKeyShortcuts').isChecked(), false);
      assert.equal(sync.commits, commits);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#settingsDialog[open]').count(), 0);
      assert.equal(sync.commits, commits);
      // Native dialog.close dispatches its cleanup event in a queued task.
      await page.waitForFunction(() => __qaObjectUrls.size === 0);
      assert.equal(await page.evaluate(() => __qaObjectUrls.size), 0);
    });
    await reloadSeed();
    await check(`${platform}: Save persists upload and shortcut choice across reload`, async () => {
      await page.locator('#backgroundImage').setInputFiles({ name: 'wallpaper.png', mimeType: 'image/png', buffer: image });
      await page.waitForFunction(() => document.getElementById('backgroundPreviewImage').style.backgroundImage.includes('blob:'));
      await page.locator('#singleKeyShortcuts').uncheck();
      await page.locator('#settingsDialog button[type="submit"]').click();
      await page.locator('#settingsDialog').waitFor({ state: 'hidden' });
      const loaded = await service.load(seed);
      assert.equal(loaded.state.shortcutsEnabled, false);
      assert.ok(loaded.state.background.customAssetId);
      await page.reload();
      await page.locator('#folderRow [data-folder]').first().waitFor();
      await openSettings(page);
      assert.equal(await page.locator('#singleKeyShortcuts').isChecked(), false);
      assert.ok((await page.locator('#backgroundPreviewImage').evaluate((el) => el.style.backgroundImage)).includes('data:image/'));
    });
    await reloadSeed();
    await check(`${platform}: failed Save keeps the draft and image preview`, async () => {
      await page.locator('#backgroundImage').setInputFiles({ name: 'wallpaper.png', mimeType: 'image/png', buffer: image });
      await page.waitForFunction(() => document.getElementById('backgroundPreviewImage').style.backgroundImage.includes('blob:'));
      await page.locator('#singleKeyShortcuts').uncheck();
      sync.failSet = true;
      await page.locator('#settingsDialog button[type="submit"]').click();
      await page.locator('#backgroundImageError').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#singleKeyShortcuts').isChecked(), false);
      assert.equal(await page.locator('#settingsDialog[open]').count(), 1);
      assert.ok((await page.locator('#backgroundPreviewImage').evaluate((el) => el.style.backgroundImage)).includes('blob:'));
      sync.failSet = false;
      await page.locator('#settingsDialog button[type="submit"]').click();
      await page.locator('#settingsDialog').waitFor({ state: 'hidden' });
    });
    await reloadSeed();
    await check(`${platform}: failed distinct wallpaper replacement retains old bytes and preview after reload`, async () => {
      const replacement = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
        const context = canvas.getContext('2d'); context.fillStyle = '#247d92'; context.fillRect(0, 0, 2, 2);
        return canvas.toDataURL('image/png');
      });
      const previous = structuredClone(local.data[STORAGE_KEYS.localBackground]);
      const previousHead = structuredClone(sync.data[STORAGE_KEYS.manifest]);
      assert.notEqual(replacement, previous.dataUrl);
      await page.locator('#backgroundImage').setInputFiles({ name: 'replacement.png', mimeType: 'image/png',
        buffer: Buffer.from(replacement.split(',')[1], 'base64') });
      await page.waitForFunction(() => document.getElementById('backgroundPreviewImage').style.backgroundImage.includes('blob:'));
      try {
        sync.failManifest = true;
        await page.locator('#saveBackgroundButton').click();
        await page.locator('#backgroundImageError').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#settingsDialog[open]').count(), 1);
        assert.deepEqual(local.data[STORAGE_KEYS.localBackground], previous);
        assert.deepEqual(sync.data[STORAGE_KEYS.manifest], previousHead);
        assert.equal(local.data[STORAGE_KEYS.pendingBackground].dataUrl, replacement);
      } finally { sync.failManifest = false; }
      await page.reload();
      await page.locator('#folderRow [data-folder]').first().waitFor();
      await openSettings(page);
      assert.ok((await page.locator('#backgroundPreviewImage').evaluate(el => el.style.backgroundImage)).includes(previous.dataUrl));
      assert.equal((await service.load(seed)).state.background.value, previous.dataUrl);
      await page.screenshot({ path: join(output, `${platform}-failed-background-restored.png`) });
      await page.locator('#backgroundImage').setInputFiles({ name: 'replacement.png', mimeType: 'image/png',
        buffer: Buffer.from(replacement.split(',')[1], 'base64') });
      await page.waitForFunction(() => document.getElementById('backgroundPreviewImage').style.backgroundImage.includes('blob:'));
      await page.locator('#saveBackgroundButton').click();
      await page.locator('#settingsDialog').waitFor({ state: 'hidden' });
      assert.equal((await service.load(seed)).state.background.value, replacement);
      assert.equal(Object.hasOwn(local.data, STORAGE_KEYS.pendingBackground), false);
    });
    await reloadSeed();
    await check(`${platform}: image button, overlay keyboard and Cancel share one draft`, async () => {
      const commits = sync.commits;
      const choosing = page.waitForEvent('filechooser');
      await page.locator('#changeBackgroundImageButton').click();
      await (await choosing).setFiles({ name: 'wallpaper.png', mimeType: 'image/png', buffer: image });
      await page.waitForFunction(() => document.getElementById('backgroundPreviewImage').style.backgroundImage.includes('blob:'));
      await page.locator('#backgroundOverlay').press('End');
      assert.equal(await page.locator('#backgroundOverlayValue').textContent(), '100%');
      await page.locator('#backgroundOverlayColor').evaluate((el) => {
        el.value = '#334455'; el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      assert.equal(await page.locator('#backgroundPreviewImage').evaluate((el) => el.style.getPropertyValue('--preview-overlay-opacity')), '1');
      await page.locator('#settingsDialog [data-close="settingsDialog"]').last().click();
      await page.waitForFunction(() => __qaObjectUrls.size === 0);
      assert.equal(sync.commits, commits);
      assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--bg-overlay-opacity')), '0');
      await openSettings(page);
      assert.equal(await page.locator('#backgroundOverlayColor').inputValue(), '#17122b');
    });
    await reloadSeed();
    await check(`${platform}: missing local image stays a fallback and keeps its identity`, async () => {
      local.data = {};
      await page.goto(url);
      await page.locator('#folderRow [data-folder]').first().waitFor();
      await openSettings(page);
      assert.match(await page.locator('#backgroundPreviewName').textContent(), /unavailable/);
      assert.ok((await page.locator('#backgroundPreviewImage').evaluate((el) => el.style.backgroundImage)).includes('default-background.png'));
      const before = (await service.load(seed)).state.background.customAssetId;
      await page.locator('#backgroundOverlay').press('ArrowRight');
      await page.locator('#saveBackgroundButton').click();
      await page.locator('#settingsDialog').waitFor({ state: 'hidden' });
      assert.equal((await service.load(seed)).state.background.customAssetId, before);
      await openSettings(page);
      await page.locator('#resetBackgroundButton').click();
      await page.locator('#saveBackgroundButton').click();
      await page.locator('#settingsDialog').waitFor({ state: 'hidden' });
      assert.equal((await service.load(fixture())).state.background.customAssetId, undefined);
    });
    await reloadSeed();
    await check(`${platform}: invalid and undecodable uploads are recoverable`, async () => {
      const commits = sync.commits;
      for (const file of [
        { name: 'text.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') },
        { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
        { name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(3 * 1024 * 1024 + 1) },
      ]) {
        await page.locator('#backgroundImage').setInputFiles(file);
        await page.locator('#backgroundImageError').waitFor({ state: 'visible' });
        assert.equal(sync.commits, commits);
      }
      const oversize = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 4097; canvas.height = 1;
        return canvas.toDataURL('image/png').split(',')[1];
      });
      await page.locator('#backgroundImage').setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: Buffer.from(oversize, 'base64') });
      await page.waitForFunction(() => document.getElementById('backgroundImageError').textContent.includes('4096'));
      assert.equal(sync.commits, commits);
      await page.locator('#backgroundImage').setInputFiles({ name: 'valid.png', mimeType: 'image/png', buffer: image });
      await page.waitForFunction(() => document.getElementById('backgroundPreviewImage').style.backgroundImage.includes('blob:'));
      assert.equal(await page.locator('#backgroundImageError').isVisible(), false);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => __qaObjectUrls.size === 0);
      assert.equal(await page.evaluate(() => __qaObjectUrls.size), 0);
    });
    if (platform === 'firefox') {
      await reloadSeed();
      await check('firefox: granted startup remains coherent after localization', async () => {
        assert.equal(await page.locator('#remoteFaviconToggle').isChecked(), true);
        assert.equal((await page.locator('#remoteFaviconStatus').textContent()).trim(), 'On');
      });
      await check('firefox: wait, deny, allow, revoke and error keep a consistent switch', async () => {
        const commits = sync.commits;
        permission.enabled = false;
        await page.evaluate(() => __qaEmitPermissionChange());
        await page.waitForFunction(() => !document.getElementById('remoteFaviconToggle').checked);
        await page.locator('#remoteFaviconToggle').click();
        await page.waitForFunction(() => document.getElementById('remoteFaviconToggle').disabled);
        assert.equal(await page.locator('#remoteFaviconToggle').isChecked(), false);
        assert.match(await page.locator('#remoteFaviconStatus').textContent(), /Waiting/);
        await page.screenshot({ path: join(output, 'firefox-en-permission-pending.png') });
        permission.pending.resolve(false);
        await page.waitForFunction(() => !document.getElementById('remoteFaviconToggle').disabled);
        assert.equal(await page.locator('#remoteFaviconToggle').isChecked(), false);
        await page.locator('#remoteFaviconToggle').click();
        await page.waitForFunction(() => document.getElementById('remoteFaviconToggle').disabled);
        permission.pending.resolve(true);
        await page.waitForFunction(() => document.getElementById('remoteFaviconToggle').checked
          && !document.getElementById('remoteFaviconToggle').disabled);
        await page.locator('#remoteFaviconToggle').click();
        await page.waitForFunction(() => !document.getElementById('remoteFaviconToggle').checked
          && !document.getElementById('remoteFaviconToggle').disabled);
        await page.locator('#remoteFaviconToggle').click();
        await page.waitForFunction(() => document.getElementById('remoteFaviconToggle').disabled);
        permission.pending.reject();
        await page.locator('#faviconSettingsError').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#remoteFaviconToggle').isChecked(), false);
        assert.equal(await page.locator('#remoteFaviconToggle').isDisabled(), false);
        await page.locator('#remoteFaviconToggle').click();
        await page.waitForFunction(() => document.getElementById('remoteFaviconToggle').disabled);
        permission.pending.resolve(true);
        await page.waitForFunction(() => document.getElementById('remoteFaviconToggle').checked
          && !document.getElementById('remoteFaviconToggle').disabled);
        await page.locator('#settingsDialog [data-close="settingsDialog"]').last().click();
        await openSettings(page);
        assert.equal(await page.locator('#remoteFaviconToggle').isChecked(), true, 'Cancel does not revoke a separately applied permission');
        assert.equal(sync.commits, commits, 'permission changes never write application storage');
      });
    }
    await reloadSeed();
    await check(`${platform}: backup file validation, cancel, preview, import and export`, async () => {
      const commits = sync.commits;
      await page.locator('#backupSettingsTab').click();
      assert.equal(await page.locator('#saveBackgroundButton').isVisible(), false);
      await page.locator('#importBackupInput').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') });
      await page.locator('#importError').waitFor({ state: 'visible' });
      const imported = fixture();
      imported.links = [{ id: 'imported', title: 'GitHub', url: 'https://github.com/', folderId: 'work', emoji: '🗺️' }];
      const payload = { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(serializeBackup(imported)) };
      await page.locator('#importBackupInput').setInputFiles(payload);
      await page.locator('#importPreview').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#importPreviewSites').textContent(), '1');
      assert.equal(sync.commits, commits);
      await page.locator('#cancelImportButton').click();
      assert.equal(await page.locator('#importPreview').isVisible(), false);
      assert.equal(sync.commits, commits);
      await page.locator('#importBackupInput').setInputFiles(payload);
      await page.locator('#confirmImportButton').waitFor({ state: 'visible' });
      await page.locator('#confirmImportButton').click();
      await page.locator('#importStatus').waitFor({ state: 'visible' });
      const loaded = (await service.load(seed)).state;
      assert.equal(loaded.links.length, 1);
      assert.ok(loaded.background.customAssetId);
      const download = page.waitForEvent('download');
      await page.locator('#exportBackupButton').click();
      const file = await download;
      const text = await readFile(await file.path(), 'utf8');
      assert.equal(JSON.parse(text).data.links[0].emoji, '🗺️');
      assert.equal(await page.locator('#importError').isVisible(), false);
    });
    await reloadSeed();
    await page.keyboard.press('Escape');
    await check(`${platform}: add, edit, emoji, reorder, reload and delete stay intact`, async () => {
      await page.locator('#addLinkButton').click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'linkUrl');
      await page.locator('#linkUrl').fill('github.com');
      await page.locator('#linkTitle').fill('GitHub QA');
      await page.locator('#linkFolder').selectOption('work');
      await page.locator('#linkIconButton').click();
      await page.locator('#emojiSearch').fill('🗺️');
      await page.locator('[data-site-emoji="🗺️"]').click();
      await page.locator('#linkSubmitButton').click();
      await page.locator('#linkDialog').waitFor({ state: 'hidden' });
      const created = (await service.load(seed)).state.links.find((link) => link.title === 'GitHub QA');
      assert.equal(created.url, 'https://github.com/');
      assert.equal(created.emoji, '🗺️');
      await page.locator(`[data-edit-link="${created.id}"]`).click();
      await page.locator('#linkTitle').fill('GitHub renamed');
      await page.locator('#linkSubmitButton').click();
      await page.locator('#linkDialog').waitFor({ state: 'hidden' });
      await page.locator('[data-folder="all"]').click();
      await page.waitForFunction(() => document.querySelector('[data-folder="all"]').getAttribute('aria-pressed') === 'true');
      // Selection renders optimistically; wait for its storage completion before
      // the next keyboard operation so this test is not racing a rerender.
      await page.waitForFunction(async () => {
        const { createStorageService } = await import('./storage-service.mjs');
        return (await createStorageService({ logger: null }).load({})).state?.selectedFolderId === 'all';
      });
      await page.locator(`[data-drag-link="${created.id}"]`).focus();
      await page.locator(`[data-drag-link="${created.id}"]`).press('ArrowRight');
      await page.waitForFunction((id) => document.querySelector('.link-card:nth-child(2)').dataset.linkId === id, created.id);
      await page.reload();
      await page.locator(`[data-edit-link="${created.id}"]`).waitFor();
      const reordered = (await service.load(seed)).state.links;
      assert.equal(reordered[1].id, created.id);
      assert.equal(reordered[1].title, 'GitHub renamed');
      assert.equal(reordered[1].emoji, '🗺️');
      await page.locator(`[data-edit-link="${created.id}"]`).click();
      await page.locator('#deleteLinkButton').click();
      await page.locator('#confirmDeleteButton').click();
      await page.locator('#linkDialog').waitFor({ state: 'hidden' });
      assert.equal((await service.load(seed)).state.links.some((link) => link.id === created.id), false);
    });
    await check(`${platform}: long folder names retain a visible nonzero count`, async () => {
      // Direct fixture replacement belongs to a new page, not a page whose
      // pending selection timer can still commit the preceding fixture.
      await page.close();
      page = await context.newPage();
      const longState = fixture();
      longState.links[0].folderId = 'long';
      longState.folders.push(...Array.from({ length: 20 }, (_, i) => ({ id: `many-${i}`, name: `Folder ${i + 1}` })));
      assert.equal((await service.save(longState)).ok, true);
      await page.goto(url);
      const button = page.locator('[data-folder="long"]');
      await button.waitFor();
      await button.focus();
      assert.equal(await button.locator('.folder-count').textContent(), '1');
      const longName = longState.folders.find((folder) => folder.id === 'long').name;
      assert.equal(await page.getByRole('button', { name: `${longName} 1`, exact: true }).count(), 1,
        'the full folder name and count are exposed once in the accessible button name');
      assert.equal(await page.locator('[data-folder="many-0"] .folder-count').isHidden(), true);
      const geometry = await button.evaluate((el) => {
        const label = el.querySelector('.folder-name');
        const count = el.querySelector('.folder-count');
        return { truncated: label.scrollWidth > label.clientWidth,
          countVisible: count.getBoundingClientRect().right <= el.getBoundingClientRect().right };
      });
      assert.equal(geometry.truncated, true);
      assert.equal(geometry.countVisible, true);
      await button.press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-folder="long"]').getAttribute('aria-pressed') === 'true');
      assert.equal(await page.locator('.link-card').count(), 1);
      // Finish the page's selection write before the harness replaces its seed.
      // Otherwise the previous page can commit its old snapshot over the fixture.
      await page.waitForFunction(async () => {
        const { createStorageService } = await import('./storage-service.mjs');
        return (await createStorageService({ logger: null }).load({})).state?.selectedFolderId === 'long';
      });
    });
    await check(`${platform}: folder manager keeps native keyboard reorder, rename and empty states`, async () => {
      await page.close();
      page = await context.newPage();
      const folderState = fixture();
      assert.equal((await service.save(folderState)).ok, true);
      await page.goto(url);
      await page.locator('#folderRow [data-folder]').first().waitFor();
      await page.locator('#addFolderButton').click();
      await page.locator('[data-drag-folder="work"]').press('ArrowDown');
      await page.waitForFunction(() => document.querySelector('#folderList .folder-list-item')?.dataset.folderId === 'entertainment');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.dragFolder), 'work');
      await page.locator('[data-rename-folder="work"]').click();
      const name = page.locator('[data-folder-rename-input="work"]');
      await name.fill('Renamed work');
      await name.press('Enter');
      await page.getByRole('button', { name: 'Rename folder Renamed work', exact: true }).waitFor();
      await page.screenshot({ path: join(output, `${platform}-en-folder-manager.png`) });
      await page.keyboard.press('Escape');
      const saved = (await service.load(seed)).state;
      assert.equal(saved.folders.find((folder) => folder.id === 'work').name, 'Renamed work');
      assert.equal(saved.folders.filter((folder) => folder.id !== 'root')[0].id, 'entertainment');
      await page.locator('[data-folder="long"]').click();
      await page.locator('#emptyState').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.link-card').count(), 0);
    });
    await page.close();
    await verifyFolderVisibility(platform, createContext, url, sync, local);
    await context.close();
    context = null;
    for (const locale of ['en', 'ru']) for (const viewport of [
      { width: 1280, height: 800 }, { width: 1024, height: 600 }, { width: 390, height: 700 },
    ]) {
      assert.equal((await service.save(fixture())).ok, true);
      permission.enabled = false;
      const ctx = await createContext(locale, viewport);
      const p = await ctx.newPage();
      await p.goto(url);
      await p.locator('#folderRow [data-folder]').first().waitFor();
      await openSettings(p);
      const id = `${platform}-${locale}-${viewport.width}x${viewport.height}`;
      await check(`${id}: fixed controls, one scroller, reference-aligned opacity, no overflow`, async () => {
        assert.equal(await p.locator('html').getAttribute('lang'), locale);
        const metrics = await p.evaluate(() => {
          const dialog = document.getElementById('settingsDialog');
          const box = (el) => el && { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y,
            width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height };
          return { dialog: box(dialog), header: box(dialog.querySelector('.modal-header')),
            footer: box(dialog.querySelector('.settings-footer')), body: box(dialog.querySelector('.settings-body')),
            rail: box(document.getElementById('backgroundOverlay')),
            preview: box(dialog.querySelector('.background-preview')),
            opacityLabel: box(dialog.querySelector('.overlay-opacity-control label')),
            opacityValue: box(document.getElementById('backgroundOverlayValue')),
            scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth,
            bodyScrollWidth: dialog.querySelector('.settings-body')?.scrollWidth,
            bodyClientWidth: dialog.querySelector('.settings-body')?.clientWidth };
        });
        report.layouts.push({ id, viewport, deviceScaleFactor: 1, ...metrics });
        assert.ok(metrics.body && metrics.footer, 'one bounded body and persistent footer exist');
        assert.ok(metrics.dialog.y >= 0 && metrics.dialog.y + metrics.dialog.height <= viewport.height);
        assert.ok(metrics.header.y >= metrics.dialog.y);
        assert.ok(metrics.footer.y + metrics.footer.height <= viewport.height);
        assert.ok(metrics.rail.width <= 216 && metrics.rail.width >= 80);
        if (locale === 'en' && viewport.width > 600) {
          const labelInset = metrics.opacityLabel.x - metrics.preview.x;
          const valueInset = metrics.preview.x + metrics.preview.width - metrics.opacityValue.x - metrics.opacityValue.width;
          assert.ok(labelInset >= 180 && labelInset <= 187,
            `Opacity starts at the reference inset (~183px), got ${labelInset.toFixed(2)}px`);
          assert.ok(valueInset >= 18 && valueInset <= 30,
            `Percentage retains the reference right inset (~24px), got ${valueInset.toFixed(2)}px`);
          assert.ok(metrics.rail.width >= 210, 'the compact reference rail is not shortened by unused flex space');
        }
        assert.ok(Math.abs(metrics.opacityLabel.y + metrics.opacityLabel.height / 2
          - metrics.rail.y - metrics.rail.height / 2) <= 1, 'Opacity and its slider are vertically aligned');
        assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1);
        assert.ok(metrics.bodyScrollWidth <= metrics.bodyClientWidth + 1);
        await p.screenshot({ path: join(output, `${id}-settings.png`) });
        await p.locator('.settings-body').evaluate((el) => { el.scrollTop = el.scrollHeight; });
        const after = await p.locator('.settings-footer').boundingBox();
        assert.ok(after.y + after.height <= viewport.height);
        assert.equal(await p.locator('#faviconSettingsRow').count(), platform === 'firefox' ? 1 : 0);
        await p.screenshot({ path: join(output, `${id}-settings-scrolled.png`) });
        await p.locator('.settings-body').evaluate((el) => { el.scrollTop = 0; });
        await p.locator('#backupSettingsTab').click();
        await p.locator('#backupSettingsTab').press('ArrowLeft');
        assert.equal(await p.locator('#backgroundSettingsTab').getAttribute('aria-selected'), 'true');
        await p.locator('#backgroundSettingsTab').press('End');
        assert.equal(await p.locator('#backupSettingsTab').getAttribute('aria-selected'), 'true');
        const compatibility = p.locator('#exportCompatibility');
        await compatibility.scrollIntoViewIfNeeded();
        assert.equal(await compatibility.isVisible(), true);
        assert.match(await compatibility.textContent(), locale === 'ru'
          ? /Опубликованные версии 1\.6 и более ранние/ : /Published versions 1\.6 and earlier/);
        assert.match(await p.locator('#exportDescription').textContent(), locale === 'ru' ? /эмодзи/ : /emoji/);
        assert.equal(await p.locator('#exportBackupButton').getAttribute('aria-describedby'),
          'exportDescription exportCompatibility');
        const backupMetrics = await p.evaluate(() => {
          const note = document.getElementById('exportCompatibility');
          const body = document.querySelector('#settingsDialog .settings-body');
          return { noteScrollWidth: note.scrollWidth, noteClientWidth: note.clientWidth,
            bodyScrollWidth: body.scrollWidth, bodyClientWidth: body.clientWidth };
        });
        assert.ok(backupMetrics.noteScrollWidth <= backupMetrics.noteClientWidth + 1);
        assert.ok(backupMetrics.bodyScrollWidth <= backupMetrics.bodyClientWidth + 1);
        report.layouts.push({ id: `${id}-backup-compatibility`, locale, ...backupMetrics });
        await p.screenshot({ path: join(output, `${id}-backup.png`) });
        await p.keyboard.press('Escape');
        await p.locator('#addLinkButton').click();
        await p.locator('#linkUrl').fill(`https://example.com/${'long-path/'.repeat(40)}`);
        const input = await p.locator('#linkUrl').boundingBox();
        const pencil = await p.locator('#linkIconButton').boundingBox();
        const select = await p.locator('#linkFolder').boundingBox();
        const wrapper = await p.locator('.folder-picker').boundingBox();
        assert.ok(pencil && input && pencil.x >= input.x + input.width);
        assert.ok(wrapper && select.x + select.width <= wrapper.x + wrapper.width - 6);
        await p.screenshot({ path: join(output, `${id}-add-site.png`) });
      });
      await ctx.close();
    }
    const zoomContext = await createContext('ru', { width: 1024, height: 640 }, 1.25);
    const zoomPage = await zoomContext.newPage();
    await check(`${platform}: 125 percent desktop layout retains close and Save`, async () => {
      await zoomPage.goto(url);
      await zoomPage.locator('#folderRow [data-folder]').first().waitFor();
      await openSettings(zoomPage);
      const save = await zoomPage.locator('#saveBackgroundButton').boundingBox();
      const close = await zoomPage.locator('#settingsDialog [data-close]').first().boundingBox();
      assert.ok(save.y + save.height <= 640 && close.y >= 0);
      await zoomPage.screenshot({ path: join(output, `${platform}-ru-125-percent-layout.png`) });
    });
    await zoomContext.close();
    const contrastContext = await createContext('ru', { width: 1024, height: 600 });
    const contrastPage = await contrastContext.newPage();
    await check(`${platform}: bright and detailed previews keep settings legible and keyboard reachable`, async () => {
      await contrastPage.goto(url);
      await contrastPage.locator('#folderRow [data-folder]').first().waitFor();
      await openSettings(contrastPage);
      for (const kind of ['bright', 'detailed']) {
        const data = await contrastPage.evaluate((kind) => {
          const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 800;
          const paint = canvas.getContext('2d'); paint.fillStyle = '#fff'; paint.fillRect(0, 0, 1280, 800);
          if (kind === 'detailed') for (let x = 0; x < 1280; x += 24) for (let y = 0; y < 800; y += 24) {
            paint.fillStyle = (x + y) % 48 === 0 ? '#1d2926' : '#e0b4cf'; paint.fillRect(x, y, 20, 20);
          }
          return canvas.toDataURL('image/png').split(',')[1];
        }, kind);
        await contrastPage.locator('#backgroundImage').setInputFiles({ name: `${kind}.png`, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
        await contrastPage.waitForFunction(() => document.getElementById('backgroundPreviewImage').style.backgroundImage.includes('blob:'));
        assert.equal(await contrastPage.locator('#settingsDialog').evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(248, 249, 248)');
        await contrastPage.locator('#saveBackgroundButton').focus();
        await contrastPage.keyboard.press('Tab');
        assert.equal(await contrastPage.evaluate(() => document.getElementById('settingsDialog').contains(document.activeElement)), true);
        await contrastPage.keyboard.press('Shift+Tab');
        assert.equal(await contrastPage.evaluate(() => document.activeElement.id), 'saveBackgroundButton');
        await contrastPage.screenshot({ path: join(output, `${platform}-ru-${kind}-settings.png`) });
      }
    });
    await contrastContext.close();
    for (const locale of ['en', 'ru']) {
      const before = structuredClone(sync.data);
      const commits = sync.commits;
      sync.data[FEATURE_KEYS.manifest].featureVersion = 2;
      const blockedContext = await createContext(locale);
      const blockedPage = await blockedContext.newPage();
      try {
        await check(`${platform}-${locale}: unreadable protected settings keep sites visible and disclose blocked saving`, async () => {
          await blockedPage.goto(url);
          await blockedPage.locator('.link-card').first().waitFor();
          assert.equal(await blockedPage.locator('#appStatus').isVisible(), true);
          const messages = JSON.parse(await readFile(join(root, `_locales/${locale}/messages.json`), 'utf8'));
          assert.equal(await blockedPage.locator('#appStatus').textContent(), messages.storageSaveWarning.message);
          assert.equal(sync.commits, commits);
          const count = await blockedPage.locator('.link-card').count();
          assert.ok(count > 0);
          await blockedPage.locator('[data-edit-link]').first().click();
          await blockedPage.locator('#linkTitle').fill('Unsaved protected draft');
          await blockedPage.locator('#linkSubmitButton').click();
          await blockedPage.locator('#linkFormError').waitFor({ state: 'visible' });
          assert.equal(await blockedPage.locator('#linkDialog').isVisible(), true);
          assert.equal(await blockedPage.locator('#linkTitle').inputValue(), 'Unsaved protected draft');
          assert.equal(sync.commits, commits);
        });
      } finally { sync.data = before; await blockedContext.close(); }
    }
  } finally {
    permission.pending?.resolve(false);
    await context?.close();
    await browser.close();
  }
}

async function verifyFolderVisibility(platform, createContext, url, sync, local) {
  const folders = [{ id: 'root', name: 'Favorites' },
    ...['AI', 'Entertainment', 'Google', 'Job', 'Dev'].map((name, i) => ({ id: `folder-${i}`, name }))];
  const counts = [5, 9, 6, 13, 9];
  const links = folders.slice(1).flatMap((folder, i) => Array.from({ length: counts[i] }, (_, n) => ({
    id: `site-${i}-${n}`, title: `Site ${i}-${n}`, url: `https://example.com/${i}/${n}`, folderId: folder.id,
  })));
  const seed = { ...fixture(), folders, links };
  const read = async () => (await createStorageService({ syncArea: sync, localArea: local, logger: null }).load({})).state;
  for (const locale of ['en', 'ru']) {
    const ctx = await createContext(locale, { width: 1488, height: 1056 });
    let p;
    let clock = 0;
    const label = `${platform}-${locale}: All visibility`;
    async function reset(value = seed) {
      await p?.close();
      sync.failSet = false;
      sync.delaySet = 0;
      assert.equal((await createStorageService({ syncArea: sync, localArea: local, logger: null }).save(value)).ok, true);
      p = await ctx.newPage();
      await p.goto(url);
      await p.locator('#folderRow [data-folder]').first().waitFor();
      await p.locator('#addFolderButton').click();
    }
    const ready = () => p.waitForFunction(() => !document.getElementById('showAllFolder').hasAttribute('aria-busy'));
    const done = () => p.locator('#folderDialog [data-close="folderDialog"]').last().click();
    const ids = () => p.locator('#folderRow [data-folder]').evaluateAll((els) => els.map((el) => el.dataset.folder));
    async function wheel(deltaX) {
      clock += 500;
      await p.locator('.content').evaluate((el, { deltaX, clock }) => {
        const event = new WheelEvent('wheel', { deltaX, deltaY: 0, bubbles: true, cancelable: true });
        Object.defineProperty(event, 'timeStamp', { value: clock });
        el.dispatchEvent(event);
      }, { deltaX, clock });
    }
    try {
      await check(`${label} is a small localized footer checkbox`, async () => {
        await reset();
        assert.equal(await p.locator('#showAllFolder').isChecked(), true);
        assert.equal(await p.locator('#folderDialog [data-i18n="showAllFolderLabel"]').textContent(), locale === 'ru' ? 'Показывать «Все»' : 'Show “All”');
        assert.equal(await p.locator('#folderDialog [data-i18n="done"]').textContent(), locale === 'ru' ? 'Готово' : 'Done');
        const footer = await p.locator('.folder-dialog-actions').boundingBox();
        const list = await p.locator('#folderList').boundingBox();
        assert.ok(footer.y > list.y + list.height);
        assert.ok(footer.height <= 60);
        assert.equal(await p.locator('#settingsDialog #showAllFolder').count(), 0);
        await p.screenshot({ path: join(output, `${platform}-${locale}-folder-visibility.png`) });
        await p.locator('#folderDialog').screenshot({ path: join(output, `${platform}-${locale}-folder-visibility-modal.png`) });
      });
      await check(`${label} hides only All and keeps sites, order, emoji and background`, async () => {
        const before = await read();
        const beforeLocal = structuredClone(local.data);
        await p.locator('#showAllFolder').click();
        await ready();
        assert.equal(await p.locator('#showAllFolder').isChecked(), false);
        assert.deepEqual(await ids(), folders.slice(1).map(({ id }) => id));
        const saved = await read();
        assert.equal(saved.showAllFolder, false);
        assert.equal(saved.selectedFolderId, 'folder-0');
        for (const key of ['links', 'folders', 'background', 'shortcutsEnabled']) assert.deepEqual(saved[key], before[key]);
        assert.deepEqual(local.data, beforeLocal);
      });
      await check(`${label} survives reload and a second tab and is easy to restore`, async () => {
        await p.reload();
        await p.locator('#folderRow [data-folder]').first().waitFor();
        assert.equal(await p.locator('[data-folder="all"]').count(), 0);
        const other = await ctx.newPage();
        await other.goto(url);
        await other.locator('#folderRow [data-folder]').first().waitFor();
        assert.equal(await other.locator('[data-folder="all"]').count(), 0);
        await other.close();
        await p.locator('#addFolderButton').click();
        assert.equal(await p.locator('#showAllFolder').isChecked(), false);
        await p.locator('#showAllFolder').click();
        await ready();
        assert.equal(await p.locator('[data-folder="all"]').count(), 1);
        assert.equal((await read()).selectedFolderId, 'folder-0');
      });
      await check(`${label} keeps selected user folders and swipe boundaries consistent`, async () => {
        await reset({ ...seed, showAllFolder: false, selectedFolderId: 'folder-0' });
        await done();
        await wheel(-90);
        assert.equal(await p.locator('[data-folder="folder-0"]').getAttribute('aria-pressed'), 'true');
        await wheel(90);
        assert.equal(await p.locator('[data-folder="folder-1"]').getAttribute('aria-pressed'), 'true');
        await wheel(-90);
        assert.equal(await p.locator('[data-folder="folder-0"]').getAttribute('aria-pressed'), 'true');
        await p.waitForFunction(async () => {
          const { createStorageService } = await import('./storage-service.mjs');
          return (await createStorageService({ logger: null }).load({})).state.selectedFolderId === 'folder-0';
        });
      });
      await check(`${label} rolls back a failed save and keeps the previous snapshot`, async () => {
        await reset();
        const before = await read();
        sync.failSet = true;
        await p.locator('#showAllFolder').click();
        await ready();
        await p.locator('#folderFormError').waitFor({ state: 'visible' });
        assert.equal(await p.locator('#showAllFolder').isChecked(), true);
        assert.equal(await p.locator('[data-folder="all"]').count(), 1);
        assert.deepEqual(await read(), before);
        sync.failSet = false;
      });
      await check(`${label} shows a coherent pending checkbox without a visual reversal`, async () => {
        await reset();
        sync.delaySet = 120;
        await p.locator('#showAllFolder').click();
        assert.equal(await p.locator('#showAllFolder').isChecked(), false);
        assert.equal(await p.locator('#showAllFolder').isDisabled(), true);
        await ready();
        sync.delaySet = 0;
        assert.equal(await p.locator('#showAllFolder').isChecked(), false);
      });
      await check(`${label} no folders and empty data keep All accessible`, async () => {
        await reset({ ...seed, folders: [folders[0]], links: [], showAllFolder: false });
        assert.deepEqual(await ids(), ['all']);
        assert.equal(await p.locator('#showAllFolder').isChecked(), true);
        assert.equal(await p.locator('#showAllFolder').isDisabled(), true);
        assert.match(await p.locator('.folder-visibility-control').getAttribute('title'), locale === 'ru' ? /создайте папку/ : /Create a folder/);
        await p.locator('#folderName').fill('First');
        await p.locator('#createFolderSubmitButton').click();
        await p.locator('#folderDialog').waitFor({ state: 'hidden' });
        assert.equal(await p.locator('[data-folder="all"]').count(), 1);
      });
      await check(`${label} deleting folders never makes their sites inaccessible`, async () => {
        await reset({ ...seed, folders: folders.slice(0, 3), links: links.slice(0, 5), showAllFolder: false, selectedFolderId: 'folder-0' });
        await p.locator('[data-delete-folder="folder-0"]').click();
        await p.locator('#confirmDeleteButton').click();
        await p.locator('[data-delete-folder="folder-0"]').waitFor({ state: 'hidden' });
        assert.deepEqual(await ids(), ['folder-1', 'root']);
        assert.equal((await read()).links.length, 5);
        assert.equal((await read()).selectedFolderId, 'folder-1');
        await p.locator('[data-delete-folder="folder-1"]').click();
        await p.locator('#confirmDeleteButton').click();
        await p.locator('[data-delete-folder="folder-1"]').waitFor({ state: 'hidden' });
        assert.deepEqual(await ids(), ['all']);
        assert.equal(await p.locator('#showAllFolder').isChecked(), true);
        assert.equal(await p.locator('#showAllFolder').isDisabled(), true);
        assert.equal((await read()).links.length, 5);
      });
      await check(`${label} unfiled add, reload, edit and reassignment remain usable`, async () => {
        await reset({ ...seed, showAllFolder: false, selectedFolderId: 'folder-0' });
        await done();
        await p.locator('#addLinkButton').click();
        await p.locator('#linkTitle').fill('Unfiled QA');
        await p.locator('#linkUrl').fill('github.com');
        await p.locator('#linkFolder').selectOption('root');
        await p.locator('#linkSubmitButton').click();
        await p.locator('#linkDialog').waitFor({ state: 'hidden' });
        assert.equal(await p.locator('[data-folder="root"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await p.locator('[data-folder="root"] .folder-name').textContent(), locale === 'ru' ? 'Без папки' : 'Unfiled');
        const site = (await read()).links.find(({ title }) => title === 'Unfiled QA');
        assert.equal(site.url, 'https://github.com/');
        await p.reload();
        await p.locator('[data-folder="root"][aria-pressed="true"]').waitFor();
        await p.locator(`[data-edit-link="${site.id}"]`).click();
        await p.locator('#linkFolder').selectOption('folder-0');
        await p.locator('#linkSubmitButton').click();
        await p.locator('#linkDialog').waitFor({ state: 'hidden' });
        assert.equal(await p.locator('[data-folder="root"]').count(), 0);
        assert.equal(await p.locator('[data-folder="all"]').count(), 0);
        assert.equal((await read()).selectedFolderId, 'folder-0');
      });
      await check(`${label} import keeps the visibility preference and keyboard toggle works`, async () => {
        await reset({ ...seed, showAllFolder: false, selectedFolderId: 'folder-0' });
        await done();
        await openSettings(p);
        await p.locator('#backupSettingsTab').click();
        await p.locator('#importBackupInput').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(serializeBackup(seed)) });
        await p.locator('#confirmImportButton').waitFor({ state: 'visible' });
        await p.locator('#confirmImportButton').click();
        await p.locator('#confirmImportButton').waitFor({ state: 'hidden' });
        assert.equal((await read()).showAllFolder, false);
        assert.equal(await p.locator('[data-folder="all"]').count(), 0);
        await p.keyboard.press('Escape');
        await p.locator('#addFolderButton').click();
        await p.locator('#showAllFolder').focus();
        await p.keyboard.press('Space');
        await ready();
        assert.equal(await p.locator('#showAllFolder').isChecked(), true);
      });
      await check(`${label} narrow layout and zoom retain checkbox and Done`, async () => {
        await reset();
        for (const viewport of [{ width: 390, height: 700 }, { width: 320, height: 480 }, { width: 820, height: 480 }]) {
          await p.setViewportSize(viewport);
          const box = await p.locator('.folder-visibility-control').boundingBox();
          const button = await p.locator('#folderDialog [data-i18n="done"]').boundingBox();
          assert.ok(box.x >= 0 && box.y >= 0 && box.y + box.height <= viewport.height);
          assert.ok(button.x + button.width <= viewport.width && button.y + button.height <= viewport.height);
          assert.ok(box.x + box.width <= button.x);
        }
        await p.screenshot({ path: join(output, `${platform}-${locale}-folder-visibility-narrow.png`) });
      });
    } finally { sync.failSet = false; sync.delaySet = 0; await ctx.close(); }
  }
}

async function runRealChromeSettings() {
  const extension = join(output, 'chrome');
  const profile = join(output, 'settings-real-chrome-profile');
  const image = await readFile(join(extension, 'images/default-background.png'));
  let context;
  async function open() {
    context = await playwright.chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    context.setDefaultTimeout(10_000);
    await context.route(/^https?:/, (route) => route.abort());
    const page = context.pages()[0] || await context.newPage();
    page.on('pageerror', (error) => report.consoleErrors.push(`chrome-extension: ${error.message}`));
    await page.goto('chrome://newtab/');
    await page.locator('#folderRow [data-folder]').first().waitFor();
    assert.equal(await page.evaluate(() => Boolean(chrome.runtime?.id && chrome.storage?.sync)), true);
    return page;
  }
  const load = (page) => page.evaluate(async () => {
    const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
    return (await createStorageService({ logger: null }).load({})).state;
  });
  try {
    let page = await open();
    await page.evaluate(async (seed) => {
      const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
      if (!(await createStorageService({ logger: null }).save(seed)).ok) throw new Error('Real seed save failed');
    }, fixture());
    await page.reload();
    await page.locator('#folderRow [data-folder]').first().waitFor();
    await openSettings(page);
    await check('chrome-extension: Cancel does not write real sync or local storage', async () => {
      const before = await page.evaluate(async () => ({ sync: await chrome.storage.sync.get(null), local: await chrome.storage.local.get(null) }));
      await page.locator('#backgroundImage').setInputFiles({ name: 'wallpaper.png', mimeType: 'image/png', buffer: image });
      await page.waitForFunction(() => document.getElementById('backgroundPreviewImage').style.backgroundImage.includes('blob:'));
      await page.locator('#singleKeyShortcuts').uncheck();
      await page.locator('#resetBackgroundButton').click();
      await page.locator('#settingsDialog [data-close="settingsDialog"]').last().click();
      await page.locator('#settingsDialog').waitFor({ state: 'hidden' });
      const after = await page.evaluate(async () => ({ sync: await chrome.storage.sync.get(null), local: await chrome.storage.local.get(null) }));
      assert.deepEqual(after, before);
    });
    await openSettings(page);
    await check('chrome-extension: Save persists a local image and lightweight sync settings', async () => {
      await page.locator('#backgroundImage').setInputFiles({ name: 'wallpaper.png', mimeType: 'image/png', buffer: image });
      await page.waitForFunction(() => document.getElementById('backgroundPreviewImage').style.backgroundImage.includes('blob:'));
      await page.locator('#singleKeyShortcuts').uncheck();
      await page.locator('#saveBackgroundButton').click();
      await page.locator('#settingsDialog').waitFor({ state: 'hidden' });
      const saved = await load(page);
      assert.equal(saved.shortcutsEnabled, false);
      assert.ok(saved.background.customAssetId && saved.background.customAssetAvailable);
      assert.ok(saved.background.value.startsWith('data:image/'));
      assert.doesNotMatch(await page.evaluate(async () => JSON.stringify(await chrome.storage.sync.get(null))), /data:image|blob:|base64/);
      await page.reload();
      await page.locator('#folderRow [data-folder]').first().waitFor();
      await openSettings(page);
      assert.equal(await page.locator('#singleKeyShortcuts').isChecked(), false);
    });
    await check('chrome-extension: failed distinct wallpaper replacement preserves real local data across reload', async () => {
      const previous = await load(page);
      const beforeLocal = await page.evaluate(() => chrome.storage.local.get(null));
      const replacement = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
        const context = canvas.getContext('2d'); context.fillStyle = '#247d92'; context.fillRect(0, 0, 2, 2);
        return canvas.toDataURL('image/png');
      });
      assert.notEqual(replacement, previous.background.value);
      await page.locator('#backgroundImage').setInputFiles({ name: 'replacement.png', mimeType: 'image/png',
        buffer: Buffer.from(replacement.split(',')[1], 'base64') });
      await page.waitForFunction(() => document.getElementById('backgroundPreviewImage').style.backgroundImage.includes('blob:'));
      await page.evaluate(() => {
        const area = chrome.storage.sync;
        globalThis.__qaBackgroundOriginalSet = area.set;
        area.set = async (items) => {
          if (Object.hasOwn(items, 'minimalNewTabSyncManifest')) throw new Error('Injected native-QA head rejection');
          return globalThis.__qaBackgroundOriginalSet.call(area, items);
        };
      });
      try {
        await page.locator('#saveBackgroundButton').click();
        await page.locator('#backgroundImageError').waitFor({ state: 'visible' });
        const afterLocal = await page.evaluate(() => chrome.storage.local.get(null));
        assert.deepEqual(afterLocal[STORAGE_KEYS.localBackground], beforeLocal[STORAGE_KEYS.localBackground]);
        assert.equal(afterLocal[STORAGE_KEYS.pendingBackground].dataUrl, replacement);
      } finally {
        await page.evaluate(() => {
          chrome.storage.sync.set = globalThis.__qaBackgroundOriginalSet;
          delete globalThis.__qaBackgroundOriginalSet;
        });
      }
      await page.reload();
      await page.locator('#folderRow [data-folder]').first().waitFor();
      assert.deepEqual((await load(page)).background, previous.background);
      await openSettings(page);
      assert.ok((await page.locator('#backgroundPreviewImage').evaluate(el => el.style.backgroundImage)).includes(previous.background.value));
      await page.screenshot({ path: join(output, 'chrome-extension-failed-background-restored.png') });
      await page.locator('#backgroundImage').setInputFiles({ name: 'replacement.png', mimeType: 'image/png',
        buffer: Buffer.from(replacement.split(',')[1], 'base64') });
      await page.waitForFunction(() => document.getElementById('backgroundPreviewImage').style.backgroundImage.includes('blob:'));
      await page.locator('#saveBackgroundButton').click();
      await page.locator('#settingsDialog').waitFor({ state: 'hidden' });
      assert.equal((await load(page)).background.value, replacement);
      assert.equal(Object.hasOwn(await page.evaluate(() => chrome.storage.local.get(null)), STORAGE_KEYS.pendingBackground), false);
      await openSettings(page);
    });
    await check('chrome-extension: All visibility writes real sync without changing local data', async () => {
      await page.keyboard.press('Escape');
      const before = await load(page);
      const beforeLocal = await page.evaluate(() => chrome.storage.local.get(null));
      await page.locator('#addFolderButton').click();
      await page.locator('#showAllFolder').click();
      await page.waitForFunction(() => !document.getElementById('showAllFolder').hasAttribute('aria-busy'));
      const saved = await load(page);
      assert.equal(saved.showAllFolder, false);
      assert.equal(saved.selectedFolderId, 'work');
      assert.equal(await page.locator('[data-folder="all"]').count(), 0);
      for (const key of ['links', 'folders', 'background', 'shortcutsEnabled']) assert.deepEqual(saved[key], before[key]);
      assert.deepEqual(await page.evaluate(() => chrome.storage.local.get(null)), beforeLocal);
      await page.keyboard.press('Escape');
    });
    await check('chrome-extension: full browser close and reopen restores settings and background', async () => {
      const saved = await load(page);
      await context.close();
      page = await open();
      assert.deepEqual(await load(page), saved);
      assert.equal(await page.locator('[data-folder="all"]').count(), 0);
      assert.equal((await load(page)).showAllFolder, false);
      await openSettings(page);
      assert.equal(await page.locator('#singleKeyShortcuts').isChecked(), false);
      assert.ok((await page.locator('#backgroundPreviewImage').evaluate((el) => el.style.backgroundImage)).includes('data:image/'));
      await page.screenshot({ path: join(output, 'chrome-extension-settings.png') });
    });
  } finally {
    await context?.close();
  }
}

try {
  await run('chrome', buildChromeRelease);
  await run('firefox', buildFirefoxRelease);
  if (process.env.SETTINGS_REAL_CHROME === '1') await runRealChromeSettings();
  assert.deepEqual(report.consoleErrors, []);
} catch (error) {
  report.checks.push({ name: 'suite', ok: false, error: error.stack });
} finally {
  server.close();
  report.ok = report.checks.every((item) => item.ok) && report.consoleErrors.length === 0;
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`Settings QA: ${report.ok ? 'PASS' : 'FAIL'}; ${output}\n`);
  if (!report.ok) process.exitCode = 1;
}
