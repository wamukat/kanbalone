# Choose a ticket's move destination

Captured November 28, 2026 JST for [issue #99](https://github.com/wamukat/kanbalone/issues/99). Baseline `78dce9fb4964bed2d7b1cccd663484c6f3dc6e49`, candidate `74175ee45fe621704a44f9135e720679048317cb`. Both ran locally against isolated copies of a synthetic fixture. The PNGs are unaltered browser captures.

## Reproduce the initial state

1. Create `Release review` first with lanes `Planning` and `Review`, then `Operations desk` with lanes `Todo` and `Review`. A third board, `Support desk`, has one lane.
2. Create `Verify restore instructions and handoff` in `Operations desk` → `Review`. Start from List, open the ticket, click the header pencil, and click Move in the editor.
3. Repeat at 1024 × 768 in Japanese light mode and English dark mode, starting from the same fixture each time.

| Browser state | Baseline | Candidate |
| --- | --- | --- |
| Japanese, light | [Initial picker](before-ja-light-initial.png) | [Initial picker](after-ja-light-initial.png) |
| English, dark | [Initial picker](before-en-dark-initial.png) | [Initial picker](after-en-dark-initial.png) |

Opening the picker should show the ticket's saved board and lane and require both destination selections. The baseline immediately selected `Release review` and its same-named `Review` lane, with Move enabled. The candidate shows `Operations desk` → `Review` as the source and initial values. Move stays disabled [after choosing `Release review`](after-ja-light-board-chosen.png) and becomes available [after explicitly choosing `Review`](after-ja-light-destination-chosen.png).

## Reject a stale lane and finish the move

1. On the candidate, select a temporary empty lane in `Release review`, remove that lane through the API in the test fixture, and click Move. The actual API rejects the obsolete lane with HTTP 400. The picker [keeps both values and displays the error](after-ja-light-write-failure.png). A fresh ticket GET equals the pre-attempt result, including the source board and lane.
2. Select `Review` and submit again. The API accepts the move. Reload the ticket and verify [the destination in the opened detail](after-ja-light-moved-reopened.png). A fresh GET confirms `Release review` → `Review`, the original title and body, and `handoff` mapped to the destination's tag. The source Group, parent and related link cleared, and the ticket activity records the move.

In a separate run from the initial state, Escape returned focus to the Move button from the selected destination. Reopening showed the saved source board and lane. At 390 × 844, the candidate dialog measured 350 CSS pixels wide and its contents fit horizontally.

## Checks and limitations

- `pnpm check` passed all 297 tests and completed the build, public type check and docs build. The focused Chromium run passed all 12 tests in `ux-move-regressions.spec.ts` and `action-recovery.spec.ts` with one worker.
- The Chromium tests additionally cover interrupted/failed lane loading, preserving an uncommitted edit on cancellation and write rejection, locking the picker during the request, preserving the committed move when the following refresh fails, and existing bulk actions. Network failure responses in those tests are injected. The write-rejection image above comes from the actual API against a removed synthetic lane.
- The captures and measurements cover desktop Chromium and the specified narrow viewport. Human usability remains to be evaluated.
