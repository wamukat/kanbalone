import type { KanbanDb } from "../db.js";
import type { RemoteAdapterRegistry } from "../remote/adapters.js";
import type { Id, TicketRelationView, TicketSummaryView, TicketView } from "../types.js";

export type TicketMutationBody = {
  laneId?: number;
  parentTicketId?: number | null;
  title?: string;
  bodyMarkdown?: string;
  isResolved?: boolean;
  isCompleted?: boolean;
  isArchived?: boolean;
  priority?: number;
  tagIds?: number[];
  blockerIds?: number[] | null;
  relatedIds?: number[] | null;
};

export type TicketTransitionBody = {
  laneName?: string;
  isResolved?: boolean;
  isCompleted?: boolean;
};

export type TicketMoveBody = {
  boardId?: number;
  laneId?: number;
};

export type TicketPositionBody = {
  laneId?: number;
  position?: number;
  beforeTicketId?: number | null;
  afterTicketId?: number | null;
};

export type TicketRoutesSchemas = {
  activityLogsResponseSchema: unknown;
  bulkArchiveTicketsBodySchema: unknown;
  bulkMoveTicketsBodySchema: unknown;
  bulkResolveTicketsBodySchema: unknown;
  bulkTransitionTicketsBodySchema: unknown;
  commentViewSchema: unknown;
  commentsResponseSchema: unknown;
  errorSchema: unknown;
  idParamsSchema(key: string): unknown;
  reorderTicketsBodySchema: unknown;
  ticketCommentBodySchema: unknown;
  ticketCommentUpdateBodySchema: unknown;
  ticketEventCreateBodySchema: unknown;
  ticketEventSchema: unknown;
  ticketEventsResponseSchema: unknown;
  ticketCreateBodySchema: unknown;
  ticketListQuerySchema: unknown;
  ticketMoveBodySchema: unknown;
  ticketPositionBodySchema: unknown;
  ticketRemoteImportBodySchema: unknown;
  ticketRelationsSchema: unknown;
  ticketSchema: unknown;
  ticketRemoteRefreshResponseSchema: unknown;
  ticketCommentPushResponseSchema: unknown;
  ticketsResponseSchema: unknown;
  ticketTransitionBodySchema: unknown;
  ticketUpdateBodySchema: unknown;
  ticketTagReasonSchema: unknown;
  ticketTagReasonsResponseSchema: unknown;
  ticketTagReasonSetBodySchema: unknown;
};

export type RegisterTicketRoutesContext = {
  db: KanbanDb;
  getIdParam(params: unknown, key: string): Id;
  parseBooleanQuery(value: string | undefined): boolean | undefined;
  parseTicketMutationBody(body: TicketMutationBody): TicketMutationBody;
  publishBoardEvent(boardId: Id, event?: string): void;
  remoteAdapters: RemoteAdapterRegistry;
  resolveResolvedFlag(body: { isResolved?: boolean; isCompleted?: boolean } | undefined): boolean | undefined;
  schemas: TicketRoutesSchemas;
  serializeTicket(ticket: TicketView): unknown;
  serializeTicketRelation(relation: TicketRelationView): unknown;
  serializeTicketSummaries(tickets: TicketSummaryView[]): unknown;
};
