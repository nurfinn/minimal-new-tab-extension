# Latest Firefox candidate — native acceptance, 3 October 2026

## Outcome and scope

The accepted full emoji catalog/support filter, optional All visibility and existing rapid swipes passed the listed checks in the installed Firefox **156.0.1**, using a new disposable profile and the exact temporary test ZIP. The user confirmed opening Minimal Tab with Command+T and subsequently confirmed rapid physical swipes and Command+R.

This step changed no product runtime code. No personal Firefox installation/profile, personal Chrome runtime, store archive, version, commit, push or publication was changed. The previous Chrome test installation was manually accepted by the user with “да работает”; that is not a separate personal-browser restart certification.

## Exact artifact and isolation

QA root: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/firefox-final-acceptance-20261003-2OnXeN`.

- `firefox/`: 112-file generated Firefox build, manifest version **1.6**, existing ID `minimal-new-tab@nurfinn.com`.
- `firefox-test-only.zip`: SHA-256 `ca3fca8b7749fcbc2c587f01e3fb416608d924dd457f28703527c3e5a34b1078`.
- `native-report.json`: 11 automated native scenarios plus 1 user-reported physical acceptance, 12 passed, 0 failed.
- `artifacts-report.json`: exact ZIP/file hashes, independent fresh rebuild and protected-artifact checks.
- `session.json`, `launch.mjs`, `client.mjs`, `check-before-reload.mjs`, `check-palette-and-visibility.mjs`, `check-after-reload.mjs`: reproducible session boundaries and element-level assertions.
- `native-*.png`: native Firefox screenshots of the catalog, folder controls, missing-glyph fallback, settings and restored emoji.

The cached geckodriver 0.37.1 launched `/Applications/Firefox.app/Contents/MacOS/firefox` with its profile exclusively under this QA directory. Installation was temporary through the supported add-on endpoint. No signature bypass, privileged-system-access flag, personal profile, script execution, automatic privileged-page navigation or refresh workaround was used. Interactions used standard WebDriver element operations with fresh element lookups. User-performed Command+T/Command+R were not simulated by reinstalling the add-on.

## Native evidence

1. Initial real extension storage starts remote site icons OFF; Settings Cancel retains a saved shortcut preference.
2. Uploading an image and saving disabled shortcuts works through the normal UI. Restored image bytes, extracted from the rendered preview's standard element attribute, match the uploaded file's SHA-256, rather than merely retaining a “Custom image” label.
3. Normal JSON import loads a synthetic **42-site** fixture: five user folders with eight sites each, plus two unfiled sites. It contains no personal browser data. Existing 🚀 and 🗺️ values remain; the deliberately unsupported U+1FAEB glyph uses a letter fallback, not a square.
4. The full catalog has ten category controls; All remains directly available. Localized Russian rocket search works. Selecting the grouped 👍 variants and saving **👍🏽** updates the site card and URL-field preview.
5. Unchecking Show “All” removes only that navigation item. “Без папки” remains accessible with two sites. Re-enabling All restores all 42 cards and preserves the emoji. All was then hidden again for physical gesture acceptance.
6. The user performed 6–8 fast separate horizontal swipes in both directions without taps, with boundary stopping, then reloaded. Their answer was **“Да, всё работает; перезагрузил”**. This is subjective physical acceptance, not an instrumented input-to-paint measurement.
7. After that manual reload, only one visible folder is selected; All remains absent and its management checkbox remains unchecked/enabled. Counting the five folders and unfiled view independently still gives **42 sites**. 🗺️ and the unavailable-glyph fallback remain correct.
8. Saved **👍🏽** survives reload in the card, URL preview and reopened full picker. Cancel leaves it unchanged. Exact custom-background bytes, disabled shortcuts and remote-icons OFF also survive reload. The test window is left open with the user's post-reload folder selection restored.

## Fresh automated and artifact gates

- `node --test tests/*.test.mjs`: **278 passed, 0 failed**, rerun after native acceptance.
- All **112** native-candidate files match an independent fresh Firefox build and every ZIP entry byte-for-byte. `unzip -t` reports no errors. Chrome's update notifier is absent from the Firefox artifact.
- All **43** previously installed personal Chrome runtime files still match the installation's staged inventory; this step did not update them.
- Protected store ZIPs retain their known hashes:
  - Chrome 1.6: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`.
  - Firefox 1.6: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.

Two verification-harness assumptions were corrected without changing product code. Opening a saved 🚀 intentionally starts its Travel category, not All; the checker was corrected to choose All explicitly before asserting that state. The first ZIP-byte comparison exceeded Node's default 1 MiB child-output buffer on the 1,491,159-byte catalog; a 4 MiB checker buffer allowed all 112 comparisons to complete. Neither stop was a runtime extension failure.

## Limits

This is a temporary add-on, not a signed AMO release. **Page reload persistence is confirmed; full browser restart installation/persistence and cross-device sync are not.** Temporary installation disappears after closing/restarting this Firefox session.

The current native catalog check uses Russian; English and narrow/reduced-motion layouts are covered by the previously recorded isolated-engine checks, not newly certified by this native pass. The current pass checks remote icons OFF; real grant/deny/revoke was checked in the earlier native Firefox transfer and was not requested again here.

Native Settings and picker screenshots were inspected. The Folders dialog retains its existing translucent material, through which background cards can remain recognizable; this was not dismissed as a headless-only artifact and was not redesigned in this bounded feature acceptance. No complete modal pixel-perfect visual certification or 100% release-readiness claim is made.

Wallpaper work remains deferred by the user. Store media, a new release version, signed-package gates and publication require their own release decision.
