# Reduce repeated hierarchy scans in List and Group

[Implementation PR](https://github.com/wamukat/kanbalone/pull/32)

Status: implementation and automated checks passed; independent review recorded in `review.md`. This was an initial performance improvement. API collection and large Kanban and Group rendering remained at the time.

## Change

List's default hierarchy order scanned every ticket for every root. Group repeated the same full scans for roots, children, remove-button counts and candidate search. Build ID/parent indexes once for each collection render instead. Rebuild indexes on refresh; do not cache membership across updates. Group candidate labels read counts without copying a large child array for each result.

No CSS, API, paging limit, visible rows, default sorting, archive behavior or keyboard commands changed. Single-item `relatedTickets` operations outside render keep their existing path. No production data was used or changed by this evaluation.

## Environment and reproducibility

- Baseline: `b7dc02e` (GitHub PR #31 merged), static assets copied before edits into `coverage/performance-1512/public-before`.
- Candidate: same backend plus three public modules (fingerprint in `revision.json`).
- Native Node 26.13.1, macOS 26.7.3, Intel i7-9750H, 16 GB RAM; local HTTP, no network shaping.
- Fresh-context navigation uses bundled Playwright Chromium (version recorded in revision metadata). Manual browser inspection uses agent-browser 0.26.0 / installed Chrome.
- Same isolated SQLite fixture for both variants, never the user's database. Based on `../2026-11-22-paging-performance/seed.py`: 1,000 and 10,000 tickets, approximately 70% completed, 500-character descriptions, one tag. Every ticket additionally belongs to one Group per board. `seed-context.py` adds 20 parent/child pairs per board: ten archived parents, ten completed parents, all twenty children open. Group therefore has archived-parent context rows. Synthetic timing-start boards inherited from the earlier lab are not measured.
- Viewport 1440 × 1000, light theme; Japanese and English captures at the same initial viewport/scroll. Twelve PNGs are unaltered captures of actual screens.

Reproduce in an isolated checkout: copy the earlier benchmark database using SQLite backup, create each Group through its API, assign its board's tickets in the disposable database, and run `seed-context.py`. Serve baseline static copy on 3595 and candidate on 3594 using `buildApp` with that database. Run `measure-views.mjs` from repository root under Node 26. Run `profile-functions.js` via browser evaluation on each origin (or the accompanying runner). See harnesses for exact selectors and counts.

## Measurement boundaries

`navigation.json` records three fresh browser contexts per combination of variant, 1k/10k, and List/Group/Kanban. `first` is page navigation start to the first matching rows plus two animation frames. It includes resources, API pages, JavaScript and rendering; it is a paint proxy, not user reaction time or INP. `complete` additionally waits for all expected Group rows or Kanban cards (313/3,013), plus runner observation overhead. List already virtualizes rows; its complete field does not mean 10,000 DOM rows. Long-task entries cover the observation through completion. Samples are sequential before then after, not randomized/counterbalanced; shared-machine noise applies.

`functions-before/after.json` isolates List model building, Group HTML generation and candidate matching after data is fetched. Each has one warm-up plus five measured repetitions using `performance.now()`. These are not whole-screen times. API and DOM insertion/layout are excluded. Profile Groups use the real ticket collection with a minimal in-memory heading; actual Group screens are measured separately above.

An initial agent-browser repeated-navigation harness accumulated queued requests (one resource waited about 48 seconds) and sometimes observed stale board content. Those timing samples were discarded. The retained harness uses a fresh browser context per sample and checks target row/card counts. Browser startup and cold HTTP resources differ from the earlier warm board-switch benchmark, so do not compare the absolute times to that report.

## Preserved behavior and limitations

- Regression tests cover sorted parent/child order, missing-parent fallback, explicit flat List sorting, fresh membership indexes, archived-parent/open-child context, hidden archived-only rows, parent-only removal actions/counts, chosen-family exclusion, and 2,000-child option counts.
- Screenshots show that the visible interface is unchanged. They do not prove timing, persistent writes or keyboard ergonomics. This read/render-only change does not add writes; data and hierarchy behavior are separately checked.
- Kanban rendering is not changed. Group still inserts all selected Group rows; List and Group still aggregate all required API pages. Large data can still take seconds to display. Treat bounded API collection/virtual rendering as subsequent work, preserving sorting, related-ticket context, selection and keyboard/drag behavior.
- This record covers the hierarchy-rendering change. No production migration, publication or local runtime replacement performed.

## Observed results

Median milliseconds; three fresh-navigation observations per cell.

| Tickets | View | First rows before → after | Complete before → after |
| --- | --- | --- | --- |
| 1,000 | list | 492 → 438 | 527 → 475 |
| 1,000 | group | 800 → 682 | 844 → 727 |
| 1,000 | kanban | 308 → 319 | 459 → 437 |
| 10,000 | list | 1,563 → 1,010 | 1,609 → 1,058 |
| 10,000 | group | 7,623 → 3,950 | 7,645 → 3,977 |
| 10,000 | kanban | 634 → 613 | 2,706 → 2,674 |

List and Group improve in this local fixture. Kanban has no targeted change; its differences are noise, not an attributed gain. At 10k, Group still takes about four seconds and Kanban still builds 3,013 cards in about 2.7 seconds.

### Isolated JavaScript work

Median milliseconds, one warm-up plus five measured calls; this excludes API and DOM/layout.

| Tickets | List model | Group HTML | Group candidate match |
| --- | --- | --- | --- |
| 1,000 | 10.9 → 0.3 | 42 → 2.4 | 15 → 0.2 |
| 10,000 | 1039.7 → 4.2 | 1981.2 → 37 | 417.6 → 2.1 |

`served-inputs.json` independently verifies identical ticket-response bytes on both origins (1k and 10k), with different hashes for all three changed JS assets. All six before/after screenshot pairs are byte-identical: the speed change deliberately preserves the visible output.

## Verification

`pnpm check` passed: 196 unit/API tests, backend and public JavaScript type checks, OpenAPI lint and documentation build. The affected Group/visual/focus and List/Kanban keyboard E2E suite passed all 25 tests (1.4 minutes); logs are `check.txt` and `e2e.txt`. Tests ran after timed measurements, then the corrected Kanban-only measurements ran after tests finished.

The initial Kanban first-row observer could see startup board 1 before route board 2. Its first-row samples were discarded and all Kanban samples rerun with target ticket-ID bounds (1–1,000 or 1,001–11,000) before the two-frame observation. Both retained harnesses include this guard; `measure-kanban.mjs` replaces Kanban samples without modifying List/Group results. The complete-card counts are also asserted. Screenshots were recaptured in this rerun.
