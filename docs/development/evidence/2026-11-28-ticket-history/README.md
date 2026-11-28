# Ticket history changes

The history tab should identify what changed and let readers inspect the text recorded at the time. In the release and baseline, one edit changed the lane, title, priority, tags, relation and body. The most recent history entry only said **Ticket moved**, and its API details were empty. The history also showed short comment action labels without exposing the stored comment text.

## Comparison setup

Captured on 2026-11-28 JST with Chromium 159.0.8154.6, Playwright 1.65.1, macOS 26.7.3 and Node.js 26.13.1. The release is v1.6.0 (`4920daffe31a835a43996bead3a9f62f847d3f21`), the baseline is main at `15e9888fdc3858a9cf972e9792d0dc4ca31b0196`, and the successful-activity captures use `7cab9b732cf7cb1713e35cefa28afd99519e9368`. The additional availability-failure capture uses final candidate `fb90d8391f33695abfabc9dc59a32a8967664940`. The final change adds the failure state and updates the unarchived label, which does not appear in the successful-activity captures. The [manifest](manifest.json) records source fingerprints and original browser PNGs.

The synthetic board **復旧手順のレビュー** starts with ticket #1 in **調査中**, a related-ticket candidate #2, and two tags. Its initial SQLite snapshot contains a title change and a comment-add event actually written by v1.6.0. The baseline and candidate each start from a separate byte-identical copy of that snapshot. On each app, add and edit a comment, add and delete a second one, then use the same PATCH to change ticket #1’s metadata and body. Each app records its own operation times. The fixture contains no existing board data and no injected API responses.

## History comparison

Both main and candidate comparison pairs use the same 225 px scroll offset in the detail panel.

| Operation | Before | After |
| --- | --- | --- |
| Open History after the same ticket change, Japanese light, 1440 × 900 | [Release](release-ja-light-history.png) and [main](before-ja-light-history.png) show the short move message | [Candidate](after-ja-light-history.png) gives the lane, title and priority before and after, tags added and removed, and the related ticket added |
| Read the comment changes in History, English dark, 1440 × 900 | [Short add, edit and delete messages](before-en-dark-comments.png) | [Comment IDs, deletion state and available actions](after-en-dark-comments.png) |

## Keyboard and persistence

- Use Enter on **本文の変更を見る**. The [expanded history shows 保存領域A → 保存領域B](after-ja-light-body-expanded.png) and highlights the changed characters. Browser requests show that the full entry is fetched on expansion. The full Activity API independently contains both stored Markdown values. The compact response indicates that the text is available on demand.
- In English dark mode, use Enter to open the [recorded initial text for comment #2](after-en-dark-recorded-comment.png). **Show current comment #2** switches to Comments and moves focus to the [current edited text](after-en-dark-current-comment.png). The two texts were verified against the original POST and the later PATCH.
- At 390 × 844, Enter reveals [the text recorded when comment #3 was deleted](after-en-dark-deleted-comment.png). Its history has no action for opening a current comment, and #3 no longer appears in the ticket's current comments. The [v1.6.0 entries](after-ja-light-unrecorded.png) explicitly show missing change details or a missing comment reference. These older records still lack those keys in the API, although their ticket and the original comment still exist.
- Edit the actual ticket body with **本文を編集** and save. The PATCH returns HTTP 200. After reload, the ticket shows the new body and [History retains the before and after values](after-ja-light-saved-reload.png). Independent ticket and Activity GETs return the same saved Markdown.

## Activity retrieval failure

On the final candidate, add a synthetic verification event through the real events API. Open the ticket while the browser returns a simulated HTTP 503 for only the compact Activity GET. The [Japanese light 1440 × 900 capture](after-ja-light-activity-unavailable.png) shows the retry instruction alongside the structured event returned by the live events API. No empty-history message appears. The stored activity is still available from the unmodified API. Remove the override and reopen the ticket. The compact GET returns 200, the history and the structured event appear, and the warning clears.

The automated test `SQLite backup and restore preserve history order, recorded Markdown and attachment bytes` in `test/app-ticket-history.test.ts` separately verifies the official CLI backup and restore. Opening the restored SQLite database preserves the order, individual, compact and full history reads, and the associated PNG bytes.

The images cover Chromium at the two stated viewport sizes. Times reflect separate runs on isolated SQLite copies. The release image also reflects its original dialog layout. Other browser engines and a physical phone were outside the capture run.
