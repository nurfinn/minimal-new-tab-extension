// A settings session owns a copy of lightweight application settings.
// DOM, image decoding, object URLs and persistence belong to the caller.
export function createSettingsDraft(state, defaultBackground) {
  return {
    background: structuredClone(state.background || defaultBackground),
    shortcutsEnabled: state.shortcutsEnabled !== false,
    imageFile: null,
  };
}

export function restoreDefaultBackground(draft, defaultBackground) {
  return {
    ...draft,
    background: structuredClone(defaultBackground),
    imageFile: null,
  };
}
