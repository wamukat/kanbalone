import type { FastifyInstance } from "fastify";

import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";

export function registerTicketBulkRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext): void {
  const { db, getIdParam, publishBoardEvent, resolveResolvedFlag, schemas, serializeTicketSummaries } = ctx;

  app.post("/api/boards/:boardId/tickets/bulk-complete", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      body: schemas.bulkResolveTicketsBodySchema,
      response: {
        200: schemas.ticketsResponseSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const body = request.body as { ticketIds?: number[]; isResolved?: boolean; isCompleted?: boolean };
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!Array.isArray(body.ticketIds) || body.ticketIds.length === 0) {
      return reply.code(400).send({ error: "ticketids is required" });
    }
    try {
      const isResolved = resolveResolvedFlag(body);
      if (typeof isResolved !== "boolean") {
        return reply.code(400).send({ error: "isresolved is required" });
      }
      const tickets = db.bulkResolveTickets({
        boardId,
        ticketIds: body.ticketIds,
        isResolved,
      });
      publishBoardEvent(boardId);
      return { tickets: serializeTicketSummaries(tickets) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "bulk complete failed";
      return reply.code(400).send({ error: message.toLowerCase() });
    }
  });

  app.post("/api/boards/:boardId/tickets/bulk-transition", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      body: schemas.bulkTransitionTicketsBodySchema,
      response: {
        200: schemas.ticketsResponseSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const body = request.body as { ticketIds?: number[]; laneName?: string; isResolved?: boolean; isCompleted?: boolean };
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!Array.isArray(body.ticketIds) || body.ticketIds.length === 0) {
      return reply.code(400).send({ error: "ticketids is required" });
    }
    const laneName = body.laneName?.trim();
    if (!laneName) {
      return reply.code(400).send({ error: "lanename is required" });
    }
    try {
      const tickets = db.bulkTransitionTickets({
        boardId,
        ticketIds: body.ticketIds,
        laneName,
        isResolved: resolveResolvedFlag(body),
      });
      publishBoardEvent(boardId);
      return { tickets: serializeTicketSummaries(tickets) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "bulk transition failed";
      return reply.code(400).send({ error: message.toLowerCase() });
    }
  });

  app.post("/api/boards/:boardId/tickets/bulk-archive", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      body: schemas.bulkArchiveTicketsBodySchema,
      response: {
        200: schemas.ticketsResponseSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const body = request.body as { ticketIds?: number[]; isArchived?: boolean };
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!Array.isArray(body.ticketIds) || body.ticketIds.length === 0) {
      return reply.code(400).send({ error: "ticketids is required" });
    }
    try {
      const tickets = db.bulkArchiveTickets({
        boardId,
        ticketIds: body.ticketIds,
        isArchived: Boolean(body.isArchived),
      });
      publishBoardEvent(boardId);
      return { tickets: serializeTicketSummaries(tickets) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "bulk archive failed";
      return reply.code(400).send({ error: message.toLowerCase() });
    }
  });

  app.post("/api/boards/:boardId/tickets/bulk-move", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      body: schemas.bulkMoveTicketsBodySchema,
      response: {
        200: schemas.ticketsResponseSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const sourceBoardId = getIdParam(request.params, "boardId");
    const body = request.body as { ticketIds?: number[]; boardId?: number; laneId?: number };
    if (!db.getBoard(sourceBoardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!Array.isArray(body.ticketIds) || body.ticketIds.length === 0) {
      return reply.code(400).send({ error: "ticketids is required" });
    }
    if (!body.boardId || !body.laneId) {
      return reply.code(400).send({ error: "boardid and laneid are required" });
    }
    try {
      const tickets = db.bulkMoveTickets({
        sourceBoardId,
        ticketIds: body.ticketIds,
        boardId: body.boardId,
        laneId: body.laneId,
      });
      publishBoardEvent(sourceBoardId);
      if (sourceBoardId !== body.boardId) {
        publishBoardEvent(body.boardId);
      }
      return { tickets: serializeTicketSummaries(tickets) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "bulk move failed";
      return reply.code(400).send({ error: message.toLowerCase() });
    }
  });
}
