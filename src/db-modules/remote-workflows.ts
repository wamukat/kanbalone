import type Database from "better-sqlite3";

import {
  upsertCommentRemoteSync,
  upsertTicketRemoteLink,
  type UpsertCommentRemoteSyncInput,
  type UpsertTicketRemoteLinkInput,
} from "./remote-tracking.js";
import {
  deleteTicketExternalReference,
  upsertTicketExternalReference,
  type UpsertTicketExternalReferenceInput,
} from "./ticket-external-references.js";
import { createTicket, type CreateTicketInput } from "./ticket-mutations.js";
import { getTicket } from "./ticket-read-model.js";
import { addActivity } from "./ticket-writes.js";
import type { CommentRemoteSyncView, Id, TicketView } from "../types.js";

type Now = () => string;

type TicketActivityInput = {
  boardId: Id;
  ticketId: Id;
  action: string;
  message: string;
  details?: Record<string, unknown>;
};

export function createTrackedTicketFromRemote(
  sqlite: Database.Database,
  input: CreateTicketInput,
  remote: Omit<UpsertTicketRemoteLinkInput, "ticketId">,
  activity: Omit<TicketActivityInput, "boardId" | "ticketId"> | undefined,
  now: Now,
): TicketView {
  const tx = sqlite.transaction(() => {
    const ticket = createTicket(sqlite, input, now);
    upsertTicketRemoteLink(sqlite, {
      ...remote,
      ticketId: ticket.id,
    }, now());
    if (activity) {
      addActivity(sqlite, {
        boardId: ticket.boardId,
        ticketId: ticket.id,
        ...activity,
        createdAt: now(),
      });
    }
    return ticket.id;
  });
  return getRequiredTicket(sqlite, tx());
}

export function upsertTicketExternalReferenceWithActivity(
  sqlite: Database.Database,
  input: UpsertTicketExternalReferenceInput,
  activity: TicketActivityInput | undefined,
  now: Now,
): TicketView {
  const tx = sqlite.transaction(() => {
    upsertTicketExternalReference(sqlite, input, now());
    if (activity) {
      addActivity(sqlite, {
        ...activity,
        createdAt: now(),
      });
    }
    return input.ticketId;
  });
  return getRequiredTicket(sqlite, tx());
}

export function deleteTicketExternalReferenceWithActivity(
  sqlite: Database.Database,
  ticketId: Id,
  kind: string,
  activity: Omit<TicketActivityInput, "ticketId"> | undefined,
  now: Now,
): TicketView {
  const tx = sqlite.transaction(() => {
    const ticket = getRequiredTicket(sqlite, ticketId);
    const deleted = deleteTicketExternalReference(sqlite, ticketId, kind);
    if (deleted && activity) {
      addActivity(sqlite, {
        boardId: activity.boardId,
        ticketId,
        action: activity.action,
        message: activity.message,
        details: activity.details,
        createdAt: now(),
      });
    }
    return ticket.id;
  });
  return getRequiredTicket(sqlite, tx());
}

export function refreshTrackedTicketFromRemote(
  sqlite: Database.Database,
  ticketId: Id,
  input: UpsertTicketRemoteLinkInput,
  activity: Omit<TicketActivityInput, "ticketId"> | undefined,
  now: Now,
): TicketView {
  const tx = sqlite.transaction(() => {
    getRequiredTicket(sqlite, ticketId);
    sqlite.prepare("UPDATE tickets SET title = ?, updated_at = ? WHERE id = ?").run(input.title, now(), ticketId);
    upsertTicketRemoteLink(sqlite, input, now());
    if (activity) {
      addActivity(sqlite, {
        boardId: activity.boardId,
        ticketId,
        action: activity.action,
        message: activity.message,
        details: activity.details,
        createdAt: now(),
      });
    }
    return ticketId;
  });
  return getRequiredTicket(sqlite, tx());
}

export function upsertCommentRemoteSyncWithActivity(
  sqlite: Database.Database,
  input: UpsertCommentRemoteSyncInput,
  activity: TicketActivityInput | undefined,
  now: Now,
): CommentRemoteSyncView {
  if (!activity) {
    return upsertCommentRemoteSync(sqlite, input, now());
  }
  const tx = sqlite.transaction(() => {
    const sync = upsertCommentRemoteSync(sqlite, input, now());
    addActivity(sqlite, {
      ...activity,
      createdAt: now(),
    });
    return sync;
  });
  return tx();
}

function getRequiredTicket(sqlite: Database.Database, ticketId: Id): TicketView {
  const ticket = getTicket(sqlite, ticketId);
  if (!ticket) {
    throw new Error("Ticket not found");
  }
  return ticket;
}
