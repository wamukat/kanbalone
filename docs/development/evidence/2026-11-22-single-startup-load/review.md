# Independent review — #1517 single startup load

Reviewer: `/root/create_1511_review`, separate from implementation and evidence authors. Reviewed baseline `1c87193ec553cbbd4bbc563f5a28b7ee67611600` and candidate fingerprint `21c3180f3b23afd4de64b0bf89bf9daf3ddbfa689688f69d6e118871d0f8f566`. Both source/test hashes match `revision.json`; runtime app.js SHA-256 is `4e02a8613f22e6a16733e6039b6a31cdbe4588c69acce2d85e3d4c9f59777b2e`.

## Implementation and routing

No blocking issue found in the bounded change. Initial `refreshBoards({ refreshDetail: false })` still fetches the board list, prunes/restores/persists preferences and renders navigation. The router then loads the requested board once. Every route branch—board, ticket, home, missing-resource fallback and empty state—still reaches `refreshBoardDetail`. Explicit board routes retain their requested view; ticket routes restore their board's saved view. No new partial-lane state or deferred completion load is introduced.

The optional argument defaults to refreshing details. Board creation, rename, deletion, import and reorder-failure recovery still call `refreshBoards()` with their original behavior. Reviewed the eight focused routing tests, including remembered different-board Group/filter state, target List/ticket routes, missing routes and empty-board creation. Tests assert target-only requests and preserved other-board preferences; they do not merely check a screenshot.

## Actual UI and persistence evidence

Inspected actual before/after Japanese and English Kanban captures, Japanese List/Group pairs and expanded completion view. Existing panels, lane counts, completion controls, ticket placement and view layouts remain consistent. Raw request records show the startup detail request count going from two to one for each of the six language/view routes. Kanban ID sequences match. The global DOM-ID query also included hidden stale Kanban cards in baseline List/Group views; it is explicitly recorded as `queriedDomIdsIncludingHidden` and is not a visible-count oracle. List/Group parity instead relies on actual images and focused content assertions. All eight decoded image pairs are pixel-identical.

Both language sequences confirm five completion cards expanding to seven, keyboard creation in the intended board/lane, return to the originating ticket, saved GET values and visibility after reload. Images establish appearance; request records and stored/reload checks establish behavior. These browser runs were performed by the evidence agent and reviewed independently here.

## Performance and product-version boundary

Independently recomputed the implementation benchmark medians: 367.0 → 289.1 ms from five measured samples per variant after warm-ups. All retained samples show 100 open/5 completed cards and eight → four ticket requests. This measures navigation until settled readiness/counts plus two frames, not transient first paint. Baseline app.js is served by browser route interception while candidate is served normally; the documented asymmetry means the full difference is not a pure CPU-time saving. The request reduction itself is directly observed. No guarantee across devices or routes is inferred.

The separate completion-heavy investigation does not support deferring completion lanes: on merged main, adding 9,900 completed tickets adds about 24 ms to this initial display, while editor opening waits for full collection and grows to about 0.6 seconds. Actual SQL uses the existing completion index; no full-sort assumption is needed. Editor collection remains a separate follow-up.

Do not conflate these results with the running published v1.0.0. The separate release inventory confirms two full-list responses totaling 10,645,510 encoded bytes for the isolated old release fixture, versus 105,904 for merged-main lane queries and 52,952 after this startup fix. It is a request/payload inventory, not a speed comparison. Current paging benefits are already merged but not in published v1.0.0; this review does not deploy or release them.

## Validation and limits

Focused startup routing tests: eight passed. Full check: 198 tests plus type/lint/document checks passed. The broader affected E2E suite passed all 71 tests in 4.6 minutes. No remaining source or reviewed-evidence blocker found. User acceptance, ticket image attachment and Required CI remain separate gates. OS IME, assistive technology, other browsers and all viewports are not established by this review.
