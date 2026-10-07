# Full offline emoji catalog — 3 October 2026

Approved: extend the existing URL-pencil picker, retaining the quick 40 choices; add complete fully-qualified Unicode emoji, RU/EN search and categories, group skin-tone variants. No wallpaper, storage architecture, permissions, release version, personal installation or publication changes.

1. Add catalog/query tests before implementation: complete unique valid sequences, RU/EN search, categories, variants, lazy-loading/retry and unchanged storage/backup round trips.
2. Vendor a pinned Unicode/CLDR snapshot and license notices through a reproducible generator. Ship only generated catalog + notices; no images or runtime internet requests.
3. Add small catalog/picker modules. Load full data only after the pencil is opened; render bounded batches rather than thousands of buttons. Keep website-favicon option and quick selection usable if loading fails.
4. Connect the existing form; localize controls, preserve URL/pencil, cancel/save and keyboard behavior. Include resources in both build allowlists.
5. Run full unit/contract suite and isolated Chromium/Firefox browser checks for both languages, search, categories, variants, keyboard, narrow layouts, offline operation, save/cancel/reload and JSON.

Native glyph support varies by OS. “Complete” means all fully-qualified sequences in the pinned source, not standalone modifier components or a guarantee of newest OS font support. Store only the selected Unicode string; catalog/search state never enters sync/local.

## Implemented and verified

All five steps completed. Bundled data contains 3963 sequences / 1934 grouped base choices. The picker renders 80 entries at a time, and a saved choice outside the first batch is brought into view without mounting the entire category.

Fresh results: 253 unit/contract tests, 45 emoji browser checks (including three real Chromium MV3 checks), and 43 existing Settings regression checks (including three real Chromium checks), all passing with no page errors. Actual browser screenshots were reviewed. Storage, backup schema, permissions, versions, wallpaper and store ZIPs were not changed. Personal browsers were not updated.

Details and environment limitations: [verification report](../../emoji-catalog-verification-2026-10-03.md).

## Approved follow-up — supported native glyphs and All emoji

After accepting the compact palette, the user approved replacing Quick picks with All emoji, filtering unsupported glyphs on-device, and rendering saved unavailable emoji as favicon/letter without modifying their persisted Unicode strings. Implemented in the existing rendering/picker flow, with a lazy memory-only capability helper; complete catalog data, schema, permissions and system emoji style are preserved.

Final follow-up evidence: 266 unit/contract, 61 emoji browser and 43 Settings checks passed, plus four preview flows. Every supported grouped base is reachable in order. [Coverage and environment limitations](../../emoji-support-verification-2026-10-03.md). Original forty choices are now recovery-only, not a normal category.
