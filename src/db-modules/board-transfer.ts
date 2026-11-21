import { createGroup, groupError } from "./groups.js";
import type Database from "better-sqlite3";
import { createMigratedCompletionLane } from "./lane-completion.js";

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
    formatVersion: 2,
    groups: (detail.groups ?? []).map(({ id, name, descriptionMarkdown, createdAt, updatedAt }) => ({ id, name, descriptionMarkdown, createdAt, updatedAt })),
    board: detail.board,
    lanes: detail.lanes,
    tags: detail.tags,
    tickets: detail.tickets.map(({
      group: _group,
      editToken: _editToken,
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
    })),
  };
}

export function importBoardPayload(
  sqlite: Database.Database,
  payload: BoardExport,
  ops: ImportBoardOps,
): BoardDetailView {
  const tx = sqlite.transaction(() => {
    const positiveId = (id: unknown) => typeof id === "number" && Number.isSafeInteger(id) && id > 0;
    const importedTickets = new Map(payload.tickets.map(t=>[t.id,t]));
    if (importedTickets.size !== payload.tickets.length || payload.tickets.some(t=>!positiveId(t.id))) groupError("Invalid or duplicate ticket IDs", "INVALID_EXPORT_FORMAT", 400);
    for (const ticket of payload.tickets) {
      if (ticket.parentTicketId == null) continue;
      const parent = importedTickets.get(ticket.parentTicketId);
      if (!positiveId(ticket.parentTicketId) || !parent || parent.id === ticket.id || parent.parentTicketId != null) groupError("Invalid parent/child relationships in export", "INVALID_EXPORT_FORMAT", 400);
    }
    const version = payload.formatVersion;
    if (version !== undefined && version !== 2) groupError("Unsupported board export format", "INVALID_EXPORT_FORMAT", 400);
    if (version === undefined && (Object.hasOwn(payload, "groups") || payload.tickets.some(t => Object.hasOwn(t, "groupId")))) groupError("Group fields require formatVersion 2", "INVALID_EXPORT_FORMAT", 400);
    if (version === 2) {
      if (!Array.isArray(payload.groups) || payload.tickets.some(t => !Object.hasOwn(t, "groupId"))) groupError("Group data missing from version 2 export", "INVALID_EXPORT_FORMAT", 400);
      const validId = (id: unknown) => typeof id === "number" && Number.isSafeInteger(id) && id > 0;
      const validDate = (date: unknown) => typeof date === "string" && Number.isFinite(Date.parse(date));
      if (payload.groups!.some(g=>!validId(g.id) || typeof g.name!=="string" || typeof g.descriptionMarkdown!=="string" || !validDate(g.createdAt) || !validDate(g.updatedAt))) groupError("Invalid Group definition", "INVALID_EXPORT_FORMAT", 400);
      if (payload.tickets.some(t=>!validId(t.id) || (t.groupId!==null && !validId(t.groupId)))) groupError("Invalid Group membership", "INVALID_EXPORT_FORMAT", 400);
      const groupIds = new Set(payload.groups!.map(g=>g.id));
      const ticketIds = new Set(payload.tickets.map(t=>t.id));
      if (groupIds.size !== payload.groups!.length || ticketIds.size !== payload.tickets.length) groupError("Duplicate IDs in export", "INVALID_EXPORT_FORMAT", 400);
      for (const ticket of payload.tickets) {
        if (ticket.groupId != null && !groupIds.has(ticket.groupId)) groupError("Unknown Group reference", "INVALID_EXPORT_FORMAT", 400);
        if (ticket.parentTicketId != null) {
          const parent = payload.tickets.find(t=>t.id===ticket.parentTicketId);
          if (!parent || parent.id===ticket.id || parent.parentTicketId!=null || parent.groupId!==ticket.groupId) groupError("Invalid parent/child Group data", "INVALID_EXPORT_FORMAT", 400);
        }
      }
    }
    const created = ops.createBoard({
      name: payload.board.name,
      laneNames: payload.lanes.map((lane) => lane.name),
    });
    const groupById = new Map<number,number>();
    for (const group of payload.groups ?? []) {
      const imported = createGroup(sqlite, { boardId: created.board.id, name: group.name, descriptionMarkdown: group.descriptionMarkdown }, new Date().toISOString());
      groupById.set(group.id, imported.id);
      sqlite.prepare("UPDATE groups SET created_at=?,updated_at=? WHERE id=?").run(new Date(group.createdAt).toISOString(), new Date(group.updatedAt).toISOString(), imported.id);
    }
    const laneById = new Map(payload.lanes.map((lane, index) => [lane.id, created.lanes[index].id]));
    if (laneById.size !== payload.lanes.length) throw new Error("Duplicate lane IDs in import payload");
    for (const lane of payload.lanes) {
      if (lane.isCompletionLane !== undefined && typeof lane.isCompletionLane !== "boolean") {
        throw new Error("Invalid lane completion attribute");
      }
      const completion = lane.isCompletionLane ?? false;
      sqlite.prepare("UPDATE lanes SET is_completion_lane = ? WHERE id = ?")
        .run(Number(completion), laneById.get(lane.id)!);
    }
    let migratedLaneId: number | undefined;
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
      if (typeof ticket.isResolved === "boolean" && typeof ticket.isCompleted === "boolean" && ticket.isResolved !== ticket.isCompleted) {
        throw new Error("isResolved and isCompleted must agree");
      }
      const sourceLane = payload.lanes.find((lane) => lane.id === ticket.laneId)!;
      const legacyResolved = sourceLane.isCompletionLane === undefined && (ticket.isResolved ?? ticket.isCompleted);
      if (legacyResolved && migratedLaneId === undefined) migratedLaneId = createMigratedCompletionLane(sqlite, created.board.id);
      const createdTicket = ops.createTicket({
        boardId: created.board.id,
        laneId: legacyResolved ? migratedLaneId! : laneById.get(ticket.laneId)!,
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
      if (ticket.groupId != null) sqlite.prepare("UPDATE tickets SET group_id=? WHERE id=?").run(groupById.get(ticket.groupId), createdTicket.id);
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
