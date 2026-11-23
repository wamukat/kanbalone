# CI follow-up: native drag readiness

Initial PR #36 CI run 44996849581 passed 162/163 E2E tests. The native drag test failed before any mouse action with “Drag cards must be visible”. Its fixture waited for the third card, then obtained two separate ElementHandles/bounding boxes. The trace shows two startup board fetches; the second refresh overlaps source-card handle resolution and can detach the first render's card before its bounding box is read. The startup/drag product implementation is unchanged from main.

The drag helper now polls only the read stage, obtaining both current visible, nonzero card rectangles in one synchronous page.evaluate. It does not retry the drag, force actions or sleep. Native mouse actions, persisted lane/position, cancellation/failure and reload assertions remain unchanged.

The original local test repeated five times passed all 15 cases; this local run did not reproduce the intermittent CI failure. The corrected test also passed all 15 cases. CI trace plus source inspection, not local deterministic reproduction, supports the diagnosis. An independent reviewer inspected the trace and helper diff and found no blockers.

No runtime, screenshot or performance change was made in this follow-up. The two runtime hashes recorded in revision.json remain valid. Final required checks are recorded on the implementation PR. [PR #36](https://github.com/wamukat/kanbalone/pull/36)

All 16 embedded images were verified at 1440×1000 in the tracker.
