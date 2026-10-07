# Personal Chrome icon installation — 2026-10-04

User authorization: after approving the icon and being offered a check in the personal Chrome test build, the user answered “ок”. Scope: approved icon PNGs and their favicon declarations in the existing unpacked test folder. No Firefox installation, version bump, store publication, commit, or push.

## Installed artifact and recovery

- Existing installed path: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/minimal-new-tab-chrome-v1.6`.
- Extension ID remains `jeanjglicakhpfedmenbnmljlfklcken`.
- Read-only inspection of the last-used Chrome Default profile's Secure Preferences confirmed the exact unpacked path and location 4. The installer did not modify Preferences, Secure Preferences, browser permission settings, or extension storage.
- Before copying, all **43** installed file hashes matched the last approved runtime inventory from the 2026-10-03 folder-visibility installation.
- Recovery copy, staging directory, installer, and exact before/after inventories:

`/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/chrome-icon-install-20261004-8h9Uwy/`

The full `chrome-before/` copy was verified against the pre-install runtime. `chrome-staged/` contains the exact five-file change. `install-plan.json` lists every hash; `installed-verification.json` records successful installation verification.

Only five runtime files changed:

1. `icons/icon-16.png`
2. `icons/icon-32.png`
3. `icons/icon-48.png`
4. `icons/icon-128.png`
5. `newtab.html`: only two local favicon links were inserted in the document head.

No runtime files were added or removed. All other installed bytes, including the manifest, application code, locale files, emoji catalog, styles, and wallpaper, remain unchanged. The manifest remains version **1.6** with the same permissions. The approved PNG files are byte-identical to the verified design exports.

## Native browser evidence

Chrome was already running. A new owned tab was opened in window `1716923862`, tab `1716924219`. Existing tabs were not reloaded, navigated, or closed. The new tab first loaded the explicit extension URL, then the same owned tab was navigated to the ordinary `chrome://newtab/` entry point.

AppleScript returned:

- Title: **Minimal Tab**
- URL: **chrome://newtab/**
- Loading: **false**

Native macOS screenshots of that Chrome window were captured and visually inspected:

- `chrome-native-after.png`: new directly opened extension page; approved favicon visible. The existing left tab retains the old favicon.
- `chrome-native-newtab.png`: normal new-tab entry point; approved favicon visible.
- `native-tabs-detail.png`: crop of the actual native screenshot, reduced from Retina pixels to 1× UI size. It shows the old tab on the left and new tab on the right. No icon artwork was inserted into the screenshot.

The page visibly retained saved folder names/counts, hidden All, the active AI folder, saved site cards, and the existing chosen emoji. JavaScript from Apple Events was not enabled, so this does not independently certify every saved site or compare the full live storage snapshot. No restart or extension-manager icon-cache test was performed. The previous open tab intentionally retains previously loaded resources; this is not a failed installation.

## Fresh final verification

After opening the normal new tab, a fresh read confirmed all **43** installed hashes match the staged inventory, all **43** backup hashes remain intact, and both protected store ZIPs remain unchanged:

- Chrome 1.6: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`.
- Firefox 1.6: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.

The new personal Chrome tab is left open for user review. This completes the requested native favicon check. Firefox source integration remains approved and verified separately, but no personal Firefox installation was performed here.
