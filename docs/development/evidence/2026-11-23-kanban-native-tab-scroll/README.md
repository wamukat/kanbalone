# Native Tab during Kanban lane rendering

This change keeps a card visible when the browser moves focus to it with Tab or Shift+Tab while its lane is still rendering. The focus event ends pending scroll restoration for that lane. The other lanes continue to restore their saved positions. Existing explicit Arrow navigation retains its separate rule for partially replaced lanes. [PR #59](https://github.com/wamukat/kanbalone/pull/59)

The baseline was `691c55db03798a5789802b30752c0b156ee4a028`. The candidate was `c562d2baef971024b68b76fb629a47c25cfdf066`. The experiment used Chromium 159.0.8154.6, Node 26.13.1 and source assets over loopback HTTP with an isolated SQLite fixture.

## Reproduction

1. Open a fresh copy of the `kanban-high-active` fixture in English and light mode at 1440 × 1000. Wait for the board SSE connection and the expected 3,005 cards. Scroll every ordinary lane near its end. [Fixture generator](../2026-11-23-tag-render/prepare.mjs)
2. Patch the first card title in the first ordinary lane to exercise a full redraw. On a fresh copy, patch the first card in the second lane to exercise lane reuse. Let the real SSE event refresh the board.
3. When the updated lane first contains the changed title, focus its header menu for forward Tab or the New ticket button for Shift+Tab with `preventScroll`. Send the native key while the lane is still incomplete. Observe the trusted input, the focused ID and the browser's focus event.
4. Wait for all 3,005 expected ordered cards and two more animation frames. Check the same focused card against its lane viewport, then press Enter and compare the opened title with the saved ticket read through the API.

## Outcomes

The same native key reached the same card at the same partial card count for each baseline and candidate pair. Each lane viewport spanned approximately 155–927 px vertically.

| Refresh path | Key | Cards in target lane at input | Focused card | Final title Y, baseline → candidate |
| --- | --- | ---: | ---: | ---: |
| Full redraw | Tab | 40 | #1 | −50,534.7 → 176.3 px |
| Full redraw | Shift+Tab | 60 | #355 | −44,443.0 → 837.0 px |
| Lane reuse | Tab | 259 | #2 | −50,534.7 → 176.3 px |
| Lane reuse | Shift+Tab | 379 | #2270 | −11,555.0 → 837.0 px |

The candidate kept all four focused cards visible through the remaining batches. Each press of Enter opened the stored record in both versions. In all cases, the other ordinary lanes preserved their saved 50,711 px scroll offsets and the Done preview stayed at zero.

A standalone programmatic focus call retained the old scroll restoration. A canceled Tab with programmatic focus during keydown also retained scroll restoration. The regression test holds the later animation frames at the first changed-title mutation. It sends a native Tab and resumes the frames before checking the focused card's viewport intersection and the saved detail opened by Enter.

The two original image pairs show the forward Tab result for full redraw and lane reuse, after the complete card set and before pressing Enter. The target lane's visible scroll position reflects the native focus result. The other visible lanes remain at the same positions in each pair. The raw checks record focus, scroll and the read-back title. The interaction observations apply to the tested Chromium engine.

All four originals decoded at 1440 × 1000 in a read-only browser session.

`pnpm check` passed, including all 268 unit checks. The related Chromium suite passed 25 of 26 tests, including the new native Tab case and the existing ArrowRight and search-navigation cases. The Completion paging fixture completed every action and assertion and closed its page. The sole local timeout came from the fixture's subsequent Playwright browser context teardown on macOS.
