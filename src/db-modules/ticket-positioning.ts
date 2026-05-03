import type Database from "better-sqlite3";

import { listLanes } from "./board.js";
import {
  normalizeVisibleAndArchivedTicketPositions,
} from "./ordering.js";
import { getTicketRowsForBoard } from "./ticket-queries.js";
import {
  getTicket,
  listTickets,
} from "./ticket-read-model.js";
import {
  addTicketActivity,
  touchBoard,
  type Now,
} from "./ticket-mutation-shared.js";
import type { PositionTicketInput, ReorderTicketInput } from "./ticket-mutations.js";
import type { Id, LaneRow, TicketView } from "../types.js";

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
