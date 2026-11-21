import type { FastifyInstance } from "fastify";

import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";

export function registerTicketReorderRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext): void {
  const { db, getIdParam, publishBoardEvent, schemas, serializeTicketSummaries } = ctx;

  app.post("/api/lanes/:laneId/tickets/reorder", {
    schema: {
      params: schemas.idParamsSchema("laneId"),
      body: {
        type: "object", required: ["ticketIds"], additionalProperties: false,
        properties: { ticketIds: { type: "array", uniqueItems: true, items: { type: "integer", minimum: 1 } } },
      },
      response: { 200: schemas.ticketsResponseSchema, 400: schemas.errorSchema, 404: schemas.errorSchema },
    },
  }, async (request, reply) => {
    try {
      const { ticketIds } = request.body as { ticketIds: number[] };
      const result = db.reorderLaneTickets(getIdParam(request.params, "laneId"), ticketIds);
      if (ticketIds.length > 0) publishBoardEvent(result.boardId);
      return { tickets: serializeTicketSummaries(result.tickets) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "lane ticket reorder failed";
      return reply.code(message === "Lane not found" ? 404 : 400).send({ error: message });
    }
  });

}
