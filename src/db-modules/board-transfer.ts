import type Database from "better-sqlite3";

import { replaceTicketBlockers, replaceTicketRelatedLinks } from "./ticket-writes.js";
import type {
  BoardDetailView,
  BoardExport,
  CommentView,
  Id,
  TagView,
  TicketView,
} from "../types.js";

type ImportBoardOps = {
  addComment(input: { ticketId: Id; bodyMarkdown: string }): CommentView;
  createBoard(input: { name: string; laneNames?: string[] }): BoardDetailView;
  createTag(input: { boardId: Id; name: string; color?: string }): TagView;
  createTicket(input: {
    boardId: Id;
    laneId: Id;
    title: string;
    bodyMarkdown?: string;
    isResolved?: boolean;
    isArchived?: boolean;
    priority?: number;
    tagIds?: Id[];
  }): TicketView;
  getBoardDetail(boardId: Id): BoardDetailView;
};

export function toBoardExport(detail: BoardDetailView): BoardExport {
  return {
    board: detail.board,
    lanes: detail.lanes,
    tags: detail.tags,
    tickets: detail.tickets.map(({
      bodyHtml: _bodyHtml,
      blockers: _blockers,
      blockedBy: _blockedBy,
      related: _related,
      parent: _parent,
      children: _children,
      ref: _ref,
      shortRef: _shortRef,
      remote: _remote,
      externalReferences: _externalReferences,
      ...ticket
    }) => ({
      ...ticket,
      comments: ticket.comments.map(({ sync: _sync, ...comment }) => comment),
      isCompleted: ticket.isResolved,
    })),
  };
}

export function importBoardPayload(
  sqlite: Database.Database,
  payload: BoardExport,
  ops: ImportBoardOps,
): BoardDetailView {
  const tx = sqlite.transaction(() => {
    const created = ops.createBoard({
      name: payload.board.name,
      laneNames: payload.lanes.map((lane) => lane.name),
    });
    const laneByName = new Map(created.lanes.map((lane) => [lane.name, lane.id]));
    const tagByName = new Map<string, Id>();
    const createdTicketIds = new Map<Id, Id>();
    payload.tags.forEach((tag) => {
      const createdTag = ops.createTag({
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
      const createdTicket = ops.createTicket({
        boardId: created.board.id,
        laneId: laneByName.get(laneName)!,
        title: ticket.title,
        bodyMarkdown: ticket.bodyMarkdown,
        isResolved: ticket.isResolved ?? ticket.isCompleted,
        isArchived: ticket.isArchived,
        priority: ticket.priority,
        tagIds: ticket.tags
          .map((tag) => tagByName.get(tag.name))
          .filter((value): value is number => typeof value === "number"),
      });
      createdTicketIds.set(ticket.id, createdTicket.id);
      ticket.comments.forEach((comment) => {
        ops.addComment({
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
      sqlite
        .prepare("UPDATE tickets SET parent_ticket_id = ? WHERE id = ?")
        .run(ticket.parentTicketId == null ? null : createdTicketIds.get(ticket.parentTicketId) ?? null, ticketId);
      replaceTicketBlockers(
        sqlite,
        ticketId,
        (ticket.blockerIds ?? []).map((blockerId) => createdTicketIds.get(blockerId)).filter((value): value is number => typeof value === "number"),
        created.board.id,
      );
      replaceTicketRelatedLinks(
        sqlite,
        ticketId,
        (ticket.relatedIds ?? []).map((relatedId) => createdTicketIds.get(relatedId)).filter((value): value is number => typeof value === "number"),
        created.board.id,
      );
    });

    return created.board.id;
  });
  return ops.getBoardDetail(tx());
}
