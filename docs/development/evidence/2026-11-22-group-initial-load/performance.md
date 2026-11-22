# #1515: Group initial retrieval and display

## Scope

Two compatible internal changes: fetch selected Group members with the existing `id_asc` cursor order, and reuse Group metadata lookups within one ticket-summary mapping call. The public default order, page limit of 200, response fields and complete member collection remain unchanged. Group's visible priority/parent order is applied separately, as before. Candidate-search order is not changed.

The backend cache lives only within one `mapTicketSummaries` call, including one page. Later requests read current names/memberships. Each returned ticket gets its own Group value object. Ticket-detail edit tokens and detail lookup paths are not changed.

## Combined browser measurement

Baseline: merged main `09ad816c1fb51c3a0af143ee0cee477e2964eee9` (PR #34). Candidate: this patch, with source hashes recorded by the verification report. Both isolated runtimes use identical copied synthetic data: 1,000 or 10,000 Group members, mixed completed/archived parents and open children, one long Group description, five unassigned candidates per board. Board totals are therefore 1,005/10,005. No production/user data was used.

Environment: native Node 26.13.1, Playwright Chromium 159.0.8154.6, macOS 26.7.3, Intel i7-9750H, 16 GB, local HTTP. Viewport 1440×1000, light. Timing observations use English; equivalent Japanese/English actual screenshots are included. Heavy local tests paused during measurement.

`performance-navigation.json` retains 24 observations: one warm-up and five measured runs per variant and dataset, alternating before/after order. Every sample starts a fresh browser context. The initial-display proxy is navigation start until the requested Group's complete member row count and target ticket IDs appear, followed by two animation frames. It includes application startup and its initial default-board work; the ticket-ID guard prevents that earlier board from being mistaken for the target. Resource timings isolate the selected Group's ticket-page collection. This is not INP, a human task time, or a randomized performance guarantee. Server/OS caches and shared-machine variation remain factors.

Median milliseconds, excluding warm-ups:

| Group members | Initial display before → after | Ticket collection before → after | Last ticket response → display before → after |
| --- | ---: | ---: | ---: |
| 1,000 | 677.1 → 676.2 | 57.4 → 31.5 | 259.5 → 272.6 |
| 10,000 | 3,955.5 → 3,456.0 | 1,000.1 → 529.0 | 2,571.8 → 2,561.6 |

At 10k, initial display was about 500ms faster in this fixture, with the gain in retrieval. **There is no measured overall initial-display improvement at 1k.** Rendering after the last response remains about 2.56 seconds at 10k; this patch does not solve large DOM/layout cost.

Both variants made 5/50 Group ticket requests and displayed all 1,000/10,000 rows. Every recorded displayed-ID sequence and scroll height matches across variants and repetitions. `performance-inputs.json` verifies identical legacy API payload bytes for both boards, including all current Group metadata. Four `performance-{before,after}-group-{en,ja}.png` files show the actual large fixture. Their pixels do not establish speed; timing, ordered IDs and behavior tests provide separate evidence.

## Independent attribution probes

These diagnostics preceded the production patch and are not additive performance guarantees:

1. **Fetch order only**, `diagnostics/api-order.json`: old backend, Python HTTP + JSON decoding, alternating `position_asc`/`id_asc`, 200-row pages, one warm-up plus three measured runs. 10k full Group collection median **942.3→758.2ms**; 1k **59.08→55.62ms**. Sorted full-record hashes match in every run. Hash sorting is outside the timed region. No API page-size increase.
2. **Repeated Group lookup only**, `diagnostics/group-lookup-results.json`: in-process baseline backend with an experimental per-page memo intercepting only `SELECT id,name FROM groups WHERE id=?`, five alternating repetitions, position order unchanged. Medians **45.49→14.14ms** at 1k and **606.12→356.53ms** at 10k. This omits HTTP/JSON encoding and is a diagnostic proxy, not the final cache implementation. The script's `lookupCalls` counts intercepted prepare calls, not database cache misses. Run that historical script against baseline `09ad816`, not the already-optimized candidate.
3. **Whitespace-only DOM nodes**, `diagnostics/compact-probe.json`: browser-only replacement of Group row markup, no production changes. Removed 39,980 whitespace text nodes while preserving elements, full row count, scroll height and top/bottom bounds. Two observations per variant gave baseline 6,576/4,240ms versus compact 5,084/4,345ms, dominated by cold/order variation. The warmed comparison did not show a gain, so the regex/markup compaction was rejected and is not in this patch.

The earlier `content-visibility` prototype was also not adopted: variable-height rows changed scroll geometry. Its record is separate from this measurement.

## Reproduction and limitations

Run `performance-navigation.mjs` from the repository root with dependencies installed and Node 26. It expects baseline on 3606, candidate on 3607 and the same isolated mixed #1514 performance fixture; results are written under `coverage/render-next/`. That fixture's copy/setup is documented in `../2026-11-22-group-partial-render/performance.md`. Start the two checkouts with their own source/static trees and separate SQLite backups; `PORT` and `KANBALONE_DB_FILE` can select those endpoints. The navigation script does not perform API writes.

The order probe expects the baseline API on 3606. For the historical Group-lookup probe, copy its script back to `coverage/initial-render/` in a baseline checkout, point its readonly database path at the synthetic fixture, and run with `node --import tsx`. The whitespace diagnostic uses a browser route override; the archived `compact-group-view.js` is only a rejected prototype, not a shipped module. Copy those diagnostic files to `coverage/render-next/` before running its script.

Japanese/English smaller-fixture interaction and persisted-state verification is separate from these read-only timings. The separate verification report records the regression results for altered backend names/membership and Group hierarchy/archive behavior. Real-user timing, other browsers/devices, and large initial DOM optimization remain unverified or out of scope.
