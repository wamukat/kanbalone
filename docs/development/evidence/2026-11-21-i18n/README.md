# #1487 — English / Japanese interface evidence

Open `index.html`, or serve this directory with `python3 -m http.server 3477 --bind 127.0.0.1 --directory docs/development/evidence/2026-11-21-i18n`. Ticket images use `http://127.0.0.1:3477/`; that server must remain running for embedded local images. Original PNGs and metadata are stored here, independently of disposable test output.

## Comparison

- Baseline: commit `69636cc`, English-only UI. Changed: working tree on that commit; `manifest.json` records a SHA-256 of the sorted `public`/`src` paths and contents, each separated with NUL bytes.
- Agent-browser Chromium, light theme, 1280×844; narrow Group 650×844 with a fresh navigation at that viewport and the responsive sidebar default. Settings captures scroll the sidebar until the Delete action is visible so the complete settings panel can be compared.
- All 27 PNGs are original captures. Eight cases have baseline, English and Japanese screenshots; three additional images show language-change draft input → confirmation → cancellation.
- Synthetic fixtures only, in separate SQLite databases on localhost3473 (before) and3474 (after). Existing user data on3470 is not used for evaluation. Ticket #1487 is the project tracking record.
- Browser actions selected language through the settings control, changed Kanban/List/Group views, opened ticket detail/edit/delete confirmation, cancelled deletion, and cancelled a language change with an unsaved Group description. The 8 original fixture tickets were read through the API afterward; title, body, lane, board, parent, priority, Group, archive/completion status and relation IDs matched the baseline. No destructive confirmation was submitted.

## Reproduce

Run the baseline and changed source as separate servers on3473 and3474 with fresh `KANBALONE_DB_FILE` paths. Use Node26.13.1 and the existing project dependencies. `seed-fixtures.py` refuses non-empty instances, then creates the same synthetic boards/tickets/Group on both. Open board2, Group1 and ticket1. Follow the cases in `manifest.json`, selecting English and Japanese in the changed UI. For narrow comparisons, set650×844 **before navigating**, so the responsive sidebar starts collapsed.

## Verification and limits

- 139 unit/API/rendering tests passed. All89 pre-existing E2E tests passed in the full run; 9 locale E2E cases passed in final targeted runs. The initial two new-test failures were assertions on an icon-only Close button; the tests now use the actual Cancel button. Final combined locale/board/tag run:17 passed. Japanese Group one-row controls have an additional passing geometry assertion.
- TypeScript server/public checks and documentation build passed. Independent review found and verified fixes for draft loss and Japanese control wrapping; see `review.md`.
- Screenshots demonstrate visible states, not every interaction or human usability. Automated tests cover saved language, browser fallback, disabled storage, draft cancellation, Japanese GUI ticket creation, dictionary parameters, escaping and unchanged user content/API values. No live external issue import/post was attempted. Unknown provider diagnostics remain verbatim; user-written text is never translated.
- The working implementation is not released or deployed to the existing3470 instance by this task.
