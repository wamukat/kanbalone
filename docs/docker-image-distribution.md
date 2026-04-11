# Docker Image Distribution Plan

This document defines the plan for making SoloBoard distributable as a Docker image.

SoloBoard already has a working `Dockerfile` and `docker-compose.yml`. The remaining work is to raise them from local convenience tooling to a documented, repeatable distribution path.

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

Supported environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Bind address inside the container. |
| `PORT` | `3000` | Application port inside the container. |
| `SOLOBOARD_DB_FILE` | `/app/data/soloboard.sqlite` | SQLite database path. |

Recommended `docker run` usage:

```bash
docker run --rm \
  -p 3000:3000 \
  -v "$PWD/data:/app/data" \
  soloboard:local
```

Recommended Docker Compose port mapping:

```yaml
ports:
  - "${KANBAN_PORT:-3000}:3000"
```

The container should keep `PORT=3000` by default. Users should usually change only the host-side port.

## Implementation Plan

### Phase 1: Runtime Image Hardening

Update the `Dockerfile`.

- Keep the existing multi-stage build.
- Build TypeScript in a build stage.
- Install only production dependencies for the runtime stage.
- Preserve compatibility with `better-sqlite3`, which uses native bindings.
- Create `/app/data`.
- Ensure `/app/data` is writable by the runtime user.
- Run as a non-root user.
- Add a `HEALTHCHECK` that calls `GET /api/health`.

Acceptance criteria:

- `docker build -t soloboard:local .` succeeds.
- `docker run --rm -p 3000:3000 -v "$PWD/data:/app/data" soloboard:local` starts.
- `curl http://127.0.0.1:3000/api/health` returns success.
- Creating a board writes to the mounted `./data` directory.

### Phase 2: Compose Cleanup

Update `docker-compose.yml`.

- Keep the service name `soloboard`.
- Map `${KANBAN_PORT:-3000}:3000`.
- Keep `PORT: 3000` inside the container.
- Keep `SOLOBOARD_DB_FILE: /app/data/soloboard.sqlite`.
- Keep `./data:/app/data` for local persistence.
- Keep `restart: unless-stopped`.

Acceptance criteria:

- `docker compose up --build` starts the app at `http://127.0.0.1:3000`.
- `KANBAN_PORT=3457 docker compose up --build` starts the app at `http://127.0.0.1:3457`.
- The SQLite database remains under `./data/soloboard.sqlite`.

### Phase 3: User Documentation

Update `README.md`.

Document:

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

### Phase 4: Release Publishing

Add an image publishing workflow when the project is ready to publish images.

Recommended registry:

- GitHub Container Registry: `ghcr.io/<owner>/soloboard`

Recommended tags:

- `latest` for the default branch.
- `vX.Y.Z` for release tags.
- short commit SHA for traceability.

Recommended trigger policy:

- Build on pull requests without pushing.
- Push image on `main`.
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
- When using Docker Compose, the host copy is `./data/soloboard.sqlite`.
- Stop the container before copying the database for a simple consistent backup.
- Do not run multiple SoloBoard containers against the same SQLite file.
- Do not expose the app directly to the public internet; SoloBoard currently has no authentication.

## Proposed Work Order

1. Harden `Dockerfile`.
2. Clean up `docker-compose.yml`.
3. Update `README.md`.
4. Verify local Docker build and runtime behavior.
5. Add CI image build.
6. Add registry publishing after release/version policy is decided.
