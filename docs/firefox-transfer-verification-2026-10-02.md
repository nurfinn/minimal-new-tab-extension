# Firefox transfer — isolated verification, 2 October 2026

## Outcome

Built and verified the already-approved shared UI, emoji and rapid-folder-swipe changes in a separate Firefox test artifact. No product code was changed in this step. The existing Firefox overlay supplies its own favicon catalog and consent controls. Chrome's update notification remains excluded.

This is a test build, not a signed AMO release or a personal-browser installation. The manifest remains version `1.6`, with the existing extension ID, `storage` permission and optional `browsingActivity` consent. No version bump, commit, push or publication was performed.

## Artifact

Root: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/firefox-transfer-20261002-FXGS1F`

- `firefox/`: unpacked test build, 92 files.
- `minimal-tab-firefox-test-only.zip`: SHA-256 `363b5d4709e02d3781627f1cfae7edf5df1d2d3c056bb573eb06256f921ce787`.
- `settings-report.json`, `gestures-report.json`: fresh browser test results.
- `screenshots/`: English/Russian desktop settings, narrow Russian settings and permission-pending state.

All 92 files match both independently generated builds used by the Settings and gesture runners byte-for-byte. ZIP integrity validation passed.

## Fresh verification

Executed with the bundled Node runtime and Playwright in isolated browsers:

- `node --test tests/*.test.mjs`: 247 passed, 0 failed.
- `scripts/verify-settings-ui.mjs`: 40 passed (21 Firefox, 19 Chromium), no page errors.
- `scripts/verify-folder-gestures.mjs`: 69 passed (35 Firefox, 34 Chromium).
- `unzip -t` on the test artifact: no errors.

Coverage includes add/edit/delete, emoji, reorder/reload, import/export, settings Save/Cancel, local-image fallback, failed persistence, permission pending/deny/grant/revoke/error, RU/EN layouts and replay of recorded rapid gestures. Cached cards and loaded icons survive folder switching without additional icon requests.

The 40/69 counts intentionally exclude optional native-Chrome extension checks from previous runs (43/76); this run did not enable those flags.

## Firefox update behavior

Read the current Mozilla documentation before deciding whether Chrome's notifier should transfer. Registering `runtime.onUpdateAvailable` in Firefox defers the normal application of an available update until an extension reload or browser restart. The approved roadmap already calls for evaluating this separately, rather than blindly copying Chrome behavior.

The test package therefore preserves existing Firefox behavior: no update listener, polling, background component or `runtime.reload()` call. The neutral shared `updateSafety` export is present but does not install a notifier. A Firefox notification feature would need a separate decision and native update-lifecycle verification.

Source: [Mozilla runtime.onUpdateAvailable](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onUpdateAvailable), checked 2 October 2026.

## Limits and next step

The browser runners use the actual Firefox engine over localhost, with storage/permission API doubles. This does not verify a signed installed extension, the real Firefox consent prompt, native sync, restart persistence or delivery of an AMO update. Replayed events do not replace physical-trackpad acceptance. Mozilla web-ext lint was not rerun in this step.

The initial runner limitations above were subsequently narrowed by the native smoke below. Personal Firefox is not replaced. Full browser-restart persistence, cross-device sync, signed AMO delivery and complete store readiness are still not claimed.

## Native smoke verified — temporary add-on

Launched the installed Firefox 156.0.1 via cached Mozilla geckodriver 0.37.1 in a newly generated profile under the test artifact's `native-qa/run-uGOz74/profiles/`. Installed the exact hash-checked ZIP temporarily with its existing ID. User confirmed that Command+T opens Minimal Tab. No personal profile, privileged-system-access flag, permission emulation or signature setting was used.

Real element-level checks confirmed: initial remote-icons OFF; cancelling a shortcut edit preserves the saved value; adding `github.com` with a chosen 🗺️ emoji; uploading a background and saving the shortcut choice; native permission pending keeps the toggle OFF/disabled and shows “Ожидает разрешения”. The user chose Allow, and the actual switch settled to ON with “Включено”. Reopening settings preserved ON. Switching it off revoked permission and restored OFF. The user then declined a second real request: OFF, enabled control, “Выключено”, no stuck pending state.

Firefox rejects WebDriver script execution and automatic refresh for its privileged new-tab page. These tooling limitations were recorded, not bypassed. Standard WebDriver element operations are allowed and used. The first-pass harness stopped on the rejected refresh; its later assertions did not execute. After the user explicitly confirmed Command+R, `native-qa/check-after-manual-reload.mjs` passed: the Emoji QA card still has 🗺️, uploaded-image selection and saved shortcut choice remain, and denied consent stays OFF. This is real installed-extension persistence through a page reload, not a claim about a full browser restart or cross-device sync.

Session coordinates and evidence are under the artifact's `native-qa/`; `latest-run.json` identifies only this owned disposable session. A synthetic 40-site, five-folder fixture was imported through the normal file/confirmation UI. Selecting Work showed eight cards. The fixture does not copy any personal data. The import harness initially tried to close Settings with the footer Cancel button, which is hidden on the backup tab; using the visible header Close button completed the step without any application change.

After manual reload and the import, the rendered custom-background bytes were extracted through the standard WebDriver element attribute API and their SHA-256 matched the uploaded file. No image bytes were logged in the report. This confirms actual image restoration, not only a retained “Custom image” label.

The user completed 6–8 fast separate horizontal trackpad swipes in both directions over cards without intermediate taps and answered “Да, всё работает нормально” to the skipped/delayed/extra-transition check. This is user-reported physical acceptance, not an instrumented latency measurement. The owned test window remains open for further use. The add-on is temporary and does not persist as an installed add-on after browser restart. Native smoke is complete for the listed scenarios; no release/publication or personal-browser install is implied.

## Protected artifacts (hashes)

The existing store archives were read and their known SHA-256 values still match:

- Chrome 1.6: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`.
- Firefox 1.6: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.

Six relevant personal-Chrome files were also checked against the previous installation hashes: bootstrap, update service, HTML, application script, storage service and gesture module. All match. No personal profile or installed-extension file was written.
