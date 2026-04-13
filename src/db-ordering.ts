import type Database from "better-sqlite3";

import type { Id } from "./types.js";

export function nextLanePosition(sqlite: Database.Database, boardId: Id): number {
  const row = sqlite
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS nextPosition FROM lanes WHERE board_id = ?")
    .get(boardId) as { nextPosition: number };
  return row.nextPosition;
}

export function nextBoardPosition(sqlite: Database.Database): number {
  const row = sqlite
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS nextPosition FROM boards")
    .get() as { nextPosition: number };
  return row.nextPosition;
}

export function nextTicketPosition(sqlite: Database.Database, laneId: Id): number {
  const row = sqlite
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS nextPosition FROM tickets WHERE lane_id = ?")
    .get(laneId) as { nextPosition: number };
  return row.nextPosition;
}

export function normalizeLanePositions(sqlite: Database.Database, boardId: Id): void {
  const rows = sqlite
    .prepare("SELECT id FROM lanes WHERE board_id = ? ORDER BY position ASC, id ASC")
    .all(boardId) as Array<{ id: Id }>;
  const stmt = sqlite.prepare("UPDATE lanes SET position = ? WHERE id = ?");
  rows.forEach((row, index) => stmt.run(index, row.id));
}

export function normalizeBoardPositions(sqlite: Database.Database): void {
  const rows = sqlite
    .prepare("SELECT id FROM boards ORDER BY updated_at DESC, id DESC")
    .all() as Array<{ id: Id }>;
  const stmt = sqlite.prepare("UPDATE boards SET position = ? WHERE id = ?");
  rows.forEach((row, index) => stmt.run(index, row.id));
}

export function normalizeVisibleAndArchivedTicketPositions(sqlite: Database.Database, laneId: Id): void {
  const rows = sqlite
    .prepare("SELECT id FROM tickets WHERE lane_id = ? ORDER BY is_archived ASC, position ASC, id ASC")
    .all(laneId) as Array<{ id: Id }>;
  const stmt = sqlite.prepare("UPDATE tickets SET position = ? WHERE id = ?");
  rows.forEach((row, index) => stmt.run(index, row.id));
}
