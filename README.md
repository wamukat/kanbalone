# SoloBoard

<p align="center">
  <img src="public/app-icon.svg" alt="SoloBoard app icon" width="120" height="120" />
</p>

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

Run tests:

```bash
pnpm test
```

Default URL:

```text
http://127.0.0.1:3000
```

## Docker

Detailed distribution design: [docs/docker-image-distribution.md](docs/docker-image-distribution.md)
Release process: [docs/release.md](docs/release.md)

Build the image:

```bash
docker build -t soloboard:local .
```

Pull the published image:

```bash
docker pull ghcr.io/wamukat/soloboard:v0.9.0
```

Run with Docker:

```bash
mkdir -p data
docker run --rm \
  -p 3000:3000 \
  -v "$PWD/data:/app/data" \
  ghcr.io/wamukat/soloboard:v0.9.0
```

Use `ghcr.io/wamukat/soloboard:latest` when you want the newest released image instead of a pinned version.

Run with Docker Compose:

```bash
docker compose up --build
```

Run the published image with Docker Compose:

```bash
docker compose -f docker-compose.image.yml up
```

The Compose project name is set to `soloboard`, so the default container name is predictable:

```text
soloboard-soloboard-1
```

To run a second independent copy on the same machine, override the project name:

```bash
docker compose -p soloboard-dev up --build
```

Change the host port:

```bash
KANBAN_PORT=3457 docker compose up --build
```

The database file is stored under:

```text
/app/data/soloboard.sqlite
```

Docker Compose stores it in the `soloboard-data` named volume by default. For a host-directory bind mount instead, replace the Compose volume with:

```yaml
volumes:
  - ./data:/app/data
```

When using a bind mount on Linux, create `./data` before starting the container and make sure it is writable by UID `1000`, the `node` user inside the image.

Plain `docker run` with the command above stores the host copy under:

```text
./data/soloboard.sqlite
```

The container listens on port `3000`. `KANBAN_PORT` changes only the host-side port mapping.

Back up the app by stopping the container and copying the SQLite database file.

SoloBoard does not include authentication. Do not expose it directly to untrusted networks.

## Performance Tooling

SoloBoard includes local-only performance scripts for large-board testing.

Seed a 1,000-ticket board:

```bash
pnpm perf:seed
```

Replace an existing perf board with the same name:

```bash
SOLOBOARD_PERF_OVERWRITE=true pnpm perf:seed
```

Seed a 5,000-ticket board:

```bash
SOLOBOARD_PERF_BOARD="Perf 5000" SOLOBOARD_PERF_TICKETS=5000 SOLOBOARD_PERF_OVERWRITE=true pnpm perf:seed
```

Run the benchmark suite:

```bash
pnpm perf:benchmark
SOLOBOARD_PERF_BOARD="Perf 5000" pnpm perf:benchmark
```

Notes:

- `perf:seed` creates tags, tickets, comments, blockers, and one-level parent/child links through `POST /api/boards/import`.
- `perf:seed` will not delete an existing board with the same name unless `SOLOBOARD_PERF_OVERWRITE=true` is set.
- `perf:benchmark` expects `agent-browser` to be available on `PATH`, or `AGENT_BROWSER_BIN` to point to it.
- Reports are written under `data/perf-seed-report.json` and `data/perf-benchmark-report.json`.

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
- `PATCH/DELETE /api/comments/:commentId`
- `GET /api/tickets/:ticketId/activity`
- `GET /api/tickets/:ticketId/relations`
- `PATCH /api/tickets/:ticketId/transition`
- `POST /api/boards/:boardId/tickets/bulk-complete`
- `POST /api/boards/:boardId/tickets/bulk-transition`
- `POST /api/boards/:boardId/tickets/reorder`
- `GET /api/boards/:boardId/export`
- `POST /api/boards/import`
- `GET /api/boards/:boardId/events`

## Data Semantics

- `laneId` and `isCompleted` are separate fields.
- Tickets include canonical refs: `ref` and `shortRef`.
- `GET /api/boards/:boardId` returns board shell only; tickets are fetched separately.
- `GET /api/boards/:boardId/tickets` returns lightweight ticket summaries; use `GET /api/tickets/:ticketId` for full detail.
- The lightweight ticket summary route is intended for board rendering, filtering, automation scans, and other large-board workflows.
- Use board-scoped bulk endpoints for batch completion and lane-name-based transitions to keep automation round-trips low.
- Archived tickets are hidden from board lists by default; use the archived filter when you need them.
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
