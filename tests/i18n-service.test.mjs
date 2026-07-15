import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ENGLISH_FALLBACKS,
  createTranslator,
  getUiLocale,
  localizeDocument,
} from '../i18n-service.mjs';

const [english, russian] = await Promise.all([
  readFile(new URL('../_locales/en/messages.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../_locales/ru/messages.json', import.meta.url), 'utf8').then(JSON.parse),
]);

test('English and Russian catalogs cover the same complete message set', () => {
  const englishKeys = Object.keys(english).sort();
  const russianKeys = Object.keys(russian).sort();

  assert.deepEqual(englishKeys, russianKeys);
  assert.deepEqual(englishKeys, Object.keys(ENGLISH_FALLBACKS).sort());
  for (const key of [
    'appName',
    'appShortName',
    'appDescription',
    'addSite',
    'addSiteShortcut',
    'createFolder',
    'createFolderShortcut',
    'settings',
    'settingsShortcut',
    'backgroundTab',
    'backupTab',
    'exportTitle',
    'importTitle',
    'save',
    'cancel',
    'close',
    'delete',
    'confirmDeletion',
    'backgroundImageError',
    'backgroundSaveFailed',
  ]) {
    assert.ok(english[key]?.message);
    assert.ok(russian[key]?.message);
  }
});

test('translator prefers Chrome messages and formats an English fallback', () => {
  const translate = createTranslator({
    getMessage(id) {
      return id === 'settings' ? 'Настройки' : '';
    },
  });

  assert.equal(translate('settings'), 'Настройки');
  assert.equal(translate('confirmDeletion'), 'Confirm deletion');
  assert.equal(translate('deleteSiteConfirm', ['Example']), 'Delete “Example”?');
  assert.equal(translate('missingMessage'), 'missingMessage');
});

test('default localization prefers the Firefox browser namespace', () => {
  const originalBrowser = Object.getOwnPropertyDescriptor(globalThis, 'browser');
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const calls = [];

  Object.defineProperty(globalThis, 'browser', {
    configurable: true,
    value: {
      i18n: {
        getMessage(id) {
          calls.push(`browser:${id}`);
          return id === '@@ui_locale' ? 'ru' : id === 'settings' ? 'Настройки Firefox' : '';
        },
      },
    },
  });
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      i18n: {
        getMessage(id) {
          calls.push(`chrome:${id}`);
          return 'Chrome message';
        },
      },
    },
  });

  try {
    assert.equal(createTranslator()('settings'), 'Настройки Firefox');
    assert.equal(getUiLocale(), 'ru');
    assert.deepEqual(calls, ['browser:settings', 'browser:@@ui_locale']);
  } finally {
    restoreGlobal('browser', originalBrowser);
    restoreGlobal('chrome', originalChrome);
  }
});

test('localizes text and supported attributes while setting the document language', () => {
  const elements = {
    '[data-i18n]': [{ dataset: { i18n: 'settings' }, textContent: '' }],
    '[data-i18n-title]': [makeAttributeElement({ i18nTitle: 'settings' })],
    '[data-i18n-aria-label]': [makeAttributeElement({ i18nAriaLabel: 'close' })],
    '[data-i18n-placeholder]': [makeAttributeElement({ i18nPlaceholder: 'titlePlaceholder' })],
  };
  const root = {
    documentElement: { lang: '' },
    querySelectorAll(selector) {
      return elements[selector] || [];
    },
  };

  localizeDocument(root, (id) => `translated:${id}`, 'ru_RU');

  assert.equal(root.documentElement.lang, 'ru-RU');
  assert.equal(elements['[data-i18n]'][0].textContent, 'translated:settings');
  assert.equal(elements['[data-i18n-title]'][0].attributes.title, 'translated:settings');
  assert.equal(elements['[data-i18n-aria-label]'][0].attributes['aria-label'], 'translated:close');
  assert.equal(
    elements['[data-i18n-placeholder]'][0].attributes.placeholder,
    'translated:titlePlaceholder',
  );
});

function makeAttributeElement(dataset) {
  return {
    dataset,
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

function restoreGlobal(name, descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    delete globalThis[name];
  }
}
