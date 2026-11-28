# Human-operated MR/PR linking

2026-11-29, Chromium, 1440 × 900, light theme, Japanese local ticket and English imported GitHub Issue. Isolated SQLite fixtures; the Issue provider is mocked. No normal-user data or real provider writes. Baseline public assets are unchanged from `7ee777353e5a2881c9c3a1c28a9bc656c1e0180d`, served against the same candidate backend and fixture. Candidate sources and original captures: [SHA256 manifest](sha256.json).

The approved mock adds a header link icon, a URL form, per-reference unlink controls, and confirmation that only the local relationship is removed. The implementation uses existing dialog controls, Cancel before the final action, Ctrl/Cmd+Enter, the existing update icon and the mock's X unlink icon. Opaque generated kinds display as PR/MR; existing custom kinds retain their labels. Changing an input clears a stale submission error.

| State | Before | After |
| --- | --- | --- |
| Japanese local ticket, no references | [Before](originals/before-ja-empty.png) | [After](originals/after-ja-empty.png) |
| Japanese local ticket, multiple references | [Before](originals/before-ja-multiple.png) | [After](originals/after-ja-multiple.png) |
| English tracked Issue, no references | [Before](originals/before-en-empty.png) | [After](originals/after-en-empty.png) |
| English tracked Issue, multiple references | [Before](originals/before-en-multiple.png) | [After](originals/after-en-multiple.png) |
| URL entry | Not available in baseline | [Japanese](originals/after-ja-add.png), [English](originals/after-en-add.png) |
| Unlink confirmation | Not available in baseline | [Japanese](originals/after-ja-unlink.png), [English](originals/after-en-unlink.png) |

Steps: open Current ticket, add a GitHub PR URL, inspect its preview, submit with Ctrl+Enter, add a GitLab MR, try a normalized duplicate, open unlink and cancel, then inject a DELETE 503 and retry using Cmd+Enter. Reload and read API results. Local-ticket coverage also edits a body draft, injects an add failure, retries without losing the draft, and verifies that a changed-then-restored reference cannot be unlinked with the stale confirmation revision. The Issue fixture verifies that importing/tracking semantics and provider call counts remain unchanged by linking. Baseline registers the same links through the API solely to compare its existing reference display; it has no add/unlink UI to capture.

Backend: additive POST parses URL syntax locally, canonicalizes GitHub case/query/fragment/trailing slash, detects duplicates in an immediate transaction and generates an independent kind. Guarded DELETE requires reference ID and revision. Each legacy PUT increases revision, including identical values; delete/re-add gets a different ID. External services are never contacted by add/unlink. No title or existence lookup. Existing status refresh remains explicit.

Validation: `pnpm check` passed with 324 unit/API tests, lint, build, public JS types and docs. Two focused candidate browser cases and two baseline captures passed. Previous implementation SQLite upgrade and old-backup restoration preserve content/references and initialize revision zero. After review, unlink's misleading shared “This will delete” heading was replaced with “Link to unlink”; the default for actual deletion remains unchanged. A focused board-deletion regression and final public types/build also passed. Initial browser failures exposed missing confirmation context wiring; corrected before the successful runs.

Limits: representative desktop coverage, no new mobile or human study. URL parsing accepts GitHub/GitLab URL patterns including enterprise/self-managed hostnames with root-hosted APIs, but does not resolve API subpaths, aliases, redirects or provider existence/access. GitLab project-path case is preserved. Provider refresh behavior is covered by existing status tests, not simulated as a real external-service test here. Actual stored data and failure behavior are established by API/interaction assertions, not images alone.
