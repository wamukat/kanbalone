# Kanban card and lane rendering

Kanbalone #1542 uses SVG markup generated from `public/icons.svg` for the repeated hierarchy, priority, status and blocker icons on Kanban cards. Group uses the same generator. Scrollable Kanban lanes lay out their items as blocks with the existing spacing. The release change is confined to browser assets and requires no migration.

## Performance

Baseline `12a100e70e1666169ad902c13680f15df0d33829` served the same synthetic SQLite data and backend in each phase. The candidate static asset hashes are in `measurements.json`. Runs used Node 26.13.1 and Playwright Chromium 159.0.8154.6 on an Intel i7-9750H Mac, over loopback HTTP. The viewport was 1440 × 1000 in English and light mode. Each variant had one excluded warmup and five retained samples per fixture, with a fresh browser context per navigation and alternating variant order.

The full display endpoint detects the first expected card and the final card count, followed by two animation frames. The harness then verifies the complete ID sequence. The first-card endpoint uses the same two frames after the first card appears. The viewport endpoint uses the count of cards intersecting the settled initial viewport in each visible lane, then measures when that prefix first exists in the DOM and two animation frames have elapsed. These measure DOM availability. Paint completion and INP require separate measurements.

| Initial cards | Full display, baseline median (range) | Inline SVG | Inline SVG and block lanes median (range) | First card, baseline → candidate | Initial viewport, baseline → candidate |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 313 | 363.5 (349.3–483.8) ms | 327.5 ms | 326.2 (312.9–343.2) ms | 315.5 → 293.9 ms | 315.5 → 293.9 ms |
| 3,013 | 2,619.5 (2,526.0–2,882.8) ms | 2,074.0 ms | 1,927.1 (1,808.1–1,965.9) ms | 406.8 → 373.5 ms | 406.8 → 373.5 ms |
| 3,005 | 2,745.4 (2,714.0–2,855.3) ms | 2,146.3 ms | 1,991.5 (1,957.4–2,041.3) ms | 394.8 → 364.5 ms | 394.8 → 364.5 ms |

The candidate reduced total time in all five paired comparisons for each fixture. The two large cases remain above one second. At 3,013 cards, DevTools cumulative layout was 831.6 → 540.3 ms and style recalculation 381.1 → 183.3 ms. At 3,005 cards, the same durations were 823.1 → 520.7 ms and 392.3 → 179.6 ms. The median of each sample's longest task reported by the browser's 50 ms Long Tasks API was 62 → 52 ms, 133 → 94 ms and 126 → 100 ms for the three fixture sizes respectively.

A separate exploratory run compared a larger batch size. It reduced the full-display interval but increased the first-card interval and longest reported task. Separate experiments with batch HTML creation and delegated events showed smaller gains. The retained comparisons use the existing 120-card round-robin scheduler.

## Display verification

All cards matched the expected ID sequence and the baseline's card and control geometry hashes, lane scroll heights, rendered tag markup and ticket-page request sizes. The first-screen image for each fixture was byte-identical across the three measured variants. Screenshots were captured after fonts loaded, outside the timing interval. Actual browser captures in English at 1440 × 1000 light and Japanese at 390 × 844 dark matched byte-for-byte in the two large fixtures. The three fixtures include historical distributions with hidden inactive tickets and Done previews, and a high-active fixture with all four priorities, parents and children, blockers, and wrapping titles.

## Keyboard and native lane drag

A separate run focused the first rendered card title and sent a trusted Enter while the board was still rendering the remaining cards. Each fixture used one excluded warmup and three retained pairs. The host clock started before issuing the key and finished after observing the detail dialog and two animation frames. The logged browser interval uses the trusted key event timestamp as its start. Every run opened the expected ticket and matched its title to the ticket detail API.

| Initial cards | Key command to observed detail, baseline → candidate | Browser key timestamp to dialog and two frames |
| ---: | ---: | ---: |
| 3,013 | 489.5 → 324.6 ms | 414.1 → 266.6 ms |
| 3,005 | 462.0 → 361.7 ms | 389.3 → 297.6 ms |

Native pointer input dragged the first lane, with 1,016 cards, past the midpoint of the next lane. The median host move command to observed `dragstart` was 473.0 → 329.1 ms. The interval from `dragstart` capture to the return from `setDragImage`, including the preview clone and related layout, was 221.1 → 149.2 ms. Each measured preview still contained 1,016 cards and had a 420px cap. All runs verified the reordered lane sequence through the API and after reload. The before, drag feedback, and after-reload image pairs are byte-identical. The timing measures JavaScript completion around drag setup. The system drag image presentation is outside the observation interval.

The retained durations, ranges, experiment warmups and screenshot hashes are in `operations.json`. Chromium’s `window.find()` returned a match for the same offscreen title in both phases of each large fixture. The records include the matching horizontal scroll behavior observed in one fixture. Neither fixture exposed the found card as a document selection in either phase. This probes the engine API, with browser Find controls outside the test.

## Verification on the current base

The change was rebased onto `3b6519dae6b5e1e3499647e7b2c93edd8319abff` after the keyboard and editor changes landed. The original comparison above used `12a100e`. An additional initial-screen capture of the 3,013-card board on the new base was byte-identical before and after. `pnpm check` passed 257 tests and the OpenAPI, build, public type and documentation checks. All 48 targeted Chromium E2E tests passed, including occupied and completion lane drops, cancelled and rejected drops, inactive and completion pagination, lane and board scroll, keyboard focus, and Group layout. The 14 originals in Kanbalone #1542 comment 4576 decoded successfully in a read-only browser session.

## Reproduction

Use Node 26 and a disposable repository checkout with dependencies installed. Seed the existing synthetic fixture archive, export the paired baseline public assets and run the shared benchmark.

```sh
export KANBALONE_RENDER_OUTPUT="$PWD/coverage/kanban-render-perf"
tag_evidence=docs/development/evidence/2026-11-23-tag-render
node --import tsx "$tag_evidence/prepare.mjs"
mkdir -p "$KANBALONE_RENDER_OUTPUT/before"
git archive 12a100e70e1666169ad902c13680f15df0d33829 public | tar -xf - -C "$KANBALONE_RENDER_OUTPUT/before"
node --import tsx "$tag_evidence/benchmark.mjs" "{\"rounds\":6,\"runLabel\":\"kanban-pair\",\"screenshots\":true,\"subgeometry\":true,\"trackViewport\":true,\"cases\":[\"kanban-1000\",\"kanban-10000\",\"kanban-high-active\"],\"variants\":[{\"name\":\"baseline\",\"staticDir\":\"$KANBALONE_RENDER_OUTPUT/before/public\"},{\"name\":\"inline-block\",\"staticDir\":\"$PWD/public\"}]}"
```

To reproduce the inline-only comparison, make a separate copy of the candidate assets and replace its `styles/lanes.css` with that file from the baseline. Run the benchmark on the same host without concurrent test runs. `measurements.json` contains the retained comparison and its excluded warmup samples.
