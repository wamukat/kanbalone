# Lane drag preview

Kanbalone #1543 limits the number of cards copied to the browser's lane drag preview. The preview copies a prefix of the lane and uses the height of the remaining items to keep its scroll range. The same rule applies to an expanded inactive-ticket list inside the preview. The full board keeps its original cards and drag targets.

## Native drag timing

The baseline was `88c74f4911212912f04f1f214861fdc13818daaa`, including the inline Kanban card icons and block lane layout. The candidate changed only `app-kanban-board.js`. `measurements.json` records both source hashes. The experiment used an isolated synthetic SQLite copy, Node 26.13.1, and Chromium 159.0.8154.6 on an Intel Mac over loopback HTTP.

The initial board contained 3,013 cards. The first lane contained 1,016 and was scrolled 3,900px before the drag. A trusted pointer moved the lane title beyond the midpoint of the next lane. The experiment discarded one warmup per phase and retained three pairs, alternating measurement order.

| Measurement | Baseline | Candidate |
| --- | ---: | ---: |
| Cards copied to the preview | 1,016 | 5 |
| Host pointer move to observed `dragstart`, median (range) | 294.3 (271.1–317.2) ms | 105.7 (103.1–108.0) ms |
| `dragstart` capture to return from `setDragImage`, median (range) | 134.5 (127.9–151.6) ms | 23.7 (21.2–24.8) ms |

Each run kept the preview height at 420px and the preview list at 327px with a scroll height of 104,466px and initial scroll top zero. Each run saved the reordered lanes and verified the same order through the API and after reload. The host interval starts before issuing the pointer command. The capture interval includes preview construction and layout around `setDragImage`. Native cursor image presentation falls outside both intervals.

## Visual and interaction verification

| Source lane | Cards copied, baseline → candidate | Preview list scroll height / client height in both phases |
| --- | ---: | ---: |
| Empty | 0 → 0 | 16 / 16 px |
| Seven cards that fit in the source lane | 7 → 6 | 611 / 327 px |
| Expanded inactive list with 53 cards | 53 → 5 | 4,629 / 327 px |

All three edge cases used a real pointer to start the drag, then Escape and mouse release to cancel. The preview cleared and the lane order read back from the API matched the initial order. Separate injected negative coordinates reported the same minimum `setDragImage` offset of `[24, 18]` in both phases. The targeted E2E also measures the original card extent in a deliberately taller source lane and checks the clipped preview's scroll range, copied card count, offset, cleanup and source card count.

Seven English/light 1440 × 1000 image pairs were byte-identical and independently reviewed. The three board captures show the source lane before the drag, the board's feedback during the move, and the saved lane order after reloading. The other four pairs show the app-created preview element positioned temporarily for diagnostic capture. The OS cursor image is outside the capture. Kanbalone #1543 comment 4585 holds the 14 original PNGs. All 14 decoded successfully in a read-only browser session.

The supplemental Japanese/dark 390 × 1000 comparison for the seven-card lane also matched byte-for-byte and retained the 611px scroll range and 327px client height. Its original capture hashes are recorded separately in `measurements.json`.
