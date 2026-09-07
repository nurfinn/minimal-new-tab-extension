# Card blur restoration — 1.6

Removed the vertical scroll container's mask, which established a backdrop root
between the cards and the body's background image. The existing 1.5 card filter,
`blur(24px) saturate(1.12)`, is unchanged. Header layout, card styling, scrolling,
bottom spacing, storage, and versions are unchanged.

## Verification

- Regression test failed against the masked CSS, then passed after removal.
- Full Node suite: 144 passed, zero failures.
- Actual Chromium extension A/B: removing only the mask restored background
  smoothing; header, scroller, and card rectangles remained exactly equal.
- Packaged CSS pixel probe: stripe variation inside a card dropped from 35.44
  with the old mask to 2.18 without it in Chromium.
- Chrome and Firefox layout fixtures with 42 cards: widths 1280, 900, and 390;
  stationary header, no document scrolling or horizontal overflow, visible end
  spacing (at least 51 px).
- Chrome and Firefox 1.6 ZIP integrity checks passed. Chrome isolation baseline
  and archive checksum refreshed for this intentional shared CSS change.

## Firefox visual limitation

Automated Firefox (both Playwright and installed Firefox via GeckoDriver) did not
paint backdrop blur even in a direct-body control without masking or containment.
Computed filter and unmasked ancestors were verified, but visual blur fidelity in
the user's normal Firefox session remains unverified. No browser graphics or user
profile settings were changed to compensate for the test environment.

Screenshots and measured results are in `../blur-1.6-checks/` beside this repository.
