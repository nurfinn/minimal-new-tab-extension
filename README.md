# Minimal New Tab by nurfinn

A calm, customizable new tab for Chrome and Firefox. Keep favorite sites in folders, change the background, use keyboard shortcuts, and move your setup between browsers without an account or backend.

[Visit nurfinn.com](https://nurfinn.com/?utm_source=github&utm_medium=referral)

## Browser releases

| Browser | Current version | Source |
| --- | ---: | --- |
| Chrome | 1.5.4 | Shared files in the repository root |
| Firefox | 1.5.5 | Shared root files plus the isolated `firefox/` overlay |

Chrome and Firefox live in one repository because most product logic is shared. Browser-specific manifests, favicon providers, permissions, UI additions, and release assets remain isolated. Tests freeze the published Chrome source while Firefox builds are produced separately.

Release tags and archives should include the platform:

- `chrome-v1.5.4` → `minimal-new-tab-chrome-v1.5.4.zip`
- `firefox-v1.5.5` → `minimal-new-tab-firefox-v1.5.5.zip`

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

Firefox 1.5.5 includes local icons for popular services, so they work without a network request. Unknown sites keep their letter fallback. Users can optionally enable **Load missing site icons** in Settings; it is off by default, and only the saved hostname is used for the request.

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
├── scripts/build-firefox.mjs Deterministic Firefox release builder
└── tests/                    Shared and browser-isolation tests
```

## Install Chrome locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository root.

## Build Firefox

The output directory and ZIP must be outside the source tree, and the archive name must include `firefox`.

```bash
node scripts/build-firefox.mjs \
  --output-dir /absolute/path/minimal-new-tab-firefox \
  --archive /absolute/path/minimal-new-tab-firefox-v1.5.5.zip
```

Load the output directory temporarily from `about:debugging#/runtime/this-firefox`, or submit the generated ZIP to Firefox Add-ons.

## Validation

```bash
node --test tests/*.test.mjs
npx web-ext lint --source-dir /absolute/path/minimal-new-tab-firefox
```
