# Docker Image Distribution Design

This document defines the Docker image distribution design for SoloBoard.

SoloBoard provides a production-oriented Dockerfile and a Docker Compose file for local deployment.

## Goals

- Provide a Docker image that runs with `docker run`.
- Keep user data outside the image and persist it through a mounted volume.
- Make the runtime image production-oriented, predictable, and reasonably small.
- Run the application as a non-root user.
- Expose a health check through the existing `GET /api/health` endpoint.
- Keep Docker Compose simple for local users.
- Prepare a future publishing path for GitHub Container Registry or another OCI registry.

## Non-Goals

- Add authentication.
- Add multi-user deployment support.
- Add cloud-specific deployment manifests.
- Replace the local SQLite persistence model.
- Support multiple app containers sharing the same SQLite database.

SoloBoard is still intended to be a single-user, single-process app.

## Runtime Contract

The Docker image should expose the following contract.

| Item | Value |
| --- | --- |
| Container port | `3000` |
| Default host | `0.0.0.0` |
| Data directory | `/app/data` |
| Default database file | `/app/data/soloboard.sqlite` |
| Health endpoint | `GET /api/health` |

Published image:

```text
ghcr.io/wamukat/soloboard
```

Supported environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Bind address inside the container. |
| `PORT` | `3000` | Application port inside the container. |
| `SOLOBOARD_DB_FILE` | `/app/data/soloboard.sqlite` | SQLite database path. |

Recommended `docker run` usage:

```bash
mkdir -p data
docker run --rm \
  -p 3000:3000 \
  -v "$PWD/data:/app/data" \
  ghcr.io/wamukat/soloboard:latest
```

When using a bind mount on Linux, the host directory must be writable by UID `1000`, the `node` user inside the image.

Recommended Docker Compose port mapping:

```yaml
name: soloboard

services:
  soloboard:
    # ...
    ports:
      - "${KANBAN_PORT:-3000}:3000"
    volumes:
      - soloboard-data:/app/data

volumes:
  soloboard-data:
```

For users who want to run the published image without building locally, use:

```bash
docker compose -f docker-compose.image.yml up
```

The container should keep `PORT=3000` by default. Users should usually change only the host-side port.

Compose should not set `container_name`. Compose project names are the standard isolation mechanism, and users can override the project name with `docker compose -p <name> up`. With the default project name, the container appears as `soloboard-soloboard-1` instead of an opaque random name.

Compose should default to a named volume instead of `./data:/app/data`. A bind mount is convenient for direct file access, but on Linux a missing host directory can be created as root-owned before the non-root container starts. A Docker-managed named volume avoids that first-run permission trap.

## Implemented Design

### Runtime Image

The `Dockerfile` should keep these properties.

- Add the Dockerfile syntax directive.
- Keep the existing multi-stage build.
- Build TypeScript in a build stage.
- Install only production dependencies for the runtime stage.
- Preserve compatibility with `better-sqlite3`, which uses native bindings.
- Create `/app/data`.
- Ensure `/app/data` is writable by the runtime user.
- Run as a non-root user.
- Add OCI image labels for title, description, and license.
- Add a `HEALTHCHECK` in exec form that calls `GET /api/health`.
- Keep `.dockerignore` focused so local data, test output, and development files are not sent as build context.

Acceptance criteria:

- `docker build -t soloboard:local .` succeeds.
- `docker run --rm -p 3000:3000 -v "$PWD/data:/app/data" soloboard:local` starts.
- `curl http://127.0.0.1:3000/api/health` returns success.
- Creating a board writes to the mounted `./data` directory.

### Compose

The Compose file should keep these properties.

- Set top-level `name: soloboard` for predictable Compose resource names.
- Keep the service name `soloboard`.
- Do not set `container_name`; it can collide with other Compose projects and prevents Compose from owning naming cleanly.
- Map `${KANBAN_PORT:-3000}:3000`.
- Keep `PORT: 3000` inside the container.
- Keep `SOLOBOARD_DB_FILE: /app/data/soloboard.sqlite`.
- Use a named volume for default local persistence.
- Document bind mounts as an explicit option for users who want direct host-file access.
- Keep `restart: unless-stopped`.

Acceptance criteria:

- `docker compose up --build` starts the app at `http://127.0.0.1:3000`.
- `docker compose ps` shows a predictable service container name such as `soloboard-soloboard-1`.
- `KANBAN_PORT=3457 docker compose up --build` starts the app at `http://127.0.0.1:3457`.
- The SQLite database is persisted in the `soloboard-data` named volume by default.

### User Documentation

`README.md` should document:

- Build and run with Docker Compose.
- Build and run with plain Docker.
- How to change the host port.
- Where data is stored.
- How to back up the SQLite database.
- That SoloBoard has no authentication and should not be exposed to untrusted networks.

Acceptance criteria:

- A user can run the app from README instructions without reading the Dockerfile.
- The persistence behavior is explicit.
- The security assumption is explicit.

### Release Publishing

Add an image publishing workflow when the project is ready to publish images.

Recommended registry:

- GitHub Container Registry: `ghcr.io/wamukat/soloboard`

Recommended tags:

- `vX.Y.Z` from the Git tag, for example `v0.9.0`.
- `X.Y.Z` from the semantic version, for example `0.9.0`.
- `latest` for the newest released image.

Recommended trigger policy:

- Build on pull requests without pushing.
- Push versioned image on Git tags matching `v*`.

Acceptance criteria:

- CI builds the Docker image for every PR.
- A release tag publishes a versioned image.
- The image can be pulled and run using the documented `docker run` command.

## Verification Checklist

Before considering Docker distribution complete, run:

```bash
pnpm build
pnpm test
docker build -t soloboard:local .
docker run --rm -d \
  --name soloboard-test \
  -p 3000:3000 \
  -v "$PWD/data:/app/data" \
  soloboard:local
curl http://127.0.0.1:3000/api/health
docker rm -f soloboard-test
docker compose up --build
```

For UI confidence, run the existing E2E test against the Docker-served app or keep the current Playwright web server flow as a regression check:

```bash
pnpm test:e2e
```

## Operational Notes

- The SQLite database is the main backup target.
- The default database path is `/app/data/soloboard.sqlite`.
- When using the default Docker Compose setup, the database is stored in the `soloboard-data` named volume.
- When using a bind mount, the host copy is typically `./data/soloboard.sqlite`.
- Stop the container before copying the database for a simple consistent backup.
- Do not run multiple SoloBoard containers against the same SQLite file.
- Do not expose the app directly to the public internet; SoloBoard currently has no authentication.

## Platform Follow-Up

The published image is pullable from GHCR. The current publishing workflow builds `linux/amd64` only. Add `linux/arm64` after verifying native dependency compatibility for `better-sqlite3` on the ARM64 runtime image.
