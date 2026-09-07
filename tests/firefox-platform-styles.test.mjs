import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [platformStyles, sharedStyles] = await Promise.all([
  readFile(new URL('../firefox/platform.css', import.meta.url), 'utf8').catch(() => ''),
  readFile(new URL('../styles.css', import.meta.url), 'utf8'),
]);

test('keeps Firefox folder labels at the Chrome baseline size', () => {
  assert.match(
    sharedStyles,
    /\.folder-select\s*\{[^}]*font-size:\s*12px;/s,
  );
  assert.doesNotMatch(platformStyles, /\.folder-select\s*\{/);
});
