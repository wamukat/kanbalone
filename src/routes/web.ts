import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export function registerWebRoutes(app: FastifyInstance): void {
  function sendShell(_request: FastifyRequest, reply: FastifyReply) {
    // The HTML selects the current hashed assets, so it must be read after a rebuild.
    return reply.header("Cache-Control", "no-cache").sendFile("index.html", {
      cacheControl: false,
      etag: false,
      lastModified: false,
    });
  }

  for (const url of ["/", "/index.html", "/boards/:boardId", "/boards/:boardId/list", "/boards/:boardId/group", "/tickets/:ticketId", "/views", "/views/:viewId"]) {
    app.get(url, sendShell);
  }
}
