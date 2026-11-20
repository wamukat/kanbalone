# API Examples

Completion is determined by `isCompletionLane`, not the lane name. The examples below assume lane 11 / `Done` is configured as a completion lane and lane 9 is normal. Configure a lane explicitly:

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/lanes/11 \
  -H 'content-type: application/json' \
  --data '{"isCompletionLane":true}'
```

This changes completion for all tickets in the lane, including archived tickets. For human acceptance, hand AI work off to the normal `Acceptance` lane before a human moves it to Done.


For reviewed board configuration, prefer the [atomic selection endpoint](#replace-the-completion-lane-selection), which rejects stale expectations. The PATCH example above does not perform that check.

All examples assume `http://127.0.0.1:3000`.

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

## Reorder All Board Tickets (Legacy API)

`items` must contain every non-archived ticket on the board. This example assumes those tickets are only 4, 5, and 6. Use the `position` endpoint above to reorder one ticket within a lane.

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/3/tickets/reorder \
  -H 'content-type: application/json' \
  --data '{
    "items": [
      { "ticketId": 4, "laneId": 9, "position": 0 },
      { "ticketId": 5, "laneId": 9, "position": 1 },
      { "ticketId": 6, "laneId": 11, "position": 0 }
    ]
  }'
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
