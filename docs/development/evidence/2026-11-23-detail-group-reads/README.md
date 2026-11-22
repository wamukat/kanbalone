# Ticket detail and Group reads

Kanbalone #1538. The List still uses the complete priority-independent references for the rows it displays. When ticket detail is open at the end of a List refresh, the board retrieves the same unfiltered and archived references through the lightweight endpoint. Board rows and references must share a ticket revision. The Group link and Group forms wait on the member collection that the board render already started.

## Timing

We ran Chromium 159.0.8154.6 on loopback against separate copies of the existing synthetic SQLite fixture. The baseline is `12a100e70e1666169ad902c13680f15df0d33829`. The [measurements](results.json) include the fixture and candidate source hashes, every pair, and the original image hashes.

The table measures from the click capture or browser-history action to the expected UI state plus two animation frames. The expected states were the List visible with the dialog closed, the comment saved indicator, and the selected Group with all expected rows. We alternated the order of builds with one excluded warmup and two retained readings per condition.

| Action | Board tickets | Before median and range | After median and range | Before → after trials within 1 second | Before → after API requests |
| --- | ---: | ---: | ---: | ---: | ---: |
| Back from ticket detail to List | 1,005 | 231 ms (197–265) | 164 ms (162–167) | 2/2 → 2/2 | 12 → 12 |
| Back from ticket detail to List | 10,005 | 1,351 ms (1,346–1,357) | 867 ms (860–873) | 0/2 → 2/2 | 102 → 102 |
| Save a comment from List | 1,005 | 187 ms (184–189) | 151 ms (143–158) | 2/2 → 2/2 | 16 → 16 |
| Save a comment from List | 10,005 | 1,077 ms (1,076–1,078) | 939 ms (921–958) | 0/2 → 2/2 | 106 → 106 |
| Follow the Group link in ticket detail | 1,005 | 486 ms (461–510) | 437 ms (429–445) | 2/2 → 2/2 | 12 → 10 |
| Follow the Group link in ticket detail | 10,005 | 3,787 ms (3,727–3,846) | 3,816 ms (3,790–3,842) | 0/2 → 0/2 | 57 → 55 |

The large List replaces 51 full ticket-summary responses with 51 reference responses on both actions. The large Group loads 10,000 members in either build. It sends the Group summary and unassigned count requests once each, down from twice each. The Group timing ranges overlap. An earlier Group implementation produced a slower result and was adjusted to preserve the timing of board readiness handling. The final Group ranges do not establish a time improvement. The List code path was identical in both candidate iterations.

The sample shows local timings for these fixture actions. It does not estimate production percentiles, native input latency, mobile timings or time until paint completion.

## Before and after

The original large-board captures use English, 1440 × 900, light mode and the same fixture. Each pair shows the same UI state at the end of its named step. The screenshots were captured on 2026-11-23 JST.

| Action | Baseline before action | Candidate before action | Baseline after action | Candidate after action |
| --- | --- | --- | --- | --- |
| Back from ticket detail | [Ticket detail](back-2-en-light-1440x900-baseline-before-action.png) | [Ticket detail](back-2-en-light-1440x900-candidate-before-action.png) | [Returned List](back-2-en-light-1440x900-baseline-after-action.png) | [Returned List](back-2-en-light-1440x900-candidate-after-action.png) |
| Save comment | [Entered comment](comment-save-2-en-light-1440x900-baseline-before-action.png) | [Entered comment](comment-save-2-en-light-1440x900-candidate-before-action.png) | [Saved comment](comment-save-2-en-light-1440x900-baseline-after-action.png) | [Saved comment](comment-save-2-en-light-1440x900-candidate-after-action.png) |
| Follow Group link | [Group link](open-group-2-en-light-1440x900-baseline-before-action.png) | [Group link](open-group-2-en-light-1440x900-candidate-before-action.png) | [Selected Group](open-group-2-en-light-1440x900-baseline-after-action.png) | [Selected Group](open-group-2-en-light-1440x900-candidate-after-action.png) |

Back and Group captures are byte-identical across builds. Independent visual review confirmed equivalent comment form and saved state. Comment timestamps differ between runs and account for the differences in those captures. Each timing run checks the stored comment through the ticket API. The archived-blocker regression also checks the title of the reference link, the stored relation ID and the saved comment.

The focused unit suite passed all eight cases, and public JavaScript type checking passed. Twenty-three related Chromium cases passed in the initial run. The new Group link regression passed when rerun with its expectation corrected to use the test server's absolute URL.

## Reproduction

From the candidate root with Node 26 and Chromium installed by Playwright:

```sh
output=coverage/subsecond-data
mkdir -p "$output/variants/base"
git archive 12a100e70e1666169ad902c13680f15df0d33829 src public package.json tsconfig.json | tar -xf - -C "$output/variants/base"
ln -s "$PWD/node_modules" "$output/variants/base/node_modules"
gzip -dc docs/development/evidence/2026-11-22-group-inline-icons/fixture.sqlite.gz > "$output/fixture.sqlite"
SUBSECOND_SAMPLES=3 SUBSECOND_SCENARIOS=back,open-group,comment-save node --import tsx docs/development/evidence/2026-11-23-detail-group-reads/bench-actions.mjs "$output/variants/base"
```

The script writes JSON observations and unchanged original PNGs under the output directory. It starts isolated loopback servers and writes comments only to temporary copies of the synthetic fixture.
