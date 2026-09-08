# Minimal New Tab 1.6

Chrome and Firefox — September 8, 2026.

## What's New — English

- A lighter header with floating folder buttons and more breathing room.
- Improved scrolling: navigation stays in place, with comfortable bottom spacing and the familiar frosted-glass cards.
- More reliable saving when several new tabs are open.
- Keyboard reordering for sites and folders, plus an option to disable single-key shortcuts.
- Clearer messages when adding sites, uploading backgrounds, importing backups, or saving changes.
- More consistent typography and easier-to-use dialogs in Chrome and Firefox.

## Что нового — Русский

- Более лёгкая шапка с отдельными кнопками папок и аккуратными отступами.
- Улучшенная прокрутка: навигация остаётся на месте, сохранены нижний отступ и привычное размытие карточек.
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

- All 145 unit and contract tests passed.
- Both release ZIPs passed integrity checks.
- Firefox `web-ext@10.5.0 lint`: 0 errors, 0 warnings, 0 notices.
- Before the final CSS-only card restoration, real extension pages in isolated persistent Chrome and Firefox profiles:
  fresh install, folder creation, URL autofocus, scheme-less URL normalization,
  add/edit/delete, keyboard reorder, custom background upload, export/import,
  page reload, and complete browser restart all passed.
- The site order, folders, and custom background were restored after restart.
  Firefox's unsigned test add-on was reinstalled temporarily after restart,
  keeping the same profile and add-on ID; permanent installation needs signing.
- Header spacing and scrolling were checked in both engines at 1280, 900, and
  390 px widths. The controls are raised by 6 px without increasing the header.
- Final card surfaces were compared directly with `minimal-new-tab-chrome-v1.5.5.zip`
  and `minimal-new-tab-firefox-v1.5.6.1.zip`; both contain the reference stylesheet.
  See [card comparison and verification limits](blur-1.6-verification.md) for
  the controlled visual comparison and the Firefox rendering limitation.

Local evidence: `../release-1.6-checks/chrome-result.json` and
`../release-1.6-checks/firefox-result.json`.

SHA-256:

```text
370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794  minimal-new-tab-chrome-v1.6.zip
34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671  minimal-new-tab-firefox-v1.6.zip
```
