import type { FastifyInstance } from "fastify";

import type { KanbanDb } from "../db.js";
import { RemoteIssueAlreadyLinkedError } from "../db-modules/remote-tracking.js";
import type { RemoteAdapterRegistry, RemoteIssueSnapshot } from "../remote/adapters.js";
import { sanitizeRemoteIssueLookupError } from "../remote/errors.js";
import type { Id } from "../types.js";
import type { RouteJsonSchema } from "./route-schema.js";

type BoardRemoteImportSchemas = {
  errorSchema: RouteJsonSchema;
  idParamsSchema(key: string): RouteJsonSchema;
  ticketRemoteImportBodySchema: RouteJsonSchema;
  ticketRemoteImportPreviewResponseSchema: RouteJsonSchema;
  ticketSchema: RouteJsonSchema;
};

type RegisterBoardRemoteImportRoutesContext = {
  db: KanbanDb;
  getIdParam(params: unknown, key: string): Id;
  publishBoardEvent(boardId: Id, event?: string): void;
  remoteAdapters: RemoteAdapterRegistry;
  schemas: BoardRemoteImportSchemas;
  serializeTicket(ticket: NonNullable<ReturnType<KanbanDb["getTicket"]>>): unknown;
};

type RemoteImportBody = {
  provider?: string;
  laneId?: number;
  instanceUrl?: string;
  projectKey?: string;
  issueKey?: string;
  url?: string;
  postBacklinkComment?: boolean;
  backlinkUrl?: string;
};

export function registerBoardRemoteImportRoutes(
  app: FastifyInstance,
  ctx: RegisterBoardRemoteImportRoutesContext,
): void {
  const {
    db,
    getIdParam,
    publishBoardEvent,
    remoteAdapters,
    schemas,
    serializeTicket,
  } = ctx;

  app.post("/api/boards/:boardId/remote-import", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      body: schemas.ticketRemoteImportBodySchema,
      response: {
        201: schemas.ticketSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
        409: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const body = request.body as RemoteImportBody;
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!body?.provider || !body?.laneId) {
      return reply.code(400).send({ error: "provider and laneId are required" });
    }
    const backlinkUrl = normalizeBacklinkUrl(body.backlinkUrl);
    if (body.backlinkUrl && !backlinkUrl) {
      return reply.code(400).send({ error: "backlinkUrl must be an absolute http or https URL" });
    }
    const lane = db.getLane(Number(body.laneId));
    if (!lane || lane.boardId !== boardId) {
      return reply.code(400).send({ error: "lane does not belong to board" });
    }
    const adapter = remoteAdapters[body.provider];
    if (!adapter) {
      return reply.code(400).send({ error: "unsupported remote provider" });
    }
    try {
      const snapshot = await adapter.fetchIssue({
        provider: body.provider,
        instanceUrl: body.instanceUrl,
        projectKey: body.projectKey,
        issueKey: body.issueKey,
        url: body.url,
      });
      const existingTicketId = db.findTicketIdByRemoteIdentity({
        provider: snapshot.provider,
        instanceUrl: snapshot.instanceUrl,
        resourceType: snapshot.resourceType,
        projectKey: snapshot.projectKey,
        issueKey: snapshot.issueKey,
      });
      if (existingTicketId != null) {
        return reply.code(409).send({ error: "remote issue already imported" });
      }
      const ticket = db.createTrackedTicketFromRemote({
        boardId,
        laneId: Number(body.laneId),
        title: snapshot.title,
        bodyMarkdown: snapshot.bodyMarkdown,
      }, {
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
        action: "remote_imported",
        message: "Remote issue imported",
        details: {
          provider: snapshot.provider,
          displayRef: snapshot.displayRef,
          state: snapshot.state,
          remoteUpdatedAt: snapshot.updatedAt,
          backlinkRequested: Boolean(body.postBacklinkComment),
        },
      });
      if (body.postBacklinkComment) {
        const remote = db.getTicketRemoteLink(ticket.id);
        if (remote) {
          await adapter.postComment(remote, buildRemoteImportBacklinkComment(ticket.ref, backlinkUrl ?? undefined)).then(() => {
            db.addTicketActivity({
              boardId,
              ticketId: ticket.id,
              action: "remote_backlink_posted",
              message: "Remote backlink comment posted",
              details: {
                provider: remote.provider,
                displayRef: remote.displayRef,
                hasBacklinkUrl: Boolean(backlinkUrl),
              },
            });
          }).catch(() => {
            db.addTicketActivity({
              boardId,
              ticketId: ticket.id,
              action: "remote_backlink_failed",
              message: "Remote backlink comment failed",
              details: {
                provider: remote.provider,
                displayRef: remote.displayRef,
                hasBacklinkUrl: Boolean(backlinkUrl),
              },
            });
          });
        }
      }
      publishBoardEvent(boardId);
      return reply.code(201).send(serializeTicket(ticket));
    } catch (error) {
      if (error instanceof RemoteIssueAlreadyLinkedError) {
        return reply.code(409).send({ error: "remote issue already imported" });
      }
      return reply.code(400).send({ error: sanitizeRemoteIssueLookupError(error, "remote import failed") });
    }
  });

  app.post("/api/boards/:boardId/remote-import/preview", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      body: schemas.ticketRemoteImportBodySchema,
      response: {
        200: schemas.ticketRemoteImportPreviewResponseSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const body = request.body as RemoteImportBody;
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!body?.provider || !body?.laneId) {
      return reply.code(400).send({ error: "provider and laneId are required" });
    }
    const lane = db.getLane(Number(body.laneId));
    if (!lane || lane.boardId !== boardId) {
      return reply.code(400).send({ error: "lane does not belong to board" });
    }
    const adapter = remoteAdapters[body.provider];
    if (!adapter) {
      return reply.code(400).send({ error: "unsupported remote provider" });
    }
    try {
      const snapshot = await adapter.fetchIssue({
        provider: body.provider,
        instanceUrl: body.instanceUrl,
        projectKey: body.projectKey,
        issueKey: body.issueKey,
        url: body.url,
      });
      return serializeRemoteImportPreview(db, snapshot);
    } catch (error) {
      return reply.code(400).send({ error: sanitizeRemoteIssueLookupError(error, "remote import preview failed") });
    }
  });
}

function serializeRemoteImportPreview(db: KanbanDb, snapshot: RemoteIssueSnapshot): unknown {
  const existingTicketId = db.findTicketIdByRemoteIdentity({
    provider: snapshot.provider,
    instanceUrl: snapshot.instanceUrl,
    resourceType: snapshot.resourceType,
    projectKey: snapshot.projectKey,
    issueKey: snapshot.issueKey,
  });
  const existingTicket = existingTicketId == null ? null : db.getTicket(existingTicketId);
  return {
    provider: snapshot.provider,
    instanceUrl: snapshot.instanceUrl,
    resourceType: snapshot.resourceType,
    projectKey: snapshot.projectKey,
    issueKey: snapshot.issueKey,
    displayRef: snapshot.displayRef,
    url: snapshot.url,
    title: snapshot.title,
    state: snapshot.state,
    remoteUpdatedAt: snapshot.updatedAt,
    duplicate: existingTicketId != null,
    existingTicketId,
    existingTicketRef: existingTicket?.ref ?? null,
  };
}

function buildRemoteImportBacklinkComment(ticketRef: string, backlinkUrl?: string): string {
  const trimmedUrl = backlinkUrl?.trim();
  if (trimmedUrl) {
    return `Imported into Kanbalone as ${ticketRef}: ${trimmedUrl}`;
  }
  return `Imported into Kanbalone as ${ticketRef}.`;
}

function normalizeBacklinkUrl(backlinkUrl?: string): string | null {
  const trimmed = backlinkUrl?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
