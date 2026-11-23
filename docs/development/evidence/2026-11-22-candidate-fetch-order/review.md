# Independent review — 2026-11-22 JST

Reviewer `group_probe_review` inspected source consumers before implementation and found no dependence on server position order: all four candidate lists sort by priority/ID, selection follows selected-ID order, remaining consumers use ID lookup/parent-ID membership. Cursor/order binding, complete-collection publication, revision retry and generation/abort behavior are unchanged.

Implementation review found a mistaken ID-substring assumption in the new E2E and visual selection loop. Both were corrected to unique titles and rerun without changing product matching. Existing11 E2E plus corrected new case and final build pass; reviewer did not independently rerun tests.

Final reviewer independently recalculated all API/browser medians, confirmed complete per-ID payload hashes across API phases, candidate ID/order/focus/no-error invariants in60 retained operation records, and the exact source fingerprint. All eight visual records agree for four picker lists, selected order [5,4], cancellation, saved relations and reload.

Actual en-light blocker before/after, ja-dark child before/after, selected and saved images were reviewed with no visible candidate/label/layout regression.20 of26 pairs are byte-identical. The remaining6 pairs' small raster differences and unestablished cause are disclosed in README/image-comparison.json, as requested by the reviewer.

Decision: no blocker; ready for PR/user acceptance after CI and ticket image loading verification. Review is not merge or release authorization. Complete collection and large DOM costs remained outside the scope of this review.
