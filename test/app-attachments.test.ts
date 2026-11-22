import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { buildApp } from "../src/app.js";
import { imageDigest } from "../src/attachments.js";
import { imageByteLimit } from "../src/image-format.js";
import type { BoardExport } from "../src/types.js";
import { createDbFile } from "./app-test-helpers.js";

type App = ReturnType<typeof buildApp>;

// Tiny real images generated with ImageMagick, including a progressive JPEG and two-frame animations.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAQMAAABIeJ9nAAAAA1BMVEUA//8ZXC8lAAAADElEQVQI12NgYGAAAAAEAAEnNCcKAAAAAElFTkSuQmCC", "base64");
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wgARCAACAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABUBAQEAAAAAAAAAAAAAAAAAAAYI/9oADAMBAAIQAxAAAAFEcyp//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=", "base64");
const gif = Buffer.from("R0lGODlhAgACAPAAAP8AAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAAAAAACwAAAAAAgACAAACAoRRACH5BAAAAAAALAAAAAACAAIAgAAA/wAAAAIChFEAOw==", "base64");
const webp = Buffer.from("UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAgA0JaACdLoB+AADsAD+8EXf/xu3GG/Bd/8jj+Rx/I4/+QyAAAA=", "base64");
const animatedWebp = Buffer.from("UklGRsAAAABXRUJQVlA4WAoAAAACAAAAAQAAAQAAQU5JTQYAAAD/////AABBTk1GSAAAAAAAAAAAAAEAAAEAAGQAAAJWUDggMAAAANABAJ0BKgIAAgACADQloAJ0ugH4AAOwAP7wxAv/ILlhdcjX/yA/5Af8gP/48gAAAEFOTUZEAAAAAAAAAAAAAQAAAQAAZAAAAFZQOCAsAAAAlAEAnQEqAgACAAAANCWgAnS6AAOYAP75k2//kB//kB//kB//ID/iF3sgMAA=", "base64");

function upload(app: App, bytes: Buffer = png, mediaType = "image/png") {
  return app.inject({ method: "POST", url: "/api/attachments", headers: { "content-type": mediaType }, payload: bytes });
}

test("raw image upload, deduplication, immutable bytes and SQLite migration survive reopen", async (t) => {
  const dbFile = createDbFile();
  const dir = path.join(path.dirname(dbFile), "attachments");
  let app = buildApp({ dbFile });
  t.after(async () => { await app.close(); fs.rmSync(path.dirname(dbFile), { recursive: true, force: true }); });
  const board = (await app.inject({ method: "POST", url: "/api/boards", payload: { name: "old board" } })).json();
  await app.close();
  const old = new Database(dbFile);
  old.exec("DROP TABLE attachments");
  old.close();
  app = buildApp({ dbFile });
  assert.equal((await app.inject("/api/boards/" + board.board.id)).json().board.name, "old board");
  assert.equal(fs.existsSync(dir), false);
  const formats: [Buffer, string][] = [[png, "image/png"], [jpeg, "image/jpeg"], [gif, "image/gif"], [webp, "image/webp"], [animatedWebp, "image/webp"]];
  for (const [bytes, mediaType] of formats) {
    const res = await upload(app, bytes, mediaType);
    assert.equal(res.statusCode, 201, res.body);
    const id = imageDigest(bytes);
    const url = "/api/attachments/" + id;
    assert.deepEqual(res.json(), { id, url, mediaType, byteSize: bytes.length });
    assert.equal(res.headers.location, url);
    assert.deepEqual(fs.readFileSync(path.join(dir, id)), bytes);
  }
  await app.close();
  app = buildApp({ dbFile });
  await Promise.all([upload(app), upload(app)]);
  assert.equal(fs.readdirSync(dir).length, formats.length);
  for (const [bytes, mediaType] of formats) {
    const res = await app.inject("/api/attachments/" + imageDigest(bytes));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.rawPayload, bytes);
    assert.equal(res.headers["content-type"], mediaType);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(Number(res.headers["content-length"]), bytes.length);
  }
});

test("attachment validation and file errors keep metadata and immutable files safe", async (t) => {
  const dbFile = createDbFile();
  const app = buildApp({ dbFile });
  const sqlite = new Database(dbFile);
  t.after(async () => { sqlite.close(); await app.close(); fs.rmSync(path.dirname(dbFile), { recursive: true, force: true }); });
  for (const [bytes, type, status] of [
    [Buffer.alloc(imageByteLimit + 1), "image/png", 413], [Buffer.from("<svg/>"), "image/svg+xml", 415],
    [Buffer.from("<svg/>"), "image/png", 400], [png.subarray(0, 24), "image/png", 400], [png, "image/gif", 400],
    [Buffer.from("not a file"), "text/plain", 415],
  ] as const) assert.equal((await upload(app, bytes, type)).statusCode, status);
  assert.deepEqual(sqlite.prepare("SELECT * FROM attachments").all(), []);
  for (const invalid of ["unknown", "f".repeat(64), "..%2Fprivate"]) {
    assert.equal((await app.inject("/api/attachments/" + invalid)).statusCode, 404);
  }

  const dir = path.join(path.dirname(dbFile), "attachments");
  fs.writeFileSync(dir, "blocked");
  assert.equal((await upload(app)).statusCode, 500);
  assert.deepEqual(sqlite.prepare("SELECT * FROM attachments").all(), []);
  fs.unlinkSync(dir);
  const image = (await upload(app)).json();
  const file = path.join(dir, image.id);
  const corrupt = Buffer.alloc(png.length);
  fs.writeFileSync(file, corrupt);
  assert.equal((await app.inject(image.url)).statusCode, 500);
  assert.equal((await upload(app)).statusCode, 500);
  assert.deepEqual(fs.readFileSync(file), corrupt);
  fs.unlinkSync(file);
  fs.symlinkSync(dbFile, file);
  assert.equal((await app.inject(image.url)).statusCode, 500);
  fs.unlinkSync(file);
  assert.equal((await app.inject(image.url)).statusCode, 500);
  assert.equal((await upload(app)).statusCode, 500);
});

test("portable board embeds only rendered local references, validates its manifest and imports atomically", async (t) => {
  const sourceFile = createDbFile(), destFile = createDbFile();
  const source = buildApp({ dbFile: sourceFile }), dest = buildApp({ dbFile: destFile });
  const importPayload = (payload: BoardExport) => dest.inject({ method: "POST", url: "/api/boards/import", payload });
  t.after(async () => {
    await Promise.all([source.close(), dest.close()]);
    for (const filename of [sourceFile, destFile]) fs.rmSync(path.dirname(filename), { recursive: true, force: true });
  });
  const board = (await source.inject({ method: "POST", url: "/api/boards", payload: { name: "Portable" } })).json();
  const url = "/api/boards/" + board.board.id;
  const bodyImage = (await upload(source)).json(), commentImage = (await upload(source, gif, "image/gif")).json();
  const groupImage = (await upload(source, webp, "image/webp")).json();
  await upload(source, jpeg, "image/jpeg"); // Cancelled draft.
  const unknown = "/api/attachments/" + "f".repeat(64);
  const ticket = (await source.inject({ method: "POST", url: url + "/tickets", payload: {
    laneId: board.lanes[0].id, title: "A", bodyMarkdown: "`![code](" + unknown + ")` ![remote](https://example.test" + unknown + ")",
  } })).json();
  assert.equal((await source.inject(url + "/export")).json().formatVersion, 2);
  const markdown = ticket.bodyMarkdown + "\n![body](" + bodyImage.url + ")";
  await source.inject({ method: "PATCH", url: "/api/tickets/" + ticket.id, payload: { bodyMarkdown: markdown } });
  const comment = "![comment](" + commentImage.url + ") [same](" + bodyImage.url + ")";
  await source.inject({ method: "POST", url: "/api/tickets/" + ticket.id + "/comments", payload: { bodyMarkdown: comment } });
  await source.inject({ method: "POST", url: url + "/groups", payload: { name: "Group", descriptionMarkdown: "![group](" + groupImage.url + ")" } });
  const exported = (await source.inject(url + "/export")).json<BoardExport>();
  assert.equal(exported.formatVersion, 3);
  assert.deepEqual(exported.attachments?.map(a => a.id).sort(), [bodyImage.id, commentImage.id, groupImage.id].sort());
  const bad = structuredClone(exported);
  bad.attachments![0].dataBase64 = gif.toString("base64");
  assert.equal((await importPayload(bad)).statusCode, 400);
  assert.equal((await importPayload({ ...exported, attachments: [] })).statusCode, 400);
  assert.equal((await importPayload({ ...exported, formatVersion: 2 })).statusCode, 400);
  const dir = path.join(path.dirname(destFile), "attachments");
  fs.writeFileSync(dir, "blocked");
  assert.equal((await importPayload(exported)).statusCode, 500);
  assert.deepEqual((await dest.inject("/api/boards")).json().boards, []);
  assert.equal((await dest.inject(bodyImage.url)).statusCode, 404);
  fs.unlinkSync(dir);
  const result = await importPayload(exported);
  assert.equal(result.statusCode, 201, result.body);
  const stored = (await dest.inject("/api/tickets/" + result.json().tickets[0].id)).json();
  assert.equal(stored.bodyMarkdown, markdown);
  assert.equal(stored.comments[0].bodyMarkdown, comment);
  assert.deepEqual((await dest.inject(bodyImage.url)).rawPayload, png);
  assert.deepEqual((await dest.inject(commentImage.url)).rawPayload, gif);
  assert.deepEqual((await dest.inject(groupImage.url)).rawPayload, webp);
  assert.equal((await importPayload(exported)).statusCode, 201);
  fs.unlinkSync(path.join(path.dirname(sourceFile), "attachments", bodyImage.id));
  assert.equal((await source.inject(url + "/export")).statusCode, 500);
});

test("an oversized portable export reports the backup alternative before reading files", async (t) => {
  const dbFile = createDbFile();
  const app = buildApp({ dbFile });
  const sqlite = new Database(dbFile);
  t.after(async () => { sqlite.close(); await app.close(); fs.rmSync(path.dirname(dbFile), { recursive: true, force: true }); });
  const board = (await app.inject({ method: "POST", url: "/api/boards", payload: { name: "Large" } })).json();
  // Synthetic metadata exercises the 64 MiB preflight without generating or committing large images.
  const ids = ["a", "b", "c", "d", "e"].map(letter => letter.repeat(64));
  const register = sqlite.prepare("INSERT INTO attachments (id, media_type, byte_size) VALUES (?, 'image/png', ?)");
  for (const id of ids) register.run(id, imageByteLimit);
  const url = "/api/boards/" + board.board.id;
  const ticket = (await app.inject({ method: "POST", url: url + "/tickets", payload: {
    laneId: board.lanes[0].id, title: "large images", bodyMarkdown: ids.map(id => "![image](/api/attachments/" + id + ")").join("\n"),
  } })).json();
  const result = await app.inject(url + "/export");
  assert.equal(result.statusCode, 413, result.body);
  assert.match(result.json().error, /backup/);
  await app.inject({ method: "PATCH", url: "/api/tickets/" + ticket.id, payload: {
    bodyMarkdown: "![unregistered](/api/attachments/" + "f".repeat(64) + ")",
  } });
  assert.equal((await app.inject(url + "/export")).statusCode, 409);
});
