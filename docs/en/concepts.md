# Data Model And Concepts

## Core Model

- Boards contain lanes, tags, and tickets.
- Lanes represent workflow position.
- `isResolved` reflects the lane’s `isCompletionLane` attribute; completion is not independently editable.
- `isArchived` hides tickets from normal board lists.
- Tags are scoped to a board.
- Comments belong to tickets.
- Blockers and parent/child links model ticket relationships.

## Remote Issue Workspace

- Kanbalone is not a replacement for a remote issue tracker. It is a local execution workspace for remote issues from systems such as GitHub Issues, GitLab, and Redmine.
- Tickets imported from a remote system include `remote` metadata.
- In a remote tracked ticket, `title` is a remote-owned read-only value.
- `bodyMarkdown` becomes the local body where you build implementation context and AI-facing instructions.
- `remote.bodyMarkdown` / `remote.bodyHtml` are read-only snapshots.
- Only comments are pushed back to the remote issue.

## Ticket State

- Moving to a completion lane resolves the ticket; moving to a normal lane reopens it. `Acceptance` is a normal lane for human acceptance; `done` is a completion lane in the standard board.
- Archived tickets are hidden from board lists by default.
- Tickets include canonical refs: `ref` and `shortRef`.
- The UI and API use the same priority scale: `1 = low`, `2 = medium`, `3 = high`, and `4 = urgent`.

## Relationships

- A blocker means "this ticket is blocked by these tickets".
- Reciprocal blockers are not allowed.
- Parent/child depth is limited to one level.

## API Semantics

- `GET /api/boards/:boardId` returns the board shell only: board, lanes, and tags.
- Tickets are fetched separately with `GET /api/boards/:boardId/tickets`.
- The ticket list route returns lightweight summaries for board rendering and automation scans.
- Use `GET /api/tickets/:ticketId` for full ticket detail.
- Use board-scoped bulk transitions to change lane and completion together.
- Use dedicated endpoints for remote import, remote refresh, and remote comment push.

## API References

- [OpenAPI](../openapi.yaml)
- [AI API guide](ai-api-guide.md)
- [API examples](api-examples.md)

## Groups

A Group is a board-local body of work with a name and optional Markdown description. It is different from a tag: a ticket can have many tags but at most one Group. Parent and child tickets always share the same membership, including archived tickets. Splitting the relationship preserves membership on both sides. Board-to-board moves clear membership only for the moved tickets.

Group activity is derived, not a stored workflow status: an empty Group is active; otherwise it is active while at least one ticket is both unresolved and unarchived. Inactive Groups retain their members and remain queryable. There is no Group completion/archive action. Deleting a Group requires zero members, including archived members.

The Group list defaults to active Groups. Ticket archive filtering is independent: specify `archived=all` when an API consumer needs every member. Ticket responses expose `groupId` and a `{id,name}` Group summary; ticket details also expose an `editToken` for optimistic editing.
