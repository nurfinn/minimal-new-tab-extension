# Minimal New Tab UI/UX Remediation Design

**Date:** 2026-09-07  
**Approved input:** the 2026-09-06 UI/UX audit and the user's instruction to plan and proceed with implementation.

## Goal

Preserve the current calm visual concept while removing the confirmed data-loss paths, making failed actions explicit, aligning Chrome and Firefox, and making the existing flows usable by keyboard and at high content volume.

## Scope and decisions

1. **Storage safety:** every user mutation is applied to the latest valid stored application state through `storage-service.mjs`. The UI supplies a plain state mutator and never sees manifests, generations, or chunks. Same-device extension tabs share a Web Lock when the API is available; the service also re-reads before each mutation. Existing generation/backup recovery remains intact.
2. **Truthful UI:** state is replaced and dialogs close only after storage accepts a mutation. URL and length validation is shown next to the relevant field. A global live status handles failures outside forms.
3. **Keyboard and dialogs:** drag handles gain arrow-key reordering with announcements; visible dialog headings become accessible names; destructive confirmation starts on Cancel. Plain A/F/S remains the default because it is an existing product feature, but a lightweight setting in the existing Background panel lets the user disable it. No third settings tab is added.
4. **Visual consistency:** Firefox folder text uses the published Chrome size. Chrome uses Google hostname favicons before the browser-history endpoint while preserving the letter until a useful image loads. Long labels expose their full value. Image-mode cards receive enough dark surface opacity to remain readable on a white background.
5. **Long lists and feedback:** the topbar stays reachable while the internal page scrolls; the folder list, not the whole dialog, scrolls; empty-folder copy is contextual. Background constraints and pending filename are visible, fallback text wraps, reset semantics are explicit, and import keeps the parsed filename visible.
6. **Motion:** nonessential transforms and transitions are removed under `prefers-reduced-motion: reduce`.

## Compatibility constraints

- Keep Chrome and Firefox interfaces visually equivalent except for Firefox's existing opt-in favicon disclosure.
- Keep storage schema `storageVersion: 1`; add only an optional backward-compatible lightweight preference with a default of enabled.
- Do not store favicon URLs, favicon bytes, custom background bytes, history, or analytics in sync.
- Do not add OAuth, backend, import/export scope changes, search, new theme controls, or a third settings tab.
- Do not bump release versions, create store archives, push, or merge as part of this implementation unless separately requested.

## Acceptance

- A site added in one new-tab page survives an action from an already-open second page.
- Failed writes never close the relevant form or display an uncommitted state as saved.
- Invalid URL and over-limit names receive localized inline errors.
- All audited add/edit/delete/reorder/background/import flows pass in Chrome and Firefox with EN/RU strings.
- Pointer ordering and current data/background migration remain compatible.

