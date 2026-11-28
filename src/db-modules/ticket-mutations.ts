import { planTicketGroupChange, applyTicketGroupPlan, clearGroupForBoardMove, type GroupEditFields } from "./groups.js";
import type Database from "better-sqlite3";
import { laneCompletion } from "./lane-completion.js";

import { sanitizePriority } from "./mappers.js";
import {
  nextTicketPosition,
  normalizeVisibleAndArchivedTicketPositions,
} from "./ordering.js";
import {
  getTicket,
} from "./ticket-read-model.js";
import {
  replaceTicketBlockers,
  replaceTicketRelatedLinks,
  replaceTicketTags,
  resolveTicketTagNames,
  validateParentTicket,
} from "./ticket-writes.js";
import { getTicketRemoteLink } from "./remote-tracking.js";
import { recordTicketContentActivity } from "./ticket-content-activity.js";
import {
  historyDetails,
  readTicketHistory,
  recordTicketPeerHistory,
  ticketChanges,
  ticketHistoryPeerIds,
} from "./ticket-history.js";
import {
  addBoardMoveActivity,
  addTicketActivity,
  cleanupTicketForBoardMove,
  getBoardName,
  getMoveDestination,
  touchBoard,
  type Now,
} from "./ticket-mutation-shared.js";
export {
  bulkArchiveTickets,
  bulkMoveTickets,
  bulkTransitionTickets,
} from "./ticket-bulk-mutations.js";
export {
  positionTicket,
} from "./ticket-positioning.js";
import type {
  Id,
  LaneRow,
  TicketView,
} from "../types.js";

export type CreateTicketInput = GroupEditFields & {
  boardId: Id;
  laneId: Id;
  title: string;
  bodyMarkdown?: string;
  isResolved?: boolean;
  isArchived?: boolean;
  priority?: number;
  parentTicketId?: Id | null;
  tagIds?: Id[];
  newTagNames?: string[];
  blockerIds?: Id[];
  relatedIds?: Id[];
};

export type UpdateTicketInput = Partial<CreateTicketInput> & {
  appendMarkdown?: string;
  title?: string;
};

export type MoveTicketInput = {
  boardId: Id;
  laneId: Id;
};

export type BulkMoveTicketsInput = MoveTicketInput & {
  sourceBoardId: Id;
  ticketIds: Id[];
};

export type PositionTicketInput = {
  laneId: Id;
  position?: number;
  beforeTicketId?: Id | null;
  afterTicketId?: Id | null;
  expectedSourceLaneId?: Id;
  expectedSourcePosition?: number;
  expectedAnchorOrder?: "after-before" | "before-after";
};

export type BulkTransitionTicketsInput = {
  boardId: Id;
  ticketIds: Id[];
  laneName: string;
};

export type BulkArchiveTicketsInput = {
  boardId: Id;
  ticketIds: Id[];
  isArchived: boolean;
};

function affectedEditTickets(
  input: CreateTicketInput | UpdateTicketInput,
  plan: ReturnType<typeof planTicketGroupChange>,
  current?: TicketView,
): Id[] {
  const ids = new Set<Id>(current ? [current.id] : []);
  for (const change of plan.preview.parentChanges) {
    for (const id of [change.ticketId, change.fromParentTicketId, change.toParentTicketId]) {
      if (id != null && id > 0) ids.add(id);
    }
  }
  for (const id of changedIds(current?.blockers.map(({ id }) => id) ?? [], input.blockerIds?.filter(id => id !== current?.id))) ids.add(id);
  for (const id of changedIds(current?.related.map(({ id }) => id) ?? [], input.relatedIds?.filter(id => id !== current?.id))) ids.add(id);
  if (current && input.boardId != null && input.boardId !== current.boardId) {
    if (current.parentTicketId != null) ids.add(current.parentTicketId);
    for (const relation of [...current.children, ...current.blockers, ...current.blockedBy, ...current.related]) ids.add(relation.id);
  }
  return [...ids];
}

function changedIds(before: Id[], after: Id[] | undefined): Id[] {
  if (after === undefined) return [];
  const previous = new Set(before);
  const next = new Set(after);
  return [...before.filter(id => !next.has(id)), ...[...next].filter(id => !previous.has(id))];
}

export function createTicket(
  sqlite: Database.Database,
  input: CreateTicketInput,
  now: Now,
): TicketView {
  const createdAt = now();
  const tx = sqlite.transaction(() => {
    const groupPlan = planTicketGroupChange(sqlite, null, input, true);
    const knownPeers = affectedEditTickets(input, groupPlan);
    const peerBefore = readTicketHistory(sqlite, knownPeers, { relations: true });
    const position = nextTicketPosition(sqlite, input.laneId);
    const result = sqlite
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
        validateParentTicket(sqlite, null, input.parentTicketId, input.boardId),
        input.title,
        input.bodyMarkdown ?? "",
        Number(laneCompletion(sqlite, input.laneId, input.isResolved, input.boardId)),
        input.isArchived ? 1 : 0,
        sanitizePriority(input.priority),
        position,
        createdAt,
        createdAt,
      );
    const ticketId = Number(result.lastInsertRowid);
    recordTicketContentActivity(sqlite, ticketId, createdAt);
    applyTicketGroupPlan(sqlite, groupPlan, ticketId, now());
    const newTagIds = resolveTicketTagNames(sqlite, input.boardId, input.newTagNames);
    replaceTicketTags(sqlite, ticketId, [...(input.tagIds ?? []), ...newTagIds]);
    replaceTicketBlockers(sqlite, ticketId, input.blockerIds ?? [], input.boardId);
    replaceTicketRelatedLinks(sqlite, ticketId, input.relatedIds ?? [], input.boardId);
    const after = readTicketHistory(sqlite, [ticketId, ...knownPeers], { tags: true, relations: true });
    const empty = { boardId: input.boardId, values: { lane: null, tags: [], parent: null, blockers: [], related: [] } };
    addTicketActivity(sqlite, now, input.boardId, ticketId, "ticket_created", "Ticket created", {
      title: input.title, ...historyDetails(ticketChanges(empty, after.get(ticketId))),
    });
    recordTicketPeerHistory(sqlite, peerBefore, after, new Set(), createdAt);
    touchBoard(sqlite, input.boardId, now());
    return ticketId;
  });
  return getTicket(sqlite, tx.immediate())!;
}

export function updateTicket(
  sqlite: Database.Database,
  ticketId: Id,
  input: UpdateTicketInput,
  now: Now,
): TicketView {
  if (input.appendMarkdown !== undefined) {
    if (typeof input.appendMarkdown !== "string" || input.appendMarkdown.length === 0 || input.bodyMarkdown !== undefined) {
      throw new Error("appendMarkdown must be non-empty and cannot be combined with bodyMarkdown");
    }
    const { appendMarkdown, ...fields } = input;
    return sqlite.transaction(() => {
      const latest = getTicket(sqlite, ticketId);
      if (!latest) throw new Error("Ticket not found");
      const bodyMarkdown = latest.bodyMarkdown + appendMarkdown;
      if (Buffer.byteLength(bodyMarkdown, "utf8") > 64 * 1024 * 1024) {
        throw new Error("Resulting body exceeds 64 MiB");
      }
      return updateTicket(sqlite, ticketId, { ...fields, bodyMarkdown }, now);
    }).immediate();
  }
  const tx = sqlite.transaction(() => {
    const current = getTicket(sqlite, ticketId);
    if (!current) {
      throw new Error("Ticket not found");
    }
    const remoteLink = getTicketRemoteLink(sqlite, ticketId);
    if (remoteLink && typeof input.title === "string" && input.title !== current.title) {
      throw new Error("Remote tracked ticket title is read-only");
    }
    const nextLaneId = input.laneId ?? current.laneId;
    const nextBoardId = input.boardId ?? current.boardId;
    const groupPlan = planTicketGroupChange(sqlite, ticketId, input, true);
    const boardChanged = nextBoardId !== current.boardId;
    const affectedIds = affectedEditTickets(input, groupPlan, current);
    const historyOptions = {
      tags: boardChanged || changedIds(current.tags.map(({ id }) => id), input.tagIds).length > 0
        || Boolean(input.newTagNames?.length),
      relations: boardChanged || affectedIds.length > 1,
    };
    const before = readTicketHistory(sqlite, affectedIds, historyOptions);
    applyTicketGroupPlan(sqlite, groupPlan, undefined, now());
    if (boardChanged) { clearGroupForBoardMove(sqlite, ticketId, current.boardId, now()); cleanupTicketForBoardMove(sqlite, ticketId, nextBoardId); }
    const updatedAt = now();
    const bodyChanged = input.bodyMarkdown != null && sqlite.prepare("SELECT body_markdown IS NOT ? FROM tickets WHERE id = ?")
      .pluck().get(input.bodyMarkdown, ticketId) === 1;
    sqlite
      .prepare(
        `
        UPDATE tickets
        SET group_id = CASE WHEN board_id <> ? THEN NULL ELSE group_id END, board_id = ?, lane_id = ?, parent_ticket_id = ?, title = ?, body_markdown = COALESCE(?, body_markdown), is_resolved = ?, is_archived = ?, priority = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      .run(
        nextBoardId,
        nextBoardId,
        nextLaneId,
        validateParentTicket(
          sqlite,
          ticketId,
          boardChanged ? null : input.parentTicketId !== undefined ? input.parentTicketId : current.parentTicketId,
          nextBoardId,
        ),
        input.title ?? current.title,
        input.bodyMarkdown ?? null,
        Number(laneCompletion(sqlite, nextLaneId, input.isResolved, nextBoardId)),
        typeof input.isArchived === "boolean" ? Number(input.isArchived) : Number(current.isArchived),
        input.priority == null ? current.priority : sanitizePriority(input.priority),
        updatedAt,
        ticketId,
      );
    if (bodyChanged) recordTicketContentActivity(sqlite, ticketId, updatedAt);
    const newTagIds = resolveTicketTagNames(sqlite, nextBoardId, input.newTagNames);
    if (input.tagIds || newTagIds.length) {
      const selectedTagIds = input.tagIds ?? (boardChanged ? getTicket(sqlite, ticketId)! : current).tags.map((tag) => tag.id);
      replaceTicketTags(sqlite, ticketId, [...selectedTagIds, ...newTagIds]);
    }
    if (input.blockerIds) {
      replaceTicketBlockers(sqlite, ticketId, input.blockerIds, nextBoardId);
    }
    if (input.relatedIds) {
      replaceTicketRelatedLinks(sqlite, ticketId, input.relatedIds, nextBoardId);
    }
    if (nextLaneId !== current.laneId) {
      sqlite
        .prepare("UPDATE tickets SET position = ? WHERE id = ?")
        .run(nextTicketPosition(sqlite, nextLaneId), ticketId);
      normalizeVisibleAndArchivedTicketPositions(sqlite, current.laneId);
      normalizeVisibleAndArchivedTicketPositions(sqlite, nextLaneId);
    } else if (typeof input.isArchived === "boolean" && input.isArchived !== current.isArchived) {
      sqlite
        .prepare("UPDATE tickets SET position = ? WHERE id = ?")
        .run(nextTicketPosition(sqlite, nextLaneId), ticketId);
      normalizeVisibleAndArchivedTicketPositions(sqlite, nextLaneId);
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
    const after = readTicketHistory(sqlite, affectedIds, historyOptions);
    const changes = ticketChanges(before.get(ticketId), after.get(ticketId));
    if (bodyChanged) changes.bodyMarkdown = { before: current.bodyMarkdown, after: input.bodyMarkdown! };
    addTicketActivity(sqlite, now, nextBoardId, ticketId, action, message, historyDetails(changes));
    recordTicketPeerHistory(sqlite, before, after, new Set([ticketId]), updatedAt);
    touchBoard(sqlite, nextBoardId, now());
    if (boardChanged) touchBoard(sqlite, current.boardId, now());
  });
  tx.immediate();
  return getTicket(sqlite, ticketId)!;
}

export function moveTicket(
  sqlite: Database.Database,
  ticketId: Id,
  input: MoveTicketInput,
  now: Now,
): TicketView {
  const tx = sqlite.transaction(() => {
    const current = getTicket(sqlite, ticketId);
    if (!current) throw new Error("Ticket not found");
    const { targetBoard, targetLane } = getMoveDestination(sqlite, input);
    const sourceBoardName = getBoardName(sqlite, current.boardId);
    const boardChanged = current.boardId !== input.boardId;
    const updatedAt = now();
    const nextPosition = current.laneId === input.laneId ? current.position : nextTicketPosition(sqlite, input.laneId);
    const options = { tags: boardChanged, relations: boardChanged };
    const subject = readTicketHistory(sqlite, [ticketId], options);
    const peers = ticketHistoryPeerIds(subject.values());
    const before = readTicketHistory(sqlite, peers, options);
    if (boardChanged) clearGroupForBoardMove(sqlite, ticketId, current.boardId, updatedAt);
    sqlite
      .prepare(
        `
        UPDATE tickets
        SET group_id = CASE WHEN board_id <> ? THEN NULL ELSE group_id END, board_id = ?, lane_id = ?, parent_ticket_id = ?, position = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      .run(input.boardId, input.boardId, input.laneId, boardChanged ? null : current.parentTicketId, nextPosition, updatedAt, ticketId);

    if (boardChanged) {
      cleanupTicketForBoardMove(sqlite, ticketId, input.boardId);
    }

    normalizeVisibleAndArchivedTicketPositions(sqlite, current.laneId);
    normalizeVisibleAndArchivedTicketPositions(sqlite, input.laneId);
    const after = readTicketHistory(sqlite, [ticketId, ...peers], options);
    addBoardMoveActivity(sqlite, now, {
      ticketId,
      fromBoardId: current.boardId,
      fromBoardName: sourceBoardName,
      fromLaneId: current.laneId,
      targetBoard,
      targetLane,
      relationsCleared: boardChanged,
    }, ticketChanges(subject.get(ticketId), after.get(ticketId)));
    recordTicketPeerHistory(sqlite, before, after, new Set([ticketId]), updatedAt);
    touchBoard(sqlite, current.boardId, now());
    if (boardChanged) {
      touchBoard(sqlite, input.boardId, now());
    }
  });
  tx.immediate();
  return getTicket(sqlite, ticketId)!;
}

export function deleteTicket(sqlite: Database.Database, ticketId: Id, now: Now): void {
  const tx = sqlite.transaction(() => {
    const ticket = getTicket(sqlite, ticketId);
    if (!ticket) throw new Error("Ticket not found");
    const subject = readTicketHistory(sqlite, [ticketId], { relations: true });
    const peers = ticketHistoryPeerIds(subject.values());
    const before = readTicketHistory(sqlite, peers, { relations: true });
    addTicketActivity(sqlite, now, ticket.boardId, ticketId, "ticket_deleted", "Ticket deleted", {
      title: ticket.title,
      laneId: ticket.laneId,
      isResolved: ticket.isResolved,
      isArchived: ticket.isArchived,
    });
    sqlite.prepare("UPDATE tickets SET parent_ticket_id = NULL WHERE parent_ticket_id = ?").run(ticketId);
    sqlite.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
    recordTicketPeerHistory(sqlite, before, readTicketHistory(sqlite, peers, { relations: true }), new Set([ticketId]), now());
    normalizeVisibleAndArchivedTicketPositions(sqlite, ticket.laneId);
    touchBoard(sqlite, ticket.boardId, now());
  });
  tx.immediate();
}

export function transitionTicket(
  sqlite: Database.Database,
  ticketId: Id,
  laneName: string,
  now: Now,
): TicketView {
  const current = getTicket(sqlite, ticketId);
  if (!current) {
    throw new Error("Ticket not found");
  }
  const lane = sqlite
    .prepare("SELECT * FROM lanes WHERE board_id = ? AND name = ?")
    .get(current.boardId, laneName) as LaneRow | undefined;
  if (!lane) {
    throw new Error("Lane not found");
  }
  return updateTicket(sqlite, ticketId, {
    laneId: lane.id,
  }, now);
}
