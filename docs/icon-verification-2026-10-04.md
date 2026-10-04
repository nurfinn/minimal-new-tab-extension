# Approved icon integration — 2026-10-04

The user approved the precise soft-grid icon for both Chrome and Firefox. This task integrates that exact artwork into the shared source; it does not install an extension, publish a release, change a version, or replace existing store ZIPs.

## Source changes

- Replaced only `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, and `icons/icon-128.png` with the approved exports.
- Added the two editable SVG masters and artwork documentation under `design/brand/`, outside both runtime build allowlists.
- Added explicit local 16 px and 32 px PNG favicon declarations in the shared `newtab.html`; both browser builds retain these declarations.
- Updated only the changed HTML hash and added four approved PNG hashes in `firefox/chrome-baseline.json`. Other baseline entries and the protected archive hash are unchanged.
- Added six icon-contract tests and extended both packaging tests to compare all four packaged icons with shared source bytes.

The original source PNGs were verified before replacement and preserved in:

`/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/design/minimal-tab-icon-20261004/previous-source-icons/`

## Fresh verification

- Focused icon + Chrome build + Firefox build tests: **11 passed, 0 failed**.
- Full unit/contract suite: **284 passed, 0 failed**.
- Export verifier: **8 straight-section scans passed**. At 16, 32, 128, and 1024 px, the outside frame and both separators have equal widths on straight sections; upper and lower pane heights are equal. Straight scanned edges are pixel-aligned. All PNGs have the expected dimensions and alpha.
- Store PNG: **96 × 96 artwork within 128 × 128**, with fully transparent 16 px margins.
- All four source PNGs compare byte-for-byte with the approved exports; both committed vector sources compare byte-for-byte with the approved master files.
- All **24** Chrome-baseline source hashes match.
- `git diff --check`: passed.

The tests generate isolated temporary build directories and archives and remove them afterward. Both packaging tests confirm byte-identical approved PNGs; this is packaging verification, not a live browser screenshot or store approval.

## Approved PNG hashes

| Size | SHA-256 |
| --- | --- |
| 16 | `6b932bf2468cdddb21aece526555d6997414af52ade6c57d284e18d32caccbef` |
| 32 | `fb753339902d951a9b6c4dd483a7b640f5c9c2cd1f328d91d43f4b9a773174e7` |
| 48 | `d7f9ed41071f87b96723dc7d3c06587bb7a8974ada4b5fb54e4684f070dc5ac3` |
| 128 | `5d45ac6cfa63736e4a4410cfb4f7c7be9d3fdadcbb306bfc4b01dd8b56b4ff08` |

Preview, exporter, and pixel-scan details:

`/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/design/minimal-tab-icon-20261004/`

## Protected state

Both manifest versions remain `1.6`. Installed browser extensions were not touched. Wallpapers, product logic, localization, emoji selection, folder visibility, and swipes were not changed by this task. No commit or push was performed.

- Chrome store archive SHA-256 remains `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`.
- Firefox store archive SHA-256 remains `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.
- Default wallpaper SHA-256 remains `4cbb0f193204d0e8eeb445c4c6257e271c51b72011a4a70fafa0fa4df0169cd6`.

Next browser check, if requested: install the approved icon in the user's test Chrome build and inspect the tab at native size. That step has not been performed here.
