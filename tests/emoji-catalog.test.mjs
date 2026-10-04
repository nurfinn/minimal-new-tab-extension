import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeSiteEmoji, SITE_EMOJI_OPTIONS } from '../site-icon.mjs';
import { serializeBackup, parseBackupText } from '../backup-service.mjs';

const module = await import('../emoji-catalog.mjs').catch(() => ({}));
const raw = await readFile(new URL('../emoji/catalog.json', import.meta.url), 'utf8')
  .then(JSON.parse).catch(() => null);

test('the first category is the full catalog, not an arbitrary quick-picks subset', () => {
  assert.equal(module.EMOJI_CATEGORIES[0].id, 'all');
  assert.equal(module.EMOJI_CATEGORIES[0].labelKey, 'emojiCategoryAll');
  assert.equal(module.searchEmojiCatalog(module.createEmojiCatalog(raw), { category: 'all' }).length, 1934);
});

test('the offline catalog contains all 3963 fully-qualified sequences in the pinned Unicode 18 file', () => {
  assert.ok(raw, 'A bundled catalog must exist');
  assert.equal(raw.unicodeVersion, '18.0');
  assert.equal(raw.entries.length, 3963);
  assert.equal(new Set(raw.entries.map(e => e.emoji)).size, 3963);
  for (const entry of raw.entries) {
    assert.equal(normalizeSiteEmoji(entry.emoji), entry.emoji, `Invalid sequence: ${entry.emoji}`);
    assert.ok(entry.en && entry.ru && entry.category && entry.base);
  }
  for (const { emoji } of SITE_EMOJI_OPTIONS) assert.ok(raw.entries.some(e => e.emoji === emoji));
});

test('search accepts English, Russian, synonyms, ё/е and exact emoji', () => {
  assert.equal(typeof module.createEmojiCatalog, 'function');
  const catalog = module.createEmojiCatalog(raw);
  for (const query of ['rocket', 'ракета', 'РАКЕТА']) {
    assert.ok(module.searchEmojiCatalog(catalog, { query }).some(e => e.emoji === '🚀'), query);
  }
  assert.ok(module.searchEmojiCatalog(catalog, { query: 'кофе' }).some(e => e.emoji === '☕'));
  assert.ok(module.searchEmojiCatalog(catalog, { query: 'самолет' }).some(e => e.emoji === '✈️'));
  assert.ok(module.searchEmojiCatalog(catalog, { query: 'маяк' }).some(e => e.emoji === '🛙'));
  assert.ok(module.searchEmojiCatalog(catalog, { query: 'соленый огурец' }).some(e => e.emoji === '🫝'));
  assert.ok(module.searchEmojiCatalog(catalog, { query: 'большой палец вправо' }).some(e => e.emoji === '🫺'));
  assert.equal(module.searchEmojiCatalog(catalog, { query: '👍🏽' })[0].emoji, '👍🏽');
  assert.deepEqual(module.searchEmojiCatalog(catalog, { query: 'zzzz-not-an-emoji' }), []);
});

test('category browsing groups tones without losing any selectable variant', () => {
  assert.equal(typeof module.createEmojiCatalog, 'function');
  const catalog = module.createEmojiCatalog(raw);
  const people = module.searchEmojiCatalog(catalog, { category: 'people' });
  assert.ok(people.some(e => e.emoji === '👍'));
  assert.equal(people.some(e => e.emoji === '👍🏽'), false);
  const variants = module.getEmojiVariants(catalog, '👍🏽');
  assert.equal(variants.length, 6);
  assert.equal(variants[0].emoji, '👍');
  assert.ok(variants.some(e => e.emoji === '👍🏽'));
  for (const entry of raw.entries) {
    assert.ok(module.getEmojiVariants(catalog, entry.emoji).some(e => e.emoji === entry.emoji), entry.emoji);
  }
  const flags = module.searchEmojiCatalog(catalog, { category: 'flags' });
  assert.ok(flags.some(e => e.emoji === '🇦🇪'));
  assert.ok(flags.every(e => e.category === 'flags'));
});

test('catalog loading is lazy, cached, and retryable after a failure', async () => {
  assert.equal(typeof module.createEmojiCatalogLoader, 'function');
  let calls = 0;
  const load = module.createEmojiCatalogLoader(async () => {
    calls++;
    if (calls === 1) throw new Error('Missing bundled file');
    return raw;
  });
  assert.equal(calls, 0);
  await assert.rejects(load(), /Missing bundled file/);
  const [a, b] = await Promise.all([load(), load()]);
  assert.equal(calls, 2);
  assert.equal(a, b);
  assert.equal(await load(), a);
  assert.equal(calls, 2);
});

test('catalog rejects damaged entries and does not evaluate names as HTML', () => {
  assert.equal(typeof module.createEmojiCatalog, 'function');
  for (const broken of [null, {}, { ...raw, entries: [] }, {
    ...raw, entries: [{ emoji: 'not emoji', category: 'people', base: 'not emoji', en: 'Bad', ru: 'Bad' }],
  }]) assert.throws(() => module.createEmojiCatalog(broken));
  const catalog = module.createEmojiCatalog(raw);
  assert.equal(module.getEmojiLabel(catalog.entries.find(e => e.emoji === '🚀'), 'ru'), 'ракета');
  assert.equal(module.getEmojiLabel(catalog.entries.find(e => e.emoji === '🚀'), 'fr'), 'rocket');
});

test('an extended catalog emoji keeps the existing backup format and fields', () => {
  const state = { selectedFolderId: 'all', folders: [{ id: 'root', name: 'Favorites' }],
    links: [{ id: 'site', title: 'Site', url: 'https://example.com/', folderId: 'root', emoji: '🧑🏽‍🚀' }] };
  const backup = JSON.parse(serializeBackup(state));
  assert.equal(backup.backupVersion, 2);
  assert.deepEqual(Object.keys(backup.data.links[0]).sort(), ['emoji', 'folderId', 'id', 'title', 'url']);
  assert.equal(parseBackupText(JSON.stringify(backup)).data.links[0].emoji, '🧑🏽‍🚀');
});
