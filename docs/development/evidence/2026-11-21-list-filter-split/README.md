# #1494 — Completion and archive filters

Captured 2026-11-21 in Chromium, 1280×844, light theme, Japanese and English.
Before: c2786ca516c2a8a2c2cdaeb467e300f62bbb268c, frozen public assets on isolated server 3501.
After: working tree on that base, isolated server 3502. Source/image fingerprints are in manifest.json.
Each server has its own matching synthetic board: Todo/Doing/Done, two open tickets, two resolved tickets, one archived open ticket and one archived resolved ticket. No user tickets were used.

## Task and reproduction

1. Open board 1 → List, using a fresh browser profile and the chosen locale.
2. Expand the status/completion filter. Before shows Open, Resolved and Archived; after keeps the existing horizontal interaction with only Open and Resolved plus a separate Include archived tickets checkbox.
3. Include archived items: both fixtures display all six tickets. Capture the archived state.
4. Hide archives, deselect Resolved, and choose Done. Before shows a generic empty result; after explains that Done has no open tickets and offers Include resolved tickets / Clear lane filter.
5. Choose Include resolved tickets. Done stays selected; its two unarchived tickets reappear. Reload and verify that the filter selection persists.
6. Repeat in Japanese and English. Compare the full API ticket response before/after all interactions: no stored ticket changes.

## Before / after images

| State | Japanese | English |
| --- | --- | --- |
| Expanded | [Before](before-ja-expanded.png) / [After](after-ja-expanded.png) | [Before](before-en-expanded.png) / [After](after-en-expanded.png) |
| Archive included | [Before](before-ja-archived.png) / [After](after-ja-archived.png) | [Before](before-en-archived.png) / [After](after-en-archived.png) |
| Done + Open | [Before](before-ja-conflict.png) / [After](after-ja-conflict.png) | [Before](before-en-conflict.png) / [After](after-en-conflict.png) |
| Include resolved recovery | [After](after-ja-recovered.png) | [After](after-en-recovered.png) |

## Behavior and compatibility

- Kanban and List share these controls and saved filters. Group's archive display remains independent.
- Completion and archive conditions use AND: selecting Open with archives included shows archived open tickets, not archived resolved tickets.
- Existing open/resolved selections are retained. Legacy archived selection migrates to includeArchived. Archived-only migrates to both completion states with archives included; the UI no longer has archived-only mode. The migration guide documents the changed result set.
- Conflict recovery changes only the selected completion state or lane; query, priority, tag and archive preference remain intact.
- API schemas and ticket data are unchanged. This migration concerns browser preferences only.

## Review and verification

- Independent code and image review found a remaining old archive-state reference and a checkbox width collision with Reset filters. Both were fixed.
- The independent reviewer checked eight Japanese/English after images against the before images, then reviewed the final shared-toolbar height adjustment in code. No required findings remain. The primary agent recaptured and inspected the final images after that adjustment.
- Public TypeScript, documentation build and git diff checks passed.
- before-interactions-data.json and after-interactions-data.json are byte-identical. The after-locale preference snapshots show the retained Done lane and both completion states after reload.
- Captures use real UI interactions via Playwright Chromium. Earlier agent-browser captures were replaced with the complete repeated sequence after CSS fixes; some CLI waits targeted a nonexistent row selector and were cancelled.
- Screenshots are unaltered and do not by themselves prove persistence. API comparisons and regression tests complement them.
- No human usability trial, physical touch session, screen-reader speech audit or Safari/Firefox test was performed. Desktop/light screenshots were visually reviewed; narrow/dark checks are reported separately with test results.

## Local image hosting

    python3 -m http.server 3503 --bind 127.0.0.1 --directory docs/development/evidence/2026-11-21-list-filter-split

Ticket image embeds require this server. These original files remain available independently of the local host.

## Final verification

- Shared toolbar height is retained across Kanban / List / Group at 1440, 1280 and 980 pixels, including sidebar collapse/reopen. The search input stays aligned with the top row. At 980 pixels the collapsed controls use two rows rather than squeezing the new archive label.
- Full E2E run: 109 passed, 8 failed. Follow-up layout/feature run: 24 passed, 5 failed. These runs exposed layout differences, outdated layout expectations and browser interaction/timeout issues; they are not reported as clean full-suite runs.
- Final targeted recheck: 7 passed, 2 failed because the new test used the hidden collapse button to reopen the sidebar. After correcting the selector to the existing reopen button, both Japanese/English height tests passed (2/2). The seven passing checks cover both locales' filter combinations and conflict recovery, compact Reset, ticket CRUD and unsaved edits.
- Other affected filters, archive-editor behavior, preference migration, Group independence and dark/narrow geometry passed in focused checks. Public TypeScript, documentation build and diff whitespace checks passed after final production edits.
- Supplementary dark images: [390px Japanese](after-narrow-dark.png), [980px English](after-medium-dark.png). These use the regression fixture with four tickets, so they supplement rather than replace the matching before/after fixture.
- Seven before/after image embeds were loaded from the actual #1494 ticket page; dimensions and load results are recorded in ticket-image-loads.json. The local image server must remain running to display them there.
- Decision: accept for human review. No product/API data migration is needed; browser preference migration and its semantics are documented. No release or production runtime replacement is included.

## CI follow-up before merge

The first GitHub run passed 118/119 E2E cases. English at 390px failed the reachability assertion: focusing the checkbox had scrolled its input independently of the surrounding label. Trace geometry was identical before/after (the label stayed 209.21875px wide), so this was not a layout resize. The test now scrolls the whole label into view again before checking reachability, without changing production code or relaxing bounds/geometry assertions.
