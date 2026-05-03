import type Database from "better-sqlite3";

import { replaceTicketTags } from "./ticket-writes.js";
import { addActivity as insertActivity } from "./ticket-writes.js";
import type { MoveTicketInput } from "./ticket-mutations.js";
import type { Id, LaneRow, TicketRow } from "../types.js";

export type Now = () => string;
export type BoardName = { id: Id; name: string };
export type MoveDestination = {
  targetBoard: BoardName;
  targetLane: LaneRow;
};

export function addTicketActivity(
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

export function touchBoard(sqlite: Database.Database, boardId: Id, updatedAt: string): void {
  sqlite.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(updatedAt, boardId);
}

export function getMoveDestination(
  sqlite: Database.Database,
  input: MoveTicketInput,
): MoveDestination {
  const targetBoard = sqlite
    .prepare("SELECT id, name FROM boards WHERE id = ?")
    .get(input.boardId) as BoardName | undefined;
  if (!targetBoard) {
    throw new Error("Board not found");
  }
  const targetLane = sqlite
    .prepare("SELECT id, name, board_id FROM lanes WHERE id = ?")
    .get(input.laneId) as LaneRow | undefined;
  if (!targetLane || targetLane.board_id !== input.boardId) {
    throw new Error("Lane does not belong to board");
  }
  return { targetBoard, targetLane };
}

export function getBoardName(sqlite: Database.Database, boardId: Id): string {
  const board = sqlite
    .prepare("SELECT name FROM boards WHERE id = ?")
    .get(boardId) as { name: string } | undefined;
  return board?.name ?? "";
}

export function cleanupTicketForBoardMove(
  sqlite: Database.Database,
  ticketId: Id,
  targetBoardId: Id,
): void {
  sqlite.prepare("UPDATE tickets SET parent_ticket_id = NULL WHERE parent_ticket_id = ?").run(ticketId);
  sqlite.prepare("DELETE FROM ticket_blockers WHERE ticket_id = ? OR blocker_ticket_id = ?").run(ticketId, ticketId);
  sqlite.prepare("DELETE FROM ticket_related_links WHERE ticket_id = ? OR related_ticket_id = ?").run(ticketId, ticketId);
  replaceTicketTags(sqlite, ticketId, getMatchingTargetTagIds(sqlite, ticketId, targetBoardId));
}

export function addBoardMoveActivity(
  sqlite: Database.Database,
  now: Now,
  input: {
    ticketId: Id;
    fromBoardId: Id;
    fromBoardName: string;
    fromLaneId: TicketRow["lane_id"];
    targetBoard: BoardName;
    targetLane: LaneRow;
    relationsCleared: boolean;
  },
): void {
  addTicketActivity(
    sqlite,
    now,
    input.targetBoard.id,
    input.ticketId,
    "ticket_moved_board",
    `Moved to ${input.targetBoard.name} / ${input.targetLane.name}`,
    {
      fromBoardId: input.fromBoardId,
      fromBoardName: input.fromBoardName,
      fromLaneId: input.fromLaneId,
      toBoardId: input.targetBoard.id,
      toBoardName: input.targetBoard.name,
      toLaneId: input.targetLane.id,
      toLaneName: input.targetLane.name,
      relationsCleared: input.relationsCleared,
    },
  );
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
