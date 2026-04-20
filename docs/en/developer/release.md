# Release Guide

This document describes how to publish a Kanbalone release.

## Release Outputs

A release currently publishes:

- A Git tag, for example `v0.9.0`.
- A GitHub Release for that tag.
- A Docker image on GitHub Container Registry.

Published Docker image:

```text
ghcr.io/wamukat/kanbalone
```

For a tag such as `v0.9.0`, the publish workflow creates:

```text
ghcr.io/wamukat/kanbalone:v0.9.0
ghcr.io/wamukat/kanbalone:0.9.0
ghcr.io/wamukat/kanbalone:latest
```

The current Docker image target is:

```text
linux/amd64
```

## Before Release

Start from a clean working tree on `main`.

```bash
git status --short
git branch --show-current
```

Run local checks:

```bash
pnpm check
pnpm exec playwright test --project=chromium
docker build -t kanbalone:release-check .
```

`pnpm check` runs OpenAPI lint, unit/API tests, TypeScript build, and GitHub Pages build. Run Playwright E2E for releases that change UI or UX behavior.

Verify that version numbers match the release tag.

```bash
node -p "require('./package.json').version"
rg -n "version: " docs/openapi.yaml
```

`package.json` `version` is used by the app footer and `/api/meta`. When releasing `vX.Y.Z`, update `package.json` to `X.Y.Z` before creating the tag.

`docs/openapi.yaml` `info.version` is the API version shown in the OpenAPI document. If the project keeps the API document version aligned with the app release, update it to the same `X.Y.Z`.

Optionally verify runtime behavior:

```bash
docker run --rm -d \
  --name kanbalone-release-check \
  -p 3001:3000 \
  -v kanbalone-release-check-data:/app/data \
  kanbalone:release-check

curl http://127.0.0.1:3001/api/health

docker rm -f kanbalone-release-check
docker volume rm kanbalone-release-check-data
```

## Update Documentation

When releasing a new version, update Docker usage examples that pin an image tag.

For example, replace:

```text
ghcr.io/wamukat/kanbalone:v0.9.0
```

with:

```text
ghcr.io/wamukat/kanbalone:vX.Y.Z
```

Also check files that may reference the release version:

```bash
rg -n "v[0-9]+\\.[0-9]+\\.[0-9]+|version" README.md README.ja.md docs package.json
```

Commit and push documentation changes before tagging.

```bash
git add README.md docs
git commit -m "Document vX.Y.Z Docker usage"
git push origin main
```

Skip this step when no release-specific documentation changes are needed.

## Create And Push Tag

Create an annotated tag from the release commit.

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

Pushing the tag triggers `.github/workflows/docker-publish.yml`.

## Verify GitHub Actions

Watch the publish workflow:

```bash
gh run list --repo wamukat/kanbalone --limit 10
gh run watch <run-id> --repo wamukat/kanbalone --exit-status
```

Expected workflows:

- `Docker Image` on `main`
- `Publish Docker Image` on `vX.Y.Z`

Both should complete successfully.

## Verify Published Image

Pull all expected tags:

```bash
docker pull ghcr.io/wamukat/kanbalone:vX.Y.Z
docker pull ghcr.io/wamukat/kanbalone:X.Y.Z
docker pull ghcr.io/wamukat/kanbalone:latest
```

Run the published image:

```bash
docker run --rm -d \
  --name kanbalone-ghcr-check \
  -p 3001:3000 \
  -v kanbalone-ghcr-check-data:/app/data \
  ghcr.io/wamukat/kanbalone:vX.Y.Z

curl http://127.0.0.1:3001/api/health

docker rm -f kanbalone-ghcr-check
docker volume rm kanbalone-ghcr-check-data
```

Expected response:

```json
{"ok":true}
```

## Create GitHub Release

Create the release after the Docker image publish succeeds.

```bash
gh release create vX.Y.Z \
  --repo wamukat/kanbalone \
  --title "Kanbalone vX.Y.Z" \
  --notes-file /path/to/release-notes.md
```

Release notes should include:

- Published Docker image tags.
- Basic `docker run` command.
- Docker Compose command using `docker-compose.image.yml`.
- Persistence path: `/app/data/kanbalone.sqlite`.
- Backup note.
- No-authentication warning.
- Current platform support.

Release notes template:

````markdown
## What's Changed

- Describe the main user-facing changes.
- Mention notable bug fixes.
- Mention test or documentation updates when useful.

## Docker Image

Published image:

```text
ghcr.io/wamukat/kanbalone:vX.Y.Z
ghcr.io/wamukat/kanbalone:X.Y.Z
ghcr.io/wamukat/kanbalone:latest
```

Run with Docker:

```bash
docker run --rm -d \
  --name kanbalone \
  -p 3000:3000 \
  -v kanbalone-data:/app/data \
  ghcr.io/wamukat/kanbalone:vX.Y.Z
```

Run with Docker Compose:

```bash
docker compose -f docker-compose.image.yml up -d
```

Persistent data is stored at `/app/data/kanbalone.sqlite`. Back up that SQLite file before upgrades. Kanbalone currently runs without built-in authentication, so expose it only on trusted networks or behind your own authentication layer.

Platform support:

```text
linux/amd64
```
````

## Package Visibility

After the first package publish, verify in GitHub Packages that:

```text
ghcr.io/wamukat/kanbalone
```

is public.

The GitHub CLI token used locally may not have `read:packages`, so the GitHub web UI is the most reliable place to confirm package visibility.

## Platform Notes

Current published platform:

```text
linux/amd64
```

Future work:

```text
linux/arm64
```

Adding `linux/arm64` requires validating native dependency behavior for `better-sqlite3`.

## Do Not Rewrite Released Tags

Do not move a release tag after it has been pushed and a Docker image has been published.

If a release needs a follow-up fix, create a new patch release instead.
