# Minimal Tab design QA — 2026-10-03

Selected target: `/Users/nurfinn/.codex/generated_images/019f13bd-0a4a-7131-bbe8-6147ca74e7d6/exec-68147260-9d7a-46da-ba67-335e9937494f.png` (fourth displayed result, corrected Quiet Palette).

The previous accepted Settings QA and personal-installation history are preserved unchanged in [settings-design-qa-20260930.md](docs/settings-design-qa-20260930.md).

## Iteration 1 — blocked pending density correction

Reference opened together with the real implementation in full-view and focused combined comparisons:

- `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/emoji-palette-visual-v1-20261003/comparison-full.png`
- `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/emoji-palette-visual-v1-20261003/comparison-palette.png`

Source is 1586×992; normalized to 1280×800. Actual screenshot is 1280×800 CSS/physical px, deviceScaleFactor 1. Source picker crop (911,231,464,584) is normalized to 376×473; initial actual picker is 376×504. Both show English Edit site, GitHub, a long URL, Dev, an open smileys category and a hovered emoji. The HTTP browser fixture substitutes a packaged GitHub icon for the online favicon. Product modules are real; storage and permissions are doubled in those fixtures.

### P2: picker is too tall and emoji rows too far apart

The 504px implementation is taller than the approximately 473px normalized target; row pitch is 48px instead of approximately 44px. Fix: 42px rows + 2px gap, a 224px result viewport, smaller vertical heading/category margins, 12px vertical panel padding and 40px footer action. Recapture and compare before passing.

### P2: category glyphs are optically too small

20px icons look smaller than the source. Use 22px library glyphs without dropping existing categories or changing button boundaries.

## Iteration 2 — layout corrected; contrast correction pending

Combined `comparison-full.png` and `comparison-palette.png` in `outputs/manual-tests/emoji-palette-final-20261003/` were inspected. The revised picker is 376×473.80px, with 44px row pitch and 22px category icons; both layout findings are resolved. A focused accessible-color review found the inherited muted text token was not scoped to the light palette. A new contrast regression failed first. Fix: use the already accepted Settings helper token #616d68 within the picker only, including the search placeholder. Recapture before passing.

## Intentional constraints distinguished from drift

- Preserve all ten categories, including Symbols omitted by the AI mock. Keep correct Unicode category names (Smileys & emotion, People & body), ordering and entries instead of copying the mock's mixed/repeated emoji rows.
- Keep the site dialog centered, with existing typography and URL segment. The mock frames the form/picker group further left; moving the actual form is outside this picker task.
- Native glyphs depend on the OS. Iteration 3 still exposed missing glyphs; the approved follow-up below filters unavailable glyphs on-device and preserves the full catalog. No Apple artwork/font is distributed.
- The active website-icon action has a check and teal state. Focus/hover never falsely select an emoji or mutate the draft. The mock's simultaneous GitHub preview and selected emoji is not a real selected draft state.
- Passive Phosphor regular SVGs (MIT, pinned commit) supply outline icons. Orange represents Food because this library has no unbranded apple. Existing pencil and toolbar icons are untouched.
- The mock's decorative pointer is not reproduced; the retained pencil's expanded highlight and adjacent panel provide the anchor. This is a minor polish difference, not a replacement of the input affordance.

## Iteration 3 — final comparison

Opened both combined comparisons after the scoped contrast fix:

- `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/emoji-palette-accepted-20261003/comparison-full.png`
- `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/emoji-palette-accepted-20261003/comparison-palette.png`

Reference is on the left, actual Chromium on the right. Actual Firefox was also inspected at `emoji-palette-final-20261003/firefox-design-v1.png`; final browser-run captures for both engines are in the accepted directory. All captures use the same desktop state described above. The final palette remains 376×473.80 CSS px, seven columns, 44px row pitch and a fixed footer. No unresolved P0/P1/P2 design drift remains within this picker scope. This is not a claim of universal native emoji/font coverage or release readiness.

## Required fidelity surfaces

1. **Fonts/typography:** retain the existing Inter/system stack and native color-emoji stack; 16px semibold picker title, 13.6px search/footer, 12.8px category heading, 26.4px emoji. The approved form is unchanged. No generated lettering or Apple font/artwork is copied. Native rasterization/glyph differences are an expected platform constraint.
2. **Spacing/layout:** 376px panel, 12×16px padding, open borderless 42px cells with 2px gaps, bounded 224px results, small outline-category row and separated fixed footer. Search/header/categories do not move as the grid appends batches. The initial 30px excess height was fixed. On narrow windows the palette opens inline and the containing form scrolls without horizontal overflow; desktop placement is clamped vertically. Favicon/pencil stay in the fixed right input segment for the long URL.
3. **Colors/tokens:** near-white #fcfdfc, existing #276b62 accent, #616d68 helper/placeholder, pale teal hover/active state and dark teal keyboard focus. Contrast regression proves small helper text exceeds 4.5:1. Selection has an inset outline; focus is a distinct outer outline. No global card/nav/blur token changes.
4. **Image/asset quality:** existing wallpaper is byte-identical. Native emoji remain text, not new raster assets. Category/search/variant icons are genuine passive Phosphor regular SVGs from [the official source](https://github.com/phosphor-icons/core/tree/2b75f3ad12b420c9504ef05df8d2564a28f8500e/assets/regular), pinned with MIT license and hashes in `icons/emoji-ui/NOTICE.json`. The browser-only visual fixture uses the already bundled GitHub SVG. No runtime icon CDN or new permissions.
5. **Copy/content:** Choose an icon / Выберите значок, localized search and category names, Use website icon / Иконка сайта. All ten real categories and supported tone variants remain reachable. Iteration 3 used Quick picks; the approved follow-up uses All emoji / Все эмодзи as the first category. Search is RU/EN; empty/loading/failure/retry states stay coherent. Hover/focus do not imply a saved selection.

## Verified behavior and protected scope

- Full `node --test tests/*.test.mjs`: **259 passed**, 0 failed/skipped. Four design contract checks failed before implementation; the separate contrast regression also failed before its scoped fix.
- `scripts/verify-emoji-picker.mjs`, `EMOJI_REAL_CHROME=1`: **51 passed**, 0 page errors. Fresh Chrome/Firefox builds, both languages, desktop/tablet/narrow widths, search, empty results, scroll pagination, keyboard row geometry and batch crossing, grouped variants, Escape, draft/Cancel, Save/reload/edit/export, restoring website icons, catalog failure/retry and long-URL comparison states. Three real MV3 cases use a disposable Chromium extension profile, including full close/reopen.
- `scripts/verify-settings-ui.mjs`, `SETTINGS_REAL_CHROME=1`: **43 passed**, 0 console/page errors, against the final layout. Background, settings, folder/site CRUD/order, import/export, permission-state and responsive controls regressions remain intact.
- The preview runs real shared UI with synthetic in-memory storage only. It is not a personal-profile installation and refresh intentionally restores the demo fixture. No prototype/bootstrap scripts are in the release allowlist.
- Storage service, persisted schema, backup service, gesture recognizer, manifests, personal extension directories and store ZIPs were not edited. Source changes stay in the existing development worktree. No version bump, install, commit, push or publication.
- Protected background SHA256: `4cbb0f193204d0e8eeb445c4c6257e271c51b72011a4a70fafa0fa4df0169cd6`; Chrome 1.6 ZIP: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`; Firefox 1.6 ZIP: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.

## Remaining limitations / checklist

- [x] Exact fourth selected visual resolved, source and implementation compared together at normalized density.
- [x] P2 density/icon-size and helper-contrast findings fixed and recaptured.
- [x] All categories, tone variants, offline lazy loading, search and existing persistence preserved.
- [x] RU/EN and both rendering engines exercised; real MV3 persistence separately verified.
- [x] Prior approved Settings report preserved in the linked historical document.
- [x] Approved follow-up handles unavailable native glyphs on the tested device; regenerated captures no longer show the missing-glyph square.
- [ ] Native font/capability behaviour on Windows/Linux and future fonts is not certified by this macOS run.
- [ ] Signed Firefox restart, cloud cross-device sync, physical trackpad reacceptance and store update delivery need their actual environments; no new claims are made for those here.

## Iteration 4 — approved All emoji and unavailable-glyph handling

The user accepted preserving system emoji, removing unavailable glyphs from selection, retaining stored Unicode values behind favicon/letter fallback, and replacing Quick picks with All emoji. This is a bounded rendering/category follow-up, not a visual redesign. The same accepted panel dimensions, monochrome categories, fixed footer and pencil remain unchanged.

New full and focused comparisons in `outputs/manual-tests/emoji-support-accepted-20261003/` were inspected. The original U+1FAEB empty/hex box is absent in both engines; remaining glyphs fill the grid without holes. Actual All emoji / Все эмодзи initial-state screenshots in `outputs/manual-tests/emoji-support-preview-final-20261003/` were also checked. Both engines expose every one of the current device's 1925 supported bases; all 3963 data sequences remain bundled. No new P0/P1/P2 visual finding.

Fresh final verification: 266 unit/contract tests, 61 emoji browser checks, 43 Settings regression checks, and four preview flows passed. Additional 76 gesture and 11 continuity checks passed before the final BMP control addition, with recognizer/storage/backup unchanged. New focused regressions were red before their fixes. Full evidence, root cause, fallback/no-write behaviour, failed intermediate checks and platform limitations: [emoji-support-verification-2026-10-03.md](docs/emoji-support-verification-2026-10-03.md).

Emoji palette result: passed.

## Folder visibility — selected compact footer

Source visual truth: `/Users/nurfinn/.codex/generated_images/019f13bd-0a4a-7131-bbe8-6147ca74e7d6/exec-05c0b8f7-d24a-46be-aa36-2a9ebbe25fd4.png` — the second displayed option, accepted by the user. The rejected upper settings-like block was not implemented. This task adds only All visibility in the existing Folders dialog; it does not recreate its entire material or change the established width.

### Evidence and normalization

Final rendered screenshots and combined comparisons are in `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/folder-visibility-accepted-20261003/`:

- `chrome-en-folder-visibility.png`, `firefox-en-folder-visibility.png`: full 1488×1056 CSS/physical-pixel captures, deviceScaleFactor 1, English Folders open, five folders, 42 synthetic sites, All selected, checkbox checked.
- `chrome-folder-visibility-comparison-full.png`, `firefox-folder-visibility-comparison-full.png`: full source left, implementation right, both normalized to 1488×1056. These were opened together after the final color fix.
- `chrome-folder-visibility-comparison.png`, `firefox-folder-visibility-comparison.png`: source dialog crop (502,233,485,585) resized proportionally to the existing 420px implementation width; source about 507px high, actual about 504px. Both combined inputs were opened after the fix. The mock's larger dialog is not mistaken for a new width requirement.
- `*-ru-folder-visibility-narrow.png`: responsive Russian footer evidence. Behavioural checks cover 390×700, 320×480 and 820×480 CSS windows, with no hidden checkbox/Done or horizontal overflow. These are CSS-window models, not native browser-zoom certification.

The synthetic fixture reproduces folder names/order/counts but uses example.com sites instead of the user's private URLs. The full captures therefore assess dialog hierarchy and placement, not matching favicon artwork. Preview uses public example sites only and never the user's profile.

### Iteration history and findings

First functional QA found two P2 state defects: the checkbox visually reversed while storage was pending, and an invalid hidden preference with no user folders could hide All after creating the first folder. Fixed by retaining the native pending value and normalizing navigation before mutation as well as after. Both were reproduced before the fix and pass in all four language/engine combinations afterward. An incorrect import selector in the test was separately repaired, not classified as a product defect.

The first full and focused visual comparisons in `folder-visibility-second-20261003/` and `folder-visibility-final-20261003/` found one new P2: the 14px checkbox caption used the inherited muted token and was too faint relative to the mock. A dedicated contrast regression failed. Fix: only this caption now uses the existing main text token, retaining its normal weight and quiet placement. The regression passes against the darkest composite of the existing 92%-white modal. The final captures listed above were recaptured and compared; this finding is resolved.

### Required fidelity surfaces

1. **Typography:** existing Inter/system stack preserved; the new caption is 14px, regular weight, with no imposed uppercase or prominent heading. Done retains the existing text-action treatment. Main-text color fixes legibility without increasing hierarchy. Native checkbox rasterization differs from the generated drawing by platform; this is expected.
2. **Spacing/layout:** existing 420px dialog, padding, form, creation row and folder list remain unchanged. The footer uses a light divider, 12px top padding, a left label and right Done, with at least a 40px label target. It remains a secondary control, not a new settings section. Source-normalized vertical density is within approximately 3px; the existing shape is preserved intentionally.
3. **Colors/tokens:** existing teal accent, dark text and separator tokens. Checked state uses native accent-color; keyboard focus uses a distinct outline. Pending is disabled, not falsely committed. Background/glass tokens were not edited by this feature. No new color palette or global control restyle.
4. **Assets/material:** no new image/icon asset. Existing drag/pencil/delete icons and wallpaper are retained byte-for-byte. Native form checkbox is a control, not a hand-drawn replacement for a product illustration. Firefox's test build shows the inherited translucent modal revealing underlying cards in both headless and an additional isolated headful capture (`folder-visibility-preview-20261003/firefox-headful.png`). This is an explicitly preserved existing material outside the approved footer scope, not a claim that the whole Firefox modal is pixel-identical to the generated mock or that its installed appearance has been accepted.
5. **Copy/content:** Show “All” / Показывать «Все», Done / Готово. Accessible description explains that hiding does not delete sites; no-folder state asks to create a folder first. No deletion icon or confirmation is attached to visibility. Sites without a folder remain reachable via Unfiled / Без папки rather than being silently concealed.

No unresolved new P0/P1/P2 finding remains within the approved footer/navigation scope. This is not a full-extension aesthetic certification. Actual signed Firefox visual acceptance, cross-device sync and physical-trackpad reacceptance are still separate release checks.

### Verification and handoff checklist

- [x] Exact accepted second visual resolved; full and focused combined comparisons inspected after the final fix.
- [x] State regressions and contrast regression reproduced red, fixed, rerun.
- [x] 278 unit/contract/build tests, 88 Settings/visibility browser checks and 8 preview flows passed; no page/console errors in those browser runs.
- [x] 76 gesture, 61 emoji and 11 continuity checks passed before the final caption-only color correction, with their product modules unchanged afterward.
- [x] Save/reload/new tab, real Chromium storage and full close/reopen; root-site accessibility, deletion/empty/error/pending/keyboard/responsive states checked.
- [x] Prior work preserved. Manifests remain 1.6, user installations and store archives untouched; no commit/push/publication.
- [ ] Native signed Firefox/cross-device sync/store delivery/physical gestures are not certified by these automated runs.

Detailed evidence and protected hashes: [folder-visibility-verification-2026-10-03.md](docs/folder-visibility-verification-2026-10-03.md).

final result: passed
