export const SITE_EMOJI_OPTIONS = Object.freeze([
  { emoji: '🙂', labelKey: 'emojiSmile' },
  { emoji: '❤️', labelKey: 'emojiHeart' },
  { emoji: '⭐', labelKey: 'emojiStar' },
  { emoji: '🎯', labelKey: 'emojiTarget' },
  { emoji: '🚀', labelKey: 'emojiRocket' },
  { emoji: '🌈', labelKey: 'emojiRainbow' },
  { emoji: '💼', labelKey: 'emojiBriefcase' },
  { emoji: '💻', labelKey: 'emojiLaptop' },
  { emoji: '💡', labelKey: 'emojiLightbulb' },
  { emoji: '☕', labelKey: 'emojiCoffee' },
  { emoji: '🛒', labelKey: 'emojiCart' },
  { emoji: '🎮', labelKey: 'emojiGame' },
  { emoji: '🎵', labelKey: 'emojiMusic' },
  { emoji: '📷', labelKey: 'emojiCamera' },
  { emoji: '✈️', labelKey: 'emojiAirplane' },
  { emoji: '🏠', labelKey: 'emojiHome' },
  { emoji: '🌍', labelKey: 'emojiGlobe' },
  { emoji: '🌿', labelKey: 'emojiLeaf' },
  { emoji: '🇦🇪', labelKey: 'emojiFlag' },
  { emoji: '🧑‍💻', labelKey: 'emojiTechnologist' },
  { emoji: '✨', labelKey: 'emojiSparkles' },
  { emoji: '🔥', labelKey: 'emojiFire' },
  { emoji: '⚡', labelKey: 'emojiLightning' },
  { emoji: '🌙', labelKey: 'emojiMoon' },
  { emoji: '🧠', labelKey: 'emojiBrain' },
  { emoji: '🤖', labelKey: 'emojiRobot' },
  { emoji: '🛠️', labelKey: 'emojiTools' },
  { emoji: '📚', labelKey: 'emojiBooks' },
  { emoji: '📝', labelKey: 'emojiMemo' },
  { emoji: '📅', labelKey: 'emojiCalendar' },
  { emoji: '📁', labelKey: 'emojiFolder' },
  { emoji: '📊', labelKey: 'emojiChart' },
  { emoji: '💰', labelKey: 'emojiMoney' },
  { emoji: '💬', labelKey: 'emojiSpeech' },
  { emoji: '🔗', labelKey: 'emojiLink' },
  { emoji: '🔒', labelKey: 'emojiLock' },
  { emoji: '🎨', labelKey: 'emojiPalette' },
  { emoji: '🍿', labelKey: 'emojiPopcorn' },
  { emoji: '⚽', labelKey: 'emojiFootball' },
  { emoji: '🗺️', labelKey: 'emojiMap' },
]);

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const pictograph = /\p{Extended_Pictographic}/u;
const flag = /^\p{Regional_Indicator}{2}$/u;
const keycap = /^[0-9#*]\uFE0F?\u20E3$/u;

export function normalizeSiteEmoji(value) {
  if (typeof value !== 'string') return '';
  const emoji = value.trim();
  if (!emoji || emoji.length > 64 || /[\u0000-\u001f\u007f]/u.test(emoji)) return '';
  if ([...segmenter.segment(emoji)].length !== 1) return '';
  return pictograph.test(emoji) || flag.test(emoji) || keycap.test(emoji) ? emoji : '';
}
