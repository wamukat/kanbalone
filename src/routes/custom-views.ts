import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply } from "fastify";

import type { BoardEventHub } from "../board-event-hub.js";
import { getCustomViewCatalog, getCustomViewText, queryCustomView } from "../db-modules/custom-view-query.js";
import {
  createCustomView, deleteCustomView, getCustomView, listCustomViews, updateCustomView, type CustomViewDefinition,
} from "../db-modules/custom-views.js";

const base = "/api/custom-views";
const id = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const ids = { type: "array", items: id, uniqueItems: true };
const definitionProperties = {
  name: { type: "string", minLength: 1, maxLength: 200 },
  scope: { type: "string", enum: ["all", "selected"] },
  boardIds: ids,
  rules: {
    type: "array",
    items: {
      type: "object", additionalProperties: false, required: ["boardId", "mode", "tagIds"],
      properties: { boardId: id, mode: { type: "string", enum: ["all", "tags"] }, tagIds: ids },
    },
  },
  completion: { type: "string", enum: ["open", "done", "all"] },
  showBody: { type: "boolean" },
  showLatestComment: { type: "boolean" },
};

const definitionSchema = {
  type: "object", additionalProperties: false, required: Object.keys(definitionProperties), properties: definitionProperties,
};

const params = {
  type: "object", additionalProperties: false, required: ["viewId"], properties: { viewId: id },
};

function normalizeDefinition(definition: CustomViewDefinition): CustomViewDefinition | null {
  const { scope, boardIds, rules, completion, showBody, showLatestComment } = definition;
  const name = definition.name.trim();
  if (!name || rules.some(rule => rule.mode === "all" && rule.tagIds.length > 0)
    || new Set(rules.map(rule => rule.boardId)).size !== rules.length) return null;
  return { name, scope, boardIds, rules: rules.map(({ boardId, mode, tagIds }) => ({ boardId, mode, tagIds })), completion, showBody, showLatestComment };
}

function writeError(reply: FastifyReply, problem: "missing" | "conflict" | "invalid_reference") {
  switch (problem) {
    case "missing": return reply.code(404).send({ error: "custom view not found" });
    case "conflict": return reply.code(409).send({ code: "version_conflict", error: "custom view changed; reload before saving or deleting" });
    case "invalid_reference": return reply.code(400).send({ code: "invalid_reference", error: "new board and tag references must exist on the configured board" });
  }
}

function invalidDefinition(reply: FastifyReply) {
  return reply.code(400).send({ error: "a name and a single valid rule per configured board are required" });
}

export function registerCustomViewRoutes(app: FastifyInstance, sqlite: Database.Database, events: BoardEventHub): void {
  app.get(base, async () => ({ views: listCustomViews(sqlite) }));

  app.get(`${base}/catalog`, async () => getCustomViewCatalog(sqlite));

  app.get(`${base}/events`, async (_request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    reply.raw.write(": connected\n\n");
    events.addCustomViewClient(reply.raw);
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.write(": ping\n\n");
    }, 15000);
    reply.raw.once("close", () => clearInterval(heartbeat));
  });

  app.get<{ Params: { viewId: number } }>(`${base}/:viewId`, { schema: { params } }, async (request, reply) => {
    const view = getCustomView(sqlite, request.params.viewId);
    return view ?? writeError(reply, "missing");
  });

  app.post<{ Body: CustomViewDefinition }>(base, { schema: { body: definitionSchema } }, async (request, reply) => {
    const definition = normalizeDefinition(request.body);
    if (!definition) return invalidDefinition(reply);
    const view = createCustomView(sqlite, definition);
    if (typeof view === "string") return writeError(reply, view);
    events.publishCustomViews();
    return reply.code(201).send(view);
  });

  app.put<{ Params: { viewId: number }; Body: CustomViewDefinition & { expectedVersion: number } }>(`${base}/:viewId`, {
    schema: {
      params,
      body: {
        ...definitionSchema,
        required: [...definitionSchema.required, "expectedVersion"],
        properties: { ...definitionProperties, expectedVersion: id },
      },
    },
  }, async (request, reply) => {
    const definition = normalizeDefinition(request.body);
    if (!definition) return invalidDefinition(reply);
    const view = updateCustomView(sqlite, request.params.viewId, request.body.expectedVersion, definition);
    if (typeof view === "string") return writeError(reply, view);
    events.publishCustomViews();
    return view;
  });

  app.delete<{ Params: { viewId: number }; Querystring: { expectedVersion: number } }>(`${base}/:viewId`, {
    schema: {
      params,
      querystring: { type: "object", additionalProperties: false, required: ["expectedVersion"], properties: { expectedVersion: id } },
    },
  }, async (request, reply) => {
    const deleted = deleteCustomView(sqlite, request.params.viewId, request.query.expectedVersion);
    if (typeof deleted === "string") return writeError(reply, deleted);
    events.publishCustomViews();
    return reply.code(204).send();
  });

  app.post<{ Body: { definition: CustomViewDefinition; limit?: number; cursor?: string } }>(`${base}/query`, {
    schema: {
      body: {
        type: "object", additionalProperties: false, required: ["definition"],
        properties: { definition: definitionSchema, limit: { type: "integer", minimum: 1, maximum: 100 }, cursor: { type: "string", minLength: 1, maxLength: 4096 } },
      },
    },
  }, async (request, reply) => {
    const definition = normalizeDefinition(request.body.definition);
    if (!definition) return invalidDefinition(reply);
    const result = queryCustomView(sqlite, definition, { limit: request.body.limit ?? 50, cursor: request.body.cursor });
    if (result === "invalid_cursor") return reply.code(400).send({ code: result, error: "invalid custom view cursor" });
    if (result === "stale_cursor") return reply.code(409).send({ code: result, error: "custom view results changed; restart pagination" });
    return result;
  });

  app.get<{ Params: { ticketId: number }; Querystring: { field: "body" | "comment"; commentId?: number } }>(`${base}/tickets/:ticketId/text`, {
    schema: {
      params: { type: "object", additionalProperties: false, required: ["ticketId"], properties: { ticketId: id } },
      querystring: {
        type: "object", additionalProperties: false, required: ["field"],
        properties: { field: { type: "string", enum: ["body", "comment"] }, commentId: id },
      },
    },
  }, async (request, reply) => {
    const { field, commentId } = request.query;
    if ((field === "comment") !== (commentId !== undefined)) {
      return reply.code(400).send({ error: "commentId is required only when field is comment" });
    }
    return getCustomViewText(sqlite, request.params.ticketId, commentId) ?? reply.code(404).send({ error: "ticket text not found" });
  });
}
