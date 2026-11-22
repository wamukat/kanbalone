# Independent review — #1515 Group initial retrieval

Reviewer: `/root/create_1511_review`, separate from implementation and measurement authors. Baseline `09ad816c1fb51c3a0af143ee0cee477e2964eee9`. Reviewed fingerprint `dcea4ba770efd0013d1bd8fd52ec8841b57bc9c7f78ce4142f6eb8e83e150bbc`; independently verified all four source/test hashes in `revision.json`.

## Semantics and cache lifetime

No blocking issue found in the two production changes. Group requests explicitly select the existing `id_asc` order; the page collector preserves that parameter, stages the complete collection and retains its revision/retry guards. Both roots and children receive the existing priority-descending/ID-ascending display sort. Candidate search order, public defaults, limits, response fields and full member visibility are unchanged. The new mixed hierarchy/archive/orphan regression fixture checks equal HTML and action targets for the different input orders.

Group metadata reuse is local to a single synchronous `mapTicketSummaries` invocation. `ticketGroupFields` with its default `includeEdit=false` depends on Group ID, so no ticket-specific edit token is reused. Null and missing Groups preserve their previous result. Returned Group objects are copied per ticket; callers cannot mutate a sibling's Group through aliasing. A new call/page/request builds a fresh map. Regression tests cover mixed Groups, null membership, independent object identity, rename and membership changes.

## Appearance and stored results

Inspected actual Japanese mixed/archive and English saved/renamed before/after screenshots, plus the large English fixture pair. Hierarchy, completion/archive columns, white surfaces and existing controls remain unchanged. The six small-fixture image pairs have zero decoded-pixel differences; the two large language pairs also match. This supports layout parity, not speed.

Reviewed both languages' raw interaction records before and after: existing ticket order and archive order agree; description controls retain ticket nodes; saved description and membership are recorded; subsequent Group rename is reflected in fresh summary results; removed membership is null; reload persistence and unchanged original-ticket checks pass. These are separate from read-only benchmark data. The reviewer inspected the recorded browser evidence rather than rerunning these sequences.

## Measurement assessment

Reviewed the navigation script and independently recomputed every primary median from the raw samples, excluding the four warm-ups. Five measured samples per size/variant remain. All 24 observations have expected row/page counts, matching ordered ticket IDs and matching scroll height. Timing starts at navigation and waits for the target Group's full row count/ID range plus two animation frames. This correctly avoids counting initial default-board work as target completion while including it in total navigation cost.

At 10,000 members, median initial display is 3,955.5 → 3,456.0 ms; Group page collection is 1,000.1 → 529.0 ms. Post-response display remains 2,571.8 → 2,561.6 ms. At 1,000 members total display is 677.1 → 676.2 ms, so there is no meaningful overall gain measured there. The report appropriately attributes the measured improvement to retrieval, not solved rendering cost. Separate lookup/order probes are diagnostics, not additive speedups or the final production benchmark.

These local alternating runs are useful comparative evidence, not a human task-time, INP or cross-device guarantee. Large DOM/layout remains an explicit follow-up. No visible row cap, API page-size increase or rejected whitespace/content-visibility experiment is included.

## Validation and decision

Full check log records 198 passing tests with type/lint/document checks. Reviewed final affected E2E log: 50 tests passed in 3.8 minutes. These checks were run by the separate verification agent, not rerun by this reviewer. No remaining source/evidence blocker found; user acceptance, ticket image attachment and Required CI remain separate gates. No merge, release or production-data change is authorized by this review.
