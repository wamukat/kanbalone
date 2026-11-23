# Ticket opening and first relation search

[Implementation PR](https://github.com/wamukat/kanbalone/pull/38)

Local measurements on baseline main `ac23f0f` and the candidate production sources recorded in performance-revision.json. Synthetic fixtures use 100 open tickets plus 0 or 9,900 completed. Both versions initially render the same open tickets and up to five completed; before/after fixture table contents are identical.

Median milliseconds, one warmup excluded and five alternating measured runs per condition:

| Tickets | Operation | Before | After |
| ---: | --- | ---: | ---: |
| 100 | new | 49.8 | 35.3 |
| 100 | detail | 46.3 | 45.3 |
| 100 | search | 51.3 | 52.1 |
| 10,000 | new | 645.9 | 41.1 |
| 10,000 | detail | 694.6 | 52.1 |
| 10,000 | search | 43.3 | 704.8 |

`new` and `detail` measure keydown to open dialog plus two animation frames, after the Kanban has settled. `search` measures input to matching relation options plus two frames in the just-opened new editor. The target #100 exists in both populations, and the complete match IDs are retained in raw records. These are separate per-operation medians, not a summed end-to-end median.

The change removes the full collection from opening (100 tickets: 1 request; 10,000 tickets: 50 requests). The first relation search now performs those same requests. New opening needs no ticket request; detail still fetches the target, activity and events. This is a reduction of unnecessary work when no relation search occurs and a transfer of waiting when it does. It does not reduce first-search collection volume or claim to fix the earlier unreproduced 859ms observation on the real102-ticket board.

## Method / limits

- Same backend, Node26.13.1 and Chromium on the same host. Separate copied SQLite fixtures, fresh browser context per operation,1440×1000,light,en-US. Source and table fingerprints are recorded. Benchmark does not write tickets.
- Baseline serves its archived public source; candidate serves real changed files. Only app-state.js is instrumented identically to expose readiness for observation; it does not alter state or timing logic.
- Variant and population order alternate. One warmup per condition is excluded. All raw samples and resource requests are retained.
- No E2E/check suites ran during the final measurement. Separate actual screenshot capture overlapped part of the run; this is a local observation with possible host-load variation, not a device/network guarantee. Preliminary runs with concurrent E2Es are excluded from this report.
- Late-page and archived candidate completeness, failures and saved results are tested separately. Screenshots alone do not prove timing or persistence.

## Reproduce

From repository root with exact Node26 and dependencies:

1. Create `coverage/editor-perf/baseline`; extract `git archive ac23f0f public` there.
2. With empty fixture paths, run `node --import tsx docs/development/evidence/2026-11-22-editor-candidates/performance-seed.mjs`.
3. Start performance-server.mjs for `before 0`, `after 0`, `before 9900`, `after 9900` on3631,3632,3635,3636.
4. Run `node docs/development/evidence/2026-11-22-editor-candidates/performance-measure.mjs`. It writes coverage/editor-perf/measurements.json. Avoid concurrent heavy workloads.

After this measurement, final CSS added only `min-width: 0` to `.ticket-relation-status` to prevent the narrow retry row from overflowing. `sourceSha256` records the measured source; `finalSourceSha256` records the final source. JavaScript and the measured desktop success paths are unchanged. The narrow fix has separate visual/geometry verification; the benchmark was not silently relabelled as a different source.
