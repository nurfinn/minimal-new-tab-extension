# Full emoji catalog — implementation verification, 3 October 2026

The user approved extending the existing URL-pencil picker to a complete offline catalog. This step does not install in personal browsers, publish, change versions or prepare store archives.

## Delivered behavior

- Pinned Unicode Emoji 18.0 file: **3963 fully-qualified sequences**, including compound emoji, flags and skin-tone variants. Category browsing contains 1934 grouped base choices. Standalone modifier components and duplicate unqualified spellings are not included.
- The original 40 quick choices remain the initial view; search accepts English, Russian and literal emoji. Nine full categories plus Quick picks; tone variants open through a small separate arrow, preserving one-click selection of the base emoji.
- Native system emoji fonts remain in use. No Apple/vendor images, fonts or external runtime services are bundled. Unicode/CLDR data notices and the complete Unicode license are included.
- The catalog is fetched from the extension itself only when the picker is opened; the promise is cached for that tab. Initial category batches are 80 buttons, with Show more for subsequent batches. A saved choice later in its category is placed first on reopen, without rendering hundreds of preceding buttons.
- Unavailable or invalid catalog data leaves the quick choices usable and exposes Retry. Escape leaves the variant view first, then closes the picker; Enter in search cannot submit the site form. Cancel never commits a draft.
- Only the selected Unicode string uses the existing optional `emoji` field. Storage service, persisted schema and JSON v2 format are unchanged. No catalog, query, favicon URL, images or base64 enter storage. Existing automatic favicon behavior can be restored.

The generated JSON is 1,491,159 bytes; its ZIP entry is **152,318 bytes**. The generator records the Unicode file SHA, CLDR commit and source hashes. Nineteen Russian labels missing from the pinned CLDR snapshot are supplemented by small project translations, with regression coverage for the new terms.

## Fresh evidence

1. `node --test tests/*.test.mjs`: **253 passed, zero failed/skipped**. The new catalog tests verify uniqueness, validation of every sequence, inclusion of quick choices, RU/EN synonyms, categories, reachability of every grouped variant, lazy loading/cache/retry, malformed data and unchanged backup fields. Build tests verify catalog/modules/notices in both allowlists. The approved shared-source baseline is explicitly updated for this authorized shared feature; protected Chrome store archive checksum remains unchanged.
2. `scripts/verify-emoji-picker.mjs` with `EMOJI_REAL_CHROME=1`: **45 checks passed, no page errors**. Fresh Chrome/Firefox builds, both languages, three viewport sizes (1280×800, 1024×600, 390×700), offline-only requests, search/no results/keyboard, variants, draft/cancel, save/reload/edit, JSON download, restoring website favicon and failed catalog/retry. Three checks additionally load the actual MV3 extension in an isolated Chromium profile with real `chrome.storage`: save a compound toned astronaut, fully close/reopen the browser and recover it, cancel without writes, and download the real JSON preserving that same value.
3. `scripts/verify-settings-ui.mjs` with `SETTINGS_REAL_CHROME=1`: **43 checks passed, no page errors**. Existing accepted Settings, background, backup, card/folder mutations, RU/EN, compact opacity alignment, permissions state, keyboard and responsive layout remain intact. Three real MV3 checks cover background/settings cancellation and persistence across full browser restart.
4. `git diff --check`: clean. Actual quick/search/variant and saved-emoji screenshots were inspected, including Firefox Russian and the real Chromium extension form.

The first browser run found a genuine reopen issue: a previously chosen emoji later in the category was absent from the first batch. That failing browser case now passes after pinning the saved entry. An initial diagnostic HTTP-server error and a wrong overflow assertion for an intentionally external desktop popover were corrected in the harness; neither was reported as a product failure.

Evidence directories:

- `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/emoji-catalog-20261003/`
- `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/emoji-settings-regression-20261003/`

## Boundaries and limitations

Firefox checks use its real Playwright engine, but browser storage/permissions are doubled; the new catalog has not been installed as a signed persistent AMO add-on. The real-storage/restart checks use Chromium, not a signed Chrome Web Store update or a Google sync account. Cross-device sync, store update delivery, physical trackpad acceptance and glyph support on other OS versions are not established by this step. Newly standardized emoji may require a newer OS font; the catalog being complete is not a guarantee of identical glyphs on every device.

No permissions, storage/backup modules, gesture recognizer, card blur, wallpaper, manifests/version numbers, personal installations, commit/push or publications were changed. Generated QA ZIPs live only inside the manual-test directories and are not store-release deliverables.

Protected hashes rechecked:

- Bundled wallpaper: `4cbb0f193204d0e8eeb445c4c6257e271c51b72011a4a70fafa0fa4df0169cd6`.
- Chrome store 1.6 ZIP: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`.
- Firefox store 1.6 ZIP: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.
