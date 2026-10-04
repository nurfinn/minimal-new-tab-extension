# Data continuity — 2–3 October 2026

## Scope

Verify preservation of the approved development checkpoint (`5c98ba1`) when reading published 1.6 data, restarting a browser, and moving JSON backups Chrome → Firefox → Chrome. Only the verification script and documentation changed; product code, version numbers, personal installations and published ZIPs did not. No commit, push or store publication is part of this check.

The repeatable runner is `scripts/verify-data-continuity.mjs`. It uses disposable Chromium profiles with real extension storage, the actual archived 1.6 services, and the already-authorized isolated Firefox temporary add-on. No account login, personal data fixture, privileged Firefox script execution or weakened signature settings.

## Verified

- Both published 1.6 archives match their protected SHA-256 values before and after the run.
- Both old platform storage services write a synthetic collection of 48 sites / five folders, a non-default order and selection, shortcut preference and custom image. Both current platform services read exactly the same application state without rewriting storage. This first compatibility check uses in-memory storage areas, not native Firefox update installation.
- In a real Chromium extension profile, published 1.6 creates the data and downloads a v1 backup. After closing that browser and replacing only its disposable unpacked extension files with the current build at the same path, the extension ID, raw sync/local data and loaded application state are unchanged. This is code-replacement compatibility, not a signed store update.
- Importing the actual v1 download in the current Chromium build succeeds and preserves local settings.
- Adding `github.com` through the UI produces `https://github.com/`; selecting 🗺️, editing the name and reordering the card survive reload.
- Closing the entire Chromium process and reopening the same isolated profile retains all 49 sites, folder order/selection, emoji, custom-image bytes and shortcut preference. Raw storage is equal before and after restart.
- The Chrome UI downloads a v2 JSON backup, which is imported through the native Firefox UI. Firefox's downloaded v2 JSON is then imported back through the Chrome UI. All portable fields compare exactly, including ordered arrays, selected folder, IDs, names, URLs and emoji. The resulting Chrome state also survives another full browser close/reopen.
- All 92 files in the Firefox archive installed by the preceding native QA match the current Firefox build. Its existing image, shortcut setting and favicon permission are unchanged by import. The rendered emoji is checked after closing Settings, not just in exported JSON.
- Broken JSON is rejected with a visible error and no write to Chromium sync/local storage.
- Copying only sync data to a second clean Chromium profile restores the collection with the bundled background fallback. Loading does not change sync. Editing a site there preserves the custom-image identifier; combining its new sync snapshot with the original device's local image still restores the original image. This models missing-local-file handling, not cloud synchronization.
- No favicon/base64 image data is found in the backup or sync snapshot. The image remains in local storage.

Full unit/contract suite: **247 passed, zero failed**. Continuity runner: **13 passed, zero failed**, with real Firefox session enabled. No application page errors were recorded in Chromium.

## Evidence and reproduction

Final run directory:

`/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/data-continuity-20261002-6rtBBK`

It contains `report.json`, actual v1/v2 downloads, separate old/current builds, disposable profiles and screenshots. All data is synthetic. Native Firefox downloaded files are recognized by a new filename and matching synthetic contents, then moved from Downloads into this QA directory; pre-existing downloads are neither read nor modified. The pre-import synthetic Firefox collection is also backed up there. The test Firefox remains open with the 49-site transferred collection; disposable Chromium processes are closed.

Run with the bundled Node runtime and Playwright (or equivalent local installations):

```sh
PLAYWRIGHT_MODULE=/path/to/playwright \
DATA_QA_RELEASE_ROOT=/path/to/outputs \
DATA_QA_OUTPUT=/path/to/new-empty-qa-directory \
DATA_QA_FIREFOX_SESSION=/path/to/isolated/native-qa/latest-run.json \
node scripts/verify-data-continuity.mjs
```

The runner refuses to reuse an owned run directory. Omit `DATA_QA_FIREFOX_SESSION` to run without native Firefox: the round trip is then explicitly untested, not counted as a pass. The optional native session must come from the owned `manual-tests/firefox-transfer-…/native-qa/run-…` harness and match its current archive. `DATA_QA_FIREFOX_DOWNLOADS` overrides the default Downloads location if that test profile uses a different download directory.

Early Firefox screenshots captured some empty card outlines immediately after import and closing the covering dialog, although JSON and DOM contents were intact. Later captures showed the correct text and emoji without any runtime change or new import. The runner now waits for WebDriver's rendered card text before the screenshot; the first frame can still lag behind that API. A subsequent ordinary Settings open/close produced correct immediate, 500 ms and 2 s frames. The settled frame is saved as `native-firefox-roundtrip-settled.png`. The exact renderer/capture timing cause is not established: this is not data loss, nor a claim to have fixed or fully audited Firefox rendering. Retain it as a visual observation for final release acceptance.

Follow-up on 3 October: a controlled native Firefox run reproduced empty-card screenshots when the test window was minimized. Restoring that same window restores contents without reloading or reimporting. Six repeated imports in the visible window show all 13 selected-folder titles in all 18 frames. No product fix was made; the earlier run's exact window state remains unknown. See [visual verification](visual-acceptance-2026-10-03.md) for the paired evidence and capture limitations.

## Still outside this evidence

- Actual Google/Firefox account sync between separate devices: no second signed-in device was available or accessed. Copying snapshots is not proof of cloud delivery.
- Full browser restart with the new Firefox add-on installed persistently: the current unsigned temporary add-on disappears as an installed add-on on browser restart. Reinstalling it would not prove the normal signed lifecycle.
- Delivery and application of signed CWS/AMO updates. Existing old-version distribution statistics remain a separate unresolved investigation.
- Backward import into published 1.6: new backups are v2 and published 1.6 does not support them. Current builds import v1 and v2. Old clients may discard the optional emoji field when rewriting shared data; this known compatibility limit remains documented in README.

These gaps remain release-acceptance items; successful unit tests do not close them.

## Protected store archives

- Chrome 1.6: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`
- Firefox 1.6: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`
