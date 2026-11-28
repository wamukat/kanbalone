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
  // Each relationship can use its own index. The outer IN updates each board once.
  const affectedTickets = (ids: string) => `
    SELECT board_id FROM tickets WHERE id IN (${ids})
    UNION ALL SELECT board_id FROM tickets WHERE parent_ticket_id IN (${ids})
    UNION ALL SELECT parent.board_id FROM tickets child
      JOIN tickets parent ON parent.id = child.parent_ticket_id WHERE child.id IN (${ids})
    UNION ALL SELECT dependent.board_id FROM ticket_blockers relation
      JOIN tickets dependent ON dependent.id = relation.ticket_id WHERE relation.blocker_ticket_id IN (${ids})
    UNION ALL SELECT dependent.board_id FROM ticket_related_links relation
      JOIN tickets dependent ON dependent.id = relation.ticket_id WHERE relation.related_ticket_id IN (${ids})
    UNION ALL SELECT dependent.board_id FROM ticket_related_links relation
      JOIN tickets dependent ON dependent.id = relation.related_ticket_id WHERE relation.ticket_id IN (${ids})`;
  const existingTrigger = sqlite.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = ?").pluck();
  const install = (table: string, boards: (prefix: string) => string, replaceLegacy = false) => {
    const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    const changed = columns.map(({ name }) => `OLD.${name} IS NOT NEW.${name}`).join(" OR ");
    for (const event of ["INSERT", "UPDATE", "DELETE"] as const) {
      const sets = event === "INSERT" ? boards("NEW") : event === "DELETE" ? boards("OLD") : `${boards("OLD")} UNION ${boards("NEW")}`;
      // BEFORE DELETE retains the join rows and old parent necessary for cascade invalidation.
      const name = `ticket_list_${table}_${event.toLowerCase()}`;
      const definition = `CREATE TRIGGER ${name}
        ${event === "INSERT" ? "AFTER" : "BEFORE"} ${event} ON ${table}
        ${event === "UPDATE" ? `WHEN ${changed}` : ""}
        BEGIN UPDATE ticket_list_revisions SET revision = revision + 1 WHERE board_id IN (${sets}); END`;
      if (replaceLegacy) {
        // Startup runs this migration in a transaction, so readers cannot see a missing trigger.
        const existing = existingTrigger.get(name);
        if (existing === definition) continue;
        if (existing) sqlite.exec(`DROP TRIGGER ${name}`);
        sqlite.exec(definition);
      } else {
        sqlite.exec(definition.replace("CREATE TRIGGER ", "CREATE TRIGGER IF NOT EXISTS "));
      }
    }
  };
  install("tickets", p => `SELECT ${p}.board_id UNION ${affectedTickets(`${p}.id, ${p}.parent_ticket_id`)}`, true);
  for (const table of ["lanes", "tags", "groups"]) install(table, p => `SELECT ${p}.board_id`);
  // Board names form the canonical references in summaries. Position-only changes are conservative invalidations.
  const boardChanged = "OLD.name IS NOT NEW.name";
  sqlite.exec(`CREATE TRIGGER IF NOT EXISTS ticket_list_board_update BEFORE UPDATE ON boards WHEN ${boardChanged}
    BEGIN UPDATE ticket_list_revisions SET revision = revision + 1 WHERE board_id = OLD.id; END;`);
  for (const table of ["ticket_tags", "ticket_remote_links", "ticket_external_references", "ticket_external_reference_status", "ticket_tag_reasons"])
    install(table, p => affectedTickets(`${p}.ticket_id`), true);
  install("ticket_blockers", p => affectedTickets(`${p}.ticket_id, ${p}.blocker_ticket_id`), true);
  install("ticket_related_links", p => affectedTickets(`${p}.ticket_id, ${p}.related_ticket_id`), true);
  install("ticket_tasks", p => `SELECT board_id FROM tickets WHERE id = ${p}.ticket_id`);
}
