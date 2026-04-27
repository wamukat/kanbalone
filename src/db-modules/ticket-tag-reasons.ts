import type Database from "better-sqlite3";

import { mapTicketTagReason } from "./mappers.js";
import { addActivity } from "./ticket-writes.js";
import type { Id, TagRow, TicketTagReasonRow, TicketTagReasonView } from "../types.js";

export type SetTicketTagReasonInput = {
  ticketId: Id;
  tagId: Id;
  reason?: string | null;
  details?: Record<string, unknown> | null;
  reasonCommentId?: Id | null;
};

export function setTicketTagReason(
  sqlite: Database.Database,
  input: SetTicketTagReasonInput,
  now: string,
): TicketTagReasonView {
  const ticket = sqlite
    .prepare("SELECT id, board_id FROM tickets WHERE id = ?")
    .get(input.ticketId) as { id: Id; board_id: Id } | undefined;
  if (!ticket) {
    throw new Error("Ticket not found");
  }
  const tag = sqlite
    .prepare("SELECT id, board_id FROM tags WHERE id = ?")
    .get(input.tagId) as { id: Id; board_id: Id } | undefined;
  if (!tag || tag.board_id !== ticket.board_id) {
    throw new Error("Tag does not belong to board");
  }
  if (input.reasonCommentId != null) {
    const comment = sqlite
      .prepare("SELECT id, ticket_id FROM comments WHERE id = ?")
      .get(input.reasonCommentId) as { id: Id; ticket_id: Id } | undefined;
    if (!comment || comment.ticket_id !== input.ticketId) {
      throw new Error("Reason comment does not belong to ticket");
    }
  }

  const tx = sqlite.transaction(() => {
    sqlite
      .prepare("INSERT OR IGNORE INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)")
      .run(input.ticketId, input.tagId);
    sqlite
      .prepare(
        `
        INSERT INTO ticket_tag_reasons (ticket_id, tag_id, reason, details_json, reason_comment_id, attached_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticket_id, tag_id) DO UPDATE SET
          reason = excluded.reason,
          details_json = excluded.details_json,
          reason_comment_id = excluded.reason_comment_id,
          updated_at = excluded.updated_at
        `,
      )
      .run(
        input.ticketId,
        input.tagId,
        normalizeOptionalText(input.reason),
        input.details == null ? null : JSON.stringify(input.details),
        input.reasonCommentId ?? null,
        now,
        now,
      );
    addActivity(sqlite, {
      boardId: ticket.board_id,
      ticketId: input.ticketId,
      action: "ticket_tag_reason_set",
      message: "Ticket tag reason set",
      details: {
        tagId: input.tagId,
        reason: normalizeOptionalText(input.reason),
      },
      createdAt: now,
    });
    touchBoard(sqlite, ticket.board_id, now);
  });
  tx();
  return getTicketTagReason(sqlite, input.ticketId, input.tagId)!;
}

export function removeTicketTag(
  sqlite: Database.Database,
  ticketId: Id,
  tagId: Id,
  now: string,
): { boardId: Id } {
  const ticket = sqlite
    .prepare("SELECT id, board_id FROM tickets WHERE id = ?")
    .get(ticketId) as { id: Id; board_id: Id } | undefined;
  if (!ticket) {
    throw new Error("Ticket not found");
  }
  const result = sqlite.prepare("DELETE FROM ticket_tags WHERE ticket_id = ? AND tag_id = ?").run(ticketId, tagId);
  sqlite.prepare("DELETE FROM ticket_tag_reasons WHERE ticket_id = ? AND tag_id = ?").run(ticketId, tagId);
  if (result.changes > 0) {
    addActivity(sqlite, {
      boardId: ticket.board_id,
      ticketId,
      action: "ticket_tag_removed",
      message: "Ticket tag removed",
      details: { tagId },
      createdAt: now,
    });
    touchBoard(sqlite, ticket.board_id, now);
  }
  return { boardId: ticket.board_id };
}

export function listTicketTagReasons(sqlite: Database.Database, ticketId: Id): TicketTagReasonView[] {
  if (!hasTicket(sqlite, ticketId)) {
    throw new Error("Ticket not found");
  }
  const rows = sqlite
    .prepare(
      `
      SELECT tags.*, ticket_tag_reasons.*
      FROM ticket_tags
      INNER JOIN tags ON tags.id = ticket_tags.tag_id
      LEFT JOIN ticket_tag_reasons
        ON ticket_tag_reasons.ticket_id = ticket_tags.ticket_id
       AND ticket_tag_reasons.tag_id = ticket_tags.tag_id
      WHERE ticket_tags.ticket_id = ?
      ORDER BY tags.name ASC, tags.id ASC
      `,
    )
    .all(ticketId) as Array<TicketTagReasonRow & TagRow>;
  return rows.map((row) =>
    mapTicketTagReason({
      ...row,
      ticket_id: ticketId,
      tag_id: row.id,
      reason: row.reason ?? null,
      details_json: row.details_json ?? null,
      reason_comment_id: row.reason_comment_id ?? null,
      attached_at: row.attached_at ?? null,
      updated_at: row.updated_at ?? null,
    }),
  );
}

function getTicketTagReason(sqlite: Database.Database, ticketId: Id, tagId: Id): TicketTagReasonView | null {
  const row = sqlite
    .prepare(
      `
      SELECT tags.*, ticket_tag_reasons.*
      FROM ticket_tags
      INNER JOIN tags ON tags.id = ticket_tags.tag_id
      LEFT JOIN ticket_tag_reasons
        ON ticket_tag_reasons.ticket_id = ticket_tags.ticket_id
       AND ticket_tag_reasons.tag_id = ticket_tags.tag_id
      WHERE ticket_tags.ticket_id = ? AND ticket_tags.tag_id = ?
      `,
    )
    .get(ticketId, tagId) as (TicketTagReasonRow & TagRow) | undefined;
  return row
    ? mapTicketTagReason({
      ...row,
      ticket_id: ticketId,
      tag_id: tagId,
      reason: row.reason ?? null,
      details_json: row.details_json ?? null,
      reason_comment_id: row.reason_comment_id ?? null,
      attached_at: row.attached_at ?? null,
      updated_at: row.updated_at ?? null,
    })
    : null;
}

function hasTicket(sqlite: Database.Database, ticketId: Id): boolean {
  const row = sqlite.prepare("SELECT id FROM tickets WHERE id = ?").get(ticketId) as { id: Id } | undefined;
  return Boolean(row);
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function touchBoard(sqlite: Database.Database, boardId: Id, updatedAt: string): void {
  sqlite.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(updatedAt, boardId);
}
