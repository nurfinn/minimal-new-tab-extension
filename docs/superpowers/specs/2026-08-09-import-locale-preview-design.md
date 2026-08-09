# Import Locale Preview Fix

## Problem

Chrome extension locales can contain underscores, such as `en_US`, while `Intl.DateTimeFormat` requires BCP 47 tags such as `en-US`. The import handler currently parses a valid backup and then formats its date with the raw extension locale. The resulting `RangeError` is caught by a broad catch block and incorrectly reported as a file-read failure. The handler also clears the file input before processing finishes, which makes the error state misleading.

## Design

- Normalize browser UI locale strings at the i18n boundary by replacing underscores with hyphens and falling back to `en` when the value cannot be canonicalized.
- Keep backup parsing and persisted formats unchanged.
- Read the selected file before clearing the file input.
- Keep file-read errors separate from preview-rendering failures. A date-formatting failure must fall back to a safe locale instead of rejecting an otherwise valid backup.
- Preserve the existing import preview and confirmation flow.

## Tests

- Prove `en_US`, `pt_BR`, and `zh_CN` become valid BCP 47 locale tags.
- Prove malformed locale input falls back safely.
- Keep the UI contract covered so the selected file is read before the input is reset.
- Run the complete Node test suite and both Chrome and Firefox release-build tests.
- Validate the latest exported JSON with the real backup parser and format its preview date through the normalized locale.
