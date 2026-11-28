# Kanbalone API Reference

Use these endpoints with a base URL such as `http://127.0.0.1:3000`.

When a user gives a page URL such as `http://127.0.0.1:3000/boards/4`, use `http://127.0.0.1:3000` as the API origin and `4` as the board ID.

## Operation updater

Use the optional top-level JSON `updater` field on operations that write ticket or Group activity. This includes ticket creation, edits, transitions, moves, archival changes, deletion and bulk changes. A position change records activity when it moves a ticket to a different lane. The field also applies to comment creation, edits, push and deletion, tag reason changes, external reference changes, board and remote issue imports, remote issue refresh, and Group creation, edit, deletion and membership changes.

On operations that accept an empty body, supply `{ "updater": "Reviewer" }` as an optional JSON body, including on relevant DELETE requests. Keep the `If-Match` revision header when deleting a Group.

Omission records `API`. Supply valid Unicode with 1–80 characters, at least one non-whitespace character, and no control characters. A supplied `null` or invalid value returns 400. Valid values are preserved exactly. This self-reported name is display metadata.

Ticket and Group activity return an `updater` on each entry. Comments return the creation updater. Comment edits are independently attributed in ticket activity. `null` means unrecorded. Portable board JSON preserves comment creation updater values and timestamps, while newly generated import activity uses the top-level operation updater.

## Ticket Tasks

- `GET /api/tickets/:ticketId/tasks` returns `{tasks, taskCount, doneTaskCount}` in ascending Task number. Filter by a literal Markdown substring with `q` and by completion with `done=true` or `done=false`. The counts cover the whole ticket. ASCII letter case is ignored and other characters match literally.
- `POST /api/tickets/:ticketId/tasks` accepts `{bodyMarkdown, done?, updater?}` and returns the new Task. Use nonblank Markdown of up to 100,000 valid Unicode characters. Omitted `done` starts false. Task numbers are assigned within the ticket and retained in numbering history after deletion.
- `GET /api/tickets/:ticketId/tasks/:taskNumber` returns `{number, bodyMarkdown, bodyHtml, done, revision}`.
- `PATCH /api/tickets/:ticketId/tasks/:taskNumber` accepts `{expectedRevision, bodyMarkdown?, done?, updater?}`. `DELETE` accepts `{expectedRevision, updater?}` and returns 204. Use the reviewed revision. Omission returns 428 and a conflict returns 409 `STALE_TASK`. Re-read and reconcile before retrying.

Task completion is independent of the ticket's lane. Activity records the number, the change and the updater. Body edits and deletions retain the corresponding Markdown. Ticket detail and summaries include `taskCount` and `doneTaskCount`.

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
- Each summary includes read-only `unresolvedBlockerCount`. It counts unresolved blockers, including archived blockers, independently of list filters. Do not send it in create/update requests.
- Query params:
  - `lane_id=<id>`
  - `tag=<name>`
  - `resolved=true|false`
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
  - Partial body. Supported fields: `laneId`, `parentTicketId`, `title`, `bodyMarkdown`, `isArchived`, `priority`, `tagIds`, `blockerIds`.
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
- For several tickets in one lane, use `POST /api/lanes/:laneId/tickets/reorder`. The old board-wide reorder endpoint has been removed (404).

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

- `POST /api/boards/:boardId/tickets/bulk-transition`
  - Body: `{ "ticketIds": [1, 2], "laneName": "Done" }`
- `POST /api/boards/:boardId/tickets/bulk-archive`
  - Body: `{ "ticketIds": [1, 2], "isArchived": true }`

## Paged ticket lists

Pagination is available starting with v1.1.0-rc.1. Existing requests without `limit` and `cursor` still return the full list in the existing order and response shape. Use documentation matching your running release.

Use `limit=1..200` and repeat the returned `page.nextCursor` to get the next page. Keep the same board, filters and `order`; only `limit` may change. `page.total` is the number of all matching tickets; `nextCursor: null` marks the end. There is no page number or `hasMore` field.

```bash
# First five tickets in the same order as a completion lane.
curl -fsS --get http://127.0.0.1:3000/api/boards/3/tickets \
  --data-urlencode 'lane_id=11' --data-urlencode 'order=completed_desc' \
  --data-urlencode 'limit=5'

# Copy page.nextCursor from that response. Keep all original filters/order.
CURSOR='paste-the-returned-nextCursor-here'
curl -fsS --get http://127.0.0.1:3000/api/boards/3/tickets \
  --data-urlencode 'lane_id=11' --data-urlencode 'order=completed_desc' \
  --data-urlencode 'limit=50' --data-urlencode "cursor=$CURSOR"
```

`order` accepts `id_asc` (paged default), `position_asc` (legacy lane/archive/position/ID order), and `completed_desc` (completion time descending, position ascending, ID descending; unknown completion times last). Explicit `order` also works without pagination. `priority=1,3` matches low OR high priority; filtering happens before page boundaries and total counting.

Malformed cursors, changed query conditions, invalid arguments or cursor without limit return 400. A change to the board's ticket-list data expires its cursor and returns 409. Changes to referenced tickets on other boards may also expire it. Discard partial results and restart without cursor, with a bounded retry policy. The API does not retain a historical snapshot. A parent and child may be on different pages; an unfetched relation is not an absent relation.

Paged responses include `X-Kanbalone-Ticket-Revision`. If combining independent filtered collections on the same board, compare revisions and restart all collections when they differ. Keep cursors opaque.

For automation that modifies tickets, finish collecting the list before writing, or track already-processed IDs and make retries safe. Do not combine rows from before and after a 409, and do not blindly repeat writes.

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

Use `PUT /api/tickets/:ticketId/external-references/:kind` with `resourceType: "pull_request"` for a PR or `resourceType: "merge_request"` for an MR, along with `provider`, `instanceUrl`, `projectKey`, `issueKey`, `displayRef`, and `url`. The same ticket/kind is replaced on PUT; use distinct kinds such as `pr-main` / `mr-followup` for multiple references. Read them through the ticket's `externalReferences`. For GitHub pull requests and GitLab merge requests, call `POST /api/tickets/:ticketId/external-references/:kind/refresh` to let Kanbalone fetch status with its configured provider credentials. No state value is supplied by the caller and no periodic fetch runs. `changeRequestStatus` returns `state` (`open`, `closed`, `merged`, or null), `isDraft`, `fetchedAt`, `attemptedAt`, and a sanitized `error`. A null snapshot means no attempt since the link was set. A failed attempt returns 502 and retains the last successful state; GET the ticket to inspect it. A superseded refresh or changed reference returns 409. PUT resets that reference’s cached status, including when replacing it with the same URL. These references never become tracked Issue imports.

## Lane Completion

Lane responses include `isCompletionLane`. POST a lane with `{ "name": "Accepted", "isCompletionLane": true }`, or PATCH `/api/lanes/:laneId` with `{ "isCompletionLane": true }`. PATCH changes completion for every ticket in the lane, including archived tickets, and keeps archive flags unchanged.

Read-only ticket `isResolved` reflects the lane. Ticket writes reject `isResolved` and `isCompleted` with 400 without changes. Omit both flags. The `isCompleted` response alias, `completed` query alias, and `bulk-complete` endpoint have been removed; use `resolved` for filtering. Removed query aliases return 400; removed endpoints return 404. Use `laneId` or `transition` / `bulk-transition` to resolve or reopen tickets. Custom lane names default to normal lanes; do not infer completion from names. Standard boards include a normal Acceptance lane for human acceptance.

- Read-only `resolvedAt` records arrival in the current completion lane. Moving to another completion lane updates it; reopening clears it to `null`. Ordinary edits and same-lane reordering preserve it. It is also `null` when the historical completion time is unknown. Omit it from ticket create/update inputs. Kanban sorts completion lanes by this time descending, with existing position as the fallback for unknown times; the API `position` contract is unchanged.

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

Group support is available starting with v0.11.0; v0.10.0 does not expose these routes.

- `GET /api/boards/:boardId/groups` -> `{groups}`. Query `status=active|inactive|all` (default active), `sort=createdAt|name` (default createdAt), `order=asc|desc` (default asc).
- `POST /api/boards/:boardId/groups` with `{name,descriptionMarkdown?}` -> Group. Names are board-local and unique, including inactive Groups.
- `GET /api/groups/:groupId` -> Group detail, including `revision`, counts, `descriptionMarkdown`, sanitized `descriptionHtml`; returns an `ETag`.
- `PATCH /api/groups/:groupId` with `{name?,descriptionMarkdown?,expectedRevision}`. Omitted fields remain unchanged; an empty description clears it.
- `DELETE /api/groups/:groupId` with `If-Match` set to the GET `ETag`. Only zero-member Groups can be deleted, and archived members count.
- `GET /api/boards/:boardId/tickets?groupId=7&archived=all` reads all members. `ungrouped=true` finds ungrouped tickets; it cannot be combined with `groupId`.
- `POST /api/boards/:boardId/group-memberships/preview` with `{ticketIds:[101],groupId:7}` previews addition; use `groupId:null` for removal. The response identifies all affected parent/child tickets and supplies `expectedToken`.
- `PUT /api/boards/:boardId/group-memberships` with the same body plus `expectedToken` applies atomically. Different non-null Group membership is rejected; remove then add instead. Existing membership in the same Group is a no-op.
- `POST /api/boards/:boardId/tickets` also accepts `groupId`. With a parent, Group rules apply to the connected set. `POST /api/boards/:boardId/tickets/preview` previews this creation without inserting a ticket.
- `POST /api/tickets/:ticketId/change-preview` accepts the intended PATCH body. Use its result when adding or changing parent/child relations.

For an intended deletion of an empty Group, keep its reviewed `revision` as `REVISION`. Send it in double quotes to match the GET `ETag`.

```bash
python3 ~/.codex/skills/kanbalone-api/scripts/kanbalone_api.py --base "$BASE" \
  DELETE "/api/groups/$GROUP_ID" --header "If-Match: \"$REVISION\""
```

If deletion returns 409, re-read the Group and review its state before retrying.

For atomic child editing, fetch ticket detail and retain `.editToken`. PATCH with `childTicketIds` as the complete desired set, `expectedEditToken` from that original read, and `expectedSelectedParents:[{ticketId,parentTicketId}]` for every newly added child, using the parent value observed when the child was selected. Include the body/title edits in this same request. Preview the exact body first. Do not refresh the original token immediately before saving an old child set.

If `requiresResolution` is true, the preview contains `candidates` with Group IDs and the tickets whose membership would change. Ask which candidate to keep unless the user's instruction already determines it. Apply the unchanged request plus `expectedToken` and `groupResolution:{groupId}`. A third unrelated Group is not a valid resolution. Three or more Group candidates are possible when adding multiple children.

With only one non-null Group, ungrouped parent/child tickets join it automatically. Detaching children preserves their membership. In a conflict, no partial body or relation edits are saved. A stale-context/edit/revision error must be reconciled, not bypassed through individual updates.

Group-aware errors use `{error,code,details?}`. Input errors return 400, missing resources 404, conflicts 409, and missing required preconditions 428. After a failure, do not infer that a requested change partially succeeded.

Board exports include `groups` and ticket `groupId`, including empty/inactive Groups and archived tickets. Exports without Task data use format 2, or format 3 when they include referenced local images. A board with any allocated Task numbers uses `formatVersion:4`. Format 4 carries active Tasks, the highest number per ticket and referenced images, including images from Task Markdown. Import into a version that supports the export format. Import remaps IDs into a new board and rejects inconsistent Group references or parent/child membership. Legacy exports without version and without Group fields import as ungrouped. Use a full database and image backup for operation history and restore a pre-upgrade backup with the original release for rollback.

Creation previews use `id: 0, clientRef: "new"` for the proposed ticket, including references in parent changes and candidate changed IDs. Never send 0 as an existing ticket ID. Membership apply returns `{changedTickets,affectedGroups}`. Read Group history with `GET /api/boards/:boardId/group-activity?groupId=7`; history remains after deletion. `POST /api/markdown/preview` with `{bodyMarkdown}` returns sanitized `{bodyHtml}` without writing. Schema validation failures can omit `code`: missing Group PATCH `expectedRevision` returns 400, whereas missing runtime tokens or DELETE `If-Match` return 428.

Machine-readable conflict codes: `GROUP_CONFLICT` requires choosing a preview candidate; `GROUP_ALREADY_ASSIGNED` requires remove then add; `GROUP_NOT_EMPTY` forbids deletion; `GROUP_NAME_EXISTS` requires a distinct name. `STALE_GROUP`, `STALE_GROUP_CONTEXT`, `STALE_TICKET_EDIT`, and `STALE_RELATIONS` require re-reading and reviewing changed state. `PRECONDITION_REQUIRED` identifies a missing runtime precondition. Invalid Group, ticket, or relation inputs return 400 (including `GROUP_WRITE_ENDPOINT` when membership is sent through ticket PATCH).

## Saved cross-board views

This API is available starting in v1.4.0. Discover board and tag IDs with `GET /api/custom-views/catalog`. The examples use synthetic IDs.

Create a definition with `POST /api/custom-views`:

```json
{
  "name": "Review queue",
  "scope": "selected",
  "boardIds": [1, 2],
  "rules": [
    {"boardId": 1, "mode": "tags", "tagIds": [3, 4]},
    {"boardId": 2, "mode": "all", "tagIds": []}
  ],
  "completion": "open",
  "showBody": true,
  "showLatestComment": true
}
```

`GET /api/custom-views` returns `{views:[{id,name,version}]}`; `GET /api/custom-views/:id` returns the full definition with its `id` and `version`. Replace it using `PUT /api/custom-views/:id` with the full definition and `expectedVersion`. Delete only the definition with `DELETE /api/custom-views/:id?expectedVersion=N`. A stale version returns 409: reload the saved definition, retain the local draft, and resolve the conflict instead of blindly retrying a write.

`scope: "all"` considers every current board and future additions. Each board still needs its own rule. Missing rules are unset (zero matches), `mode: "tags"` with an empty `tagIds` array also matches nothing, and only explicit `mode: "all"` disables tag filtering. Tags are OR within their own board. Deleted references are reported in `warnings` and never broaden a query. Same-name new boards or tags have different IDs. `completion` is `open`, `done` or `all`; archived tickets are excluded.

Read without saving by posting `{definition, limit: 50}` to `POST /api/custom-views/query`. The result contains `total`, `boardCounts`, `warnings`, `tickets`, `nextCursor` and `revision`. Counts cover all matching tickets, not only the current page. Default limit is 50 and maximum is 100. Follow `nextCursor` with the same definition; discard accumulated pages and restart on a stale-cursor 409. A malformed cursor or a cursor for different conditions returns 400. Never treat one page as a complete set for a bulk operation.

By default, rows follow board order, lane order and ticket position, with IDs breaking ties. Body and latest-comment excerpts are returned only when enabled, bounded to 360 Unicode code points. The latest comment is the newest by creation time, then ID. It has a timestamp but no author field. Use `GET /api/custom-views/tickets/:ticketId/text?field=body`, or `field=comment&commentId=N`, to expand exact original Markdown. A comment ID must belong to the ticket.

`GET /api/custom-views/events` emits invalidation events (`views_updated` or `board_updated`); it is not a durable event log. Re-query on reconnect and after returning from ticket details. Changing or deleting a view never changes its matching tickets. Full DB backups retain view definitions; single-board JSON exports do not transfer them.

### Lane filters and ordering (v1.5.0)

The catalog also returns each board's `lanes` in lane order. Each rule accepts `laneMode: "all" | "selected"` and `laneIds`. Use `all` with `[]` for unrestricted lanes, or `selected` with IDs from that board. Selected lanes match with OR, together with the tag and completion predicates using AND. An empty selected set matches nothing. Deleted lane references produce `missing_lane` warnings; IDs are not rebound by name. Creating or updating a saved view rejects a lane belonging to another board. An unsaved query reports it as a missing lane in that board; only valid selected lanes can match.

The definition accepts `sort: "position_asc" | "content_activity_desc" | "priority_desc"`. Board order is unchanged. Within each board, the latter two sort by recorded body/comment activity or priority descending, then use existing lane/ticket order for ties. Sorting precedes pagination. Reset the cursor when changing the definition.

For example, a rule can be `{"boardId":1,"mode":"all","tagIds":[],"laneMode":"selected","laneIds":[11,12]}`, with `"sort":"priority_desc"` on the definition. These are synthetic IDs; discover your own with the catalog.

Old definitions and create/query requests without these fields default to all lanes and `position_asc`. On update, omitting `sort` retains its saved value; omitting both lane fields retains the saved lane condition for the same board. To remove a restriction, explicitly send `laneMode: "all", laneIds: []`. Send both lane fields together.

Content activity advances for an actual body change or comment post/content edit, not title, tag, lane or priority changes or comment deletion. It is independent of excerpt visibility and of which comment is displayed as the latest. Historical body-edit times are unknown; migration uses recorded creation/comment times rather than the upgrade time or general ticket update time. Full DB backup restores the history; board JSON import creates new tickets/comments and starts their activity at import time.

### Additive MR/PR URL linking

For additive URL linking use `POST /api/tickets/:ticketId/change-request-links` with `{ "url": "https://github.com/owner/repo/pull/42" }`. The server generates a kind, rejects normalized duplicates with 409, and makes no external request. To unlink, send `DELETE /api/tickets/:ticketId/change-request-links/:referenceId` with `{ "expectedRevision": 0 }`, using the reference revision from your latest GET. Changed, deleted or re-added references return 409; the external MR/PR is unchanged. Legacy kind-based PUT/DELETE remain compatible; every PUT increments revision, including identical replacements.
