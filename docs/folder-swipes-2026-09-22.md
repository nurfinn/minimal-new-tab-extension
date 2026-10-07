# Folder swipes — implementation and verification

Latest handoff (2026-10-02): after explicit approval, the final recognizer was transferred to the user's existing personal test Chrome folder, preserving path/ID/version and leaving storage untouched. Verified backup, one-file diff and fresh 227/227 tests; opened a new Minimal Tab page without reloading old tabs. Personal runtime interaction remains a manual check because JavaScript automation is disabled. [Install record](personal-chrome-swipe-install-2026-10-02.md). Firefox and store archives are untouched; no release/commit/push.

## Latest physical check — rapid-series improvement confirmed (2026-10-02)

After the paired-impulse redesign, the user tested the isolated Chromium build and replied «да вроде уже норм». `capture-uFi2I7/trace-001.json` contains983 delivered content wheel events,24 emitted directions and24 matching adjacent-folder changes; no guard/routing failures or long-task entries. Each of the24 inspected separated bursts emits once. The handler maximum is5.7ms. This supports the user's current assessment; it is not a universal finger-gesture count or OS-paint measurement. Recognizer hash: `da96ec872bb17d7173494af295ed96f7cd6a9abb5a42fafa0c6e1ac3505e6452`.

The reported rapid-series symptom did not recur in this check. No new personal Chrome/Firefox installation, store ZIP, commit or release was made. Broader manual checks over card targets (the trace target is content), dialogs, vertical scrolling and signed Firefox remain separate release checks. Final automated evidence from implementation:227 unit/contract,76 gesture browser,43 Settings; details in `docs/rapid-swipe-diagnosis-2026-10-02.md` and the plan.

## Earlier manual finding — diagnosis history (2026-10-02)

After the fast-switching Chrome test update, the user reported intermittent missed swipes, initially deferred the work, then approved diagnosis and correction. The user reproduced the misses in an isolated installed Chromium extension with synthetic sites. The local capture has 2,655 wheel events; all reached the content handler, with zero guard masks. The recognizer emitted 19 directions, each reflected in the selected folder. This capture does not show missing DOM delivery, a storage wait or a later selection rollback.

Confirmed cause: the recontact gate required the new onset to be at least three times smaller than the old momentum tail (with a narrow small-tail exception). Real new bursts often did not meet that ratio: e.g. 26 after 72, 14 after 16, and 14 after 6. Their subsequent acceleration was consequently ignored. Replaying the delivered events in the pure recognizer reproduces the misses independently of the renderer. This gate was unchanged by the card-reuse optimization; the timing of the user's report does not prove that optimization caused the bug.

The first source correction removed that ratio gate, initially keeping the modest-onset, gap, distance, axis and cadence requirements. A candidate needs two adjacent samples above the acceleration threshold so a single coalesced spike cannot confirm it. Independent review also reproduced a stale coasting candidate swallowing the next onset; expiry is handled before considering the current event as a fresh candidate. Active candidates retain their pending-start state. The later marked-capture follow-up below also removes the absolute onset cap. Only `folder-gestures.mjs` changes runtime behavior in these follow-ups; rendering, storage, styling, permissions and schema stay unchanged.

Three sanitized physical excerpts first failed, then passed with the expected 2/3/4 directions in both horizontal orientations. The review regression also failed in both directions before correction. The complete unit suite now passes **205/205**, including momentum, plateau, spike and pending-start guards. Final browser runs pass **60/60** gesture checks (27 Chromium, 28 Firefox, 5 installed Chrome) and **43/43** Settings checks. Installed Chrome uses actual storage and full browser reopen; Firefox uses localhost and API doubles, not a signed addon or native consent prompt. Raw replay direction counts are not treated as a count of intended physical gestures.

The corrected isolated window produced `capture-MAUp7x/trace-001.json`: 1,345 delivered wheel events over content, no guard blocks, 32 emitted directions and matching selections. The user reported “вроде норм. но, бывает зависает чуть” and clarified that the folder changes late after the gesture, rather than the cards appearing late. This is partial improvement, not final acceptance; the trace does not establish that every intended gesture was recognized or cover pointer placement directly over cards.

Latency follow-up: most confirmed candidates in this trace took 18–78 ms from the observed onset; two took 138–139 ms. The old capture-to-deferred-sample interval was at most 26.3 ms, which does not indicate a long JS stall in this sample, but it is not a paint measurement. Earlier automated rendering checks measured 1.6–3.2 ms synchronous Chrome handlers and 4–5 ms in Firefox; those are synthetic scenarios, not the user's complete perceived latency. A slower confirmation gate is a hypothesis, not a proven explanation for the reported pauses.

QA-only instrumentation now separates native event delivery, recognizer execution, complete content-handler execution and the next animation-frame opportunity; the latter is explicitly not actual pixel-presentation timing. Numeric long-task durations and an explicit Space marker let the user identify a perceived pause. No keys other than that explicit marker, user text, URLs or long-task attribution are stored. Runtime thresholds remain unchanged pending this measurement. The privacy/timing-schema regression went RED→GREEN; 206 unit/contract tests and the installed diagnostic smoke pass.

### Marked delay capture: strong onsets rejected (2026-10-02)

The user completed `capture-4Ua5nW/trace-001.json` and marked three perceived delays. All 2,128 wheel events reached content without guard blocks; there were 39 selections and frame opportunities, and no reported long tasks. Maximum handler time was 6.9 ms, recognizer execution 2 ms, native delivery 37.9 ms, and next-rAF opportunity 2 ms. These measurements do not prove OS pixel presentation, but the unchanging selected folder is directly visible in the trace: strong accelerating recontacts starting at 36–54 px were rejected by the absolute 32 px onset cap. Around the first mark three bursts were ignored; before the later marks a second cluster of five was ignored, followed by recovery on a smaller onset. This is a recognition stall, not a wait for storage or a slow card reconstruction in these captured clusters.

Two sanitized excerpts (331 samples) now reproduce four and six bursts, in both horizontal orientations. Before correction each emitted only its first direction. The absolute onset cap is removed; amplitude alone neither rejects nor confirms a gesture. The existing gap, relative doubling with two adjacent qualifying samples, count, distance, axis and duration checks remain. Reviewer-found regression: an unexpired large coast could monopolize a later light/reversed onset. That was independently reproduced RED in both directions, then fixed by replacing the unconfirmed candidate on a smaller/reversed onset after another short interruption, carrying the pending-start latch. Rising coarse-cadence samples retain their candidate.

The recorded formerly rejected bursts now confirm within 33.3–78 ms of their own observed onset instead of waiting for another gesture. Large decays, plateaus, isolated spikes, pending replacement and coarse sample cadence have explicit controls. All **215 unit/contract tests**, **65 gesture browser checks** (29 Chromium, 30 Firefox, 6 installed Chrome) and **43 Settings checks** pass after the review repair; both browser processes exited0 and `git diff --check` passed. Reports: `verified-strong-final/report.json`, `verified-settings-strong-final/report.json`; installed diagnostic smoke: `capture-MBarYn/`. `strong-onset-analysis.json` contains before/after counts and numeric measurements. Final physical acceptance of this follow-up remains required; these replay timings are not a promise for every device or exact finger-onset latency.

This stage is **not accepted** until the user repeats the physical test. The corrected build is for isolated QA first; the user's installed Chrome and Firefox, release ZIPs and version numbers have not been changed by this follow-up. Evidence: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/intermittent-folder-swipes-20261002/`, original physical capture `capture-4sVFcD/trace-001.json`.

## Implemented follow-up: fast, continuous folder switching (2026-10-02)

The user clarified that “smooth” means fast and responsive, not a horizontal slide animation. The rendering fix is implemented in the shared Chrome/Firefox source. Subjective acceptance on the user's physical trackpad is still pending.

Confirmed cause: selecting a folder called the full page renderer, replacing every visible card, favicon and folder chip, plus hidden form options and manager rows. Finishing the delayed selection save rebuilt the cards again. The before-fix regression retained **0 of 40** cards on each transition, and loaded icons reverted synchronously to fallback. Browser image caching avoided extra network requests in this fixture; this does not prove repeated network downloads.

`newtab.js` now keeps keyed card nodes and decoded icons in memory for the current tab, reuses unchanged folder buttons, and updates only the folders/grid on navigation. Reconciliation leaves unchanged visible nodes attached during background saves. Cache entries are disposed when links change/disappear or Firefox favicon sources change; disposed images cannot retry stale sources. There are no new storage fields, image persistence, permissions, timers, gesture thresholds, animations or CSS changes.

The same regression now retains **40 of 40** cards, the folder controls and ready icon state through All → Work → Personal → Work, and retains the grid through the delayed save in both engines. Revisited folders keep loaded icons while offline. Edit/delete/replacement with a reused ID and Firefox permission changes also pass, including detached cards and stale image events.

Verification on 2026-10-02:

- **195** unit/contract tests passed.
- **53** gesture browser checks passed: 24 Chromium, 25 Firefox, 4 installed-extension checks with real Chrome storage and full browser close/reopen.
- **43** Settings regression checks passed, covering RU/EN, narrow layouts, drafts, import/export, add/edit/delete/reorder, emoji and Firefox permission outcomes.
- Before/after reports, screenshots and the pre-change source are in `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/fast-folder-switching-20261002/`.

The automated browser checks use isolated profiles and synthetic sites. Firefox runs the production code over localhost with storage/permission doubles; this is not a signed-addon or native-consent test. Physical gesture feel and OS navigation still need manual acceptance. The implementation does not promise that a never-visited site's remote favicon is available before its first load. Store ZIPs, default background, version numbers and the user's Firefox installation are unchanged. The historical sections below retain the results and limits of earlier work.

## Follow-up: sync write limit (2026-09-25)

The Chrome test build exposed a second problem: a folder swipe committed the entire chunked sync snapshot. With 40 sites, a measured selection change used about five `chrome.storage.sync` write operations. Chrome permits 120 write operations per minute, so a burst of navigation can reject a save and show the generic sync warning. The screenshot did not expose the underlying API error, so the exact failure in the personal profile cannot be proved retrospectively; the quota path was reproduced with a write-budget test.

Folder navigation is now immediate in the UI. Swipe selections are coalesced into one save after 1.1 seconds of quiet; folder-button selections save immediately in the background. A failed write leaves navigation usable and retries after one minute, or earlier after another selection. Opening a site flushes a pending selection first, with a 500 ms ceiling so storage cannot indefinitely delay navigation. Other mutations fold in a pending selection while preserving the existing latest-state lock. The sync schema, chunk format, permissions and store archives were not changed.

Verification: 183 unit/contract tests passed; 21 browser checks passed in Chromium and 21 in Firefox, plus four checks against real `chrome.storage.sync` in an isolated Chromium profile. The Chrome test build in the user's existing unpacked path was updated without changing its extension ID or storage; the original 1.6 folder and published ZIP remain untouched. A real-trackpad retest of this follow-up on the user's profile is still pending. The sections below describe the original 2026-09-22 implementation and should be read as historical where they differ from this follow-up.

Date: 2026-09-22. Implemented in shared Chrome/Firefox sources; not released or installed in personal profiles. The first physical test found a repeat-swipe bug; the fix is now in both isolated test packages. The user confirmed that repeated physical swipes work without taps in both Chrome and Firefox after reloading the updated test pages.

Manual-check setup after user approval: opened Chrome for Testing with a separate profile, the actual unpacked extension and 60 synthetic sites/16 visible folders. Also temporarily installed the Firefox package in a separate Firefox 155.0.1 profile. Personal profiles and published archives remain untouched. Firefox denied automated navigation to `about:newtab`; the user opened the tab with Command+T and confirmed Minimal Tab appeared. The extension URL was verified through WebDriver. Firefox then denied script execution in the privileged extension context; no bypass was enabled, and synthetic-data import was left as a manual step. Setup and synthetic import data are in `../manual-tests/folder-swipes-2026-09-22/` relative to the repository root.

## Physical-test finding and correction

The user reproduced a missed second swipe in both browsers; clicking or waiting 2–3 seconds allowed another transition. A bounded local Chrome trackpad capture showed new impulses interrupting ongoing momentum after gaps of approximately 29–58 ms. The old recognizer waited for 250 ms of complete quiet, swallowing these new gestures. Storage-pending input also used the same sticky block as dialogs and header-origin movement.

The recognizer now accepts a brief interruption followed by a small restarted impulse and sustained acceleration, while retaining the quiet-gap boundary. A candidate needs at least three samples, 64 px accumulated horizontal intent, acceleration and a short sample cadence. Slow coasting and delayed coalesced spikes alone do not rearm navigation. Save-pending suppression is separate from hard guards and remains latched for a candidate that began during saving; it does not poison later gestures. These are conservative wheel-event heuristics, not a browser-provided finger-phase API.

`tests/fixtures/trackpad-recontact.mjs` contains only sanitized relative timestamps and numeric deltas for four captured impulses. The regression failed on the old implementation and now passes both in pure tests and replayed through both browser UIs, including delayed storage and real Chrome extension storage. Review findings for weak momentum, scaled deltas, coalesced spikes and pending-candidate reseeding each received regressions before their fixes.

Both test directories and test-only ZIPs were rebuilt with the fix. Firefox's temporary add-on was updated through its existing isolated WebDriver session. After being asked to reload both pages and repeat 4–5 physical swipes without taps or long pauses, the user replied: “Да, в обоих браузерах”. This confirms the reported repeated-swipe bug is resolved on the user's trackpad. It does not constitute separate acceptance of every manual scenario below. No store release was built or installed in a personal profile.

## Behavior and scope

- Horizontal wheel gestures over the sites area, including empty folders, select the adjacent folder in the visible order. All is included; the internal root folder is not.
- A recognized gesture triggers at most one change. Continuous momentum, including reversal, is suppressed. A 250 ms quiet gap or confirmed fresh impulse starts a new gesture; deliberate horizontal movement must accumulate 64 CSS pixels with horizontal-to-vertical intent of at least 1.8:1.
- Vertical/diagonal scrolling, modifiers/zoom, editing, open dialogs and drag-and-drop are not used for folder navigation. Wheel events originating outside content block the remainder of that gesture. The folder row keeps its existing scrolling behavior.
- A successful commit resets content scroll to the top. Read/write errors, including a failed manifest commit after chunk writes, preserve the current visible selection and scroll position.
- Persistence uses the existing latest-state update path. Sites or folder-order changes from another tab are retained; a newer stored selection wins instead of being overwritten by a stale swipe.
- Local first/last boundaries are no-ops without storage writes. A folder newly added beyond a stale tab's local last boundary is discovered on reload or another normal state refresh, not through live cross-tab reconciliation. No new live-conflict-resolution subsystem was added.
- Appearance, blur, header/card geometry, keyboard controls, localization, permissions, storage schema and backup format are unchanged. Emoji and update notifications are not part of this change.

## Changed files

- `folder-gestures.mjs`: small pure recognizer and adjacent-folder helper.
- `newtab.js`: content wheel wiring, existing storage update integration, save guards and top-of-list reset.
- `styles.css`: horizontal overscroll containment only.
- Both build allowlists and their tests: package the shared module.
- `tests/folder-gestures.test.mjs` and `tests/fixtures/trackpad-recontact.mjs`: 32 gesture tests including the physical recontact regression and guards against inertia, delayed events and pending writes.
- `scripts/verify-folder-gestures.mjs`: repeatable browser smoke checks using separate test browsers/profiles.
- `firefox/chrome-baseline.json`: deliberately refreshed only the accepted common `newtab.js`/`styles.css` hashes and added the gesture module. The published Chrome 1.6 archive checksum is unchanged.

## Verification completed

- Full test suite: **177 passed, 0 failed, 0 skipped**.
- Localhost browser smoke: **17 checks in Chromium and 17 in Firefox**. These run the real production application and storage service with storage API test doubles to inject errors and delays. Recorded rapid gestures are replayed with normal and delayed reads; stationary-pointer gestures over cards are also covered.
- Installed Chrome extension: **4 additional checks** using actual `chrome.storage.sync` in an isolated profile: swipes persist the selected folder, the recorded rapid gestures each switch once, reload restores selection, and closing/reopening the browser preserves the full saved state.
- Both release builders and ZIP allowlists passed in temporary directories; no release artifact was overwritten.
- Fresh install with no user folders, empty folders, both boundaries, long inertia, mixed-axis movement, header-origin momentum, native browser wheel dispatch, modal/drag guards, slow writes, read/write failures, partial writes, latest folder order, another tab's site/selection, reload and a new tab are covered.
- Independent read-only review: confirmed the final pending-candidate fix and 32 passing gesture tests; no remaining confirmed blocker was reported within that review's scope.
- Physical repeat-swipe retest: user-confirmed in both isolated Chrome and Firefox windows, without taps or long pauses, after reloading the fixed packages.
- Screenshots inspected in both engines; new navigation does not change the layout. External favicon requests were blocked in test browsers to keep fixtures deterministic.

Latest machine-readable report (temporary QA output):

`/var/folders/9z/bxm8yx1d5dx0f3ltdq0w7bph0000gn/T/minimal-tab-folder-gestures-04FlGW/report.json`

Run from the repository:

```sh
node --test --test-reporter=spec tests/*.test.mjs
PLAYWRIGHT_MODULE=/Users/nurfinn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright GESTURE_REAL_CHROME=1 node scripts/verify-folder-gestures.mjs
git diff --check
```

`PLAYWRIGHT_MODULE` can instead point to another installed Playwright package, or be omitted if Playwright resolves normally. Browser binaries must be installed. Omitting `GESTURE_REAL_CHROME=1` runs only the 34 localhost checks. The runner creates temporary test packages/profiles; they retain manifest version 1.6 and are not store submissions.

Published archives remain unchanged:

- Chrome 1.6 SHA-256: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`.
- Firefox 1.6 SHA-256: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.

## Physical acceptance and remaining checks

Before release, use a real macOS trackpad in Chrome and Firefox:

1. **Confirmed by the user in both browsers:** 4–5 distinct swipes over cards in both directions, without clicks or long pauses. Separately check an empty folder, weak/strong impulses and a long continuous gesture that should change at most one folder.
2. Scroll vertically and diagonally through many sites. Check zoom, both system scroll-direction settings and that the browser's back/forward gesture does not navigate away from the new tab.
3. Scroll the folder row itself, then move the pointer into content while momentum continues. It must not select another folder.
4. Check first/last folders, editing/renaming, drag-and-drop, and keyboard controls with the actual pointer/keyboard focus.
5. Check the installed Firefox package, reload and a browser restart. Firefox has been tested in its actual engine over localhost, not as a signed installed add-on.

Automation cannot reproduce physical finger phases or the OS navigation gesture. The isolated Chrome profile has no Google account; this verifies local persistence through the real sync API, not cross-device delivery. User-profile installation, version assignment, commit/push and store publication require a separate request.
