import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ENGLISH_FALLBACKS } from '../i18n-service.mjs';
import { SITE_EMOJI_OPTIONS, normalizeSiteEmoji } from '../site-icon.mjs';

const [english, russian] = await Promise.all([
  readFile(new URL('../_locales/en/messages.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../_locales/ru/messages.json', import.meta.url), 'utf8').then(JSON.parse),
]);

test('the built-in picker contains forty distinct, valid, localized emoji', () => {
  assert.equal(SITE_EMOJI_OPTIONS.length, 40);
  assert.equal(new Set(SITE_EMOJI_OPTIONS.map(({ emoji }) => emoji)).size, 40);
  for (const { emoji, labelKey } of SITE_EMOJI_OPTIONS) {
    assert.equal(normalizeSiteEmoji(emoji), emoji);
    assert.match(labelKey, /^emoji[A-Z]/);
    assert.ok(ENGLISH_FALLBACKS[labelKey], `Missing English fallback for ${labelKey}`);
    assert.ok(english[labelKey]?.message, `Missing English label for ${labelKey}`);
    assert.ok(russian[labelKey]?.message, `Missing Russian label for ${labelKey}`);
  }
});

test('accepts one simple or composed emoji and rejects text or multiple symbols', () => {
  for (const emoji of ['🚀', '❤️', '🇦🇪', '🧑‍💻', '👍🏽', '1️⃣']) {
    assert.equal(normalizeSiteEmoji(emoji), emoji);
  }
  for (const value of ['', 'hello', 'A', '🚀🚀', '❤️ hi', '🏽', {}, null]) {
    assert.equal(normalizeSiteEmoji(value), '');
  }
});
