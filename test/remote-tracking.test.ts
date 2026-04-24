import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { KanbanDb } from "../src/db.js";
import { RemoteIssueAlreadyLinkedError } from "../src/db-modules/remote-tracking.js";

function createDbFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kanbalone-remote-tracking-")), "test.sqlite");
}

test("migration creates remote tracking tables and uniqueness index", () => {
  const db = new KanbanDb(createDbFile());
  try {
    const tables = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((row) => row.name));
    assert.ok(tableNames.has("ticket_remote_links"));
    assert.ok(tableNames.has("comment_remote_sync"));

    const indexes = db.sqlite.prepare("PRAGMA index_list(ticket_remote_links)").all() as Array<{ name: string; unique: number }>;
    const uniqueIndex = indexes.find((index) => index.name === "ticket_remote_links_remote_unique_idx");
    assert.ok(uniqueIndex);
    assert.equal(uniqueIndex.unique, 1);
  } finally {
    db.close();
  }
});

test("migration repairs legacy remote tracking tables and preserves existing ticket data", () => {
  const dbFile = createDbFile();
  const legacy = new Database(dbFile);
  try {
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE boards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE lanes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position INTEGER NOT NULL
      );
      CREATE TABLE tickets (
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
      CREATE TABLE comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        body_markdown TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
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
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL
      );
      CREATE TABLE ticket_tags (
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (ticket_id, tag_id)
      );
      CREATE TABLE ticket_blockers (
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        blocker_ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        PRIMARY KEY (ticket_id, blocker_ticket_id)
      );
      CREATE TABLE ticket_remote_links (
        ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        instance_url TEXT NOT NULL,
        project_key TEXT NOT NULL,
        issue_key TEXT NOT NULL,
        display_ref TEXT NOT NULL,
        remote_url TEXT NOT NULL,
        remote_title TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE comment_remote_sync (
        comment_id INTEGER PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO boards (id, name, position, created_at, updated_at) VALUES (1, 'Legacy', 0, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');
      INSERT INTO lanes (id, board_id, name, position) VALUES (1, 1, 'todo', 0);
      INSERT INTO tickets (id, board_id, lane_id, parent_ticket_id, title, body_markdown, is_resolved, is_archived, priority, position, created_at, updated_at)
      VALUES (1, 1, 1, NULL, 'Legacy ticket', 'Legacy body', 0, 0, 2, 0, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');
      INSERT INTO comments (id, ticket_id, body_markdown, created_at)
      VALUES (1, 1, 'Legacy comment', '2026-04-01T00:00:00.000Z');
      INSERT INTO ticket_remote_links (ticket_id, provider, instance_url, project_key, issue_key, display_ref, remote_url, remote_title, last_synced_at, created_at, updated_at)
      VALUES (1, 'github', 'https://github.com', 'acme/kanbalone', '123', 'acme/kanbalone#123', 'https://github.com/acme/kanbalone/issues/123', 'Legacy remote', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');
      INSERT INTO comment_remote_sync (comment_id, status, created_at, updated_at)
      VALUES (1, 'local_only', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');
    `);
  } finally {
    legacy.close();
  }

  const db = new KanbanDb(dbFile);
  try {
    assert.equal(db.getTicket(1)?.title, "Legacy ticket");
    assert.equal(db.listComments(1)[0]?.bodyMarkdown, "Legacy comment");
    assert.equal(db.getTicketRemoteLink(1)?.resourceType, "issue");
    assert.equal(db.getTicketRemoteLink(1)?.bodyMarkdown, "");
    assert.equal(db.getCommentRemoteSync(1)?.status, "local_only");
  } finally {
    db.close();
  }
});

test("remote tracking helpers persist ticket links and comment sync state", () => {
  const db = new KanbanDb(createDbFile());
  try {
    const board = db.createBoard({ name: "Remote helpers", laneNames: ["todo"] });
    const ticket = db.createTicket({
      boardId: board.board.id,
      laneId: board.lanes[0].id,
      title: "Tracked ticket",
    });
    const comment = db.addComment({
      ticketId: ticket.id,
      bodyMarkdown: "Started work.",
    });

    const remote = db.upsertTicketRemoteLink({
      ticketId: ticket.id,
      provider: "github",
      instanceUrl: "https://github.com",
      projectKey: "acme/kanbalone",
      issueKey: "123",
      displayRef: "acme/kanbalone#123",
      url: "https://github.com/acme/kanbalone/issues/123",
      title: "Tracked ticket",
      bodyMarkdown: "Remote body",
      state: "open",
      updatedAt: "2026-04-23T00:00:00.000Z",
      lastSyncedAt: "2026-04-23T00:00:01.000Z",
    });
    assert.equal(remote.ticketId, ticket.id);
    assert.equal(remote.provider, "github");
    assert.equal(remote.bodyMarkdown, "Remote body");

    const updatedRemote = db.upsertTicketRemoteLink({
      ticketId: ticket.id,
      provider: "github",
      instanceUrl: "https://github.com",
      projectKey: "acme/kanbalone",
      issueKey: "123",
      displayRef: "acme/kanbalone#123",
      url: "https://github.com/acme/kanbalone/issues/123",
      title: "Tracked ticket v2",
      bodyMarkdown: "Remote body v2",
      state: "closed",
      updatedAt: "2026-04-23T00:00:02.000Z",
      lastSyncedAt: "2026-04-23T00:00:03.000Z",
    });
    assert.equal(updatedRemote.title, "Tracked ticket v2");
    assert.equal(db.getTicketRemoteLink(ticket.id)?.state, "closed");

    const sync = db.upsertCommentRemoteSync({
      commentId: comment.id,
      status: "local_only",
    });
    assert.equal(sync.status, "local_only");

    const pushedSync = db.upsertCommentRemoteSync({
      commentId: comment.id,
      status: "pushed",
      remoteCommentId: "gh-1",
      pushedAt: "2026-04-23T00:00:04.000Z",
    });
    assert.equal(pushedSync.status, "pushed");
    assert.equal(pushedSync.remoteCommentId, "gh-1");
    assert.equal(db.getCommentRemoteSync(comment.id)?.pushedAt, "2026-04-23T00:00:04.000Z");
  } finally {
    db.close();
  }
});

test("remote tracking helpers reject duplicate remote issues and missing records", () => {
  const db = new KanbanDb(createDbFile());
  try {
    const board = db.createBoard({ name: "Remote duplicate", laneNames: ["todo"] });
    const first = db.createTicket({ boardId: board.board.id, laneId: board.lanes[0].id, title: "First" });
    const second = db.createTicket({ boardId: board.board.id, laneId: board.lanes[0].id, title: "Second" });
    const comment = db.addComment({ ticketId: first.id, bodyMarkdown: "Comment" });

    db.upsertTicketRemoteLink({
      ticketId: first.id,
      provider: "github",
      instanceUrl: "https://github.com",
      resourceType: "issue",
      projectKey: "acme/kanbalone",
      issueKey: "200",
      displayRef: "acme/kanbalone#200",
      url: "https://github.com/acme/kanbalone/issues/200",
      title: "First",
      lastSyncedAt: "2026-04-23T00:00:00.000Z",
    });

    assert.throws(() => db.upsertTicketRemoteLink({
      ticketId: second.id,
      provider: "github",
      instanceUrl: "https://github.com",
      resourceType: "issue",
      projectKey: "acme/kanbalone",
      issueKey: "200",
      displayRef: "acme/kanbalone#200",
      url: "https://github.com/acme/kanbalone/issues/200",
      title: "Second",
      lastSyncedAt: "2026-04-23T00:00:01.000Z",
    }), RemoteIssueAlreadyLinkedError);

    assert.throws(() => db.upsertTicketRemoteLink({
      ticketId: 999_999,
      provider: "github",
      instanceUrl: "https://github.com",
      projectKey: "acme/kanbalone",
      issueKey: "201",
      displayRef: "acme/kanbalone#201",
      url: "https://github.com/acme/kanbalone/issues/201",
      title: "Missing",
      lastSyncedAt: "2026-04-23T00:00:02.000Z",
    }), /Ticket not found/);

    assert.throws(() => db.upsertCommentRemoteSync({
      commentId: 999_999,
      status: "local_only",
    }), /Comment not found/);

    assert.throws(() => db.upsertCommentRemoteSync({
      commentId: comment.id,
      status: "pushed",
    }), /requires remoteCommentId and pushedAt/);
  } finally {
    db.close();
  }
});

test("tracked ticket creation rolls back when remote link insert fails", () => {
  const db = new KanbanDb(createDbFile());
  try {
    const board = db.createBoard({ name: "Tracked create rollback", laneNames: ["todo"] });
    const lane = board.lanes[0];
    const existing = db.createTicket({
      boardId: board.board.id,
      laneId: lane.id,
      title: "Existing remote",
    });
    db.upsertTicketRemoteLink({
      ticketId: existing.id,
      provider: "github",
      instanceUrl: "https://github.com",
      resourceType: "issue",
      projectKey: "acme/kanbalone",
      issueKey: "777",
      displayRef: "acme/kanbalone#777",
      url: "https://github.com/acme/kanbalone/issues/777",
      title: "Existing remote",
      lastSyncedAt: "2026-04-23T00:00:00.000Z",
    });

    assert.throws(() => db.createTrackedTicketFromRemote({
      boardId: board.board.id,
      laneId: lane.id,
      title: "Duplicate remote",
      bodyMarkdown: "Should roll back",
    }, {
      provider: "github",
      instanceUrl: "https://github.com",
      resourceType: "issue",
      projectKey: "acme/kanbalone",
      issueKey: "777",
      displayRef: "acme/kanbalone#777",
      url: "https://github.com/acme/kanbalone/issues/777",
      title: "Duplicate remote",
      bodyMarkdown: "Should roll back",
      lastSyncedAt: "2026-04-23T00:00:01.000Z",
    }), RemoteIssueAlreadyLinkedError);

    const rows = db.sqlite.prepare("SELECT title FROM tickets ORDER BY id ASC").all() as Array<{ title: string }>;
    assert.deepEqual(rows.map((row) => row.title), ["Existing remote"]);
  } finally {
    db.close();
  }
});

test("remote tracking rows cascade with ticket and comment deletion while local ticket behavior stays intact", () => {
  const db = new KanbanDb(createDbFile());
  try {
    const board = db.createBoard({ name: "Cascade", laneNames: ["todo"] });
    const [lane] = board.lanes;
    const trackedTicket = db.createTicket({
      boardId: board.board.id,
      laneId: lane.id,
      title: "Tracked",
      bodyMarkdown: "Local body",
      priority: 4,
    });
    const plainTicket = db.createTicket({
      boardId: board.board.id,
      laneId: lane.id,
      title: "Plain",
      bodyMarkdown: "Plain body",
      priority: 2,
    });
    const trackedComment = db.addComment({
      ticketId: trackedTicket.id,
      bodyMarkdown: "Tracked comment",
    });

    db.upsertTicketRemoteLink({
      ticketId: trackedTicket.id,
      provider: "github",
      instanceUrl: "https://github.com",
      projectKey: "acme/kanbalone",
      issueKey: "124",
      displayRef: "acme/kanbalone#124",
      url: "https://github.com/acme/kanbalone/issues/124",
      title: "Tracked",
      bodyMarkdown: "Remote body",
      lastSyncedAt: "2026-04-23T00:00:00.000Z",
    });
    db.upsertCommentRemoteSync({
      commentId: trackedComment.id,
      status: "push_failed",
      lastError: "timeout",
    });

    assert.equal(db.getTicket(plainTicket.id)?.title, "Plain");
    assert.equal(db.getTicket(plainTicket.id)?.bodyMarkdown, "Plain body");

    db.deleteComment(trackedComment.id);
    assert.equal(db.getCommentRemoteSync(trackedComment.id), null);

    db.deleteTicket(trackedTicket.id);
    assert.equal(db.getTicketRemoteLink(trackedTicket.id), null);
    assert.equal(db.getTicket(plainTicket.id)?.title, "Plain");
    assert.equal(db.getTicket(plainTicket.id)?.bodyMarkdown, "Plain body");
  } finally {
    db.close();
  }
});
