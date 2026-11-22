# Independent code and cursor review

Reviewed merged main `7112467b524d5cea097e6cb4f4abf715e7f7ed4c` and the candidate working tree on 2026-11-22. The targeted review found no blocking issue.

## Product behavior

- The candidate route requires a page size from 1 through 200 and accepts an opaque cursor and an optional explicit ID order. Its query guard rejects unsupported keys before Fastify can discard them. Its response schema requires all six picker fields plus page metadata and the handler sets the board revision header.
- The SQL restricts rows to the requested board and includes archived tickets. The same SQLite read transaction obtains the keyset rows, total, revision and batched blocker IDs. The five selected ticket columns supply the ID, title, current parent, priority and resolved state. The blocker loader returns IDs in ascending order and preserves historical cross-board blocker IDs.
- All four pickers use the existing client collection path. The prior loading, cancellation, stale-generation checks, 409 retry and complete-collection publication still apply. Picker eligibility, ID/title substring matching, sorting, selected chip order and the child parent expectation continue to read their existing inputs.
- Compared the candidate API tests and OpenAPI declaration to the route. Coverage includes exact row values across changing page sizes, archival, parenting, a cross-board blocker, an empty board, invalid or unsupported queries, cross-collection cursors and revision changes. The browser test now induces a real revision conflict and expects the replacement first-page data.

## Executed compatibility probe

After preparing the archived baseline, run from the repository root with Node 26.13.1:

```sh
node --import tsx coverage/candidate-payload/review-cursors.mjs
```

The independent probe loaded both versions of the pagination code in one process and exercised the same in-memory SQLite database and signing secret. Nine synthetic tickets covered both completion states, active and archived rows, all priorities, a parent link and a dependency. Three filters (default, all archives, and priorities 2 or 3) and all three orders produced exactly equal full and paged legacy results, including the signed cursor bytes. A cursor from either version continued in the other with a changed page size. The candidate fields and revision matched the projection of the baseline summary. Both directions of cursor replay between the candidate and summary collections returned the expected 400 error. All assertions passed.

The probe checks the database read functions directly. HTTP behavior, timing, screenshots and persistence through the browser require their respective API and browser verification. It does not exercise simultaneous external database writers.
