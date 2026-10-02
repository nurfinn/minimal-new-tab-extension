# Rapid-series follow-up — current physical check passed

Subsequent approved handoff: the final module was copied into the existing personal Chrome test folder with a verified backup. See [personal install record](personal-chrome-swipe-install-2026-10-02.md). Firefox and release archives remain unchanged. The paragraph below records the earlier isolated-test stage.

Latest user feedback: «да вроде уже норм». The final isolated Chromium capture `capture-uFi2I7/trace-001.json` has983 content wheel events,24 directions and24 matching folder changes, no guard/routing failures or long-task entries; max handler5.7ms. All24 inspected bursts produce one transition. Treat this as a successful current symptom retest, not a complete release matrix or proof of universal intent detection. Personal installations and archives are still unchanged. The implementation history below retains the earlier acceptance gates.

## Implementation follow-up

The user approved the recognizer redesign. The implemented bounded observer now compares the lower envelope of adjacent-pair maxima with sustained growth from adjacent-pair minima. This removes the dependency on one first amplitude without making a single low/high sample sufficient to rearm navigation. Clear vertical intent is rejected immediately; an ambiguous onset gets up to four samples, with three consecutive off-axis samples blocking its tail. Candidate lifetime, context guards, pending-start latch, renderer and storage remain unchanged.

Four sanitized continuous excerpts contain1096 samples and30 inspected impulses. Six new regressions fail on the pre-change recognizer. The final recognizer emits30/30 expected directions versus24/30 previously, with13–91.4ms observed-onset confirmation in these excerpts. Mirrored and2/3/4x tests also pass. These figures measure deterministic replay, not finger-to-paint latency or universal physical reliability. The paired8px growth noise floor can still suppress very weak input; arbitrary event coalescing cannot be labelled reliably from numeric traces alone.

Independent review identified amplified ambiguous-axis input; it was re-graded Important and fixed in one RED→GREEN pass alongside a diagonal-tail negative control. Full unit/contract results:227 pass/0 fail. Browser/manual gates are tracked in Task4 of `docs/superpowers/plans/2026-10-02-intermittent-folder-swipes.md`; do not infer live acceptance from these tests.

The sections below record the pre-redesign diagnosis and hypotheses, not the final implemented algorithm.

The user clarified that the remaining delay occurs during fast successive swipes, not slow ones. Pressing Space during a fast series is impractical and changes the test. Future QA instructions require only Start → uninterrupted fast series → Finish. Existing optional marker support is retained for older captures/tests; markers are not required to record or diagnose a series.

## Evidence

Both existing files from `outputs/manual-tests/intermittent-folder-swipes-20261002/capture-ZhSbpn/` were read before asking for more input. They use recognizer SHA-256 `72f0aff2110f68129fa78dc28a936ce9d29b2691d765a94c61dce9b637d5ff55`. Both recorded source hashes match the unchanged runtime files in the worktree.

- Trace 001: 1284 wheel events, 29 emitted directions, 29 selected-folder changes, no markers.
- Trace 002: 2970 wheel events, 62 emitted directions, 60 selected-folder changes. Two emissions were outward at the final folder and correctly made no change. Two markers exist, but are not needed for the analysis.
- All wheel events reached the content handler; no context guard was set. No long-task entries. Maximum handler time was 5.9 / 7.2 ms; recognizer time 3.1 / 1 ms. Maximum native event delivery was 25.2 / 83.2 ms, so not every observed delay can be attributed exclusively to recognition. Next-rAF entries are not evidence of OS pixel presentation.

## Confirmed remaining mechanism

The absolute 32 px cap is gone, but confirmation still needs two consecutive amplitudes at least twice the **first** sample of a candidate. This single-sample reference remains sensitive to the shape of rapid recontacts.

- Trace 001 at 5405.9 ms: first amplitude 34 sets a 68 px threshold. Later amplitudes reach 84 only once, followed by 46/48/48/52/52. The candidate expires with no transition despite sustained horizontal input.
- Trace 002 at 8053.9 ms: initial 56 sets a 112 px threshold. The burst falls to 28, rises through 68/84/88/88, and never reaches the threshold. No transition.
- Trace 001 at 3597.8 / 4961.9 ms: confirmation takes 123.9 / 127.8 ms after the observed onset. These are event-stream onset times, not measured finger-contact times.
- Separate finding: trace 001 at 6073.7 ms starts `(4,0), (10,-12), (2,-2), (126,-42)`. The second sample rejects the candidate's axis before the subsequent dominant horizontal movement arrives. Do not weaken vertical-scroll protection without a separate regression and explicit axis-decision design.

Event gaps and rising amplitudes support these recognition failures; they do not label every physical gesture or establish a universal intended transition count.

## Why not apply another threshold patch

A read-only in-memory experiment based acceleration on the candidate's minimum rather than its first sample. It recovers the non-axis missed bursts, but a single low outlier can then lower the threshold too easily. A two-sample trough avoids that vulnerability but retains some long waits and misses. Neither hypothesis was applied to source or an installed extension. Raw increases in transition count are not acceptance evidence.

After multiple physical retests have exposed related assumptions, follow systematic-debugging's architecture-discussion gate. Reassess the bounded impulse recognizer rather than shipping another isolated threshold adjustment. Keep renderer, storage, UI, permissions, release archives and personal profiles unchanged.

## Proposed next scope, pending discussion

1. Treat interruption/onset, sufficient horizontal intent, and continued momentum as explicit phases inside the existing pure module; retain its public API.
2. Evaluate a short sequence, not one first amplitude. Decide how to reject isolated low/high outliers and how much evidence is needed before locking the axis. Do not substitute a fixed navigation cooldown or queue gestures behind storage.
3. Write failing numeric replay regressions from both new recordings, including missed bursts, late confirmations, their surrounding momentum and negative controls. Preserve all earlier fixtures and context/pending guards.
4. Verify Chrome/Firefox UI integration, then one short uninterrupted physical fast-series check without Space. No further recording is needed before this design decision.

Historical status at diagnosis: unresolved; Task 3 manual acceptance remained open. That diagnostic turn changed only QA instructions and documentation. The subsequently approved runtime change is summarized above; manual acceptance is still pending.
