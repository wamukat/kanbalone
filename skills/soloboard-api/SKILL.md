---
name: soloboard-api
description: "Operate SoloBoard kanban boards through the HTTP API only. Use when the user asks Codex to inspect, create, update, move, comment on, transition, archive, import/export, or otherwise manage SoloBoard kanban tickets or boards without browser/UI interaction."
---

# SoloBoard API

Use SoloBoard's HTTP API for kanban operations. Do not use browser automation or UI clicks for this skill.

## Base URL

- Prefer a URL explicitly provided by the user, such as `http://127.0.0.1:3000/boards/4`.
- Derive the API base from that URL, for example `http://127.0.0.1:3000`.
- If no URL is provided, use `SOLOBOARD_URL` when set.
- If neither is available, default to `http://127.0.0.1:3000` and verify with `GET /api/health`.

## Tooling

Prefer the bundled helper for API calls:

```bash
python3 ~/.codex/skills/soloboard-api/scripts/soloboard_api.py --base http://127.0.0.1:3000 GET /api/boards
python3 ~/.codex/skills/soloboard-api/scripts/soloboard_api.py --base http://127.0.0.1:3000/boards/4 GET /api/health
python3 ~/.codex/skills/soloboard-api/scripts/soloboard_api.py --base http://127.0.0.1:3000 POST /api/tickets/95/comments '{"bodyMarkdown":"Started work."}'
```

The helper accepts either an origin URL or a SoloBoard page URL in `--base`; it normalizes page URLs such as `/boards/4` to the API origin. It prints formatted JSON, exits non-zero on HTTP errors, and reads JSON from the final argument or stdin. `curl` is also acceptable for simple calls.

Read [references/api.md](references/api.md) when you need exact endpoints, payload shapes, or examples.

## Quick Recipes

Create a Markdown ticket:

```bash
python3 ~/.codex/skills/soloboard-api/scripts/soloboard_api.py --base "$BASE" POST /api/boards/"$BOARD_ID"/tickets '{
  "laneId": 12,
  "title": "Implement webhook settings",
  "bodyMarkdown": "# Goal\n\nAdd webhook settings.\n\n## Acceptance\n\n- [ ] Save endpoint URL\n- [ ] Send test notification",
  "priority": 2,
  "tagIds": [],
  "blockerIds": [],
  "parentTicketId": null,
  "isResolved": false,
  "isArchived": false
}'
```

Add a Markdown comment:

```bash
python3 ~/.codex/skills/soloboard-api/scripts/soloboard_api.py --base "$BASE" POST /api/tickets/"$TICKET_ID"/comments '{
  "bodyMarkdown": "Implemented in `abc1234`.\n\nVerification:\n\n- `pnpm check` passed"
}'
```

Change priority:

```bash
python3 ~/.codex/skills/soloboard-api/scripts/soloboard_api.py --base "$BASE" PATCH /api/tickets/"$TICKET_ID" '{"priority":4}'
```

Move within a board:

```bash
python3 ~/.codex/skills/soloboard-api/scripts/soloboard_api.py --base "$BASE" PATCH /api/tickets/"$TICKET_ID"/transition '{"laneName":"doing","isResolved":false}'
```

Move to another board:

```bash
python3 ~/.codex/skills/soloboard-api/scripts/soloboard_api.py --base "$BASE" POST /api/tickets/"$TICKET_ID"/move '{"boardId":4,"laneId":12}'
```

## Operating Workflow

1. Verify the instance:
   - `GET /api/health`
   - `GET /api/meta`

2. Resolve IDs before mutation:
   - List boards with `GET /api/boards`.
   - Read the board shell with `GET /api/boards/:boardId` to map lane and tag names to IDs.
   - Find tickets with `GET /api/boards/:boardId/tickets?q=...` or `GET /api/tickets/:ticketId`.
   - If the user did not specify a board for a test operation, prefer a clearly disposable board such as `empty`, `test`, or `sandbox`. If no safe board is obvious, ask before writing.

3. Mutate with the smallest specific API call:
   - Create tickets with `POST /api/boards/:boardId/tickets`.
   - Add work logs with `POST /api/tickets/:ticketId/comments`.
   - Move between lanes by lane name with `PATCH /api/tickets/:ticketId/transition`.
   - Move between boards with `POST /api/tickets/:ticketId/move` after resolving the target `boardId` and `laneId`.
   - Archive/resolve/update with `PATCH /api/tickets/:ticketId`.

4. Verify after mutation:
   - Re-read the ticket or board.
   - Confirm the expected lane, board, priority, tags, comments, and resolved/archived state.
   - For comment creation, read both `GET /api/tickets/:ticketId` and `GET /api/tickets/:ticketId/comments` when practical.

5. Report exact IDs, refs, and API result summaries to the user.

## Safety Rules

- Ask before destructive or high-impact operations unless the user explicitly requested them: deleting boards, lanes, tags, tickets, comments, bulk complete, bulk transition, bulk archive, or import into a production board.
- Do not mutate an arbitrary existing ticket for a smoke test. If the user asks to "try" an update without naming a target ticket, create a disposable test ticket first and update that ticket.
- Remember that `POST /api/boards/import` creates a new board from an export payload; it does not merge into an existing board.
- Use priority values only in the SoloBoard range: `1` low, `2` medium, `3` high, `4` urgent.
- Preserve existing fields when updating a ticket unless the API supports a partial change for the field you need.
- Prefer comments for audit trails when doing project work: record start, commit SHA, verification, review, release, or blockers.
- Avoid parallel writes to the same board or ticket when ordering matters. Sequentially add comments or apply dependent mutations in one thread of control.

## Common Comment Templates

Work start:

```text
Started work. Scope: <short scope>.
```

Commit/update:

```text
Implemented in `<sha>`.
Verification: `<command>` passed; `<command>` passed.
```

Release:

```text
Released as `<version>`.
Release: <url>
Verification: <short verification summary>.
```

Blocked:

```text
Blocked: <reason>.
Next needed: <specific action or decision>.
```
