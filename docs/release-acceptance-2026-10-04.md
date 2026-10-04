# Release-candidate checks — 4 October 2026

## Outcome

The approved UI, emoji catalog, folder navigation, All visibility and softer icon passed the automated checks below. A known mixed-version compatibility limit was reproduced with both actual published 1.6 packages. It is **not fixed**, and the release decision remains open: successful scenario checks do not mean a 100% release-ready or signed-store-certified extension.

No version was changed, no commit/push/publication was performed, and no personal profile or installed extension was updated. Existing uncommitted feature work was retained. The bundled wallpaper remains unchanged.

## Bounded product change

Added a short English/Russian compatibility note inside the existing Export card, beside the download action. It says to update Minimal Tab in the destination browser before import and explains that published versions 1.6 and earlier do not support the new file. The description now explicitly includes emoji. The download button references both paragraphs through `aria-describedby`.

Two regression tests were run before implementation: both failed for the missing copy/markup. After implementation both passed. The complete English/Russian key sets and English fallback still match. Only the four relevant entries in `firefox/chrome-baseline.json` were updated; all 24 baseline hashes match source. No storage, sync protocol, gesture, icon, background or permission behavior changed in this step.

README's unreleased section now includes the full offline catalog, All visibility and the approved icon. The roadmap no longer makes accepting new wallpaper a prerequisite for release.

## Fresh automated evidence

| Check | Result | What it establishes |
| --- | --- | --- |
| Full unit/contract suite | 286 passed; no failures or skipped tests | Services, markup, localization, existing logic and both packaging contracts |
| Settings/All UI | 88 passed | Both engines, RU/EN, draft/save/cancel, narrow layout, backups, permission-state model and folder visibility |
| Emoji UI | 61 passed | Offline catalog, bilingual search, categories, variants, unsupported-glyph fallback, cancel/save, JSON and reload |
| Folder navigation | 76 passed | Replayed recorded gestures, momentum boundaries, cache reuse, save failures, second tabs and selection persistence |
| Data continuity/compatibility | 17 completed as expected | Real 1.6 writers/readers, forward upgrade, backup formats, isolated Chromium restart and the diagnosed limits below |
| Independent artifact gates | 12 passed | Identical tested builds, ZIP contents, approved PNGs, permissions, baseline and protected files |
| Mozilla web-ext 10.5.0 lint | 0 errors, 0 warnings, 0 notices | Independently built Firefox runtime package |
| `git diff --check` | Passed | No whitespace errors in current tracked changes |

The 17 continuity checks include two diagnostic checks that **confirm lost new fields** after an old-client write; they are not preservation passes for emoji/All. The browser runners use disposable synthetic fixtures, not personal saved sites.

Settings and emoji cover Chromium and Playwright Firefox with API doubles. Separate scenarios install the real unpacked extension in isolated Chromium and exercise actual `chrome.storage.sync`/local APIs and full process close/reopen. No personal Chrome process/profile is controlled. Firefox permission states in this run are modeled; prior native user-driven consent checks are documented separately and were not repeated here.

The new compatibility paragraph was checked for visibility, correct RU/EN text, accessible description and horizontal overflow in 12 combinations: both engines × both locales × 1280×800, 1024×600 and 390×700. Actual Chrome-English desktop and Firefox-Russian narrow captures were inspected. No further layout change was needed.

## Reproduced mixed-version risk

For each browser, read and hash-verify the immutable published 1.6 ZIP, extract into a new QA directory, and import its actual storage/backup services. Shared storage is an in-memory API model; this does not establish account sync delivery.

1. A published 1.6 writer creates a 48-site/five-folder state with order, a selected folder, disabled shortcuts and a local image. The current reader loads it without any sync/local rewrite.
2. The current writer saves 🗺️/👍🏽 and hides All. Merely reading it with published 1.6 makes no writes and does not destroy the new data.
3. An ordinary rename saved through the actual published 1.6 service omits fields it does not understand. The next current read loses both emoji selections and restores All visibility. Sites, URLs, folder assignments, order, the rename, shortcut preference and exact local-background data remain intact.
4. Published 1.6 JSON v1 imports into the current parser. Current v2 JSON preserves emoji but is rejected by the published parser with `unsupported-backup`.

This is not a failing forward update or lost sites. A compatibility mitigation needs its own design/decision: simply increasing the schema version can make old clients reject shared data, and blindly restoring old emoji from a cache can undo a deliberate change back to the website icon. No such speculative repair was implemented.

## Candidate identity and protected state

An independent fresh build was compared byte-for-byte with each of the four browser-suite builds. All **43 Chrome** and **112 Firefox** runtime files matched in all four runs. Both final check ZIPs passed `unzip -t`; every archive entry matched its runtime file. Development/source/design/test files are absent from the allowlisted runtime packages.

All four approved icon PNGs match the approved exports in both packages. Chrome permissions remain `storage` and `favicon`; Firefox remains `storage`, without Chrome's update-notifier files. Both manifests still say `1.6`; the check-only ZIPs must not be uploaded as the published release.

The personal Chrome runtime's 43 files remain byte-identical to the previously installed icon candidate. The new Export note is in source and isolated QA builds, **not installed in personal Chrome or Firefox** by this task.

- Published Chrome 1.6 ZIP SHA-256: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`.
- Published Firefox 1.6 ZIP SHA-256: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.
- Bundled wallpaper SHA-256: `4cbb0f193204d0e8eeb445c4c6257e271c51b72011a4a70fafa0fa4df0169cd6`.

## Evidence directories

All are under `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/`:

- `release-final-settings-20261004-v86n2j/`: Settings report, 24 layout metrics/captures and test-only browser packages.
- `release-final-emoji-20261004-4cmjbz/`: emoji report/captures and test-only browser packages.
- `release-final-gestures-20261004-64bg8u/`: recorded-gesture report, rendering metrics and isolated-storage checks.
- `release-final-data-20261004-qk5rax/`: old/new service diagnostics, upgrade/restart/download fixtures, explicit `releaseRisks` and protected archive hashes.
- `release-final-settings-20261004-v86n2j/artifact-check-reviewed/`: independent packages, final aggregate report, complete `unit-tests.tap`, and `firefox-lint.json`.

The first aggregate checker stopped after nine successful artifact checks because it expected an `ok` field in the gesture report, whose schema uses per-check `passed`. The original stopped report is retained in `artifact-check/`. Correcting that QA-only schema assumption and rerunning in a separate fresh directory completed all 12 gates. No gesture/product change was made; all 76 gesture results explicitly have `passed: true`.

## Remaining release gates

- Decide whether/how to mitigate old-writer loss of emoji and All visibility. The report deliberately sets `releaseReady: false`.
- Actual cross-device account sync remains untested; copying snapshots is not cloud delivery.
- Full Firefox restart with a persistently installed new signed add-on and signed CWS/AMO update delivery remain untested.
- Physical trackpad behavior was previously accepted by the user in both browsers; this run replays captured inputs, not new physical gestures.
- Emoji appearance on Windows/Linux/other operating systems is not certified by macOS engine checks.
- Assign a new release version, update associated metadata/docs, prepare current Store screenshots and What's New RU/EN, then build final upload folders/ZIPs. Publication is a separate action.

The kept wallpaper is not a release blocker. No new feature expansion is proposed by this verification step.
