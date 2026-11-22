import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PageOptions } from "../db-modules/ticket-pagination.js";
import { tagViewSchema } from "./schemas/tag.js";
import { ticketSummarySchema, ticketsResponseSchema } from "./schemas/ticket.js";
import { ticketListQuerySchema } from "./schemas/ticket-mutation.js";
import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";

const ticketQuery = ticketListQuerySchema.properties;
const pagingQuery = { limit: ticketQuery.limit, cursor: ticketQuery.cursor };
const groupQuery = {
  ...pagingQuery,
  groupId: ticketQuery.groupId,
  order: { type: "string", enum: ["id_asc"] },
};
const referenceQuery = {
  ...pagingQuery,
  order: { type: "string", enum: ["position_asc"] },
  lane_id: ticketQuery.lane_id,
  resolved: ticketQuery.resolved,
  archived: ticketQuery.archived,
  tag: ticketQuery.tag,
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

type ReferenceQuery = PageOptions & {
  lane_id?: number;
  resolved?: string;
  archived?: "true" | "false" | "all";
  tag?: string;
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
      laneId: query.lane_id,
      resolved: parseBooleanQuery(query.resolved),
      archived: parseBooleanQuery(query.archived),
      includeArchived: query.archived === "all",
      tag: query.tag?.trim() || undefined,
      q: query.q?.trim() || undefined,
    };
    const { tickets, page, revision } = db.listTicketReferencePage(boardId, filters, query);
    reply.header("X-Kanbalone-Ticket-Revision", String(revision));
    return { tickets, page };
  });
}
