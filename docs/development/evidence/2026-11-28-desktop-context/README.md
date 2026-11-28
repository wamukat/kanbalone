# Desktop context and navigation — 2026-11-28

Scope: [Custom-view scope #108](https://github.com/wamukat/kanbalone/issues/108), [Kanban overflow #117](https://github.com/wamukat/kanbalone/issues/117), [Editor purpose and labels #118](https://github.com/wamukat/kanbalone/issues/118).

## Setup

Chromium / Playwright 1.65.1, 1440 × 900, light theme, Japanese and English. Isolated temporary databases and synthetic data only. Before serves the complete public assets from `da5a863` (the preceding desktop-clarity implementation, subsequently rebased into its PR); after serves the candidate. Backend behavior is unchanged by this batch. The originally reported older v1.6.0 release was not rerun. Candidate source hashes are recorded separately.

## Comparable images and interaction results

- `before/after-{ja,en}-view.png`: Desktop review is an all-board view configured for Configured board. A subsequently created New board contains an additional ticket. The existing heading now explains that only configured boards match; the empty row explains exclusion until filters are configured. Opening the view does not change its stored rules or include the new ticket. Explicitly setting that board to all tags and saving includes it and survives reload. No automatic expansion of existing saved views.
- `before/after-{ja,en}-editor.png`: New ticket, Desktop workflow, Todo lane, child relation field opened. The existing context area becomes a compact New ticket / Edit ticket heading with the board name and dialog accessible name. Lane/priority labels are placed above their controls, matching Tags. The shorter child placeholder has a complete accessible name and tooltip. Ctrl+Enter creates the draft; reopening then Cmd/Meta+Enter edits it. API and reload confirm persistence. Existing creation tests also cover destination, focus, IME, failed saves and delayed relation candidates.
- `before/after-{ja,en}-overflow.png`: six lanes, eight completed tasks, rightmost lane and Add lane focused. Overflow-only left/right icons use the existing toolbar row; each direction is disabled at its boundary. Tests click the arrow, verify scroll position, Tab from More to Add lane, open/cancel lane creation and verify no unintended lane was created. More expands all eight cards and its text fits the button. Right-edge padding keeps controls clear of the viewport edge. An initial native-scrollbar styling approach was removed because OS overlay settings can hide it; only the final icon controls are shown as after evidence.

## Verification and limitations

Public JavaScript types, CSS token lint and production build passed. Six new locale cases and fourteen existing custom-view/creation/layout cases passed. The initial baseline editor test incorrectly expected creation to leave detail open; it was corrected to reopen the created ticket, and only the two affected baseline cases were repeated. After a visual adjustment placed arrows in the existing filter row, only the two affected overflow cases were rerun; their position is asserted.

Independent code review found no actionable issues. Desktop focus; no separate mobile matrix or actual screen-reader study. Static images establish presentation, while API/reload/focus assertions establish behavior. No new permanent explanatory labels, release publication or normal-user data changes.
