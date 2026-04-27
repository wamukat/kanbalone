import { positiveIntegerSchema } from "./common.js";
import { tagViewSchema } from "./tag.js";

const nullableStringSchema = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
const nullableObjectSchema = { anyOf: [{ type: "object", additionalProperties: true }, { type: "null" }] } as const;

export const ticketTagReasonSchema = {
  type: "object",
  required: ["tag", "reason", "details", "reasonCommentId", "attachedAt", "updatedAt"],
  additionalProperties: false,
  properties: {
    tag: tagViewSchema,
    reason: nullableStringSchema,
    details: nullableObjectSchema,
    reasonCommentId: { anyOf: [positiveIntegerSchema, { type: "null" }] },
    attachedAt: nullableStringSchema,
    updatedAt: nullableStringSchema,
  },
} as const;

export const ticketTagReasonsResponseSchema = {
  type: "object",
  required: ["tags"],
  additionalProperties: false,
  properties: {
    tags: {
      type: "array",
      items: ticketTagReasonSchema,
    },
  },
} as const;

export const ticketTagReasonSetBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reason: nullableStringSchema,
    details: nullableObjectSchema,
    reasonCommentId: { anyOf: [positiveIntegerSchema, { type: "null" }] },
  },
} as const;
