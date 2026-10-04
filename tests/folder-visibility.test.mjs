import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../newtab-core.mjs';
import { getAdjacentFolderId } from '../folder-gestures.mjs';

function fixture(overrides = {}) {
  return {
    folders: [{ id: 'root' }, { id: 'work' }, { id: 'personal' }],
    links: [{ id: 'site', folderId: 'work' }],
    selectedFolderId: 'all',
    ...overrides,
  };
}

test('All stays visible by default without exposing the internal root', () => {
  assert.equal(typeof core.getVisibleFolderIds, 'function');
  assert.deepEqual(core.getVisibleFolderIds(fixture()), ['all', 'work', 'personal']);
});

test('hidden All leaves only ordered user folders unless there are unfiled sites', () => {
  assert.deepEqual(core.getVisibleFolderIds(fixture({ showAllFolder: false })), ['work', 'personal']);
  assert.deepEqual(core.getVisibleFolderIds(fixture({ showAllFolder: false,
    links: [{ id: 'unfiled', folderId: 'root' }] })), ['work', 'personal', 'root']);
});

test('no user folders always leaves a usable All view, even with no sites', () => {
  const state = fixture({ folders: [{ id: 'root' }], links: [], showAllFolder: false });
  assert.deepEqual(core.getVisibleFolderIds(state), ['all']);
  assert.equal(core.normalizeFolderNavigation(state).showAllFolder, true);
  assert.equal(core.normalizeFolderNavigation(state).selectedFolderId, 'all');
});

test('hiding selected All resolves to the first visible folder without changing data', () => {
  const state = fixture({ showAllFolder: false, background: { value: 'custom' } });
  const before = structuredClone(state);
  const normalized = core.normalizeFolderNavigation(state);
  assert.equal(normalized.selectedFolderId, 'work');
  assert.deepEqual(state, before);
  assert.equal(normalized.links, state.links);
  assert.equal(normalized.folders, state.folders);
  assert.equal(normalized.background, state.background);
});

test('visibility preserves an existing selection and repairs deleted or empty root selections', () => {
  assert.equal(core.normalizeFolderNavigation(fixture({ showAllFolder: false,
    selectedFolderId: 'personal' })).selectedFolderId, 'personal');
  assert.equal(core.normalizeFolderNavigation(fixture({ showAllFolder: false,
    selectedFolderId: 'deleted' })).selectedFolderId, 'work');
  assert.equal(core.normalizeFolderNavigation(fixture({ showAllFolder: false,
    selectedFolderId: 'root' })).selectedFolderId, 'work');
  assert.equal(core.normalizeFolderNavigation(fixture({ showAllFolder: false,
    selectedFolderId: 'root', links: [{ folderId: 'root' }] })).selectedFolderId, 'root');
  assert.equal(core.normalizeFolderNavigation(fixture({ selectedFolderId: 'root',
    links: [{ folderId: 'root' }] })).selectedFolderId, 'all');
});

test('unusable optional visibility values safely default to showing All', () => {
  for (const value of [undefined, null, 'false', 0, [], {}]) {
    const state = core.normalizeFolderNavigation(fixture({ showAllFolder: value }));
    assert.equal(state.showAllFolder, true);
    assert.equal(state.selectedFolderId, 'all');
  }
});

test('swipes use exactly the visible IDs and stop at boundaries, including unfiled sites', () => {
  const state = fixture({ showAllFolder: false, links: [{ folderId: 'root' }] });
  const ids = ['work', 'personal', 'root'];
  assert.equal(getAdjacentFolderId(state.folders, 'work', -1, ids), null);
  assert.equal(getAdjacentFolderId(state.folders, 'personal', -1, ids), 'work');
  assert.equal(getAdjacentFolderId(state.folders, 'personal', 1, ids), 'root');
  assert.equal(getAdjacentFolderId(state.folders, 'root', 1, ids), null);
  assert.equal(getAdjacentFolderId(state.folders, 'root', -1, ids), 'personal');
  assert.equal(getAdjacentFolderId(state.folders, 'all', 1, ids), null);
});
