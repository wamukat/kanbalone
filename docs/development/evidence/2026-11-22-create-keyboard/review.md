# Independent review — #1511 keyboard ticket creation

Reviewer: `/root/create_1511_review`, separate from implementation and evidence authors. Date: 2026-11-22. Baseline: `b7dc02e8885f740afd9a47f12fab4c9079346041`.

Reviewed candidate source fingerprint: `d844c9a6599820229c2f4804c11bd3487d3f939acb900ab45b958b64a6b85c0b`. Independently verified every file hash in `revision.json` against the final working tree. Status: no unresolved blocker in this change; ready for user/PR review.

## Scope and code review

The implementation uses the existing editor and save path. N is scoped to eligible focused ticket titles, existing creation controls, or the selected Group control. It does not add a global command dialog or toolbar. Kanban retains its lane context; List uses the first lane; Group adds membership to the current Group. The new ticket does not inherit the focused ticket's parent or Group implicitly outside Group view.

Reviewed input/modifier/repeat guards, new-ticket-only Ctrl/Cmd+Enter handling, existing dirty-form dismissal, source identity/scroll restoration, Group rendering hooks, and JA/EN user-guide wording. Creation context and shortcut hints use existing text/styles. Existing detail edit shortcuts retain their separate behavior.

Review findings addressed:

- The initial shortcut metadata loop rescanned all titles on every Kanban rendering batch. It was replaced with focused/hovered-control setup to avoid adding growing full-DOM work.
- The initial asynchronous editor-open guard checked board/view but not selected Group. It now checks the initiating Group through the Group module before opening, so selecting another Group while collection loads invalidates the old open.
- The verification suite exposed generic post-save focus fallback overriding a target still awaiting a Kanban render batch. The restoration API now reports handled/deferred restoration, preventing the generic fallback from stealing that focus.
- Group selection now preserves the selected Group button through its render, allowing selection → N without losing keyboard focus.
- Composition state now resets when an editor closes, preventing a stale interrupted-composition state from leaking into a later dialog.

## Independent actual-browser observations

Used an isolated `agent-browser` session against candidate `http://127.0.0.1:3602`, with the disposable fixture only. No tickets were saved or changed by this reviewer.

- Japanese Group: focused ticket #14, pressed N, observed title focus and first-lane/current-Group context. Entered a draft, pressed Escape and cancelled dismissal: draft remained. Repeated Escape and discarded: focus returned to ticket #14.
- English Kanban: focused a Doing ticket, pressed N, observed title focus, Doing selected, board context, and the English save shortcut tooltip.
- Inspected actual editor screenshots at 1440×1000 and 1280×720. Existing white panels, green focus/action styles and controls remain consistent; Save and Cancel remain visible at the smaller height.

Screenshots cannot establish persistence, race safety or timing. These observations complement the author's stored-result checks and automated regression tests; they do not replace them.

## Final evidence and validation

Reviewed the final actual Japanese Group before-N / editor / returned sequence and English Kanban editor/returned images, together with the separate browser checks above. The baseline genuinely leaves the board unchanged when N is pressed; it is not a fabricated before editor. The candidate retains the existing layout and displays the initiating destination in the existing form.

Independently checked all six final `after-verification.json` cases: expected lane and Group membership, null parent, Markdown body, matching origin/return focus and scroll, and visible saved ticket after reload. Reviewed the capture harness and metadata separating independently seeded fixture timestamps from comparable task contents. The final source/served-file hashes identify the candidate used for these captures.

Logs confirm `pnpm check`: 192 unit/API tests, types, OpenAPI and docs passed. This branch is independent of the performance branch with 196 tests. The final affected creation/Group/keyboard/editor/unsaved-change regression suite passed 44 E2E tests; the two previously failing race-sensitive cases passed three repeated runs each. The author records initial failures and fixes rather than claiming every initial run passed.

### Separate pre-existing dark-mode issue

A small-height dark screenshot revealed nearly black Tags/Relations labels. Independently reproduced on both baseline port 3601 and candidate port 3602, using English Group board 6 → existing Create ticket, 1280×720, `agent-browser set media dark`. Both labels computed to `rgb(0, 0, 0)` over dialog background `rgb(23, 29, 25)` in both versions. The captures are `before-en-group-dark-1280.png` and `review-after-en-group-dark-1280.png`. No tickets were saved. This predates the keyboard change, which has no CSS changes, and should be tracked separately; no claim of full dark-mode accessibility is made. The new board/Group context and Save/Cancel remain readable and within the viewport.

## Limits and acceptance

Real OS IME and assistive-technology evaluation remain unverified. Synthetic composition tests demonstrate event guards only. The approved mock is not treated as before/after product evidence. The final source fingerprint, author capture sequence, persisted results and regression logs were checked. Images must still be embedded and verified in the Kanbalone ticket before Acceptance. User acceptance and passing GitHub Required checks are still required before merging.
