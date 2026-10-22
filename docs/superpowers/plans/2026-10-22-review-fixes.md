# Review fixes implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all seven reproduced defects from the October 17 review without changing the released version or users' installations.

**Architecture:** Keep the existing vanilla UI, transactional storage, protected feature generations and portable backup format. Bind asynchronous form work to its originating dialog, preserve drafts during background refreshes, read fresh backups, and make storage recovery/capacity safe before publishing new generations.

**Tech Stack:** JavaScript ES modules, Node tests, Playwright Chromium/Firefox, WebExtension storage and Web Locks.

**Spec:** `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/archive/checks/code-review-2026-10-17/REVIEW.md` (findings 1–7 and saved reproductions).

## Global constraints

- Work in the existing clean linked worktree on `codex/review-fixes-20261022`, based on `493f8ab`.
- Preserve the dirty historical checkout, personal profiles, published ZIPs and release folders.
- Do not bump version 1.7, publish to stores, or change the product-focused README.
- Preserve 1.6/1.7 compatibility, emoji/All visibility protection, and local background recovery.
- Commit coherent tested changes; push the branch and open a PR after verification (user authorized).
- Implement inline, with one independent whole-branch review before handoff.

## Review focus

- A delayed save finishes after Cancel/close/reopen: no unrelated record or new draft may change.
- A background refresh while typing a folder rename: preserve text, selection and focus.
- A read or partial write fails: never export defaults as a successful backup or delete referenced generations.
- An already-large collection needs a shrinking edit: recovery must not require adding more data first.
- Two tabs act in either order: a new explicit selection works, a truly older deferred selection does not overwrite newer input.

### Task 1: Protect open forms (findings 1–2)

**Files:** `newtab.js`, `scripts/verify-review-regressions.mjs`, browser baseline if required.
**Interfaces:** Existing `commitStateChange(transform, options)` and `render()` remain; dialog operations capture immutable record/session identity, folder controls preserve live drafts.

- [ ] Add browser tests using synthetic shared storage and controlled delayed reads: Alpha save followed by opening Beta must update only Alpha and leave Beta's draft open; failed old save must not alter the new form; background selection persistence must preserve the chosen folder and inline rename text/focus.
- [ ] Run `PLAYWRIGHT_MODULE=... node scripts/verify-review-regressions.mjs forms`; expected RED on the original defects in Chromium and Firefox.
- [ ] Capture save identity/session and scope completion/errors to that session; preserve form selection and rename DOM during background refresh.
- [ ] Run forms regressions and `node --test tests/*.test.mjs`; expected all pass.
- [ ] Commit `fix: preserve site and folder drafts during asynchronous saves`.

### Task 2: Export current complete collections (findings 3, 7)

**Files:** `newtab.js`, `backup-service.mjs`, `tests/backup-service.test.mjs`, `scripts/verify-review-regressions.mjs`.
**Interfaces:** `exportBackup()` becomes async and uses the queued storage snapshot; `serializeBackup`/`parseBackupText` remain synchronous and round-trip all collections supported by sync storage, within the 1 MiB file bound.

- [ ] Add tests: second tab adds/edits a site before first-tab export; failed snapshot read produces no download; 101 folders round-trip; collections exceeding the former site-count cap round-trip if byte-bounded; oversize files still fail.
- [ ] Run new tests against original behavior; expected stale/missing backup and count-limit failures.
- [ ] Read fresh confirmed data for export with update lifecycle protection; align backup validation with the byte bound instead of incompatible arbitrary collection counts.
- [ ] Run backup tests, `verify-review-regressions.mjs backups`, and full Node suite; expected pass.
- [ ] Commit `fix: export fresh complete collections across tabs`.

### Task 3: Recover storage and reserve edit capacity (findings 4–5)

**Files:** `storage-service.mjs`, `tests/storage-recovery-capacity.test.mjs`, related storage tests and error translations if needed.
**Interfaces:** Existing `load/save/update` result contracts and core storage version 1 remain. Before staging, recovery uses fresh validated references under the mutation lock; capacity checks cover future edits, not just the first write.

- [ ] Add tests reproducing nine rejected manifest writes on 80 sites, restart then rename/delete; repeated edits on 300 short sites; oversized initial/import save must either remain editable or be rejected before replacing valid data.
- [ ] Add fault coverage for partial head writes, unavailable reads/removals, unknown metadata, local background preservation, and a shrinking edit from an existing large state.
- [ ] Run `node --test tests/storage-recovery-capacity.test.mjs`; expected RED on orphan accumulation and peak capacity.
- [ ] Reclaim only safe unreferenced staging; compact superseded recovery generations only with a verified current snapshot and durable references; reject unmaintainable new states before publication with a clear capacity error. Never remove the sole valid current generation to fit a write.
- [ ] Run all storage/mixed-version/background tests and the complete Node suite; expected pass.
- [ ] Commit `fix: recover failed sync writes and reserve safe edit capacity`.

### Task 4: Respect new selection from stale tabs (finding 6)

**Files:** `newtab.js`, `scripts/verify-review-regressions.mjs`, `scripts/verify-folder-gestures.mjs`, targeted storage metadata tests if needed.
**Interfaces:** Keep immediate visual navigation and debounced persistence. Track action ordering independently of the stale selected-folder baseline.

- [ ] Add both event orders: tab A commits Work then stale tab B clicks Personal (Personal wins); tab A queues an older swipe then tab B makes a newer selection (newer wins). Include deletion/hidden-folder fallback and multiple rapid local gestures.
- [ ] Run `verify-review-regressions.mjs navigation`; expected RED for the stale-tab click.
- [ ] Replace the stale-ID conflict heuristic with explicit ordering of selection intents; preserve coalescing, retry and existing gesture recognition.
- [ ] Run new navigation checks, folder-gesture suite and Node suite; expected pass.
- [ ] Commit `fix: preserve latest folder selection across tabs`.

### Task 5: Verify and deliver

**Files:** CI test entry if needed; verification report in `docs/`; no store artifacts.
**Interfaces:** Browser suites build to isolated temporary folders and use clean profiles.

- [ ] Run complete Node suite and settings, emoji, gestures, app-status, Chrome updates, data-continuity and new regression suites in both engines where supported.
- [ ] Repeat the destructive save-race and draft-preservation cases in a real unpacked Chromium extension with real storage/Web Locks.
- [ ] Check both builds, manifests, source baseline, diff hygiene and unchanged published artifacts.
- [ ] Obtain an independent whole-branch review; fix important findings with regression tests.
- [ ] Commit verification record, push the fix branch, create/attach a PR and inspect checks. Do not merge or publish a new store version as part of this task.
