import { createHash } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

import imagePolicy from "../src/image-policy.json" with { type: "json" };

const databasePayload = "database.sqlite";
const attachmentsDirectory = "attachments";
const manifestFile = "manifest.json";
const sha256Pattern = /^[a-f0-9]{64}$/;
const maxManifestBytes = 16 * 1024;

function validDatabaseName(name) {
  return (
    typeof name === "string" &&
    name !== "" &&
    name !== "." &&
    name !== ".." &&
    name.toLowerCase() !== attachmentsDirectory &&
    !/[/\\\u0000-\u001f<>:"|?*]/u.test(name) &&
    !/[. ]$/.test(name) &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  );
}

async function openRegularFile(file) {
  if (!(await lstat(file)).isFile()) throw new Error(`Not a regular file: ${file}`);
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    if (!(await handle.stat()).isFile()) throw new Error(`Not a regular file: ${file}`);
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function checkDirectory(directory) {
  if (!(await lstat(directory)).isDirectory()) {
    throw new Error(`Not a directory: ${directory}`);
  }
}

async function assertAbsent(directory) {
  try {
    await lstat(directory);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Destination already exists: ${directory}`);
}

async function publishDirectory(destination, prepare) {
  const target = path.resolve(destination);
  await assertAbsent(target);
  const stage = await mkdtemp(path.join(path.dirname(target), ".kanbalone-"));
  try {
    const result = await prepare(stage);
    // Reserve the target exclusively before renaming over our own empty directory.
    await mkdir(target, { mode: 0o700 });
    try {
      await rename(stage, target);
    } catch (error) {
      await rmdir(target);
      throw error;
    }
    return result;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function digestFile(source, destination) {
  const handle = await openRegularFile(source);
  try {
    const sha256 = createHash("sha256");
    let byteSize = 0;
    const input = handle.createReadStream({ autoClose: false });
    async function* measure(stream) {
      for await (const chunk of stream) {
        byteSize += chunk.length;
        sha256.update(chunk);
        yield chunk;
      }
    }
    if (destination) {
      await pipeline(
        input,
        measure,
        createWriteStream(destination, { flags: "wx", mode: 0o600, flush: true }),
      );
    } else {
      for await (const _ of measure(input)) {
        // Hash the existing file.
      }
    }
    return { byteSize, sha256: sha256.digest("hex") };
  } finally {
    await handle.close();
  }
}

function checkDigest(actual, expected, description) {
  if (actual.byteSize !== expected.byteSize || actual.sha256 !== expected.sha256) {
    throw new Error(`Size or SHA-256 mismatch: ${description}`);
  }
}

function readAttachmentRecords(databaseFile) {
  const db = new Database(databaseFile, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma("journal_mode", { simple: true }) !== "delete") {
      throw new Error("Expected a standalone SQLite backup");
    }
    if (db.pragma("integrity_check", { simple: true }) !== "ok") {
      throw new Error("SQLite integrity check failed");
    }
    const table = db.prepare(
      "SELECT type FROM sqlite_schema WHERE name = 'attachments'",
    ).get();
    if (!table) return []; // Databases created before attachment support.
    if (table.type !== "table") throw new Error("Invalid attachments table");
    const records = db.prepare(
      "SELECT id, media_type AS mediaType, byte_size AS byteSize FROM attachments ORDER BY id",
    ).all();
    for (const { id, mediaType, byteSize } of records) {
      if (typeof id !== "string" || !sha256Pattern.test(id) ||
          typeof mediaType !== "string" || !Object.hasOwn(imagePolicy.mediaTypes, mediaType) ||
          !Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > imagePolicy.byteLimit) {
        throw new Error("Invalid attachment metadata");
      }
    }
    return records;
  } finally {
    db.close();
  }
}

async function copyAttachments(records, sourceRoot, targetRoot) {
  if (!records.length) return;
  const source = path.join(sourceRoot, attachmentsDirectory);
  const target = path.join(targetRoot, attachmentsDirectory);
  await checkDirectory(source);
  await mkdir(target, { mode: 0o700 });
  for (const { id, byteSize } of records) {
    const actual = await digestFile(path.join(source, id), path.join(target, id));
    checkDigest(actual, { byteSize, sha256: id }, `attachment ${id}`);
  }
}

async function snapshotDatabase(sourcePath, snapshotPath) {
  await (await openRegularFile(sourcePath)).close();
  const db = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await db.backup(snapshotPath);
  } finally {
    db.close();
  }
  // Make the backup a standalone DB even if the source uses WAL.
  const snapshot = new Database(snapshotPath, { fileMustExist: true });
  try {
    if (snapshot.pragma("journal_mode = DELETE", { simple: true }) !== "delete") {
      throw new Error("Could not create a standalone SQLite backup");
    }
  } finally {
    snapshot.close();
  }
  await chmod(snapshotPath, 0o600);
}

export async function backupDatabase(databaseFile, destination) {
  const source = path.resolve(databaseFile);
  const name = path.basename(source);
  if (!validDatabaseName(name)) throw new Error("Invalid database filename");
  return publishDirectory(destination, async (stage) => {
    const snapshot = path.join(stage, databasePayload);
    await snapshotDatabase(source, snapshot);
    const records = readAttachmentRecords(snapshot);
    await copyAttachments(records, path.dirname(source), stage);
    const manifest = {
      formatVersion: 1,
      database: { name, ...(await digestFile(snapshot)) },
      attachmentCount: records.length,
    };
    await writeFile(path.join(stage, manifestFile), JSON.stringify(manifest, null, 2) + "\n", {
      mode: 0o600,
      flush: true,
    });
    return manifest;
  });
}

async function readManifest(source) {
  const handle = await openRegularFile(path.join(source, manifestFile));
  try {
    if ((await handle.stat()).size > maxManifestBytes) throw new Error("Backup manifest is too large");
    const manifest = JSON.parse(await handle.readFile("utf8"));
    const database = manifest?.database;
    if (manifest?.formatVersion !== 1 ||
        !validDatabaseName(database?.name) ||
        !Number.isSafeInteger(database.byteSize) || database.byteSize <= 0 ||
        typeof database.sha256 !== "string" || !sha256Pattern.test(database.sha256) ||
        !Number.isSafeInteger(manifest.attachmentCount) || manifest.attachmentCount < 0) {
      throw new Error("Invalid backup manifest");
    }
    return manifest;
  } finally {
    await handle.close();
  }
}

export async function restoreDatabase(backupDirectory, destination) {
  const source = path.resolve(backupDirectory);
  await checkDirectory(source);
  const manifest = await readManifest(source);
  return publishDirectory(destination, async (stage) => {
    const databaseFile = path.join(stage, manifest.database.name);
    const actual = await digestFile(path.join(source, databasePayload), databaseFile);
    checkDigest(actual, manifest.database, "database");
    const records = readAttachmentRecords(databaseFile);
    if (records.length !== manifest.attachmentCount) {
      throw new Error("Attachment count does not match backup manifest");
    }
    await copyAttachments(records, source, stage);
    return manifest;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, source, destination, ...rest] = process.argv.slice(2);
  if ((mode !== "backup" && mode !== "restore") || !source || !destination || rest.length) {
    console.error("Usage: node scripts/kanbalone-backup.mjs backup <db-file> <new-backup-dir>");
    console.error("       node scripts/kanbalone-backup.mjs restore <backup-dir> <new-data-dir>");
    process.exitCode = 1;
  } else {
    try {
      const run = mode === "backup" ? backupDatabase : restoreDatabase;
      console.log(JSON.stringify(await run(source, destination), null, 2));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
