import type Database from "better-sqlite3";

import { mapBoard, mapLane, mapTag } from "./db-mappers.js";
import {
  nextBoardPosition,
  nextLanePosition,
  normalizeBoardPositions,
  normalizeLanePositions,
} from "./db-ordering.js";
import type {
  BoardRow,
  BoardView,
  Id,
  LaneRow,
  LaneView,
  TagRow,
  TagView,
} from "./types.js";

const DEFAULT_LANES = ["todo", "doing", "done"];
const DEFAULT_TAG_COLOR = "#6b7280";

export type CreateBoardInput = {
  name: string;
  laneNames?: string[];
};

export type CreateLaneInput = {
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
    "INSERT INTO lanes (board_id, name, position) VALUES (?, ?, ?)",
  );
  const tx = sqlite.transaction(() => {
    const result = insertBoard.run(input.name, position, now, now);
    const boardId = Number(result.lastInsertRowid);
    const laneNames = input.laneNames && input.laneNames.length > 0 ? input.laneNames : DEFAULT_LANES;
    laneNames.forEach((laneName, index) => {
      insertLane.run(boardId, laneName, index);
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
  const result = sqlite.prepare("DELETE FROM boards WHERE id = ?").run(boardId);
  if (result.changes === 0) {
    throw new Error("Board not found");
  }
  normalizeBoardPositions(sqlite);
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
    .prepare("INSERT INTO lanes (board_id, name, position) VALUES (?, ?, ?)")
    .run(input.boardId, input.name, position);
  return getLane(sqlite, Number(result.lastInsertRowid))!;
}

export function getLane(sqlite: Database.Database, laneId: Id): LaneView | null {
  const row = sqlite.prepare("SELECT * FROM lanes WHERE id = ?").get(laneId) as LaneRow | undefined;
  return row ? mapLane(row) : null;
}

export function updateLane(sqlite: Database.Database, laneId: Id, name: string): LaneView {
  const result = sqlite.prepare("UPDATE lanes SET name = ? WHERE id = ?").run(name, laneId);
  if (result.changes === 0) {
    throw new Error("Lane not found");
  }
  return getLane(sqlite, laneId)!;
}

export function deleteLane(sqlite: Database.Database, laneId: Id): void {
  const lane = getLane(sqlite, laneId);
  if (!lane) {
    throw new Error("Lane not found");
  }
  const ticketCount = sqlite
    .prepare("SELECT COUNT(*) AS count FROM tickets WHERE lane_id = ?")
    .get(laneId) as { count: number };
  if (ticketCount.count > 0) {
    throw new Error("Lane is not empty");
  }
  sqlite.prepare("DELETE FROM lanes WHERE id = ?").run(laneId);
  normalizeLanePositions(sqlite, lane.boardId);
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
