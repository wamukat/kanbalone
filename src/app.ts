import type { ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";

import fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

import { KanbanDb } from "./db.js";
import {
  type BoardDetailView,
  type BoardExport,
  type Id,
  type TicketRelationView,
  type TicketSummaryView,
  type TicketView,
} from "./types.js";

type BuildAppOptions = {
  dbFile: string;
  staticDir?: string;
};

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

const positiveIntegerSchema = { type: "integer", minimum: 1 } as const;

const optionalPositiveIntegerArraySchema = {
  type: "array",
  items: positiveIntegerSchema,
} as const;

const errorSchema = {
  type: "object",
  required: ["error"],
  additionalProperties: false,
  properties: {
    error: { type: "string" },
  },
} as const;

const healthResponseSchema = {
  type: "object",
  required: ["ok"],
  additionalProperties: false,
  properties: {
    ok: { type: "boolean" },
  },
} as const;

const metaResponseSchema = {
  type: "object",
  required: ["name", "version"],
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    version: { type: "string" },
  },
} as const;

const boardViewSchema = {
  type: "object",
  required: ["id", "name", "position", "createdAt", "updatedAt"],
  additionalProperties: false,
  properties: {
    id: positiveIntegerSchema,
    name: { type: "string" },
    position: { type: "integer", minimum: 0 },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

const laneViewSchema = {
  type: "object",
  required: ["id", "boardId", "name", "position"],
  additionalProperties: false,
  properties: {
    id: positiveIntegerSchema,
    boardId: positiveIntegerSchema,
    name: { type: "string" },
    position: { type: "integer", minimum: 0 },
  },
} as const;

const tagViewSchema = {
  type: "object",
  required: ["id", "boardId", "name", "color"],
  additionalProperties: false,
  properties: {
    id: positiveIntegerSchema,
    boardId: positiveIntegerSchema,
    name: { type: "string" },
    color: { type: "string" },
  },
} as const;

const commentViewSchema = {
  type: "object",
  required: ["id", "ticketId", "bodyMarkdown", "bodyHtml", "createdAt"],
  additionalProperties: false,
  properties: {
    id: positiveIntegerSchema,
    ticketId: positiveIntegerSchema,
    bodyMarkdown: { type: "string" },
    bodyHtml: { type: "string" },
    createdAt: { type: "string" },
  },
} as const;

const activityLogViewSchema = {
  type: "object",
  required: ["id", "boardId", "ticketId", "subjectTicketId", "action", "message", "details", "createdAt"],
  additionalProperties: false,
  properties: {
    id: positiveIntegerSchema,
    boardId: positiveIntegerSchema,
    ticketId: { anyOf: [positiveIntegerSchema, { type: "null" }] },
    subjectTicketId: positiveIntegerSchema,
    action: { type: "string" },
    message: { type: "string" },
    details: { type: "object", additionalProperties: true },
    createdAt: { type: "string" },
  },
} as const;

const boardsResponseSchema = {
  type: "object",
  required: ["boards"],
  additionalProperties: false,
  properties: {
    boards: {
      type: "array",
      items: boardViewSchema,
    },
  },
} as const;

const lanesResponseSchema = {
  type: "object",
  required: ["lanes"],
  additionalProperties: false,
  properties: {
    lanes: {
      type: "array",
      items: laneViewSchema,
    },
  },
} as const;

const tagsResponseSchema = {
  type: "object",
  required: ["tags"],
  additionalProperties: false,
  properties: {
    tags: {
      type: "array",
      items: tagViewSchema,
    },
  },
} as const;

const boardShellResponseSchema = {
  type: "object",
  required: ["board", "lanes", "tags"],
  additionalProperties: false,
  properties: {
    board: boardViewSchema,
    lanes: {
      type: "array",
      items: laneViewSchema,
    },
    tags: {
      type: "array",
      items: tagViewSchema,
    },
  },
} as const;

const commentsResponseSchema = {
  type: "object",
  required: ["comments"],
  additionalProperties: false,
  properties: {
    comments: {
      type: "array",
      items: commentViewSchema,
    },
  },
} as const;

const activityLogsResponseSchema = {
  type: "object",
  required: ["activity"],
  additionalProperties: false,
  properties: {
    activity: {
      type: "array",
      items: activityLogViewSchema,
    },
  },
} as const;

const ticketRelationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "laneId", "isResolved", "isCompleted", "priority", "ref", "shortRef"],
  properties: {
    id: positiveIntegerSchema,
    title: { type: "string" },
    laneId: positiveIntegerSchema,
    isResolved: { type: "boolean" },
    isCompleted: { type: "boolean" },
    priority: { type: "number" },
    ref: { type: "string" },
    shortRef: { type: "string" },
  },
} as const;

const ticketRelationsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["parent", "children", "blockers", "blockedBy"],
  properties: {
    parent: { anyOf: [ticketRelationSchema, { type: "null" }] },
    children: {
      type: "array",
      items: ticketRelationSchema,
    },
    blockers: {
      type: "array",
      items: ticketRelationSchema,
    },
    blockedBy: {
      type: "array",
      items: ticketRelationSchema,
    },
  },
} as const;

const ticketSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "boardId",
    "laneId",
    "parentTicketId",
    "title",
    "bodyMarkdown",
    "bodyHtml",
    "isResolved",
    "isCompleted",
    "isArchived",
    "priority",
    "position",
    "createdAt",
    "updatedAt",
    "tags",
    "comments",
    "blockerIds",
    "blockers",
    "blockedBy",
    "parent",
    "children",
    "ref",
    "shortRef",
  ],
  properties: {
    id: positiveIntegerSchema,
    boardId: positiveIntegerSchema,
    laneId: positiveIntegerSchema,
    parentTicketId: { anyOf: [positiveIntegerSchema, { type: "null" }] },
    title: { type: "string" },
    bodyMarkdown: { type: "string" },
    bodyHtml: { type: "string" },
    isResolved: { type: "boolean" },
    isCompleted: { type: "boolean" },
    isArchived: { type: "boolean" },
    priority: { type: "number" },
    position: { type: "integer", minimum: 0 },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    tags: {
      type: "array",
      items: tagViewSchema,
    },
    comments: {
      type: "array",
      items: commentViewSchema,
    },
    blockerIds: {
      type: "array",
      items: positiveIntegerSchema,
    },
    blockers: {
      type: "array",
      items: ticketRelationSchema,
    },
    blockedBy: {
      type: "array",
      items: ticketRelationSchema,
    },
    parent: { anyOf: [ticketRelationSchema, { type: "null" }] },
    children: {
      type: "array",
      items: ticketRelationSchema,
    },
    ref: { type: "string" },
    shortRef: { type: "string" },
  },
} as const;

const ticketSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "boardId",
    "laneId",
    "parentTicketId",
    "title",
    "isResolved",
    "isCompleted",
    "isArchived",
    "priority",
    "position",
    "createdAt",
    "updatedAt",
    "tags",
    "blockerIds",
    "ref",
    "shortRef",
  ],
  properties: {
    id: positiveIntegerSchema,
    boardId: positiveIntegerSchema,
    laneId: positiveIntegerSchema,
    parentTicketId: { anyOf: [positiveIntegerSchema, { type: "null" }] },
    title: { type: "string" },
    isResolved: { type: "boolean" },
    isCompleted: { type: "boolean" },
    isArchived: { type: "boolean" },
    priority: { type: "number" },
    position: { type: "integer", minimum: 0 },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    tags: {
      type: "array",
      items: tagViewSchema,
    },
    blockerIds: {
      type: "array",
      items: positiveIntegerSchema,
    },
    ref: { type: "string" },
    shortRef: { type: "string" },
  },
} as const;

const ticketsResponseSchema = {
  type: "object",
  required: ["tickets"],
  additionalProperties: false,
  properties: {
    tickets: {
      type: "array",
      items: ticketSummarySchema,
    },
  },
} as const;

function idParamsSchema(key: string) {
  return {
    type: "object",
    required: [key],
    additionalProperties: false,
    properties: {
      [key]: positiveIntegerSchema,
    },
  } as const;
}

const boardCreateBodySchema = {
  type: "object",
  required: ["name"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
    laneNames: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
  },
} as const;

const boardRenameBodySchema = {
  type: "object",
  required: ["name"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
  },
} as const;

const reorderBoardsBodySchema = {
  type: "object",
  required: ["boardIds"],
  additionalProperties: false,
  properties: {
    boardIds: optionalPositiveIntegerArraySchema,
  },
} as const;

const laneBodySchema = {
  type: "object",
  required: ["name"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
  },
} as const;

const reorderLanesBodySchema = {
  type: "object",
  required: ["laneIds"],
  additionalProperties: false,
  properties: {
    laneIds: optionalPositiveIntegerArraySchema,
  },
} as const;

const tagCreateBodySchema = {
  type: "object",
  required: ["name"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
    color: { type: "string" },
  },
} as const;

const tagUpdateBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: "string", minLength: 1 },
    color: { type: "string" },
  },
} as const;

const ticketMutationBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    laneId: positiveIntegerSchema,
    parentTicketId: {
      anyOf: [positiveIntegerSchema, { type: "null" }],
    },
    title: { type: "string", minLength: 1 },
    bodyMarkdown: { type: "string" },
    isResolved: { type: "boolean" },
    isCompleted: { type: "boolean" },
    isArchived: { type: "boolean" },
    priority: { type: "number" },
    tagIds: optionalPositiveIntegerArraySchema,
    blockerIds: {
      anyOf: [optionalPositiveIntegerArraySchema, { type: "null" }],
    },
  },
} as const;

const ticketCreateBodySchema = {
  ...ticketMutationBodySchema,
  required: ["laneId", "title"],
} as const;

const ticketUpdateBodySchema = {
  ...ticketMutationBodySchema,
  minProperties: 1,
} as const;

const ticketTransitionBodySchema = {
  type: "object",
  required: ["laneName"],
  additionalProperties: false,
  properties: {
    laneName: { type: "string", minLength: 1 },
    isResolved: { type: "boolean" },
    isCompleted: { type: "boolean" },
  },
} as const;

const ticketCommentBodySchema = {
  type: "object",
  required: ["bodyMarkdown"],
  additionalProperties: false,
  properties: {
    bodyMarkdown: { type: "string", minLength: 1 },
  },
} as const;

const ticketCommentUpdateBodySchema = {
  type: "object",
  required: ["bodyMarkdown"],
  additionalProperties: false,
  properties: {
    bodyMarkdown: { type: "string", minLength: 1 },
  },
} as const;

const ticketListQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    lane_id: positiveIntegerSchema,
    tag: { type: "string" },
    resolved: { type: "string", enum: ["true", "false"] },
    completed: { type: "string", enum: ["true", "false"] },
    archived: { type: "string", enum: ["true", "false", "all"] },
    q: { type: "string" },
  },
} as const;

const reorderTicketsBodySchema = {
  type: "object",
  required: ["items"],
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["ticketId", "laneId", "position"],
        additionalProperties: false,
        properties: {
          ticketId: positiveIntegerSchema,
          laneId: positiveIntegerSchema,
          position: { type: "integer", minimum: 0 },
        },
      },
    },
  },
} as const;

const bulkResolveTicketsBodySchema = {
  type: "object",
  required: ["ticketIds"],
  additionalProperties: false,
  properties: {
    ticketIds: optionalPositiveIntegerArraySchema,
    isResolved: { type: "boolean" },
    isCompleted: { type: "boolean" },
  },
} as const;

const bulkTransitionTicketsBodySchema = {
  type: "object",
  required: ["ticketIds", "laneName"],
  additionalProperties: false,
  properties: {
    ticketIds: optionalPositiveIntegerArraySchema,
    laneName: { type: "string", minLength: 1 },
    isResolved: { type: "boolean" },
    isCompleted: { type: "boolean" },
  },
} as const;

const bulkArchiveTicketsBodySchema = {
  type: "object",
  required: ["ticketIds", "isArchived"],
  additionalProperties: false,
  properties: {
    ticketIds: optionalPositiveIntegerArraySchema,
    isArchived: { type: "boolean" },
  },
} as const;

type ApiTicketRelationView = TicketRelationView & { isCompleted: boolean };
type ApiTicketSummaryView = TicketSummaryView & { isCompleted: boolean };
type ApiTicketView = Omit<TicketView, "parent" | "children" | "blockers" | "blockedBy"> & {
  isCompleted: boolean;
  parent: ApiTicketRelationView | null;
  children: ApiTicketRelationView[];
  blockers: ApiTicketRelationView[];
  blockedBy: ApiTicketRelationView[];
};

function serializeTicketRelation(relation: TicketRelationView): ApiTicketRelationView {
  return { ...relation, isCompleted: relation.isResolved };
}

function serializeTicketSummary(ticket: TicketSummaryView): ApiTicketSummaryView {
  return { ...ticket, isCompleted: ticket.isResolved };
}

function serializeTicket(ticket: TicketView): ApiTicketView {
  return {
    ...ticket,
    isCompleted: ticket.isResolved,
    parent: ticket.parent ? serializeTicketRelation(ticket.parent) : null,
    children: ticket.children.map(serializeTicketRelation),
    blockers: ticket.blockers.map(serializeTicketRelation),
    blockedBy: ticket.blockedBy.map(serializeTicketRelation),
  };
}

function serializeTicketSummaries(tickets: TicketSummaryView[]): ApiTicketSummaryView[] {
  return tickets.map(serializeTicketSummary);
}

function serializeBoardDetail(detail: BoardDetailView): Omit<BoardDetailView, "tickets"> & { tickets: ApiTicketView[] } {
  return { ...detail, tickets: detail.tickets.map(serializeTicket) };
}

function readPackageMeta(): { name: string; version: string } {
  const fallback = { name: "SoloBoard", version: "0.0.0" };
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { name?: string; version?: string };
    return {
      name: "SoloBoard",
      version: typeof parsed.version === "string" ? parsed.version : fallback.version,
    };
  } catch {
    return fallback;
  }
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = fastify({ logger: false, bodyLimit: 64 * 1024 * 1024 });
  const db = new KanbanDb(options.dbFile);
  const staticDir = options.staticDir ?? path.join(process.cwd(), "public");
  const appMeta = readPackageMeta();
  const boardEventClients = new Map<Id, Set<ServerResponse>>();

  function addBoardEventClient(boardId: Id, response: ServerResponse): void {
    const clients = boardEventClients.get(boardId) ?? new Set<ServerResponse>();
    clients.add(response);
    boardEventClients.set(boardId, clients);
  }

  function removeBoardEventClient(boardId: Id, response: ServerResponse): void {
    const clients = boardEventClients.get(boardId);
    if (!clients) {
      return;
    }
    clients.delete(response);
    if (clients.size === 0) {
      boardEventClients.delete(boardId);
    }
  }

  function publishBoardEvent(boardId: Id, event = "board_updated"): void {
    const clients = boardEventClients.get(boardId);
    if (!clients || clients.size === 0) {
      return;
    }
    const payload = `data: ${JSON.stringify({ boardId, event, sentAt: new Date().toISOString() })}\n\n`;
    for (const client of [...clients]) {
      if (client.destroyed || client.writableEnded) {
        removeBoardEventClient(boardId, client);
        continue;
      }
      client.write(payload);
    }
  }

  app.addHook("onClose", async () => {
    for (const clients of boardEventClients.values()) {
      for (const client of clients) {
        if (!client.destroyed && !client.writableEnded) {
          client.end();
        }
      }
    }
    boardEventClients.clear();
    db.close();
  });

  app.register(fastifyStatic, {
    root: staticDir,
    prefix: "/",
  });

  app.get("/api/health", {
    schema: {
      response: {
        200: healthResponseSchema,
      },
    },
  }, async () => ({ ok: true }));

  app.get("/api/meta", {
    schema: {
      response: {
        200: metaResponseSchema,
      },
    },
  }, async () => appMeta);

  app.get("/api/boards", {
    schema: {
      response: {
        200: boardsResponseSchema,
      },
    },
  }, async () => ({ boards: db.listBoards() }));

  app.get("/api/boards/:boardId/events", {
    schema: {
      params: idParamsSchema("boardId"),
      response: {
        404: errorSchema,
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
      body: boardCreateBodySchema,
      response: {
        201: {
          type: "object",
          additionalProperties: true,
        },
        400: errorSchema,
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
      params: idParamsSchema("boardId"),
      response: {
        200: boardShellResponseSchema,
        404: errorSchema,
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
      params: idParamsSchema("boardId"),
      body: boardRenameBodySchema,
      response: {
        200: boardViewSchema,
        400: errorSchema,
        404: errorSchema,
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
      params: idParamsSchema("boardId"),
      response: {
        204: { type: "null" },
        404: errorSchema,
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
      body: reorderBoardsBodySchema,
      response: {
        200: boardsResponseSchema,
        400: errorSchema,
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

  app.get("/api/boards/:boardId/lanes", {
    schema: {
      params: idParamsSchema("boardId"),
      response: {
        200: lanesResponseSchema,
        404: errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    return { lanes: db.listLanes(boardId) };
  });

  app.post("/api/boards/:boardId/lanes", {
    schema: {
      params: idParamsSchema("boardId"),
      body: laneBodySchema,
      response: {
        201: laneViewSchema,
        400: errorSchema,
        404: errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const body = request.body as { name?: string };
    const name = body?.name?.trim();
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!name) {
      return reply.code(400).send({ error: "name is required" });
    }
    const lane = db.createLane({ boardId, name });
    publishBoardEvent(boardId);
    return reply.code(201).send(lane);
  });

  app.patch("/api/lanes/:laneId", {
    schema: {
      params: idParamsSchema("laneId"),
      body: laneBodySchema,
      response: {
        200: laneViewSchema,
        400: errorSchema,
        404: errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as { name?: string };
    const name = body?.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: "name is required" });
    }
    try {
      const lane = db.updateLane(getIdParam(request.params, "laneId"), name);
      publishBoardEvent(lane.boardId);
      return lane;
    } catch {
      return reply.code(404).send({ error: "lane not found" });
    }
  });

  app.delete("/api/lanes/:laneId", {
    schema: {
      params: idParamsSchema("laneId"),
      response: {
        204: { type: "null" },
        404: errorSchema,
        409: errorSchema,
      },
    },
  }, async (request, reply) => {
    const laneId = getIdParam(request.params, "laneId");
    const lane = db.getLane(laneId);
    if (!lane) {
      return reply.code(404).send({ error: "lane not found" });
    }
    try {
      db.deleteLane(laneId);
      publishBoardEvent(lane.boardId);
      return reply.code(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "lane delete failed";
      const code = message === "Lane is not empty" ? 409 : 404;
      return reply.code(code).send({ error: message.toLowerCase() });
    }
  });

  app.post("/api/boards/:boardId/lanes/reorder", {
    schema: {
      params: idParamsSchema("boardId"),
      body: reorderLanesBodySchema,
      response: {
        200: lanesResponseSchema,
        400: errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const body = request.body as { laneIds?: number[] };
    if (!Array.isArray(body?.laneIds)) {
      return reply.code(400).send({ error: "laneIds is required" });
    }
    try {
      const lanes = db.reorderLanes(boardId, body.laneIds);
      publishBoardEvent(boardId);
      return { lanes };
    } catch (error) {
      const message = error instanceof Error ? error.message : "lane reorder failed";
      return reply.code(400).send({ error: message });
    }
  });

  app.get("/api/boards/:boardId/tags", {
    schema: {
      params: idParamsSchema("boardId"),
      response: {
        200: tagsResponseSchema,
        404: errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    return { tags: db.listTags(boardId) };
  });

  app.post("/api/boards/:boardId/tags", {
    schema: {
      params: idParamsSchema("boardId"),
      body: tagCreateBodySchema,
      response: {
        201: tagViewSchema,
        400: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const body = request.body as { name?: string; color?: string };
    const name = body?.name?.trim();
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!name) {
      return reply.code(400).send({ error: "name is required" });
    }
    try {
      const tag = db.createTag({ boardId, name, color: body?.color?.trim() });
      publishBoardEvent(boardId);
      return reply.code(201).send(tag);
    } catch {
      return reply.code(409).send({ error: "tag already exists" });
    }
  });

  app.patch("/api/tags/:tagId", {
    schema: {
      params: idParamsSchema("tagId"),
      body: tagUpdateBodySchema,
      response: {
        200: tagViewSchema,
        400: errorSchema,
        404: errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as { name?: string; color?: string };
    try {
      const tag = db.updateTag(getIdParam(request.params, "tagId"), {
        name: body?.name?.trim(),
        color: body?.color?.trim(),
      });
      publishBoardEvent(tag.boardId);
      return tag;
    } catch {
      return reply.code(404).send({ error: "tag not found" });
    }
  });

  app.delete("/api/tags/:tagId", {
    schema: {
      params: idParamsSchema("tagId"),
      response: {
        204: { type: "null" },
        404: errorSchema,
      },
    },
  }, async (request, reply) => {
    const tagId = getIdParam(request.params, "tagId");
    const tag = db.getTag(tagId);
    if (!tag) {
      return reply.code(404).send({ error: "tag not found" });
    }
    try {
      db.deleteTag(tagId);
      publishBoardEvent(tag.boardId);
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "tag not found" });
    }
  });

  app.get("/api/boards/:boardId/tickets", {
    schema: {
      params: idParamsSchema("boardId"),
      querystring: ticketListQuerySchema,
      response: {
        200: ticketsResponseSchema,
        404: errorSchema,
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
      params: idParamsSchema("boardId"),
      body: ticketCreateBodySchema,
      response: {
        201: {
          type: "object",
          additionalProperties: true,
        },
        400: errorSchema,
        404: errorSchema,
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
      params: idParamsSchema("boardId"),
      body: bulkResolveTicketsBodySchema,
      response: {
        200: ticketsResponseSchema,
        400: errorSchema,
        404: errorSchema,
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
      params: idParamsSchema("boardId"),
      body: bulkTransitionTicketsBodySchema,
      response: {
        200: ticketsResponseSchema,
        400: errorSchema,
        404: errorSchema,
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
      params: idParamsSchema("boardId"),
      body: bulkArchiveTicketsBodySchema,
      response: {
        200: ticketsResponseSchema,
        400: errorSchema,
        404: errorSchema,
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
      params: idParamsSchema("ticketId"),
      response: {
        200: ticketSchema,
        404: errorSchema,
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
      params: idParamsSchema("ticketId"),
      response: {
        200: commentsResponseSchema,
        404: errorSchema,
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
      params: idParamsSchema("ticketId"),
      response: {
        200: activityLogsResponseSchema,
        404: errorSchema,
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
      params: idParamsSchema("ticketId"),
      response: {
        200: ticketRelationsSchema,
        404: errorSchema,
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
      params: idParamsSchema("ticketId"),
      body: ticketCommentBodySchema,
      response: {
        201: commentViewSchema,
        400: errorSchema,
        404: errorSchema,
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
      params: idParamsSchema("commentId"),
      body: ticketCommentUpdateBodySchema,
      response: {
        200: commentViewSchema,
        400: errorSchema,
        404: errorSchema,
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
      params: idParamsSchema("commentId"),
      response: {
        204: { type: "null" },
        404: errorSchema,
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
      params: idParamsSchema("ticketId"),
      body: ticketUpdateBodySchema,
      response: {
        200: {
          type: "object",
          additionalProperties: true,
        },
        400: errorSchema,
        404: errorSchema,
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
      params: idParamsSchema("ticketId"),
      body: ticketTransitionBodySchema,
      response: {
        200: {
          type: "object",
          additionalProperties: true,
        },
        400: errorSchema,
        404: errorSchema,
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
      params: idParamsSchema("ticketId"),
      response: {
        204: { type: "null" },
        404: errorSchema,
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
      params: idParamsSchema("boardId"),
      body: reorderTicketsBodySchema,
      response: {
        200: ticketsResponseSchema,
        400: errorSchema,
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

  app.get("/api/boards/:boardId/export", {
    schema: {
      params: idParamsSchema("boardId"),
      response: {
        200: {
          type: "object",
          additionalProperties: true,
        },
        404: errorSchema,
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

  app.get("/", async (_request, reply) => {
    return reply.sendFile("index.html");
  });

  app.get("/boards/:boardId", async (_request, reply) => {
    return reply.sendFile("index.html");
  });

  app.get("/boards/:boardId/list", async (_request, reply) => {
    return reply.sendFile("index.html");
  });

  app.get("/tickets/:ticketId", async (_request, reply) => {
    return reply.sendFile("index.html");
  });

  setErrorHandler(app);
  return app;
}

function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (reply.sent) {
      return;
    }
    if (error instanceof Error && typeof error === "object" && "validation" in error) {
      reply.code(400).send({ error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : "internal server error";
    reply.code(500).send({ error: message });
  });
}

function getIdParam(params: unknown, key: string): Id {
  const value = (params as Record<string, string | undefined>)[key];
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid ${key}`);
  }
  return parsed;
}

function sanitizeStringArray(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }
  const result = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return result.length > 0 ? result : undefined;
}

function parseBooleanQuery(value: string | undefined): boolean | undefined {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function resolveResolvedFlag(body: { isResolved?: boolean; isCompleted?: boolean } | undefined): boolean | undefined {
  if (typeof body?.isResolved === "boolean") {
    return body.isResolved;
  }
  return body?.isCompleted;
}

function parseTicketMutationBody(body: TicketMutationBody): TicketMutationBody {
  const hasParentTicketId = Object.prototype.hasOwnProperty.call(body ?? {}, "parentTicketId");
  const hasBlockerIds = Object.prototype.hasOwnProperty.call(body ?? {}, "blockerIds");
  return {
    laneId: body?.laneId,
    parentTicketId: hasParentTicketId ? body?.parentTicketId ?? null : undefined,
    title: typeof body?.title === "string" ? body.title.trim() : undefined,
    bodyMarkdown: body?.bodyMarkdown,
    isResolved: resolveResolvedFlag(body),
    isCompleted: body?.isCompleted,
    isArchived: body?.isArchived,
    priority: typeof body?.priority === "number" ? body.priority : undefined,
    tagIds: Array.isArray(body?.tagIds) ? body.tagIds : undefined,
    blockerIds: hasBlockerIds ? (Array.isArray(body?.blockerIds) ? body.blockerIds : []) : undefined,
  };
}
