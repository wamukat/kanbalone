import type { FastifyInstance } from "fastify";

export function registerWebRoutes(app: FastifyInstance): void {
  app.get("/", async (_request, reply) => {
    return reply.sendFile("index.html");
  });

  app.get("/boards/:boardId", async (_request, reply) => {
    return reply.sendFile("index.html");
  });

  app.get("/boards/:boardId/list", async (_request, reply) => {
    return reply.sendFile("index.html");
  });

  app.get("/tickets/:ticketId", async (_request, reply) => {
    return reply.sendFile("index.html");
  });
}
