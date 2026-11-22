# Pagination specification review

Date: 2026-11-22 (JST)
Reviewer: independent sub-agent `paging_spec_review`
Scope: #1509 contract and the associated OpenAPI, Japanese/English API examples and AI guides, and distributed `kanbalone-api` skill/reference. This is a specification/documentation review, not implementation acceptance.

## Result

Approved for implementation after the two blocking findings below were resolved. No remaining blocking specification or documentation inconsistency was found in the reviewed working-tree draft.

1. **Priority filtering before pagination.** Existing GUI priority filtering was client-side. Applying it after fetching five completion tickets would produce incorrect matches and totals. The contract now adds optional normalized `priority=1,3` OR filtering before SQL LIMIT/count, and skips ticket retrieval when no completion state is selected.
2. **Dependent-board invalidation.** A change to a referenced ticket can affect another board's ticket summary. The contract now explicitly invalidates the referencing board's cursor where cross-board dependency/related data changes its returned information.

## Reviewed decisions

- Legacy requests without the newly introduced options keep their full-list behavior and response shape.
- Optional `limit` (1–200), opaque cursor, and explicit `order` (`id_asc`, `position_asc`, `completed_desc`). Changing only limit between continuation requests is supported.
- Paged responses add `page.nextCursor` and `page.total`; no redundant `hasMore` or page-number mechanism.
- Canonical filter/order/board binding rejects incompatible cursors with 400. Changed relevant read-model data returns 409. Page rows/count/revision must be read consistently in one transaction.
- All GUI ticket-list consumers use bounded API pages. List/Group/selection/settings still aggregate a complete collection where existing sorting, hierarchy and whole-set decisions require it. The contract explicitly does not claim demand-loaded List/Group rendering or full-data-transfer elimination.
- Completion lanes alone initially use genuine incremental 5 + 50 retrieval, with expanded counts/scroll retained where possible and a retryable non-destructive failure state.
- AI instructions require bounded read retries and forbid blindly replaying writes or treating unfetched relationships as absent.

## Documentation review

Reviewed `docs/openapi.yaml`, `docs/{ja,en}/api-examples.md`, `docs/{ja,en}/ai-api-guide.md`, `skills/kanbalone-api/SKILL.md`, and `skills/kanbalone-api/references/api.md` against `docs/ja/developer/pagination-spec.md`.

The documented argument ranges, order values, continuation example (5 then 50), response shape, priority filter, 400/409 distinction, cross-board invalidation, parent/child limitation and retry guidance agree. The documents identify the feature as development-branch functionality and advise matching the running release. No additional dependency or unnecessary public pagination concept is proposed.

## Implementation acceptance remains pending

Verify DB trigger coverage for deletes/cascades/moves and joined summary data, unrelated-board non-interference, restart durability, query-level LIMIT, stale-response rejection, bounded atomic retries, all GUI direct fetch sites, complete-set selection semantics, completion filtering/refresh behavior, bilingual screens and before/after image evidence. This review does not substitute for those checks.
