import type Database from "better-sqlite3";

import type { Id, TicketRow } from "../types.js";

export type ListTicketsFilters = {
  laneId?: number;
  tag?: string;
  resolved?: boolean;
  q?: string;
  archived?: boolean;
  includeArchived?: boolean;
};

export function getTicketRowsForBoard(
  sqlite: Database.Database,
  boardId: Id,
  ticketIds: Id[],
): TicketRow[] {
  if (ticketIds.length === 0) {
    return [];
  }
  const uniqueIds = [...new Set(ticketIds)];
  const placeholders = uniqueIds.map(() => "?").join(", ");
  return sqlite
    .prepare(
      `SELECT * FROM tickets WHERE board_id = ? AND id IN (${placeholders}) ORDER BY id ASC`,
    )
    .all(boardId, ...uniqueIds) as TicketRow[];
}

export function listTicketRows(
  sqlite: Database.Database,
  boardId: Id,
  filters: ListTicketsFilters = {},
): TicketRow[] {
  let sql = `
    SELECT t.*
    FROM tickets t
    WHERE t.board_id = ?
  `;
  const params: Array<string | number> = [boardId];

  if (typeof filters.laneId === "number") {
    sql += " AND t.lane_id = ?";
    params.push(filters.laneId);
  }
  if (typeof filters.resolved === "boolean") {
    sql += " AND t.is_resolved = ?";
    params.push(filters.resolved ? 1 : 0);
  }
  if (filters.archived === true) {
    sql += " AND t.is_archived = 1";
  } else if (filters.archived === false || !filters.includeArchived) {
    sql += " AND t.is_archived = 0";
  }
  if (filters.q) {
    const q = filters.q.trim();
    const idQuery = q.startsWith("#") ? q.slice(1) : q;
    const likeQuery = `%${q}%`;
    sql += " AND (t.title LIKE ? OR t.body_markdown LIKE ? OR CAST(t.id AS TEXT) LIKE ? OR ('#' || t.id) LIKE ?)";
    params.push(likeQuery, likeQuery, `%${idQuery}%`, likeQuery);
  }
  if (filters.tag) {
    sql += `
      AND EXISTS (
        SELECT 1
        FROM ticket_tags tt
        INNER JOIN tags tag ON tag.id = tt.tag_id
        WHERE tt.ticket_id = t.id
          AND tag.name = ?
      )
    `;
    params.push(filters.tag);
  }
  sql += " ORDER BY t.lane_id ASC, t.is_archived ASC, t.position ASC, t.id ASC";

  return sqlite.prepare(sql).all(...params) as TicketRow[];
}
