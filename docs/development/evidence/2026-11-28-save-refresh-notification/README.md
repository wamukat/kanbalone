# Ticket creation after a board refresh failure

The ticket save succeeds before the application refreshes the board. If the board read fails, the editor should close and the notification should confirm the save and explain that the board could not refresh. A later board update should still refresh the view.

## Matched captures

Captured on 2026-11-28 JST using agent-browser 0.26.0, headless Chromium 158, macOS 26.7.3 and Node 26.13.1. Both runs used a 1360 × 860 viewport at device pixel ratio 1, Japanese locale and light appearance. The starting SQLite files were byte-identical copies of a synthetic Release desk board with one ticket in each of Todo, In progress and Done. Both processes load the server and static assets from their extracted commits. The app reads the footer version from the launcher’s working directory, so all captures display the same `v1.0.0` footer. The two extracted commits carry `1.6.0` in their own `package.json`. The exact source revisions and raw PNG hashes are in the [manifest](manifest.json).

1. Open a new ticket in Todo. Enter `Record the backup verification` and add `Release verification` as a pending tag. [Baseline draft](before-ja-light-draft.png) and [candidate draft](after-ja-light-draft.png).
2. Click 保存 once. A test-only server hook injects a HTTP 503 on the board detail GET after the actual ticket POST returns HTTP 201. It holds the first GET for 240 ms so the real SSE event emitted by the save can reach the client and exercise the ordering. The same hook and starting database are used for both runs. The browser, ticket routes and response rendering use the built-in product behavior.
3. In `a37c459`, the first read was aborted and a second read returned HTTP 503. The editor closed with the success-only message `チケットを作成しました` while the card and tag were absent from the board. [Baseline failure result](before-ja-light-refresh-failure.png).
4. In `6848cb9`, the read completed with HTTP 503. The editor closed with `チケットは保存されましたが、画面を更新できませんでした。再読み込みしてください。` The unchanged board content in this capture is expected after the failed read. [Candidate failure result](after-ja-light-refresh-failure.png).

Each run made exactly one ticket POST. Direct reads of the collection, ticket and board tags showed the same new ticket in Todo and exactly one `Release verification` tag attached to it. After removing the fault from the candidate, an API edit to a different ticket emitted a real board event. The renamed card, the previously saved card and its tag appeared in the open browser before reload. Reload retained them. [Candidate recovery](after-ja-light-sse-recovery.png).

With the fault disabled a second ticket, `Schedule the next backup`, and its `Operations` tag saved with one HTTP 201. The board read returned HTTP 200, the new card appeared and the normal success message was shown. [Candidate normal save](after-ja-light-normal-save.png).

A separate focused test paused the save's in-flight board read, made another board change and confirmed that the later SSE triggered one subsequent board read after the first completed. The captures above show simulated failures on local synthetic data. They cover Kanban ticket creation and the subsequent board refresh, with one locale, theme and viewport.
