# Release Guide

This document describes how to publish a SoloBoard release.

## Release Outputs

A release currently publishes:

- A Git tag, for example `v0.9.0`.
- A GitHub Release for that tag.
- A Docker image on GitHub Container Registry.

Published Docker image:

```text
ghcr.io/wamukat/soloboard
```

For a tag such as `v0.9.0`, the publish workflow creates:

```text
ghcr.io/wamukat/soloboard:v0.9.0
ghcr.io/wamukat/soloboard:0.9.0
ghcr.io/wamukat/soloboard:latest
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
pnpm build
pnpm test
docker build -t soloboard:release-check .
```

Optionally verify runtime behavior:

```bash
docker run --rm -d \
  --name soloboard-release-check \
  -p 3001:3000 \
  -v soloboard-release-check-data:/app/data \
  soloboard:release-check

curl http://127.0.0.1:3001/api/health

docker rm -f soloboard-release-check
docker volume rm soloboard-release-check-data
```

## Update Documentation

When releasing a new version, update Docker usage examples that pin an image tag.

For example, replace:

```text
ghcr.io/wamukat/soloboard:v0.9.0
```

with:

```text
ghcr.io/wamukat/soloboard:vX.Y.Z
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
gh run list --repo wamukat/SoloBoard --limit 10
gh run watch <run-id> --repo wamukat/SoloBoard --exit-status
```

Expected workflows:

- `Docker Image` on `main`
- `Publish Docker Image` on `vX.Y.Z`

Both should complete successfully.

## Verify Published Image

Pull all expected tags:

```bash
docker pull ghcr.io/wamukat/soloboard:vX.Y.Z
docker pull ghcr.io/wamukat/soloboard:X.Y.Z
docker pull ghcr.io/wamukat/soloboard:latest
```

Run the published image:

```bash
docker run --rm -d \
  --name soloboard-ghcr-check \
  -p 3001:3000 \
  -v soloboard-ghcr-check-data:/app/data \
  ghcr.io/wamukat/soloboard:vX.Y.Z

curl http://127.0.0.1:3001/api/health

docker rm -f soloboard-ghcr-check
docker volume rm soloboard-ghcr-check-data
```

Expected response:

```json
{"ok":true}
```

## Create GitHub Release

Create the release after the Docker image publish succeeds.

```bash
gh release create vX.Y.Z \
  --repo wamukat/SoloBoard \
  --title "SoloBoard vX.Y.Z" \
  --notes-file /path/to/release-notes.md
```

Release notes should include:

- Published Docker image tags.
- Basic `docker run` command.
- Docker Compose command using `docker-compose.image.yml`.
- Persistence path: `/app/data/soloboard.sqlite`.
- Backup note.
- No-authentication warning.
- Current platform support.

## Package Visibility

After the first package publish, verify in GitHub Packages that:

```text
ghcr.io/wamukat/soloboard
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
