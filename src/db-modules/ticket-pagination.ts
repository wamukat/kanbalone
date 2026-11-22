import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import { ticketFilterQuery, type ListTicketsFilters } from "./ticket-queries.js";
import { mapTicketSummaries, listTicketSummaries } from "./ticket-read-model.js";
import type { TicketRow } from "../types.js";

export type TicketOrder = "id_asc" | "position_asc" | "completed_desc";
export type TicketPageOptions = { limit?: number; cursor?: string; order?: TicketOrder };
type Cursor = { v: 1; board: number; revision: number; query: string; keys: number[] };
type Key = { expression: string; direction: "ASC" | "DESC" };
function fail(message: string, statusCode = 400): never { throw Object.assign(new Error(message), { statusCode }); }
const completionTime = "COALESCE(CAST(round((julianday(t.resolved_at) - 2440587.5) * 86400000) AS INTEGER), 0)";
function orderKeys(order: TicketOrder): Key[] {
  switch (order) {
    case "id_asc": return [{ expression: "t.id", direction: "ASC" }];
    case "position_asc": return ["t.lane_id", "t.is_archived", "t.position", "t.id"].map(expression => ({ expression, direction: "ASC" }));
    case "completed_desc": return [{ expression: completionTime, direction: "DESC" }, { expression: "t.position", direction: "ASC" }, { expression: "t.id", direction: "DESC" }];
    default: return fail("invalid ticket order");
  }
}
function sign(secret: string, value: string): string { return createHmac("sha256", secret).update(value).digest("base64url"); }
function encode(secret: string, cursor: Cursor): string {
  const value = Buffer.from(JSON.stringify(cursor)).toString("base64url");
  return `${value}.${sign(secret, value)}`;
}
function decode(secret: string, value: string): Cursor {
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra !== undefined || value.length > 4096 || !/^[\w-]+$/.test(body) || !/^[\w-]+$/.test(signature)) fail("invalid pagination cursor");
  const expected = Buffer.from(sign(secret, body));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) fail("invalid pagination cursor");
  let parsed: Cursor;
  try { parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Cursor; }
  catch { return fail("invalid pagination cursor"); }
  if (!parsed || parsed.v !== 1 || !Number.isSafeInteger(parsed.board) || !Number.isSafeInteger(parsed.revision)
    || typeof parsed.query !== "string" || !Array.isArray(parsed.keys) || !parsed.keys.every(Number.isSafeInteger)) fail("invalid pagination cursor");
  return parsed;
}

/** Keyset paging and the read-model mapping share a single SQLite read snapshot. */
export function listTicketPage(sqlite: Database.Database, boardId: number, filters: ListTicketsFilters, options: TicketPageOptions) {
  if (options.cursor !== undefined && options.limit === undefined) fail("cursor requires limit");
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 200)) fail("limit must be an integer from 1 to 200");
  if (options.limit === undefined && options.order === undefined) {
    // Preserve the legacy full-list query and mapping without paging overhead.
    return { tickets: listTicketSummaries(sqlite, boardId, filters) };
  }
  const order = options.order ?? (options.limit === undefined ? "position_asc" : "id_asc");
  const keys = orderKeys(order);
  const filtered = ticketFilterQuery(boardId, filters);
  const query = createHash("sha256").update(JSON.stringify([filtered.sql, filtered.params, order])).digest("hex");
  return sqlite.transaction(() => {
    if (options.limit === undefined) {
      const sql = filtered.sql + ` ORDER BY ${keys.map(key => `${key.expression} ${key.direction}`).join(", ")}`;
      return { tickets: mapTicketSummaries(sqlite, boardId, sqlite.prepare(sql).all(...filtered.params) as TicketRow[]) };
    }
    const secret = (sqlite.prepare("SELECT secret FROM ticket_cursor_secret WHERE id = 1").get() as { secret: string }).secret;
    const revision = (sqlite.prepare("SELECT revision FROM ticket_list_revisions WHERE board_id = ?").get(boardId) as { revision: number } | undefined)?.revision ?? 0;
    const params = [...filtered.params];
    let sql = filtered.sql.replace("SELECT t.*", `SELECT t.*, ${keys.map((key, i) => `${key.expression} AS cursor_key_${i}`).join(", ")}`);
    if (options.cursor !== undefined) {
      const cursor = decode(secret, options.cursor);
      if (cursor.board !== boardId || cursor.query !== query || cursor.keys.length !== keys.length) fail("cursor does not match board, filters or order");
      if (cursor.revision !== revision) fail("ticket list changed; restart pagination", 409);
      const clauses = keys.map((key, i) => {
        const equals = keys.slice(0, i).map((previous, j) => { params.push(cursor.keys[j]!); return `${previous.expression} = ?`; });
        params.push(cursor.keys[i]!);
        return `(${[...equals, `${key.expression} ${key.direction === "ASC" ? ">" : "<"} ?`].join(" AND ")})`;
      });
      sql += ` AND (${clauses.join(" OR ")})`;
    }
    sql += ` ORDER BY ${keys.map(key => `${key.expression} ${key.direction}`).join(", ")}`;
    if (options.limit !== undefined) { sql += " LIMIT ?"; params.push(options.limit + 1); }
    const rows = sqlite.prepare(sql).all(...params) as Array<TicketRow & Record<string, number>>;
    const more = rows.length > options.limit;
    const pageRows = rows.slice(0, options.limit);
    const last = pageRows.at(-1);
    const total = (sqlite.prepare(filtered.sql.replace("SELECT t.*", "SELECT COUNT(*) AS total")).get(...filtered.params) as { total: number }).total;
    return {
      tickets: mapTicketSummaries(sqlite, boardId, pageRows),
      revision,
      page: { total, nextCursor: more && last ? encode(secret, { v: 1, board: boardId, revision, query, keys: keys.map((_key, i) => last[`cursor_key_${i}`]!) }) : null },
    };
  })();
}
