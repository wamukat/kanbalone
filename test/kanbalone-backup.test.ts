import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import { imageByteLimit } from "../src/image-format.js";

const script = "../scripts/kanbalone-backup.mjs";
const { backupDatabase, restoreDatabase } = await import(script);

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUa8AAAAASUVORK5CYII=",
  "base64",
);
const imageId = hash(image);

async function fixture(t: TestContext, withAttachments = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), "kanbalone-backup-test-"));
  const data = path.join(root, "live");
  await mkdir(data);
  const dbFile = path.join(data, "custom.sqlite");
  const db = new Database(dbFile);
  t.after(async () => {
    db.close();
    await rm(root, { recursive: true, force: true });
  });
  db.pragma("journal_mode = WAL");
  db.pragma("wal_autocheckpoint = 0");
  db.exec("CREATE TABLE tickets (id INTEGER PRIMARY KEY, body_markdown TEXT NOT NULL)");
  db.prepare("INSERT INTO tickets VALUES (1, ?)").run(
    withAttachments ? `![Fixture](/api/attachments/${imageId})` : "Legacy ticket",
  );
  if (withAttachments) {
    db.exec("CREATE TABLE attachments (id TEXT PRIMARY KEY, media_type TEXT NOT NULL, byte_size INTEGER NOT NULL)");
    db.prepare("INSERT INTO attachments VALUES (?, ?, ?)").run(imageId, "image/png", image.length);
    await mkdir(path.join(data, "attachments"));
    await writeFile(path.join(data, "attachments", imageId), image);
  }
  return {
    root,
    db,
    dbFile,
    data,
    bundle: path.join(root, "bundle"),
    restored: path.join(root, "restored"),
  };
}

test("backs up WAL commits and immutable images and restores them into a new data directory", async (t) => {
  const { db, dbFile, data, bundle, restored } = await fixture(t);
  const unreferenced = Buffer.from("A retained upload with no Markdown reference");
  const unreferencedId = hash(unreferenced);
  await writeFile(path.join(data, "attachments", unreferencedId), unreferenced);
  db.prepare("INSERT INTO attachments VALUES (?, ?, ?)").run(unreferencedId, "image/png", unreferenced.length);
  await writeFile(path.join(data, "attachments", "orphan-file"), "Incomplete or stale upload");
  assert.ok((await stat(dbFile + "-wal")).size > 0);
  const manifest = await backupDatabase(dbFile, bundle);
  assert.equal(manifest.attachmentCount, 2);
  assert.deepEqual(await readdir(bundle), ["attachments", "database.sqlite", "manifest.json"]);
  assert.deepEqual((await readdir(path.join(bundle, "attachments"))).sort(), [imageId, unreferencedId].sort());
  db.prepare("UPDATE tickets SET body_markdown = 'After backup' WHERE id = 1").run();

  assert.deepEqual(await restoreDatabase(bundle, restored), manifest);
  const copy = new Database(path.join(restored, "custom.sqlite"), { readonly: true });
  try {
    assert.equal(copy.prepare("SELECT body_markdown FROM tickets").pluck().get(), `![Fixture](/api/attachments/${imageId})`);
    assert.deepEqual(copy.prepare("SELECT id, media_type, byte_size FROM attachments WHERE id = ?").get(imageId), {
      id: imageId,
      media_type: "image/png",
      byte_size: image.length,
    });
    assert.deepEqual(await readFile(path.join(restored, "attachments", imageId)), image);
    assert.deepEqual(await readFile(path.join(restored, "attachments", unreferencedId)), unreferenced);
    assert.equal(db.prepare("SELECT body_markdown FROM tickets").pluck().get(), "After backup");
  } finally {
    copy.close();
  }
});

test("round-trips a database from before image attachments", async (t) => {
  const { dbFile, bundle, restored } = await fixture(t, false);
  assert.equal((await backupDatabase(dbFile, bundle)).attachmentCount, 0);
  await restoreDatabase(bundle, restored);
  const copy = new Database(path.join(restored, "custom.sqlite"), { readonly: true });
  try {
    assert.equal(copy.prepare("SELECT body_markdown FROM tickets").pluck().get(), "Legacy ticket");
    assert.deepEqual(await readdir(restored), ["custom.sqlite"]);
  } finally {
    copy.close();
  }
});

test("refuses existing backup and restore directories without changing their contents", async (t) => {
  const { dbFile, bundle, restored } = await fixture(t);
  await backupDatabase(dbFile, bundle);
  const manifestBefore = await readFile(path.join(bundle, "manifest.json"));
  await assert.rejects(backupDatabase(dbFile, bundle), /Destination already exists/);
  assert.deepEqual(await readFile(path.join(bundle, "manifest.json")), manifestBefore);
  await mkdir(restored);
  await writeFile(path.join(restored, "keep"), "Existing installation");
  await assert.rejects(restoreDatabase(bundle, restored), /Destination already exists/);
  assert.deepEqual(await readdir(restored), ["keep"]);
  assert.equal(await readFile(path.join(restored, "keep"), "utf8"), "Existing installation");
});

test("a missing source attachment prevents publishing a backup", async (t) => {
  const { root, dbFile, data, bundle } = await fixture(t);
  await rm(path.join(data, "attachments", imageId));
  await assert.rejects(backupDatabase(dbFile, bundle), { code: "ENOENT" });
  assert.deepEqual(await readdir(root), ["live"]);
});

const invalidMetadata = {
  "unsafe image ID": "UPDATE attachments SET id = '../database.sqlite'",
  "unsupported image media type": "UPDATE attachments SET media_type = 'image/svg+xml'",
  "oversized image metadata": `UPDATE attachments SET byte_size = ${imageByteLimit + 1}`,
} as const;

for (const [problem, sql] of Object.entries(invalidMetadata)) {
  test(`backup rejects ${problem} without publishing partial data`, async (t) => {
    const { root, db, dbFile, bundle } = await fixture(t);
    db.exec(sql);
    await assert.rejects(backupDatabase(dbFile, bundle), /Invalid attachment metadata/);
    assert.deepEqual(await readdir(root), ["live"]);
  });
}

for (const problem of [
  "missing image",
  "corrupt image",
  "image symlink",
  "attachments symlink",
  "corrupt database",
  "unsafe database filename",
  "unsafe image ID",
  "unsupported image media type",
  "oversized image metadata",
] as const) {
  test(`restore rejects ${problem} without publishing partial data`, async (t) => {
    const { root, data, dbFile, bundle, restored } = await fixture(t);
    await backupDatabase(dbFile, bundle);
    const bundleImage = path.join(bundle, "attachments", imageId);
    const databaseFile = path.join(bundle, "database.sqlite");
    const manifestFile = path.join(bundle, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    switch (problem) {
      case "missing image":
        await rm(bundleImage);
        break;
      case "corrupt image":
        await writeFile(bundleImage, Buffer.alloc(image.length));
        break;
      case "image symlink":
        await rm(bundleImage);
        await symlink(path.join(data, "attachments", imageId), bundleImage);
        break;
      case "attachments symlink":
        await rm(path.join(bundle, "attachments"), { recursive: true });
        await symlink(path.join(data, "attachments"), path.join(bundle, "attachments"), "dir");
        break;
      case "corrupt database":
        await writeFile(databaseFile, Buffer.alloc(manifest.database.byteSize));
        break;
      case "unsafe database filename":
        manifest.database.name = "../escaped.sqlite";
        await writeFile(manifestFile, JSON.stringify(manifest));
        break;
      case "unsafe image ID":
      case "unsupported image media type":
      case "oversized image metadata": {
        const db = new Database(databaseFile);
        try {
          db.exec(invalidMetadata[problem]);
        } finally {
          db.close();
        }
        const bytes = await readFile(databaseFile);
        manifest.database.byteSize = bytes.length;
        manifest.database.sha256 = hash(bytes);
        await writeFile(manifestFile, JSON.stringify(manifest));
        break;
      }
    }
    await assert.rejects(restoreDatabase(bundle, restored), {
      "missing image": /ENOENT/,
      "corrupt image": /SHA-256 mismatch: attachment/,
      "image symlink": /Not a regular file/,
      "attachments symlink": /Not a directory/,
      "corrupt database": /SHA-256 mismatch: database/,
      "unsafe database filename": /Invalid backup manifest/,
      "unsafe image ID": /Invalid attachment metadata/,
      "unsupported image media type": /Invalid attachment metadata/,
      "oversized image metadata": /Invalid attachment metadata/,
    }[problem]);
    assert.deepEqual((await readdir(root)).sort(), ["bundle", "live"]);
  });
}
