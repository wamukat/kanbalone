# Kanban refresh after an SSE update

Kanbalone #1546 keeps eligible ordinary lane elements in place during an SSE refresh. A completed snapshot matches the same board and filter context, the full lane and ticket payloads, and the current card order. The first ticket must already be available in a retained lane so Search ArrowDown can still find it while changed lanes fill. Completion and inactive pagination controls are recreated with the new response.

The tested base was `de3406197f3efe8e790608003d6b74c91625ba92`. The implementation was `9413f6232feca686d233968cb2d6157a0077bf91`. Both served source web assets and used the same loopback API backend. Asset hashes are in `measurements.json`. Measurements used Chromium 159.0.8154.6 and Node 26.13.1 on an Intel Core i7-9750H Mac.

## Reproduction

1. Create the `kanban-high-active` SQLite fixture. It has 3,000 active tickets in six ordinary lanes and 200 completed tickets. The initial Done preview shows five tickets, giving an expected DOM of 3,005 cards. [Fixture generator](../2026-11-23-tag-render/prepare.mjs)
2. Start each variant with a fresh copy of the fixture. Open Kanban in English and light mode at 1440 × 1000. Wait for the SSE connection and all 3,005 cards. Set every lane's scroll top to its scroll range minus 80 px, and wait two animation frames.
3. Starting the host timer before issuing the request, patch the first ticket in the second ordinary lane through the real ticket API. Observe when its changed title enters the DOM. Observe the last expected card's insertion and then wait two animation frames. Verify the ordered IDs, retained scroll-container identities, lane scroll values, ticket collection request count and response bytes.
4. Run four alternating pairs in separate browser contexts. The first pair warms the environment. Summarize the remaining three samples per variant.

The completion measurement ends after the full expected DOM and two subsequent animation frames. Physical display presentation falls outside that interval. The first-title and Long Tasks measurements use Chromium browser timestamps.

## Same-session results

| Warm SSE measurement | Baseline | Candidate |
| --- | ---: | ---: |
| Host PATCH to all 3,005 cards and two frames, median (range) | 1,918.7 (1,889.9–1,941.9) ms | 636.8 (591.3–640.3) ms |
| Last ticket response to all cards and two frames, median | 1,818.6 ms | 525.9 ms |
| Browser start marker to changed title DOM, median | 180.0 ms | 198.5 ms |
| Longest browser task, median (range) | 97 (96–99) ms | 121 (104–122) ms |
| Observed long tasks, median count / total duration | 21 / 1,553 ms | 6 / 512 ms |
| Chromium layout / style duration, median | 501.6 / 172.2 ms | 226.2 / 29.4 ms |
| Ticket collection requests / decoded bytes | 19 / 1,609,095 | 19 / 1,609,095 |

Each candidate sample finished below one second in this case. The changed title arrived 18.5 ms later by the median, and the longest browser task increased by 24 ms. A separate sizing experiment found that limiting the synchronous retained-render batch from 120 to 24 cards, or one per replacement lane when there are more, reduced the longest task from 124 to 107 ms on the earlier base. That experiment has its own samples in `measurements.json`. Subsequent batches use the existing round-robin selection of up to 120 cards.

All samples matched the exact ordered card IDs and lane scroll offsets. The candidate retained the original five ordinary lane lists with IDs 1, 3, 4, 5 and 6. DOM completion timing here applies to a warm update of one non-leading ordinary lane. Cold board navigation and refreshes requiring a full rebuild have separate timing paths.

Chromium's uncollected JavaScript heap readings were 4.19 → 5.54 MB before the PATCH and 7.92 → 10.26 MB after the measured completion. These point-in-time readings include transient objects. The code releases its committed snapshot when the Kanban view is canceled or replaced. The active board scope, render token and mutation epoch guard any reuse or snapshot commit.

## Interaction and original images

With the final candidate, a real ArrowRight moved from the focused card in the retained first lane to card #830 in the second lane when that lane had 139 of 500 cards. The selected title stayed in view after all 3,005 cards and two frames. The first lane kept its 50,711 px scroll offset. A real Enter opened the detail whose title matched the saved API record. The regression test dispatches ArrowRight at the first changed-title mutation, then checks focus, viewport intersection and the saved detail after the rest of the lane appears.

The earlier failure reproduction compared a full-render baseline, a reuse candidate with no explicit keyboard-scroll guard, and a corrected candidate. The full-render baseline restored focus to the original card. The intermediate candidate moved focus to the new lane. Subsequent scroll restoration hid it. The corrected candidate kept the new focus target in view. A separate trusted Tab probe from an already-focused lane header during partial rendering reproduced the same offscreen focus on the full-render baseline and the corrected candidate. That existing behavior is tracked separately in Kanbalone #1550.

Three optimistic-write probes simulated failed saves for same-lane card moves, cross-lane card moves and lane reordering. Each first observed the optimistic move, then patched another title through the real API while the save was paused. The SSE update rebuilt the board during the write. Returning HTTP 500 to the paused save restored the original saved order and the exact 3,005-card DOM. A separate leading-lane update exercised the full-render fallback and a queued Search ArrowDown. Raw observations are in `interactions.json`.

The original before-and-after pair for Kanbalone #1546 shows a separate fresh fixture copy after editing Todo #2978, waiting for the SSE refresh, and verifying the visible title `Warm SSE: one lane updated` through the saved API record. Both originals use the same 1440 × 1000 English/light setup and were byte-identical. The images verify the settled viewport, including the title, counts, cards, tags and scroll positions. The timing and saved state come from the probes.
