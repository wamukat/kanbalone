import type { FastifyInstance } from "fastify";

import type { TicketMutationBody } from "./routes/ticket-route-context.js";
import type { Id } from "./types.js";

export function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (reply.sent) {
      return;
    }
    if (error instanceof Error && typeof error === "object" && "validation" in error) {
      reply.code(400).send({ error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : "internal server error";
    reply.code(500).send({ error: message });
  });
}

export function getIdParam(params: unknown, key: string): Id {
  const value = (params as Record<string, string | undefined>)[key];
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid ${key}`);
  }
  return parsed;
}

export function sanitizeStringArray(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }
  const result = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return result.length > 0 ? result : undefined;
}

export function parseBooleanQuery(value: string | undefined): boolean | undefined {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

export function resolveResolvedFlag(
  body: { isResolved?: boolean; isCompleted?: boolean } | undefined,
): boolean | undefined {
  if (typeof body?.isResolved === "boolean") {
    return body.isResolved;
  }
  return body?.isCompleted;
}

export function parseTicketMutationBody(body: TicketMutationBody): TicketMutationBody {
  const hasParentTicketId = Object.prototype.hasOwnProperty.call(body ?? {}, "parentTicketId");
  const hasBlockerIds = Object.prototype.hasOwnProperty.call(body ?? {}, "blockerIds");
  return {
    laneId: body?.laneId,
    parentTicketId: hasParentTicketId ? body?.parentTicketId ?? null : undefined,
    title: typeof body?.title === "string" ? body.title.trim() : undefined,
    bodyMarkdown: body?.bodyMarkdown,
    isResolved: resolveResolvedFlag(body),
    isCompleted: body?.isCompleted,
    isArchived: body?.isArchived,
    priority: typeof body?.priority === "number" ? body.priority : undefined,
    tagIds: Array.isArray(body?.tagIds) ? body.tagIds : undefined,
    blockerIds: hasBlockerIds ? (Array.isArray(body?.blockerIds) ? body.blockerIds : []) : undefined,
  };
}
