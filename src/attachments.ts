import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";

import { imageByteLimit, imageMediaTypes, validateImage, type ImageMediaType } from "./image-format.js";

const read = promisify(fs.read);
export const attachmentIdPattern = /^[a-f0-9]{64}$/;

export type AttachmentMeta = { id: string; mediaType: ImageMediaType; byteSize: number };
export type AttachmentExport = { id: string; mediaType: ImageMediaType; dataBase64: string };

export function imageDigest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function storageError() {
  return Object.assign(new Error("Attachment storage is unavailable or inconsistent. Check the database and its attachments directory."), { statusCode: 500 });
}

export class AttachmentStore {
  private directory?: string;
  private readonly ephemeral: boolean;

  constructor(private readonly sqlite: Database.Database, dbFile: string) {
    this.ephemeral = dbFile === ":memory:" || dbFile === "";
    if (!this.ephemeral) this.directory = path.resolve(path.dirname(dbFile), "attachments");
  }

  close() {
    if (this.ephemeral && this.directory) fs.rmSync(this.directory, { recursive: true, force: true });
  }

  private filesDirectory(): string {
    this.directory ??= fs.mkdtempSync(path.join(os.tmpdir(), "kanbalone-images-"));
    fs.mkdirSync(this.directory, { mode: 0o700, recursive: true });
    if (!fs.lstatSync(this.directory).isDirectory()) throw storageError();
    return this.directory;
  }

  metadata(id: string): AttachmentMeta | undefined {
    if (!attachmentIdPattern.test(id)) return;
    const row = this.sqlite.prepare("SELECT id, media_type AS mediaType, byte_size AS byteSize FROM attachments WHERE id = ?")
      .get(id) as AttachmentMeta | undefined;
    if (row && (!imageMediaTypes.includes(row.mediaType) || !Number.isSafeInteger(row.byteSize) ||
        row.byteSize <= 0 || row.byteSize > imageByteLimit)) throw storageError();
    return row;
  }

  private openFile(meta: AttachmentMeta): number {
    if (!this.directory || !attachmentIdPattern.test(meta.id)) throw storageError();
    let fd: number | undefined;
    try {
      if (!fs.lstatSync(this.directory).isDirectory()) throw storageError();
      fd = fs.openSync(path.join(this.directory, meta.id), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size !== meta.byteSize) throw storageError();
      return fd;
    } catch {
      if (fd !== undefined) fs.closeSync(fd);
      throw storageError();
    }
  }

  async stream(meta: AttachmentMeta) {
    const fd = this.openFile(meta);
    try {
      const hash = createHash("sha256");
      const chunk = Buffer.allocUnsafe(64 * 1024);
      let offset = 0;
      while (offset < meta.byteSize) {
        const { bytesRead } = await read(fd, chunk, 0, Math.min(chunk.length, meta.byteSize - offset), offset);
        if (!bytesRead) throw storageError();
        hash.update(chunk.subarray(0, bytesRead));
        offset += bytesRead;
      }
      if (hash.digest("hex") !== meta.id) throw storageError();
      return fs.createReadStream("", { fd, start: 0, autoClose: true });
    } catch {
      fs.closeSync(fd);
      throw storageError();
    }
  }

  readVerified(meta: AttachmentMeta): Buffer {
    const fd = this.openFile(meta);
    try {
      const bytes = fs.readFileSync(fd);
      if (imageDigest(bytes) !== meta.id) throw storageError();
      return bytes;
    } finally {
      fs.closeSync(fd);
    }
  }

  /** Keep the SQLite write lock until every new file and the caller's metadata are committed. */
  withWrites<T>(operation: (put: (mediaType: ImageMediaType, bytes: Buffer) => AttachmentMeta) => T): T {
    return this.sqlite.transaction(() => operation((mediaType, bytes) => this.put(mediaType, bytes))).immediate();
  }

  private put(mediaType: ImageMediaType, bytes: Buffer): AttachmentMeta {
    validateImage(mediaType, bytes);
    const meta = { id: imageDigest(bytes), mediaType, byteSize: bytes.length };
    const existing = this.metadata(meta.id);
    if (existing) {
      if (existing.mediaType !== meta.mediaType || existing.byteSize !== meta.byteSize) throw storageError();
      this.readVerified(existing);
      return existing;
    }

    try {
      const dir = this.filesDirectory();
      const target = path.join(dir, meta.id);
      const staging = path.join(dir, "." + randomUUID() + ".tmp");
      const fd = fs.openSync(staging, "wx", 0o600);
      try {
        try {
          fs.writeFileSync(fd, bytes);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        try {
          fs.linkSync(staging, target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          // A second database in this directory or an interrupted commit can leave a complete file.
          this.readVerified(meta);
        }
        const dirFd = fs.openSync(dir, "r");
        try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
      } finally {
        fs.unlinkSync(staging);
      }
    } catch {
      throw storageError();
    }
    this.sqlite.prepare("INSERT INTO attachments(id, media_type, byte_size) VALUES (?, ?, ?)").run(meta.id, mediaType, bytes.length);
    return meta;
  }
}
