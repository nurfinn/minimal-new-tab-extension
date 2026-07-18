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
