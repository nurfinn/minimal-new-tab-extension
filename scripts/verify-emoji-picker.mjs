// Isolated browser verification. Builds contain actual product code; browser storage
// and Firefox permissions are doubled. EMOJI_REAL_CHROME=1 additionally checks
// real MV3 storage in a disposable Chromium profile. No personal profiles used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChromeRelease } from './build-chrome.mjs';
import { buildFirefoxRelease } from './build-firefox.mjs';
import { createStorageService } from '../storage-service.mjs';
import { readFeatureLayer } from '../feature-generation.mjs';
const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const output = process.env.EMOJI_QA_OUTPUT ? resolve(process.env.EMOJI_QA_OUTPUT)
  : await mkdtemp(join(tmpdir(), 'minimal-tab-emoji-'));
await mkdir(output, { recursive: true });
const report = { output, nativeChrome: process.env.EMOJI_REAL_CHROME === '1', checks: [], errors: [], limitations: [
  'Chromium and Playwright Firefox with browser API doubles, not signed store installations.',
  'Glyph appearance/support on other operating systems is not established.',
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
await new Promise(yes => server.listen(0, '127.0.0.1', yes));
const origin = `http://127.0.0.1:${server.address().port}`;
const check = async (name, action) => {
  try { const evidence = await action(); report.checks.push({ name, ok: true, evidence }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, ok: false, error: error.stack }); console.log(`FAIL ${name}: ${error.message}`); }
};
const area = () => ({ data: {}, sets: 0,
  async get(keys = null) { return keys === null ? structuredClone(this.data) : Object.fromEntries(
    (typeof keys === 'string' ? [keys] : keys).filter(key => Object.hasOwn(this.data, key)).map(key => [key, structuredClone(this.data[key])])); },
  async set(values) { this.sets++; Object.assign(this.data, structuredClone(values)); },
  async remove(keys) { for (const key of typeof keys === 'string' ? [keys] : keys) delete this.data[key]; },
});

async function run(platform, build) {
  const root = join(output, platform);
  await build({ sourceRoot, outputDir: root, archivePath: join(output, `minimal-tab-${platform}-emoji-test.zip`) });
  const browser = await playwright[platform === 'chrome' ? 'chromium' : 'firefox'].launch({ headless: true });
  async function context(locale = 'en') {
    const sync = area(), local = area();
    const service = createStorageService({ syncArea: sync, localArea: local, logger: null });
    const fixture = { selectedFolderId: 'all', folders: [{ id: 'root', name: 'Favorites' }],
      links: [{ id: 'existing', title: 'Existing', url: 'https://example.com/', folderId: 'root' }],
      background: { type: 'image', value: 'images/default-background.png', overlay: 0, overlayColor: '#17122b' }, shortcutsEnabled: true };
    assert.equal((await service.save(fixture)).ok, true);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    ctx.setDefaultTimeout(6000);
    await ctx.exposeBinding('__emojiStorage', (_, name, method, value) => ({ sync, local })[name][method](value));
    const messages = JSON.parse(await readFile(join(root, `_locales/${locale}/messages.json`), 'utf8'));
    await ctx.addInitScript(({ messages, locale, platform }) => {
      const storage = name => Object.fromEntries(['get', 'set', 'remove'].map(method =>
        [method, value => globalThis.__emojiStorage(name, method, value)]));
      const api = { storage: { sync: storage('sync'), local: storage('local') },
        runtime: { getURL: path => new URL(path, location.href).href },
        i18n: { getUILanguage: () => locale, getMessage: (key, args = []) => {
          if (key === '@@ui_locale') return locale;
          const entry = messages[key];
          const values = Array.isArray(args) ? args : [args];
          return (entry?.message || '').replace(/\$([a-z][a-z0-9_]*)\$/gi, (_, id) =>
            Object.entries(entry.placeholders || {}).find(([name]) => name.toLowerCase() === id.toLowerCase())?.[1].content || '')
            .replace(/\$(\d+)/g, (_, i) => String(values[Number(i) - 1] ?? ''));
        } },
        permissions: { getAll: async () => ({ data_collection: [] }), request: async () => false,
          onAdded: { addListener() {} }, onRemoved: { addListener() {} } } };
      globalThis[platform === 'firefox' ? 'browser' : 'chrome'] = api;
    }, { messages, locale, platform });
    await ctx.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const page = await ctx.newPage();
    page.on('pageerror', error => report.errors.push(`${platform}/${locale}: ${error.message}`));
    let catalogRequests = 0;
    page.on('request', request => { if (request.url().endsWith('/emoji/catalog.json')) catalogRequests++; });
    const url = `${origin}/${platform}/newtab.html`;
    await page.goto(url);
    await page.locator('.link-card').first().waitFor();
    return { ctx, page, service, sync, local, url, catalogRequests: () => catalogRequests };
  }
  const open = async page => {
    if (!(await page.locator('#linkDialog').isVisible())) await page.locator('#addLinkButton').click();
    if (!(await page.locator('#linkIconPicker').isVisible())) await page.locator('#linkIconButton').click();
  };
  try {
    for (const locale of ['en', 'ru']) {
      const env = await context(locale);
      const { page, service, sync, local } = env;
      const id = `${platform}-${locale}`;
      await check(`${id}: lazy offline catalog starts with All emoji, in bounded batches`, async () => {
        assert.equal(env.catalogRequests(), 0);
        assert.equal(await page.locator('[data-site-emoji]').count(), 0);
        await open(page);
        assert.equal(await page.locator('[data-emoji-category]').count(), 10);
        await page.locator('[data-site-emoji="😀"]').waitFor();
        assert.equal(await page.locator('[data-site-emoji]').count(), 80);
        assert.equal(await page.locator('[data-emoji-category="all"][aria-pressed="true"]').count(), 1);
        assert.equal(await page.locator('#emojiResultsHeading').textContent(), locale === 'ru' ? 'Все эмодзи' : 'All emoji');
        await page.locator('[data-emoji-category="people"]').click();
        await page.locator('[data-emoji-variants="👍"]').waitFor();
        await page.locator('[data-emoji-category="all"]').click();
        assert.equal(env.catalogRequests(), 1);
        await page.screenshot({ path: join(output, `${id}-all.png`) });
      });
      await check(`${id}: unavailable glyphs are hidden, but monochrome and compound emoji remain selectable`, async () => {
        await page.locator('[data-emoji-category="smileys"]').click();
        assert.equal(await page.locator('[data-site-emoji="🫫"]').count(), 0);
        assert.equal(await page.locator('[data-site-emoji="🫠"]').count(), 1);
        for (const emoji of ['©️', '⬛', '♀️', '🧑🏽‍🚀']) {
          await page.locator('#emojiSearch').fill(emoji);
          await page.locator(`[data-site-emoji="${emoji}"]`).waitFor();
        }
        await page.locator('#emojiSearch').fill('🫫');
        await page.locator('#emojiPickerStatus').waitFor({ state: 'visible' });
        assert.equal(await page.locator('[data-site-emoji]').count(), 0);
      });
      await check(`${id}: bilingual search, no results and no Enter submission`, async () => {
        for (const query of ['rocket', 'ракета', 'РАКЕТА']) {
          await page.locator('#emojiSearch').fill(query);
          await page.locator('[data-site-emoji="🚀"]').waitFor();
        }
        await page.locator('#emojiSearch').press('Enter');
        assert.equal(await page.locator('#linkDialog[open]').count(), 1);
        await page.locator('#emojiSearch').fill('zzzz-not-an-emoji');
        await page.locator('#emojiPickerStatus').waitFor({ state: 'visible' });
        assert.equal(await page.locator('[data-site-emoji]').count(), 0);
        await page.locator('#emojiSearch').fill('самолет');
        await page.locator('[data-site-emoji="✈️"]').waitFor();
        await page.screenshot({ path: join(output, `${id}-search.png`) });
      });
      await check(`${id}: categories render bounded batches and expose all choices`, async () => {
        await page.locator('[data-emoji-category="flags"]').click();
        assert.equal(await page.locator('[data-site-emoji]').count(), 80);
        const pinned = await page.locator('#emojiCategories').boundingBox();
        const footer = await page.locator('#linkIconAuto').boundingBox();
        await page.locator('#siteEmojiGrid').evaluate(grid => { grid.scrollTop = grid.scrollHeight; });
        await page.waitForFunction(() => document.querySelectorAll('[data-site-emoji]').length === 160);
        assert.equal(await page.locator('[data-site-emoji]').count(), 160);
        assert.deepEqual(await page.locator('#emojiCategories').boundingBox(), pinned);
        assert.deepEqual(await page.locator('#linkIconAuto').boundingBox(), footer);
        assert.equal(await page.locator('#emojiShowMore').count(), 0);
        await page.locator('[data-emoji-category="people"]').click();
        assert.equal(await page.locator('[data-site-emoji]').count(), 80);
        await page.locator('[data-site-emoji="👍"]').focus();
        await page.locator('[data-site-emoji="👍"]').press('ArrowRight');
        assert.notEqual(await page.evaluate(() => document.activeElement.dataset.siteEmoji), '👍');
      });
      await check(`${id}: outline categories and responsive keyboard rows match the compact palette`, async () => {
        assert.equal(await page.locator('.emoji-category-icon').count(), 10);
        const masks = await page.locator('.emoji-category-icon').evaluateAll(icons => icons.map(icon => getComputedStyle(icon).maskImage));
        for (const mask of masks) assert.match(mask, /icons\/emoji-ui\/.+\.svg/);
        const columnCount = await page.locator('#siteEmojiGrid').evaluate(grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
        assert.equal(columnCount, 7);
        await page.locator('[data-site-emoji]').first().focus();
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.locator('[data-site-emoji]').evaluateAll(buttons => buttons.indexOf(document.activeElement)), columnCount);
        await page.locator('[data-emoji-category="flags"]').click();
        await page.locator('[data-site-emoji]').nth(79).focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('[data-site-emoji]').evaluateAll(buttons => buttons.indexOf(document.activeElement)), 80);
        await page.locator('[data-emoji-category="people"]').click();
      });
      await check(`${id}: grouped tone variants and Escape return without selecting`, async () => {
        await page.locator('[data-emoji-variants="👍"]').click();
        assert.equal(await page.locator('[data-site-emoji]').count(), 6);
        await page.locator('[data-site-emoji="👍🏽"]').waitFor();
        await page.screenshot({ path: join(output, `${id}-variants.png`) });
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#linkIconPicker').isVisible(), true);
        assert.equal(await page.locator('#emojiVariantsBack').isVisible(), false);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#linkIconPicker').isVisible(), false);
        assert.equal(await page.locator('#linkDialog').isVisible(), true);
      });
      await check(`${id}: selection stays a draft; cancel and reopen keep persisted state`, async () => {
        const before = structuredClone(sync.data), localBefore = structuredClone(local.data);
        await open(page);
        await page.locator('#emojiSearch').fill('👍🏽');
        await page.locator('[data-site-emoji="👍🏽"]').click();
        assert.equal(await page.locator('#linkIconPreviewEmoji').textContent(), '👍🏽');
        await page.locator('#linkDialog [data-close]').last().click();
        assert.deepEqual(sync.data, before);
        assert.deepEqual(local.data, localBefore);
        await open(page);
        assert.equal(await page.locator('#linkIconPreviewEmoji').textContent(), '');
        assert.equal(env.catalogRequests(), 1);
      });
      await check(`${id}: extended emoji save, reload, edit and JSON preserve the Unicode string only`, async () => {
        await page.locator('#linkUrl').fill('github.com');
        await page.locator('#linkTitle').fill('Catalog QA');
        await page.locator('#emojiSearch').fill('🧑🏽‍🚀');
        await page.locator('[data-site-emoji="🧑🏽‍🚀"]').click();
        await page.locator('#linkSubmitButton').click();
        await page.locator('#linkDialog').waitFor({ state: 'hidden' });
        let saved = (await service.load({})).state;
        const link = saved.links.find(link => link.title === 'Catalog QA');
        assert.equal(link.url, 'https://github.com/');
        assert.equal(link.emoji, '🧑🏽‍🚀');
        await page.reload();
        await page.locator(`[data-link-id="${link.id}"] .favicon.emoji`).waitFor();
        assert.equal(await page.locator(`[data-link-id="${link.id}"] .favicon-letter`).textContent(), '🧑🏽‍🚀');
        await page.locator(`[data-edit-link="${link.id}"]`).click();
        await page.locator('#linkIconButton').click();
        await page.locator('[data-site-emoji="🧑🏽‍🚀"][aria-pressed="true"]').waitFor();
        await page.locator('#linkDialog [data-close]').last().click();
        await page.locator('#settingsButton').click();
        await page.locator('#backupSettingsTab').click();
        const downloading = page.waitForEvent('download');
        await page.locator('#exportBackupButton').click();
        const backup = JSON.parse(await readFile(await (await downloading).path(), 'utf8'));
        assert.equal(backup.data.links.find(e => e.id === link.id).emoji, '🧑🏽‍🚀');
        assert.deepEqual(Object.keys(backup.data.links.find(e => e.id === link.id)).sort(), ['emoji', 'folderId', 'id', 'title', 'url']);
        assert.equal(JSON.stringify(sync.data).includes('Search results'), false);
        assert.equal(JSON.stringify(sync.data).includes('base64'), false);
        await page.keyboard.press('Escape');
      });
      await check(`${id}: website favicon remains available and removes emoji on Save`, async () => {
        const link = (await service.load({})).state.links.find(link => link.title === 'Catalog QA');
        await page.locator(`[data-edit-link="${link.id}"]`).click();
        await page.locator('#linkIconButton').click();
        await page.locator('#linkIconAuto').click();
        await page.locator('#linkSubmitButton').click();
        await page.locator('#linkDialog').waitFor({ state: 'hidden' });
        assert.equal(Object.hasOwn((await service.load({})).state.links.find(e => e.id === link.id), 'emoji'), false);
        assert.equal(readFeatureLayer(sync.data).payload.sites[link.id].emoji, null);
      });
      for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 600 }, { width: 390, height: 700 }]) {
        await check(`${id}: picker stays inside ${viewport.width}×${viewport.height}`, async () => {
          await page.setViewportSize(viewport);
          await open(page);
          const box = await page.locator('#linkIconPicker').boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1);
          const layout = await page.locator('#linkDialog').evaluate(dialog => ({
            inline: getComputedStyle(dialog.querySelector('#linkIconPicker')).position !== 'absolute',
            bodyOverflow: dialog.querySelector('.modal-inner').scrollWidth > dialog.querySelector('.modal-inner').clientWidth + 1,
          }));
          // A desktop popover is deliberately outside the dialog; its scroll
          // extent is not overflow in the inline dialog layout.
          if (layout.inline) assert.equal(layout.bodyOverflow, false);
          if (viewport.width === 1280) assert.ok(box.y >= 0 && box.y + box.height <= viewport.height);
          await page.screenshot({ path: join(output, `${id}-${viewport.width}x${viewport.height}.png`) });
          await page.keyboard.press('Escape');
          await page.locator('#linkDialog [data-close]').last().click();
        });
      }
      await env.ctx.close();
    }
    const env = await context();
    let attempts = 0;
    await env.ctx.route('**/emoji/catalog.json', route => ++attempts === 1 ? route.abort() : route.continue());
    await check(`${platform}: failed local catalog offers a small safe set and Retry recovers All emoji`, async () => {
      await open(env.page);
      await env.page.locator('#emojiRetry').waitFor({ state: 'visible' });
      assert.equal(await env.page.locator('[data-site-emoji]').count(), 40);
      await env.page.locator('#emojiRetry').click();
      await env.page.locator('#emojiRetry').waitFor({ state: 'hidden' });
      await env.page.locator('[data-site-emoji="😀"]').waitFor();
      assert.equal(await env.page.locator('[data-site-emoji]').count(), 80);
      await env.page.locator('[data-emoji-category="people"]').click();
      await env.page.locator('[data-emoji-variants="👍"]').waitFor();
      assert.equal(attempts, 2);
    });
    await env.ctx.close();
    const complete = await context('en');
    await check(`${platform}: all supported groups remain reachable after filtered entries and scroll pagination`, async () => {
      await open(complete.page);
      await complete.page.locator('[data-site-emoji="😀"]').waitFor();
      const coverage = await complete.page.evaluate(async () => {
        const { isEmojiSupported } = await import('./emoji-support.mjs');
        const { createEmojiCatalogLoader, searchEmojiCatalog } = await import('./emoji-catalog.mjs');
        const catalog = await createEmojiCatalogLoader()();
        const bases = searchEmojiCatalog(catalog, { category: 'all' });
        return { sequences: catalog.entries.length, bases: bases.length,
          available: bases.filter(e => isEmojiSupported(e.emoji)).map(e => e.emoji),
          unavailable: catalog.entries.filter(e => !isEmojiSupported(e.emoji)).map(e => ({ emoji: e.emoji, name: e.en })) };
      });
      assert.equal(coverage.sequences, 3963);
      assert.equal(coverage.bases, 1934);
      let previous = 0;
      while (await complete.page.locator('[data-site-emoji]').count() < coverage.available.length) {
        const count = await complete.page.locator('[data-site-emoji]').count();
        assert.ok(count > previous, 'Pagination must advance past skipped entries');
        previous = count;
        await complete.page.locator('#siteEmojiGrid').evaluate(grid => { grid.scrollTop = grid.scrollHeight; });
        await complete.page.waitForFunction(before => document.querySelectorAll('[data-site-emoji]').length > before, count);
      }
      assert.deepEqual(await complete.page.locator('[data-site-emoji]').evaluateAll(buttons => buttons.map(b => b.dataset.siteEmoji)), coverage.available);
      return { sequences: coverage.sequences, bases: coverage.bases, availableBases: coverage.available.length, unavailable: coverage.unavailable };
    });
    await complete.ctx.close();
    const fallback = await context('en');
    await check(`${platform}: unavailable saved emoji falls back to a letter without changing persisted data`, async () => {
      const state = (await fallback.service.load({})).state;
      state.links[0].emoji = '🫫';
      assert.equal((await fallback.service.save(state)).ok, true);
      const before = structuredClone(fallback.sync.data), localBefore = structuredClone(fallback.local.data);
      await fallback.page.reload();
      await fallback.page.locator('[data-edit-link="existing"]').waitFor();
      assert.equal(await fallback.page.locator('.favicon.emoji').count(), 0);
      assert.equal(await fallback.page.locator('[data-link-id="existing"] .favicon-letter').textContent(), 'E');
      await fallback.page.locator('[data-edit-link="existing"]').click();
      assert.equal(await fallback.page.locator('#linkIconPreviewEmoji').textContent(), '');
      assert.equal(await fallback.page.locator('#linkIconPreview.is-emoji').count(), 0);
      await fallback.page.locator('#linkIconButton').click();
      await fallback.page.locator('[data-site-emoji="😀"]').waitFor();
      assert.equal(await fallback.page.locator('[data-site-emoji="🫫"]').count(), 0);
      await fallback.page.locator('#linkDialog [data-close]').last().click();
      assert.deepEqual(fallback.sync.data, before);
      assert.deepEqual(fallback.local.data, localBefore);
      // Saving unrelated title/URL changes must preserve the unavailable emoji.
      await fallback.page.locator('[data-edit-link="existing"]').click();
      await fallback.page.locator('#linkTitle').fill('Preserved emoji');
      await fallback.page.locator('#linkSubmitButton').click();
      await fallback.page.locator('#linkDialog').waitFor({ state: 'hidden' });
      assert.equal((await fallback.service.load({})).state.links[0].emoji, '🫫');
      // A working favicon remains the first fallback when the network permits it.
      await fallback.ctx.route('https://www.google.com/**', route => route.fulfill({
        contentType: 'image/svg+xml', path: join(sourceRoot, 'firefox', 'site-icons', 'github.svg'),
      }));
      // Firefox correctly keeps network icons off; use a known local icon there.
      const withLocalIcon = (await fallback.service.load({})).state;
      withLocalIcon.links[0].url = 'https://github.com/';
      assert.equal((await fallback.service.save(withLocalIcon)).ok, true);
      await fallback.page.reload();
      await fallback.page.locator('[data-link-id="existing"] .favicon:not(.fallback)').waitFor();
      assert.equal(await fallback.page.locator('.favicon.emoji').count(), 0);
      assert.equal((await fallback.service.load({})).state.links[0].emoji, '🫫');
    });
    await fallback.ctx.close();
    const restricted = await context('en');
    await check(`${platform}: restricted canvas fails safely, and a new capable page restores the saved emoji`, async () => {
      const state = (await restricted.service.load({})).state;
      state.links[0].emoji = '😀';
      assert.equal((await restricted.service.save(state)).ok, true);
      const before = structuredClone(restricted.sync.data), localBefore = structuredClone(restricted.local.data);
      await restricted.ctx.addInitScript(() => {
        if (new URL(location.href).searchParams.has('canvas-blocked')) {
          CanvasRenderingContext2D.prototype.getImageData = () => { throw new Error('Privacy restricted canvas'); };
        }
      });
      await restricted.page.goto(restricted.url + '?canvas-blocked=1');
      await restricted.page.locator('[data-edit-link="existing"]').waitFor();
      assert.equal(await restricted.page.locator('.favicon.emoji').count(), 0);
      assert.equal(await restricted.page.locator('[data-link-id="existing"] .favicon-letter').textContent(), 'E');
      await restricted.page.locator('[data-edit-link="existing"]').click();
      await restricted.page.locator('#linkIconButton').click();
      await restricted.page.waitForFunction(() => document.querySelector('#emojiPickerStatus').textContent.includes('this device'));
      assert.equal(await restricted.page.locator('[data-site-emoji]').count(), 0);
      assert.equal(await restricted.page.locator('#linkIconAuto').isVisible(), true);
      await restricted.page.locator('#emojiSearch').fill('rocket');
      await restricted.page.waitForFunction(() => document.querySelector('#emojiResultsHeading').textContent === 'Search results');
      assert.equal(await restricted.page.locator('[data-site-emoji]').count(), 0);
      await restricted.page.locator('#linkDialog [data-close]').last().click();
      assert.deepEqual(restricted.sync.data, before);
      assert.deepEqual(restricted.local.data, localBefore);
      await restricted.page.goto(restricted.url);
      await restricted.page.locator('[data-link-id="existing"] .favicon.emoji').waitFor();
      assert.equal(await restricted.page.locator('[data-link-id="existing"] .favicon-letter').textContent(), '😀');
      assert.deepEqual(restricted.sync.data, before);
      assert.deepEqual(restricted.local.data, localBefore);
    });
    await restricted.ctx.close();
    const visual = await context('en');
    await check(`${platform}: selected design, long URL and website icon remain aligned`, async () => {
      const state = (await visual.service.load({})).state;
      state.folders = [{ id: 'root', name: 'Favorites' }, { id: 'dev', name: 'Dev' }];
      state.links = [{ id: 'visual', title: 'GitHub', url: 'https://github.com/nurfinn/minimal-new-tab-extension/issues?tab=recent&filter=assigned', folderId: 'dev' }];
      assert.equal((await visual.service.save(state)).ok, true);
      // A passive packaged GitHub icon stands in for the online favicon in
      // Chrome. This fixture only affects the isolated visual capture.
      await visual.ctx.route('https://www.google.com/**', route => route.fulfill({
        contentType: 'image/svg+xml', path: join(sourceRoot, 'firefox', 'site-icons', 'github.svg'),
      }));
      await visual.page.reload();
      await visual.page.locator('[data-edit-link="visual"]').click();
      await visual.page.locator('#linkIconButton').click();
      await visual.page.locator('[data-emoji-category="smileys"]').click();
      await visual.page.locator('[data-site-emoji]').first().focus();
      await visual.page.keyboard.press('ArrowRight');
      await visual.page.keyboard.press('ArrowRight');
      await visual.page.locator('[data-site-emoji]').nth(4).hover();
      const geometry = await visual.page.locator('#linkIconPicker').evaluate(root => {
        const box = el => { const { x, y, width, height } = el.getBoundingClientRect(); return { x, y, width, height }; };
        return { picker: box(root), grid: box(root.querySelector('#siteEmojiGrid')),
          dialog: box(document.querySelector('#linkDialog')), input: box(document.querySelector('#linkUrl')),
          iconControls: box(document.querySelector('.link-url-icon-controls')) };
      });
      assert.ok(geometry.input.x + geometry.input.width <= geometry.iconControls.x + 1);
      await visual.page.screenshot({ path: join(output, `${platform}-design-v1.png`) });
      await visual.page.locator('#linkIconPicker').screenshot({ path: join(output, `${platform}-palette-v1.png`) });
      await writeFile(join(output, `${platform}-design-geometry.json`), JSON.stringify(geometry, null, 2));
    });
    await visual.ctx.close();
  } finally { await browser.close(); }
}

async function runRealChrome() {
  const extension = join(output, 'chrome');
  const profile = await mkdtemp(join(output, 'emoji-real-chrome-profile-'));
  let ctx, page, link;
  const load = () => page.evaluate(async () => {
    const { createStorageService } = await import(chrome.runtime.getURL('storage-service.mjs'));
    return (await createStorageService({ logger: null }).load({})).state;
  });
  async function open() {
    ctx = await playwright.chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    ctx.setDefaultTimeout(10_000);
    await ctx.route(/^https?:/, route => route.abort());
    page = ctx.pages()[0] || await ctx.newPage();
    page.on('pageerror', error => report.errors.push(`chrome-extension: ${error.message}`));
    await page.goto('chrome://newtab/');
    await page.locator('#folderRow [data-folder]').first().waitFor();
    assert.equal(await page.evaluate(() => Boolean(chrome.runtime.id && chrome.storage.sync)), true);
  }
  try {
    await open();
    await check('chrome-extension: offline catalog works with real MV3 APIs and saves extended emoji', async () => {
      let requests = 0;
      page.on('request', request => { if (request.url().endsWith('/emoji/catalog.json')) requests++; });
      assert.equal(requests, 0);
      await page.locator('#addLinkButton').click();
      await page.locator('#linkUrl').fill('github.com');
      await page.locator('#linkTitle').fill('Native emoji QA');
      await page.locator('#linkIconButton').click();
      await page.locator('#emojiSearch').fill('🧑🏽‍🚀');
      await page.locator('[data-site-emoji="🧑🏽‍🚀"]').click();
      await page.locator('#linkSubmitButton').click();
      await page.locator('#linkDialog').waitFor({ state: 'hidden' });
      link = (await load()).links.find(e => e.title === 'Native emoji QA');
      assert.equal(link.emoji, '🧑🏽‍🚀');
      assert.equal(link.url, 'https://github.com/');
      assert.equal(requests, 1);
      const sync = await page.evaluate(async () => JSON.stringify(await chrome.storage.sync.get(null)));
      assert.doesNotMatch(sync, /base64|emojiCategory|Search results|catalog\.json/);
    });
    await check('chrome-extension: full close/reopen restores the emoji and shows the saved choice', async () => {
      const saved = await load();
      await ctx.close();
      await open();
      assert.deepEqual(await load(), saved);
      await page.locator(`[data-link-id="${link.id}"] .favicon.emoji`).waitFor();
      assert.equal(await page.locator(`[data-link-id="${link.id}"] .favicon-letter`).textContent(), '🧑🏽‍🚀');
      await page.locator(`[data-edit-link="${link.id}"]`).click();
      await page.locator('#linkIconButton').click();
      await page.locator('[data-site-emoji="🧑🏽‍🚀"][aria-pressed="true"]').waitFor();
      await page.screenshot({ path: join(output, 'chrome-extension-saved-emoji.png') });
    });
    await check('chrome-extension: cancel does not write storage and a real JSON download preserves emoji', async () => {
      const before = await page.evaluate(async () => ({ sync: await chrome.storage.sync.get(null), local: await chrome.storage.local.get(null) }));
      await page.locator('#emojiSearch').fill('rocket');
      await page.locator('[data-site-emoji="🚀"]').click();
      await page.locator('#linkDialog [data-close]').last().click();
      const after = await page.evaluate(async () => ({ sync: await chrome.storage.sync.get(null), local: await chrome.storage.local.get(null) }));
      assert.deepEqual(after, before);
      await page.locator('#settingsButton').click();
      await page.locator('#backupSettingsTab').click();
      const downloading = page.waitForEvent('download');
      await page.locator('#exportBackupButton').click();
      const backup = JSON.parse(await readFile(await (await downloading).path(), 'utf8'));
      assert.equal(backup.data.links.find(e => e.id === link.id).emoji, '🧑🏽‍🚀');
    });
  } finally { await ctx?.close(); }
}
try {
  await run('chrome', buildChromeRelease);
  await run('firefox', buildFirefoxRelease);
  if (process.env.EMOJI_REAL_CHROME === '1') await runRealChrome();
} finally {
  await new Promise(yes => server.close(yes));
  report.ok = report.checks.every(c => c.ok) && !report.errors.length;
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Emoji QA: ${report.ok ? 'PASS' : 'FAIL'}; ${output}`);
  if (!report.ok) process.exitCode = 1;
}
