# Independent review — #1511 creation keyboard mock

Reviewer: `/root/next_review`, separate from mock author. Date: 2026-11-22.

## Decision

Accept as a **proposal for user evaluation**, not as production keyboard implementation or completed UI/UX evidence. The keyboard assignment, destination defaults and return-to-origin behavior still require user acceptance. API persistence, refresh and failure behavior remain unimplemented/unverified in this mock.

Reviewed mock SHA-256: `bb582d02a098a48febda45057c679f92835c336ca95c7276ff3af946ea0dec05` (also in `source.json`).

## Reviewed scope

- Standalone `docs/development/mockups/create-keyboard.html`, based on existing Kanbalone DOM/CSS; no production source changes for keyboard creation.
- Reviewed existing UI/UX rules and actual creation defaults before inspecting the proposal.
- Inspected source guards for focused-context-only N, input/IME exclusion, repeat exclusion, save and unsaved dismissal.
- Personally operated the mock with agent-browser in an isolated `next-review` session: English Kanban, Japanese List and Japanese/English Group.
- Visually inspected creation and returned-state screenshots, plus an independent 1280×720 English Group editor screenshot. The compact version shows the save hint and Save/Cancel controls without clipping at that viewport.

## Observed interactions

1. Kanban: focus a title in doing → N → title focused with doing selected → enter title → Escape → Escape from confirmation (keep editing) → Ctrl+Enter. Exactly one simulated item in doing; focus returns to the original title.
2. Group: selected Group button → N. Editor shows the same board and Group, with todo as the first lane in this fixture.
3. List: type N in search. It enters ordinary text and opens no dialog. Focus a title → N opens with todo; save returns to the initiating title.
4. Synthetic compositionstart → Ctrl+Enter leaves the dialog open and simulated results empty; compositionend → Ctrl+Enter creates one simulated item and restores focus. This checks the code guard only, **not a real OS IME**.
5. Source inspection confirms no API connection or persistent write path. `mockResults()` is an in-memory demonstration, not proof of product persistence.

## Findings resolved during review

- Board and Group names differed between captured surrounding UI and editor: aligned.
- English captured labels included Japanese text: author corrected dynamic labels and principal accessible names.
- Save controls/hint were below the fold at 1280×720: compact body makes them visible.
- Simulated Group row appeared below the archive toggle: author moved it into the ticket area and retained a disabled removal control.

## Limits

The mock deliberately simplifies unrelated controls, list counts and result persistence across view changes. It does not demonstrate empty-board behavior, actual network failures, SSE races, storage, real screen readers, OS IME, dark mode or 200% zoom. Those are implementation acceptance work, as recorded in README. Existing + entry points and editor structure are preserved; no global search or extra permanent toolbar is proposed.
