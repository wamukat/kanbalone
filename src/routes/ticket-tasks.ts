import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  createTicketTask, deleteTicketTask, getTicketTask, isTaskPositiveInteger,
  listTicketTasks, requireTaskBody, TaskError, updateTicketTask,
} from "../db-modules/ticket-tasks.js";
import { getBodyRecord, getIdParam } from "../route-helpers.js";
import { taskCountProperties } from "./schemas/ticket.js";
import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";

const positiveSafeInteger = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER } as const;
const taskSchema = {
  type: "object", additionalProperties: false,
  required: ["number", "bodyMarkdown", "bodyHtml", "done", "revision"],
  properties: {
    number: positiveSafeInteger,
    bodyMarkdown: { type: "string" },
    bodyHtml: { type: "string" },
    done: { type: "boolean" },
    revision: positiveSafeInteger,
  },
} as const;
const listSchema = {
  type: "object", additionalProperties: false, required: ["tasks", "taskCount", "doneTaskCount"],
  properties: { ...taskCountProperties, tasks: { type: "array", items: taskSchema } },
} as const;
const problem = {
  type: "object", required: ["error"],
  properties: { error: { type: "string" }, code: { type: "string" } },
} as const;
const errors = { 400: problem, 404: problem, 409: problem, 428: problem } as const;

function sendTaskError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof TaskError)) throw error;
  return reply.code(error.statusCode).send({ error: error.message, code: error.code });
}

function taskBody(request: FastifyRequest, allowed: string[]) {
  if (request.body !== undefined &&
      (typeof request.body !== "object" || request.body === null || Array.isArray(request.body))) {
    throw new TaskError("Expected a JSON object", 400, "INVALID_TASK_INPUT");
  }
  const body = getBodyRecord(request.body);
  if (Object.keys(body).some(key => !allowed.includes(key))) {
    throw new TaskError("Unsupported Task input field", 400, "INVALID_TASK_INPUT");
  }
  return body;
}

function revision(body: Record<string, unknown>): number {
  if (!Object.hasOwn(body, "expectedRevision")) {
    throw new TaskError("expectedRevision is required", 428, "PRECONDITION_REQUIRED");
  }
  if (!isTaskPositiveInteger(body.expectedRevision)) {
    throw new TaskError("expectedRevision must be a positive safe integer", 400, "INVALID_TASK_REVISION");
  }
  return body.expectedRevision;
}

function completion(body: Record<string, unknown>): boolean | undefined {
  if (!Object.hasOwn(body, "done")) return undefined;
  if (typeof body.done !== "boolean") {
    throw new TaskError("done must be a boolean", 400, "INVALID_TASK_INPUT");
  }
  return body.done;
}

export function registerTicketTaskRoutes(app: FastifyInstance, { db, publishBoardEvent }: RegisterTicketRoutesContext): void {
  const collection = "/api/tickets/:ticketId/tasks";
  const item = collection + "/:taskNumber";
  const collectionParams = { type: "object", required: ["ticketId"], properties: { ticketId: positiveSafeInteger } };
  const itemParams = {
    type: "object", required: ["ticketId", "taskNumber"],
    properties: { ticketId: positiveSafeInteger, taskNumber: positiveSafeInteger },
  };
  const ticketId = (request: FastifyRequest) => getIdParam(request.params, "ticketId");
  const taskNumber = (request: FastifyRequest) => getIdParam(request.params, "taskNumber");

  app.get(collection, { schema: { params: collectionParams, response: { 200: listSchema, ...errors } } }, async (request, reply) => {
    try {
      const query = request.query as Record<string, unknown>;
      const { q, done } = query;
      if (Object.keys(query).some(key => key !== "q" && key !== "done") ||
          (q !== undefined && typeof q !== "string") ||
          (done !== undefined && done !== "true" && done !== "false")) {
        throw new TaskError("Expected one q string and a done filter of true or false", 400, "INVALID_TASK_QUERY");
      }
      return listTicketTasks(db.sqlite, ticketId(request), { q, done: done === undefined ? undefined : done === "true" });
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });

  app.get(item, { schema: { params: itemParams, response: { 200: taskSchema, ...errors } } }, async (request, reply) => {
    try {
      return getTicketTask(db.sqlite, ticketId(request), taskNumber(request));
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });

  // Validate raw JSON values to avoid AJV coercing strings to booleans or revisions.
  app.post(collection, { schema: { params: collectionParams, response: { 201: taskSchema, ...errors } } }, async (request, reply) => {
    try {
      const body = taskBody(request, ["bodyMarkdown", "done"]);
      const { boardId, task } = createTicketTask(db.sqlite, ticketId(request), { bodyMarkdown: requireTaskBody(body.bodyMarkdown), done: completion(body) }, db.now());
      publishBoardEvent(boardId);
      return reply.code(201).send(task);
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });

  app.patch(item, { schema: { params: itemParams, response: { 200: taskSchema, ...errors } } }, async (request, reply) => {
    try {
      const body = taskBody(request, ["expectedRevision", "bodyMarkdown", "done"]);
      const expected = revision(body);
      const done = completion(body);
      const { boardId, changed, task } = updateTicketTask(db.sqlite, ticketId(request), taskNumber(request), expected, {
        ...(done === undefined ? {} : { done }),
        ...(Object.hasOwn(body, "bodyMarkdown") ? { bodyMarkdown: requireTaskBody(body.bodyMarkdown) } : {}),
      }, db.now());
      if (changed) publishBoardEvent(boardId);
      return task;
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });

  app.delete(item, { schema: { params: itemParams, response: { 204: { type: "null" }, ...errors } } }, async (request, reply) => {
    try {
      const expected = revision(taskBody(request, ["expectedRevision"]));
      const { boardId } = deleteTicketTask(db.sqlite, ticketId(request), taskNumber(request), expected, db.now());
      publishBoardEvent(boardId);
      return reply.code(204).send();
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });
}
