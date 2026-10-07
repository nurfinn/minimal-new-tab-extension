# Minimal Tab — approved soft-grid icon

Approved on 2026-10-04 for Chrome and Firefox. Both build pipelines copy the shared `icons/icon-{16,32,48,128}.png` assets; the shared new-tab HTML declares the 16 px and 32 px favicons explicitly.

## Vector sources

- `minimal-tab.svg`: main artwork. Frame and dividers: 8 units; outer radius: 28; inset outer blue radius: 20; internal corner radius: 4. Wider left panes and equal-height rows retain the selected grid direction.
- `minimal-tab-16-optical.svg`: small-size artwork. Frame and both dividers: 2 px. The 16 px rendition is deliberately bolder for readability; it is not a direct downscale of the master.
- Blue: `#457B9D`; near-white: `#FAFCFD`. Transparent outside the rounded mark. No gradients, shadows, external resources, or baked-in background.

## Packaged PNGs

| Size | Purpose | Artwork / padding |
| --- | --- | --- |
| 16 px | Small favicon | Optical-size mark, full extent |
| 32 px | Retina favicon / toolbar | Main mark, full extent |
| 48 px | Extension management | 36 px mark, 6 px transparent margins |
| 128 px | Chrome Web Store | 96 px mark, 16 px transparent margins |

The vector files are editable brand sources and are intentionally outside the runtime build allowlists. Manifest icon fields use PNGs. [Chrome sizes](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons), [store artwork and padding](https://developer.chrome.com/docs/webstore/images).

`tests/extension-icon.test.mjs` checks approved PNG snapshots, dimensions, RGBA format, favicon declarations, and identical icon declarations in both manifests. Build tests verify copied PNGs. Pixel geometry, transparent padding and source export verification are recorded in `docs/icon-verification-2026-10-04.md`.

This source change does not bump a version, update a browser installation, replace an existing store archive, or publish a release.
