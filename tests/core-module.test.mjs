import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import {
  buildFaviconSources,
  getFolderRevealScrollLeft,
  getFolderScrollState,
  getFolderWheelScrollLeft,
  getWheelScrollDelta,
  renameFolder,
} from '../newtab-core.mjs';

const coreUrl = new URL('../newtab-core.mjs', import.meta.url);
const storageServiceUrl = new URL('../storage-service.mjs', import.meta.url);

test('new tab core module exists', () => {
  assert.equal(existsSync(coreUrl), true);
});

test('sync storage service module exists', () => {
  assert.equal(existsSync(storageServiceUrl), true);
});

test('new tab core module exports helper functions', () => {
  assert.equal(typeof buildFaviconSources, 'function');
  assert.equal(typeof getFolderScrollState, 'function');
  assert.equal(typeof getWheelScrollDelta, 'function');
});

test('new tab core module exports folder scroll geometry helpers', () => {
  assert.equal(typeof getFolderRevealScrollLeft, 'function');
  assert.equal(typeof getFolderWheelScrollLeft, 'function');
});

test('new tab core module exports the folder rename helper', () => {
  assert.equal(typeof renameFolder, 'function');
});
