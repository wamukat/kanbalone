# Independent review of hierarchy rendering

[Implementation PR](https://github.com/wamukat/kanbalone/pull/32)

Reviewed independently of the implementation author. Date: 2026-11-22.
Baseline: `b7dc02e8885f740afd9a47f12fab4c9079346041`.
Reviewed production fingerprint: `afd2a969dd2747c24dacffc68cd01472774138461e11a88b0d6ea460972dbe0a` (three modules listed in `revision.json`).

## Code and scope

No correctness blocker found in the reviewed diff. The new index is scoped to a render/collection and rebuilt after refresh; it does not retain stale membership. List preserves parent-before-child order, missing-parent fallback and explicit flat sorting. Group preserves archived-parent context, visible child filtering, parent-only removal actions and counts. Candidate matching still excludes a selected parent and its children and treats missing-parent tickets independently.

The source change does not alter API requests, cursor behavior, CSS, visible row limits, database writes, drag handlers or keyboard commands. Regression tests cover the affected hierarchy and Group behavior, including a wide 2,000-child set. Validation execution results belong in README/check logs; no performance tests were rerun by this reviewer during the author's timed runs.

One review finding was fixed: option/removal labels initially copied related arrays to obtain counts, which could remain quadratic for a very wide family. They now use an O(1) related-count lookup.

## Actual image review

Visually inspected before/after Japanese Group, English List and English Kanban captures. Parent/child indentation, archived/completed status columns, lane labels, action positions and the existing white/green style remain the same. Independently compared all six Japanese/English view pairs: each is 1440×1000 and the corresponding before/after PNG files are byte-identical. The capture harness targets different baseline/candidate origins, so this supports unchanged visual output. It does not demonstrate speed or persistence.

## Measurement review

Read both retained harnesses, source metadata, JSON samples and README. Independently recomputed all six first-row median comparisons from the 36 navigation samples; README values match. Isolated function timings exclude API/DOM work and are clearly separated from full navigation results.

The local measurements support a bounded improvement: 10k List first rows 1,563→1,010 ms, Group 7,623→3,950 ms. They do not support claiming all performance work complete. Kanban has no targeted change; its observed variation must not be attributed to this patch. Three sequential before/after runs on a shared machine are not a randomized performance guarantee. Long tasks span the observation through completion; first-row timing is a two-frame proxy, not measured human task time or INP.

## Decision and remaining work

Accept the three-module optimization and unchanged visual behavior for review. The author's `pnpm check` log confirms 196 passing unit/API tests, backend/public type checks, OpenAPI lint and docs build; the relevant Group/keyboard E2E log confirms 25 passing tests. The two added declaration files match the runtime exports and introduce no runtime behavior. User acceptance and CI are still required before merge. At the time of this review, Group still rendered all rows, List and Group still collected all needed pages, and Kanban still built thousands of cards. No release, production data update or runtime replacement is covered by this review.

## Final measurement correction audit

The initial Kanban first-row observer could measure startup board 1 before the requested 10k board. Its first-row numbers were therefore invalid; checking arithmetic alone did not establish the correct observation target. The author reran all Kanban samples after tests finished with a ticket-ID guard distinguishing the two fixture boards, retained in both `measure-views.mjs` and `measure-kanban.mjs`. The latter replaces only Kanban samples; List/Group samples remain unchanged.

Reviewed the corrected guard and recomputed all first/complete medians from the final 36 samples. README matches: 1k Kanban first 308→319 ms, complete 459→437 ms; 10k first 634→613 ms, complete 2,706→2,674 ms. This is still an unchanged-code control, not a performance improvement claim. The final six before/after screenshot pairs remain byte-identical after Kanban recapture. Chromium version and identical API input/different served JS hashes are recorded in revision/served-input metadata; discarded partial timing data was removed.
