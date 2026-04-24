import type { FastifyInstance } from "fastify";

type AppMeta = {
  name: string;
  version: string;
  remoteProviders: Array<{
    id: string;
    hasCredential: boolean;
  }>;
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
  required: ["name", "version", "remoteProviders"],
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    version: { type: "string" },
    remoteProviders: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "hasCredential"],
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          hasCredential: { type: "boolean" },
        },
      },
    },
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
