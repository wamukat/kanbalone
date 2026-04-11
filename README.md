# SoloBoard

<p align="center">
  <img src="public/app-icon.svg" alt="SoloBoard app icon" width="120" height="120" />
</p>

SoloBoard is a small local kanban app for personal work, release planning, and AI-assisted development.

It runs as a single process, stores data in SQLite, and exposes both a web UI and a JSON API for scripts or agents.

![SoloBoard kanban screenshot](docs/assets/soloboard-kanban.png)

## Why SoloBoard

- Local-first board for one person and one machine.
- Kanban and list views over the same tickets.
- Tags, comments, blockers, parent/child links, done state, and archive state.
- JSON API designed to be usable by automation and AI agents.
- Docker image available from GitHub Container Registry.

## Quick Start

Run the published Docker image:

```bash
docker run --rm \
  -p 3000:3000 \
  -v soloboard-data:/app/data \
  ghcr.io/wamukat/soloboard:v0.9.1
```

Open:

```text
http://127.0.0.1:3000
```

Use `ghcr.io/wamukat/soloboard:latest` when you want the newest released image instead of a pinned version.

## Docker Compose

Run the published image with Compose:

```bash
docker compose -f docker-compose.image.yml up
```

Change the host port:

```bash
KANBAN_PORT=3457 docker compose -f docker-compose.image.yml up
```

The app stores its SQLite database at:

```text
/app/data/soloboard.sqlite
```

The provided Compose file uses a Docker named volume, `soloboard-data`, for persistence.

On Windows, use Docker Desktop or Rancher Desktop with WSL2 and keep the named volume setup.

SoloBoard does not include authentication. Do not expose it directly to untrusted networks.

## Local Development

```bash
pnpm install
pnpm dev
```

Default URL:

```text
http://127.0.0.1:3000
```

## Documentation

- [Development](docs/development.md)
- [Data model and concepts](docs/concepts.md)
- [Docker image distribution](docs/docker-image-distribution.md)
- [Release process](docs/release.md)
- [Performance tooling](docs/performance.md)
- [OpenAPI](docs/openapi.yaml)
- [AI API guide](docs/ai-api-guide.md)
- [API examples](docs/api-examples.md)

## Tech Stack

- Node.js 22
- Fastify
- SQLite via `better-sqlite3`
- TypeScript
- Vanilla HTML/CSS/JavaScript
- Lucide-style SVG icons

## License

[MIT](LICENSE)
