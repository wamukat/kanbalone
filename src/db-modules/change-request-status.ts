import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ChangeRequestSnapshot } from "../remote/adapters.js";

export function beginChangeRequestRefresh(sqlite: Database.Database, referenceId: number, ticketId: number, now: string): string {
  const token = randomUUID();
  sqlite.prepare(`INSERT INTO ticket_external_reference_status (reference_id, ticket_id, request_token, attempted_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(reference_id) DO UPDATE SET request_token=excluded.request_token, attempted_at=excluded.attempted_at`).run(referenceId, ticketId, token, now);
  return token;
}

export function finishChangeRequestRefresh(sqlite: Database.Database, referenceId: number, token: string, now: string,
  result: ChangeRequestSnapshot | { error: string }): boolean {
  // Replacing/removing a reference deletes its status row. New refreshes replace
  // the token, so neither an old response nor an ABA link edit can overwrite it.
  const statement = "error" in result
    ? sqlite.prepare("UPDATE ticket_external_reference_status SET last_error=? WHERE reference_id=? AND request_token=?")
    : sqlite.prepare("UPDATE ticket_external_reference_status SET state=?, is_draft=?, fetched_at=?, last_error=NULL WHERE reference_id=? AND request_token=?");
  const values = "error" in result ? [result.error, referenceId, token] : [result.state, Number(result.isDraft), now, referenceId, token];
  return statement.run(...values).changes === 1;
}
