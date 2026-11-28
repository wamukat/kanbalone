# Dialog action order

Captured 2026-11-29 on Chromium, light theme, 1440 × 900, Japanese and English. Separate disposable SQLite fixtures; no existing user data. Baseline public assets are unchanged from `8ef77ec0cff69e32d04d5f8c53c5c1a80360ea8b`; the same server/fixture/test is used for both captures. Candidate sources and unmodified PNGs are fingerprinted in [sha256.json](sha256.json).

The final action in a dialog row is now on the right: Cancel → Save/Delete, and Cancel → Preview → Import. DOM and visual order agree. This also applies to body, comment and Task editing inside the ticket dialog. Existing destructive launch actions remain separate from the editor's Save/Cancel pair. Cancellation remains the initial focus for destructive confirmation; Ctrl/Cmd+Enter still submits directly, without requiring Tab through Cancel.

| State | Before | After |
| --- | --- | --- |
| Japanese ticket editor | [Before](originals/before-ja-edit.png) | [After](originals/after-ja-edit.png) |
| Japanese delete confirmation | [Before](originals/before-ja-delete.png) | [After](originals/after-ja-delete.png) |
| English ticket editor | [Before](originals/before-en-edit.png) | [After](originals/after-en-edit.png) |
| English delete confirmation | [Before](originals/before-en-delete.png) | [After](originals/after-en-delete.png) |

Reproduction: create Desktop workspace with a Todo lane and Review dialog actions ticket; open the ticket editor; capture. Save a changed title with Ctrl+Enter and read it back through the API. Open board settings → Delete; capture before entering the confirmation name. Cancel and verify the ticket remains. Reopen, enter the exact name and confirm with Cmd+Enter; verify successful DELETE and ticket absence. Candidate tests also measure left/right rectangles, check DOM order and Tab focus. Baseline captures intentionally skip the new order assertions.

Validation: focused dialog/keyboard cases cover movement, cancellation, safe initial focus, disabled actions, failed saves, persistence and comment shortcuts. Task Markdown and remote-import persistence regression checks use isolated fixtures (the external provider is mocked). Initial comment/import failures were old first-Tab expectations; they now assert Cancel before the final action. Full `pnpm check` passed. Independent review inspected code and actual editor/delete screenshots with no actionable findings.

Limitations: screenshots represent the editor and shared confirmation shell, not every consumer. They do not alone prove persistence; API and keyboard checks do. No new narrow-screen or human usability study. Historical evidence of the previous primary-first design is retained as history; the current shared component contract supersedes that ordering.
