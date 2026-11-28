# Keyboard focus after ticket creation

A person who starts a ticket from a Kanban card with `N` should return to that card after saving, including when the board redraws its cards. The previous behavior could move focus to the board search field.

## Matched capture

The captures use agent-browser 0.26.0 and headless Chromium 158 on macOS 26.7.3, with Node 26.13.1. The viewport is 1360 × 860 at device pixel ratio 1, English locale and light appearance. The source archive's package version is `1.6.0` for both runs. Both synthetic SQLite databases started as byte-identical copies of the Release desk board.

1. Focus the existing `Prepare the release digest` card in In progress. Press `N`, fill the title `Follow up on the release digest` and body `Recorded with the keyboard.`, then press `Meta+Enter`.
2. The real API accepts the POST and returns HTTP 201. A local test server holds the first subsequent board detail GET for 240 ms in each run and returns the actual HTTP 200 response. This makes the editor close before the cards are replaced.
3. Observe `document.activeElement` with browser focus events and on changes between animation frames. Capture the board after the new card appears and the editor has closed.

In `878467a`, the active element at the close event was the original card button. During the redraw that node lost focus and was removed. The final active element was `#search-input`. [Baseline result](before-en-light-after-save.png).

In `ec88279`, the original node was also active at the close event and was removed by the redraw. The recreated button for the original card then received focus with `:focus-visible` and a solid outline. The card retained focus after the new ticket appeared. [Candidate result](after-en-light-after-save.png).

Direct API reads in each run confirmed one new ticket in In progress with the exact saved body. The request log recorded one ticket POST per run and HTTP 201 for both. The [manifest](manifest.json) records the focus transitions, source revisions and original PNG hashes. Numbers assigned to element instances by the observer distinguish the old and replacement DOM nodes.

## Retained notification behavior

In a separate candidate check, submit `Record the release verification` and its draft tag `Release QA` from the same keyboard origin. Inject a HTTP 503 for the board detail GET after the real ticket POST succeeds. The editor closes, the original card regains visible focus and the existing message says `Ticket saved, but the view could not refresh. Reload to continue.` One HTTP 201, one ticket and one tag were confirmed. Removing the fault and reloading showed the saved card and tag. [Candidate failed-refresh result](after-en-light-refresh-failure.png).

These captures cover the reproduced Kanban timing and one synthetic fixture, viewport, locale and theme. No display styles or focus restoration logic were injected during capture. The timing delay and the supplementary HTTP 503 are controlled test conditions.
