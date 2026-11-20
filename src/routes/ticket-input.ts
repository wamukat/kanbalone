import type { CreateTicketInput, UpdateTicketInput } from "../db-modules/ticket-mutations.js";
import { resolveResolvedFlag } from "../route-helpers.js";
import type { TicketMutationBody } from "./ticket-route-context.js";

// The same normalization is used for preview and commit; otherwise a valid
// confirmation token could fail when defaults are filled only during commit.
export function ticketCreateInput(boardId: number, body: TicketMutationBody): CreateTicketInput {
  return {
    boardId, laneId: body.laneId!, title: body.title!.trim(),
    parentTicketId: body.parentTicketId ?? null,
    bodyMarkdown: body.bodyMarkdown ?? "", isResolved: resolveResolvedFlag(body),
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
    isResolved: resolveResolvedFlag(body), isArchived: body.isArchived, priority: body.priority,
    tagIds: body.tagIds, blockerIds: body.blockerIds ?? undefined, relatedIds: body.relatedIds ?? undefined,
    childTicketIds: body.childTicketIds, groupResolution: body.groupResolution,
    expectedToken: body.expectedToken, expectedEditToken: body.expectedEditToken,
    expectedSelectedParents: body.expectedSelectedParents,
  };
}
