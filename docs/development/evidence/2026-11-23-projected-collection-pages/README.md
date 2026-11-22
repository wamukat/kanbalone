# Group and List reference collection

Kanbalone #1534 reuses the total in the signed cursor for Group members and List references. The server verifies the board, filters, order and revision before reusing it. Previous cursors without a total still use COUNT. Kanbalone #1539 sends up to 800 rows per page on those two projections. The browser starts at 200 and uses the server's `X-Kanbalone-Ticket-Page-Limit` header for later pages. After a 400 on a larger page, it tries the same cursor once at 200 and keeps that limit through the rest of the collection.

## API collection

Both builds read independent copies of the same synthetic SQLite fixture with Node 26.13.1. The Group case collects members of one Group. The List case shows 30 urgent tickets and reads priority-independent references for the entire filtered board. Timings cover the collection API and JSON parsing on loopback. The artificial-delay runs add 15 ms of client wait to each request. They model additional per-request wait under a fixed payload and local transport.

| Comparison | Collection | Rows in the larger board | Before median | After median | Requests before → after |
| --- | --- | ---: | ---: | ---: | ---: |
| COUNT reuse only | Group | 10,000 | 242.8 ms | 106.7 ms | 50 → 50 |
| COUNT reuse only | Partial-priority List | 9,995 references | 127.5 ms | 117.6 ms | 51 → 51 |
| Larger pages with COUNT reuse in both builds | Group | 10,000 | 111.4 ms | 72.5 ms | 50 → 14 |
| Larger pages with COUNT reuse in both builds | Partial-priority List | 9,995 references | 111.0 ms | 50.4 ms | 51 → 15 |
| Combined, loopback | Group | 10,000 | 263.8 ms | 76.2 ms | 50 → 14 |
| Combined, loopback | Partial-priority List | 9,995 references | 137.4 ms | 63.1 ms | 51 → 15 |
| Combined, artificial 15 ms per request | Group | 10,000 | 1,167.3 ms | 331.2 ms | 50 → 14 |
| Combined, artificial 15 ms per request | Partial-priority List | 9,995 references | 1,041.4 ms | 309.0 ms | 51 → 15 |

One warmup and three retained pairs per loopback condition, two retained pairs for artificial delay. Ordered hashes of every returned row and reference match. The combined loopback test on the smaller board moved Group members from 16.7 to 9.4 ms and partial-priority List from 11.8 to 6.9 ms. The [results](results.json) include samples, request counts, maximum response sizes and source hashes.

### Dense-tag comparison

The dense fixture adds nine tags and a longer title to 800 Group members in each board. An additional local task alternates a health GET and a comment save. The reported background latency includes the delay after its scheduled start and the time to consume the response.

| Larger Group | Collection median | Requests | Largest response | Maximum server generation | Health p95 | Comment-save p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Original 200 cap | 333.0 ms | 50 | 214.3 kB | 6.2 ms | 25.2 ms, n=36 | 20.5 ms, n=33 |
| Combined 800 cap | 127.6 ms | 14 | 685.1 kB | 36.3 ms | 74.9 ms, n=12 | 49.8 ms, n=11 |
| COUNT reuse and 400 cap | 126.8 ms | 26 | 428.4 kB | 5.8 ms | 24.8 ms, n=23 | 15.1 ms, n=19 |
| COUNT reuse and 800 cap | 102.3 ms | 14 | 685.1 kB | 9.1 ms | 34.1 ms, n=13 | 34.2 ms, n=10 |

The first two rows compare three retained trials per build in separate processes, including a single maximum RSS observation of 256 MiB and 225 MiB, respectively. The last two rows compare four alternating retained trials with only the continuation limit changed. Server generation runs from Fastify request entry through pre-serialization. The small candidate p95 samples represent their observed maxima. Per-process RSS includes setup and garbage collection and varies between runs. The 800 cap saves 12 requests against 400 on this fixture and increases individual response size and some background waits. All sampled background calls finished within 100 ms of their scheduled start in these comparisons.

## Browser

The trial opens the Group route, records the first real row added to the DOM and waits for the full set plus two animation frames. After the full set arrives, it clicks the first available ticket and checks the detail route against the selected ticket ID. Archived parent context rows contribute to the full row count. The original probe counted only clickable rows for its identity check, so it was corrected before recording the comparisons.

Chromium 159.0.8154.6, English at 1440 × 900 with a light theme. Timings start at navigation or at the actual ticket click. One warmup and two retained pairs per condition.

| Group | Stage | Before median and range | After median and range | Before → after trials within 1 second |
| --- | --- | ---: | ---: | ---: |
| 1,000 | First row DOM | 280 ms (274–287) | 264 ms (250–277) | 2/2 → 2/2 |
| 1,000 | All rows + two frames | 466 ms (447–485) | 444 ms (422–466) | 2/2 → 2/2 |
| 10,000 | Last member response | 525 ms (510–541) | 292 ms (280–304) | 2/2 → 2/2 |
| 10,000 | First row DOM | 1,109 ms (1,046–1,172) | 845 ms (839–852) | 0/2 → 2/2 |
| 10,000 | All rows + two frames | 2,924 ms (2,814–3,033) | 2,698 ms (2,671–2,724) | 0/2 → 0/2 |
| 10,000 | Ticket click to detail + two frames | 500 ms (487–512) | 483 ms (477–489) | 2/2 → 2/2 |

The first row DOM marker is earlier than the settled full collection. The Group of 10,000 still needs about 2.7 seconds to settle locally. The Japanese narrow capture was a single comparison. The timings describe these synthetic Chromium runs.

| Original capture | Before | After |
| --- | --- | --- |
| English, 1,000 rows, 1440 × 900 light | [Group](projection-en-light-1-baseline.png) | [Group](projection-en-light-1-candidate.png) |
| English, 10,000 rows, 1440 × 900 light | [Group](projection-en-light-2-baseline.png) | [Group](projection-en-light-2-candidate.png) |
| Japanese, 1,000 rows, 390 × 844 dark | [Group](projection-ja-dark-1-baseline.png) | [Group](projection-ja-dark-1-candidate.png) |

Captured on 2026-11-23 JST. All three pairs match byte for byte. An independent reviewer checked the visible Group counts, parent/child rows, tags and action positions in English and Japanese. Ordered row ID hashes also match.

## Compatibility and verification

The [rollback probe](check-production-rollback.mjs) runs two actual backends on separate copies of the same fixture. It reads the initial page at 200 from the new backend, sends the advertised 800 request to the old backend, receives 400 and uses a 200 retry with that same cursor. It checks every row and the final revision. It also continues an old cursor on the new backend at 800. Standard ticket and relation-candidate paged JSON and cursor bytes match, and both still reject 201. A rollback to a version that predates the projection endpoints in PR #51 requires reloading that version's frontend.

The package uses the existing SQLite schema and the same signed cursor scope and revision. There are no data migration steps for these changes. Local `pnpm check` passed 263 tests, OpenAPI lint, both type checks and the documentation build. Twenty-one related Chromium cases passed. They include cross-page hierarchy, revision invalidation, bounded completion paging, archived blockers, Group membership storage and focus restoration.

## Reproduction

In the candidate checkout with Node 26.13.1 and Playwright Chromium installed, extract the indicated source branches to separate coverage directories. Symlink the installed dependencies into each source directory. Use the existing synthetic fixture from `2026-11-22-group-inline-icons/fixture.sqlite.gz`.

```sh
output=coverage/subsecond-data
evidence=docs/development/evidence/2026-11-23-projected-collection-pages
mkdir -p "$output"
gzip -dc docs/development/evidence/2026-11-22-group-inline-icons/fixture.sqlite.gz > "$output/fixture.sqlite"
for variant in base operation-main collection-count; do
  case "$variant" in
    base) revision=12a100e70e1666169ad902c13680f15df0d33829 ;;
    operation-main) revision=3b6519dae6b5e1e3499647e7b2c93edd8319abff ;;
    collection-count) revision=3119e72 ;;
  esac
  mkdir -p "$output/variants/$variant"
  git archive "$revision" src public package.json tsconfig.json | tar -xf - -C "$output/variants/$variant"
  ln -s "$PWD/node_modules" "$output/variants/$variant/node_modules"
done
node --import tsx "$evidence/check-production-rollback.mjs" "$PWD"
SUBSECOND_SAMPLES=4 SUBSECOND_LABEL=count node --import tsx "$evidence/bench-api.mjs" "$output/variants/operation-main" "$output/variants/collection-count"
SUBSECOND_SAMPLES=4 SUBSECOND_LABEL=page node --import tsx "$evidence/bench-api.mjs" "$output/variants/collection-count" "$PWD"
SUBSECOND_SAMPLES=4 SUBSECOND_LABEL=combined node --import tsx "$evidence/bench-api.mjs" "$output/variants/operation-main" "$PWD"
SUBSECOND_SAMPLES=3 node --import tsx "$evidence/bench-projection-ui.mjs" "$output/variants/operation-main" "$PWD"
```

Use `SUBSECOND_DELAY_MS=15` for the artificial-delay comparison. The dense run uses `SUBSECOND_FIXTURE_VARIANT=dense-tags` and `SUBSECOND_SCENARIOS=group-members`. For independently observed peak RSS use `SUBSECOND_ONLY_PHASE=baseline` and then `candidate` in separate processes. The 400 screening uses a copy of the candidate source with `ticketProjectionPageLimit` set to 400. Browser verification and benchmark mutations use isolated fixture copies.
