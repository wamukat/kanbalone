# Migrating Completion State To Lanes

This guide covers the change from per-ticket completion flags to completion determined by the ticket's lane. It is intended for users and for AI agents asked to perform an upgrade.

**Target release: v0.10.0.** This guide applies when upgrading an existing v0.9.x or earlier database to v0.10.0. Use the official v0.10.0 tag/image, or a build verified to contain the same migration. Commands below are examples; reading this guide is not an instruction to execute an upgrade.

## 1. What Changes

| Item | Before | After |
| --- | --- | --- |
| Source of completion | Ticket `isResolved` | Lane `isCompletionLane` |
| Resolve a ticket | Set its completion flag | Move to a completion lane |
| Reopen a ticket | Clear its completion flag | Move to a normal lane |
| Archive | Independent from completion | Still independent; archive/restore does not change completion |
| Lane names | Independent from completion | Names do not determine completion; a lane named Done can be normal |

In SQLite, `lanes.is_completion_lane` becomes the source of truth. `tickets.is_resolved` is retained as an indexed projection maintained by database triggers, rather than independent state. Stop directly updating ticket completion columns. API responses keep `isResolved` and the compatibility alias `isCompleted`.

## 2. Automatic Migration On First Startup

Migration runs when the new application first opens the existing database. No separate migration command or board re-import is needed.

1. All existing lanes become normal lanes (`isCompletionLane: false`), regardless of names such as Done.
2. For each board containing resolved tickets, a new completion lane named `Completed (migration)` is appended. Name collisions use `Completed (migration) 2`, `3`, and so on. An existing lane is never reused.
3. Only tickets whose old completion flag is true move to the new lane on the same board. Archived resolved tickets are included.
4. Unresolved tickets remain in their original lanes. No lane is added to a board with zero resolved tickets.
5. Each moved ticket receives migration activity containing its original lane ID and position and its destination lane ID.

| Before | Location after migration | State after migration |
| --- | --- | --- |
| Unresolved in Done | Original Done | Unresolved |
| Resolved in Review | New Completed (migration) | Resolved |
| Resolved and archived in Done | New Completed (migration) | Resolved and archived |
| Unresolved and archived in Todo | Original Todo | Unresolved and archived |

The migration preserves flags; it does not reinterpret whether work was actually finished. Individual content review is unnecessary for migration. Parents and children move according to their own old flags, while their relationship is preserved.

### Preserved And Changed Data

- Preserved: ticket IDs, board membership, completion/archive states, parent-child relationships, bodies, comments, tags, dependencies/related links, and external references.
- Preserved: existing lane IDs, names and ordering; unresolved ticket lane membership; relative order of remaining tickets.
- Changed: resolved ticket lane IDs, positions and update timestamps; positions in source lanes are compacted. Affected board timestamps and activity also change.
- Destination ordering: archive state, original lane position, original lane ID, original ticket position, then ticket ID. Archived tickets follow non-archived tickets.

Schema changes, movement and activity are one transaction; failure rolls back the entire change. The presence of `lanes.is_completion_lane` marks migration as already applied. Restarting does not add more migration lanes. Do not delete the column or triggers to force another migration.

## 3. Contract For An AI Performing The Upgrade

Provide these inputs before executing changes. Do not print credentials in logs or reports.

| Required input | What to establish |
| --- | --- |
| Instance | Actual API base URL; do not assume a port |
| Runtime | Docker/Compose/direct execution, service name and startup method |
| Storage | Actual SQLite path and persistent volume/bind mount; older installations may use soloboard.sqlite |
| Source and target builds | Recoverable old image/source and a confirmed migration-capable new build |
| Backup | Destination, capacity and a workable database restore method |
| Scope | Instance to upgrade, downtime and whether later workflow reconfiguration is included |

Execution rules:

- Do not guess the instance, database or target build. Resolve missing inputs before modifying that resource.
- Pause writes from users, AI clients and automation. Never run the old and new application against the same DB simultaneously.
- Do not add completion reclassification, converting an existing Done lane, ticket movement/deletion, or re-import to the automatic migration.
- If migration is already applied, verify the instance; do not alter its schema to repeat migration.
- Do not start the upgrade if backup fails. Do not resume normal usage after startup, integrity or reconciliation failures. Report the failure and a recovery plan.
- Never treat example IDs or counts as actual instance data. Read them from the target environment.

## 4. Preparation And Backup

1. Identify the instance using `GET /api/health`, `GET /api/meta` and `GET /api/boards`.
2. With writes paused, save each board's lanes and `GET /api/boards/:boardId/tickets?archived=all`. Do not add search, lane, completion or other filters; obtain every ticket.
3. Record each ticket's ID, boardId, laneId, isResolved (or legacy isCompleted), isArchived and parentTicketId, and each existing lane's ID, name and position. Count boards containing resolved tickets.
4. Stop the app and every DB writer. Back up the entire DB, and retain the old image identity and startup configuration. Keep configuration backups private because they may contain credentials.
5. Confirm the backup can be opened and `PRAGMA integrity_check` returns `ok`. When possible, rehearse migration on an isolated copy before touching the live DB.

For SQLite WAL mode, copying only a running `.sqlite` file is not a valid backup. Copy the DB, `-wal` and `-shm` together after all writers stop, or use SQLite's consistent backup API. A board JSON Export is not a DB backup: Import creates another board and does not guarantee original IDs or full restoration of external integration data.

Recording the old image identity is not enough: verify it can be retrieved by digest or retained locally. If needed, save it with `docker image save` before upgrading, and do not remove it until recovery has been verified.

### Docker Stop-And-Copy Example

This example applies only to a confirmed container whose DB is under `/app/data`. Replace the container name and absolute private backup path. For Compose, verify the project/service; do not use `down -v`.

```bash
MIGRATION_CONTAINER='replace-with-your-container'
MIGRATION_BACKUP='/absolute/private/path/to/new-backup-directory'
umask 077
(
set -eu
mkdir -m 700 "$MIGRATION_BACKUP"
docker inspect --format '{{.Config.Image}} {{.Image}}' "$MIGRATION_CONTAINER" > "$MIGRATION_BACKUP/image.txt"
docker stop "$MIGRATION_CONTAINER"
docker cp "$MIGRATION_CONTAINER:/app/data" "$MIGRATION_BACKUP/data"
)
```

Check each command, including `mkdir`, succeeded before proceeding. Do not keep the only backup on the DB's own volume. If the DB lives elsewhere, back up that location. The same requirements for stopping writes, WAL consistency and private storage apply to bind mounts and direct execution.

The following checks the copied DB and creates a standalone backup for restoration. Run it on a host with Python 3. Replace `kanbalone.sqlite` with the actual filename.

```bash
python3 - "$MIGRATION_BACKUP/data/kanbalone.sqlite" "$MIGRATION_BACKUP/before.sqlite" <<'PY'
import sqlite3, sys
from pathlib import Path
source, target = map(Path, sys.argv[1:])
if not source.is_file() or target.exists():
    raise SystemExit("Source missing or destination already exists")
with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as src:
    if src.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise SystemExit("Source integrity check failed")
    with sqlite3.connect(target) as dst:
        src.backup(dst)
        if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise SystemExit("Backup integrity check failed")
target.chmod(0o600)
print("Backup verified")
PY
```

The stopped-state backup is authoritative. If writes occurred between the API snapshot and shutdown, rebuild the comparison baseline from the stopped DB rather than using the stale API snapshot.

## 5. Start The New Version

1. Confirm the target includes this migration and uses the original persistent volume and DB path. Prepare the new executable/image before downtime when possible.
2. Keep the old process stopped, switch to the confirmed new image/source and start only the new application. Starting against a different, empty DB is not successful migration.
3. Check startup logs and `GET /api/health`. If startup fails, investigate storage capacity, permissions or configuration without resuming usage.
4. Keep user, AI and automation writes paused until reconciliation below passes.

## 6. Required Post-Migration Checks

Read all lanes and `tickets?archived=all` from the same instance again. Use `GET /api/tickets/:ticketId` when checking bodies and relationships. Inspect the stopped DB or a consistent copy for database-level checks.

| Check | Passing condition |
| --- | --- |
| All tickets retained | Same ticket ID set, count and board membership |
| States retained | Each ticket has its original completion and archive state |
| Unresolved placement | Every unresolved ticket keeps its laneId |
| Resolved placement | Resolved tickets move to a new completion lane in the same board, not a reused existing lane |
| Lanes | Existing IDs, names and order retained; all existing lanes normal. Number added equals the number of boards previously containing resolved tickets |
| Related data | Parent-child links, comments, tags, dependencies/related links and external references retained |
| New completion rule | Every ticket's isResolved equals its lane's isCompletionLane |
| Activity | Moved tickets have migration activity with their original lane and position |
| DB consistency | `PRAGMA integrity_check` returns `ok`; `PRAGMA foreign_key_check` returns zero rows |
| Restart | Ticket states and lane counts unchanged; no extra migration lanes |

These conditions apply **immediately after initial migration, before usage resumes**. Do not reapply initial-migration expectations such as “all existing lanes are normal” to an already migrated DB that has since been reconfigured. For that case, report that initial migration was skipped and verify the upgrade has not unexpectedly changed the current state.

Resolved tickets becoming grouped in the new lane is expected. Resolved and archived tickets may be hidden by normal list filters. Verify with archived tickets included before concluding that data is missing.

## 7. Update API Clients And AI Skills

- Responses retain `isResolved`/`isCompleted`, and `resolved`/`completed` filters remain supported.
- Resolve/reopen by moving tickets. Determine destinations by `isCompletionLane`, not names.
- Request `isResolved`/`isCompleted` fields are compatibility assertions. Conflicting aliases or a value inconsistent with the destination lane return 409 without changes. Omit them in new requests.
- Legacy `bulk-complete` cannot independently change completion. It accepts already-matching values only and returns 409 on mismatch. Replace it with lane movement such as `bulk-transition`.
- Changing a lane's completion attribute affects every ticket in it, including archived tickets. Do not use it as a shortcut to resolve one ticket.
- Use `PUT /api/boards/:boardId/completion-lanes` for reviewed board-wide configuration. Send the complete selection and expectations; on 409 re-read and review. Do not bypass checks with individual PATCH calls.
- Update the distributed `kanbalone-api` skill, reference and helper together. The new endpoint uses PUT, which older helpers may not support. Updating the repository does not update skills already installed in each AI environment.

### API Contract: Before And After

**Setting a completion flag no longer changes completion. Resolve or reopen by selecting a destination lane.** In this version, request fields `isResolved`/`isCompleted` are still accepted for compatibility, but only as assertions matching the lane. They cannot independently change state. Response fields are not removed.

| Operation or field | Before | After / client change |
| --- | --- | --- |
| Create `POST /api/boards/:boardId/tickets` | Lane and completion flag set independently | Set the destination `laneId`; omit completion flags |
| Update `PATCH /api/tickets/:ticketId` | Set `isResolved: true/false` to resolve/reopen | Select a completion/normal `laneId`. If omitted, the current lane determines completion |
| Transition `PATCH /api/tickets/:ticketId/transition` | Send `laneName` and a completion flag | Send `laneName` only. Completion follows the destination lane |
| Bulk completion `POST /api/boards/:boardId/tickets/bulk-complete` | Resolve/reopen using a flag | Deprecated; replace with lane movement such as `bulk-transition` |
| Bulk transition `POST /api/boards/:boardId/tickets/bulk-transition` | Send `ticketIds`, `laneName` and a completion flag | Send `ticketIds` and `laneName`; omit completion flags |
| List lanes `GET /api/boards/:boardId/lanes` | No completion attribute | Select destinations using `isCompletionLane`, never the name |
| Read fields and filters | Completion flags and filters | `isResolved`/`isCompleted` and `resolved`/`completed` remain; values derive from lanes |
| Archive | Hide tickets using `isArchived` | Unchanged and independent; archiving does not resolve a ticket |

### Request Migration Examples

These examples pair API paths with JSON bodies. Fetch lanes first. Assume board 1 has lane 12 with `isCompletionLane: true` and lane 11 with `false`, verified from the API. Replace example IDs and names with actual values. An existing `Done` lane is not necessarily a completion lane after automatic migration.

**Resolve/reopen one ticket** — change the body of the same `PATCH /api/tickets/123` request.

| Intent | Old request | New request |
| --- | --- | --- |
| Resolve | `{"isResolved":true}` | `{"laneId":12}` |
| Reopen | `{"isResolved":false}` | `{"laneId":11}` |
| Create resolved (`POST /api/boards/1/tickets`) | `{"title":"Task","laneId":11,"isResolved":true}` | `{"title":"Task","laneId":12}` |

**Resolve multiple tickets** — change both the endpoint and body. Here the verified name of completion lane 12 is `Completed (migration)`.

Before (`POST /api/boards/1/tickets/bulk-complete`):

```json
{"ticketIds":[123,124],"isResolved":true}
```

After (`POST /api/boards/1/tickets/bulk-transition`):

```json
{"ticketIds":[123,124],"laneName":"Completed (migration)"}
```

To reopen, use the same `bulk-transition` endpoint with a verified normal lane name. Movement changes placement too; when several destinations are possible, choose the intended workflow destination before sending the request.

### 409 Responses For Old Clients

- Sending only `{"isResolved":true}` for a ticket in a normal lane returns 409. The server does not automatically choose a completion lane and move it.
- Sending a conflicting destination and flag, such as `{"laneId":12,"isResolved":false}`, also returns 409. The server does not ignore the flag and move it.
- Conflicting values for `isResolved` and `isCompleted` return 409.
- Matching legacy flags are accepted, but new clients should omit them. `bulk-complete` accepts a request only when all selected tickets already match the requested state; any mismatch fails the entire operation without changes.

On 409, re-read the current lanes and attributes, confirm the intended destination, and replace the request with lane movement without completion flags. Repeating the flag or directly modifying the DB is not a solution.

See the [AI API guide](./ai-api-guide.md) and [API examples](./api-examples.md). Do not attempt to fix 409 by editing DB columns or repeatedly forcing `isResolved: true`.

## 8. Later Lane Reorganization Is A Separate Operation

The auto-created lane can be used as-is or renamed. Renaming alone does not change completion. The sidebar gear panel shows the current selection; Change opens the checklist and reviews effects before saving.

- If unresolved tickets remain in the old Done lane, making it a completion lane resolves all of them. Do not do this automatically as part of migration.
- Keep Acceptance normal when using it for human review, separating finished AI work from human acceptance.
- Moving migrated tickets back to an old normal lane reopens them. Do not move them merely to restore their visual placement.
- Removing a completion designation reopens every ticket in that lane, including archived tickets.

Importing an old JSON Export follows the flag-preservation rule for lanes without completion attributes. However, Import creates a new board; it is not an in-place DB migration or restore. New-format imports preserve lane attributes and fail atomically if ticket compatibility flags conflict with them.

## 9. Failure And Rollback

A startup migration failure rolls back its transaction. Fix the cause and retry the new app if appropriate, but never fabricate a partially migrated schema to mark it as complete.

To return to the old version, **reverting the image alone is insufficient**.

1. Stop the new app and all writers.
2. Save the current post-migration DB separately. If usage resumed, restoring the pre-migration backup loses subsequent changes; confirm the recovery scope with the user.
3. Restore the verified pre-migration backup to the confirmed original DB path, retaining ownership and permissions.
4. For a standalone `before.sqlite` restore, move aside the target DB's post-migration `-wal`/`-shm` files while all processes are stopped; do not mix them with the restored DB. For a DB/WAL/SHM set, use files from the same backup instant. Do not touch another database's files.
5. Restore the recorded old image/source and startup configuration, start it, and verify health, database integrity and agreement with pre-migration data.
6. Resume usage only after recovery is verified. JSON Import or manually reversing ticket moves is not a substitute for DB restoration.

## 10. AI Completion Report

Report measured values and unresolved work using this structure. `null` means unverified, not passed. Exclude secrets and ticket bodies.

```json
{
  "status": "not_started",
  "instance": "confirmed API base URL",
  "sourceBuild": "recorded old image digest or commit",
  "targetBuild": "confirmed migration-capable image digest or commit",
  "backupPath": "verified private backup location",
  "migrationApplied": null,
  "ticketsBefore": null,
  "ticketsAfter": null,
  "resolvedTicketsMoved": null,
  "completionLanesCreated": null,
  "completionAndArchivePreserved": null,
  "unresolvedLaneMembershipPreserved": null,
  "relationshipsPreserved": null,
  "integrityCheck": null,
  "foreignKeyViolations": null,
  "restartIdempotent": null,
  "clientsAndSkillsUpdated": null,
  "unresolvedItems": []
}
```

Use `not_started`, `blocked`, `verified` or `rolled_back` for `status`. Set `verified` only when all required comparisons pass, and disclose outstanding work such as skill installation or resuming usage.
