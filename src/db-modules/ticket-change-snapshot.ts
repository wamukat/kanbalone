import { createHash, randomUUID } from "node:crypto";
import { readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";

import type Database from "better-sqlite3";

import type { Id } from "../types.js";
import { readTicketHistory } from "./ticket-history.js";

export function migrateTicketChangeSnapshots(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ticket_change_clock (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      origin TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS ticket_history_removals (
      ticket_id INTEGER PRIMARY KEY,
      through_id INTEGER NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS ticket_change_model_revision
      AFTER UPDATE OF revision ON ticket_list_revisions
      BEGIN UPDATE ticket_change_clock SET revision = revision + 1 WHERE id = 1; END;
    CREATE TRIGGER IF NOT EXISTS ticket_change_removed_history
      AFTER DELETE ON activity_logs
      BEGIN
        INSERT INTO ticket_history_removals(ticket_id, through_id) VALUES (OLD.subject_ticket_id, OLD.id)
        ON CONFLICT(ticket_id) DO UPDATE SET through_id = max(through_id, excluded.through_id);
      END;
    CREATE INDEX IF NOT EXISTS ticket_change_activity_id_idx ON activity_logs(subject_ticket_id, id);
  `);
  sqlite.prepare("INSERT OR IGNORE INTO ticket_change_clock(id, origin) VALUES (1, ?)").run(randomUUID());
}

export function ticketChangeSeries(sqlite: Database.Database): string {
  const origin = sqlite.prepare("SELECT origin FROM ticket_change_clock WHERE id = 1").pluck().get() as string;
  if (sqlite.memory || !sqlite.name) return origin;
  // The official backup copies the database and attachment payload only. A restored
  // database receives its own identity without rewriting the verified backup bytes.
  const databasePath = realpathSync(sqlite.name);
  const filename = databasePath + ".visit-id";
  const { dev, ino } = statSync(databasePath, { bigint: true });
  const fileIdentity = dev.toString() + ":" + ino.toString();
  let identity: string | undefined;
  try {
    const [previousFile, previousId] = readFileSync(filename, "utf8").trim().split(" ");
    if (previousFile === fileIdentity) identity = previousId;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!identity || !/^[a-f0-9-]{36}$/.test(identity)) {
    // Startup holds the same SQLite write lock across processes in this directory.
    identity = randomUUID();
    const temp = filename + "." + identity + ".tmp";
    try {
      writeFileSync(temp, fileIdentity + " " + identity + "\n", { flag: "wx", mode: 0o600 });
      renameSync(temp, filename);
    } finally {
      rmSync(temp, { force: true });
    }
  }
  return createHash("sha256").update(origin).update(identity).digest("hex");
}

export function getTicketChangeSnapshot(sqlite: Database.Database, ticketId: Id, series: string) {
  return sqlite.transaction(() => {
    const ticket = sqlite.prepare(`
      SELECT t.body_markdown AS bodyMarkdown, g.id AS groupId, g.name AS groupName
      FROM tickets t LEFT JOIN groups g ON g.id = t.group_id WHERE t.id = ?
    `).get(ticketId) as { bodyMarkdown: string; groupId: Id | null; groupName: string | null } | undefined;
    if (!ticket) return null;

    const { values } = readTicketHistory(sqlite, [ticketId], { tags: true, relations: true }).get(ticketId)!;
    const revision = sqlite.prepare("SELECT revision FROM ticket_change_clock WHERE id = 1").pluck().get() as number;
    const activityThrough = sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'activity_logs'").pluck().get() as number | undefined;
    const comments = sqlite.prepare(`
      SELECT id, body_markdown AS bodyMarkdown, updater FROM comments WHERE ticket_id = ? ORDER BY id
    `).all(ticketId) as { id: Id; bodyMarkdown: string; updater: string | null }[];
    const tasks = sqlite.prepare(`
      SELECT number, body_markdown AS bodyMarkdown, done FROM ticket_tasks WHERE ticket_id = ? ORDER BY number
    `).all(ticketId) as { number: number; bodyMarkdown: string; done: number }[];
    const state = {
      ...values,
      bodyMarkdown: ticket.bodyMarkdown,
      group: ticket.groupId === null ? null : { id: ticket.groupId, label: ticket.groupName! },
      comments,
      tasks: tasks.map(task => ({ ...task, done: Boolean(task.done) })),
    };
    const hash = createHash("sha256");
    for (const [key, value] of Object.entries(state)) {
      hash.update(key).update("\0");
      for (const entry of Array.isArray(value) ? value : [value]) hash.update(JSON.stringify(entry)).update("\0");
    }
    const latestActivity = sqlite.prepare("SELECT max(id) FROM activity_logs WHERE subject_ticket_id = ?").pluck().get(ticketId);
    const stateFingerprint = hash.copy().digest("hex");
    const fingerprint = hash.update(String(latestActivity)).digest("hex");
    return {
      ticketId, series, revision, activityThrough: activityThrough ?? 0, stateFingerprint, fingerprint, state,
    };
  })();
}

export type ActivityInterval = { after: number; through: number };

export function hasRemovedActivity(sqlite: Database.Database, ticketId: Id, after: number): boolean {
  return sqlite.prepare("SELECT 1 FROM ticket_history_removals WHERE ticket_id = ? AND through_id > ?").get(ticketId, after) != null;
}
