# Smooth Kanban button scrolling

2026-11-29, Chromium, Japanese/light, 1440 × 900, identical six-lane isolated SQLite fixtures. Baseline public assets: `5970edbf7a6277d1d06b92f47529715f394a0d94`; candidate sources and unmodified captures are fingerprinted in [sha256.json](sha256.json). Existing user data was not used.

Only the left/right button handler changes: request native smooth scrolling, or instant scrolling when prefers-reduced-motion is reduce at activation time. Existing movement distance, overflow-only visibility and edge disabling remain. Wheel/drag behavior is not changed through global CSS.

| State | Before | After |
| --- | --- | --- |
| Starting left edge | [Before](originals/before-start.png) | [After](originals/after-start.png) |
| Settled right edge | [Before](originals/before-end.png) | [After](originals/after-end.png) |

Static images establish comparable geometry and endpoint state, not motion. The [before frame record](originals/before-movement.json) shows the right-button handler reaching 822px immediately (one sample). The [after frame record](originals/after-movement.json) records 17 requestAnimationFrame samples from 0 to 822px over 488ms, including intermediate positions. Both reduced-motion records reach 822px immediately. Timing is a browser/environment observation, not a fixed-duration product guarantee.

Sequence: open six-lane board → capture left edge → activate Right and sample positions until settled → assert intermediate positions only for normal candidate motion → verify right disabled/left enabled → capture endpoint → focus Left and press Enter → verify return to zero/left disabled → change reduced-motion preference on the same page → activate Right and verify immediate endpoint. Read back unchanged lane data through API.

Validation: the new motion case and existing light/dark edge, resizing and board-switch cases passed (three candidate cases); one baseline capture case passed. Public JavaScript types and production build passed. Independent review found no actionable findings. No mobile matrix or human usability study. Captures and measured frame records complement interaction and persistence assertions.

CI initially caught the measurement loop ending 1px short while the assertion required less than 0.5px error. The loop now waits to the assertion tolerance; the product handler is unchanged. The focused motion case passed and candidate frame evidence was recaptured.
