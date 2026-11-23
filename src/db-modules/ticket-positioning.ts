import type Database from "better-sqlite3";

import {
  normalizeVisibleAndArchivedTicketPositions,
} from "./ordering.js";
import {
  getTicket,
  listTicketSummaries,
} from "./ticket-read-model.js";
import {
  addTicketActivity,
  touchBoard,
  type Now,
} from "./ticket-mutation-shared.js";
import type { PositionTicketInput } from "./ticket-mutations.js";
import type { Id, LaneRow, TicketView } from "../types.js";

function positionConflict(): never {
  throw Object.assign(new Error("Ticket position changed; refresh the board"), { statusCode: 409 });
}

export function positionTicket(
  sqlite: Database.Database,
  ticketId: Id,
  input: PositionTicketInput,
  now: Now,
): TicketView {
  return sqlite.transaction(() => {
    const bothAnchors = input.beforeTicketId != null && input.afterTicketId != null;
    const guarded = input.expectedSourceLaneId !== undefined;
    if ((input.expectedSourcePosition !== undefined) !== guarded
        || (input.expectedAnchorOrder !== undefined) !== (guarded && bothAnchors)
        || (guarded && bothAnchors && input.beforeTicketId === input.afterTicketId)) {
      throw new Error("Invalid position precondition");
    }
    const current = getTicket(sqlite, ticketId);
    if (!current) {
      if (guarded) positionConflict();
      throw new Error("Ticket not found");
    }
    if (guarded && (current.laneId !== input.expectedSourceLaneId || current.position !== input.expectedSourcePosition)) positionConflict();
    const lane = sqlite
      .prepare("SELECT * FROM lanes WHERE id = ?")
      .get(input.laneId) as LaneRow | undefined;
    if (!lane && guarded) positionConflict();
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
      if (guarded) positionConflict();
      throw new Error("Anchor ticket does not belong to lane");
    }
    if (input.expectedAnchorOrder
        && input.expectedAnchorOrder !== (afterIndex < beforeIndex ? "after-before" : "before-after")) {
      positionConflict();
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
    return getTicket(sqlite, ticketId)!;
  }).immediate();
}

export function reorderLaneTickets(sqlite: Database.Database, laneId: Id, ticketIds: Id[], now: Now) {
  return sqlite.transaction(() => {
    const lane = sqlite.prepare("SELECT * FROM lanes WHERE id = ?").get(laneId) as LaneRow | undefined;
    if (!lane) throw new Error("Lane not found");
    const rows = sqlite.prepare("SELECT id, is_archived FROM tickets WHERE lane_id = ? ORDER BY is_archived ASC, position ASC, id ASC")
      .all(laneId) as Array<{ id: Id; is_archived: number }>;
    const eligible = new Set(rows.filter((row) => !row.is_archived).map((row) => row.id));
    const selected = new Set(ticketIds);
    if (selected.size !== ticketIds.length || ticketIds.some((id) => !eligible.has(id))) {
      throw new Error("ticketIds must be unique non-archived tickets in the target lane");
    }
    if (ticketIds.length > 0) {
      const ordered = [...ticketIds, ...rows.filter((row) => !selected.has(row.id)).map((row) => row.id)];
      const update = sqlite.prepare("UPDATE tickets SET position = ?, updated_at = ? WHERE id = ?");
      const updatedAt = now();
      ordered.forEach((id, position) => update.run(position, updatedAt, id));
      touchBoard(sqlite, lane.board_id, updatedAt);
    }
    return { boardId: lane.board_id, tickets: listTicketSummaries(sqlite, lane.board_id, { laneId }) };
  }).immediate();
}
