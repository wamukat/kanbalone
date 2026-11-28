import { positiveIntegerSchema } from "./common.js";

export const activityLogViewSchema = {
  type: "object",
  required: ["id", "boardId", "ticketId", "subjectTicketId", "action", "message", "details", "createdAt", "updater"],
  additionalProperties: false,
  properties: {
    id: positiveIntegerSchema,
    boardId: positiveIntegerSchema,
    ticketId: { anyOf: [positiveIntegerSchema, { type: "null" }] },
    subjectTicketId: positiveIntegerSchema,
    action: { type: "string" },
    message: { type: "string" },
    details: { type: "object", additionalProperties: true },
    createdAt: { type: "string" },
    updater: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
} as const;

export const activityLogsResponseSchema = {
  type: "object",
  required: ["activity"],
  additionalProperties: false,
  properties: {
    activity: {
      type: "array",
      items: activityLogViewSchema,
    },
    historyPossiblyIncomplete: { type: "boolean" },
    series: { type: "string" },
  },
} as const;
