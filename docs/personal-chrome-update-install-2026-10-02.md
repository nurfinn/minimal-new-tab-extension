# Personal Chrome update-notification test installation — 2 October 2026

User explicitly accepted: “Установить в твой Chrome?” → “ок”. This authorizes the existing personal Chrome test folder only, not Firefox, publication, push, or a version change.

## Installation

- Folder: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/minimal-new-tab-chrome-v1.6`.
- Extension ID: `jeanjglicakhpfedmenbnmljlfklcken`; version **1.6**; permissions unchanged (`storage`, `favicon`).
- Audit/backup directory: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/chrome-update-notification-20261002/personal-chrome-install-6jwW1l`.
- Verified full backup: `chrome-before` inside that audit directory. Tested build: `chrome-after`. The archive there is a test-only build, not a replacement store ZIP.
- Updated five files: `_locales/en/messages.json`, `_locales/ru/messages.json`, `i18n-service.mjs`, `newtab.js`, `newtab.html`.
- Added three files: `chrome-bootstrap.mjs`, `chrome-update-service.mjs`, `chrome-update.css`.

Files were patched in place without uninstalling/reinstalling the extension or changing its path. No extension storage, browser preferences or existing tabs were edited. `manifest.json`, `storage-service.mjs`, `folder-gestures.mjs` and `styles.css` remain byte-identical to the pre-install backup. Every installed file (23 total) matches the tested build; no other installed file changed.

## Fresh verification

- Full suite: **247 passed, 0 failed** (`tests.log` in the audit directory).
- Isolated Chromium smoke on the exact staged build: **4 passed, 0 page errors**, no synthetic update signal (`smoke.json`). Verified new-tab startup with idle guard/no fabricated banner, URL autofocus and dialog safety, usable Settings, and retained default cards after page reload.
- Post-install hashes, expected eight-file difference and backup integrity: passed (`installed-verification.json`, with original and built hashes in `install-plan.json`).
- Store ZIP SHA-256 remains unchanged:
  - Chrome 1.6: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`.
  - Firefox 1.6: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.

A new tab was opened in personal Google Chrome at `chrome-extension://jeanjglicakhpfedmenbnmljlfklcken/newtab.html`. Chrome returned window `1716923166`, tab `1716923581`, title **Minimal Tab**, `loading=false`.

Existing tabs were not refreshed, and no runtime reload was invoked in the personal profile. JavaScript from Apple Events was previously disabled and was not enabled. Consequently the live DOM, loaded module identity, saved-site counts and actual notifier behavior in the personal tab were not inspected automatically. File installation and page opening are verified; personal behavioral acceptance remains manual. The unpacked test build is not evidence of Chrome Web Store update delivery, and no update signal was fabricated in it.

No Firefox install, version bump, commit, push or publication. A targeted rollback can restore only these eight runtime paths from the verified backup if the user requests it; do not reset storage.
