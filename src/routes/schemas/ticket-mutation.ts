import { groupMutationProperties, nullableGroupIdSchema } from "./group.js";
import { optionalPositiveIntegerArraySchema, positiveIntegerSchema, ticketPrioritySchema } from "./common.js";
import { tagCreateBodySchema } from "./tag.js";

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
    isArchived: { type: "boolean" },
    priority: ticketPrioritySchema,
    tagIds: optionalPositiveIntegerArraySchema,
    newTagNames: { type: "array", items: tagCreateBodySchema.properties.name },
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
  properties: { ...ticketMutationBodySchema.properties,
    groupId: nullableGroupIdSchema,
    groupResolution: groupMutationProperties.groupResolution,
    expectedToken: groupMutationProperties.expectedToken,
  },
} as const;

export const ticketUpdateBodySchema = {
  ...ticketMutationBodySchema,
  properties: {
    ...ticketMutationBodySchema.properties,
    ...groupMutationProperties,
    groupId: nullableGroupIdSchema,
    appendMarkdown: { type: "string", minLength: 1 },
  },
  not: { required: ["bodyMarkdown", "appendMarkdown"] },
  minProperties: 1,
} as const;

export const ticketTransitionBodySchema = {
  type: "object",
  required: ["laneName"],
  additionalProperties: false,
  properties: {
    laneName: { type: "string", minLength: 1 },
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
    expectedSourceLaneId: positiveIntegerSchema,
    expectedSourcePosition: { type: "integer" },
    expectedAnchorOrder: { type: "string", enum: ["after-before", "before-after"] },
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

const ticketIdSelectionSchema = { type: "string", pattern: "^[1-9][0-9]*(,[1-9][0-9]*)*$" } as const;

export const ticketListQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 200 },
    cursor: { type: "string", minLength: 1, maxLength: 4096 },
    include_blocker_references: { type: "string", enum: ["true", "false"] },
    order: { type: "string", enum: ["id_asc", "position_asc", "completed_desc"] },
    priority: { type: "string", pattern: "^[1-4](,[1-4])*$", maxLength: 127 },
    groupId: positiveIntegerSchema,
    ungrouped: { type: "string", enum: ["true", "false"] },
    includeArchived: { type: "string", enum: ["true", "false"] },
    lane_id: positiveIntegerSchema,
    lane_ids: ticketIdSelectionSchema,
    lane: { type: "string", minLength: 1 },
    parent: { type: "string", pattern: "^(none|[1-9][0-9]*)$" },
    tag: { type: "string" },
    tag_ids: ticketIdSelectionSchema,
    resolved: { type: "string", enum: ["true", "false"] },
    archived: { type: "string", enum: ["true", "false", "all"] },
    q: { type: "string" },
  },
} as const;

export const ticketExternalReferenceParamsSchema = {
  type: "object",
  required: ["ticketId", "kind"],
  additionalProperties: false,
  properties: {
    ticketId: positiveIntegerSchema,
    kind: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$" },
  },
} as const;

export const ticketExternalReferenceSetBodySchema = {
  type: "object",
  required: [
    "provider",
    "instanceUrl",
    "projectKey",
    "issueKey",
    "displayRef",
    "url",
  ],
  additionalProperties: false,
  properties: {
    provider: { type: "string", minLength: 1 },
    instanceUrl: { type: "string", minLength: 1 },
    resourceType: { type: "string", minLength: 1 },
    projectKey: { type: "string", minLength: 1 },
    issueKey: { type: "string", minLength: 1 },
    displayRef: { type: "string", minLength: 1 },
    url: { type: "string", minLength: 1 },
    title: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
} as const;
