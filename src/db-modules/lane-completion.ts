import type Database from "better-sqlite3";
import { nextLanePosition, normalizeVisibleAndArchivedTicketPositions } from "./ordering.js";
import { addActivity } from "./ticket-writes.js";

/** Validate compatibility input; callers must never use it as the source of completion. */
export function laneCompletion(sqlite: Database.Database, laneId: number, requested?: boolean, boardId?: number): boolean {
  const lane = sqlite.prepare("SELECT board_id, is_completion_lane FROM lanes WHERE id = ?")
    .get(laneId) as { board_id: number; is_completion_lane: number } | undefined;
  if (!lane || (boardId !== undefined && lane.board_id !== boardId)) throw new Error("Lane does not belong to board");
  const resolved = Boolean(lane.is_completion_lane);
  if (requested !== undefined && requested !== resolved) {
    throw Object.assign(new Error("Completion is determined by the lane; choose a destination lane instead"), { statusCode: 409 });
  }
  return resolved;
}

/** Create a separate lane; never reuse or reinterpret an existing user lane. */
export function createMigratedCompletionLane(sqlite: Database.Database, boardId: number): number {
  const names = new Set((sqlite.prepare("SELECT name FROM lanes WHERE board_id = ?").all(boardId) as { name: string }[]).map((row) => row.name));
  const base = "Completed (migration)";
  let name = base;
  for (let suffix = 2; names.has(name); suffix++) name = `${base} ${suffix}`;
  return Number(sqlite.prepare("INSERT INTO lanes (board_id, name, position, is_completion_lane) VALUES (?, ?, ?, 1)")
    .run(boardId, name, nextLanePosition(sqlite, boardId)).lastInsertRowid);
}

/** Runs once inside the database migration transaction. Preserve every legacy completion flag. */
export function migrateLaneCompletion(sqlite: Database.Database): void {
  const columns = sqlite.prepare("PRAGMA table_info(lanes)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "is_completion_lane")) {
    sqlite.exec("ALTER TABLE lanes ADD COLUMN is_completion_lane INTEGER NOT NULL DEFAULT 0 CHECK (is_completion_lane IN (0, 1))");
    const boards = sqlite.prepare("SELECT DISTINCT board_id FROM tickets WHERE is_resolved = 1 ORDER BY board_id").all() as { board_id: number }[];
    const now = new Date().toISOString();
    for (const board of boards) {
      const laneId = createMigratedCompletionLane(sqlite, board.board_id);
      const tickets = sqlite.prepare(`SELECT t.id, t.lane_id, t.position FROM tickets t JOIN lanes l ON l.id = t.lane_id
        WHERE t.board_id = ? AND t.is_resolved = 1 ORDER BY t.is_archived, l.position, l.id, t.position, t.id`)
        .all(board.board_id) as { id: number; lane_id: number; position: number }[];
      tickets.forEach((ticket, position) => {
        sqlite.prepare("UPDATE tickets SET lane_id = ?, position = ?, updated_at = ? WHERE id = ?").run(laneId, position, now, ticket.id);
        addActivity(sqlite, { boardId: board.board_id, ticketId: ticket.id, action: "ticket_transitioned",
          message: "Moved to auto-created completion lane during migration",
          details: { migration: "lane_completion", fromLaneId: ticket.lane_id, fromPosition: ticket.position, toLaneId: laneId }, createdAt: now });
      });
      for (const oldLaneId of new Set(tickets.map((ticket) => ticket.lane_id))) normalizeVisibleAndArchivedTicketPositions(sqlite, oldLaneId);
      sqlite.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(now, board.board_id);
    }
  }
  // Keep the existing indexed column as a database-maintained projection, not writable state.
  // This covers every move path, including ordering, bulk operations and board transfers.
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS ticket_completion_insert AFTER INSERT ON tickets
    WHEN NEW.is_resolved <> (SELECT is_completion_lane FROM lanes WHERE id = NEW.lane_id)
    BEGIN
      UPDATE tickets SET is_resolved = (SELECT is_completion_lane FROM lanes WHERE id = NEW.lane_id) WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS ticket_completion_update AFTER UPDATE OF lane_id, is_resolved ON tickets
    WHEN NEW.is_resolved <> (SELECT is_completion_lane FROM lanes WHERE id = NEW.lane_id)
    BEGIN
      UPDATE tickets SET is_resolved = (SELECT is_completion_lane FROM lanes WHERE id = NEW.lane_id) WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS lane_completion_update AFTER UPDATE OF is_completion_lane ON lanes
    WHEN OLD.is_completion_lane <> NEW.is_completion_lane
    BEGIN
      UPDATE tickets SET is_resolved = NEW.is_completion_lane,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE lane_id = NEW.id;
    END;
  `);
}

export type CompletionLaneExpectation = { id: number; isCompletionLane: boolean; ticketCount: number };

/** Replace the selection atomically, only against the state the caller reviewed. */
export function setCompletionLanes(sqlite: Database.Database, boardId: number, laneIds: number[], expected: CompletionLaneExpectation[]): void {
  sqlite.transaction(() => {
    const rows = sqlite.prepare(`SELECT l.id, l.is_completion_lane, COUNT(t.id) AS ticket_count
      FROM lanes l LEFT JOIN tickets t ON t.lane_id = l.id WHERE l.board_id = ? GROUP BY l.id`).all(boardId) as { id: number; is_completion_lane: number; ticket_count: number }[];
    if (expected.length !== rows.length || new Set(expected.map((item) => item.id)).size !== rows.length || rows.some((row) => {
      const item = expected.find((entry) => entry.id === row.id);
      return !item || item.isCompletionLane !== Boolean(row.is_completion_lane) || item.ticketCount !== row.ticket_count;
    })) throw Object.assign(new Error("Lanes or ticket counts changed. Review the selection again."), { statusCode: 409 });
    if (new Set(laneIds).size !== laneIds.length || laneIds.some((id) => !rows.some((row) => row.id === id))) {
      throw Object.assign(new Error("Invalid completion lane selection"), { statusCode: 400 });
    }
    const update = sqlite.prepare("UPDATE lanes SET is_completion_lane = ? WHERE id = ?");
    for (const row of rows) {
      const next = Number(laneIds.includes(row.id));
      if (next !== row.is_completion_lane) update.run(next, row.id);
    }
    sqlite.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), boardId);
  }).immediate();
}
