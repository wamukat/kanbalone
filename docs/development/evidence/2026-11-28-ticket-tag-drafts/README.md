# Ticket tag drafts

The comparison uses ticket **#1**, “復元手順と引き継ぎ資料を更新する,” on the synthetic **Operations desk** board. The ticket starts with 資料. The board starts with 資料 and リリース. An online backup of this fixture was restored for the candidate before adding any draft tags.

The captures were taken on 2026-11-28 JST in Chrome 158.0.8127.89 on macOS 26.7.3 with Node.js 26.13.1, device pixel ratio 1 and reduced motion. Both runtimes reported Kanbalone 1.6.0. The baseline was commit `78dce9fb4964bed2d7b1cccd663484c6f3dc6e49`. The candidate uses the product diff identified in the [source and image manifest](manifest.json).

| At 1024 × 768, Japanese, light | Before | After |
| --- | --- | --- |
| With the ticket editor open, enter 手順確認 in Tags and press Enter | [The tag already appears in the sidebar](before-ja-light-tag-enter.png) | [The chip says 未保存 and the sidebar still shows two tags](after-ja-light-tag-enter.png) |
| Cancel editing and confirm discard | [The unassigned tag persists on the board](before-ja-light-tag-discard.png) | [The board and ticket return to their original tags](after-ja-light-tag-discard.png) |

Open the same ticket from List and use the header pencil. Add the new name using Enter. Expect the ticket editor to show the pending name while the board retains its two saved tags. The baseline creates the shared tag immediately. On the candidate, cancel the discard prompt once to resume editing with the pending chip intact. Cancel editing again and confirm discard. The candidate board-tags and ticket GET responses match their initial values. The baseline response contains the new shared tag, and the ticket still contains only 資料.

## Save failure and retry

Reopen the editor and add 手順確認 again. The browser test intercepted the first ticket PATCH with a simulated HTTP 503. The [failure frame](after-ja-light-save-failed.png) shows the pending chip and failure feedback. No tag assignment or board tag was committed. Both GET responses still match their initial values.

Retry through the same Save button with the PATCH forwarded normally. Reload the ticket. The [saved frame](after-ja-light-tag-saved-reload.png) shows 手順確認 on the ticket and in the board sidebar. The board and ticket GET responses contain the same tag ID, and the ticket retains 資料. The ticket activity records the ordinary update with updater 画面.

At 390 × 844 in English and dark mode, the [pending chip and explanation remain visible](after-en-dark-narrow-tag-enter.png). The synthetic Japanese ticket title and existing tag names are the same fixture data. Discard that draft and verify the board's saved tags still match the successful retry.

## Scope

The comparisons exercise the existing-ticket editor in desktop Chromium. Focused Chromium tests also cover a draft in the new-ticket form and the distinction between a failed mutation and a successful mutation followed by a failed board refresh. API tests verify same-board name reuse, read-only previews and rollback after a related write fails. The simulated HTTP 503 exercises client behavior. The API tests separately exercise database rollback.
