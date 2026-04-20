# SoloBoard API Reference

Use these endpoints with a base URL such as `http://127.0.0.1:3000`.

When a user gives a page URL such as `http://127.0.0.1:3000/boards/4`, use `http://127.0.0.1:3000` as the API origin and `4` as the board ID.

## System

- `GET /api/health` -> `{ "ok": true }`
- `GET /api/meta` -> `{ "name": "SoloBoard", "version": "X.Y.Z" }`

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

Move between boards:

- `POST /api/tickets/:ticketId/move`
- Body: `{ "boardId": 4, "laneId": 20 }`
- Preserves core ticket content and comments. Cross-board move keeps same-name tags only and clears parent/child/blocker relations.

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
