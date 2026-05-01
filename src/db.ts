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
} from "./db-modules/board.js";
import {
  addComment,
  getComment,
  deleteComment,
  listActivity,
  listComments,
  updateComment,
  type CreateCommentInput,
  type UpdateCommentInput,
} from "./db-modules/comments.js";
import {
  addTicketEvent,
  listTicketEvents,
  type CreateTicketEventInput,
} from "./db-modules/ticket-events.js";
import {
  listTicketTagReasons,
  removeTicketTag,
  setTicketTagReason,
  type SetTicketTagReasonInput,
} from "./db-modules/ticket-tag-reasons.js";
import {
  bulkMoveTickets as bulkMoveTicketRecords,
  bulkArchiveTickets as bulkArchiveTicketRecords,
  bulkResolveTickets as bulkResolveTicketRecords,
  bulkTransitionTickets as bulkTransitionTicketRecords,
  createTicket as createTicketRecord,
  deleteTicket as deleteTicketRecord,
  moveTicket as moveTicketRecord,
  positionTicket as positionTicketRecord,
  reorderTickets as reorderTicketRecords,
  transitionTicket as transitionTicketRecord,
  updateTicket as updateTicketRecord,
  type BulkMoveTicketsInput,
  type BulkArchiveTicketsInput,
  type BulkResolveTicketsInput,
  type BulkTransitionTicketsInput,
  type CreateTicketInput,
  type MoveTicketInput,
  type PositionTicketInput,
  type ReorderTicketInput,
  type UpdateTicketInput,
} from "./db-modules/ticket-mutations.js";
import { importBoardPayload, toBoardExport } from "./db-modules/board-transfer.js";
import { migrate } from "./db-modules/migration.js";
import {
  deleteTicketExternalReference,
  getTicketExternalReferences,
  upsertTicketExternalReference,
  type UpsertTicketExternalReferenceInput,
} from "./db-modules/ticket-external-references.js";
import { addActivity } from "./db-modules/ticket-writes.js";
import {
  getCommentRemoteSync,
  findTicketIdByRemoteIdentity,
  getTicketRemoteLink,
  startCommentRemotePush,
  upsertCommentRemoteSync,
  upsertTicketRemoteLink,
  type RemoteIdentityInput,
  type UpsertCommentRemoteSyncInput,
  type UpsertTicketRemoteLinkInput,
} from "./db-modules/remote-tracking.js";
import { type ListTicketsFilters } from "./db-modules/ticket-queries.js";
import {
  getTicket as getTicketRecord,
  getTicketRelations as getTicketRelationRecords,
  listTickets as listTicketRecords,
  listTicketSummaries as listTicketSummaryRecords,
} from "./db-modules/ticket-read-model.js";
import {
  type ActivityLogView,
  type BoardDetailView,
  type BoardShellView,
  type BoardExport,
  type BoardView,
  type CommentView,
  type CommentRemoteSyncView,
  type Id,
  type TagView,
  type LaneView,
  type TicketExternalReferenceView,
  type TicketRemoteLinkView,
  type TicketRelationsView,
  type TicketEventView,
  type TicketTagReasonView,
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

  createTrackedTicketFromRemote(
    input: CreateTicketInput,
    remote: Omit<UpsertTicketRemoteLinkInput, "ticketId">,
    activity?: {
      action: string;
      message: string;
      details?: Record<string, unknown>;
    },
  ): TicketView {
    const tx = this.sqlite.transaction(() => {
      const ticket = createTicketRecord(this.sqlite, input, this.now.bind(this));
      upsertTicketRemoteLink(this.sqlite, {
        ...remote,
        ticketId: ticket.id,
      }, this.now());
      if (activity) {
        addActivity(this.sqlite, {
          boardId: ticket.boardId,
          ticketId: ticket.id,
          ...activity,
          createdAt: this.now(),
        });
      }
      return ticket.id;
    });
    return this.getTicket(tx())!;
  }

  updateTicket(ticketId: Id, input: UpdateTicketInput): TicketView {
    return updateTicketRecord(this.sqlite, ticketId, input, this.now.bind(this));
  }

  moveTicket(ticketId: Id, input: MoveTicketInput): TicketView {
    return moveTicketRecord(this.sqlite, ticketId, input, this.now.bind(this));
  }

  bulkMoveTickets(input: BulkMoveTicketsInput): TicketSummaryView[] {
    return bulkMoveTicketRecords(this.sqlite, input, this.now.bind(this));
  }

  positionTicket(ticketId: Id, input: PositionTicketInput): TicketView {
    return positionTicketRecord(this.sqlite, ticketId, input, this.now.bind(this));
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

  getComment(commentId: Id): CommentView | null {
    return getComment(this.sqlite, commentId);
  }

  updateComment(input: UpdateCommentInput): CommentView {
    return updateComment(this.sqlite, input, this.now());
  }

  getTicketRemoteLink(ticketId: Id): TicketRemoteLinkView | null {
    return getTicketRemoteLink(this.sqlite, ticketId);
  }

  upsertTicketRemoteLink(input: UpsertTicketRemoteLinkInput): TicketRemoteLinkView {
    return upsertTicketRemoteLink(this.sqlite, input, this.now());
  }

  findTicketIdByRemoteIdentity(input: RemoteIdentityInput): Id | null {
    return findTicketIdByRemoteIdentity(this.sqlite, input);
  }

  listTicketExternalReferences(ticketId: Id): TicketExternalReferenceView[] {
    return getTicketExternalReferences(this.sqlite, ticketId);
  }

  upsertTicketExternalReference(
    input: UpsertTicketExternalReferenceInput,
    activity?: {
      boardId: Id;
      ticketId: Id;
      action: string;
      message: string;
      details?: Record<string, unknown>;
    },
  ): TicketView {
    const tx = this.sqlite.transaction(() => {
      upsertTicketExternalReference(this.sqlite, input, this.now());
      if (activity) {
        addActivity(this.sqlite, {
          ...activity,
          createdAt: this.now(),
        });
      }
      return input.ticketId;
    });
    return this.getTicket(tx())!;
  }

  deleteTicketExternalReference(
    ticketId: Id,
    kind: string,
    activity?: {
      boardId: Id;
      action: string;
      message: string;
      details?: Record<string, unknown>;
    },
  ): TicketView {
    const tx = this.sqlite.transaction(() => {
      const ticket = this.getTicket(ticketId);
      if (!ticket) {
        throw new Error("Ticket not found");
      }
      const deleted = deleteTicketExternalReference(this.sqlite, ticketId, kind);
      if (deleted && activity) {
        addActivity(this.sqlite, {
          boardId: activity.boardId,
          ticketId,
          action: activity.action,
          message: activity.message,
          details: activity.details,
          createdAt: this.now(),
        });
      }
      return ticketId;
    });
    return this.getTicket(tx())!;
  }

  refreshTrackedTicketFromRemote(
    ticketId: Id,
    input: UpsertTicketRemoteLinkInput,
    activity?: {
      boardId: Id;
      action: string;
      message: string;
      details?: Record<string, unknown>;
    },
  ): TicketView {
    const tx = this.sqlite.transaction(() => {
      const ticket = this.getTicket(ticketId);
      if (!ticket) {
        throw new Error("Ticket not found");
      }
      this.sqlite.prepare("UPDATE tickets SET title = ?, updated_at = ? WHERE id = ?").run(input.title, this.now(), ticketId);
      upsertTicketRemoteLink(this.sqlite, input, this.now());
      if (activity) {
        addActivity(this.sqlite, {
          boardId: activity.boardId,
          ticketId,
          action: activity.action,
          message: activity.message,
          details: activity.details,
          createdAt: this.now(),
        });
      }
      return ticketId;
    });
    return this.getTicket(tx())!;
  }

  getCommentRemoteSync(commentId: Id): CommentRemoteSyncView | null {
    return getCommentRemoteSync(this.sqlite, commentId);
  }

  upsertCommentRemoteSync(
    input: UpsertCommentRemoteSyncInput,
    activity?: {
      boardId: Id;
      ticketId: Id;
      action: string;
      message: string;
      details?: Record<string, unknown>;
    },
  ): CommentRemoteSyncView {
    if (!activity) {
      return upsertCommentRemoteSync(this.sqlite, input, this.now());
    }
    const tx = this.sqlite.transaction(() => {
      const sync = upsertCommentRemoteSync(this.sqlite, input, this.now());
      addActivity(this.sqlite, {
        ...activity,
        createdAt: this.now(),
      });
      return sync;
    });
    return tx();
  }

  startCommentRemotePush(commentId: Id): { sync: CommentRemoteSyncView; started: boolean } {
    return startCommentRemotePush(this.sqlite, commentId, this.now());
  }

  addTicketActivity(input: {
    boardId: Id;
    ticketId: Id;
    action: string;
    message: string;
    details?: Record<string, unknown>;
  }): void {
    addActivity(this.sqlite, {
      ...input,
      createdAt: this.now(),
    });
  }

  deleteComment(commentId: Id): { ticketId: Id; boardId: Id } {
    return deleteComment(this.sqlite, commentId, this.now());
  }

  listActivity(ticketId: Id): ActivityLogView[] {
    return listActivity(this.sqlite, ticketId);
  }

  addTicketEvent(input: CreateTicketEventInput): TicketEventView {
    return addTicketEvent(this.sqlite, input, this.now());
  }

  listTicketEvents(ticketId: Id): TicketEventView[] {
    return listTicketEvents(this.sqlite, ticketId);
  }

  setTicketTagReason(input: SetTicketTagReasonInput): TicketTagReasonView {
    return setTicketTagReason(this.sqlite, input, this.now());
  }

  removeTicketTag(ticketId: Id, tagId: Id): { boardId: Id } {
    return removeTicketTag(this.sqlite, ticketId, tagId, this.now());
  }

  listTicketTagReasons(ticketId: Id): TicketTagReasonView[] {
    return listTicketTagReasons(this.sqlite, ticketId);
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
