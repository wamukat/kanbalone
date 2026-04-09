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

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/boards", async () => ({ boards: db.listBoards() }));

  app.get("/api/boards/:boardId/events", async (request, reply) => {
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

  app.post("/api/boards", async (request, reply) => {
    const body = request.body as { name?: string; laneNames?: string[] };
    const name = body?.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: "name is required" });
    }
    const board = db.createBoard({ name, laneNames: sanitizeStringArray(body.laneNames) });
    publishBoardEvent(board.board.id, "board_created");
    return reply.code(201).send(board);
  });

  app.get("/api/boards/:boardId", async (request, reply) => {
    try {
      return db.getBoardDetail(getIdParam(request.params, "boardId"));
    } catch {
      return reply.code(404).send({ error: "board not found" });
    }
  });

  app.patch("/api/boards/:boardId", async (request, reply) => {
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

  app.delete("/api/boards/:boardId", async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    try {
      db.deleteBoard(boardId);
      publishBoardEvent(boardId, "board_deleted");
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "board not found" });
    }
  });

  app.get("/api/boards/:boardId/lanes", async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    return { lanes: db.listLanes(boardId) };
  });

  app.post("/api/boards/:boardId/lanes", async (request, reply) => {
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

  app.patch("/api/lanes/:laneId", async (request, reply) => {
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

  app.delete("/api/lanes/:laneId", async (request, reply) => {
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

  app.post("/api/boards/:boardId/lanes/reorder", async (request, reply) => {
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

  app.get("/api/boards/:boardId/labels", async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    return { labels: db.listLabels(boardId) };
  });

  app.post("/api/boards/:boardId/labels", async (request, reply) => {
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
      const label = db.createLabel({ boardId, name, color: body?.color?.trim() });
      publishBoardEvent(boardId);
      return reply.code(201).send(label);
    } catch {
      return reply.code(409).send({ error: "label already exists" });
    }
  });

  app.patch("/api/labels/:labelId", async (request, reply) => {
    const body = request.body as { name?: string; color?: string };
    try {
      const label = db.updateLabel(getIdParam(request.params, "labelId"), {
        name: body?.name?.trim(),
        color: body?.color?.trim(),
      });
      publishBoardEvent(label.boardId);
      return label;
    } catch {
      return reply.code(404).send({ error: "label not found" });
    }
  });

  app.delete("/api/labels/:labelId", async (request, reply) => {
    const labelId = getIdParam(request.params, "labelId");
    const label = db.getLabel(labelId);
    if (!label) {
      return reply.code(404).send({ error: "label not found" });
    }
    try {
      db.deleteLabel(labelId);
      publishBoardEvent(label.boardId);
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "label not found" });
    }
  });

  app.get("/api/boards/:boardId/tickets", async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    const query = request.query as {
      lane_id?: string;
      label?: string;
      completed?: string;
      q?: string;
    };
    return {
      tickets: db.listTickets(boardId, {
        laneId: query.lane_id ? Number(query.lane_id) : undefined,
        label: query.label?.trim() || undefined,
        completed:
          query.completed === "true" ? true : query.completed === "false" ? false : undefined,
        q: query.q?.trim() || undefined,
      }),
    };
  });

  app.post("/api/boards/:boardId/tickets", async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const body = request.body as {
      laneId?: number;
      parentTicketId?: number | null;
      title?: string;
      bodyMarkdown?: string;
      isCompleted?: boolean;
      priority?: number;
      labelIds?: number[];
      blockerIds?: number[];
    };
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
          labelIds: Array.isArray(body.labelIds) ? body.labelIds : [],
          blockerIds: Array.isArray(body.blockerIds) ? body.blockerIds : [],
        });
      publishBoardEvent(boardId);
      return reply.code(201).send(ticket);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ticket create failed";
      return reply.code(400).send({ error: message });
    }
  });

  app.get("/api/tickets/:ticketId", async (request, reply) => {
    const ticket = db.getTicket(getIdParam(request.params, "ticketId"));
    if (!ticket) {
      return reply.code(404).send({ error: "ticket not found" });
    }
    return ticket;
  });

  app.get("/api/tickets/:ticketId/comments", async (request, reply) => {
    try {
      return { comments: db.listComments(getIdParam(request.params, "ticketId")) };
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
  });

  app.get("/api/tickets/:ticketId/relations", async (request, reply) => {
    try {
      return db.getTicketRelations(getIdParam(request.params, "ticketId"));
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
  });

  app.post("/api/tickets/:ticketId/comments", async (request, reply) => {
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

  app.patch("/api/tickets/:ticketId", async (request, reply) => {
    const body = request.body as {
      laneId?: number;
      parentTicketId?: number | null;
      title?: string;
      bodyMarkdown?: string;
      isCompleted?: boolean;
      priority?: number;
      labelIds?: number[];
      blockerIds?: number[];
    };
    try {
      const ticket = db.updateTicket(getIdParam(request.params, "ticketId"), {
        laneId: body.laneId,
        parentTicketId: body.parentTicketId,
        title: body.title?.trim(),
        bodyMarkdown: body.bodyMarkdown,
        isCompleted: body.isCompleted,
        priority: typeof body.priority === "number" ? body.priority : undefined,
        labelIds: Array.isArray(body.labelIds) ? body.labelIds : undefined,
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

  app.patch("/api/tickets/:ticketId/transition", async (request, reply) => {
    const body = request.body as { laneName?: string; isCompleted?: boolean };
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

  app.delete("/api/tickets/:ticketId", async (request, reply) => {
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

  app.post("/api/boards/:boardId/tickets/reorder", async (request, reply) => {
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

  app.get("/api/boards/:boardId/export", async (request, reply) => {
    try {
      return db.exportBoard(getIdParam(request.params, "boardId"));
    } catch {
      return reply.code(404).send({ error: "board not found" });
    }
  });

  app.post("/api/boards/import", async (request, reply) => {
    const body = request.body as BoardExport | undefined;
    if (!body?.board || !Array.isArray(body.lanes) || !Array.isArray(body.labels) || !Array.isArray(body.tickets)) {
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
