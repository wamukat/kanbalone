# #1510 implementation and visual review

Date: 2026-11-22 (JST)
Independent reviewer: `paging_spec_review`

## Code review result

No remaining blocking code issue was found after the following findings were corrected:

1. Completion expansion/refetch treated newly fetched older rows as new completion arrivals and reset scroll. Arrival detection now compares the visible head and completion time, rather than any previously unseen ticket ID. Successful append also updates known IDs.
2. Moving priority filtering to the server removed lower-priority blocker references from a filtered List. The List loader now separately aggregates the same collection without the priority filter, preserving prior reference/selection semantics. It compares the revisions of displayed and reference collections before exposing them.
3. Independent lane requests could assemble data from different revisions, duplicating or omitting a moved ticket. The backend exposes `X-Kanbalone-Ticket-Revision` from the same read transaction as the page; the GUI compares revisions and retries the whole lane collection within a bounded limit.

The final typed `app-ticket-collections.js` and `app-ticket-pages.js` helpers preserve these safeguards. Rows are staged until a collection is complete; stale requests/aborts do not publish partial results. Same-context refresh failure keeps the previous view keyboard-accessible; changed-context failure does not enable navigation into stale results. Completion More failures retain existing rows and permit retry.

Backend review covered keyset predicates and mixed-direction ties, HMAC cursor/query binding, persisted per-board revision triggers, cross-board dependencies and cascades, consistent count/row/summary reads, legacy no-options fast path, and explicit unpaged order. No unresolved blocker was found. The additive migration and its Japanese/English upgrade guidance agree; the cursor does not promise continuation after database replacement/restoration.

## Verification reviewed

- Reviewer independently executed `test/app-ticket-pagination.test.ts` under Node v26.13.1: 5 tests passed at that review point. Backend agent subsequently added completion timestamp edge cases and reported its regression runs passing.
- Read and reviewed `test/app-ticket-collections.test.ts`, `test/app-ticket-pages.test.ts`, and `test/e2e/pagination-consistency.spec.ts`. Frontend agent reported 11 helper tests and the real-move/mixed-revision browser test passing. These tool-run reports are not represented as nonexistent saved log files; the root agent's final check/full-suite log is the durable aggregate record.
- Directly read `coverage/pagination-evidence/e2e-final.txt`: 8/8 passed (2.5m), covering Japanese/English bounded requests and cross-page hierarchy, expansion/SSE/priority, failed append retry, Group 409 recovery, existing completion-toggle behavior, lower-priority blocker links, and stale continuation recovery to 105 unique tickets with scroll preserved.
- Independently parsed both `before-persisted.json` and `after-persisted.json`: each has 260 tickets, `unchanged: true`, and exactly equal before/after exports.
- Independently parsed the 20-state `comparison.json`: no differing Group IDs, List IDs or scroll comparison flags. The intentional priority-filter reset changes visible done tickets from 17 to 5 with 12 remaining; it is documented rather than classified as visual parity.

## Actual screenshot inspection

Used `view_image` to inspect 10 before/after pairs (20 original images):

- Japanese Kanban initial, detail, and priority-filtered states.
- English Kanban 55-ticket expansion and detail-return states.
- Japanese and English List parent/child search results.
- Japanese Group parent/child state.
- English Group initial and archived-ticket states.

No new visual blocker was found. Sidebar placement, existing white surfaces and controls, ticket/status/lane alignment, parent/child indentation, archive icons and return focus remain consistent. The priority-filtered completion lane exposes the expected five tickets and remaining-count action without a new pagination UI. These observations support visual consistency; they do not claim that screenshots prove request timing, persistence, or general human usability.

## Remaining completion gates

The final source-fingerprinted recapture and the root agent's full E2E run were still in progress when this review record was first written. Final recapture initially timed out because the capture harness reset local storage during page initialization and an old priority filter was restored. The evidence agent observed `q=Verify` plus `priority=4` (correctly returning no rows), corrected the harness to settle the view and explicitly reset filters, and is recapturing. Do not count that failed capture attempt as a product failure or as completed evidence.

This independent review is not authorization to merge or release; those remain subject to user acceptance and required checks.

## Final provenance confirmation

The corrected final capture completed all 20 states. Independently verified `after-revision.json` has `sourceUnchangedDuringCapture: true`; its source SHA-256 is `f4b063321035df83da396f47e6f6e5f74ef2c4fab987d0c2147f04c3f741ac68`. Every recorded `src`/`public` file still matched its captured hash at final review. Independently compared the final trace against the baseline: all 20 Group/List ID and scroll entries match, and completion IDs match except the documented priority-reset scenario. Final persisted data remains exactly unchanged.

Reopened final-capture Japanese Kanban detail-return, English List parent/child, and English Group initial images with `view_image`; they retain the inspected visual behavior. The evidence directory now includes durable `e2e-final.txt` showing 8/8 passing critical tests.

**Independent implementation and visual review: approved, no unresolved blocking findings.** The root agent's broader full-suite result remains a separate completion gate and must be reported accurately when it finishes.
