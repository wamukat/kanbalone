import type { FastifyInstance } from "fastify";

type AppMeta = {
  name: string;
  version: string;
};

const healthResponseSchema = {
  type: "object",
  required: ["ok"],
  additionalProperties: false,
  properties: {
    ok: { type: "boolean" },
  },
} as const;

const metaResponseSchema = {
  type: "object",
  required: ["name", "version"],
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    version: { type: "string" },
  },
} as const;

export function registerSystemRoutes(app: FastifyInstance, appMeta: AppMeta): void {
  app.get("/api/health", {
    schema: {
      response: {
        200: healthResponseSchema,
      },
    },
  }, async () => ({ ok: true }));

  app.get("/api/meta", {
    schema: {
      response: {
        200: metaResponseSchema,
      },
    },
  }, async () => appMeta);
}
