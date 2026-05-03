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

export function getBodyRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
}

export function getBodyString(body: unknown, key: string): string | undefined {
  const value = getBodyRecord(body)[key];
  return typeof value === "string" ? value.trim() : undefined;
}

export function getBodyBoolean(body: unknown, key: string): boolean | undefined {
  const value = getBodyRecord(body)[key];
  return typeof value === "boolean" ? value : undefined;
}

export function getBodyNumber(body: unknown, key: string): number | undefined {
  const value = getBodyRecord(body)[key];
  return typeof value === "number" ? value : undefined;
}

export function getBodyNumberArray(body: unknown, key: string): number[] | undefined {
  const value = getBodyRecord(body)[key];
  return Array.isArray(value) && value.every((item) => typeof item === "number") ? value : undefined;
}

export function getBodyArray<T>(
  body: unknown,
  key: string,
  isItem: (item: unknown) => item is T,
): T[] | undefined {
  const value = getBodyRecord(body)[key];
  return Array.isArray(value) && value.every(isItem) ? value : undefined;
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

export function parseTicketMutationBody(body: unknown): TicketMutationBody {
  const input = body && typeof body === "object" ? body as TicketMutationBody : {};
  const hasParentTicketId = Object.prototype.hasOwnProperty.call(input, "parentTicketId");
  const hasBlockerIds = Object.prototype.hasOwnProperty.call(input, "blockerIds");
  const hasRelatedIds = Object.prototype.hasOwnProperty.call(input, "relatedIds");
  return {
    laneId: input.laneId,
    parentTicketId: hasParentTicketId ? input.parentTicketId ?? null : undefined,
    title: typeof input.title === "string" ? input.title.trim() : undefined,
    bodyMarkdown: input.bodyMarkdown,
    isResolved: resolveResolvedFlag(input),
    isCompleted: input.isCompleted,
    isArchived: input.isArchived,
    priority: typeof input.priority === "number" ? input.priority : undefined,
    tagIds: Array.isArray(input.tagIds) ? input.tagIds : undefined,
    blockerIds: hasBlockerIds ? (Array.isArray(input.blockerIds) ? input.blockerIds : []) : undefined,
    relatedIds: hasRelatedIds ? (Array.isArray(input.relatedIds) ? input.relatedIds : []) : undefined,
  };
}
