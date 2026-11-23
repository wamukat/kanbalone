# Ticket position normalization

This change applies the existing lane position order in one SQLite statement. A materialized ranking fixes the archive, position and ID order before the update. The update writes changed positions only. The preceding ticket and timestamp updates, revision triggers and transaction boundaries retain their existing behavior. [PR #58](https://github.com/wamukat/kanbalone/pull/58)

## Local save timing

The comparison used the indexed ticket-revision change as its control. [PR #57](https://github.com/wamukat/kanbalone/pull/57) Each lane had 3,000 active and five archived synthetic tickets. The four builds used separate copies of the same data, with one warmup and four retained samples per action and a rotated order. The measured interval ran from the local Fastify injection call to the save response. Separate reads verified the stored values and cursor status.

| Action | Existing | SQL equality guard | Skip in JavaScript | Single SQLite update |
| --- | ---: | ---: | ---: | ---: |
| Exchange the first two positions | 254.9 ms | 225.1 ms | 219.9 ms | 223.4 ms |
| Move to the front of a second lane | 1,127.3 ms | 781.4 ms | 759.8 ms | 764.4 ms |
| Archive the first ticket | 416.2 ms | 416.8 ms | 419.7 ms | 197.7 ms |
| Archive the last ticket | 42.5 ms | 11.1 ms | 7.1 ms | 8.7 ms |

The selected build recorded 763.8–775.3 ms for a move between the two large lanes and 186.6–230.9 ms for archiving the first ticket. The range for an adjacent move was 222.2–225.2 ms. These timings describe the local server action. The browser sequence verifies saved position and archive state after reload.

The single-statement update binds just the lane ID. It stores the pre-update order in SQLite for the duration of the statement. A position-only update leaves lane and completion columns unchanged. Existing revision triggers still evaluate each row whose position changes.

## Save and database behavior

Thirteen scenarios matched the existing build across the SQL guard, JavaScript skip and single-statement variants. They covered unchanged positions, duplicate and negative legacy positions, archive-first ordering, moves and edits, completion transitions, archives and restores, deletion and bulk mutations. Stored ticket fields, board rows, activity history, exact revision deltas and old-cursor outcomes matched. SQLite-generated completion timestamps were compared for valid presence.

The ordering regression forces the position update to abort during a ticket deletion. The lane order, timestamps, ticket existence and revision return to their pre-write values. After removing the injected failure, the same deletion succeeds, active tickets with equal legacy positions keep their ID order, and the archived ticket follows the active tickets.

On an existing 10,005-ticket fixture, the previous backend continued its cursor on the changed backend. The changed backend moved and archived tickets, and both affected lanes retained contiguous positions. The previous backend reopened the same file, read the saved values, used a cursor issued by the changed backend and saved a return move. The changed backend reopened it again and read back the return move. Each pre-write cursor returned 409. All 91 SQLite schema definitions matched throughout the sequence, and every snapshot passed integrity and foreign key checks.

## Browser verification

English, light, 1440 × 900 Chromium 159.0.8154.6. Both builds used fresh copies of the same 1,005-ticket fixture. A trusted drag moved #2 from todo to the first position in doing. The editor archived #42. Reload and API readback confirmed the moved ticket's lane and position, the archived ticket and both stale cursors returning 409. Four before-and-after image pairs capture the two starting states and the two saved states. Every pair matches byte for byte. An independent reviewer inspected the eight originals. All eight original captures also decoded successfully in the tracker.

[Measurements](measurements.json) record the source hashes, raw timing samples, save observations and image hashes. The four related local unit files passed 40 tests, including the transaction-abort regression, old-schema completion migration and pagination checks.

## Reproduction

Run these probes from the checkout after installing the locked dependencies.

```sh
output=coverage/subsecond-data
evidence=docs/development/evidence/2026-11-23-position-normalization
mkdir -p "$output"
gzip -dc docs/development/evidence/2026-11-22-group-inline-icons/fixture.sqlite.gz > "$output/fixture.sqlite"
python3 "$evidence/prepare-normalization-variants.py"
node --import tsx "$evidence/check-normalization-equivalence.mjs" guard skip bulk
node --import tsx "$evidence/bench-normalization-writes.mjs" guard skip bulk
before="$output/normalization-variants/control"
node --import tsx "$evidence/check-normalization-rollback.mjs" "$before" "$PWD"
node --import tsx "$evidence/check-normalization-ui.mjs" "$before" "$PWD"
```
