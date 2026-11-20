import { optionalPositiveIntegerArraySchema, positiveIntegerSchema } from "./common.js";

export const laneViewSchema = {
  type: "object",
  required: ["id", "boardId", "name", "position", "isCompletionLane"],
  additionalProperties: false,
  properties: {
    id: positiveIntegerSchema,
    boardId: positiveIntegerSchema,
    name: { type: "string" },
    isCompletionLane: { type: "boolean" },
    position: { type: "integer", minimum: 0 },
  },
} as const;

export const lanesResponseSchema = {
  type: "object",
  required: ["lanes"],
  additionalProperties: false,
  properties: {
    lanes: {
      type: "array",
      items: laneViewSchema,
    },
  },
} as const;

export const laneBodySchema = {
  type: "object",
  minProperties: 1,
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
    isCompletionLane: { type: "boolean" },
  },
} as const;

export const reorderLanesBodySchema = {
  type: "object",
  required: ["laneIds"],
  additionalProperties: false,
  properties: {
    laneIds: optionalPositiveIntegerArraySchema,
  },
} as const;
