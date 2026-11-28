# List blocker references

The List’s **Blockers** column was expected to retain a ticket’s blocker when a filter hid the blocker’s own row. On v1.6.0 (`4920daffe31a835a43996bead3a9f62f847d3f21`) and the comparison baseline, searching **ブロック** hid ticket #1 and changed ticket #2’s blocker cell from **#1** to **-**. The baseline List API still returned `blockerIds: [1]` for #2.

## Comparison setup

Captured on 2026-11-28 JST with Chromium 159.0.8154.6, Playwright 1.65.1, and macOS 26.7.3. Both app revisions ran on Node.js 26.13.1 with separate copies of the same SQLite snapshot seeded through the API. The baseline is main at `68468dc81b7263244b57e3cca58217a5dd1a0b57`. The candidate is `d99b0ab2346fde85e4587c998097da3f9fa8468e`. Both builds report version 1.6.0. The [manifest](manifest.json) records the unaltered browser PNGs and source fingerprints.

The synthetic board **依存関係レビュー** has an open blocker #1 for #2, a completed and archived blocker #3 for #4, no blocker for #5, and an open blocker #10 for #6. The keyword **ブロック**, lane **作業待ち**, and tag **復旧** each keep the dependent tickets and hide the open blocker rows. Archived rows are excluded by default.

| List state | Before | After |
| --- | --- | --- |
| Japanese light, 1440 × 900, no filter | [#2 shows #1. #4 shows a dash.](before-ja-light-list.png) | [#4 also shows its actual blocker #3.](after-ja-light-list.png) |
| Japanese light, 1440 × 900, search **ブロック** | [Every blocker cell shows a dash.](before-ja-light-search.png) | [#2 shows #1, #4 shows completed #3 with a strikethrough, #5 shows a dash, and #6 shows #10.](after-ja-light-search.png) |
| English dark, 1440 × 900, archived rows excluded | [#4 shows a dash.](before-en-dark-archived-blocker.png) | [#4 shows #3, with Resolved and Archived in the accessible name.](after-en-dark-archived-blocker.png) |

## Interaction and stored results

- After searching, focus **#1** in ticket #2’s blocker cell and press Enter. The [detail dialog opens ticket #1](after-ja-light-open-blocker.png). Escape returns focus to the same blocker link and preserves the search. The lane and tag filters also retain the blocker links. Toggling archived rows changes the row for #3 while #4’s blocker link stays available. The search requested the List page with `include_blocker_references=true` and made no per-ticket relations requests.
- With the search still active, reopen #1, use the full ticket editor to move it to **完了**, and save. The PATCH returned 200. After the board refresh, close the dialog and reload. The [search and completed blocker style remain](after-ja-light-saved-reload.png). Separate API reads returned `isResolved: true` and `laneId: 3` for #1 and `blockerIds: [1]` for #2. The isolated test then restored #1 to its initial lane.
- To exercise missing metadata, the browser intercepted one filtered List response after the save and removed only #10’s `blockerReferences` entry for ticket #6. The [browser displays (#10) as plain text](after-ja-light-unavailable-injected.png), with **ブロッカー #10：状態未取得** as its tooltip. The independent, unmodified API calls still returned `blockerIds: [10]` and the real reference to #10. Ticket #5 still displays a dash. The database relationship is genuine. The missing metadata in this screenshot was simulated in the browser response.
- In the [390 × 844 English dark viewport](after-en-dark-narrow-blocker.png), the existing narrow List layout keeps blocker #1 visible and keyboard-focusable while the search hides its row.

The captures cover Chromium at the stated viewport sizes. Other browser engines and a physical phone were outside the capture run.
