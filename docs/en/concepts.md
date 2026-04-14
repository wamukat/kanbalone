# Data Model And Concepts

## Core Model

- Boards contain lanes, tags, and tickets.
- Lanes represent workflow position.
- `isResolved` is the API field for the Resolved state and is independent from the lane.
- `isArchived` hides tickets from normal board lists.
- Tags are scoped to a board.
- Comments belong to tickets.
- Blockers and parent/child links model ticket relationships.

## Ticket State

- `laneId` and `isResolved` are separate fields. In the UI, `isResolved` is shown as Resolved.
- Archived tickets are hidden from board lists by default.
- Tickets include canonical refs: `ref` and `shortRef`.
- The UI shows priority as Low / Medium / High / Urgent. The internal API still stores numeric priority values, so automation can continue using numeric values.

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

## API References

- [OpenAPI](../openapi.yaml)
- [AI API guide](ai-api-guide.md)
- [API examples](api-examples.md)
