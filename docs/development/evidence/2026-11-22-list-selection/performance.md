# List selection with large collections

[Implementation PR](https://github.com/wamukat/kanbalone/pull/39)

The actual production change replaces repeated linear membership scans with local Sets. Selection remains an ordered ID array and is pruned from the current filtered collection on every render; no persistent index or new cache is introduced. These measurements concern **selection interactions**, not initial List/Group loading, API speed, or the remaining large Group DOM cost.

## Results

Median milliseconds, one warm-up excluded and five retained observations per variant/population. The four operations run sequentially on each newly loaded List: select all, deselect the first displayed ticket, select all again, then clear all.

| Exact board population | Operation | Baseline | Candidate |
| --- | --- | ---: | ---: |
| 1,005 | Select all | 119.1 | 92.2 |
| 1,005 | Deselect one | 41.7 | 31.1 |
| 1,005 | Select all again | 45.8 | 30.3 |
| 1,005 | Clear all | 30.1 | 29.5 |
| 10,005 | Select all | 907.0 | 105.6 |
| 10,005 | Deselect one | 556.3 | 44.6 |
| 10,005 | Select all again | 445.9 | 44.6 |
| 10,005 | Clear all | 40.2 | 43.1 |

There is **no measured clear-all improvement** at 10,005. The gain is concentrated in operations where many tickets remain selected. The 10,005 select-all baseline ranges from 799.3 to 1,239.5 ms; candidate from 104.6 to 121.6 ms. Full ranges are in [performance-summary.json](performance-summary.json), and all 24 observations / 96 operations including warm-ups are in [selection-production.json](selection-production.json).

## Method and checks

Baseline is merged main `963b37bcdd5e773ef01889bbcea9dbd33a21d1bd` (including PR #38). Candidate is the three production List modules hashed in [performance-revision.json](performance-revision.json). Both variants override those same three JavaScript URLs: baseline bytes from `git show`, candidate bytes frozen from working files before the run. All remaining source and backend are shared. This symmetrical transport avoids comparing an intercepted baseline against an ordinary candidate fetch.

Native Node 26.13.1, bundled Playwright Chromium, macOS Intel i7-9750H, localhost, 1440×1000, English, light. Fresh browser contexts with explicit archived-inclusive filters and the intended List board. Warm server/OS; no network shaping. Other heavy tests were paused. Before/after order alternates each repetition; datasets run 1,005 then 10,005.

Each operation is a real Playwright checkbox click. A capture-phase `change` listener starts the timer; two animation frames later it reads the final count, select-all checked/indeterminate state, and all mounted row checkboxes. **This is change-event to paint proxy, not the whole pointer interaction, INP, or human task duration.** Timing excludes Playwright actionability waiting and earlier pointer/click handlers. The first operation can include more initial layout/action-button work than later operations. The samples' `initial.at` field includes test-runner observation/polling delay and is **not** used as an initial-loading benchmark.

Every observation passes exact selection-count and select-all state assertions: N selected → N−1 selected/indeterminate → N selected → none. Initial List spacer heights are 64×N and API page counts are 6/51. List virtualization remains in use; mounted rows are not mistaken for the full selected population. The measurement performs only local selection changes and reads, with no ticket mutation. Separate E2E/actual-screen records establish saved bulk operations and UI parity.

A preliminary two-module browser-only Set prototype identified the opportunity. Its timings are not mixed into these final production results. The final run freezes all three changed production modules, including move/family membership optimizations; those latter paths are functionally checked separately, not timed here.

## Data and reproduction

The measured database is a SQLite backup of the previous synthetic Group performance lab: 1,000/10,000 mixed open/completed tickets plus five unassigned candidates per board. It includes 20 parent/child pairs per board, ten archived parents, Group membership, tags and synthetic descriptions/comments. The archived-inclusive List thus contains exactly **1,005 / 10,005** tickets. Existing user data is never used. Unmeasured historical timing-start boards remain in the original synthetic backup.

The two compressed `performance-board-*.json.gz` exports contain only those synthetic measured boards. To reproduce on this candidate source:

1. Use a fresh `coverage/render-followup` directory with no `benchmark.sqlite`; retain an existing run elsewhere rather than overwriting it.
2. From repository root, start `node --import tsx docs/development/evidence/2026-11-22-list-selection/performance-server.mjs` (port 3628).
3. Run `python3 docs/development/evidence/2026-11-22-list-selection/performance-seed.py`. It refuses a nonempty instance. The 10,005-ticket fixture import can take several minutes; seed requests allow up to 600 seconds.
4. Run `node docs/development/evidence/2026-11-22-list-selection/measure-production.mjs`. It reads baseline modules from the recorded git commit and candidate modules from `public`, writes snapshots/raw results below `coverage/render-followup`, and closes its browser.

The portable re-import can remap IDs and generates import metadata/timestamps; it retains ticket contents, relationships and populations. It omits the old unmeasured timing-start boards. Therefore this replay is comparable fixture generation, not a claim of byte-identical recreation of the original SQLite backup. The committed raw results remain the original measured observations. No SQLite/user database is distributed. Both bundled exports were successfully re-imported through the actual API into a fresh in-memory database (1,005 / 10,005 tickets, board IDs 1 / 2); this checks portable fixture validity, not benchmark timing.

Results are bounded local observations. Devices, browsers, network conditions and task patterns can differ; these results apply to List selection.
