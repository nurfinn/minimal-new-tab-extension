# Chrome Web Store copy and GitHub README design

## Goal

Prepare concise, non-technical Russian and English copy for the Chrome Web Store, then refresh GitHub with a fuller English README and a short repository About description. The public copy must accurately describe release `1.5.4` and changes made after `1.5.2`.

## Chrome Web Store copy

### Russian description

> Минималистичная новая вкладка для быстрого доступа к любимым сайтам. Организуйте ссылки по папкам, меняйте фон и переносите настройки между браузерами.

### Russian What's New Since 1.5.2

> — Новый стандартный фон.  
> — Горячие клавиши работают при любой раскладке.  
> — Удаление сайтов и папок стало удобнее и надёжнее.  
> — Улучшены загрузка, предпросмотр и сохранение пользовательского фона.

### English description

> A minimal new tab for quick access to your favorite sites. Organize links into folders, customize the background, and move your setup between browsers.

### English What's New Since 1.5.2

> — New default background.  
> — Keyboard shortcuts now work with any keyboard layout.  
> — Deleting sites and folders is smoother and more reliable.  
> — Improved custom background upload, preview, and saving.

## GitHub README

The README remains English-only and uses the Store description as its opening idea, expanded into a useful product page with these sections:

1. Product title, website link, and a two-paragraph overview focused on a calm, uncluttered new tab.
2. Highlights covering sites, folders, ordering, backgrounds, keyboard shortcuts, English/Russian UI, sync, and portable backups.
3. `What's New Since 1.5.2` using the same four English release points as the Store listing.
4. `Sync and moving between browsers` explaining that Chrome Sync works between Chrome installations signed into the same account, while export/import is the portable option for Brave and other browsers.
5. `Backgrounds` explaining that custom images stay on the current device and do not travel through sync or JSON backups.
6. `Privacy` stating that the extension has no account, backend, analytics, advertising, or browsing-history collection.
7. `Permissions` describing only `storage` and `favicon` in plain language, and confirming there is no access to all websites.
8. `Install locally` with the existing five Chrome developer-mode steps.
9. Current release version `1.5.4`.

The README will avoid implementation details about chunks, manifests, schema versions, quotas, or internal services.

## GitHub repository About description

> A clean, customizable Chrome new tab with folders, sync, shortcuts, backgrounds, and portable backups.

## Publication

Update `README.md`, commit the copy change, fast-forward the repository's `main` branch to the completed `1.5.4` release, update the GitHub About description, and push without force. Do not create a pull request unless the direct fast-forward push is rejected.
