// Optional real-browser pointer regression. Only disposable contexts and synthetic data.
// PLAYWRIGHT_MODULE selects a cached package; APP_STATUS_QA_OUTPUT keeps evidence outside source.
// Storage faults are confined to test doubles; the built application and CSS run unchanged.
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

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = dirname(dirname(fileURLToPath(import.meta.url)));
const output = process.env.APP_STATUS_QA_OUTPUT ? resolve(process.env.APP_STATUS_QA_OUTPUT)
  : await mkdtemp(join(tmpdir(), 'minimal-tab-app-status-'));
await mkdir(output, { recursive: true });
const report = { checks: [], observations: [], pageErrors: [], limitations: [
  'Disposable Chromium/Firefox engines with storage API doubles, not personal profiles or signed installations.',
  'Actual browser hit-testing and mouse events are used; no forced clicks, pointer-event dispatch, or hidden warning workaround.',
  'The manifest rejection is controlled here; this does not establish why the earlier native warning appeared.',
] };
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const path = resolve(output, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
    if (!path.startsWith(output + sep)) throw new Error('Outside QA output');
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
function area() {
  return {
    data: {}, failManifest: false,
    async get(keys = null) {
      if (keys === null) return structuredClone(this.data);
      return Object.fromEntries((typeof keys === 'string' ? [keys] : keys)
        .filter(key => Object.hasOwn(this.data, key)).map(key => [key, structuredClone(this.data[key])]));
    },
    async set(values) {
      if (this.failManifest && Object.hasOwn(values, STORAGE_KEYS.manifest)) throw new Error('QA sync-head rejection');
      Object.assign(this.data, structuredClone(values));
    },
    async remove(keys) { for (const key of typeof keys === 'string' ? [keys] : keys) delete this.data[key]; },
  };
}
const seed = {
  selectedFolderId: 'all', showAllFolder: true, shortcutsEnabled: true,
  folders: [{ id: 'root', name: 'Favorites' }, { id: 'work', name: 'Work' }, { id: 'personal', name: 'Personal' }],
  links: [
    { id: 'map-qa', title: 'Map QA', url: 'https://example.invalid/map', folderId: 'work', emoji: '🗺️' },
    { id: 'thumb-qa', title: 'Thumb QA', url: 'https://example.invalid/thumb', folderId: 'personal', emoji: '👍🏽' },
  ],
  background: { type: 'image', value: 'images/default-background.png', overlay: 0, overlayColor: '#17122b' },
};
async function check(name, action) {
  try { await action(); report.checks.push({ name, passed: true }); console.log('PASS ' + name); }
  catch (error) { report.checks.push({ name, passed: false, error: error.stack }); console.log('FAIL ' + name + ': ' + error.message); }
}
async function selected(page, id) {
  await page.waitForFunction(id => document.querySelector('#folderRow [data-folder][aria-pressed="true"]')?.dataset.folder === id,
    id, { timeout: 5000 });
}
async function focused(page, selector) {
  // Folder selection restores focus in the next animation frame; a following
  // keyboard action must not race that existing asynchronous restoration.
  await page.waitForFunction(selector => document.activeElement === document.querySelector(selector),
    selector, { timeout: 5000 });
}
async function savedSelection(service, id) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await service.load(seed)).state.selectedFolderId === id) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail('Successful selection did not persist: ' + id);
}
// Select an actual overlapping point, not a fixed coordinate or a mocked click target.
async function overlap(page, selector) {
  const warning = await page.locator('#appStatus').boundingBox();
  const target = await page.locator(selector).boundingBox();
  assert.ok(warning && target);
  const left = Math.max(warning.x, target.x), right = Math.min(warning.x + warning.width, target.x + target.width);
  const top = Math.max(warning.y, target.y), bottom = Math.min(warning.y + warning.height, target.y + target.height);
  assert.ok(right - left > 4 && bottom - top > 4, 'Fixture must actually place the warning over this target');
  const point = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const hit = await page.evaluate(({ point, selector }) => {
    const element = document.elementFromPoint(point.x, point.y);
    return { targetIsReachable: Boolean(element?.closest(selector)),
      hitTag: element?.tagName, hitId: element?.id || null,
      warningPointerEvents: getComputedStyle(document.getElementById('appStatus')).pointerEvents };
  }, { point, selector });
  return { point, warning, target, hit };
}
async function run(platform, build) {
  const runtime = join(output, platform);
  await build({ sourceRoot: source, outputDir: runtime, archivePath: join(output, `minimal-tab-${platform}-status-test-only.zip`) });
  const browser = await (platform === 'chrome' ? playwright.chromium : playwright.firefox).launch({ headless: true });
  try {
    for (const locale of ['en', 'ru']) for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 700 }]) {
      const name = `${platform}/${locale}/${viewport.width}`;
      const sync = area(), local = area();
      const service = createStorageService({ syncArea: sync, localArea: local, logger: null });
      assert.equal((await service.save(seed)).ok, true);
      const savedBefore = (await service.load(seed)).state;
      const messages = JSON.parse(await readFile(join(runtime, `_locales/${locale}/messages.json`), 'utf8'));
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      context.setDefaultTimeout(5000);
      await context.exposeBinding('__statusStorage', (_, name, method, value) => ({ sync, local })[name][method](value));
      await context.addInitScript(({ messages, platform, locale }) => {
        const area = name => Object.fromEntries(['get', 'set', 'remove'].map(method =>
          [method, value => globalThis.__statusStorage(name, method, value)]));
        const api = {
          storage: { sync: area('sync'), local: area('local') },
          i18n: { getUILanguage: () => locale,
            getMessage: (key, values = []) => (messages[key]?.message || '').replace(/\$(\d+)/g,
              (_, index) => String((Array.isArray(values) ? values : [values])[Number(index) - 1] ?? '')) },
          runtime: { getURL: path => new URL(path, location.href).href },
          permissions: { getAll: async () => ({ data_collection: [] }) },
        };
        Object.defineProperty(globalThis, platform === 'firefox' ? 'browser' : 'chrome', { configurable: true, value: api });
      }, { messages, platform, locale });
      await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      const page = await context.newPage();
      page.on('pageerror', error => report.pageErrors.push(name + ': ' + error.message));
      try {
        await page.goto(`${origin}/${platform}/newtab.html`);
        await selected(page, 'all');
        // Only the external storage publication is faulted; a real UI click drives the production handler.
        sync.failManifest = true;
        await page.locator('#folderRow [data-folder="work"]').click();
        await selected(page, 'work');
        await page.locator('#appStatus').waitFor({ state: 'visible' });
        await check(name + ': rejected sync save keeps a visible, localized alert and the last saved data', async () => {
          assert.equal(await page.locator('#appStatus').getAttribute('role'), 'alert');
          assert.equal(await page.locator('#appStatus').textContent(), messages.storageSaveWarning.message);
          assert.ok((await page.locator('#appStatus').ariaSnapshot()).includes(messages.storageSaveWarning.message));
          assert.deepEqual((await service.load(seed)).state, savedBefore);
        });
        const selector = viewport.width > 760 ? '#folderRow [data-folder="personal"]' : '#settingsButton';
        const evidence = await overlap(page, selector);
        report.observations.push({ name, selector, ...evidence });
        await page.screenshot({ path: join(output, name.replaceAll('/', '-') + '-warning.png') });
        await check(name + ': hit-testing reaches the control underneath the still-visible warning', async () => {
          assert.equal(await page.locator('#appStatus').isVisible(), true);
          assert.equal(evidence.hit.targetIsReachable, true, JSON.stringify(evidence.hit));
        });
        await check(name + ': real mouse click works through the warning without waiting or force', async () => {
          assert.equal(await page.locator('#appStatus').isVisible(), true);
          await page.locator(selector).click({ position: {
            x: evidence.point.x - evidence.target.x, y: evidence.point.y - evidence.target.y }, timeout: 650 });
          if (viewport.width > 760) {
            await selected(page, 'personal');
            await focused(page, selector);
          }
          else {
            assert.equal(await page.locator('#settingsDialog[open]').count(), 1);
            await page.keyboard.press('Escape');
            await page.locator('#settingsDialog').waitFor({ state: 'hidden' });
            await focused(page, '#settingsButton');
          }
        });
        await check(name + ': keyboard folder navigation works while saving is unavailable', async () => {
          const target = page.locator('#folderRow [data-folder="personal"]');
          await target.focus();
          await page.keyboard.press('Enter');
          await selected(page, 'personal');
          await focused(page, '#folderRow [data-folder="personal"]');
          await page.locator('#folderRow [data-folder="work"]').focus();
          await page.keyboard.press('Enter');
          await selected(page, 'work');
          await focused(page, '#folderRow [data-folder="work"]');
          assert.deepEqual((await service.load(seed)).state, savedBefore);
        });
        await check(name + ': a later successful selection clears the warning and preserves sites and emoji', async () => {
          sync.failManifest = false;
          await page.locator('#folderRow [data-folder="personal"]').focus();
          await page.keyboard.press('Enter');
          await selected(page, 'personal');
          await page.locator('#appStatus').waitFor({ state: 'hidden' });
          // A vanished toast alone is not proof the asynchronous selection save completed.
          await savedSelection(service, 'personal');
          const loaded = await service.load(seed);
          assert.equal(loaded.state.selectedFolderId, 'personal');
          assert.deepEqual(loaded.state.links, savedBefore.links);
          assert.deepEqual(loaded.state.folders, savedBefore.folders);
          await page.reload();
          await selected(page, 'personal');
          assert.equal(await page.locator('[data-link-id="thumb-qa"] .favicon-letter').textContent(), '👍🏽');
        });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
try {
  await run('chrome', buildChromeRelease);
  await run('firefox', buildFirefoxRelease);
  await check('both engines: no uncaught application errors', async () => assert.deepEqual(report.pageErrors, []));
} finally {
  await new Promise(resolve => server.close(resolve));
  report.passed = report.checks.filter(check => check.passed).length;
  report.failed = report.checks.filter(check => !check.passed).length;
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, passed: report.passed, failed: report.failed }));
}
if (report.failed) process.exitCode = 1;
