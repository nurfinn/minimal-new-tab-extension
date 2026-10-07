# Visual verification — 3 October 2026

The wallpaper candidate was rejected and deferred again by the user. The bundled image, product code, version numbers, personal installations and store ZIPs are unchanged. This step only checks the accepted UI and investigates the earlier Firefox screenshot observation.

## Shared UI

`scripts/verify-settings-ui.mjs` completed **40 checks, zero failures**, against fresh Chrome/Firefox builds. It covers English and Russian at 1280×800, 1024×600 and 390×700, modeled 125% layout, bounded Settings scrolling with reachable header/footer, compact reference-aligned overlay controls, long URL/pencil layout, folder controls, drafts, image validation, import/export and emoji CRUD/reload. Browser APIs are doubled in this suite; actual product modules and build contents are unchanged. No page errors were recorded.

Screenshots were inspected for desktop Settings in Chrome EN and Firefox RU, narrow Firefox Settings and the Russian long-URL form. Small windows intentionally scroll only the Settings body; header and Save remain accessible. This is not a new design direction or a claim to have tested every OS/font configuration.

Evidence:

`/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/visual-acceptance-20261003/`

## Native Firefox card-paint observation

A new isolated Firefox **156.0.1** profile was created with the unchanged temporary add-on. The new tab opened using normal WebDriver keyboard actions (Command+T), without privileged navigation, script execution or security-preference changes. Only synthetic data was imported.

Controlled sequence:

1. Import the same 49-site / five-folder backup through the actual UI, then close Settings. The selected folder contains 13 cards.
2. Capture immediately, after a further 150 ms and after a further 450 ms, before querying card geometry/text. Repeat six imports, three retaining IDs and three replacing IDs so cards must be newly created.
3. Minimize the test window using the standard WebDriver window command; repeat the six imports. All 18 captures have empty card contents while the window is minimized, despite intact rendered-text API results and data.
4. Restore the window with the standard window-rect command. Text, letters and emoji appear without reload, code changes or reimport. Repeat six imports in the visible window: **all 13 titles are painted in all 18 captured frames**. The emoji is also visible in the reviewed immediate frames.

The screenshot pixel analyzer accounts for the native Retina capture ratio (2 physical pixels per CSS pixel). Its first uncalibrated results were invalid and were corrected before interpreting the evidence. Screenshot commands take time; these frames are not continuous video or measurements of first-frame/input-to-paint latency.

Artifacts:

- `native-card-paint.mjs`: standard-element diagnostic harness, no privileged execution.
- `native-card-paint-report.json` and `native-paint-*.png`: minimized-window sequence.
- `native-visible/native-card-paint-report.json` and corresponding images: restored visible-window sequence.
- Native session evidence: `firefox-transfer-20261002-FXGS1F/native-qa/run-Y98Nzs/paint-restored-without-reimport.png` and `paint-native-ru-settings.png`.

This establishes a window-state/capture dependency for the reproduced symptom, not data loss or a demonstrated visible-window UI regression. The exact minimized state of the earlier continuity run was not recorded, so it cannot be retroactively asserted. No evidence justifies changing card containment, storage or the approved blur. For future native visual acceptance, restore the test window before capturing and check pixels as well as DOM/export contents.

## Unchanged release gaps

Actual cross-device cloud sync, full restart of a persistently installed signed new Firefox build and delivery of signed store updates still need their respective environments. They are not proved by these local checks. No commit/push/publication or new release version was performed.

Protected hashes verified after testing:

- Bundled background: `4cbb0f193204d0e8eeb445c4c6257e271c51b72011a4a70fafa0fa4df0169cd6`.
- Chrome 1.6 ZIP: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`.
- Firefox 1.6 ZIP: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.
