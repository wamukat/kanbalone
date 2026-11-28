import { clearGroupForBoardMove } from "./groups.js";
import type Database from "better-sqlite3";
import { laneCompletion } from "./lane-completion.js";

import {
  nextTicketPosition,
  normalizeVisibleAndArchivedTicketPositions,
} from "./ordering.js";
import { getTicketRowsForBoard } from "./ticket-queries.js";
import { listTicketSummariesByIds } from "./ticket-read-model.js";
import { historyDetails, readTicketHistory, recordTicketPeerHistory, ticketChanges, ticketHistoryPeerIds } from "./ticket-history.js";
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
  BulkTransitionTicketsInput,
} from "./ticket-mutations.js";
import type { Id, LaneRow, TicketSummaryView } from "../types.js";

export function bulkMoveTickets(
  sqlite: Database.Database,
  input: BulkMoveTicketsInput,
  now: Now,
): TicketSummaryView[] {
  return sqlite.transaction(() => bulkMoveTicketsInTransaction(sqlite, input, now)).immediate();
}

function bulkMoveTicketsInTransaction(sqlite: Database.Database, input: BulkMoveTicketsInput, now: Now): TicketSummaryView[] {
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
  const movingBoards = input.sourceBoardId !== input.boardId;
  const options = { tags: movingBoards, relations: movingBoards };
  const subjects = readTicketHistory(sqlite, input.ticketIds, options);
  const peers = ticketHistoryPeerIds(subjects.values()).filter(id => !subjects.has(id));
  const peerBefore = readTicketHistory(sqlite, peers, options);
  const initialTargetPosition = nextTicketPosition(sqlite, input.laneId);
  const updateStmt = sqlite.prepare(
    "UPDATE tickets SET group_id = CASE WHEN board_id <> ? THEN NULL ELSE group_id END, board_id = ?, lane_id = ?, parent_ticket_id = ?, position = ?, updated_at = ? WHERE id = ?",
  );
  let nextPosition = initialTargetPosition;
  for (const ticketId of input.ticketIds) {
    const row = rowsById.get(ticketId)!;
    const boardChanged = row.board_id !== input.boardId;
    const position = row.lane_id === input.laneId ? row.position : nextPosition;
    if (boardChanged) clearGroupForBoardMove(sqlite, ticketId, row.board_id, updatedAt);
    updateStmt.run(input.boardId, input.boardId, input.laneId, boardChanged ? null : row.parent_ticket_id, position, updatedAt, ticketId);
    if (row.lane_id !== input.laneId) {
      nextPosition += 1;
    }
    if (boardChanged) {
      cleanupTicketForBoardMove(sqlite, ticketId, input.boardId);
    }
  }
  const after = readTicketHistory(sqlite, [...input.ticketIds, ...peers], options);
  for (const ticketId of input.ticketIds) {
    const row = rowsById.get(ticketId)!;
    addBoardMoveActivity(sqlite, now, {
      ticketId,
      fromBoardId: row.board_id,
      fromBoardName: sourceBoardName,
      fromLaneId: row.lane_id,
      targetBoard,
      targetLane,
      relationsCleared: movingBoards,
    }, ticketChanges(subjects.get(ticketId), after.get(ticketId)));
  }
  recordTicketPeerHistory(sqlite, peerBefore, after, new Set(input.ticketIds), updatedAt);
  sourceLaneIds.forEach((laneId) => normalizeVisibleAndArchivedTicketPositions(sqlite, laneId));
  normalizeVisibleAndArchivedTicketPositions(sqlite, input.laneId);
  touchBoard(sqlite, input.sourceBoardId, now());
  if (input.sourceBoardId !== input.boardId) {
    touchBoard(sqlite, input.boardId, now());
  }
  return listTicketSummariesByIds(sqlite, input.boardId, input.ticketIds);
}

export function bulkTransitionTickets(
  sqlite: Database.Database,
  input: BulkTransitionTicketsInput,
  now: Now,
): TicketSummaryView[] {
  return sqlite.transaction(() => bulkTransitionTicketsInTransaction(sqlite, input, now)).immediate();
}

function bulkTransitionTicketsInTransaction(sqlite: Database.Database, input: BulkTransitionTicketsInput, now: Now): TicketSummaryView[] {
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
  const before = readTicketHistory(sqlite, input.ticketIds);
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const movingRows = rows.filter((row) => row.lane_id !== lane.id);
  const nextPosition = nextTicketPosition(sqlite, lane.id);
  const updateStmt = sqlite.prepare(
    "UPDATE tickets SET lane_id = ?, position = ?, is_resolved = ?, updated_at = ? WHERE id = ?",
  );
  const updateSameLaneStmt = sqlite.prepare(
    "UPDATE tickets SET is_resolved = ?, updated_at = ? WHERE id = ?",
  );
  let targetPosition = nextPosition;
  for (const ticketId of input.ticketIds) {
    const row = rowsById.get(ticketId)!;
    const nextResolved = Number(laneCompletion(sqlite, lane.id, undefined, input.boardId));
    if (row.lane_id === lane.id) {
      updateSameLaneStmt.run(nextResolved, updatedAt, row.id);
      continue;
    }
    updateStmt.run(lane.id, targetPosition, nextResolved, updatedAt, row.id);
    targetPosition += 1;
  }
  const sourceLaneIds = [...new Set(movingRows.map((row) => row.lane_id))];
  sourceLaneIds.forEach((laneId) => normalizeVisibleAndArchivedTicketPositions(sqlite, laneId));
  normalizeVisibleAndArchivedTicketPositions(sqlite, lane.id);
  const after = readTicketHistory(sqlite, input.ticketIds);
  for (const id of input.ticketIds) {
    addTicketActivity(sqlite, now, input.boardId, id, "ticket_transitioned", `Moved to ${input.laneName}`,
      historyDetails(ticketChanges(before.get(id), after.get(id))));
  }
  touchBoard(sqlite, input.boardId, now());
  return listTicketSummariesByIds(sqlite, input.boardId, input.ticketIds);
}

export function bulkArchiveTickets(
  sqlite: Database.Database,
  input: BulkArchiveTicketsInput,
  now: Now,
): TicketSummaryView[] {
  return sqlite.transaction(() => bulkArchiveTicketsInTransaction(sqlite, input, now)).immediate();
}

function bulkArchiveTicketsInTransaction(sqlite: Database.Database, input: BulkArchiveTicketsInput, now: Now): TicketSummaryView[] {
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
      historyDetails(Boolean(row.is_archived) === input.isArchived ? {} : {
        isArchived: { before: Boolean(row.is_archived), after: input.isArchived },
      }),
    );
  }
  affectedLaneIds.forEach((laneId) => normalizeVisibleAndArchivedTicketPositions(sqlite, laneId));
  touchBoard(sqlite, input.boardId, now());
  return listTicketSummariesByIds(sqlite, input.boardId, input.ticketIds);
}
