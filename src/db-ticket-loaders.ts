import type Database from "better-sqlite3";

import { mapComment, mapRelation, mapTag } from "./db-mappers.js";
import type {
  CommentRow,
  CommentView,
  Id,
  TagRow,
  TagView,
  TicketBlockerView,
  TicketRelationView,
} from "./types.js";

type TicketRelationRow = {
  ticket_id: Id;
  id: Id;
  title: string;
  lane_id: Id;
  is_resolved: number;
  priority: number;
  board_name: string;
};

export function getTagsForTicketIds(sqlite: Database.Database, ticketIds: Id[]): Map<Id, TagView[]> {
  const tagsByTicket = new Map<Id, TagView[]>();
  if (ticketIds.length === 0) {
    return tagsByTicket;
  }
  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = sqlite.prepare(`
    SELECT tl.ticket_id, l.*
    FROM ticket_tags tl
    INNER JOIN tags l ON l.id = tl.tag_id
    WHERE tl.ticket_id IN (${placeholders})
    ORDER BY l.name ASC, l.id ASC
  `).all(...ticketIds) as Array<{ ticket_id: Id } & TagRow>;

  rows.forEach((row) => {
    const entry = tagsByTicket.get(row.ticket_id) ?? [];
    entry.push(mapTag(row));
    tagsByTicket.set(row.ticket_id, entry);
  });
  return tagsByTicket;
}

export function getCommentsForTicketIds(sqlite: Database.Database, ticketIds: Id[]): Map<Id, CommentView[]> {
  const commentsByTicket = new Map<Id, CommentView[]>();
  if (ticketIds.length === 0) {
    return commentsByTicket;
  }
  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = sqlite.prepare(`
    SELECT *
    FROM comments
    WHERE ticket_id IN (${placeholders})
    ORDER BY created_at DESC, id DESC
  `).all(...ticketIds) as CommentRow[];

  rows.forEach((row) => {
    const entry = commentsByTicket.get(row.ticket_id) ?? [];
    entry.push(mapComment(row));
    commentsByTicket.set(row.ticket_id, entry);
  });
  return commentsByTicket;
}

export function getParentsForTicketIds(sqlite: Database.Database, ticketIds: Id[]): Map<Id, TicketRelationView> {
  const parentsByTicket = new Map<Id, TicketRelationView>();
  const relationsByTicket = getRelationEntriesForTicketIds(sqlite, ticketIds, `
    SELECT child.id AS ticket_id, parent.id, parent.title, parent.lane_id, parent.is_resolved, parent.priority, board.name AS board_name
    FROM tickets child
    INNER JOIN tickets parent ON parent.id = child.parent_ticket_id
    INNER JOIN boards board ON board.id = parent.board_id
    WHERE child.id IN ({placeholders})
  `);
  relationsByTicket.forEach((relations, ticketId) => {
    const [parent] = relations;
    if (parent) {
      parentsByTicket.set(ticketId, parent);
    }
  });
  return parentsByTicket;
}

export function getChildrenForTicketIds(sqlite: Database.Database, ticketIds: Id[]): Map<Id, TicketRelationView[]> {
  return getRelationEntriesForTicketIds(sqlite, ticketIds, `
    SELECT parent_ticket_id AS ticket_id, tickets.id, tickets.title, tickets.lane_id, tickets.is_resolved, tickets.priority, board.name AS board_name
    FROM tickets
    INNER JOIN boards board ON board.id = tickets.board_id
    WHERE parent_ticket_id IN ({placeholders})
    ORDER BY tickets.priority DESC, tickets.id ASC
  `);
}

export function getBlockersForTicketIds(sqlite: Database.Database, ticketIds: Id[]): Map<Id, TicketBlockerView[]> {
  return getRelationEntriesForTicketIds(sqlite, ticketIds, `
    SELECT tb.ticket_id, t.id, t.title, t.lane_id, t.is_resolved, t.priority, board.name AS board_name
    FROM ticket_blockers tb
    INNER JOIN tickets t ON t.id = tb.blocker_ticket_id
    INNER JOIN boards board ON board.id = t.board_id
    WHERE tb.ticket_id IN ({placeholders})
    ORDER BY t.priority DESC, t.id ASC
  `);
}

export function getBlockerIdsForTicketIds(sqlite: Database.Database, ticketIds: Id[]): Map<Id, Id[]> {
  const blockerIdsByTicket = new Map<Id, Id[]>();
  if (ticketIds.length === 0) {
    return blockerIdsByTicket;
  }
  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = sqlite.prepare(`
    SELECT ticket_id, blocker_ticket_id
    FROM ticket_blockers
    WHERE ticket_id IN (${placeholders})
    ORDER BY blocker_ticket_id ASC
  `).all(...ticketIds) as Array<{ ticket_id: Id; blocker_ticket_id: Id }>;

  rows.forEach((row) => {
    const entry = blockerIdsByTicket.get(row.ticket_id) ?? [];
    entry.push(row.blocker_ticket_id);
    blockerIdsByTicket.set(row.ticket_id, entry);
  });
  return blockerIdsByTicket;
}

export function getBlockedTicketsForTicketIds(sqlite: Database.Database, ticketIds: Id[]): Map<Id, TicketRelationView[]> {
  return getRelationEntriesForTicketIds(sqlite, ticketIds, `
    SELECT tb.blocker_ticket_id AS ticket_id, t.id, t.title, t.lane_id, t.is_resolved, t.priority, board.name AS board_name
    FROM ticket_blockers tb
    INNER JOIN tickets t ON t.id = tb.ticket_id
    INNER JOIN boards board ON board.id = t.board_id
    WHERE tb.blocker_ticket_id IN ({placeholders})
    ORDER BY t.priority DESC, t.id ASC
  `);
}

function getRelationEntriesForTicketIds(
  sqlite: Database.Database,
  ticketIds: Id[],
  query: string,
): Map<Id, TicketRelationView[]> {
  const relationsByTicket = new Map<Id, TicketRelationView[]>();
  if (ticketIds.length === 0) {
    return relationsByTicket;
  }
  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = sqlite
    .prepare(query.replace("{placeholders}", placeholders))
    .all(...ticketIds) as TicketRelationRow[];

  rows.forEach((row) => {
    const entry = relationsByTicket.get(row.ticket_id) ?? [];
    entry.push(mapRelation(row, row.board_name));
    relationsByTicket.set(row.ticket_id, entry);
  });
  return relationsByTicket;
}
