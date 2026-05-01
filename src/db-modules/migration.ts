import type Database from "better-sqlite3";

import { normalizeBoardPositions } from "./ordering.js";

export function migrate(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lanes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS tags_board_name_idx
    ON tags(board_id, name);

    CREATE INDEX IF NOT EXISTS lanes_board_position_idx
    ON lanes(board_id, position, id);

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      lane_id INTEGER NOT NULL REFERENCES lanes(id) ON DELETE CASCADE,
      parent_ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      body_markdown TEXT NOT NULL DEFAULT '',
      is_resolved INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      priority INTEGER NOT NULL DEFAULT 2,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      body_markdown TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_remote_links (
      ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      instance_url TEXT NOT NULL,
      resource_type TEXT NOT NULL DEFAULT 'issue',
      project_key TEXT NOT NULL,
      issue_key TEXT NOT NULL,
      display_ref TEXT NOT NULL,
      remote_url TEXT NOT NULL,
      remote_title TEXT NOT NULL,
      remote_body_markdown TEXT NOT NULL DEFAULT '',
      remote_state TEXT,
      remote_updated_at TEXT,
      last_synced_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_external_references (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      provider TEXT NOT NULL,
      instance_url TEXT NOT NULL,
      resource_type TEXT NOT NULL DEFAULT 'issue',
      project_key TEXT NOT NULL,
      issue_key TEXT NOT NULL,
      display_ref TEXT NOT NULL,
      remote_url TEXT NOT NULL,
      remote_title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comment_remote_sync (
      comment_id INTEGER PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      remote_comment_id TEXT,
      pushed_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
      subject_ticket_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      message TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_tags (
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (ticket_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS ticket_tag_reasons (
      ticket_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      reason TEXT,
      details_json TEXT,
      reason_comment_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
      attached_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (ticket_id, tag_id),
      FOREIGN KEY (ticket_id, tag_id) REFERENCES ticket_tags(ticket_id, tag_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ticket_blockers (
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      blocker_ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      PRIMARY KEY (ticket_id, blocker_ticket_id)
    );

    CREATE TABLE IF NOT EXISTS ticket_related_links (
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      related_ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      CHECK (ticket_id < related_ticket_id),
      PRIMARY KEY (ticket_id, related_ticket_id)
    );

    CREATE TABLE IF NOT EXISTS ticket_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      severity TEXT,
      icon TEXT,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS tickets_board_lane_position_idx
    ON tickets(board_id, lane_id, position, id);

    CREATE INDEX IF NOT EXISTS comments_ticket_created_idx
    ON comments(ticket_id, created_at, id);

    CREATE INDEX IF NOT EXISTS ticket_tags_tag_ticket_idx
    ON ticket_tags(tag_id, ticket_id);

    CREATE INDEX IF NOT EXISTS ticket_tag_reasons_tag_ticket_idx
    ON ticket_tag_reasons(tag_id, ticket_id);

    CREATE INDEX IF NOT EXISTS ticket_blockers_blocker_ticket_idx
    ON ticket_blockers(blocker_ticket_id, ticket_id);

    CREATE INDEX IF NOT EXISTS ticket_related_links_related_ticket_idx
    ON ticket_related_links(related_ticket_id, ticket_id);

    CREATE INDEX IF NOT EXISTS ticket_events_ticket_created_idx
    ON ticket_events(ticket_id, created_at, id);

    CREATE UNIQUE INDEX IF NOT EXISTS ticket_external_references_ticket_kind_idx
    ON ticket_external_references(ticket_id, kind);

    CREATE INDEX IF NOT EXISTS ticket_external_references_remote_idx
    ON ticket_external_references(provider, instance_url, resource_type, project_key, issue_key);

    CREATE INDEX IF NOT EXISTS activity_logs_ticket_created_idx
    ON activity_logs(ticket_id, created_at, id);
  `);

  let ticketColumns = sqlite.prepare("PRAGMA table_info(tickets)").all() as Array<{ name: string }>;
  if (ticketColumns.some((column) => column.name === "is_completed")
    && !ticketColumns.some((column) => column.name === "is_resolved")) {
    sqlite.exec("ALTER TABLE tickets RENAME COLUMN is_completed TO is_resolved");
    ticketColumns = sqlite.prepare("PRAGMA table_info(tickets)").all() as Array<{ name: string }>;
  }
  if (!ticketColumns.some((column) => column.name === "is_resolved")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN is_resolved INTEGER NOT NULL DEFAULT 0");
    ticketColumns = sqlite.prepare("PRAGMA table_info(tickets)").all() as Array<{ name: string }>;
  }
  const boardColumns = sqlite.prepare("PRAGMA table_info(boards)").all() as Array<{ name: string }>;
  if (!boardColumns.some((column) => column.name === "position")) {
    sqlite.exec("ALTER TABLE boards ADD COLUMN position INTEGER NOT NULL DEFAULT 0");
    normalizeBoardPositions(sqlite);
  }
  if (!ticketColumns.some((column) => column.name === "priority")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN priority INTEGER NOT NULL DEFAULT 2");
  }
  sqlite.exec("UPDATE tickets SET priority = 2 WHERE priority NOT IN (1, 2, 3, 4)");
  if (!ticketColumns.some((column) => column.name === "parent_ticket_id")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN parent_ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL");
  }
  if (!ticketColumns.some((column) => column.name === "is_archived")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0");
  }
  sqlite.exec(`
    DROP INDEX IF EXISTS tickets_board_completed_lane_position_idx;
    DROP INDEX IF EXISTS tickets_active_board_completed_lane_position_idx;

    CREATE INDEX IF NOT EXISTS tickets_board_resolved_lane_position_idx
    ON tickets(board_id, is_resolved, lane_id, position, id);

    CREATE INDEX IF NOT EXISTS tickets_active_board_lane_position_idx
    ON tickets(board_id, lane_id, position, id)
    WHERE is_archived = 0;

    CREATE INDEX IF NOT EXISTS tickets_active_board_resolved_lane_position_idx
    ON tickets(board_id, is_resolved, lane_id, position, id)
    WHERE is_archived = 0;

    CREATE INDEX IF NOT EXISTS tickets_archived_board_lane_position_idx
    ON tickets(board_id, lane_id, position, id)
    WHERE is_archived = 1;

    CREATE INDEX IF NOT EXISTS tickets_lane_archived_position_idx
    ON tickets(lane_id, is_archived, position, id);

    CREATE INDEX IF NOT EXISTS tickets_parent_ticket_idx
    ON tickets(parent_ticket_id);
  `);

  const activityColumns = sqlite.prepare("PRAGMA table_info(activity_logs)").all() as Array<{
    name: string;
    notnull: number;
  }>;
  const activityFks = sqlite.prepare("PRAGMA foreign_key_list(activity_logs)").all() as Array<{
    from: string;
    on_delete: string;
  }>;
  const ticketActivityFk = activityFks.find((fk) => fk.from === "ticket_id");
  const shouldRebuildActivityLogs = !activityColumns.some((column) => column.name === "subject_ticket_id")
    || !activityColumns.some((column) => column.name === "details_json")
    || activityColumns.find((column) => column.name === "ticket_id")?.notnull === 1
    || ticketActivityFk?.on_delete?.toUpperCase() !== "SET NULL";
  if (shouldRebuildActivityLogs) {
    sqlite.exec(`
      ALTER TABLE activity_logs RENAME TO activity_logs_old;

      CREATE TABLE activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
        subject_ticket_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        message TEXT NOT NULL,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      INSERT INTO activity_logs (id, board_id, ticket_id, subject_ticket_id, action, message, details_json, created_at)
      SELECT id, board_id, ticket_id, ticket_id, action, message, '{}', created_at
      FROM activity_logs_old;

      DROP TABLE activity_logs_old;

      CREATE INDEX IF NOT EXISTS activity_logs_ticket_created_idx
      ON activity_logs(ticket_id, created_at, id);
    `);
  }
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS boards_position_idx
    ON boards(position, id);

    CREATE INDEX IF NOT EXISTS activity_logs_ticket_created_idx
    ON activity_logs(ticket_id, created_at, id);

    CREATE INDEX IF NOT EXISTS activity_logs_subject_ticket_created_idx
    ON activity_logs(subject_ticket_id, created_at, id);
  `);

  ensureTicketRemoteLinksShape(sqlite);
  ensureCommentRemoteSyncShape(sqlite);
}

function ensureTicketRemoteLinksShape(sqlite: Database.Database): void {
  const columns = sqlite.prepare("PRAGMA table_info(ticket_remote_links)").all() as Array<{ name: string }>;
  const expected = [
    "ticket_id",
    "provider",
    "instance_url",
    "resource_type",
    "project_key",
    "issue_key",
    "display_ref",
    "remote_url",
    "remote_title",
    "remote_body_markdown",
    "remote_state",
    "remote_updated_at",
    "last_synced_at",
    "created_at",
    "updated_at",
  ];
  if (expected.every((name) => columns.some((column) => column.name === name))) {
    sqlite.exec(`
      DROP INDEX IF EXISTS ticket_remote_links_remote_unique_idx;
      CREATE UNIQUE INDEX IF NOT EXISTS ticket_remote_links_remote_unique_idx
      ON ticket_remote_links(provider, instance_url, resource_type, project_key, issue_key);
    `);
    return;
  }

  const hasColumn = (name: string) => columns.some((column) => column.name === name);
  const selectExpr = (name: string, fallback: string) => (hasColumn(name) ? name : fallback);

  sqlite.exec(`
    ALTER TABLE ticket_remote_links RENAME TO ticket_remote_links_old;

    CREATE TABLE ticket_remote_links (
      ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      instance_url TEXT NOT NULL,
      resource_type TEXT NOT NULL DEFAULT 'issue',
      project_key TEXT NOT NULL,
      issue_key TEXT NOT NULL,
      display_ref TEXT NOT NULL,
      remote_url TEXT NOT NULL,
      remote_title TEXT NOT NULL,
      remote_body_markdown TEXT NOT NULL DEFAULT '',
      remote_state TEXT,
      remote_updated_at TEXT,
      last_synced_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO ticket_remote_links (
      ticket_id,
      provider,
      instance_url,
      resource_type,
      project_key,
      issue_key,
      display_ref,
      remote_url,
      remote_title,
      remote_body_markdown,
      remote_state,
      remote_updated_at,
      last_synced_at,
      created_at,
      updated_at
    )
    SELECT
      ticket_id,
      provider,
      instance_url,
      ${selectExpr("resource_type", "'issue'")},
      project_key,
      issue_key,
      display_ref,
      remote_url,
      remote_title,
      ${selectExpr("remote_body_markdown", "''")},
      ${selectExpr("remote_state", "NULL")},
      ${selectExpr("remote_updated_at", "NULL")},
      last_synced_at,
      created_at,
      updated_at
    FROM ticket_remote_links_old;

    DROP TABLE ticket_remote_links_old;

    CREATE UNIQUE INDEX ticket_remote_links_remote_unique_idx
    ON ticket_remote_links(provider, instance_url, resource_type, project_key, issue_key);
  `);
}

function ensureCommentRemoteSyncShape(sqlite: Database.Database): void {
  const columns = sqlite.prepare("PRAGMA table_info(comment_remote_sync)").all() as Array<{ name: string }>;
  const expected = [
    "comment_id",
    "status",
    "remote_comment_id",
    "pushed_at",
    "last_error",
    "created_at",
    "updated_at",
  ];
  if (expected.every((name) => columns.some((column) => column.name === name))) {
    return;
  }

  const hasColumn = (name: string) => columns.some((column) => column.name === name);
  const selectExpr = (name: string, fallback: string) => (hasColumn(name) ? name : fallback);

  sqlite.exec(`
    ALTER TABLE comment_remote_sync RENAME TO comment_remote_sync_old;

    CREATE TABLE comment_remote_sync (
      comment_id INTEGER PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      remote_comment_id TEXT,
      pushed_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO comment_remote_sync (
      comment_id,
      status,
      remote_comment_id,
      pushed_at,
      last_error,
      created_at,
      updated_at
    )
    SELECT
      comment_id,
      status,
      ${selectExpr("remote_comment_id", "NULL")},
      ${selectExpr("pushed_at", "NULL")},
      ${selectExpr("last_error", "NULL")},
      created_at,
      updated_at
    FROM comment_remote_sync_old;

    DROP TABLE comment_remote_sync_old;
  `);
}
