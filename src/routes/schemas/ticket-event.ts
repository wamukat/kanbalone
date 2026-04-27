import { positiveIntegerSchema } from "./common.js";

const nullableStringSchema = { anyOf: [{ type: "string" }, { type: "null" }] } as const;

export const ticketEventSchema = {
  type: "object",
  required: ["id", "ticketId", "source", "kind", "title", "summary", "severity", "icon", "data", "createdAt"],
  additionalProperties: false,
  properties: {
    id: positiveIntegerSchema,
    ticketId: positiveIntegerSchema,
    source: { type: "string" },
    kind: { type: "string" },
    title: { type: "string" },
    summary: nullableStringSchema,
    severity: nullableStringSchema,
    icon: nullableStringSchema,
    data: { type: "object", additionalProperties: true },
    createdAt: { type: "string" },
  },
} as const;

export const ticketEventsResponseSchema = {
  type: "object",
  required: ["events"],
  additionalProperties: false,
  properties: {
    events: {
      type: "array",
      items: ticketEventSchema,
    },
  },
} as const;

export const ticketEventCreateBodySchema = {
  type: "object",
  required: ["source", "kind", "title"],
  additionalProperties: false,
  properties: {
    source: { type: "string", minLength: 1 },
    kind: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    summary: nullableStringSchema,
    severity: nullableStringSchema,
    icon: nullableStringSchema,
    data: { type: "object", additionalProperties: true },
  },
} as const;
