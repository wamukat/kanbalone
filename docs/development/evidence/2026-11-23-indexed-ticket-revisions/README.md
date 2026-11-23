# Ticket revision triggers

This optimization changes the affected-board lookup used when a ticket, its relations or its metadata changes. Six indexed queries supply the same board IDs. The revision update still runs once per affected board per trigger. Ticket updates, timestamps, position normalization and cursor format retain their existing behavior. [PR #57](https://github.com/wamukat/kanbalone/pull/57)

## Local server timing

The two lanes each contained 3,000 active and five archived synthetic tickets. Every sample used a fresh copy of the same database. Each action had one warmup pair and five retained pairs, alternating the order of the two builds. The measured interval ran from the local Fastify injection call through completion of the write response. The separate API readback confirmed the saved state. Node 26.13.1 ran on an Intel Mac.

| Action | Existing median and range | Indexed median and range |
| --- | ---: | ---: |
| Edit title | 5.1 ms (4.4–5.4) | 4.4 ms (4.1–5.5) |
| Exchange the first two positions | 1,257.3 ms (1,192.0–1,463.9) | 246.9 ms (239.1–297.2) |
| Move the last ticket to the first position | 1,423.8 ms (1,379.4–1,469.1) | 577.5 ms (556.0–729.2) |
| Move a ticket to the front of the other lane | 3,019.2 ms (2,803.6–3,168.5) | 1,040.7 ms (1,021.1–1,155.1) |
| Archive the first ticket | 1,208.8 ms (1,203.0–1,260.7) | 405.5 ms (382.2–487.6) |
| Archive the last ticket | 43.1 ms (40.8–43.7) | 40.3 ms (38.2–45.6) |

Moving between two large lanes exceeded one second in all five retained server samples. The normalized rows still receive the same writes and timestamp updates. The initial exploratory cross-lane run observed 497.3 ms once with the index set from before the position seek change. [PR #56](https://github.com/wamukat/kanbalone/pull/56) The table reports the final paired comparison with the position index included in both builds. The index set, sampling design and run differed between those measurements. Every pair returned the same saved ticket fields and the same board revision delta. Previously issued cursors received 409 after each write.

## Revision equivalence and database upgrade

The revision probe ran 24 mutations across five boards. Exact revision vectors and API response bytes matched, including an unrelated board, cross-board parents, directed blockers, both related-ticket directions, duplicate affected boards, tags, tag reasons, remote and external references, completion trigger updates, moves, cascades, a no-op update and a rolled-back transaction.

The existing synthetic SQLite copy started with the old trigger definitions. The new startup replaced 21 triggers in the migration transaction, preserving logical rows, cursor secret and revisions. A second startup retained the exact trigger definitions and incurred the same two schema changes as an old-version restart. The existing remote-link unique-index migration accounts for those two changes. A unit test also repeats only the ticket pagination migration and checks that the schema version stays fixed.

During rollback, the previous backend opened the upgraded copy with the new trigger definitions, continued a cursor issued by the new backend, moved a ticket and archived another one. After returning to the new backend, both writes persisted and the pre-write cursor returned 409. Every snapshot passed SQLite integrity checks and had zero foreign key violations.

## Browser evidence

English, light, 1440 × 900 Chromium 159.0.8154.6. Both builds opened separate copies of the same 1,005-ticket board. A native drag moved ticket #2 from todo to the first position in doing, and reload preserved the order and lane counts. The editor archived ticket #42, the card disappeared from the default board on reload, and the same ticket's direct link displayed its Archived status. API readback verified each saved field and 409 for each pre-write cursor.

| Before and after captures | Visible verification |
| --- | --- |
| Move, before gesture | #2 heads todo and #41 heads doing |
| Move, after reload | #2 heads doing immediately before #41 |
| Archive, before save | #42 is open in the editor with Archive available |
| Archive, after reload | #42 displays Archived and retains the Acceptance lane |

The four original image pairs match byte for byte. An independent reviewer inspected the eight originals. All eight originals also decoded successfully in the tracker. The [measurements](measurements.json) include the file names, hashes, source identities, all timing samples, migration observations and saved state.

## Verification

Local `pnpm check` passed 267 unit tests, OpenAPI lint, backend and browser type checks, and the documentation build. Three Chromium cases passed for ticket drag persistence, concurrent revision protection and ticket editor archiving.

## Reproduction

Run the probes from the checkout with `pnpm install --frozen-lockfile` complete. The browser probe uses Chromium installed through Playwright.

```sh
output=coverage/subsecond-data
evidence=docs/development/evidence/2026-11-23-indexed-ticket-revisions
before="$output/variants/indexed-ticket-revisions-before"
mkdir -p "$before"
gzip -dc docs/development/evidence/2026-11-22-group-inline-icons/fixture.sqlite.gz > "$output/fixture.sqlite"
git archive d36c55d824b18212517a69b9d7252526f46219c1 src public package.json tsconfig.json | tar -xf - -C "$before"
ln -s "$PWD/node_modules" "$before/node_modules"
node --import tsx "$evidence/check-indexed-revisions.mjs" "$before" "$PWD"
node --import tsx "$evidence/check-revision-trigger-upgrade.mjs" "$before" "$PWD"
node --import tsx "$evidence/bench-indexed-revision-writes.mjs" "$before" "$PWD"
node --import tsx "$evidence/check-indexed-revision-ui.mjs" "$before" "$PWD"
```
