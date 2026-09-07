# Header revision — 2026-09-08

Final result: passed for the scoped header redesign and scrolling behavior.

Spacing follow-up: raised the entire control row by 6 CSS px using relative
positioning. Browser measurements in Chromium and Firefox at 1280, 900, and
390 px confirm unchanged header height, card viewport, and initial card
position, with 6 px more clearance below the controls. Scroll and Settings
checks pass; all 143 tests pass.

## Design target and comparison

The user's September 8 screenshot rejects the full-width dark glass band and
its dividing line. The revised target is the product's existing floating folder
chips and action buttons over an uninterrupted background. Glass is confined
to those controls. Cards scroll in a separate, softly clipped area below them.

Reviewed the supplied complaint screenshot alongside the new initial and
scrolled browser captures. This is a redesign, not a pixel-for-pixel clone.
The reference is a cropped Earth-background view; the current live Chrome tab
shows the bundled purple background. Background fidelity to the Earth image
was not verified, and the screenshot crops/densities are not equivalent.

## Evidence

Evidence folder: `../header-design-2026-09-08/`.

- `chromium-1280-image-0.png`: initial layout, no continuous header surface.
- `chromium-1280-image-300.png`: scrolled cards fade below the folder controls.
- `chromium-390-image-300.png`: stacked action buttons and horizontally scrolling folders.
- `firefox-1280-image-300.png`: equivalent card clipping in Firefox.
- `chrome-live-current-background.png`: OS capture verified to show the user's active Minimal Tab in Chrome, with 40 saved sites. This capture preceded the final empty-grid-only correction.

## Findings and checks

- Removed the full-width paint, border, shadow, and filter from the header.
- Navigation occupies its own grid row. Cards cannot render above it, even
  when the browser does not render backdrop blur.
- Folder and site typography, site-card dimensions, labels, and button icons
  are retained. Existing source icons are reused; no generated assets added.
- Inactive folder chips have a restrained inset highlight. Active, hover,
  and keyboard focus styles remain distinct.
- The card scroller has a 16 px top fade and 12 px bottom fade, with end spacing
  included in the card grid's height. Empty grids do not leave a padded row.
- Chromium and Firefox: 1280, 900, and 390 px widths; image and solid backgrounds;
  five scroll positions; short and long lists; empty folders; creation of five
  folders; header hit targets; opening Settings; no page errors.
- Browser checks use isolated in-memory extension storage. The Firefox scroll
  check waits for offscreen cards to resolve their actual heights before
  measuring the final bottom gap.
- All 143 existing tests pass, including the adjusted scrolling contracts.

No outstanding P0/P1/P2 findings in this scoped verification. Firefox's test
renderer does not reliably render backdrop blur; the layout and readability
do not rely on it. Live Firefox installation was not refreshed in this pass.

---

# Firefox v1.5.5 design QA

## Evidence

- Source visual truth: `/Users/nurfinn/.codex/generated_images/019f13bd-0a4a-7131-bbe8-6147ca74e7d6/call_Zhfa9KxRkv31tLZbRczqIbUj.png`
- Browser-rendered implementation: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/firefox-v1.5.5-settings-runtime.png`
- Full-view comparison: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/firefox-v1.5.5-settings-comparison.png`
- Focused settings comparison: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/firefox-v1.5.5-settings-comparison-focus.png`
- Viewport: 1488 × 1057 CSS pixels at device pixel ratio 1
- Browser: Firefox 152.0.6, headless, temporary unpacked Firefox v1.5.5 extension
- State: Russian locale, fresh storage, Settings open, favicon disclosure expanded, remote loading off, toggle focused

## Primary interactions and runtime checks

- Opened Settings and expanded **Настроить**.
- Confirmed the disclosure focuses the switch.
- Confirmed the switch is available and off on a fresh install.
- Confirmed Settings still contains exactly two tabs: **Фон** and **Импорт и экспорт**.
- Confirmed the default Google, YouTube, Gmail, ChatGPT, and GitHub cards use packaged local icons.
- Added a Google Sheets URL containing a private-looking path and query; it resolved to the packaged Sheets icon.
- Added an unknown domain; it retained the visible `U` letter fallback with no image source.
- Confirmed there were zero broken favicon images and zero browser-console errors.
- Runtime evidence: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/firefox-v1.5.5-smoke.json`

## Required fidelity surfaces

- Fonts and typography: the implementation retains the product’s existing system-font stack, hierarchy, weights, and compact modal type scale. The visual target uses a larger presentation scale, but the hierarchy and wrapping remain equivalent inside the production modal.
- Spacing and layout rhythm: the site-icons title, five-icon sample, mode, and outlined Configure button now follow the approved left-to-right order. The disclosure, tab group, and background panel retain the original extension spacing and radii.
- Colors and tokens: the implementation uses the existing `--text`, `--muted`, `--line`, `--line-strong`, `--accent`, and modal surface tokens. Focus styling remains visible and consistent with the product.
- Image quality and asset fidelity: all five samples and rendered site icons are real packaged favicon assets. Runtime natural dimensions were 300 × 300 for SVGs and 128 × 128 for the OpenAI PNG. No placeholder, emoji, CSS drawing, or broken image is visible.
- Copy and content: Russian title, mode, action, status, toggle label, and domain-only privacy message are accurate. The fresh-install background state intentionally differs from the source mockup’s custom-background example.

## Findings

- No actionable P0, P1, or P2 differences remain.
- P3: the source visual includes decorative chevron and shield symbols. The production control omits them to avoid adding a new graphical dependency; the outlined button, visible disclosure, `aria-expanded`, status text, and focus behavior preserve the affordance and accessibility.
- Expected constraint: the source is a presentation-scale concept with an approximately 815 px modal, while the existing extension deliberately keeps its original 540 px settings modal. The Firefox-only addition was fitted to that established design system instead of resizing the whole interface.

## Comparison history

### Iteration 1

- Evidence: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/firefox-v1.5.5-settings-comparison-v1.png`
- P2 findings: icon samples appeared before the title; **Настроить** looked like plain text; status appeared after the switch.
- Fixes: reordered the row to title → samples → mode → Configure, added an existing-token outline and surface to Configure, and reordered the disclosure to label → status → switch.
- Source commit: `726b46b` (`fix: align Firefox favicon settings layout`)

### Iteration 2

- Post-fix evidence:
  - `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/firefox-v1.5.5-settings-comparison.png`
  - `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/firefox-v1.5.5-settings-comparison-focus.png`
- Result: the earlier P2 findings are resolved. No new P0, P1, or P2 issue is visible in the full or focused comparison.

## Residual test gap

- Firefox’s native optional-permission confirmation prompt was not accepted in the headless session. Granted, denied, removed, unsupported, and error states are covered by automated controller tests; the live smoke verified the permission is absent and the switch remains safely off by default.

final result: passed
