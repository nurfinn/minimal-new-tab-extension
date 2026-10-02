// Optional browser regression suite. Run with Playwright installed, or set
// PLAYWRIGHT_MODULE to an existing Playwright package. No personal profiles are used.
// GESTURE_REAL_CHROME=1 also checks an installed extension and real storage in
// an isolated Chromium profile, including a full close and reopen.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChromeRelease } from './build-chrome.mjs';
import { buildFirefoxRelease } from './build-firefox.mjs';
import { createStorageService, STORAGE_KEYS } from '../storage-service.mjs';
import { recontactTrace } from '../tests/fixtures/trackpad-recontact.mjs';
import { missedSwipeTraces } from '../tests/fixtures/trackpad-missed-swipes.mjs';
import { strongSwipeTraces } from '../tests/fixtures/trackpad-strong-swipes.mjs';
import { rapidSwipeTraces } from '../tests/fixtures/trackpad-rapid-series.mjs';

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const output = process.env.GESTURE_QA_OUTPUT
  ? resolve(process.env.GESTURE_QA_OUTPUT)
  : await mkdtemp(join(tmpdir(), 'minimal-tab-folder-gestures-'));
await mkdir(output, { recursive: true });
const report = { output, checks: [], limitations: [
  'Synthetic wheel events and browser mouse.wheel are not a physical macOS trackpad.',
  'The localhost checks use storage API test doubles; the production service and application run unchanged.',
  'Real Chrome storage is tested only when GESTURE_REAL_CHROME=1; no Google account or cross-device sync is tested.',
  'Firefox is tested over localhost, not as a signed installed add-on. No personal browser or published package is changed.',
] };
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const path = resolve(output, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
    if (!path.startsWith(output + sep)) throw new Error('Outside test output');
    const data = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

function makeArea() {
  return {
    data: {}, failGet: false, failSet: false, failManifest: false, readDelay: 0, commits: 0,
    writeBudget: null, writeAttempts: 0,
    async get(keys = null) {
      if (this.readDelay) await new Promise((resolve) => setTimeout(resolve, this.readDelay));
      if (this.failGet) throw new Error('Test read failure');
      if (keys === null) return structuredClone(this.data);
      const requested = typeof keys === 'string' ? [keys] : keys;
      return Object.fromEntries(requested.filter((key) => Object.hasOwn(this.data, key))
        .map((key) => [key, structuredClone(this.data[key])]));
    },
    async set(items) {
      this.writeAttempts += 1;
      if (this.writeBudget !== null && this.writeAttempts > this.writeBudget) {
        throw new Error('MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded');
      }
      if (this.failSet || (this.failManifest && Object.hasOwn(items, STORAGE_KEYS.manifest))) {
        throw new Error('Test write failure');
      }
      Object.assign(this.data, structuredClone(items));
      if (Object.hasOwn(items, STORAGE_KEYS.manifest)) this.commits += 1;
    },
    async remove(keys) {
      this.writeAttempts += 1;
      if (this.writeBudget !== null && this.writeAttempts > this.writeBudget) {
        throw new Error('MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded');
      }
      for (const key of typeof keys === 'string' ? [keys] : keys) delete this.data[key];
    },
  };
}

function fixture() {
  return {
    selectedFolderId: 'all', shortcutsEnabled: true,
    folders: [{ id: 'root', name: 'Favorites' }, { id: 'work', name: 'Work' },
      { id: 'personal', name: 'Personal' }, { id: 'empty', name: 'Empty' },
      ...Array.from({ length: 20 }, (_, i) => ({ id: `extra-${i}`, name: `Folder ${i + 1}` }))],
    links: Array.from({ length: 80 }, (_, i) => ({
      id: `site-${i}`, title: `Example ${i + 1}`,
      url: i === 0 ? 'https://github.com/' : i === 40 ? 'https://youtube.com/' : `https://example.com/${i}`,
      folderId: i < 40 ? 'work' : 'personal',
    })),
    background: { type: 'image', value: 'images/default-background.png', overlay: 0, overlayColor: '#17122b' },
  };
}

async function replayRecordedSwipes(page, lastTime = 0, trace = recontactTrace) {
  return page.evaluate(async ({ trace, lastTime }) => {
    const selection = () => document.querySelector('[data-folder][aria-pressed="true"]')?.dataset.folder;
    let previous = selection();
    const folders = [];
    const observer = new MutationObserver(() => {
      const current = selection();
      if (current && current !== previous) { folders.push(current); previous = current; }
    });
    observer.observe(document.getElementById('folderRow'), { subtree: true, childList: true, attributes: true });
    const start = performance.now();
    const base = Math.max(start, lastTime) + 500;
    try {
      for (const [time, deltaX, deltaY] of trace) {
        const delay = time - (performance.now() - start);
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        const event = new WheelEvent('wheel', { deltaX, deltaY, bubbles: true, cancelable: true });
        Object.defineProperty(event, 'timeStamp', { value: base + time });
        (document.querySelector('.link-card') || document.querySelector('.content')).dispatchEvent(event);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { folders, lastTime: base + trace.at(-1)[0] };
    } finally {
      observer.disconnect();
    }
  }, { trace, lastTime });
}

async function run(browserName, build) {
  const outputDir = join(output, browserName);
  await build({ sourceRoot, outputDir, archivePath: join(output, `minimal-new-tab-${browserName}-gesture-test.zip`) });
  const engine = browserName === 'chrome' ? playwright.chromium : playwright.firefox;
  const browser = await engine.launch({ headless: true });
  const syncArea = makeArea();
  const localArea = makeArea();
  const service = createStorageService({ syncArea, localArea, logger: null });
  const seed = fixture();
  assert.equal((await service.save(seed)).ok, true);
  const messages = JSON.parse(await readFile(join(outputDir, '_locales/en/messages.json'), 'utf8'));
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await context.exposeBinding('__gestureTestStorage', (_, area, method, argument) =>
    ({ sync: syncArea, local: localArea })[area][method](argument));
  await context.addInitScript(({ messages, browserName }) => {
    const area = (name) => Object.fromEntries(['get', 'set', 'remove'].map((method) =>
      [method, (argument) => globalThis.__gestureTestStorage(name, method, argument)]));
    const api = {
      storage: { sync: area('sync'), local: area('local') },
      i18n: {
        getUILanguage: () => 'en',
        getMessage: (key, substitutions = []) => (messages[key]?.message || '').replace(/\$(\d+)/g,
          (_, index) => (Array.isArray(substitutions) ? substitutions : [substitutions])[Number(index) - 1] || ''),
      },
      runtime: { getURL: (path) => new URL(path, location.href).href },
      permissions: { getAll: async () => ({ data_collection: [] }) },
    };
    Object.defineProperty(globalThis, browserName === 'firefox' ? 'browser' : 'chrome', {
      configurable: true, value: api,
    });
  }, { messages, browserName });
  // Exercise real image decoding without external requests or HTTP-cache help.
  let iconRequests = 0;
  const icon = await readFile(join(sourceRoot, 'icons/icon-48.png'));
  await context.route('**/*', (route) => {
    const requestUrl = route.request().url();
    if (requestUrl.startsWith(origin)) return route.continue();
    if (requestUrl.startsWith('https://www.google.com/s2/favicons?')) {
      iconRequests += 1;
      return route.fulfill({ status: 200, contentType: 'image/png',
        headers: { 'Cache-Control': 'no-store' }, body: icon });
    }
    return route.abort();
  });
  const page = await context.newPage();
  const pageErrors = [];
  context.on('page', (page) => page.on('pageerror', (error) => pageErrors.push(error.message)));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const url = `${origin}/${browserName}/newtab.html`;
  let clock = 0;
  async function dispatch({ dx = 90, dy = 0, selector = '.content', gap = 500, ...extra } = {}) {
    clock += gap;
    return page.locator(selector).first().evaluate((target, { dx, dy, clock, extra }) => {
      const event = new WheelEvent('wheel', { deltaX: dx, deltaY: dy, bubbles: true, cancelable: true, ...extra });
      Object.defineProperty(event, 'timeStamp', { value: clock });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    }, { dx, dy, clock, extra });
  }
  async function selected() {
    return page.locator('[data-folder][aria-pressed="true"]').getAttribute('data-folder');
  }
  async function settleSelection() {
    await page.waitForTimeout(1400);
  }
  async function expectFolder(id) {
    await page.waitForFunction((id) => document.querySelector('[data-folder][aria-pressed="true"]')?.dataset.folder === id, id,
      { timeout: 5000 });
  }
  async function check(name, callback) {
    await callback();
    report.checks.push({ browser: browserName, name, passed: true });
    console.log(`PASS ${browserName}: ${name}`);
  }
  try {
    await page.goto(url);
    await expectFolder('all');
    await check('swipes reuse already loaded cards and icons without rebuilding the page', async () => {
      await page.waitForFunction(() => ['site-0', 'site-40'].every((id) => {
        const image = document.querySelector(`[data-link-id="${id}"] .favicon img`);
        return image?.complete && image.naturalWidth > 0 && !image.parentElement.classList.contains('fallback');
      }));
      await page.evaluate(() => {
        globalThis.__renderProbe = {
          cards: new Map([...document.querySelectorAll('.link-card')].map((card) => [card.dataset.linkId, card])),
          chip: document.querySelector('[data-folder="work"]'),
          option: document.querySelector('#linkFolder option[value="work"]'),
          folderRow: document.querySelector('#folderList [data-folder-id="work"]'),
          synchronous: [],
        };
        const probe = globalThis.__renderProbe;
        probe.begin = () => { probe.started = performance.now(); };
        probe.end = () => {
          const card = document.querySelector('.link-card');
          probe.synchronous.push({
            renderMs: performance.now() - probe.started,
            knownIconReady: !card.querySelector('.favicon').classList.contains('fallback'),
          });
        };
        document.addEventListener('wheel', probe.begin, true);
        document.addEventListener('wheel', probe.end);
      });
      const before = iconRequests;
      const samples = [];
      for (const [dx, expected] of [[100, 'work'], [100, 'personal'], [-100, 'work']]) {
        await dispatch({ dx });
        await expectFolder(expected);
        samples.push(await page.evaluate(() => {
          const probe = globalThis.__renderProbe;
          const cards = [...document.querySelectorAll('.link-card')];
          return {
            retainedCards: cards.filter((card) => card === probe.cards.get(card.dataset.linkId)).length,
            totalCards: cards.length,
            retainedChip: probe.chip === document.querySelector('[data-folder="work"]'),
            retainedOption: probe.option === document.querySelector('#linkFolder option[value="work"]'),
            retainedManager: probe.folderRow === document.querySelector('#folderList [data-folder-id="work"]'),
            knownIconReady: !cards[0].querySelector('.favicon').classList.contains('fallback'),
          };
        }));
      }
      await settleSelection();
      const afterSave = await page.evaluate(() => ({
        retainedCard: document.querySelector('[data-link-id="site-0"]') === globalThis.__renderProbe.cards.get('site-0'),
        retainedChip: document.querySelector('[data-folder="work"]') === globalThis.__renderProbe.chip,
      }));
      const synchronous = await page.evaluate(() => {
        const probe = globalThis.__renderProbe;
        document.removeEventListener('wheel', probe.begin, true);
        document.removeEventListener('wheel', probe.end);
        return probe.synchronous;
      });
      const diagnostic = { browser: browserName, samples, synchronous, afterSave, extraIconRequests: iconRequests - before };
      (report.rendering ||= []).push(diagnostic);
      console.log(`Rendering evidence: ${JSON.stringify(diagnostic)}`);
      assert.ok(samples.every((sample) => sample.retainedCards === sample.totalCards), 'already loaded cards were recreated');
      assert.ok(samples.every((sample) => sample.retainedChip && sample.retainedOption && sample.retainedManager), 'folder navigation rebuilt unrelated UI');
      assert.ok(samples.every((sample) => sample.knownIconReady), 'a ready favicon reverted to fallback');
      assert.ok(synchronous.every((sample) => sample.knownIconReady), 'navigation reset a loaded icon before the next frame');
      assert.deepEqual(afterSave, { retainedCard: true, retainedChip: true });
      assert.equal(iconRequests, before, 'revisiting folders requested favicons again');
      await page.locator('[data-folder="all"]').click();
      await expectFolder('all');
      await settleSelection();
    });
    await check('revisiting loaded folders keeps icons available while offline', async () => {
      const before = iconRequests;
      await context.setOffline(true);
      try {
        for (const [dx, expected] of [[100, 'work'], [100, 'personal'], [-100, 'work']]) {
          await dispatch({ dx });
          await expectFolder(expected);
          assert.equal(await page.locator('.link-card .favicon').first().evaluate((node) =>
            node.classList.contains('fallback')), false);
        }
        assert.equal(iconRequests, before);
      } finally {
        await context.setOffline(false);
      }
      await page.locator('[data-folder="all"]').click();
      await expectFolder('all');
      await settleSelection();
    });
    await check('editing and deleting cached sites updates only affected cards and never revives stale data', async () => {
      await page.evaluate(() => {
        globalThis.__unchangedCard = document.querySelector('[data-link-id="site-1"]');
        globalThis.__oldIcon = document.querySelector('[data-link-id="site-0"] .favicon img');
      });
      await page.locator('[data-edit-link="site-0"]').click();
      await page.locator('#linkTitle').fill('Edited cached site');
      await page.locator('#linkUrl').fill('https://figma.com/updated');
      await page.locator('#linkIconButton').click();
      await page.locator('[data-site-emoji="🗺️"]').click();
      await page.locator('#linkSubmitButton').click();
      await page.locator('#linkDialog').waitFor({ state: 'hidden' });
      const edited = page.locator('[data-link-id="site-0"]');
      assert.equal(await edited.locator('.link-title').textContent(), 'Edited cached site');
      assert.equal(await edited.locator('.link-open').getAttribute('href'), 'https://figma.com/updated');
      assert.equal(await edited.locator('.favicon-letter').textContent(), '🗺️');
      assert.equal(await edited.locator('.favicon img').getAttribute('src'), null);
      assert.deepEqual(await page.evaluate(() => ({
        retainedOther: globalThis.__unchangedCard === document.querySelector('[data-link-id="site-1"]'),
        oldSource: globalThis.__oldIcon.getAttribute('src'),
      })), { retainedOther: true, oldSource: null });

      await page.locator('[data-edit-link="site-0"]').click();
      await page.locator('#deleteLinkButton').click();
      await page.locator('#confirmDeleteButton').click();
      await edited.waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => globalThis.__unchangedCard === document.querySelector('[data-link-id="site-1"]')), true);

      // Like import/cross-tab refresh, the saved snapshot can reuse a deleted ID.
      const replacement = structuredClone(seed);
      replacement.selectedFolderId = await selected();
      replacement.links[0] = { ...replacement.links[0], title: 'Replacement site', url: 'https://github.com/new', emoji: '🚀' };
      assert.equal((await service.update(seed, () => replacement)).ok, true);
      assert.equal((await service.load(seed)).state.links[0].title, 'Replacement site');
      await page.locator('[data-folder="all"]').click();
      await expectFolder('all');
      await settleSelection();
      assert.equal(await edited.count(), 1, JSON.stringify({
        storedTitle: (await service.load(seed)).state.links[0]?.title,
        selected: await selected(),
      }));
      assert.equal(await edited.locator('.link-title').textContent(), 'Replacement site');
      assert.equal(await edited.locator('.link-open').getAttribute('href'), 'https://github.com/new');
      assert.equal(await edited.locator('.favicon-letter').textContent(), '🚀');
      assert.equal((await service.update(seed, () => seed)).ok, true);
      await page.reload();
      await expectFolder('all');
    });
    if (browserName === 'firefox') {
      await check('Firefox favicon consent changes invalidate visible and detached cards and stop stale image retries', async () => {
        await page.evaluate(() => {
          globalThis.__hiddenOldIcon = document.querySelector('[data-link-id="site-41"] .favicon img');
        });
        await page.locator('[data-folder="work"]').click();
        await expectFolder('work');
        await settleSelection();
        await page.evaluate(async () => {
          const { setRemoteFaviconLoading } = await import('./favicon-service.mjs');
          setRemoteFaviconLoading(true);
          document.dispatchEvent(new Event('firefox-favicon-sources-changed'));
        });
        await page.waitForFunction(() => {
          const node = document.querySelector('[data-link-id="site-1"] .favicon');
          return !node.classList.contains('fallback') && node.querySelector('img').naturalWidth > 0;
        });
        await page.evaluate(async () => {
          globalThis.__grantedOldIcon = document.querySelector('[data-link-id="site-1"] .favicon img');
          const { setRemoteFaviconLoading } = await import('./favicon-service.mjs');
          setRemoteFaviconLoading(false);
          document.dispatchEvent(new Event('firefox-favicon-sources-changed'));
        });
        const revoked = await page.evaluate(() => {
          const node = document.querySelector('[data-link-id="site-1"] .favicon');
          globalThis.__grantedOldIcon.dispatchEvent(new Event('error'));
          globalThis.__hiddenOldIcon.dispatchEvent(new Event('error'));
          return {
            fallback: node.classList.contains('fallback'), source: node.querySelector('img').getAttribute('src'),
            previousSource: globalThis.__grantedOldIcon.getAttribute('src'),
            detachedSource: globalThis.__hiddenOldIcon.getAttribute('src'),
          };
        });
        assert.deepEqual(revoked, { fallback: true, source: null, previousSource: null, detachedSource: null });
        await page.locator('[data-folder="personal"]').click();
        await expectFolder('personal');
        assert.equal(await page.locator('[data-link-id="site-41"] .favicon img').getAttribute('src'), null);
        await page.locator('[data-folder="all"]').click();
        await expectFolder('all');
        await settleSelection();
      });
    }
    await check('consecutive gestures over cards work without a click or pointer movement', async () => {
      const card = await page.locator('.link-card').first().boundingBox();
      await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
      for (const [dx, folder] of [[100, 'work'], [100, 'personal'], [100, 'empty'], [-100, 'personal'], [-100, 'work']]) {
        await page.mouse.wheel(dx, 0);
        await expectFolder(folder);
        await page.waitForTimeout(500);
      }
      await page.locator('[data-folder="all"]').click();
      await expectFolder('all');
    });
    await check('rapid folder navigation stays responsive and coalesces sync writes under quota', async () => {
      await page.locator('[data-folder="work"]').click();
      await expectFolder('work');
      // Account only for the measured swipe burst, not a still-running setup
      // click save (the faster renderer no longer implicitly waits for it).
      await settleSelection();
      syncArea.writeAttempts = 0;
      syncArea.writeBudget = 10;
      try {
        for (const folder of ['personal', 'empty', 'extra-0']) {
          await dispatch({ dx: 100, gap: 500 });
          await expectFolder(folder);
        }
        await page.waitForTimeout(1600);
        assert.equal((await service.load(seed)).state.selectedFolderId, 'extra-0');
        assert.equal(await page.locator('#appStatus').isVisible(), false);
        assert.ok(syncArea.writeAttempts <= syncArea.writeBudget);
      } finally {
        syncArea.writeBudget = null;
      }
    });
    for (const delay of [0, 45]) {
      await check(`recorded rapid trackpad gestures survive rerenders and ${delay} ms storage latency without clicks`, async () => {
        await page.locator('[data-folder="work"]').click();
        await expectFolder('work');
        syncArea.readDelay = delay;
        const before = syncArea.commits;
        try {
          const result = await replayRecordedSwipes(page, clock);
          clock = result.lastTime;
          assert.deepEqual(result.folders, ['personal', 'work', 'all', 'work']);
          await settleSelection();
          assert.ok(syncArea.commits - before <= 1);
          assert.equal((await service.load(seed)).state.selectedFolderId, 'work');
        } finally {
          syncArea.readDelay = 0;
        }
        await page.locator('[data-folder="all"]').click();
        await expectFolder('all');
      });
    }
    const strongerRapidTrace = { ...rapidSwipeTraces[0], name: 'rapid mixed series at 4x amplitude',
      events: rapidSwipeTraces[0].events.map(([t,x,y]) => [t,x*4,y*4]) };
    for (const trace of [...missedSwipeTraces, ...strongSwipeTraces, ...rapidSwipeTraces, strongerRapidTrace]) {
      await check(`previously missed physical swipes switch exactly once: ${trace.name}`, async () => {
        const order = ['all', ...seed.folders.filter((f) => f.id !== 'root').map((f) => f.id)];
        // Leave enough room for complete rapid series in either direction.
        const offsets = trace.expected.reduce((a,d) => [...a, a.at(-1) + d], [0]);
        let index = 1 - Math.min(...offsets);
        assert.ok(index + Math.max(...offsets) < order.length);
        await page.locator(`[data-folder="${order[index]}"]`).click();
        await expectFolder(order[index]);
        await settleSelection();
        const expected = trace.expected.map((direction) => order[index += direction]);
        const result = await replayRecordedSwipes(page, clock, trace.events);
        clock = result.lastTime;
        assert.deepEqual(result.folders, expected);
        await settleSelection();
        assert.equal((await service.load(seed)).state.selectedFolderId, expected.at(-1));
        assert.equal(await page.locator('#appStatus').isVisible(), false);
        await page.locator('[data-folder="all"]').click();
        await expectFolder('all');
      });
    }
    await check('horizontal swipe changes and persists one folder; momentum never changes another', async () => {
      await settleSelection();
      const before = syncArea.commits;
      await dispatch({ dx: 24 });
      assert.equal(await selected(), 'all');
      await dispatch({ dx: 48, gap: 16 });
      await expectFolder('work');
      for (let i = 0; i < 25; i += 1) await dispatch({ dx: i < 18 ? 35 : -25, gap: 40 });
      assert.equal(await selected(), 'work');
      await settleSelection();
      assert.ok(syncArea.commits - before <= 1);
      assert.equal((await service.load(seed)).state.selectedFolderId, 'work');
    });
    await check('vertical and diagonal movement, zoom and modifiers leave selection alone', async () => {
      const before = syncArea.commits;
      for (const options of [{ dx: 1, dy: 100 }, { dx: 70, dy: 60 },
        { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
        assert.equal(await dispatch(options), false);
      }
      await dispatch({ dx: 8 });
      assert.equal(await dispatch({ dx: 30, dy: 29, gap: 16 }), false);
      assert.equal(await dispatch({ dx: 30, dy: 29, gap: 16 }), false);
      assert.equal(await selected(), 'work');
      assert.equal(syncArea.commits, before);
      const box = await page.locator('.content').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 500);
      await page.waitForFunction(() => document.querySelector('.content').scrollTop > 0);
      assert.equal(await selected(), 'work');
    });
    await check('success resets content to the top; empty folders can also be swiped', async () => {
      await dispatch();
      await expectFolder('personal');
      assert.equal(await page.locator('.content').evaluate((el) => el.scrollTop), 0);
      await dispatch();
      await expectFolder('empty');
      assert.equal(await page.locator('#emptyState').isVisible(), true);
      await dispatch({ dx: -90, selector: '#emptyState' });
      await expectFolder('personal');
    });
    await check('folder-row scrolling does not switch folders or leak its momentum into content', async () => {
      await settleSelection();
      const before = syncArea.commits;
      const rowBefore = await page.locator('#folderRow').evaluate((el) => el.scrollLeft);
      await dispatch({ selector: '#folderRow', dx: 150 });
      assert.ok(await page.locator('#folderRow').evaluate((el) => el.scrollLeft) > rowBefore);
      await dispatch({ dx: 150, gap: 16 });
      assert.equal(await selected(), 'personal');
      assert.equal(syncArea.commits, before);
    });
    await check('first and last folders are bounded without writes; active chip is revealed', async () => {
      await page.locator('[data-folder="all"]').click();
      await expectFolder('all');
      await settleSelection();
      let before = syncArea.commits;
      await dispatch({ dx: -100 });
      assert.equal(await selected(), 'all');
      assert.equal(syncArea.commits, before);
      await page.locator('[data-folder="extra-19"]').click();
      await expectFolder('extra-19');
      await settleSelection();
      before = syncArea.commits;
      await dispatch();
      assert.equal(await selected(), 'extra-19');
      assert.equal(syncArea.commits, before);
      await dispatch({ dx: -100 });
      await expectFolder('extra-18');
      await page.waitForFunction(() => {
        const row = document.getElementById('folderRow').getBoundingClientRect();
        const active = document.querySelector('.folder-chip.active').getBoundingClientRect();
        return active.left >= row.left && active.right <= row.right;
      });
    });
    await check('dialogs and dragging block navigation, including the remainder of a gesture', async () => {
      await page.locator('[data-folder="work"]').click();
      await expectFolder('work');
      await settleSelection();
      const before = syncArea.commits;
      await page.locator('#addLinkButton').click();
      assert.equal(await page.locator('#linkDialog').evaluate((el) => el.open), true);
      await dispatch();
      assert.equal(await selected(), 'work');
      await page.locator('#linkDialog').getByRole('button', { name: 'Close', exact: true }).click();
      await dispatch({ gap: 16 });
      assert.equal(await selected(), 'work');
      const handle = page.locator('[data-drag-link]').first();
      await handle.focus();
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await dispatch();
      assert.equal(await selected(), 'work');
      await page.mouse.up();
      await dispatch({ gap: 16 });
      assert.equal(await selected(), 'work');
      assert.equal(syncArea.commits, before);
    });
    await check('storage write/read failures keep navigation responsive and preserve saved data', async () => {
      for (const flag of ['failSet', 'failGet']) {
        await page.locator('.content').evaluate((el) => { el.scrollTop = 240; });
        const before = structuredClone(syncArea.data);
        syncArea[flag] = true;
        await dispatch();
        await expectFolder('personal');
        await page.locator('#appStatus').waitFor({ state: 'visible' });
        await dispatch({ dx: 100, gap: 500 });
        await expectFolder('empty');
        assert.deepEqual(syncArea.data, before);
        syncArea[flag] = false;
        await page.reload();
        await expectFolder('work');
      }
    });
    await check('a quota failure does not trap navigation and the next gesture can save', async () => {
      syncArea.writeAttempts = 0;
      syncArea.writeBudget = 0;
      try {
        await dispatch();
        await expectFolder('personal');
        await page.locator('#appStatus').waitFor({ state: 'visible' });
        assert.equal((await service.load(seed)).state.selectedFolderId, 'work');
      } finally {
        syncArea.writeBudget = null;
      }
      await dispatch({ dx: 100, gap: 500 });
      await expectFolder('empty');
      await settleSelection();
      assert.equal((await service.load(seed)).state.selectedFolderId, 'empty');
      assert.equal(await page.locator('#appStatus').isVisible(), false);
      await page.locator('[data-folder="work"]').click();
      await expectFolder('work');
      await settleSelection();
    });
    await check('slow storage does not block multiple folder switches', async () => {
      syncArea.readDelay = 90;
      const before = syncArea.commits;
      await dispatch();
      await expectFolder('personal');
      await dispatch({ dx: 100 });
      await expectFolder('empty');
      await dispatch({ dx: 100 });
      await expectFolder('extra-0');
      await settleSelection();
      syncArea.readDelay = 0;
      assert.equal(syncArea.commits - before, 1);
    });
    await check('failed manifest write keeps the prior saved folder without blocking navigation', async () => {
      await settleSelection();
      await page.locator('.content').evaluate((el) => { el.scrollTop = 180; });
      const before = (await service.load(seed)).state;
      syncArea.failManifest = true;
      await dispatch({ dx: -100 });
      await expectFolder('empty');
      await page.locator('#appStatus').waitFor({ state: 'visible' });
      assert.equal(await selected(), 'empty');
      assert.deepEqual((await service.load(seed)).state, before);
      syncArea.failManifest = false;
      await page.reload();
      await expectFolder('extra-0');
    });
    await check('refreshes folder order and keeps sites added by another tab', async () => {
      await page.locator('[data-folder="all"]').click();
      await expectFolder('all');
      await settleSelection();
      const secondPage = await context.newPage();
      await secondPage.goto(url);
      await secondPage.locator('[data-folder="all"][aria-pressed="true"]').waitFor();
      await secondPage.evaluate(async () => {
        const { createStorageService } = await import('./storage-service.mjs');
        const service = createStorageService({ logger: null });
        const result = await service.update({}, (latest) => {
          const personal = latest.folders.find((folder) => folder.id === 'personal');
          latest.folders = [latest.folders[0], personal, ...latest.folders.filter((f) => !['root', 'personal'].includes(f.id))];
          latest.links.push({ id: 'other-tab-site', title: 'Added in another tab', url: 'https://example.org/', folderId: 'personal' });
          return latest;
        });
        if (!result.ok) throw new Error('Could not prepare second-tab change');
      });
      await dispatch();
      await expectFolder('work');
      await settleSelection();
      assert.equal((await service.load(seed)).state.links.some((link) => link.id === 'other-tab-site'), true);
      await page.locator('[data-folder="all"]').click();
      await expectFolder('all');
      await settleSelection();
      await dispatch();
      await expectFolder('personal');
      await settleSelection();
      await secondPage.close();
    });
    await check('reload and a new tab restore the saved folder', async () => {
      await page.reload();
      await expectFolder('personal');
      const next = await context.newPage();
      await next.goto(url);
      await next.locator('[data-folder="personal"][aria-pressed="true"]').waitFor();
      await next.close();
    });
    await check('a quick reload after clicking a folder preserves the selection', async () => {
      await page.locator('[data-folder="work"]').click();
      await expectFolder('work');
      await page.waitForTimeout(100);
      await page.reload();
      await expectFolder('work');
      await page.locator('[data-folder="personal"]').click();
      await expectFolder('personal');
      await settleSelection();
    });
    await check('opening a site immediately after a swipe flushes the selected folder', async () => {
      await dispatch({ dx: -100 });
      await expectFolder('all');
      await page.locator('.link-open').first().evaluate((link, browserName) => {
        link.href = `${location.origin}/${browserName}/newtab.html?opened-site=1`;
      }, browserName);
      await page.locator('.link-open').first().click();
      await page.waitForURL('**/newtab.html?opened-site=1');
      await expectFolder('all');
      await page.locator('[data-folder="personal"]').click();
      await expectFolder('personal');
      await settleSelection();
    });
    await check('browser-dispatched horizontal wheel works in both directions', async () => {
      const box = await page.locator('.content').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(100, 0);
      await expectFolder('work');
      // Deliberately separate input sequences, as a real gesture-end gap would.
      await page.waitForTimeout(320);
      await page.mouse.wheel(-100, 0);
      await expectFolder('personal');
    });
    await page.screenshot({ path: join(output, `${browserName}-folder-swipe.png`) });
    await check('a newer selection from another tab is not overwritten by a stale swipe', async () => {
      const changed = await service.update(seed, (latest) => ({ ...latest, selectedFolderId: 'work' }));
      assert.equal(changed.ok, true);
      const before = syncArea.commits;
      await dispatch({ dx: -100 });
      await expectFolder('work');
      assert.equal(syncArea.commits, before);
      assert.equal((await service.load(seed)).state.selectedFolderId, 'work');
    });
    await check('fresh installation with no user folders performs no writes on swipe', async () => {
      syncArea.data = {};
      localArea.data = {};
      await page.reload();
      await expectFolder('all');
      const before = syncArea.commits;
      await dispatch();
      await dispatch({ dx: -100 });
      assert.equal(await selected(), 'all');
      assert.equal(syncArea.commits, before);
      assert.deepEqual(syncArea.data, {});
    });
    assert.deepEqual(pageErrors, []);
  } catch (error) {
    report.checks.push({ browser: browserName, passed: false, error: error.stack });
    await page.screenshot({ path: join(output, `${browserName}-failure.png`) }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}

async function runRealChrome() {
  const extension = join(output, 'chrome');
  const profile = join(output, 'chrome-test-profile');
  const errors = [];
  let context;
  async function openNewTab() {
    context = await playwright.chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    await context.route(/^https?:/, (route) => route.abort());
    const page = context.pages()[0] || await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('chrome://newtab/');
    await page.locator('[data-folder][aria-pressed="true"]').waitFor();
    assert.equal(await page.evaluate(() => Boolean(chrome.runtime?.id && chrome.storage?.sync)), true);
    return page;
  }
  function passed(name) {
    report.checks.push({ browser: 'chrome-extension', name, passed: true });
    console.log(`PASS chrome-extension: ${name}`);
  }
  try {
    let page = await openNewTab();
    const seed = fixture();
    assert.equal(await page.evaluate(async (seed) => {
      const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
      return (await createStorageService({ logger: null }).save(seed)).ok;
    }, seed), true);
    await page.reload();
    await page.locator('[data-folder="all"][aria-pressed="true"]').waitFor();
    const box = await page.locator('.content').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(120, 0);
    await page.locator('[data-folder="work"][aria-pressed="true"]').waitFor();
    await page.waitForTimeout(320);
    await page.mouse.wheel(120, 0);
    await page.locator('[data-folder="personal"][aria-pressed="true"]').waitFor();
    await page.waitForTimeout(1400);
    const stored = await page.evaluate(async () => {
      const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
      return (await createStorageService({ logger: null }).load({})).state;
    });
    assert.equal(stored.selectedFolderId, 'personal');
    assert.equal(stored.links.length, seed.links.length);
    passed('installed new-tab extension switches folders and writes real chrome.storage.sync');

    await page.locator('[data-folder="work"]').click();
    await page.locator('[data-folder="work"][aria-pressed="true"]').waitFor();
    const replayed = await replayRecordedSwipes(page);
    assert.deepEqual(replayed.folders, ['personal', 'work', 'all', 'work']);
    assert.equal(await page.locator('#appStatus').isVisible(), false);
    passed('recorded rapid trackpad gestures each switch once with real Chrome storage');
    await page.locator('[data-folder="work"]').click();
    await page.waitForTimeout(1400);
    const missed = await replayRecordedSwipes(page, replayed.lastTime, missedSwipeTraces[0].events);
    assert.deepEqual(missed.folders, ['personal', 'empty']);
    assert.equal(await page.locator('#appStatus').isVisible(), false);
    passed('previously missed same-direction recontact works in an installed Chrome extension');
    await page.locator('[data-folder="all"]').click();
    await page.waitForTimeout(1400);
    const strong = await replayRecordedSwipes(page, missed.lastTime, strongSwipeTraces[0].events);
    assert.deepEqual(strong.folders, ['work', 'personal', 'empty', 'extra-0']);
    assert.equal(await page.locator('#appStatus').isVisible(), false);
    passed('strong physical recontacts no longer stall an installed Chrome extension');
    const rapidTrace = rapidSwipeTraces[0];
    const order = ['all', ...seed.folders.filter(f => f.id !== 'root').map(f => f.id)];
    let rapidIndex = 8;
    await page.locator(`[data-folder="${order[rapidIndex]}"]`).click();
    await page.waitForTimeout(1400);
    const rapidExpected = rapidTrace.expected.map(d => order[rapidIndex += d]);
    const rapid = await replayRecordedSwipes(page, strong.lastTime, rapidTrace.events);
    assert.deepEqual(rapid.folders, rapidExpected);
    assert.equal(await page.locator('#appStatus').isVisible(), false);
    passed('complete fast physical series switches without skips or extra momentum transitions');
    await page.locator('[data-folder="personal"]').click();
    await page.locator('[data-folder="personal"][aria-pressed="true"]').waitFor();
    await page.waitForTimeout(1400);

    await page.reload();
    await page.locator('[data-folder="personal"][aria-pressed="true"]').waitFor();
    await page.screenshot({ path: join(output, 'chrome-extension-folder-swipe.png') });
    passed('reload restores the selection from real Chrome storage');

    await context.close();
    page = await openNewTab();
    await page.locator('[data-folder="personal"][aria-pressed="true"]').waitFor();
    const reopened = await page.evaluate(async () => {
      const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
      return (await createStorageService({ logger: null }).load({})).state;
    });
    assert.deepEqual(reopened, stored);
    assert.deepEqual(errors, []);
    passed('closing and reopening the isolated browser preserves sites and the selected folder');
  } catch (error) {
    report.checks.push({ browser: 'chrome-extension', passed: false, error: error.stack });
    throw error;
  } finally {
    await context?.close();
  }
}

try {
  await run('chrome', buildChromeRelease);
  await run('firefox', buildFirefoxRelease);
  if (process.env.GESTURE_REAL_CHROME === '1') await runRealChrome();
} finally {
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  server.close();
  console.log(`Browser report: ${join(output, 'report.json')}`);
}
