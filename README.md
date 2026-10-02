# Minimal New Tab by nurfinn

A calm, customizable new tab for Chrome and Firefox. Keep favorite sites in folders, change the background, use keyboard shortcuts, and move your setup between browsers without an account or backend.

[Visit nurfinn.com](https://nurfinn.com/?utm_source=github&utm_medium=referral)

## Browser releases

| Browser | Latest published version | Source |
| --- | ---: | --- |
| Chrome | 1.6 | Shared files in the repository root |
| Firefox | 1.6 | Shared root files plus the isolated `firefox/` overlay |

Chrome and Firefox live in one repository because most product logic is shared. Browser-specific manifests, favicon providers, permissions, UI additions, and release assets remain isolated. Both store archives are produced from explicit allowlists and validated independently before release.

Release tags and archives should include the platform:

- `chrome-v1.6` → `minimal-new-tab-chrome-v1.6.zip`
- `firefox-v1.6` → `minimal-new-tab-firefox-v1.6.zip`

## Unreleased development checkpoint

This working branch contains tested improvements beyond the published 1.6 packages:

- An optional built-in emoji picker inside the site's address field, with a way back to automatic favicons.
- Fast trackpad navigation between folders, reusing loaded cards and icons and coalescing selection saves.
- More compact General settings, consistent controls and a clearer Firefox icon-permission state.
- A Chrome-only notification for an update the browser has already downloaded, with Later and checks for unfinished work before applying it. Firefox keeps its existing update behavior.

The manifest versions remain `1.6` until a new release is explicitly prepared. Do not upload a development build as the existing store release. The published ZIPs and bundled wallpaper have not been replaced.

Backups now export format v2 to preserve emoji. This code still imports v1 files, but the published 1.6 cannot import v2 backups. Custom background images remain local and are excluded from backups. Older clients may drop the optional emoji field if they rewrite shared sync data.

Verification records: [Chrome update handling](docs/chrome-update-notification-verification-2026-10-02.md), [Firefox native checks and limitations](docs/firefox-transfer-verification-2026-10-02.md).

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
- Use a bundled background or choose a local image and overlay.
- Open Add site with `A`, Create folder with `F`, and Settings with `S` on any keyboard layout.
- Keep a visible letter fallback whenever a site icon is unavailable.
- Automatically use English or Russian based on the browser language.
- Export and import sites and folders when moving between browsers.
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
  --archive /absolute/path/minimal-new-tab-chrome-v1.6.zip
```

The generated directory can be loaded unpacked in Chrome. The ZIP has the required root-level packaging, but development checkpoints still need a release version and final acceptance before store submission.

## Build Firefox

The output directory and ZIP must be outside the source tree, and the archive name must include `firefox`.

```bash
node scripts/build-firefox.mjs \
  --output-dir /absolute/path/minimal-new-tab-firefox \
  --archive /absolute/path/minimal-new-tab-firefox-v1.6.zip
```

Load the output directory temporarily from `about:debugging#/runtime/this-firefox`. Submit a ZIP to Firefox Add-ons only after preparing an explicitly approved release version; the current development checkpoint is not a store release.

## Validation

GitHub Actions runs the complete tests, builds both browser archives, verifies ZIP integrity, and lints the Firefox package. The same checks can be run locally:

```bash
node --test tests/*.test.mjs
node scripts/build-chrome.mjs \
  --output-dir /absolute/path/minimal-new-tab-chrome \
  --archive /absolute/path/minimal-new-tab-chrome-v1.6.zip
node scripts/build-firefox.mjs \
  --output-dir /absolute/path/minimal-new-tab-firefox \
  --archive /absolute/path/minimal-new-tab-firefox-v1.6.zip
npx web-ext lint --source-dir /absolute/path/minimal-new-tab-firefox
```

## License

The project source code is licensed under the Mozilla Public License 2.0. See [LICENSE](LICENSE). Third-party site icon assets retain their own notices in `firefox/site-icons/THIRD_PARTY_NOTICES.md`.
