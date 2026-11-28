# Desktop board identity and deletion — 2026-11-28

Scope: [Board deletion #112](https://github.com/wamukat/kanbalone/issues/112), [Board identity #115](https://github.com/wamukat/kanbalone/issues/115).

## Setup and reproduction

Chromium / Playwright 1.65.1, 1440 × 900, light theme, Japanese and English. Isolated temporary databases and synthetic data only. Before serves complete public assets from `4e37278` (the preceding desktop-context implementation, subsequently rebased into its PR). After serves the candidate; source hashes accompany the images. The older reported v1.6.0 release was not rerun.

- `before/after-{ja,en}-identity.png`: open Desktop workspace with the sidebar expanded. The existing main board title is now visible in Kanban, List and Group, with the sidebar expanded or collapsed. It uses its own constrained toolbar row; long names truncate and the title attribute exposes the full name. No second heading or explanatory label was added. Tests switch all three views, collapse/reopen the sidebar and verify board data remains unchanged; a long-name case verifies width and truncation.
- `before/after-{ja,en}-delete.png`: open Board settings → Delete for Deletion <sample>, with two tickets (one archived), two lanes and one tag. The danger confirmation now counts all tickets, lanes and tags and lists comments, relations, Groups and history. Entering the exact board name is required. Tests verify mismatch and cancel issue no DELETE and preserve the archived ticket. Renaming externally while confirmation is open prevents deletion. Reopening with the current name and Ctrl+Enter deletes only the target board; another board remains and reload confirms the result.

## Verification and limitations

Public JavaScript types, CSS token lint and production build passed. Eleven initial board/layout E2E cases passed. Independent review identified a title flex shorthand override and a post-deletion refresh error that could leave confirmation open. Both were corrected; five focused cases passed, including long-name clipping and a simulated 503 board-list refresh after successful deletion (dialog closes, exactly one DELETE, API confirms deletion). The two affected identity images were recaptured after the CSS correction.

Counts are a fresh preflight snapshot, not an atomic deletion revision guard. The board name is checked again before deletion; the existing DELETE API is unchanged. Images establish presentation; API, request counts and reload checks establish behavior. No actual screen-reader study, additional mobile matrix, normal-user data changes or release publication. App language/updater settings retain their existing browser scope.

CI also identified two old title-placement expectations and a filter wrapping regression: the new title row gives filters more width, bypassing the previous fixed collapse threshold. Priority now collapses when the actual visible control widths plus gaps exceed the container. Tests retain one-row assertions at 980px with the sidebar closed and compact-reset assertions at 1100px with the sidebar open. Both focused cases pass, as do the updated title alignment and UI smoke tests. The original 1440px evidence remains representative.

The existing combined-filter and UI smoke sequences now reopen collapsed priority controls before their next selection. Both targeted tests passed; all query, result-count and persistence assertions remain.
