# Group and Kanban initial display

This investigation covers #1527 and #1528. The change skips grapheme segmentation when a tag name already fits within the label limit in UTF-16 code units. Every grapheme spans at least one code unit, so the existing segmentation and truncation path handles the remaining names. One diagnostic run with 10,000 Group rows attributed about 213 ms to grapheme segmentation. At 3,013 Kanban cards, segmentation accounted for about 91 ms.

Baseline `899d0f0117ee52e6d57db59241312f0fa4fcd0f7`, corresponding to version 1.1.0. The candidate served the byte-identical `app-tags.js` from `b1355ebecc47d5aa1f2d9f2dd8f9b2248aa266ed` with the same baseline backend. Candidate and baseline source fingerprints are in the measurement results. The original timing launcher started outside the repository, so the application displayed its fallback version label v0.0.0 in the timing captures. Both timing variants used the same startup environment. The reproduction script now starts from the chosen repository to read the package version.

## Fixtures and method

The November 23 JST runs used Node 26.13.1 and Playwright Chromium 159.0.8154.6 on Intel macOS, over loopback HTTP. The measured viewport was 1440 × 1000 in English and light mode. Each variant used an isolated synthetic SQLite copy. Each sample used a fresh browser context. The first pair per dataset warmed the server and browser process. Five retained pairs alternated variant order with heavy tests paused.

- The Group fixtures derive from the archived November 22 Group benchmark, with 1,000 and 10,000 members. They include archived parents with active children, variable-height titles, repeated short tags, and longer tags with combining characters, flags and joined emoji. The No Group copies use the same rendering inputs after removing membership.
- The historical Kanban layout uses the same 1,000 and 10,000 ticket distributions as the earlier hierarchy investigation. Removing five separately seeded Group candidates restores the original 313 and 3,013 visible card counts, including five cards in the Done lane.
- The high-active Kanban scenario has 3,000 active cards across six lanes and 200 completed tickets. The initial display contains 3,005 cards. This fixture includes all four priorities, blockers, parent/child relationships, and wrapping titles.

The timing endpoint detects the expected IDs and row/card count in the DOM, with a timestamp after two animation frames. Kanban also records the first card and the first card in every nonempty lane. These instrument navigation and DOM availability. Paint completion, INP, other browser engines, and human task time are outside the measurement scope. Resource Timing tracks ticket pages, decoded bytes, and response completion. Server-Timing measures request start to the start of sending, including handler work and response serialization. CDP durations are cumulative from navigation. The separate diagnostic run estimates JavaScript costs using the CPU profiler and timing around HTML generation, DOM insertion and JSON consumption. An additional replay times synchronous JSON.parse on response texts held in memory.

## #1527 Group and No Group

Medians in milliseconds. Ranges and request counts are in `measurements.json`.

| Rows | View | All rows + 2 frames, baseline → candidate | Last ticket response to endpoint |
| ---: | --- | ---: | ---: |
| 1,000 | Group | 552.5 → 536.8 | 318.3 → 296.1 |
| 1,000 | No Group | 489.3 → 464.5 | 264.1 → 240.8 |
| 10,000 | Group | 4,031.6 → 3,837.8 | 3,220.3 → 3,013.1 |
| 10,000 | No Group | 3,355.0 → 3,122.5 | 2,733.7 → 2,483.5 |

The separate large Group diagnostic measured 338 ms for markup generation, 532 ms for synchronous row insertion, and about 1,497 ms for cumulative layout. No Group measured 292 ms, 362 ms, and about 1,335 ms respectively. Synchronous JSON replay medians were 12.7 and 11.3 ms for all pages. The Group and No Group main runs received 5.76 MB and 5.48 MB of ticket payloads in 50 pages. After the tag improvement, both still render their complete row set in one update. Layout, DOM construction and retrieval account for most of the remaining time.

## #1528 Kanban

Medians in milliseconds.

| Fixture | Visible cards | First card | First card in every lane | All cards + 2 frames | Last ticket response to endpoint |
| --- | ---: | ---: | ---: | ---: | ---: |
| Historical 1,000 | 313 | 316.7 → 310.3 | 316.8 → 310.4 | 363.0 → 359.1 | 192.1 → 184.6 |
| Historical 10,000 | 3,013 | 373.6 → 384.0 | 373.7 → 384.0 | 2,600.2 → 2,475.3 | 2,369.6 → 2,232.0 |
| High-active 3,200 | 3,005 | 393.8 → 397.2 | 393.9 → 397.3 | 2,765.0 → 2,663.1 | 2,529.6 → 2,417.3 |

The first-card ranges overlap in all three fixtures. The 3,013-card test took 125 ms less to materialize all cards in the median run. It fetched 17 ticket pages totalling 1.66 MB. The high-active case materialized all cards 102 ms sooner in the median run and fetched 19 pages totalling 1.61 MB. A separate run across the same card set timed the creation of detached cards at 425 ms, including about 105 ms in tag rendering. Fragment insertion measured 11 ms and cumulative layout measured 776 ms. Lane preparation accounted for about 9 ms in the CPU profile. Repeated card DOM and layout work remain candidates for investigation. Replacing repeated external SVG references could affect layout cost and needs its own screen, geometry and interaction comparison. The existing round-robin batches continue delivering the initial cards together.

## Parity and evidence

The measured rows and cards matched the expected count and full ordered ID sequence in every retained sample. The paired samples also matched geometry and rendered tag markup hashes, scroll heights, and ticket request counts and bytes. All seven initial-screen screenshot pairs were byte-identical. Screenshots were saved as original PNGs after fonts loaded, outside the timing interval. They record comparable actual screens. The benchmark supplies the timing evidence. Browser Find, native drag and stored interaction results require separate checks.

The four larger screen pairs were captured again with agent-browser 0.26.0 and Headless Chrome 158. This capture pass confirmed version 1.1.0 in both /api/meta and the sidebar footer, then checked the expected DOM count in the original viewport, language, and theme. All four pairs were byte-identical. Their checksums appear under `releaseDisplayScreenshots` in `measurements.json`.

An additional comparison of 8,400 calls to the original and updated tag formatting and rendering helpers found identical results with and without Intl.Segmenter. Inputs include empty, short, exact-boundary and long names, colored and colorless tags, escaping, combining characters, variation selectors, regional indicators, and joined emoji.

## Reproduce

Run from a checkout containing the tag change with dependencies installed under Node 26. Set `KANBALONE_RENDER_REPO` to a checkout of the baseline backend when reproducing the exact revision. The scripts default to `coverage/tag-render-perf` inside that checkout. `KANBALONE_RENDER_OUTPUT` selects a fresh independent directory. `prepare.mjs` reads the existing synthetic archive and refuses to overwrite its extracted copy.

```sh
evidence=docs/development/evidence/2026-11-23-tag-render
export KANBALONE_RENDER_OUTPUT="$PWD/coverage/tag-render-perf"
node --import tsx "$evidence/prepare.mjs"

mkdir -p "$KANBALONE_RENDER_OUTPUT/before" "$KANBALONE_RENDER_OUTPUT/after"
git archive 899d0f0117ee52e6d57db59241312f0fa4fcd0f7 public | tar -xf - -C "$KANBALONE_RENDER_OUTPUT/before"
cp -R "$KANBALONE_RENDER_OUTPUT/before/public" "$KANBALONE_RENDER_OUTPUT/after"
cp public/app-tags.js "$KANBALONE_RENDER_OUTPUT/after/public/app-tags.js"

node --import tsx "$evidence/benchmark.mjs" "{\"rounds\":6,\"screenshots\":true,\"runLabel\":\"comparison\",\"variants\":[{\"name\":\"baseline\",\"staticDir\":\"$KANBALONE_RENDER_OUTPUT/before/public\"},{\"name\":\"shorttag\",\"staticDir\":\"$KANBALONE_RENDER_OUTPUT/after/public\"}]}"
node "$evidence/summarize.mjs" "$KANBALONE_RENDER_OUTPUT/comparison.json"
node "$evidence/tag-parity.mjs" "$KANBALONE_RENDER_OUTPUT/before/public/app-tags.js" "$KANBALONE_RENDER_OUTPUT/after/public/app-tags.js"
```

For attribution, repeat the benchmark with `diagnostics: true`, `rounds: 1` and a distinct `runLabel`. Diagnostics serve instrumented asset copies and add CDP CPU profiling. The `profile-summary.mjs` script shows sampled V8 self and inclusive times for generated `.cpuprofile` files. Keep diagnostic timings apart from the comparison statistics. For the exact tag-only comparison, verify the served asset hashes against `measurements.json`.
