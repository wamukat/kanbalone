import type { FastifyInstance } from "fastify";

import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";
import { positiveIntegerSchema } from "./schemas/common.js";
import { activityLogViewSchema } from "./schemas/ticket-activity.js";

export function registerTicketActivityRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext): void {
  const { db, getIdParam, schemas } = ctx;

  app.get<{ Querystring: { compact?: boolean } }>("/api/tickets/:ticketId/activity", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      querystring: { type: "object", properties: { compact: { type: "boolean" } } },
      response: {
        200: schemas.activityLogsResponseSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      return { activity: db.listActivity(getIdParam(request.params, "ticketId"), request.query.compact) };
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
  });

  app.get("/api/tickets/:ticketId/activity/:activityId", {
    schema: {
      params: {
        type: "object",
        required: ["ticketId", "activityId"],
        properties: { ticketId: positiveIntegerSchema, activityId: positiveIntegerSchema },
      },
      response: { 200: activityLogViewSchema, 404: schemas.errorSchema },
    },
  }, async (request, reply) => {
    const activity = db.getActivity(getIdParam(request.params, "ticketId"), getIdParam(request.params, "activityId"));
    if (!activity) return reply.code(404).send({ error: "activity not found for this ticket" });
    return activity;
  });
}
