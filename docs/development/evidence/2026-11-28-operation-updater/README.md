# Operation updater settings and history

The sidebar settings expose the updater name used for future operations in the current browser. Activity entries show the name recorded for that change. Comments show the name recorded on creation, while an edit appears as a separate activity.

The captures use Chromium 158.0.8127.37 on macOS, a 1440 × 900 viewport at device scale 1, and synthetic data only. Before is `4920daffe31a835a43996bead3a9f62f847d3f21`. Both builds display Kanbalone v1.6.0. The candidate uses a backup of the baseline SQLite database and the matching attachment directory. The [manifest](manifest.json) records the runtime source and original image hashes.

## Matched original captures

| State | Before | After |
| --- | --- | --- |
| English light, List and sidebar settings | [Before](before-en-light-settings.png) | [After](after-en-light-settings.png) |
| English light, the four pre-upgrade activities | [Before](before-en-light-legacy-history.png) | [After](after-en-light-legacy-history.png) |
| English dark, the pre-upgrade comment | [Before](before-en-dark-legacy-comments.png) | [After](after-en-dark-legacy-comments.png) |

The captured setting starts at **画面**. The old records retain their time, content, and order, and gain the visible **Unrecorded** marker. The same saved lane and tag selections are active in the List behind the ticket.

Additional candidate captures show the [English settings after save](after-en-light-settings-saved.png), [Japanese settings in dark mode](after-ja-dark-settings-saved.png), [comments after new operations](after-en-dark-comments-recorded.png), and [history after new operations](after-en-light-history-recorded.png).

## Reproduce

1. In the baseline, create **Operations desk** with Inbox, Review and Done lanes, plus Documentation and Release tags. Use Done as the completion lane. Create a ticket in Inbox, then edit its title and body, attach a PNG, and add and edit a comment. Use List and select Inbox and Review plus Documentation and Release. Save the browser preferences and keep a matching backup of the SQLite database and managed attachments.
2. Start the candidate with copies of that backup and those browser preferences. Open the sidebar settings. The current language, List mode, and selections should still apply. The updater should start at **画面**. In the ticket, open Comments and Activity and check that the old records show **Unrecorded**.
3. Add a comment before saving a name. Save **確認担当**, reload, and add another comment. Edit the ticket body and edit the old comment. Reopen the ticket and compare the comment creation names with the names in Activity.
4. Submit an API comment with the original request body and another with an explicit **レビュー担当** updater. Confirm the first records **API** and the second records the supplied name. Submit a request with an explicit null updater and confirm it is rejected without activity.
5. Export the board with its attachment and import it into a separate synthetic board with **引き継ぎ担当** as the import updater. Compare the exported and imported comment creation names and check the import activities separately.

## Observations

- Restoring the older SQLite backup and attachment directory left the pre-existing columns in all 23 tables equal, including the ticket and comment timestamps and the four original activity rows. The same comparison passed after restarting the candidate. SQLite integrity and foreign-key checks passed, and the attachment matched its SHA-256 and decoded at 80 × 32 in the browser.
- No updater setting was required to use the app. A blank value was rejected without saving. The configured name survived reload with the original browser language, board display mode, and filters preserved. The settings control uses the existing sidebar input style in both themes.
- New UI comments and body edits recorded the active name. Editing the legacy comment added an activity attributed to **確認担当** while the comment creation attribution remained unknown. The four old activity entries kept their original IDs, times, details, and order.
- Omitted and explicit API values produced **API** and **レビュー担当** respectively. An invalid null value returned HTTP 400 and left history unchanged.
- The attachment-inclusive board export retained format version 3. Round-trip import preserved both the original recorded comment names and the unknown attribution. The import histories used the separate import updater.
- These checks used an isolated browser and synthetic fixtures. Detailed request validation, concurrency, and operation coverage are exercised by the implementation tests.
