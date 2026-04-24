# Data Model And Concepts

## Core Model

- Boards contain lanes, tags, and tickets.
- Lanes represent workflow position.
- `isResolved` is the API field for the Resolved state and is independent from the lane.
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

- `laneId` and `isResolved` are separate fields. In the UI, `isResolved` is shown as Resolved.
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
- Use board-scoped bulk endpoints for batch resolved state and lane-name-based transitions.
- Use dedicated endpoints for remote import, remote refresh, and remote comment push.

## API References

- [OpenAPI](../openapi.yaml)
- [AI API guide](ai-api-guide.md)
- [API examples](api-examples.md)
