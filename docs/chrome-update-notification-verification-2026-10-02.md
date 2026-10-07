# Chrome update-ready notification — verification

Worktree: `/Users/nurfinn/.codex/worktrees/minimal-tab-ui-20260930`.
Version remains **1.6**. This is development work, not a store release or personal installation.

**Later authorized step:** after this verification, the user separately approved updating their existing personal Chrome test folder. See [installation record](personal-chrome-update-install-2026-10-02.md). The evidence and “no installation” statements below describe the original implementation stage, before that separate approval.

## Implemented

- Chrome build only: native `runtime.onUpdateAvailable`, session readiness, local 24-hour Later for the current/target version pair.
- Compact English/Russian banner, hidden under dialogs, keyboard controls, bottom spacing for the last card, unchanged header.
- Guard every extension page returned by `getViews()`. Open forms, initialization, rename/drag, background/import reads, saves and unsaved folder selection prevent applying.
- Recheck the full page set, synchronously lock/commit, dispatch `runtime.reload()` once. A failed check rolls back before dispatch; an uncertain dispatched command remains protected and explains how to reopen all Minimal Tab pages.
- No worker, polling, `requestUpdateCheck`, network requests, new permissions, sync metadata, app schema/storage changes or gesture-recognizer changes.
- Firefox's product entry/runtime remain unchanged. Only neutral shared readiness code, shared translations and corresponding isolation hashes changed.

## Verification evidence

Commands use the bundled Node and Playwright runtimes. Each browser runner creates isolated profiles and disposable unpacked packages.

| Check | Result |
| --- | --- |
| `node --test tests/*.test.mjs` | 247/247 after independent-review fixes |
| `node scripts/verify-chrome-updates.mjs --mode=all` | 17/17; zero page errors |
| `SETTINGS_REAL_CHROME=1 node scripts/verify-settings-ui.mjs` | 43/43 |
| `GESTURE_REAL_CHROME=1 node scripts/verify-folder-gestures.mjs` | 76/76 after independent-review fixes |
| `git diff --check` | Pass |

Final update report: [17 checks, including injected registration failure](qa/chrome-update-2026-10-02/updates-report.json) (includes source hashes; original run `minimal-tab-updates-nNqVAo`).
Final settings report: [43 checks](qa/chrome-update-2026-10-02/settings-report.json) (original run `minimal-tab-settings-t1y2JA`).
Final gesture report: [76 checks](qa/chrome-update-2026-10-02/gestures-report.json) (original run `minimal-tab-folder-gestures-RHVSL0`). All three browser runners exited 0 after the review fixes; 136 browser checks total.

Screenshots: [desktop English](qa/chrome-update-2026-10-02/update-en-1280.png), [narrow Russian](qa/chrome-update-2026-10-02/update-ru-480.png), [recovery](qa/chrome-update-2026-10-02/update-recovery.png).

Covered actual extension contexts: two browser windows, three pages; native event registration/getViews; open dialogs and rename draft; import read and image decode after closing a dialog; slow/failed selection save; active pointer drag; unknown page; real runtime reload; local image, sites, folders, emoji and selection restored; RU/EN and 480px/1280px layouts; keyboard Later; cross-tab snooze; double apply; recovery and inherited locks; ordinary HTTP preview without extension APIs.

Unit regressions include numeric/malformed versions, delayed reads, missing APIs, corrupt metadata, expired snooze, storage errors, reordered cross-page writes, disappearing/inaccessible peers, changed view sets, failed commits and no-op/throwing reload.

## Limits

The update event is injected **only into the disposable QA copy**. Native listener registration and native reload are verified separately. This does not prove delivery or installation of a signed Chrome Web Store update, or resolve the old-version store statistics. Production files contain no simulation endpoint or URL flag.

Chromium 151 initially permits command-line unpacked loading but disables such an extension on reload when developer mode is off. The runner enables developer mode in **its own temporary profile**. A minimal reproduction without this feature showed the same behavior. No personal Chrome/Firefox setting was changed.

The ordinary HTTP preview required explicit closure of the test server's idle connections during teardown; this is test infrastructure only.

## Decisions and preserved work

- Existing uncommitted emoji/swipe/settings work is preserved. Feature review compares the start-of-task snapshot against current files, not the accumulated branch diff. No blanket commit/reset or cleanup.
- The narrow peer interface includes an opaque page id and owner-prefixed token to release abandoned pre-dispatch locks. It carries no URLs or form data. Incorrect owner handling would affect lock recovery, so it has focused tests.
- Recovery copy explicitly says to close **all** Minimal Tab pages before opening another. Reopening one while a committed page remains correctly inherits the lock; the cost is an extra manual reopening step, not an automatic unsafe retry.

Store archives were not replaced; SHA-256 remains:

```
Chrome v1.6:  370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794
Firefox v1.6: 34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671
```

## Final review

Independent reviewer: fresh-context `gpt-6-astra`, high reasoning, read-only. No Critical or Minor findings. Two Important findings were accepted and fixed in one RED→GREEN pass:

1. A transient enumeration/inspection failure during registration could leave a new page editable while another page had a committed reload. Registration now remains unresolved/input-locked with an explicit recovery message; the uncertainty propagates to further pages. Unit tests cover both error paths; an actual Chromium injected registration fault also reproduced the unsafe behavior before the fix.
2. A backward clock correction could leave an invalid in-memory snooze deadline winning all subsequent merges. Invalid deadlines are now excluded from display, merging and repair. A fresh Later correctly hides the message and persists a new valid deadline.

The reviewer investigated suspected transient focus loss on rejected apply; it did not reproduce in Chromium. No second review was requested; regression and full-suite verification cover the fix pass.

Final state: implementation and verification complete. Worktree and pre-task backup retained because earlier user changes are still uncommitted. No integration, push, personal installation, version bump or store publication was performed.

Reviewer exclusions are explicit: signed store delivery remains unverified, and inherited UI/emoji/swipe work is outside this feature review. The latter remains protected by the unchanged-source checks and regression runners, not a claim that this review certified the whole dirty branch.
