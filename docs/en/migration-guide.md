# Migrating Completion State To Lanes

This guide covers the change from per-ticket completion flags to completion determined by the ticket's lane. It is intended for users and for AI agents asked to perform an upgrade.

**Lane-based completion migration was introduced in v0.10.0.** It applies when upgrading a v0.9.x or earlier database to v0.10.0 or later.

- **v1.0.0-rc.2 → v1.0.0**: no additional API or storage-format changes. Back up before upgrading as usual.
- **v0.11.0 → v1.0.0**: update clients using the removal table in section 7; old DB migration and import support remain.
- **v0.10.0 → v0.11.0**: follow the [Group migration](#group-migration).
- **v0.9.x or earlier → v0.11.0**: follow both the completion migration and Group migration. Verify the destination lanes of resolved tickets against the completion migration rules.

Use the official tag/image for your target release. Commands below are examples; reading this guide is not an instruction to execute an upgrade.

## 1. What Changes

| Item | Before | After |
| --- | --- | --- |
| Source of completion | Ticket `isResolved` | Lane `isCompletionLane` |
| Resolve a ticket | Set its completion flag | Move to a completion lane |
| Reopen a ticket | Clear its completion flag | Move to a normal lane |
| Archive | Independent from completion | Still independent; archive/restore does not change completion |
| Lane names | Independent from completion | Names do not determine completion; a lane named Done can be normal |

In SQLite, `lanes.is_completion_lane` becomes the source of truth. `tickets.is_resolved` is retained as an indexed projection maintained by database triggers, rather than independent state. Stop directly updating ticket completion columns. API responses use read-only `isResolved`. v0.10.0–v0.11.0 also returned the compatibility alias `isCompleted`; see section 7 for its removal in v1.0.0.

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
| Storage | Actual SQLite path, its sibling `attachments/` directory if present, and persistent volume/bind mount. Older installations may use soloboard.sqlite |
| Source and target builds | Recoverable old image/source and a confirmed migration-capable new build |
| Backup | Destination, capacity and a way to restore the database with its image files |
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
4. Stop the app and every DB writer. Back up the SQLite database together with its attachment files. Retain the old image identity and startup configuration. Keep configuration backups private because they may contain credentials.
5. Confirm the backup can be opened and `PRAGMA integrity_check` returns `ok`. When possible, rehearse migration on an isolated copy before touching the live DB.

Use the [database and image backup tool](#database-and-image-backup) to include committed SQLite WAL data and the matching images. A stopped filesystem backup must include the SQLite file, any `-wal` and `-shm` sidecars, and its sibling `attachments/` directory. Board JSON Import creates another board and does not restore the full instance or preserve its IDs.

Recording the old image identity is not enough: verify it can be retrieved by digest or retained locally. If needed, save it with `docker image save` before upgrading, and do not remove it until recovery has been verified.

<a id="database-and-image-backup"></a>
### Database and image backup

The default Docker paths are `/app/data/kanbalone.sqlite` and `/app/data/attachments/`. With a custom `KANBALONE_DB_FILE`, the app puts `attachments/` beside that file. Keep both paths on persistent storage.

The backup tool takes a consistent SQLite snapshot and copies each image recorded in it. It checks database integrity, verifies attachment metadata against the app's image type and size limits, and verifies each file's size and SHA-256. Keep the entire backup directory, including `manifest.json`, `database.sqlite`, and `attachments/` when present, in private storage outside the app's data volume. The tool also supports databases from before image attachments.

Each command takes an existing source and a new destination directory with an existing parent. Restore validates the backup before publishing the destination. It restores the original database filename and puts the matching image files beside it. Use the same compatible version of Kanbalone that wrote the data, or a newer version that can migrate it. Keep the original data and switch the startup configuration to the restored data only after verifying an isolated startup and fetching a restored image. For upgrades, take the backup with writers stopped so it matches the reconciliation baseline. Routine backups can take a snapshot while Kanbalone is running.

#### Native installation or checkout

From the source checkout with dependencies installed, substitute your actual paths:

```bash
node scripts/kanbalone-backup.mjs backup /path/to/data/kanbalone.sqlite /private/backups/kanbalone-1
node scripts/kanbalone-backup.mjs restore /private/backups/kanbalone-1 /path/to/recovered-data
```

Set `KANBALONE_DB_FILE=/path/to/recovered-data/kanbalone.sqlite` for the recovered instance, using the restored filename.

#### Docker

Use an image that includes the tool. Set the source container name and the actual paths. The example uses the source container's volume or bind mount at `/app/data`. Create the two host parent directories with permissions for the helper container's runtime user to write them. The standard image runs as UID 1000.

```bash
KANBALONE_CONTAINER='replace-with-your-container'
KANBALONE_BACKUP_IMAGE='replace-with-image-that-includes-the-backup-tool'
BACKUP_PARENT='/absolute/private/backup-parent'
RECOVERY_PARENT='/absolute/private/recovery-parent'

docker run --rm --network none --volumes-from "$KANBALONE_CONTAINER" \
  --mount "type=bind,source=$BACKUP_PARENT,target=/backup" \
  "$KANBALONE_BACKUP_IMAGE" node scripts/kanbalone-backup.mjs \
  backup /app/data/kanbalone.sqlite /backup/kanbalone-1

docker run --rm --network none \
  --mount "type=bind,source=$BACKUP_PARENT,target=/backup,readonly" \
  --mount "type=bind,source=$RECOVERY_PARENT,target=/recovery" \
  "$KANBALONE_BACKUP_IMAGE" node scripts/kanbalone-backup.mjs \
  restore /backup/kanbalone-1 /recovery/kanbalone-1
```

To start from this restored copy, mount the host's `$RECOVERY_PARENT/kanbalone-1` as `/app/data` in the recovered app. For a named volume, mount a new volume at `/app/data` in the restore helper, restore to `/app/data/kanbalone-1`, then mount that volume in the app and set `KANBALONE_DB_FILE=/app/data/kanbalone-1/kanbalone.sqlite`.

### Docker stop-and-copy for older versions

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

For a data directory from before image attachments, the following checks the copied DB and creates a standalone backup for restoration. Run it on a host with Python 3. Replace `kanbalone.sqlite` with the actual filename. For a directory with images, keep the whole stopped copy together or run the [database and image backup tool](#database-and-image-backup) against the copied data.

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

<a id="deprecated-api-removal"></a>

### v1.0.0: remove deprecated API compatibility

These removals apply to v1.0.0. They are **not part of v0.11.0**; confirm the target release notes and image before upgrading. v0.10.0–v0.11.0 accepted matching completion flags as compatibility assertions and returned both completion response names. v1.0.0 removes that compatibility layer.

| Removed API surface | Replacement | Behavior after removal |
| --- | --- | --- |
| `isCompleted` in ticket, summary, relation responses and new board exports | Read `isResolved` | The alias is absent |
| `completed=true/false` query filter | Use `resolved=true/false` | 400, including when combined with `resolved` |
| `isResolved` / `isCompleted` in ticket create, update, transition, bulk-transition and create/change-preview requests | Select `laneId` or `laneName`; omit both flags | 400 without changes, even if a supplied value matches the lane |
| `POST /api/boards/:boardId/tickets/bulk-complete` | `POST /api/boards/:boardId/tickets/bulk-transition` | 404 |
| `POST /api/boards/:boardId/tickets/reorder` | `PATCH /api/tickets/:ticketId/position` for one ticket; `POST /api/lanes/:laneId/tickets/reorder` for an ordered lane prefix | 404 |

Read-only `isResolved`, the `resolved` filter, lane-scoped ordering and ticket position updates remain supported. A replacement for the removed full-board reorder must be planned as separate lane or ticket operations; several requests are not one atomic board-wide operation.

This API cleanup does not remove old database migration or old board-export import support. Existing data still follows the migration rules in this guide. Do not rewrite stored completion columns or edit backup files to remove old fields.

- Resolve/reopen by moving tickets. Determine destinations by `isCompletionLane`, not names.
- Changing a lane's completion attribute affects every ticket in it, including archived tickets. Do not use it as a shortcut to resolve one ticket.
- Use `PUT /api/boards/:boardId/completion-lanes` for reviewed board-wide configuration. Send the complete selection and expectations; on 409 re-read and review. Do not bypass checks with individual PATCH calls.
- Update the distributed `kanbalone-api` skill, reference and helper together. Updating the repository does not update skills already installed in each AI environment.

### Rewrite requests

These examples pair API paths with JSON bodies. Fetch lanes first. Assume board 1 has lane 12 with `isCompletionLane: true` and lane 11 with `false`, verified from the API. Replace IDs and names with actual values. An existing Done lane is not necessarily a completion lane after automatic migration.

| Goal | Removed request | Replacement |
| --- | --- | --- |
| Resolve via `PATCH /api/tickets/123` | `{"isResolved":true}` | `{"laneId":12}` |
| Reopen via `PATCH /api/tickets/123` | `{"isCompleted":false}` | `{"laneId":11}` |
| Create a resolved ticket via `POST /api/boards/1/tickets` | `{"title":"Work","laneId":11,"isResolved":true}` | `{"title":"Work","laneId":12}` |
| Transition via `PATCH /api/tickets/123/transition` | `{"laneName":"Done","isResolved":true}` | `{"laneName":"Done"}`, only after confirming that lane's completion attribute |

**Resolve multiple tickets** — replace both the endpoint and body:

Before (`POST /api/boards/1/tickets/bulk-complete`):

```json
{"ticketIds":[123,124],"isResolved":true}
```

After (`POST /api/boards/1/tickets/bulk-transition`), using the verified completion lane name:

```json
{"ticketIds":[123,124],"laneName":"Completed (migration)"}
```

To reopen, use the same endpoint with a verified normal lane name. Moving changes placement too; decide the intended destination before sending the request.

### Handle failures without changing user intent

For removed flags or aliases, correct the client request rather than retrying the same request. For removed endpoints, choose the documented replacement. Do not catch a 400/404 and silently move tickets, reclassify lanes, or retry direct DB writes. A 409 from supported operations still requires reading the current state and reviewing the conflict.

See the [AI API guide](./ai-api-guide.md) and [API examples](./api-examples.md) for supported operations.

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
2. Save the current post-migration database and its images together in a separate location. If usage resumed, restoring the pre-migration backup loses subsequent changes; confirm the recovery scope with the user.
3. [Restore the verified backup](#database-and-image-backup) to a new data directory and configure the old version to use the restored database path. Retain appropriate ownership and permissions.
4. For a stopped filesystem copy, restore the original database, any `-wal`/`-shm` sidecars, and any attachments from the same snapshot to a new data directory. For a legacy standalone `before.sqlite` backup, use a new data directory so the restored database starts with no sidecars from later runs.
5. Start the recorded old image or source with its settings and the restored database path. Verify health, database integrity, agreement with pre-migration data, and image downloads if the backup includes attachments.
6. Resume usage only after recovery is verified. JSON Import or manually reversing ticket moves is not a substitute for DB restoration.

The previous-view comparison adds its clock and history-removal tracking on startup. The app creates a `.visit-id` sidecar next to each database to identify that file across restarts. Official backups retain ticket content, activity and attachment files. Restoring to a new data directory generates a new comparison series and invalidates browser points from the original database. Keep the `.visit-id` from the active database with that installation. Replacing the contents of the same physical file together with its sidecar outside the restore procedure may preserve an old identity. Use a new data directory for restores.

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

<a id="group-migration"></a>
## v0.11.0: Group Migration

This section applies when upgrading to v0.11.0, which introduces Groups. It is separate from the v0.10.0 completion migration above; the previously published v0.10.0 image does not contain Group support. Reading this section does not authorize an upgrade or changes to a running instance.

### Database Changes

On first startup, the Group-capable application adds Group storage and nullable ticket membership. Existing tickets start ungrouped. It does not infer Groups from tags, lane names, ticket titles, or parent names. Existing ticket IDs, lanes, completion/archive flags, parent links, comments and remote links remain intact. Group migration does not rerun completion reclassification or create completion lanes on a database already migrated to v0.10.0.

Membership is board-local and shared by connected parent/child tickets. Do not write `group_id` directly in SQLite: API transactions also validate the board, update the connected set and record changes.

### Upgrade And Reconciliation For Humans Or AI

1. Identify the actual instance URL, runtime, data path and both source/target builds. Do not assume the published v0.10.0 image is Group-capable.
2. Stop writes and take a consistent backup of SQLite and any attachments using the backup procedure above.
3. Before upgrading, record board/lane/ticket counts and export every board for reconciliation. Include archived tickets when recording the baseline.
4. Start the verified Group-capable build against the same storage. Do not run old and new writers together.
5. Verify health and board/ticket totals. `GET /api/boards/:boardId/groups?status=all` should initially be empty; all existing tickets should have `groupId:null` and `group:null`. Compare lane IDs, completion/archive flags and parent links with the baseline.
6. Verify a Group workflow on a disposable test board: create, add a parent/child set, detach membership, delete the empty Group, and export/import. Do not reorganize the user's existing tickets merely to test the migration.
7. Report the verified build, backup location, checks and any discrepancies. Do not declare success if the migration or reconciliation failed.

### JSON Export Format 2

Format 2 exports contain `formatVersion:2`, a `groups` array, and `groupId` on every ticket. They include inactive/empty Groups and archived tickets. Group descriptions are Markdown; derived counts, active state and rendered HTML are not restoration inputs. Ticket display summaries such as `group:{id,name}` are not exported as membership references.

Import creates a new board and remaps both ticket and Group IDs. It does not merge into an existing board. Group references and parent/child membership must agree. Invalid references, duplicate IDs/names, missing Group fields or inconsistent parent/child membership reject the whole import, leaving no partial board.

Legacy exports are accepted only when they omit the format version and all Group fields. They import as ungrouped tickets. A payload with Group fields but no format version is rejected rather than silently dropping membership. Unknown versions are rejected.

### Rollback

Stop the new application and restore the pre-upgrade data backup before running the old build. Do not open the upgraded DB with the old application: it does not enforce Group invariants. Changes made after the backup are not present in that restore and must be reconciled separately if needed.

Do not use a format-2 JSON import into an old release as a rollback path. Older releases may ignore unknown fields instead of rejecting them, losing Group data. Use the original backup and original build together.

<a id="automated-upgrade-verification"></a>
## Automated upgrade and restore verification

CI and the release workflow test published v0.9.35, v0.10.0 and v0.11.0 images against the candidate image on Linux/amd64. Each source runs with a Docker volume and a bind mount. All boards, tickets and external references in these tests are synthetic; the test never mounts an existing user database or contacts an issue provider.

The checks cover:

- Stopped backups containing a nonempty SQLite WAL, with file sizes and SHA-256 hashes recorded.
- Completion migration, lane-name collisions, archived tickets, parent/child links, relationships, tags, comments, events and stored remote references. v0.11.0 fixtures also include populated and empty Groups.
- Every pre-existing stored field, allowing only documented migration changes; integrity and foreign-key checks; API reads; unchanged data after restart.
- An injected completion-migration failure, verifying that schema and data changes roll back together.
- A write after upgrading, followed by restoration of the original database set and original image. Restored data must exactly match the baseline; the later write must be absent.
- On the candidate upgraded from v0.11.0, a live backup with an embedded image followed by restore to a new directory. The restored app returns identical ticket Markdown and image bytes over HTTP. The post-backup image remains in the original app and is absent from the restored app.

To test a locally built candidate:

```bash
revision=$(git rev-parse HEAD)
version=$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')
docker build --platform linux/amd64 \
  --label "org.opencontainers.image.revision=$revision" \
  --label "org.opencontainers.image.version=$version" \
  -t kanbalone:upgrade-check .
RELEASE_SHA="$revision" RELEASE_VERSION="$version" \
  node scripts/verify-upgrade-restore.mjs kanbalone:upgrade-check
```

Use a clean checkout so the SHA identifies the candidate source. Docker and network access to the public source images are required. The bind-mount test uses the invoking user's UID/GID; the volume test uses the image's default runtime user. Temporary containers and storage are removed. Reports, full synthetic snapshots and injected-failure logs remain in `coverage/upgrade-restore/`; CI retains them as `upgrade-restore-RUN_ATTEMPT` for 30 days.

A passing report covers these representative paths. The verification uses isolated containers on Linux/amd64 and synthetic local data. Follow the backup and reconciliation steps above for an actual upgrade. Restoring an old backup discards later changes unless separately reconciled.

## Completion timestamps and Kanban display (v1.0.0)

Upgrade automatically adds the completion timestamp column without changing existing lanes, resolution, archive flags or positions. Historical timestamps are not guessed: existing tickets expose `resolvedAt: null`. Future arrival in a completion lane records a timestamp, preserved by ordinary edits. Unknown historical times retain position order; newly completed tickets appear ahead of them.

Completion lanes initially show five tickets and reveal fifty more per action. Collapsing does not delete data. Default status selection becomes open plus resolved. Existing open/resolved selections are preserved; reset Completion if completed tickets remain hidden. JSON export/import preserves the timestamp; older exports without it load as null. Follow the existing backup and original-version restore instructions in this guide.

## Saved completion and archive filters (v1.0.0)

Completion state and archive visibility are now separate. An old browser-saved `status` containing `archived` becomes `includeArchived: true`. Existing `open` and `resolved` selections are retained; if neither was selected (archived only), both are selected.

Completion filters now also apply to archived tickets. For example, old “Open + Archived” becomes Open with Include archived tickets enabled, so resolved archived tickets are no longer shown. Old “Archived only” becomes both completion states including archived and unarchived tickets. Adjust **Completion** as needed. Stored ticket data and API query behavior do not change.

## Ticket-list pagination (v1.1.0-rc.1)

Existing API callers require no changes. Lists without `limit` and `cursor` retain their full count, order and response shape. See [pagination examples](./api-examples.md#paged-ticket-lists).

Startup adds ticket-list revision and cursor-signing tables, triggers and indexes. Existing tickets and lane meanings are unchanged. Back up the database and any attachments and verify preservation with the candidate as for other upgrades. Cursors survive a restart alone, but continuation is not guaranteed after list changes, switching databases or restoring a backup. Discard stored cursors and restart on an invalid-cursor 400 or a changed-list 409. Correct the arguments for other 400 errors.

## Portable board exports with images (v1.1.0-rc.1)

An export for a board without Task data uses format 3 when a ticket body, comment or Group description embeds or links to a locally uploaded image. It includes the referenced files in the JSON. Boards without these references use format 2. Import format 3 into v1.1.0-rc.1 or later. If a referenced file is missing or the portable JSON exceeds 64 MiB, export fails.

For full instance recovery or data larger than the portable JSON limit, use the [database and image backup](#database-and-image-backup). To return to v1.0.0, restore the pre-upgrade backup with the v1.0.0 image.

## Saved cross-board view definitions (v1.4.0)

On startup, v1.4.0 automatically creates the saved-view definition and query-revision tables and installs the associated change-tracking triggers. Ticket membership, completion state and browser-local board filters are preserved. [Back up the database and attachments together](#database-and-image-backup) before upgrading. For rollback, use the previous image with the pre-upgrade backup. The restore recovers data saved as of the backup.

A full database restore retains saved definitions and their board and tag IDs. A single-board JSON export transfers board data. Imported boards receive new IDs. Saved views keep their original references, and deleted references appear as warnings.

## Custom-view lane conditions and content ordering (v1.5.0)

Startup adds content-activity storage and update tracking without changing ticket contents or existing view results. Existing definitions use all lanes and the original order. Previously configured lane restrictions and sorting are kept when older clients omit the new fields on update.

Past body-edit times cannot be reconstructed. Initial content activity uses ticket creation, comment creation and reliably recorded comment-content edit times. It does not use the current migration time or unrelated ticket edits. Future actual body changes and comment posts/edits update this record atomically. Deleted comments do not erase the last recorded activity. Full database backups retain these timestamps; single-board JSON export/import does not transfer the added history. Import creates new tickets and comments, so their activity starts at import time; use a full database restore to retain the original activity times.

Back up the database and attachments before upgrading and retain that backup with the previous image. For rollback, restore it rather than opening new lane-filter definitions with an old binary that does not understand them. Discard stored custom-view cursors after upgrade or restore and query from the first page.

## Operation updater

The first startup adds a nullable updater field to ticket and Group history and comments. Existing records display **Unrecorded** and return `null` through the API. Their stored contents, timestamps and order are preserved. Editing an old comment records the new edit separately. Restoring an older database backup into the new version applies the same migration.

Existing API clients and old browser tabs still work. Their new operations record `API` until the client supplies an updater or the tab loads the new interface. Save any in-progress edits before reloading. The new interface starts with `画面` when this browser has no saved updater. Clearing browser storage or using another browser gets that default again. The updater setting lives in browser storage. Database backups restore history and comments, while browser settings are managed separately.

Imported comments retain a supplied creation updater and timestamp. Older exports with no updater import as unrecorded. The JSON import operation's updater is recorded separately from the imported comments' creation updaters. Use a full database and attachment backup to preserve all activity.

Before upgrading, [back up the database and attachments together](#database-and-image-backup). To roll back, restore that backup and run the previous version. Changes made after the backup need to be reconciled separately.

<a id="ticket-task-migration"></a>
## Ticket Tasks

Startup adds Task and numbering tables without changing existing ticket contents, timestamps, lane completion, comments or activity. Existing tickets start with zero Tasks. Existing ticket APIs keep working and include the new read-only Task counts in ticket detail and summaries.

A board with Task data exports as format 4. An allocated number counts as Task data even after every Task on its ticket is deleted. The export carries live Tasks, their revisions and each ticket's highest allocated number. It embeds referenced local images, including those used only in Task Markdown. Versions that do not support format 4 reject the export. Use the matching or a later compatible version to import it. Earlier export formats continue to import.

Portable JSON transfers current Task content and numbering. For Task history, including deleted Markdown and the recorded updater, use a full [database and attachment backup](#database-and-image-backup). Restore the pre-upgrade backup with the prior version for rollback. Keep a current backup if you need to recover Tasks recorded after the upgrade.
