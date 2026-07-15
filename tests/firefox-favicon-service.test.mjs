import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [chromeProvider, firefoxProvider, firefoxSource] = await Promise.all([
  import('../favicon-service.mjs').catch(() => ({})),
  import('../firefox/favicon-service.mjs').catch(() => ({})),
  readFile(new URL('../firefox/favicon-service.mjs', import.meta.url), 'utf8').catch(() => ''),
]);

test('keeps the Chrome favicon provider available as a separate module', () => {
  assert.equal(typeof chromeProvider.buildFaviconSources, 'function');
});

test('Firefox always keeps the visible letter fallback', () => {
  assert.equal(typeof firefoxProvider.buildFaviconSources, 'function');
  assert.deepEqual(firefoxProvider.buildFaviconSources('https://github.com/'), []);
  assert.deepEqual(firefoxProvider.buildFaviconSources('not a URL'), []);
});

test('Firefox favicon provider contains no browser endpoint or remote service', () => {
  assert.ok(firefoxSource.length > 0);
  assert.doesNotMatch(firefoxSource, /google\.com|_favicon|https?:\/\//i);
});
