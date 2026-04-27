import type { FastifyInstance } from "fastify";

import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";

export function registerTicketEventRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext): void {
  const { db, getIdParam, publishBoardEvent, schemas } = ctx;

  app.get("/api/tickets/:ticketId/events", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      response: {
        200: schemas.ticketEventsResponseSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      return { events: db.listTicketEvents(getIdParam(request.params, "ticketId")) };
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
  });

  app.post("/api/tickets/:ticketId/events", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      body: schemas.ticketEventCreateBodySchema,
      response: {
        201: schemas.ticketEventSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      source?: string;
      kind?: string;
      title?: string;
      summary?: string | null;
      severity?: string | null;
      icon?: string | null;
      data?: Record<string, unknown>;
    };
    const source = body.source?.trim();
    const kind = body.kind?.trim();
    const title = body.title?.trim();
    if (!source || !kind || !title) {
      return reply.code(400).send({ error: "source, kind, and title are required" });
    }
    const ticketId = getIdParam(request.params, "ticketId");
    try {
      const event = db.addTicketEvent({
        ticketId,
        source,
        kind,
        title,
        summary: normalizeOptionalText(body.summary),
        severity: normalizeOptionalText(body.severity),
        icon: normalizeOptionalText(body.icon),
        data: body.data ?? {},
      });
      const ticket = db.getTicket(ticketId);
      if (ticket) {
        publishBoardEvent(ticket.boardId);
      }
      return reply.code(201).send(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ticket event create failed";
      const code = message === "Ticket not found" ? 404 : 400;
      return reply.code(code).send({ error: message.toLowerCase() });
    }
  });
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
