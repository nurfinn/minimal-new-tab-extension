import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const baseline = JSON.parse(
  await readFile(new URL('../firefox/chrome-baseline.json', import.meta.url), 'utf8'),
);

test('keeps Chrome release sources byte-for-byte unchanged', async () => {
  for (const [relativePath, expectedHash] of Object.entries(baseline.files)) {
    const contents = await readFile(new URL(relativePath, root));
    const actualHash = createHash('sha256').update(contents).digest('hex');
    assert.equal(actualHash, expectedHash, relativePath);
  }
});

test('records the current Chrome store archive checksum', () => {
  assert.equal(
    baseline.archive.sha256,
    '44b182dd570df171147f73feaf1add1659c3578cfd81895b653076fd7bd46ad9',
  );
  assert.equal(
    baseline.archive.path,
    '/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/minimal-new-tab-chrome-v1.5.5.zip',
  );
});
