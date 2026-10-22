# Sync recovery and capacity

The core format stays at storage version 1. The protected emoji/visibility layer and published 1.6 reader remain compatible.

## Failed writes

Before staging, the writer records its chunk keys in a local recovery journal (`minimalNewTabPendingSyncWrites`). On the next mutation, including after a restart, it reads fresh sync heads under the mutation lock. Only locally owned chunks that are not referenced by valid heads or retained core feature markers can be removed. Unknown, incomplete or future metadata prevents cleanup; foreign staging is retained.

The journal contains storage key names, not a second copy of the user's sites. Failure to read/write it stops a new mutation; failure to remove completed bookkeeping does not turn a confirmed save into a failure. Existing local wallpaper records are unchanged by the journal.

Historical unreferenced staging without ownership evidence is deliberately not guessed away: a different device may still publish it. A user whose old data already exceeds safe sync capacity can still export it and import a reduced collection.

## Capacity

Admission estimates the escaped JSON/key costs of two complete core/feature snapshots, their heads, unrelated retained data, and 2 KiB of small-edit headroom. It rejects a collection that fits only once, before publishing it. The message distinguishes capacity from a transient storage failure. Capacity depends on bytes, not an arbitrary site/folder count.

If the candidate fits this admission budget but an obsolete third recovery generation blocks staging, the writer first points both recovery heads at the already-verified current snapshot. It verifies those references and payloads before removing any retired chunks. The new snapshot is then staged normally; the current snapshot remains available throughout. Compaction is journaled before its first head write so an interrupted cleanup can finish after restart.

Core-only 1.6 collections can retire redundant recovery generations before their first protected-feature write. Compaction verifies that the feature layer is genuinely absent and omits feature-head writes in that case; unknown feature metadata is not treated as absence.

If core manifests exist but no referenced generation is readable, the loader returns an unsuccessful, read-only fallback. Standard first-install sites may still be displayed, but they are not a confirmed backup and cannot overwrite the unreadable collection. Genuinely empty storage remains writable and exportable.

An existing oversized collection may need a sufficiently large reduction to fit alongside its previous snapshot; the sole valid snapshot is never deleted to make room. This is a sync storage limit, not an import-file limit (backup files remain bounded to 1 MiB).

Limits match the [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage#property-sync): 102,400 total bytes, 8,192 bytes per item, 512 items. No new permissions, version bump, automatic store publication, or change to personal browser profiles is involved.

## Evidence

`tests/storage-recovery-capacity.test.mjs` covers repeated failures/restarts, foreign staging, large collections, rejection before publication, compaction interruption at each boundary, old-writer reduction, protected emoji, and unread/future local recovery metadata. Existing storage, mixed-version and background transaction tests remain required.
