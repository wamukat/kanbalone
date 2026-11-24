import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  runCommand,
  inspectExpectedImage,
  imageOptionsFromEnvironment,
} from "./smoke-image.mjs";

export const SOURCE_VERSIONS = ["0.9.35", "0.10.0", "0.11.0"];
const dbPrelude = `const Database = require('better-sqlite3'); const db = new Database('/app/data/kanbalone.sqlite'); db.pragma('foreign_keys=ON');`;
const dumpCode = `${dbPrelude}
const tables = {}; const schema = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
for(const {name} of schema.filter(x=>x.type==='table')) tables[name]=db.prepare('SELECT * FROM "'+name+'"').all().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
console.log(JSON.stringify({schema,tables,integrity:db.pragma('integrity_check'),foreignKeys:db.pragma('foreign_key_check')})); db.close();`;
function healthy(snapshot) {
  assert.deepEqual(snapshot.integrity, [{ integrity_check: "ok" }]);
  assert.deepEqual(snapshot.foreignKeys, []);
}
/** Compare every old stored field. Only documented migration changes are allowed. */
export function compareUpgrade(before, after, legacy) {
  healthy(before);
  healthy(after);
  const migratedBoards = new Set(
    before.tables.tickets.filter((t) => t.is_resolved).map((t) => t.board_id),
  );
  for (const [name, rows] of Object.entries(before.tables)) {
    const actual = after.tables[name];
    assert.ok(actual, `Missing table ${name}`);
    if (name === "activity_logs") {
      for (const row of rows)
        assert.deepEqual(
          actual.find((x) => x.id === row.id),
          row,
          "Old activity changed",
        );
      continue;
    }
    const key = (row) =>
      row.id ??
      (name === "ticket_remote_links"
        ? row.ticket_id
        : name === "comment_remote_sync"
          ? row.comment_id
          : JSON.stringify(row));
    for (const row of rows) {
      const found = actual.find((x) => key(x) === key(row));
      assert.ok(found, `Missing ${name} ${key(row)}`);
      for (const field of Object.keys(row)) {
        if (
          legacy &&
          name === "tickets" &&
          ["lane_id", "position", "updated_at"].includes(field)
        )
          continue;
        if (
          legacy &&
          name === "boards" &&
          field === "updated_at" &&
          migratedBoards.has(row.id)
        )
          continue;
        assert.deepEqual(
          found[field],
          row[field],
          `${name}.${field} (${key(row)})`,
        );
      }
    }
    if (name !== "lanes")
      assert.equal(actual.length, rows.length, `${name} count`);
  }
  const oldLaneIds = new Set(before.tables.lanes.map((x) => x.id));
  const added = after.tables.lanes.filter((x) => !oldLaneIds.has(x.id));
  assert.equal(added.length, legacy ? migratedBoards.size : 0);
  for (const lane of before.tables.lanes) {
    const actual = after.tables.lanes.find((x) => x.id === lane.id);
    assert.equal(
      actual.is_completion_lane,
      legacy ? 0 : lane.is_completion_lane,
    );
  }
  for (const lane of added) {
    assert.equal(lane.is_completion_lane, 1);
    assert.ok(migratedBoards.has(lane.board_id));
    const names = new Set(
      before.tables.lanes
        .filter((x) => x.board_id === lane.board_id)
        .map((x) => x.name),
    );
    let expected = "Completed (migration)",
      suffix = 2;
    while (names.has(expected)) expected = `Completed (migration) ${suffix++}`;
    assert.equal(lane.name, expected);
  }
  for (const t of before.tables.tickets) {
    const found = after.tables.tickets.find((x) => x.id === t.id);
    if (legacy && t.is_resolved)
      assert.equal(
        found.lane_id,
        added.find((x) => x.board_id === t.board_id)?.id,
      );
    else assert.equal(found.lane_id, t.lane_id);
    assert.equal(found.group_id, t.group_id ?? null);
    assert.equal(
      found.is_resolved,
      after.tables.lanes.find((x) => x.id === found.lane_id).is_completion_lane,
    );
  }
  // Preserve relative ordering within every original lane and archive partition.
  for (const lane of before.tables.lanes)
    for (const archived of [0, 1]) {
      const ids = (rows) =>
        rows
          .filter(
            (t) =>
              t.lane_id === lane.id &&
              t.is_archived === archived &&
              (!legacy || !t.is_resolved),
          )
          .sort((a, b) => a.position - b.position || a.id - b.id)
          .map((t) => t.id);
      assert.deepEqual(ids(after.tables.tickets), ids(before.tables.tickets));
    }
  const newActivity = after.tables.activity_logs.filter(
    (x) => !before.tables.activity_logs.some((y) => y.id === x.id),
  );
  assert.equal(
    newActivity.length,
    legacy ? before.tables.tickets.filter((t) => t.is_resolved).length : 0,
  );
  for (const activity of newActivity)
    assert.equal(
      JSON.parse(activity.details_json).migration,
      "lane_completion",
    );
  if (!before.tables.groups) assert.deepEqual(after.tables.groups, []);
}

async function seed(api, version) {
  const legacy = version.startsWith("0.9.");
  const board = await api("/api/boards", "POST", {
    name: "Upgrade fixture 日本語",
    laneNames: ["Inbox", "Done", "Completed (migration)"],
  });
  const other = await api("/api/boards", "POST", {
    name: "No completed tickets",
    laneNames: ["Done"],
  });
  const [inbox, done] = board.lanes;
  if (!legacy)
    await api(`/api/lanes/${done.id}`, "PATCH", { isCompletionLane: true });
  const tag = await api(`/api/boards/${board.board.id}/tags`, "POST", {
    name: "保持するタグ",
    color: "#336699",
  });
  const create = (title, extra = {}) =>
    api(`/api/boards/${board.board.id}/tickets`, "POST", {
      laneId: inbox.id,
      title,
      bodyMarkdown: "**日本語**\n- [ ] keep",
      ...extra,
    });
  const parent = await create("Open parent", { tagIds: [tag.id] });
  await create("Archived child", {
    parentTicketId: parent.id,
    isArchived: true,
    blockerIds: [parent.id],
  });
  await create(
    "Completed",
    legacy ? { isResolved: true } : { laneId: done.id },
  );
  await create(
    "Completed archived",
    legacy
      ? { isResolved: true, isArchived: true }
      : { laneId: done.id, isArchived: true },
  );
  await create("Open remains in Done", {
    laneId: legacy ? done.id : inbox.id,
    relatedIds: [parent.id],
  });
  await api(`/api/boards/${other.board.id}/tickets`, "POST", {
    laneId: other.lanes[0].id,
    title: "Never complete",
  });
  const comment = await api(`/api/tickets/${parent.id}/comments`, "POST", {
    bodyMarkdown: "保存するコメント",
  });
  await api(`/api/tickets/${parent.id}/tags/${tag.id}`, "POST", {
    reason: "理由",
    details: { fixture: true },
    reasonCommentId: comment.id,
  });
  await api(`/api/tickets/${parent.id}/events`, "POST", {
    source: "fixture",
    kind: "verification",
    title: "Structured event",
    data: { value: 42 },
  });
  await api(`/api/tickets/${parent.id}/external-references/pr-fixture`, "PUT", {
    provider: "github",
    instanceUrl: "https://github.com",
    resourceType: "pull_request",
    projectKey: "example/fixture",
    issueKey: "123",
    displayRef: "example/fixture#123",
    url: "https://github.com/example/fixture/pull/123",
  });
  if (version === "0.11.0") {
    const g = await api(`/api/boards/${board.board.id}/groups`, "POST", {
      name: "Fixture Group",
      descriptionMarkdown: "**説明**",
    });
    const change = { ticketIds: [parent.id], groupId: g.id };
    const p = await api(
      `/api/boards/${board.board.id}/group-memberships/preview`,
      "POST",
      change,
    );
    await api(`/api/boards/${board.board.id}/group-memberships`, "PUT", {
      ...change,
      expectedToken: p.expectedToken,
    });
    await api(`/api/boards/${board.board.id}/groups`, "POST", {
      name: "Empty Group",
    });
  }
  return { parentId: parent.id, commentId: comment.id };
}

async function verifyAttachmentRestore({ api, ticketId, backup, restore, startRestored }) {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUa8AAAAASUVORK5CYII=", "base64");
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  const upload = async (bytes, mediaType) => {
    const response = await api.request("/api/attachments", {
      method: "POST",
      headers: { "content-type": mediaType },
      body: bytes,
    });
    assert.equal(response.status, 201, await response.clone().text());
    const image = await response.json();
    assert.equal(image.id, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(image.url, `/api/attachments/${image.id}`);
    assert.equal(image.byteSize, bytes.length);
    assert.equal(image.mediaType, mediaType);
    return image;
  };
  const first = await upload(png, "image/png");
  const ticketPath = `/api/tickets/${ticketId}`;
  const bodyMarkdown = `![Backup fixture](${first.url})`;
  await api(ticketPath, "PATCH", { bodyMarkdown });
  // Run the snapshot command while the app is up and using WAL.
  const manifest = await backup();
  assert.equal(manifest.attachmentCount, 1);
  const later = await upload(gif, "image/gif");
  const laterMarkdown = `![Post-backup write](${later.url})`;
  await api(ticketPath, "PATCH", { bodyMarkdown: laterMarkdown });
  assert.deepEqual(await restore(), manifest);
  const recovered = await startRestored(manifest.database.name);
  const restored = await recovered(ticketPath);
  assert.equal(restored.bodyMarkdown, bodyMarkdown);
  assert.ok(restored.bodyHtml.includes(`src="${first.url}"`));
  const image = await recovered.request(first.url);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.equal((await recovered.request(later.url)).status, 404);
  assert.equal((await api(ticketPath)).bodyMarkdown, laterMarkdown);
  assert.equal((await api.request(later.url)).status, 200);
  return { manifest, restoredImage: first, postBackupImage: later };
}

export async function verifyUpgradeRestore(
  options,
  directory = "coverage/upgrade-restore",
  versions = SOURCE_VERSIONS,
  storageTypes = ["volume", "bind"],
) {
  const targetId = await inspectExpectedImage(options);
  await mkdir(directory, { recursive: true });
  const report = {
    status: "running",
    target: { ...options, imageId: targetId },
    startedAt: new Date().toISOString(),
    cases: [],
  };
  const save = () =>
    writeFile(
      path.join(directory, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  await save();
  try {
    for (const version of versions) {
      assert.ok(SOURCE_VERSIONS.includes(version));
      const reference = `ghcr.io/wamukat/kanbalone:v${version}`;
      await runCommand("docker", [
        "pull",
        "--platform",
        "linux/amd64",
        reference,
      ]);
      const [source] = JSON.parse(
        await runCommand("docker", ["image", "inspect", reference]),
      );
      assert.equal(source.Architecture, "amd64");
      for (const storage of storageTypes) {
        assert.ok(["volume", "bind"].includes(storage));
        const item = {
          version,
          storage,
          sourceImageId: source.Id,
          sourceDigests: source.RepoDigests,
          status: "running",
          checks: [],
        };
        report.cases.push(item);
        await save();
        const prefix = `kanbalone-upgrade-${randomUUID()}`;
        const tmp = await mkdtemp(path.join(path.resolve(directory), prefix));
        const owner =
          storage === "bind" ? `${process.getuid()}:${process.getgid()}` : "0";
        const volume = prefix,
          containers = new Set();
        let createdVolume = false;
        let mount;
        const check = (name) => {
          item.checks.push(name);
        };
        try {
          if (storage === "volume") {
            await runCommand("docker", ["volume", "create", volume]);
            createdVolume = true;
            mount = `type=volume,source=${volume},target=/app/data`;
          } else mount = `type=bind,source=${tmp},target=/app/data`;
          // Maintenance containers only ever mount resources created by this run.
          const maintenance = (args, user = owner) =>
            runCommand("docker", [
              "run",
              "--rm",
              "--network",
              "none",
              "--user",
              user,
              "--mount",
              mount,
              "--entrypoint",
              "node",
              targetId,
              ...args,
            ]);
          const maintain = (code) => maintenance(["-e", code]);
          const backupTool = async (...args) => JSON.parse(
            await maintenance(["scripts/kanbalone-backup.mjs", ...args], storage === "volume" ? "1000:1000" : owner),
          );
          if (storage === "volume")
            await maintain("require('fs').chownSync('/app/data',1000,1000)");
          const snapshot = async () => JSON.parse(await maintain(dumpCode));
          // Forward Docker's stop signal to Node instead of waiting for the PID 1 kill timeout.
          const start = async (image, dbFile = "/app/data/kanbalone.sqlite") => {
            const name = `${prefix}-${containers.size}`;
            containers.add(name);
            await runCommand("docker", [
              "run",
              "-d",
              "--init",
              "--name",
              name,
              "--platform",
              "linux/amd64",
              "--publish",
              "127.0.0.1::3000",
              ...(storage === "bind" ? ["--user", owner] : []),
              "--mount",
              mount,
              "--env",
              `KANBALONE_DB_FILE=${dbFile}`,
              image,
            ]);
            return name;
          };
          const connect = async (name) => {
            const ports = JSON.parse(
              await runCommand("docker", [
                "inspect",
                "--format",
                '{{json (index .NetworkSettings.Ports "3000/tcp")}}',
                name,
              ]),
            );
            const port = ports.find((p) => p.HostIp === "127.0.0.1")?.HostPort;
            assert.ok(port);
            const request = (endpoint, options) =>
              fetch(`http://127.0.0.1:${port}${endpoint}`, {
                signal: AbortSignal.timeout(3000),
                ...options,
              });
            const api = async (endpoint, method = "GET", body) => {
              const res = await request(endpoint, {
                method,
                ...(body === undefined
                  ? {}
                  : {
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify(body),
                    }),
              });
              const data = await res.json();
              assert.ok(
                res.ok,
                `${method} ${endpoint}: ${res.status} ${JSON.stringify(data)}`,
              );
              return data;
            };
            api.request = request;
            let error;
            for (let i = 0; i < 60; i++) {
              try {
                assert.equal((await api("/api/health")).ok, true);
                return api;
              } catch (e) {
                error = e;
                await new Promise((r) => setTimeout(r, 500));
              }
            }
            throw error;
          };
          const old = await start(source.Id);
          const api = await connect(old);
          assert.equal((await api("/api/meta")).version, version);
          const fixture = await seed(api, version);
          await runCommand("docker", ["stop", old]);
          // Synthetic tracked provenance: no credentials and no external service calls.
          await maintain(`${dbPrelude} const now='2026-01-01T00:00:00.000Z';
            db.prepare('INSERT INTO ticket_remote_links (ticket_id,provider,instance_url,project_key,issue_key,display_ref,remote_url,remote_title,remote_body_markdown,remote_state,last_synced_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(${fixture.parentId},'github','https://github.com','example/fixture','1','example/fixture#1','https://github.com/example/fixture/issues/1','Fixture','Remote body','open',now,now,now);
            db.prepare('INSERT OR REPLACE INTO comment_remote_sync (comment_id,status,remote_comment_id,pushed_at,last_error,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(${fixture.commentId},'pushed','fixture-comment',now,null,now,now); process.exit(0);`);
          // The stopped writer deliberately leaves committed data in WAL. Copy before
          // opening the source again, since closing SQLite can checkpoint that WAL.
          item.backupFiles = JSON.parse(
            await maintain(`const fs=require('fs'), crypto=require('crypto'); fs.mkdirSync('/app/data/backup');
            const files=fs.readdirSync('/app/data').filter(f=>f.startsWith('kanbalone.sqlite'));
            const manifest=files.map(name=>{const bytes=fs.readFileSync('/app/data/'+name);fs.writeFileSync('/app/data/backup/'+name,bytes);return {name,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};});
            console.log(JSON.stringify(manifest));
            const Database=require('better-sqlite3'); const db=new Database('/app/data/backup/kanbalone.sqlite',{readonly:true,fileMustExist:true}); if(db.pragma('integrity_check',{simple:true})!=='ok') throw Error('Bad backup'); db.close();`),
          );
          assert.ok(
            item.backupFiles.some((f) => f.name.endsWith("-wal") && f.size > 0),
            "Exercise a nonempty WAL backup",
          );
          check("stopped_backup_with_wal_integrity");
          const before = await snapshot();
          healthy(before);
          await writeFile(
            path.join(directory, `${version}-${storage}-before.json`),
            JSON.stringify(before, null, 2),
          );
          if (version === "0.9.35") {
            await maintain(
              `${dbPrelude} db.exec("CREATE TRIGGER fail_upgrade BEFORE INSERT ON lanes WHEN NEW.name LIKE 'Completed (migration)%' BEGIN SELECT RAISE(ABORT,'injected migration failure'); END");db.close();`,
            );
            const injected = await snapshot();
            const failed = await start(targetId);
            const exit = await runCommand("docker", ["wait", failed]);
            assert.notEqual(exit, "0");
            const logs = await runCommand("docker", ["logs", failed]);
            assert.match(logs, /injected migration failure/);
            await writeFile(
              path.join(directory, `${version}-${storage}-failure.log`),
              logs,
            );
            assert.deepEqual(
              await snapshot(),
              injected,
              "Failed migration must roll back all schema and rows",
            );
            await maintain(
              `${dbPrelude} db.exec('DROP TRIGGER fail_upgrade');db.close();`,
            );
            check("failed_migration_atomic_rollback");
          }
          const candidate = await start(targetId);
          let current = await connect(candidate);
          assert.equal((await current("/api/meta")).version, options.version);
          for (const t of before.tables.tickets) {
            const actual = await current(`/api/tickets/${t.id}`);
            assert.equal(actual.title, t.title);
            assert.equal(actual.isResolved, Boolean(t.is_resolved));
            assert.equal(actual.isArchived, Boolean(t.is_archived));
            assert.equal(actual.parentTicketId, t.parent_ticket_id);
            assert.equal(actual.groupId, t.group_id ?? null);
          }
          await runCommand("docker", ["stop", candidate]);
          const after = await snapshot();
          compareUpgrade(before, after, version === "0.9.35");
          check("all_tables_and_api_preserved");
          await writeFile(
            path.join(directory, `${version}-${storage}-after.json`),
            JSON.stringify(after, null, 2),
          );
          await runCommand("docker", ["start", candidate]);
          current = await connect(candidate);
          await runCommand("docker", ["stop", candidate]);
          assert.deepEqual(await snapshot(), after);
          check("restart_idempotent");
          await runCommand("docker", ["start", candidate]);
          current = await connect(candidate);
          const untracked = before.tables.tickets.find(
            (t) => t.id !== fixture.parentId,
          );
          await current(`/api/tickets/${untracked.id}`, "PATCH", {
            bodyMarkdown: "Post-upgrade write (not present in old backup)",
          });
          await runCommand("docker", ["stop", candidate]);
          const written = await snapshot();
          healthy(written);
          assert.equal(
            written.tables.tickets.find((t) => t.id === untracked.id)
              .body_markdown,
            "Post-upgrade write (not present in old backup)",
          );
          check("post_upgrade_write");
          if (version === "0.11.0") {
            await runCommand("docker", ["start", candidate]);
            current = await connect(candidate);
            let restoredContainer;
            item.imageBackup = await verifyAttachmentRestore({
              api: current,
              ticketId: untracked.id,
              backup: () => backupTool("backup", "/app/data/kanbalone.sqlite", "/app/data/image-bundle"),
              restore: () => backupTool("restore", "/app/data/image-bundle", "/app/data/image-restored"),
              startRestored: async (dbName) => {
                restoredContainer = await start(targetId, `/app/data/image-restored/${dbName}`);
                return connect(restoredContainer);
              },
            });
            await runCommand("docker", ["stop", restoredContainer]);
            await runCommand("docker", ["stop", candidate]);
            check("image_backup_restored_database_markdown_and_http_bytes");
            check("image_restore_preserved_live_dataset_and_excluded_later_upload");
          }
          // Preserve the post-upgrade data set before restoring the older database set.
          await maintain(
            `const fs=require('fs');fs.mkdirSync('/app/data/after-upgrade');for(const f of fs.readdirSync('/app/data').filter(f=>f.startsWith('kanbalone.sqlite')||f==='attachments')) fs.renameSync('/app/data/'+f,'/app/data/after-upgrade/'+f);for(const f of fs.readdirSync('/app/data/backup')) {fs.copyFileSync('/app/data/backup/'+f,'/app/data/'+f);${storage === "volume" ? "fs.chownSync('/app/data/'+f,1000,1000);" : ""}}`,
          );
          await runCommand("docker", ["start", old]);
          const restoredApi = await connect(old);
          assert.equal((await restoredApi("/api/meta")).version, version);
          assert.equal(
            (await restoredApi(`/api/tickets/${untracked.id}`)).bodyMarkdown,
            untracked.body_markdown,
          );
          await runCommand("docker", ["stop", old]);
          const restored = await snapshot();
          assert.deepEqual(restored, before);
          check("old_image_and_backup_exact_restore");
          check("post_backup_changes_excluded_on_restore");
          await writeFile(
            path.join(directory, `${version}-${storage}-restored.json`),
            JSON.stringify(restored, null, 2),
          );
          item.status = "passed";
        } catch (error) {
          item.status = "failed";
          item.error = error.stack;
          throw error;
        } finally {
          const errors = [];
          for (const name of containers)
            try {
              await runCommand("docker", ["rm", "-f", name]);
            } catch (e) {
              errors.push(e);
            }
          if (createdVolume)
            try {
              await runCommand("docker", ["volume", "rm", volume]);
            } catch (e) {
              errors.push(e);
            }
          await rm(tmp, { recursive: true, force: true });
          item.cleanup = errors.length ? "failed" : "passed";
          await save();
          if (errors.length)
            throw new AggregateError(
              errors,
              "Isolated resource cleanup failed",
            );
        }
        console.log(`Verified ${version} → ${options.version} (${storage})`);
      }
    }
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error.stack;
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    await save();
  }
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const options = imageOptionsFromEnvironment();
  if (process.argv[2]) options.image = process.argv[2];
  verifyUpgradeRestore(
    options,
    process.env.UPGRADE_REPORT_DIR ?? "coverage/upgrade-restore",
  ).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
