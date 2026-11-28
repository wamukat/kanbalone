import { registerChangeRequestLinkRoutes } from './change-request-links.js';
import { registerTicketArchiveRoutes } from "./ticket-archive.js";
import { ticketCreateInput, ticketUpdateInput, ticketSelectionFilters, rejectCompletionFlags, rejectCompletedQuery, rejectInvalidNewTagNames, type TicketSelectionQuery } from "./ticket-input.js";
import { groupErrorSchema, groupPreviewSchema } from "./schemas/group.js";
import { sendGroupError } from "./groups.js";
import type { FastifyInstance } from "fastify";

import { registerTicketActivityRoutes } from "./ticket-activity.js";
import { registerTicketBulkRoutes } from "./ticket-bulk.js";
import { registerTicketCollectionProjectionRoutes } from "./ticket-collection-projections.js";
import { registerTicketCommentRoutes } from "./ticket-comments.js";
import { registerTicketEventRoutes } from "./ticket-events.js";
import { registerTicketExternalReferenceRoutes } from "./ticket-external-references.js";
import { registerTicketRelationRoutes } from "./ticket-relations.js";
import { registerTicketReorderRoutes } from "./ticket-reorder.js";
import { registerTicketTagReasonRoutes } from "./ticket-tag-reasons.js";
import { registerTicketTaskRoutes } from "./ticket-tasks.js";
import { sanitizeRemoteRefreshError } from "../remote/errors.js";
import type {
  RegisterTicketRoutesContext,
  TicketMoveBody,
  TicketPositionBody,
  TicketTransitionBody,
} from "./ticket-route-context.js";

export function registerTicketRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext): void {
  const {
    db,
    getIdParam,
    parseBooleanQuery,
    parseTicketMutationBody,
    publishBoardEvent,
    remoteAdapters,
    schemas,
    serializeTicket,
    serializeTicketSummaries,
  } = ctx;

  registerTicketCollectionProjectionRoutes(app, ctx);
  registerTicketArchiveRoutes(app, ctx);

  app.get("/api/boards/:boardId/tickets", {
    preValidation: rejectCompletedQuery,
    schema: {
      params: schemas.idParamsSchema("boardId"),
      querystring: schemas.ticketListQuerySchema,
      response: {
        200: schemas.ticketsResponseSchema,
        400: schemas.errorSchema,
        409: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    const query = request.query as TicketSelectionQuery & {
      limit?: number;
      cursor?: string;
      include_blocker_references?: "true" | "false";
      order?: "id_asc" | "position_asc" | "completed_desc";
      priority?: string;
      parent?: string;
      resolved?: string;
      archived?: string;
      q?: string;
      groupId?: number;
      ungrouped?: string;
      includeArchived?: string;
    };
    const selectionFilters = ticketSelectionFilters(query);
    if (query.parent !== undefined && query.parent !== "none" && !Number.isSafeInteger(Number(query.parent))) {
      return reply.code(400).send({ error: "parent must be a safe positive integer or none" });
    }
    if (query.groupId !== undefined && query.ungrouped === "true") {
      return reply.code(400).send({ error: "groupId and ungrouped cannot be combined" });
    }
    if (query.groupId !== undefined) {
      const group = db.getGroup(Number(query.groupId));
      if (!group || group.boardId !== boardId) return reply.code(404).send({ error: "Group not found in this board" });
    }
    const resolvedFilter = parseBooleanQuery(query.resolved);
    const priorities = query.priority === undefined ? undefined : [...new Set(query.priority.split(",").map(Number))].sort((a, b) => a - b);
    const filters = {
      priorities: priorities?.length === 4 ? undefined : priorities,
      groupId: query.ungrouped === "true" ? null : query.groupId === undefined ? undefined : Number(query.groupId),
      ...selectionFilters,
      parentTicketId: query.parent === "none" ? null : query.parent === undefined ? undefined : Number(query.parent),
      resolved: resolvedFilter,
      archived:
        query.archived === "true" ? true : query.archived === "false" ? false : undefined,
      includeArchived: query.archived === "all" || (query.archived === undefined && query.includeArchived === "true"),
      q: query.q?.trim() || undefined,
    };
    const result = db.listTicketPage(boardId, filters, {
      limit: query.limit,
      cursor: query.cursor,
      order: query.order,
      includeBlockerReferences: query.include_blocker_references === "true",
    });
    if (result.page) reply.header("X-Kanbalone-Ticket-Revision", String(result.revision));
    return { tickets: serializeTicketSummaries(result.tickets), ...(result.page ? { page: result.page } : {}) };
  });

  app.post("/api/boards/:boardId/tickets", {
    preValidation: [rejectCompletionFlags, rejectInvalidNewTagNames],
    schema: {
      params: schemas.idParamsSchema("boardId"),
      body: schemas.ticketCreateBodySchema,
      response: {
        428: groupErrorSchema,
        201: {
          type: "object",
          additionalProperties: true,
        },
        400: groupErrorSchema,
        409: groupErrorSchema,
        404: groupErrorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const body = parseTicketMutationBody(request.body);
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!body?.laneId || !body?.title?.trim()) {
      return reply.code(400).send({ error: "laneId and title are required" });
    }
    try {
      const ticket = db.createTicket(ticketCreateInput(boardId, body));
      publishBoardEvent(boardId);
      return reply.code(201).send(serializeTicket(ticket));
    } catch (error) {
      return sendGroupError(reply, error);
    }
  });

  app.post("/api/boards/:boardId/tickets/preview", { preValidation: [rejectCompletionFlags, rejectInvalidNewTagNames], schema: {
    params: schemas.idParamsSchema("boardId"), body: schemas.ticketCreateBodySchema,
    response: { 200: groupPreviewSchema, 400: groupErrorSchema, 404: groupErrorSchema, 409: groupErrorSchema, 428: groupErrorSchema },
  } }, async (request, reply) => {
    try {
      const boardId = getIdParam(request.params, "boardId");
      if (!db.getBoard(boardId)) return reply.code(404).send({ error: "board not found" });
      const body = parseTicketMutationBody(request.body);
      if (!body.title?.trim()) return reply.code(400).send({ error: "Title is required" });
      return db.previewTicketCreate(ticketCreateInput(boardId, body));
    } catch (error) { return sendGroupError(reply, error); }
  });
  app.post("/api/tickets/:ticketId/change-preview", { preValidation: [rejectCompletionFlags, rejectInvalidNewTagNames], schema: {
    params: schemas.idParamsSchema("ticketId"), body: schemas.ticketUpdateBodySchema,
    response: { 200: groupPreviewSchema, 400: groupErrorSchema, 404: groupErrorSchema, 409: groupErrorSchema, 428: groupErrorSchema },
  } }, async (request, reply) => {
    try { return db.previewTicketChange(getIdParam(request.params, "ticketId"), ticketUpdateInput(parseTicketMutationBody(request.body))); }
    catch (error) { return sendGroupError(reply, error); }
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

  app.post("/api/tickets/:ticketId/remote-refresh", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      response: {
        200: schemas.ticketSchema,
        400: schemas.errorSchema,
        409: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const ticketId = getIdParam(request.params, "ticketId");
    const ticket = db.getTicket(ticketId);
    if (!ticket) {
      return reply.code(404).send({ error: "ticket not found" });
    }
    const remote = db.getTicketRemoteLink(ticketId);
    if (!remote) {
      return reply.code(400).send({ error: "ticket is not linked to a remote issue" });
    }
    const adapter = remoteAdapters[remote.provider];
    if (!adapter) {
      return reply.code(400).send({ error: "unsupported remote provider" });
    }
    try {
      const snapshot = await adapter.refreshIssue(remote);
      if (
        snapshot.provider !== remote.provider ||
        snapshot.instanceUrl !== remote.instanceUrl ||
        snapshot.resourceType !== remote.resourceType ||
        snapshot.projectKey !== remote.projectKey ||
        snapshot.issueKey !== remote.issueKey
      ) {
        db.addTicketActivity({
          boardId: ticket.boardId,
          ticketId,
          action: "remote_refresh_failed",
          message: "Remote issue refresh failed",
          details: {
            provider: remote.provider,
            displayRef: remote.displayRef,
            error: "remote refresh returned a different issue",
          },
        });
        return reply.code(400).send({ error: "remote refresh returned a different issue" });
      }
      const updated = db.refreshTrackedTicketFromRemote(ticketId, {
        ticketId,
        provider: snapshot.provider,
        instanceUrl: snapshot.instanceUrl,
        resourceType: snapshot.resourceType,
        projectKey: snapshot.projectKey,
        issueKey: snapshot.issueKey,
        displayRef: snapshot.displayRef,
        url: snapshot.url,
        title: snapshot.title,
        bodyMarkdown: snapshot.bodyMarkdown,
        state: snapshot.state,
        updatedAt: snapshot.updatedAt,
        lastSyncedAt: new Date().toISOString(),
      }, {
        boardId: ticket.boardId,
        action: "remote_refreshed",
        message: "Remote issue refreshed",
        details: {
          provider: snapshot.provider,
          displayRef: snapshot.displayRef,
          state: snapshot.state,
          remoteUpdatedAt: snapshot.updatedAt,
        },
      });
      publishBoardEvent(updated.boardId);
      return serializeTicket(updated);
    } catch (error) {
      const message = sanitizeRemoteRefreshError(error);
      db.addTicketActivity({
        boardId: ticket.boardId,
        ticketId,
        action: "remote_refresh_failed",
        message: "Remote issue refresh failed",
        details: {
          provider: remote.provider,
          displayRef: remote.displayRef,
          error: message,
        },
      });
      return reply.code((error as { statusCode?: number }).statusCode === 409 ? 409 : 400).send({ error: message });
    }
  });

  app.patch("/api/tickets/:ticketId", {
    preValidation: [rejectCompletionFlags, rejectInvalidNewTagNames],
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      body: schemas.ticketUpdateBodySchema,
      response: {
        428: groupErrorSchema,
        200: {
          type: "object",
          additionalProperties: true,
        },
        400: groupErrorSchema,
        409: groupErrorSchema,
        404: groupErrorSchema,
      },
    },
  }, async (request, reply) => {
    const body = parseTicketMutationBody(request.body);
    try {
      const ticket = db.updateTicket(getIdParam(request.params, "ticketId"), ticketUpdateInput(body));
      publishBoardEvent(ticket.boardId);
      return serializeTicket(ticket);
    } catch (error) {
      return sendGroupError(reply, error, true);
    }
  });

  app.patch("/api/tickets/:ticketId/transition", {
    preValidation: rejectCompletionFlags,
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      body: schemas.ticketTransitionBodySchema,
      response: {
        200: {
          type: "object",
          additionalProperties: true,
        },
        400: schemas.errorSchema,
        409: schemas.errorSchema,
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
      );
      publishBoardEvent(ticket.boardId);
      return serializeTicket(ticket);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ticket transition failed";
      const code = (error as { statusCode?: number }).statusCode === 409 ? 409 : message === "Ticket not found" ? 404 : 400;
      return reply.code(code).send({ error: message.toLowerCase() });
    }
  });

  app.patch("/api/tickets/:ticketId/position", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      body: schemas.ticketPositionBodySchema,
      response: {
        200: {
          type: "object",
          additionalProperties: true,
        },
        400: schemas.errorSchema,
        409: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as TicketPositionBody;
    if (!body?.laneId) {
      return reply.code(400).send({ error: "laneId is required" });
    }
    try {
      const ticket = db.positionTicket(
        getIdParam(request.params, "ticketId"),
        {
          laneId: body.laneId,
          position: body.position,
          beforeTicketId: body.beforeTicketId,
          afterTicketId: body.afterTicketId,
          expectedSourceLaneId: body.expectedSourceLaneId,
          expectedSourcePosition: body.expectedSourcePosition,
          expectedAnchorOrder: body.expectedAnchorOrder,
        },
      );
      publishBoardEvent(ticket.boardId);
      return serializeTicket(ticket);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ticket position failed";
      const code = (error as { statusCode?: number }).statusCode === 409 ? 409 : message === "Ticket not found" ? 404 : 400;
      return reply.code(code).send({ error: message.toLowerCase() });
    }
  });

  app.post("/api/tickets/:ticketId/move", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      body: schemas.ticketMoveBodySchema,
      response: {
        200: schemas.ticketSchema,
        400: schemas.errorSchema,
        409: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const ticketId = getIdParam(request.params, "ticketId");
    const body = request.body as TicketMoveBody;
    const current = db.getTicket(ticketId);
    if (!current) {
      return reply.code(404).send({ error: "ticket not found" });
    }
    try {
      const ticket = db.moveTicket(ticketId, {
        boardId: Number(body.boardId),
        laneId: Number(body.laneId),
      });
      publishBoardEvent(current.boardId);
      if (ticket.boardId !== current.boardId) {
        publishBoardEvent(ticket.boardId);
      }
      return serializeTicket(ticket);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ticket move failed";
      const code = message === "Board not found" ? 404 : 400;
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

  registerTicketBulkRoutes(app, ctx);
  registerTicketCommentRoutes(app, ctx);
  registerTicketEventRoutes(app, ctx);
  registerTicketActivityRoutes(app, ctx);
  registerTicketTaskRoutes(app, ctx);
  registerTicketRelationRoutes(app, ctx);
  registerTicketReorderRoutes(app, ctx);
  registerTicketTagReasonRoutes(app, ctx);
  registerTicketExternalReferenceRoutes(app, ctx);
  registerChangeRequestLinkRoutes(app, ctx);
}
