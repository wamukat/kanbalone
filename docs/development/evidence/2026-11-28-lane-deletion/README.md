# Lane deletion

The review reported that the lane menu offered Delete and listed tickets as affected even though the server accepts only empty lanes. The [reported v1.6.0 confirmation](../2026-11-28-external-ui-review/shots/31-lane-delete.png) is the original evaluation image. An isolated run from the release tag at `4920daffe31a835a43996bead3a9f62f847d3f21` reproduced both the enabled Delete action and the server’s HTTP 409 for a lane showing zero visible tickets because its only ticket was archived.

## Comparison setup

Captured on 2026-11-28 JST using Playwright 1.65.1 and Chromium 159.0.8154.6 on macOS 26.7.3. Each source revision ran on Node.js 26.13.1 with a separate temporary SQLite database seeded through the same API calls. No existing board data was copied. The baseline is main at `78dce9fb4964bed2d7b1cccd663484c6f3dc6e49`. The candidate is `0971403a3fc7bca27d25f3a8a81a141bdcde2dce`. The [manifest](manifest.json) records the unaltered PNGs and source fingerprints.

The 1024 × 768 Japanese light board **Operations desk** starts with two visible tickets and one archived ticket in **Review**, and an empty **引き継ぎ** lane. The 390 × 844 English dark board **Archive desk** starts with a single archived ticket in **Review** and **Include archived tickets** off.

## Reproduction and result

| Operation | Before | After |
| --- | --- | --- |
| Open the Review lane’s **…** menu and select the trash icon | [Conflicting confirmation](before-ja-light-populated.png), followed by a [409 toast on Delete](before-ja-light-populated-rejected.png) | [Dismiss-only notice](after-ja-light-populated.png) counts all three tickets, including the archived ticket |
| Open deletion for a lane showing zero because its one ticket is archived | [Delete remains available](before-en-dark-archived-only.png) | [Dismiss-only notice](after-en-dark-archived-only.png) counts the archived ticket |
| Open deletion for the empty **引き継ぎ** lane | [Original confirmation](before-ja-light-empty-confirm.png) | [Confirmation for deleting the lane](after-ja-light-empty-confirm.png) |
| Add one ticket to **引き継ぎ** through the API while the empty-lane confirmation is open, then select Delete | [409 toast after the confirmation closes](before-ja-light-race-rejected.png) | [409 changes the open confirmation to a notice](after-ja-light-race-rejected.png) with current count and no Delete action |

The candidate retains the lane and ticket when the server refuses deletion. The ticket appeared in **引き継ぎ** after reload, and its GET response returned the same lane ID. The test then moved that ticket to **Review**, opened the empty-lane confirmation again, and obtained HTTP 204. After reload the [empty lane was gone](after-ja-light-empty-deleted.png), the moved ticket remained visible, and GET of the board lanes returned only **Review**.

Focused Chromium tests cover keyword filters hiding an active ticket, no DELETE on opening a blocked notice, keyboard opening and Escape focus return, a rejected in-flight delete at 390 px, an enabled empty-lane confirmation after a blocked notice, and browser Back dismissing a confirmation from a different board. The API test independently checks counts, including archived-only membership, and verifies that DELETE 409 preserves both tickets. The added ticket used for the race was written to the real isolated API. The permanent test holds the browser DELETE briefly so the new ticket is stored first.

The images cover Chromium in the two stated viewport and appearance combinations. Other browser engines and a physical phone were not exercised.
