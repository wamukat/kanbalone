import path from "node:path";

import fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

import { readPackageMeta } from "./app-meta.js";
import { BoardEventHub } from "./board-event-hub.js";
import { KanbanDb } from "./db.js";
import type { RemoteAdapterRegistry } from "./remote/adapters.js";
import { getConfiguredCredentialProviders } from "./remote/credentials.js";
import { GithubIssueAdapter } from "./remote/github-adapter.js";
import { GitlabIssueAdapter } from "./remote/gitlab-adapter.js";
import { RedmineIssueAdapter } from "./remote/redmine-adapter.js";
import {
  getIdParam,
  parseBooleanQuery,
  parseTicketMutationBody,
  resolveResolvedFlag,
  sanitizeStringArray,
  setErrorHandler,
} from "./route-helpers.js";
import { registerBoardRoutes } from "./routes/boards.js";
import { registerLaneRoutes } from "./routes/lanes.js";
import * as routeSchemas from "./routes/schemas.js";
import {
  serializeBoardDetail,
  serializeTicket,
  serializeTicketRelation,
  serializeTicketSummaries,
} from "./routes/serializers.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerTagRoutes } from "./routes/tags.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { registerWebRoutes } from "./routes/web.js";

type BuildAppOptions = {
  dbFile: string;
  staticDir?: string;
  remoteAdapters?: RemoteAdapterRegistry;
};

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = fastify({ logger: false, bodyLimit: 64 * 1024 * 1024 });
  const db = new KanbanDb(options.dbFile);
  const staticDir = options.staticDir ?? path.join(process.cwd(), "public");
  const appMeta = readPackageMeta();
  const boardEventHub = new BoardEventHub();
  const remoteAdapters = options.remoteAdapters ?? {
    github: new GithubIssueAdapter(),
    gitlab: new GitlabIssueAdapter(),
    redmine: new RedmineIssueAdapter(),
  };
  const configuredProviders = new Set(getConfiguredCredentialProviders());
  const remoteProviderMeta = ["github", "gitlab", "redmine"].map((id) => ({
    id,
    hasCredential: configuredProviders.has(id),
  }));

  app.addHook("onClose", async () => {
    boardEventHub.close();
    db.close();
  });

  app.register(fastifyStatic, {
    root: staticDir,
    prefix: "/",
  });

  registerSystemRoutes(app, {
    ...appMeta,
    remoteProviders: remoteProviderMeta,
  });
  registerBoardRoutes(app, {
    addBoardEventClient: boardEventHub.addClient,
    db,
    getIdParam,
    publishBoardEvent: boardEventHub.publish,
    removeBoardEventClient: boardEventHub.removeClient,
    remoteAdapters,
    sanitizeStringArray,
    schemas: routeSchemas,
    serializeBoardDetail,
    serializeTicket,
  });

  registerLaneRoutes(app, {
    db,
    getIdParam,
    publishBoardEvent: boardEventHub.publish,
    schemas: routeSchemas,
  });
  registerTagRoutes(app, {
    db,
    getIdParam,
    publishBoardEvent: boardEventHub.publish,
    schemas: routeSchemas,
  });

  registerTicketRoutes(app, {
    db,
    getIdParam,
    parseBooleanQuery,
    parseTicketMutationBody,
    publishBoardEvent: boardEventHub.publish,
    resolveResolvedFlag,
    remoteAdapters,
    schemas: routeSchemas,
    serializeTicket,
    serializeTicketRelation,
    serializeTicketSummaries,
  });

  registerWebRoutes(app);

  setErrorHandler(app);
  return app;
}
