import { positiveIntegerSchema } from "./common.js";

export const commentSyncSchema = {
  type: "object",
  required: ["commentId", "status", "remoteCommentId", "pushedAt", "lastError", "createdAt", "updatedAt"],
  additionalProperties: false,
  properties: {
    commentId: positiveIntegerSchema,
    status: { type: "string", enum: ["local_only", "pushed", "push_failed"] },
    remoteCommentId: { anyOf: [{ type: "string" }, { type: "null" }] },
    pushedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
    lastError: { anyOf: [{ type: "string" }, { type: "null" }] },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

export const commentViewSchema = {
  type: "object",
  required: ["id", "ticketId", "bodyMarkdown", "bodyHtml", "createdAt", "sync"],
  additionalProperties: false,
  properties: {
    id: positiveIntegerSchema,
    ticketId: positiveIntegerSchema,
    bodyMarkdown: { type: "string" },
    bodyHtml: { type: "string" },
    createdAt: { type: "string" },
    sync: commentSyncSchema,
  },
} as const;

export const ticketCommentPushResponseSchema = commentViewSchema;

export const commentsResponseSchema = {
  type: "object",
  required: ["comments"],
  additionalProperties: false,
  properties: {
    comments: {
      type: "array",
      items: commentViewSchema,
    },
  },
} as const;

export const ticketCommentBodySchema = {
  type: "object",
  required: ["bodyMarkdown"],
  additionalProperties: false,
  properties: {
    bodyMarkdown: { type: "string", minLength: 1 },
  },
} as const;

export const ticketCommentUpdateBodySchema = {
  type: "object",
  required: ["bodyMarkdown"],
  additionalProperties: false,
  properties: {
    bodyMarkdown: { type: "string", minLength: 1 },
  },
} as const;
