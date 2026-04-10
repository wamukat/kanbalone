# SoloBoard

SoloBoard is an ultra-light local personal kanban web app for human and AI collaboration.

It is designed for one user, one machine, and fast local operation. It provides both a human-facing Web UI and a JSON Web API that can be used directly by agents and scripts.

## Features

- Local-only, single-process app
- Fastify-based JSON API
- Lightweight Web UI
- SQLite persistence
- No authentication
- Custom boards
- Custom status lanes
- Independent completion flag separate from lane
- Markdown ticket body
- Multiple tags with custom colors
- Numeric priority
- Blocker relationships
- One-level parent/child relationships
- Ticket comments
- Kanban and List views
- Board export/import
- SSE endpoint for board updates

## Tech Stack

- Node.js 22
- pnpm
- Fastify
- SQLite via `better-sqlite3`
- Vanilla HTML/CSS/JavaScript
- TypeScript

## Requirements

- Node.js 22
- pnpm 10

If you use Volta:

```bash
volta install node@22
volta install pnpm@10.33.0
```

## Local Development

Install dependencies:

```bash
pnpm install
```

Run in development mode:

```bash
pnpm dev
```

Build:

```bash
pnpm build
```

Run the built app:

```bash
pnpm start
```

Default URL:

```text
http://127.0.0.1:3000
```

## Docker

Build and run with Docker Compose:

```bash
docker compose up --build
```

Change the exposed port:

```bash
KANBAN_PORT=3457 docker compose up --build
```

The database file is stored under:

```text
./data/soloboard.sqlite
```

## API Docs

- OpenAPI: [docs/openapi.yaml](docs/openapi.yaml)
- AI usage guide: [docs/ai-api-guide.md](docs/ai-api-guide.md)
- Examples: [docs/api-examples.md](docs/api-examples.md)

## API Overview

Main endpoints:

- `GET /api/health`
- `GET/POST/PATCH/DELETE /api/boards`, `/api/boards/:boardId`
  - board route returns board shell only (`board`, `lanes`, `tags`)
- `GET/POST /api/boards/:boardId/lanes`
- `PATCH/DELETE /api/lanes/:laneId`
- `GET/POST /api/boards/:boardId/tags`
- `PATCH/DELETE /api/tags/:tagId`
- `GET/POST /api/boards/:boardId/tickets`
  - ticket list route returns lightweight summaries
- `GET/PATCH/DELETE /api/tickets/:ticketId`
- `GET/POST /api/tickets/:ticketId/comments`
- `GET /api/tickets/:ticketId/relations`
- `PATCH /api/tickets/:ticketId/transition`
- `POST /api/boards/:boardId/tickets/reorder`
- `GET /api/boards/:boardId/export`
- `POST /api/boards/import`
- `GET /api/boards/:boardId/events`

## Data Semantics

- `laneId` and `isCompleted` are separate fields.
- Tickets include canonical refs: `ref` and `shortRef`.
- `GET /api/boards/:boardId` returns board shell only; tickets are fetched separately.
- `GET /api/boards/:boardId/tickets` returns lightweight ticket summaries; use `GET /api/tickets/:ticketId` for full detail.
- A blocker means "this ticket is blocked by these tickets".
- Reciprocal blockers are not allowed.
- Parent/child depth is limited to one level.
- Tags are scoped to a board.

## Testing

Run tests:

```bash
pnpm test
```

Type-check:

```bash
pnpm exec tsc -p tsconfig.json --noEmit
```

## License

[MIT](LICENSE)
