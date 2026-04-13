import type { FastifyInstance } from "fastify";

import type { KanbanDb } from "../db.js";
import type { Id, TicketRelationView, TicketSummaryView, TicketView } from "../types.js";

type TicketMutationBody = {
  laneId?: number;
  parentTicketId?: number | null;
  title?: string;
  bodyMarkdown?: string;
  isResolved?: boolean;
  isCompleted?: boolean;
  isArchived?: boolean;
  priority?: number;
  tagIds?: number[];
  blockerIds?: number[] | null;
};

type TicketTransitionBody = {
  laneName?: string;
  isResolved?: boolean;
  isCompleted?: boolean;
};

type TicketRoutesSchemas = {
  activityLogsResponseSchema: unknown;
  bulkArchiveTicketsBodySchema: unknown;
  bulkResolveTicketsBodySchema: unknown;
  bulkTransitionTicketsBodySchema: unknown;
  commentViewSchema: unknown;
  commentsResponseSchema: unknown;
  errorSchema: unknown;
  idParamsSchema(key: string): unknown;
  reorderTicketsBodySchema: unknown;
  ticketCommentBodySchema: unknown;
  ticketCommentUpdateBodySchema: unknown;
  ticketCreateBodySchema: unknown;
  ticketListQuerySchema: unknown;
  ticketRelationsSchema: unknown;
  ticketSchema: unknown;
  ticketsResponseSchema: unknown;
  ticketTransitionBodySchema: unknown;
  ticketUpdateBodySchema: unknown;
};

type RegisterTicketRoutesContext = {
  db: KanbanDb;
  getIdParam(params: unknown, key: string): Id;
  parseBooleanQuery(value: string | undefined): boolean | undefined;
  parseTicketMutationBody(body: TicketMutationBody): TicketMutationBody;
  publishBoardEvent(boardId: Id, event?: string): void;
  resolveResolvedFlag(body: { isResolved?: boolean; isCompleted?: boolean } | undefined): boolean | undefined;
  schemas: TicketRoutesSchemas;
  serializeTicket(ticket: TicketView): unknown;
  serializeTicketRelation(relation: TicketRelationView): unknown;
  serializeTicketSummaries(tickets: TicketSummaryView[]): unknown;
};

export function registerTicketRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext): void {
  const {
    db,
    getIdParam,
    parseBooleanQuery,
    parseTicketMutationBody,
    publishBoardEvent,
    resolveResolvedFlag,
    schemas,
    serializeTicket,
    serializeTicketRelation,
    serializeTicketSummaries,
  } = ctx;

  app.get("/api/boards/:boardId/tickets", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      querystring: schemas.ticketListQuerySchema,
      response: {
        200: schemas.ticketsResponseSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    const query = request.query as {
      lane_id?: string;
      tag?: string;
      resolved?: string;
      completed?: string;
      archived?: string;
      q?: string;
    };
    const resolvedFilter = parseBooleanQuery(query.resolved ?? query.completed);
    return {
      tickets: serializeTicketSummaries(db.listTicketSummaries(boardId, {
        laneId: query.lane_id ? Number(query.lane_id) : undefined,
        tag: query.tag?.trim() || undefined,
        resolved: resolvedFilter,
        archived:
          query.archived === "true" ? true : query.archived === "false" ? false : undefined,
        includeArchived: query.archived === "all",
        q: query.q?.trim() || undefined,
      })),
    };
  });

  app.post("/api/boards/:boardId/tickets", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      body: schemas.ticketCreateBodySchema,
      response: {
        201: {
          type: "object",
          additionalProperties: true,
        },
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const body = parseTicketMutationBody(request.body as TicketMutationBody);
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!body?.laneId || !body?.title?.trim()) {
      return reply.code(400).send({ error: "laneId and title are required" });
    }
    try {
      const ticket = db.createTicket({
          boardId,
          laneId: body.laneId,
          parentTicketId: body.parentTicketId ?? null,
          title: body.title.trim(),
          bodyMarkdown: body.bodyMarkdown ?? "",
          isResolved: Boolean(resolveResolvedFlag(body)),
          isArchived: Boolean(body.isArchived),
          priority: typeof body.priority === "number" ? body.priority : 0,
          tagIds: Array.isArray(body.tagIds) ? body.tagIds : [],
          blockerIds: Array.isArray(body.blockerIds) ? body.blockerIds : [],
        });
      publishBoardEvent(boardId);
      return reply.code(201).send(serializeTicket(ticket));
    } catch (error) {
      const message = error instanceof Error ? error.message : "ticket create failed";
      return reply.code(400).send({ error: message });
    }
  });

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

  app.get("/api/tickets/:ticketId", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      response: {
        200: schemas.ticketSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const ticket = db.getTicket(getIdParam(request.params, "ticketId"));
    if (!ticket) {
      return reply.code(404).send({ error: "ticket not found" });
    }
    return serializeTicket(ticket);
  });

  app.get("/api/tickets/:ticketId/comments", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      response: {
        200: schemas.commentsResponseSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      return { comments: db.listComments(getIdParam(request.params, "ticketId")) };
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
  });

  app.get("/api/tickets/:ticketId/activity", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      response: {
        200: schemas.activityLogsResponseSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      return { activity: db.listActivity(getIdParam(request.params, "ticketId")) };
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
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
      };
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
  });

  app.post("/api/tickets/:ticketId/comments", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      body: schemas.ticketCommentBodySchema,
      response: {
        201: schemas.commentViewSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as { bodyMarkdown?: string };
    const bodyMarkdown = body?.bodyMarkdown?.trim();
    if (!bodyMarkdown) {
      return reply.code(400).send({ error: "bodyMarkdown is required" });
    }
    try {
      const comment = db.addComment({
          ticketId: getIdParam(request.params, "ticketId"),
          bodyMarkdown,
        });
      const ticket = db.getTicket(comment.ticketId);
      if (ticket) {
        publishBoardEvent(ticket.boardId);
      }
      return reply.code(201).send(comment);
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
  });

  app.patch("/api/comments/:commentId", {
    schema: {
      params: schemas.idParamsSchema("commentId"),
      body: schemas.ticketCommentUpdateBodySchema,
      response: {
        200: schemas.commentViewSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as { bodyMarkdown?: string };
    const bodyMarkdown = body?.bodyMarkdown?.trim();
    if (!bodyMarkdown) {
      return reply.code(400).send({ error: "bodymarkdown is required" });
    }
    try {
      const comment = db.updateComment({
        commentId: getIdParam(request.params, "commentId"),
        bodyMarkdown,
      });
      const ticket = db.getTicket(comment.ticketId);
      if (ticket) {
        publishBoardEvent(ticket.boardId);
      }
      return comment;
    } catch (error) {
      const message = error instanceof Error ? error.message : "comment update failed";
      const code = message === "Comment not found" ? 404 : 400;
      return reply.code(code).send({ error: message.toLowerCase() });
    }
  });

  app.delete("/api/comments/:commentId", {
    schema: {
      params: schemas.idParamsSchema("commentId"),
      response: {
        204: { type: "null" },
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const deleted = db.deleteComment(getIdParam(request.params, "commentId"));
      publishBoardEvent(deleted.boardId);
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "comment not found" });
    }
  });

  app.patch("/api/tickets/:ticketId", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      body: schemas.ticketUpdateBodySchema,
      response: {
        200: {
          type: "object",
          additionalProperties: true,
        },
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = parseTicketMutationBody(request.body as TicketMutationBody);
    try {
      const ticket = db.updateTicket(getIdParam(request.params, "ticketId"), {
        laneId: body.laneId,
        parentTicketId: body.parentTicketId,
        title: body.title?.trim(),
        bodyMarkdown: body.bodyMarkdown,
        isResolved: resolveResolvedFlag(body),
        isArchived: body.isArchived,
        priority: typeof body.priority === "number" ? body.priority : undefined,
        tagIds: Array.isArray(body.tagIds) ? body.tagIds : undefined,
        blockerIds: Array.isArray(body.blockerIds) ? body.blockerIds : undefined,
      });
      publishBoardEvent(ticket.boardId);
      return serializeTicket(ticket);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ticket update failed";
      const code = message === "Ticket not found" ? 404 : 400;
      return reply.code(code).send({ error: message.toLowerCase() });
    }
  });

  app.patch("/api/tickets/:ticketId/transition", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      body: schemas.ticketTransitionBodySchema,
      response: {
        200: {
          type: "object",
          additionalProperties: true,
        },
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as TicketTransitionBody;
    const laneName = body?.laneName?.trim();
    if (!laneName) {
      return reply.code(400).send({ error: "lanename is required" });
    }
    try {
      const ticket = db.transitionTicket(
        getIdParam(request.params, "ticketId"),
        laneName,
        resolveResolvedFlag(body),
      );
      publishBoardEvent(ticket.boardId);
      return serializeTicket(ticket);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ticket transition failed";
      const code = message === "Ticket not found" ? 404 : 400;
      return reply.code(code).send({ error: message.toLowerCase() });
    }
  });

  app.delete("/api/tickets/:ticketId", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      response: {
        204: { type: "null" },
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const ticketId = getIdParam(request.params, "ticketId");
    const ticket = db.getTicket(ticketId);
    if (!ticket) {
      return reply.code(404).send({ error: "ticket not found" });
    }
    try {
      db.deleteTicket(ticketId);
      publishBoardEvent(ticket.boardId);
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
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
    const body = request.body as {
      items?: Array<{ ticketId: number; laneId: number; position: number }>;
    };
    if (!Array.isArray(body?.items)) {
      return reply.code(400).send({ error: "items is required" });
    }
    try {
      const tickets = db.reorderTickets(boardId, body.items);
      publishBoardEvent(boardId);
      return { tickets: serializeTicketSummaries(tickets) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "ticket reorder failed";
      return reply.code(400).send({ error: message });
    }
  });
}
