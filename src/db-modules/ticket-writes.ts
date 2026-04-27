import type Database from "better-sqlite3";

import type { Id } from "../types.js";

export function validateParentTicket(
  sqlite: Database.Database,
  ticketId: Id | null,
  parentTicketId: Id | null | undefined,
  boardId: Id,
): Id | null {
  if (parentTicketId == null) {
    return null;
  }
  if (ticketId != null && parentTicketId === ticketId) {
    throw new Error("Ticket cannot be its own parent");
  }
  const parent = sqlite
    .prepare("SELECT id, board_id, parent_ticket_id FROM tickets WHERE id = ?")
    .get(parentTicketId) as { id: Id; board_id: Id; parent_ticket_id: Id | null } | undefined;
  if (!parent || parent.board_id !== boardId) {
    throw new Error("Parent ticket does not belong to board");
  }
  if (parent.parent_ticket_id != null) {
    throw new Error("Child ticket cannot be a parent");
  }
  if (ticketId != null) {
    const childCount = sqlite
      .prepare("SELECT COUNT(*) AS count FROM tickets WHERE parent_ticket_id = ?")
      .get(ticketId) as { count: number };
    if (childCount.count > 0) {
      throw new Error("Ticket with children cannot become a child");
    }
  }
  return parentTicketId;
}

export function addActivity(
  sqlite: Database.Database,
  input: {
    boardId: Id;
    ticketId: Id;
    action: string;
    message: string;
    details?: Record<string, unknown>;
    createdAt: string;
  },
): void {
  sqlite
    .prepare(
      `
      INSERT INTO activity_logs (board_id, ticket_id, subject_ticket_id, action, message, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.boardId,
      input.ticketId,
      input.ticketId,
      input.action,
      input.message,
      JSON.stringify(input.details ?? {}),
      input.createdAt,
    );
}

export function replaceTicketTags(sqlite: Database.Database, ticketId: Id, tagIds: Id[]): void {
  const nextTagIds = [...new Set(tagIds)];
  if (nextTagIds.length === 0) {
    sqlite.prepare("DELETE FROM ticket_tags WHERE ticket_id = ?").run(ticketId);
  } else {
    const placeholders = nextTagIds.map(() => "?").join(", ");
    sqlite
      .prepare(`DELETE FROM ticket_tags WHERE ticket_id = ? AND tag_id NOT IN (${placeholders})`)
      .run(ticketId, ...nextTagIds);
  }
  const insert = sqlite.prepare("INSERT OR IGNORE INTO ticket_tags (ticket_id, tag_id) VALUES (?, ?)");
  nextTagIds.forEach((tagId) => insert.run(ticketId, tagId));
}

export function replaceTicketBlockers(
  sqlite: Database.Database,
  ticketId: Id,
  blockerIds: Id[],
  boardId: Id,
): void {
  const nextBlockerIds = [...new Set(blockerIds.filter((blockerId) => blockerId !== ticketId))];
  if (nextBlockerIds.length > 0) {
    const placeholders = nextBlockerIds.map(() => "?").join(", ");
    const validIds = sqlite
      .prepare(
        `
        SELECT id
        FROM tickets
        WHERE board_id = ?
          AND id IN (${placeholders})
        `,
      )
      .all(boardId, ...nextBlockerIds) as Array<{ id: Id }>;
    if (validIds.length !== nextBlockerIds.length) {
      throw new Error("Blocker ticket does not belong to board");
    }
    const reverseLinks = sqlite
      .prepare(
        `
        SELECT ticket_id
        FROM ticket_blockers
        WHERE blocker_ticket_id = ?
          AND ticket_id IN (${placeholders})
        `,
      )
      .all(ticketId, ...nextBlockerIds) as Array<{ ticket_id: Id }>;
    if (reverseLinks.length > 0) {
      throw new Error("Blocker would create a deadlock");
    }
  }
  sqlite.prepare("DELETE FROM ticket_blockers WHERE ticket_id = ?").run(ticketId);
  const insert = sqlite.prepare(
    "INSERT INTO ticket_blockers (ticket_id, blocker_ticket_id) VALUES (?, ?)",
  );
  nextBlockerIds.forEach((blockerId) => insert.run(ticketId, blockerId));
}
