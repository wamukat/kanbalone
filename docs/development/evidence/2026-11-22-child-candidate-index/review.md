# Independent review — 2026-11-22 JST

Reviewer `group_probe_review` reviewed the plan, implementation, new regression test, measurement method and final evidence without running concurrent tests during the benchmark.

A per-call parent-ID Set was preferred over a persistent cache to preserve reset/generation semantics with a smaller change. Archived descendants, selected-child exceptions, self exclusion and ordering remain unchanged. No implementation blocker found.

Final reviewer independently recalculated all README medians from 60 retained operation samples. Ordered IDs match for each size/query; first requests/bytes match (6/548058 and 51/5527445), repeat/no-match issue no candidate requests, focus is retained and no page errors occur. Source fingerprint matches.

Reviewer inspected Japanese narrow dark search/saved and Japanese desktop excluded before/after images: no visible candidate, selected state, saved state or position regression. Seventeen of eighteen image pairs are byte-identical; the six-pixel selected-chip edge difference is disclosed, with no claimed definitive rasterization cause. Eight interaction records retain cancellation, saved children [6,2] and reload results. Root ran `pnpm check` (200 tests) and the related 11 E2E tests successfully; the reviewer did not independently rerun them.

Decision: no blocker; ready for PR and user acceptance once CI and ticket-image loading are verified. Full candidate collection and other large-data costs remained outside this review. This review is not merge authorization.
