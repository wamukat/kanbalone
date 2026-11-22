# Group and List collection performance, 2026-11-23 JST

Group reads the visible row fields and ordered tags through a paged member endpoint. The List keeps server-side priority filtering and loads its priority-independent references through a separate lightweight page. With all four priorities selected, List reuses the displayed collection for references.

Baseline main is `899d0f0117ee52e6d57db59241312f0fa4fcd0f7`. [API results](api-results.json) record the candidate changed source hashes, fixture hash and each retained sample. The runs used the repository's preexisting synthetic Group fixture, with an independent SQLite copy per version. No user data was used.

## API collection

The probe ran both builds on loopback under Node 26.13.1, with one excluded warmup pair and seven retained pairs in alternating order. The Group sample covers member pages for one selected Group. The summary, ungrouped count probe and DOM rendering are outside that sample. List uses its production collection function with all archive states and either all priorities or urgent priority alone. Partial priority has 40 displayed rows in both boards. Every sample returned the same projected values and row order.

| Collection | Board tickets | Before median | After median | Before → after requests | Before → after body bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Group members | 1,005 | 38.7 ms | 18.1 ms | 5 → 5 | 545,365 → 212,975 |
| Group members | 10,005 | 656.2 ms | 321.4 ms | 50 → 50 | 5,524,246 → 2,146,640 |
| List, all priorities selected | 1,005 | 73.1 ms | 36.9 ms | 12 → 6 | 1,096,000 → 548,000 |
| List, all priorities selected | 10,005 | 1,063.9 ms | 520.4 ms | 102 → 51 | 11,054,854 → 5,527,427 |
| List, urgent priority selected | 1,005 | 35.4 ms | 15.9 ms | 7 → 7 | 569,412 → 126,252 |
| List, urgent priority selected | 10,005 | 544.3 ms | 286.7 ms | 52 → 52 | 5,549,320 → 1,079,934 |

At 10,000 Group members, summed request handling through pre-serialization took 516.8 → 235.4 ms, Fastify serialization through the send hook took 15.9 → 6.4 ms, body consumption after response headers took 16.3 → 7.1 ms and client JSON parsing took 30.2 → 11.7 ms. Request handling includes Fastify and the SQL/read model. Body consumption includes client scheduling and buffering. Summed List request durations can overlap because its two collections load concurrently. These are local collection timings. Browser responsiveness and remote-network timing were outside the performance experiment.

## Browser verification

Chromium 159.0.8154.6, English at 1440 × 900 in light mode and Japanese at 390 × 844 in dark mode. For Group, the script opens a tagged archived parent shown with its active child, cancels removing the family, then saves and reloads. Both tickets move to the ungrouped view and retain their parent/child link. For List, urgent priority still shows the two other-priority blockers in lane and position order. Selecting the family includes both visible rows. Cancelling Move preserves their lane, and saving and reloading preserves the move and parent link. A child hidden by the priority filter retains its original lane, matching baseline selection behavior. With all four priorities selected the same small fixture uses one collection request instead of two.

All four runs against the integrated runtime `78840bda062fcfa1507d5ba91e786447beae329e` passed with zero browser errors. The before/after row rectangles and PNG bytes match for all 18 image pairs, including the cancellation state. [Visual results](visual-results.json) record the image hashes, viewport, network request counts and saved state. An earlier projection-only comparison had small background differences in two English light dialog images (eight pixels with maximum channel difference 3/255 for Group and one pixel at 1/255 for List). They did not recur in the final captures with a fixed pointer position. The visual check used a scripted synthetic fixture and Chromium only.

## Reproduction

From the repository root with Node 26.13.1 and installed dependencies:

```sh
output=coverage/ticket-collection-projections
mkdir -p "$output/baseline"
git archive 899d0f0117ee52e6d57db59241312f0fa4fcd0f7 src public package.json pnpm-lock.yaml tsconfig.json | tar -xf - -C "$output/baseline"
ln -s "$PWD/node_modules" "$output/baseline/node_modules"
gzip -dc docs/development/evidence/2026-11-22-group-inline-icons/fixture.sqlite.gz > "$output/group-fixture.sqlite"
node --import tsx docs/development/evidence/2026-11-23-ticket-collection-projections/bench.mjs
node --import tsx docs/development/evidence/2026-11-23-ticket-collection-projections/visual.mjs
```

Use a fresh output directory and run the measurements without concurrent tests. The visual script creates a separate API-seeded fixture for each phase and writes labelled PNGs and saved-state observations under the output directory. The Kanbalone tickets carry representative original captures.
