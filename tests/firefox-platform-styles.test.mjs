import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const platformStyles = await readFile(
  new URL('../firefox/platform.css', import.meta.url),
  'utf8',
).catch(() => '');

test('keeps Firefox folder labels at the Chrome baseline size', () => {
  assert.match(
    platformStyles,
    /\.folder-select\s*\{[^}]*font-size:\s*16px;/s,
  );
});
