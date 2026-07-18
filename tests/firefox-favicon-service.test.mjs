import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const firefoxProvider = await import('../firefox/favicon-service.mjs');
const chromeSource = await readFile(new URL('../favicon-service.mjs', import.meta.url), 'utf8');

test.beforeEach(() => {
  firefoxProvider.setRemoteFaviconLoading(false);
});

test('keeps the Chrome provider separate and unchanged', () => {
  assert.match(chromeSource, /chromeFaviconUrl/);
  assert.match(chromeSource, /googleFaviconUrl/);
  assert.doesNotMatch(chromeSource, /resolveLocalFavicon|browsingActivity/);
});

test('returns a packaged local icon without remote consent', () => {
  assert.deepEqual(
    firefoxProvider.buildFaviconSources('https://github.com/openai/codex'),
    ['site-icons/github.svg'],
  );
  assert.deepEqual(
    firefoxProvider.buildFaviconSources('https://unknown.example/private?id=123'),
    [],
  );
});

test('adds hostname-only remote sources after explicit enablement', () => {
  firefoxProvider.setRemoteFaviconLoading(true);
  const sources = firefoxProvider.buildFaviconSources(
    'https://unknown.example/private/document-id?token=secret#account',
  );

  assert.equal(sources.length, 2);
  assert.equal(sources[0], 'https://unknown.example/favicon.ico');

  const google = new URL(sources[1]);
  assert.equal(google.origin, 'https://www.google.com');
  assert.equal(google.pathname, '/s2/favicons');
  assert.equal(google.searchParams.get('domain'), 'unknown.example');
  assert.equal(google.searchParams.get('sz'), '64');

  const serialized = sources.join('\n');
  assert.doesNotMatch(serialized, /private|document-id|token|secret|account/);
});

test('keeps the packaged icon first when remote loading is enabled', () => {
  firefoxProvider.setRemoteFaviconLoading(true);
  assert.deepEqual(
    firefoxProvider.buildFaviconSources('https://github.com/org/private?token=secret'),
    [
      'site-icons/github.svg',
      'https://github.com/favicon.ico',
      'https://www.google.com/s2/favicons?domain=github.com&sz=64',
    ],
  );
});

test('rejects invalid and non-web URLs in every mode', () => {
  firefoxProvider.setRemoteFaviconLoading(true);
  assert.deepEqual(firefoxProvider.buildFaviconSources('github.com'), []);
  assert.deepEqual(firefoxProvider.buildFaviconSources('javascript:alert(1)'), []);
  assert.deepEqual(firefoxProvider.buildFaviconSources('not a URL'), []);
});
