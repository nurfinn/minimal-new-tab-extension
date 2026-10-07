# Unicode emoji catalog

The bundled `catalog.json` is generated from Unicode Emoji 18.0 fully-qualified sequences and Unicode CLDR English/Russian annotations. Its `sources` field records exact source URLs, hashes and the pinned CLDR commit. Run `node scripts/vendor-emoji-catalog.mjs` to regenerate; this is a maintainer command, never extension runtime code.

Unicode data and CLDR annotations are distributed under Unicode License V3; the full notice is included in `UNICODE-LICENSE.txt`. Copyright © 1991–2026 Unicode, Inc.

Nineteen Emoji 18 Russian names absent from that CLDR snapshot are supplemented by project translations in the generator (including tone names). Existing CLDR annotations are not replaced.

No vendor emoji images or fonts are bundled. Glyphs are rendered by the operating system. Modifier components alone are not selectable site icons; all 3963 fully-qualified sequences in the pinned file are included, with skin-tone variants grouped rather than duplicated in category browsing.
