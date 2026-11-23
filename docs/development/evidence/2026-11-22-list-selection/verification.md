# List selection regression and visual verification

[Implementation PR](https://github.com/wamukat/kanbalone/pull/39)

Baseline: merged main `963b37bcdd5e773ef01889bbcea9dbd33a21d1bd`. Candidate: the same source with three List selection modules changed; exact static-file hashes are in [interaction-revision.json](interaction-revision.json). Both capture servers use the same unchanged backend and independent copies of synthetic SQLite data. Existing user data and normal port 3470 are not used.

## Tasks and actual UI

Each language board contains 240 open tickets, split equally between Todo and Review. Before/after use the same IDs, titles, lanes and selection sequence. Desktop: 1440×1000, light; supplementary narrow view: 390×844, dark. Captures use agent-browser and remain unaltered.

1. Open List and select all: the interface reports 240 selected, including rows outside the virtual viewport.
2. Deselect the first ticket: 239 selected and an indeterminate header checkbox.
3. Filter Todo: 119 selected, with the deselected Todo ticket still visible and unchecked. Review tickets no longer belong to the selection.
4. Archive the remaining selected Todo tickets through the actual UI. A read-only fetch observer records the outgoing mutation body; the request and server behavior are not replaced.
5. GET all 240 tickets and verify that exactly the 119 requested IDs are archived. Reload and verify that only the deselected ticket remains in the Todo view.
6. Reload the same final state at narrow width with dark color preference.

[Before interaction records](before-verification.json) and [after interaction records](after-verification.json) retain the exact requested/stored IDs and key control rectangles. Images establish appearance; API checks establish persistence. Performance is measured separately and is not inferred from these screenshots.

[Pixel comparison](image-parity.json) confirms all ten before/after image pairs are identical. The complete interaction records, including control rectangles, selected and persisted IDs, also match. This establishes no visual difference for these captured states, not the absence of every possible transient shift.

## Automated checks

- [Full check](check.txt): 198 tests passed, plus lint, types, build, public JavaScript and documentation validation.
- [Focused test](focused.txt): the new 240-ticket regression passed. It confirms cursor pagination, offscreen checked rows, partial selection, restoration to all selected, filtered selection cleanup, and selection removal after an API move delivered through live board events. It then compares the exact bulk archive request IDs and stored state of all 240 tickets.
- [Related E2E](e2e.txt): **49 passed (5.0m)**, one worker. This includes the new regression plus parent/child selection, same-board and cross-board move controls, keyboard navigation, filters and completion/archive behavior.

The first two focused attempts were invalid test fixtures: version 2 import requires both `groups` and each ticket's `groupId`. These fields were added before the successful run. No product change or relaxed assertion was used to pass the test. Check logs are normalized only to remove terminal escape codes and trailing whitespace; outcomes are unchanged.

## Reproduction

From the repository root with Node 26.13.1 and locked dependencies:

1. Create `coverage/list-selection/before` and extract `git archive 963b37b public` into it.
2. Start `node --import tsx docs/development/evidence/2026-11-22-list-selection/interaction-server.mjs before` (port 3630).
3. Run `interaction-seed.py` once; it creates two language boards and uses SQLite backup for a separate candidate DB.
4. Start the server script with `after` (port 3631).
5. Run `interaction-capture.py before`, then `interaction-capture.py after`. Use fresh DBs when repeating this mutating sequence.

This bounded optimization does not alter styles, labels, virtualization or API contracts. The tests do not establish usability with human participants or all assistive technologies. Initial large Group rendering and first relation-search transfer remain separate issues.
