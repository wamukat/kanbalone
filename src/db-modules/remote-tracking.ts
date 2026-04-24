import type Database from "better-sqlite3";

import { renderMarkdown } from "../markdown.js";
import type {
  CommentRemoteSyncRow,
  CommentRemoteSyncView,
  Id,
  TicketRemoteLinkRow,
  TicketRemoteLinkView,
} from "../types.js";

export class RemoteIssueAlreadyLinkedError extends Error {
  constructor() {
    super("Remote issue already linked to another ticket");
  }
}

export type RemoteIdentityInput = {
  provider: string;
  instanceUrl: string;
  resourceType?: string;
  projectKey: string;
  issueKey: string;
};

export type UpsertTicketRemoteLinkInput = {
  ticketId: Id;
  provider: string;
  instanceUrl: string;
  resourceType?: string;
  projectKey: string;
  issueKey: string;
  displayRef: string;
  url: string;
  title: string;
  bodyMarkdown?: string;
  state?: string | null;
  updatedAt?: string | null;
  lastSyncedAt: string;
};

export type UpsertCommentRemoteSyncInput = {
  commentId: Id;
  status: "local_only" | "pushed" | "push_failed";
  remoteCommentId?: string | null;
  pushedAt?: string | null;
  lastError?: string | null;
};

export function getTicketRemoteLink(sqlite: Database.Database, ticketId: Id): TicketRemoteLinkView | null {
  const row = sqlite.prepare("SELECT * FROM ticket_remote_links WHERE ticket_id = ?").get(ticketId) as TicketRemoteLinkRow | undefined;
  return row ? mapTicketRemoteLink(row) : null;
}

export function upsertTicketRemoteLink(
  sqlite: Database.Database,
  input: UpsertTicketRemoteLinkInput,
  now: string,
): TicketRemoteLinkView {
  assertTicketExists(sqlite, input.ticketId);
  assertRemoteIssueNotLinkedToAnotherTicket(sqlite, input);
  sqlite.prepare(`
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ticket_id) DO UPDATE SET
      provider = excluded.provider,
      instance_url = excluded.instance_url,
      resource_type = excluded.resource_type,
      project_key = excluded.project_key,
      issue_key = excluded.issue_key,
      display_ref = excluded.display_ref,
      remote_url = excluded.remote_url,
      remote_title = excluded.remote_title,
      remote_body_markdown = excluded.remote_body_markdown,
      remote_state = excluded.remote_state,
      remote_updated_at = excluded.remote_updated_at,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `).run(
    input.ticketId,
    input.provider,
    input.instanceUrl,
    input.resourceType ?? "issue",
    input.projectKey,
    input.issueKey,
    input.displayRef,
    input.url,
    input.title,
    input.bodyMarkdown ?? "",
    input.state ?? null,
    input.updatedAt ?? null,
    input.lastSyncedAt,
    now,
    now,
  );
  return getTicketRemoteLink(sqlite, input.ticketId)!;
}

export function findTicketIdByRemoteIdentity(
  sqlite: Database.Database,
  input: RemoteIdentityInput,
): Id | null {
  const row = sqlite.prepare(`
    SELECT ticket_id
    FROM ticket_remote_links
    WHERE provider = ?
      AND instance_url = ?
      AND resource_type = ?
      AND project_key = ?
      AND issue_key = ?
    LIMIT 1
  `).get(
    input.provider,
    input.instanceUrl,
    input.resourceType ?? "issue",
    input.projectKey,
    input.issueKey,
  ) as { ticket_id: Id } | undefined;
  return row?.ticket_id ?? null;
}

export function getCommentRemoteSync(sqlite: Database.Database, commentId: Id): CommentRemoteSyncView | null {
  const row = sqlite.prepare("SELECT * FROM comment_remote_sync WHERE comment_id = ?").get(commentId) as CommentRemoteSyncRow | undefined;
  return row ? mapCommentRemoteSync(row) : null;
}

export function defaultCommentRemoteSync(commentId: Id): CommentRemoteSyncView {
  return {
    commentId,
    status: "local_only",
    remoteCommentId: null,
    pushedAt: null,
    lastError: null,
    createdAt: "",
    updatedAt: "",
  };
}

export function upsertCommentRemoteSync(
  sqlite: Database.Database,
  input: UpsertCommentRemoteSyncInput,
  now: string,
): CommentRemoteSyncView {
  assertCommentExists(sqlite, input.commentId);
  assertCommentRemoteSyncInput(input);
  sqlite.prepare(`
    INSERT INTO comment_remote_sync (
      comment_id,
      status,
      remote_comment_id,
      pushed_at,
      last_error,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(comment_id) DO UPDATE SET
      status = excluded.status,
      remote_comment_id = excluded.remote_comment_id,
      pushed_at = excluded.pushed_at,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `).run(
    input.commentId,
    input.status,
    input.remoteCommentId ?? null,
    input.pushedAt ?? null,
    input.lastError ?? null,
    now,
    now,
  );
  return getCommentRemoteSync(sqlite, input.commentId)!;
}

function mapTicketRemoteLink(row: TicketRemoteLinkRow): TicketRemoteLinkView {
  return {
    ticketId: row.ticket_id,
    provider: row.provider,
    instanceUrl: row.instance_url,
    resourceType: row.resource_type,
    projectKey: row.project_key,
    issueKey: row.issue_key,
    displayRef: row.display_ref,
    url: row.remote_url,
    title: row.remote_title,
    bodyMarkdown: row.remote_body_markdown,
    bodyHtml: renderMarkdown(row.remote_body_markdown),
    state: row.remote_state,
    remoteUpdatedAt: row.remote_updated_at,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCommentRemoteSync(row: CommentRemoteSyncRow): CommentRemoteSyncView {
  return {
    commentId: row.comment_id,
    status: row.status,
    remoteCommentId: row.remote_comment_id,
    pushedAt: row.pushed_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertTicketExists(sqlite: Database.Database, ticketId: Id): void {
  const row = sqlite.prepare("SELECT id FROM tickets WHERE id = ?").get(ticketId) as { id: Id } | undefined;
  if (!row) {
    throw new Error("Ticket not found");
  }
}

function assertCommentExists(sqlite: Database.Database, commentId: Id): void {
  const row = sqlite.prepare("SELECT id FROM comments WHERE id = ?").get(commentId) as { id: Id } | undefined;
  if (!row) {
    throw new Error("Comment not found");
  }
}

function assertRemoteIssueNotLinkedToAnotherTicket(
  sqlite: Database.Database,
  input: UpsertTicketRemoteLinkInput,
): void {
  const ticketId = findTicketIdByRemoteIdentity(sqlite, input);
  if (ticketId != null && ticketId !== input.ticketId) {
    throw new RemoteIssueAlreadyLinkedError();
  }
}

function assertCommentRemoteSyncInput(input: UpsertCommentRemoteSyncInput): void {
  if (input.status === "pushed") {
    if (!input.remoteCommentId || !input.pushedAt) {
      throw new Error("Pushed comment sync requires remoteCommentId and pushedAt");
    }
  }
}
