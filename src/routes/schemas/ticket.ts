import { positiveIntegerSchema, ticketPrioritySchema } from "./common.js";
import { tagViewSchema } from "./tag.js";
import { commentViewSchema } from "./ticket-comment.js";
import { ticketRelationSchema } from "./ticket-relation.js";

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
    "isCompleted",
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
  ],
  properties: {
    id: positiveIntegerSchema,
    boardId: positiveIntegerSchema,
    laneId: positiveIntegerSchema,
    parentTicketId: { anyOf: [positiveIntegerSchema, { type: "null" }] },
    hasChildren: { type: "boolean" },
    title: { type: "string" },
    bodyMarkdown: { type: "string" },
    bodyHtml: { type: "string" },
    isResolved: { type: "boolean" },
    isCompleted: { type: "boolean" },
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
    "isCompleted",
    "isArchived",
    "priority",
    "position",
    "createdAt",
    "updatedAt",
    "tags",
    "blockerIds",
    "relatedIds",
    "ref",
    "shortRef",
    "remote",
    "externalReferences",
  ],
  properties: {
    id: positiveIntegerSchema,
    boardId: positiveIntegerSchema,
    laneId: positiveIntegerSchema,
    parentTicketId: { anyOf: [positiveIntegerSchema, { type: "null" }] },
    hasChildren: { type: "boolean" },
    title: { type: "string" },
    isResolved: { type: "boolean" },
    isCompleted: { type: "boolean" },
    isArchived: { type: "boolean" },
    priority: ticketPrioritySchema,
    position: { type: "integer", minimum: 0 },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    tags: {
      type: "array",
      items: tagViewSchema,
    },
    blockerIds: {
      type: "array",
      items: positiveIntegerSchema,
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

export const ticketsResponseSchema = {
  type: "object",
  required: ["tickets"],
  additionalProperties: false,
  properties: {
    tickets: {
      type: "array",
      items: ticketSummarySchema,
    },
  },
} as const;

export * from "./ticket-activity.js";
export * from "./ticket-bulk.js";
export * from "./ticket-comment.js";
export * from "./ticket-mutation.js";
export * from "./ticket-relation.js";
