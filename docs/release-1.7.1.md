# Minimal New Tab 1.7.1

A stability and reliability patch for Chrome and Firefox, following 1.7.
This is the user's selected version for the fixes in PR #8. The release does not
add new product features or change the approved design, icon, wallpaper or media.

## Changes

- Bind delayed site saves to the original site and dialog so they cannot overwrite
  a different site or close a newly opened editor.
- Preserve site-folder choices, inline folder rename drafts and keyboard focus
  during background saves.
- Export the latest confirmed collection, including changes saved by another tab.
  Failed or unreadable storage no longer produces a misleading default backup.
- Align backup limits with the file-size bound instead of conflicting item caps.
- Recover safely from owned interrupted writes and reserve room for later edits.
  Explain storage-capacity errors before replacing a valid collection.
- Respect newer folder choices across tabs, including deferred swipe saves.
- Handle core-only 1.6 collections and incomplete legacy storage safely.

## Compatibility

JSON backup format v2 is unchanged; default export `appVersion` is now `1.7.1`.
Existing 1.7 backups remain importable, and older v1 backups are still supported.
Versions 1.6 and earlier cannot import v2. Local backgrounds remain excluded from
JSON and sync storage. The core sync schema remains version 1.

Permissions and browser identities are unchanged. No additional network service,
analytics or host access is introduced. Published 1.7 folders and archives remain unchanged.

## Packages

- Chrome: `minimal-new-tab-chrome-v1.7.1/` and `minimal-new-tab-chrome-v1.7.1.zip`.
- Firefox: `minimal-new-tab-firefox-v1.7.1/` and `minimal-new-tab-firefox-v1.7.1.zip`.

These packages are for testing and store submission; a Firefox submission ZIP is
not a signed installable XPI. A version change does not publish or install either
package. Manual use of the candidate and store delivery remain separate checks.

## Verification

See the [fix verification report](review-fixes-verification-2026-10-22.md) for the
seven original findings, additional review fixes and the full pre-version-bump
427-test / 332-browser-scenario run, including its stated limitations. The 1.7.1
metadata change adds a release-notes contract test and is checked again with the
full unit suite, both builds, package validation and the targeted browser runners.
Its runtime delta from `65e874c` is limited to the two manifests and backup
`appVersion`; all behavior fixes are already in that reviewed checkpoint.

Fresh 1.7.1 checks on 22 October 2026:

- 428/428 unit and contract tests.
- 55/55 targeted browser scenarios: 34 cross-browser review regressions, four
  native unpacked Chromium regressions and 17 Chrome update-lifecycle checks.
- Both packages build; Firefox validation has zero errors, warnings and notices.
- All 45 Chrome and 114 Firefox ZIP entries match their generated folders.
  Both packaged manifests and JSON exporters identify version 1.7.1.
- Published 1.7 checksums remain unchanged. Both packaged manifests differ from
  published 1.7 only in the version field.

Candidate ZIP SHA-256:

| Package | SHA-256 |
| --- | --- |
| Chrome 1.7.1 | `8cbe4d76f418fb7b5b60d4c2bd7dab0f3cdfad4b3a3ddf2ad9474a103d60224b` |
| Firefox 1.7.1 | `4f1a61475cf7c38678d0c6646da1432bafaca888e0fb81560f537edfffe775be` |

## What's new — English

This update improves saving and backup reliability. Site and folder drafts stay
intact during background saves, exports include the latest changes from other
tabs, and folder switching is more consistent across open tabs. We also improved
recovery after interrupted saves and handling of larger collections.

## Что нового — Русский

Повысили надёжность сохранения и резервного копирования. Черновики сайтов и папок
больше не сбрасываются при фоновом сохранении, экспорт учитывает последние
изменения из других вкладок, а переключение папок согласованно работает между
открытыми вкладками. Также улучшили восстановление после прерванного сохранения
и работу с большими коллекциями.
