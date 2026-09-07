# Minimal New Tab UI/UX Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confirmed state-loss and false-success paths, then complete the audited keyboard, accessibility, browser-parity, and long-list improvements without redesigning Minimal New Tab.

**Architecture:** `storage-service.mjs` gains one atomic application-state mutation boundary that loads the latest valid state under a same-origin lock, applies a plain state transform, and commits through the existing chunk/manifest mechanism. `newtab.js` routes mutations through that boundary and owns only normal application state and presentation feedback. Pure reorder/validation helpers live in `newtab-core.mjs`; HTML/CSS/i18n changes remain additive and localized.

**Tech Stack:** Manifest V3 extension pages, browser/chrome storage APIs, native Web Locks when available, plain ES modules, CSS, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-07-ui-ux-remediation-design.md`

## Global Constraints

- Preserve the current visual concept and the three existing top-level action icons.
- Keep `storageVersion: 1` and the current sync chunk/manifest/backup format.
- UI code must not know about chunks, generations, or manifests.
- Keep custom background bytes in `storage.local`; never persist favicon data.
- Keep Firefox network favicons opt-in and Chrome/Firefox release isolation.
- No OAuth, backend, analytics, search, new theme controls, third settings tab, version bump, release archive, push, or merge.
- Every production behavior change follows red → green → refactor and ends with the named verification command.

---

### Task 1: Atomic latest-state mutations and truthful save results

**Files:**
- Modify: `storage-service.mjs`
- Modify: `newtab.js`
- Modify: `newtab.html`
- Modify: `styles.css`
- Modify: `_locales/en/messages.json`
- Modify: `_locales/ru/messages.json`
- Test: `tests/storage-service.test.mjs`
- Test: `tests/ui-contract.test.mjs`

**Interfaces:**
- Produces: `storageService.update(defaultState, transform) -> Promise<{ok, changed, state?, error?}>`.
- Produces: `commitStateChange(transform, { errorTarget? } = {}) -> Promise<boolean>` in `newtab.js`.
- Consumes: existing `load`, `saveSnapshot`, payload validation, local-background handling.

- [x] **Step 1: Write failing storage tests.** Add two services over one real `FakeStorageArea`; load both at 72/known sites, add through A, then select a folder through stale B using `update`. Assert the new site remains. Add a shared fake lock and an update read-error test that asserts no write occurs.

```js
const added = await serviceA.update(defaults, latest => {
  latest.links.unshift(site);
  return latest;
});
const selected = await serviceB.update(defaults, latest => {
  latest.selectedFolderId = 'work';
  return latest;
});
assert.equal(selected.state.links.some(item => item.id === site.id), true);
```

- [x] **Step 2: Run `node --test tests/storage-service.test.mjs` and verify failure because `update` is absent.**
- [x] **Step 3: Implement `update`.** Queue it per service, acquire `navigator.locks.request('minimal-new-tab-state', ...)` when available, call the internal load function inside the lock, transform a structured clone, save it, and return only the committed state. A read error returns without writing; a thrown transform returns `mutation-failed`.
- [x] **Step 4: Run the storage tests and verify green.**
- [x] **Step 5: Write failing UI contract tests** asserting all user mutations use `commitStateChange`, failed form writes keep forms open, and a visible `role="alert"` app status exists.
- [x] **Step 6: Route add/edit/delete, folder select/create/rename/delete, pointer reorder, background save/reset, and import through `commitStateChange`.** Each transform finds records by stable ID against the freshly loaded state. Only success clears input or closes a dialog. Add a dismissing global status element for non-form failures.
- [x] **Step 7: Run `node --test tests/storage-service.test.mjs tests/ui-contract.test.mjs` and verify green.**
- [x] **Step 8: Commit task files with `git commit -m "fix: prevent stale tabs from overwriting saved state"`.**

### Task 2: Inline validation that matches persisted limits

**Files:**
- Modify: `newtab-core.mjs`
- Modify: `newtab.js`
- Modify: `newtab.html`
- Modify: `styles.css`
- Modify: `_locales/en/messages.json`
- Modify: `_locales/ru/messages.json`
- Test: `tests/newtab-core.test.mjs`
- Test: `tests/ui-contract.test.mjs`

**Interfaces:**
- Produces: `validateSiteDraft({title, url}) -> {ok:true,url}|{ok:false,field,error}`.
- Produces: `validateFolderName(value) -> {ok:true,name}|{ok:false,error}`.
- Constants: `SITE_TITLE_MAX_LENGTH = 500`, `FOLDER_NAME_MAX_LENGTH = 200`.

- [x] **Step 1: Write failing tests** for `https://`, `javascript:`, empty folder, 200/201-char folder names, and 500/501-char site titles.
- [x] **Step 2: Run `node --test tests/newtab-core.test.mjs` and confirm failures name the missing exports.**
- [x] **Step 3: Implement the pure validators** using `normalizeWebUrl`; add matching `maxlength` attributes, inline error nodes with stable IDs, `aria-describedby`, and `aria-invalid` updates.
- [x] **Step 4: Keep invalid drafts intact, focus the field, and clear an error on corrected input.** Localize concise English and Russian messages.
- [x] **Step 5: Run `node --test tests/newtab-core.test.mjs tests/ui-contract.test.mjs` and verify green.**
- [x] **Step 6: Commit with `git commit -m "fix: explain invalid site and folder input"`.**

### Task 3: Dialog semantics and safer deletion focus

**Files:**
- Modify: `newtab.html`
- Modify: `newtab.js`
- Test: `tests/ui-contract.test.mjs`

**Interfaces:**
- Consumes: visible heading IDs.
- Produces: named `linkDialog`, `folderDialog`, and `settingsDialog`; initial confirmation focus on Cancel.

- [x] **Step 1: Write failing contract tests** for `aria-labelledby` on all primary dialogs and a stable cancel-button ID.
- [x] **Step 2: Run `node --test tests/ui-contract.test.mjs` and confirm expected failure.**
- [x] **Step 3: Add heading IDs and relationships; focus Cancel in `requestDeleteConfirmation`; preserve focus restoration after cancel/confirm.**
- [x] **Step 4: Run the contract tests and verify green.**
- [x] **Step 5: Commit with `git commit -m "fix: name dialogs and default destructive focus to cancel"`.**

### Task 4: Keyboard reordering and optional single-key shortcuts

**Files:**
- Modify: `newtab-core.mjs`
- Modify: `newtab.js`
- Modify: `newtab.html`
- Modify: `storage-service.mjs`
- Modify: `styles.css`
- Modify: `_locales/en/messages.json`
- Modify: `_locales/ru/messages.json`
- Test: `tests/newtab-core.test.mjs`
- Test: `tests/storage-service.test.mjs`
- Test: `tests/ui-contract.test.mjs`

**Interfaces:**
- Produces: `moveItemByDelta(ids, id, delta) -> {ids, moved, position}`.
- Produces: optional application property `shortcutsEnabled`, persisted as optional `preferences.singleKeyShortcuts`; absence reads as `true`.
- Produces: polite live-region announcements for new order.

- [ ] **Step 1: Write failing helper tests** for left/right site moves, boundary no-op, up/down folder moves, and retained focus position.
- [ ] **Step 2: Write failing storage tests** proving old payloads default to enabled and the optional preference round-trips without changing `storageVersion`.
- [ ] **Step 3: Run the three target test files and confirm failures.**
- [ ] **Step 4: Implement ArrowLeft/ArrowRight on site drag handles and ArrowUp/ArrowDown on folder handles.** Prevent default only when a move is possible, persist with `commitStateChange`, restore focus by ID, and announce “Moved X to position Y of Z”.
- [ ] **Step 5: Add a compact checkbox in the existing Background panel.** Default on; when off, A/F/S do nothing. Keep the physical-key layout logic and existing button icons.
- [ ] **Step 6: Run target tests and verify green.**
- [ ] **Step 7: Commit with `git commit -m "feat: add keyboard ordering and shortcut control"`.**

### Task 5: Browser parity, useful favicons, long-name access, and image contrast

**Files:**
- Modify: `favicon-service.mjs`
- Modify: `newtab.js`
- Modify: `styles.css`
- Modify: `firefox/platform.css`
- Test: `tests/newtab-core.test.mjs`
- Test: `tests/ui-contract.test.mjs`
- Test: `tests/firefox-platform-styles.test.mjs`
- Test: `tests/firefox-isolation.test.mjs`

**Interfaces:**
- Produces: Chrome favicon sources ordered Google hostname → Chrome `/_favicon/`; no persisted favicon data.
- Produces: explicit shared `body`/folder font baseline and accessible full-name tooltip behavior.

- [ ] **Step 1: Change existing tests first** to expect Google before Chrome and Firefox folder labels to equal the shared 12px Chrome baseline; run and observe red.
- [ ] **Step 2: Implement provider order and remove the Firefox 16px override.** Keep the fallback letter visible until `isUsableFavicon` accepts a result.
- [ ] **Step 3: Add failing UI/CSS tests** for full title/host exposure and image-mode card variables that meet 4.5:1 on a white background.
- [ ] **Step 4: Add `title`/accessible full labels and raise the dark image-card surface opacity while retaining the current blur/radius/spacing.**
- [ ] **Step 5: Run the four target files and verify green, including Chrome byte-isolation tests.**
- [ ] **Step 6: Commit with `git commit -m "fix: align browser typography and site recognition"`.**

### Task 6: Long-list navigation, folder manager, and empty states

**Files:**
- Modify: `newtab.html`
- Modify: `newtab.js`
- Modify: `styles.css`
- Modify: `_locales/en/messages.json`
- Modify: `_locales/ru/messages.json`
- Test: `tests/ui-contract.test.mjs`

**Interfaces:**
- Produces: sticky `.topbar`; internally scrolling `.folder-list`; contextual `emptyAll` / `emptyFolder` copy.

- [ ] **Step 1: Write failing contracts** for sticky header structure, bounded folder manager scrolling, and two empty-state messages.
- [ ] **Step 2: Run `node --test tests/ui-contract.test.mjs` and confirm red.**
- [ ] **Step 3: Make the topbar sticky with a subtle backdrop that uses current variables.** Preserve folder-track horizontal scrolling and the existing 54/34px end gaps.
- [ ] **Step 4: Keep New folder and Create adjacent/sticky while `.folder-list` scrolls; update the empty-state text according to selected folder.**
- [ ] **Step 5: Run the contract tests and verify green.**
- [ ] **Step 6: Commit with `git commit -m "fix: keep actions and folder creation reachable"`.**

### Task 7: Background and import feedback, reduced motion

**Files:**
- Modify: `newtab.html`
- Modify: `newtab.js`
- Modify: `styles.css`
- Modify: `_locales/en/messages.json`
- Modify: `_locales/ru/messages.json`
- Test: `tests/ui-contract.test.mjs`
- Test: `tests/newtab-core.test.mjs`

**Interfaces:**
- Produces: visible background limits, pending background filename, parsed import filename, wrapping fallback message, explicit “Restore default”.

- [ ] **Step 1: Write failing UI tests** for pre-selection limits, pending filename, import filename, reset copy, wrapping preview text, and reduced-motion overrides for transforms/transitions.
- [ ] **Step 2: Run target tests and confirm red.**
- [ ] **Step 3: Add localized helper/status elements.** Keep the file input clearable, but store the parsed filename in `pendingImport`; distinguish Current background from Selected for saving.
- [ ] **Step 4: Make Restore default use the same committed-success behavior as other mutations.** On failure, keep Settings open and show the error.
- [ ] **Step 5: Extend reduced-motion CSS to cards and controls without removing focus indicators.**
- [ ] **Step 6: Run target tests and verify green.**
- [ ] **Step 7: Commit with `git commit -m "fix: clarify background and backup feedback"`.**

### Task 8: Full browser and release verification

**Files:**
- Modify only if verification uncovers a regression; return to the failing task's red-green cycle first.

**Interfaces:**
- Consumes: all prior task deliverables.
- Produces: verified Chrome/Firefox working tree, no release archive or version change.

- [ ] **Step 1: Run `node --test tests/*.test.mjs`; expected 0 failures.**
- [ ] **Step 2: Run Chrome and Firefox build scripts to temporary output paths; inspect allowlists and ensure Chrome/Firefox isolation tests pass.**
- [ ] **Step 3: Browser-smoke Chrome in an isolated profile:** add/edit/delete, folder create/rename/delete, pointer and keyboard reorder, invalid URL, 201-char folder, simulated storage failure where feasible, two already-open tabs, reload, 72 sites/24 folders, white background, missing local background, export/import.
- [ ] **Step 4: Browser-smoke Firefox in an isolated temporary installation:** EN/RU, folder size vs Chrome, local icon, letter fallback, settings disclosure, keyboard reorder, import filename, narrow 500px window.
- [ ] **Step 5: Inspect accepted screenshots and accessibility tree; run axe as a supplement, not a compliance claim.**
- [ ] **Step 6: Run `git status --short`, `git diff --check`, and a final full test suite.**
- [ ] **Step 7: Use `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`; do not push or merge without the user's instruction.**
