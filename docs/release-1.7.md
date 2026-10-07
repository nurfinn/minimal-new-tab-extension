# Minimal New Tab 1.7

Prepared for Chrome and Firefox on 5 October 2026, **not yet published**.
This release takes the accepted product checkpoint `56b45c7` and changes only
runtime release metadata: both manifest versions and default JSON `appVersion` are `1.7`.
The sync schema and JSON backup format remain unchanged by this preparation.

## Included improvements

- Built-in offline emoji picker with categories, English/Russian search, variants,
  supported-glyph filtering and a return to the site's automatic icon.
- Fast folder swipes, reused cards/icons and coalesced selection saves.
- Optional All visibility in the folder manager; unfiled sites remain accessible.
- Compact General settings, aligned controls and clear Firefox permission states.
- Approved softer grid icon, including 16/32 px local tab favicons.
- Chrome-only notice for an update already downloaded by the browser. Firefox
  retains its own update handling.
- Protection for emoji/All against ordinary published 1.6 writes, safer local
  background replacement after failed/interrupted saves, and pointer pass-through
  for non-interactive status messages. These are bounded local protections, not
  distributed atomicity or a guarantee for all concurrent remote writers.

## Compatibility and privacy

Backup v2 preserves emoji; 1.6 and earlier cannot import v2. Update the receiving
browser before importing. Old backup v1 still imports.
Custom background images stay local and are not included in JSON.
The existing default wallpaper stays.

Permissions and identities are unchanged: Chrome `storage`/`favicon`; Firefox
`storage`, Gecko ID `minimal-new-tab@nurfinn.com` and the existing optional
`browsingActivity` consent for remote icons. No new hosts, analytics or backend.

## Upload artifacts

- `minimal-new-tab-chrome-v1.7/` and `minimal-new-tab-chrome-v1.7.zip`.
- `minimal-new-tab-firefox-v1.7/` and `minimal-new-tab-firefox-v1.7.zip`.

Use the ZIP matching the store; neither archive contains source docs, tests, QA
profiles or promotional media. Published 1.6 archives and personal installations
remain separate. A Firefox ZIP for submission is not a signed installable XPI.

What's New is provided separately for [Chrome EN](whats-new-1.7-chrome-en.txt),
[Chrome RU](whats-new-1.7-chrome-ru.txt), [Firefox EN](whats-new-1.7-firefox-en.txt)
and [Firefox RU](whats-new-1.7-firefox-ru.txt). The existing EN/RU Chrome media is
also the user's selected image set for Firefox; no new wallpaper was approved.

Full Chrome store descriptions with the integrated 1.7 changelog are now available
in [English](store/chrome-description-en.txt) and [Russian](store/chrome-description-ru.txt).
The [publication media index](../design/store/v1.7/README.md) contains the refreshed
five-scene EN/RU screenshots and the two Chrome promotional PNGs. These are listing
materials only and are excluded from both extension archives.

## Verification scope

Fresh checks on the exact 1.7 packages on 5 October 2026:

- 396/396 unit and contract tests; no failures, skips or cancellations.
- 309/309 browser scenarios: settings 95, emoji 61, gestures 76, status 41,
  Chrome update 17, data continuity 19. Disposable Chromium/Firefox engines use
  API doubles where required; native unpacked Chrome coverage is enabled.
- 21/21 independent artifact gates. Chrome has 45 files, Firefox 114; every
  final ZIP entry/byte matches its folder and independently exercised builds.
- Runtime delta against accepted `56b45c7`: only `manifest.json` and
  `backup-service.mjs`. Permissions, IDs, wallpaper/icons, personal installations,
  immutable 1.6 ZIPs and approved EN/RU media remain unchanged.
- Firefox `web-ext` 10.5.0 lint: 0 errors, 0 warnings, 0 notices.
- Actual Chrome JSON download: exporter `appVersion: 1.7`, backup format v2,
  selected emoji present and local wallpaper excluded.

These comparisons prove extracted file identity, not byte-identical Firefox
ZIP containers across rebuilds: its existing builder gives generated overlays
current timestamps. The final Firefox ZIP is pinned by the SHA-256 below;
independently generated QA packages have identical file contents and CRCs.

The update QA runner now derives future synthetic versions from its manifest
and waits for the dynamically imported app before interacting with its ordinary
web preview. These are QA-only corrections, not runtime changes.

ZIP SHA-256:

| Package | SHA-256 |
| --- | --- |
| Chrome 1.7 | `7a210a76c32d760d05a872f07791197d2df1e5c2fa309ea93ee5e6dd620970ce` |
| Firefox 1.7 | `5c3def8bbe96fe4998af72d1cb21bafc594abd63545deee71fd955d551a3e246` |

Local evidence: `outputs/manual-tests/release-1.7-20261005-YeDhfH/` (external
to the source tree, excluded from ZIPs). Prior development records remain
historical, not proof of store publication. Review these
[accepted checkpoint limits](development-checkpoint-2026-10-04.md).

Real account cross-device sync, signed CWS/AMO update delivery, persistent signed
Firefox installation/restart and all operating-system emoji fonts remain
unverified. Existing physical trackpad acceptance is not repeated by scripted
event replays. No store submission, main merge, tag, PR or personal install is
part of this release preparation.
