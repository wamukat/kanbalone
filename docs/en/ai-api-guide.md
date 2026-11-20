# Kanbalone AI API Guide

This API is a local, single-user Kanbalone API. The base URL is usually `http://127.0.0.1:3000`.

## Codex Skill

Kanbalone ships with a Codex skill for API-only kanban operations at `skills/kanbalone-api`.

Install it from a repository checkout:

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/kanbalone-api "${CODEX_HOME:-$HOME/.codex}/skills/"
```

If you use only the Docker image, fetch the skill from the GitHub release tag to the host running Codex:

```bash
tmpdir=$(mktemp -d)
curl -L https://github.com/wamukat/kanbalone/archive/refs/tags/v0.9.35.tar.gz \
  | tar -xz -C "$tmpdir" kanbalone-0.9.35/skills/kanbalone-api
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R "$tmpdir"/kanbalone-0.9.35/skills/kanbalone-api "${CODEX_HOME:-$HOME/.codex}/skills/"
rm -rf "$tmpdir"
```

The skill is installed on the host because Codex runs outside the Kanbalone container. It then talks to the running Kanbalone API over HTTP.

## Recommended Workflow

1. List boards first.
   `GET /api/boards`
2. Fetch the target board shell.
   `GET /api/boards/:boardId`
3. Before updating tickets, fetch either the lightweight ticket list or a single ticket.
   `GET /api/boards/:boardId/tickets`
   `GET /api/tickets/:ticketId`
4. Use dedicated endpoints when you need comments or relations.
   `GET /api/tickets/:ticketId/comments`
   `GET /api/tickets/:ticketId/activity`
   `GET /api/tickets/:ticketId/relations`
5. Use `PATCH /api/tickets/:ticketId` with the smallest necessary change.
   Use `PATCH /api/tickets/:ticketId/transition` for lane-name-based moves.
   Use board-scoped bulk endpoints when changing multiple tickets.
6. Subscribe to `GET /api/boards/:boardId/events` when the kanban UI needs automatic updates.

## Important Semantics

### 1. `laneId` And `isResolved` Are Separate

- A lane named `done` does not automatically make the ticket complete.
- Moving a ticket to a done lane does not set resolved state.
- If you want the ticket resolved, update both `laneId` and `isResolved: true` when appropriate.

### 2. Blockers Are Dependencies Of This Ticket

- `ticket.blockerIds = [6]` means this ticket is blocked by `#6`.
- A ticket cannot block itself.
- Reciprocal blockers are not allowed.
  - If `#1` is blocked by `#2`, then `#2` cannot also be blocked by `#1`.

### 3. Parent/Child Depth Is One Level

- A parent can have multiple children.
- Grandchildren are not allowed.
- A child ticket cannot also be a parent.
- A ticket with children cannot become the child of another parent.

### 4. Tags Are Board-Scoped

- Tags are independent per board.
- When updating a ticket, pass tag IDs from that same board in `tagIds`.

### 5. Comments Can Be Listed, Added, Edited, And Deleted

- `GET /api/tickets/:ticketId/comments` lists comments newest first.
- `POST /api/tickets/:ticketId/comments` adds a comment.
- `PATCH /api/comments/:commentId` edits a comment.
- `DELETE /api/comments/:commentId` deletes a comment.
- Remote tracked tickets add `sync` metadata to comments.
- Use `POST /api/comments/:commentId/push-remote` to post a local comment to the remote issue.

### 6. Archive State Is Separate From Completion

- `isArchived` is independent from `isResolved`.
- Archived tickets are hidden from board lists by default.
- Use `GET /api/boards/:boardId/tickets?archived=all` to include archived tickets.

### 7. Canonical References Are Returned

- Ticket responses include `ref` and `shortRef`.
- Formats are `BoardName#TicketId` and `#TicketId`.

### 8. Remote Tracked Tickets Split Title And Body Semantics

- `title` is the read-only title imported from the remote issue.
- `bodyMarkdown` is the local body.
- `remote.bodyMarkdown` / `remote.bodyHtml` are remote snapshots.
- Use `POST /api/boards/:boardId/remote-import/preview` to resolve and check duplicate status before import.
- Use `POST /api/boards/:boardId/remote-import` to create a remote tracked ticket.
- Set `postBacklinkComment: true` on remote import only when you want Kanbalone to attempt one remote backlink comment. `backlinkUrl` is optional because Kanbalone may not have a public URL; when supplied it must be an absolute `http` or `https` URL. The provider token needs comment/write permission.
- Use `POST /api/tickets/:ticketId/remote-refresh` to update the remote snapshot.

### 9. External References Are Non-Tracking Provenance

- `externalReferences` stores structured remote provenance that is not a tracked import.
- Use `PUT /api/tickets/:ticketId/external-references/:kind` to idempotently set a reference such as `source`.
- External references do not violate the one-import-per-remote-issue rule.
- External references do not expose refresh, sync, or push actions.
- Use this when generated tickets need to point back to a source requirement without becoming another imported remote ticket.

### 10. `/api/meta` Exposes Remote Provider Availability

- `GET /api/meta` returns `remoteProviders`.
- Each entry has `id` and `hasCredential`.
- The UI uses this to show remote import only when at least one credential exists and to list configured providers only.
- API clients can use the same metadata to decide which provider workflows to surface.

### 11. `/api/remote-diagnostics` Checks Remote Credentials

- `GET /api/remote-diagnostics` returns configured/missing credential status per provider.
- `POST /api/remote-diagnostics` accepts a provider plus remote issue lookup fields and checks whether the configured credential can read that issue.
- Diagnostic results are token-safe and return statuses such as `reachable`, `auth_failed`, `permission_failed`, `not_found`, or `missing_credential`.
- Diagnostic checks require an exact credential scope for the target instance; wildcard credentials are not used for user-supplied diagnostic URLs.
- Credential scopes are normalized per provider: GitHub and GitLab use the URL origin, while Redmine keeps the path so subpath instances such as `https://redmine.example.test/redmine` can use separate credentials.
- Wildcard credentials are not used for GitHub or GitLab. Configure an explicit origin credential for each GitHub Enterprise or self-hosted GitLab instance.

## Common Patterns

### Search Tickets In A Board

Add query parameters to `GET /api/boards/:boardId/tickets`.

- This endpoint returns lightweight summaries.
- Use it first for large-board rendering, filtering, search, and automation scans.
- It does not include `bodyHtml`, `comments`, `parent`, `children`, or expanded `blockers`.
- Use `GET /api/tickets/:ticketId` when you need details.
- Supported filters: `lane_id`, `tag`, `resolved`, `archived`, and `q`.
- `q` searches title, body Markdown, numeric ticket ID, `#ticketId`, tracked remote refs, and external references.
- Provider-prefixed shorthand such as `gh#123`, `github#123`, `gl#123`, `gitlab#123`, `rm#123`, and `redmine#123` matches tracked remote links and external references for that provider.
- `ext#123` / `external#123` searches external references only. `remote#123` searches tracked remote links only.

### Move A Ticket To A Lane

ID-based:

- `PATCH /api/tickets/:ticketId`
- Put `laneId` in the body.

Name-based:

- `PATCH /api/tickets/:ticketId/transition`
- Put `laneName` in the body.
- Include `isResolved` when needed.

To move one ticket to a specific position, use `PATCH /api/tickets/:ticketId/position` (see below).

Mark multiple tickets resolved or open:

- `POST /api/boards/:boardId/tickets/bulk-complete`
- Body includes `ticketIds` and `isResolved`.

Transition multiple tickets by lane name:

- `POST /api/boards/:boardId/tickets/bulk-transition`
- Body includes `ticketIds` and `laneName`.
- Include `isResolved` when needed.

### Reorder A Ticket Within A Lane

Use `PATCH /api/tickets/:ticketId/position`. The required `laneId` can be the ticket's current lane ID to reorder within that lane, or another lane on the same board to move between lanes.

Move ticket 4 to the start of its current lane 9:

```http
PATCH /api/tickets/4/position
Content-Type: application/json

{ "laneId": 9, "position": 0 }
```

- `position` is zero-based. The server reindexes the other tickets; you do not need to send every ticket.
- To insert immediately before ticket 5, send `{ "laneId": 9, "beforeTicketId": 5 }`; immediately after it, send `{ "laneId": 9, "afterTicketId": 5 }`. Anchors must belong to the target lane and must not be the moving ticket itself.
- When filters hide some tickets, use `beforeTicketId` / `afterTicketId` instead of an index in the filtered view. Precedence is `beforeTicketId`, then `afterTicketId`, then `position`.
- Success returns the updated ticket. Use `GET /api/boards/:boardId/tickets?lane_id=9` to verify each ticket's `position`.
- The legacy `POST /api/boards/:boardId/tickets/reorder` endpoint operates on the whole board and requires every non-archived ticket in `items`. Use the `position` endpoint for a single-ticket reorder.

### Fetch Relations

- `GET /api/tickets/:ticketId/relations`
- Returns `parent`, `children`, `blockers`, and `blockedBy`.
- `blockers` are tickets blocking this ticket.
- `blockedBy` are tickets blocked by this ticket.
- `GET /api/tickets/:ticketId` includes the same relation fields.

### Fetch Activity

- `GET /api/tickets/:ticketId/activity`
- Returns comment creation/update/delete, ticket updates, transitions, archive changes, and similar history.
- Activity is returned newest first.

### Mark A Ticket Resolved

- `PATCH /api/tickets/:ticketId`
- Body includes `isResolved: true`.

Update `laneId` at the same time when needed.

### Reflect External API Updates In The UI

- Subscribe to `GET /api/boards/:boardId/events` with SSE.
- Updates emit short `data: {...}` events.
- The UI should refetch `GET /api/boards/:boardId` and `GET /api/boards/:boardId/tickets` after receiving an event.

### Import A Large Board

- Use `POST /api/boards/import`.
- The app is local-only, so larger board export/import payloads are supported.
- After importing, use `GET /api/boards/:boardId/tickets` for list checks and `GET /api/tickets/:ticketId` for details.

## Error Handling

Errors usually use this shape:

```json
{ "error": "message" }
```

Common cases:

- `400`: invalid input
- `404`: target not found
- `409`: state conflict

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
