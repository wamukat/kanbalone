import type { KanbanDb } from "../db.js";
import type { RemoteAdapterRegistry } from "../remote/adapters.js";
import type { Id, TicketRelationView, TicketSummaryView, TicketView } from "../types.js";
import type { RouteJsonSchema } from "./route-schema.js";

export type TicketMutationBody = {
  groupId?: number | null;
  childTicketIds?: number[];
  groupResolution?: { groupId: number };
  expectedToken?: string;
  expectedEditToken?: string;
  expectedSelectedParents?: Array<{ticketId: number; parentTicketId: number | null}>;
  laneId?: number;
  parentTicketId?: number | null;
  title?: string;
  bodyMarkdown?: string;
  appendMarkdown?: string;
  isArchived?: boolean;
  priority?: number;
  tagIds?: number[];
  blockerIds?: number[] | null;
  relatedIds?: number[] | null;
};

export type TicketTransitionBody = {
  laneName?: string;
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
  expectedSourceLaneId?: number;
  expectedSourcePosition?: number;
  expectedAnchorOrder?: "after-before" | "before-after";
};

export type TicketExternalReferenceBody = {
  provider?: string;
  instanceUrl?: string;
  resourceType?: string;
  projectKey?: string;
  issueKey?: string;
  displayRef?: string;
  url?: string;
  title?: string | null;
};

export type TicketRoutesSchemas = {
  activityLogsResponseSchema: RouteJsonSchema;
  bulkArchiveTicketsBodySchema: RouteJsonSchema;
  bulkMoveTicketsBodySchema: RouteJsonSchema;
  bulkTransitionTicketsBodySchema: RouteJsonSchema;
  commentViewSchema: RouteJsonSchema;
  commentsResponseSchema: RouteJsonSchema;
  errorSchema: RouteJsonSchema;
  idParamsSchema(key: string): RouteJsonSchema;
  ticketCommentBodySchema: RouteJsonSchema;
  ticketCommentUpdateBodySchema: RouteJsonSchema;
  ticketEventCreateBodySchema: RouteJsonSchema;
  ticketEventSchema: RouteJsonSchema;
  ticketEventsResponseSchema: RouteJsonSchema;
  ticketExternalReferenceParamsSchema: RouteJsonSchema;
  ticketExternalReferenceSetBodySchema: RouteJsonSchema;
  ticketCreateBodySchema: RouteJsonSchema;
  ticketListQuerySchema: RouteJsonSchema;
  ticketMoveBodySchema: RouteJsonSchema;
  ticketPositionBodySchema: RouteJsonSchema;
  ticketRemoteImportBodySchema: RouteJsonSchema;
  ticketRelationsSchema: RouteJsonSchema;
  ticketSchema: RouteJsonSchema;
  ticketRemoteRefreshResponseSchema: RouteJsonSchema;
  ticketCommentPushResponseSchema: RouteJsonSchema;
  ticketsResponseSchema: RouteJsonSchema;
  ticketTransitionBodySchema: RouteJsonSchema;
  ticketUpdateBodySchema: RouteJsonSchema;
  ticketTagReasonSchema: RouteJsonSchema;
  ticketTagReasonsResponseSchema: RouteJsonSchema;
  ticketTagReasonSetBodySchema: RouteJsonSchema;
};

export type RegisterTicketRoutesContext = {
  db: KanbanDb;
  getIdParam(params: unknown, key: string): Id;
  parseBooleanQuery(value: string | undefined): boolean | undefined;
  parseTicketMutationBody(body: unknown): TicketMutationBody;
  publishBoardEvent(boardId: Id, event?: string): void;
  remoteAdapters: RemoteAdapterRegistry;
  schemas: TicketRoutesSchemas;
  serializeTicket(ticket: TicketView): unknown;
  serializeTicketRelation(relation: TicketRelationView): unknown;
  serializeTicketSummaries(tickets: TicketSummaryView[]): unknown;
};
