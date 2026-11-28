import type Database from "better-sqlite3";

import type { Id } from "../types.js";
import { addActivity } from "./ticket-writes.js";

type Reference = { id: Id; label: string; color?: string };
type HistoryValue = Reference | Reference[] | string | number | boolean | null;
type HistoryField = "board" | "lane" | "title" | "bodyMarkdown" | "priority" | "isArchived" |
  "tags" | "parent" | "children" | "blockers" | "blockedBy" | "related";
type RelationField = "parent" | "children" | "blockers" | "blockedBy" | "related";
type HistoryValues = Partial<Record<HistoryField, HistoryValue>>;
export type TicketChanges = Partial<Record<HistoryField, { before: HistoryValue; after: HistoryValue }>>;

type TicketHistory = { boardId: Id; values: HistoryValues };
type HistoryOptions = { tags?: boolean; relations?: boolean };

export function readTicketHistory(
  sqlite: Database.Database,
  ticketIds: Iterable<Id>,
  { tags, relations }: HistoryOptions = {},
): Map<Id, TicketHistory> {
  const ids = [...new Set(ticketIds)];
  if (!ids.length) return new Map();
  const selected = JSON.stringify(ids);
  const rows = sqlite.prepare(`
    SELECT t.id, t.board_id, b.name AS board_name, t.lane_id, l.name AS lane_name, t.title, t.priority, t.is_archived
    FROM tickets t JOIN boards b ON b.id = t.board_id JOIN lanes l ON l.id = t.lane_id
    WHERE t.id IN (SELECT value FROM json_each(?))
  `).all(selected) as {
    id: Id; board_id: Id; board_name: string; lane_id: Id; lane_name: string; title: string; priority: number; is_archived: number;
  }[];
  const states = new Map<Id, TicketHistory>(rows.map((row) => [row.id, {
    boardId: row.board_id,
    values: {
      board: { id: row.board_id, label: row.board_name },
      lane: { id: row.lane_id, label: row.lane_name },
      title: row.title,
      priority: row.priority,
      isArchived: Boolean(row.is_archived),
      ...(tags ? { tags: [] } : {}),
      ...(relations ? { parent: null, children: [], blockers: [], blockedBy: [], related: [] } : {}),
    },
  }]));
  if (tags) {
    const assigned = sqlite.prepare(`
      SELECT tt.ticket_id AS subject, tag.id, tag.name AS label, tag.color
      FROM ticket_tags tt JOIN tags tag ON tag.id = tt.tag_id
      WHERE tt.ticket_id IN (SELECT value FROM json_each(?))
      ORDER BY tag.id
    `).all(selected) as (Reference & { subject: Id })[];
    for (const { subject, ...tag } of assigned) (states.get(subject)?.values.tags as Reference[] | undefined)?.push(tag);
  }
  if (relations) {
    const attached = sqlite.prepare(`
      WITH selected(id) AS (SELECT value FROM json_each(?)),
      edges(subject, peer, field) AS (
        SELECT id, parent_ticket_id, 'parent' FROM tickets WHERE id IN selected AND parent_ticket_id IS NOT NULL
        UNION ALL SELECT parent_ticket_id, id, 'children' FROM tickets WHERE parent_ticket_id IN selected
        UNION ALL SELECT ticket_id, blocker_ticket_id, 'blockers' FROM ticket_blockers WHERE ticket_id IN selected
        UNION ALL SELECT blocker_ticket_id, ticket_id, 'blockedBy' FROM ticket_blockers WHERE blocker_ticket_id IN selected
        UNION ALL SELECT ticket_id, related_ticket_id, 'related' FROM ticket_related_links WHERE ticket_id IN selected
        UNION ALL SELECT related_ticket_id, ticket_id, 'related' FROM ticket_related_links WHERE related_ticket_id IN selected
      )
      SELECT edges.subject, edges.field, other.id, other.title AS label
      FROM edges JOIN tickets other ON other.id = edges.peer ORDER BY other.id
    `).all(selected) as (Reference & { subject: Id; field: RelationField })[];
    for (const { subject, field, ...peer } of attached) {
      const state = states.get(subject);
      if (!state) continue;
      if (field === "parent") state.values.parent = peer;
      else (state.values[field] as Reference[]).push(peer);
    }
  }
  return states;
}

export function ticketHistoryPeerIds(states: Iterable<TicketHistory>): Id[] {
  const ids = new Set<Id>();
  for (const { values } of states) {
    if (values.parent) ids.add((values.parent as Reference).id);
    for (const field of ["children", "blockers", "blockedBy", "related"] as const) {
      for (const peer of values[field] as Reference[] ?? []) ids.add(peer.id);
    }
  }
  return [...ids];
}

export function ticketChanges(before: TicketHistory | undefined, after: TicketHistory | undefined): TicketChanges {
  const changes: TicketChanges = {};
  if (!before || !after) return changes;
  for (const field of Object.keys(before.values) as HistoryField[]) {
    const oldValue = before.values[field];
    const newValue = after.values[field];
    if (oldValue !== undefined && newValue !== undefined && historyIdentity(oldValue) !== historyIdentity(newValue)) {
      changes[field] = { before: oldValue, after: newValue };
    }
  }
  return changes;
}

function historyIdentity(value: HistoryValue): string {
  // Labels describe the referenced entity at the time of a membership change.
  // They do not count as a replaced relation when the same entity is renamed.
  return JSON.stringify(Array.isArray(value) ? value.map(({ id }) => id) : value && typeof value === "object" ? value.id : value);
}

export function historyDetails(changes: TicketChanges) {
  return { changeVersion: 1, changes };
}

export function recordTicketPeerHistory(
  sqlite: Database.Database,
  before: Map<Id, TicketHistory>,
  after: Map<Id, TicketHistory>,
  excluded: ReadonlySet<Id>,
  createdAt: string,
): void {
  for (const [ticketId, state] of before) {
    if (excluded.has(ticketId)) continue;
    const current = after.get(ticketId);
    const changes = ticketChanges(state, current);
    if (!current || Object.keys(changes).length === 0) continue;
    addActivity(sqlite, {
      boardId: current.boardId, ticketId, createdAt,
      action: "ticket_relations_changed", message: "Ticket relations changed", details: historyDetails(changes),
    });
  }
}
