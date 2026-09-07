# Minimal New Tab 1.6

Chrome and Firefox — September 8, 2026.

## What's New — English

- A lighter header with floating folder buttons and more breathing room.
- Improved scrolling: navigation stays in place, and sites fade gently beneath it.
- More reliable saving when several new tabs are open.
- Keyboard reordering for sites and folders, plus an option to disable single-key shortcuts.
- Clearer messages when adding sites, uploading backgrounds, importing backups, or saving changes.
- More consistent typography and easier-to-use dialogs in Chrome and Firefox.

## Что нового — Русский

- Более лёгкая шапка с отдельными кнопками папок и аккуратными отступами.
- Улучшенная прокрутка: навигация остаётся на месте, а карточки плавно исчезают под ней.
- Более надёжное сохранение, когда открыто несколько новых вкладок.
- Изменение порядка сайтов и папок с клавиатуры и возможность отключить одноклавишные сочетания.
- Более понятные сообщения при добавлении сайтов, загрузке фона, импорте и сохранении изменений.
- Единообразные шрифты и более удобные диалоги в Chrome и Firefox.

## Release scope

Both manifests and exported backup metadata use version `1.6`. Sync schema
version and backup format remain `1`. Existing settings remain compatible.
Permissions, Firefox add-on ID, optional remote-icon consent, and browser
separation are unchanged. Custom backgrounds remain local to each device.

Archives:

- `minimal-new-tab-chrome-v1.6.zip`
- `minimal-new-tab-firefox-v1.6.zip`

These are store submission archives. The Firefox archive requires Mozilla
signing before permanent installation in regular Firefox.

## Verification

- All 143 unit and contract tests passed.
- Both release ZIPs passed integrity checks.
- Firefox `web-ext@10.5.0 lint`: 0 errors, 0 warnings, 0 notices.
- Real extension pages in isolated persistent Chrome and Firefox profiles:
  fresh install, folder creation, URL autofocus, scheme-less URL normalization,
  add/edit/delete, keyboard reorder, custom background upload, export/import,
  page reload, and complete browser restart all passed.
- The site order, folders, and custom background were restored after restart.
  Firefox's unsigned test add-on was reinstalled temporarily after restart,
  keeping the same profile and add-on ID; permanent installation needs signing.
- Header spacing and scrolling were checked in both engines at 1280, 900, and
  390 px widths. The controls are raised by 6 px without increasing the header.

Local evidence: `../release-1.6-checks/chrome-result.json` and
`../release-1.6-checks/firefox-result.json`.

SHA-256:

```text
075ea3c7c0757a78bd7117198ff07274da2ca98934935bb447cb1fdd99126c28  minimal-new-tab-chrome-v1.6.zip
8dbd14e73f5cf7489bbd61b621851b10ff14b54cb48aa2e8370282a2ca87738f  minimal-new-tab-firefox-v1.6.zip
```
