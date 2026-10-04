// Build-time data vendoring only. Extension runtime never requests these URLs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const unicodeUrl = 'https://www.unicode.org/Public/18.0.0/emoji/emoji-test.txt';
const unicodeSha = '8f3735cda1f92a779d78af67cf86066bb1f07143dc22f2ac29394d9bc57ab21a';
const cldrCommit = '91c267402229a59e3ef2774544f001bf959e8809';
const groups = new Map([
  ['Smileys & Emotion', 'smileys'], ['People & Body', 'people'],
  ['Animals & Nature', 'nature'], ['Food & Drink', 'food'],
  ['Travel & Places', 'travel'], ['Activities', 'activities'],
  ['Objects', 'objects'], ['Symbols', 'symbols'], ['Flags', 'flags'],
]);
const sha = text => createHash('sha256').update(text).digest('hex');
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.text();
}
const files = await Promise.all(['en', 'ru'].flatMap(locale => ['annotations', 'annotationsDerived'].map(kind => {
  const pkg = kind === 'annotations' ? 'cldr-annotations-full' : 'cldr-annotations-derived-full';
  const url = `https://raw.githubusercontent.com/unicode-org/cldr-json/${cldrCommit}/cldr-json/${pkg}/${kind}/${locale}/annotations.json`;
  return download(url).then(text => ({ locale, kind, url, sha256: sha(text), data: JSON.parse(text)[kind].annotations }));
})));
const unicode = await download(unicodeUrl);
assert.equal(sha(unicode), unicodeSha, 'Unexpected Unicode source snapshot');
assert.match(unicode, /# Version: 18\.0/);
const annotations = { en: {}, ru: {} };
for (const file of files) Object.assign(annotations[file.locale], file.data);
const key = emoji => emoji.replace(/\uFE0F/gu, '');
// These Emoji 18 names are not yet present in the pinned CLDR RU annotations.
// Small project translations supplement CLDR; never replace its existing names.
const russianSupplement = {
  '🫫': 'треснувшее лицо', '🫹': 'большой палец влево', '🫺': 'большой палец вправо',
  '🫌': 'бабочка монарх', '🫝': 'солёный огурец', '🛙': 'маяк',
  '🪋': 'метеор', '🪌': 'ластик', '🪍': 'сачок',
};
const russianTones = new Map([
  ['🏻', 'светлый тон кожи'], ['🏼', 'средне-светлый тон кожи'], ['🏽', 'средний тон кожи'],
  ['🏾', 'средне-тёмный тон кожи'], ['🏿', 'тёмный тон кожи'],
]);
for (const locale of ['en', 'ru']) {
  annotations[locale] = new Map(Object.entries(annotations[locale]).map(([emoji, value]) => [key(emoji), value]));
}
let category;
const entries = [];
for (const line of unicode.split('\n')) {
  if (line.startsWith('# group: ')) category = groups.get(line.slice(9).trim());
  const match = line.match(/^([0-9A-F ]+)\s*;\s*fully-qualified\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$/u);
  if (!match) continue;
  assert.ok(category, `Unknown group for ${match[3]}`);
  const emoji = String.fromCodePoint(...match[1].trim().split(/\s+/).map(cp => parseInt(cp, 16)));
  const en = annotations.en.get(key(emoji));
  const ru = annotations.ru.get(key(emoji));
  const supplement = russianSupplement[emoji.replace(/\p{Emoji_Modifier}/gu, '')];
  const tone = [...emoji].find(cp => russianTones.has(cp));
  const russianName = ru?.tts?.[0] || (supplement && `${supplement}${tone ? ': ' + russianTones.get(tone) : ''}`);
  assert.ok(russianName, `Missing Russian translation: ${emoji} ${match[3]}`);
  entries.push({ emoji, category, base: emoji, en: en?.tts?.[0] || match[3],
    ru: russianName,
    keywords: [...new Set([...(en?.default || []), ...(ru?.default || [])])] });
}
assert.equal(entries.length, 3963);
const byKey = new Map(entries.map(entry => [key(entry.emoji), entry]));
const toneGroups = new Map();
for (const entry of entries) {
  const toneFree = key(entry.emoji.replace(/\p{Emoji_Modifier}/gu, ''));
  // Mixed-tone handshake sequences have a different base spelling in Unicode.
  const group = toneFree === '🫱‍🫲' ? key('🤝') : toneFree;
  if (!toneGroups.has(group)) toneGroups.set(group, []);
  toneGroups.get(group).push(entry);
}
for (const [key, variants] of toneGroups) {
  const base = byKey.get(key) || variants[0];
  for (const entry of variants) entry.base = base.emoji;
}
const output = fileURLToPath(new URL('../emoji/', import.meta.url));
await mkdir(output, { recursive: true });
const result = { formatVersion: 1, unicodeVersion: '18.0',
  sources: { unicode: { url: unicodeUrl, sha256: unicodeSha }, cldr: { commit: cldrCommit,
    files: files.map(({ url, sha256 }) => ({ url, sha256 })) },
    russianSupplement: { maintainedIn: 'scripts/vendor-emoji-catalog.mjs', entries: 19 } }, entries };
await writeFile(`${output}catalog.json`, JSON.stringify(result) + '\n');
const license = await download('https://www.unicode.org/license.txt');
assert.ok(license.startsWith('UNICODE LICENSE V3'));
await writeFile(`${output}UNICODE-LICENSE.txt`, license);
console.log(JSON.stringify({ entries: entries.length, baseChoices: new Set(entries.map(e => e.base)).size,
  bytes: Buffer.byteLength(JSON.stringify(result)), missingRussianNames: entries.filter(e => !annotations.ru.get(key(e.emoji))?.tts?.[0]).length,
  sha256: sha(JSON.stringify(result) + '\n') }, null, 2));
