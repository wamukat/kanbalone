# Independent code review for Group UI tickets 1520–1523

Reviewed the candidate against main `5ff44622f74c2116147d60c11be7f86fbc2208d2` on 2026-11-22. The candidate runtime manifest SHA-256 is `9e63449186213af639b135beaed786f6bc56d428c042c73df06905934b3743d7`.

## Findings and their disposition

- **1520.** The existing aggregate counts assigned members, including archived tickets. The new `resolvedTicketCount` sums actual resolution flags over that same set. Inactive can mean all members are archived while some remain unresolved. The check therefore requires a positive total and equality of resolved and total counts. An empty Group stays active with an empty track. The retained open count excludes archived tickets. The progress description is available in the choice’s accessible name. The database schema and write requests remain compatible. Both Group list and detail responses gain a nonnegative integer. The serializer, TypeScript type, OpenAPI and technical description agree.
- **1521.** Parent and child rows each render their own tag list with the shared badge renderer. The collection comparison now checks tag array length and each tag’s ID, name and color in order. Assignment, removal, rename, color and ordering changes invalidate the ticket rows. Details, hierarchy, lane and remove controls remain separate from the badges.
- **1522.** Styles target links in the Group description body and edit preview. The accent follows the active theme. Underlining, keyboard focus and the original sanitized destination are preserved. The long collapsed summary still renders plain text.
- **1523.** The virtual choice follows real Groups in both filters when the count of unassigned tickets, including archives, is positive. The list uses a one-row probe with `page.total`, then collects the unassigned rows only when selected. The default remains the first visible real Group when available. A selected virtual list supports the existing row hierarchy and archive toggle. Its title and actions expose ordinary creation and omit Group membership and editing controls. The creation button and N shortcut pass an empty Group context. The Group endpoint returns real Group IDs only. The membership and Group creation paths require a real target where applicable.
- **Review fixes.** The N shortcut now reads a real Group’s name without adjoining completion text. When the last virtual member disappears, the application moves focus from the vanished choice or its focused content to the next selected Group or the Group creation control. A late Add-existing-ticket response checks the initiating board and selected real Group before revealing the form. English singleton ticket counts and the spoken progress label were corrected. The pre-existing test for deleting the last real Group now checks the formerly assigned family in the virtual list. Retained unit fixtures received only the additional required fields.

## Independent late-response check

The probe started the candidate with a temporary SQLite database, two boards, one real Group and one unassigned ticket per board. Chromium selected No Group on board A. The probe held a completed A response at the browser fetch boundary, switched boards using the sidebar, and selected No Group on B. After B’s ticket appeared, it released the old response. It checked the destination again after two animation frames. Each case used a fresh browser page.

| Held A request | Released response | Visible result after release |
| --- | --- | --- |
| Unassigned existence probe, limit 1 | Actual HTTP 200 | Board B, its selected No Group choice and ticket 2 |
| Selected unassigned collection, limit 200 | Actual HTTP 200 | Board B, its selected No Group choice and ticket 2 |
| Selected unassigned collection, limit 200 | Synthetic HTTP 503 at the fetch boundary | Board B, its selected No Group choice and ticket 2 |

One held response was released in each case. Board A’s ticket 1 stayed absent, the Group alert remained empty, and no browser page errors were recorded. The script uses the standard application server for actual reads. The artificial delay and the 503 apply only to the specified old-board response. The check covers these three orderings in Chromium. It does not measure latency or establish behavior in other browsers.

Run `node --import tsx path/to/review-stale-board.mjs` from the candidate checkout, with the repository dependencies installed and the evidence `fixture.mjs` alongside the script. The run record includes Node and Chromium versions. [Reproduction script](./review-stale-board.mjs) · [Independent run record](./review-stale-board.json)

The reviewer inspected the implementation, test changes and the representative screens. The author’s E2E tests and the capture matrix are separate verification records. The independent review found no remaining blocker in the reviewed diff.
