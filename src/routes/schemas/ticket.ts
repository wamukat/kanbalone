import { groupReferenceSchema, nullableGroupIdSchema } from "./group.js";
import { positiveIntegerSchema, ticketPrioritySchema } from "./common.js";
import { tagViewSchema } from "./tag.js";
import { commentViewSchema } from "./ticket-comment.js";
import { ticketRelationSchema } from "./ticket-relation.js";

export const taskCountProperties = {
  taskCount: { type: "integer", minimum: 0 },
  doneTaskCount: { type: "integer", minimum: 0 },
} as const;

export const ticketRemoteSummarySchema = {
  anyOf: [
    { type: "null" },
    {
      type: "object",
      additionalProperties: false,
      required: ["provider", "displayRef", "url"],
      properties: {
        provider: { type: "string" },
        displayRef: { type: "string" },
        url: { type: "string" },
      },
    },
  ],
} as const;

export const ticketRemoteSchema = {
  anyOf: [
    { type: "null" },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "ticketId",
        "provider",
        "instanceUrl",
        "resourceType",
        "projectKey",
        "issueKey",
        "displayRef",
        "url",
        "title",
        "bodyMarkdown",
        "bodyHtml",
        "state",
        "remoteUpdatedAt",
        "lastSyncedAt",
        "createdAt",
        "updatedAt",
      ],
      properties: {
        ticketId: positiveIntegerSchema,
        provider: { type: "string" },
        instanceUrl: { type: "string" },
        resourceType: { type: "string" },
        projectKey: { type: "string" },
        issueKey: { type: "string" },
        displayRef: { type: "string" },
        url: { type: "string" },
        title: { type: "string" },
        bodyMarkdown: { type: "string" },
        bodyHtml: { type: "string" },
        state: { anyOf: [{ type: "string" }, { type: "null" }] },
        remoteUpdatedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
        lastSyncedAt: { type: "string" },
        createdAt: { type: "string" },
        updatedAt: { type: "string" },
      },
    },
  ],
} as const;

export const ticketExternalReferenceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "ticketId",
    "kind",
    "provider",
    "instanceUrl",
    "resourceType",
    "projectKey",
    "issueKey",
    "displayRef",
    "url",
    "title",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    revision: {type:"integer",minimum:0},
    id: positiveIntegerSchema,
    ticketId: positiveIntegerSchema,
    kind: { type: "string" },
    provider: { type: "string" },
    instanceUrl: { type: "string" },
    resourceType: { type: "string" },
    projectKey: { type: "string" },
    issueKey: { type: "string" },
    displayRef: { type: "string" },
    url: { type: "string" },
    changeRequestStatus: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false,
      required: ["state", "isDraft", "fetchedAt", "attemptedAt", "error"], properties: {
        state: { anyOf: [{ type: "string", enum: ["open", "closed", "merged"] }, { type: "null" }] },
        isDraft: { type: "boolean" }, fetchedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
        attemptedAt: { type: "string" }, error: { anyOf: [{ type: "string" }, { type: "null" }] },
      } }] },
    title: { anyOf: [{ type: "string" }, { type: "null" }] },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

export const ticketSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "boardId",
    "laneId",
    "parentTicketId",
    "hasChildren",
    "title",
    "bodyMarkdown",
    "bodyHtml",
    "isResolved",
    "resolvedAt",
    "isArchived",
    "priority",
    "position",
    "createdAt",
    "updatedAt",
    "tags",
    "comments",
    "blockerIds",
    "relatedIds",
    "blockers",
    "blockedBy",
    "related",
    "parent",
    "children",
    "ref",
    "shortRef",
    "remote",
    "externalReferences",
    "taskCount",
    "doneTaskCount",
  ],
  properties: {
    ...taskCountProperties,
    groupId: nullableGroupIdSchema,
    group: groupReferenceSchema,
    editToken: { type: "string" },
    archiveVersion: { type: "integer", minimum: 0 },
    id: positiveIntegerSchema,
    boardId: positiveIntegerSchema,
    laneId: positiveIntegerSchema,
    parentTicketId: { anyOf: [positiveIntegerSchema, { type: "null" }] },
    hasChildren: { type: "boolean" },
    title: { type: "string" },
    bodyMarkdown: { type: "string" },
    bodyHtml: { type: "string" },
    isResolved: { type: "boolean" },
    resolvedAt: { type: ["string", "null"], readOnly: true },
    isArchived: { type: "boolean" },
    priority: ticketPrioritySchema,
    position: { type: "integer", minimum: 0 },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    tags: {
      type: "array",
      items: tagViewSchema,
    },
    comments: {
      type: "array",
      items: commentViewSchema,
    },
    blockerIds: {
      type: "array",
      items: positiveIntegerSchema,
    },
    relatedIds: {
      type: "array",
      items: positiveIntegerSchema,
    },
    blockers: {
      type: "array",
      items: ticketRelationSchema,
    },
    blockedBy: {
      type: "array",
      items: ticketRelationSchema,
    },
    related: {
      type: "array",
      items: ticketRelationSchema,
    },
    parent: { anyOf: [ticketRelationSchema, { type: "null" }] },
    children: {
      type: "array",
      items: ticketRelationSchema,
    },
    ref: { type: "string" },
    shortRef: { type: "string" },
    remote: ticketRemoteSchema,
    externalReferences: {
      type: "array",
      items: ticketExternalReferenceSchema,
    },
  },
} as const;

export const ticketRemoteRefreshResponseSchema = ticketSchema;

export const ticketSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "boardId",
    "laneId",
    "parentTicketId",
    "hasChildren",
    "title",
    "isResolved",
    "resolvedAt",
    "isArchived",
    "priority",
    "position",
    "createdAt",
    "updatedAt",
    "tags",
    "blockerIds",
    "unresolvedBlockerCount",
    "relatedIds",
    "ref",
    "shortRef",
    "remote",
    "externalReferences",
    "taskCount",
    "doneTaskCount",
  ],
  properties: {
    ...taskCountProperties,
    groupId: nullableGroupIdSchema,
    group: groupReferenceSchema,
    id: positiveIntegerSchema,
    boardId: positiveIntegerSchema,
    laneId: positiveIntegerSchema,
    parentTicketId: { anyOf: [positiveIntegerSchema, { type: "null" }] },
    hasChildren: { type: "boolean" },
    title: { type: "string" },
    isResolved: { type: "boolean" },
    resolvedAt: { type: ["string", "null"], readOnly: true },
    isArchived: { type: "boolean" },
    priority: ticketPrioritySchema,
    position: { type: "integer", minimum: 0 },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    tags: {
      type: "array",
      items: tagViewSchema,
    },
    unresolvedBlockerCount: { type: "integer", minimum: 0 },
    blockerIds: {
      type: "array",
      items: positiveIntegerSchema,
    },
    blockerReferences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "isResolved", "isArchived"],
        properties: {
          id: positiveIntegerSchema,
          title: { type: "string" },
          isResolved: { type: "boolean" },
          isArchived: { type: "boolean" },
        },
      },
    },
    relatedIds: {
      type: "array",
      items: positiveIntegerSchema,
    },
    ref: { type: "string" },
    shortRef: { type: "string" },
    remote: ticketRemoteSummarySchema,
    externalReferences: {
      type: "array",
      items: ticketExternalReferenceSchema,
    },
  },
} as const;

const ticketPageSchema = {
  type: "object", additionalProperties: false, required: ["nextCursor", "total"],
  properties: {
    nextCursor: { anyOf: [{ type: "string" }, { type: "null" }] },
    total: { type: "integer", minimum: 0 },
  },
} as const;

export const ticketsResponseSchema = {
  type: "object",
  required: ["tickets"],
  additionalProperties: false,
  properties: {
    page: ticketPageSchema,
    tickets: {
      type: "array",
      items: ticketSummarySchema,
    },
  },
} as const;

export const ticketRelationCandidateQuerySchema = {
  type: "object",
  additionalProperties: false,
  required: ["limit"],
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 200 },
    cursor: { type: "string", minLength: 1, maxLength: 4096 },
    order: { type: "string", enum: ["id_asc"] },
  },
} as const;

export const ticketRelationCandidatesResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tickets", "page"],
  properties: {
    tickets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "parentTicketId", "priority", "blockerIds", "isResolved"],
        properties: {
          id: ticketSummarySchema.properties.id,
          title: ticketSummarySchema.properties.title,
          parentTicketId: ticketSummarySchema.properties.parentTicketId,
          priority: ticketSummarySchema.properties.priority,
          blockerIds: ticketSummarySchema.properties.blockerIds,
          isResolved: ticketSummarySchema.properties.isResolved,
        },
      },
    },
    page: ticketPageSchema,
  },
} as const;

export * from "./ticket-activity.js";
export * from "./ticket-bulk.js";
export * from "./ticket-comment.js";
export * from "./ticket-mutation.js";
export * from "./ticket-relation.js";
