import type { FastifyInstance } from "fastify";

import type { KanbanDb } from "../db.js";
import { getBodyNumberArray, getBodyString } from "../route-helpers.js";
import type { Id } from "../types.js";
import type { RouteJsonSchema } from "./route-schema.js";

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
    const lane = db.createLane({ boardId, name });
    publishBoardEvent(boardId);
    return reply.code(201).send(lane);
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
      params: schemas.idParamsSchema("laneId"),
      response: {
        204: { type: "null" },
        404: schemas.errorSchema,
        409: schemas.errorSchema,
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
