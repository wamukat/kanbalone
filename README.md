# Kanbalone

[日本語](README.ja.md)

<p align="center">
  <img src="public/app-icon.svg" alt="Kanbalone app icon" width="120" height="120" />
</p>

Kanbalone is a small local kanban app optimized for individuals who develop together with AI.

You can start it quickly with Docker and use it right away. In addition to a browser-based web UI for humans, it also provides a JSON API that is easy for scripts and AI agents to use.

![Kanbalone kanban screenshot](docs/assets/kanbalone-kanban.png)

![Kanbalone demo showing ticket creation, tags, drag and drop, search, filters, comments, and list view](docs/assets/kanbalone-demo.webp)

## Why Kanbalone

- Optimized for one person and one machine working with AI, without user or permission management.
- All data is stored locally.
- Multiple boards for different work categories.
- Tags, comments, and ticket dependencies: blockers and parent/child tickets.
- Lightweight JSON API designed for automation and AI agents.
- Create the first board and start managing tasks immediately without extra setup.

## Quick Start

Run the published Docker image:

```bash
docker run --rm \
  -p 3000:3000 \
  -v kanbalone-data:/app/data \
  ghcr.io/wamukat/kanbalone:v0.9.15
```

Open:

```text
http://127.0.0.1:3000
```

User guide:

```text
https://wamukat.github.io/kanbalone/
```

Use `ghcr.io/wamukat/kanbalone:latest` when you want the newest released image instead of a pinned version.

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
/app/data/kanbalone.sqlite
```

The provided Compose file uses a Docker named volume, `kanbalone-data`, for persistence.

On Windows, use Docker Desktop or Rancher Desktop with WSL2 and keep the named volume setup.

Kanbalone does not include authentication. Do not expose it directly to untrusted networks.

## Local Development

```bash
pnpm install
pnpm dev
```

Default URL:

```text
http://127.0.0.1:3000
```

## Codex Skill

Kanbalone includes a Codex skill for API-only kanban operations:

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/kanbalone-api "${CODEX_HOME:-$HOME/.codex}/skills/"
```

When you use only the Docker image, fetch the skill from the matching GitHub release tag to the host running Codex:

```bash
tmpdir=$(mktemp -d)
curl -L https://github.com/wamukat/kanbalone/archive/refs/tags/v0.9.15.tar.gz \
  | tar -xz -C "$tmpdir" kanbalone-0.9.15/skills/kanbalone-api
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R "$tmpdir"/kanbalone-0.9.15/skills/kanbalone-api "${CODEX_HOME:-$HOME/.codex}/skills/"
rm -rf "$tmpdir"
```

The skill runs from the host and talks to the Kanbalone HTTP API, for example `http://127.0.0.1:3000`.

## Documentation

Published user guide:

- <https://wamukat.github.io/kanbalone/>

For users and API clients:

- [User guide](docs/en/user-guide.md)
- [Data model and concepts](docs/en/concepts.md)
- [AI API guide](docs/en/ai-api-guide.md)
- [API examples](docs/en/api-examples.md)
- [OpenAPI](docs/openapi.yaml)

For developers and maintainers:

- [Development](docs/en/developer/development.md)
- [Docker image distribution](docs/en/developer/docker-image-distribution.md)
- [Release process](docs/en/developer/release.md)
- [Performance tooling](docs/en/developer/performance.md)
- [Dialog button policy](docs/en/developer/dialog-button-policy.md)
- [Design system](docs/en/developer/design-system.md)

## Tech Stack

- Node.js 22
- Fastify
- SQLite via `better-sqlite3`
- TypeScript
- Vanilla HTML/CSS/JavaScript
- Lucide-style SVG icons

## License

[MIT](LICENSE)
