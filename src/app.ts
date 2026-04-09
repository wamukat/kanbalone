import type { ServerResponse } from "node:http";
import path from "node:path";

import fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

import { KanbanDb } from "./db.js";
import { type BoardExport, type Id } from "./types.js";

type BuildAppOptions = {
  dbFile: string;
  staticDir?: string;
};

type TicketMutationBody = {
  laneId?: number;
  parentTicketId?: number | null;
  title?: string;
  bodyMarkdown?: string;
  isCompleted?: boolean;
  priority?: number;
  tagIds?: number[];
  blockerIds?: number[];
};

type TicketTransitionBody = {
  laneName?: string;
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

const boardViewSchema = {
  type: "object",
  required: ["id", "name", "createdAt", "updatedAt"],
  additionalProperties: false,
  properties: {
    id: positiveIntegerSchema,
    name: { type: "string" },
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

const ticketSummarySchema = {
  type: "object",
  additionalProperties: true,
  required: ["id", "boardId", "laneId", "title", "isCompleted", "priority", "ref", "shortRef"],
  properties: {
    id: positiveIntegerSchema,
    boardId: positiveIntegerSchema,
    laneId: positiveIntegerSchema,
    title: { type: "string" },
    isCompleted: { type: "boolean" },
    priority: { type: "number" },
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
    color: { type: "string", minLength: 1 },
  },
} as const;

const tagUpdateBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: "string", minLength: 1 },
    color: { type: "string", minLength: 1 },
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
    isCompleted: { type: "boolean" },
    priority: { type: "number" },
    tagIds: optionalPositiveIntegerArraySchema,
    blockerIds: optionalPositiveIntegerArraySchema,
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

const ticketListQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    lane_id: positiveIntegerSchema,
    tag: { type: "string" },
    completed: { type: "string", enum: ["true", "false"] },
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

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = fastify({ logger: false });
  const db = new KanbanDb(options.dbFile);
  const staticDir = options.staticDir ?? path.join(process.cwd(), "public");
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
    return reply.code(201).send(board);
  });

  app.get("/api/boards/:boardId", {
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
      return db.getBoardDetail(getIdParam(request.params, "boardId"));
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
      completed?: string;
      q?: string;
    };
    return {
      tickets: db.listTickets(boardId, {
        laneId: query.lane_id ? Number(query.lane_id) : undefined,
        tag: query.tag?.trim() || undefined,
        completed:
          query.completed === "true" ? true : query.completed === "false" ? false : undefined,
        q: query.q?.trim() || undefined,
      }),
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
          isCompleted: Boolean(body.isCompleted),
          priority: typeof body.priority === "number" ? body.priority : 0,
          tagIds: Array.isArray(body.tagIds) ? body.tagIds : [],
          blockerIds: Array.isArray(body.blockerIds) ? body.blockerIds : [],
        });
      publishBoardEvent(boardId);
      return reply.code(201).send(ticket);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ticket create failed";
      return reply.code(400).send({ error: message });
    }
  });

  app.get("/api/tickets/:ticketId", {
    schema: {
      params: idParamsSchema("ticketId"),
      response: {
        200: {
          type: "object",
          additionalProperties: true,
        },
        404: errorSchema,
      },
    },
  }, async (request, reply) => {
    const ticket = db.getTicket(getIdParam(request.params, "ticketId"));
    if (!ticket) {
      return reply.code(404).send({ error: "ticket not found" });
    }
    return ticket;
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

  app.get("/api/tickets/:ticketId/relations", {
    schema: {
      params: idParamsSchema("ticketId"),
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
      return db.getTicketRelations(getIdParam(request.params, "ticketId"));
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
        isCompleted: body.isCompleted,
        priority: typeof body.priority === "number" ? body.priority : undefined,
        tagIds: Array.isArray(body.tagIds) ? body.tagIds : undefined,
        blockerIds: Array.isArray(body.blockerIds) ? body.blockerIds : undefined,
      });
      publishBoardEvent(ticket.boardId);
      return ticket;
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
        body.isCompleted,
      );
      publishBoardEvent(ticket.boardId);
      return ticket;
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
      return { tickets };
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
      return reply.code(201).send(board);
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

function parseTicketMutationBody(body: TicketMutationBody): TicketMutationBody {
  return {
    laneId: body?.laneId,
    parentTicketId: body?.parentTicketId,
    title: typeof body?.title === "string" ? body.title.trim() : undefined,
    bodyMarkdown: body?.bodyMarkdown,
    isCompleted: body?.isCompleted,
    priority: typeof body?.priority === "number" ? body.priority : undefined,
    tagIds: Array.isArray(body?.tagIds) ? body.tagIds : undefined,
    blockerIds: Array.isArray(body?.blockerIds) ? body.blockerIds : undefined,
  };
}
