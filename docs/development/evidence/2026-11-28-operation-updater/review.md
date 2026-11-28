# Operation updater review

Reviewed on 2026-11-28 against v1.6.0, commit `4920daffe31a835a43996bead3a9f62f847d3f21`. The 26 changed files under `src/` and `public/` have SHA-256 fingerprint `60ace84ff3fb15e67a9411cb2b3c0ec7c9071e3191265a3565ad21b77b6fd2b3`. The fingerprint hashes the sorted repository-relative paths, each followed by a NUL byte and the raw SHA-256 digest of that file.

## API and migration checks

- Sent simultaneous requests against an isolated in-memory database. An injected provider held the first remote import until the second completed. Every resulting creation and import entry carried the updater from its own request.
- Verified that an updater alone cannot satisfy a ticket or Group edit. Null, numeric, whitespace-only and overlength values returned HTTP 400. The API accepted 80 supplementary Unicode characters. Group deletion accepted the existing quoted revision in `If-Match` together with its JSON updater. Reading Group activity returned the original creator and the separate deleting updater.
- Created a ticket, comment, Group and PNG attachment with v1.6.0 runtime code. Backed up and restored the fixture with the database and attachment backup tool, then opened it twice with the candidate. Compared all existing rows across 22 application tables. Existing IDs, timestamps, contents and ownership of attachments matched. The added updater columns on old comments and ticket and Group activity were null. The attachment bytes matched, the foreign key check returned no violations and SQLite integrity checks passed.
- Reviewed the application routes, OpenAPI and bilingual API and migration documentation. The remote import preview is separate from the operation that writes history. Board import preserves historical comment attribution while recording the importer on the new activity.

## Automated checks

The implementation run on Node.js 26.13.1 passed `pnpm check` with 290 tests, the production build, public JavaScript type checks and documentation build. A separate Chromium run on the final styles passed all 13 tests in `operation-updater.spec.ts` and `i18n.spec.ts`. The updater tests cover separate tabs, a saved name after reload, existing filters and a denied storage write.

## Visual review

Compared the three baseline/candidate pairs and four additional candidate images at 1440 × 900. The English light and Japanese dark settings show the updater below Language, with a full-width field, help text and Save control. The saved English state shows the confirmation beside Save. The input uses the sidebar theme colors and the same width as the language selector.

In the matched legacy views, each comment or activity retains its timestamp and shows **Unrecorded** next to it. After new operations, the comment metadata distinguishes the browser default, saved name, API default and explicitly supplied reviewer. The corresponding activity shows the updater for the edit to the old comment while the creation attribution remains unknown. The [capture record](README.md) links the original images and describes the interaction and persistence checks.

Verified all ten original image hashes and dimensions, and reproduced the candidate fingerprint across the 237 runtime and build source files recorded in the [manifest](manifest.json).
