# Local body checklist — 2026-11-29

Scope: [Markdown checklist interaction #105](https://github.com/wamukat/kanbalone/issues/105).

## Setup and comparable evidence

Chromium / Playwright 1.65.1, 1440 × 900, light theme, Japanese and English. Isolated temporary databases, identical synthetic Review notes ticket and Body checklist board. The before run serves the complete public assets from `4d78830` (the preceding board-context implementation). It uses the candidate backend, which adds nonvisual source offsets to local body HTML; the baseline UI continues to render display-only spans. Unit tests verify identical sanitized HTML after removing these attributes. The original reported v1.6.0 release was not rerun. After uses the candidate UI; source hashes accompany four original PNGs.

Open Review notes → Current ticket. The two duplicate Review layout entries and nested completed item demonstrate position mapping; the fenced Markdown example stays code. Before shows display-only checkbox characters. After replaces only generated local body markers with native, keyboard-operable checkboxes and reduces their indentation. No permanent explanation labels were added.

## Interaction, persistence and failure results

- Space on the first checkbox changes only its source state character, preserving Unicode, duplicate text, nesting, code and surrounding Markdown. API reads and reopening confirm persistence. Clicking again restores the exact original body. Focus returns to the same checkbox.
- A simulated failed PATCH retains the unchecked display and stored original body. A concurrent update made after click but before PATCH processing causes the existing edit-token precondition to reject the stale save. The concurrent note remains intact. Reopening loads that note and a new toggle preserves it.
- A delayed PATCH disables repeated changes and makes the body inert. A successful PATCH followed by a simulated 503 on board-detail refresh retains the saved checked state, reports the refresh failure and issues exactly one PATCH.
- Separate Tasks keep their own storage and counts. Comments, remote snapshots and Task description markers are display-only. Raw HTML cannot inject actionable source offsets or inputs. Two lexical passes accept only unchanged task tokens, excluding code and unrecognized syntax; rendering always uses the original Markdown. Empty markers that Marked does not recognize as tasks remain text.

## Validation and limitations

`pnpm check` passed: 318 unit/API tests, schema/CSS lint, production build, public JavaScript types and documentation build. Four focused browser cases and two baseline locale cases passed. Initial test-only corrections replaced Playwright's immediate uncheck expectation with an eventual saved-state check and matched the API's lowercase error string. The delayed-save case was repeated after making the body inert and explicitly verifies the actual board-refresh failure message. Independent review found no actionable issues.

The UI sends the existing body PATCH with `expectedEditToken`; it does not silently merge a concurrent edit. Only one source character is changed, but the body is transmitted as a whole. No new API or migration. No additional mobile matrix, real screen-reader study, normal-user data changes or release publication.
