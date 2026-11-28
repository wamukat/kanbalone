import { listGroupTicketPage, listTicketPage, listTicketReferencePage, listTicketRelationCandidatePage, type PageOptions, type TicketPageOptions } from "./db-modules/ticket-pagination.js";
import * as groups from "./db-modules/groups.js";
import { setCompletionLanes, type CompletionLaneExpectation } from "./db-modules/lane-completion.js";
import { reorderLaneTickets as reorderLaneTicketRecords } from "./db-modules/ticket-positioning.js";
import { AttachmentStore } from "./attachments.js";
import Database from "better-sqlite3";
import { getTicketChangeSnapshot, hasRemovedActivity, ticketChangeSeries, type ActivityInterval } from "./db-modules/ticket-change-snapshot.js";

import {
  createBoard as createBoardRecord,
  createLane as createLaneRecord,
  createTag as createTagRecord,
  deleteBoard as deleteBoardRecord,
  deleteLane as deleteLaneRecord,
  deleteTag as deleteTagRecord,
  getBoard as getBoardRecord,
  getLane as getLaneRecord,
  getLaneTicketCounts,
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
  type LaneTicketCounts,
  type CreateTagInput,
} from "./db-modules/board.js";
import {
  addComment,
  getActivity,
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
  bulkTransitionTickets as bulkTransitionTicketRecords,
  createTicket as createTicketRecord,
  deleteTicket as deleteTicketRecord,
  moveTicket as moveTicketRecord,
  positionTicket as positionTicketRecord,
  transitionTicket as transitionTicketRecord,
  updateTicket as updateTicketRecord,
  type BulkMoveTicketsInput,
  type BulkArchiveTicketsInput,
  type BulkTransitionTicketsInput,
  type CreateTicketInput,
  type MoveTicketInput,
  type PositionTicketInput,
  type UpdateTicketInput,
} from "./db-modules/ticket-mutations.js";
import { exportBoardImages, importBoardImages } from "./db-modules/attachment-transfer.js";
import { importBoardPayload, toBoardExport, validateBoardTaskStates } from "./db-modules/board-transfer.js";
import { migrate } from "./db-modules/migration.js";
import {
  getTicketExternalReferences,
  type UpsertTicketExternalReferenceInput,
} from "./db-modules/ticket-external-references.js";
import { addActivity } from "./db-modules/ticket-writes.js";
import { historyDetails, readTicketHistory, recordTicketPeerHistory, ticketChanges } from "./db-modules/ticket-history.js";
import {
  getCommentRemoteSync,
  findTicketIdByRemoteIdentity,
  getTicketRemoteLink,
  startCommentRemotePush,
  upsertTicketRemoteLink,
  type RemoteIdentityInput,
  type UpsertCommentRemoteSyncInput,
  type UpsertTicketRemoteLinkInput,
} from "./db-modules/remote-tracking.js";
import {
  createTrackedTicketFromRemote as createTrackedTicketFromRemoteWorkflow,
  deleteTicketExternalReferenceWithActivity,
  refreshTrackedTicketFromRemote as refreshTrackedTicketFromRemoteWorkflow,
  upsertCommentRemoteSyncWithActivity,
  upsertTicketExternalReferenceWithActivity,
} from "./db-modules/remote-workflows.js";
import { type ListTicketsFilters } from "./db-modules/ticket-queries.js";
import { exportTicketTaskStates } from "./db-modules/ticket-tasks.js";
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
  readonly attachments: AttachmentStore;
  readonly visitSeries: string;

  constructor(filename: string) {
    this.sqlite = new Database(filename);
    this.attachments = new AttachmentStore(this.sqlite, filename);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    try {
      this.visitSeries = this.sqlite.transaction(() => {
        migrate(this.sqlite);
        return ticketChangeSeries(this.sqlite);
      }).immediate();
    } catch (error) {
      this.sqlite.close();
      throw error;
    }
  }

  close(): void {
    this.sqlite.close();
    this.attachments.close();
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
      groups: this.listGroups(boardId, { status: "all" }),
    };
  }

  updateBoard(boardId: Id, name: string): BoardView {
    return updateBoardRecord(this.sqlite, boardId, name, this.now());
  }

  deleteBoard(boardId: Id): void {
    this.sqlite.transaction(() => {
      const peers = this.sqlite.prepare(`
        WITH removed(id) AS (SELECT id FROM tickets WHERE board_id = ?)
        SELECT ticket_id AS id FROM ticket_blockers WHERE blocker_ticket_id IN removed AND ticket_id NOT IN removed
        UNION SELECT blocker_ticket_id AS id FROM ticket_blockers WHERE ticket_id IN removed AND blocker_ticket_id NOT IN removed
      `).all(boardId) as { id: Id }[];
      const ids = peers.map(({ id }) => id);
      const before = readTicketHistory(this.sqlite, ids, { relations: true });
      deleteBoardRecord(this.sqlite, boardId);
      recordTicketPeerHistory(this.sqlite, before, readTicketHistory(this.sqlite, ids, { relations: true }), new Set(), this.now());
    }).immediate();
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

  setCompletionLanes(boardId: Id, laneIds: Id[], expected: CompletionLaneExpectation[]): LaneView[] {
    setCompletionLanes(this.sqlite, boardId, laneIds, expected);
    return this.listLanes(boardId);
  }

  updateLane(laneId: Id, input: string | { name?: string; isCompletionLane?: boolean }): LaneView {
    return updateLaneRecord(this.sqlite, laneId, input);
  }

  getLaneTicketCounts(laneId: Id): LaneTicketCounts | null {
    return getLaneTicketCounts(this.sqlite, laneId);
  }

  deleteLane(laneId: Id): Id {
    return deleteLaneRecord(this.sqlite, laneId);
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
    this.sqlite.transaction(() => {
      const assigned = this.sqlite.prepare("SELECT ticket_id FROM ticket_tags WHERE tag_id = ?")
        .all(tagId) as { ticket_id: Id }[];
      const ids = assigned.map(({ ticket_id }) => ticket_id);
      const before = readTicketHistory(this.sqlite, ids, { tags: true });
      deleteTagRecord(this.sqlite, tagId);
      const after = readTicketHistory(this.sqlite, ids, { tags: true });
      for (const [ticketId, state] of before) {
        this.addTicketActivity({
          boardId: state.boardId, ticketId, action: "ticket_tag_removed", message: "Ticket tag removed",
          details: { tagId, ...historyDetails(ticketChanges(state, after.get(ticketId))) },
        });
      }
    }).immediate();
  }

  listGroups(boardId: Id, options: Parameters<typeof groups.listGroups>[2] = {}) { return groups.listGroups(this.sqlite, boardId, options); }
  getGroup(id: Id) { return groups.getGroup(this.sqlite, id); }
  createGroup(input: Parameters<typeof groups.createGroup>[1]) { return groups.createGroup(this.sqlite, input, this.now()); }
  updateGroup(id: Id, input: Parameters<typeof groups.updateGroup>[2]) { return groups.updateGroup(this.sqlite, id, input, this.now()); }
  deleteGroup(id: Id, revision?: number) { return groups.deleteGroup(this.sqlite, id, revision, this.now()); }
  listGroupActivity(boardId: Id, groupId?: Id) { return groups.listGroupActivity(this.sqlite, boardId, groupId); }
  previewGroupMemberships(boardId: Id, input: groups.MembershipInput) { return groups.previewGroupMemberships(this.sqlite, boardId, input); }
  setGroupMemberships(boardId: Id, input: groups.MembershipInput) {
    const result = groups.setGroupMemberships(this.sqlite, boardId, input, this.now());
    return { changedTickets: this.listTicketSummaries(boardId, { includeArchived: true }).filter(t => result.changedTicketIds.includes(t.id)), affectedGroups: result.affectedGroups };
  }
  previewTicketChange(ticketId: Id, input: UpdateTicketInput) {
    return this.sqlite.transaction(() => {
      if (input.appendMarkdown !== undefined) {
        if (typeof input.appendMarkdown !== "string" || !input.appendMarkdown || input.bodyMarkdown !== undefined) throw new Error("appendMarkdown must be non-empty and cannot be combined with bodyMarkdown");
        const ticket = this.getTicket(ticketId);
        if (!ticket) groups.groupError("Ticket not found", "TICKET_NOT_FOUND", 404);
        const { appendMarkdown, ...fields } = input;
        input = { ...fields, bodyMarkdown: ticket.bodyMarkdown + appendMarkdown };
      }
      return groups.planTicketGroupChange(this.sqlite, ticketId, input).preview;
    })();
  }
  previewTicketCreate(input: CreateTicketInput) { return this.sqlite.transaction(() => groups.planTicketGroupChange(this.sqlite, null, input).preview)(); }

  listTicketSummaries(boardId: Id, filters: ListTicketsFilters = {}): TicketSummaryView[] {
    return listTicketSummaryRecords(this.sqlite, boardId, filters);
  }

  listTicketPage(boardId: Id, filters: ListTicketsFilters = {}, options: TicketPageOptions = {}) {
    return listTicketPage(this.sqlite, boardId, filters, options);
  }

  listTicketRelationCandidatePage(boardId: Id, options: { limit: number; cursor?: string }) {
    return listTicketRelationCandidatePage(this.sqlite, boardId, options);
  }

  listTicketReferencePage(boardId: Id, filters: ListTicketsFilters, options: PageOptions) {
    return listTicketReferencePage(this.sqlite, boardId, filters, options);
  }

  listGroupTicketPage(boardId: Id, groupId: Id | null, options: PageOptions) {
    return listGroupTicketPage(this.sqlite, boardId, groupId, options);
  }

  listTickets(boardId: Id, filters: ListTicketsFilters = {}): TicketView[] {
    return listTicketRecords(this.sqlite, boardId, filters);
  }

  getTicket(ticketId: Id): TicketView | null {
    return getTicketRecord(this.sqlite, ticketId);
  }

  getTicketChangeSnapshot(ticketId: Id) {
    return getTicketChangeSnapshot(this.sqlite, ticketId, this.visitSeries);
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
    return createTrackedTicketFromRemoteWorkflow(this.sqlite, input, remote, activity, this.now.bind(this));
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

  reorderLaneTickets(laneId: Id, ticketIds: Id[]) {
    return reorderLaneTicketRecords(this.sqlite, laneId, ticketIds, this.now.bind(this));
  }

  positionTicket(ticketId: Id, input: PositionTicketInput): TicketView {
    return positionTicketRecord(this.sqlite, ticketId, input, this.now.bind(this));
  }

  deleteTicket(ticketId: Id): void {
    deleteTicketRecord(this.sqlite, ticketId, this.now.bind(this));
  }

  addComment(input: CreateCommentInput): CommentView {
    return this.sqlite.transaction(() => addComment(this.sqlite, input, this.now())).immediate();
  }

  listComments(ticketId: Id, options: { limit?: number; order?: "asc" | "desc" } = {}): CommentView[] {
    return listComments(this.sqlite, ticketId, options);
  }

  getComment(commentId: Id): CommentView | null {
    return getComment(this.sqlite, commentId);
  }

  updateComment(input: UpdateCommentInput): CommentView {
    return this.sqlite.transaction(() => updateComment(this.sqlite, input, this.now())).immediate();
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
    return upsertTicketExternalReferenceWithActivity(this.sqlite, input, activity, this.now.bind(this));
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
    return deleteTicketExternalReferenceWithActivity(this.sqlite, ticketId, kind, activity, this.now.bind(this));
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
    return refreshTrackedTicketFromRemoteWorkflow(this.sqlite, ticketId, input, activity, this.now.bind(this));
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
    return upsertCommentRemoteSyncWithActivity(this.sqlite, input, activity, this.now.bind(this));
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
    return this.sqlite.transaction(() => deleteComment(this.sqlite, commentId, this.now())).immediate();
  }

  listActivity(ticketId: Id, compact = false): ActivityLogView[] {
    return listActivity(this.sqlite, ticketId, compact);
  }

  listActivityInterval(ticketId: Id, compact: boolean, interval: ActivityInterval) {
    return this.sqlite.transaction(() => ({
      activity: listActivity(this.sqlite, ticketId, compact, interval),
      series: this.visitSeries,
      historyPossiblyIncomplete: interval.after < interval.through && hasRemovedActivity(this.sqlite, ticketId, interval.after),
    }))();
  }

  getActivity(ticketId: Id, activityId: Id): ActivityLogView | null {
    return getActivity(this.sqlite, ticketId, activityId);
  }

  addTicketEvent(input: CreateTicketEventInput): TicketEventView {
    return addTicketEvent(this.sqlite, input, this.now());
  }

  listTicketEvents(ticketId: Id): TicketEventView[] {
    return listTicketEvents(this.sqlite, ticketId);
  }

  setTicketTagReason(input: SetTicketTagReasonInput): TicketTagReasonView {
    return this.sqlite.transaction(() => setTicketTagReason(this.sqlite, input, this.now())).immediate();
  }

  removeTicketTag(ticketId: Id, tagId: Id): { boardId: Id } {
    return this.sqlite.transaction(() => removeTicketTag(this.sqlite, ticketId, tagId, this.now())).immediate();
  }

  listTicketTagReasons(ticketId: Id): TicketTagReasonView[] {
    return listTicketTagReasons(this.sqlite, ticketId);
  }

  getTicketRelations(ticketId: Id): TicketRelationsView {
    return getTicketRelationRecords(this.sqlite, ticketId);
  }

  transitionTicket(ticketId: Id, laneName: string): TicketView {
    return transitionTicketRecord(this.sqlite, ticketId, laneName, this.now.bind(this));
  }

  bulkTransitionTickets(input: BulkTransitionTicketsInput): TicketSummaryView[] {
    return bulkTransitionTicketRecords(this.sqlite, input, this.now.bind(this));
  }

  bulkArchiveTickets(input: BulkArchiveTicketsInput): TicketSummaryView[] {
    return bulkArchiveTicketRecords(this.sqlite, input, this.now.bind(this));
  }

  exportBoard(boardId: Id): BoardExport {
    const payload = this.sqlite.transaction(() => toBoardExport(this.getBoardDetail(boardId), exportTicketTaskStates(this.sqlite, boardId)))();
    return exportBoardImages(payload, this.attachments);
  }

  importBoard(payload: BoardExport): BoardDetailView {
    validateBoardTaskStates(payload);
    return importBoardImages(payload, this.attachments, () => importBoardPayload(this.sqlite, payload, {
      addComment: this.addComment.bind(this),
      createBoard: this.createBoard.bind(this),
      createTag: this.createTag.bind(this),
      createTicket: this.createTicket.bind(this),
      getBoardDetail: this.getBoardDetail.bind(this),
    }));
  }

}
