import type Database from "better-sqlite3";

import type { Id, TicketRow } from "../types.js";

export type ListTicketsFilters = {
  priorities?: number[];
  groupId?: number | null;
  ungrouped?: boolean;
  laneId?: number;
  laneIds?: number[];
  laneName?: string;
  parentTicketId?: number | null;
  tag?: string;
  tagIds?: number[];
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
  const { sql, params } = ticketFilterQuery(boardId, filters);
  return sqlite.prepare(sql + " ORDER BY t.lane_id ASC, t.is_archived ASC, t.position ASC, t.id ASC").all(...params) as TicketRow[];
}

export function ticketFilterQuery(boardId: Id, filters: ListTicketsFilters = {}): { sql: string; params: Array<string | number | null> } {
  let sql = `
    SELECT t.*
    FROM tickets t
    WHERE t.board_id = ?
  `;
  const params: Array<string | number | null> = [boardId];

  if (filters.groupId === null || filters.ungrouped === true) { sql += " AND t.group_id IS NULL"; }
  else if (filters.groupId !== undefined) { sql += " AND t.group_id = ?"; params.push(filters.groupId); }

  if (typeof filters.laneId === "number") {
    sql += " AND t.lane_id = ?";
    params.push(filters.laneId);
  }
  if (filters.laneIds?.length) {
    sql += " AND t.lane_id IN (SELECT value FROM json_each(?))";
    params.push(JSON.stringify(filters.laneIds));
  }
  if (filters.laneName !== undefined) {
    sql += " AND t.lane_id IN (SELECT id FROM lanes WHERE board_id = ? AND name = ?)";
    params.push(boardId, filters.laneName);
  }
  if (filters.parentTicketId === null) {
    sql += " AND t.parent_ticket_id IS NULL";
  } else if (filters.parentTicketId !== undefined) {
    sql += " AND t.parent_ticket_id = ?";
    params.push(filters.parentTicketId);
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
    const localTicketRef = q.match(/^#(?<ticketId>\d+)$/)?.groups?.ticketId;
    const externalRefQuery = parseExternalRefQuery(q);
    const likeQuery = `%${q}%`;
    const remoteReferenceClause =
      !localTicketRef && (!externalRefQuery || externalRefQuery.scope !== "external")
        ? `
        OR EXISTS (
          SELECT 1
          FROM ticket_remote_links trl
          WHERE trl.ticket_id = t.id
            AND (
              ${!externalRefQuery ? `trl.provider LIKE ?
              OR trl.project_key LIKE ?
              OR trl.issue_key LIKE ?
              OR trl.display_ref LIKE ?
              OR trl.remote_url LIKE ?
              OR trl.remote_title LIKE ?` : "(trl.issue_key = ? AND (? IS NULL OR trl.provider = ?))"}
            )
        )`
        : "";
    const externalReferenceClause =
      !localTicketRef && (!externalRefQuery || externalRefQuery.scope !== "remote")
        ? `
        OR EXISTS (
          SELECT 1
          FROM ticket_external_references ter
          WHERE ter.ticket_id = t.id
            AND (
              ${!externalRefQuery ? `ter.kind LIKE ?
              OR ter.provider LIKE ?
              OR ter.project_key LIKE ?
              OR ter.issue_key LIKE ?
              OR ter.display_ref LIKE ?
              OR ter.remote_url LIKE ?
              OR ter.remote_title LIKE ?` : "(ter.issue_key = ? AND (? IS NULL OR ter.provider = ?))"}
            )
        )`
        : "";
    sql += `
      AND (
        t.title LIKE ?
        OR t.body_markdown LIKE ?
        OR ${localTicketRef ? "t.id = ?" : "CAST(t.id AS TEXT) LIKE ?"}
        OR ${localTicketRef ? "('#' || t.id) = ?" : "('#' || t.id) LIKE ?"}
        ${remoteReferenceClause}
        ${externalReferenceClause}
      )
    `;
    params.push(likeQuery, likeQuery, localTicketRef ?? `%${q}%`, localTicketRef ? `#${localTicketRef}` : likeQuery);
    if (!localTicketRef && !externalRefQuery && remoteReferenceClause) {
      params.push(likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery);
    } else if (!localTicketRef && externalRefQuery && externalRefQuery.scope !== "external") {
      params.push(externalRefQuery.issueKey, externalRefQuery.provider, externalRefQuery.provider);
    }
    if (!localTicketRef && !externalRefQuery && externalReferenceClause) {
      params.push(likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery);
    } else if (!localTicketRef && externalRefQuery && externalRefQuery.scope !== "remote") {
      params.push(externalRefQuery.issueKey, externalRefQuery.provider, externalRefQuery.provider);
    }
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
  if (filters.tagIds?.length) {
    sql += `
      AND EXISTS (
        SELECT 1
        FROM ticket_tags tt
        WHERE tt.ticket_id = t.id
          AND tt.tag_id IN (
            SELECT id FROM tags WHERE board_id = ? AND id IN (SELECT value FROM json_each(?))
          )
      )
    `;
    params.push(boardId, JSON.stringify(filters.tagIds));
  }
  if (filters.priorities?.length) {
    sql += ` AND t.priority IN (${filters.priorities.map(() => "?").join(",")})`;
    params.push(...filters.priorities);
  }
  return { sql, params };
}

function parseExternalRefQuery(query: string): { provider: string | null; issueKey: string; scope: "remote" | "external" | "both" } | null {
  const match = query.trim().match(/^(?<prefix>[a-z][a-z0-9_-]*)#(?<issueKey>[^#\s]+)$/i);
  const prefix = match?.groups?.prefix.toLowerCase();
  const issueKey = match?.groups?.issueKey;
  if (!prefix || !issueKey) {
    return null;
  }
  const refByPrefix: Record<string, { provider: string | null; scope: "remote" | "external" | "both" }> = {
    gh: { provider: "github", scope: "both" },
    github: { provider: "github", scope: "both" },
    gl: { provider: "gitlab", scope: "both" },
    gitlab: { provider: "gitlab", scope: "both" },
    rm: { provider: "redmine", scope: "both" },
    redmine: { provider: "redmine", scope: "both" },
    ext: { provider: null, scope: "external" },
    external: { provider: null, scope: "external" },
    remote: { provider: null, scope: "remote" },
  };
  const ref = refByPrefix[prefix];
  if (!ref) {
    return null;
  }
  return { ...ref, issueKey };
}
