import type { FastifyInstance } from "fastify";

import { ticketRelationCandidateQuerySchema, ticketRelationCandidatesResponseSchema } from "./schemas/ticket.js";
import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";

export function registerTicketRelationRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext): void {
  const { db, getIdParam, schemas, serializeTicketRelation } = ctx;

  app.get<{ Querystring: { limit: number; cursor?: string; order?: "id_asc" } }>("/api/boards/:boardId/relation-candidates", {
    async preValidation(request, reply) {
      // Fastify's default validator would silently strip unsupported filters.
      if (Object.keys(request.query).some(key => !Object.hasOwn(ticketRelationCandidateQuerySchema.properties, key))) {
        return reply.code(400).send({ error: "relation candidates accept only limit, cursor and order" });
      }
    },
    schema: {
      params: schemas.idParamsSchema("boardId"),
      querystring: ticketRelationCandidateQuerySchema,
      response: {
        200: ticketRelationCandidatesResponseSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
        409: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    const { tickets, page, revision } = db.listTicketRelationCandidatePage(boardId, request.query);
    reply.header("X-Kanbalone-Ticket-Revision", String(revision));
    return { tickets, page };
  });

  app.get("/api/tickets/:ticketId/relations", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      response: {
        200: schemas.ticketRelationsSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const relations = db.getTicketRelations(getIdParam(request.params, "ticketId"));
      return {
        parent: relations.parent ? serializeTicketRelation(relations.parent) : null,
        children: relations.children.map(serializeTicketRelation),
        blockers: relations.blockers.map(serializeTicketRelation),
        blockedBy: relations.blockedBy.map(serializeTicketRelation),
        related: relations.related.map(serializeTicketRelation),
      };
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
  });
}
