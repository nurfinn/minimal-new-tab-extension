# Personal Chrome swipe test update — 2 October 2026

The user accepted the offer to transfer the physically tested swipe fix to their existing test Chrome installation: «давай дальше».

- Installed folder: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/minimal-new-tab-chrome-v1.6`.
- Extension ID remains `jeanjglicakhpfedmenbnmljlfklcken`; manifest version remains `1.6`.
- Verified full-folder backup: `/Users/nurfinn/Documents/Codex/2026-06-28/new-chat/outputs/manual-tests/intermittent-folder-swipes-20261002/personal-chrome-install-klHJ3u/chrome-before`.
- Only changed installed file: `folder-gestures.mjs`.
- Previous SHA-256: `2ee20182bafc240b7d773a6b51210c1bb0a3bbd5a8adc3f174c960685b789841`.
- Installed SHA-256: `da96ec872bb17d7173494af295ed96f7cd6a9abb5a42fafa0c6e1ac3505e6452`, identical to the final isolated physical test.

Before copying, the installed file set was compared to the worktree: only this module differed. After patching, the complete installed folder was compared with its backup: no other files changed. No extension storage or browser preferences were written, and the extension was not removed/reinstalled. The renderer and schema are unchanged.

Fresh full unit/contract suite: **227 passed, 0 failed**; log `.superpowers/sdd/2026-10-02-intermittent-folder-swipes/personal-install-tests.log`. The installed module imports successfully with its existing recognizer API. `git diff --check` passes.

A new tab at `chrome-extension://jeanjglicakhpfedmenbnmljlfklcken/newtab.html` was opened in personal Google Chrome. Chrome reports title **Minimal Tab**, `loading=false`. Existing tabs were not reloaded, avoiding loss of any unsaved dialog state. JavaScript from Apple Events is disabled; this browser setting was respected. Therefore DOM state, loaded module identity, saved-site counts and actual swipes inside this personal tab have **not** been automatically verified. Continue ordinary manual use in the newly opened tab; the earlier isolated physical retest is separate evidence.

Firefox and store ZIPs were not modified. Verified protected ZIP SHA-256:

- Chrome 1.6: `370b139877761ebe180d7d923ab4381f087a8ef094aebbc4e8b42ea5ee537794`.
- Firefox 1.6: `34bd6748a306765bfd40097f915cfc537dfc60b05bb14e2ae9e3bbdf29af1671`.

No version bump, commit, push or publication. Broader manual release checks remain open. The backup supports a targeted rollback of this one module if explicitly requested; do not reset user storage.
