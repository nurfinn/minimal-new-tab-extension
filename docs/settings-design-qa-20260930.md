# UI polish — selected option 2

Date: 2026-09-30. This report covers the isolated test implementation, not a published release.

## Findings / result

No actionable P0/P1/P2 visual or interaction findings remain in the verified states. The implementation follows the selected panoramic-preview / compact unboxed-toolbar direction. It does not introduce the rejected rectangular folder chips or move the approved URL-embedded favicon/emoji/pencil.

final result: passed

## Visual truth and evidence

- Source: /Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/design/ui-polish-2026-09-30/reset-2026-09-30/02-settings.png
- Native generated reference: /Users/nurfinn/.codex/generated_images/019f13bd-0a4a-7131-bbe8-6147ca74e7d6/exec-4e1911fb-973e-4830-9d7b-6ece9fbbfd8f.png
- Latest implementation: /Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/ui-polish-implementation-20260930/firefox-en-1280x800-settings.png
- Full-view combined source/implementation: /Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/ui-polish-implementation-20260930/comparison-full-opacity-aligned.png
- Focused combined Settings comparison: /Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/ui-polish-implementation-20260930/comparison-settings-opacity-aligned.png

Both combined images were opened together for visual judgment. Separate images alone were not treated as a side-by-side comparison.

Source pixels: 1586 × 992, an AI-generated browser-content reference (no reliable native deviceScaleFactor). It is uniformly normalized to 1280 × 800 with Lanczos, not treated as native browser text. Implementation: 1280 × 800 pixels, 1280 × 800 CSS viewport, DPR 1, Firefox. Matching state: English General tab, default dark background, zero overlay, keyboard shortcuts enabled, remote icons disabled, same fixture folders/sites and no open native popup. Focus crops align the dialog's top/content regions; they do not imply exact pixel equality to generated lettering.

## Required fidelity surfaces

1. **Fonts / typography.** Preserve the existing system font stack and platform fallback. Title 1.38rem, compact body preference text 0.94rem and helper text 0.76rem retain the reference hierarchy without importing a new font. RU/EN wrapping and folder truncation are checked. Generated text rasterization is not copied into the UI; browser antialiasing differences are expected. The small helpers are darker than the initial capture for adequate contrast.
2. **Spacing / layout rhythm.** Settings is 580 CSS px wide on desktop; preview 156 px high, unboxed tint/opacity toolbar, short secondary preference rows, stable header/tabs/footer. The compact rail is capped at 214 px, matching the reference rather than stretching across the modal. In English desktop layouts Opacity starts 183.27 px from the content's left edge and the percentage ends 21.47 px before its right edge (both engines). Chrome is shorter because it has no Firefox icon preference. Under 600 px the toolbar wraps into two compact rows; central content alone scrolls. Close and active footer actions remain visible. The reference's slightly offset modal is replaced with native centered placement, without changing component proportions.
3. **Colors / tokens.** Near-white #f8f9f8 surface; existing teal accent; muted text scoped to #616d68, measured 5.11:1 against the surface. Off switch #868e8a measures 3.18:1; On is teal with a right-positioned knob. Focus is visible. No change to global card/nav/blur tokens. Gray-versus-teal slider-thumb difference is an intentional use of the existing shared accent.
4. **Image quality / asset fidelity.** Actual bundled default wallpaper is retained byte-for-byte. The panoramic preview uses that asset, not an AI-rasterized settings UI or a newly invented background. Its subtle grid/purple crop differs from the mock's softened approximation intentionally. User-uploaded image is object-URL preview only until Save. Actual color/range/file/checkbox controls remain native underneath styling. Existing action SVGs, favicon/pencil/emoji and card assets remain intact; the Change image utility uses a standard line image icon.
5. **Copy / content.** General / Основные and Import and export / Импорт и экспорт match the grouping. Helper states the real 3 MB / 4096 px limits. Filename expands correctly in both locales. Keyboard shortcut helper is compact. Firefox explanation names Google, domain-only transmission and immediate effect, so Cancel is not implied to revoke browser consent. Dynamic pending/On/Off text is owned by confirmed permission state, not static localization.

## Comparison / fix history

- User follow-up: the supplied comparison's LEFT half is the target and RIGHT half is the implementation. Only inline toolbar spacing was revised; no two-row desktop redesign. RED: all four English desktop alignment checks failed at a 161.27 px Opacity inset, compared with the reference's ~183 px. GREEN: 183.27 px label inset, compact 214 px rail and 21.47 px percentage right inset in Chromium/Firefox, with RU/mobile overflow and keyboard checks retained. Fresh full and focused combined images above were inspected together; typography, colors, asset choice and copy remain the previously accepted browser-owned implementation.
- Browser-harness isolation follow-up: an optimistic folder-selection rerender could race the immediately following keyboard action; direct fixture replacement on a page with pending selection work could also reuse preceding test data. The suite now waits for the stored selection before keyboard reorder and creates a new page before replacing folder fixtures. This is test lifecycle synchronization, not an application, gesture, storage or schema change. The completed fresh run passes all 43 checks with zero page errors.
- Initial full/focused joint comparison is preserved as comparison-full.png / comparison-settings.png in the same evidence folder. It showed the intended hierarchy, but small helper text was 4.21:1 on the opaque near-white surface. P2 fix: scope --muted to #616d68, add a contrast regression watched RED→GREEN, recapture both engines and compare final joint images above. Final helper contrast is 5.11:1; Off track also corrected to exceed 3:1.
- Keyboard browser regression (both engines): Tab from Save escaped the native modal. P2 fix: scoped visible/enabled-control Tab and Shift+Tab wrapping. The test failed first, then passed; final bright/detailed screenshots include the visible Save focus ring.
- Folder count regression: long combined label clipped the nonzero count. Name and count now have separate spans, preserving the original pill shape, height and gestures. Browser tests verify visible count, full accessible name/count once, zero-count hiding, keyboard selection, folder reorder/rename and empty states.
- QA-double correction, not a production fix: first bright capture showed $FILE$ literally and the RU document language was reported as English. Native browser locale APIs already support named placeholders; the test double now does too. Added assertions failed before this harness correction and pass afterward. Recaptured bright/detailed/RU evidence has real filenames and correct document language.

## Verified interactions / layout

- node --test tests/*.test.mjs: **195 passed, 0 failed, 0 skipped**.
- scripts/verify-settings-ui.mjs with SETTINGS_REAL_CHROME=1: **43 browser checks passed, zero page errors**.
- scripts/verify-folder-gestures.mjs with GESTURE_REAL_CHROME=1: **46 checks passed**, including recorded rapid swipe recontacts, quota/error responsiveness and isolated Chromium real storage/reopen.
- Clean Chrome/Firefox build allowlists include settings-draft.mjs; Firefox fragment occurs only within General; Chrome has no Firefox consent UI.
- web-ext lint --warnings-as-errors against the fresh Firefox test build: **0 errors, 0 notices, 0 warnings**.
- git diff --check clean.

RU/EN × Chromium/Firefox × 1280×800 / 1024×600 / 390×700: 12 measured layouts, normal and bottom-scrolled Settings captures plus backup/Add site. One central Settings scroller, persistent actions, no horizontal overflow, moderate range rail, inset native select arrow and long URL space for favicon/pencil.

Choose/replace image, default draft, color/range keyboard, shortcut checkbox, tabs, Save, failed Save/retry, Cancel/Close/Esc and object-URL cleanup are tested. Existing custom-asset identity is retained when local image is missing and unrelated preferences are saved. Add/edit/delete/reorder/emoji/reload, folder manager keyboard reorder/rename, backup validation/preview/cancel/import/export are exercised; import preserves the background. Real isolated Chromium checks cover zero writes on Cancel, lightweight sync versus local image, new-tab reload and full browser close/reopen.

Reports:
- /Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/ui-polish-implementation-20260930/report.json
- /Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/ui-polish-gestures-20260930/report.json

## Deliberate limits / follow-up

- **Deferred P3:** when a saved local background is absent and a valid replacement is selected, the visible blob preview, filename and Save are correct, but the visually-hidden live preview status still prioritizes the old missing-asset message. Independent final review found no Critical/Important issues. Follow-up: let a validated replacement preview override that status and cover missing-local → valid-upload; do not change saved asset identity before Save.

- Firefox permissions are exercised through a test double in a real Firefox rendering engine. The browser-owned native consent popup and a signed installed add-on still require a manual isolated test install. They were not automatically accepted.
- Real chrome.storage persistence is checked in an isolated Chromium extension profile, not a personal Google account or cross-device sync.
- Recorded/synthetic wheel traces and mouse.wheel are not a physical macOS trackpad.
- 125% layout uses a reduced CSS viewport and DPR 1.25; it is not a claim of testing the browser's native zoom control. Personal GPU/font settings are not certified.
- Keyboard/contrast/accessible names were checked, not a complete screen-reader or WCAG certification.
- No new wallpaper, store screenshots, version bump, personal installation, commit, push or release in this step.

Protected original storage-service, backup-service, favicon service, core, site-icon, folder-gestures, APIs, both manifests and default image compare byte-identical to the user's original checkout. Published ZIPs remain:
Chrome1.6 SHA256 370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794;
Firefox1.6 SHA256 34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671.

## Handoff / implementation checklist

- [x] Selected option 2 implemented without reviving earlier alternatives.
- [x] General draft and immediate Firefox consent separated.
- [x] Shared controls, scroll/focus, RU/EN and protected flows verified.
- [x] Actual source/capture full and focused comparisons passed after fixes.
- [x] One independent read-only whole-delta review: no Critical/Important findings, one deferred P3 status-copy issue.
- [x] Isolated test builds saved; original checkout and user profiles untouched.
- [ ] Manual native Firefox consent / personal-browser rendering pass before any release.

## Authorized personal-installation follow-up

The user subsequently approved installation in their existing Chrome and Firefox profiles, preserving settings. This updates the earlier isolated-only scope; it is not release approval. Scoped code/storage backups were created first in `outputs/manual-tests/ui-polish-installed-20260930/backup-Nxty54` (private data, not for Git).

Chrome's existing unpacked directory/ID/version were retained. After native extension reload, a fresh personal-profile new tab restored all 42 sites, folders and the custom red-car background. Its actual Settings dialog and accessibility snapshot confirm General, Change image and the aligned compact toolbar. A fresh 195-test unit run passes; all 20 installed runtime files match the approved test build and both published ZIP hashes remain unchanged.

Firefox's native debugging page confirmed a temporary overlay with the original addon ID and UUID; a fresh native new tab restored 42 sites and the existing default background. Firefox then closed and returned to signed store 1.6. The user explicitly declined reinstallation and chose Chrome-only testing for now. The Firefox test is therefore **not currently installed**; its Settings/native favicon-consent pass remains open. Browser security preferences were not changed, no new data-collection consent was accepted, and no commit, push or release was performed. Installation evidence and rollback notes are in `outputs/manual-tests/ui-polish-installed-20260930/INSTALLATION-README.md`.
