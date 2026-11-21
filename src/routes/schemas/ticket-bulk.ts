import { optionalPositiveIntegerArraySchema, positiveIntegerSchema } from "./common.js";

export const bulkTransitionTicketsBodySchema = {
  type: "object",
  required: ["ticketIds", "laneName"],
  additionalProperties: false,
  properties: {
    ticketIds: optionalPositiveIntegerArraySchema,
    laneName: { type: "string", minLength: 1 },
  },
} as const;

export const bulkArchiveTicketsBodySchema = {
  type: "object",
  required: ["ticketIds", "isArchived"],
  additionalProperties: false,
  properties: {
    ticketIds: optionalPositiveIntegerArraySchema,
    isArchived: { type: "boolean" },
  },
} as const;

export const bulkMoveTicketsBodySchema = {
  type: "object",
  required: ["ticketIds", "boardId", "laneId"],
  additionalProperties: false,
  properties: {
    ticketIds: optionalPositiveIntegerArraySchema,
    boardId: positiveIntegerSchema,
    laneId: positiveIntegerSchema,
  },
} as const;
