# Position-order ticket pages

Position-ascending pages use a row-value comparison for the remaining sort keys after the lane or archive filter fixes a value. The cursor keeps the full four keys, signature and revision. The new SQLite index orders the board, lane, archive flag, position and ID. The ID and completion orders retain their original continuation logic. [PR #56](https://github.com/wamukat/kanbalone/pull/56)

## Collection timing

The [results](results.json) record the source and fixture identities and every sample. The original and changed Node 26.13.1 servers used separate copies of the same synthetic data on loopback. Measurements cover collection requests and JSON handling. These timings exclude List rendering.

| 10,000-ticket board | Existing query | Seek only | Index only | Seek and index |
| --- | ---: | ---: | ---: | ---: |
| Active List | 300.4 ms | 264.1 ms | 305.4 ms | 254.0 ms |
| List with archived tickets | 430.5 ms | 392.4 ms | 310.0 ms | 243.6 ms |
| Partial-priority List | 54.8 ms | 41.4 ms | 55.4 ms | 41.0 ms |
| Broad text search | 472.8 ms | 426.8 ms | 481.1 ms | 429.7 ms |
| Kanban, 3,018 returned | 71.1 ms | 68.7 ms | 71.0 ms | 67.5 ms |

One warmup and four retained readings per condition, with the order rotated across builds. For archive-inclusive pages the existing plan used a temporary B-tree for part of the order. The index removed that B-tree. With the seek predicate, SQLite used a range on the lane, archive flag and position. Active-only and single-lane seeks used their existing indexes.

The final product comparison used one warmup and three alternating retained readings. Archive-inclusive List went from 393.4 ms (378.9–407.5) to 209.7 ms (205.9–230.8) over 51 requests. Partial-priority List went from 45.2 ms (44.5–46.9) to 33.9 ms (33.7–37.5) over 15 requests. Active List went from 275.4 to 236.6 ms with overlapping ranges. Broad search and Kanban also had overlapping ranges. At about 1,000 tickets the archive-inclusive collection ranged from 22.2 to 22.8 ms before and 20.4 to 24.8 ms after. Returned rows and their ordering matched.

Eleven API boundary cases returned byte-identical ticket pages and cursors across all four builds. The fixtures include equal positions, multiple lanes, the archive boundary, negative positions, safe integer extremes and null completion times. Null and out-of-range values in a signed cursor key were rejected.

## Existing database and writes

The existing fixture opened with no new index. The changed backend created it on startup, continued the old cursor byte for byte and reopened with exactly one index. The old backend reopened the indexed database, consumed a cursor from the changed backend and moved a ticket with the position API. The changed backend reopened again, read the stored position, and rejected the pre-write cursor with 409. Logical row hashes, including the persisted cursor secret and revisions, matched at every read-only reopen. SQLite integrity checks passed and foreign key checks returned no violations. The index used 200,704 bytes in this fixture. The initial changed startup was 157 ms and the next was 126 ms in one warm-process sequence, which includes more than index creation.

| Local write API | Existing median and range | Seek and index median and range |
| --- | ---: | ---: |
| Create | 4.1 ms (3.6–6.9) | 7.1 ms (5.2–21.0) |
| Edit | 8.0 ms (7.3–11.0) | 9.1 ms (8.1–10.2) |
| Reorder within the lane | 547.7 ms (470.0–592.0) | 538.2 ms (509.8–683.7) |
| Archive | 514.5 ms (473.4–531.7) | 509.5 ms (498.7–609.1) |

Fastify injection measured the server path without HTTP transport against a 10,005-ticket board and a lane with 1,021 active tickets. The screening retained six readings per action per build and returned matching saved fields across the four builds. The reorder and archive ranges overlap. The smaller screening replaced a longer run to free the measurement host.

## Browser

The browser opens List with archived tickets included, waits for the complete List model and its visible virtual rows plus two animation frames, then scrolls halfway. It compares the visible ID sequence and scroll position and opens the same ticket from that viewport. Chromium 159.0.8154.6 recorded the larger English condition with one warmup and two alternating retained pairs.

| Stage, English 10,005-ticket List | Before median and range | After median and range |
| --- | ---: | ---: |
| Last collection response | 654 ms | 433 ms |
| Complete model, visible rows and two frames | 707 ms (665–748) | 481 ms (474–488) |

Both builds completed in under one second in both retained trials of this List fixture. A Japanese 1,005-ticket narrow-screen comparison recorded 289 ms before and 259 ms after in one trial. The measurements cover local Chromium and synthetic data. The visible-row ID hashes at the top and middle, the scroll offset and the clicked ticket matched.

| Original capture | Before | After |
| --- | --- | --- |
| English, archived-inclusive List, 1440 × 900 light, top | [List](position-en-light-1440x900-baseline-top.png) | [List](position-en-light-1440x900-candidate-top.png) |
| English, archived-inclusive List, 1440 × 900 light, middle | [List](position-en-light-1440x900-baseline-middle.png) | [List](position-en-light-1440x900-candidate-middle.png) |
| Japanese, archived-inclusive List, 390 × 844 dark, top | [List](position-ja-dark-390x844-baseline-top.png) | [List](position-ja-dark-390x844-candidate-top.png) |
| Japanese, archived-inclusive List, 390 × 844 dark, middle | [List](position-ja-dark-390x844-baseline-middle.png) | [List](position-ja-dark-390x844-candidate-middle.png) |

Captured on 2026-11-23 JST. Each pair matches byte for byte. An independent reviewer inspected the original captures and confirmed ticket IDs, parent indentation, status markers, tags, sticky headers and narrow-screen truncation. The eight original images also loaded in the tracker.

## Verification and reproduction

Local `pnpm check` passed 264 unit tests, OpenAPI lint, backend and browser type checks, and the documentation build. The 22 selected Chromium cases passed. The source for the production comparison is baseline `79991e100cadbb48e716fe8b71991cb041f310ac` and candidate `7a25cb701c10ffdd975073df7afcbe4988bf45cf`.

```sh
output=coverage/subsecond-data
evidence=docs/development/evidence/2026-11-23-position-seek-index
mkdir -p "$output/variants/position-production-base"
gzip -dc docs/development/evidence/2026-11-22-group-inline-icons/fixture.sqlite.gz > "$output/fixture.sqlite"
git archive 79991e100cadbb48e716fe8b71991cb041f310ac src public package.json tsconfig.json | tar -xf - -C "$output/variants/position-production-base"
ln -s "$PWD/node_modules" "$output/variants/position-production-base/node_modules"
node --import tsx "$evidence/check-position-upgrade.mjs" "$output/variants/position-production-base" "$PWD"
SUBSECOND_SAMPLES=4 node --import tsx "$evidence/bench-api.mjs" "$output/variants/position-production-base" "$PWD"
SUBSECOND_SAMPLES=3 node --import tsx "$evidence/bench-position-ui.mjs" "$output/variants/position-production-base" "$PWD"
SUBSECOND_SAMPLES=1 SUBSECOND_LOCALE=ja node --import tsx "$evidence/bench-position-ui.mjs" "$output/variants/position-production-base" "$PWD"
```

The four-condition screening uses `python3 "$evidence/prepare-seek-variants.py" 094bb0b`, then the cursor and query plan scripts. Run the API probe with `SUBSECOND_SEEK_VARIANTS=1 SUBSECOND_SAMPLES=5` and the write probe with `SUBSECOND_SAMPLES=3 SUBSECOND_WRITE_BATCHES=3`. Each runtime uses a private synthetic database copy.
