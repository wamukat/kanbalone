import type { ServerResponse } from "node:http";

import type { FastifyInstance } from "fastify";

import type { KanbanDb } from "../db.js";
import { RemoteIssueAlreadyLinkedError } from "../db-modules/remote-tracking.js";
import type { RemoteAdapterRegistry } from "../remote/adapters.js";
import type { BoardDetailView, BoardExport, Id } from "../types.js";

type BoardRoutesSchemas = {
  boardCreateBodySchema: unknown;
  boardRenameBodySchema: unknown;
  boardShellResponseSchema: unknown;
  boardViewSchema: unknown;
  boardsResponseSchema: unknown;
  errorSchema: unknown;
  idParamsSchema(key: string): unknown;
  reorderBoardsBodySchema: unknown;
  ticketRemoteImportBodySchema: unknown;
  ticketSchema: unknown;
};

type RegisterBoardRoutesContext = {
  addBoardEventClient(boardId: Id, response: ServerResponse): void;
  db: KanbanDb;
  getIdParam(params: unknown, key: string): Id;
  publishBoardEvent(boardId: Id, event?: string): void;
  removeBoardEventClient(boardId: Id, response: ServerResponse): void;
  remoteAdapters: RemoteAdapterRegistry;
  sanitizeStringArray(values: unknown): string[] | undefined;
  schemas: BoardRoutesSchemas;
  serializeBoardDetail(detail: BoardDetailView): unknown;
  serializeTicket(ticket: NonNullable<ReturnType<KanbanDb["getTicket"]>>): unknown;
};

export function registerBoardRoutes(app: FastifyInstance, ctx: RegisterBoardRoutesContext): void {
  const {
    addBoardEventClient,
    db,
    getIdParam,
    publishBoardEvent,
    removeBoardEventClient,
    remoteAdapters,
    sanitizeStringArray,
    schemas,
    serializeBoardDetail,
    serializeTicket,
  } = ctx;

  app.get("/api/boards", {
    schema: {
      response: {
        200: schemas.boardsResponseSchema,
      },
    },
  }, async () => ({ boards: db.listBoards() }));

  app.get("/api/boards/:boardId/events", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      response: {
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    reply.raw.write(": connected\n\n");
    addBoardEventClient(boardId, reply.raw);

    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.write(": ping\n\n");
      }
    }, 15000);

    const cleanup = () => {
      clearInterval(heartbeat);
      removeBoardEventClient(boardId, reply.raw);
    };

    request.raw.on("close", cleanup);
    request.raw.on("end", cleanup);
    reply.hijack();
  });

  app.post("/api/boards", {
    schema: {
      body: schemas.boardCreateBodySchema,
      response: {
        201: {
          type: "object",
          additionalProperties: true,
        },
        400: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as { name?: string; laneNames?: string[] };
    const name = body?.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: "name is required" });
    }
    const board = db.createBoard({ name, laneNames: sanitizeStringArray(body.laneNames) });
    publishBoardEvent(board.board.id, "board_created");
    return reply.code(201).send(serializeBoardDetail(board));
  });

  app.get("/api/boards/:boardId", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      response: {
        200: schemas.boardShellResponseSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      return db.getBoardShell(getIdParam(request.params, "boardId"));
    } catch {
      return reply.code(404).send({ error: "board not found" });
    }
  });

  app.patch("/api/boards/:boardId", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      body: schemas.boardRenameBodySchema,
      response: {
        200: schemas.boardViewSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as { name?: string };
    const name = body?.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: "name is required" });
    }
    try {
      const board = db.updateBoard(getIdParam(request.params, "boardId"), name);
      publishBoardEvent(board.id);
      return board;
    } catch {
      return reply.code(404).send({ error: "board not found" });
    }
  });

  app.delete("/api/boards/:boardId", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      response: {
        204: { type: "null" },
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    try {
      db.deleteBoard(boardId);
      publishBoardEvent(boardId, "board_deleted");
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "board not found" });
    }
  });

  app.post("/api/boards/reorder", {
    schema: {
      body: schemas.reorderBoardsBodySchema,
      response: {
        200: schemas.boardsResponseSchema,
        400: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as { boardIds?: number[] };
    if (!Array.isArray(body?.boardIds)) {
      return reply.code(400).send({ error: "boardIds is required" });
    }
    try {
      const boards = db.reorderBoards(body.boardIds);
      return { boards };
    } catch (error) {
      const message = error instanceof Error ? error.message : "board reorder failed";
      return reply.code(400).send({ error: message });
    }
  });

  app.get("/api/boards/:boardId/export", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      response: {
        200: {
          type: "object",
          additionalProperties: true,
        },
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      return db.exportBoard(getIdParam(request.params, "boardId"));
    } catch {
      return reply.code(404).send({ error: "board not found" });
    }
  });

  app.post("/api/boards/import", async (request, reply) => {
    const body = request.body as BoardExport | undefined;
    if (!body?.board || !Array.isArray(body.lanes) || !Array.isArray(body.tags) || !Array.isArray(body.tickets)) {
      return reply.code(400).send({ error: "invalid import payload" });
    }
    try {
      const board = db.importBoard(body);
      publishBoardEvent(board.board.id, "board_imported");
      return reply.code(201).send(serializeBoardDetail(board));
    } catch (error) {
      const message = error instanceof Error ? error.message : "import failed";
      return reply.code(400).send({ error: message });
    }
  });

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
    const body = request.body as {
      provider?: string;
      laneId?: number;
      instanceUrl?: string;
      projectKey?: string;
      issueKey?: string;
      url?: string;
    };
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
      });
      publishBoardEvent(boardId);
      return reply.code(201).send(serializeTicket(ticket));
    } catch (error) {
      if (error instanceof RemoteIssueAlreadyLinkedError) {
        return reply.code(409).send({ error: "remote issue already imported" });
      }
      const message = error instanceof Error ? error.message : "remote import failed";
      const code = message === "remote issue already imported" ? 409 : 400;
      return reply.code(code).send({ error: message.toLowerCase() });
    }
  });
}
