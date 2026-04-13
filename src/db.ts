import Database from "better-sqlite3";

import {
  mapActivityLog,
  mapBoard,
  mapComment,
  mapLane,
  mapTag,
  mapTicket,
  mapTicketSummary,
  sanitizePriority,
} from "./db-mappers.js";
import { importBoardPayload, toBoardExport } from "./db-board-transfer.js";
import {
  nextBoardPosition,
  nextLanePosition,
  nextTicketPosition,
  normalizeBoardPositions,
  normalizeLanePositions,
  normalizeVisibleAndArchivedTicketPositions,
} from "./db-ordering.js";
import { migrate } from "./db-migration.js";
import {
  getBlockedTicketsForTicketIds,
  getBlockerIdsForTicketIds,
  getBlockersForTicketIds,
  getChildrenForTicketIds,
  getCommentsForTicketIds,
  getParentsForTicketIds,
  getTagsForTicketIds,
} from "./db-ticket-loaders.js";
import {
  addActivity,
  replaceTicketBlockers,
  replaceTicketTags,
  validateParentTicket,
} from "./db-ticket-writes.js";
import {
  type ActivityLogRow,
  type ActivityLogView,
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
  type TicketRelationsView,
  type TicketRow,
  type TicketSummaryView,
  type TicketView,
} from "./types.js";

type ListTicketsFilters = {
  laneId?: number;
  tag?: string;
  resolved?: boolean;
  q?: string;
  archived?: boolean;
  includeArchived?: boolean;
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
  isResolved?: boolean;
  isArchived?: boolean;
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

type UpdateCommentInput = {
  commentId: Id;
  bodyMarkdown: string;
};

type ReorderTicketInput = {
  ticketId: Id;
  laneId: Id;
  position: number;
};

type BulkResolveTicketsInput = {
  boardId: Id;
  ticketIds: Id[];
  isResolved: boolean;
};

type BulkTransitionTicketsInput = {
  boardId: Id;
  ticketIds: Id[];
  laneName: string;
  isResolved?: boolean;
};

type BulkArchiveTicketsInput = {
  boardId: Id;
  ticketIds: Id[];
  isArchived: boolean;
};

const DEFAULT_LANES = ["todo", "doing", "done"];
const DEFAULT_TAG_COLOR = "#6b7280";

export class KanbanDb {
  readonly sqlite: Database.Database;

  constructor(filename: string) {
    this.sqlite = new Database(filename);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    migrate(this.sqlite);
  }

  close(): void {
    this.sqlite.close();
  }

  now(): string {
    return new Date().toISOString();
  }

  listBoards(): BoardView[] {
    const rows = this.sqlite
      .prepare("SELECT * FROM boards ORDER BY position ASC, id ASC")
      .all() as BoardRow[];
    return rows.map(mapBoard);
  }

  createBoard(input: CreateBoardInput): BoardDetailView {
    const now = this.now();
    const position = nextBoardPosition(this.sqlite);
    const insertBoard = this.sqlite.prepare(
      "INSERT INTO boards (name, position, created_at, updated_at) VALUES (?, ?, ?, ?)",
    );
    const insertLane = this.sqlite.prepare(
      "INSERT INTO lanes (board_id, name, position) VALUES (?, ?, ?)",
    );
    const tx = this.sqlite.transaction(() => {
      const result = insertBoard.run(input.name, position, now, now);
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
      tickets: this.listTickets(boardId, { includeArchived: true }),
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
    normalizeBoardPositions(this.sqlite);
  }

  listLanes(boardId: Id): LaneView[] {
    const rows = this.sqlite
      .prepare("SELECT * FROM lanes WHERE board_id = ? ORDER BY position ASC, id ASC")
      .all(boardId) as LaneRow[];
    return rows.map(mapLane);
  }

  createLane(input: CreateLaneInput): LaneView {
    const position = nextLanePosition(this.sqlite, input.boardId);
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
    normalizeLanePositions(this.sqlite, lane.boardId);
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

  reorderBoards(boardIds: Id[]): BoardView[] {
    const boards = this.listBoards();
    if (boards.length !== boardIds.length || boards.some((board) => !boardIds.includes(board.id))) {
      throw new Error("Board order does not match boards");
    }
    const stmt = this.sqlite.prepare("UPDATE boards SET position = ? WHERE id = ?");
    const tx = this.sqlite.transaction(() => {
      boardIds.forEach((boardId, index) => stmt.run(index, boardId));
    });
    tx();
    return this.listBoards();
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
    const tagsByTicket = getTagsForTicketIds(this.sqlite, ticketIds);
    const blockerIdsByTicket = getBlockerIdsForTicketIds(this.sqlite, ticketIds);
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
    const tagsByTicket = getTagsForTicketIds(this.sqlite, ticketIds);
    const commentsByTicket = getCommentsForTicketIds(this.sqlite, ticketIds);
    const blockersByTicket = getBlockersForTicketIds(this.sqlite, ticketIds);
    const blockedByByTicket = getBlockedTicketsForTicketIds(this.sqlite, ticketIds);
    const parentsByTicket = getParentsForTicketIds(this.sqlite, ticketIds);
    const childrenByTicket = getChildrenForTicketIds(this.sqlite, ticketIds);
    const board = this.getBoard(boardId);
    return rows.map((row) =>
      mapTicket(
        row,
        board?.name ?? "",
        tagsByTicket.get(row.id) ?? [],
        commentsByTicket.get(row.id) ?? [],
        blockersByTicket.get(row.id) ?? [],
        blockedByByTicket.get(row.id) ?? [],
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
    const tagsByTicket = getTagsForTicketIds(this.sqlite, [ticketId]);
    const commentsByTicket = getCommentsForTicketIds(this.sqlite, [ticketId]);
    const blockersByTicket = getBlockersForTicketIds(this.sqlite, [ticketId]);
    const blockedByByTicket = getBlockedTicketsForTicketIds(this.sqlite, [ticketId]);
    const parentsByTicket = getParentsForTicketIds(this.sqlite, [ticketId]);
    const childrenByTicket = getChildrenForTicketIds(this.sqlite, [ticketId]);
    const board = this.getBoard(row.board_id);
    return mapTicket(
      row,
      board?.name ?? "",
      tagsByTicket.get(ticketId) ?? [],
      commentsByTicket.get(ticketId) ?? [],
      blockersByTicket.get(ticketId) ?? [],
      blockedByByTicket.get(ticketId) ?? [],
      parentsByTicket.get(ticketId) ?? null,
      childrenByTicket.get(ticketId) ?? [],
    );
  }

  createTicket(input: CreateTicketInput): TicketView {
    const now = this.now();
    const position = nextTicketPosition(this.sqlite, input.laneId);
    const tx = this.sqlite.transaction(() => {
      const result = this.sqlite
        .prepare(
          `
          INSERT INTO tickets (
            board_id, lane_id, parent_ticket_id, title, body_markdown, is_resolved, is_archived, priority, position, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          input.boardId,
          input.laneId,
          validateParentTicket(this.sqlite, null, input.parentTicketId, input.boardId),
          input.title,
          input.bodyMarkdown ?? "",
          input.isResolved ? 1 : 0,
          input.isArchived ? 1 : 0,
          sanitizePriority(input.priority),
          position,
          now,
          now,
        );
      const ticketId = Number(result.lastInsertRowid);
      replaceTicketTags(this.sqlite, ticketId, input.tagIds ?? []);
      replaceTicketBlockers(this.sqlite, ticketId, input.blockerIds ?? [], input.boardId);
      this.addActivity(input.boardId, ticketId, "ticket_created", "Ticket created");
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
          SET board_id = ?, lane_id = ?, parent_ticket_id = ?, title = ?, body_markdown = ?, is_resolved = ?, is_archived = ?, priority = ?, updated_at = ?
          WHERE id = ?
          `,
        )
        .run(
          nextBoardId,
          nextLaneId,
          validateParentTicket(
            this.sqlite,
            ticketId,
            input.parentTicketId !== undefined ? input.parentTicketId : current.parentTicketId,
            nextBoardId,
          ),
          input.title ?? current.title,
          input.bodyMarkdown ?? current.bodyMarkdown,
          typeof input.isResolved === "boolean" ? Number(input.isResolved) : Number(current.isResolved),
          typeof input.isArchived === "boolean" ? Number(input.isArchived) : Number(current.isArchived),
          input.priority == null ? current.priority : sanitizePriority(input.priority),
          this.now(),
          ticketId,
        );
      if (input.tagIds) {
        replaceTicketTags(this.sqlite, ticketId, input.tagIds);
      }
      if (input.blockerIds) {
        replaceTicketBlockers(this.sqlite, ticketId, input.blockerIds, nextBoardId);
      }
      if (nextLaneId !== current.laneId) {
        this.sqlite
          .prepare("UPDATE tickets SET position = ? WHERE id = ?")
          .run(nextTicketPosition(this.sqlite, nextLaneId), ticketId);
        normalizeVisibleAndArchivedTicketPositions(this.sqlite, current.laneId);
        normalizeVisibleAndArchivedTicketPositions(this.sqlite, nextLaneId);
      } else if (typeof input.isArchived === "boolean" && input.isArchived !== current.isArchived) {
        this.sqlite
          .prepare("UPDATE tickets SET position = ? WHERE id = ?")
          .run(nextTicketPosition(this.sqlite, nextLaneId), ticketId);
        normalizeVisibleAndArchivedTicketPositions(this.sqlite, nextLaneId);
      }
      const nextArchived = typeof input.isArchived === "boolean" ? input.isArchived : current.isArchived;
      const nextResolved = typeof input.isResolved === "boolean" ? input.isResolved : current.isResolved;
      const nextTitle = input.title ?? current.title;
      const message = nextArchived !== current.isArchived
        ? (nextArchived ? "Ticket archived" : "Ticket restored")
          : input.laneId != null && input.laneId !== current.laneId
            ? "Ticket moved"
            : typeof input.isResolved === "boolean" && nextResolved !== current.isResolved
              ? (nextResolved ? "Ticket resolved" : "Ticket reopened")
            : nextTitle !== current.title
              ? "Ticket title updated"
              : "Ticket updated";
      const action = nextArchived !== current.isArchived
        ? (nextArchived ? "ticket_archived" : "ticket_restored")
        : input.laneId != null && input.laneId !== current.laneId
          ? "ticket_transitioned"
          : "ticket_updated";
      this.addActivity(nextBoardId, ticketId, action, message);
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
    const tx = this.sqlite.transaction(() => {
      this.addActivity(ticket.boardId, ticketId, "ticket_deleted", "Ticket deleted", {
        title: ticket.title,
        laneId: ticket.laneId,
        isResolved: ticket.isResolved,
        isArchived: ticket.isArchived,
      });
      this.sqlite.prepare("UPDATE tickets SET parent_ticket_id = NULL WHERE parent_ticket_id = ?").run(ticketId);
      this.sqlite.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
      normalizeVisibleAndArchivedTicketPositions(this.sqlite, ticket.laneId);
      this.touchBoard(ticket.boardId);
    });
    tx();
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
    this.addActivity(boardId, input.ticketId, "comment_added", "Comment added");
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
    return getCommentsForTicketIds(this.sqlite, [ticketId]).get(ticketId) ?? [];
  }

  updateComment(input: UpdateCommentInput): CommentView {
    const current = this.sqlite
      .prepare(
        `
        SELECT c.*, t.board_id
        FROM comments c
        INNER JOIN tickets t ON t.id = c.ticket_id
        WHERE c.id = ?
        `,
      )
      .get(input.commentId) as (CommentRow & { board_id: Id }) | undefined;
    if (!current) {
      throw new Error("Comment not found");
    }
    this.sqlite
      .prepare("UPDATE comments SET body_markdown = ? WHERE id = ?")
      .run(input.bodyMarkdown, input.commentId);
    this.addActivity(current.board_id, current.ticket_id, "comment_updated", "Comment updated", {
      commentId: current.id,
      oldBodyMarkdown: current.body_markdown,
      newBodyMarkdown: input.bodyMarkdown,
    });
    this.touchBoard(current.board_id);
    return mapComment({
      id: current.id,
      ticket_id: current.ticket_id,
      body_markdown: input.bodyMarkdown,
      created_at: current.created_at,
    });
  }

  deleteComment(commentId: Id): { ticketId: Id; boardId: Id } {
    const current = this.sqlite
      .prepare(
        `
        SELECT c.id, c.ticket_id, c.body_markdown, t.board_id
        FROM comments c
        INNER JOIN tickets t ON t.id = c.ticket_id
        WHERE c.id = ?
        `,
      )
      .get(commentId) as { id: Id; ticket_id: Id; board_id: Id; body_markdown: string } | undefined;
    if (!current) {
      throw new Error("Comment not found");
    }
    this.sqlite.prepare("DELETE FROM comments WHERE id = ?").run(commentId);
    this.addActivity(current.board_id, current.ticket_id, "comment_deleted", "Comment deleted", {
      commentId: current.id,
      deletedBodyMarkdown: current.body_markdown,
    });
    this.touchBoard(current.board_id);
    return { ticketId: current.ticket_id, boardId: current.board_id };
  }

  listActivity(ticketId: Id): ActivityLogView[] {
    const hasActivity = this.sqlite
      .prepare("SELECT 1 FROM activity_logs WHERE subject_ticket_id = ? LIMIT 1")
      .get(ticketId) != null;
    if (!this.hasTicket(ticketId) && !hasActivity) {
      throw new Error("Ticket not found");
    }
    const rows = this.sqlite
      .prepare("SELECT * FROM activity_logs WHERE subject_ticket_id = ? ORDER BY created_at DESC, id DESC")
      .all(ticketId) as ActivityLogRow[];
    return rows.map(mapActivityLog);
  }

  getTicketRelations(ticketId: Id): TicketRelationsView {
    const row = this.getTicketRow(ticketId);
    if (!row) {
      throw new Error("Ticket not found");
    }
    const parent = row.parent_ticket_id == null ? null : getParentsForTicketIds(this.sqlite, [ticketId]).get(ticketId) ?? null;
    return {
      parent,
      children: getChildrenForTicketIds(this.sqlite, [ticketId]).get(ticketId) ?? [],
      blockers: getBlockersForTicketIds(this.sqlite, [ticketId]).get(ticketId) ?? [],
      blockedBy: getBlockedTicketsForTicketIds(this.sqlite, [ticketId]).get(ticketId) ?? [],
    };
  }

  transitionTicket(ticketId: Id, laneName: string, isResolved?: boolean): TicketView {
    const current = this.getTicket(ticketId);
    if (!current) {
      throw new Error("Ticket not found");
    }
    const lane = this.sqlite
      .prepare("SELECT * FROM lanes WHERE board_id = ? AND name = ?")
      .get(current.boardId, laneName) as LaneRow | undefined;
    if (!lane) {
      throw new Error("Lane not found");
    }
    return this.updateTicket(ticketId, {
      laneId: lane.id,
      isResolved,
    });
  }

  reorderTickets(boardId: Id, items: ReorderTicketInput[]): TicketView[] {
    const tickets = this.listTickets(boardId);
    if (tickets.length !== items.length || tickets.some((ticket) => !items.find((item) => item.ticketId === ticket.id))) {
      throw new Error("Ticket order does not match board tickets");
    }
    const laneRows = this.listLanes(boardId);
    const lanes = new Set(laneRows.map((lane) => lane.id));
    const laneNameById = new Map(laneRows.map((lane) => [lane.id, lane.name]));
    const currentRows = this.getTicketRowsForBoard(boardId, items.map((item) => item.ticketId));
    const currentRowsById = new Map(currentRows.map((row) => [row.id, row]));
    const updateStmt = this.sqlite.prepare("UPDATE tickets SET lane_id = ?, position = ?, updated_at = ? WHERE id = ?");
    const tx = this.sqlite.transaction(() => {
      const now = this.now();
      const affectedLaneIds = new Set<Id>();
      currentRows.forEach((row) => affectedLaneIds.add(row.lane_id));
      items.forEach((item) => {
        if (!lanes.has(item.laneId)) {
          throw new Error("Lane does not belong to board");
        }
        affectedLaneIds.add(item.laneId);
        updateStmt.run(item.laneId, item.position, now, item.ticketId);
        const current = currentRowsById.get(item.ticketId);
        if (current && current.lane_id !== item.laneId) {
          this.addActivity(
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
      affectedLaneIds.forEach((laneId) => normalizeVisibleAndArchivedTicketPositions(this.sqlite, laneId));
      this.touchBoard(boardId);
    });
    tx();
    return this.listTickets(boardId);
  }

  bulkResolveTickets(input: BulkResolveTicketsInput): TicketSummaryView[] {
    const rows = this.getTicketRowsForBoard(input.boardId, input.ticketIds);
    if (rows.length !== input.ticketIds.length) {
      throw new Error("Some tickets do not belong to board");
    }
    if (rows.length === 0) {
      return [];
    }
    const now = this.now();
    const stmt = this.sqlite.prepare("UPDATE tickets SET is_resolved = ?, updated_at = ? WHERE id = ?");
    const tx = this.sqlite.transaction(() => {
      rows.forEach((row) => stmt.run(input.isResolved ? 1 : 0, now, row.id));
      rows.forEach((row) =>
        this.addActivity(
          input.boardId,
          row.id,
          input.isResolved ? "ticket_resolved" : "ticket_reopened",
          input.isResolved ? "Ticket resolved" : "Ticket reopened",
        ),
      );
      this.touchBoard(input.boardId);
    });
    tx();
    return this.listTicketSummariesByIds(input.boardId, input.ticketIds);
  }

  bulkTransitionTickets(input: BulkTransitionTicketsInput): TicketSummaryView[] {
    const rows = this.getTicketRowsForBoard(input.boardId, input.ticketIds);
    if (rows.length !== input.ticketIds.length) {
      throw new Error("Some tickets do not belong to board");
    }
    if (rows.length === 0) {
      return [];
    }
    const lane = this.sqlite
      .prepare("SELECT * FROM lanes WHERE board_id = ? AND name = ?")
      .get(input.boardId, input.laneName) as LaneRow | undefined;
    if (!lane) {
      throw new Error("Lane not found");
    }

    const now = this.now();
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const movingRows = rows.filter((row) => row.lane_id !== lane.id);
    const nextPosition = nextTicketPosition(this.sqlite, lane.id);
    const updateStmt = this.sqlite.prepare(
      "UPDATE tickets SET lane_id = ?, position = ?, is_resolved = ?, updated_at = ? WHERE id = ?",
    );
    const updateSameLaneStmt = this.sqlite.prepare(
      "UPDATE tickets SET is_resolved = ?, updated_at = ? WHERE id = ?",
    );
    const tx = this.sqlite.transaction(() => {
      let targetPosition = nextPosition;
      for (const ticketId of input.ticketIds) {
        const row = rowsById.get(ticketId)!;
        const nextResolved = typeof input.isResolved === "boolean" ? Number(input.isResolved) : row.is_resolved;
        if (row.lane_id === lane.id) {
          updateSameLaneStmt.run(nextResolved, now, row.id);
          this.addActivity(input.boardId, row.id, "ticket_transitioned", `Moved to ${input.laneName}`);
          continue;
        }
        updateStmt.run(lane.id, targetPosition, nextResolved, now, row.id);
        this.addActivity(input.boardId, row.id, "ticket_transitioned", `Moved to ${input.laneName}`);
        targetPosition += 1;
      }
      const sourceLaneIds = [...new Set(movingRows.map((row) => row.lane_id))];
      sourceLaneIds.forEach((laneId) => normalizeVisibleAndArchivedTicketPositions(this.sqlite, laneId));
      normalizeVisibleAndArchivedTicketPositions(this.sqlite, lane.id);
      this.touchBoard(input.boardId);
    });
    tx();
    return this.listTicketSummariesByIds(input.boardId, input.ticketIds);
  }

  bulkArchiveTickets(input: BulkArchiveTicketsInput): TicketSummaryView[] {
    const rows = this.getTicketRowsForBoard(input.boardId, input.ticketIds);
    if (rows.length !== input.ticketIds.length) {
      throw new Error("Some tickets do not belong to board");
    }
    if (rows.length === 0) {
      return [];
    }
    const now = this.now();
    const updateStmt = this.sqlite.prepare(
      "UPDATE tickets SET is_archived = ?, position = ?, updated_at = ? WHERE id = ?",
    );
    const tx = this.sqlite.transaction(() => {
      const affectedLaneIds = new Set<Id>();
      for (const row of rows) {
        affectedLaneIds.add(row.lane_id);
        const nextPosition = input.isArchived ? nextTicketPosition(this.sqlite, row.lane_id) : row.position;
        updateStmt.run(input.isArchived ? 1 : 0, nextPosition, now, row.id);
        this.addActivity(
          input.boardId,
          row.id,
          input.isArchived ? "ticket_archived" : "ticket_restored",
          input.isArchived ? "Ticket archived" : "Ticket restored",
        );
      }
      affectedLaneIds.forEach((laneId) => normalizeVisibleAndArchivedTicketPositions(this.sqlite, laneId));
      this.touchBoard(input.boardId);
    });
    tx();
    return this.listTicketSummariesByIds(input.boardId, input.ticketIds);
  }

  exportBoard(boardId: Id): BoardExport {
    return toBoardExport(this.getBoardDetail(boardId));
  }

  importBoard(payload: BoardExport): BoardDetailView {
    return importBoardPayload(this.sqlite, payload, {
      addComment: this.addComment.bind(this),
      createBoard: this.createBoard.bind(this),
      createTag: this.createTag.bind(this),
      createTicket: this.createTicket.bind(this),
      getBoardDetail: this.getBoardDetail.bind(this),
    });
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

  private getTicketRowsForBoard(boardId: Id, ticketIds: Id[]): TicketRow[] {
    if (ticketIds.length === 0) {
      return [];
    }
    const uniqueIds = [...new Set(ticketIds)];
    const placeholders = uniqueIds.map(() => "?").join(", ");
    return this.sqlite
      .prepare(
        `SELECT * FROM tickets WHERE board_id = ? AND id IN (${placeholders}) ORDER BY id ASC`,
      )
      .all(boardId, ...uniqueIds) as TicketRow[];
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
    if (typeof filters.resolved === "boolean") {
      sql += " AND t.is_resolved = ?";
      params.push(filters.resolved ? 1 : 0);
    }
    if (filters.archived === true) {
      sql += " AND t.is_archived = 1";
    } else if (filters.archived === false || !filters.includeArchived) {
      sql += " AND t.is_archived = 0";
    }
    if (filters.q) {
      const q = filters.q.trim();
      const priorityMatch = /^(?:p|priority):(-?\d+)$/i.exec(q);
      if (priorityMatch) {
        sql += " AND t.priority = ?";
        params.push(Number(priorityMatch[1]));
      } else {
        const idQuery = q.startsWith("#") ? q.slice(1) : q;
        const likeQuery = `%${q}%`;
        sql += " AND (t.title LIKE ? OR t.body_markdown LIKE ? OR CAST(t.id AS TEXT) LIKE ? OR ('#' || t.id) LIKE ?)";
        params.push(likeQuery, likeQuery, `%${idQuery}%`, likeQuery);
      }
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
    sql += " ORDER BY t.lane_id ASC, t.is_archived ASC, t.position ASC, t.id ASC";

    return this.sqlite.prepare(sql).all(...params) as TicketRow[];
  }

  private listTicketSummariesByIds(boardId: Id, ticketIds: Id[]): TicketSummaryView[] {
    const rows = this.getTicketRowsForBoard(boardId, ticketIds);
    const order = new Map(ticketIds.map((ticketId, index) => [ticketId, index]));
    const tagsByTicket = getTagsForTicketIds(this.sqlite, rows.map((row) => row.id));
    const blockerIdsByTicket = getBlockerIdsForTicketIds(this.sqlite, rows.map((row) => row.id));
    const board = this.getBoard(boardId);
    return rows
      .map((row) =>
        mapTicketSummary(
          row,
          board?.name ?? "",
          tagsByTicket.get(row.id) ?? [],
          blockerIdsByTicket.get(row.id) ?? [],
        ),
      )
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  private addActivity(
    boardId: Id,
    ticketId: Id,
    action: string,
    message: string,
    details: Record<string, unknown> = {},
  ): void {
    addActivity(this.sqlite, { boardId, ticketId, action, message, details, createdAt: this.now() });
  }

}
