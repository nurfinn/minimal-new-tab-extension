import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';

const bytes = path => readFile(new URL('../' + path, import.meta.url));
const text = async path => (await bytes(path)).toString('utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
function assertRgbPng(value, width, height) {
  assert.equal(value.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(value.subarray(12, 16).toString(), 'IHDR');
  assert.equal(value.readUInt32BE(16), width);
  assert.equal(value.readUInt32BE(20), height);
  assert.equal(value[24], 8, '8 bits per channel');
  assert.equal(value[25], 2, 'opaque truecolor RGB, not RGBA or indexed color');
}

test('Chrome store descriptions include the full 1.7 changelog and backup caveats', async () => {
  for (const locale of ['en', 'ru']) {
    const copy = await text(`docs/store/chrome-description-${locale}.txt`);
    assert.match(copy, locale === 'en' ? /What’s new in version 1\.7/ : /Новое в версии 1\.7/);
    assert.match(copy, /emoji|эмодзи/i);
    assert.match(copy, locale === 'en' ? /trackpad swipes/ : /свайпами на тачпаде/);
    assert.match(copy, /1\.6/);
    assert.match(copy, locale === 'en' ? /not included in JSON backups/ : /не входят в JSON/);
    assert.match(copy, /Storage/);
    assert.match(copy, /Favicon/);
    assert.match(copy, locale === 'en' ? /Chrome and Firefox use separate sync/ : /Chrome и Firefox используют разные системы синхронизации/);
    assert.doesNotMatch(copy, /\/Users\/|127\.0\.0\.1|localhost|\.codex/);
  }
});

test('store media contains only the ten opaque 1280×800 screenshots', async () => {
  const directory = 'design/store/v1.7/screenshots/';
  const files = await readdir(new URL('../' + directory, import.meta.url));
  assert.equal(files.length, 10);
  for (const locale of ['en', 'ru']) for (const name of ['01-overview', '02-folders', '03-emoji', '04-settings', '05-backup']) {
    assertRgbPng(await bytes(directory + locale + '-' + name + '.png'), 1280, 800);
  }
});

test('approved promotional PNGs preserve their dimensions and final bytes', async () => {
  for (const [name, width, height, hash] of [
    ['en-promo-small-440x280.png', 440, 280, '4d60ffda623df653e0336413eedb2eda728e5414fff5a90c566c572a29dcfdb8'],
    ['en-promo-marquee-1400x560.png', 1400, 560, 'd77e8247e1633725ac66064d855c007c4d4e8ac895c8b3826c090106f80ae5b1'],
  ]) {
    const value = await bytes('design/store/v1.7/promo/' + name);
    assertRgbPng(value, width, height);
    assert.equal(sha(value), hash);
  }
});

test('README links the stored descriptions and media without local absolute paths', async () => {
  const readme = await text('README.md');
  assert.match(readme, /\(docs\/store\/chrome-description-en\.txt\)/);
  assert.match(readme, /\(docs\/store\/chrome-description-ru\.txt\)/);
  assert.match(readme, /\(design\/store\/v1\.7\/README\.md\)/);
  const media = await text('design/store/v1.7/README.md');
  assert.match(media, /440.?280/);
  assert.match(media, /1400.?560/);
  assert.doesNotMatch(media, /\/Users\/|127\.0\.0\.1|localhost|\.codex/);
});
