import { optionalPositiveIntegerArraySchema, positiveIntegerSchema, ticketPrioritySchema } from "./common.js";

export const ticketMutationBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    laneId: positiveIntegerSchema,
    parentTicketId: {
      anyOf: [positiveIntegerSchema, { type: "null" }],
    },
    title: { type: "string", minLength: 1 },
    bodyMarkdown: { type: "string" },
    isResolved: { type: "boolean" },
    isCompleted: { type: "boolean" },
    isArchived: { type: "boolean" },
    priority: ticketPrioritySchema,
    tagIds: optionalPositiveIntegerArraySchema,
    blockerIds: {
      anyOf: [optionalPositiveIntegerArraySchema, { type: "null" }],
    },
    relatedIds: {
      anyOf: [optionalPositiveIntegerArraySchema, { type: "null" }],
    },
  },
} as const;

export const ticketCreateBodySchema = {
  ...ticketMutationBodySchema,
  required: ["laneId", "title"],
} as const;

export const ticketUpdateBodySchema = {
  ...ticketMutationBodySchema,
  minProperties: 1,
} as const;

export const ticketTransitionBodySchema = {
  type: "object",
  required: ["laneName"],
  additionalProperties: false,
  properties: {
    laneName: { type: "string", minLength: 1 },
    isResolved: { type: "boolean" },
    isCompleted: { type: "boolean" },
  },
} as const;

export const ticketMoveBodySchema = {
  type: "object",
  required: ["boardId", "laneId"],
  additionalProperties: false,
  properties: {
    boardId: positiveIntegerSchema,
    laneId: positiveIntegerSchema,
  },
} as const;

export const ticketPositionBodySchema = {
  type: "object",
  required: ["laneId"],
  additionalProperties: false,
  properties: {
    laneId: positiveIntegerSchema,
    position: { type: "integer", minimum: 0 },
    beforeTicketId: {
      anyOf: [positiveIntegerSchema, { type: "null" }],
    },
    afterTicketId: {
      anyOf: [positiveIntegerSchema, { type: "null" }],
    },
  },
} as const;

export const ticketRemoteImportBodySchema = {
  type: "object",
  required: ["provider", "laneId"],
  additionalProperties: false,
  properties: {
    provider: { type: "string", minLength: 1 },
    laneId: positiveIntegerSchema,
    instanceUrl: { type: "string", minLength: 1 },
    projectKey: { type: "string", minLength: 1 },
    issueKey: { type: "string", minLength: 1 },
    url: { type: "string", minLength: 1 },
    postBacklinkComment: { type: "boolean" },
    backlinkUrl: { type: "string", minLength: 1 },
  },
} as const;

export const ticketRemoteImportPreviewResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "provider",
    "instanceUrl",
    "resourceType",
    "projectKey",
    "issueKey",
    "displayRef",
    "url",
    "title",
    "state",
    "remoteUpdatedAt",
    "duplicate",
    "existingTicketId",
    "existingTicketRef",
  ],
  properties: {
    provider: { type: "string" },
    instanceUrl: { type: "string" },
    resourceType: { type: "string" },
    projectKey: { type: "string" },
    issueKey: { type: "string" },
    displayRef: { type: "string" },
    url: { type: "string" },
    title: { type: "string" },
    state: { anyOf: [{ type: "string" }, { type: "null" }] },
    remoteUpdatedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
    duplicate: { type: "boolean" },
    existingTicketId: { anyOf: [positiveIntegerSchema, { type: "null" }] },
    existingTicketRef: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
} as const;

export const ticketListQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    lane_id: positiveIntegerSchema,
    tag: { type: "string" },
    resolved: { type: "string", enum: ["true", "false"] },
    completed: { type: "string", enum: ["true", "false"] },
    archived: { type: "string", enum: ["true", "false", "all"] },
    q: { type: "string" },
  },
} as const;

export const reorderTicketsBodySchema = {
  type: "object",
  required: ["items"],
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["ticketId", "laneId", "position"],
        additionalProperties: false,
        properties: {
          ticketId: positiveIntegerSchema,
          laneId: positiveIntegerSchema,
          position: { type: "integer", minimum: 0 },
        },
      },
    },
  },
} as const;
