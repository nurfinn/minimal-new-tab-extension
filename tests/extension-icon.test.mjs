import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Frozen snapshots of the PNG artwork approved on 2026-10-04.
const approvedIcons = new Map([
  [16, '6b932bf2468cdddb21aece526555d6997414af52ade6c57d284e18d32caccbef'],
  [32, 'fb753339902d951a9b6c4dd483a7b640f5c9c2cd1f328d91d43f4b9a773174e7'],
  [48, 'd7f9ed41071f87b96723dc7d3c06587bb7a8974ada4b5fb54e4684f070dc5ac3'],
  [128, '5d45ac6cfa63736e4a4410cfb4f7c7be9d3fdadcbb306bfc4b01dd8b56b4ff08'],
]);

for (const [size, hash] of approvedIcons) {
  test(`uses the approved transparent ${size}px soft-grid icon`, async () => {
    const png = await readFile(new URL(`../icons/icon-${size}.png`, import.meta.url));
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    assert.equal(png[25], 6, 'RGBA PNG preserves transparent artwork and store margins');
    assert.equal(createHash('sha256').update(png).digest('hex'), hash);
  });
}

test('offers explicit 16px and 32px favicons in the shared new-tab document', async () => {
  const html = await readFile(new URL('../newtab.html', import.meta.url), 'utf8');
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
  assert.ok(head);
  for (const size of [16, 32]) {
    assert.match(head, new RegExp(`<link rel="icon" type="image/png" sizes="${size}x${size}" href="icons/icon-${size}\\.png">`));
  }
});

test('Chrome and Firefox declare the same approved PNG icon set', async () => {
  const chrome = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  const firefox = JSON.parse(await readFile(new URL('../firefox/manifest.json', import.meta.url), 'utf8'));
  const expected = Object.fromEntries([...approvedIcons.keys()].map(size => [String(size), `icons/icon-${size}.png`]));
  assert.deepEqual(chrome.icons, expected);
  assert.deepEqual(firefox.icons, expected);
});
