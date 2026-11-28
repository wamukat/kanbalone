# Readable card icons — GH #101, #102, #116

2026-11-28 JST. Actual isolated application captures, not the design mock. The user accepted the icon-only design and explicitly requested that last-card tooltips escape lane clipping. No ordinary runtime or user data was changed.

## Versions and fixture

- Before: main `f8e8afb8053be69c4b35c09ebe33221a7681b67e` (port 3731).
- Reported release reproduced separately: `v1.6.0`, `4920daffe31a835a43996bead3a9f62f847d3f21` (port 3732).
- After captures and scale measurement: product commit `4c762f71dc1ade3ba62bc6fd40e203d7245f8e47` (port 3733). Captured public-file fingerprints remain in `checks/candidate-file-sha256.json`.
- Final product: `b3a591735530cf316af0292f852fe28d386da0e1`, with `checks/final-file-sha256.json`. The Escape follow-up below changes event propagation only; the original captures remain unaltered.
- Node 26.13.1, agent-browser 0.26.0, headless Chrome 158.0.8127.89, macOS. Browser UI captures use agent-browser; the separate scale measurement uses Playwright Chromium.
- `fixture.sqlite.gz` is a closed, synthetic database. Each version starts from its own copy. `fixture.json` maps board 1, three lanes, seven tickets. It includes urgent with/without blockers, all priorities, standalone/parent/child, resolved child, independent Task counts, and a long title/multiple tags/high ID `123456789`. The high ID is deliberately seeded through the synthetic SQLite sequence; all ticket content and relationships are created through application APIs.
- Main/release/after desktop comparisons: Japanese, light or dark, 1440×900, sidebar open, no active filters or selection. Narrow pair: English UI, dark, 390×844, sidebar collapsed, initial board scroll. Ticket titles are the same fixture text in both languages.

## Comparison and ticket mapping

| Ticket | Before | After | Observation |
| --- | --- | --- | --- |
| #101 | [main light](originals/before-ja-light.png) / [release light](originals/release-ja-light.png) | [after light](originals/after-ja-light.png) | The old urgent circle and blocker octagon both contain a tiny exclamation mark. The new blocker uses a lock; priority remains a circle. Regular ticket title starts become 63px for tickets 1–4 regardless of blocker count; before starts are 81/59/59/59px. |
| #102 | [main light](originals/before-ja-light.png) | [after light](originals/after-ja-light.png), [narrow keyboard description](originals/after-en-dark-narrow-focus.png) | Icons move to a compact footer. Hierarchy/priority/blocker/Task meaning is available on icon hover and title focus. Task `1/4` is identified as Tasks, not completed children. No child-count API or new aggregation is introduced. |
| #116 | [main dark](originals/before-ja-dark.png), [main light](originals/before-ja-light.png) | [after dark](originals/after-ja-dark.png), [after light](originals/after-ja-light.png) | ID changes from 11px to 12px. Computed ID contrast: light 3.07→4.96:1, dark 4.38→7.25:1. Long ID wraps inside its fixed column without overlapping the title. |

[Narrow before](originals/before-en-dark-narrow.png) / [narrow after](originals/after-en-dark-narrow.png). Main and release reproduce the reported tiny icons and light-ID 3.07:1. JSON observations are under `checks/`; icon mask size is checked in the implementation tests, not inferred from an absent SVG element.

## Tooltip sequence and edge checks

1. Open board 1. Hover the priority icon on last Todo ticket #3, blocker on last In progress ticket #123456789, and Task count on last Done ticket #6.
2. Observe each description outside the card/list clipping region: [Todo](originals/after-ja-light-last-todo-tooltip.png), [In progress](originals/after-ja-light-last-doing-tooltip.png), [Done](originals/after-ja-light-last-done-tooltip.png).
3. Their measured portal parent is BODY; all bounds remain inside the viewport and `elementFromPoint` at each tooltip center hits the tooltip. Move the pointer onto the description: it remains visible. Escape hides it.
4. At English dark 390×844, focus the last Todo title. Native scrolling leaves its description visible: [focus](originals/after-en-dark-narrow-focus.png). At 1440×360, scroll In progress to its final card and hover its blocker: [short viewport](originals/after-en-dark-bottom-edge-tooltip.png). Bounds/visibility are recorded in the matching JSON files. These are additional interaction states, not paired baseline screenshots; the baseline used native title tooltips, and the clipping observation came from the design mock.

Initial QA found focus-triggered automatic scrolling could hide the description. The final implementation was corrected and these final captures were repeated. The independent reviewer also checked focus/Escape, pointer travel into the tooltip, scroll and DOM-removal cleanup. This does not claim an actual screen-reader usability study.

## Escape follow-up after initial CI

CI run 46140772849 found that the tooltip's Escape capture consumed the existing action that returns focus from a card to search (English and Japanese). Product commit `b3a591735530cf316af0292f852fe28d386da0e1` removes only `preventDefault` / `stopPropagation` from this handler while retaining tooltip dismissal. A separate stale typography assertion was updated from 11px to the user-approved 12px.

Public JavaScript type checking and all 21 Chromium cases in `card-readable-icons.spec.ts`, `keyboard-navigation.spec.ts` and `layout-visual-system.spec.ts` passed. Added assertions cover visible description → Escape → hidden description and search focus, plus showing the description again on renewed title focus. See `checks/escape-followup.json`.

No CSS, markup, icon, layout or color changed in this follow-up. Original PNG hashes were reverified unchanged; images and scale measurements were not recaptured and continue to describe the capture commit above. This distinguishes the final interaction verification from the earlier visual and performance observations.

## Stored result and reload

Open ticket #1 → normal view → complete Task #2. [Detail after completion](originals/after-task-completed-detail.png). GET `/api/tickets/1/tasks` reports 4 Tasks, 2 done (`checks/after-task-saved-api.json`). Navigate/reload the board: [stored 2/4 on card](originals/after-task-reload-card.png). Reopen the Task through the UI; API confirms 1/4 restored (`checks/after-task-restored-api.json`). The ordinary comparison images use the original 1/4 state. Task completion does not resolve the ticket, alter blockers or change the parent/child relationships.

Agent-browser's wait-for-function command timed out in some same-session navigations while the next snapshot/evaluation showed the expected loaded board. These timeouts are not counted as successful timing measurements; final captures were visually inspected, and saved state was checked separately through the API. Fresh-session checks and the independent regression tests passed.

## Bounded virtualization measurement

A separate synthetic board has 1,000 tickets with varied title length and tag wrapping. Three alternating before/after rounds, 1440×900 light, fresh contexts, no concurrent heavy test suite. Measurement is navigation start → first card DOM appearance + two animation frames, not paint completion or INP.

- Before: 297, 268, 335ms (median 297ms). After: 369, 309, 262ms (median 309ms).
- Both versions initially mount 11 cards; maximum across top/middle/end probes is 17.
- All three positions retain visible cards with no overlap; the final ticket is #1000, the end gap is exhausted, and ArrowUp from #1000 focuses #999.
- No page errors in these runs. Results in `checks/scale.json`. This small local probe supports bounded rendering and measured-height behavior, not a statistically significant performance difference or a universal latency guarantee.

## Reproduction and limits

Extract each source revision and supply installed dependencies. Decompress the fixture into separate database files, then run `node --import tsx serve.mjs RUNTIME DB serve PORT` from the corresponding runtime. Capture the states above with the listed viewport/theme/language. For the separate scale fixture, run `seed-scale.mjs RUNTIME OUTPUT_DIRECTORY`, serve the generated `scale-before.sqlite` and `scale-after.sqlite`, then `node measure-scale.mjs RUNTIME OUTPUT_JSON BEFORE_PORT AFTER_PORT`. Local imports require a Node installation supporting `node:sqlite` and the project's dependencies.

Original PNGs are unaltered. SHA256SUMS covers this evidence. No external adapter is simulated, and no real user data is used. Product-wide regression tests and Required checks are recorded in the PR separately; these focused observations do not replace them. Narrow toolbar overflow and full-title truncation are existing behavior outside these three tickets.
