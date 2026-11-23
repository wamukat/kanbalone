# CI follow-up

Initial PR #34 CI run 44993898053 passed 162/163 E2E tests. The existing full-editor unsaved-edits test pressed Escape after the updated body appeared, while the post-save board refresh could still hold editorSaving=true and editor-form.inert=true. The saving guard correctly refused dismissal. The relevant editor runtime is unchanged from main.

The original test reproduced the same failure locally (19/20 passed across five repeats). The test now waits for editor-form.inert=false before Escape, preserving the body assertion and both dialog-closed assertions. No fixed sleep or runtime change was added. All 20 repeated tests passed after the correction.

An independent reviewer confirmed the diagnosis and reviewed the two-line change: no blockers. This follow-up changes only test synchronization; the runtime fingerprint, screenshots and performance samples remain applicable. Final required checks are recorded on the implementation PR. [PR #34](https://github.com/wamukat/kanbalone/pull/34)

All 20 embedded images were verified in the tracker. There were 18 at 1440×1000 and two mobile images at 390×844.
