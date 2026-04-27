---
name: kanbalone-ticket-flow
description: Project-specific workflow for processing wamukat/kanbalone tickets from GitHub issue intake through local Kanbalone tracking, implementation, sub-agent review when requested, release, GitHub issue closure, and local board closure. Use when the user asks to handle Kanbalone project tickets, import GitHub issues into the local Kanbalone board, proceed to the next ticket step, release Kanbalone, close related GitHub/local tickets, or update the local kanban on port 3470.
---

# Kanbalone Ticket Flow

## Project Constants

- Repository: `wamukat/kanbalone`
- Workspace: `/Users/takuma/workspace/kanbalone`
- Local Kanbalone tracking board: `http://127.0.0.1:3470/boards/4`
- Local board name: `Kanbalone`
- Local board lanes: `todo`, `doing`, `done`
- Default release cadence: next patch version from the latest `vX.Y.Z` tag
- Docker image: `ghcr.io/wamukat/kanbalone`

Use the `kanbalone-api` skill for local Kanbalone API mutations. Use the GitHub plugin or `gh` CLI for upstream GitHub issues, tags, runs, and releases.

## Core Workflow

1. Identify linked work:
   - Read the user's target GitHub issue numbers, PRs, or local ticket IDs.
   - If the user only references imported local tickets, inspect their `remote` field to find the upstream GitHub issue.
   - Verify GitHub issue state and local ticket state before mutating either side.

2. Import or sync GitHub issues into local Kanbalone:
   - Use `POST /api/boards/:boardId/remote-import/preview`, then `/remote-import`, when importing a GitHub issue into board `4`.
   - Do not manually copy issue text if remote import is available.
   - After import, report both IDs: local `#NNN` and GitHub `owner/repo#N`.

3. Implement:
   - Work in `/Users/takuma/workspace/kanbalone`.
   - Prefer existing project patterns and keep changes scoped to the issue.
   - Add or update tests proportional to risk.
   - Update OpenAPI when API routes or schemas change.
   - For UI-visible changes, run relevant Playwright tests.

4. Review:
   - If the user asks for sub-agent review, spawn a focused reviewer after implementation and before finalizing.
   - Ask the reviewer for concrete findings with file/line references.
   - Address valid findings, then re-run the relevant verification.

5. Local ticket progress comments:
   - Add concise comments to the local Kanbalone tickets when implementation completes and when release completes.
   - Include scope, verification commands, commit SHA, release tag, and release URL when available.
   - Do not rely on local comments to close upstream GitHub issues.

6. Commit:
   - Check `git status --short` and `git diff --stat`.
   - Run `git diff --check`.
   - Commit implementation separately from release/version bumps when practical.
   - Use direct commit messages, e.g. `Add ticket tag reasons and structured events`, `Release v0.9.21`.

7. Release:
   - Follow `docs/en/developer/release.md`.
   - Bump `package.json` and `docs/openapi.yaml` to the release version.
   - Update pinned Docker tag references in README and docs.
   - Run:

```bash
pnpm check
pnpm exec playwright test --project=chromium
docker build -t kanbalone:release-check .
```

   - Create an annotated tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.
   - Push `main` and the tag.
   - Watch GitHub Actions, especially `Publish Docker Image`.
   - Pull `ghcr.io/wamukat/kanbalone:vX.Y.Z`, `X.Y.Z`, and `latest`.
   - Run the published image and verify `/api/health` and `/api/meta`.
   - Create the GitHub Release with release notes that include changes, Docker tags, run command, and verification.

8. Close upstream GitHub issues:
   - After the release exists, close each related GitHub issue.
   - Add a comment with:
     - release tag and release URL
     - implementation commit
     - release commit
     - short summary of what fulfilled the issue
   - Verify the GitHub issue state is `CLOSED`.

9. Close local Kanbalone tickets:
   - Add a release completion comment if not already present.
   - Move each local ticket to `done` and set `isResolved: true`:

```bash
python3 skills/kanbalone-api/scripts/kanbalone_api.py \
  --base http://127.0.0.1:3470/boards/4 \
  PATCH /api/tickets/<ticket-id>/transition \
  '{"laneName":"done","isResolved":true}'
```

   - Re-read each ticket and verify `laneId` is the `done` lane and `isResolved` is true.

10. Final response:
   - State the release URL, Docker image tags, closed GitHub issues, closed local ticket IDs, and key verification commands.
   - Explicitly mention anything not done, such as local runtime upgrade on port `3470`.

## Local Kanbalone API Recipes

Use the helper from the `kanbalone-api` skill.

Health:

```bash
python3 skills/kanbalone-api/scripts/kanbalone_api.py \
  --base http://127.0.0.1:3470/boards/4 \
  GET /api/health
```

Read local board:

```bash
python3 skills/kanbalone-api/scripts/kanbalone_api.py \
  --base http://127.0.0.1:3470/boards/4 \
  GET /api/boards/4
```

Add implementation comment:

```bash
python3 skills/kanbalone-api/scripts/kanbalone_api.py \
  --base http://127.0.0.1:3470/boards/4 \
  POST /api/tickets/<ticket-id>/comments \
  '{"bodyMarkdown":"Implemented in `<sha>`.\n\nVerification: `<command>` passed."}'
```

## GitHub Recipes

View issues:

```bash
gh issue view <number> --repo wamukat/kanbalone --json number,title,state,url
```

Close an issue after release:

```bash
gh issue close <number> --repo wamukat/kanbalone --comment 'Released in vX.Y.Z.

Release: https://github.com/wamukat/kanbalone/releases/tag/vX.Y.Z
Implementation commit: <sha> (<subject>)
Release commit: <sha> (<subject>)

<short fulfillment summary>'
```

Watch release workflow:

```bash
gh run list --repo wamukat/kanbalone --limit 10
gh run watch <run-id> --repo wamukat/kanbalone --exit-status
```

## Guardrails

- Do not mark work complete after only releasing; close both GitHub issues and local Kanbalone tickets.
- Do not close GitHub issues before a release is published unless the user explicitly asks.
- Do not move or rewrite published release tags. If a released tag has a problem, create a new patch release.
- Do not update the local `:3470` runtime silently; mention whether it has or has not been upgraded.
- Prefer exact IDs, SHAs, URLs, and command results in final status.
