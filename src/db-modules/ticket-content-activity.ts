import type Database from "better-sqlite3";

export function migrateTicketContentActivity(sqlite: Database.Database): void {
  const exists = sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'ticket_content_activity'").get();
  if (exists) return;
  // Old ticket activity does not identify body edits. Preserve only known creation and comment activity.
  sqlite.exec(`
    CREATE TABLE ticket_content_activity (
      ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
      activity_at_ms INTEGER NOT NULL
    );
    WITH known_events AS (
      SELECT id AS ticket_id, created_at FROM tickets
      UNION ALL SELECT ticket_id, created_at FROM comments
      UNION ALL
      SELECT t.id, a.created_at
      FROM activity_logs a JOIN tickets t ON t.id = a.subject_ticket_id
      WHERE a.action IN ('comment_added', 'comment_imported') OR (a.action = 'comment_updated' AND
        CASE WHEN json_valid(a.details_json) THEN
          json_type(a.details_json, '$.commentId') = 'integer'
          AND json_extract(a.details_json, '$.commentId') > 0
          AND json_type(a.details_json, '$.oldBodyMarkdown') = 'text'
          AND json_type(a.details_json, '$.newBodyMarkdown') = 'text'
          AND json_extract(a.details_json, '$.oldBodyMarkdown') <> json_extract(a.details_json, '$.newBodyMarkdown')
        ELSE 0 END)
    ), activity AS (
      SELECT ticket_id, MAX(CAST(round((julianday(created_at) - 2440587.5) * 86400000) AS INTEGER)) AS latest
      FROM known_events GROUP BY ticket_id
    )
    INSERT INTO ticket_content_activity(ticket_id, activity_at_ms)
    SELECT ticket_id, latest FROM activity WHERE latest IS NOT NULL;
  `);
}

export function recordTicketContentActivity(sqlite: Database.Database, ticketId: number, at: string): void {
  sqlite.prepare(`
    INSERT INTO ticket_content_activity(ticket_id, activity_at_ms) VALUES (?, ?)
    ON CONFLICT(ticket_id) DO UPDATE SET activity_at_ms = excluded.activity_at_ms
    WHERE excluded.activity_at_ms > ticket_content_activity.activity_at_ms
  `).run(ticketId, Date.parse(at));
}
