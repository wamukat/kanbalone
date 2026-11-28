# Inline Task editing and deletion control

The original captures use the same synthetic ticket and two Tasks in Japanese light mode. Both builds display Kanbalone v1.6.0. Agent-browser 0.26.0 captured the 1440 × 900 viewport at device scale 1 with Chromium 158 on macOS on November 28, 2026 JST.

| State | Capture |
| --- | --- |
| Before, with visible Edit and Delete buttons | [Before](before-ja-light-task-inline-editor.png) |
| After, with clickable Task content and a trash icon | [After](after-ja-light-task-inline-editor.png) |
| Markdown editor at the selected Task's original position | [Inline editor](after-ja-light-task-inline-open.png) |
| Updated Markdown after reloading the ticket | [Saved](after-ja-light-task-inline-saved.png) |
| Existing confirmation dialog opened from the trash icon | [Delete confirmation](after-ja-light-task-delete-confirm.png) |

## Reproduce and verify

1. Create a ticket named **Task 操作を確認する** with two Tasks. Put a link and a 180 × 60 PNG in Task #1. Open the ticket from List on baseline commit `dcf86b4ad1a38e1ce79cca1ad85ae1bb4b10a458`, then reopen it using the candidate on the same database.
2. Click the first Task's text. The Markdown textarea opens inside that Task row and takes focus. Focus the Task edit control by keyboard and press Enter to open the same editor. Cancel to return focus to the Task. The edit control is available to the keyboard while the dedicated visible edit button is gone.
3. Add `追記を保存しました。` to Task #1 and save. Reload the ticket. The new text and original rendered image are visible. The Task API returns the exact amended Markdown, including the original link, at revision 2. The parent ticket body is unchanged.
4. Click the image, then use Task #2's completion checkbox. Both operate without opening the text editor. Task #2 becomes complete. Open its delete confirmation using the trash icon and cancel. Focus returns to the delete icon and the two Tasks remain stored. The delete button has an accessible name. The focused Chromium suite also checked links, selection and keyboard activation.

The [manifest](task-inline-manifest.json) records the runtime fingerprints and original capture hashes.
