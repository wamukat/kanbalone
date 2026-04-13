import type Database from "better-sqlite3";

import { mapActivityLog, mapComment } from "./db-mappers.js";
import { addActivity as insertActivity } from "./db-ticket-writes.js";
import { getCommentsForTicketIds } from "./db-ticket-loaders.js";
import type {
  ActivityLogRow,
  ActivityLogView,
  CommentRow,
  CommentView,
  Id,
} from "./types.js";

export type CreateCommentInput = {
  ticketId: Id;
  bodyMarkdown: string;
};

export type UpdateCommentInput = {
  commentId: Id;
  bodyMarkdown: string;
};

export function addComment(
  sqlite: Database.Database,
  input: CreateCommentInput,
  now: string,
): CommentView {
  const boardId = getTicketBoardId(sqlite, input.ticketId);
  if (!boardId) {
    throw new Error("Ticket not found");
  }
  const result = sqlite
    .prepare("INSERT INTO comments (ticket_id, body_markdown, created_at) VALUES (?, ?, ?)")
    .run(input.ticketId, input.bodyMarkdown, now);
  insertActivity(sqlite, {
    boardId,
    ticketId: input.ticketId,
    action: "comment_added",
    message: "Comment added",
    createdAt: now,
  });
  touchBoard(sqlite, boardId, now);
  return mapComment({
    id: Number(result.lastInsertRowid),
    ticket_id: input.ticketId,
    body_markdown: input.bodyMarkdown,
    created_at: now,
  });
}

export function listComments(sqlite: Database.Database, ticketId: Id): CommentView[] {
  if (!hasTicket(sqlite, ticketId)) {
    throw new Error("Ticket not found");
  }
  return getCommentsForTicketIds(sqlite, [ticketId]).get(ticketId) ?? [];
}

export function updateComment(
  sqlite: Database.Database,
  input: UpdateCommentInput,
  now: string,
): CommentView {
  const current = sqlite
    .prepare(
      `
      SELECT c.*, t.board_id
      FROM comments c
      INNER JOIN tickets t ON t.id = c.ticket_id
      WHERE c.id = ?
      `,
    )
    .get(input.commentId) as (CommentRow & { board_id: Id }) | undefined;
  if (!current) {
    throw new Error("Comment not found");
  }
  sqlite
    .prepare("UPDATE comments SET body_markdown = ? WHERE id = ?")
    .run(input.bodyMarkdown, input.commentId);
  insertActivity(sqlite, {
    boardId: current.board_id,
    ticketId: current.ticket_id,
    action: "comment_updated",
    message: "Comment updated",
    details: {
      commentId: current.id,
      oldBodyMarkdown: current.body_markdown,
      newBodyMarkdown: input.bodyMarkdown,
    },
    createdAt: now,
  });
  touchBoard(sqlite, current.board_id, now);
  return mapComment({
    id: current.id,
    ticket_id: current.ticket_id,
    body_markdown: input.bodyMarkdown,
    created_at: current.created_at,
  });
}

export function deleteComment(sqlite: Database.Database, commentId: Id, now: string): { ticketId: Id; boardId: Id } {
  const current = sqlite
    .prepare(
      `
      SELECT c.id, c.ticket_id, c.body_markdown, t.board_id
      FROM comments c
      INNER JOIN tickets t ON t.id = c.ticket_id
      WHERE c.id = ?
      `,
    )
    .get(commentId) as { id: Id; ticket_id: Id; board_id: Id; body_markdown: string } | undefined;
  if (!current) {
    throw new Error("Comment not found");
  }
  sqlite.prepare("DELETE FROM comments WHERE id = ?").run(commentId);
  insertActivity(sqlite, {
    boardId: current.board_id,
    ticketId: current.ticket_id,
    action: "comment_deleted",
    message: "Comment deleted",
    details: {
      commentId: current.id,
      deletedBodyMarkdown: current.body_markdown,
    },
    createdAt: now,
  });
  touchBoard(sqlite, current.board_id, now);
  return { ticketId: current.ticket_id, boardId: current.board_id };
}

export function listActivity(sqlite: Database.Database, ticketId: Id): ActivityLogView[] {
  const hasActivity = sqlite
    .prepare("SELECT 1 FROM activity_logs WHERE subject_ticket_id = ? LIMIT 1")
    .get(ticketId) != null;
  if (!hasTicket(sqlite, ticketId) && !hasActivity) {
    throw new Error("Ticket not found");
  }
  const rows = sqlite
    .prepare("SELECT * FROM activity_logs WHERE subject_ticket_id = ? ORDER BY created_at DESC, id DESC")
    .all(ticketId) as ActivityLogRow[];
  return rows.map(mapActivityLog);
}

function hasTicket(sqlite: Database.Database, ticketId: Id): boolean {
  const row = sqlite.prepare("SELECT id FROM tickets WHERE id = ?").get(ticketId) as { id: Id } | undefined;
  return Boolean(row);
}

function getTicketBoardId(sqlite: Database.Database, ticketId: Id): Id | null {
  const row = sqlite.prepare("SELECT board_id FROM tickets WHERE id = ?").get(ticketId) as { board_id: Id } | undefined;
  return row?.board_id ?? null;
}

function touchBoard(sqlite: Database.Database, boardId: Id, updatedAt: string): void {
  sqlite.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(updatedAt, boardId);
}
