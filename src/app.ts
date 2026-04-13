import type { ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";

import fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

import { KanbanDb } from "./db.js";
import { registerBoardRoutes } from "./routes/boards.js";
import { registerLaneRoutes } from "./routes/lanes.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerTagRoutes } from "./routes/tags.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { registerWebRoutes } from "./routes/web.js";
import {
  type BoardDetailView,
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

  registerSystemRoutes(app, appMeta);
  registerBoardRoutes(app, {
    addBoardEventClient,
    db,
    getIdParam,
    publishBoardEvent,
    removeBoardEventClient,
    sanitizeStringArray,
    schemas: {
      boardCreateBodySchema,
      boardRenameBodySchema,
      boardShellResponseSchema,
      boardViewSchema,
      boardsResponseSchema,
      errorSchema,
      idParamsSchema,
      reorderBoardsBodySchema,
    },
    serializeBoardDetail,
  });

  registerLaneRoutes(app, {
    db,
    getIdParam,
    publishBoardEvent,
    schemas: {
      errorSchema,
      idParamsSchema,
      laneBodySchema,
      laneViewSchema,
      lanesResponseSchema,
      reorderLanesBodySchema,
    },
  });
  registerTagRoutes(app, {
    db,
    getIdParam,
    publishBoardEvent,
    schemas: {
      errorSchema,
      idParamsSchema,
      tagCreateBodySchema,
      tagUpdateBodySchema,
      tagViewSchema,
      tagsResponseSchema,
    },
  });

  registerTicketRoutes(app, {
    db,
    getIdParam,
    parseBooleanQuery,
    parseTicketMutationBody,
    publishBoardEvent,
    resolveResolvedFlag,
    schemas: {
      activityLogsResponseSchema,
      bulkArchiveTicketsBodySchema,
      bulkResolveTicketsBodySchema,
      bulkTransitionTicketsBodySchema,
      commentViewSchema,
      commentsResponseSchema,
      errorSchema,
      idParamsSchema,
      reorderTicketsBodySchema,
      ticketCommentBodySchema,
      ticketCommentUpdateBodySchema,
      ticketCreateBodySchema,
      ticketListQuerySchema,
      ticketRelationsSchema,
      ticketSchema,
      ticketsResponseSchema,
      ticketTransitionBodySchema,
      ticketUpdateBodySchema,
    },
    serializeTicket,
    serializeTicketRelation,
    serializeTicketSummaries,
  });

  registerWebRoutes(app);

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
