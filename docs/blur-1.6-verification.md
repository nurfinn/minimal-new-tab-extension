# Card blur restoration — 1.6

## Correction: the first fix was incomplete

Removing the vertical scroll container's mask restored backdrop sampling, but
did not restore the 1.5.5 appearance. The earlier verification established that
blur was painted, not that the material matched the reference release.

The verified reference is Chrome 1.5.5 at commit `063c136`. Comparing its complete
card CSS revealed three remaining differences in `body.has-image`:

| Property | Incomplete 1.6 fix | 1.5.5 / corrected 1.6 |
| --- | --- | --- |
| Card background alpha | 0.72 | 0.34 |
| Hover background alpha | 0.80 | 0.48 |
| Host text alpha | 0.82 | 0.66 |

These three values are now restored. The existing `blur(24px) saturate(1.12)`,
borders, shadows, favicon surfaces, and card geometry match the reference.
The new header, scrolling layout, bottom spacing, storage, and version 1.6 remain
unchanged. The scroll container is still unmasked.

## Reference comparison

- Subsequently checked the user's exact `minimal-new-tab-chrome-v1.5.5.zip`
  and `minimal-new-tab-firefox-v1.5.6.1.zip` archives. Their complete `styles.css`
  contents match the Git reference byte-for-byte; the additional Firefox
  stylesheets do not override the card material.
- Added a regression test for all image-card and favicon material variables,
  with provenance to the 1.5.5 commit. It failed on the incomplete fix and passed
  after restoring the three values.
- Full Node suite: 145 passed, zero failures.
- Compared reference 1.5.5, incomplete 1.6, and corrected 1.6 using the same
  controlled background, geometry, text, and packaged icons, at rest and hover.
- Chromium reference versus corrected: one RGB pixel differs by only 1/255 per
  channel in each state (raster rounding); mean absolute channel difference is
  0.0000054. The incomplete version's mean difference was approximately 12.
- Firefox material fixture: reference and corrected screenshots match exactly
  in both states. This does not close the Firefox blur-rendering limitation below.
- Comparison: `../blur-1.6-checks/reference-1.5.5-comparison.png`.
- Measurements: `../blur-1.6-checks/reference-1.5.5-results.json`.
- Both rebuilt ZIPs contain the corrected stylesheet and pass integrity checks.

## Contrast tradeoff

Exact restoration also restores 1.5.5's lower contrast on very light custom
images. The previous 1.6 white-image contrast guarantee depended on its much
more opaque card fill and cannot be retained while claiming identical material.
The test now explicitly checks dark imagery; there is no all-background contrast
claim and no new automatic styling or controls were introduced.

## Historical verification of the first (mask-only) fix

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
