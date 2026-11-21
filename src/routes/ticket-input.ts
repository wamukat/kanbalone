import type { CreateTicketInput, UpdateTicketInput } from "../db-modules/ticket-mutations.js";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { TicketMutationBody } from "./ticket-route-context.js";

// The same normalization is used for preview and commit; otherwise a valid
// confirmation token could fail when defaults are filled only during commit.
export function ticketCreateInput(boardId: number, body: TicketMutationBody): CreateTicketInput {
  return {
    boardId, laneId: body.laneId!, title: body.title!.trim(),
    parentTicketId: body.parentTicketId ?? null,
    bodyMarkdown: body.bodyMarkdown ?? "",
    isArchived: Boolean(body.isArchived), priority: body.priority ?? 2,
    tagIds: body.tagIds ?? [], blockerIds: body.blockerIds ?? [], relatedIds: body.relatedIds ?? [],
    groupId: body.groupId, groupResolution: body.groupResolution, expectedToken: body.expectedToken,
  };
}
export function ticketUpdateInput(body: TicketMutationBody): UpdateTicketInput {
  if (body.groupId !== undefined) throw Object.assign(new Error("Use group-memberships to change Group membership"), {statusCode: 400, code: "GROUP_MEMBERSHIP_API_REQUIRED"});
  return {
    laneId: body.laneId, parentTicketId: body.parentTicketId, title: body.title?.trim(),
    bodyMarkdown: body.bodyMarkdown, appendMarkdown: body.appendMarkdown,
    isArchived: body.isArchived, priority: body.priority,
    tagIds: body.tagIds, blockerIds: body.blockerIds ?? undefined, relatedIds: body.relatedIds ?? undefined,
    childTicketIds: body.childTicketIds, groupResolution: body.groupResolution,
    expectedToken: body.expectedToken, expectedEditToken: body.expectedEditToken,
    expectedSelectedParents: body.expectedSelectedParents,
  };
}

// Fastify's default validator removes unknown fields. Reject retired completion
// inputs before validation so an obsolete client never appears to succeed.
export async function rejectCompletionFlags(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = request.body;
  if (body && typeof body === "object" && (Object.hasOwn(body, "isResolved") || Object.hasOwn(body, "isCompleted"))) {
    reply.code(400).send({ error: "Completion flags are not accepted. Choose a destination lane instead." });
  }
}

export async function rejectCompletedQuery(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.query && typeof request.query === "object" && Object.hasOwn(request.query, "completed")) {
    reply.code(400).send({ error: "The completed filter is not accepted. Use resolved instead." });
  }
}
