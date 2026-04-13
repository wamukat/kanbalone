import type Database from "better-sqlite3";

import { listLanes } from "./db-board.js";
import { sanitizePriority } from "./db-mappers.js";
import {
  nextTicketPosition,
  normalizeVisibleAndArchivedTicketPositions,
} from "./db-ordering.js";
import { getTicketRowsForBoard } from "./db-ticket-queries.js";
import {
  getTicket,
  listTickets,
  listTicketSummariesByIds,
} from "./db-ticket-read-model.js";
import {
  addActivity as insertActivity,
  replaceTicketBlockers,
  replaceTicketTags,
  validateParentTicket,
} from "./db-ticket-writes.js";
import type {
  Id,
  LaneRow,
  TicketSummaryView,
  TicketView,
} from "./types.js";

export type CreateTicketInput = {
  boardId: Id;
  laneId: Id;
  title: string;
  bodyMarkdown?: string;
  isResolved?: boolean;
  isArchived?: boolean;
  priority?: number;
  parentTicketId?: Id | null;
  tagIds?: Id[];
  blockerIds?: Id[];
};

export type UpdateTicketInput = Partial<CreateTicketInput> & {
  title?: string;
};

export type ReorderTicketInput = {
  ticketId: Id;
  laneId: Id;
  position: number;
};

export type BulkResolveTicketsInput = {
  boardId: Id;
  ticketIds: Id[];
  isResolved: boolean;
};

export type BulkTransitionTicketsInput = {
  boardId: Id;
  ticketIds: Id[];
  laneName: string;
  isResolved?: boolean;
};

export type BulkArchiveTicketsInput = {
  boardId: Id;
  ticketIds: Id[];
  isArchived: boolean;
};

type Now = () => string;

export function createTicket(
  sqlite: Database.Database,
  input: CreateTicketInput,
  now: Now,
): TicketView {
  const createdAt = now();
  const position = nextTicketPosition(sqlite, input.laneId);
  const tx = sqlite.transaction(() => {
    const result = sqlite
      .prepare(
        `
        INSERT INTO tickets (
          board_id, lane_id, parent_ticket_id, title, body_markdown, is_resolved, is_archived, priority, position, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        input.boardId,
        input.laneId,
        validateParentTicket(sqlite, null, input.parentTicketId, input.boardId),
        input.title,
        input.bodyMarkdown ?? "",
        input.isResolved ? 1 : 0,
        input.isArchived ? 1 : 0,
        sanitizePriority(input.priority),
        position,
        createdAt,
        createdAt,
      );
    const ticketId = Number(result.lastInsertRowid);
    replaceTicketTags(sqlite, ticketId, input.tagIds ?? []);
    replaceTicketBlockers(sqlite, ticketId, input.blockerIds ?? [], input.boardId);
    addTicketActivity(sqlite, now, input.boardId, ticketId, "ticket_created", "Ticket created");
    touchBoard(sqlite, input.boardId, now());
    return ticketId;
  });
  return getTicket(sqlite, tx())!;
}

export function updateTicket(
  sqlite: Database.Database,
  ticketId: Id,
  input: UpdateTicketInput,
  now: Now,
): TicketView {
  const current = getTicket(sqlite, ticketId);
  if (!current) {
    throw new Error("Ticket not found");
  }
  const nextLaneId = input.laneId ?? current.laneId;
  const nextBoardId = input.boardId ?? current.boardId;
  const tx = sqlite.transaction(() => {
    sqlite
      .prepare(
        `
        UPDATE tickets
        SET board_id = ?, lane_id = ?, parent_ticket_id = ?, title = ?, body_markdown = ?, is_resolved = ?, is_archived = ?, priority = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      .run(
        nextBoardId,
        nextLaneId,
        validateParentTicket(
          sqlite,
          ticketId,
          input.parentTicketId !== undefined ? input.parentTicketId : current.parentTicketId,
          nextBoardId,
        ),
        input.title ?? current.title,
        input.bodyMarkdown ?? current.bodyMarkdown,
        typeof input.isResolved === "boolean" ? Number(input.isResolved) : Number(current.isResolved),
        typeof input.isArchived === "boolean" ? Number(input.isArchived) : Number(current.isArchived),
        input.priority == null ? current.priority : sanitizePriority(input.priority),
        now(),
        ticketId,
      );
    if (input.tagIds) {
      replaceTicketTags(sqlite, ticketId, input.tagIds);
    }
    if (input.blockerIds) {
      replaceTicketBlockers(sqlite, ticketId, input.blockerIds, nextBoardId);
    }
    if (nextLaneId !== current.laneId) {
      sqlite
        .prepare("UPDATE tickets SET position = ? WHERE id = ?")
        .run(nextTicketPosition(sqlite, nextLaneId), ticketId);
      normalizeVisibleAndArchivedTicketPositions(sqlite, current.laneId);
      normalizeVisibleAndArchivedTicketPositions(sqlite, nextLaneId);
    } else if (typeof input.isArchived === "boolean" && input.isArchived !== current.isArchived) {
      sqlite
        .prepare("UPDATE tickets SET position = ? WHERE id = ?")
        .run(nextTicketPosition(sqlite, nextLaneId), ticketId);
      normalizeVisibleAndArchivedTicketPositions(sqlite, nextLaneId);
    }
    const nextArchived = typeof input.isArchived === "boolean" ? input.isArchived : current.isArchived;
    const nextResolved = typeof input.isResolved === "boolean" ? input.isResolved : current.isResolved;
    const nextTitle = input.title ?? current.title;
    const message = nextArchived !== current.isArchived
      ? (nextArchived ? "Ticket archived" : "Ticket restored")
        : input.laneId != null && input.laneId !== current.laneId
          ? "Ticket moved"
          : typeof input.isResolved === "boolean" && nextResolved !== current.isResolved
            ? (nextResolved ? "Ticket resolved" : "Ticket reopened")
          : nextTitle !== current.title
            ? "Ticket title updated"
            : "Ticket updated";
    const action = nextArchived !== current.isArchived
      ? (nextArchived ? "ticket_archived" : "ticket_restored")
      : input.laneId != null && input.laneId !== current.laneId
        ? "ticket_transitioned"
        : "ticket_updated";
    addTicketActivity(sqlite, now, nextBoardId, ticketId, action, message);
    touchBoard(sqlite, nextBoardId, now());
  });
  tx();
  return getTicket(sqlite, ticketId)!;
}

export function deleteTicket(sqlite: Database.Database, ticketId: Id, now: Now): void {
  const ticket = getTicket(sqlite, ticketId);
  if (!ticket) {
    throw new Error("Ticket not found");
  }
  const tx = sqlite.transaction(() => {
    addTicketActivity(sqlite, now, ticket.boardId, ticketId, "ticket_deleted", "Ticket deleted", {
      title: ticket.title,
      laneId: ticket.laneId,
      isResolved: ticket.isResolved,
      isArchived: ticket.isArchived,
    });
    sqlite.prepare("UPDATE tickets SET parent_ticket_id = NULL WHERE parent_ticket_id = ?").run(ticketId);
    sqlite.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
    normalizeVisibleAndArchivedTicketPositions(sqlite, ticket.laneId);
    touchBoard(sqlite, ticket.boardId, now());
  });
  tx();
}

export function transitionTicket(
  sqlite: Database.Database,
  ticketId: Id,
  laneName: string,
  isResolved: boolean | undefined,
  now: Now,
): TicketView {
  const current = getTicket(sqlite, ticketId);
  if (!current) {
    throw new Error("Ticket not found");
  }
  const lane = sqlite
    .prepare("SELECT * FROM lanes WHERE board_id = ? AND name = ?")
    .get(current.boardId, laneName) as LaneRow | undefined;
  if (!lane) {
    throw new Error("Lane not found");
  }
  return updateTicket(sqlite, ticketId, {
    laneId: lane.id,
    isResolved,
  }, now);
}

export function reorderTickets(
  sqlite: Database.Database,
  boardId: Id,
  items: ReorderTicketInput[],
  now: Now,
): TicketView[] {
  const tickets = listTickets(sqlite, boardId);
  if (tickets.length !== items.length || tickets.some((ticket) => !items.find((item) => item.ticketId === ticket.id))) {
    throw new Error("Ticket order does not match board tickets");
  }
  const laneRows = listLanes(sqlite, boardId);
  const lanes = new Set(laneRows.map((lane) => lane.id));
  const laneNameById = new Map(laneRows.map((lane) => [lane.id, lane.name]));
  const currentRows = getTicketRowsForBoard(sqlite, boardId, items.map((item) => item.ticketId));
  const currentRowsById = new Map(currentRows.map((row) => [row.id, row]));
  const updateStmt = sqlite.prepare("UPDATE tickets SET lane_id = ?, position = ?, updated_at = ? WHERE id = ?");
  const tx = sqlite.transaction(() => {
    const updatedAt = now();
    const affectedLaneIds = new Set<Id>();
    currentRows.forEach((row) => affectedLaneIds.add(row.lane_id));
    items.forEach((item) => {
      if (!lanes.has(item.laneId)) {
        throw new Error("Lane does not belong to board");
      }
      affectedLaneIds.add(item.laneId);
      updateStmt.run(item.laneId, item.position, updatedAt, item.ticketId);
      const current = currentRowsById.get(item.ticketId);
      if (current && current.lane_id !== item.laneId) {
        addTicketActivity(
          sqlite,
          now,
          boardId,
          item.ticketId,
          "ticket_transitioned",
          `Moved to ${laneNameById.get(item.laneId) ?? "lane"}`,
          {
            fromLaneId: current.lane_id,
            toLaneId: item.laneId,
          },
        );
      }
    });
    affectedLaneIds.forEach((laneId) => normalizeVisibleAndArchivedTicketPositions(sqlite, laneId));
    touchBoard(sqlite, boardId, now());
  });
  tx();
  return listTickets(sqlite, boardId);
}

export function bulkResolveTickets(
  sqlite: Database.Database,
  input: BulkResolveTicketsInput,
  now: Now,
): TicketSummaryView[] {
  const rows = getTicketRowsForBoard(sqlite, input.boardId, input.ticketIds);
  if (rows.length !== input.ticketIds.length) {
    throw new Error("Some tickets do not belong to board");
  }
  if (rows.length === 0) {
    return [];
  }
  const updatedAt = now();
  const stmt = sqlite.prepare("UPDATE tickets SET is_resolved = ?, updated_at = ? WHERE id = ?");
  const tx = sqlite.transaction(() => {
    rows.forEach((row) => stmt.run(input.isResolved ? 1 : 0, updatedAt, row.id));
    rows.forEach((row) =>
      addTicketActivity(
        sqlite,
        now,
        input.boardId,
        row.id,
        input.isResolved ? "ticket_resolved" : "ticket_reopened",
        input.isResolved ? "Ticket resolved" : "Ticket reopened",
      ),
    );
    touchBoard(sqlite, input.boardId, now());
  });
  tx();
  return listTicketSummariesByIds(sqlite, input.boardId, input.ticketIds);
}

export function bulkTransitionTickets(
  sqlite: Database.Database,
  input: BulkTransitionTicketsInput,
  now: Now,
): TicketSummaryView[] {
  const rows = getTicketRowsForBoard(sqlite, input.boardId, input.ticketIds);
  if (rows.length !== input.ticketIds.length) {
    throw new Error("Some tickets do not belong to board");
  }
  if (rows.length === 0) {
    return [];
  }
  const lane = sqlite
    .prepare("SELECT * FROM lanes WHERE board_id = ? AND name = ?")
    .get(input.boardId, input.laneName) as LaneRow | undefined;
  if (!lane) {
    throw new Error("Lane not found");
  }

  const updatedAt = now();
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const movingRows = rows.filter((row) => row.lane_id !== lane.id);
  const nextPosition = nextTicketPosition(sqlite, lane.id);
  const updateStmt = sqlite.prepare(
    "UPDATE tickets SET lane_id = ?, position = ?, is_resolved = ?, updated_at = ? WHERE id = ?",
  );
  const updateSameLaneStmt = sqlite.prepare(
    "UPDATE tickets SET is_resolved = ?, updated_at = ? WHERE id = ?",
  );
  const tx = sqlite.transaction(() => {
    let targetPosition = nextPosition;
    for (const ticketId of input.ticketIds) {
      const row = rowsById.get(ticketId)!;
      const nextResolved = typeof input.isResolved === "boolean" ? Number(input.isResolved) : row.is_resolved;
      if (row.lane_id === lane.id) {
        updateSameLaneStmt.run(nextResolved, updatedAt, row.id);
        addTicketActivity(sqlite, now, input.boardId, row.id, "ticket_transitioned", `Moved to ${input.laneName}`);
        continue;
      }
      updateStmt.run(lane.id, targetPosition, nextResolved, updatedAt, row.id);
      addTicketActivity(sqlite, now, input.boardId, row.id, "ticket_transitioned", `Moved to ${input.laneName}`);
      targetPosition += 1;
    }
    const sourceLaneIds = [...new Set(movingRows.map((row) => row.lane_id))];
    sourceLaneIds.forEach((laneId) => normalizeVisibleAndArchivedTicketPositions(sqlite, laneId));
    normalizeVisibleAndArchivedTicketPositions(sqlite, lane.id);
    touchBoard(sqlite, input.boardId, now());
  });
  tx();
  return listTicketSummariesByIds(sqlite, input.boardId, input.ticketIds);
}

export function bulkArchiveTickets(
  sqlite: Database.Database,
  input: BulkArchiveTicketsInput,
  now: Now,
): TicketSummaryView[] {
  const rows = getTicketRowsForBoard(sqlite, input.boardId, input.ticketIds);
  if (rows.length !== input.ticketIds.length) {
    throw new Error("Some tickets do not belong to board");
  }
  if (rows.length === 0) {
    return [];
  }
  const updatedAt = now();
  const updateStmt = sqlite.prepare(
    "UPDATE tickets SET is_archived = ?, position = ?, updated_at = ? WHERE id = ?",
  );
  const tx = sqlite.transaction(() => {
    const affectedLaneIds = new Set<Id>();
    for (const row of rows) {
      affectedLaneIds.add(row.lane_id);
      const nextPosition = input.isArchived ? nextTicketPosition(sqlite, row.lane_id) : row.position;
      updateStmt.run(input.isArchived ? 1 : 0, nextPosition, updatedAt, row.id);
      addTicketActivity(
        sqlite,
        now,
        input.boardId,
        row.id,
        input.isArchived ? "ticket_archived" : "ticket_restored",
        input.isArchived ? "Ticket archived" : "Ticket restored",
      );
    }
    affectedLaneIds.forEach((laneId) => normalizeVisibleAndArchivedTicketPositions(sqlite, laneId));
    touchBoard(sqlite, input.boardId, now());
  });
  tx();
  return listTicketSummariesByIds(sqlite, input.boardId, input.ticketIds);
}

function addTicketActivity(
  sqlite: Database.Database,
  now: Now,
  boardId: Id,
  ticketId: Id,
  action: string,
  message: string,
  details: Record<string, unknown> = {},
): void {
  insertActivity(sqlite, { boardId, ticketId, action, message, details, createdAt: now() });
}

function touchBoard(sqlite: Database.Database, boardId: Id, updatedAt: string): void {
  sqlite.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(updatedAt, boardId);
}
