import type Database from "better-sqlite3";

import {
  nextTicketPosition,
  normalizeVisibleAndArchivedTicketPositions,
} from "./ordering.js";
import { getTicketRowsForBoard } from "./ticket-queries.js";
import { listTicketSummariesByIds } from "./ticket-read-model.js";
import {
  addBoardMoveActivity,
  addTicketActivity,
  cleanupTicketForBoardMove,
  getBoardName,
  getMoveDestination,
  touchBoard,
  type Now,
} from "./ticket-mutation-shared.js";
import type {
  BulkArchiveTicketsInput,
  BulkMoveTicketsInput,
  BulkResolveTicketsInput,
  BulkTransitionTicketsInput,
} from "./ticket-mutations.js";
import type { Id, LaneRow, TicketSummaryView } from "../types.js";

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
  const { targetBoard, targetLane } = getMoveDestination(sqlite, input);
  const sourceBoardName = getBoardName(sqlite, input.sourceBoardId);
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
        cleanupTicketForBoardMove(sqlite, ticketId, input.boardId);
      }
      addBoardMoveActivity(sqlite, now, {
        ticketId,
        fromBoardId: row.board_id,
        fromBoardName: sourceBoardName,
        fromLaneId: row.lane_id,
        targetBoard,
        targetLane,
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
