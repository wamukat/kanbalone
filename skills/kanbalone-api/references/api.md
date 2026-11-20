# Kanbalone API Reference

Use these endpoints with a base URL such as `http://127.0.0.1:3000`.

When a user gives a page URL such as `http://127.0.0.1:3000/boards/4`, use `http://127.0.0.1:3000` as the API origin and `4` as the board ID.

## System

- `GET /api/health` -> `{ "ok": true }`
- `GET /api/meta` -> `{ "name": "Kanbalone", "version": "X.Y.Z" }`

## Boards

- `GET /api/boards` -> `{ boards }`
- `POST /api/boards`
  - Body: `{ "name": "Board name", "laneNames": ["To do", "In progress", "Done"] }`
- `GET /api/boards/:boardId` -> `{ board, lanes, tags }`
- `PATCH /api/boards/:boardId`
  - Body: `{ "name": "New name" }`
- `DELETE /api/boards/:boardId`
- `POST /api/boards/reorder`
  - Body: `{ "boardIds": [1, 2, 3] }`
- `GET /api/boards/:boardId/export`
- `POST /api/boards/import`
  - Body: a board export payload.
  - Creates a new board; does not merge into an existing board.

## Lanes

- `GET /api/boards/:boardId/lanes`
- `POST /api/boards/:boardId/lanes`
  - Body: `{ "name": "Review" }`
- `PATCH /api/lanes/:laneId`
  - Body: `{ "name": "In review" }`
- `DELETE /api/lanes/:laneId`
- `POST /api/boards/:boardId/lanes/reorder`
  - Body: `{ "laneIds": [10, 11, 12] }`

## Tags

- `GET /api/boards/:boardId/tags`
- `POST /api/boards/:boardId/tags`
  - Body: `{ "name": "bug", "color": "#d73a49" }`
- `PATCH /api/tags/:tagId`
  - Body: `{ "name": "bug", "color": "#d73a49" }`
- `DELETE /api/tags/:tagId`

## Tickets

Priority values:

- `1` low
- `2` medium
- `3` high
- `4` urgent

For smoke tests or demonstrations, create a disposable test ticket and mutate that ticket. Do not change an arbitrary existing ticket unless the user named it or clearly asked for existing-ticket mutation.

List:

- `GET /api/boards/:boardId/tickets`
- Query params:
  - `lane_id=<id>`
  - `tag=<name>`
  - `resolved=true|false`
  - `completed=true|false` alias of resolved
  - `archived=true|false|all`
  - `q=<search text>`
    - Searches title, body Markdown, local refs such as `#10`, tracked remote refs, and external references.
    - Provider shorthand such as `gh#123`, `github#123`, `gl#123`, `gitlab#123`, `rm#123`, and `redmine#123` matches tracked remote links and external references for that provider.
    - `ext#123` / `external#123` searches external references only. `remote#123` searches tracked remote links only.

Create:

- `POST /api/boards/:boardId/tickets`
- Required: `laneId`, `title`
- Body:

```json
{
  "laneId": 10,
  "title": "Add webhook settings",
  "bodyMarkdown": "Acceptance criteria...",
  "priority": 2,
  "tagIds": [1, 2],
  "blockerIds": [],
  "parentTicketId": null,
  "isResolved": false,
  "isArchived": false
}
```

Read/update/delete:

- `GET /api/tickets/:ticketId`
- `PATCH /api/tickets/:ticketId`
  - Partial body. Supported fields: `laneId`, `parentTicketId`, `title`, `bodyMarkdown`, `isResolved`, `isCompleted`, `isArchived`, `priority`, `tagIds`, `blockerIds`.
- `DELETE /api/tickets/:ticketId`

Transition by lane name:

- `PATCH /api/tickets/:ticketId/transition`
- Body: `{ "laneName": "In progress", "isResolved": false }`
- Use this when moving within the same board and lane names are stable.

Reorder within a lane or move to a position on the same board:

- `PATCH /api/tickets/:ticketId/position`
- Required: `laneId`. Use the current lane ID for an in-lane reorder, or another lane on the same board to move lanes.
- Move ticket 4 to the start of lane 9: `PATCH /api/tickets/4/position` with `{ "laneId": 9, "position": 0 }`.
- Insert before ticket 5: `{ "laneId": 9, "beforeTicketId": 5 }`; insert after it: `{ "laneId": 9, "afterTicketId": 5 }`.
- `position` is zero-based. Anchors must belong to the target lane and must not be the moving ticket itself. Precedence is `beforeTicketId`, then `afterTicketId`, then `position`.
- Prefer anchors when filters hide some tickets; a filtered view's index is not the lane's full position.
- Returns the updated ticket. The server reindexes affected lanes; no full-board ticket list is required. Verify order via the `position` fields from `GET /api/boards/:boardId/tickets?lane_id=9`.
- The legacy `POST /api/boards/:boardId/tickets/reorder` requires every non-archived board ticket in `items`. Prefer `/position` for single-ticket reordering.

Move between boards:

- `POST /api/tickets/:ticketId/move`
- Body: `{ "boardId": 4, "laneId": 20 }`
- Preserves core ticket content and comments. Cross-board move keeps same-name tags only and clears parent/child/blocker relations.

External references:

- `PUT /api/tickets/:ticketId/external-references/:kind`
- Body:

```json
{
  "provider": "github",
  "instanceUrl": "https://github.com",
  "resourceType": "issue",
  "projectKey": "owner/repo",
  "issueKey": "123",
  "displayRef": "owner/repo#123",
  "url": "https://github.com/owner/repo/issues/123",
  "title": "Source requirement"
}
```

- Use external references for provenance that should not become a tracked remote import.
- External references do not violate the one-import-per-remote-issue constraint and do not support refresh/sync/push actions.
- `DELETE /api/tickets/:ticketId/external-references/:kind` removes one reference kind from a ticket.

Bulk:

- `POST /api/boards/:boardId/tickets/bulk-complete`
  - Body: `{ "ticketIds": [1, 2], "isResolved": true }`
- `POST /api/boards/:boardId/tickets/bulk-transition`
  - Body: `{ "ticketIds": [1, 2], "laneName": "Done", "isResolved": true }`
- `POST /api/boards/:boardId/tickets/bulk-archive`
  - Body: `{ "ticketIds": [1, 2], "isArchived": true }`

## Comments And Activity

- `GET /api/tickets/:ticketId/comments`
- `POST /api/tickets/:ticketId/comments`
  - Body: `{ "bodyMarkdown": "Comment text" }`
- `PATCH /api/comments/:commentId`
  - Body: `{ "bodyMarkdown": "Updated text" }`
- `DELETE /api/comments/:commentId`
- `GET /api/tickets/:ticketId/activity`
- `GET /api/tickets/:ticketId/relations`

## API Filtering, Lane Reordering, And Body Appends

### Filter By Lane Name Or Parent

`GET /api/boards/:boardId/tickets?lane=Doing&resolved=false&parent=101` combines an exact lane name with a direct parent filter. `parent=none` selects root tickets. Unknown lane names or unmatched parent IDs return an empty list. `lane` and the existing `lane_id` are mutually exclusive. Multiple lane names and recursive descendants are not supported.

### Read Recent Comments

`GET /api/tickets/:ticketId/comments?limit=2&order=desc` returns the latest two comments. `limit` accepts 1–100; omit it for all comments. `order` accepts `asc` / `desc`, defaulting to the existing newest-first `desc` order. Equal timestamps use comment ID in the same direction as a tie breaker.

### Reorder A Lane In One Request

Send `{ "ticketIds": [103, 101] }` to `POST /api/lanes/:laneId/tickets/reorder` to place those non-archived tickets first. Omitted tickets follow in their original relative order; archived tickets remain last in their relative order. An empty array is a no-op. Other-lane, missing, duplicate, or archived IDs reject the entire operation with 400. A missing lane returns 404. Validation and writes share one transaction; concurrent requests serialize, with the later request applied to the latest order. The response contains non-archived lane ticket summaries.

### Append To A Ticket Body

Send `{ "appendMarkdown": "\n\n- Additional task" }` to `PATCH /api/tickets/:ticketId`. The latest body is read and appended within a transaction. No separator is inserted automatically. Empty text or combining with `bodyMarkdown` returns 400. The resulting body is limited to 64 MiB UTF-8. This is not idempotent: verify the body after an ambiguous failure before retrying. It does not protect against another client replacing the entire body.

### Register MR/PR External References

Use `PUT /api/tickets/:ticketId/external-references/:kind` with `resourceType: "pull_request"` for a PR or `resourceType: "merge_request"` for an MR, along with `provider`, `instanceUrl`, `projectKey`, `issueKey`, `displayRef`, and `url`. The same ticket/kind is replaced on PUT; use distinct kinds such as `pr-main` / `mr-followup` for multiple references. Read them through the ticket's `externalReferences`. Currently this stores and displays links only; open/merged states are not fetched or refreshed automatically.
