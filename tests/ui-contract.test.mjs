import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, script, styles, storageScript, i18nScript, extensionApiScript] = await Promise.all([
  readFile(new URL('../newtab.html', import.meta.url), 'utf8'),
  readFile(new URL('../newtab.js', import.meta.url), 'utf8'),
  readFile(new URL('../styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../storage-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../i18n-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../extension-api.mjs', import.meta.url), 'utf8'),
]);

function getCssBlock(source, prelude) {
  const match = source.match(prelude);
  if (!match || match.index === undefined) return '';

  const openBrace = source.indexOf('{', match.index + match[0].length);
  if (openBrace === -1) return '';

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] !== '}') continue;

    depth -= 1;
    if (depth === 0) return source.slice(openBrace + 1, index);
  }

  return '';
}

function readRgbaVariable(block, name) {
  const match = block.match(
    new RegExp(`--${name}\\s*:\\s*rgba\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*([\\d.]+)\\s*\\)`),
  );
  assert.ok(match, `Missing rgba variable --${name}`);
  return [...match.slice(1, 4).map(Number), Number(match[4])];
}

function composite([red, green, blue, alpha], background) {
  return [red, green, blue].map((channel, index) =>
    channel * alpha + background[index] * (1 - alpha));
}

function contrastRatio(first, second) {
  const luminance = (rgb) => {
    const channels = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('loads the new tab script as an ES module', () => {
  assert.match(
    html,
    /<script\s+type\s*=\s*["']module["']\s+src\s*=\s*["']newtab\.js["']\s*>\s*<\/script>/,
  );
});

test('gives the page a primary heading and keeps the product credit in a landmark', () => {
  assert.match(
    html,
    /<main\b[^>]*>[\s\S]*?<h1\b(?=[^>]*\bclass=["']visually-hidden["'])(?=[^>]*\bdata-i18n=["']appShortName["'])[^>]*>Minimal Tab<\/h1>/,
  );
  assert.match(
    html,
    /<footer\b[^>]*>[\s\S]*?<a\b(?=[^>]*\bclass=["']signature["'])(?=[^>]*>by nurfinn<\/a>)[^>]*>[\s\S]*?<\/footer>/,
  );
});

test('marks the static interface for automatic Chrome localization', () => {
  assert.match(html, /<html\s+lang=["']en["']/);
  assert.match(html, /id=["']addLinkButton["'][^>]*data-i18n-title=["']addSiteShortcut["']/);
  assert.match(html, /id=["']settingsButton["'][^>]*data-i18n-aria-label=["']settings["']/);
  assert.match(html, /id=["']linkTitle["'][^>]*data-i18n-placeholder=["']titlePlaceholder["']/);
  assert.match(html, /id=["']backgroundSettingsTab["'][^>]*data-i18n=["']backgroundTab["']/);
  assert.match(html, /id=["']backgroundImageError["'][^>]*role=["']alert["'][^>]*hidden/);
});

test('localizes dynamic UI without requesting or reading website access', () => {
  assert.match(
    script,
    /import\s*\{[^}]*\bderiveTitleFromUrl\b[^}]*\}\s*from\s*["']\.\/newtab-core\.mjs["']\s*;/s,
  );
  assert.match(
    script,
    /import\s*\{[^}]*\bcreateTranslator\b[^}]*\bgetUiLocale\b[^}]*\blocalizeDocument\b[^}]*\}\s*from\s*["']\.\/i18n-service\.mjs["']\s*;/s,
  );
  assert.match(script, /const\s+t\s*=\s*createTranslator\s*\(/);
  assert.match(script, /localizeDocument\s*\(\s*document\s*,\s*t\s*,\s*uiLocale\s*\)/);
  assert.match(script, /enteredTitle\s*\|\|\s*deriveTitleFromUrl\s*\(\s*url\s*,\s*t\s*\(\s*["']siteFallback["']\s*\)\s*\)/);
  assert.doesNotMatch(script, /chrome\.permissions|ALL_SITE_ORIGINS|fetchPageTitle|readHtmlHead|extractPageMetadataTitle|ru-RU/);
});

test('cycles through favicon sources before showing the fallback', () => {
  const createLinkCardBlock = getCssBlock(
    script,
    /function\s+createLinkCard\s*\(\s*link\s*\)/,
  );

  assert.match(
    script,
    /import\s*\{[^}]*\bbuildFaviconSources\b[^}]*\}\s*from\s*["']\.\/newtab-core\.mjs["']\s*;/s,
  );
  assert.match(
    script,
    /import\s*\{[^}]*\bisUsableFavicon\b[^}]*\}\s*from\s*["']\.\/newtab-core\.mjs["']\s*;/s,
  );
  assert.match(
    script,
    /const\s+faviconSources\s*=\s*buildFaviconSources\s*\(\s*link\.url\s*\)\s*;/,
  );
  assert.match(script, /faviconSourceIndex\s*\+=\s*1\s*;/);
  assert.match(
    script,
    /favicon\.classList\.add\s*\(\s*["']fallback["']\s*\)\s*;/,
  );
  assert.match(
    createLinkCardBlock,
    /favicon\.classList\.add\s*\(\s*["']fallback["']\s*\)\s*;[\s\S]*favicon\.append\s*\(\s*faviconImage\s*,\s*faviconLetter\s*\)\s*;[\s\S]*loadNextFaviconSource\s*\(\s*\)\s*;/,
  );
  assert.match(
    createLinkCardBlock,
    /faviconImage\.loading\s*=\s*["']eager["']\s*;/,
  );
  assert.match(
    createLinkCardBlock,
    /if\s*\(\s*isUsableFavicon\s*\(\s*faviconImage\s*\)\s*\)\s*\{[\s\S]*favicon\.classList\.remove\s*\(\s*["']fallback["']\s*\)/,
  );
  assert.match(
    createLinkCardBlock,
    /faviconSourceIndex\s*\+=\s*1\s*;[\s\S]*loadNextFaviconSource\s*\(\s*\)/,
  );
  assert.match(
    createLinkCardBlock,
    /faviconImage\.addEventListener\s*\(\s*["']load["']\s*,[\s\S]*favicon\.classList\.remove\s*\(\s*["']fallback["']\s*\)[\s\S]*faviconSourceIndex\s*\+=\s*1\s*;[\s\S]*loadNextFaviconSource\s*\(\s*\)/,
  );
  assert.match(
    createLinkCardBlock,
    /if\s*\(\s*!source\s*\)\s*\{[\s\S]*faviconImage\.removeAttribute\s*\(\s*["']src["']\s*\)[\s\S]*favicon\.classList\.add\s*\(\s*["']fallback["']\s*\)/,
  );
});

test('keeps full truncated site names and hosts available on hover and focus', () => {
  const createLinkCardBlock = getCssBlock(script, /function\s+createLinkCard\s*\(\s*link\s*\)/);

  assert.match(createLinkCardBlock, /const\s+hostText\s*=\s*getHost\s*\(\s*link\.url\s*\)\s*;/);
  assert.match(createLinkCardBlock, /title\.title\s*=\s*link\.title\s*;/);
  assert.match(createLinkCardBlock, /host\.title\s*=\s*hostText\s*;/);
  assert.match(
    createLinkCardBlock,
    /openLink\.setAttribute\s*\(\s*["']aria-label["']\s*,\s*`\$\{link\.title\} — \$\{hostText\}`\s*\)/,
  );
});

test('keeps image-background card text above 4.5 to 1 on a white image', () => {
  const imageRule = getCssBlock(styles, /body\.has-image\s*(?=\{)/);
  const white = [255, 255, 255];
  const cardSurface = composite(readRgbaVariable(imageRule, 'card-bg'), white);
  const title = composite(readRgbaVariable(imageRule, 'card-text'), cardSurface);
  const host = composite(readRgbaVariable(imageRule, 'card-muted'), cardSurface);

  assert.ok(contrastRatio(title, cardSurface) >= 4.5);
  assert.ok(contrastRatio(host, cardSurface) >= 4.5);
});

test('keeps the import cancel binding safe during mixed unpacked updates', () => {
  assert.match(html, /id=["']cancelImportButton["']/);
  assert.match(
    script,
    /elements\.cancelImportButton\?\.addEventListener\s*\(\s*["']click["']\s*,\s*resetImportState\s*\)\s*;/,
  );
});

test('reads an import file before clearing its file input', () => {
  const loadImportFileBlock = getCssBlock(
    script,
    /async\s+function\s+loadImportFile\s*\(\s*event\s*\)/,
  );

  const readIndex = loadImportFileBlock.indexOf('await file.text()');
  const resetIndex = loadImportFileBlock.indexOf('resetImportState()');

  assert.notEqual(readIndex, -1);
  assert.notEqual(resetIndex, -1);
  assert.ok(readIndex < resetIndex);
});

test('links the signature to the product site instead of GitHub', () => {
  assert.match(
    html,
    /<a\s+class=["']signature["']\s+href=["']https:\/\/nurfinn\.com\/\?utm_source=minimal_new_tab_extension&amp;utm_medium=referral["'][^>]*>by nurfinn<\/a>/,
  );
  assert.doesNotMatch(html, /github\.com\/nurfinn/);
});

test('exposes guarded A, F, and S shortcuts without changing button icons', () => {
  assert.match(
    html,
    /id=["']addLinkButton["'][^>]*data-i18n-title=["']addSiteShortcut["'][^>]*aria-keyshortcuts=["']A["']/,
  );
  assert.match(
    html,
    /id=["']addFolderButton["'][^>]*data-i18n-title=["']createFolderShortcut["'][^>]*aria-keyshortcuts=["']F["']/,
  );
  assert.match(
    html,
    /id=["']settingsButton["'][^>]*data-i18n-title=["']settingsShortcut["'][^>]*aria-keyshortcuts=["']S["']/,
  );
  assert.match(
    script,
    /import\s*\{[^}]*\bgetGlobalShortcutAction\b[^}]*\}\s*from\s*["']\.\/newtab-core\.mjs["']\s*;/s,
  );
  assert.match(
    script,
    /document\.addEventListener\s*\(\s*["']keydown["']\s*,\s*handleGlobalShortcut\s*\)\s*;/,
  );

  const shortcutBlock = getCssBlock(
    script,
    /function\s+handleGlobalShortcut\s*\(\s*event\s*\)/,
  );
  assert.match(shortcutBlock, /getGlobalShortcutAction\s*\(/);
  assert.match(shortcutBlock, /code\s*:\s*event\.code/);
  assert.match(shortcutBlock, /key\s*:\s*event\.key/);
  assert.match(shortcutBlock, /isEditableTarget\s*\(\s*event\.target\s*\)/);
  assert.match(shortcutBlock, /document\.querySelector\s*\(\s*["']dialog\[open\]["']\s*\)/);
  assert.match(shortcutBlock, /event\.preventDefault\s*\(\s*\)/);
  assert.match(shortcutBlock, /button\.click\s*\(\s*\)/);

  const editableTargetBlock = getCssBlock(
    script,
    /function\s+isEditableTarget\s*\(\s*target\s*\)/,
  );
  assert.match(editableTargetBlock, /editable\.closest\s*\(\s*["']dialog["']\s*\)/);
  assert.match(editableTargetBlock, /!ownerDialog\s*\|\|\s*ownerDialog\.open/);
});

test('supports keyboard reordering and announces the committed position', () => {
  assert.match(
    script,
    /import\s*\{[^}]*\bmoveItemByDelta\b[^}]*\}\s*from\s*["']\.\/newtab-core\.mjs["']\s*;/s,
  );
  assert.match(
    html,
    /id=["']reorderStatus["'][^>]*aria-live=["']polite["'][^>]*aria-atomic=["']true["']/,
  );
  assert.match(styles, /\.visually-hidden\s*\{/);
  assert.match(
    script,
    /elements\.linksGrid\.addEventListener\s*\(\s*["']keydown["']\s*,\s*handleLinkReorderKeydown\s*\)/,
  );

  const linkKeyboardBlock = getCssBlock(
    script,
    /async\s+function\s+handleLinkReorderKeydown\s*\(\s*event\s*\)/,
  );
  const folderKeyboardBlock = getCssBlock(
    script,
    /async\s+function\s+handleFolderReorderKeydown\s*\(\s*event\s*\)/,
  );
  assert.match(linkKeyboardBlock, /["']ArrowLeft["']/);
  assert.match(linkKeyboardBlock, /["']ArrowRight["']/);
  assert.match(linkKeyboardBlock, /moveItemByDelta\s*\(/);
  assert.match(linkKeyboardBlock, /await\s+commitStateChange\s*\(/);
  assert.match(linkKeyboardBlock, /focusReorderHandle\s*\(/);
  assert.match(linkKeyboardBlock, /announceReorder\s*\(/);
  assert.match(folderKeyboardBlock, /["']ArrowUp["']/);
  assert.match(folderKeyboardBlock, /["']ArrowDown["']/);
  assert.match(folderKeyboardBlock, /moveItemByDelta\s*\(/);
  assert.match(folderKeyboardBlock, /await\s+commitStateChange\s*\(/);
  assert.match(folderKeyboardBlock, /focusReorderHandle\s*\(/);
  assert.match(folderKeyboardBlock, /announceReorder\s*\(/);
});

test('lets users disable single-key A, F, and S shortcuts in Background settings', () => {
  assert.match(
    html,
    /id=["']singleKeyShortcuts["'][^>]*type=["']checkbox["']/,
  );
  assert.match(html, /data-i18n=["']singleKeyShortcutsLabel["']/);
  assert.match(html, /data-i18n=["']singleKeyShortcutsDescription["']/);
  assert.match(styles, /\.toggle-field\s*\{/);

  const shortcutBlock = getCssBlock(script, /function\s+handleGlobalShortcut\s*\(\s*event\s*\)/);
  const backgroundSubmitBlock = getCssBlock(
    script,
    /elements\.backgroundForm\.addEventListener\s*\(\s*["']submit["']\s*,\s*async\s*\(\s*event\s*\)\s*=>/,
  );
  const renderPreferenceBlock = getCssBlock(
    script,
    /function\s+renderShortcutPreference\s*\(\s*\)/,
  );

  assert.match(shortcutBlock, /if\s*\(\s*!state\.shortcutsEnabled\s*\)\s*return\s*;/);
  assert.match(backgroundSubmitBlock, /const\s+shortcutsEnabled\s*=\s*elements\.singleKeyShortcuts\.checked\s*;/);
  assert.match(backgroundSubmitBlock, /latestState\.shortcutsEnabled\s*=\s*shortcutsEnabled\s*;/);
  assert.match(renderPreferenceBlock, /const\s+enabled\s*=\s*state\.shortcutsEnabled\s*;/);
  assert.match(renderPreferenceBlock, /elements\.singleKeyShortcuts\.checked\s*=\s*enabled\s*;/);
  assert.match(renderPreferenceBlock, /removeAttribute\s*\(\s*["']aria-keyshortcuts["']\s*\)/);
});

test('delegates persistence to the isolated sync storage service', () => {
  assert.match(
    script,
    /import\s*\{[^}]*\bcreateStorageService\b[^}]*\}\s*from\s*["']\.\/storage-service\.mjs["']\s*;/s,
  );
  assert.match(script, /const\s+storageService\s*=\s*createStorageService\s*\(/);
  assert.doesNotMatch(script, /\blocalStorage\b/);
  assert.doesNotMatch(script, /\bchrome\.storage\b/);
  assert.doesNotMatch(script, /\b(?:chunk|generation|backupManifest|SyncManifest)\b/i);
  assert.match(
    storageScript,
    /import\s*\{\s*getExtensionApi\s*\}\s*from\s*["']\.\/extension-api\.mjs["']/,
  );
  assert.match(storageScript, /getExtensionApi\s*\(\s*\)\?\.storage\?\.sync/);
  assert.match(storageScript, /getExtensionApi\s*\(\s*\)\?\.storage\?\.local/);
  assert.match(
    i18nScript,
    /import\s*\{\s*getExtensionApi\s*\}\s*from\s*["']\.\/extension-api\.mjs["']/,
  );
  assert.match(i18nScript, /getExtensionApi\s*\(\s*\)\?\.i18n\?\.getMessage/);
  assert.match(extensionApiScript, /browserApi\s*=\s*globalThis\.browser/);
  assert.match(extensionApiScript, /chromeApi\s*=\s*globalThis\.chrome/);

  const initBlock = getCssBlock(script, /async\s+function\s+init\s*\(\s*\)/);
  assert.match(initBlock, /await\s+storageService\.load\s*\(\s*defaultState\s*\)/);
  assert.match(initBlock, /state\s*=\s*normalizeState\s*\(\s*result\.state\s*\)/);

  const commitBlock = getCssBlock(
    script,
    /async\s+function\s+commitStateChange\s*\(\s*transform\s*,\s*options\s*=\s*\{\s*\}\s*\)/,
  );
  assert.match(commitBlock, /await\s+storageService\.update\s*\(\s*defaultState\s*,\s*transform\s*\)/);
  assert.match(commitBlock, /if\s*\(\s*!result\.ok\b/);
  assert.match(commitBlock, /state\s*=\s*normalizeState\s*\(\s*result\.state\s*\)/);
  assert.match(commitBlock, /render\s*\(\s*\)/);
  assert.doesNotMatch(script, /storageService\.save\s*\(/);
  assert.match(script, /validateSiteDraft\s*\(\s*\{[\s\S]*title:\s*elements\.linkTitle\.value[\s\S]*url:\s*elements\.linkUrl\.value[\s\S]*\}\s*\)/);
  assert.doesNotMatch(script, /function\s+normalizeUrl\s*\(/);
});

test('explains invalid site and folder input without discarding the draft', () => {
  assert.match(
    script,
    /import\s*\{[^}]*\bvalidateFolderName\b[^}]*\bvalidateSiteDraft\b[^}]*\}\s*from\s*["']\.\/newtab-core\.mjs["']\s*;/s,
  );
  assert.match(
    html,
    /<form\b(?=[^>]*\bid=["']linkForm["'])(?=[^>]*\bnovalidate\b)[^>]*>/,
  );
  assert.match(
    html,
    /id=["']linkTitle["'][^>]*maxlength=["']500["'][^>]*aria-describedby=["']linkTitleError["']/,
  );
  assert.match(
    html,
    /id=["']linkUrl["'][^>]*aria-describedby=["']linkUrlError["']/,
  );
  assert.match(html, /id=["']linkTitleError["'][^>]*role=["']alert["'][^>]*hidden/);
  assert.match(html, /id=["']linkUrlError["'][^>]*role=["']alert["'][^>]*hidden/);
  assert.match(
    html,
    /id=["']folderName["'][^>]*maxlength=["']200["'][^>]*aria-describedby=["']folderFormError["']/,
  );

  const linkSubmitBlock = getCssBlock(
    script,
    /elements\.linkForm\.addEventListener\s*\(\s*["']submit["']\s*,\s*async\s*\(\s*event\s*\)\s*=>/,
  );
  const folderSubmitBlock = getCssBlock(
    script,
    /elements\.folderForm\.addEventListener\s*\(\s*["']submit["']\s*,\s*async\s*\(\s*event\s*\)\s*=>/,
  );
  const showInputErrorBlock = getCssBlock(
    script,
    /function\s+showInputError\s*\(\s*input\s*,\s*errorElement\s*,\s*message\s*\)/,
  );
  const clearInputErrorBlock = getCssBlock(
    script,
    /function\s+clearInputError\s*\(\s*input\s*,\s*errorElement\s*\)/,
  );

  assert.match(linkSubmitBlock, /const\s+validation\s*=\s*validateSiteDraft\s*\(/);
  assert.match(linkSubmitBlock, /if\s*\(\s*!validation\.ok\s*\)/);
  assert.match(folderSubmitBlock, /const\s+validation\s*=\s*validateFolderName\s*\(/);
  assert.match(folderSubmitBlock, /if\s*\(\s*!validation\.ok\s*\)/);
  assert.match(showInputErrorBlock, /input\.setAttribute\s*\(\s*["']aria-invalid["']\s*,\s*["']true["']\s*\)/);
  assert.match(showInputErrorBlock, /input\.focus\s*\(/);
  assert.match(clearInputErrorBlock, /input\.removeAttribute\s*\(\s*["']aria-invalid["']\s*\)/);
  assert.match(script, /elements\.linkTitle\.addEventListener\s*\(\s*["']input["']/);
  assert.match(script, /elements\.linkUrl\.addEventListener\s*\(\s*["']input["']/);
  assert.match(script, /elements\.folderName\.addEventListener\s*\(\s*["']input["']/);
});

test('commits all site and folder mutations against the latest stored state', () => {
  const linkSubmitBlock = getCssBlock(
    script,
    /elements\.linkForm\.addEventListener\s*\(\s*["']submit["']\s*,\s*async\s*\(\s*event\s*\)\s*=>/,
  );
  const linkDeleteBlock = getCssBlock(
    script,
    /elements\.deleteLinkButton\.addEventListener\s*\(\s*["']click["']\s*,\s*async\s*\(\s*\)\s*=>/,
  );
  const linkReorderBlock = getCssBlock(script, /async\s+function\s+finishLinkDrag\s*\(\s*event\s*\)/);
  const folderReorderBlock = getCssBlock(script, /async\s+function\s+finishFolderDrag\s*\(\s*event\s*\)/);
  const renderBlock = getCssBlock(script, /function\s+render\s*\(\s*\)/);

  assert.match(linkSubmitBlock, /await\s+commitStateChange\s*\(/);
  assert.match(linkDeleteBlock, /await\s+commitStateChange\s*\(/);
  assert.match(linkReorderBlock, /await\s+commitStateChange\s*\([\s\S]*reorderVisibleLinks/);
  assert.match(folderReorderBlock, /await\s+commitStateChange\s*\([\s\S]*reorderFolders/);
  assert.doesNotMatch(renderBlock, /storageService\.(?:save|update)|commitStateChange/);
});

test('shows storage failures and keeps form completion behind a successful commit', () => {
  assert.match(
    html,
    /id=["']appStatus["'][^>]*role=["']alert["'][^>]*hidden/,
  );
  assert.match(styles, /\.app-status\s*\{/);

  const linkSubmitBlock = getCssBlock(
    script,
    /elements\.linkForm\.addEventListener\s*\(\s*["']submit["']\s*,\s*async\s*\(\s*event\s*\)\s*=>/,
  );
  const folderSubmitBlock = getCssBlock(
    script,
    /elements\.folderForm\.addEventListener\s*\(\s*["']submit["']\s*,\s*async\s*\(\s*event\s*\)\s*=>/,
  );

  for (const block of [linkSubmitBlock, folderSubmitBlock]) {
    assert.match(block, /const\s+saved\s*=\s*await\s+commitStateChange\s*\(/);
    assert.match(block, /if\s*\(\s*!saved\s*\)\s*return\s*;/);
    assert.ok(block.indexOf('if (!saved) return') < block.indexOf('.close()'));
  }
});

test('gives every primary dialog an accessible visible name', () => {
  for (const [dialogId, titleId] of [
    ['linkDialog', 'linkDialogTitle'],
    ['folderDialog', 'folderDialogTitle'],
    ['settingsDialog', 'settingsDialogTitle'],
  ]) {
    assert.match(
      html,
      new RegExp(`<dialog\\b(?=[^>]*\\bid=["']${dialogId}["'])(?=[^>]*\\baria-labelledby=["']${titleId}["'])[^>]*>`),
    );
    assert.match(html, new RegExp(`<h2\\b[^>]*\\bid=["']${titleId}["']`));
  }
});

test('uses one accessible in-extension confirmation for site and folder deletion', () => {
  assert.match(
    html,
    /<dialog\b(?=[^>]*\bid=["']deleteConfirmDialog["'])(?=[^>]*\baria-labelledby=["']deleteConfirmTitle["'])(?=[^>]*\baria-describedby=["']deleteConfirmMessage["'])[^>]*>/,
  );
  assert.match(html, /id=["']deleteConfirmTitle["'][^>]*data-i18n=["']confirmDeletion["']/);
  assert.match(html, /id=["']deleteConfirmMessage["']/);
  assert.match(html, /id=["']confirmDeleteButton["'][^>]*data-i18n=["']delete["']/);
  assert.match(html, /id=["']cancelDeleteButton["'][^>]*data-cancel-delete-confirm/);
  assert.match(html, /data-cancel-delete-confirm[^>]*data-i18n=["']cancel["']/);
  assert.match(styles, /\.confirmation-message\s*\{/);
  assert.match(styles, /\.confirmation-actions\s*\{/);

  assert.doesNotMatch(script, /\bconfirm\s*\(/);
  assert.match(script, /function\s+requestDeleteConfirmation\s*\(\s*message\s*\)/);
  assert.match(script, /function\s+resolveDeleteConfirmation\s*\(\s*confirmed\s*\)/);

  const requestBlock = getCssBlock(
    script,
    /function\s+requestDeleteConfirmation\s*\(\s*message\s*\)/,
  );
  const resolveBlock = getCssBlock(
    script,
    /function\s+resolveDeleteConfirmation\s*\(\s*confirmed\s*\)/,
  );
  const linkDeleteBlock = getCssBlock(
    script,
    /elements\.deleteLinkButton\.addEventListener\s*\(\s*["']click["']\s*,\s*async\s*\(\s*\)\s*=>/,
  );
  const folderListBlock = getCssBlock(
    script,
    /elements\.folderList\.addEventListener\s*\(\s*["']click["']\s*,\s*async\s*\(\s*event\s*\)\s*=>/,
  );

  assert.match(requestBlock, /if\s*\(\s*pendingDeleteConfirmation\s*\)\s*return\s+Promise\.resolve\s*\(\s*false\s*\)/);
  assert.match(requestBlock, /deleteConfirmMessage\.textContent\s*=\s*message/);
  assert.match(requestBlock, /deleteConfirmDialog\.showModal\s*\(\s*\)/);
  assert.match(requestBlock, /cancelDeleteButton\.focus\s*\(\s*\{\s*preventScroll\s*:\s*true\s*\}\s*\)/);
  assert.match(requestBlock, /deleteConfirmationReturnFocus\s*=\s*document\.activeElement/);
  assert.match(resolveBlock, /pendingDeleteConfirmation\s*=\s*null/);
  assert.match(resolveBlock, /deleteConfirmDialog\.close\s*\(\s*\)/);
  assert.match(resolveBlock, /returnFocus\?\.focus\s*\(\s*\{\s*preventScroll\s*:\s*true\s*\}\s*\)/);
  assert.match(resolveBlock, /resolve\s*\(\s*Boolean\s*\(\s*confirmed\s*\)\s*\)/);
  assert.ok(
    resolveBlock.indexOf('pendingDeleteConfirmation = null') <
      resolveBlock.indexOf('elements.deleteConfirmDialog.close()'),
  );

  assert.match(script, /confirmDeleteButton\.addEventListener\s*\(\s*["']click["'][\s\S]*resolveDeleteConfirmation\s*\(\s*true\s*\)/);
  assert.match(script, /cancelDeleteConfirmButtons\.forEach[\s\S]*resolveDeleteConfirmation\s*\(\s*false\s*\)/);
  assert.match(script, /deleteConfirmDialog\.addEventListener\s*\(\s*["']cancel["'][\s\S]*event\.preventDefault\s*\(\s*\)[\s\S]*resolveDeleteConfirmation\s*\(\s*false\s*\)/);
  assert.match(script, /deleteConfirmDialog\.addEventListener\s*\(\s*["']close["'][\s\S]*resolveDeleteConfirmation\s*\(\s*false\s*\)/);
  assert.match(script, /event\.target\s*===\s*elements\.deleteConfirmDialog[\s\S]*resolveDeleteConfirmation\s*\(\s*false\s*\)/);

  assert.match(linkDeleteBlock, /await\s+requestDeleteConfirmation\s*\(\s*t\s*\(\s*["']deleteSiteConfirm["']/);
  assert.ok(
    linkDeleteBlock.indexOf('await requestDeleteConfirmation') <
      linkDeleteBlock.indexOf('await commitStateChange'),
  );
  assert.match(folderListBlock, /await\s+requestDeleteConfirmation\s*\(\s*t\s*\(\s*["']deleteFolderConfirm["']/);
  assert.ok(
    folderListBlock.indexOf('await requestDeleteConfirmation') <
      folderListBlock.indexOf('await commitStateChange'),
  );
});

test('preserves custom background identity until an explicit reset', () => {
  const backgroundSubmitBlock = getCssBlock(
    script,
    /elements\.backgroundForm\.addEventListener\s*\(\s*["']submit["']\s*,\s*async\s*\(\s*event\s*\)\s*=>/,
  );
  assert.match(backgroundSubmitBlock, /customAssetId/);
  assert.match(backgroundSubmitBlock, /customAssetAvailable/);
  const resetBlock = getCssBlock(
    script,
    /elements\.resetBackgroundButton\.addEventListener\s*\(\s*["']click["']\s*,\s*async\s*\(\s*\)\s*=>/,
  );
  assert.match(resetBlock, /await\s+commitStateChange\s*\(/);
  assert.match(resetBlock, /latestState\.background\s*=\s*structuredClone\s*\(\s*defaultState\.background\s*\)/);
});

test('validates a custom background before mutating or persisting state', () => {
  assert.match(
    script,
    /import\s*\{[^}]*\bvalidateBackgroundImage\b[^}]*\}\s*from\s*["']\.\/newtab-core\.mjs["']\s*;/s,
  );
  assert.match(
    script,
    /backgroundImageError\s*:\s*document\.getElementById\s*\(\s*["']backgroundImageError["']\s*\)/,
  );

  const backgroundSubmitBlock = getCssBlock(
    script,
    /elements\.backgroundForm\.addEventListener\s*\(\s*["']submit["']\s*,\s*async\s*\(\s*event\s*\)\s*=>/,
  );
  assert.match(backgroundSubmitBlock, /validateBackgroundImage\s*\(/);
  assert.match(backgroundSubmitBlock, /await\s+readImageDimensions\s*\(\s*file\s*\)/);
  assert.match(backgroundSubmitBlock, /showBackgroundImageError\s*\([^)]*\)\s*;[\s\S]*return\s*;/);
  assert.ok(
    backgroundSubmitBlock.indexOf('validateBackgroundImage') <
      backgroundSubmitBlock.indexOf('const saved'),
  );
  assert.match(script, /URL\.revokeObjectURL\s*\(/);
});

test('commits a background against the latest state and closes only on success', () => {
  const backgroundSubmitBlock = getCssBlock(
    script,
    /elements\.backgroundForm\.addEventListener\s*\(\s*["']submit["']\s*,\s*async\s*\(\s*event\s*\)\s*=>/,
  );

  assert.match(backgroundSubmitBlock, /const\s+saved\s*=\s*await\s+commitStateChange\s*\(/);
  assert.match(backgroundSubmitBlock, /latestState\.background\s*=\s*nextBackground/);
  assert.match(backgroundSubmitBlock, /onError\s*:\s*\(\s*\)\s*=>\s*showBackgroundImageError\s*\(\s*["']save-failed["']\s*\)/);
  assert.match(backgroundSubmitBlock, /if\s*\(\s*!saved\s*\)\s*return\s*;/);
  assert.ok(
    backgroundSubmitBlock.indexOf('if (!saved) return') <
      backgroundSubmitBlock.indexOf('elements.settingsDialog.close()'),
  );
});

test('uses the supplied bundled image as the first-install background', () => {
  assert.match(
    script,
    /background\s*:\s*\{\s*type\s*:\s*["']image["']\s*,\s*value\s*:\s*["']images\/default-background\.png["']\s*,\s*overlay\s*:\s*0\s*,\s*overlayColor\s*:\s*["']#17122b["']/,
  );
  assert.doesNotMatch(
    script,
    /background\s*:\s*\{\s*type\s*:\s*["']color["']\s*,\s*value\s*:\s*["']#457b9d["']/,
  );
});

test('renders the preview through CSS without an image element or broken-image marker', () => {
  const applyBackgroundBlock = getCssBlock(script, /function\s+applyBackground\s*\(\s*\)/);
  const updatePreviewBlock = getCssBlock(
    script,
    /function\s+updateBackgroundPreview\s*\(\s*\)/,
  );

  assert.match(applyBackgroundBlock, /state\.background\.type\s*===\s*["']image["']/);
  assert.match(applyBackgroundBlock, /document\.body\.classList\.toggle\s*\(\s*["']has-image["']/);
  assert.match(applyBackgroundBlock, /document\.documentElement\.style\.setProperty\s*\(\s*["']--bg["']\s*,\s*backgroundColor\s*\)/);
  assert.match(applyBackgroundBlock, /document\.documentElement\.style\.removeProperty\s*\(\s*["']--bg-image["']\s*\)/);
  assert.match(
    html,
    /<div\b(?=[^>]*\bid=["']backgroundPreviewImage["'])(?=[^>]*\bclass=["'][^"']*background-preview-visual[^"']*["'])[^>]*>/,
  );
  assert.doesNotMatch(html, /<img\b[^>]*\bid=["']backgroundPreviewImage["']/);
  assert.match(updatePreviewBlock, /elements\.backgroundPreviewImage\.style\.backgroundColor\s*=/);
  assert.match(updatePreviewBlock, /elements\.backgroundPreviewImage\.style\.backgroundImage\s*=/);
  assert.doesNotMatch(updatePreviewBlock, /\.src\s*=|removeAttribute\s*\(\s*["']src["']/);
  assert.match(styles, /\.background-preview-visual\s*\{/);
});

test('keeps the URL field focused when adding a new site', () => {
  const openLinkDialogBlock = getCssBlock(script, /function\s+openLinkDialog\s*\(\s*link\s*=\s*null\s*\)/);
  const openDialogBlock = getCssBlock(
    script,
    /function\s+openDialog\s*\(\s*dialog\s*,\s*focusTarget\s*\)/,
  );

  assert.match(
    openLinkDialogBlock,
    /openDialog\s*\(\s*elements\.linkDialog\s*,\s*link\s*\?\s*elements\.linkTitle\s*:\s*elements\.linkUrl\s*\)\s*;/,
  );
  assert.match(openDialogBlock, /focusTarget\?\.focus\s*\(\s*\{\s*preventScroll\s*:\s*true\s*\}\s*\)\s*;/);
  assert.doesNotMatch(openDialogBlock, /requestAnimationFrame\s*\(/);
});

test('combines background and portable backup tools in accessible settings tabs', () => {
  assert.match(html, /id=["']addLinkButton["'][\s\S]*?<path\s+d=["']M12 5v14M5 12h14["']/);
  assert.match(
    html,
    /id=["']addFolderButton["'][\s\S]*?<path\s+d=["']M3 7\.5A2\.5 2\.5 0 0 1 5\.5 5H10l2 2h6\.5A2\.5 2\.5 0 0 1 21 9\.5v7A2\.5 2\.5 0 0 1 18\.5 19h-13A2\.5 2\.5 0 0 1 3 16\.5z["']/,
  );
  assert.match(
    html,
    /<button\b(?=[^>]*\bid=["']settingsButton["'])(?=[^>]*\btitle=["']Settings — S["'])(?=[^>]*\baria-label=["']Settings["'])[^>]*>[\s\S]*?M12 15\.5/,
  );
  assert.doesNotMatch(html, /id=["']backgroundButton["']/);
  assert.match(html, /<dialog\b[^>]*\bid=["']settingsDialog["']/);
  assert.match(html, /role=["']tablist["']/);
  assert.match(
    html,
    /id=["']backgroundSettingsTab["'][^>]*role=["']tab["'][^>]*aria-selected=["']true["'][^>]*aria-controls=["']backgroundSettingsPanel["']/,
  );
  assert.match(
    html,
    /id=["']backupSettingsTab["'][^>]*role=["']tab["'][^>]*aria-controls=["']backupSettingsPanel["']/,
  );
  assert.match(html, /id=["']backgroundSettingsPanel["'][^>]*role=["']tabpanel["']/);
  assert.match(html, /id=["']backupSettingsPanel["'][^>]*role=["']tabpanel["'][^>]*hidden/);
  assert.doesNotMatch(html, /data-background-mode|id=["']backgroundColor["']|id=["']backgroundColorPanel["']/);
  for (const id of [
    'backgroundPreview',
    'backgroundPreviewImage',
    'backgroundPreviewName',
    'backgroundImage',
    'backgroundOverlayColor',
    'backgroundOverlay',
    'resetBackgroundButton',
    'exportBackupButton',
    'importBackupInput',
    'importPreview',
    'importStatus',
    'importError',
    'confirmImportButton',
    'cancelImportButton',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /id=["']importBackupInput["'][^>]*accept=["']application\/json,\.json["']/);
  assert.match(styles, /\.settings-tabs\b/);
  assert.match(styles, /\.settings-tab\b/);
  assert.match(styles, /\.background-preview\b/);
  assert.match(styles, /\.backup-card\b/);
  assert.match(styles, /\.backup-preview\b/);
  assert.match(styles, /\.settings-error\b/);
  assert.doesNotMatch(styles, /\.background-mode\b/);
});

test('explains file requirements and keeps selected filenames visible', () => {
  assert.match(
    html,
    /id=["']backgroundImage["'][^>]*aria-describedby=["'][^"']*backgroundImageLimits[^"']*backgroundSelectedFile[^"']*backgroundImageError[^"']*["']/,
  );
  assert.match(
    html,
    /id=["']backgroundImageLimits["'][^>]*data-i18n=["']backgroundImageLimits["']/,
  );
  assert.match(
    html,
    /id=["']backgroundSelectedFile["'][^>]*role=["']status["'][^>]*hidden/,
  );
  assert.match(
    html,
    /id=["']importSelectedFile["'][^>]*role=["']status["'][^>]*hidden/,
  );
  assert.match(
    html,
    /id=["']resetBackgroundButton["'][^>]*data-i18n=["']restoreDefault["'][^>]*>Restore default<\/button>/,
  );

  assert.match(
    script,
    /backgroundSelectedFile\s*:\s*document\.getElementById\s*\(\s*["']backgroundSelectedFile["']\s*\)/,
  );
  assert.match(
    script,
    /importSelectedFile\s*:\s*document\.getElementById\s*\(\s*["']importSelectedFile["']\s*\)/,
  );
  assert.match(
    script,
    /elements\.backgroundImage\.addEventListener\s*\(\s*["']change["']\s*,\s*updatePendingBackgroundFile\s*\)/,
  );

  const backgroundSelectionBlock = getCssBlock(
    script,
    /function\s+updatePendingBackgroundFile\s*\(\s*\)/,
  );
  assert.match(backgroundSelectionBlock, /elements\.backgroundImage\.files\?\.\[0\]/);
  assert.match(backgroundSelectionBlock, /t\s*\(\s*["']backgroundSelectedFile["']\s*,\s*\[\s*file\.name\s*\]\s*\)/);
  assert.match(backgroundSelectionBlock, /elements\.backgroundSelectedFile\.hidden\s*=\s*false/);

  const loadImportBlock = getCssBlock(script, /async\s+function\s+loadImportFile\s*\(/);
  assert.match(loadImportBlock, /pendingImport\s*=\s*\{\s*\.\.\.result\s*,\s*fileName\s*:\s*file\.name\s*\}/);
  assert.match(loadImportBlock, /t\s*\(\s*["']importSelectedFile["']\s*,\s*\[\s*pendingImport\.fileName\s*\]\s*\)/);
  assert.match(loadImportBlock, /elements\.importSelectedFile\.hidden\s*=\s*false/);

  const previewNameRule = getCssBlock(styles, /\.background-preview\s+strong\s*(?=\{)/);
  assert.match(previewNameRule, /(?:^|;)\s*white-space\s*:\s*normal\s*(?:;|$)/);
  assert.match(previewNameRule, /(?:^|;)\s*overflow-wrap\s*:\s*anywhere\s*(?:;|$)/);
});

test('removes decorative movement when reduced motion is requested', () => {
  const reducedMotionBlock = getCssBlock(
    styles,
    /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/,
  );

  assert.match(reducedMotionBlock, /transition\s*:\s*none\s*!important/);
  assert.match(reducedMotionBlock, /animation\s*:\s*none\s*!important/);
  assert.match(reducedMotionBlock, /scroll-behavior\s*:\s*auto\s*!important/);
  assert.match(
    reducedMotionBlock,
    /\.link-card:hover[\s\S]*?\.icon-button:hover[\s\S]*?\.ghost-button:hover[\s\S]*?transform\s*:\s*none\s*!important/,
  );
});

test('stages portable imports and commits them before replacing application state', () => {
  assert.match(
    script,
    /import\s*\{[^}]*\bMAX_BACKUP_BYTES\b[^}]*\bbuildImportedState\b[^}]*\bgetBackupFilename\b[^}]*\bparseBackupText\b[^}]*\bserializeBackup\b[^}]*\}\s*from\s*["']\.\/backup-service\.mjs["']\s*;/s,
  );
  assert.match(
    script,
    /import\s*\{[^}]*\bnormalizeLegacyColorBackground\b[^}]*\}\s*from\s*["']\.\/newtab-core\.mjs["']\s*;/s,
  );
  assert.match(script, /function\s+setSettingsTab\s*\(/);
  assert.match(script, /aria-selected/);
  assert.match(script, /\.tabIndex\s*=/);
  assert.match(script, /function\s+openSettingsDialog\s*\(/);
  assert.match(script, /updateBackgroundPreview\s*\(\s*\)/);
  assert.match(script, /elements\.backgroundPreviewName\.textContent\s*=/);
  assert.match(script, /normalizeLegacyColorBackground\s*\(/);

  const backgroundSubmitBlock = getCssBlock(
    script,
    /elements\.backgroundForm\.addEventListener\s*\(\s*["']submit["']\s*,\s*async\s*\(\s*event\s*\)\s*=>/,
  );
  assert.match(backgroundSubmitBlock, /nextBackground\s*=/);
  assert.doesNotMatch(backgroundSubmitBlock, /activeBackgroundMode|backgroundColor/);

  const exportBlock = getCssBlock(script, /function\s+exportBackup\s*\(\s*\)/);
  assert.match(exportBlock, /serializeBackup\s*\(\s*state\s*\)/);
  assert.match(exportBlock, /new\s+Blob\s*\(/);
  assert.match(exportBlock, /getBackupFilename\s*\(/);
  assert.match(exportBlock, /URL\.revokeObjectURL\s*\(/);

  const loadImportBlock = getCssBlock(script, /async\s+function\s+loadImportFile\s*\(/);
  assert.match(loadImportBlock, /file\.size\s*>\s*MAX_BACKUP_BYTES[\s\S]*await\s+file\.text\s*\(\s*\)/);
  assert.match(loadImportBlock, /parseBackupText\s*\(/);
  assert.match(loadImportBlock, /pendingImport\s*=/);
  assert.doesNotMatch(loadImportBlock, /state\s*=/);

  const confirmBlock = getCssBlock(script, /async\s+function\s+confirmImport\s*\(\s*\)/);
  assert.match(confirmBlock, /buildImportedState\s*\(\s*latestState\s*,\s*importedData\s*\)/);
  assert.match(
    confirmBlock,
    /await\s+commitStateChange\s*\([\s\S]*if\s*\(\s*!saved\s*\)\s*return\s*;[\s\S]*resetImportState/,
  );
  assert.match(script, /elements\.settingsDialog\.addEventListener\s*\(\s*["']close["'][\s\S]*resetSettingsDialogState/);
});

test('renders folder chips inside an adaptive scroll track', () => {
  assert.match(
    html,
    /<nav\b(?=[^>]*\bclass\s*=\s*["'](?:[^"']*\s)?folder-row(?:\s[^"']*)?["'])(?=[^>]*\bid\s*=\s*["']folderRow["'])(?=[^>]*\baria-label\s*=\s*["']Folders["'])[^>]*>\s*<div\b(?=[^>]*\bclass\s*=\s*["'](?:[^"']*\s)?folder-row-track(?:\s[^"']*)?["'])(?=[^>]*\bid\s*=\s*["']folderRowTrack["'])[^>]*>\s*<\/div>\s*<\/nav>/s,
  );

  const viewportRule = getCssBlock(styles, /\.folder-row\s*(?=\{)/);
  assert.match(viewportRule, /(?:^|;)\s*overflow-x\s*:\s*auto\s*(?:;|$)/);
  assert.doesNotMatch(
    viewportRule,
    /(?:^|;)\s*justify-content\s*:\s*center\s*(?:;|$)/,
  );

  const trackRule = getCssBlock(styles, /\.folder-row-track\s*(?=\{)/);
  assert.match(trackRule, /(?:^|;)\s*width\s*:\s*max-content\s*(?:;|$)/);
  assert.match(trackRule, /(?:^|;)\s*min-width\s*:\s*100%\s*(?:;|$)/);
  assert.match(trackRule, /(?:^|;)\s*display\s*:\s*flex\s*(?:;|$)/);
  assert.match(
    trackRule,
    /(?:^|;)\s*justify-content\s*:\s*center\s*(?:;|$)/,
  );

  assert.match(
    script,
    /\bfolderRowTrack\s*:\s*document\.getElementById\s*\(\s*["']folderRowTrack["']\s*\)\s*,?/,
  );
  assert.match(
    script,
    /function\s+renderFolders\s*\(\s*\)\s*\{[\s\S]*?\belements\.folderRowTrack\.replaceChildren\s*\(\s*\.\.\.chips\s*\)\s*;/,
  );
  assert.match(
    script,
    /select\.setAttribute\s*\(\s*["']aria-pressed["']\s*,\s*String\s*\(\s*state\.selectedFolderId\s*===\s*id\s*\)\s*\)\s*;/,
  );
});

test('keeps folder scrolling usable and the active chip visible', () => {
  assert.match(
    script,
    /elements\.folderRow\.addEventListener\s*\(\s*["']scroll["']\s*,\s*updateFolderScrollState\s*,\s*\{\s*passive\s*:\s*true\s*\}\s*\)\s*;/,
  );
  assert.match(
    script,
    /elements\.folderRow\.addEventListener\s*\(\s*["']wheel["']\s*,\s*handleFolderWheel\s*,\s*\{\s*passive\s*:\s*false\s*\}\s*\)\s*;/,
  );
  assert.match(
    script,
    /\.focus\s*\(\s*\{\s*preventScroll\s*:\s*true\s*\}\s*\)\s*;/,
  );
  assert.doesNotMatch(script, /\bscrollIntoView\b/);
  assert.match(script, /\bgetFolderRevealScrollLeft\s*\(/);
  assert.match(
    script,
    /elements\.folderRow\.scrollTo\s*\(\s*\{[\s\S]*?\bleft\s*:/,
  );
  assert.match(
    script,
    /elements\.folderRow\.classList\.toggle\s*\(\s*["']can-scroll-left["']\s*,\s*canScrollLeft\s*\)\s*;/,
  );
  assert.match(
    script,
    /elements\.folderRow\.classList\.toggle\s*\(\s*["']can-scroll-right["']\s*,\s*canScrollRight\s*\)\s*;/,
  );
  assert.match(styles, /\.folder-row\.can-scroll-left\b/);
  assert.match(styles, /\.folder-row\.can-scroll-right\b/);
});

test('uses an internal vertical scroller to keep the background stable', () => {
  const htmlBodyRule = getCssBlock(styles, /html,\s*\nbody\s*(?=\{)/);
  const bodyRule = getCssBlock(styles, /body\s*(?=\{)/);
  const shellRule = getCssBlock(styles, /\.shell\s*(?=\{)/);
  const contentRule = getCssBlock(styles, /\.content\s*(?=\{)/);
  const imageRule = getCssBlock(styles, /body\.has-image\s*(?=\{)/);
  const cardRule = getCssBlock(styles, /\.link-card\s*(?=\{)/);
  const gridRule = getCssBlock(styles, /\.grid\s*(?=\{)/);

  assert.match(htmlBodyRule, /(?:^|;)\s*height\s*:\s*100%\s*(?:;|$)/);
  assert.match(htmlBodyRule, /(?:^|;)\s*overflow\s*:\s*hidden\s*(?:;|$)/);
  assert.match(bodyRule, /(?:^|;)\s*overscroll-behavior\s*:\s*none\s*(?:;|$)/);
  assert.match(shellRule, /(?:^|;)\s*height\s*:\s*100vh\s*(?:;|$)/);
  assert.match(shellRule, /(?:^|;)\s*--scroll-end-gap\s*:\s*54px\s*(?:;|$)/);
  assert.match(shellRule, /(?:^|;)\s*overflow\s*:\s*hidden\s*(?:;|$)/);
  assert.match(contentRule, /(?:^|;)\s*overflow-y\s*:\s*auto\s*(?:;|$)/);
  assert.match(contentRule, /(?:^|;)\s*overscroll-behavior-y\s*:\s*contain\s*(?:;|$)/);
  assert.match(contentRule, /(?:^|;)\s*min-height\s*:\s*0\s*(?:;|$)/);
  assert.match(
    contentRule,
    /(?:^|;)\s*padding\s*:\s*28px\s+var\(--shell-inline-space\)\s+18px\s*(?:;|$)/,
  );
  assert.match(gridRule, /padding-bottom\s*:\s*var\(--scroll-end-gap\)/);
  assert.doesNotMatch(styles, /\.shell::after\s*(?=\{)/);
  assert.doesNotMatch(imageRule, /background-attachment\s*:\s*fixed/);
  assert.match(cardRule, /(?:^|;)\s*content-visibility\s*:\s*auto\s*(?:;|$)/);
});

test('keeps navigation outside the card scroller without painting a full-width band', () => {
  const topbarRule = getCssBlock(styles, /\.topbar\s*(?=\{)/);
  const shellRule = getCssBlock(styles, /\.shell\s*(?=\{)/);

  assert.match(topbarRule, /(?:^|;)\s*position\s*:\s*relative\s*(?:;|$)/);
  assert.match(shellRule, /grid-template-rows\s*:\s*auto\s+minmax\(0,\s*1fr\)/);
  assert.match(topbarRule, /(?:^|;)\s*z-index\s*:\s*10\s*(?:;|$)/);
  assert.doesNotMatch(topbarRule, /(?:background|backdrop-filter|box-shadow)\s*:/);
});

test('keeps folder creation beside its action while only the folder list scrolls', () => {
  const folderListRule = getCssBlock(styles, /\.folder-list\s*(?=\{)/);
  const folderManagerRule = getCssBlock(styles, /\.folder-manager\s*(?=\{)/);
  const createInputIndex = html.indexOf('id="folderName"');
  const createButtonIndex = html.indexOf('id="createFolderSubmitButton"');
  const managerIndex = html.indexOf('id="folderManager"');

  assert.notEqual(createInputIndex, -1);
  assert.notEqual(createButtonIndex, -1);
  assert.notEqual(managerIndex, -1);
  assert.ok(createInputIndex < createButtonIndex && createButtonIndex < managerIndex);
  assert.match(styles, /\.folder-create-row\s*\{/);
  assert.match(folderManagerRule, /(?:^|;)\s*min-height\s*:\s*0\s*(?:;|$)/);
  assert.match(folderListRule, /(?:^|;)\s*max-height\s*:/);
  assert.match(folderListRule, /(?:^|;)\s*overflow-y\s*:\s*auto\s*(?:;|$)/);
});

test('uses a contextual empty message for all sites and individual folders', () => {
  const renderLinksBlock = getCssBlock(script, /function\s+renderLinks\s*\(\s*\)/);

  assert.match(renderLinksBlock, /state\.selectedFolderId\s*===\s*["']all["']/);
  assert.match(renderLinksBlock, /t\s*\(\s*["']emptyAll["']\s*\)/);
  assert.match(renderLinksBlock, /t\s*\(\s*["']emptyFolder["']/);
  assert.match(html, /id=["']emptyState["'][^>]*aria-live=["']polite["']/);
});

test('coalesces folder refresh work while preserving selection focus options', () => {
  const renderFoldersBlock = getCssBlock(script, /function\s+renderFolders\s*\(\s*\)/);
  const refreshBlock = getCssBlock(
    script,
    /function\s+refreshFolderScroll\s*\(\s*options\s*=\s*\{\}\s*\)/,
  );
  const scheduleBlock = getCssBlock(
    script,
    /function\s+scheduleFolderScrollRefresh\s*\(\s*options\s*=\s*\{\}\s*\)/,
  );

  assert.match(script, /folderFocusRequest\s*=\s*selectedFolderId\s*;/);
  assert.match(renderFoldersBlock, /scheduleFolderScrollRefresh\s*\(/);
  assert.doesNotMatch(renderFoldersBlock, /requestAnimationFrame\s*\(/);
  assert.doesNotMatch(refreshBlock, /requestAnimationFrame\s*\(/);
  assert.match(
    refreshBlock,
    /const\s+rowRect\s*=\s*elements\.folderRow\.getBoundingClientRect\s*\(\s*\)\s*;/,
  );
  assert.match(
    refreshBlock,
    /activeOffsetLeft\s*:\s*activeRect\.left\s*-\s*rowRect\.left\s*\+\s*elements\.folderRow\.scrollLeft/,
  );
  assert.match(scheduleBlock, /pendingFolderScrollOptions/);
  assert.match(
    scheduleBlock,
    /if\s*\(\s*folderScrollFrame\s*!==\s*null\s*\)\s*return\s*;/,
  );
  assert.match(
    scheduleBlock,
    /folderScrollFrame\s*=\s*requestAnimationFrame\s*\(/,
  );
});

test('stacks header controls before mobile card layout begins', () => {
  const headerBreakpoint = getCssBlock(
    styles,
    /@media\s*\(\s*max-width\s*:\s*1040px\s*\)/,
  );
  const responsiveTopbar = getCssBlock(headerBreakpoint, /\.topbar\s*(?=\{)/);
  const responsiveActions = getCssBlock(headerBreakpoint, /\.actions\s*(?=\{)/);
  const responsiveFolderRow = getCssBlock(
    headerBreakpoint,
    /\.folder-row\s*(?=\{)/,
  );

  assert.match(
    responsiveTopbar,
    /(?:^|;)\s*min-height\s*:\s*96px\s*(?:;|$)/,
  );
  assert.match(
    responsiveTopbar,
    /(?:^|;)\s*align-items\s*:\s*flex-end\s*(?:;|$)/,
  );
  assert.match(responsiveActions, /(?:^|;)\s*left\s*:\s*50%\s*(?:;|$)/);
  assert.match(
    responsiveActions,
    /(?:^|;)\s*transform\s*:\s*translateX\s*\(\s*-50%\s*\)\s*(?:;|$)/,
  );
  assert.match(
    responsiveFolderRow,
    /(?:^|;)\s*width\s*:\s*100%\s*(?:;|$)/,
  );

  const mobileBreakpoint = getCssBlock(
    styles,
    /@media\s*\(\s*max-width\s*:\s*760px\s*\)/,
  );
  assert.match(mobileBreakpoint, /\.grid\s*\{/);
  assert.doesNotMatch(mobileBreakpoint, /\.topbar\s*\{/);
  assert.doesNotMatch(mobileBreakpoint, /\.actions\s*\{/);
  assert.doesNotMatch(mobileBreakpoint, /\.folder-row\s*\{/);
  assert.match(
    mobileBreakpoint,
    /\.shell\s*\{[\s\S]*?--scroll-end-gap\s*:\s*34px\s*;/,
  );
});

test('renders accessible inline folder rename controls', () => {
  const renderFolderListBlock = getCssBlock(
    script,
    /function\s+renderFolderList\s*\(\s*\)/,
  );

  assert.match(
    script,
    /import\s*\{[^}]*\brenameFolder\b[^}]*\}\s*from\s*["']\.\/newtab-core\.mjs["']\s*;/s,
  );
  assert.match(script, /let\s+renamingFolderId\s*=\s*null\s*;/);
  assert.match(
    renderFolderListBlock,
    /renameButton\.dataset\.renameFolder\s*=\s*folder\.id\s*;/,
  );
  assert.match(
    renderFolderListBlock,
    /renameButton\.setAttribute\s*\(\s*["']aria-label["']\s*,\s*t\(\s*["']renameFolder["']\s*,\s*\[folder\.name\]\s*\)\s*\)\s*;/,
  );
  assert.match(
    renderFolderListBlock,
    /input\.dataset\.folderRenameInput\s*=\s*folder\.id\s*;/,
  );
  assert.match(
    renderFolderListBlock,
    /input\.setAttribute\s*\(\s*["']aria-label["']\s*,\s*t\(\s*["']newFolderName["']\s*,\s*\[folder\.name\]\s*\)\s*\)\s*;/,
  );
  assert.match(
    renderFolderListBlock,
    /saveButton\.dataset\.saveFolderRename\s*=\s*folder\.id\s*;/,
  );
  assert.match(
    renderFolderListBlock,
    /cancelButton\.dataset\.cancelFolderRename\s*=\s*folder\.id\s*;/,
  );
  assert.match(
    renderFolderListBlock,
    /dragButton\.disabled\s*=\s*isEditing\s*;/,
  );

  assert.match(styles, /\.folder-list-input\b/);
  assert.match(styles, /\.folder-list-rename\b/);
  assert.match(styles, /\.folder-list-save\b/);
  assert.match(styles, /\.folder-list-cancel\b/);
});

test('manages the inline folder rename lifecycle and focus', () => {
  const setControlsDisabledBlock = getCssBlock(
    script,
    /function\s+setFolderRenameControlsDisabled\s*\(\s*folderId\s*,\s*disabled\s*\)/,
  );
  const requestFocusBlock = getCssBlock(
    script,
    /function\s+requestFolderRenameFocus\s*\(\s*folderId\s*,\s*target\s*\)/,
  );
  const startRenameBlock = getCssBlock(
    script,
    /function\s+startFolderRename\s*\(\s*folderId\s*\)/,
  );
  const saveRenameBlock = getCssBlock(
    script,
    /async\s+function\s+saveFolderRename\s*\(\s*folderId\s*,\s*value\s*\)/,
  );
  const cancelRenameBlock = getCssBlock(
    script,
    /function\s+cancelFolderRename\s*\(\s*folderId\s*=\s*renamingFolderId\s*\)/,
  );
  const renderFolderListBlock = getCssBlock(
    script,
    /function\s+renderFolderList\s*\(\s*\)/,
  );
  const startFolderDragBlock = getCssBlock(
    script,
    /function\s+startFolderDrag\s*\(\s*event\s*\)/,
  );

  assert.match(script, /let\s+savingFolderRenameId\s*=\s*null\s*;/);
  assert.match(setControlsDisabledBlock, /querySelectorAll\s*\(\s*["']\[data-folder-id\]["']\s*\)/);
  assert.match(setControlsDisabledBlock, /\.dataset\.folderId\s*===\s*folderId/);
  assert.match(setControlsDisabledBlock, /querySelector\s*\(\s*["']\[data-folder-rename-input\]["']\s*\)/);
  assert.match(setControlsDisabledBlock, /querySelector\s*\(\s*["']\[data-save-folder-rename\]["']\s*\)/);
  assert.match(setControlsDisabledBlock, /querySelector\s*\(\s*["']\[data-cancel-folder-rename\]["']\s*\)/);
  assert.match(setControlsDisabledBlock, /control\.disabled\s*=\s*disabled\s*;/);
  assert.doesNotMatch(setControlsDisabledBlock, /CSS\.escape/);

  assert.match(requestFocusBlock, /folderRenameFocusRequest\s*=\s*\{\s*folderId\s*,\s*target\s*\}\s*;/);
  assert.match(startRenameBlock, /if\s*\(\s*savingFolderRenameId\s*!==\s*null\s*\)\s*return\s*;/);
  assert.match(startRenameBlock, /getUserFolders\s*\(\s*\)\.find\s*\(/);
  assert.match(startRenameBlock, /renamingFolderId\s*=\s*folder\.id\s*;/);
  assert.match(startRenameBlock, /requestFolderRenameFocus\s*\(\s*folder\.id\s*,\s*["']input["']\s*\)\s*;/);
  assert.match(startRenameBlock, /renderFolderList\s*\(\s*\)\s*;/);

  assert.match(
    saveRenameBlock,
    /^\s*if\s*\(\s*savingFolderRenameId\s*!==\s*null\s*\|\|\s*folderId\s*!==\s*renamingFolderId\s*\)\s*return\s+false\s*;/,
  );
  assert.match(saveRenameBlock, /const\s+result\s*=\s*renameFolder\s*\(\s*state\.folders\s*,\s*folderId\s*,\s*value\s*\)\s*;/);
  assert.match(saveRenameBlock, /if\s*\(\s*!result\.renamed\s*\)/);
  assert.match(saveRenameBlock, /requestFolderRenameFocus\s*\(\s*folderId\s*,\s*["']input["']\s*\)\s*;/);
  assert.match(
    saveRenameBlock,
    /const\s+result\s*=\s*renameFolder\s*\([\s\S]*?if\s*\(\s*!result\.renamed\s*\)[\s\S]*?savingFolderRenameId\s*=\s*folderId\s*;/,
  );
  assert.match(
    saveRenameBlock,
    /savingFolderRenameId\s*=\s*folderId\s*;[\s\S]*setFolderRenameControlsDisabled\s*\(\s*folderId\s*,\s*true\s*\)\s*;[\s\S]*try\s*\{[\s\S]*await\s+commitStateChange\s*\([\s\S]*latestState\.folders\s*=\s*latestResult\.folders\s*;[\s\S]*finally\s*\{[\s\S]*savingFolderRenameId\s*=\s*null\s*;[\s\S]*setFolderRenameControlsDisabled\s*\(\s*folderId\s*,\s*false\s*\)\s*;/,
  );
  assert.match(saveRenameBlock, /if\s*\(\s*elements\.folderDialog\.open\s*\)/);
  assert.equal(saveRenameBlock.match(/await\s+commitStateChange\s*\(/g)?.length, 1);
  assert.match(saveRenameBlock, /return\s+true\s*;/);

  assert.match(
    cancelRenameBlock,
    /if\s*\(\s*savingFolderRenameId\s*!==\s*null\s*&&\s*folderId\s*===\s*savingFolderRenameId\s*\)\s*return\s*;/,
  );
  assert.match(cancelRenameBlock, /renamingFolderId\s*=\s*null\s*;/);
  assert.match(cancelRenameBlock, /requestFolderRenameFocus\s*\(\s*folderId\s*,\s*["']button["']\s*\)\s*;/);
  assert.match(cancelRenameBlock, /renderFolderList\s*\(\s*\)\s*;/);

  assert.match(
    renderFolderListBlock,
    /elements\.folderList\.replaceChildren\s*\(\s*\.\.\.rows\s*\)\s*;[\s\S]*folderRenameFocusRequest\s*=\s*null\s*;/,
  );
  assert.match(renderFolderListBlock, /\.dataset\.folderRenameInput\s*===\s*focusRequest\.folderId/);
  assert.match(renderFolderListBlock, /\.dataset\.renameFolder\s*===\s*focusRequest\.folderId/);
  assert.doesNotMatch(renderFolderListBlock, /CSS\.escape/);
  assert.match(
    renderFolderListBlock,
    /if\s*\(\s*!focusRequest\s*\|\|\s*!elements\.folderDialog\.open\s*\)\s*return\s*;/,
  );
  assert.match(renderFolderListBlock, /focusTarget\?\.focus\s*\(\s*\{\s*preventScroll\s*:\s*true\s*\}\s*\)\s*;/);
  assert.match(renderFolderListBlock, /focusTarget\?\.select\s*\(\s*\)\s*;/);

  assert.match(
    script,
    /elements\.folderList\.addEventListener\s*\(\s*["']click["']\s*,\s*async\s*\(\s*event\s*\)\s*=>\s*\{[\s\S]*?data-rename-folder[\s\S]*?startFolderRename[\s\S]*?return\s*;[\s\S]*?data-save-folder-rename[\s\S]*?folder-list-item[\s\S]*?folder-rename-input[\s\S]*?await\s+saveFolderRename[\s\S]*?return\s*;[\s\S]*?data-cancel-folder-rename[\s\S]*?cancelFolderRename[\s\S]*?return\s*;[\s\S]*?data-delete-folder/,
  );
  assert.match(
    script,
    /elements\.folderList\.addEventListener\s*\(\s*["']keydown["']\s*,\s*async\s*\(\s*event\s*\)\s*=>\s*\{[\s\S]*?event\.key\s*===\s*["']Enter["'][\s\S]*?event\.preventDefault\s*\(\s*\)[\s\S]*?await\s+saveFolderRename[\s\S]*?event\.key\s*===\s*["']Escape["'][\s\S]*?event\.preventDefault\s*\(\s*\)[\s\S]*?cancelFolderRename/,
  );
  assert.match(
    script,
    /elements\.folderDialog\.addEventListener\s*\(\s*["']close["']\s*,\s*\(\s*\)\s*=>\s*\{[\s\S]*?renamingFolderId\s*=\s*null\s*;[\s\S]*?folderRenameFocusRequest\s*=\s*null\s*;/,
  );
  assert.match(startFolderDragBlock, /if\s*\(\s*!handle\s*\|\|\s*handle\.disabled\s*\|\|/);
});
