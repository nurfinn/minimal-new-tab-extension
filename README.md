# Minimal New Tab by nurfinn

A calm, customizable new tab for Chrome and Firefox. Keep favorite sites in folders, choose emoji icons, swipe between folders, change the background, and move your setup between browsers without an account or backend.

[Visit nurfinn.com](https://nurfinn.com/?utm_source=github&utm_medium=referral)

## Browser releases

| Browser | Latest published version | Prepared version | Source |
| --- | ---: | ---: | --- |
| Chrome | 1.6 | 1.7 | Shared files in the repository root |
| Firefox | 1.6 | 1.7 | Shared root files plus the isolated `firefox/` overlay |

Chrome and Firefox live in one repository because most product logic is shared. Browser-specific manifests, favicon providers, permissions, UI additions, and release assets remain isolated. Both store archives are produced from explicit allowlists and validated independently before release.

Release tags and archives should include the platform:

- `chrome-v1.7` → `minimal-new-tab-chrome-v1.7.zip`
- `firefox-v1.7` → `minimal-new-tab-firefox-v1.7.zip`

## Prepared release 1.7

Version 1.7 is prepared in this branch, **not yet published** to either store.
It includes the accepted improvements beyond the published 1.6 packages:

- An optional offline emoji catalog inside the site's address field, with categories, English/Russian search, tone variants, unsupported-glyph filtering and a way back to automatic favicons.
- Fast trackpad navigation between folders, reusing loaded cards and icons and coalescing selection saves.
- More compact General settings, consistent controls and a clearer Firefox icon-permission state.
- A Chrome-only notification for an update the browser has already downloaded, with Later and checks for unfinished work before applying it. Firefox keeps its existing update behavior.
- An optional Show “All” checkbox in the folder manager; unfiled sites remain accessible when All is hidden.
- The approved softer grid icon and explicit local 16/32 px tab favicons in both builds.
- Safer local background replacement: stage and verify the new image before publishing settings, retaining readable copies after a failed or interrupted save.

Both manifests and default exported `appVersion` now use `1.7`. The published 1.6
ZIPs, existing installations and bundled wallpaper have not been replaced.
[Release 1.7 notes and verification limits](docs/release-1.7.md).

What's New: [Chrome EN](docs/whats-new-1.7-chrome-en.txt),
[Chrome RU](docs/whats-new-1.7-chrome-ru.txt),
[Firefox EN](docs/whats-new-1.7-firefox-en.txt),
[Firefox RU](docs/whats-new-1.7-firefox-ru.txt).

Store-ready full descriptions, including What's New 1.7:
[Chrome EN](docs/store/chrome-description-en.txt) and
[Chrome RU](docs/store/chrome-description-ru.txt).
[Updated EN/RU screenshots and promotional banners](design/store/v1.7/README.md)
are stored separately from the browser runtime and release ZIPs.

Backups now export format v2 to preserve emoji. This code still imports v1 files, but the published 1.6 cannot import v2 backups. The Export panel explains this in English and Russian. Custom background images remain local and are excluded from backups.

The working code now protects emoji and All visibility from ordinary writes by the actual published Chrome/Firefox 1.6 serializers using a bounded, independent sync layer. Old edits still apply; explicit favicon/All resets are preserved. This is verified with both immutable packages and disposable native Chromium, not real account cross-device delivery or signed store updates. Protection requires valid protected data to be present; an identical old import cannot express a new reset, and unknown/unsupported data stays read-only. [Verification and limits](docs/mixed-version-feature-protection-verification-2026-10-04.md).

The separately approved background-safety stage now fixes replacement overwriting the previous local image before sync commit. It stages a separate copy, verifies publication and only then promotes/cleans up; interrupted commits remain readable by the current code. Verified with 388 unit/contract, 251 browser and 17 artifact checks plus independent re-review. This bounded local guarantee uses the existing serialized mutation path, not unlocked concurrent writers or distributed atomicity. A subsequent isolated native Firefox check passed 14 UI checkpoints with two human-confirmed page reloads after quota rejection and successful retry; full Firefox restart persistence and signed delivery remain unverified. [Background verification and limits](docs/background-transaction-verification-2026-10-04.md), [native Firefox evidence and UI observation](docs/firefox-background-native-verification-2026-10-04.md). Earlier intermittent emoji UI and 100 ms reload observations remain disclosed in the preceding verification report, not claimed fixed by this change.

Verification records: [Chrome update handling](docs/chrome-update-notification-verification-2026-10-02.md), [Firefox native checks and limitations](docs/firefox-transfer-verification-2026-10-02.md), [release checks and mixed-version limits](docs/release-acceptance-2026-10-04.md).

## What's new in 1.6

- A lighter header with floating folder buttons and more breathing room.
- Sites scroll below the fixed navigation, with comfortable bottom spacing and the familiar frosted-glass cards.
- More reliable saving when several new tabs are open.
- Reorder sites and folders with the keyboard, and turn single-key shortcuts off in Settings.
- Clearer messages for invalid addresses, background uploads, backups, and saving errors.
- More consistent typography and easier-to-use dialogs across Chrome and Firefox.

Both browser editions now use the same version number. Your existing sites,
folders, and settings remain compatible. Permissions have not changed.

## Highlights

- Add, edit, delete, and reorder favorite sites.
- Organize sites into folders and arrange folders in your preferred order.
- Switch folders with trackpad swipes and optionally hide the All view.
- Choose emoji from a built-in offline catalog or keep automatic website icons.
- Use a bundled background or choose a local image and overlay.
- Open Add site with `A`, Create folder with `F`, and Settings with `S` on any keyboard layout.
- Keep a visible letter fallback whenever a site icon is unavailable.
- Automatically use English or Russian based on the browser language.
- Export and import sites and folders when moving between browsers.
- Include site order and chosen emoji in portable JSON backups.
- Keep the page stable and responsive with larger site and folder collections.

## Site icons

Chrome uses its browser-provided favicon capability with a lightweight hostname fallback.

Firefox includes local icons for popular services, so they work without a network request. Unknown sites keep their letter fallback. Users can optionally enable **Load missing site icons** in Settings; it is off by default, and only the saved hostname is used for the request.

## Sync and moving between browsers

Lightweight settings use the browser’s sync storage. Chrome Sync and Firefox Sync are separate systems and do not transfer extension data between browser families. Use Export in one browser and Import in another to move sites, folders, and their order.

Custom background files stay in local browser storage on the current device. They are never placed in sync storage or JSON backups. If a local image is unavailable, the interface safely falls back to the bundled background.

## Privacy

Minimal New Tab has no account system, backend, Google OAuth, analytics, advertising, or browsing-history feature. Saved sites and preferences remain in browser storage controlled by the user.

Firefox’s optional remote-icon setting uses Mozilla’s data-collection consent model. Enabling it does not grant tabs or history API access: only a saved site’s hostname may be sent to retrieve its icon. Full paths, queries, document IDs, titles, and account details are not sent.

## Permissions

### Chrome

- `storage` saves sites, folders, settings, and the local custom background.
- `favicon` displays icons for addresses the user has saved.

### Firefox

- `storage` saves sites, folders, settings, and the local custom background.
- Optional `browsingActivity` data consent is requested only if the user enables remote icons.

Neither build requests access to all websites.

## Repository layout

```text
.
├── manifest.json              Chrome manifest
├── newtab.* / services       Shared application source
├── firefox/                  Firefox-only manifest, providers, UI, locales, and icons
├── scripts/build-chrome.mjs  Reproducible Chrome release builder
├── scripts/build-firefox.mjs Deterministic Firefox release builder
├── .github/workflows/        Automated tests and browser release validation
└── tests/                    Shared and browser-isolation tests
```

## Install Chrome locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the generated Chrome directory from the build step below. The builder includes the Chrome-specific startup code; loading the shared repository root omits that integration.

## Build Chrome

The output directory and ZIP must be outside the source tree, and the archive name must include `chrome`.

```bash
node scripts/build-chrome.mjs \
  --output-dir /absolute/path/minimal-new-tab-chrome \
  --archive /absolute/path/minimal-new-tab-chrome-v1.7.zip
```

The generated directory can be loaded unpacked in Chrome. The ZIP has root-level
packaging for the prepared 1.7 release. Store submission and approval remain separate.

## Build Firefox

The output directory and ZIP must be outside the source tree, and the archive name must include `firefox`.

```bash
node scripts/build-firefox.mjs \
  --output-dir /absolute/path/minimal-new-tab-firefox \
  --archive /absolute/path/minimal-new-tab-firefox-v1.7.zip
```

Load the output directory temporarily from `about:debugging#/runtime/this-firefox`.
The prepared ZIP is for Firefox Add-ons submission; it is not yet signed and is
not a persistently installed Firefox add-on. Submission and approval are separate.

## Validation

GitHub Actions runs the complete tests, builds both browser archives, verifies ZIP integrity, and lints the Firefox package. The same checks can be run locally:

```bash
node --test tests/*.test.mjs
node scripts/build-chrome.mjs \
  --output-dir /absolute/path/minimal-new-tab-chrome \
  --archive /absolute/path/minimal-new-tab-chrome-v1.7.zip
node scripts/build-firefox.mjs \
  --output-dir /absolute/path/minimal-new-tab-firefox \
  --archive /absolute/path/minimal-new-tab-firefox-v1.7.zip
npx web-ext lint --source-dir /absolute/path/minimal-new-tab-firefox
```

## License

The project source code is licensed under the Mozilla Public License 2.0. See [LICENSE](LICENSE). Third-party site icon assets retain their own notices in `firefox/site-icons/THIRD_PARTY_NOTICES.md`.
