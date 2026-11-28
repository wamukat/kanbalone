# Changes since last view

When a ticket is reopened after another person or tool makes an edit, the comparison lets the reader see what changed since the last successful view in the same browser. The baseline opens the current ticket details and shows operation-by-operation history on demand. It does not retain a previous-view baseline or offer a comparison of the two views.

## Comparison setup

Captured on 2026-11-28 JST with Chromium 159.0.8154.6, Playwright 1.65.1, macOS 26.7.3 and Node.js 26.13.1. Baseline main is `de6a37f3cd8ea8cb87166d6496d112f12ac9a2da` and the candidate is `239f5b3c1d00e0c5a2a990837e3a306384259597`. Both use separate copies of one SQLite snapshot seeded through the baseline API. The [manifest](manifest.json) records the unaltered browser PNGs, viewports, and source fingerprints.

Final runtime `bd54ddd9b0fa43d21f79d37f6b3c5ed26b526937` adds the old and new color values for changes to the same tag and reuses the Japanese label for opening full text. It keeps the selected view during same-ticket Markdown navigation, ignores delayed navigation responses after the route changes, and preserves active controls and text selection during background updates. These adjustments do not affect the states captured here.

The synthetic board **復元確認** contains ticket #1, **復元手順の確認と引き継ぎ**. State A uses the old checklist. Between views, an API caller creates state B by changing the body, lane, tags, parent and blocker, editing a comment, replacing one comment and one Task, and changing Task #1’s body and completion state. While B is displayed, another API update creates C by adding one body line and a comment and reopening Task #1. These are real writes to separate synthetic app databases.

| View | Baseline | Candidate |
| --- | --- | --- |
| First open at A, Japanese light, 1440 × 900 | [Current ticket details](before-ja-light-first-open.png) | [First-view message](after-ja-light-first-open.png) and a browser-local basis for the next open |
| Reopen at B after the same API changes, Japanese light, 1440 × 900 | [Current B only](before-ja-light-reopened.png) | [Comparison A→B](after-ja-light-reopened.png) |
| Reopen at B, English dark, 390 × 844 | [Current B only](before-en-dark-reopened-narrow.png) | [Comparison A→B](after-en-dark-reopened-narrow.png) and [Task details](after-en-dark-task-details.png) and [comment details](after-en-dark-comment-details.png) |

## Fixed comparison and storage

1. Open A from its List row and close with Escape. Reopen B after the edit and check that the comparison contains both versions. The open in state B stores B as the basis for the next visit. Browser IndexedDB reads verified the body, Task and comment data in the stored snapshots.
2. Create C while the B dialog is open. Use the arrow keys to switch to [the current-ticket tab](after-ja-light-normal-while-open.png) and back to [the fixed A→B comparison](after-ja-light-comparison-stays-a-b.png). The update notice appears, but the comparison and stored B basis stay unchanged. Switching tabs does not fetch a new full comparison snapshot. The current-ticket tab shows C.
3. Close and [reopen for B→C](after-ja-light-reopened-b-c.png). Close and reopen again without any edit to obtain [no endpoint changes](after-ja-light-no-change.png). Independent API reads verified three increasing snapshot revisions, the expected ticket, comment and Task values, and the activity IDs in each bounded interval. A delayed B snapshot in a separate tab did not overwrite the C basis saved by another tab.
4. In the current view, make a draft body edit. Escape opens the discard confirmation. Cancelling preserves text, focus and selection. Confirming discard in a separate editing session closes the detail and returns focus to the List row. The current ticket and stored basis still match C.

The same notification and fixed comparison also work from the [custom view](after-ja-light-custom-view-update.png). Switching to the current ticket shows the update. Reopening from the custom view includes it in the comparison.

## Failure states

- [Snapshot retrieval failure](after-ja-light-retrieval-failure.png) was simulated with HTTP 503 on the comparison snapshot GET only. The browser kept A as its stored basis and could compare A→C after the override was removed and the ticket reopened.
- [Browser storage failure](after-ja-light-storage-failure.png) was simulated by rejecting writes to the comparison IndexedDB. A→C remains readable, A stays stored, and a new open repeats the comparison.
- [Invalid previous baseline](after-ja-light-invalid-baseline.png) was exercised by changing the saved browser series identifier to another valid-format value. The app reports the invalid basis, saves C and reports no changes on the next open.

Separate API verification in `test/app-ticket-visit.test.ts` confirms that a restart keeps the comparison series. The official backup and restore commands and a physical file copy each create a separate series while retaining the ticket, recorded state and activity watermark.

The captures cover Chromium at the stated viewport sizes. After cancelling the nested discard dialog with Escape, an immediate second Escape or backdrop click did not reopen the confirmation in either comparison build. The editor retained the input. The test separately verified confirm-and-discard from a fresh edit. Browser storage failures and stale responses use controlled simulations. Other engines and a physical phone were outside this capture run.
