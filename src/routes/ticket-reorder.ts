import type { FastifyInstance } from "fastify";

import { getBodyArray } from "../route-helpers.js";
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

  app.post("/api/boards/:boardId/tickets/reorder", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      body: schemas.reorderTicketsBodySchema,
      response: {
        200: schemas.ticketsResponseSchema,
        400: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const items = getBodyArray(request.body, "items", isReorderTicketItem);
    if (!items) {
      return reply.code(400).send({ error: "items is required" });
    }
    try {
      const tickets = db.reorderTickets(boardId, items);
      publishBoardEvent(boardId);
      return { tickets: serializeTicketSummaries(tickets.map((ticket) => ({
        ...ticket,
        unresolvedBlockerCount: ticket.blockers.filter((blocker) => !blocker.isResolved).length,
      }))) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "ticket reorder failed";
      return reply.code(400).send({ error: message });
    }
  });
}

function isReorderTicketItem(item: unknown): item is { ticketId: number; laneId: number; position: number } {
  return Boolean(
    item &&
    typeof item === "object" &&
    typeof (item as { ticketId?: unknown }).ticketId === "number" &&
    typeof (item as { laneId?: unknown }).laneId === "number" &&
    typeof (item as { position?: unknown }).position === "number",
  );
}
