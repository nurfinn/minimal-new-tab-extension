# Review fixes — verification, 22 October 2026

Base: `493f8ab` (published 1.7 source). Fix branch: `codex/review-fixes-20261022`.

## Corrected behavior

| Review finding | Change and regression evidence |
| --- | --- |
| 1. Delayed site save overwrites another site | Submit captures the record ID and dialog session. A delayed Alpha save leaves Beta's record and newly opened draft intact. Tested with controlled storage delay in both engines and a real native Chromium Web Lock. |
| 2. Swipe autosave resets form drafts | Folder selection, inline rename text, caret and focus survive background renders. Saving the preserved draft writes the intended folder/name. |
| 3. Stale export | Export reads the queued, confirmed storage snapshot. Changes from another tab appear in the file; read failure produces an error, not a download of defaults. |
| 4. Failed staging fills sync storage | A local ownership journal supports safe recovery after restart. Twelve failed publications followed by rename/delete recover; foreign staging and referenced snapshots remain intact. |
| 5. Accepted collections become uneditable | Byte-based admission reserves a second complete snapshot and small-edit headroom. Verified recovery compaction removes retired copies before staging when necessary. Large accepted collections stay editable; oversized replacements are rejected before publishing. |
| 6. First click in a stale tab is reverted | A same-profile intent token orders actual input independently of stale state. Both tab event orders, in-flight changes, hidden/deleted folders and site-save selection are covered. |
| 7. Valid collections cannot be backed up | Backup validation keeps the 1 MiB file limit and schema checks, without the incompatible 100-folder/500-site caps. 101 folders and 501 sites round-trip when within the byte bound. |

A related keyboard race surfaced during the full run: a deferred folder reveal could restore an older focus target after the user moved focus. A deterministic test failed in both engines before the fix; restoration now respects newer focus.

## Verification

| Suite | Passed |
| --- | ---: |
| Node unit/contract tests | 427 / 427 |
| Settings, forms, visibility, layout, EN/RU, Firefox permissions model | 90 / 90 |
| Emoji picker, fallback and persistence | 58 / 58 |
| Folder gestures, recorded rapid sequences and storage latency | 69 / 69 |
| Error notifications, pointer access and keyboard recovery | 41 / 41 |
| Chrome update lifecycle and multi-window guards | 17 / 17 |
| Published 1.6 compatibility and native Chromium data continuity | 19 / 19 |
| New cross-browser review regressions | 34 / 34 |
| New native unpacked Chromium regressions | 4 / 4 |

Total: **427 unit/contract tests and 332 browser/integration checks**. These are scenario counts, not a claim that no other defects exist.

Both platform packages build successfully in isolated temporary directories. Firefox package validation with `web-ext@10.5.0` reports zero errors, notices or warnings. The workflow adds pinned Playwright 1.62.1 to run the new regressions on every PR and relevant push. No new runtime dependency or permission is added.

## Independent review

A fresh-context whole-branch reviewer examined `493f8ab..156ff6e` and independently reran the then-current 419-test suite. It found two Important issues, no Critical issues or deferred Minors:

1. Compaction incorrectly required an existing feature layer for ordinary core-only 1.6 collections. A two-snapshot 300-site upgrade now shrinks safely to 299. Rejection during backup/head publication, readback, or removal retains the last confirmed collection and permits a later retry.
2. An unreadable legacy core could be mistaken for a successful default snapshot during export. Missing chunks, corrupt payloads and unknown core manifests now produce an unsuccessful read-only fallback. Browser export reports an error without a download; an actually empty installation can still export its defaults.

Both findings were reproduced with failing tests, fixed in one pass, and followed by the full test run. The reviewer was not asked to repeat its review; verification of the fixes is provided by those regressions. No findings were set aside as outside scope.

The original form, export, count-limit and storage failure tests were observed failing before their fixes. Stale-tab tests were also rerun against the pre-fix commit `0db4ad3` with the corrected completion waiter. The older competing-tab gesture test was corrected to represent genuinely newer input, rather than interpreting a change made before the gesture as newer.

## Safety boundaries and limitations

- Personal browser profiles, installed extensions, the dirty historical checkout and the product README were not changed. Both manifests remain **1.7**; these commits do not publish a store release.
- Recovery never guesses that unknown historical chunks belong to this installation. Unowned staging is retained because another device may still publish it. An already oversized old collection may need a substantial reduction to fit alongside its sole valid snapshot. See [storage recovery and capacity](storage-recovery-capacity.md).
- Same-profile intent ordering is best-effort if synchronous local storage is disabled. It does not introduce cross-device clock ordering.
- Firefox UI checks use isolated browser engines with extension-API models. Native Chromium tests use real extension storage/Web Locks and process restarts, but no signed store delivery or account synchronization.
- Recorded wheel events and browser wheel input are not a new physical-trackpad test. macOS emoji checks do not establish identical rendering on Windows/Linux.

Published ZIP checksums were verified unchanged:

- Chrome 1.7: `7a210a76c32d760d05a872f07791197d2df1e5c2fa309ea93ee5e6dd620970ce`
- Firefox 1.7: `5c3def8bbe96fe4998af72d1cb21bafc594abd63545deee71fd955d551a3e246`

## Repeating the checks

Run `node --test tests/*.test.mjs`. Browser runners in `scripts/` are `verify-settings-ui.mjs`, `verify-emoji-picker.mjs`, `verify-folder-gestures.mjs`, `verify-app-status.mjs`, `verify-chrome-updates.mjs`, `verify-data-continuity.mjs`, `verify-review-regressions.mjs all` and `verify-review-native-chrome.mjs`. Set `PLAYWRIGHT_MODULE` to the installed Playwright entry when it is outside the project. Data continuity additionally requires `DATA_QA_RELEASE_ROOT` pointing to the immutable published 1.6 archives.

The review-regression runners accept `REVIEW_SOURCE_ROOT` for building a separate historical source tree without changing the active checkout. They produce JSON reports in fresh temporary directories and never reuse personal profiles.
