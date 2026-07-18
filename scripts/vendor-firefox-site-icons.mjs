import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ICON_DEFINITIONS } from '../firefox/favicon-catalog.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'firefox/site-icons');

function validateAsset(asset, bytes, contentType) {
  const extension = extname(asset);
  if (extension === '.svg') {
    const text = bytes.toString('utf8');
    if (!text.includes('<svg') || !/svg/i.test(contentType)) {
      throw new Error(`${asset} is not a valid SVG`);
    }
    return;
  }
  if (extension === '.png' && bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${asset} is not a valid PNG`);
  }
  if (extension === '.ico' && bytes.subarray(0, 4).toString('hex') !== '00000100') {
    throw new Error(`${asset} is not a valid ICO`);
  }
}

await mkdir(output, { recursive: true });
for (const existingAsset of await readdir(output)) {
  if (existingAsset !== 'THIRD_PARTY_NOTICES.md') {
    await rm(join(output, existingAsset), { force: true });
  }
}

const uniqueAssets = new Map(
  ICON_DEFINITIONS.map(({ asset, source }) => [asset, source]),
);

for (const [asset, source] of [...uniqueAssets].sort(([left], [right]) =>
  left.localeCompare(right))) {
  const response = await fetch(source, {
    redirect: 'follow',
    headers: { 'user-agent': 'Minimal-New-Tab-asset-vendor/1.5.6' },
  });
  if (!response.ok) {
    throw new Error(`${asset} returned HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  validateAsset(asset, bytes, response.headers.get('content-type') || '');
  await writeFile(join(output, asset), bytes);
}

process.stdout.write(`Vendored ${uniqueAssets.size} Firefox site icons\n`);
