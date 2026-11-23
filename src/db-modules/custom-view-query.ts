import { createHash } from "node:crypto";
import type Database from "better-sqlite3";

import { listBoards } from "./board.js";
import type { CustomViewDefinition, CustomViewRule } from "./custom-views.js";
import { decodePaginationToken, encodePaginationToken } from "./pagination-token.js";
import { getTagsForTicketIds } from "./ticket-loaders.js";

type ViewTag = { id: number; name: string; color: string };
type CatalogBoard = { id: number; name: string; tags: ViewTag[] };
type Warning = { boardId: number; kind: "missing_board" | "unset" } | { boardId: number; tagId: number; kind: "missing_tag" };
type BoardCount = { boardId: number; boardName: string | null; count: number };
type Excerpt = { excerpt: string; truncated: boolean };
type CommentExcerpt = Excerpt & { id: number; createdAt: string };
type QueryOptions = { limit: number; cursor?: string };
type Cursor = { v: 1; revision: number; query: string; keys: number[] };
type PageRow = {
  boardPosition: number;
  boardId: number;
  lanePosition: number;
  laneId: number;
  position: number;
  id: number;
  title: string;
  laneName: string;
  priority: number;
  resolved: number;
};

const order = "b.position, b.id, l.position, l.id, t.position, t.id";
const excerptLength = 360;

export function getCustomViewCatalog(sqlite: Database.Database): { boards: CatalogBoard[] } {
  return sqlite.transaction(() => {
    const boards = listBoards(sqlite).map(({ id, name }) => ({ id, name, tags: [] as ViewTag[] }));
    const byId = new Map(boards.map(board => [board.id, board]));
    const tags = sqlite.prepare("SELECT board_id, id, name, color FROM tags ORDER BY name, id")
      .all() as Array<ViewTag & { board_id: number }>;
    for (const { board_id, ...tag } of tags) byId.get(board_id)?.tags.push(tag);
    return { boards };
  })();
}

function resolveDefinition(boards: CatalogBoard[], definition: CustomViewDefinition) {
  const existing = new Set(boards.map(board => board.id));
  const selected = new Set(definition.boardIds);
  const rules = new Map(definition.rules.map(rule => [rule.boardId, rule]));
  const activeRules: CustomViewRule[] = [];
  const warnings: Warning[] = [];
  const boardCounts: BoardCount[] = [];
  for (const { id, name, tags } of boards) {
    if (definition.scope === "selected" && !selected.has(id)) continue;
    boardCounts.push({ boardId: id, boardName: name, count: 0 });
    const rule = rules.get(id);
    if (!rule) warnings.push({ boardId: id, kind: "unset" });
    else if (rule.mode === "all") activeRules.push(rule);
    else {
      const existingTags = new Set(tags.map(tag => tag.id));
      const tagIds = rule.tagIds.filter(tagId => {
        if (existingTags.has(tagId)) return true;
        warnings.push({ boardId: id, tagId, kind: "missing_tag" });
        return false;
      });
      if (tagIds.length) activeRules.push({ ...rule, tagIds });
    }
  }
  const configured = definition.scope === "selected" ? new Set([...selected, ...rules.keys()]) : rules.keys();
  for (const boardId of configured) {
    if (existing.has(boardId)) continue;
    warnings.push({ boardId, kind: "missing_board" });
    if (definition.scope === "selected" && selected.has(boardId)) boardCounts.push({ boardId, boardName: null, count: 0 });
  }
  return { activeRules, warnings, boardCounts };
}

function getCursor(secret: string, value: string, query: string, revision: number): Cursor | "invalid_cursor" | "stale_cursor" {
  const cursor = decodePaginationToken(secret, value) as Cursor | undefined;
  if (!cursor || cursor.v !== 1 || cursor.query !== query || !Number.isSafeInteger(cursor.revision)
    || !Array.isArray(cursor.keys) || cursor.keys.length !== 6 || !cursor.keys.every(Number.isSafeInteger)) return "invalid_cursor";
  return cursor.revision === revision ? cursor : "stale_cursor";
}

export function queryCustomView(sqlite: Database.Database, definition: CustomViewDefinition, { limit, cursor }: QueryOptions) {
  return sqlite.transaction(() => {
    const { revision } = sqlite.prepare("SELECT revision FROM custom_view_revision WHERE id = 1").get() as { revision: number };
    const { secret } = sqlite.prepare("SELECT secret FROM ticket_cursor_secret WHERE id = 1").get() as { secret: string };
    const query = createHash("sha256").update(JSON.stringify(["custom-view", definition])).digest("hex");
    const start = cursor === undefined ? null : getCursor(secret, cursor, query, revision);
    if (typeof start === "string") return start;
    const { boards } = getCustomViewCatalog(sqlite);
    const { activeRules, warnings, boardCounts } = resolveDefinition(boards, definition);
    if (!activeRules.length) return { revision, total: 0, boardCounts, warnings, tickets: [], nextCursor: null };

    // Match the count and page against the same predicates and database snapshot. Each board has a
    // single rule, and EXISTS keeps a ticket with multiple matching tags in the result once.
    const matchingTickets = `
      FROM json_each(@rules) AS rule
      CROSS JOIN boards b ON b.id = json_extract(rule.value, '$.boardId')
      CROSS JOIN lanes l ON l.board_id = b.id
      CROSS JOIN tickets t ON t.board_id = b.id AND t.lane_id = l.id
      WHERE t.is_archived = 0
        ${definition.completion === "all" ? "" : "AND t.is_resolved = @resolved"}
        AND (json_extract(rule.value, '$.mode') = 'all' OR EXISTS (
          SELECT 1 FROM ticket_tags tt WHERE tt.ticket_id = t.id
            AND tt.tag_id IN (SELECT value FROM json_each(rule.value, '$.tagIds'))
        ))`;
    const parameters = { rules: JSON.stringify(activeRules), resolved: Number(definition.completion === "done") };
    const counts = sqlite.prepare(`SELECT b.id, count(*) AS count ${matchingTickets} GROUP BY b.id`)
      .all(parameters) as { id: number; count: number }[];
    const countByBoard = new Map(counts.map(({ id, count }) => [id, count]));
    for (const board of boardCounts) board.count = countByBoard.get(board.boardId) ?? 0;
    const total = counts.reduce((sum, board) => sum + board.count, 0);
    const rows = sqlite.prepare(`
      SELECT b.position AS boardPosition, b.id AS boardId, l.position AS lanePosition,
             l.id AS laneId, t.position, t.id, t.title, l.name AS laneName, t.priority, t.is_resolved AS resolved
      ${matchingTickets}
      ${start ? `AND (${order}) > (@k0, @k1, @k2, @k3, @k4, @k5)` : ""}
      ORDER BY ${order} LIMIT @limit
    `).all({ ...parameters, limit: limit + 1, ...Object.fromEntries((start?.keys ?? []).map((key, i) => [`k${i}`, key])) }) as PageRow[];
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const nextCursor = rows.length > limit && last ? encodePaginationToken(secret, {
      v: 1, revision, query, keys: [last.boardPosition, last.boardId, last.lanePosition, last.laneId, last.position, last.id],
    }) : null;
    return { revision, total, boardCounts, warnings, tickets: mapPage(sqlite, page, definition), nextCursor };
  })();
}

function originalExcerpt(bodyMarkdown: string): Excerpt {
  const characters = Array.from(bodyMarkdown);
  return { excerpt: characters.slice(0, excerptLength).join(""), truncated: characters.length > excerptLength };
}

// Read one extra character to mark truncation. SQLite's text substr stops at NUL; preserve
// any imported Markdown with an embedded NUL by slicing that exceptional case in JavaScript.
function excerptProjection(column: string): string {
  return `CASE WHEN instr(${column}, char(0)) > 0 THEN ${column} ELSE substr(${column}, 1, ${excerptLength + 1}) END`;
}

function mapPage(sqlite: Database.Database, rows: PageRow[], definition: CustomViewDefinition) {
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const tags = getTagsForTicketIds(sqlite, ids);
  const placeholders = ids.map(() => "?").join(", ");
  const bodies = new Map<number, Excerpt>();
  if (definition.showBody) {
    const text = sqlite.prepare(`SELECT id, ${excerptProjection("body_markdown")} AS markdown FROM tickets WHERE id IN (${placeholders})`)
      .all(...ids) as { id: number; markdown: string }[];
    for (const { id, markdown } of text) bodies.set(id, originalExcerpt(markdown));
  }
  const latestComments = new Map<number, CommentExcerpt>();
  if (definition.showLatestComment) {
    const text = sqlite.prepare(`
      SELECT t.id AS ticketId, c.id, c.created_at AS createdAt, ${excerptProjection("c.body_markdown")} AS markdown
      FROM tickets t JOIN comments c ON c.id = (
        SELECT id FROM comments WHERE ticket_id = t.id ORDER BY created_at DESC, id DESC LIMIT 1
      ) WHERE t.id IN (${placeholders})
    `).all(...ids) as { ticketId: number; id: number; createdAt: string; markdown: string }[];
    for (const { ticketId, id, createdAt, markdown } of text) latestComments.set(ticketId, { id, createdAt, ...originalExcerpt(markdown) });
  }
  return rows.map(({ id, boardId, laneId, title, laneName, priority, resolved }) => ({
    id, boardId, laneId, title, laneName, priority, isResolved: Boolean(resolved),
    tags: (tags.get(id) ?? []).map(({ id, name, color }) => ({ id, name, color })),
    ...(definition.showBody ? { body: bodies.get(id)! } : {}),
    ...(definition.showLatestComment ? { latestComment: latestComments.get(id) ?? null } : {}),
  }));
}

export function getCustomViewText(sqlite: Database.Database, ticketId: number, commentId?: number) {
  const row = commentId === undefined
    ? sqlite.prepare("SELECT body_markdown AS bodyMarkdown FROM tickets WHERE id = ?").get(ticketId)
    : sqlite.prepare("SELECT body_markdown AS bodyMarkdown FROM comments WHERE id = ? AND ticket_id = ?").get(commentId, ticketId);
  return row as { bodyMarkdown: string } | undefined;
}
