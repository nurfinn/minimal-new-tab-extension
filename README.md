# Minimal New Tab by nurfinn

A minimal Chrome new tab extension for keeping favorite sites organized with folders, sync, custom backgrounds, and portable backups.

## Features in v1.5.3

- Add, edit, delete, and reorder favorite sites.
- Create, rename, delete, and reorder folders.
- Smooth horizontal scrolling for long folder rows.
- Local title generation when a site name is not entered manually.
- Favicons through the Chrome Favicon API, then Google favicon service, with a letter fallback.
- Bundled default background, custom local backgrounds, and configurable overlay color.
- Reliable custom background validation up to 3 MB and 4096 px per side.
- Keyboard shortcuts: `A` adds a site, `F` opens folders, and `S` opens settings.
- Export and import for sites, folders, and their order.
- Automatic English or Russian interface based on the Chrome UI language.
- Safe state recovery when synchronized storage is damaged or partially written.
- Stable internal vertical scrolling with a comfortable bottom gap for long site lists.

## Data storage

Sites, folders, ordering, selected folder, and lightweight interface settings are stored with `chrome.storage.sync`. Sync depends on Chrome Sync being enabled in Chrome. Brave and other browsers do not receive data from a Chrome account. To move settings between different browsers, use export and import.

Custom background images are stored only on the current device with `chrome.storage.local`. They are not stored in sync and are not included in JSON exports. Imported backups preserve the current background.

The extension does not use a backend, OAuth, analytics, advertising, or browsing history.

## Permissions

- `storage` — saves settings, sites, folders, and the local custom background.
- `favicon` — requests favicons for addresses saved by the user.

The extension does not request access to all websites.

## Local installation

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select the extension folder.
5. After updating files, click **Reload** on the extension card and open a new tab.

Version in `manifest.json`: **1.5.3**.
