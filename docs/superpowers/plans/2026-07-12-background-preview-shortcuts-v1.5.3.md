# Background, Preview, Attribution, and Shortcuts v1.5.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release v1.5.3 with the supplied bundled default background, reliable custom-background persistence, a preview that cannot display a broken-image marker, attributed `by nurfinn` traffic, and guarded `A`/`F`/`S` shortcuts.

**Architecture:** Keep synchronized state and local background storage unchanged. Validate custom files at a conservative 3 MiB and 4096 px per side, persist a candidate state before mutating live UI state, and render the preview through CSS rather than an `<img>`. Isolate shortcut decision logic as a pure helper in `newtab-core.mjs`; the UI only translates DOM state into helper arguments and invokes existing buttons.

**Tech Stack:** Chrome Extension Manifest V3, JavaScript ES modules, `chrome.storage.sync`, `chrome.storage.local`, Node.js built-in test runner.

## Global Constraints

- Do not add OAuth, backend, analytics, import/export changes, or new permissions.
- Keep custom background bytes in `chrome.storage.local`; never put them in sync.
- Use `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/bg_for_product_presentation.png` as the bundled default background.
- Custom uploads must be at most 3 MiB and 4096 px per side.
- A failed background write must preserve the previous application state and keep Settings open with an error.
- Shortcuts are plain `A`, `F`, and `S`; ignore them for editable targets, open dialogs, repeats, and any modifier.
- Release version is `1.5.3`.

---

### Task 1: Honest custom-background validation and transactional persistence

**Files:**
- Modify: `newtab-core.mjs`
- Modify: `newtab.js`
- Modify: `_locales/en/messages.json`
- Modify: `_locales/ru/messages.json`
- Test: `tests/newtab-core.test.mjs`
- Test: `tests/ui-contract.test.mjs`

**Interfaces:**
- Produces: `MAX_BACKGROUND_BYTES = 3 * 1024 * 1024` and `MAX_BACKGROUND_DIMENSION = 4096`.
- Produces: `showBackgroundImageError("save-failed")` mapped to localized `backgroundSaveFailed` copy.

- [ ] **Step 1: Write failing tests for 3 MiB, 4096 px, and non-mutating failed saves**

```js
assert.deepEqual(validateBackgroundImage({
  type: 'image/webp', size: 3 * 1024 * 1024, width: 4096, height: 4096,
}), { ok: true });
assert.deepEqual(validateBackgroundImage({
  type: 'image/png', size: 3 * 1024 * 1024 + 1,
}), { ok: false, error: 'file-too-large' });
assert.match(backgroundSubmitBlock, /const\s+nextState\s*=\s*\{[\s\S]*background\s*:\s*nextBackground/);
assert.match(backgroundSubmitBlock, /if\s*\(\s*!saveResult\.ok\s*\)[\s\S]*showBackgroundImageError\s*\(\s*["']save-failed["']/);
```

- [ ] **Step 2: Run the focused tests and confirm they fail for the old limits and mutation order**

Run: `node --test tests/newtab-core.test.mjs tests/ui-contract.test.mjs`

Expected: failures referencing the old 5 MiB / 10,000 px boundaries and missing transactional save block.

- [ ] **Step 3: Implement the conservative limits and candidate-state save**

```js
const nextState = { ...state, background: nextBackground };
const saveResult = await storageService.save(nextState);
if (!saveResult.ok) {
  showBackgroundImageError('save-failed');
  return;
}
state = nextState;
render();
```

Add localized copy explaining that the image could not be stored and a smaller file should be selected.

- [ ] **Step 4: Run focused tests and confirm they pass**

Run: `node --test tests/newtab-core.test.mjs tests/ui-contract.test.mjs`

Expected: all focused tests pass.

### Task 2: Bundled default image and robust CSS preview surface

**Files:**
- Create: `images/default-background.png`
- Modify: `newtab.html`
- Modify: `newtab.js`
- Modify: `styles.css`
- Test: `tests/ui-contract.test.mjs`

**Interfaces:**
- Produces: default background `{ type: "image", value: "images/default-background.png", overlay: 0, overlayColor: "#17122b" }`.
- Produces: `#backgroundPreviewImage` as a non-image preview surface controlled by `style.backgroundColor` and `style.backgroundImage`.

- [ ] **Step 1: Write failing UI contract tests for the bundled image and non-`img` preview**

```js
assert.match(html, /<div[^>]*id=["']backgroundPreviewImage["']/);
assert.doesNotMatch(html, /<img[^>]*id=["']backgroundPreviewImage["']/);
assert.match(script, /value\s*:\s*["']images\/default-background\.png["']/);
assert.match(updatePreviewBlock, /style\.backgroundImage/);
assert.doesNotMatch(updatePreviewBlock, /\.src\s*=|removeAttribute\s*\(\s*["']src/);
```

- [ ] **Step 2: Run the UI contract test and verify the old `<img>` implementation fails**

Run: `node --test tests/ui-contract.test.mjs`

Expected: failures for the `<img>` preview and solid default state.

- [ ] **Step 3: Copy the supplied PNG and implement CSS-only preview rendering**

```js
function updateBackgroundPreview() {
  const hasImage = state.background.type === 'image' && Boolean(state.background.value);
  elements.backgroundPreviewImage.style.backgroundColor = hasImage ? '' : state.background.value;
  elements.backgroundPreviewImage.style.backgroundImage = hasImage
    ? `url("${state.background.value}")`
    : '';
}
```

Set the main background fallback color from `overlayColor` when the default state is an image.

- [ ] **Step 4: Run UI and storage tests**

Run: `node --test tests/ui-contract.test.mjs tests/storage-service.test.mjs`

Expected: all tests pass and default descriptors still exclude image bytes from sync.

### Task 3: UTM attribution and guarded keyboard shortcuts

**Files:**
- Modify: `newtab-core.mjs`
- Modify: `newtab.html`
- Modify: `newtab.js`
- Modify: `_locales/en/messages.json`
- Modify: `_locales/ru/messages.json`
- Test: `tests/newtab-core.test.mjs`
- Test: `tests/i18n-service.test.mjs`
- Test: `tests/ui-contract.test.mjs`

**Interfaces:**
- Produces: `getGlobalShortcutAction(input): "add-site" | "add-folder" | "settings" | null`.
- Consumes: `{ key, ctrlKey, metaKey, altKey, shiftKey, repeat, isEditable, isDialogOpen }`.

- [ ] **Step 1: Write failing shortcut and attribution tests**

```js
assert.equal(getGlobalShortcutAction({ key: 'a' }), 'add-site');
assert.equal(getGlobalShortcutAction({ key: 'f' }), 'add-folder');
assert.equal(getGlobalShortcutAction({ key: 's' }), 'settings');
assert.equal(getGlobalShortcutAction({ key: 'a', isEditable: true }), null);
assert.equal(getGlobalShortcutAction({ key: 'a', isDialogOpen: true }), null);
assert.equal(getGlobalShortcutAction({ key: 'a', metaKey: true }), null);
assert.match(html, /https:\/\/nurfinn\.com\/\?utm_source=minimal_new_tab_extension&amp;utm_medium=referral/);
```

- [ ] **Step 2: Run focused tests and verify the helper and markup are missing**

Run: `node --test tests/newtab-core.test.mjs tests/i18n-service.test.mjs tests/ui-contract.test.mjs`

Expected: failures for missing export, missing `aria-keyshortcuts`, and the old URL.

- [ ] **Step 3: Implement the pure shortcut helper and DOM adapter**

```js
function handleGlobalShortcut(event) {
  const action = getGlobalShortcutAction({
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat,
    isEditable: isEditableTarget(event.target),
    isDialogOpen: Boolean(document.querySelector('dialog[open]')),
  });
  const button = {
    'add-site': elements.addLinkButton,
    'add-folder': elements.addFolderButton,
    settings: elements.settingsButton,
  }[action];
  if (!button) return;
  event.preventDefault();
  button.click();
}
```

Add `aria-keyshortcuts="A"`, `"F"`, and `"S"`; use localized shortcut-aware titles while preserving concise aria labels.

- [ ] **Step 4: Run focused tests and confirm they pass**

Run: `node --test tests/newtab-core.test.mjs tests/i18n-service.test.mjs tests/ui-contract.test.mjs`

Expected: all focused tests pass.

### Task 4: Release packaging and full verification

**Files:**
- Modify: `manifest.json`
- Modify: `README.md`
- Modify: `tests/manifest.test.mjs`
- Create: `../minimal-new-tab-extension-v1.5.3-store/`
- Create: `../v1.5.3-store.zip`

**Interfaces:**
- Produces: unpacked and zipped Chrome Web Store artifacts for version `1.5.3`.

- [ ] **Step 1: Write the failing manifest version assertion**

```js
assert.equal(manifest.version, '1.5.3');
```

- [ ] **Step 2: Run the manifest test and verify it fails on `1.5.2`**

Run: `node --test tests/manifest.test.mjs`

Expected: version mismatch failure.

- [ ] **Step 3: Bump the manifest and README, then rebuild the clean Store folder and ZIP**

Include only manifest, locales, modules, HTML, CSS, icons, and `images/default-background.png`; exclude tests, docs, `.git`, and `.DS_Store`.

- [ ] **Step 4: Run complete automated verification**

Run: `node --test tests/*.test.mjs`

Expected: zero failures.

- [ ] **Step 5: Perform browser smoke checks**

Verify fresh install default background, color-safe preview, custom image save/reload, failed-save feedback, `A`/`F`/`S` guards, UTM link, and no console errors.

- [ ] **Step 6: Verify package contents and version**

Run: `unzip -t ../v1.5.3-store.zip`

Expected: no archive errors, manifest version `1.5.3`, default image included, and no development files.
