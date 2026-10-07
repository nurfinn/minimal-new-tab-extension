# Minimal New Tab by nurfinn

A calm, customizable new tab for Chrome and Firefox. Keep favorite sites in folders, choose emoji icons, swipe between folders, change the background, and move your setup between browsers without an account or backend.

[Visit nurfinn.com](https://nurfinn.com/?utm_source=github&utm_medium=referral)

## Browser releases

| Browser | Current version | Source |
| --- | ---: | --- |
| Chrome | 1.7 | Shared files in the repository root |
| Firefox | 1.7 | Shared root files plus the isolated `firefox/` overlay |

Chrome and Firefox live in one repository because most product logic is shared. Browser-specific manifests, favicon providers, permissions, UI additions, and release assets remain isolated. Both store archives are produced from explicit allowlists and validated independently before release.

Release tags and archives should include the platform:

- `chrome-v1.7` → `minimal-new-tab-chrome-v1.7.zip`
- `firefox-v1.7` → `minimal-new-tab-firefox-v1.7.zip`

## What's new in 1.7

- Choose emoji instead of website icons from a built-in catalog with search, categories, and skin-tone variants.
- Switch folders with horizontal trackpad swipes.
- Hide the All view from the folder manager without deleting any sites.
- Refined Settings and more consistent form controls, including clearer Firefox icon-permission status.
- A softer app icon with the same familiar shape.
- JSON backups now include your chosen emoji.
- An update-ready notice lets you choose Update or Later when Chrome has downloaded an update. Firefox uses its own update handling.
- Improved saving reliability and safer replacement of custom backgrounds.

Both browser editions use version **1.7**. Existing sites and settings are preserved, and permissions have not changed.

[Release notes and verification details](docs/release-1.7.md).
Store materials: [English description](docs/store/chrome-description-en.txt),
[Russian description](docs/store/chrome-description-ru.txt),
[screenshots and promotional images](design/store/v1.7/README.md).

## Highlights

- Add, edit, delete, and reorder favorite sites.
- Organize sites into folders and arrange folders in your preferred order.
- Switch folders with trackpad swipes and optionally hide the All view.
- Choose emoji from a built-in offline catalog or keep automatic website icons.
- Use a bundled background or choose a local image and overlay.
- Open Add site with `A`, Create folder with `F`, and Settings with `S` on any keyboard layout.
- Keep a visible letter fallback whenever a site icon is unavailable.
- Automatically use English or Russian based on the browser language.
- Export and import sites, folders, their order, and chosen emoji in portable JSON backups.
- Keep the page stable and responsive with larger site and folder collections.

## Site icons

Chrome uses its browser-provided favicon capability with a lightweight hostname fallback.

Firefox includes local icons for popular services, so they work without a network request. Unknown sites keep their letter fallback. Users can optionally enable **Load missing site icons** in Settings; it is off by default, and only the saved hostname is used for the request.

## Sync and moving between browsers

Lightweight settings use the browser’s sync storage. Chrome Sync and Firefox Sync are separate systems and do not transfer extension data between browser families. Use Export in one browser and Import in another to move sites, folders, and their order.

Version 1.7 exports backup format v2, which includes emoji. Versions 1.6 and earlier cannot import v2; update the receiving browser's extension first. Older v1 backups can still be imported.

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

Load the generated directory unpacked in Chrome, or submit the root-level ZIP to the Chrome Web Store.

## Build Firefox

The output directory and ZIP must be outside the source tree, and the archive name must include `firefox`.

```bash
node scripts/build-firefox.mjs \
  --output-dir /absolute/path/minimal-new-tab-firefox \
  --archive /absolute/path/minimal-new-tab-firefox-v1.7.zip
```

Load the output directory temporarily from `about:debugging#/runtime/this-firefox`,
or submit the ZIP to Firefox Add-ons. The generated ZIP is not a signed installable XPI.

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
