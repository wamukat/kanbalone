# Custom view board and ticket boundaries

Recorded on 2026-11-24 JST. This desktop refinement makes the board → ticket → content hierarchy visible through indentation, separate ticket borders and a stronger board heading. It changes only the custom-view stylesheet.

## Conditions and revisions

Before: `46060b05d59c3183a28892e82172bf54c49f2ad0`. After: the same source with the stylesheet change; `public/styles/custom-views.css` SHA-256 is `5a6004c975eb8cf787a1c2da21222e00bbbaa37b52ffcb3fc58cb44ad4183b7a`.

Both versions use production-bundled assets, Chromium 159.0.8154.6, a 1440 × 900 viewport and device scale 1. English uses the light theme; Japanese uses the dark theme. Each pair uses the same isolated synthetic three-board/eight-ticket fixture, saved definition, scroll position and focus state. No user data is included. The compiled JavaScript is byte-identical between the versions.

## Task and observations

Open the saved cross-board list and identify which board owns each ticket and where one ticket ends. Compare the normal body/comment display, then temporarily hide both text panes. The compact state shows all three board headings, including the zero-match board, and all three matching tickets in one viewport.

Before, board headings, ticket titles and text started at the same horizontal position. After, each board has an 18px heading in a distinct band; ticket cards begin 20px inside it, and metadata/body/comment content starts another 12px inside the ticket title. Cards have 8px gaps, and the next board begins after 24px. These offsets were measured from the actual rendered elements.

| Desktop state | Before | After |
| --- | --- | --- |
| en-light, default | [Before](before-en-light-default.png) | [After](after-en-light-default.png) |
| en-light, compact | [Before](before-en-light-compact.png) | [After](after-en-light-compact.png) |
| ja-dark, default | [Before](before-ja-dark-default.png) | [After](after-ja-dark-default.png) |
| ja-dark, compact | [Before](before-ja-dark-compact.png) | [After](after-ja-dark-compact.png) |

## Verification and limits

All four before/after scenarios had zero horizontal overflow and no browser or HTTP errors. Toggle/revert, edit/cancel, keyboard detail open/close and image decoding passed. Saved definitions and logical exports of all three boards were unchanged after the UI sequence. Long original body/comment expansion matched the API text; completion styling remained visible on the ticket panel. Settings screenshots were byte-identical before and after.

The originals are unaltered. Separate implementation and independent visual reviewers inspected the desktop comparisons. Smartphone layout tuning and verification are explicitly outside this refinement's scope. This is synthetic desktop Chromium evidence, not a human usability study or a release-image test.
