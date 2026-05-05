import { renderMarkdown } from "../markdown.js";
import type {
  ActivityLogRow,
  ActivityLogView,
  BoardRow,
  BoardView,
  CommentRow,
  CommentView,
  Id,
  LaneRow,
  LaneView,
  TagRow,
  TagView,
  TicketBlockerView,
  TicketExternalReferenceView,
  TicketRemoteLinkView,
  TicketRelationView,
  TicketRow,
  TicketSummaryView,
  TicketView,
  CommentRemoteSyncView,
  TicketEventRow,
  TicketEventView,
  TicketTagReasonRow,
  TicketTagReasonView,
} from "../types.js";

export function mapBoard(row: BoardRow): BoardView {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapLane(row: LaneRow): LaneView {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    position: row.position,
  };
}

export function mapTag(row: TagRow): TagView {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    color: row.color,
  };
}

export function mapTicket(
  row: TicketRow,
  boardName: string,
  tags: TagView[],
  comments: CommentView[],
  blockers: TicketBlockerView[],
  blockedBy: TicketRelationView[],
  related: TicketRelationView[],
  parent: TicketRelationView | null,
  children: TicketRelationView[],
  remote: TicketRemoteLinkView | null,
  externalReferences: TicketExternalReferenceView[],
): TicketView {
  return {
    id: row.id,
    boardId: row.board_id,
    laneId: row.lane_id,
    parentTicketId: row.parent_ticket_id,
    hasChildren: children.length > 0,
    title: row.title,
    bodyMarkdown: row.body_markdown,
    bodyHtml: renderMarkdown(row.body_markdown),
    isResolved: Boolean(row.is_resolved),
    isArchived: Boolean(row.is_archived),
    priority: row.priority,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags,
    comments,
    blockerIds: blockers.map((blocker) => blocker.id),
    relatedIds: related.map((entry) => entry.id),
    blockers,
    blockedBy,
    related,
    parent,
    children,
    ref: formatTicketRef(boardName, row.id),
    shortRef: formatShortRef(row.id),
    remote,
    externalReferences,
  };
}

export function mapTicketSummary(
  row: TicketRow,
  boardName: string,
  hasChildren: boolean,
  tags: TagView[],
  blockerIds: Id[],
  relatedIds: Id[],
  remote: Pick<TicketRemoteLinkView, "provider" | "displayRef" | "url"> | null,
  externalReferences: TicketExternalReferenceView[],
): TicketSummaryView {
  return {
    id: row.id,
    boardId: row.board_id,
    laneId: row.lane_id,
    parentTicketId: row.parent_ticket_id,
    hasChildren,
    title: row.title,
    isResolved: Boolean(row.is_resolved),
    isArchived: Boolean(row.is_archived),
    priority: row.priority,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags,
    blockerIds,
    relatedIds,
    ref: formatTicketRef(boardName, row.id),
    shortRef: formatShortRef(row.id),
    remote,
    externalReferences,
  };
}

export function mapComment(row: CommentRow, sync: CommentRemoteSyncView): CommentView {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    bodyMarkdown: row.body_markdown,
    bodyHtml: renderMarkdown(row.body_markdown),
    createdAt: row.created_at,
    sync,
  };
}

export function mapActivityLog(row: ActivityLogRow): ActivityLogView {
  let details: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.details_json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      details = parsed as Record<string, unknown>;
    }
  } catch {
    details = {};
  }
  return {
    id: row.id,
    boardId: row.board_id,
    ticketId: row.ticket_id,
    subjectTicketId: row.subject_ticket_id,
    action: row.action,
    message: row.message,
    details,
    createdAt: row.created_at,
  };
}

export function mapTicketEvent(row: TicketEventRow): TicketEventView {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    source: row.source,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    icon: row.icon,
    data: parseObjectJson(row.data_json),
    createdAt: row.created_at,
  };
}

export function mapTicketTagReason(row: TicketTagReasonRow & TagRow): TicketTagReasonView {
  return {
    tag: mapTag(row),
    reason: row.reason,
    details: row.details_json == null ? null : parseObjectJson(row.details_json),
    reasonCommentId: row.reason_comment_id,
    attachedAt: row.attached_at,
    updatedAt: row.updated_at,
  };
}

export function sanitizePriority(value: number | undefined): number {
  if (typeof value === "undefined") {
    return 2;
  }
  if (Number.isInteger(value) && value >= 1 && value <= 4) {
    return value;
  }
  throw new Error("Priority must be 1, 2, 3, or 4");
}

export function mapRelation(
  row: {
    id: Id;
    title: string;
    lane_id: Id;
    is_resolved: number;
    priority: number;
  },
  boardName: string,
): TicketRelationView {
  return {
    id: row.id,
    title: row.title,
    laneId: row.lane_id,
    isResolved: Boolean(row.is_resolved),
    priority: row.priority,
    ref: formatTicketRef(boardName, row.id),
    shortRef: formatShortRef(row.id),
  };
}

function parseObjectJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function formatTicketRef(boardName: string, ticketId: Id): string {
  return `${boardName}#${ticketId}`;
}

function formatShortRef(ticketId: Id): string {
  return `#${ticketId}`;
}
