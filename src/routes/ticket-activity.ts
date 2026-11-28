import type { FastifyInstance } from "fastify";

import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";
import { positiveIntegerSchema } from "./schemas/common.js";
import { activityLogViewSchema } from "./schemas/ticket-activity.js";

const boundary = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER } as const;

export function registerTicketActivityRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext): void {
  const { db, getIdParam, schemas } = ctx;

  app.get<{ Querystring: { metadataOnly?: boolean } }>("/api/tickets/:ticketId/change-snapshot", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      querystring: { type: "object", properties: { metadataOnly: { type: "boolean" } } },
      response: { 404: schemas.errorSchema },
    },
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const snapshot = db.getTicketChangeSnapshot(getIdParam(request.params, "ticketId"));
    if (!snapshot) return reply.code(404).send({ error: "ticket not found" });
    if (request.query.metadataOnly) return { series: snapshot.series, fingerprint: snapshot.fingerprint };
    return snapshot;
  });

  app.get<{ Querystring: { compact?: boolean; after?: number; through?: number } }>("/api/tickets/:ticketId/activity", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      querystring: { type: "object", properties: { compact: { type: "boolean" }, after: boundary, through: boundary } },
      response: {
        200: schemas.activityLogsResponseSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const { compact = false, after, through } = request.query;
    const bounded = after !== undefined || through !== undefined;
    if (bounded && (after === undefined || through === undefined || after > through)) {
      return reply.code(400).send({ error: "after and through are required together, with after no greater than through" });
    }
    try {
      const ticketId = getIdParam(request.params, "ticketId");
      return after !== undefined && through !== undefined
        ? db.listActivityInterval(ticketId, compact, { after, through })
        : { activity: db.listActivity(ticketId, compact) };
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
  });

  app.get<{ Querystring: { series?: string } }>("/api/tickets/:ticketId/activity/:activityId", {
    schema: {
      params: {
        type: "object",
        required: ["ticketId", "activityId"],
        properties: { ticketId: positiveIntegerSchema, activityId: positiveIntegerSchema },
      },
      querystring: { type: "object", properties: { series: { type: "string", maxLength: 128 } } },
      response: { 200: activityLogViewSchema, 404: schemas.errorSchema, 409: schemas.errorSchema },
    },
  }, async (request, reply) => {
    if (request.query.series !== undefined && request.query.series !== db.visitSeries) {
      return reply.code(409).send({ error: "Activity series has changed" });
    }
    const activity = db.getActivity(getIdParam(request.params, "ticketId"), getIdParam(request.params, "activityId"));
    if (!activity) return reply.code(404).send({ error: "activity not found for this ticket" });
    return activity;
  });
}
