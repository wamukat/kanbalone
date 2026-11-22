import path from "node:path";

import fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

import { readPackageMeta } from "./app-meta.js";
import { BoardEventHub } from "./board-event-hub.js";
import { boardTransferByteLimit } from "./db-modules/attachment-transfer.js";
import { KanbanDb } from "./db.js";
import type { RemoteAdapterRegistry } from "./remote/adapters.js";
import { getConfiguredCredentialProviders, getConfiguredCredentialScopes, type ConfiguredRemoteCredentialScope } from "./remote/credentials.js";
import { GithubIssueAdapter } from "./remote/github-adapter.js";
import { GitlabIssueAdapter } from "./remote/gitlab-adapter.js";
import { RedmineIssueAdapter } from "./remote/redmine-adapter.js";
import {
  getIdParam,
  parseBooleanQuery,
  parseTicketMutationBody,
  sanitizeStringArray,
  setErrorHandler,
} from "./route-helpers.js";
import { registerGroupRoutes } from "./routes/groups.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
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
  remoteCredentialProviders?: string[];
  remoteCredentialScopes?: ConfiguredRemoteCredentialScope[];
};

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = fastify({ logger: false, bodyLimit: boardTransferByteLimit });
  const parseJson = app.getDefaultJsonParser("error", "error");
  app.addContentTypeParser<string>("application/json", { parseAs: "string" }, (request, body, done) => {
    if (body === "" && request.method === "DELETE" && !request.routeOptions.schema?.body) {
      done(null, undefined);
      return;
    }
    parseJson(request, body, done);
  });
  const db = new KanbanDb(options.dbFile);
  const staticDir = options.staticDir ?? path.join(process.cwd(), "public");
  const appMeta = readPackageMeta();
  const boardEventHub = new BoardEventHub();
  const remoteAdapters = options.remoteAdapters ?? {
    github: new GithubIssueAdapter(),
    gitlab: new GitlabIssueAdapter(),
    redmine: new RedmineIssueAdapter(),
  };
  const configuredProviders = new Set(options.remoteCredentialProviders ?? getConfiguredCredentialProviders());
  const remoteCredentialScopes = options.remoteCredentialScopes ?? getConfiguredCredentialScopes();
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
    setHeaders(reply, filePath) {
      const bundled = path.dirname(filePath) === path.join(staticDir, "generated")
        && /^(?:app-[A-Z0-9]{8}\.js|styles-[A-Z0-9]{8}\.css)$/.test(path.basename(filePath));
      if (bundled) reply.header("Cache-Control", "public, max-age=31536000, immutable");
    },
  });

  registerSystemRoutes(app, {
    ...appMeta,
    remoteProviders: remoteProviderMeta,
    remoteAdapters,
    remoteCredentialScopes,
  });
  registerAttachmentRoutes(app, db.attachments);
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

  registerGroupRoutes(app, { db, publishBoardEvent: boardEventHub.publish });

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
