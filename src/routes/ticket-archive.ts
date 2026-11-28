import type { FastifyInstance } from "fastify";
import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";

export function registerTicketArchiveRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext): void {
  const { db, schemas, getIdParam, serializeTicket, publishBoardEvent } = ctx;
  app.patch("/api/tickets/:ticketId/archive", { schema: {
    params: schemas.idParamsSchema("ticketId"),
    body: { type: "object", additionalProperties: false,
      required: ["isArchived", "expectedArchiveVersion", "expectedBoardId"],
      properties: {
        isArchived: { type: "boolean" },
        expectedArchiveVersion: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        expectedBoardId: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      },
    },
    response: { 200: schemas.ticketSchema, 400: schemas.errorSchema, 404: schemas.errorSchema, 409: schemas.errorSchema },
  } }, async (request, reply) => {
    const ticketId = getIdParam(request.params, "ticketId");
    const body = request.body as { isArchived: boolean; expectedArchiveVersion: number; expectedBoardId: number };
    const result = db.sqlite.transaction(() => {
      const current = db.getTicket(ticketId);
      if (!current) return { status: 404 as const };
      if (current.boardId !== body.expectedBoardId || current.archiveVersion !== body.expectedArchiveVersion
          || current.isArchived === body.isArchived) return { status: 409 as const };
      return { status: 200 as const, ticket: db.updateTicket(ticketId, { isArchived: body.isArchived }) };
    }).immediate();
    if (result.status !== 200) {
      return reply.code(result.status).send({ error: result.status === 404 ? "ticket not found" : "ticket archive state changed" });
    }
    publishBoardEvent(result.ticket.boardId);
    return serializeTicket(result.ticket);
  });
}
