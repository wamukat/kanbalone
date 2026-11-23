# Group ticket status visibility

[PR #24](https://github.com/wamukat/kanbalone/pull/24)

Captured 2026-11-21 using Chromium/agent-browser, 1280×844, light, Japanese and English.

Before: main commit 71e7bb6edceedf140d0254e82c8c05ebd0d49753, unchanged public assets copied to isolated server 3485.
After: working tree on that base, server 3486. Asset/image SHA-256 values are in manifest.json.
Both servers use independent synthetic databases with matching ticket content, lanes, parent relationships, completion/archive flags and Group membership. No production data was used for screenshots.

## Reproduction

1. Open board 1 → Group → Release in Japanese, archive hidden.
2. Completed #1/#3 stay visible; unfinished #2/#4 remain prominent.
3. Show archived tickets: completed-and-archived #5 has both icons; unfinished-and-archived #6 has only archive. Done and archive each retain their own column; lanes stay aligned.
4. Select Guides: completed parent #7 and completed child #9 are subdued, while unfinished children #8/#10 remain emphasized. Parent/child order is unchanged.
5. Repeat in English. Wait for the intended Group/ticket after language reload before capture.
6. Toggle archive display back; existing ticket title bounds and stored data must remain unchanged.

The fix adds the existing translated completion icon, reserves two status slots on every row, and applies muted regular-weight titles only to resolved/archived rows. No filtering, sorting, membership, data schema, or API changes.

## Original images

| Case | Japanese before / after | English before / after |
| --- | --- | --- |
| Mixed; archive hidden | [Before](before-ja-mixed.png) / [After](after-ja-mixed.png) | [Before](before-en-mixed.png) / [After](after-en-mixed.png) |
| Archive shown | [Before](before-ja-archived.png) / [After](after-ja-archived.png) | [Before](before-en-archived.png) / [After](after-en-archived.png) |
| Completed parent / unfinished children | [Before](before-ja-parent.png) / [After](after-ja-parent.png) | [Before](before-en-parent.png) / [After](after-en-parent.png) |

## Verification

- Group Chromium E2E: 8 passed, including new bilingual regression for mixed status, completed parent/open child, independent icon columns, lane alignment, unchanged existing title bounds on archive toggle, and unchanged stored ticket responses.
- Public JavaScript type check and git diff check passed.
- Manual API comparison: matching title/body/lane/parent/Group/resolved/archive values for all 11 synthetic tickets across before/after.
- Independent reviewer inspected code, tests, bilingual guide text and actual images. Reviewer caught two Japanese screenshots taken before the target screen settled; these were recaptured after target-ticket readiness.
- Screenshots demonstrate appearance, not persistence; API/E2E comparisons support the no-data-change claim.
- This evidence covers desktop/light and both languages; screen-reader speech, dark/narrow layouts and complete keyboard traversal were not manually evaluated here. No claim of a full accessibility audit.

## Viewing the original images

Open the original captures from the comparison links above.
