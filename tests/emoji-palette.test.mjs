import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { EMOJI_CATEGORIES } from '../emoji-catalog.mjs';

const [html, styles, picker] = await Promise.all(['newtab.html', 'styles.css', 'emoji-picker.mjs']
  .map(path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));

test('compact palette keeps the website icon in a fixed footer, after the emoji results', () => {
  assert.ok(html.indexOf('id="linkIconAuto"') > html.indexOf('id="siteEmojiGrid"'));
  assert.match(html, /class="emoji-picker-footer"/);
  assert.doesNotMatch(html, /id="emojiShowMore"/);
});

test('the palette has seven open cells per row and only the results scroll', () => {
  const rule = name => styles.match(new RegExp(`\\.${name}\\s*\\{([^}]+)\\}`))?.[1] || '';
  assert.match(rule('site-emoji-grid'), /grid-template-columns:\s*repeat\(7,/);
  assert.match(rule('site-emoji-grid'), /overflow-y:\s*auto/);
  assert.match(rule('site-icon-picker'), /overflow:\s*hidden/);
  assert.match(rule('site-emoji-choice'), /border:\s*1px solid transparent/);
  assert.match(rule('site-emoji-choice'), /background:\s*transparent/);
});

test('scroll pagination and keyboard navigation use the rendered grid geometry', () => {
  assert.match(picker, /grid\.addEventListener\('scroll'/);
  assert.match(picker, /getComputedStyle\(grid\)\.gridTemplateColumns/);
  assert.doesNotMatch(picker, /inCategories\s*\?\s*1\s*:\s*5/);
});

test('categories use bundled monochrome icons instead of colored emoji labels', () => {
  assert.match(picker, /createElement\('span'\)/);
  assert.match(picker, /emoji-category-icon/);
  assert.doesNotMatch(picker, /button\.textContent\s*=\s*entry\.icon/);
});

test('all UI icons are passive, licensed and byte-identical to the pinned source', async () => {
  const dir = new URL('../icons/emoji-ui/', import.meta.url);
  const notice = JSON.parse(await readFile(new URL('NOTICE.json', dir)));
  assert.equal(notice.license, 'MIT');
  assert.match(await readFile(new URL('LICENSE', dir), 'utf8'), /Permission is hereby granted/);
  for (const name of [...EMOJI_CATEGORIES.map(c => c.icon), 'magnifying-glass', 'caret-down']) {
    const svg = await readFile(new URL(`${name}.svg`, dir), 'utf8');
    assert.match(svg, /^<svg /);
    assert.doesNotMatch(svg, /<script|foreignObject|href=/i);
    assert.equal(createHash('sha256').update(svg).digest('hex'), notice.hashes[`${name}.svg`]);
  }
});
