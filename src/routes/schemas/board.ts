import { optionalPositiveIntegerArraySchema, positiveIntegerSchema } from "./common.js";
import { laneViewSchema } from "./lane.js";
import { tagViewSchema } from "./tag.js";

export const boardViewSchema = {
  type: "object",
  required: ["id", "name", "position", "createdAt", "updatedAt"],
  additionalProperties: false,
  properties: {
    id: positiveIntegerSchema,
    name: { type: "string" },
    position: { type: "integer", minimum: 0 },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

export const boardsResponseSchema = {
  type: "object",
  required: ["boards"],
  additionalProperties: false,
  properties: {
    boards: {
      type: "array",
      items: boardViewSchema,
    },
  },
} as const;

export const boardShellResponseSchema = {
  type: "object",
  required: ["board", "lanes", "tags"],
  additionalProperties: false,
  properties: {
    board: boardViewSchema,
    lanes: {
      type: "array",
      items: laneViewSchema,
    },
    tags: {
      type: "array",
      items: tagViewSchema,
    },
  },
} as const;

export const boardCreateBodySchema = {
  type: "object",
  required: ["name"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
    defaultLaneLanguage: { type: "string", enum: ["en", "ja"] },
    laneNames: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
  },
} as const;

export const boardRenameBodySchema = {
  type: "object",
  required: ["name"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1 },
  },
} as const;

export const reorderBoardsBodySchema = {
  type: "object",
  required: ["boardIds"],
  additionalProperties: false,
  properties: {
    boardIds: optionalPositiveIntegerArraySchema,
  },
} as const;
