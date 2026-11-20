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
- Body: `{ "laneName": "In progress" }`
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

- `POST /api/boards/:boardId/tickets/bulk-complete` (legacy)
  - Completion assertions only: `{ "ticketIds": [1, 2], "isResolved": true }`. Returns 409 if any ticket's lane disagrees; use bulk-transition to change state.
- `POST /api/boards/:boardId/tickets/bulk-transition`
  - Body: `{ "ticketIds": [1, 2], "laneName": "Done" }`
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

## Lane Completion

Lane responses include `isCompletionLane`. POST a lane with `{ "name": "Accepted", "isCompletionLane": true }`, or PATCH `/api/lanes/:laneId` with `{ "isCompletionLane": true }`. PATCH changes completion for every ticket in the lane, including archived tickets, and keeps archive flags unchanged.

Ticket `isResolved` and legacy `isCompleted` responses reflect the lane. Optional request flags must agree with each other and with the destination lane; mismatches return 409 atomically. Omit these flags on new requests. Use `laneId` or `transition` / `bulk-transition` to resolve or reopen tickets. Custom lane names default to normal lanes; do not infer completion from names. Standard boards include a normal Acceptance lane for human acceptance.

For a reviewed board-wide selection, use `PUT /api/boards/:boardId/completion-lanes`. `laneIds` replaces the entire selection; an empty array clears all completion lanes. `expectedLanes` must contain every current lane, including zero-ticket lanes, with its current completion attribute and ticket count including archived tickets. Read `GET /api/boards/:boardId/lanes` and `GET /api/boards/:boardId/tickets?archived=all` without other filters to compute these expectations.

Example only: board 4 has exactly lanes 9–12 as shown below. Switching completion from lane 11 to lane 12 reopens the two tickets in lane 11; lane 12 is empty. Resolve the real IDs, attributes and counts before sending a request.

```bash
python3 ~/.codex/skills/kanbalone-api/scripts/kanbalone_api.py --base "$BASE" PUT /api/boards/4/completion-lanes '{
  "laneIds": [12],
  "expectedLanes": [
    {"id":9,"isCompletionLane":false,"ticketCount":3},
    {"id":10,"isCompletionLane":false,"ticketCount":1},
    {"id":11,"isCompletionLane":true,"ticketCount":2},
    {"id":12,"isCompletionLane":false,"ticketCount":0}
  ]
}'
```

The response is `{ lanes }`. The full selection and ticket state updates are atomic. Invalid/duplicate selection IDs return 400; a missing board returns 404. If the lane set, completion attributes, or any lane's ticket count differ from `expectedLanes`, the API returns 409 without changes. Fetch current data and review the effect again before retrying. Individual lane PATCH requests do not provide this expectation guard. Removing completion reopens all tickets in that lane, including archived tickets, without changing their archive flags.

## Groups

Group support requires a Group-capable build; the original v0.10.0 release does not expose these routes.

- `GET /api/boards/:boardId/groups` -> `{groups}`. Query `status=active|inactive|all` (default active), `sort=createdAt|name` (default createdAt), `order=asc|desc` (default asc).
- `POST /api/boards/:boardId/groups` with `{name,descriptionMarkdown?}` -> Group. Names are board-local and unique, including inactive Groups.
- `GET /api/groups/:groupId` -> Group detail, including `revision`, counts, `descriptionMarkdown`, sanitized `descriptionHtml`; returns an `ETag`.
- `PATCH /api/groups/:groupId` with `{name?,descriptionMarkdown?,expectedRevision}`. Omitted fields remain unchanged; an empty description clears it.
- `DELETE /api/groups/:groupId` with `If-Match` set to the GET `ETag`. Only zero-member Groups can be deleted; archived members count. Use `curl -H 'If-Match: "REVISION"'` because the helper has no custom-header option.
- `GET /api/boards/:boardId/tickets?groupId=7&archived=all` reads all members. `ungrouped=true` finds ungrouped tickets; it cannot be combined with `groupId`.
- `POST /api/boards/:boardId/group-memberships/preview` with `{ticketIds:[101],groupId:7}` previews addition; use `groupId:null` for removal. The response identifies all affected parent/child tickets and supplies `expectedToken`.
- `PUT /api/boards/:boardId/group-memberships` with the same body plus `expectedToken` applies atomically. Different non-null Group membership is rejected; remove then add instead. Existing membership in the same Group is a no-op.
- `POST /api/boards/:boardId/tickets` also accepts `groupId`. With a parent, Group rules apply to the connected set. `POST /api/boards/:boardId/tickets/preview` previews this creation without inserting a ticket.
- `POST /api/tickets/:ticketId/change-preview` accepts the intended PATCH body. Use its result when adding or changing parent/child relations.

For atomic child editing, fetch ticket detail and retain `.editToken`. PATCH with `childTicketIds` as the complete desired set, `expectedEditToken` from that original read, and `expectedSelectedParents:[{ticketId,parentTicketId}]` for every newly added child, using the parent value observed when the child was selected. Include the body/title edits in this same request. Preview the exact body first. Do not refresh the original token immediately before saving an old child set.

If `requiresResolution` is true, the preview contains `candidates` with Group IDs and the tickets whose membership would change. Ask which candidate to keep unless the user's instruction already determines it. Apply the unchanged request plus `expectedToken` and `groupResolution:{groupId}`. A third unrelated Group is not a valid resolution. Three or more Group candidates are possible when adding multiple children.

With only one non-null Group, ungrouped parent/child tickets join it automatically. Detaching children preserves their membership. In a conflict, no partial body or relation edits are saved. A stale-context/edit/revision error must be reconciled, not bypassed through individual updates.

Group-aware errors use `{error,code,details?}`. Input errors return 400, missing resources 404, conflicts 409, and missing required preconditions 428. After a failure, do not infer that a requested change partially succeeded.

Exports use `formatVersion:2`, `groups`, and ticket `groupId`, including empty/inactive Groups and archived tickets. Import remaps IDs into a new board and rejects inconsistent Group references or parent/child membership. Legacy exports without version and without Group fields import as ungrouped. Do not import format-2 exports into an older release as a rollback method.

Creation previews use `id: 0, clientRef: "new"` for the proposed ticket, including references in parent changes and candidate changed IDs. Never send 0 as an existing ticket ID. Membership apply returns `{changedTickets,affectedGroups}`. Read Group history with `GET /api/boards/:boardId/group-activity?groupId=7`; history remains after deletion. `POST /api/markdown/preview` with `{bodyMarkdown}` returns sanitized `{bodyHtml}` without writing. Schema validation failures can omit `code`: missing Group PATCH `expectedRevision` returns 400, whereas missing runtime tokens or DELETE `If-Match` return 428.

Machine-readable conflict codes: `GROUP_CONFLICT` requires choosing a preview candidate; `GROUP_ALREADY_ASSIGNED` requires remove then add; `GROUP_NOT_EMPTY` forbids deletion; `GROUP_NAME_EXISTS` requires a distinct name. `STALE_GROUP`, `STALE_GROUP_CONTEXT`, `STALE_TICKET_EDIT`, and `STALE_RELATIONS` require re-reading and reviewing changed state. `PRECONDITION_REQUIRED` identifies a missing runtime precondition. Invalid Group, ticket, or relation inputs return 400 (including `GROUP_WRITE_ENDPOINT` when membership is sent through ticket PATCH).
