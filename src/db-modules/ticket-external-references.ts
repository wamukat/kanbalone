import type Database from "better-sqlite3";

import type { Id, TicketExternalReferenceRow, TicketExternalReferenceView } from "../types.js";

export type UpsertTicketExternalReferenceInput = {
  ticketId: Id;
  kind: string;
  provider: string;
  instanceUrl: string;
  resourceType?: string;
  projectKey: string;
  issueKey: string;
  displayRef: string;
  url: string;
  title?: string | null;
};

export function getExternalReferencesForTicketIds(
  sqlite: Database.Database,
  ticketIds: Id[],
): Map<Id, TicketExternalReferenceView[]> {
  const referencesByTicket = new Map<Id, TicketExternalReferenceView[]>();
  if (ticketIds.length === 0) {
    return referencesByTicket;
  }
  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = sqlite.prepare(`
    SELECT *
    FROM ticket_external_references
    WHERE ticket_id IN (${placeholders})
    ORDER BY ticket_id ASC, kind ASC, id ASC
  `).all(...ticketIds) as TicketExternalReferenceRow[];
  for (const row of rows) {
    const current = referencesByTicket.get(row.ticket_id) ?? [];
    current.push(mapTicketExternalReference(row));
    referencesByTicket.set(row.ticket_id, current);
  }
  return referencesByTicket;
}

export function getTicketExternalReferences(
  sqlite: Database.Database,
  ticketId: Id,
): TicketExternalReferenceView[] {
  return getExternalReferencesForTicketIds(sqlite, [ticketId]).get(ticketId) ?? [];
}

export function upsertTicketExternalReference(
  sqlite: Database.Database,
  input: UpsertTicketExternalReferenceInput,
  now: string,
): TicketExternalReferenceView {
  assertTicketExists(sqlite, input.ticketId);
  const kind = normalizeKind(input.kind);
  sqlite.prepare(`
    INSERT INTO ticket_external_references (
      ticket_id,
      kind,
      provider,
      instance_url,
      resource_type,
      project_key,
      issue_key,
      display_ref,
      remote_url,
      remote_title,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ticket_id, kind) DO UPDATE SET
      provider = excluded.provider,
      instance_url = excluded.instance_url,
      resource_type = excluded.resource_type,
      project_key = excluded.project_key,
      issue_key = excluded.issue_key,
      display_ref = excluded.display_ref,
      remote_url = excluded.remote_url,
      remote_title = excluded.remote_title,
      updated_at = excluded.updated_at
  `).run(
    input.ticketId,
    kind,
    input.provider,
    input.instanceUrl,
    input.resourceType ?? "issue",
    input.projectKey,
    input.issueKey,
    input.displayRef,
    input.url,
    input.title ?? null,
    now,
    now,
  );
  const row = sqlite.prepare(`
    SELECT *
    FROM ticket_external_references
    WHERE ticket_id = ? AND kind = ?
  `).get(input.ticketId, kind) as TicketExternalReferenceRow;
  return mapTicketExternalReference(row);
}

export function deleteTicketExternalReference(
  sqlite: Database.Database,
  ticketId: Id,
  kind: string,
): boolean {
  const result = sqlite.prepare(`
    DELETE FROM ticket_external_references
    WHERE ticket_id = ? AND kind = ?
  `).run(ticketId, normalizeKind(kind));
  return result.changes > 0;
}

function mapTicketExternalReference(row: TicketExternalReferenceRow): TicketExternalReferenceView {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    kind: row.kind,
    provider: row.provider,
    instanceUrl: row.instance_url,
    resourceType: row.resource_type,
    projectKey: row.project_key,
    issueKey: row.issue_key,
    displayRef: row.display_ref,
    url: row.remote_url,
    title: row.remote_title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeKind(kind: string): string {
  const normalized = String(kind || "").trim().toLowerCase();
  if (!normalized || !/^[a-z][a-z0-9_-]{0,63}$/.test(normalized)) {
    throw new Error("external reference kind must start with a letter and contain only letters, numbers, underscore, or dash");
  }
  return normalized;
}

function assertTicketExists(sqlite: Database.Database, ticketId: Id): void {
  const row = sqlite.prepare("SELECT id FROM tickets WHERE id = ?").get(ticketId) as { id: Id } | undefined;
  if (!row) {
    throw new Error("Ticket not found");
  }
}
