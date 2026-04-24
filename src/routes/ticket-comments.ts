import type { FastifyInstance } from "fastify";

import type { RegisterTicketRoutesContext } from "./ticket-route-context.js";

export function registerTicketCommentRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext): void {
  const { db, getIdParam, publishBoardEvent, remoteAdapters, schemas } = ctx;

  app.get("/api/tickets/:ticketId/comments", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      response: {
        200: schemas.commentsResponseSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      return { comments: db.listComments(getIdParam(request.params, "ticketId")) };
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
  });

  app.post("/api/tickets/:ticketId/comments", {
    schema: {
      params: schemas.idParamsSchema("ticketId"),
      body: schemas.ticketCommentBodySchema,
      response: {
        201: schemas.commentViewSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as { bodyMarkdown?: string };
    const bodyMarkdown = body?.bodyMarkdown?.trim();
    if (!bodyMarkdown) {
      return reply.code(400).send({ error: "bodyMarkdown is required" });
    }
    try {
      const comment = db.addComment({
        ticketId: getIdParam(request.params, "ticketId"),
        bodyMarkdown,
      });
      const ticket = db.getTicket(comment.ticketId);
      if (ticket) {
        publishBoardEvent(ticket.boardId);
      }
      return reply.code(201).send(comment);
    } catch {
      return reply.code(404).send({ error: "ticket not found" });
    }
  });

  app.patch("/api/comments/:commentId", {
    schema: {
      params: schemas.idParamsSchema("commentId"),
      body: schemas.ticketCommentUpdateBodySchema,
      response: {
        200: schemas.commentViewSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as { bodyMarkdown?: string };
    const bodyMarkdown = body?.bodyMarkdown?.trim();
    if (!bodyMarkdown) {
      return reply.code(400).send({ error: "bodymarkdown is required" });
    }
    try {
      const comment = db.updateComment({
        commentId: getIdParam(request.params, "commentId"),
        bodyMarkdown,
      });
      const ticket = db.getTicket(comment.ticketId);
      if (ticket) {
        publishBoardEvent(ticket.boardId);
      }
      return comment;
    } catch (error) {
      const message = error instanceof Error ? error.message : "comment update failed";
      const code = message === "Comment not found" ? 404 : 400;
      return reply.code(code).send({ error: message.toLowerCase() });
    }
  });

  app.post("/api/comments/:commentId/push-remote", {
    schema: {
      params: schemas.idParamsSchema("commentId"),
      response: {
        200: schemas.commentViewSchema,
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    const commentId = getIdParam(request.params, "commentId");
    const comment = db.getComment(commentId);
    if (!comment) {
      return reply.code(404).send({ error: "comment not found" });
    }
    if (comment.sync.status === "pushed") {
      return reply.code(400).send({ error: "comment already pushed to remote" });
    }
    const ticket = db.getTicket(comment.ticketId);
    if (!ticket) {
      return reply.code(404).send({ error: "ticket not found" });
    }
    const remote = db.getTicketRemoteLink(ticket.id);
    if (!remote) {
      return reply.code(400).send({ error: "ticket is not linked to a remote issue" });
    }
    const adapter = remoteAdapters[remote.provider];
    if (!adapter) {
      return reply.code(400).send({ error: "unsupported remote provider" });
    }
    try {
      const result = await adapter.postComment(remote, comment.bodyMarkdown);
      const updatedSync = db.upsertCommentRemoteSync({
        commentId,
        status: "pushed",
        remoteCommentId: result.remoteCommentId,
        pushedAt: result.pushedAt,
        lastError: null,
      });
      publishBoardEvent(ticket.boardId);
      return {
        ...comment,
        sync: updatedSync,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "remote comment push failed";
      const failedSync = db.upsertCommentRemoteSync({
        commentId,
        status: "push_failed",
        lastError: message,
      });
      publishBoardEvent(ticket.boardId);
      return reply.code(400).send({ error: failedSync.lastError ?? "remote comment push failed" });
    }
  });

  app.delete("/api/comments/:commentId", {
    schema: {
      params: schemas.idParamsSchema("commentId"),
      response: {
        204: { type: "null" },
        400: schemas.errorSchema,
        404: schemas.errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const deleted = db.deleteComment(getIdParam(request.params, "commentId"));
      publishBoardEvent(deleted.boardId);
      return reply.code(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "comment not found";
      const code = message === "Comment not found" ? 404 : 400;
      return reply.code(code).send({ error: message.toLowerCase() });
    }
  });
}
