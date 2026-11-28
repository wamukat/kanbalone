# Desktop clarity — 2026-11-28

Scope: [Group actions #109](https://github.com/wamukat/kanbalone/issues/109), [initial lanes #114](https://github.com/wamukat/kanbalone/issues/114), [comment metadata #120](https://github.com/wamukat/kanbalone/issues/120), [tag color labels #121](https://github.com/wamukat/kanbalone/issues/121).

## Comparable setup

Chromium / Playwright 1.65.1, 1440 × 900, light theme, Japanese and English. Every test uses an isolated temporary database and synthetic Desktop workflow / Todo data. Before serves the complete public assets from main `dc728ac2ae2e44dd5ef9b2eb56cd61f522c8a8e1`; the candidate backend retains the same behavior for those baseline requests. After uses the candidate assets. This is not a rerun of the older reported v1.6.0 release. Candidate source hashes are recorded separately. Comment creation timestamps reflect each fixture run and differ; no pixels or timestamps were fabricated.

## Evidence and observed behavior

- `before/after-{ja,en}-group.png`: parent/child family, one unassigned Solo task, Release group. Removal now uses a folder-minus icon instead of a trash can. The existing group-name button has a pencil and accessible rename name. Existing group-order icons remain. Keyboard activation → removal confirmation → remove leaves both tickets and their parent relationship intact (API reads). Rename saves; zero-selection add is disabled, one selection has singular wording, existing two-ticket add tests pass.
- `before/after-{ja,en}-lanes.png`: create Desktop board through the UI. Japanese defaults become 未着手 / 進行中 / 確認待ち / 完了; English capitalization becomes Todo / Doing / Acceptance / Done. API and reload retain names and the last lane remains the completion lane. An existing User-defined lane is unchanged. API tests also cover explicit names, legacy defaults, and invalid language input.
- `before/after-{ja,en}-comment.png`: Review note with a single comment by Reviewer. Header order changes from ID/date/updater to date/updater/ID. The comment ID, original timestamp, updater, content and existing edit/sync actions are retained. API checks verify the record was not mutated.
- `before/after-{ja,en}-color.png`: edit Review tag. Reuse the existing Color heading as Use color and associate it with the switch; give the HEX field its own accessible name. The reported absence of a HEX accessible name was not reproduced on main: the original label already supplied Color. New tests verify names, keyboard toggle, disabled HEX state, invalid-color feedback, valid save and persisted color after reload. No extra permanent label is added.

## Verification and limits

`pnpm check`: 315 unit/API tests plus lint, production build, public JavaScript types and docs build passed. Eight new desktop locale cases and eleven existing Group/tag cases passed. A new Group test initially used the wrong form selector; only the two affected cases were rerun. Before Group images were recaptured after adding the unassigned fixture so the task data matches. Independent code review found no actionable issues.

Desktop focus; no extra narrow-layout matrix or real screen-reader study. Existing tag tests also exercise forced colors. Static screenshots support the presentation comparison; assertions establish input validation, persistence and non-destructive removal. No normal user data or live remote service was used.
