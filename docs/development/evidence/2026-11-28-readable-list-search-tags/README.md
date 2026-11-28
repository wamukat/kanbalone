# Readable List rows, one search clear action, and sidebar tag filters

## Matched product captures

On 2026-11-28 JST, agent-browser 0.26.0 and headless Chromium 158 captured the synthetic Release desk board from identical initial SQLite copies. Both processes ran from their respective source archives on macOS 26.7.3 and Node 26.13.1. The viewport and locale pairs are Japanese/light at 1024 × 768 and English/dark at 1440 × 900, DPR 1. There are five tickets and eight colored tags. Ticket #1 is open and has a long title. Ticket #4 is a completed child. Both have all eight tags.

The baseline is `f699302`. The screenshots and interaction checks use `992dae2`. The subsequent change in `dccae56` mounts List rows during the scroll event and preserves the settled layouts shown in the captures. The final jump check below uses `dccae56`. The [manifest](manifest.json) records the full versions, source fingerprints and original PNG digests.

| Scenario and action | Japanese / light | English / dark |
| --- | --- | --- |
| Open List at the top without filters. | [Before](before-ja-light-list.png) · [After](after-ja-light-list.png) | [Before](before-en-dark-list.png) · [After](after-en-dark-list.png) |
| Focus search and type `Release`. | [Before](before-ja-light-search.png) · [After](after-ja-light-search.png) | [Before](before-en-dark-search.png) · [After](after-en-dark-search.png) |
| Select `Release` and `Docs` with the toolbar picker, select `In progress`, and open the `Asynchronous integrations` editor. In the candidate, first activate Manage tags. | [Before](before-ja-light-sidebar-tag-edit.png) · [After](after-ja-light-sidebar-tag-edit.png) | [Before](before-en-dark-sidebar-tag-edit.png) · [After](after-en-dark-sidebar-tag-edit.png) |

At 1024 px, the baseline's 64 px rows clipped six of the eight tags on each of the two example tickets. The candidate rows measured about 239 px at 1024 px wide and 155 px at 1440 px wide, with all eight tags contained inside each row. Scroll to see the remainder of a row that extends below the List viewport. The full long title wraps inside the title cell. The result count reports five, and the select-all and each sampled row checkbox have localized, distinguishable names.

While `Release` was focused and entered, both versions returned three matching tickets. The baseline showed the browser × and the app ×. The candidate showed a single clear button. Clearing handed focus back to search and left active tag and lane choices intact. Escape in each tag/lane picker returned focus to its trigger. A query with no matches showed the active conditions, and the empty-state reset returned all five tickets. [Empty state](after-en-light-no-matches.png).

## Tag filtering and saved results

Activating `Release` in the sidebar by Space showed tickets #1, #3 and #4. Adding `Docs` in the toolbar selected it in both places and showed four tickets. Selecting the `In progress` lane reduced that union to #3. Clearing only search retained this filter result.

In management mode, editing `Release` and canceling restored focus to that badge and kept the full tag response unchanged. Saving `Release confirmed QA` and color `#336699` retained tag ID 1 and the reference from ticket #3. Refreshing the page retained the selected filter and showed the saved name and color. `Docs` deletion was canceled once with the full tag response unchanged. Confirming removed only tag ID 2, removed its association from #2, and preserved the active tag ID 1 and its three results on reload. [Saved and reloaded](after-en-light-tag-saved-reloaded.png) · [Measured layout and stored checks](interaction-verification.json).

## Scale check and timing

The existing synthetic SQLite fixture from the Group icon evaluation has 10,005 tickets in board 2, with 9,995 visible under the default archive filter. An isolated copy adds eight tags and gives 113 tickets a mix of those tags and longer titles through the regular API. Baseline and candidate each start from an exact copy of that enriched database. No user workspace data is present.

A single Playwright Chromium 159 process opened three alternating `f699302` and `992dae2` pairs at 1024 × 768 with English/light appearance. Each visit used a new browser context. The server processes and OS were kept running. Time starts at browser navigation and ends when an on-screen List row is present after two animation frames. This measures a local first-visible milestone. It does not show that every user device will reach one second.

| Measurement | Before | After |
| --- | --- | --- |
| First-visible time, all three runs | 1224 ms, 703 ms, 710 ms | 1174 ms, 700 ms, 710 ms |
| First-visible median | 710 ms | 710 ms |
| Mounted rows at the first-visible sample | 32 | 15 |
| Ticket collection requests and encoded response bodies | 50 · 6,125,413 bytes | 50 · 6,125,413 bytes |
| Settled scroll sample across 0%, 17%, 52%, 89% and 100% | 23–55 ms | 19–79 ms |

The first pair exceeded one second on both builds. The later pairs met it in this environment. Unvisited rows retained their scrollbar positions, with only the relevant window mounted. The bottom sample reached synthetic ticket #11010, and ArrowDown on the preceding visible ticket moved focus to it in all runs.

In `992dae2`, each large programmatic jump sampled one animation-frame callback with no intersecting List rows. The next callback showed rows. This records DOM geometry, with no claim about compositor paint. In the single `dccae56` repeat, all five jumps had intersecting rows from their first sample, the last row and keyboard path worked, and the collection requests and bytes matched. Its separate 1341 ms initial observation is outside the paired comparison. [Timing script](measure-list.mjs) · [Paired raw samples](scale-matched.json) · [Final jump sample](scale-final-jump.json).

The capture and interaction checks used Chromium. The two viewport/theme pairs are representative and do not cover all devices or assistive technologies. The mock was verified separately from these product captures.

## Automated verification

The local Node.js 26.13.1 `pnpm check` started from `992dae2` before the synchronous List scroll change was applied to the worktree. It completed with 311 passing tests, lint, build, public type checking and the documentation build. On the frozen `dccae56` product source, TypeScript compilation and four focused Chromium tests passed. They cover combined search filters, shared sidebar tag filters and edit drafts, deep anchors while updating a variable-height row, and the existing virtual scroll jump.
