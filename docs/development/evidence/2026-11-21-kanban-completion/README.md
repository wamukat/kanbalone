# Completion lane preview

[PR #24](https://github.com/wamukat/kanbalone/pull/24)

Captured 2026-11-21 with Chromium / agent-browser, 1280×844, light theme, Japanese and English.

Before: commit df3b465, isolated server 3493.
After: working tree based on df3b465, isolated server 3494. SHA-256 fingerprints are in manifest.json.
The after database is an SQLite backup of the baseline synthetic database, taken before interaction, then migrated by the new server. No production tickets were used.

## Task and reproduction

1. Create Doing / Acceptance / Done (completion) lanes. Seed 108 completed tickets, #109 in Acceptance and #110 in Doing. Both instances have the same titles and IDs.
2. Open the board with fresh preferences. Before shows only unfinished tickets. After shows five completed tickets and a control to add 50.
3. Move #109 to Done. The baseline screenshot follows a browser drag; the after screenshot follows ticket edit → lane Done → Save → close. The before/after API snapshots verify the same stored destination and resolved state.
4. After the change, #109 appears first. Reload and verify that it remains first.
5. Show 50 more: 55 cards; repeat: 105 cards. Collapse returns to five. Screenshots of expanded views are scrolled to the controls. The API snapshots after move and after paging are identical.
6. Change language using Board settings. Repeat paging in English.
7. Automated regression separately covers 108 completed tickets: 5 → 55 → 105 → 108, collapse before all tickets are loaded, incoming ticket visible after reload, and an old completed ticket not promoted by title editing.

## Images

| Case | Before | After |
| --- | --- | --- |
| Japanese initial | [Before](before-ja-initial.png) | [After](after-ja-initial.png) |
| Japanese moved | [Before](before-ja-moved.png) | [After](after-ja-moved.png) |
| English moved | [Before](before-en-moved.png) | [After](after-en-moved.png) |

Additional after images: [55 / Japanese](after-ja-expanded55.png), [collapsed](after-ja-collapsed.png), [reloaded](after-ja-reloaded.png), [55 / English](after-en-expanded55.png), [105 / English](after-en-expanded105.png).

## Verification and limits

- Existing unknown completion timestamps migrate to null; new transitions populate resolvedAt. Old ticket timestamps are not invented.
- Backend suite: 176 passed. Focused Kanban suite: 6 passed; filter/default/i18n suite: 22 passed.
- Full Chromium run: 100/102 passed initially. One obsolete collapse-label expectation was corrected; one test timed out during teardown after its assertions. Both passed on a single-worker rerun (2/2), covering all 102 scenarios.
- Server and public TypeScript checks, OpenAPI lint and documentation build passed.
- All five image embeds were opened in the tracker and verified loaded (naturalWidth 1280).
- Saved filters are preserved. Users with a saved open-only filter need to reset or include resolved tickets.
- Completion ordering is automatic in Kanban; manual within-lane reorder is not supported there. API position ordering and List are unchanged.
- Images alone do not establish persistence; API snapshots and E2E assertions provide that evidence.
- Desktop/light images were manually inspected. Screen-reader speech and a complete keyboard audit were not performed.
- Independent review found no required code/UI changes. Screenshots containing a temporary reviewer board were recaptured after its deletion.
- Native drag onto an occupied lane did not emit a drop event in browser automation, both before and after this change; an empty target worked. The [native drag follow-up](../2026-11-21-native-drag/README.md) covers the occupied-lane behavior. Whether physical mouse use is affected remains unverified. The after movement images use the editor lane selector; synthetic drag regression does not resolve this native-drag limitation.
- Expanded screenshots scroll into view of the controls; this also shifts the horizontal scroll slightly. No pixels were edited.

## Local image hosting

    python3 -m http.server 3495 --bind 127.0.0.1 --directory docs/development/evidence/2026-11-21-kanban-completion

Ticket embeds require this local server. The original PNGs are versioned here; another machine needs its own host or revised image URLs.
