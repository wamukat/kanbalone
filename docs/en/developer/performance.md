# Performance Tooling

SoloBoard includes local-only performance scripts for large-board testing.

## Seed Data

Seed a 1,000-ticket board:

```bash
pnpm perf:seed
```

Replace an existing perf board with the same name:

```bash
SOLOBOARD_PERF_OVERWRITE=true pnpm perf:seed
```

Seed a 5,000-ticket board:

```bash
SOLOBOARD_PERF_BOARD="Perf 5000" SOLOBOARD_PERF_TICKETS=5000 SOLOBOARD_PERF_OVERWRITE=true pnpm perf:seed
```

## Benchmark

Run the benchmark suite:

```bash
pnpm perf:benchmark
SOLOBOARD_PERF_BOARD="Perf 5000" pnpm perf:benchmark
```

## Notes

- `perf:seed` creates tags, tickets, comments, blockers, and one-level parent/child links through `POST /api/boards/import`.
- `perf:seed` will not delete an existing board with the same name unless `SOLOBOARD_PERF_OVERWRITE=true` is set.
- `perf:benchmark` expects `agent-browser` to be available on `PATH`, or `AGENT_BROWSER_BIN` to point to it.
- Reports are written under `data/perf-seed-report.json` and `data/perf-benchmark-report.json`.

