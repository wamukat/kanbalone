import { positiveIntegerSchema, ticketPrioritySchema } from "./common.js";

export const ticketRelationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "laneId", "isResolved", "isCompleted", "priority", "ref", "shortRef"],
  properties: {
    id: positiveIntegerSchema,
    title: { type: "string" },
    laneId: positiveIntegerSchema,
    isResolved: { type: "boolean" },
    isCompleted: { type: "boolean" },
    priority: ticketPrioritySchema,
    ref: { type: "string" },
    shortRef: { type: "string" },
  },
} as const;

export const ticketRelationsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["parent", "children", "blockers", "blockedBy", "related"],
  properties: {
    parent: { anyOf: [ticketRelationSchema, { type: "null" }] },
    children: {
      type: "array",
      items: ticketRelationSchema,
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
  },
} as const;
