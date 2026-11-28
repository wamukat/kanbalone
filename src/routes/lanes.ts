import type { FastifyInstance } from "fastify";

import { LaneNotEmptyError } from "../db-modules/board.js";
import type { KanbanDb } from "../db.js";
import { getBodyBoolean, getBodyNumberArray, getBodyString } from "../route-helpers.js";
import type { Id } from "../types.js";
import type { RouteJsonSchema } from "./route-schema.js";

const laneTicketCountsSchema = {
  type: "object",
  required: ["ticketCount", "archivedTicketCount"],
  additionalProperties: false,
  properties: {
    ticketCount: { type: "integer", minimum: 0 },
    archivedTicketCount: { type: "integer", minimum: 0 },
  },
} as const;

type LaneRoutesSchemas = {
  errorSchema: RouteJsonSchema;
  idParamsSchema(key: string): RouteJsonSchema;
  laneBodySchema: RouteJsonSchema;
  laneViewSchema: RouteJsonSchema;
  lanesResponseSchema: RouteJsonSchema;
  reorderLanesBodySchema: RouteJsonSchema;
};

type RegisterLaneRoutesContext = {
  db: KanbanDb;
  getIdParam(params: unknown, key: string): Id;
  publishBoardEvent(boardId: Id, event?: string): void;
  schemas: LaneRoutesSchemas;
};

export function registerLaneRoutes(app: FastifyInstance, ctx: RegisterLaneRoutesContext): void {
  const { db, getIdParam, publishBoardEvent, schemas } = ctx;

  app.get("/api/boards/:boardId/lanes", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      response: {
        200: schemas.lanesResponseSchema,
        404: schemas.errorSchema,
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
      params: schemas.idParamsSchema("boardId"),
      body: schemas.laneBodySchema,
      response: {
        201: schemas.laneViewSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const name = getBodyString(request.body, "name");
    if (!db.getBoard(boardId)) {
      return reply.code(404).send({ error: "board not found" });
    }
    if (!name) {
      return reply.code(400).send({ error: "name is required" });
    }
    const lane = db.createLane({ boardId, name, isCompletionLane: getBodyBoolean(request.body, "isCompletionLane") });
    publishBoardEvent(boardId);
    return reply.code(201).send(lane);
  });

  app.put<{ Body: { laneIds: number[]; expectedLanes: { id: number; isCompletionLane: boolean; ticketCount: number }[] } }>("/api/boards/:boardId/completion-lanes", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      body: {
        type: "object", required: ["laneIds", "expectedLanes"], additionalProperties: false,
        properties: {
          laneIds: { type: "array", uniqueItems: true, items: { type: "integer", minimum: 1 } },
          expectedLanes: { type: "array", items: {
            type: "object", required: ["id", "isCompletionLane", "ticketCount"], additionalProperties: false,
            properties: { id: { type: "integer", minimum: 1 }, isCompletionLane: { type: "boolean" }, ticketCount: { type: "integer", minimum: 0 } },
          } },
        },
      },
      response: { 200: schemas.lanesResponseSchema, 400: schemas.errorSchema, 404: schemas.errorSchema, 409: schemas.errorSchema },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    if (!db.getBoard(boardId)) return reply.code(404).send({ error: "board not found" });
    try {
      const lanes = db.setCompletionLanes(boardId, request.body.laneIds, request.body.expectedLanes);
      publishBoardEvent(boardId);
      return { lanes };
    } catch (error) {
      const code = (error as { statusCode?: number }).statusCode;
      if (code !== 400 && code !== 409) throw error;
      return reply.code(code).send({ error: (error as Error).message });
    }
  });

  app.patch("/api/lanes/:laneId", {
    schema: {
      params: schemas.idParamsSchema("laneId"),
      body: schemas.laneBodySchema,
      response: {
        200: schemas.laneViewSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const name = getBodyString(request.body, "name");
    const isCompletionLane = getBodyBoolean(request.body, "isCompletionLane");
    try {
      const lane = db.updateLane(getIdParam(request.params, "laneId"), { name, isCompletionLane });
      publishBoardEvent(lane.boardId);
      return lane;
    } catch {
      return reply.code(404).send({ error: "lane not found" });
    }
  });

  app.get("/api/lanes/:laneId/ticket-counts", {
    schema: {
      params: schemas.idParamsSchema("laneId"),
      response: { 200: laneTicketCountsSchema, 404: schemas.errorSchema },
    },
  }, async (request, reply) => {
    const counts = db.getLaneTicketCounts(getIdParam(request.params, "laneId"));
    if (!counts) return reply.code(404).send({ error: "lane not found" });
    return counts;
  });

  app.delete("/api/lanes/:laneId", {
    schema: {
      params: schemas.idParamsSchema("laneId"),
      response: {
        204: { type: "null" },
        404: schemas.errorSchema,
        409: {
          type: "object", required: ["error", "details"], additionalProperties: false,
          properties: { error: { type: "string" }, details: laneTicketCountsSchema },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const boardId = db.deleteLane(getIdParam(request.params, "laneId"));
      publishBoardEvent(boardId);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof LaneNotEmptyError) {
        return reply.code(409).send({ error: "lane is not empty", details: error.counts });
      }
      if (error instanceof Error && error.message === "Lane not found") {
        return reply.code(404).send({ error: "lane not found" });
      }
      throw error;
    }
  });

  app.post("/api/boards/:boardId/lanes/reorder", {
    schema: {
      params: schemas.idParamsSchema("boardId"),
      body: schemas.reorderLanesBodySchema,
      response: {
        200: schemas.lanesResponseSchema,
        400: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const boardId = getIdParam(request.params, "boardId");
    const laneIds = getBodyNumberArray(request.body, "laneIds");
    if (!laneIds) {
      return reply.code(400).send({ error: "laneIds is required" });
    }
    try {
      const lanes = db.reorderLanes(boardId, laneIds);
      publishBoardEvent(boardId);
      return { lanes };
    } catch (error) {
      const message = error instanceof Error ? error.message : "lane reorder failed";
      return reply.code(400).send({ error: message });
    }
  });
}
