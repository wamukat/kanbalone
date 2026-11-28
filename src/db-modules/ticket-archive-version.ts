import type Database from "better-sqlite3";

// Persisted operation generation, not a hash of ticket contents: even an
// archive→restore→archive cycle or a board round trip invalidates old actions.
export function migrateTicketArchiveVersion(sqlite: Database.Database): void {
  const columns = sqlite.prepare("PRAGMA table_info(tickets)").all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === "archive_version")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN archive_version INTEGER NOT NULL DEFAULT 0");
  }
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS tickets_archive_version
    AFTER UPDATE OF is_archived, board_id ON tickets
    WHEN OLD.is_archived IS NOT NEW.is_archived OR OLD.board_id IS NOT NEW.board_id
    BEGIN
      UPDATE tickets SET archive_version = OLD.archive_version + 1 WHERE id = NEW.id;
    END;
  `);
}
