# Group interaction timings

[Implementation PR](https://github.com/wamukat/kanbalone/pull/34)

These measurements are for partial Group rendering, not the earlier indexing optimization or the rejected content-visibility prototype. Initial loading and API paging are unchanged.

## Method

Baseline `2c44327c1b05753b165181ee663af9fb5253e40f` is the local integration of the accepted PR #32 and #33 content. Its public assets were copied before edits. Published `main` commit `1f63826ad713de97870bb91d914d249ada8508ac` has the exact same Git tree (`9fd16bba08c98cb5e82d80b788fdc08f551cdc7f`), so that published commit reproduces the baseline content. Both servers use the same disposable SQLite fixture; port 3605 serves that snapshot, 3606 serves the candidate. Never used production data. Served source/input hashes are in `performance-inputs.json`.

Node 26.13.1; Playwright Chromium 159.0.8154.6; macOS 26.7.3; Intel i7-9750H, 16 GB. 1440×1000 light, English. The fixture is the synthetic dataset from the hierarchy-rendering benchmark with 1,000/10,000 members, including archived/completed parents and open children. Added a long two-paragraph Group description and five **unassigned** candidates per board. Thus Group member counts remain 1,000/10,000 and board totals are 1,005/10,005.

The browser loads the entire Group first. For each action it focuses the existing button and performs an actual browser click. A capture listener records `performance.now()` at that click, then samples after two animation frames. Driver actionability/focus waits and initial loading are outside the measured interval. Each of six actions runs three times, sequential baseline then candidate (72 samples total). Other agents paused heavy local tests until measurements finished. This is a local rendering proxy, not INP, human task time, or a randomized performance guarantee.

## Results

Median milliseconds.

| Group members | Action | Before | After |
| --- | --- | ---: | ---: |
| 1,000 | edit-description | 344.6 | 41.5 |
| 1,000 | cancel-description | 375.4 | 35.2 |
| 1,000 | expand-description | 426.7 | 31.8 |
| 1,000 | collapse-description | 341.5 | 31.4 |
| 1,000 | pick-candidate | 339.1 | 34.0 |
| 1,000 | unpick-candidate | 337.2 | 32.5 |
| 10,000 | edit-description | 4,052.7 | 313.2 |
| 10,000 | cancel-description | 3,947.3 | 359.5 |
| 10,000 | expand-description | 3,886.0 | 335.3 |
| 10,000 | collapse-description | 4,157.2 | 338.9 |
| 10,000 | pick-candidate | 4,053.6 | 360.3 |
| 10,000 | unpick-candidate | 4,113.5 | 356.7 |

Every one of the 36 candidate observations retained the original first ticket row, connected in place; every baseline observation replaced it. All actions preserved the expected row count. The regression suite checks wider row identity, invalidation, focus, state and failures; this representative row alone is not proof that every row is correct.

Large Groups still spend around 300–360ms in these operations. Keeping DOM nodes avoids repeated HTML parsing and most style/layout work, but changing the header/description height still requires layout. This change does not solve the roughly four-second initial load, all-row DOM memory, or large Kanban rendering.

## Reproduction

Run from repository root with Node 26 and installed dependencies. Copy baseline public assets into `coverage/group-partial-render/before/public`. Use `performance-seed.py copy SOURCE_DB` with the synthetic Group benchmark database (never a real board database). Start `performance-server.mjs` with `BASELINE=1` and without it, using `node --import tsx`; then run `performance-seed.py configure`. Finally run `performance-benchmark.mjs`. Results go into `coverage/group-partial-render/performance/`. The hierarchy-rendering fixture already contains mixed parent and child data. Its seed is documented in the [benchmark report](../2026-11-22-display-performance/README.md).

`performance-results.json` preserves all raw samples, operation names, row counts, retained-node observations, focus labels and scroll positions. Comparably seeded Japanese/English acceptance images and persistence checks are recorded separately by the verification agent; the performance dataset is not mixed with those writes.
