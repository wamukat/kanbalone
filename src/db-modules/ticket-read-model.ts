import type Database from "better-sqlite3";

import { getBoard } from "./board.js";
import { mapTicket, mapTicketSummary } from "./mappers.js";
import {
  getBlockedTicketsForTicketIds,
  getBlockerIdsForTicketIds,
  getBlockersForTicketIds,
  getChildrenForTicketIds,
  getCommentsForTicketIds,
  getParentsForTicketIds,
  getRemoteLinksForTicketIds,
  getTagsForTicketIds,
} from "./ticket-loaders.js";
import {
  getTicketRowsForBoard,
  listTicketRows,
  type ListTicketsFilters,
} from "./ticket-queries.js";
import type {
  Id,
  TicketRelationsView,
  TicketRow,
  TicketSummaryView,
  TicketView,
} from "../types.js";

export function listTicketSummaries(
  sqlite: Database.Database,
  boardId: Id,
  filters: ListTicketsFilters = {},
): TicketSummaryView[] {
  const rows = listTicketRows(sqlite, boardId, filters);
  return mapTicketSummaries(sqlite, boardId, rows);
}

export function listTickets(
  sqlite: Database.Database,
  boardId: Id,
  filters: ListTicketsFilters = {},
): TicketView[] {
  const rows = listTicketRows(sqlite, boardId, filters);
  const ticketIds = rows.map((row) => row.id);
  const tagsByTicket = getTagsForTicketIds(sqlite, ticketIds);
  const commentsByTicket = getCommentsForTicketIds(sqlite, ticketIds);
  const blockersByTicket = getBlockersForTicketIds(sqlite, ticketIds);
  const blockedByByTicket = getBlockedTicketsForTicketIds(sqlite, ticketIds);
  const parentsByTicket = getParentsForTicketIds(sqlite, ticketIds);
  const childrenByTicket = getChildrenForTicketIds(sqlite, ticketIds);
  const remoteByTicket = getRemoteLinksForTicketIds(sqlite, ticketIds);
  const board = getBoard(sqlite, boardId);
  return rows.map((row) =>
    mapTicket(
      row,
      board?.name ?? "",
      tagsByTicket.get(row.id) ?? [],
      commentsByTicket.get(row.id) ?? [],
      blockersByTicket.get(row.id) ?? [],
      blockedByByTicket.get(row.id) ?? [],
      parentsByTicket.get(row.id) ?? null,
      childrenByTicket.get(row.id) ?? [],
      remoteByTicket.get(row.id) ?? null,
    ),
  );
}

export function getTicket(sqlite: Database.Database, ticketId: Id): TicketView | null {
  const row = getTicketRow(sqlite, ticketId);
  if (!row) {
    return null;
  }
  const tagsByTicket = getTagsForTicketIds(sqlite, [ticketId]);
  const commentsByTicket = getCommentsForTicketIds(sqlite, [ticketId]);
  const blockersByTicket = getBlockersForTicketIds(sqlite, [ticketId]);
  const blockedByByTicket = getBlockedTicketsForTicketIds(sqlite, [ticketId]);
  const parentsByTicket = getParentsForTicketIds(sqlite, [ticketId]);
  const childrenByTicket = getChildrenForTicketIds(sqlite, [ticketId]);
  const remoteByTicket = getRemoteLinksForTicketIds(sqlite, [ticketId]);
  const board = getBoard(sqlite, row.board_id);
  return mapTicket(
    row,
    board?.name ?? "",
    tagsByTicket.get(ticketId) ?? [],
    commentsByTicket.get(ticketId) ?? [],
    blockersByTicket.get(ticketId) ?? [],
    blockedByByTicket.get(ticketId) ?? [],
    parentsByTicket.get(ticketId) ?? null,
    childrenByTicket.get(ticketId) ?? [],
    remoteByTicket.get(ticketId) ?? null,
  );
}

export function getTicketRelations(sqlite: Database.Database, ticketId: Id): TicketRelationsView {
  const row = getTicketRow(sqlite, ticketId);
  if (!row) {
    throw new Error("Ticket not found");
  }
  const parent = row.parent_ticket_id == null ? null : getParentsForTicketIds(sqlite, [ticketId]).get(ticketId) ?? null;
  return {
    parent,
    children: getChildrenForTicketIds(sqlite, [ticketId]).get(ticketId) ?? [],
    blockers: getBlockersForTicketIds(sqlite, [ticketId]).get(ticketId) ?? [],
    blockedBy: getBlockedTicketsForTicketIds(sqlite, [ticketId]).get(ticketId) ?? [],
  };
}

export function getTicketRow(sqlite: Database.Database, ticketId: Id): TicketRow | null {
  const row = sqlite.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as TicketRow | undefined;
  return row ?? null;
}

export function listTicketSummariesByIds(
  sqlite: Database.Database,
  boardId: Id,
  ticketIds: Id[],
): TicketSummaryView[] {
  const rows = getTicketRowsForBoard(sqlite, boardId, ticketIds);
  const order = new Map(ticketIds.map((ticketId, index) => [ticketId, index]));
  return mapTicketSummaries(sqlite, boardId, rows)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function mapTicketSummaries(
  sqlite: Database.Database,
  boardId: Id,
  rows: TicketRow[],
): TicketSummaryView[] {
  const ticketIds = rows.map((row) => row.id);
  const tagsByTicket = getTagsForTicketIds(sqlite, ticketIds);
  const blockerIdsByTicket = getBlockerIdsForTicketIds(sqlite, ticketIds);
  const remoteByTicket = getRemoteLinksForTicketIds(sqlite, ticketIds);
  const board = getBoard(sqlite, boardId);
  return rows.map((row) =>
    mapTicketSummary(
      row,
      board?.name ?? "",
      tagsByTicket.get(row.id) ?? [],
      blockerIdsByTicket.get(row.id) ?? [],
      remoteByTicket.get(row.id)
        ? {
          provider: remoteByTicket.get(row.id)!.provider,
          displayRef: remoteByTicket.get(row.id)!.displayRef,
          url: remoteByTicket.get(row.id)!.url,
        }
        : null,
    ),
  );
}
