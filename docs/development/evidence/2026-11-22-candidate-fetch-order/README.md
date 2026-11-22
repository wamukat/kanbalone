# Relation candidate fetch order — 2026-11-22 JST

## Scope and compatibility

#1512 continuation after PR41, baseline `c12cf07f21e5abde1dbde5781e0975c864615a10`. Request relation candidates using existing `order=id_asc` rather than the client collector's default `position_asc`. The product diff is one URL in `ensureCandidates`. Candidate source is identified by `source-sha256.json` and the containing commit.

Every Parent / Blocker / Related / Child picker already sorts the complete fetched candidates by priority descending, then ID ascending. Selected chips follow their selected-ID arrays. Other consumers use ID lookup and a parent-ID Set. None uses the server's lane/archive/position ordering. Changing the collection order preserves those outputs while avoiding the more expensive compound-key paging query.

No API/storage/schema change, new cache, search filter, page-size increase, partial candidate publication or display limit. Archived inclusion, ID substring matching (including `#5` matching `#50`), title matching, hierarchy/dependency restrictions, generation/abort/retry and revision checks remain. No migration required. Complete collection transfer and large DOM remain #1512 work.

## Isolated API diagnostic

Same synthetic SQLite and backend, Node26.13.1, localhost3641. One excluded warmup then five retained alternating pairs, collecting every 200-row page sequentially and parsing JSON. Measure start through last response parsing, before post-measurement hash work. No parallel benchmarks/tests.

| Tickets | Position-order median ms | ID-order median ms | Requests (both) |
| --- | ---: | ---: | ---: |
| 1,005 | 37.2 | 33.7 | 6 |
| 10,005 | 504.5 | 263.6 | 51 |

The complete ticket arrays sorted by ID have identical SHA256 hashes across all phase/run pairs (`api-probe.json`), including all fields. Response sizes change only due to cursor metadata: 548,058→548,011 and 5,527,445→5,526,866 bytes. This is not a reduction of ticket payload or request count.

## Browser measurement

Chromium159.0.8154.6, English/light1440×1000, fresh contexts with equal module interception (HTTP cache disabled), initial editor network idle before first query. One excluded warmup plus five retained alternating pairs. Same synthetic 1,005/10,005-ticket fixture as PR41, intentionally mostly standalone tickets; no user data.

Synthetic input event to options mutation/nonbusy plus two rAF callbacks, milliseconds:

| Tickets | Query | Before median | After median |
| --- | --- | ---: | ---: |
| 1,005 | First `999` | 107.6 | 103.2 |
| 1,005 | Repeat `998` | 26.4 | 27.4 |
| 1,005 | No match | 48.2 | 45.6 |
| 10,005 | First `999` | 815.5 | 482.6 |
| 10,005 | Repeat `998` | 33.1 | 37.4 |
| 10,005 | No match | 37.7 | 39.1 |

First search at10k improves about41%; ready-candidate repeat/no-match does not improve. The first measurement includes complete candidate fetch and JS/DOM work. This is not native typing, INP, paint completion or human task time. Five local trials are a targeted result, not a general latency guarantee. Baseline is PR41 main, not the slower pre-PR41 implementation.

All retained phase/query pairs have identical option IDs/order, focus true and no JS errors. First search has6/51 requests and the same sizes as the API probe; subsequent queries have zero requests. Raw data includes synchronous dispatch time and request timings; initial synchronous dispatch excludes asynchronous collection.

## Visual and persistence verification

211-ticket isolated fixture, two lanes, archived and active rows, priority ties, existing/archived children and dependency exclusions, with lane/archive/position ordering different from ID ordering. Recreate same IDs/data per phase. English/Japanese,1440×1000 light and390×1000 dark.

For all four pickers, query `Choice` and assert exact expected priority/ID order after complete paging. Capture each picker. Select Related high then low, Blocker equal, Child late; assert the related chip order is selection order. Capture selected. Cancel/discard, GET verifies no persisted relations. Re-edit and repeat selection, save, capture saved, GET verifies all relationships and child's parent, then reload verifies summaries. Existing API data is separate from evaluation fixtures.

An initial test/visual script incorrectly expected `#5` to match only one item in a211-ticket fixture. It correctly matched11 due to existing substring semantics. Selection steps were corrected to use unique titles, without modifying product matching. The affected test and visual flow were rerun. Initial failed captures/logs remain disposable investigation output, not the before/after evidence here.

## Reproduction

From repository root with Node26 and dependencies installed. Use a disposable output directory and port3641:

```sh
mkdir -p coverage/candidate-fetch
gzip -dc docs/development/evidence/2026-11-22-candidate-fetch-order/fixture.sqlite.gz > coverage/candidate-fetch/benchmark.sqlite
node --import tsx docs/development/evidence/2026-11-22-candidate-fetch-order/server.mjs
# Separate shell; do not overlap benchmarks and tests:
node docs/development/evidence/2026-11-22-candidate-fetch-order/api-probe.mjs
node docs/development/evidence/2026-11-22-candidate-fetch-order/benchmark.mjs
node --import tsx docs/development/evidence/2026-11-22-candidate-fetch-order/visual.mjs
pnpm check
pnpm exec playwright test test/e2e/editor-candidates.spec.ts test/e2e/ticket-editor-relations.spec.ts --workers=2
```

Do not overwrite an existing running evaluation database. The gzip contains a consistent backup of synthetic data. Output is under `coverage/candidate-fetch`.

## Verification results and limitations

`pnpm check` passes (200 tests, OpenAPI lint, build, public typecheck and docs build). Eleven existing related E2E pass; after correcting the new test's substring assumption, its targeted rerun passes, for twelve verified related cases. The final TypeScript build also passes. The initial failure was in test expectations, not a change to matching behavior.

All eight language/viewport/phase visual runs pass their four-picker ordering, selected-related order, cancellation, saved API relationships and reload assertions. `interaction-results.json` records them. Actual UI inspection through agent-browser also confirmed all six candidate requests at1,005 tickets use `id_asc` and query998 returns the expected #998 option.

The final visual capture waits for network idle, fonts, completed animations and two frames. Earlier captures taken immediately after focus changes are retained locally under `coverage/candidate-fetch/visual-unsettled`; they are not substituted for the final settled-state comparison. No pixels are edited. Final52 images form26 pairs:20 are byte-identical;6 show small raster differences of3–88 pixels (maximum channel delta35). See `image-comparison.json` for exact bounds/counts. Visible labels, candidate order and layout agree on inspection; the exact cause of these remaining raster differences was not established. Browser timing and visual capture use different, explicitly described endpoints.

No real-user usability study, other browser engines, remote-network latency study or full viewport/theme cross-product was performed. Normal user runtime/data at3470 were not updated.

## Images

### before-10005

Before:

![Before](before-10005.png)

After:

![After](after-10005.png)

### before-1005

Before:

![Before](before-1005.png)

After:

![After](after-1005.png)

### en-dark-390-blocker

Before:

![Before](en-dark-390-before-blocker.png)

After:

![After](en-dark-390-after-blocker.png)

### en-dark-390-child

Before:

![Before](en-dark-390-before-child.png)

After:

![After](en-dark-390-after-child.png)

### en-dark-390-parent

Before:

![Before](en-dark-390-before-parent.png)

After:

![After](en-dark-390-after-parent.png)

### en-dark-390-related

Before:

![Before](en-dark-390-before-related.png)

After:

![After](en-dark-390-after-related.png)

### en-dark-390-saved

Before:

![Before](en-dark-390-before-saved.png)

After:

![After](en-dark-390-after-saved.png)

### en-dark-390-selected

Before:

![Before](en-dark-390-before-selected.png)

After:

![After](en-dark-390-after-selected.png)

### en-light-1440-blocker

Before:

![Before](en-light-1440-before-blocker.png)

After:

![After](en-light-1440-after-blocker.png)

### en-light-1440-child

Before:

![Before](en-light-1440-before-child.png)

After:

![After](en-light-1440-after-child.png)

### en-light-1440-parent

Before:

![Before](en-light-1440-before-parent.png)

After:

![After](en-light-1440-after-parent.png)

### en-light-1440-related

Before:

![Before](en-light-1440-before-related.png)

After:

![After](en-light-1440-after-related.png)

### en-light-1440-saved

Before:

![Before](en-light-1440-before-saved.png)

After:

![After](en-light-1440-after-saved.png)

### en-light-1440-selected

Before:

![Before](en-light-1440-before-selected.png)

After:

![After](en-light-1440-after-selected.png)

### ja-dark-390-blocker

Before:

![Before](ja-dark-390-before-blocker.png)

After:

![After](ja-dark-390-after-blocker.png)

### ja-dark-390-child

Before:

![Before](ja-dark-390-before-child.png)

After:

![After](ja-dark-390-after-child.png)

### ja-dark-390-parent

Before:

![Before](ja-dark-390-before-parent.png)

After:

![After](ja-dark-390-after-parent.png)

### ja-dark-390-related

Before:

![Before](ja-dark-390-before-related.png)

After:

![After](ja-dark-390-after-related.png)

### ja-dark-390-saved

Before:

![Before](ja-dark-390-before-saved.png)

After:

![After](ja-dark-390-after-saved.png)

### ja-dark-390-selected

Before:

![Before](ja-dark-390-before-selected.png)

After:

![After](ja-dark-390-after-selected.png)

### ja-light-1440-blocker

Before:

![Before](ja-light-1440-before-blocker.png)

After:

![After](ja-light-1440-after-blocker.png)

### ja-light-1440-child

Before:

![Before](ja-light-1440-before-child.png)

After:

![After](ja-light-1440-after-child.png)

### ja-light-1440-parent

Before:

![Before](ja-light-1440-before-parent.png)

After:

![After](ja-light-1440-after-parent.png)

### ja-light-1440-related

Before:

![Before](ja-light-1440-before-related.png)

After:

![After](ja-light-1440-after-related.png)

### ja-light-1440-saved

Before:

![Before](ja-light-1440-before-saved.png)

After:

![After](ja-light-1440-after-saved.png)

### ja-light-1440-selected

Before:

![Before](ja-light-1440-before-selected.png)

After:

![After](ja-light-1440-after-selected.png)
