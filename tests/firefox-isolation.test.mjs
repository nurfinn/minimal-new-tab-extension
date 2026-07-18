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

test('records the immutable published Chrome archive checksum', () => {
  assert.equal(
    baseline.archive.sha256,
    '82766cce26c0b3f1574a5ac370d950fd6dff9468413ee8dd5aa7caa4a9943b8e',
  );
  assert.equal(
    baseline.archive.path,
    '/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/v1.5.4-store.zip',
  );
});
