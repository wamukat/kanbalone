import type Database from "better-sqlite3";

import { mapTicketEvent } from "./mappers.js";
import type { Id, TicketEventRow, TicketEventView } from "../types.js";

export type CreateTicketEventInput = {
  ticketId: Id;
  source: string;
  kind: string;
  title: string;
  summary?: string | null;
  severity?: string | null;
  icon?: string | null;
  data?: Record<string, unknown>;
};

export function addTicketEvent(
  sqlite: Database.Database,
  input: CreateTicketEventInput,
  now: string,
): TicketEventView {
  const ticket = sqlite
    .prepare("SELECT id, board_id FROM tickets WHERE id = ?")
    .get(input.ticketId) as { id: Id; board_id: Id } | undefined;
  if (!ticket) {
    throw new Error("Ticket not found");
  }
  const result = sqlite
    .prepare(
      `
      INSERT INTO ticket_events (ticket_id, source, kind, title, summary, severity, icon, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.ticketId,
      input.source,
      input.kind,
      input.title,
      input.summary ?? null,
      input.severity ?? null,
      input.icon ?? null,
      JSON.stringify(input.data ?? {}),
      now,
    );
  const eventId = Number(result.lastInsertRowid);
  touchBoard(sqlite, ticket.board_id, now);
  return getTicketEvent(sqlite, eventId)!;
}

export function listTicketEvents(sqlite: Database.Database, ticketId: Id): TicketEventView[] {
  if (!hasTicket(sqlite, ticketId)) {
    throw new Error("Ticket not found");
  }
  const rows = sqlite
    .prepare("SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at DESC, id DESC")
    .all(ticketId) as TicketEventRow[];
  return rows.map(mapTicketEvent);
}

function getTicketEvent(sqlite: Database.Database, eventId: Id): TicketEventView | null {
  const row = sqlite.prepare("SELECT * FROM ticket_events WHERE id = ?").get(eventId) as TicketEventRow | undefined;
  return row ? mapTicketEvent(row) : null;
}

function hasTicket(sqlite: Database.Database, ticketId: Id): boolean {
  const row = sqlite.prepare("SELECT id FROM tickets WHERE id = ?").get(ticketId) as { id: Id } | undefined;
  return Boolean(row);
}

function touchBoard(sqlite: Database.Database, boardId: Id, updatedAt: string): void {
  sqlite.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(updatedAt, boardId);
}
