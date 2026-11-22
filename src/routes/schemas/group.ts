import { positiveIntegerSchema } from "./common.js";

export const nullableGroupIdSchema = { anyOf: [positiveIntegerSchema, { type: "null" }] } as const;
export const groupReferenceSchema = {
  anyOf: [{ type: "null" }, {
    type: "object", additionalProperties: false, required: ["id", "name"],
    properties: { id: positiveIntegerSchema, name: { type: "string" } },
  }],
} as const;
export const groupErrorSchema = {
  type: "object", additionalProperties: false, required: ["error"],
  properties: { error: { type: "string" }, code: { type: "string" }, details: { type: "object", additionalProperties: true } },
} as const;
export const groupProperties = {
  id: positiveIntegerSchema, boardId: positiveIntegerSchema, name: { type: "string" },
  isActive: { type: "boolean" }, totalTicketCount: { type: "integer", minimum: 0 },
  openTicketCount: { type: "integer", minimum: 0 }, resolvedTicketCount: { type: "integer", minimum: 0 },
  archivedTicketCount: { type: "integer", minimum: 0 },
  revision: positiveIntegerSchema, createdAt: { type: "string" }, updatedAt: { type: "string" },
} as const;
export const groupSummarySchema = { type: "object", additionalProperties: false, required: Object.keys(groupProperties), properties: groupProperties } as const;
export const groupSchema = {
  ...groupSummarySchema,
  required: [...groupSummarySchema.required, "descriptionMarkdown", "descriptionHtml"],
  properties: { ...groupProperties, descriptionMarkdown: { type: "string" }, descriptionHtml: { type: "string" } },
} as const;
export const groupListQuerySchema = {
  type: "object", additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["active", "inactive", "all"] },
    sort: { type: "string", enum: ["createdAt", "name"] },
    order: { type: "string", enum: ["asc", "desc"] },
  },
} as const;
export const groupCreateSchema = {
  type: "object", additionalProperties: false, required: ["name"],
  properties: { name: { type: "string", minLength: 1, maxLength: 100 }, descriptionMarkdown: { type: "string", maxLength: 100_000 } },
} as const;
export const groupUpdateSchema = {
  type: "object", additionalProperties: false, required: ["expectedRevision"], minProperties: 2,
  properties: { ...groupCreateSchema.properties, expectedRevision: positiveIntegerSchema },
} as const;
export const groupMembershipSchema = {
  type: "object", additionalProperties: false, required: ["ticketIds", "groupId"],
  properties: {
    ticketIds: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: positiveIntegerSchema },
    groupId: nullableGroupIdSchema,
    expectedToken: { type: "string", minLength: 1 },
  },
} as const;
export const groupMutationProperties = {
  childTicketIds: { type: "array", uniqueItems: true, items: positiveIntegerSchema },
  groupResolution: { type: "object", additionalProperties: false, required: ["groupId"], properties: { groupId: positiveIntegerSchema } },
  expectedToken: { type: "string", minLength: 1 },
  expectedEditToken: { type: "string", minLength: 1 },
  expectedSelectedParents: {
    type: "array", items: {
      type: "object", additionalProperties: false, required: ["ticketId", "parentTicketId"],
      properties: { ticketId: positiveIntegerSchema, parentTicketId: nullableGroupIdSchema },
    },
  },
} as const;
// Preview shapes contain a computed set of affected tickets, including archived rows.
// Keep the serializer open so added diagnostics are not silently discarded.
export const groupPreviewSchema = { type: "object", additionalProperties: true } as const;
