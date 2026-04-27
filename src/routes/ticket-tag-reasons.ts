import type { FastifyInstance } from "fastify";

import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";

export function registerTicketTagReasonRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext): void {
  const { db, getIdParam, publishBoardEvent, schemas } = ctx;

  app.get("/api/tickets/:ticketId/tag-reasons", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      response: {
        200: schemas.ticketTagReasonsResponseSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      return { tags: db.listTicketTagReasons(getIdParam(request.params, "ticketId")) };
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
  });

  app.post("/api/tickets/:ticketId/tags/:tagId", {
    schema: {
      params: {
        type: "object",
        required: ["ticketId", "tagId"],
        additionalProperties: false,
        properties: {
          ticketId: { type: "integer", minimum: 1 },
          tagId: { type: "integer", minimum: 1 },
        },
      },
      body: schemas.ticketTagReasonSetBodySchema,
      response: {
        200: schemas.ticketTagReasonSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      reason?: string | null;
      details?: Record<string, unknown> | null;
      reasonCommentId?: number | null;
    } | undefined;
    const ticketId = getIdParam(request.params, "ticketId");
    const tagId = getIdParam(request.params, "tagId");
    try {
      const result = db.setTicketTagReason({
        ticketId,
        tagId,
        reason: body?.reason ?? null,
        details: body?.details ?? null,
        reasonCommentId: body?.reasonCommentId ?? null,
      });
      const ticket = db.getTicket(ticketId);
      if (ticket) {
        publishBoardEvent(ticket.boardId);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "ticket tag reason set failed";
      const code = message === "Ticket not found" ? 404 : 400;
      return reply.code(code).send({ error: message.toLowerCase() });
    }
  });

  app.delete("/api/tickets/:ticketId/tags/:tagId", {
    schema: {
      params: {
        type: "object",
        required: ["ticketId", "tagId"],
        additionalProperties: false,
        properties: {
          ticketId: { type: "integer", minimum: 1 },
          tagId: { type: "integer", minimum: 1 },
        },
      },
      response: {
        204: { type: "null" },
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const result = db.removeTicketTag(
        getIdParam(request.params, "ticketId"),
        getIdParam(request.params, "tagId"),
      );
      publishBoardEvent(result.boardId);
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
  });
}
