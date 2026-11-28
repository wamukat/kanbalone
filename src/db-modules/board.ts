import type Database from "better-sqlite3";

import { mapBoard, mapLane, mapTag } from "./mappers.js";
import {
  nextBoardPosition,
  nextLanePosition,
  normalizeBoardPositions,
  normalizeLanePositions,
} from "./ordering.js";
import type {
  BoardRow,
  BoardView,
  Id,
  LaneRow,
  LaneView,
  TagRow,
  TagView,
} from "../types.js";

const DEFAULT_LANES = ["todo", "doing", "Acceptance", "done"];
const LOCALIZED_DEFAULT_LANES = {
  en: ["Todo", "Doing", "Acceptance", "Done"],
  ja: ["未着手", "進行中", "確認待ち", "完了"],
};
const DEFAULT_TAG_COLOR = "#6b7280";

export type CreateBoardInput = {
  name: string;
  laneNames?: string[];
  defaultLaneLanguage?: "en" | "ja";
};

export type CreateLaneInput = {
  isCompletionLane?: boolean;
  boardId: Id;
  name: string;
};

export type CreateTagInput = {
  boardId: Id;
  name: string;
  color?: string;
};

export function listBoards(sqlite: Database.Database): BoardView[] {
  const rows = sqlite
    .prepare("SELECT * FROM boards ORDER BY position ASC, id ASC")
    .all() as BoardRow[];
  return rows.map(mapBoard);
}

export function createBoard(sqlite: Database.Database, input: CreateBoardInput, now: string): Id {
  const position = nextBoardPosition(sqlite);
  const insertBoard = sqlite.prepare(
    "INSERT INTO boards (name, position, created_at, updated_at) VALUES (?, ?, ?, ?)",
  );
  const insertLane = sqlite.prepare(
    "INSERT INTO lanes (board_id, name, position, is_completion_lane) VALUES (?, ?, ?, ?)",
  );
  const tx = sqlite.transaction(() => {
    const result = insertBoard.run(input.name, position, now, now);
    const boardId = Number(result.lastInsertRowid);
    const defaults = input.defaultLaneLanguage ? LOCALIZED_DEFAULT_LANES[input.defaultLaneLanguage] : DEFAULT_LANES;
    const laneNames = input.laneNames && input.laneNames.length > 0 ? input.laneNames : defaults;
    laneNames.forEach((laneName, index) => {
      insertLane.run(boardId, laneName, index, !input.laneNames?.length && index === DEFAULT_LANES.length - 1 ? 1 : 0);
    });
    return boardId;
  });
  return tx();
}

export function getBoard(sqlite: Database.Database, boardId: Id): BoardView | null {
  const row = sqlite.prepare("SELECT * FROM boards WHERE id = ?").get(boardId) as BoardRow | undefined;
  return row ? mapBoard(row) : null;
}

export function updateBoard(sqlite: Database.Database, boardId: Id, name: string, updatedAt: string): BoardView {
  const result = sqlite
    .prepare("UPDATE boards SET name = ?, updated_at = ? WHERE id = ?")
    .run(name, updatedAt, boardId);
  if (result.changes === 0) {
    throw new Error("Board not found");
  }
  return getBoard(sqlite, boardId)!;
}

export function deleteBoard(sqlite: Database.Database, boardId: Id): void {
  sqlite.transaction(() => {
    if (!getBoard(sqlite, boardId)) throw new Error("Board not found");
    sqlite.prepare("DELETE FROM tickets WHERE board_id=?").run(boardId);
    sqlite.prepare("DELETE FROM groups WHERE board_id=?").run(boardId);
    sqlite.prepare("DELETE FROM boards WHERE id=?").run(boardId);
    normalizeBoardPositions(sqlite);
  }).immediate();
}

export function listLanes(sqlite: Database.Database, boardId: Id): LaneView[] {
  const rows = sqlite
    .prepare("SELECT * FROM lanes WHERE board_id = ? ORDER BY position ASC, id ASC")
    .all(boardId) as LaneRow[];
  return rows.map(mapLane);
}

export function createLane(sqlite: Database.Database, input: CreateLaneInput): LaneView {
  const position = nextLanePosition(sqlite, input.boardId);
  const result = sqlite
    .prepare("INSERT INTO lanes (board_id, name, position, is_completion_lane) VALUES (?, ?, ?, ?)")
    .run(input.boardId, input.name, position, Number(input.isCompletionLane ?? false));
  return getLane(sqlite, Number(result.lastInsertRowid))!;
}

export function getLane(sqlite: Database.Database, laneId: Id): LaneView | null {
  const row = sqlite.prepare("SELECT * FROM lanes WHERE id = ?").get(laneId) as LaneRow | undefined;
  return row ? mapLane(row) : null;
}

export function updateLane(sqlite: Database.Database, laneId: Id, input: string | { name?: string; isCompletionLane?: boolean }): LaneView {
  return sqlite.transaction(() => {
    const current = getLane(sqlite, laneId);
    if (!current) throw new Error("Lane not found");
    const fields = typeof input === "string" ? { name: input } : input;
    sqlite.prepare("UPDATE lanes SET name = ?, is_completion_lane = ? WHERE id = ?")
      .run(fields.name ?? current.name, Number(fields.isCompletionLane ?? current.isCompletionLane), laneId);
    sqlite.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), current.boardId);
    return getLane(sqlite, laneId)!;
  }).immediate();
}

export type LaneTicketCounts = {
  ticketCount: number;
  archivedTicketCount: number;
};

export class LaneNotEmptyError extends Error {
  constructor(readonly counts: LaneTicketCounts) {
    super("Lane is not empty");
  }
}

export function getLaneTicketCounts(sqlite: Database.Database, laneId: Id): LaneTicketCounts | null {
  const counts = sqlite.prepare(`
    SELECT COUNT(tickets.id) AS ticketCount,
           SUM(CASE WHEN tickets.is_archived = 1 THEN 1 ELSE 0 END) AS archivedTicketCount
    FROM lanes
    LEFT JOIN tickets ON tickets.lane_id = lanes.id
    WHERE lanes.id = ?
    GROUP BY lanes.id
  `).get(laneId) as LaneTicketCounts | undefined;
  return counts ?? null;
}

export function deleteLane(sqlite: Database.Database, laneId: Id): Id {
  return sqlite.transaction(() => {
    const lane = getLane(sqlite, laneId);
    const counts = getLaneTicketCounts(sqlite, laneId);
    if (!lane || !counts) throw new Error("Lane not found");
    if (counts.ticketCount > 0) throw new LaneNotEmptyError(counts);

    sqlite.prepare("DELETE FROM lanes WHERE id = ?").run(laneId);
    normalizeLanePositions(sqlite, lane.boardId);
    return lane.boardId;
  }).immediate();
}

export function reorderLanes(sqlite: Database.Database, boardId: Id, laneIds: Id[]): LaneView[] {
  const lanes = listLanes(sqlite, boardId);
  if (lanes.length !== laneIds.length || lanes.some((lane) => !laneIds.includes(lane.id))) {
    throw new Error("Lane order does not match board lanes");
  }
  const stmt = sqlite.prepare("UPDATE lanes SET position = ? WHERE id = ?");
  const tx = sqlite.transaction(() => {
    laneIds.forEach((laneId, index) => stmt.run(index, laneId));
  });
  tx();
  return listLanes(sqlite, boardId);
}

export function reorderBoards(sqlite: Database.Database, boardIds: Id[]): BoardView[] {
  const boards = listBoards(sqlite);
  if (boards.length !== boardIds.length || boards.some((board) => !boardIds.includes(board.id))) {
    throw new Error("Board order does not match boards");
  }
  const stmt = sqlite.prepare("UPDATE boards SET position = ? WHERE id = ?");
  const tx = sqlite.transaction(() => {
    boardIds.forEach((boardId, index) => stmt.run(index, boardId));
  });
  tx();
  return listBoards(sqlite);
}

export function listTags(sqlite: Database.Database, boardId: Id): TagView[] {
  const rows = sqlite
    .prepare("SELECT * FROM tags WHERE board_id = ? ORDER BY name ASC, id ASC")
    .all(boardId) as TagRow[];
  return rows.map(mapTag);
}

export function createTag(sqlite: Database.Database, input: CreateTagInput): TagView {
  const result = sqlite
    .prepare("INSERT INTO tags (board_id, name, color) VALUES (?, ?, ?)")
    .run(input.boardId, input.name, input.color ?? DEFAULT_TAG_COLOR);
  return getTag(sqlite, Number(result.lastInsertRowid))!;
}

export function getTag(sqlite: Database.Database, tagId: Id): TagView | null {
  const row = sqlite.prepare("SELECT * FROM tags WHERE id = ?").get(tagId) as TagRow | undefined;
  return row ? mapTag(row) : null;
}

export function updateTag(sqlite: Database.Database, tagId: Id, input: { name?: string; color?: string }): TagView {
  const current = getTag(sqlite, tagId);
  if (!current) {
    throw new Error("Tag not found");
  }
  sqlite
    .prepare("UPDATE tags SET name = ?, color = ? WHERE id = ?")
    .run(input.name ?? current.name, input.color ?? current.color, tagId);
  return getTag(sqlite, tagId)!;
}

export function deleteTag(sqlite: Database.Database, tagId: Id): void {
  const result = sqlite.prepare("DELETE FROM tags WHERE id = ?").run(tagId);
  if (result.changes === 0) {
    throw new Error("Tag not found");
  }
}
