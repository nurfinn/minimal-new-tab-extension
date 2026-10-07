import { normalizeSiteEmoji } from './site-icon.mjs';

export const EMOJI_CATEGORIES = Object.freeze([
  { id: 'all', icon: 'squares-four', labelKey: 'emojiCategoryAll' },
  { id: 'smileys', icon: 'smiley', labelKey: 'emojiCategorySmileys' },
  { id: 'people', icon: 'hand-waving', labelKey: 'emojiCategoryPeople' },
  { id: 'nature', icon: 'plant', labelKey: 'emojiCategoryNature' },
  { id: 'food', icon: 'orange', labelKey: 'emojiCategoryFood' },
  { id: 'travel', icon: 'airplane-tilt', labelKey: 'emojiCategoryTravel' },
  { id: 'activities', icon: 'soccer-ball', labelKey: 'emojiCategoryActivities' },
  { id: 'objects', icon: 'lightbulb', labelKey: 'emojiCategoryObjects' },
  { id: 'symbols', icon: 'heart', labelKey: 'emojiCategorySymbols' },
  { id: 'flags', icon: 'flag', labelKey: 'emojiCategoryFlags' },
]);

const fold = text => text.normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase().replace(/ё/g, 'е');
export function getEmojiLabel(entry, locale = 'en') {
  return locale.startsWith('ru') ? entry.ru : entry.en;
}

export function createEmojiCatalog(raw) {
  if (raw?.formatVersion !== 1 || !Array.isArray(raw.entries) || !raw.entries.length) {
    throw new TypeError('Invalid emoji catalog');
  }
  const ids = new Set(EMOJI_CATEGORIES.slice(1).map(c => c.id));
  const byEmoji = new Map();
  const groups = new Map();
  const entries = raw.entries.map(source => {
    if (!source || normalizeSiteEmoji(source.emoji) !== source.emoji ||
      normalizeSiteEmoji(source.base) !== source.base || !ids.has(source.category) ||
      typeof source.en !== 'string' || !source.en || typeof source.ru !== 'string' || !source.ru ||
      !Array.isArray(source.keywords) || source.keywords.some(k => typeof k !== 'string') || byEmoji.has(source.emoji)) {
      throw new TypeError('Invalid emoji entry');
    }
    const entry = { ...source, search: fold([source.en, source.ru, ...source.keywords].join(' ')) };
    byEmoji.set(entry.emoji, entry);
    if (!groups.has(entry.base)) groups.set(entry.base, []);
    groups.get(entry.base).push(entry);
    return entry;
  });
  for (const [base, variants] of groups) {
    if (!byEmoji.has(base)) throw new TypeError('Missing emoji base');
    variants.sort((a, b) => Number(b.emoji === base) - Number(a.emoji === base));
  }
  return { entries, byEmoji, groups };
}

export function getEmojiVariants(catalog, emoji) {
  const entry = catalog.byEmoji.get(emoji);
  return entry ? catalog.groups.get(entry.base) : [];
}

export function searchEmojiCatalog(catalog, { query = '', category = '' } = {}) {
  const literal = query.trim();
  if (catalog.byEmoji.has(literal)) return [catalog.byEmoji.get(literal)];
  const tokens = fold(literal).split(/\s+/).filter(Boolean);
  const result = [];
  for (const variants of catalog.groups.values()) {
    if (category && category !== 'all' && variants[0].category !== category) continue;
    const entry = tokens.length ? variants.find(v => tokens.every(token => v.search.includes(token))) : variants[0];
    if (entry) result.push(entry);
  }
  return result;
}

export function createEmojiCatalogLoader(readJson = async () => {
  const response = await fetch(new URL('./emoji/catalog.json', import.meta.url));
  if (!response.ok) throw new Error('Bundled emoji catalog unavailable');
  return response.json();
}) {
  let pending;
  return () => {
    if (!pending) pending = Promise.resolve().then(readJson).then(createEmojiCatalog)
      .catch(error => { pending = undefined; throw error; });
    return pending;
  };
}
