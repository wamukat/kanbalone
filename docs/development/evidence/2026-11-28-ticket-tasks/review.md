# Independent Task review

The implementation and evidence passed review on November 28, 2026. The reviewed runtime SHA-256 is `21fb37eba3a2746ce86807c1b1e817247972f396fa369b7f2d12c89869bae54a`. The baseline is `c1162cc49f04210dd83c62af0eb7aa4301340fe2`. The [manifest](manifest.json) records the runtime used for each image.

## Screens

I inspected the 15 original Japanese Chromium captures, checked their 1440 × 900 dimensions, and verified each byte count and SHA-256 against the manifest and capture files. In both themes, the ticket body remains above Tasks and the Comments and Activity tabs follow them. The Markdown image, completion checkboxes, Task numbers and per-row actions are visible. The first ticket shows 1/2 complete below its title in List and next to its tags in Kanban. The two tickets without Tasks show no count. The search and incomplete filter together leave the expected open Task. [Before-and-after images](README.md#original-captures)

The history image shows individual add, update, complete, reopen and delete operations with their updater and time. A separate Chromium test submitted both Markdown and completion changes in a single request and verified the Japanese messages for completing and reopening. The paired detail, List and Kanban images predate that history wording change. The visual comparison covers desktop Chromium at the recorded viewport.

## Data and API

- In an isolated database, eight concurrently submitted creates received numbers 1 through 8. After deleting all eight, the export retained format 4 and the highest allocated number. The baseline rejected that export. The candidate rejected an attempted downgrade to format 2, accepted the original format 4 and assigned number 9 on the next create.
- A separate database-and-attachments backup after deletion preserved the Task's previous and new Markdown, its complete deleted text, updater names and the bytes of its linked PNG. Restoring it preserved the numbering counter. The edit and delete used long text with an identical prefix so the full history check covered changes outside the displayed excerpt.
- The code and tests cover stale revisions, missing preconditions, matching no-op writes, literal search, request-scoped attribution and safe refresh of an open draft. Count changes refresh the board while preserving ticket completion, update time and content-activity sorting.
- I checked the OpenAPI contract, both language guides and the distributed API skill against the implemented routes. The migration guides explain which data travels in portable JSON and how to retain complete activity and attachments in a backup.

## Group view follow-up

I compared the five Group captures with the original files and verified their SHA-256 values. In both themes, the first and third tickets show 1/2 and 0/1 beneath their titles. The middle ticket has no Tasks and shows no count. After completing the remaining Task on the first ticket, its row shows 2/2 and focus returns to the title. The Group header still shows three open tickets. The reviewed runtime SHA-256 is `98e37c3bc5439ff108ed3cbfe4ef57b5489d0394b218fd6e84d11599ce60883a`. [Group captures and stored results](group-counts.md)

I checked the Group API projection, shared row renderer, per-ticket count comparisons on refresh and the virtual row height cache. An independent two-page API check confirmed that creating a Task invalidates a previously issued cursor, a matching no-op update preserves it, and deleting the last Task returns zero counts for the ticket. The neighboring ticket retained its place and counts throughout.
