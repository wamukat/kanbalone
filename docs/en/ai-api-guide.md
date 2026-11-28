# Kanbalone AI API Guide

Kanbalone v1.0.0 removed deprecated completion API fields and endpoints. For a released instance, use the documentation and skill from its release tag. See the [migration table](./migration-guide.md#deprecated-api-removal).

Before upgrading an existing database, read the [completion-state migration guide](./migration-guide.md) for backup, automatic migration, reconciliation, rollback and the AI execution contract.

This API is a local, single-user Kanbalone API. The base URL is usually `http://127.0.0.1:3000`.

## Paged ticket lists

Pagination is available starting with v1.1.0-rc.1. Existing requests without `limit` and `cursor` still return the full list in the existing order and response shape. Use documentation matching your running release.

Use `limit=1..200` and repeat the returned `page.nextCursor` to get the next page. Keep the same board, filters and `order`; only `limit` may change. `page.total` is the number of all matching tickets; `nextCursor: null` marks the end. There is no page number or `hasMore` field.

See [pagination examples and retry rules](./api-examples.md#paged-ticket-lists). Collect all pages before full-set decisions or mutations; discard partial results on 409 and retry at most twice. Pages are flat ticket collections, not whole parent/child trees.

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
curl -L https://github.com/wamukat/kanbalone/archive/refs/tags/v0.11.0.tar.gz \
  | tar -xz -C "$tmpdir" kanbalone-0.11.0/skills/kanbalone-api
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R "$tmpdir"/kanbalone-0.11.0/skills/kanbalone-api "${CODEX_HOME:-$HOME/.codex}/skills/"
rm -rf "$tmpdir"
```

The skill is installed on the host because Codex runs outside the Kanbalone container. It then talks to the running Kanbalone API over HTTP.

The bundled API helper accepts repeatable `--header 'Name: Value'` options alongside a JSON argument, piped JSON, or a Markdown `--body-file`. Names are case-insensitive, and the last value replaces earlier values and any helper default for that name. The defaults are `Accept: application/json` and, when there is a body, `Content-Type: application/json`. Custom headers are sent only on the initial request. See the [Group deletion example](./api-examples.md#edit-or-delete-a-group) for `If-Match`.

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

### 1. Completion Comes From The Lane

- Inspect `lanes[].isCompletionLane`; names do not determine completion.
- Moving to a completion lane resolves a ticket. Moving to a normal lane reopens it.
- Read-only `isResolved` reflects the lane. Ticket writes reject `isResolved` and `isCompleted` with 400, without changes; omit both fields. The `isCompleted` response alias and `completed` query alias have been removed. Use `resolved` to filter completion.
- Read-only `resolvedAt` records arrival in the current completion lane. Moving to another completion lane updates it; reopening clears it to `null`. Ordinary edits and same-lane reordering preserve it. It is also `null` when the historical completion time is unknown. Omit it from ticket create/update inputs. Kanban sorts completion lanes by this time descending, with existing position as the fallback for unknown times; the API `position` contract is unchanged.
- API-created boards without a language option have `todo`, `doing`, `Acceptance` (normal lanes), and `done` (completion lane). Optional `defaultLaneLanguage: "en" | "ja"` localizes newly generated defaults; the UI supplies its current language. Explicit `laneNames` take precedence and default to normal lanes; configure completion explicitly. Existing lane names are never translated.
- For acceptance workflows, hand work off to the board’s review lane and move accepted work to a completion lane. Read the board’s actual lane names and IDs rather than assuming fixed English names.
- `PATCH /api/lanes/:laneId` with `{ "isCompletionLane": true }` changes completion for every ticket in that lane, including archived tickets. Archive flags do not change.

For board-wide configuration, use `PUT /api/boards/:boardId/completion-lanes` with `{ laneIds, expectedLanes }`. `laneIds` is the entire desired selection, not an append operation; `[]` makes every lane normal. Read all lanes and the unfiltered ticket list with `archived=all`, then include every lane in `expectedLanes` as `{ id, isCompletionLane, ticketCount }`. Counts include archived tickets and zero-ticket lanes. Review how many tickets will become resolved or reopened before applying the authorized change.

The selection and all affected ticket states update in one transaction. Invalid or duplicate selection IDs return 400; a missing board returns 404; a changed lane set, completion attribute, or ticket count returns 409 with no writes. On 409, fetch current data and review the effect again; do not blindly retry or bypass the check with individual PATCH calls. The single-lane PATCH endpoint does not have this expectation guard. See [API examples](./api-examples.md#replace-the-completion-lane-selection).

### 2. Blockers Are Dependencies Of This Ticket

- `ticket.blockerIds = [6]` means this ticket is blocked by `#6`.
- Ticket-list summaries include read-only `unresolvedBlockerCount`: the number of unresolved blockers, including archived blockers. Search and filters do not change this count.
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

### Ticket Tasks

Use Tasks for individual review findings, corrections and checks within a ticket. Each Task has its own Markdown and completion flag. The server assigns a strictly increasing number scoped to the ticket. Ticket completion still follows the lane. Use a child ticket for work that needs its own lane or priority.

- List or create Tasks at `/api/tickets/:ticketId/tasks`. The list returns `{tasks, taskCount, doneTaskCount}`, with totals for the whole ticket. Use `q` for a literal Markdown substring and `done=true` or `done=false` for the completion filter. Matching ignores ASCII letter case. Other characters and whitespace match exactly.
- Read, patch or delete a Task at `/api/tickets/:ticketId/tasks/:taskNumber`. Create with `bodyMarkdown` and optional `done`, which defaults to false. Markdown must contain non-whitespace text and fit within 100,000 valid Unicode characters. The response also includes sanitized `bodyHtml` and `revision`.
- Send `expectedRevision` in the JSON for PATCH and DELETE. An omitted revision returns 428. A stale revision returns 409 with `STALE_TASK`. Read the current Task and reconcile the edit before retrying.
- Read `task_created`, `task_updated` and `task_deleted` in ticket activity. Each entry records the number, excerpt, completion state and updater. Body edits retain the previous and new Markdown. Deletions retain the deleted Markdown. A matching no-op PATCH leaves activity, revision and board notifications untouched.

Ticket detail and ticket summaries include `taskCount` and `doneTaskCount`. Task changes refresh these counts without changing the ticket's update timestamp or its body-and-comment activity sort. Tasks follow the ticket on moves and remain available when it is archived. Deleting the ticket removes its Tasks. Activity from before a move follows the originating board's existing history retention rules.

See [working examples](./api-examples.md#ticket-tasks) and [backup and transfer compatibility](./migration-guide.md#ticket-task-migration).

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
- Filter one lane with `lane_id` or its exact name in `lane`. Filter one tag by its exact name in `tag`.
- `lane_ids=11,12&tag_ids=3,4` matches tickets in one of the selected lanes that have at least one of the selected tags. Omit either comma-separated list to include all values for that field. Use at most one lane parameter and one tag parameter.
- Use `resolved` for completion and `archived` for archive status.
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
- Completion is derived from the destination lane; omit completion flags.

To move one ticket to a specific position, use `PATCH /api/tickets/:ticketId/position` (see below).

Mark multiple tickets resolved or open:

- Use `POST /api/boards/:boardId/tickets/bulk-transition` with `ticketIds` and the target `laneName`.
- Resolve or reopen multiple tickets with `bulk-transition` and a destination lane. The removed `bulk-complete` endpoint returns 404.

Transition multiple tickets by lane name:

- `POST /api/boards/:boardId/tickets/bulk-transition`
- Body includes `ticketIds` and `laneName`.
- Completion is derived from the destination lane; omit completion flags.

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
- For a move based on a previously observed order, send both `expectedSourceLaneId` and `expectedSourcePosition` from the moving ticket. When sending two distinct anchors with this precondition, also send `expectedAnchorOrder` (`after-before` or `before-after`) from the target lane's order by archived status, position, and ID. The anchors can have other tickets between them. The server returns 409 without saving if the source position, target lane, or requested anchor membership or order changed. Refetch the board before trying again. A title edit alone leaves this precondition satisfied.
- Success returns the updated ticket. Use `GET /api/boards/:boardId/tickets?lane_id=9` to verify each ticket's `position`.
- Reorder one ticket with `position`, or several tickets in one lane with `POST /api/lanes/:laneId/tickets/reorder`. The removed board-wide reorder endpoint returns 404.

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
- Set `laneId` to a lane with `isCompletionLane: true`. Reopening requires moving to a normal lane.

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

`GET /api/boards/:boardId/tickets?lane=Doing&resolved=false&parent=101` combines an exact lane name with a direct parent filter. `parent=none` selects root tickets. Unknown lane names or unmatched parent IDs return an empty list. Choose one of `lane`, `lane_id`, and `lane_ids`.

### Read Recent Comments

`GET /api/tickets/:ticketId/comments?limit=2&order=desc` returns the latest two comments. `limit` accepts 1–100; omit it for all comments. `order` accepts `asc` / `desc`, defaulting to the existing newest-first `desc` order. Equal timestamps use comment ID in the same direction as a tie breaker.

### Reorder A Lane In One Request

Send `{ "ticketIds": [103, 101] }` to `POST /api/lanes/:laneId/tickets/reorder` to place those non-archived tickets first. Omitted tickets follow in their original relative order; archived tickets remain last in their relative order. An empty array is a no-op. Other-lane, missing, duplicate, or archived IDs reject the entire operation with 400. A missing lane returns 404. Validation and writes share one transaction; concurrent requests serialize, with the later request applied to the latest order. The response contains non-archived lane ticket summaries.

### Append To A Ticket Body

Send `{ "appendMarkdown": "\n\n- Additional task" }` to `PATCH /api/tickets/:ticketId`. The latest body is read and appended within a transaction. No separator is inserted automatically. Empty text or combining with `bodyMarkdown` returns 400. The resulting body is limited to 64 MiB UTF-8. This is not idempotent: verify the body after an ambiguous failure before retrying. It does not protect against another client replacing the entire body.

### Register MR/PR External References

Use `PUT /api/tickets/:ticketId/external-references/:kind` with `resourceType: "pull_request"` for a PR or `resourceType: "merge_request"` for an MR, along with `provider`, `instanceUrl`, `projectKey`, `issueKey`, `displayRef`, and `url`. The same ticket/kind is replaced on PUT; use distinct kinds such as `pr-main` / `mr-followup` for multiple references. Read them through the ticket's `externalReferences`. For GitHub pull requests and GitLab merge requests, call `POST /api/tickets/:ticketId/external-references/:kind/refresh` to let Kanbalone fetch status with its configured provider credentials. No state value is supplied by the caller and no periodic fetch runs. `changeRequestStatus` returns `state` (`open`, `closed`, `merged`, or null), `isDraft`, `fetchedAt`, `attemptedAt`, and a sanitized `error`. A null snapshot means no attempt since the link was set. A failed attempt returns 502 and retains the last successful state; GET the ticket to inspect it. A superseded refresh or changed reference returns 409. PUT resets that reference’s cached status, including when replacing it with the same URL. These references never become tracked Issue imports.

## Groups: Single Membership And Atomic Parent Editing

A Group belongs to one board. A ticket can belong to at most one Group. Parents and children, including archived children, must have the same Group. Tags remain the mechanism for overlapping classifications.

| Operation | API |
| --- | --- |
| List active Groups | `GET /api/boards/:boardId/groups` |
| Include inactive Groups | `GET /api/boards/:boardId/groups?status=all` |
| List/sort Groups | `status=active\|inactive\|all`, `sort=createdAt\|name`, `order=asc\|desc` |
| Create Group | `POST /api/boards/:boardId/groups` with `{name,descriptionMarkdown?}` |
| Read/edit Group | `GET` / `PATCH /api/groups/:groupId`; PATCH includes `expectedRevision` |
| Delete empty Group | `DELETE /api/groups/:groupId` with the GET response's `ETag` in `If-Match` |
| Read members | `GET /api/boards/:boardId/tickets?groupId=7&archived=all` |
| Find ungrouped tickets | `GET /api/boards/:boardId/tickets?ungrouped=true&q=guide` |
| Preview membership | `POST /api/boards/:boardId/group-memberships/preview` |
| Apply membership | `PUT /api/boards/:boardId/group-memberships` |
| Preview ticket creation | `POST /api/boards/:boardId/tickets/preview` |
| Preview an edit | `POST /api/tickets/:ticketId/change-preview` |

A Group is active when it is empty or has at least one unresolved, unarchived ticket. There is no manual Group archive/completion. `status=all` includes inactive Groups; it does not change the archive filter on a ticket query. Group creation order defaults to ascending; name/creation sorting is stable, with ID as the tie-breaker.

**Membership workflow:** preview `{ticketIds:[...],groupId:7}` or `{ticketIds:[...],groupId:null}`. Read every ticket in the preview, including archived parent/child tickets. Apply the same body plus the returned `expectedToken`. Selecting a child expands the operation to its connected parent and siblings. The operation is atomic. Moving directly from one non-null Group to another is rejected: remove membership first, then add it to the destination. Adding existing members to the same Group is a no-op. Do not replace membership by writing `groupId` through an ordinary ticket PATCH.

**Parent/child workflow:** read the ticket detail before editing and retain its `editToken`. Use one PATCH with `childTicketIds` (the complete desired child set), `expectedEditToken`, and `expectedSelectedParents` for each newly added child. The latter contains `{ticketId,parentTicketId}` as observed when selecting that ticket. Do not PATCH the body, remove children, and add children as separate requests: that could leave partial changes after a conflict. Preview the complete edit first; if it reports a Group conflict, select one of the returned candidates and send `groupResolution:{groupId}` with the returned `expectedToken` and the unchanged edit body. More than two Groups can be candidates.

When the resulting parent/child set contains one non-null Group, previously ungrouped tickets join it automatically. If it contains different Groups, no writes occur until a candidate is selected. Detaching a child preserves its Group; the old parent and siblings keep theirs when a child is attached elsewhere. Creation with `groupId` and `parentTicketId` follows the same resolution rules. Preview creation before committing a conflicting parent/Group combination. New tickets are only inserted on commit.

Group-aware errors include a machine-readable `code` with the human-readable `error`. On a stale edit/context/revision, re-read and review the new state rather than blindly resending or replacing the original expectation. Missing required preconditions return 428; invalid inputs return 400, missing resources 404, and conflicts 409. Do not change a requested destination or silently strip an archived member to make a request pass. See [Group examples](./api-examples.md#groups) and the [migration guide](./migration-guide.md#group-migration).

Creation previews identify the proposed ticket as `id: 0, clientRef: "new"`; parent changes and candidate changed IDs may refer to 0. It is only a preview sentinel. Never send it as an existing ticket ID. Membership apply returns `{changedTickets, affectedGroups}`. `GET /api/boards/:boardId/group-activity?groupId=7` returns newest-first Group activity, including retained history after deletion. `POST /api/markdown/preview` with `{bodyMarkdown}` returns sanitized `{bodyHtml}` without writing.

Schema validation failures may return only `error`, without `code`. In particular, missing `expectedRevision` on Group PATCH returns 400; missing runtime token or DELETE `If-Match` returns 428.

Group error codes (schema validation and generic errors may omit `code`):

| HTTP | code | Handling |
| --- | --- | --- |
| 400 | `INVALID_GROUP_NAME / INVALID_GROUP_DESCRIPTION` | Correct the name/description limits. |
| 400 | `INVALID_TICKET_IDS / INVALID_TICKET / INVALID_GROUP` | Use unique existing ticket IDs and a Group on the same board. |
| 400 | `GROUP_WRITE_ENDPOINT` | Use membership preview/apply for existing ticket membership. |
| 400 | `INVALID_RELATIONS / INVALID_RELATION_EXPECTATIONS / INVALID_GROUP_RESOLUTION` | Correct the full relation request or choose a returned candidate. |
| 404 | `BOARD_NOT_FOUND / GROUP_NOT_FOUND / TICKET_NOT_FOUND` | Reload available resources. |
| 409 | `GROUP_NAME_EXISTS / GROUP_NOT_EMPTY` | Choose a distinct name; only delete an empty Group. |
| 409 | `GROUP_ALREADY_ASSIGNED` | Review and remove membership before adding to another Group. |
| 409 | `GROUP_CONFLICT` | Review details/candidates and resubmit the same edit with resolution and token. |
| 409 | `STALE_GROUP / STALE_GROUP_CONTEXT / STALE_TICKET_EDIT / STALE_RELATIONS` | Reload and review the changed state before retrying. |
| 428 | `PRECONDITION_REQUIRED` | Supply the required runtime edit/preview token or If-Match. |

Saved cross-board views have separate definition and query APIs. They do not change ticket membership or workflow. See [the custom-view contract](./api-examples.md#saved-cross-board-views) for explicit empty filters, stale-page handling and optimistic saves.
