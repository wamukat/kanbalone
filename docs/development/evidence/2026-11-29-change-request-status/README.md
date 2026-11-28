# Explicit PR/MR status snapshots — 2026-11-29

Scope: [MR/PR status in ticket lists #14](https://github.com/wamukat/kanbalone/issues/14).

## Setup and evidence

Chromium / Playwright 1.65.1, 1440 × 900, light theme, Japanese and English. Isolated temporary databases, synthetic Review queue tickets and mocked provider responses; no normal-user data or real external changes. Before serves all public assets from `d1952c2` (the preceding checklist implementation) against the candidate backend and identical seeded reference/cache data. The old UI ignores the new cache and shows its existing reference badges. After uses the candidate UI. Original reported v1.6.0 was not rerun. Source and PNG hashes are included. Reference kinds describe their purpose (main, review, followup), independently of fetched state; final evidence was recaptured after making those fixture names neutral.

`before/after-{ja,en}-list.png` shows one ticket with a merged GitLab MR, a closed GitHub PR whose subsequent fetch failed and whose successful snapshot is old, and an open GitHub PR. A second ticket has a reference not yet fetched. `before/after-{ja,en}-detail.png` shows the same references in Current ticket. Existing reference text and links remain; compact state icons and per-reference refresh icons are added. Tooltips and accessible names include state, successful fetch time, and failed-attempt time/error. The year-2000 cached timestamp is an intentional stale evaluation fixture, not a real service observation.

## Behavior and validation

Only an explicit UI or POST refresh calls the provider. GitHub `pull_request` and GitLab `merge_request` references normalize open/closed/merged states and draft status. No periodic fetch, caller-supplied state or implicit Issue import. Multiple references remain separate. A snapshot older than 15 minutes is indicated as potentially stale when rendered; this is a display threshold, not a polling interval.

The cache uses a new table and an opaque request token. PUT clears the old snapshot. Replacement, deletion, ABA edits and a newer refresh invalidate an older response. Failures retain the previous successful state and record sanitized errors. Cache writes invalidate ticket pagination revisions. Credentials use the existing scoped resolver; provider requests are GETs, disallow redirects, and do not automatically retry. The common HTTP timeout behavior is unchanged.

`pnpm check` passed: 322 unit/API tests plus schema/CSS lint, build, public JavaScript types and docs. Four new unit/API cases cover stored snapshots, failure secrecy, unsupported types, delayed replacement/deletion/ABA, out-of-order refreshes, pagination revision, real adapter URL/header/state parsing against a local HTTP fixture, and redirect rejection. Three new browser cases and the existing non-tracking-reference case passed. Browser tests verify exact explicit-fetch counts, no fetch on reload, stored state without rewriting local content, retained cache on failure, busy controls, and preservation of an inline local draft during a delayed refresh. Two baseline locale cases passed. Initial test-only title selection was corrected to use the actual List ticket selector, and OpenAPI error schema references were corrected before validation.

A database created by the preceding implementation, asserted to have no cache table, upgraded without losing ticket text or references. A cached state could then be saved; opening its prior SQLite backup with the candidate preserved the original data and correctly began without cached status. Independent review found no actionable issues.

## Limits and provider contracts

No real GitHub/GitLab outage or credential exercise, actual screen-reader study, mobile matrix, release or normal-runtime upgrade. Existing private-server credential configuration applies; public references may work without credentials when the provider allows it. This is cached review state, not live mergeability or CI status. Board imports/PUT reconstruct links and require a new fetch; SQLite backups retain the cache.

Provider contracts: [GitHub Get a pull request](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request), [GitLab Get single MR](https://docs.gitlab.com/api/merge_requests/#get-single-mr).
