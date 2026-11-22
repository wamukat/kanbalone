import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import { ticketFilterQuery, type ListTicketsFilters } from "./ticket-queries.js";
import { mapTicketSummaries, listTicketSummaries } from "./ticket-read-model.js";
import { getBlockerIdsForTicketIds, getTagsForTicketIds } from "./ticket-loaders.js";
import type { GroupTicketView, ListTicketReferenceView, TicketRelationCandidateView, TicketRow, TicketSummaryView } from "../types.js";

export type TicketOrder = "id_asc" | "position_asc" | "completed_desc";
export type TicketPageOptions = { limit?: number; cursor?: string; order?: TicketOrder };
export type PageOptions = { limit: number; cursor?: string };
type TicketPage<View> = {
  tickets: View[];
  revision: number;
  page: { total: number; nextCursor: string | null };
};
type TicketListResult = TicketPage<TicketSummaryView> | { tickets: TicketSummaryView[]; page?: never; revision?: never };
type RelationCandidateRow = Pick<TicketRow, "id" | "title" | "parent_ticket_id" | "priority" | "is_resolved">;
type ListTicketReferenceRow = Pick<TicketRow, "id" | "title" | "lane_id" | "parent_ticket_id" | "is_resolved">;
type GroupTicketRow = ListTicketReferenceRow & Pick<TicketRow, "priority" | "is_archived"> & { has_children: number };
type Cursor = { v: 1; board: number; revision: number; query: string; keys: number[]; total?: number };
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

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) fail("limit must be an integer from 1 to 200");
}

/** Keyset paging and the read-model mapping share a single SQLite read snapshot. */
function readTicketPage<Row, View>(
  sqlite: Database.Database,
  boardId: number,
  filtered: ReturnType<typeof ticketFilterQuery>,
  options: PageOptions & { reuseTotal?: true },
  keys: Key[],
  query: string,
  projection: string,
  mapRows: (rows: Row[]) => View[],
): TicketPage<View> {
  return sqlite.transaction(() => {
    const secret = (sqlite.prepare("SELECT secret FROM ticket_cursor_secret WHERE id = 1").get() as { secret: string }).secret;
    const revision = (sqlite.prepare("SELECT revision FROM ticket_list_revisions WHERE board_id = ?").get(boardId) as { revision: number } | undefined)?.revision ?? 0;
    const params = [...filtered.params];
    let sql = filtered.sql.replace("SELECT t.*", `SELECT ${projection}, ${keys.map((key, i) => `${key.expression} AS cursor_key_${i}`).join(", ")}`);
    let total: number | undefined;
    if (options.cursor !== undefined) {
      const cursor = decode(secret, options.cursor);
      if (cursor.board !== boardId || cursor.query !== query || cursor.keys.length !== keys.length) fail("cursor does not match board, filters or order");
      if (cursor.revision !== revision) fail("ticket list changed; restart pagination", 409);
      if (options.reuseTotal && cursor.total !== undefined) {
        if (!Number.isSafeInteger(cursor.total) || cursor.total < 0) fail("invalid pagination cursor");
        total = cursor.total;
      }
      const clauses = keys.map((key, i) => {
        const equals = keys.slice(0, i).map((previous, j) => { params.push(cursor.keys[j]!); return `${previous.expression} = ?`; });
        params.push(cursor.keys[i]!);
        return `(${[...equals, `${key.expression} ${key.direction === "ASC" ? ">" : "<"} ?`].join(" AND ")})`;
      });
      sql += ` AND (${clauses.join(" OR ")})`;
    }
    sql += ` ORDER BY ${keys.map(key => `${key.expression} ${key.direction}`).join(", ")} LIMIT ?`;
    const rows = sqlite.prepare(sql).all(...params, options.limit + 1) as Array<Row & Record<`cursor_key_${number}`, number>>;
    const more = rows.length > options.limit;
    const pageRows = rows.slice(0, options.limit);
    const last = pageRows.at(-1);
    total ??= (sqlite.prepare(filtered.sql.replace("SELECT t.*", "SELECT COUNT(*) AS total")).get(...filtered.params) as { total: number }).total;
    return {
      tickets: mapRows(pageRows),
      revision,
      page: {
        total,
        nextCursor: more && last ? encode(secret, {
          v: 1, board: boardId, revision, query, keys: keys.map((_key, i) => last[`cursor_key_${i}`]!),
          ...(options.reuseTotal ? { total } : {}),
        }) : null,
      },
    };
  })();
}

export function listTicketPage(sqlite: Database.Database, boardId: number, filters: ListTicketsFilters, options: TicketPageOptions): TicketListResult {
  const { limit, cursor } = options;
  if (cursor !== undefined && limit === undefined) fail("cursor requires limit");
  if (limit !== undefined) validateLimit(limit);
  if (limit === undefined && options.order === undefined) {
    // Preserve the legacy full-list query and mapping without paging overhead.
    return { tickets: listTicketSummaries(sqlite, boardId, filters) };
  }
  const order = options.order ?? "id_asc";
  const keys = orderKeys(order);
  const filtered = ticketFilterQuery(boardId, filters);
  if (limit === undefined) {
    return sqlite.transaction(() => {
      const sql = filtered.sql + ` ORDER BY ${keys.map(key => `${key.expression} ${key.direction}`).join(", ")}`;
      return { tickets: mapTicketSummaries(sqlite, boardId, sqlite.prepare(sql).all(...filtered.params) as TicketRow[]) };
    })();
  }
  // Preserve existing ticket cursors across upgrades.
  const query = createHash("sha256").update(JSON.stringify([filtered.sql, filtered.params, order])).digest("hex");
  return readTicketPage(sqlite, boardId, filtered, { limit, cursor }, keys, query, "t.*",
    (rows: TicketRow[]) => mapTicketSummaries(sqlite, boardId, rows));
}

export function listTicketRelationCandidatePage(sqlite: Database.Database, boardId: number, options: PageOptions) {
  validateLimit(options.limit);
  const order = "id_asc";
  const filtered = ticketFilterQuery(boardId, { includeArchived: true });
  const query = createHash("sha256").update(JSON.stringify(["relation-candidates", filtered.sql, filtered.params, order])).digest("hex");
  return readTicketPage(sqlite, boardId, filtered, { ...options, reuseTotal: true }, orderKeys(order), query,
    "t.id, t.title, t.parent_ticket_id, t.priority, t.is_resolved",
    (rows: RelationCandidateRow[]): TicketRelationCandidateView[] => {
      const blockers = getBlockerIdsForTicketIds(sqlite, rows.map(row => row.id));
      return rows.map(row => ({
        id: row.id,
        title: row.title,
        parentTicketId: row.parent_ticket_id,
        priority: row.priority,
        blockerIds: blockers.get(row.id) ?? [],
        isResolved: Boolean(row.is_resolved),
      }));
    });
}

const referenceProjection = "t.id, t.title, t.lane_id, t.parent_ticket_id, t.is_resolved";

function mapListTicketReference(row: ListTicketReferenceRow): ListTicketReferenceView {
  return {
    id: row.id,
    title: row.title,
    laneId: row.lane_id,
    parentTicketId: row.parent_ticket_id,
    isResolved: Boolean(row.is_resolved),
  };
}

export function listTicketReferencePage(sqlite: Database.Database, boardId: number, filters: ListTicketsFilters, options: PageOptions) {
  validateLimit(options.limit);
  const order = "position_asc";
  const filtered = ticketFilterQuery(boardId, filters);
  const query = createHash("sha256").update(JSON.stringify(["list-ticket-references", filtered.sql, filtered.params, order])).digest("hex");
  return readTicketPage(sqlite, boardId, filtered, { ...options, reuseTotal: true }, orderKeys(order), query, referenceProjection,
    (rows: ListTicketReferenceRow[]) => rows.map(mapListTicketReference));
}

export function listGroupTicketPage(sqlite: Database.Database, boardId: number, groupId: number | null, options: PageOptions) {
  validateLimit(options.limit);
  if (groupId !== null && !sqlite.prepare("SELECT 1 FROM groups WHERE id = ? AND board_id = ?").get(groupId, boardId)) {
    fail("Group not found in this board", 404);
  }
  const order = "id_asc";
  const filtered = ticketFilterQuery(boardId, { groupId, includeArchived: true });
  const query = createHash("sha256").update(JSON.stringify(["group-tickets", filtered.sql, filtered.params, order])).digest("hex");
  const projection = `${referenceProjection}, t.priority, t.is_archived,
    EXISTS (SELECT 1 FROM tickets child WHERE child.parent_ticket_id = t.id) AS has_children`;
  return readTicketPage(sqlite, boardId, filtered, { ...options, reuseTotal: true }, orderKeys(order), query, projection,
    (rows: GroupTicketRow[]): GroupTicketView[] => {
      const tags = getTagsForTicketIds(sqlite, rows.map(row => row.id));
      return rows.map(row => ({
        ...mapListTicketReference(row),
        priority: row.priority,
        isArchived: Boolean(row.is_archived),
        hasChildren: Boolean(row.has_children),
        tags: (tags.get(row.id) ?? []).map(({ id, name, color }) => ({ id, name, color })),
      }));
    });
}
