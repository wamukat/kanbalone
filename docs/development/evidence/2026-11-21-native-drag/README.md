# Native ticket drag persistence

[PR #24](https://github.com/wamukat/kanbalone/pull/24)

Captured 2026-11-21, Chromium / agent-browser 0.26.0, macOS, 1280×844, light theme, Japanese and English.

Baseline: commit df3b465 plus the accepted completion preview changes, captured before the native drag fix.
After: the same working tree plus the native drag fix. Source/image SHA-256 fingerprints are recorded in manifest.json.
Both isolated servers (3496 before, 3497 after) use matching synthetic board/ticket content. Their creation timestamps differ slightly; no user data was used.

## User task and reproduction

Move #1 “ガイドを確認する / Review guide” from Todo to an occupied Doing lane, then reload.

1. Seed Todo #1, Doing #2/#3 and seven completed tickets in Done.
2. Open board 1 with fresh preferences, 1280×844, light theme.
3. Drag article #1 to article #2 using agent-browser drag.
4. Capture the result and GET /api/tickets/1, then reload and capture again.
5. Reset only the after fixture's #1 to Todo using the API. Switch both browsers to English and repeat the same drag.
6. Move #1 from Doing into occupied Done. Confirm persisted completion state and that #1 remains first after reload.

Expected: a successful drop persists; cancellation does not move a ticket.

Observed before: #1 appears in Doing, but lane counts remain Todo 1 / Doing 2. The API still reports laneId 1. Reload returns #1 to Todo.
Observed after: #1 appears in Doing, counts become Todo 0 / Doing 3, API reports laneId 2, and reload retains the move.
The trusted browser event logs show dragstart → dragend before, and dragstart → drop → dragend after.

## Cause and change

The old dragover handler reparented the native drag source before the drop finished. Depending on the drag path, Chromium did not emit drop, leaving an unsaved DOM move. The new handler keeps cards in place and uses the existing accent color for an insertion marker. Only a valid drop moves the card and calls the position API. Escape or dropping outside leaves the original cards untouched; rejected saves refresh from persisted data.

## Original images

| Language / step | Before | After |
| --- | --- | --- |
| Japanese initial | [Before](before-ja-initial.png) | [After](after-ja-initial.png) |
| Japanese drop | [Before](before-ja-dropped.png) | [After](after-ja-dropped.png) |
| Japanese reload | [Before](before-ja-reloaded.png) | [After](after-ja-reloaded.png) |
| English initial | [Before](before-en-initial.png) | [After](after-en-initial.png) |
| English drop | [Before](before-en-dropped.png) | [After](after-en-dropped.png) |
| English reload | [Before](before-en-reloaded.png) | [After](after-en-reloaded.png) |

Insertion marker: [native drag preview](after-native-drag-preview.png), a separate synthetic fixture at the same viewport (supplementary, not a before/after comparison).

Additional after states: [completion move](after-en-completed.png), [completion reload](after-en-completed-reloaded.png).
Diagnostic-mouse-attempt.png records an unsuccessful attempt to hold a drag with separate CLI mouse commands; it does not demonstrate an insertion marker.

## Behavior verification

- before-dropped-ticket.json / after-dropped-ticket.json verify the persisted lane independently of screenshots.
- before-events.json / after-events.json record trusted browser events; no synthetic DragEvent was dispatched for these captures.
- after-completed-ticket.json records completion and its timestamp.
- Native mouse regression: 3/3 passed on the fix; frozen baseline 2/3 passed, cancellation failed. Existing Kanban/layout-scroll: seven passed initially; the remaining synthetic-drop test omitted coordinates, was updated to use its dragover coordinates, and passed on rerun (eight scenarios covered). Public TypeScript and git diff checks passed.
- Native mouse regression covers occupied-lane move, same-lane reorder, populated completion lane, Escape, outside drop, rejected save, and reload.
- The native mouse test takes a slightly different path from the CLI drag: the frozen baseline passes the two movement tests but fails cancellation after entering the target. This is a path-dependent bug; a passing movement test alone does not prove its absence.
- The regression uses actual mouse input rather than manually dispatching drag events.
- Original screenshots are unaltered. Images show state; API/event logs and tests support persistence/timing claims.
- No physical-human mouse session, touch input, Safari/Firefox, or screen-reader audit was performed. Dark/narrow validation is recorded separately if performed.

## Independent review

A separate reviewer inspected the three implementation files, tests, Japanese/English images, insertion-marker image, and trusted event/API logs. No required changes remain. All seven embeds were opened in the tracker and verified loaded at 1280 pixels wide. Documentation build also passed.

## Local image hosting

    python3 -m http.server 3498 --bind 127.0.0.1 --directory docs/development/evidence/2026-11-21-native-drag

Ticket embeds require this server. Original images remain in this directory for reproducibility.
