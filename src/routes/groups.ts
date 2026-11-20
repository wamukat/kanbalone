import { renderMarkdown } from "../markdown.js";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { KanbanDb } from "../db.js";
import { getIdParam } from "../route-helpers.js";
import { idParamsSchema } from "./schemas/common.js";
import { groupCreateSchema, groupErrorSchema, groupListQuerySchema, groupMembershipSchema, groupPreviewSchema, groupSchema, groupSummarySchema, groupUpdateSchema } from "./schemas/group.js";

type Context = { db: KanbanDb; publishBoardEvent(boardId: number): void };
export function sendGroupError(reply: FastifyReply, error: unknown, lowercase = false): unknown {
  const problem = error as { statusCode?: number; code?: string; details?: unknown };
  const rawMessage = error instanceof Error ? error.message : "Group operation failed";
  const message = lowercase ? rawMessage.toLowerCase() : rawMessage;
  const status = problem.statusCode ?? (/not found/i.test(message) ? 404 : 400);
  return reply.code(status).send({ error: message, ...(problem.code ? { code: problem.code } : {}), ...(problem.details ? { details: problem.details } : {}) });
}
export function registerGroupRoutes(app: FastifyInstance, { db, publishBoardEvent }: Context): void {
  app.post("/api/markdown/preview", { schema: {
    body: { type: "object", additionalProperties: false, required: ["bodyMarkdown"], properties: { bodyMarkdown: { type: "string", maxLength: 100_000 } } },
    response: { 200: { type: "object", required: ["bodyHtml"], properties: { bodyHtml: { type: "string" } } } },
  } }, async request => ({ bodyHtml: renderMarkdown((request.body as {bodyMarkdown: string}).bodyMarkdown) }));
  const errors = { 400: groupErrorSchema, 404: groupErrorSchema, 409: groupErrorSchema, 428: groupErrorSchema };
  app.get("/api/boards/:boardId/groups", { schema: {
    params: idParamsSchema("boardId"), querystring: groupListQuerySchema,
    response: { 200: { type: "object", required: ["groups"], properties: { groups: { type: "array", items: groupSummarySchema } } }, ...errors },
  } }, async (request, reply) => {
    try { return { groups: db.listGroups(getIdParam(request.params, "boardId"), request.query as {status?: "active"|"inactive"|"all"; sort?: "createdAt"|"name"; order?: "asc"|"desc"}) }; }
    catch (error) { return sendGroupError(reply, error); }
  });
  app.post("/api/boards/:boardId/groups", { schema: { params: idParamsSchema("boardId"), body: groupCreateSchema, response: { 201: groupSchema, ...errors } } }, async (request, reply) => {
    try {
      const boardId = getIdParam(request.params, "boardId");
      const group = db.createGroup({ boardId, ...request.body as {name: string; descriptionMarkdown?: string} });
      publishBoardEvent(boardId);
      return reply.code(201).header("ETag", `"${group.revision}"`).send(group);
    } catch (error) { return sendGroupError(reply, error); }
  });
  app.get("/api/groups/:groupId", { schema: { params: idParamsSchema("groupId"), response: { 200: groupSchema, ...errors } } }, async (request, reply) => {
    try {
      const group = db.getGroup(getIdParam(request.params, "groupId"));
      if (!group) return reply.code(404).send({ error: "Group not found" });
      return reply.header("ETag", `"${group.revision}"`).send(group);
    } catch (error) { return sendGroupError(reply, error); }
  });
  app.patch("/api/groups/:groupId", { schema: { params: idParamsSchema("groupId"), body: groupUpdateSchema, response: { 200: groupSchema, ...errors } } }, async (request, reply) => {
    try {
      const group = db.updateGroup(getIdParam(request.params, "groupId"), request.body as {name?: string; descriptionMarkdown?: string; expectedRevision: number});
      publishBoardEvent(group.boardId);
      return reply.header("ETag", `"${group.revision}"`).send(group);
    } catch (error) { return sendGroupError(reply, error); }
  });
  app.delete("/api/groups/:groupId", { schema: { params: idParamsSchema("groupId"), response: { 204: { type: "null" }, ...errors } } }, async (request, reply) => {
    try {
      const id = getIdParam(request.params, "groupId");
      const group = db.getGroup(id);
      if (!group) return reply.code(404).send({ error: "Group not found" });
      const header = request.headers["if-match"];
      if (!header) return reply.code(428).send({ error: "If-Match is required", code: "PRECONDITION_REQUIRED" });
      if (typeof header !== "string" || !/^"[1-9][0-9]*"$/.test(header)) return reply.code(400).send({ error: "If-Match must be a quoted revision" });
      const revision = Number(header.slice(1, -1));
      if (!Number.isSafeInteger(revision)) return reply.code(400).send({ error: "Invalid revision" });
      db.deleteGroup(id, revision);
      publishBoardEvent(group.boardId);
      return reply.code(204).send();
    } catch (error) { return sendGroupError(reply, error); }
  });
  for (const preview of [true, false]) {
    app.route({ method: preview ? "POST" : "PUT", url: `/api/boards/:boardId/group-memberships${preview ? "/preview" : ""}`,
      schema: { params: idParamsSchema("boardId"), body: groupMembershipSchema, response: { 200: groupPreviewSchema, ...errors } },
      handler: async (request, reply) => {
        try {
          const boardId = getIdParam(request.params, "boardId");
          const body = request.body as { ticketIds: number[]; groupId: number|null; expectedToken?: string };
          if (preview) return db.previewGroupMemberships(boardId, body);
          if (!body.expectedToken) return reply.code(428).send({ error: "expectedToken is required", code: "PRECONDITION_REQUIRED" });
          const result = db.setGroupMemberships(boardId, { ...body, expectedToken: body.expectedToken });
          publishBoardEvent(boardId);
          return result;
        } catch (error) { return sendGroupError(reply, error); }
      },
    });
  }
  app.get("/api/boards/:boardId/group-activity", { schema: {
    params: idParamsSchema("boardId"),
    querystring: { type: "object", additionalProperties: false, properties: { groupId: { type: "integer", minimum: 1 } } },
    response: { 200: groupPreviewSchema, ...errors },
  } }, async (request, reply) => {
    try { return { activity: db.listGroupActivity(getIdParam(request.params, "boardId"), (request.query as { groupId?: number }).groupId) }; }
    catch (error) { return sendGroupError(reply, error); }
  });
}
