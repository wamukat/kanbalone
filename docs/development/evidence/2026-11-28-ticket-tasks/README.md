# Tasks in ticket details, List and Kanban

The Task section appears between the ticket body and the Comments and Activity tabs. List shows completion counts below the ticket title. Kanban shows them beside the tags. The matched captures use the same synthetic board, tickets, lanes, tags and comment in Japanese at 1440 × 900, device scale 1. They were captured on November 28, 2026 JST on macOS using Chromium 158 and agent-browser 0.26.0. Both builds display Kanbalone v1.6.0 and use Node 26.13.1.

## Original captures

| Screen | Light before | Light after | Dark before | Dark after |
| --- | --- | --- | --- | --- |
| Ticket details opened from List | [Before](before-ja-light-detail.png) | [After](after-ja-light-detail.png) | [Before](before-ja-dark-detail.png) | [After](after-ja-dark-detail.png) |
| List | [Before](before-ja-light-list.png) | [After](after-ja-light-list.png) | [Before](before-ja-dark-list.png) | [After](after-ja-dark-list.png) |
| Kanban | [Before](before-ja-light-kanban.png) | [After](after-ja-light-kanban.png) | [Before](before-ja-dark-kanban.png) | [After](after-ja-dark-kanban.png) |

The candidate shows two active Task records, with Task #1 completed and Task #3 open. Additional captures show the [Markdown editor](after-ja-light-task-editor.png), [combined text and incomplete filter](after-ja-light-task-filter.png), and [Task history](after-ja-light-task-history.png). The [manifest](manifest.json) identifies the runtime revisions and records original image hashes.

## Reproduce

1. On baseline commit `c1162cc49f04210dd83c62af0eb7aa4301340fe2`, create a **Release notebook** board. Add Inbox, Review and Done lanes and mark Done as a completion lane. Create **Prepare release handoff** in Inbox, **Review packaging** in Review and **Publish release notes** in Done. Tag the first ticket Documentation and Release. Add a short Markdown body and one comment with a PNG to the first ticket. Open the ticket from List and inspect the details, List row and Kanban card in both themes.
2. Back up SQLite and managed attachments using the repository backup command, restore the copy separately and start the candidate. Open the same first ticket. Add three Tasks with the sample prefixes `確認:`, `指摘:` and `修正:`. Add a PNG to the first Task through the Markdown editor. A simulated browser paste provided the file. The browser uploaded it through the normal attachment endpoint and decoded the stored 180 × 60 PNG when the Task was displayed.
3. In board settings, save **確認担当** as the updater. Edit Task #1, complete it, reopen it and complete it again. Delete Task #2 after confirming, create the next Task, then confirm deletion of that newest Task. The newly allocated number should be #4. Repeat the check after reload by reading Tasks and browsing the details, List and Kanban. Open List in a second tab during the edits and observe the count change without navigation or reload.
4. Search Task text for `修正` and turn on **未完了のみ**. Only Task #3 should be listed. Check the same combination through the API and read Activity to verify the stored Task numbers, body changes, completion transitions, deletion details and updater.
5. Export the board. Import the original format-3 JSON and the new format-4 JSON separately into the candidate. Verify the old format has no Tasks and the new format preserves Task data and both PNG files. Back up the candidate and restore to separate storage, then verify the same Task history and the next available Task number.

## Stored results

- Migrating the older backup preserved the old columns of every row in all 22 existing tables, the previous ticket fields and history entries, and the original comment attachment bytes. SQLite integrity and foreign-key checks passed. The Task API returned an empty collection at initial startup.
- The Task image decoded at 180 × 60 after saving and after restart. Task #1 retained its Markdown, image reference, completion and revision 5. Task #3 retained revision 1 and remained open. The source ticket stayed in Inbox with the same body, completion, timestamps and content-activity row. The second tab updated the List count from 0/1 to 1/2 without a reload.
- The text search combined with the incomplete setting returned Task #3. The API reported the full 1/2 completion count with the filter applied. The Task history recorded four creations, four updates and two deletions. New operations used **画面** before saving the updater setting and **確認担当** afterward. Requests with a stale or missing expected revision returned 409 and 428 respectively, and neither changed the stored Task or activity.
- The portable export used format 4 and preserved both attachment hashes. Import preserved Task numbers, Markdown, completion and revision. Although the highest allocated number was deleted, the next creation after import used #5. Exporting after all Tasks had been deleted and importing that file continued at #6. The baseline rejected format 4 with HTTP 400 and its board list still matched.
- The new SQLite and attachments backup restored Tasks #1 and #3, their revisions and all 12 Activity entries, including two from before the migration. Both images matched the original SHA-256. Creating another Task in the separate restored instance used #5.

The screenshots identify their runtime fingerprints in the manifest. The paired and editor captures include the Japanese **追加** label. The final History capture uses the final runtime but shows the individual operations from the lifecycle above. A separate focused Chromium test verified both completion-and-body and reopening-and-body updates through the real API and checked their Japanese Activity labels. The stored lifecycle checks used the same backend source throughout.

[Group completion counts](group-counts.md) documents the follow-up Group view comparison and saved results.

[Inline Task editing](task-inline-editor.md) documents the subsequent Task body-click and delete control comparison.
