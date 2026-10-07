# Personal Chrome test installation — 3 October 2026

User authorization: “Установить тестовую сборку, сохранив твои сайты и настройки?” → “да”. Scope: the existing personal Chrome unpacked folder only. No Firefox installation, store publication, version bump, commit or push.

## Installed artifact and recovery copy

- Existing folder: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/minimal-new-tab-chrome-v1.6`.
- Extension ID: `jeanjglicakhpfedmenbnmljlfklcken`. Read-only inspection of the last-used Default profile's Secure Preferences confirmed this exact unpacked path before copying.
- Manifest remains byte-identical: version **1.6**, permissions unchanged, no uninstall/reinstall.
- Audit directory: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/chrome-folder-visibility-install-20261003-n22iga/`.
- Full pre-install folder backup: `chrome-before`; its inventory was checked against the original before installation and again afterward.
- Exact generated/tested build: `chrome-staged`; test-only archive: `chrome-test-only.zip`. Neither is a replacement for a store artifact.
- `install-plan.json` records original/staged SHA-256 inventories and exact added/changed paths. `installed-verification.json` confirms the installed folder matches all **43** staged files; **29** paths copied (20 added, 9 changed). No unexpected installed files were removed.

Changed existing files: `_locales/en/messages.json`, `_locales/ru/messages.json`, `folder-gestures.mjs`, `i18n-service.mjs`, `newtab-core.mjs`, `newtab.html`, `newtab.js`, `storage-service.mjs`, `styles.css`. Added: approved full emoji catalog/picker/support modules, catalog/license files and library icons. This is the current accepted test candidate, including the previously approved emoji work and optional All visibility, not a new store release.

The installer copied runtime artifacts only; it contains no browser-profile or extension-storage writes. Existing storage remains attached to the original path/ID. It did not write Preferences, Secure Preferences, Chrome's protection settings or browser local/sync databases. An existing tab was never reloaded or closed.

## Fresh evidence

- Full unit/contract/build suite: **278 passed, 0 failed**.
- Exact staged build tested against a copy of the actual pre-install runtime in a disposable Chromium profile: **4 passed, 0 page errors** (`smoke.json` and `smoke-attempt-2.json`). Same-path upgrade retained synthetic sites, folders/order/selection, saved emoji, a custom local image and shortcuts. The full picker loaded offline; cancellation preserved data. Hidden All, root-site access and restoration survived reload and a full browser restart.
- The first smoke attempt passed data continuity but timed out while trying to dismiss a search/picker/form stack with two Escape presses. The harness was corrected to use the actual Cancel action, with a new isolated profile; no product code was changed and no personal copy occurred until all checks passed. The failed report is retained in `smoke-attempt-1.json`.
- After installation, a separate fresh read verified all 43 installed hashes against the staged inventory and both protected store archive hashes.

Protected store ZIPs remain unchanged:

- Chrome 1.6: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`.
- Firefox 1.6: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.

## Personal-browser boundary

A new personal Chrome tab was opened, without touching previous tabs. AppleScript returned window `1716923166`, tab `1716923784`, title **Minimal Tab**, URL `chrome-extension://jeanjglicakhpfedmenbnmljlfklcken/newtab.html`, `loading=false`.

JavaScript from Apple Events remains disabled and was not enabled. Consequently automatic verification does not claim the personal tab's live module identity, exact saved-site count, new checkbox presence or physical swipe behaviour. File installation and successful page opening are verified; final acceptance uses the newly opened tab manually. Older open tabs can still run their previously loaded code and should be closed when convenient, without discarding an unsaved form.

Manual next step: open Folders, uncheck Show “All”, close the dialog and verify visible folders/swipes; reopen a new tab to confirm persistence. Restore the checkbox if desired. Do not reset storage or reinstall to test this feature. The verified pre-install runtime backup is available for an explicitly requested rollback.

Subsequent personal acceptance: the user answered **“да работает”**. This closes the requested manual feature check; it does not independently certify a full restart or cross-device sync. A later native Firefox acceptance used a new disposable profile and confirmed that all 43 personal Chrome files remain byte-identical to this staged installation; see `firefox-final-acceptance-2026-10-03.md`.
