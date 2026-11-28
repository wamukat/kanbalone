# Desktop form feedback — 2026-11-28

Scope: [#119](https://github.com/wamukat/kanbalone/issues/119) and [#124](https://github.com/wamukat/kanbalone/issues/124).

1440 × 900, Chromium (Playwright 1.65.1), light theme, Japanese and English; isolated temporary databases, synthetic Desktop workflow board / Todo lane. No normal user data was used.

Base: `cca07696876b0c18ddb8589de5c34d6ac8f20995`. Before captures serve the exact base `app-editor.js` (discard) or `app-inline-text-form.js` (names) via a test route; the remaining runtime is the candidate checkout. This isolates the changed behavior, not a full older-release deployment. The reported v1.6.0 screenshots remain in the external UI review evidence; that release was not rerun in this batch. Candidate source hashes are in `source-sha256.json`.

## Discard confirmation

`before/after-{ja,en}-discard.png`: open Review draft, edit body to `Draft with [reference](https://example.com)`, select characters 6–10 backward, Escape. Before: Cancel / キャンセル. After: Continue editing / 編集を続ける, initially focused. Enter returns to the same draft, focus and selection. No POST/PATCH/DELETE occurs; API still contains Saved body. Explicit Save then API read and reload retain the edited text and link. Existing unsaved-edit tests additionally cover outside click, Back, failed save and comment refresh. Pending image uploads were not separately exercised; their implementation is unchanged.

## Required names

`before/after-{ja,en}-empty-name.png`: choose new board, enter three spaces, Enter. Before closes the input silently. After keeps the input focused and invalid. The browser-native validation popup is not captured by headless screenshots; DOM validity checks confirm `名前を入力してください。` / `Enter a name.`. These images establish input retention, not popup appearance or screen-reader behavior.

Both locales check empty and whitespace values for board/lane creation and renaming, zero write requests, original API names retained, input correction clears validity, and Escape closes without creating/renaming. Correcting to Recovered board then Enter creates the board and survives reload. Existing board/lane CRUD tests cover normal successful rename/create.

## Validation and limitations

- `pnpm check`: 314 unit/API tests, lint, build, public JS types and docs build passed.
- Continue-editing (2 locales) and existing unsaved-edits: 6 passed.
- Required-names (2 locales) and existing board settings: 3 passed.
- Independent code review: no actionable findings.
- Desktop focused; narrow layouts, dark theme, actual screen readers, and native popup rendering across browsers were not expanded into a separate matrix. No new layout or CSS is introduced.
