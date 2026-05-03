import type { FastifyInstance } from "fastify";

import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";
import { getBodyBoolean, getBodyNumber, getBodyNumberArray, getBodyString } from "../route-helpers.js";

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
    const ticketIds = getBodyNumberArray(request.body, "ticketIds");
    const isResolvedBody = {
      isResolved: getBodyBoolean(request.body, "isResolved"),
      isCompleted: getBodyBoolean(request.body, "isCompleted"),
    };
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!ticketIds || ticketIds.length === 0) {
      return reply.code(400).send({ error: "ticketids is required" });
    }
    try {
      const isResolved = resolveResolvedFlag(isResolvedBody);
      if (typeof isResolved !== "boolean") {
        return reply.code(400).send({ error: "isresolved is required" });
      }
      const tickets = db.bulkResolveTickets({
        boardId,
        ticketIds,
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
    const ticketIds = getBodyNumberArray(request.body, "ticketIds");
    const laneName = getBodyString(request.body, "laneName");
    const isResolvedBody = {
      isResolved: getBodyBoolean(request.body, "isResolved"),
      isCompleted: getBodyBoolean(request.body, "isCompleted"),
    };
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!ticketIds || ticketIds.length === 0) {
      return reply.code(400).send({ error: "ticketids is required" });
    }
    if (!laneName) {
      return reply.code(400).send({ error: "lanename is required" });
    }
    try {
      const tickets = db.bulkTransitionTickets({
        boardId,
        ticketIds,
        laneName,
        isResolved: resolveResolvedFlag(isResolvedBody),
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
    const ticketIds = getBodyNumberArray(request.body, "ticketIds");
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!ticketIds || ticketIds.length === 0) {
      return reply.code(400).send({ error: "ticketids is required" });
    }
    try {
      const tickets = db.bulkArchiveTickets({
        boardId,
        ticketIds,
        isArchived: Boolean(getBodyBoolean(request.body, "isArchived")),
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
    const ticketIds = getBodyNumberArray(request.body, "ticketIds");
    const targetBoardId = getBodyNumber(request.body, "boardId");
    const laneId = getBodyNumber(request.body, "laneId");
    if (!db.getBoard(sourceBoardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!ticketIds || ticketIds.length === 0) {
      return reply.code(400).send({ error: "ticketids is required" });
    }
    if (!targetBoardId || !laneId) {
      return reply.code(400).send({ error: "boardid and laneid are required" });
    }
    try {
      const tickets = db.bulkMoveTickets({
        sourceBoardId,
        ticketIds,
        boardId: targetBoardId,
        laneId,
      });
      publishBoardEvent(sourceBoardId);
      if (sourceBoardId !== targetBoardId) {
        publishBoardEvent(targetBoardId);
      }
      return { tickets: serializeTicketSummaries(tickets) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "bulk move failed";
      return reply.code(400).send({ error: message.toLowerCase() });
    }
  });
}
