import { beginChangeRequestRefresh, finishChangeRequestRefresh } from "../db-modules/change-request-status.js";
import { sanitizeRemoteRefreshError } from "../remote/errors.js";
import type { ChangeRequestSnapshot } from "../remote/adapters.js";
import type { FastifyInstance } from "fastify";

import type { RegisterTicketRoutesContext, TicketExternalReferenceBody } from "./ticket-route-context.js";

export function registerTicketExternalReferenceRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext): void {
  const { db, getIdParam, publishBoardEvent, schemas, serializeTicket } = ctx;

  app.post("/api/tickets/:ticketId/external-references/:kind/refresh", { schema: {
    params: schemas.ticketExternalReferenceParamsSchema,
    response: { 200: schemas.ticketSchema, 400: schemas.errorSchema, 404: schemas.errorSchema, 409: schemas.errorSchema, 502: schemas.errorSchema },
  } }, async (request, reply) => {
    const ticketId = getIdParam(request.params, "ticketId");
    const reference = db.getTicket(ticketId)?.externalReferences.find(ref => ref.kind === getKindParam(request.params).trim().toLowerCase());
    if (!reference) return reply.code(404).send({ error: "external reference not found" });
    const supported = reference.provider === "github" && reference.resourceType === "pull_request"
      || reference.provider === "gitlab" && reference.resourceType === "merge_request";
    const adapter = ctx.remoteAdapters[reference.provider];
    if (!supported || !adapter?.fetchChangeRequest) return reply.code(400).send({ error: "unsupported change request reference" });
    const token = beginChangeRequestRefresh(db.sqlite, reference.id, ticketId, new Date().toISOString());
    let result: ChangeRequestSnapshot | { error: string };
    try { result = await adapter.fetchChangeRequest(reference); }
    catch (error) { result = { error: sanitizeRemoteRefreshError(error) }; }
    if (!finishChangeRequestRefresh(db.sqlite, reference.id, token, new Date().toISOString(), result)) {
      return reply.code(409).send({ error: "external reference changed during refresh" });
    }
    const updated = db.getTicket(ticketId)!;
    publishBoardEvent(updated.boardId);
    if ("error" in result) return reply.code(502).send(result);
    return serializeTicket(updated);
  });

  app.put("/api/tickets/:ticketId/external-references/:kind", {
    schema: {
      params: schemas.ticketExternalReferenceParamsSchema,
      body: schemas.ticketExternalReferenceSetBodySchema,
      response: {
        200: schemas.ticketSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const ticketId = getIdParam(request.params, "ticketId");
    const kind = getKindParam(request.params);
    const ticket = db.getTicket(ticketId);
    if (!ticket) {
      return reply.code(404).send({ error: "ticket not found" });
    }
    const body = request.body as TicketExternalReferenceBody;
    if (!body.provider || !body.instanceUrl || !body.projectKey || !body.issueKey || !body.displayRef || !body.url) {
      return reply.code(400).send({ error: "provider, instanceUrl, projectKey, issueKey, displayRef, and url are required" });
    }
    const updated = db.upsertTicketExternalReference({
      ticketId,
      kind,
      provider: body.provider,
      instanceUrl: body.instanceUrl,
      resourceType: body.resourceType ?? "issue",
      projectKey: body.projectKey,
      issueKey: body.issueKey,
      displayRef: body.displayRef,
      url: body.url,
      title: body.title ?? null,
    }, {
      boardId: ticket.boardId,
      ticketId,
      action: "external_reference_set",
      message: "External reference set",
      details: {
        kind,
        provider: body.provider,
        displayRef: body.displayRef,
      },
    });
    publishBoardEvent(updated.boardId);
    return serializeTicket(updated);
  });

  app.delete("/api/tickets/:ticketId/external-references/:kind", {
    schema: {
      params: schemas.ticketExternalReferenceParamsSchema,
      response: {
        200: schemas.ticketSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const ticketId = getIdParam(request.params, "ticketId");
    const kind = getKindParam(request.params);
    const ticket = db.getTicket(ticketId);
    if (!ticket) {
      return reply.code(404).send({ error: "ticket not found" });
    }
    const updated = db.deleteTicketExternalReference(ticketId, kind, {
      boardId: ticket.boardId,
      action: "external_reference_removed",
      message: "External reference removed",
      details: { kind },
    });
    publishBoardEvent(updated.boardId);
    return serializeTicket(updated);
  });
}

function getKindParam(params: unknown): string {
  return String((params as { kind?: unknown }).kind ?? "");
}
