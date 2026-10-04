import assert from 'node:assert/strict';
import test from 'node:test';

const module = await import('../emoji-support.mjs').catch(() => ({}));

// Canvas is unavailable in Node. Model its pixel boundary, not the detector:
// fixed-colour glyphs, foreground-colour glyphs and Firefox's codepoint box.
function canvasFixture({ blocked = false, blank = false, unjoined = false, ignoredTags = false, bmpMissing = false } = {}) {
  let draws = 0;
  const context = {
    font: '', fillStyle: '',
    clearRect() {},
    measureText(text) {
      return { width: text === '\uffff' || bmpMissing && text === '⏱️' ? 20
        : unjoined && text.includes('\u200d') ? 64 : 32 };
    },
    fillText(text) { this.text = text; draws++; },
    getImageData() {
      if (blocked) throw new Error('Canvas blocked');
      const pixels = new Uint8ClampedArray(96 * 64 * 4);
      if (blank || !this.text) return { data: pixels };
      const put = (x, y, fixed = false) => {
        const offset = (y * 96 + x) * 4;
        pixels[offset + (fixed || this.fillStyle === '#ff0000' ? 0 : 2)] = fixed ? 80 : 255;
        pixels[offset + 3] = 255;
      };
      const narrowBox = this.text === '\uffff' || bmpMissing && this.text === '⏱️';
      const missing = narrowBox || ['\u{10ffff}', '🫫', '🪌'].includes(this.text);
      if (missing) {
        const right = narrowBox ? 24 : 30;
        for (let x = 8; x <= right; x++) { put(x, 14); put(x, 44); }
        for (let y = 14; y <= 44; y++) { put(8, y); put(right, y); }
        // Real Firefox boxes have different codepoint digits inside the same border.
        put(this.text === '🫫' ? 16 : 18, 24);
      } else if (this.text === '♀️') {
        put(14, 20); put(20, 30); // Valid monochrome emoji must not be rejected.
      } else {
        put(15, 18, true);
        put(ignoredTags && this.text.startsWith('🏴') ? 22
          : this.text.length + 18 + Number(this.text.includes('\u200c')), 24, true);
      }
      return { data: pixels };
    },
  };
  return { createCanvas: () => ({ getContext: () => context }), draws: () => draws };
}

test('emoji support detection is lazy, memory-cached, and accepts valid monochrome symbols', () => {
  assert.equal(typeof module.createEmojiSupport, 'function');
  const fixture = canvasFixture();
  const supports = module.createEmojiSupport(fixture);
  assert.equal(fixture.draws(), 0);
  for (const emoji of ['😀', '©️', '⬛', '♀️', '🇦🇪', '🧑🏽‍🚀']) assert.equal(supports(emoji), true, emoji);
  const before = fixture.draws();
  assert.equal(supports('😀'), true);
  assert.equal(fixture.draws(), before);
});

test('missing-glyph boxes are rejected even when the hex digits differ from the reference', () => {
  assert.equal(typeof module.createEmojiSupport, 'function');
  const supports = module.createEmojiSupport(canvasFixture());
  assert.equal(supports('🫫'), false);
  assert.equal(supports('🪌'), false);
  assert.equal(supports('🙂'), true);
});

test('four-digit missing-glyph boxes are rejected as well as supplementary emoji boxes', () => {
  assert.equal(typeof module.createEmojiSupport, 'function');
  assert.equal(module.createEmojiSupport(canvasFixture({ bmpMissing: true }))('⏱️'), false);
});

test('unjoined compound sequences and ignored subdivision flags are not offered as one emoji', () => {
  assert.equal(typeof module.createEmojiSupport, 'function');
  assert.equal(module.createEmojiSupport(canvasFixture({ unjoined: true }))('🧑🏽‍🚀'), false);
  assert.equal(module.createEmojiSupport(canvasFixture({ ignoredTags: true }))('🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}'), false);
});

test('blocked, unavailable or blank canvas fails safely without exposing a broken glyph', () => {
  assert.equal(typeof module.createEmojiSupport, 'function');
  for (const fixture of [canvasFixture({ blocked: true }), canvasFixture({ blank: true }),
    { createCanvas: () => ({ getContext: () => null }) }]) {
    assert.equal(module.createEmojiSupport(fixture)('😀'), false);
  }
});

test('invalid values never trigger a canvas probe', () => {
  assert.equal(typeof module.createEmojiSupport, 'function');
  const fixture = canvasFixture();
  const supports = module.createEmojiSupport(fixture);
  for (const value of ['', null, 'not an emoji', '😀😀', '<svg>']) assert.equal(supports(value), false);
  assert.equal(fixture.draws(), 0);
});
