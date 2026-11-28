import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ticketProjectionPageLimit, type PageOptions } from "../db-modules/ticket-pagination.js";
import { tagViewSchema } from "./schemas/tag.js";
import { ticketSummarySchema, ticketsResponseSchema } from "./schemas/ticket.js";
import { ticketListQuerySchema } from "./schemas/ticket-mutation.js";
import { ticketSelectionFilters, type TicketSelectionQuery } from "./ticket-input.js";
import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";

const ticketQuery = ticketListQuerySchema.properties;
const pagingQuery = {
  limit: { ...ticketQuery.limit, maximum: ticketProjectionPageLimit },
  cursor: ticketQuery.cursor,
};
const groupQuery = {
  ...pagingQuery,
  groupId: ticketQuery.groupId,
  order: { type: "string", enum: ["id_asc"] },
};
const referenceQuery = {
  ...pagingQuery,
  order: { type: "string", enum: ["position_asc"] },
  lane_id: ticketQuery.lane_id,
  lane_ids: ticketQuery.lane_ids,
  resolved: ticketQuery.resolved,
  archived: ticketQuery.archived,
  tag: ticketQuery.tag,
  tag_ids: ticketQuery.tag_ids,
  q: ticketQuery.q,
};
const summary = ticketSummarySchema.properties;
const referenceProperties = {
  id: summary.id,
  title: summary.title,
  laneId: summary.laneId,
  parentTicketId: summary.parentTicketId,
  isResolved: summary.isResolved,
};
const tag = tagViewSchema.properties;
const tagProperties = { id: tag.id, name: tag.name, color: tag.color };
const groupProperties = {
  ...referenceProperties,
  hasChildren: summary.hasChildren,
  priority: summary.priority,
  isArchived: summary.isArchived,
  taskCount: summary.taskCount,
  doneTaskCount: summary.doneTaskCount,
  tags: { type: "array", items: objectSchema(tagProperties) },
};

function objectSchema(properties: Record<string, unknown>) {
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

function pageSchema(ticketProperties: Record<string, unknown>) {
  return objectSchema({
    tickets: { type: "array", items: objectSchema(ticketProperties) },
    page: ticketsResponseSchema.properties.page,
  });
}

function validateQuery(properties: Record<string, unknown>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // The default validator removes extra keys. Reject them before it runs.
    if (Object.keys(request.query as object).some(key => !Object.hasOwn(properties, key))) {
      return reply.code(400).send({ error: "unsupported ticket collection query parameter" });
    }
  };
}

type ReferenceQuery = PageOptions & Omit<TicketSelectionQuery, "lane"> & {
  resolved?: string;
  archived?: "true" | "false" | "all";
  q?: string;
};

export function registerTicketCollectionProjectionRoutes(app: FastifyInstance, { db, getIdParam, parseBooleanQuery, schemas }: RegisterTicketRoutesContext): void {
  const params = schemas.idParamsSchema("boardId");
  const errors = { 400: schemas.errorSchema, 404: schemas.errorSchema, 409: schemas.errorSchema };

  app.get<{ Querystring: PageOptions & { groupId?: number } }>("/api/boards/:boardId/group-tickets", {
    preValidation: validateQuery(groupQuery),
    schema: {
      params,
      querystring: { ...objectSchema(groupQuery), required: ["limit"] },
      response: { 200: pageSchema(groupProperties), ...errors },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    if (!db.getBoard(boardId)) return reply.code(404).send({ error: "board not found" });

    const { tickets, page, revision } = db.listGroupTicketPage(boardId, request.query.groupId ?? null, request.query);
    reply.header("X-Kanbalone-Ticket-Revision", String(revision));
    reply.header("X-Kanbalone-Ticket-Page-Limit", String(ticketProjectionPageLimit));
    return { tickets, page };
  });

  app.get<{ Querystring: ReferenceQuery }>("/api/boards/:boardId/list-ticket-references", {
    preValidation: validateQuery(referenceQuery),
    schema: {
      params,
      querystring: { ...objectSchema(referenceQuery), required: ["limit"] },
      response: { 200: pageSchema(referenceProperties), ...errors },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    if (!db.getBoard(boardId)) return reply.code(404).send({ error: "board not found" });

    const query = request.query;
    const filters = {
      ...ticketSelectionFilters(query),
      resolved: parseBooleanQuery(query.resolved),
      archived: parseBooleanQuery(query.archived),
      includeArchived: query.archived === "all",
      q: query.q?.trim() || undefined,
    };
    const { tickets, page, revision } = db.listTicketReferencePage(boardId, filters, query);
    reply.header("X-Kanbalone-Ticket-Revision", String(revision));
    reply.header("X-Kanbalone-Ticket-Page-Limit", String(ticketProjectionPageLimit));
    return { tickets, page };
  });
}
