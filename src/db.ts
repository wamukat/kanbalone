import Database from "better-sqlite3";

import {
  createBoard as createBoardRecord,
  createLane as createLaneRecord,
  createTag as createTagRecord,
  deleteBoard as deleteBoardRecord,
  deleteLane as deleteLaneRecord,
  deleteTag as deleteTagRecord,
  getBoard as getBoardRecord,
  getLane as getLaneRecord,
  getTag as getTagRecord,
  listBoards as listBoardRecords,
  listLanes as listLaneRecords,
  listTags as listTagRecords,
  reorderBoards as reorderBoardRecords,
  reorderLanes as reorderLaneRecords,
  updateBoard as updateBoardRecord,
  updateLane as updateLaneRecord,
  updateTag as updateTagRecord,
  type CreateBoardInput,
  type CreateLaneInput,
  type CreateTagInput,
} from "./db-board.js";
import {
  addComment,
  deleteComment,
  listActivity,
  listComments,
  updateComment,
  type CreateCommentInput,
  type UpdateCommentInput,
} from "./db-comments.js";
import {
  sanitizePriority,
} from "./db-mappers.js";
import { importBoardPayload, toBoardExport } from "./db-board-transfer.js";
import {
  nextTicketPosition,
  normalizeVisibleAndArchivedTicketPositions,
} from "./db-ordering.js";
import { migrate } from "./db-migration.js";
import {
  getTicketRowsForBoard,
  type ListTicketsFilters,
} from "./db-ticket-queries.js";
import {
  getTicket as getTicketRecord,
  getTicketRelations as getTicketRelationRecords,
  listTickets as listTicketRecords,
  listTicketSummaries as listTicketSummaryRecords,
  listTicketSummariesByIds,
} from "./db-ticket-read-model.js";
import {
  addActivity,
  replaceTicketBlockers,
  replaceTicketTags,
  validateParentTicket,
} from "./db-ticket-writes.js";
import {
  type ActivityLogView,
  type BoardDetailView,
  type BoardShellView,
  type BoardExport,
  type BoardView,
  type CommentView,
  type Id,
  type TagView,
  type LaneRow,
  type LaneView,
  type TicketRelationsView,
  type TicketSummaryView,
  type TicketView,
} from "./types.js";

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
    return listBoardRecords(this.sqlite);
  }

  createBoard(input: CreateBoardInput): BoardDetailView {
    return this.getBoardDetail(createBoardRecord(this.sqlite, input, this.now()));
  }

  getBoard(boardId: Id): BoardView | null {
    return getBoardRecord(this.sqlite, boardId);
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
    return updateBoardRecord(this.sqlite, boardId, name, this.now());
  }

  deleteBoard(boardId: Id): void {
    deleteBoardRecord(this.sqlite, boardId);
  }

  listLanes(boardId: Id): LaneView[] {
    return listLaneRecords(this.sqlite, boardId);
  }

  createLane(input: CreateLaneInput): LaneView {
    return createLaneRecord(this.sqlite, input);
  }

  getLane(laneId: Id): LaneView | null {
    return getLaneRecord(this.sqlite, laneId);
  }

  updateLane(laneId: Id, name: string): LaneView {
    return updateLaneRecord(this.sqlite, laneId, name);
  }

  deleteLane(laneId: Id): void {
    deleteLaneRecord(this.sqlite, laneId);
  }

  reorderLanes(boardId: Id, laneIds: Id[]): LaneView[] {
    return reorderLaneRecords(this.sqlite, boardId, laneIds);
  }

  reorderBoards(boardIds: Id[]): BoardView[] {
    return reorderBoardRecords(this.sqlite, boardIds);
  }

  listTags(boardId: Id): TagView[] {
    return listTagRecords(this.sqlite, boardId);
  }

  createTag(input: CreateTagInput): TagView {
    return createTagRecord(this.sqlite, input);
  }

  getTag(tagId: Id): TagView | null {
    return getTagRecord(this.sqlite, tagId);
  }

  updateTag(tagId: Id, input: { name?: string; color?: string }): TagView {
    return updateTagRecord(this.sqlite, tagId, input);
  }

  deleteTag(tagId: Id): void {
    deleteTagRecord(this.sqlite, tagId);
  }

  listTicketSummaries(boardId: Id, filters: ListTicketsFilters = {}): TicketSummaryView[] {
    return listTicketSummaryRecords(this.sqlite, boardId, filters);
  }

  listTickets(boardId: Id, filters: ListTicketsFilters = {}): TicketView[] {
    return listTicketRecords(this.sqlite, boardId, filters);
  }

  getTicket(ticketId: Id): TicketView | null {
    return getTicketRecord(this.sqlite, ticketId);
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
    return addComment(this.sqlite, input, this.now());
  }

  listComments(ticketId: Id): CommentView[] {
    return listComments(this.sqlite, ticketId);
  }

  updateComment(input: UpdateCommentInput): CommentView {
    return updateComment(this.sqlite, input, this.now());
  }

  deleteComment(commentId: Id): { ticketId: Id; boardId: Id } {
    return deleteComment(this.sqlite, commentId, this.now());
  }

  listActivity(ticketId: Id): ActivityLogView[] {
    return listActivity(this.sqlite, ticketId);
  }

  getTicketRelations(ticketId: Id): TicketRelationsView {
    return getTicketRelationRecords(this.sqlite, ticketId);
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
    const currentRows = getTicketRowsForBoard(this.sqlite, boardId, items.map((item) => item.ticketId));
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
    const rows = getTicketRowsForBoard(this.sqlite, input.boardId, input.ticketIds);
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
    return listTicketSummariesByIds(this.sqlite, input.boardId, input.ticketIds);
  }

  bulkTransitionTickets(input: BulkTransitionTicketsInput): TicketSummaryView[] {
    const rows = getTicketRowsForBoard(this.sqlite, input.boardId, input.ticketIds);
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
    return listTicketSummariesByIds(this.sqlite, input.boardId, input.ticketIds);
  }

  bulkArchiveTickets(input: BulkArchiveTicketsInput): TicketSummaryView[] {
    const rows = getTicketRowsForBoard(this.sqlite, input.boardId, input.ticketIds);
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
    return listTicketSummariesByIds(this.sqlite, input.boardId, input.ticketIds);
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
