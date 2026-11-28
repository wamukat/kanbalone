# Keyboard lane movement, dialog actions, and dependency direction

Captured 2026-11-28 JST. These are unedited screenshots of real application source archives using synthetic data, not design mocks. Before: `82ca2a660a9780eaea6e8d64bab740184874f906`; after product: `a3d383a26133d43c749395b7d2758d056ed79918`. Final product is `98fb2cf96a04e7c3a459f4505d0c1c346d76cb41`: its only product change after the initial capture is `public/styles/editor-fields.css`, fixing the relation-add menu wrapping. The final relation-add desktop/narrow images use this final revision; other images retain their initial revision, individually recorded in the manifest. Test/documentation commits do not change these pixels. Reported v1.6.0 baseline: `4920daffe31a835a43996bead3a9f62f847d3f21`.

Each runtime used the same initial SQLite fixture copied after clean close, separate from existing user data. Each ran with its own source directory as cwd; the visible version1.6.0 is package metadata. Environment: Node26.13.1, agent-browser0.26.0, HeadlessChrome158.0.0.0, macOS26.7.3. Standard images are1440×900, Japanese/light; the narrow lane dialog is390×844, English/dark, and the narrow relation menu is390×844, Japanese/light. See [manifest](manifest.json) for hashes, conditions, results, and limitations.

## Comparable evidence

| Scope | Steps and observed result | Before | After |
| --- | --- | --- | --- |
| #103 lane shortcut | Focus ticket1 title and press M. Before no dialog. After same-board lane chooser; current lane initially selected, Move disabled. | [Before M](originals/before-m-key.png) | [After M](originals/after-m-key.png) |
| #122 incoming relationship | Open ticket1, Normal tab. Existing blockers2/3/4 remain the same tickets; label now explicitly describes tickets blocking this ticket. | [Before incoming](originals/before-relations-incoming.png) | [After incoming](originals/after-relations-incoming.png) |
| #122 outgoing relationship | Follow ticket2; Normal tab. Ticket1 remains the dependent ticket; label now explicitly describes tickets this ticket blocks. | [Before outgoing](originals/before-relations-outgoing.png) | [After outgoing](originals/after-relations-outgoing.png) |
| #122 relationship add | Edit ticket2 and open relationship +. Existing option count/meaning retained; incoming option wording clarified. The initially clipped last option was fixed before acceptance; final desktop evidence shows all four options. | [Before add](originals/before-relation-add.png) | [After add](originals/after-relation-add.png) |
| Editor actions | Edit ticket2. Footer changes Cancel→Save to Save→Cancel. | [Before editor](originals/before-editor-actions.png) | [After editor](originals/after-editor-actions.png) |
| Confirmation | Click Delete on ticket2. Footer changes Cancel→Delete to Delete→Cancel; initial focus after is explicitly Cancel. Esc cancels and ticket2 remains stored. | [Before confirmation](originals/before-delete-confirm.png) | [After confirmation](originals/after-delete-confirm.png) |
| Shared form | In List, select ticket1 and click top Move. Tag management is active in both images. Lane select then Tab reaches Move after, Cancel before. | [Before bulk form](originals/before-bulk-move.png) | [After bulk form](originals/after-bulk-move.png) |

## Interaction sequence and stored result

1. M on ticket1 in Todo opens the chooser, selector focused. Ctrl+Enter with unchanged lane does nothing. Esc cancels and returns focus to the same title.
2. Reopen, choose In progress. Tab reaches `ux-submit-button`. Ctrl+Enter closes the chooser; independent API GET records lane2 and unresolved state. [Reloaded board](originals/after-move-reloaded.png) still shows ticket1 in In progress. [Stored result](after-move-api.json).
3. Reopen and choose Done. Cmd+Enter moves ticket1 into lane3 and completion is derived from that lane. [Stored result](after-meta-enter-api.json). An attempted browser route abort did not intercept this request; this was a successful move, not a failure. No browser failure screenshot is claimed. Injected server failure/retry is covered by the implementation E2E suite.
4. Synthetic ticket1 alone was reset to original lane1/position0 through API before the comparable bulk-form capture. This reset is fixture preparation, not a UI result.
5. In English/dark List at390×844, focus ticket1 and press M. [Narrow dialog](originals/after-move-narrow-dark-en.png) fits x20–370 and y256.39–587.61. Esc returns to its title. No new permanent card control was added.

[Before ticket1](before-ticket1.json) and [before ticket2](before-ticket2.json) record relationship identity. The successful move API responses retain blocker IDs2/3/4. Text changes do not change relation direction.

The final relation menu also fits all four options at390px Japanese/light: [narrow relation menu](originals/after-relation-add-narrow-ja.png). All button rectangles remain within x96–317 and y612–707; opacity was1 before capture. The rejected initial relation-menu capture is not part of this final evidence.

## Reported release and limits

v1.6.0 was reproduced with the same fixture: [M no-op](originals/release-m-key.png), [incoming](originals/release-relations-incoming.png), [outgoing](originals/release-relations-outgoing.png). Its older detail/card layout is not presented as pixel-comparable with the current main comparison.

The baseline main session at390px after fresh Kanban reload showed lane counts but empty card containers without console errors. This preexisting observation is not claimed fixed; the bounded narrow check here uses List. Broad browser/device and real screen-reader testing were not performed. Images establish appearance, not persistence/timing by themselves; API reads and interaction checks above provide the storage evidence, with implementation and independent reviewer tests supplementing failure/race cases.

During capture an independent review fixture temporarily changed the sidebar through board SSE. It was removed; affected captures were retaken after restoring the one-board fixture. Only the final comparable originals are included.
