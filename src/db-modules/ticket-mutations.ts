import type Database from "better-sqlite3";

import { sanitizePriority } from "./mappers.js";
import {
  nextTicketPosition,
  normalizeVisibleAndArchivedTicketPositions,
} from "./ordering.js";
import {
  getTicket,
} from "./ticket-read-model.js";
import {
  replaceTicketBlockers,
  replaceTicketRelatedLinks,
  replaceTicketTags,
  validateParentTicket,
} from "./ticket-writes.js";
import { getTicketRemoteLink } from "./remote-tracking.js";
import {
  addBoardMoveActivity,
  addTicketActivity,
  cleanupTicketForBoardMove,
  getBoardName,
  getMoveDestination,
  touchBoard,
  type Now,
} from "./ticket-mutation-shared.js";
export {
  bulkArchiveTickets,
  bulkMoveTickets,
  bulkResolveTickets,
  bulkTransitionTickets,
} from "./ticket-bulk-mutations.js";
export {
  positionTicket,
  reorderTickets,
} from "./ticket-positioning.js";
import type {
  Id,
  LaneRow,
  TicketView,
} from "../types.js";

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
  relatedIds?: Id[];
};

export type UpdateTicketInput = Partial<CreateTicketInput> & {
  title?: string;
};

export type ReorderTicketInput = {
  ticketId: Id;
  laneId: Id;
  position: number;
};

export type MoveTicketInput = {
  boardId: Id;
  laneId: Id;
};

export type BulkMoveTicketsInput = MoveTicketInput & {
  sourceBoardId: Id;
  ticketIds: Id[];
};

export type PositionTicketInput = {
  laneId: Id;
  position?: number;
  beforeTicketId?: Id | null;
  afterTicketId?: Id | null;
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
    replaceTicketRelatedLinks(sqlite, ticketId, input.relatedIds ?? [], input.boardId);
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
  const remoteLink = getTicketRemoteLink(sqlite, ticketId);
  if (remoteLink && typeof input.title === "string" && input.title !== current.title) {
    throw new Error("Remote tracked ticket title is read-only");
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
    if (input.relatedIds) {
      replaceTicketRelatedLinks(sqlite, ticketId, input.relatedIds, nextBoardId);
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

export function moveTicket(
  sqlite: Database.Database,
  ticketId: Id,
  input: MoveTicketInput,
  now: Now,
): TicketView {
  const current = getTicket(sqlite, ticketId);
  if (!current) {
    throw new Error("Ticket not found");
  }
  const { targetBoard, targetLane } = getMoveDestination(sqlite, input);
  const sourceBoardName = getBoardName(sqlite, current.boardId);
  const boardChanged = current.boardId !== input.boardId;
  const updatedAt = now();
  const nextPosition = current.laneId === input.laneId ? current.position : nextTicketPosition(sqlite, input.laneId);
  const tx = sqlite.transaction(() => {
    sqlite
      .prepare(
        `
        UPDATE tickets
        SET board_id = ?, lane_id = ?, parent_ticket_id = ?, position = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      .run(input.boardId, input.laneId, boardChanged ? null : current.parentTicketId, nextPosition, updatedAt, ticketId);

    if (boardChanged) {
      cleanupTicketForBoardMove(sqlite, ticketId, input.boardId);
    }

    normalizeVisibleAndArchivedTicketPositions(sqlite, current.laneId);
    normalizeVisibleAndArchivedTicketPositions(sqlite, input.laneId);
    addBoardMoveActivity(sqlite, now, {
      ticketId,
      fromBoardId: current.boardId,
      fromBoardName: sourceBoardName,
      fromLaneId: current.laneId,
      targetBoard,
      targetLane,
      relationsCleared: boardChanged,
    });
    touchBoard(sqlite, current.boardId, now());
    if (boardChanged) {
      touchBoard(sqlite, input.boardId, now());
    }
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
