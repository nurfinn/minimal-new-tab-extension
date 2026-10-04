// Maintainer-only vendoring. No network dependencies in the installed extension.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const commit = '2b75f3ad12b420c9504ef05df8d2564a28f8500e';
const source = `https://raw.githubusercontent.com/phosphor-icons/core/${commit}`;
const target = new URL('../icons/emoji-ui/', import.meta.url);
const names = ['squares-four', 'smiley', 'hand-waving', 'plant', 'orange',
  'airplane-tilt', 'soccer-ball', 'lightbulb', 'heart', 'flag', 'magnifying-glass', 'caret-down'];
await mkdir(target, { recursive: true });
const hashes = {};
for (const file of [...names.map(name => `assets/regular/${name}.svg`), 'LICENSE']) {
  const response = await fetch(`${source}/${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  const contents = await response.text();
  if (file.endsWith('.svg') && (!contents.startsWith('<svg') || /<script|<foreignObject|href=/i.test(contents))) {
    throw new Error(`Unsafe icon: ${file}`);
  }
  const name = file.split('/').at(-1);
  hashes[name] = createHash('sha256').update(contents).digest('hex');
  await writeFile(new URL(name, target), contents);
}
await writeFile(new URL('NOTICE.json', target), JSON.stringify({
  library: 'Phosphor Icons', license: 'MIT', source: 'https://github.com/phosphor-icons/core',
  commit, weight: 'regular', hashes,
}, null, 2) + '\n');
console.log(`Vendored ${names.length} licensed icons, pinned to ${commit}`);
