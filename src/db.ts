import Database from "better-sqlite3";

import {
  type BoardDetailView,
  type BoardShellView,
  type BoardExport,
  type BoardRow,
  type BoardView,
  type CommentRow,
  type CommentView,
  type Id,
  type TagRow,
  type TagView,
  type LaneRow,
  type LaneView,
  type TicketBlockerView,
  type TicketRelationsView,
  type TicketRelationView,
  type TicketRow,
  type TicketSummaryView,
  type TicketView,
} from "./types.js";
import { renderMarkdown } from "./markdown.js";

type ListTicketsFilters = {
  laneId?: number;
  tag?: string;
  completed?: boolean;
  q?: string;
};

type CreateBoardInput = {
  name: string;
  laneNames?: string[];
};

type CreateLaneInput = {
  boardId: Id;
  name: string;
};

type CreateTagInput = {
  boardId: Id;
  name: string;
  color?: string;
};

type CreateTicketInput = {
  boardId: Id;
  laneId: Id;
  title: string;
  bodyMarkdown?: string;
  isCompleted?: boolean;
  priority?: number;
  parentTicketId?: Id | null;
  tagIds?: Id[];
  blockerIds?: Id[];
};

type UpdateTicketInput = Partial<CreateTicketInput> & {
  title?: string;
};

type CreateCommentInput = {
  ticketId: Id;
  bodyMarkdown: string;
};

type ReorderTicketInput = {
  ticketId: Id;
  laneId: Id;
  position: number;
};

type TicketRelationRow = {
  ticket_id: Id;
  id: Id;
  title: string;
  lane_id: Id;
  is_completed: number;
  priority: number;
  board_name: string;
};

const DEFAULT_LANES = ["todo", "doing", "done"];
const DEFAULT_TAG_COLOR = "#6b7280";

export class KanbanDb {
  readonly sqlite: Database.Database;

  constructor(filename: string) {
    this.sqlite = new Database(filename);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.migrate();
  }

  close(): void {
    this.sqlite.close();
  }

  migrate(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS boards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lanes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS tags_board_name_idx
      ON tags(board_id, name);

      CREATE INDEX IF NOT EXISTS lanes_board_position_idx
      ON lanes(board_id, position, id);

      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        lane_id INTEGER NOT NULL REFERENCES lanes(id) ON DELETE CASCADE,
        parent_ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        body_markdown TEXT NOT NULL DEFAULT '',
        is_completed INTEGER NOT NULL DEFAULT 0,
        priority INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        body_markdown TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ticket_tags (
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (ticket_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS ticket_blockers (
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        blocker_ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        PRIMARY KEY (ticket_id, blocker_ticket_id)
      );

      CREATE INDEX IF NOT EXISTS tickets_board_lane_position_idx
      ON tickets(board_id, lane_id, position, id);

      CREATE INDEX IF NOT EXISTS tickets_board_completed_lane_position_idx
      ON tickets(board_id, is_completed, lane_id, position, id);

      CREATE INDEX IF NOT EXISTS tickets_parent_ticket_idx
      ON tickets(parent_ticket_id);

      CREATE INDEX IF NOT EXISTS comments_ticket_created_idx
      ON comments(ticket_id, created_at, id);

      CREATE INDEX IF NOT EXISTS ticket_tags_tag_ticket_idx
      ON ticket_tags(tag_id, ticket_id);

      CREATE INDEX IF NOT EXISTS ticket_blockers_blocker_ticket_idx
      ON ticket_blockers(blocker_ticket_id, ticket_id);
    `);

    const ticketColumns = this.sqlite.prepare("PRAGMA table_info(tickets)").all() as Array<{ name: string }>;
    if (!ticketColumns.some((column) => column.name === "priority")) {
      this.sqlite.exec("ALTER TABLE tickets ADD COLUMN priority INTEGER NOT NULL DEFAULT 0");
    }
    if (!ticketColumns.some((column) => column.name === "parent_ticket_id")) {
      this.sqlite.exec("ALTER TABLE tickets ADD COLUMN parent_ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL");
    }
  }

  now(): string {
    return new Date().toISOString();
  }

  listBoards(): BoardView[] {
    const rows = this.sqlite
      .prepare("SELECT * FROM boards ORDER BY updated_at DESC, id DESC")
      .all() as BoardRow[];
    return rows.map(mapBoard);
  }

  createBoard(input: CreateBoardInput): BoardDetailView {
    const now = this.now();
    const insertBoard = this.sqlite.prepare(
      "INSERT INTO boards (name, created_at, updated_at) VALUES (?, ?, ?)",
    );
    const insertLane = this.sqlite.prepare(
      "INSERT INTO lanes (board_id, name, position) VALUES (?, ?, ?)",
    );
    const tx = this.sqlite.transaction(() => {
      const result = insertBoard.run(input.name, now, now);
      const boardId = Number(result.lastInsertRowid);
      const laneNames = input.laneNames && input.laneNames.length > 0 ? input.laneNames : DEFAULT_LANES;
      laneNames.forEach((laneName, index) => {
        insertLane.run(boardId, laneName, index);
      });
      return boardId;
    });
    return this.getBoardDetail(tx());
  }

  getBoard(boardId: Id): BoardView | null {
    const row = this.sqlite.prepare("SELECT * FROM boards WHERE id = ?").get(boardId) as BoardRow | undefined;
    return row ? mapBoard(row) : null;
  }

  getBoardShell(boardId: Id): BoardShellView {
    const board = this.getBoard(boardId);
    if (!board) {
      throw new Error("Board not found");
    }

    return {
      board,
      lanes: this.listLanes(boardId),
      tags: this.listTags(boardId),
    };
  }

  getBoardDetail(boardId: Id): BoardDetailView {
    const shell = this.getBoardShell(boardId);
    return {
      ...shell,
      tickets: this.listTickets(boardId),
    };
  }

  updateBoard(boardId: Id, name: string): BoardView {
    const now = this.now();
    const result = this.sqlite
      .prepare("UPDATE boards SET name = ?, updated_at = ? WHERE id = ?")
      .run(name, now, boardId);
    if (result.changes === 0) {
      throw new Error("Board not found");
    }
    return this.getBoard(boardId)!;
  }

  deleteBoard(boardId: Id): void {
    const result = this.sqlite.prepare("DELETE FROM boards WHERE id = ?").run(boardId);
    if (result.changes === 0) {
      throw new Error("Board not found");
    }
  }

  listLanes(boardId: Id): LaneView[] {
    const rows = this.sqlite
      .prepare("SELECT * FROM lanes WHERE board_id = ? ORDER BY position ASC, id ASC")
      .all(boardId) as LaneRow[];
    return rows.map(mapLane);
  }

  createLane(input: CreateLaneInput): LaneView {
    const position = this.nextLanePosition(input.boardId);
    const result = this.sqlite
      .prepare("INSERT INTO lanes (board_id, name, position) VALUES (?, ?, ?)")
      .run(input.boardId, input.name, position);
    return this.getLane(Number(result.lastInsertRowid))!;
  }

  getLane(laneId: Id): LaneView | null {
    const row = this.sqlite.prepare("SELECT * FROM lanes WHERE id = ?").get(laneId) as LaneRow | undefined;
    return row ? mapLane(row) : null;
  }

  updateLane(laneId: Id, name: string): LaneView {
    const result = this.sqlite.prepare("UPDATE lanes SET name = ? WHERE id = ?").run(name, laneId);
    if (result.changes === 0) {
      throw new Error("Lane not found");
    }
    return this.getLane(laneId)!;
  }

  deleteLane(laneId: Id): void {
    const lane = this.getLane(laneId);
    if (!lane) {
      throw new Error("Lane not found");
    }
    const ticketCount = this.sqlite
      .prepare("SELECT COUNT(*) AS count FROM tickets WHERE lane_id = ?")
      .get(laneId) as { count: number };
    if (ticketCount.count > 0) {
      throw new Error("Lane is not empty");
    }
    this.sqlite.prepare("DELETE FROM lanes WHERE id = ?").run(laneId);
    this.normalizeLanePositions(lane.boardId);
  }

  reorderLanes(boardId: Id, laneIds: Id[]): LaneView[] {
    const lanes = this.listLanes(boardId);
    if (lanes.length !== laneIds.length || lanes.some((lane) => !laneIds.includes(lane.id))) {
      throw new Error("Lane order does not match board lanes");
    }
    const stmt = this.sqlite.prepare("UPDATE lanes SET position = ? WHERE id = ?");
    const tx = this.sqlite.transaction(() => {
      laneIds.forEach((laneId, index) => stmt.run(index, laneId));
    });
    tx();
    return this.listLanes(boardId);
  }

  listTags(boardId: Id): TagView[] {
    const rows = this.sqlite
      .prepare("SELECT * FROM tags WHERE board_id = ? ORDER BY name ASC, id ASC")
      .all(boardId) as TagRow[];
    return rows.map(mapTag);
  }

  createTag(input: CreateTagInput): TagView {
    const result = this.sqlite
      .prepare("INSERT INTO tags (board_id, name, color) VALUES (?, ?, ?)")
      .run(input.boardId, input.name, input.color ?? DEFAULT_TAG_COLOR);
    return this.getTag(Number(result.lastInsertRowid))!;
  }

  getTag(tagId: Id): TagView | null {
    const row = this.sqlite.prepare("SELECT * FROM tags WHERE id = ?").get(tagId) as TagRow | undefined;
    return row ? mapTag(row) : null;
  }

  updateTag(tagId: Id, input: { name?: string; color?: string }): TagView {
    const current = this.getTag(tagId);
    if (!current) {
      throw new Error("Tag not found");
    }
    this.sqlite
      .prepare("UPDATE tags SET name = ?, color = ? WHERE id = ?")
      .run(input.name ?? current.name, input.color ?? current.color, tagId);
    return this.getTag(tagId)!;
  }

  deleteTag(tagId: Id): void {
    const result = this.sqlite.prepare("DELETE FROM tags WHERE id = ?").run(tagId);
    if (result.changes === 0) {
      throw new Error("Tag not found");
    }
  }

  listTicketSummaries(boardId: Id, filters: ListTicketsFilters = {}): TicketSummaryView[] {
    const rows = this.listTicketRows(boardId, filters);
    const ticketIds = rows.map((row) => row.id);
    const tagsByTicket = this.getTagsForTicketIds(ticketIds);
    const blockerIdsByTicket = this.getBlockerIdsForTicketIds(ticketIds);
    const board = this.getBoard(boardId);
    return rows.map((row) =>
      mapTicketSummary(
        row,
        board?.name ?? "",
        tagsByTicket.get(row.id) ?? [],
        blockerIdsByTicket.get(row.id) ?? [],
      ),
    );
  }

  listTickets(boardId: Id, filters: ListTicketsFilters = {}): TicketView[] {
    const rows = this.listTicketRows(boardId, filters);
    const ticketIds = rows.map((row) => row.id);
    const tagsByTicket = this.getTagsForTicketIds(ticketIds);
    const commentsByTicket = this.getCommentsForTicketIds(ticketIds);
    const blockersByTicket = this.getBlockersForTicketIds(ticketIds);
    const parentsByTicket = this.getParentsForTicketIds(ticketIds);
    const childrenByTicket = this.getChildrenForTicketIds(ticketIds);
    const board = this.getBoard(boardId);
    return rows.map((row) =>
      mapTicket(
        row,
        board?.name ?? "",
        tagsByTicket.get(row.id) ?? [],
        commentsByTicket.get(row.id) ?? [],
        blockersByTicket.get(row.id) ?? [],
        parentsByTicket.get(row.id) ?? null,
        childrenByTicket.get(row.id) ?? [],
      ),
    );
  }

  getTicket(ticketId: Id): TicketView | null {
    const row = this.getTicketRow(ticketId);
    if (!row) {
      return null;
    }
    const tagsByTicket = this.getTagsForTicketIds([ticketId]);
    const commentsByTicket = this.getCommentsForTicketIds([ticketId]);
    const blockersByTicket = this.getBlockersForTicketIds([ticketId]);
    const parentsByTicket = this.getParentsForTicketIds([ticketId]);
    const childrenByTicket = this.getChildrenForTicketIds([ticketId]);
    const board = this.getBoard(row.board_id);
    return mapTicket(
      row,
      board?.name ?? "",
      tagsByTicket.get(ticketId) ?? [],
      commentsByTicket.get(ticketId) ?? [],
      blockersByTicket.get(ticketId) ?? [],
      parentsByTicket.get(ticketId) ?? null,
      childrenByTicket.get(ticketId) ?? [],
    );
  }

  createTicket(input: CreateTicketInput): TicketView {
    const now = this.now();
    const position = this.nextTicketPosition(input.laneId);
    const tx = this.sqlite.transaction(() => {
      const result = this.sqlite
        .prepare(
          `
          INSERT INTO tickets (
            board_id, lane_id, parent_ticket_id, title, body_markdown, is_completed, priority, position, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          input.boardId,
          input.laneId,
          this.validateParentTicket(null, input.parentTicketId, input.boardId),
          input.title,
          input.bodyMarkdown ?? "",
          input.isCompleted ? 1 : 0,
          sanitizePriority(input.priority),
          position,
          now,
          now,
        );
      const ticketId = Number(result.lastInsertRowid);
      this.replaceTicketTags(ticketId, input.tagIds ?? []);
      this.replaceTicketBlockers(ticketId, input.blockerIds ?? [], input.boardId);
      this.touchBoard(input.boardId);
      return ticketId;
    });
    return this.getTicket(tx())!;
  }

  updateTicket(ticketId: Id, input: UpdateTicketInput): TicketView {
    const current = this.getTicket(ticketId);
    if (!current) {
      throw new Error("Ticket not found");
    }
    const nextLaneId = input.laneId ?? current.laneId;
    const nextBoardId = input.boardId ?? current.boardId;
    const tx = this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `
          UPDATE tickets
          SET board_id = ?, lane_id = ?, parent_ticket_id = ?, title = ?, body_markdown = ?, is_completed = ?, priority = ?, updated_at = ?
          WHERE id = ?
          `,
        )
        .run(
          nextBoardId,
          nextLaneId,
          this.validateParentTicket(ticketId, input.parentTicketId ?? current.parentTicketId, nextBoardId),
          input.title ?? current.title,
          input.bodyMarkdown ?? current.bodyMarkdown,
          typeof input.isCompleted === "boolean" ? Number(input.isCompleted) : Number(current.isCompleted),
          input.priority == null ? current.priority : sanitizePriority(input.priority),
          this.now(),
          ticketId,
        );
      if (input.tagIds) {
        this.replaceTicketTags(ticketId, input.tagIds);
      }
      if (input.blockerIds) {
        this.replaceTicketBlockers(ticketId, input.blockerIds, nextBoardId);
      }
      if (nextLaneId !== current.laneId) {
        this.sqlite
          .prepare("UPDATE tickets SET position = ? WHERE id = ?")
          .run(this.nextTicketPosition(nextLaneId), ticketId);
        this.normalizeTicketPositions(current.laneId);
      }
      this.touchBoard(nextBoardId);
    });
    tx();
    return this.getTicket(ticketId)!;
  }

  deleteTicket(ticketId: Id): void {
    const ticket = this.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    this.sqlite.prepare("UPDATE tickets SET parent_ticket_id = NULL WHERE parent_ticket_id = ?").run(ticketId);
    this.sqlite.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
    this.normalizeTicketPositions(ticket.laneId);
    this.touchBoard(ticket.boardId);
  }

  addComment(input: CreateCommentInput): CommentView {
    const boardId = this.getTicketBoardId(input.ticketId);
    if (!boardId) {
      throw new Error("Ticket not found");
    }
    const now = this.now();
    const result = this.sqlite
      .prepare("INSERT INTO comments (ticket_id, body_markdown, created_at) VALUES (?, ?, ?)")
      .run(input.ticketId, input.bodyMarkdown, now);
    this.touchBoard(boardId);
    return mapComment({
      id: Number(result.lastInsertRowid),
      ticket_id: input.ticketId,
      body_markdown: input.bodyMarkdown,
      created_at: now,
    });
  }

  listComments(ticketId: Id): CommentView[] {
    if (!this.hasTicket(ticketId)) {
      throw new Error("Ticket not found");
    }
    return this.getCommentsForTicketIds([ticketId]).get(ticketId) ?? [];
  }

  getTicketRelations(ticketId: Id): TicketRelationsView {
    const row = this.getTicketRow(ticketId);
    if (!row) {
      throw new Error("Ticket not found");
    }
    const parent = row.parent_ticket_id == null ? null : this.getParentsForTicketIds([ticketId]).get(ticketId) ?? null;
    return {
      parent,
      children: this.getChildrenForTicketIds([ticketId]).get(ticketId) ?? [],
      blockers: this.getBlockersForTicketIds([ticketId]).get(ticketId) ?? [],
      blockedBy: this.getBlockedTicketsForTicketIds([ticketId]).get(ticketId) ?? [],
    };
  }

  transitionTicket(ticketId: Id, laneName: string, isCompleted?: boolean): TicketView {
    const ticket = this.getTicket(ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    const lane = this.sqlite
      .prepare("SELECT * FROM lanes WHERE board_id = ? AND name = ?")
      .get(ticket.boardId, laneName) as LaneRow | undefined;
    if (!lane) {
      throw new Error("Lane not found");
    }
    return this.updateTicket(ticketId, {
      laneId: lane.id,
      isCompleted,
    });
  }

  reorderTickets(boardId: Id, items: ReorderTicketInput[]): TicketView[] {
    const tickets = this.listTickets(boardId);
    if (tickets.length !== items.length || tickets.some((ticket) => !items.find((item) => item.ticketId === ticket.id))) {
      throw new Error("Ticket order does not match board tickets");
    }
    const lanes = new Set(this.listLanes(boardId).map((lane) => lane.id));
    const updateStmt = this.sqlite.prepare("UPDATE tickets SET lane_id = ?, position = ?, updated_at = ? WHERE id = ?");
    const tx = this.sqlite.transaction(() => {
      const now = this.now();
      items.forEach((item) => {
        if (!lanes.has(item.laneId)) {
          throw new Error("Lane does not belong to board");
        }
        updateStmt.run(item.laneId, item.position, now, item.ticketId);
      });
      this.touchBoard(boardId);
    });
    tx();
    return this.listTickets(boardId);
  }

  exportBoard(boardId: Id): BoardExport {
    const detail = this.getBoardDetail(boardId);
    return {
      board: detail.board,
      lanes: detail.lanes,
      tags: detail.tags,
      tickets: detail.tickets.map(({ bodyHtml: _bodyHtml, blockers: _blockers, parent: _parent, children: _children, ref: _ref, shortRef: _shortRef, ...ticket }) => ticket),
    };
  }

  importBoard(payload: BoardExport): BoardDetailView {
    const tx = this.sqlite.transaction(() => {
      const created = this.createBoard({
        name: payload.board.name,
        laneNames: payload.lanes.map((lane) => lane.name),
      });
      const laneByName = new Map(created.lanes.map((lane) => [lane.name, lane.id]));
      const tagByName = new Map<string, Id>();
      const createdTicketIds = new Map<Id, Id>();
      payload.tags.forEach((tag) => {
        const createdTag = this.createTag({
          boardId: created.board.id,
          name: tag.name,
          color: tag.color,
        });
        tagByName.set(createdTag.name, createdTag.id);
      });

      const sortedTickets = [...payload.tickets].sort((a, b) => a.position - b.position || a.id - b.id);
      sortedTickets.forEach((ticket) => {
        const laneName = payload.lanes.find((lane) => lane.id === ticket.laneId)?.name;
        if (!laneName) {
          throw new Error("Invalid ticket lane in import payload");
        }
        const createdTicket = this.createTicket({
          boardId: created.board.id,
          laneId: laneByName.get(laneName)!,
          title: ticket.title,
          bodyMarkdown: ticket.bodyMarkdown,
          isCompleted: ticket.isCompleted,
          priority: ticket.priority,
          tagIds: ticket.tags
            .map((tag) => tagByName.get(tag.name))
            .filter((value): value is number => typeof value === "number"),
        });
        createdTicketIds.set(ticket.id, createdTicket.id);
        ticket.comments.forEach((comment) => {
          this.addComment({
            ticketId: createdTicket.id,
            bodyMarkdown: comment.bodyMarkdown,
          });
        });
      });

      sortedTickets.forEach((ticket) => {
        const ticketId = createdTicketIds.get(ticket.id);
        if (!ticketId) {
          return;
        }
        this.sqlite
          .prepare("UPDATE tickets SET parent_ticket_id = ? WHERE id = ?")
          .run(ticket.parentTicketId == null ? null : createdTicketIds.get(ticket.parentTicketId) ?? null, ticketId);
        this.replaceTicketBlockers(
          ticketId,
          (ticket.blockerIds ?? []).map((blockerId) => createdTicketIds.get(blockerId)).filter((value): value is number => typeof value === "number"),
          created.board.id,
        );
      });

      return created.board.id;
    });
    return this.getBoardDetail(tx());
  }

  private touchBoard(boardId: Id): void {
    this.sqlite.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(this.now(), boardId);
  }

  private hasTicket(ticketId: Id): boolean {
    const row = this.sqlite.prepare("SELECT id FROM tickets WHERE id = ?").get(ticketId) as { id: Id } | undefined;
    return Boolean(row);
  }

  private getTicketBoardId(ticketId: Id): Id | null {
    const row = this.sqlite.prepare("SELECT board_id FROM tickets WHERE id = ?").get(ticketId) as { board_id: Id } | undefined;
    return row?.board_id ?? null;
  }

  private getTicketRow(ticketId: Id): TicketRow | null {
    const row = this.sqlite.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as TicketRow | undefined;
    return row ?? null;
  }

  private listTicketRows(boardId: Id, filters: ListTicketsFilters = {}): TicketRow[] {
    let sql = `
      SELECT t.*
      FROM tickets t
      WHERE t.board_id = ?
    `;
    const params: Array<string | number> = [boardId];

    if (typeof filters.laneId === "number") {
      sql += " AND t.lane_id = ?";
      params.push(filters.laneId);
    }
    if (typeof filters.completed === "boolean") {
      sql += " AND t.is_completed = ?";
      params.push(filters.completed ? 1 : 0);
    }
    if (filters.q) {
      sql += " AND (t.title LIKE ? OR t.body_markdown LIKE ?)";
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }
    if (filters.tag) {
      sql += `
        AND EXISTS (
          SELECT 1
          FROM ticket_tags tt
          INNER JOIN tags tag ON tag.id = tt.tag_id
          WHERE tt.ticket_id = t.id
            AND tag.name = ?
        )
      `;
      params.push(filters.tag);
    }
    sql += " ORDER BY t.lane_id ASC, t.position ASC, t.id ASC";

    return this.sqlite.prepare(sql).all(...params) as TicketRow[];
  }

  private nextLanePosition(boardId: Id): number {
    const row = this.sqlite
      .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS nextPosition FROM lanes WHERE board_id = ?")
      .get(boardId) as { nextPosition: number };
    return row.nextPosition;
  }

  private nextTicketPosition(laneId: Id): number {
    const row = this.sqlite
      .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS nextPosition FROM tickets WHERE lane_id = ?")
      .get(laneId) as { nextPosition: number };
    return row.nextPosition;
  }

  private normalizeLanePositions(boardId: Id): void {
    const lanes = this.listLanes(boardId);
    const stmt = this.sqlite.prepare("UPDATE lanes SET position = ? WHERE id = ?");
    lanes.forEach((lane, index) => stmt.run(index, lane.id));
  }

  private normalizeTicketPositions(laneId: Id): void {
    const rows = this.sqlite
      .prepare("SELECT id FROM tickets WHERE lane_id = ? ORDER BY position ASC, id ASC")
      .all(laneId) as Array<{ id: Id }>;
    const stmt = this.sqlite.prepare("UPDATE tickets SET position = ? WHERE id = ?");
    rows.forEach((row, index) => stmt.run(index, row.id));
  }


  private validateParentTicket(ticketId: Id | null, parentTicketId: Id | null | undefined, boardId: Id): Id | null {
    if (parentTicketId == null) {
      return null;
    }
    if (ticketId != null && parentTicketId === ticketId) {
      throw new Error("Ticket cannot be its own parent");
    }
    const parent = this.sqlite
      .prepare("SELECT id, board_id, parent_ticket_id FROM tickets WHERE id = ?")
      .get(parentTicketId) as { id: Id; board_id: Id; parent_ticket_id: Id | null } | undefined;
    if (!parent || parent.board_id !== boardId) {
      throw new Error("Parent ticket does not belong to board");
    }
    if (parent.parent_ticket_id != null) {
      throw new Error("Child ticket cannot be a parent");
    }
    if (ticketId != null) {
      const childCount = this.sqlite
        .prepare("SELECT COUNT(*) AS count FROM tickets WHERE parent_ticket_id = ?")
        .get(ticketId) as { count: number };
      if (childCount.count > 0) {
        throw new Error("Ticket with children cannot become a child");
      }
    }
    return parentTicketId;
  }

  private replaceTicketTags(ticketId: Id, tagIds: Id[]): void {
    this.sqlite.prepare("DELETE FROM ticket_tags WHERE ticket_id = ?").run(ticketId);
    const insert = this.sqlite.prepare("INSERT INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)");
    tagIds.forEach((tagId) => insert.run(ticketId, tagId));
  }

  private replaceTicketBlockers(ticketId: Id, blockerIds: Id[], boardId: Id): void {
    const nextBlockerIds = [...new Set(blockerIds.filter((blockerId) => blockerId !== ticketId))];
    if (nextBlockerIds.length > 0) {
      const placeholders = nextBlockerIds.map(() => "?").join(", ");
      const validIds = this.sqlite
        .prepare(
          `
          SELECT id
          FROM tickets
          WHERE board_id = ?
            AND id IN (${placeholders})
          `,
        )
        .all(boardId, ...nextBlockerIds) as Array<{ id: Id }>;
      if (validIds.length !== nextBlockerIds.length) {
        throw new Error("Blocker ticket does not belong to board");
      }
      const reverseLinks = this.sqlite
        .prepare(
          `
          SELECT ticket_id
          FROM ticket_blockers
          WHERE blocker_ticket_id = ?
            AND ticket_id IN (${placeholders})
          `,
        )
        .all(ticketId, ...nextBlockerIds) as Array<{ ticket_id: Id }>;
      if (reverseLinks.length > 0) {
        throw new Error("Blocker would create a deadlock");
      }
    }
    this.sqlite.prepare("DELETE FROM ticket_blockers WHERE ticket_id = ?").run(ticketId);
    const insert = this.sqlite.prepare(
      "INSERT INTO ticket_blockers (ticket_id, blocker_ticket_id) VALUES (?, ?)",
    );
    nextBlockerIds.forEach((blockerId) => insert.run(ticketId, blockerId));
  }

  private getTagsForTicketIds(ticketIds: Id[]): Map<Id, TagView[]> {
    const tagsByTicket = new Map<Id, TagView[]>();
    if (ticketIds.length === 0) {
      return tagsByTicket;
    }
    const placeholders = ticketIds.map(() => "?").join(", ");
    const rows = this.sqlite
      .prepare(
        `
        SELECT tl.ticket_id, l.*
        FROM ticket_tags tl
        INNER JOIN tags l ON l.id = tl.tag_id
        WHERE tl.ticket_id IN (${placeholders})
        ORDER BY l.name ASC, l.id ASC
        `,
      )
      .all(...ticketIds) as Array<{ ticket_id: Id } & TagRow>;

    rows.forEach((row) => {
      const entry = tagsByTicket.get(row.ticket_id) ?? [];
      entry.push(mapTag(row));
      tagsByTicket.set(row.ticket_id, entry);
    });
    return tagsByTicket;
  }

  private getCommentsForTicketIds(ticketIds: Id[]): Map<Id, CommentView[]> {
    const commentsByTicket = new Map<Id, CommentView[]>();
    if (ticketIds.length === 0) {
      return commentsByTicket;
    }
    const placeholders = ticketIds.map(() => "?").join(", ");
    const rows = this.sqlite
      .prepare(
        `
        SELECT *
        FROM comments
        WHERE ticket_id IN (${placeholders})
        ORDER BY created_at ASC, id ASC
        `,
      )
      .all(...ticketIds) as CommentRow[];

    rows.forEach((row) => {
      const entry = commentsByTicket.get(row.ticket_id) ?? [];
      entry.push(mapComment(row));
      commentsByTicket.set(row.ticket_id, entry);
    });
    return commentsByTicket;
  }

  private getParentsForTicketIds(ticketIds: Id[]): Map<Id, TicketRelationView> {
    const parentsByTicket = new Map<Id, TicketRelationView>();
    const relationsByTicket = this.getRelationEntriesForTicketIds(
      ticketIds,
      `
        SELECT child.id AS ticket_id, parent.id, parent.title, parent.lane_id, parent.is_completed, parent.priority, board.name AS board_name
        FROM tickets child
        INNER JOIN tickets parent ON parent.id = child.parent_ticket_id
        INNER JOIN boards board ON board.id = parent.board_id
        WHERE child.id IN ({placeholders})
      `,
    );
    relationsByTicket.forEach((relations, ticketId) => {
      const [parent] = relations;
      if (parent) {
        parentsByTicket.set(ticketId, parent);
      }
    });
    return parentsByTicket;
  }

  private getChildrenForTicketIds(ticketIds: Id[]): Map<Id, TicketRelationView[]> {
    return this.getRelationEntriesForTicketIds(
      ticketIds,
      `
        SELECT parent_ticket_id AS ticket_id, tickets.id, tickets.title, tickets.lane_id, tickets.is_completed, tickets.priority, board.name AS board_name
        FROM tickets
        INNER JOIN boards board ON board.id = tickets.board_id
        WHERE parent_ticket_id IN ({placeholders})
        ORDER BY tickets.priority DESC, tickets.id ASC
      `,
    );
  }

  private getBlockersForTicketIds(ticketIds: Id[]): Map<Id, TicketBlockerView[]> {
    return this.getRelationEntriesForTicketIds(
      ticketIds,
      `
        SELECT tb.ticket_id, t.id, t.title, t.lane_id, t.is_completed, t.priority, board.name AS board_name
        FROM ticket_blockers tb
        INNER JOIN tickets t ON t.id = tb.blocker_ticket_id
        INNER JOIN boards board ON board.id = t.board_id
        WHERE tb.ticket_id IN ({placeholders})
        ORDER BY t.priority DESC, t.id ASC
      `,
    );
  }

  private getBlockerIdsForTicketIds(ticketIds: Id[]): Map<Id, Id[]> {
    const blockerIdsByTicket = new Map<Id, Id[]>();
    if (ticketIds.length === 0) {
      return blockerIdsByTicket;
    }
    const placeholders = ticketIds.map(() => "?").join(", ");
    const rows = this.sqlite
      .prepare(
        `
        SELECT ticket_id, blocker_ticket_id
        FROM ticket_blockers
        WHERE ticket_id IN (${placeholders})
        ORDER BY blocker_ticket_id ASC
        `,
      )
      .all(...ticketIds) as Array<{ ticket_id: Id; blocker_ticket_id: Id }>;

    rows.forEach((row) => {
      const entry = blockerIdsByTicket.get(row.ticket_id) ?? [];
      entry.push(row.blocker_ticket_id);
      blockerIdsByTicket.set(row.ticket_id, entry);
    });
    return blockerIdsByTicket;
  }

  private getBlockedTicketsForTicketIds(ticketIds: Id[]): Map<Id, TicketRelationView[]> {
    return this.getRelationEntriesForTicketIds(
      ticketIds,
      `
        SELECT tb.blocker_ticket_id AS ticket_id, t.id, t.title, t.lane_id, t.is_completed, t.priority, board.name AS board_name
        FROM ticket_blockers tb
        INNER JOIN tickets t ON t.id = tb.ticket_id
        INNER JOIN boards board ON board.id = t.board_id
        WHERE tb.blocker_ticket_id IN ({placeholders})
        ORDER BY t.priority DESC, t.id ASC
      `,
    );
  }

  private getRelationEntriesForTicketIds(ticketIds: Id[], query: string): Map<Id, TicketRelationView[]> {
    const relationsByTicket = new Map<Id, TicketRelationView[]>();
    if (ticketIds.length === 0) {
      return relationsByTicket;
    }
    const placeholders = ticketIds.map(() => "?").join(", ");
    const rows = this.sqlite
      .prepare(query.replace("{placeholders}", placeholders))
      .all(...ticketIds) as TicketRelationRow[];

    rows.forEach((row) => {
      const entry = relationsByTicket.get(row.ticket_id) ?? [];
      entry.push(mapRelation(row, row.board_name));
      relationsByTicket.set(row.ticket_id, entry);
    });
    return relationsByTicket;
  }

}

function mapBoard(row: BoardRow): BoardView {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLane(row: LaneRow): LaneView {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    position: row.position,
  };
}

function mapTag(row: TagRow): TagView {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    color: row.color,
  };
}

function mapTicket(
  row: TicketRow,
  boardName: string,
  tags: TagView[],
  comments: CommentView[],
  blockers: TicketBlockerView[],
  parent: TicketRelationView | null,
  children: TicketRelationView[],
): TicketView {
  return {
    id: row.id,
    boardId: row.board_id,
    laneId: row.lane_id,
    parentTicketId: row.parent_ticket_id,
    title: row.title,
    bodyMarkdown: row.body_markdown,
    bodyHtml: renderMarkdown(row.body_markdown),
    isCompleted: Boolean(row.is_completed),
    priority: row.priority,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags,
    comments,
    blockerIds: blockers.map((blocker) => blocker.id),
    blockers,
    parent,
    children,
    ref: formatTicketRef(boardName, row.id),
    shortRef: formatShortRef(row.id),
  };
}

function mapTicketSummary(
  row: TicketRow,
  boardName: string,
  tags: TagView[],
  blockerIds: Id[],
): TicketSummaryView {
  return {
    id: row.id,
    boardId: row.board_id,
    laneId: row.lane_id,
    parentTicketId: row.parent_ticket_id,
    title: row.title,
    isCompleted: Boolean(row.is_completed),
    priority: row.priority,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags,
    blockerIds,
    ref: formatTicketRef(boardName, row.id),
    shortRef: formatShortRef(row.id),
  };
}

function mapComment(row: CommentRow): CommentView {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    bodyMarkdown: row.body_markdown,
    bodyHtml: renderMarkdown(row.body_markdown),
    createdAt: row.created_at,
  };
}

function sanitizePriority(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return Math.trunc(value);
}

function mapRelation(
  row: {
    id: Id;
    title: string;
    lane_id: Id;
    is_completed: number;
    priority: number;
  },
  boardName: string,
): TicketRelationView {
  return {
    id: row.id,
    title: row.title,
    laneId: row.lane_id,
    isCompleted: Boolean(row.is_completed),
    priority: row.priority,
    ref: formatTicketRef(boardName, row.id),
    shortRef: formatShortRef(row.id),
  };
}

function formatTicketRef(boardName: string, ticketId: Id): string {
  return `${boardName}#${ticketId}`;
}

function formatShortRef(ticketId: Id): string {
  return `#${ticketId}`;
}
