import type Database from "better-sqlite3";

import { listLanes } from "./board.js";
import { sanitizePriority } from "./mappers.js";
import {
  nextTicketPosition,
  normalizeVisibleAndArchivedTicketPositions,
} from "./ordering.js";
import { getTicketRowsForBoard } from "./ticket-queries.js";
import {
  getTicket,
  listTickets,
  listTicketSummariesByIds,
} from "./ticket-read-model.js";
import {
  addActivity as insertActivity,
  replaceTicketBlockers,
  replaceTicketRelatedLinks,
  replaceTicketTags,
  validateParentTicket,
} from "./ticket-writes.js";
import { getTicketRemoteLink } from "./remote-tracking.js";
import type {
  Id,
  LaneRow,
  TicketSummaryView,
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
  const targetBoard = sqlite
    .prepare("SELECT id, name FROM boards WHERE id = ?")
    .get(input.boardId) as { id: Id; name: string } | undefined;
  if (!targetBoard) {
    throw new Error("Board not found");
  }
  const targetLane = sqlite
    .prepare("SELECT id, name, board_id FROM lanes WHERE id = ?")
    .get(input.laneId) as LaneRow | undefined;
  if (!targetLane || targetLane.board_id !== input.boardId) {
    throw new Error("Lane does not belong to board");
  }

  const sourceBoard = sqlite
    .prepare("SELECT name FROM boards WHERE id = ?")
    .get(current.boardId) as { name: string } | undefined;
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
      sqlite.prepare("UPDATE tickets SET parent_ticket_id = NULL WHERE parent_ticket_id = ?").run(ticketId);
      sqlite.prepare("DELETE FROM ticket_blockers WHERE ticket_id = ? OR blocker_ticket_id = ?").run(ticketId, ticketId);
      sqlite.prepare("DELETE FROM ticket_related_links WHERE ticket_id = ? OR related_ticket_id = ?").run(ticketId, ticketId);
      replaceTicketTags(sqlite, ticketId, getMatchingTargetTagIds(sqlite, ticketId, input.boardId));
    }

    normalizeVisibleAndArchivedTicketPositions(sqlite, current.laneId);
    normalizeVisibleAndArchivedTicketPositions(sqlite, input.laneId);
    addTicketActivity(sqlite, now, input.boardId, ticketId, "ticket_moved_board", `Moved to ${targetBoard.name} / ${targetLane.name}`, {
      fromBoardId: current.boardId,
      fromBoardName: sourceBoard?.name ?? "",
      fromLaneId: current.laneId,
      toBoardId: input.boardId,
      toBoardName: targetBoard.name,
      toLaneId: input.laneId,
      toLaneName: targetLane.name,
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

export function bulkMoveTickets(
  sqlite: Database.Database,
  input: BulkMoveTicketsInput,
  now: Now,
): TicketSummaryView[] {
  const rows = getTicketRowsForBoard(sqlite, input.sourceBoardId, input.ticketIds);
  if (rows.length !== input.ticketIds.length) {
    throw new Error("Some tickets do not belong to board");
  }
  if (rows.length === 0) {
    return [];
  }
  const targetBoard = sqlite
    .prepare("SELECT id, name FROM boards WHERE id = ?")
    .get(input.boardId) as { id: Id; name: string } | undefined;
  if (!targetBoard) {
    throw new Error("Board not found");
  }
  const targetLane = sqlite
    .prepare("SELECT id, name, board_id FROM lanes WHERE id = ?")
    .get(input.laneId) as LaneRow | undefined;
  if (!targetLane || targetLane.board_id !== input.boardId) {
    throw new Error("Lane does not belong to board");
  }

  const sourceBoard = sqlite
    .prepare("SELECT name FROM boards WHERE id = ?")
    .get(input.sourceBoardId) as { name: string } | undefined;
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const sourceLaneIds = [...new Set(rows.map((row) => row.lane_id))];
  const updatedAt = now();
  const initialTargetPosition = nextTicketPosition(sqlite, input.laneId);
  const updateStmt = sqlite.prepare(
    "UPDATE tickets SET board_id = ?, lane_id = ?, parent_ticket_id = ?, position = ?, updated_at = ? WHERE id = ?",
  );
  const tx = sqlite.transaction(() => {
    let nextPosition = initialTargetPosition;
    for (const ticketId of input.ticketIds) {
      const row = rowsById.get(ticketId)!;
      const boardChanged = row.board_id !== input.boardId;
      const position = row.lane_id === input.laneId ? row.position : nextPosition;
      updateStmt.run(input.boardId, input.laneId, boardChanged ? null : row.parent_ticket_id, position, updatedAt, ticketId);
      if (row.lane_id !== input.laneId) {
        nextPosition += 1;
      }
      if (boardChanged) {
        sqlite.prepare("UPDATE tickets SET parent_ticket_id = NULL WHERE parent_ticket_id = ?").run(ticketId);
        sqlite.prepare("DELETE FROM ticket_blockers WHERE ticket_id = ? OR blocker_ticket_id = ?").run(ticketId, ticketId);
        sqlite.prepare("DELETE FROM ticket_related_links WHERE ticket_id = ? OR related_ticket_id = ?").run(ticketId, ticketId);
        replaceTicketTags(sqlite, ticketId, getMatchingTargetTagIds(sqlite, ticketId, input.boardId));
      }
      addTicketActivity(sqlite, now, input.boardId, ticketId, "ticket_moved_board", `Moved to ${targetBoard.name} / ${targetLane.name}`, {
        fromBoardId: row.board_id,
        fromBoardName: sourceBoard?.name ?? "",
        fromLaneId: row.lane_id,
        toBoardId: input.boardId,
        toBoardName: targetBoard.name,
        toLaneId: input.laneId,
        toLaneName: targetLane.name,
        relationsCleared: boardChanged,
      });
    }
    sourceLaneIds.forEach((laneId) => normalizeVisibleAndArchivedTicketPositions(sqlite, laneId));
    normalizeVisibleAndArchivedTicketPositions(sqlite, input.laneId);
    touchBoard(sqlite, input.sourceBoardId, now());
    if (input.sourceBoardId !== input.boardId) {
      touchBoard(sqlite, input.boardId, now());
    }
  });
  tx();
  return listTicketSummariesByIds(sqlite, input.boardId, input.ticketIds);
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

export function positionTicket(
  sqlite: Database.Database,
  ticketId: Id,
  input: PositionTicketInput,
  now: Now,
): TicketView {
  const current = getTicket(sqlite, ticketId);
  if (!current) {
    throw new Error("Ticket not found");
  }
  const lane = sqlite
    .prepare("SELECT * FROM lanes WHERE id = ?")
    .get(input.laneId) as LaneRow | undefined;
  if (!lane || lane.board_id !== current.boardId) {
    throw new Error("Lane does not belong to board");
  }

  const targetRows = sqlite
    .prepare("SELECT id FROM tickets WHERE lane_id = ? AND id != ? ORDER BY is_archived ASC, position ASC, id ASC")
    .all(input.laneId, ticketId) as Array<{ id: Id }>;
  const beforeIndex = input.beforeTicketId == null
    ? -1
    : targetRows.findIndex((row) => row.id === input.beforeTicketId);
  const afterIndex = input.afterTicketId == null
    ? -1
    : targetRows.findIndex((row) => row.id === input.afterTicketId);
  if ((input.beforeTicketId != null && beforeIndex < 0) || (input.afterTicketId != null && afterIndex < 0)) {
    throw new Error("Anchor ticket does not belong to lane");
  }
  const fallbackPosition = typeof input.position === "number" ? input.position : targetRows.length;
  const targetIndex = beforeIndex >= 0
    ? beforeIndex
    : afterIndex >= 0
      ? afterIndex + 1
      : Math.max(0, Math.min(fallbackPosition, targetRows.length));
  targetRows.splice(targetIndex, 0, { id: ticketId });

  const sourceRows = current.laneId === input.laneId
    ? []
    : sqlite
      .prepare("SELECT id FROM tickets WHERE lane_id = ? AND id != ? ORDER BY is_archived ASC, position ASC, id ASC")
      .all(current.laneId, ticketId) as Array<{ id: Id }>;
  const updateStmt = sqlite.prepare("UPDATE tickets SET lane_id = ?, position = ?, updated_at = ? WHERE id = ?");
  const tx = sqlite.transaction(() => {
    const updatedAt = now();
    if (current.laneId !== input.laneId) {
      sourceRows.forEach((row, index) => updateStmt.run(current.laneId, index, updatedAt, row.id));
    }
    targetRows.forEach((row, index) => updateStmt.run(input.laneId, index, updatedAt, row.id));
    normalizeVisibleAndArchivedTicketPositions(sqlite, current.laneId);
    if (current.laneId !== input.laneId) {
      normalizeVisibleAndArchivedTicketPositions(sqlite, input.laneId);
      addTicketActivity(
        sqlite,
        now,
        current.boardId,
        ticketId,
        "ticket_transitioned",
        `Moved to ${lane.name}`,
        {
          fromLaneId: current.laneId,
          toLaneId: input.laneId,
        },
      );
    }
    touchBoard(sqlite, current.boardId, now());
  });
  tx();
  return getTicket(sqlite, ticketId)!;
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

function getMatchingTargetTagIds(sqlite: Database.Database, ticketId: Id, targetBoardId: Id): Id[] {
  const sourceTags = sqlite
    .prepare(
      `
      SELECT tag.name
      FROM ticket_tags ticket_tag
      INNER JOIN tags tag ON tag.id = ticket_tag.tag_id
      WHERE ticket_tag.ticket_id = ?
      `,
    )
    .all(ticketId) as Array<{ name: string }>;
  if (sourceTags.length === 0) {
    return [];
  }
  const sourceTagNames = new Set(sourceTags.map((tag) => tag.name));
  const targetTags = sqlite
    .prepare("SELECT id, name FROM tags WHERE board_id = ?")
    .all(targetBoardId) as Array<{ id: Id; name: string }>;
  return targetTags
    .filter((tag) => sourceTagNames.has(tag.name))
    .map((tag) => tag.id);
}
