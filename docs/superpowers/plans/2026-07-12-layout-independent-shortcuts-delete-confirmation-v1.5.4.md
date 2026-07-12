# v1.5.4 Layout-independent Shortcuts and Delete Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `A`, `F`, and `S` work from every keyboard layout and replace unreliable browser confirmation prompts with one accessible in-extension delete dialog.

**Architecture:** Keep shortcut mapping in the pure `newtab-core.mjs` helper and pass `KeyboardEvent.code` from `newtab.js`, falling back to `key` only when a code is unavailable. Add one reusable `<dialog>` whose promise-based controller returns a boolean to the existing site and folder deletion flows, leaving state mutation and persistence unchanged.

**Tech Stack:** Manifest V3, vanilla JavaScript ES modules, HTML `<dialog>`, CSS, Chrome extension i18n, Node.js built-in test runner.

## Global Constraints

- Release version is `1.5.4`.
- Add no permissions.
- Do not change icons, storage schema, synchronization, backgrounds, favicons, or import/export.
- Preserve all existing shortcut guards for modifiers, repeat events, editable controls, and open dialogs.
- Use one shared confirmation dialog for both sites and folders.
- Remove all browser-global `confirm` calls.

---

### Task 1: Layout-independent shortcut mapping

**Files:**
- Modify: `tests/newtab-core.test.mjs:78-105`
- Modify: `newtab-core.mjs:33-61`
- Modify: `newtab.js:1162-1178`
- Modify: `tests/ui-contract.test.mjs:128-166`

**Interfaces:**
- Consumes: `KeyboardEvent.code`, `KeyboardEvent.key`, and the existing guard flags.
- Produces: `getGlobalShortcutAction({ code, key, ...guards }) -> 'add-site' | 'add-folder' | 'settings' | null`.

- [ ] **Step 1: Write failing unit and UI contract tests**

```js
test('maps physical A, F, and S keys independently of the active layout', () => {
  assert.equal(getGlobalShortcutAction({ code: 'KeyA', key: 'ф' }), 'add-site');
  assert.equal(getGlobalShortcutAction({ code: 'KeyF', key: 'а' }), 'add-folder');
  assert.equal(getGlobalShortcutAction({ code: 'KeyS', key: 'ы' }), 'settings');
  assert.equal(getGlobalShortcutAction({ code: 'KeyX', key: 'ч' }), null);
});

test('uses event.key only when a physical code is unavailable', () => {
  assert.equal(getGlobalShortcutAction({ key: 'a' }), 'add-site');
  assert.equal(getGlobalShortcutAction({ key: 'F' }), 'add-folder');
  assert.equal(getGlobalShortcutAction({ code: 'KeyX', key: 'a' }), null);
});
```

Add a UI contract assertion that `handleGlobalShortcut` passes `code: event.code` and `key: event.key`.

- [ ] **Step 2: Run the focused tests and verify the new tests fail**

Run:

```bash
node --test tests/newtab-core.test.mjs tests/ui-contract.test.mjs
```

Expected: failures show Cyrillic key values are not mapped through `KeyboardEvent.code` and `event.code` is not passed by `newtab.js`.

- [ ] **Step 3: Implement the physical-code mapping**

```js
export function getGlobalShortcutAction({
  code,
  key,
  ctrlKey = false,
  metaKey = false,
  altKey = false,
  shiftKey = false,
  repeat = false,
  isEditable = false,
  isDialogOpen = false,
} = {}) {
  if (ctrlKey || metaKey || altKey || shiftKey || repeat || isEditable || isDialogOpen) {
    return null;
  }

  const shortcutByCode = {
    KeyA: 'add-site',
    KeyF: 'add-folder',
    KeyS: 'settings',
  };
  if (code) return shortcutByCode[code] || null;

  return {
    a: 'add-site',
    f: 'add-folder',
    s: 'settings',
  }[String(key || '').toLowerCase()] || null;
}
```

Pass `code: event.code` alongside `key: event.key` in `handleGlobalShortcut`.

- [ ] **Step 4: Run focused tests and verify they pass**

Run:

```bash
node --test tests/newtab-core.test.mjs tests/ui-contract.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the shortcut fix**

```bash
git add newtab-core.mjs newtab.js tests/newtab-core.test.mjs tests/ui-contract.test.mjs
git commit -m "Fix shortcuts across keyboard layouts"
```

---

### Task 2: Shared in-extension delete confirmation

**Files:**
- Modify: `newtab.html:47-110`
- Modify: `styles.css:520-570, 940-1002`
- Modify: `newtab.js:80-130, 150-435, 1320-1380`
- Modify: `_locales/en/messages.json`
- Modify: `_locales/ru/messages.json`
- Modify: `i18n-service.mjs:1-75`
- Modify: `tests/i18n-service.test.mjs`
- Modify: `tests/ui-contract.test.mjs`

**Interfaces:**
- Consumes: a localized deletion message from the existing `t(...)` translator.
- Produces: `requestDeleteConfirmation(message) -> Promise<boolean>` and `resolveDeleteConfirmation(confirmed) -> void`.

- [ ] **Step 1: Write failing i18n and UI contract tests**

Add `confirmDeletion` to the English, Russian, and fallback catalogs. Add contract assertions for:

```js
assert.match(html, /id=["']deleteConfirmDialog["']/);
assert.match(html, /aria-describedby=["']deleteConfirmMessage["']/);
assert.match(html, /id=["']confirmDeleteButton["']/);
assert.doesNotMatch(script, /\bconfirm\s*\(/);
assert.match(script, /function\s+requestDeleteConfirmation\s*\(/);
assert.match(script, /function\s+resolveDeleteConfirmation\s*\(/);
```

Assert that site and folder handlers await `requestDeleteConfirmation(...)` before their existing mutation and `saveAndRender()` calls. Assert that Delete resolves `true`, Cancel, dialog cancellation, dialog close, and backdrop click resolve `false`.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
node --test tests/i18n-service.test.mjs tests/ui-contract.test.mjs
```

Expected: failures report the missing localized key and missing shared confirmation dialog/controller.

- [ ] **Step 3: Add the localized reusable dialog**

Add the following structure after the site editor dialog:

```html
<dialog class="modal confirmation-modal" id="deleteConfirmDialog"
        aria-labelledby="deleteConfirmTitle" aria-describedby="deleteConfirmMessage">
  <div class="modal-inner">
    <header class="modal-header">
      <h2 id="deleteConfirmTitle" data-i18n="confirmDeletion">Confirm deletion</h2>
      <button class="ghost-button" type="button" data-cancel-delete-confirm
              aria-label="Close" data-i18n-aria-label="close">
        <svg class="icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="m6 6 12 12M18 6 6 18"></path>
        </svg>
      </button>
    </header>
    <p class="confirmation-message" id="deleteConfirmMessage"></p>
    <footer class="modal-actions confirmation-actions">
      <button class="text-button" type="button" data-cancel-delete-confirm data-i18n="cancel">Cancel</button>
      <button class="danger-button" id="confirmDeleteButton" type="button" data-i18n="delete">Delete</button>
    </footer>
  </div>
</dialog>
```

Add `confirmDeletion` as `Confirm deletion` in English and `Подтвердите удаление` in Russian. Add minimal `.confirmation-modal`, `.confirmation-message`, and `.confirmation-actions` rules using the existing modal and button styles.

- [ ] **Step 4: Implement the promise controller and replace `window.confirm`**

Cache the dialog elements, add `let pendingDeleteConfirmation = null`, and bind these paths:

```js
elements.confirmDeleteButton.addEventListener('click', () => resolveDeleteConfirmation(true));
elements.cancelDeleteConfirmButtons.forEach((button) => {
  button.addEventListener('click', () => resolveDeleteConfirmation(false));
});
elements.deleteConfirmDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  resolveDeleteConfirmation(false);
});
elements.deleteConfirmDialog.addEventListener('close', () => {
  resolveDeleteConfirmation(false);
});
elements.deleteConfirmDialog.addEventListener('click', (event) => {
  if (event.target === elements.deleteConfirmDialog) resolveDeleteConfirmation(false);
});
```

Implement:

```js
function requestDeleteConfirmation(message) {
  if (pendingDeleteConfirmation) return Promise.resolve(false);
  elements.deleteConfirmMessage.textContent = message;

  return new Promise((resolve) => {
    pendingDeleteConfirmation = resolve;
    elements.deleteConfirmDialog.showModal();
    elements.confirmDeleteButton.focus({ preventScroll: true });
  });
}

function resolveDeleteConfirmation(confirmed) {
  const resolve = pendingDeleteConfirmation;
  if (!resolve) return;

  pendingDeleteConfirmation = null;
  if (elements.deleteConfirmDialog.open) elements.deleteConfirmDialog.close();
  resolve(Boolean(confirmed));
}
```

Replace each `confirm(...)` call with `await requestDeleteConfirmation(...)`. Keep mutation after the awaited boolean and retain the current `await saveAndRender()` order.

- [ ] **Step 5: Run focused tests and verify they pass**

Run:

```bash
node --test tests/i18n-service.test.mjs tests/ui-contract.test.mjs
```

Expected: all focused tests pass and no browser-global confirmation call remains.

- [ ] **Step 6: Commit the confirmation fix**

```bash
git add newtab.html styles.css newtab.js i18n-service.mjs _locales/en/messages.json _locales/ru/messages.json tests/i18n-service.test.mjs tests/ui-contract.test.mjs
git commit -m "Replace browser delete confirmations"
```

---

### Task 3: v1.5.4 release verification and packaging

**Files:**
- Modify: `manifest.json`
- Modify: `backup-service.mjs`
- Modify: `README.md`
- Modify: `tests/manifest.test.mjs`
- Modify: `tests/backup-service.test.mjs`
- Create: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/minimal-new-tab-extension-v1.5.4-store/`
- Create: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/v1.5.4-store.zip`

**Interfaces:**
- Consumes: completed v1.5.4 source files and the existing Store package allowlist.
- Produces: a validated `1.5.4` manifest and clean Chrome Web Store ZIP.

- [ ] **Step 1: Write failing release-version tests**

Change the manifest and backup expectations from `1.5.3` to `1.5.4` before changing production files.

- [ ] **Step 2: Run release tests and verify they fail**

Run:

```bash
node --test tests/manifest.test.mjs tests/backup-service.test.mjs
```

Expected: actual version `1.5.3` does not equal expected `1.5.4`.

- [ ] **Step 3: Bump production version and README**

Set `manifest.json` and the backup `appVersion` default to `1.5.4`. Update the README heading, version line, layout-independent shortcut wording, and in-extension deletion confirmation feature note.

- [ ] **Step 4: Run the complete automated test suite**

Run:

```bash
node --test tests/*.test.mjs
```

Expected: every test passes with zero failures.

- [ ] **Step 5: Run browser smoke checks**

Serve the extension over localhost with the existing demo harness. Through Chrome DevTools Protocol, dispatch `{ code: 'KeyA', key: 'ф' }`, `{ code: 'KeyF', key: 'а' }`, and `{ code: 'KeyS', key: 'ы' }`; verify the correct dialog opens and focus lands on its expected control. Open a site editor, click Delete, verify the in-extension confirmation appears, cancel once, reopen it, confirm once, and verify exactly one site disappears with no runtime exceptions.

- [ ] **Step 6: Build and validate the clean Store package**

Copy only `_locales`, `icons`, `images/default-background.png`, `manifest.json`, `newtab.html`, `styles.css`, `newtab.js`, `newtab-core.mjs`, `storage-service.mjs`, `i18n-service.mjs`, and `backup-service.mjs`. Create `v1.5.4-store.zip` with macOS metadata excluded, then run:

```bash
unzip -t /Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/v1.5.4-store.zip
unzip -Z1 /Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/v1.5.4-store.zip
```

Expected: archive integrity passes, manifest version is `1.5.4`, permissions remain exactly `storage` and `favicon`, and no tests, docs, `.git`, `.DS_Store`, `__MACOSX`, or AppleDouble files are present.

- [ ] **Step 7: Commit the release metadata**

```bash
git add manifest.json backup-service.mjs README.md tests/manifest.test.mjs tests/backup-service.test.mjs
git commit -m "Release Minimal New Tab v1.5.4"
```
