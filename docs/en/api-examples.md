# API Examples

Kanbalone v1.0.0 removed deprecated completion API fields and endpoints. For a released instance, use the documentation and skill from its release tag. See the [migration table](./migration-guide.md#deprecated-api-removal).

Completion is determined by `isCompletionLane`, not the lane name. The examples below assume lane 11 / `Done` is configured as a completion lane and lane 9 is normal. Configure a lane explicitly:

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/lanes/11 \
  -H 'content-type: application/json' \
  --data '{"isCompletionLane":true}'
```

This changes completion for all tickets in the lane, including archived tickets. For human acceptance, hand AI work off to the normal `Acceptance` lane before a human moves it to Done.


For reviewed board configuration, prefer the [atomic selection endpoint](#replace-the-completion-lane-selection), which rejects stale expectations. The PATCH example above does not perform that check.

All examples assume `http://127.0.0.1:3000`.

<a id="paged-ticket-lists"></a>
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

Paged responses also include `X-Kanbalone-Ticket-Revision`. When combining independent filtered collections from one board, compare these revisions and restart the whole collection if they differ. This does not expose or replace the cursor.

For automation that modifies tickets, finish collecting the list before writing, or track already-processed IDs and make retries safe. Do not combine rows from before and after a 409, and do not blindly repeat writes.

## Relation picker candidates

`GET /api/boards/3/relation-candidates?limit=200` includes active and archived tickets in ascending ID order. Each ticket contains `id`, `title`, `parentTicketId`, `priority`, `blockerIds`, and `isResolved`.

Supply `limit=1..200` on every request. The order is always `id_asc`, which you may supply explicitly. Follow `page.nextCursor` until it is null. Use the cursor with the same board and endpoint. Each page includes `X-Kanbalone-Ticket-Revision` and `page.total`, the full board ticket count. On 409, discard the collected pages and start again without a cursor.

## Health Check

```bash
curl -s http://127.0.0.1:3000/api/health
```

## List Boards

```bash
curl -s http://127.0.0.1:3000/api/boards
```

## Get Board Shell

```bash
curl -s http://127.0.0.1:3000/api/boards/3
```

## Create Board

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards \
  -H 'content-type: application/json' \
  --data '{
    "name": "Agent Tasks",
    "laneNames": ["todo", "doing", "review", "done"]
  }'
```

## Create Tag

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/3/tags \
  -H 'content-type: application/json' \
  --data '{
    "name": "frontend",
    "color": "#2563eb"
  }'
```

## Create Ticket

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/3/tickets \
  -H 'content-type: application/json' \
  --data '{
    "laneId": 9,
    "title": "Draft API usage guide",
    "bodyMarkdown": "Document the most common ticket operations.",
    "priority": 4,
    "tagIds": [3],
    "blockerIds": []
  }'
```

## Move Ticket To Done And Mark Resolved

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/6 \
  -H 'content-type: application/json' \
  --data '{
    "laneId": 11
  }'
```

## Move Ticket Back To Todo And Reopen

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/6 \
  -H 'content-type: application/json' \
  --data '{
    "laneId": 9
  }'
```

## Bulk Mark Resolved

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/3/tickets/bulk-transition \
  -H 'content-type: application/json' \
  --data '{
    "ticketIds": [4, 5, 6],
    "laneName": "Done"
  }'
```

## Bulk Transition By Lane Name

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/3/tickets/bulk-transition \
  -H 'content-type: application/json' \
  --data '{
    "ticketIds": [4, 5, 6],
    "laneName": "Done"
  }'
```

## Set Blocker

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/7 \
  -H 'content-type: application/json' \
  --data '{
    "blockerIds": [6]
  }'
```

## Set Parent

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/5 \
  -H 'content-type: application/json' \
  --data '{
    "parentTicketId": 4
  }'
```

## Add Comment

```bash
curl -s -X POST http://127.0.0.1:3000/api/tickets/6/comments \
  -H 'content-type: application/json' \
  --data '{
    "bodyMarkdown": "Confirmed on local UI and API."
  }'
```

## Edit Comment

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/comments/12 \
  -H 'content-type: application/json' \
  --data '{
    "bodyMarkdown": "Confirmed on local UI, API, and archive flow."
  }'
```

## Delete Comment

```bash
curl -s -X DELETE http://127.0.0.1:3000/api/comments/12
```

## Archive Ticket

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/6 \
  -H 'content-type: application/json' \
  --data '{
    "isArchived": true
  }'
```

## Filter Ticket Summaries

```bash
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?resolved=false'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?lane_id=11'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?tag=frontend'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?archived=all'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?q=sidebar'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?q=%23123'
```

## Reorder One Ticket Within A Lane

If ticket 4 is in lane 9, specify the same `laneId` and a zero-based `position` to move it to the start. `laneId` is required. Specify another lane on the same board to move lanes and set the position in one request.

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/4/position \
  -H 'content-type: application/json' \
  --data '{ "laneId": 9, "position": 0 }'
```

To insert before or after ticket 5 (independent examples):

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/4/position \
  -H 'content-type: application/json' \
  --data '{ "laneId": 9, "beforeTicketId": 5 }'

curl -s -X PATCH http://127.0.0.1:3000/api/tickets/4/position \
  -H 'content-type: application/json' \
  --data '{ "laneId": 9, "afterTicketId": 5 }'
```

Anchor ticket 5 must belong to target lane 9 and must not be the moving ticket itself. Use these anchors instead of an index in a filtered view when some tickets are hidden. Precedence is `beforeTicketId`, then `afterTicketId`, then `position`. Success returns the updated ticket, and the server reindexes the other tickets.

Verify the resulting order using each ticket's `position`:

```bash
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?lane_id=9'
```

## Export Board

```bash
curl -s http://127.0.0.1:3000/api/boards/3/export > board-3.json
```

## Import Board

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/import \
  -H 'content-type: application/json' \
  --data @board-3.json
```

## Import Large Local Seed Data

`/api/boards/import` can also handle larger local-only payloads.

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/import \
  -H 'content-type: application/json' \
  --data @perf-5000-board.json
```

After import, check the list through the lightweight summary route.

```bash
curl -s 'http://127.0.0.1:3000/api/boards/6/tickets?resolved=false'
curl -s 'http://127.0.0.1:3000/api/boards/6/tickets?lane_id=20'
```

## Subscribe To Board Updates With SSE

```bash
curl -N http://127.0.0.1:3000/api/boards/3/events
```

```text
data: {"boardId":3,"event":"board_updated","sentAt":"2026-04-10T00:00:00.000Z"}
```

## List Comments

```bash
curl -s http://127.0.0.1:3000/api/tickets/6/comments
```

## List Activity

```bash
curl -s http://127.0.0.1:3000/api/tickets/6/activity
```

## Get Relations

```bash
curl -s http://127.0.0.1:3000/api/tickets/6/relations
```

## Transition By Lane Name

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/6/transition \
  -H 'content-type: application/json' \
  --data '{
    "laneName": "Done"
  }'
```

## Request Bodies And Content-Type

Send `Content-Type: application/json` when sending a JSON body. Omit it for bodyless GET / DELETE requests. DELETE endpoints that do not require a body also accept an empty body with this header. Empty bodies on POST / PATCH endpoints that require a body, and malformed JSON bodies, return 400.

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

```bash
curl -sG http://127.0.0.1:3000/api/boards/3/tickets \
  --data-urlencode 'lane=Doing' --data-urlencode 'parent=101' --data-urlencode 'resolved=false'
curl -s 'http://127.0.0.1:3000/api/tickets/101/comments?limit=2&order=desc'
curl -s -X POST http://127.0.0.1:3000/api/lanes/9/tickets/reorder \
  -H 'content-type: application/json' --data '{"ticketIds":[103,101]}'
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/101 \
  -H 'content-type: application/json' --data '{"appendMarkdown":"\n\n- Additional task"}'
curl -s -X PUT http://127.0.0.1:3000/api/tickets/101/external-references/pr-main \
  -H 'content-type: application/json' --data '{
    "provider":"github", "instanceUrl":"https://github.com", "resourceType":"pull_request",
    "projectKey":"example/project", "issueKey":"123", "displayRef":"example/project#123",
    "url":"https://github.com/example/project/pull/123"
  }'
```

<a id="replace-the-completion-lane-selection"></a>

## Replace The Completion Lane Selection

Use this endpoint for reviewed board configuration; it replaces the full selection atomically, rather than updating lanes one at a time. First read every lane and all tickets, including archived tickets, without other filters:

```bash
curl -s http://127.0.0.1:3000/api/boards/4/lanes
curl -s 'http://127.0.0.1:3000/api/boards/4/tickets?archived=all'
```

The following example assumes board 4 contains exactly lanes 9–12 with the current attributes and counts below. It switches completion from lane 11 to lane 12: the two tickets in lane 11 will reopen; lane 12 is empty. Use the actual IDs and counts from your reads, and review the effect before sending the change.

```bash
curl -s -X PUT http://127.0.0.1:3000/api/boards/4/completion-lanes \
  -H 'content-type: application/json' \
  --data '{
    "laneIds": [12],
    "expectedLanes": [
      {"id":9,"isCompletionLane":false,"ticketCount":3},
      {"id":10,"isCompletionLane":false,"ticketCount":1},
      {"id":11,"isCompletionLane":true,"ticketCount":2},
      {"id":12,"isCompletionLane":false,"ticketCount":0}
    ]
  }'
```

`laneIds` is the entire desired selection; `[]` clears all completion lanes. Include every lane in `expectedLanes`, even empty ones. Counts include archived tickets. Success returns `{ lanes }`; archive flags stay unchanged. Invalid/duplicate selection IDs return 400, a missing board returns 404, and a changed lane set, completion attribute, or ticket count returns 409 with no writes. On 409, re-read the data and review the impact again. Do not bypass it by issuing individual PATCH calls, which have no expectation guard.

<a id="groups"></a>
## Groups

```bash
BASE=http://127.0.0.1:3000
BOARD_ID=3

# Active is the default. Include inactive Groups and sort by name.
curl -sS "$BASE/api/boards/$BOARD_ID/groups?status=all&sort=name&order=asc"

# Create a Group. Keep the returned id and revision.
curl -sS -X POST "$BASE/api/boards/$BOARD_ID/groups" \
  -H 'content-type: application/json' \
  --data '{"name":"First-use guide","descriptionMarkdown":"## Goal\n\nHelp people create their first ticket."}'

GROUP_ID=7
curl -sS "$BASE/api/groups/$GROUP_ID"
curl -sS "$BASE/api/boards/$BOARD_ID/tickets?groupId=$GROUP_ID&archived=all"
curl -sS "$BASE/api/boards/$BOARD_ID/tickets?ungrouped=true&q=guide"
```

### Preview And Apply Membership

The following examples require `jq`. Replace IDs with resources from the target instance. The preview can include more tickets than the IDs submitted because parent/child membership is shared.

```bash
WORK_DIR=$(mktemp -d)
printf '%s\n' '{"ticketIds":[101],"groupId":7}' > "$WORK_DIR/membership.json"
curl -sS --fail-with-body -X POST "$BASE/api/boards/$BOARD_ID/group-memberships/preview" \
  -H 'content-type: application/json' --data-binary @"$WORK_DIR/membership.json" \
  > "$WORK_DIR/preview.json"
cat "$WORK_DIR/preview.json"
```

After reviewing the complete affected set, apply exactly that operation:

```bash
jq --slurpfile preview "$WORK_DIR/preview.json" \
  '. + {expectedToken:$preview[0].expectedToken}' \
  "$WORK_DIR/membership.json" > "$WORK_DIR/apply.json"
curl -sS --fail-with-body -X PUT "$BASE/api/boards/$BOARD_ID/group-memberships" \
  -H 'content-type: application/json' --data-binary @"$WORK_DIR/apply.json"
```

To remove membership, start a new preview with `{"ticketIds":[101],"groupId":null}` and apply its token. This removes the Group from the connected parent/child set, including archived members. To assign another Group, remove first, then preview/add the destination Group. Do not reuse a token for a different body.

### Create A Ticket In A Group

```bash
curl -sS --fail-with-body -X POST "$BASE/api/boards/$BOARD_ID/tickets" \
  -H 'content-type: application/json' \
  --data '{"laneId":9,"title":"Improve first-use guidance","priority":2,"groupId":7}'
```

When also setting `parentTicketId`, use `POST /api/boards/:boardId/tickets/preview` with the same creation body. If `requiresResolution` is true, choose a returned candidate Group and add `groupResolution:{groupId}` and `expectedToken` to the creation request. The existing parent/children and the new ticket are updated together. With one non-null Group, the ungrouped side joins it automatically. Preview does not create a ticket.

### Save Parent/Child Changes Atomically

Keep the original edit token from when editing starts. This example assumes 102 is already a child of 101 and 303 is newly selected. It replaces ticket 101's child set with 102 and 303; it must not be used as an append request when additional children already exist. Supply an `expectedSelectedParents` entry for every newly selected child.

```bash
curl -sS --fail-with-body "$BASE/api/tickets/101" > "$WORK_DIR/ticket.json"
curl -sS --fail-with-body "$BASE/api/tickets/303" > "$WORK_DIR/selected-child.json"
jq --slurpfile child "$WORK_DIR/selected-child.json" \
  '{childTicketIds:[102,303], expectedEditToken:.editToken,
    expectedSelectedParents:[{ticketId:$child[0].id,parentTicketId:$child[0].parentTicketId}]}' \
  "$WORK_DIR/ticket.json" > "$WORK_DIR/edit.json"
curl -sS --fail-with-body -X POST "$BASE/api/tickets/101/change-preview" \
  -H 'content-type: application/json' --data-binary @"$WORK_DIR/edit.json" \
  > "$WORK_DIR/edit-preview.json"
cat "$WORK_DIR/edit-preview.json"
```

For a conflict, select one Group from `candidates` after reviewing which tickets change. Do not select the first candidate automatically. For example, if Group 7 is the intended returned candidate:

```bash
jq --slurpfile preview "$WORK_DIR/edit-preview.json" \
  '. + {expectedToken:$preview[0].expectedToken,groupResolution:{groupId:7}}' \
  "$WORK_DIR/edit.json" > "$WORK_DIR/edit-apply.json"
curl -sS --fail-with-body -X PATCH "$BASE/api/tickets/101" \
  -H 'content-type: application/json' --data-binary @"$WORK_DIR/edit-apply.json"
```

Without a conflict, omit `groupResolution` and add only `expectedToken`. Keep the edit body unchanged between preview and commit. On a stale response, re-read and reconcile the user's changes rather than refreshing tokens and replaying an obsolete child set.

### Edit Or Delete A Group

```bash
curl -sS --fail-with-body "$BASE/api/groups/$GROUP_ID" > "$WORK_DIR/group.json"
jq '{name:"First-use improvements",expectedRevision:.revision}' "$WORK_DIR/group.json" \
  > "$WORK_DIR/group-edit.json"
curl -sS --fail-with-body -X PATCH "$BASE/api/groups/$GROUP_ID" \
  -H 'content-type: application/json' --data-binary @"$WORK_DIR/group-edit.json"
```

Delete only after verifying that the Group has zero tickets, including archived tickets, and that deletion is intended. Re-read after edits because the revision changes.

```bash
curl -sS --fail-with-body "$BASE/api/groups/$GROUP_ID" > "$WORK_DIR/group.json"
REVISION=$(jq -r '.revision' "$WORK_DIR/group.json")
curl -sS --fail-with-body -X DELETE "$BASE/api/groups/$GROUP_ID" \
  -H "If-Match: \"$REVISION\""
```

A nonempty Group or a stale revision is rejected; deleting a Group never deletes its tickets. The bundled API helper does not supply `If-Match`, so use `curl` for this operation.

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

### Lane filters and ordering (unreleased)

The catalog also returns each board's `lanes` in lane order. Each rule accepts `laneMode: "all" | "selected"` and `laneIds`. Use `all` with `[]` for unrestricted lanes, or `selected` with IDs from that board. Selected lanes match with OR, together with the tag and completion predicates using AND. An empty selected set matches nothing. Deleted lane references produce `missing_lane` warnings; IDs are not rebound by name. Creating or updating a saved view rejects a lane belonging to another board. An unsaved query reports it as a missing lane in that board; only valid selected lanes can match.

The definition accepts `sort: "position_asc" | "content_activity_desc" | "priority_desc"`. Board order is unchanged. Within each board, the latter two sort by recorded body/comment activity or priority descending, then use existing lane/ticket order for ties. Sorting precedes pagination. Reset the cursor when changing the definition.

For example, a rule can be `{"boardId":1,"mode":"all","tagIds":[],"laneMode":"selected","laneIds":[11,12]}`, with `"sort":"priority_desc"` on the definition. These are synthetic IDs; discover your own with the catalog.

Old definitions and create/query requests without these fields default to all lanes and `position_asc`. On update, omitting `sort` retains its saved value; omitting both lane fields retains the saved lane condition for the same board. To remove a restriction, explicitly send `laneMode: "all", laneIds: []`. Send both lane fields together.

Content activity advances for an actual body change or comment post/content edit, not title, tag, lane or priority changes or comment deletion. It is independent of excerpt visibility and of which comment is displayed as the latest. Historical body-edit times are unknown; migration uses recorded creation/comment times rather than the upgrade time or general ticket update time. Full DB backup restores the history; board JSON import creates new tickets/comments and starts their activity at import time.
