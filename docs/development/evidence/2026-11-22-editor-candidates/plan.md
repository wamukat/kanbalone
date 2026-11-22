# #1518 — Plan reviewed before implementation

Baseline: merged main `ac23f0f12b9efb7da330b9b4142c87642ba9441c`. Normal localhost:3470 was updated and evaluated before choosing this work. Existing data is not used for screenshots or writes in this change.

## Decision and scope

The normal 102-ticket board showed approximately 90–120 ms repeated new/detail opening. One first new operation took 859 ms, of which 815 ms was its collection request; it did not recur in fresh-page checks. Its cause remains unknown. A separate 10,000-ticket fixture showed about 630 ms opening with 50 collection pages. These observations are distinct; this work does not claim to fix the unexplained first request.

Keep the existing API and relation matching semantics. Remove the collection dependency from new/detail/edit opening. Fetch the full, archived-inclusive candidate collection only on the first nonempty relation search. This reduces work for users who never search relations; it moves collection wait for users who do. Measure both paths.

## Reviewed implementation plan

1. Render existing relation details and selected chips from the target ticket response. Use its `blockedBy` for Blocks instead of scanning the board collection. This normalizes Blocks order to the same priority/ID order used by relation responses; do not describe the entire presentation as pixel-identical.
2. Own candidate data inside the editor. Do not overwrite the board view's partial/full collection. One in-flight request is shared by four relation pickers, and partial pages are not exposed as a complete candidate set.
3. Keep ID/title matching, candidate priority/ID ordering, archived/completed inclusion, parent/child eligibility, inverse dependency exclusions, and selected-parent expectations unchanged.
4. Use cancellation and generation checks across close/open/board changes; invalidate after saved ticket refresh. An old result must not update another editor, clear input, reset selections, move focus, or reopen a closed picker.
5. Loading and explicit retry remain in the existing options area. Loading does not mean no matches. Enter must not select stale options. Normal new-ticket save does not wait for candidate retrieval.

## Verification plan

- Dedicated E2Es: no collection on opening; retained selected relations; unchanged/removal saves; archived and later-page candidates; shared in-flight requests; failure/retry; input/focus and keyboard behavior; old responses after close/reopen; saving and reediting.
- Actual JA/EN comparable before/after screenshots with synthetic data, saved-result checks, and relevant dark/narrow states. Screenshots alone do not prove persistence or timing.
- Alternating warmup plus repeated measurements on 100 and 10,000 tickets, reporting open time separately from first relation search, collection request count and body bytes. Same backend/environment and fixture content.
- Full normal check and appropriate browser regressions after source stabilization.
- Independent source and screenshot review; resolve findings before Acceptance. Require user acceptance and passing CI before merge. Normal runtime remains on reviewed main during implementation.

Policy reviewer: `1518_policy`, read-only review completed before implementation began. Implementation, browser verification and performance measurements are assigned separately.
