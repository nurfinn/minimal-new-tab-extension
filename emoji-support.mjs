import { normalizeSiteEmoji } from './site-icon.mjs';

const WIDTH = 96, HEIGHT = 64;
const RED = '#ff0000', BLUE = '#0000ff';
const FONT = '32px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

function samePixels(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function bounds(pixels) {
  let left = WIDTH, top = HEIGHT, right = -1, bottom = -1;
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    if (!pixels[(y * WIDTH + x) * 4 + 3]) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < 0 ? null : { left, top, right, bottom };
}

// Firefox puts varying hexadecimal digits inside its missing-glyph box.
// Compare the border, not those digits, and require the same glyph bounds.
function matchesMissingGlyph(pixels, reference, width) {
  if (!reference.box || Math.abs(width - reference.width) > 0.5) return false;
  const { left, top, right, bottom } = reference.box;
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    if (x >= left + 3 && x <= right - 3 && y >= top + 3 && y <= bottom - 3) continue;
    const offset = (y * WIDTH + x) * 4;
    for (let channel = 0; channel < 4; channel++) {
      if (pixels[offset + channel] !== reference.pixels[offset + channel]) return false;
    }
  }
  const box = bounds(pixels);
  return box && Object.keys(box).every(key => box[key] === reference.box[key]);
}

// Local, lazy capability detection. No font downloads, network requests,
// browser/OS sniffing, or storage. Results live only in this tab's memory.
export function createEmojiSupport({ createCanvas = () => document.createElement('canvas') } = {}) {
  const cache = new Map();
  let initialized = false, context, maxWidth, missing;

  function paint(text, color) {
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = color;
    context.fillText(text, 4, 44);
    return context.getImageData(0, 0, WIDTH, HEIGHT).data;
  }

  function init() {
    if (initialized) return;
    initialized = true;
    const canvas = createCanvas();
    canvas.width = WIDTH; canvas.height = HEIGHT;
    context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.font = FONT;
    context.textBaseline = 'alphabetic';
    context.clearRect(0, 0, WIDTH, HEIGHT);
    // A privacy-restricted readback may return noise or an opaque substitute.
    // Do not mistake that for a successfully rendered native emoji.
    if (bounds(context.getImageData(0, 0, WIDTH, HEIGHT).data)) {
      context = null;
      return;
    }
    maxWidth = context.measureText('😀').width * 1.25;
    // BMP and supplementary missing glyphs can have different box widths
    // (four versus six codepoint digits), especially in Firefox.
    missing = ['\uffff', '\u{10ffff}'].map(text => {
      const pixels = paint(text, RED);
      return { pixels, box: bounds(pixels), width: context.measureText(text).width };
    });
  }

  return value => {
    const emoji = normalizeSiteEmoji(value);
    if (!emoji) return false;
    if (cache.has(emoji)) return cache.get(emoji);
    let supported = false;
    try {
      init();
      if (context) {
        const width = context.measureText(emoji).width;
        if (width > 0 && width <= maxWidth) {
          const first = paint(emoji, RED);
          if (bounds(first) && !missing.some(reference => matchesMissingGlyph(first, reference, width))) {
            const second = paint(emoji, BLUE);
            // Monochrome symbols are valid too. Require stable readback rather
            // than "has coloured pixels", which incorrectly rejects ©️/♀️/⬛.
            supported = samePixels(first, second) || samePixels(first, paint(emoji, RED));
            // Reject ignored joining/tag/keycap characters: a partial sequence
            // must not pass just because its first component has a glyph.
            let separate = '';
            if (emoji.includes('\u200d')) separate = emoji.replaceAll('\u200d', '\u200c');
            else if (/^\p{Regional_Indicator}{2}$/u.test(emoji)) {
              separate = Array.from(emoji).join('\u200c');
            } else if (/[\u{e0020}-\u{e007f}]/u.test(emoji)) separate = Array.from(emoji)[0];
            else if (emoji.includes('\u20e3')) separate = emoji[0];
            if (supported && separate && samePixels(first, paint(separate, RED))) supported = false;
          }
        }
      }
    } catch {
      // Disabled canvas or a failed probe must never expose a missing glyph.
      supported = false;
    }
    cache.set(emoji, supported);
    return supported;
  };
}

export const isEmojiSupported = createEmojiSupport();

export function getRenderableSiteEmoji(value) {
  const emoji = normalizeSiteEmoji(value);
  return emoji && isEmojiSupported(emoji) ? emoji : '';
}
