# Import Locale Preview Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow valid exported backups to open under region-specific Chrome locales without a false file-read error.

**Architecture:** Canonicalize extension locale identifiers inside `i18n-service.mjs`, then make `loadImportFile` read the file before resetting its UI and isolate true read failures from preview rendering. The backup schema and storage services remain unchanged.

**Tech Stack:** JavaScript ES modules, Chrome/Firefox WebExtensions APIs, Node.js built-in test runner.

## Global Constraints

- Do not change the backup or persisted storage schema.
- Do not modify user data during preview.
- Keep Chrome and Firefox behavior aligned through shared modules.

---

### Task 1: Canonicalize browser locales

**Files:**
- Modify: `tests/i18n-service.test.mjs`
- Modify: `i18n-service.mjs`

**Interfaces:**
- Produces: `normalizeUiLocale(locale: unknown): string`
- Updates: `getUiLocale(getMessage?): string` to return a canonical BCP 47 tag.

- [x] Write tests asserting `en_US -> en-US`, `pt_BR -> pt-BR`, `zh_CN -> zh-CN`, and malformed input -> `en`.
- [x] Run `node --test tests/i18n-service.test.mjs` and verify the new tests fail because the normalizer is absent.
- [x] Implement the minimal normalizer and use it from `getUiLocale`.
- [x] Re-run `node --test tests/i18n-service.test.mjs` and verify it passes.

### Task 2: Make import errors accurate

**Files:**
- Modify: `tests/ui-contract.test.mjs`
- Modify: `newtab.js`

**Interfaces:**
- Updates: `loadImportFile(event)` without changing its external event-handler contract.

- [x] Add a contract test proving `file.text()` is awaited before `resetImportState()` clears the input.
- [x] Run `node --test tests/ui-contract.test.mjs` and verify the ordering assertion fails.
- [x] Read the file in its own guarded step, reset the previous UI state after reading, and use a canonical browser locale for preview rendering.
- [x] Re-run `node --test tests/ui-contract.test.mjs` and verify it passes.

### Task 3: Verify the complete release path

**Files:**
- No additional source files.

- [x] Run `node --test` and verify zero failures.
- [x] Run the Chrome and Firefox build scripts and their build tests.
- [x] Parse `/Users/nurfinn/Downloads/minimal-new-tab-backup-2026-08-09.json` with `parseBackupText`, format its preview date using `getUiLocale(() => 'en_US')`, and verify both operations succeed.
- [x] Review `git diff --check`, `git status`, and the final diff for unintended changes.
