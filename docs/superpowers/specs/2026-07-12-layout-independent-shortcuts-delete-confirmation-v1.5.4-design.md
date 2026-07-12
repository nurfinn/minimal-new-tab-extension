# v1.5.4 Layout-independent shortcuts and delete confirmation

## Goal

Fix two interaction bugs without changing storage architecture or the main new-tab layout:

- `A`, `F`, and `S` must work from any keyboard layout.
- Deleting a site or folder must use a reliable in-extension confirmation instead of `window.confirm`.

## Shortcut behavior

`getGlobalShortcutAction` will prefer the physical keyboard code (`KeyA`, `KeyF`, or `KeyS`) and retain `event.key` as a compatibility fallback. This makes the actions independent of the active language layout while preserving current behavior in synthetic and older keyboard events.

The existing guards remain unchanged: shortcuts do not run with modifiers, during key repeat, while editing a field, or while any dialog is open. `newtab.js` passes both `event.code` and `event.key` to the pure helper; UI buttons and icons remain unchanged.

## Delete confirmation

One reusable native HTML `<dialog>` will be added to `newtab.html`. It contains a localized message, Cancel, and a destructive Delete button. The dialog is controlled by a small promise-based function in `newtab.js` so site and folder flows receive a simple boolean result and do not know about dialog internals.

Opening confirmation stores only the pending promise resolver, updates the localized message, opens the dialog, and focuses Delete. Delete resolves `true`; Cancel, the close button, backdrop cancellation, or `Escape` resolve `false`. Cleanup runs exactly once and clears the pending resolver so repeated clicks cannot perform two deletions.

The existing mutation and persistence order stays intact: confirmation first, then state mutation, then `saveAndRender`. No data-schema or storage-service changes are required.

## Accessibility and failure handling

- The message is associated with the dialog through `aria-describedby`.
- Delete remains a real button and is keyboard reachable.
- Cancel and `Escape` never mutate state.
- A second confirmation request cannot replace an unresolved request.
- No browser-global `confirm` call remains in the extension.

## Testing

Unit tests will cover Cyrillic `event.key` values paired with `KeyA`, `KeyF`, and `KeyS`, the compatibility fallback, and all existing shortcut guards.

UI contract tests will verify the shared confirmation dialog, localized controls, promise resolution paths, removal of `window.confirm`, and continued persistence after confirmed site and folder deletion. Browser smoke testing will exercise shortcut behavior with Cyrillic key values and both Cancel/Delete paths. The full test suite and clean Chrome Web Store package validation will run before completion.

## Release and scope

This is patch release `1.5.4`. It adds no permissions and does not change icons, storage schema, synchronization, backgrounds, favicons, import/export, or the rest of the interface.
