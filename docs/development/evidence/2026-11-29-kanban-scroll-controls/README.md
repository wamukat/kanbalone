# Kanban horizontal scroll availability

2026-11-29; Chromium, Japanese, 1440 × 900, light screenshots. Dark styling also tested. Isolated temporary SQLite fixtures with six empty lanes; no user data. Baseline public files: `d53fa08cfbe8baa245c26c1c6224637e8d4b765f`. Candidate source and unmodified images: [SHA256](sha256.json).

Two issues reproduced: the left button was natively disabled but had the same text/opacity/background as the enabled button, retained a pointer cursor and hover border emphasis. At the right end, the reserved vertical scrollbar gutter (with overflow-y:hidden) reduced clientWidth by 11px even though it did not reduce the actual horizontal scroll range. Measured scrollWidth=1950, clientWidth=1117, viewport width=1128, maximum reached scrollLeft=822; the old expression expected 833 and left the right button enabled.

The end calculation now uses the rendered inner border-box width. Disabled controls have muted text, an inset background, reduced opacity and a default cursor, and do not highlight on hover. Existing labels, native disabled semantics, keyboard operation and overflow-only visibility remain.

| Position | Before | After |
| --- | --- | --- |
| Left edge | [Before](originals/before-left.png) | [After](originals/after-left.png) |
| Middle | [Before](originals/before-middle.png) | [After](originals/after-middle.png) |
| Right edge | [Before](originals/before-right.png) | [After](originals/after-right.png) |

Steps: open the six-lane board, capture left edge; activate Right with Enter, move to halfway and capture; scroll to the browser's clamped right edge and capture. Confirm disabled/available directions, disabled hover/cursor/opacity, Left click movement, resize to fit all lanes and back, then switch to a one-lane board and back. Read back unchanged lane data through the API. Baseline deliberately asserts the reproduced right-edge enabled bug; candidate asserts disabled.

Validation: two candidate browser cases (light/dark) and one baseline capture case passed; CSS token lint, public JS types and production build passed. No backend code or data mutation changed. Screenshots are representative desktop states; no mobile or human usability study. The 3000px viewport is used only to prove no-overflow visibility, not as a target design. Reviewer checks the source and actual captures before merge.
