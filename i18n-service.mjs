export const ENGLISH_FALLBACKS = Object.freeze({
  appName: 'Minimal New Tab by nurfinn',
  appShortName: 'Minimal Tab',
  appDescription: 'A minimal new tab with favorite sites, folders, backgrounds, and portable backups.',
  foldersNav: 'Folders',
  actionsNav: 'Actions',
  addSite: 'Add site',
  addSiteShortcut: 'Add site — A',
  createFolder: 'Create folder',
  createFolderShortcut: 'Create folder — F',
  settings: 'Settings',
  settingsShortcut: 'Settings — S',
  emptyState: 'Add your first site with the + button.',
  addSiteDialog: 'Add site',
  editSiteDialog: 'Edit site',
  close: 'Close',
  titleLabel: 'Name',
  optional: 'optional',
  titlePlaceholder: 'Generated from the address',
  urlLabel: 'Address',
  folderLabel: 'Folder',
  delete: 'Delete',
  cancel: 'Cancel',
  add: 'Add',
  save: 'Save',
  foldersDialog: 'Folders',
  newFolderLabel: 'New folder',
  folderPlaceholder: 'Work',
  folderList: 'Folder list',
  create: 'Create',
  settingsDialog: 'Settings',
  settingsSections: 'Settings sections',
  backgroundTab: 'Background',
  backupTab: 'Import and export',
  currentBackground: 'Current background',
  standardImage: 'Standard image',
  customImage: 'Custom image',
  missingLocalBackground: 'Standard image — local background is unavailable',
  imageLabel: 'Image',
  overlayColor: 'Overlay color',
  opacity: 'Opacity',
  reset: 'Reset',
  exportTitle: 'Export',
  exportDescription: 'Save sites, folders, and their order to a JSON file. The background stays in this browser.',
  downloadFile: 'Download file',
  importTitle: 'Import',
  importDescription: 'Import replaces the current sites and folders. The background settings stay unchanged.',
  chooseJsonFile: 'Choose a JSON file',
  importPreviewTitle: 'What will be imported',
  backupDate: 'Backup date',
  sitesCount: 'Sites',
  foldersCount: 'Folders',
  cancelImport: 'Cancel import',
  replaceCurrentData: 'Replace current data',
  favoriteFolder: 'Favorites',
  allFolders: 'All',
  noFolder: 'No folder',
  siteFallback: 'Site',
  deleteSiteConfirm: 'Delete “$1”?',
  deleteFolderConfirm: 'Delete folder “$1”? Its sites will stay in the general list.',
  drag: 'Drag',
  dragFolder: 'Drag folder $1',
  newFolderName: 'New name for folder $1',
  saveFolderName: 'Save the name of folder $1',
  cancelFolderRename: 'Cancel renaming folder $1',
  renameFolder: 'Rename folder $1',
  deleteFolder: 'Delete folder $1',
  dragSite: 'Drag $1',
  edit: 'Edit',
  editSite: 'Edit $1',
  exportSuccess: 'Settings file saved.',
  exportError: 'Could not prepare the settings file.',
  backupTooLargeDetailed: 'The file is too large. Choose a settings file up to 1 MB.',
  fileReadError: 'Could not read the selected file.',
  importSaveError: 'Could not save the imported data. Current settings were not changed.',
  importSuccess: 'Sites and folders imported. The current background was preserved.',
  importFileTooLarge: 'The file is too large.',
  unsupportedBackup: 'This settings file version is not supported.',
  invalidBackupData: 'The data in this file is damaged or incomplete.',
  invalidBackupJson: 'The selected file is not a valid settings JSON file.',
  storageReadWarning: 'Could not read synchronized settings.',
  storageSaveWarning: 'Could not save synchronized settings.',
  backgroundImageError: 'Choose a valid image up to 3 MB and 4096 px per side.',
  backgroundInvalidType: 'Choose an image file.',
  backgroundTooLarge: 'The image must be 3 MB or smaller.',
  backgroundDimensionsTooLarge: 'The image must be no larger than 4096 px per side.',
  backgroundDecodeFailed: 'This image could not be opened.',
  backgroundSaveFailed: 'Could not save this image. Choose a smaller file and try again.',
});

export function createTranslator({ getMessage = defaultGetMessage, fallbacks = ENGLISH_FALLBACKS } = {}) {
  return (id, substitutions = []) => {
    const values = Array.isArray(substitutions) ? substitutions : [substitutions];
    let localized = '';
    try {
      localized = getMessage?.(id, values) || '';
    } catch {
      localized = '';
    }
    return localized || formatFallback(fallbacks[id], values) || id;
  };
}

export function localizeDocument(root, translate, locale = 'en') {
  root.documentElement.lang = String(locale || 'en').replace('_', '-');
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = translate(element.dataset.i18n);
  });
  for (const [selector, datasetKey, attribute] of [
    ['[data-i18n-title]', 'i18nTitle', 'title'],
    ['[data-i18n-aria-label]', 'i18nAriaLabel', 'aria-label'],
    ['[data-i18n-placeholder]', 'i18nPlaceholder', 'placeholder'],
  ]) {
    root.querySelectorAll(selector).forEach((element) => {
      element.setAttribute(attribute, translate(element.dataset[datasetKey]));
    });
  }
}

export function getUiLocale(getMessage = defaultGetMessage) {
  try {
    return getMessage?.('@@ui_locale') || 'en';
  } catch {
    return 'en';
  }
}

function defaultGetMessage(id, substitutions) {
  return globalThis.chrome?.i18n?.getMessage?.(id, substitutions) || '';
}

function formatFallback(template, substitutions) {
  if (!template) return '';
  return substitutions.reduce(
    (value, substitution, index) => value.replaceAll(`$${index + 1}`, String(substitution)),
    template,
  );
}
