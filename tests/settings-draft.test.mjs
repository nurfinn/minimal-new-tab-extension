import assert from 'node:assert/strict';
import test from 'node:test';
import { createSettingsDraft, restoreDefaultBackground } from '../settings-draft.mjs';

const defaultBackground = {
  type: 'image', value: 'images/default-background.png', overlay: 0, overlayColor: '#17122b',
};

test('editing a settings draft never mutates the application background or shortcuts', () => {
  const state = {
    background: { type: 'color', value: '#457b9d', overlay: 12, overlayColor: '#000000' },
    shortcutsEnabled: false,
  };
  const draft = createSettingsDraft(state, defaultBackground);
  draft.background.overlay = 75;
  draft.background.value = '#ffffff';
  draft.shortcutsEnabled = true;
  assert.deepEqual(state, {
    background: { type: 'color', value: '#457b9d', overlay: 12, overlayColor: '#000000' },
    shortcutsEnabled: false,
  });
  assert.equal(draft.imageFile, null);
});

test('a custom background draft retains local asset identity without changing availability', () => {
  const state = {
    background: { ...defaultBackground, customAssetId: 'device-image', customAssetAvailable: false },
    shortcutsEnabled: true,
  };
  const draft = createSettingsDraft(state, defaultBackground);
  assert.equal(draft.background.customAssetId, 'device-image');
  assert.equal(draft.background.customAssetAvailable, false);
  assert.notEqual(draft.background, state.background);
});

test('restoring default edits only the draft and preserves the current shortcut choice', () => {
  const state = {
    background: { type: 'image', value: 'data:image/png;base64,abc', overlay: 50,
      overlayColor: '#fff000', customAssetId: 'device-image', customAssetAvailable: true },
    shortcutsEnabled: false,
  };
  const draft = createSettingsDraft(state, defaultBackground);
  draft.imageFile = { name: 'new-image.png' };
  const reset = restoreDefaultBackground(draft, defaultBackground);
  assert.deepEqual(reset, { background: defaultBackground, shortcutsEnabled: false, imageFile: null });
  assert.equal(state.background.customAssetId, 'device-image');
  assert.equal(draft.imageFile.name, 'new-image.png');
  reset.background.overlay = 10;
  assert.equal(defaultBackground.overlay, 0);
});

test('a fresh draft can fall back to defaults without sharing their object', () => {
  const draft = createSettingsDraft({}, defaultBackground);
  assert.deepEqual(draft, { background: defaultBackground, shortcutsEnabled: true, imageFile: null });
  draft.background.overlayColor = '#ffffff';
  assert.equal(defaultBackground.overlayColor, '#17122b');
});
