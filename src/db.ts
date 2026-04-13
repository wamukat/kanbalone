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
  bulkArchiveTickets as bulkArchiveTicketRecords,
  bulkResolveTickets as bulkResolveTicketRecords,
  bulkTransitionTickets as bulkTransitionTicketRecords,
  createTicket as createTicketRecord,
  deleteTicket as deleteTicketRecord,
  reorderTickets as reorderTicketRecords,
  transitionTicket as transitionTicketRecord,
  updateTicket as updateTicketRecord,
  type BulkArchiveTicketsInput,
  type BulkResolveTicketsInput,
  type BulkTransitionTicketsInput,
  type CreateTicketInput,
  type ReorderTicketInput,
  type UpdateTicketInput,
} from "./db-ticket-mutations.js";
import { importBoardPayload, toBoardExport } from "./db-board-transfer.js";
import { migrate } from "./db-migration.js";
import { type ListTicketsFilters } from "./db-ticket-queries.js";
import {
  getTicket as getTicketRecord,
  getTicketRelations as getTicketRelationRecords,
  listTickets as listTicketRecords,
  listTicketSummaries as listTicketSummaryRecords,
} from "./db-ticket-read-model.js";
import {
  type ActivityLogView,
  type BoardDetailView,
  type BoardShellView,
  type BoardExport,
  type BoardView,
  type CommentView,
  type Id,
  type TagView,
  type LaneView,
  type TicketRelationsView,
  type TicketSummaryView,
  type TicketView,
} from "./types.js";

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
    return createTicketRecord(this.sqlite, input, this.now.bind(this));
  }

  updateTicket(ticketId: Id, input: UpdateTicketInput): TicketView {
    return updateTicketRecord(this.sqlite, ticketId, input, this.now.bind(this));
  }

  deleteTicket(ticketId: Id): void {
    deleteTicketRecord(this.sqlite, ticketId, this.now.bind(this));
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
    return transitionTicketRecord(this.sqlite, ticketId, laneName, isResolved, this.now.bind(this));
  }

  reorderTickets(boardId: Id, items: ReorderTicketInput[]): TicketView[] {
    return reorderTicketRecords(this.sqlite, boardId, items, this.now.bind(this));
  }

  bulkResolveTickets(input: BulkResolveTicketsInput): TicketSummaryView[] {
    return bulkResolveTicketRecords(this.sqlite, input, this.now.bind(this));
  }

  bulkTransitionTickets(input: BulkTransitionTicketsInput): TicketSummaryView[] {
    return bulkTransitionTicketRecords(this.sqlite, input, this.now.bind(this));
  }

  bulkArchiveTickets(input: BulkArchiveTicketsInput): TicketSummaryView[] {
    return bulkArchiveTicketRecords(this.sqlite, input, this.now.bind(this));
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

}
