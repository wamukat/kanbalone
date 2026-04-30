import type { FastifyInstance } from "fastify";

import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";

export function registerTicketRelationRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext): void {
  const { db, getIdParam, schemas, serializeTicketRelation } = ctx;

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
