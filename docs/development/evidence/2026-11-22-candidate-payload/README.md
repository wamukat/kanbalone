# Lightweight relation candidates · 2026-11-22 JST

## Change and source identity

Parent, Blocker, Related and Child picker searches collect candidates from
`GET /api/boards/:boardId/relation-candidates`. Each page carries up to 200 rows with
`id`, `title`, `parentTicketId`, `priority`, `blockerIds` and `isResolved`,
plus the page envelope and revision header. The API includes archived tickets,
uses ascending ID order and publishes candidates after all pages have loaded.
The pickers use priority descending and ID ascending for display.

Baseline merged main is `7112467b524d5cea097e6cb4f4abf715e7f7ed4c`, including
PR #42's ID-ordered full summary collection. Baseline and candidate each run
their own backend and serve their own frontend. The candidate runtime source
manifest SHA-256 is
`3e991c43918cb41a013215034d5b355f0e8b6d0a96ba88d9a338813ad8e86c48`.
The runner captured the manifest before startup and verified the same source
after the comparison. [Source and fixture fingerprints](source-fingerprint.json).

## API collection

Node 26.13.1 on Darwin x86-64, Intel Core i7-9750H, 16 GiB RAM. Two isolated
loopback servers load independent copies of the same synthetic SQLite fixture.
The probe collects and parses every page serially. It times the operation
through JSON parsing and page bookkeeping, then hashes the required fields.
For each size and version there was one excluded warmup and five retained
samples, alternating the execution order of before and after. The API and
browser runs were serial, with other tests stopped.

| Tickets | Baseline median | Candidate median | Baseline body bytes | Candidate body bytes | Requests per run |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,005 | 32.1 ms | 14.5 ms | 548,011 | 122,923 | 6 |
| 10,005 | 337.1 ms | 137.3 ms | 5,526,866 | 1,237,552 | 51 |

The candidate response bodies were about 77.6% smaller at both sizes.
All runs returned the full count, strictly ascending and unique IDs, and a
consistent revision across pages. The canonical SHA-256 over all six picker
fields matched between versions for each size. Candidate rows contained
exactly the six fields. [API samples and response metadata](api-probe.json).

## Child search in Chromium

Chromium 159.0.8154.6, English, light theme, 1440×1000, fresh browser contexts.
Open the existing editor and Child picker, wait for initial network idle, and
dispatch a synthetic input event. The end time is the option list updating to
a non-busy state plus two requestAnimationFrame callbacks. The first query
includes all candidate requests. Repeat and no-match queries reuse the
collected candidates. Each row reports the median of five retained alternating
pairs after one excluded warmup.

| Tickets | Query | Baseline | Candidate |
| ---: | --- | ---: | ---: |
| 1,005 | First `999` | 71.8 ms | 47.2 ms |
| 1,005 | Repeat `998` | 20.9 ms | 20.9 ms |
| 1,005 | No match | 36.0 ms | 35.1 ms |
| 10,005 | First `999` | 409.5 ms | 249.0 ms |
| 10,005 | Repeat `998` | 20.3 ms | 19.5 ms |
| 10,005 | No match | 14.7 ms | 38.1 ms |

First search took 34% less time at 1,005 and 39% less at 10,005. Each first
search made six or 51 candidate requests, matching the body sizes from the
API comparison. Subsequent searches made zero candidate requests. Every
query returned the same ordered option IDs with focus on Child search.
The browser reported zero page or console errors.

The 10,005-ticket no-match event-to-two-frames measurement was slower in this
run. The baseline range was 12.5–15.5 ms and the candidate range 10.2–52.8 ms.
Its synchronous input dispatch median was 5.6→5.4 ms, with ranges of
5.3–8.4 and 3.7–5.9 ms respectively. The cause of the overall timing
difference is undetermined. [Browser samples and request timings](benchmark.json).

The timing covers synthetic input through two frame callbacks. Native typing,
INP, paint completion, human task time, other browser engines and remote
network latency remain unmeasured. The synthetic scale fixture is mainly
standalone tickets. Collection still loads every candidate, and the separate
List/Group collection and large-result DOM costs remain #1512 work.

## Visual review and stored results

The 211-ticket scenario uses two lanes with active and archived rows,
priority ties, a completion lane, existing parents and children, and a
dependency. Both versions start with the same IDs and use English and
Japanese at 1440×1000 light and 390×1000 dark. Captures wait for network idle,
fonts, animations and two frames. Separate fresh contexts produce the two
scale comparison pairs after timing finishes.

1. Open each picker. Enter `Choice` and verify the expected priority and
   ID order, the localized Resolved/完了 badge and retained search focus.
2. Enter `#5` in Child and verify all eleven expected matches, including
   #5 and #50.
3. Select two Related tickets in reverse ID order, one Blocker and one Child.
   Use unique titles and Enter. Verify that Related chips keep selection order.
4. Cancel and discard. GET the edited ticket and the proposed child and
   verify that their original relationships are preserved.
5. Reopen the editor, repeat the selection and save. GET both tickets and
   verify the new Related, Blocker and Child IDs and the child's parent ID.
   Reload and verify all saved relation summaries.

All eight language, viewport and version runs passed. All 26 pairs of original
captures, including both scale comparisons, were byte-identical. Captures
show the picker states. The interaction records establish the cancellation,
stored values and reload outcome. [Interaction results](interaction-results.json),
[image comparison](image-comparison.json), [independent visual review](review-visual.md).

An additional agent-browser 0.26.0 check opened synthetic ticket #1, edited
Child search and entered `998`. The visible result was #998, focus stayed
on Child search and all six candidate requests used 200-row ID-ordered pages.

## Test and compatibility checks

Lint and all 202 unit/API tests passed in the initial `pnpm check`. Its build
step found a TypeScript return union inference error. An explicit type fixed
the inference, then `pnpm build`, `pnpm check:public` and `pnpm docs:build`
passed. All 24 targeted Chromium E2E tests and eight focused pagination API
tests passed. [Local validation record](validation.json).

The independent probe compared legacy full and paged results across filters
and orders, including signed cursor interchange in both legacy directions.
It also checked the candidate response projection and cursor separation.
[Independent code and cursor review](review-code.md).

## Reproduction

Run from a checkout of the candidate source with Node 26.13.1, the repository
dependencies, Playwright Chromium and ImageMagick. Use fresh evaluation output
and leave ports 3642 and 3643 free. The runner fetches data from local fixture
servers only. It archives baseline sources from Git and loads the fixture from
the previous evidence directory. Do not overlap the timed measurements with
other benchmarks or test runs.
[Reusable compressed synthetic fixture](../2026-11-22-candidate-fetch-order/fixture.sqlite.gz).

```sh
mkdir -p coverage/candidate-payload
cp docs/development/evidence/2026-11-22-candidate-payload/*.mjs coverage/candidate-payload/
node coverage/candidate-payload/prepare.mjs
node coverage/candidate-payload/run.mjs
node --import tsx coverage/candidate-payload/review-cursors.mjs
```

The runner also accepts `benchmark` or `visual` to reproduce a subset. Raw
results, PNG files and the source manifest are written under
`coverage/candidate-payload/`. The normal runtime and its data were outside
the evaluation. [Summary data](summary.json), [file checksums](SHA256SUMS).

## Original screenshots

### Child picker on a 1,005-ticket board

![Before Child picker, 1,005 tickets](before-1005.png)

![After Child picker, 1,005 tickets](after-1005.png)


### Child picker on a 10,005-ticket board

![Before Child picker, 10,005 tickets](before-10005.png)

![After Child picker, 10,005 tickets](after-10005.png)


### English · light · 1440px · Parent

![Before parent state](en-light-1440-before-parent.png)

![After parent state](en-light-1440-after-parent.png)


### English · light · 1440px · Blocker

![Before blocker state](en-light-1440-before-blocker.png)

![After blocker state](en-light-1440-after-blocker.png)


### English · light · 1440px · Related

![Before related state](en-light-1440-before-related.png)

![After related state](en-light-1440-after-related.png)


### English · light · 1440px · Child

![Before child state](en-light-1440-before-child.png)

![After child state](en-light-1440-after-child.png)


### English · light · 1440px · Selected

![Before selected state](en-light-1440-before-selected.png)

![After selected state](en-light-1440-after-selected.png)


### English · light · 1440px · Saved

![Before saved state](en-light-1440-before-saved.png)

![After saved state](en-light-1440-after-saved.png)


### English · dark · 390px · Parent

![Before parent state](en-dark-390-before-parent.png)

![After parent state](en-dark-390-after-parent.png)


### English · dark · 390px · Blocker

![Before blocker state](en-dark-390-before-blocker.png)

![After blocker state](en-dark-390-after-blocker.png)


### English · dark · 390px · Related

![Before related state](en-dark-390-before-related.png)

![After related state](en-dark-390-after-related.png)


### English · dark · 390px · Child

![Before child state](en-dark-390-before-child.png)

![After child state](en-dark-390-after-child.png)


### English · dark · 390px · Selected

![Before selected state](en-dark-390-before-selected.png)

![After selected state](en-dark-390-after-selected.png)


### English · dark · 390px · Saved

![Before saved state](en-dark-390-before-saved.png)

![After saved state](en-dark-390-after-saved.png)


### Japanese · light · 1440px · Parent

![Before parent state](ja-light-1440-before-parent.png)

![After parent state](ja-light-1440-after-parent.png)


### Japanese · light · 1440px · Blocker

![Before blocker state](ja-light-1440-before-blocker.png)

![After blocker state](ja-light-1440-after-blocker.png)


### Japanese · light · 1440px · Related

![Before related state](ja-light-1440-before-related.png)

![After related state](ja-light-1440-after-related.png)


### Japanese · light · 1440px · Child

![Before child state](ja-light-1440-before-child.png)

![After child state](ja-light-1440-after-child.png)


### Japanese · light · 1440px · Selected

![Before selected state](ja-light-1440-before-selected.png)

![After selected state](ja-light-1440-after-selected.png)


### Japanese · light · 1440px · Saved

![Before saved state](ja-light-1440-before-saved.png)

![After saved state](ja-light-1440-after-saved.png)


### Japanese · dark · 390px · Parent

![Before parent state](ja-dark-390-before-parent.png)

![After parent state](ja-dark-390-after-parent.png)


### Japanese · dark · 390px · Blocker

![Before blocker state](ja-dark-390-before-blocker.png)

![After blocker state](ja-dark-390-after-blocker.png)


### Japanese · dark · 390px · Related

![Before related state](ja-dark-390-before-related.png)

![After related state](ja-dark-390-after-related.png)


### Japanese · dark · 390px · Child

![Before child state](ja-dark-390-before-child.png)

![After child state](ja-dark-390-after-child.png)


### Japanese · dark · 390px · Selected

![Before selected state](ja-dark-390-before-selected.png)

![After selected state](ja-dark-390-after-selected.png)


### Japanese · dark · 390px · Saved

![Before saved state](ja-dark-390-before-saved.png)

![After saved state](ja-dark-390-after-saved.png)
