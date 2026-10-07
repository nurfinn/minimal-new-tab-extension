# Native emoji coverage and All emoji — 3 October 2026

User-approved bounded follow-up: keep the accepted compact palette and native system emoji, hide unavailable glyphs on the current device, preserve saved Unicode strings, fall back to the existing website-icon/letter renderer, and replace Quick picks with All emoji / Все эмодзи. No new artwork, fonts, permissions, storage format or product features.

## Cause and implementation

The first reproduced square was U+1FAEB, cracking face, from the bundled Unicode 18 catalog. It is a valid catalog entry, but this Mac's font does not render it. Chromium shows an empty outline; Firefox shows a hexadecimal missing-glyph box. Comparing only glyph width or colour would be wrong: missing boxes differ between engines, while ©️, ™️, ⬛, ♀️, ♂️ and ⚕️ are legitimate monochrome symbols.

`emoji-support.mjs` probes a small detached canvas using the same native font stack. It compares BMP/supplementary missing-glyph borders, checks stable/nonempty rendering, rejects multi-glyph or ignored compound/flag/keycap sequences, and keeps results in a tab-local Map. There are no canvas exports, stored fingerprints, runtime downloads, telemetry or browser/OS sniffing. Blocked/unavailable readback fails safely. This is a conservative rendering capability heuristic, not a universal font-conformance guarantee.

The picker checks only upcoming batches (80 displayed choices, at most 160 candidates per scan); prolonged scans continue between animation frames. Skipped entries do not leave blank cells or strand subsequent pagination/keyboard navigation. Full catalog data stays unchanged: 3963 sequences / 1934 grouped bases. On this Mac, both tested engines classified 19 sequences as unavailable and exposed all 1925 supported bases through scroll pagination, in order. Monochrome controls, country/subdivision flags, joined emoji and skin tones remain selectable.

All emoji is the normal initial category. The old built-in forty choices are retained only as a catalog-load recovery set, with an explanatory error and Retry. RU/EN category/search/status copy remains localized.

The same rendering decision is used in cards and the URL preview. An unavailable saved emoji shows the existing favicon, or the site's letter if no favicon is available. Opening, Cancel and saving an unrelated title/URL do not remove that Unicode value. A new capable page renders it again. Only explicit website-icon selection clears the existing optional emoji field.

## Fresh verification

- Full `node --test tests/*.test.mjs`: **266 passed**, zero failed/skipped. New regression tests failed before implementation for All, missing glyph detection, and four-digit missing boxes. They cover lazy cache, valid monochrome glyphs, differing hex digits, unjoined/ignored sequences and blocked/blank canvas.
- `scripts/verify-emoji-picker.mjs`, `EMOJI_REAL_CHROME=1`: **61 passed**, zero page errors. Evidence: `outputs/manual-tests/emoji-support-accepted-20261003/report.json`. Chromium and Firefox, RU/EN, complete supported-group reachability, search, variants, pagination, keyboard, responsive placement, unavailable persisted values, functioning favicon and letter fallbacks, restricted canvas and restoration on a capable page. Three cases use real MV3 storage in disposable Chromium, including full process restart and JSON export.
- `scripts/verify-settings-ui.mjs`, `SETTINGS_REAL_CHROME=1`: **43 passed**, zero console/page errors. Evidence: `outputs/manual-tests/emoji-support-accepted-settings-20261003/report.json`. Its emoji selection now searches the full catalog instead of assuming a map appears in a quick subset. Settings/background/permissions and CRUD/reorder remain intact.
- `scripts/verify-emoji-preview.mjs`: four Chromium/Firefox × RU/EN preview flows pass, zero page errors. Evidence: `outputs/manual-tests/emoji-support-preview-final-20261003/preview-report.json`.
- Additional gesture and continuity regressions: **76 gesture checks passed**, and **11 continuity checks passed**. Evidence: `outputs/manual-tests/emoji-support-gestures-20261003/report.json` (`passed` fields) and `outputs/manual-tests/emoji-support-continuity-20261003/report.json`. These builds preceded the final additional BMP missing-box control; the recognizer/storage/backup modules remained byte-identical throughout. The final emoji/Settings suites exercise the completed control change.
- Focused and full actual screenshots and normalized source comparisons were inspected in `outputs/manual-tests/emoji-support-accepted-20261003/`. No layout/CSS change was needed; the previously accepted 376×473.80 palette, URL pencil, toolbar and card blur remain intact. The missing glyph's cell is gone rather than replaced by a misleading emoji.

The first browser regression reproduced the square in all four engine/locale flows. An intermediate favicon test incorrectly assumed Firefox's default-off network icons would load; the corrected fixture uses a packaged GitHub icon without enabling network access. The earlier Settings map test was updated to use search after removal of Quick picks. Failures were not concealed or marked passing.

## Preserved scope and limitations

Mac native glyphs were checked in actual Chromium/Firefox rendering engines. Windows/Linux fonts, signed AMO persistence, signed Chrome Web Store update delivery, real account sync and fresh physical-trackpad acceptance are not established by this run. Future font differences may require additional detector cases. No claim of identical Apple emoji on other operating systems.

The local preview at `http://127.0.0.1:60084/` runs actual UI with synthetic, in-memory storage; refreshing intentionally resets demo data. It is not a personal extension installation. All generated test ZIPs are QA artifacts, not store releases.

Unchanged SHA256:

- Storage service: `be508a389aa3c01e0b8a4a83482db3b45c713d92205bb3877154263a3935ae30`.
- Backup service: `3724a3cf79fb38edafa4caddf73fcadcbbc6036f2976c7224f41b635ecc09464`.
- Gesture recognizer: `da96ec872bb17d7173494af295ed96f7cd6a9abb5a42fafa0c6e1ac3505e6452`.
- Wallpaper: `4cbb0f193204d0e8eeb445c4c6257e271c51b72011a4a70fafa0fa4df0169cd6`.
- Chrome store 1.6 ZIP: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`.
- Firefox store 1.6 ZIP: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.

No manifests/version bumps, personal-profile writes, store archive replacements, commit, push or publication.
