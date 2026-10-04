// Optional release-data QA. Synthetic data and disposable Chromium profiles only.
// PLAYWRIGHT_MODULE=<path> DATA_QA_OUTPUT=<new directory> node scripts/verify-data-continuity.mjs
// DATA_QA_RELEASE_ROOT contains the immutable published Chrome/Firefox 1.6 ZIPs.
// DATA_QA_FIREFOX_SESSION optionally points to our already-open, isolated native-QA
// session metadata. Its real UI imports/exports JSON; no privileged scripts run.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, cp, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildChromeRelease } from './build-chrome.mjs';
import { buildFirefoxRelease } from './build-firefox.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const output = process.env.DATA_QA_OUTPUT ? resolve(process.env.DATA_QA_OUTPUT)
  : await mkdtemp(join(tmpdir(), 'minimal-tab-data-continuity-'));
await mkdir(output, { recursive: true });
// Never reuse a profile or installation from another run.
await mkdir(join(output, 'owned-run'), { recursive: false });
const releaseRoot = resolve(process.env.DATA_QA_RELEASE_ROOT || join(sourceRoot, '..'));
const defaults = { selectedFolderId: 'all', shortcutsEnabled: true,
  folders: [{ id: 'root', name: 'Favorites' }], links: [],
  background: { type: 'image', value: 'images/default-background.png', overlay: 0, overlayColor: '#17122b' } };
const report = { checks: [], limitations: [
  'Unpacked Chromium update is a same-path code replacement, not signed Chrome Web Store delivery.',
  'No account login or real cross-device sync; missing-local-image coverage copies sync data to a clean profile.',
  'Firefox archive compatibility uses its actual services with in-memory storage; native UI transfer is optional.',
  'Temporary Firefox add-on restart and signed AMO update delivery are not tested.',
], releaseRisks: [], errors: [] };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function check(name, action) {
  try {
    const evidence = await action(); report.checks.push({ name, ok: true,
      evidence: evidence?.document ? { path: evidence.path, backupVersion: evidence.document.backupVersion,
        sites: evidence.document.data.links.length, folders: evidence.document.data.folders.length } : evidence });
    console.log(`PASS ${name}`); return evidence;
  } catch (error) {
    report.checks.push({ name, ok: false, error: error.stack }); throw error;
  }
}
function area(data = {}) {
  return { data: structuredClone(data),
    async get(keys = null) { return keys === null ? structuredClone(this.data)
      : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => Object.hasOwn(this.data, k))
        .map(k => [k, structuredClone(this.data[k])])); },
    async set(values) { Object.assign(this.data, structuredClone(values)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete this.data[key]; } };
}
function fixture(image) {
  const folders = [{ id: 'root', name: 'Favorites' }, { id: 'qa-learn', name: 'Учёба' },
    { id: 'qa-work', name: 'Work' }, { id: 'qa-empty', name: 'Empty' }, { id: 'qa-tools', name: 'Tools' }];
  return { ...structuredClone(defaults), selectedFolderId: 'qa-work', shortcutsEnabled: false, folders,
    links: Array.from({ length: 48 }, (_, i) => ({ id: `qa-${47 - i}`, title: `QA ${i} — Проверка`,
      url: `https://example.com/item/${47 - i}?source=qa#test`,
      folderId: folders[[0, 1, 2, 4][i % 4]].id })),
    background: { type: 'image', value: image, overlay: 37, overlayColor: '#193247' } };
}
const portable = ({ selectedFolderId, folders, links }) => ({ selectedFolderId, folders, links });
let context;
let page;
const extension = join(output, 'owned-run', 'installed-chrome');
const profile = join(output, 'owned-run', 'chrome-profile');
const activeContexts = new Set();
async function launch(profilePath = profile) {
  const ctx = await chromium.launchPersistentContext(profilePath, {
    channel: 'chromium', headless: true, acceptDownloads: true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  activeContexts.add(ctx); ctx.setDefaultTimeout(10000);
  await ctx.route(/^https?:/, route => route.abort());
  const p = ctx.pages()[0] || await ctx.newPage();
  p.on('pageerror', error => report.errors.push(error.message));
  await p.goto('chrome://newtab/'); await p.locator('#folderRow [data-folder]').first().waitFor();
  assert.equal(await p.evaluate(() => Boolean(chrome.runtime.id && chrome.storage.sync)), true);
  return { context: ctx, page: p };
}
async function load(p = page) {
  return p.evaluate(async defaults => {
    const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
    const result = await createStorageService({ logger: null }).load(defaults);
    if (!result.ok) throw new Error(`Storage load failed: ${result.source}`);
    return result.state;
  }, defaults);
}
async function raw(p = page) {
  return p.evaluate(async () => ({ sync: await chrome.storage.sync.get(null), local: await chrome.storage.local.get(null) }));
}
async function replaceInstalledChrome(directory) {
  await context.close(); activeContexts.delete(context);
  await cp(join(output, directory), extension, { recursive: true });
  ({ context, page } = await launch());
}
async function ready(p = page) { await p.locator('#folderRow [data-folder]').first().waitFor(); }
async function settings(p = page) {
  if (!(await p.locator('#settingsDialog').isVisible())) await p.locator('#settingsButton').click();
}
async function closeSettings(p = page) {
  if (await p.locator('#settingsDialog').isVisible()) await p.locator('#settingsDialog .modal-header [data-close]').click();
}
async function exportUI(name, p = page) {
  await settings(p); await p.locator('#backupSettingsTab').click();
  const pending = p.waitForEvent('download'); await p.locator('#exportBackupButton').click();
  const download = await pending; const path = join(output, name); await download.saveAs(path);
  assert.equal(await p.locator('#importError').isVisible(), false);
  return { path, document: JSON.parse(await readFile(path, 'utf8')) };
}
async function importUI(path, p = page) {
  await settings(p); await p.locator('#backupSettingsTab').click();
  await p.locator('#importBackupInput').setInputFiles(path);
  await p.locator('#confirmImportButton').waitFor({ state: 'visible' });
  await p.locator('#confirmImportButton').click();
  await p.locator('#importPreview').waitFor({ state: 'hidden' });
  assert.equal(await p.locator('#importError').isVisible(), false);
}

async function nativeFirefoxRoundTrip(chromeExport) {
  const metadataPath = process.env.DATA_QA_FIREFOX_SESSION;
  const session = JSON.parse(await readFile(metadataPath, 'utf8'));
  assert.match(session.endpoint, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.ok(session.profile.startsWith(`${session.run}/profiles/`));
  assert.ok(session.run.includes('/manual-tests/firefox-transfer-') && session.run.includes('/native-qa/run-'));
  assert.equal(session.temporary, true); assert.equal(session.addonId, 'minimal-new-tab@nurfinn.com');
  const nativeFiles = join(output, 'native-firefox-package'); await mkdir(nativeFiles);
  const extracted = spawnSync('/usr/bin/unzip', ['-q', session.archive, '-d', nativeFiles], { encoding: 'utf8' });
  assert.equal(extracted.status, 0, extracted.stderr);
  const list = async (root, folder = '') => {
    const files = [];
    for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) files.push(...await list(root, path));
      else if (entry.isFile()) files.push(path);
    }
    return files.sort();
  };
  const nativeList = await list(nativeFiles);
  assert.deepEqual(nativeList, await list(join(output, 'current-firefox')));
  for (const path of nativeList) assert.equal(hash(await readFile(join(nativeFiles, path))),
    hash(await readFile(join(output, 'current-firefox', path))), `Native Firefox mismatch: ${path}`);
  async function request(method, path, body) {
    const response = await fetch(`${session.endpoint}/session/${session.sessionId}${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    const json = await response.json();
    if (!response.ok || json.value?.error) throw new Error(JSON.stringify(json.value));
    return json.value;
  }
  const find = async selector => (await request('POST', '/element', { using: 'css selector', value: selector }))['element-6066-11e4-a52e-4f735466cecf'];
  const prop = async (selector, key) => request('GET', `/element/${await find(selector)}/property/${key}`);
  const attr = async (selector, key) => request('GET', `/element/${await find(selector)}/attribute/${key}`);
  const click = async selector => request('POST', `/element/${await find(selector)}/click`, {});
  async function until(fn) { for (let i = 0; i < 80; i++) { if (await fn()) return; await pause(150); } throw new Error('Firefox UI timed out'); }
  assert.match(await request('GET', '/url'), /^moz-extension:\/\/.+\/newtab\.html$/);
  const beforeStyle = hash(await attr('html', 'style'));
  if (!(await prop('#settingsDialog', 'open'))) await click('#settingsButton');
  await click('#backgroundSettingsTab');
  const beforeShortcuts = await prop('#singleKeyShortcuts', 'checked');
  const beforePermission = await prop('#remoteFaviconToggle', 'checked');
  // Browser defaults download to Downloads; inspect only newly created matching
  // files, validate their synthetic data, and move only those files into QA output.
  const downloads = process.env.DATA_QA_FIREFOX_DOWNLOADS || join(homedir(), 'Downloads');
  async function exportFirefox(name, expectedData) {
    await click('#backupSettingsTab');
    const before = new Set(await readdir(downloads));
    await click('#exportBackupButton');
    let found;
    await until(async () => {
      for (const file of await readdir(downloads)) {
        if (before.has(file) || !/^minimal-new-tab-backup-.*\.json$/.test(file)) continue;
        const path = join(downloads, file);
        try {
          const document = JSON.parse(await readFile(path, 'utf8'));
          if (document.format !== 'minimal-new-tab-backup' || document.backupVersion !== 2) continue;
          if (expectedData && JSON.stringify(document.data) !== JSON.stringify(expectedData)) continue;
          // The initial backup is also synthetic, left by the preceding native QA.
          if (!expectedData && !document.data.links.every(link => link.id.startsWith('qa-') ||
            (link.title === 'Roundtrip emoji — edited' && link.url === 'https://github.com/' && link.emoji === '🗺️'))) continue;
          found = { path, document }; return true;
        } catch { /* A download may still be in progress. */ }
      }
      return false;
    });
    const path = join(output, name); await rename(found.path, path);
    return { path, document: found.document };
  }
  const original = await exportFirefox('firefox-before-roundtrip.json');
  await request('POST', `/element/${await find('#importBackupInput')}/value`, { text: chromeExport.path });
  await until(async () => !(await prop('#importPreview', 'hidden')));
  assert.equal(await prop('#importPreviewSites', 'textContent'), String(chromeExport.document.data.links.length));
  await click('#confirmImportButton'); await until(() => prop('#importPreview', 'hidden'));
  assert.equal(await prop('#importError', 'hidden'), true);
  const result = await exportFirefox('firefox-to-chrome.json', chromeExport.document.data);
  assert.deepEqual(result.document.data, chromeExport.document.data);
  await click('#backgroundSettingsTab');
  assert.equal(await prop('#singleKeyShortcuts', 'checked'), beforeShortcuts);
  assert.equal(await prop('#remoteFaviconToggle', 'checked'), beforePermission);
  assert.equal(hash(await attr('html', 'style')), beforeStyle);
  await click('#settingsDialog .modal-header [data-close]');
  assert.equal(await attr(`[data-folder="${result.document.data.selectedFolderId}"]`, 'aria-pressed'), 'true');
  const first = result.document.data.links.find(link => link.emoji);
  assert.equal(await prop(`[data-link-id="${first.id}"] .favicon-letter`, 'textContent'), first.emoji);
  // DOM text can exist while content-visibility still skips cards immediately
  // after the covering dialog closes. Wait for rendered text before capturing.
  await until(async () => (await request('GET', `/element/${await find(`[data-link-id="${first.id}"]`)}/text`)).includes(first.title));
  await writeFile(join(output, 'native-firefox-roundtrip.png'), Buffer.from(await request('GET', '/screenshot'), 'base64'));
  report.firefox = { browser: 'real Firefox temporary add-on', backgroundStyleSha256: beforeStyle,
    shortcutsEnabled: beforeShortcuts, remoteIconsEnabled: beforePermission,
    installedArchiveMatchesCurrentBuild: true, comparedFiles: nativeList.length,
    originalSyntheticBackup: original.path, siteCount: result.document.data.links.length,
    folderCount: result.document.data.folders.length, downloadMovedToQaOutput: true };
  return result;
}

try {
  const hashes = { chrome: '370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794',
    firefox: '34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671' };
  for (const platform of ['chrome', 'firefox']) {
    const archive = join(releaseRoot, `minimal-new-tab-${platform}-v1.6.zip`);
    await check(`${platform}: immutable published 1.6 archive`, async () => {
      assert.equal(hash(await readFile(archive)), hashes[platform]);
      const target = join(output, `old-${platform}`); await mkdir(target);
      const result = spawnSync('/usr/bin/unzip', ['-q', archive, '-d', target], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      for (const [file, expectedHash] of Object.entries({
        'storage-service.mjs': '134dacfe20a8f86d1fc218f3e1cb5962fb869ac0165bd1afc7dbe1d2962db778',
        'extension-api.mjs': '04e51c98a82c0fc7945f94313ce0c4419548fe91872583e1ec29f0738bb3322d',
      })) {
        assert.equal(hash(await readFile(join(target, file))), expectedHash);
        assert.equal(hash(await readFile(join(sourceRoot, 'tests/fixtures/published-v1.6', file))), expectedHash);
      }
      return { sha256: hashes[platform], version: JSON.parse(await readFile(join(target, 'manifest.json'))).version };
    });
  }
  const image = `data:image/png;base64,${(await readFile(join(sourceRoot, 'icons/icon-128.png'))).toString('base64')}`;
  const seed = fixture(image);
  await buildChromeRelease({ outputDir: join(output, 'current-chrome'), archivePath: join(output, 'chrome-test-only.zip') });
  await buildFirefoxRelease({ outputDir: join(output, 'current-firefox'), archivePath: join(output, 'firefox-test-only.zip') });
  for (const platform of ['chrome', 'firefox']) await check(`${platform}: actual 1.6 writer → current reader, no rewrite`, async () => {
    const old = await import(pathToFileURL(join(output, `old-${platform}`, 'storage-service.mjs')));
    const current = await import(pathToFileURL(join(output, `current-${platform}`, 'storage-service.mjs')));
    const syncArea = area(); const localArea = area();
    const oldService = old.createStorageService({ syncArea, localArea, logger: null });
    assert.equal((await oldService.save(seed)).ok, true);
    const before = (await oldService.load(defaults)).state;
    const rawBefore = structuredClone({ sync: syncArea.data, local: localArea.data });
    const next = await current.createStorageService({ syncArea, localArea, logger: null }).load(defaults);
    assert.equal(next.ok, true); assert.deepEqual(next.state, before);
    assert.deepEqual({ sync: syncArea.data, local: localArea.data }, rawBefore);
    return { sites: before.links.length, folders: before.folders.length, storageAPIs: 'in-memory test areas' };
  });
  for (const platform of ['chrome', 'firefox']) {
    const old = await import(pathToFileURL(join(output, `old-${platform}`, 'storage-service.mjs')));
    const current = await import(pathToFileURL(join(output, `current-${platform}`, 'storage-service.mjs')));
    const oldBackup = await import(pathToFileURL(join(output, `old-${platform}`, 'backup-service.mjs')));
    const currentBackup = await import(pathToFileURL(join(output, `current-${platform}`, 'backup-service.mjs')));
    const modernDefaults = { ...structuredClone(defaults), showAllFolder: true };
    const modernSeed = { ...structuredClone(seed), showAllFolder: false };
    modernSeed.links[0].emoji = '🗺️'; modernSeed.links[1].emoji = '👍🏽';
    const syncArea = area(); const localArea = area();
    const service = current.createStorageService({ syncArea, localArea, logger: null });
    assert.equal((await service.save(modernSeed)).ok, true);
    const modernState = (await service.load(modernDefaults)).state;
    const rawBefore = structuredClone({ sync: syncArea.data, local: localArea.data });
    const legacy = old.createStorageService({ syncArea, localArea, logger: null });
    await check(`${platform}: old client only reading current data performs no writes`, async () => {
      const loaded = await legacy.load(defaults); assert.equal(loaded.ok, true);
      assert.deepEqual({ sync: syncArea.data, local: localArea.data }, rawBefore);
      assert.equal((await service.load(modernDefaults)).state.links[0].emoji, '🗺️');
      assert.equal((await service.load(modernDefaults)).state.showAllFolder, false);
      return { sites: modernState.links.length, oldReadDoesNotRewrite: true };
    });
    await check(`${platform}: actual 1.6 repeated rename/move/reorder preserves protected emoji and All`, async () => {
      const featureEntries = data => Object.fromEntries(Object.entries(data).filter(([key]) => key.startsWith('minimalNewTabFeature')));
      const beforeFeatures = featureEntries(syncArea.data);
      const originalChunks = syncArea.data.minimalNewTabSyncManifest.active.chunkKeys;
      const expected = structuredClone(modernState);
      for (let i = 0; i < 5; i++) {
        const title = 'Renamed by published 1.6 — ' + i;
        const result = await legacy.update(defaults, state => {
          const target = state.links.find(link => link.id === modernState.links[0].id);
          target.title = title; target.folderId = 'qa-tools'; state.links.reverse(); return state;
        });
        assert.equal(result.ok, true);
        const target = expected.links.find(link => link.id === modernState.links[0].id);
        target.title = title; target.folderId = 'qa-tools'; expected.links.reverse();
      }
      const next = await current.createStorageService({ syncArea, localArea, logger: null }).load(modernDefaults);
      assert.equal(next.ok, true);
      assert.deepEqual(next.state, expected);
      assert.deepEqual(localArea.data, rawBefore.local);
      assert.deepEqual(featureEntries(syncArea.data), beforeFeatures);
      assert.equal(originalChunks.some(key => Object.hasOwn(syncArea.data, key)), false);
      assert.equal(next.state.links.find(link => link.id === modernSeed.links[0].id).emoji, '🗺️');
      assert.equal(next.state.links.find(link => link.id === modernSeed.links[1].id).emoji, '👍🏽');
      assert.equal(next.state.showAllFolder, false);
      const evidence = { platform, sitesAndFoldersPreserved: true, orderAndBackgroundPreserved: true,
        legacyEditPreserved: true, emojiPreserved: true, allVisibilityPreserved: true,
        independentKeysSurviveOldCleanup: true, legacyWrites: 5,
        actualCloudSync: false, storageAPIs: 'in-memory test areas' };
      return evidence;
    });
    await check(`${platform}: v1 imports forward; v2 is safely rejected by published 1.6`, async () => {
      const oldJson = oldBackup.serializeBackup(seed);
      assert.equal(currentBackup.parseBackupText(oldJson).ok, true);
      const newJson = currentBackup.serializeBackup(modernSeed);
      assert.equal(currentBackup.parseBackupText(newJson).data.links[0].emoji, '🗺️');
      assert.deepEqual(oldBackup.parseBackupText(newJson), { ok: false, error: 'unsupported-backup' });
      return { oldFormat: 1, currentFormat: 2, backwardImportSupported: false };
    });
  }
  report.limitations.push('Verified 1.6 serializers preserve choices only after valid protected data exists locally. Identical old imports cannot express emoji reset; account delivery and remote concurrent edits remain untested.');
  await cp(join(output, 'old-chrome'), extension, { recursive: true });
  ({ context, page } = await launch());
  const oldId = await page.evaluate(() => chrome.runtime.id);
  await page.evaluate(async seed => {
    const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
    if (!(await createStorageService({ logger: null }).save(seed)).ok) throw new Error('Old seed failed');
  }, seed);
  await page.reload(); await ready();
  const oldState = await load(); const oldRaw = await raw();
  const oldExport = await exportUI('published-1.6-backup-v1.json');
  assert.equal(oldExport.document.backupVersion, 1);
  await context.close(); activeContexts.delete(context);
  await cp(join(output, 'current-chrome'), extension, { recursive: true });
  ({ context, page } = await launch());
  await check('native Chromium: 1.6 → current in the same profile preserves all data', async () => {
    assert.equal(await page.evaluate(() => chrome.runtime.id), oldId);
    assert.deepEqual(await load(), oldState); assert.deepEqual(await raw(), oldRaw);
    assert.equal(await page.locator('[data-folder="qa-work"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.link-card').count(), 12);
    return { sites: 48, folders: 5, idUnchanged: true, syncAndLocalUnchanged: true };
  });
  await check('native Chromium: old JSON v1 import retains local settings', async () => {
    await importUI(oldExport.path); assert.deepEqual(await load(), oldState); await closeSettings();
  });
  await check('native Chromium: URL without scheme, emoji, edit and reorder persist', async () => {
    await page.locator('#addLinkButton').click(); await page.locator('#linkUrl').fill('github.com');
    await page.locator('#linkTitle').fill('Roundtrip emoji QA'); await page.locator('#linkFolder').selectOption('qa-work');
    await page.locator('#linkIconButton').click();
    await page.locator('#emojiSearch').fill('🗺️');
    await page.locator('[data-site-emoji="🗺️"]').click();
    await page.locator('#linkSubmitButton').click(); await page.locator('#linkDialog').waitFor({ state: 'hidden' });
    const link = (await load()).links.find(link => link.title === 'Roundtrip emoji QA');
    assert.equal(link.url, 'https://github.com/'); assert.equal(link.emoji, '🗺️');
    await page.locator(`[data-edit-link="${link.id}"]`).click(); await page.locator('#linkTitle').fill('Roundtrip emoji — edited');
    await page.locator('#linkSubmitButton').click(); await page.locator('#linkDialog').waitFor({ state: 'hidden' });
    const before = (await load()).links.map(l => l.id);
    await page.locator(`[data-drag-link="${link.id}"]`).press('ArrowRight');
    await page.waitForFunction(async ({ id, before }) => {
      const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
      const links = (await createStorageService({ logger: null }).load({})).state.links;
      return links.findIndex(l => l.id === id) !== before.indexOf(id);
    }, { id: link.id, before });
    await page.reload(); await ready();
    assert.equal(await page.locator(`[data-link-id="${link.id}"] .favicon-letter`).textContent(), '🗺️');
  });
  let currentState = await load();
  await check('native Chromium: full process close/reopen preserves emoji, order and local image', async () => {
    const beforeRaw = await raw(); await context.close(); activeContexts.delete(context);
    ({ context, page } = await launch()); assert.deepEqual(await load(), currentState); assert.deepEqual(await raw(), beforeRaw);
    assert.doesNotMatch(JSON.stringify(beforeRaw.sync), /base64|data:image|favicon/);
    return { sites: currentState.links.length, localImageSha256: hash(currentState.background.value) };
  });
  await check('native Chromium: protected data → actual 1.6 writes → current keeps emoji and hidden All', async () => {
    currentState.showAllFolder = false;
    await page.evaluate(async state => {
      const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
      if (!(await createStorageService({ logger: null }).save(state)).ok) throw new Error('Protection seed failed');
    }, currentState);
    const protectedBefore = await load(), protectedRaw = await raw();
    const emojiId = protectedBefore.links.find(link => link.emoji).id;
    const featureEntries = data => Object.fromEntries(Object.entries(data).filter(([key]) => key.startsWith('minimalNewTabFeature')));
    const beforeFeatures = featureEntries(protectedRaw.sync);
    const originalChunks = protectedRaw.sync.minimalNewTabSyncManifest.active.chunkKeys;
    await replaceInstalledChrome('old-chrome');
    assert.equal(await page.evaluate(() => chrome.runtime.id), oldId);
    await page.evaluate(async ({ defaults, emojiId }) => {
      const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
      const service = createStorageService({ logger: null });
      for (let i = 0; i < 3; i++) {
        const result = await service.update(defaults, state => {
          const link = state.links.find(link => link.id === emojiId);
          link.title = 'Native legacy ' + i; link.folderId = 'qa-tools';
          state.selectedFolderId = 'qa-tools'; state.links.reverse(); return state;
        });
        if (!result.ok) throw new Error('Native legacy write failed');
      }
    }, { defaults, emojiId });
    const afterLegacy = await raw();
    assert.deepEqual(featureEntries(afterLegacy.sync), beforeFeatures);
    assert.equal(originalChunks.some(key => Object.hasOwn(afterLegacy.sync, key)), false);
    await replaceInstalledChrome('current-chrome');
    assert.equal(await page.evaluate(() => chrome.runtime.id), oldId);
    const after = await load();
    const expected = structuredClone(protectedBefore);
    expected.links.reverse();
    const link = expected.links.find(link => link.id === emojiId);
    link.title = 'Native legacy 2'; link.folderId = 'qa-tools'; expected.selectedFolderId = 'qa-tools';
    assert.deepEqual(after, expected);
    assert.deepEqual((await raw()).local, protectedRaw.local);
    assert.equal(await page.locator('[data-folder="all"]').count(), 0);
    currentState = after;
    return { emojiPreserved: true, allVisibilityPreserved: true, idUnchanged: true, realStorage: true, legacyWrites: 3, exactLocalBackground: true };
  });
  await check('native Chromium: explicit favicon/All reset survives old writes and process restart', async () => {
    const reset = structuredClone(currentState);
    reset.links.forEach(link => { delete link.emoji; }); reset.showAllFolder = true;
    await page.evaluate(async state => {
      const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
      if (!(await createStorageService({ logger: null }).save(state)).ok) throw new Error('Reset save failed');
    }, reset);
    const localBefore = (await raw()).local;
    await replaceInstalledChrome('old-chrome');
    await page.evaluate(async defaults => {
      const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
      const result = await createStorageService({ logger: null }).update(defaults, state => { state.links[0].title = 'Native reset rename'; });
      if (!result.ok) throw new Error('Old write after reset failed');
    }, defaults);
    await replaceInstalledChrome('current-chrome');
    const after = await load(); reset.links[0].title = 'Native reset rename';
    assert.deepEqual(after, reset);
    assert.equal(after.links.some(link => link.emoji), false); assert.equal(after.showAllFolder, true);
    assert.deepEqual((await raw()).local, localBefore);
    // Restore an explicit emoji choice for the existing export/transfer scenario.
    assert.equal(await page.evaluate(async state => {
      const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
      return (await createStorageService({ logger: null }).save(state)).ok;
    }, currentState), true);
    await page.reload(); await ready();
    return { explicitResetPreserved: true, realStorage: true, exactLocalBackground: true };
  });
  const exported = await exportUI('chrome-to-firefox.json');
  await check('native Chromium: v2 download contains only portable data', async () => {
    assert.equal(exported.document.backupVersion, 2); assert.deepEqual(exported.document.data, portable(currentState));
    assert.doesNotMatch(JSON.stringify(exported.document), /base64|data:image|shortcutsEnabled|background|favicon/);
  });
  const returned = process.env.DATA_QA_FIREFOX_SESSION
    ? await check('native Firefox: real Chrome JSON import and Firefox export', () => nativeFirefoxRoundTrip(exported)) : null;
  if (!returned) report.limitations.push('Native Firefox UI round trip was not requested and was not run.');
  if (returned) await check('native Chromium: Firefox JSON returns without losing data or Chrome settings', async () => {
    await importUI(returned.path); assert.deepEqual(await load(), currentState);
    const final = await exportUI('chrome-after-roundtrip.json'); assert.deepEqual(final.document.data, exported.document.data);
    await closeSettings(); await context.close(); activeContexts.delete(context);
    ({ context, page } = await launch()); assert.deepEqual(await load(), currentState);
  });
  await check('native Chromium: malformed import is rejected without writes', async () => {
    await settings(); await page.locator('#backupSettingsTab').click(); const before = await raw();
    await page.locator('#importBackupInput').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
    await page.locator('#importError').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#confirmImportButton').isVisible(), false); assert.deepEqual(await raw(), before);
    await closeSettings();
  });
  await check('native Chromium: unavailable local wallpaper does not overwrite copied sync data', async () => {
    const origin = await raw();
    const other = await launch(join(output, 'owned-run', 'second-device-model-profile'));
    try {
      await other.page.evaluate(async sync => { await chrome.storage.sync.clear(); await chrome.storage.local.clear(); await chrome.storage.sync.set(sync); }, origin.sync);
      await other.page.reload(); await ready(other.page);
      const restored = await load(other.page); assert.deepEqual(portable(restored), portable(currentState));
      assert.equal(restored.shortcutsEnabled, currentState.shortcutsEnabled);
      assert.equal(restored.background.customAssetAvailable, false); assert.equal(restored.background.value, defaults.background.value);
      assert.equal(restored.background.overlay, currentState.background.overlay);
      assert.equal(restored.background.overlayColor, currentState.background.overlayColor);
      assert.deepEqual((await raw(other.page)).sync, origin.sync);
      assert.equal(await other.page.locator('#appStatus').isVisible(), false);
      // A subsequent ordinary edit on the device without the file must preserve
      // the image identity, so the original device can still resolve its file.
      const edit = restored.links.find(link => link.folderId === restored.selectedFolderId);
      await other.page.locator(`[data-edit-link="${edit.id}"]`).click();
      await other.page.locator('#linkTitle').fill('Edited without local wallpaper');
      await other.page.locator('#linkSubmitButton').click();
      await other.page.locator('#linkDialog').waitFor({ state: 'hidden' });
      const afterEdit = await load(other.page);
      assert.equal(afterEdit.background.customAssetId, currentState.background.customAssetId);
      assert.equal(afterEdit.background.customAssetAvailable, false);
      const current = await import(pathToFileURL(join(output, 'current-chrome', 'storage-service.mjs')));
      const rematerialized = await current.createStorageService({
        syncArea: area((await raw(other.page)).sync), localArea: area(origin.local), logger: null,
      }).load(defaults);
      assert.deepEqual(rematerialized.state.background, currentState.background);
      assert.equal(rematerialized.state.links.find(l => l.id === edit.id).title, 'Edited without local wallpaper');
      await other.page.screenshot({ path: join(output, 'missing-local-background.png') });
    } finally { await other.context.close(); activeContexts.delete(other.context); }
    return { realStorage: true, actualCloudSync: false, localAssetIdentityPreservedOnEdit: true };
  });
  await page.screenshot({ path: join(output, 'chrome-after-roundtrip.png') });
  assert.deepEqual(report.errors, []);
  for (const [platform, expected] of Object.entries(hashes)) assert.equal(hash(await readFile(join(releaseRoot, `minimal-new-tab-${platform}-v1.6.zip`))), expected);
} catch (error) {
  report.fatal = error.stack; process.exitCode = 1; console.error(error.stack);
} finally {
  for (const ctx of activeContexts) await ctx.close().catch(() => {});
  report.ok = !report.fatal && report.errors.length === 0 && report.checks.every(c => c.ok);
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Data continuity QA: ${report.ok ? 'PASS' : 'FAIL'}; ${output}`);
}
