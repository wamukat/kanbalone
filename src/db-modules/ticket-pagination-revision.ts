import type Database from "better-sqlite3";

/** Persisted read-model versions; triggers cover writes from every API/import path. */
export function migrateTicketPagination(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ticket_list_revisions (
      board_id INTEGER PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO ticket_list_revisions(board_id) SELECT id FROM boards;
    CREATE TABLE IF NOT EXISTS ticket_cursor_secret (id INTEGER PRIMARY KEY CHECK(id = 1), secret TEXT NOT NULL);
    INSERT OR IGNORE INTO ticket_cursor_secret VALUES(1, lower(hex(randomblob(32))));
    CREATE TRIGGER IF NOT EXISTS ticket_list_board_insert AFTER INSERT ON boards BEGIN
      INSERT INTO ticket_list_revisions(board_id) VALUES(NEW.id);
    END;
    CREATE INDEX IF NOT EXISTS tickets_paging_id_idx ON tickets(board_id, id);
    CREATE INDEX IF NOT EXISTS tickets_paging_position_idx ON tickets(board_id, lane_id, is_archived, position, id);
    CREATE INDEX IF NOT EXISTS tickets_paging_completed_idx ON tickets(board_id, lane_id,
      COALESCE(CAST(round((julianday(resolved_at) - 2440587.5) * 86400000) AS INTEGER), 0) DESC, position ASC, id DESC);
  `);
  const affectedTickets = (ids: string) => `SELECT board_id FROM tickets WHERE id IN (${ids})
    OR parent_ticket_id IN (${ids})
    OR id IN (SELECT parent_ticket_id FROM tickets WHERE id IN (${ids}))
    OR id IN (SELECT ticket_id FROM ticket_blockers WHERE blocker_ticket_id IN (${ids}))
    OR id IN (SELECT ticket_id FROM ticket_related_links WHERE related_ticket_id IN (${ids}))
    OR id IN (SELECT related_ticket_id FROM ticket_related_links WHERE ticket_id IN (${ids}))`;
  const install = (table: string, boards: (prefix: string) => string) => {
    const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    const changed = columns.map(({ name }) => `OLD.${name} IS NOT NEW.${name}`).join(" OR ");
    for (const event of ["INSERT", "UPDATE", "DELETE"] as const) {
      const sets = event === "INSERT" ? boards("NEW") : event === "DELETE" ? boards("OLD") : `${boards("OLD")} UNION ${boards("NEW")}`;
      // BEFORE DELETE retains the join rows and old parent necessary for cascade invalidation.
      sqlite.exec(`CREATE TRIGGER IF NOT EXISTS ticket_list_${table}_${event.toLowerCase()}
        ${event === "INSERT" ? "AFTER" : "BEFORE"} ${event} ON ${table}
        ${event === "UPDATE" ? `WHEN ${changed}` : ""}
        BEGIN UPDATE ticket_list_revisions SET revision = revision + 1 WHERE board_id IN (${sets}); END;`);
    }
  };
  install("tickets", p => `SELECT ${p}.board_id UNION ${affectedTickets(`${p}.id, ${p}.parent_ticket_id`)}`);
  for (const table of ["lanes", "tags", "groups"]) install(table, p => `SELECT ${p}.board_id`);
  // Board names form the canonical references in summaries. Position-only changes are conservative invalidations.
  const boardChanged = "OLD.name IS NOT NEW.name";
  sqlite.exec(`CREATE TRIGGER IF NOT EXISTS ticket_list_board_update BEFORE UPDATE ON boards WHEN ${boardChanged}
    BEGIN UPDATE ticket_list_revisions SET revision = revision + 1 WHERE board_id = OLD.id; END;`);
  for (const table of ["ticket_tags", "ticket_remote_links", "ticket_external_references", "ticket_tag_reasons"])
    install(table, p => affectedTickets(`${p}.ticket_id`));
  install("ticket_blockers", p => affectedTickets(`${p}.ticket_id, ${p}.blocker_ticket_id`));
  install("ticket_related_links", p => affectedTickets(`${p}.ticket_id, ${p}.related_ticket_id`));
}
