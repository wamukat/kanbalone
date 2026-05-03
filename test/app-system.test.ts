import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import type { RemoteIssueSnapshot } from "../src/remote/adapters.js";
import packageJson from "../package.json" with { type: "json" };
import { createDbFile, createMockGithubAdapter, createMockRemoteAdapter } from "./app-test-helpers.js";

test("migration creates archive-aware ticket indexes", () => {
  const db = new KanbanDb(createDbFile());
  try {
    const indexes = db.sqlite.prepare("PRAGMA index_list(tickets)").all() as Array<{ name: string }>;
    const indexNames = new Set(indexes.map((index) => index.name));
    assert.ok(indexNames.has("tickets_active_board_lane_position_idx"));
    assert.ok(indexNames.has("tickets_active_board_resolved_lane_position_idx"));
    assert.ok(indexNames.has("tickets_archived_board_lane_position_idx"));
    assert.ok(indexNames.has("tickets_lane_archived_position_idx"));
    const tableNames = new Set(
      (db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
        .map((row) => row.name),
    );
    assert.ok(tableNames.has("ticket_events"));
    assert.ok(tableNames.has("ticket_tag_reasons"));
  } finally {
    db.close();
  }
});

test("migration normalizes ticket priorities to the API range", () => {
  const dbFile = createDbFile();
  const db = new KanbanDb(dbFile);
  try {
    const board = db.createBoard({ name: "Priority migration", laneNames: ["todo"] });
    const ticket = db.createTicket({
      boardId: board.board.id,
      laneId: board.lanes[0].id,
      title: "Out-of-range priority",
      priority: 4,
    });
    db.sqlite.prepare("UPDATE tickets SET priority = 100 WHERE id = ?").run(ticket.id);
  } finally {
    db.close();
  }

  const migrated = new KanbanDb(dbFile);
  try {
    const ticket = migrated.sqlite.prepare("SELECT priority FROM tickets").get() as { priority: number };
    assert.equal(ticket.priority, 2);
  } finally {
    migrated.close();
  }
});

test("meta endpoint exposes app name and package version", async () => {
  const previousCredentials = process.env.KANBALONE_REMOTE_CREDENTIALS;
  const previousGithubToken = process.env.GITHUB_TOKEN;
  process.env.KANBALONE_REMOTE_CREDENTIALS = JSON.stringify({
    "gitlab:http://localhost:38929": "gitlab-token",
    "redmine:http://localhost:38080": "redmine-token",
  });
  process.env.GITHUB_TOKEN = "github-token";
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/meta",
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      name: "Kanbalone",
      version: packageJson.version,
      remoteProviders: [
        { id: "github", hasCredential: true },
        { id: "gitlab", hasCredential: true },
        { id: "redmine", hasCredential: true },
      ],
    });
  } finally {
    await app.close();
    if (previousCredentials === undefined) {
      delete process.env.KANBALONE_REMOTE_CREDENTIALS;
    } else {
      process.env.KANBALONE_REMOTE_CREDENTIALS = previousCredentials;
    }
    if (previousGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousGithubToken;
    }
  }
});

test("remote diagnostics report configured providers and reachable issues", async () => {
  const dbFile = createDbFile();
  let fetchedUrl: string | undefined;
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteCredentialProviders: ["github"],
    remoteCredentialScopes: [{ provider: "github", instanceUrl: "https://github.com", wildcard: false }],
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "123",
          displayRef: "acme/kanbalone#123",
          url: "https://github.com/acme/kanbalone/issues/123",
          title: "Diagnostic target",
          bodyMarkdown: "Remote body",
          state: "open",
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
        onFetch(input) {
          fetchedUrl = input.url;
        },
      }),
    },
  });

  try {
    const providers = await app.inject({
      method: "GET",
      url: "/api/remote-diagnostics",
    });
    assert.equal(providers.statusCode, 200);
    assert.deepEqual(providers.json().providers, [
      { id: "github", hasCredential: true, status: "configured" },
      { id: "gitlab", hasCredential: false, status: "missing_credential" },
      { id: "redmine", hasCredential: false, status: "missing_credential" },
    ]);

    const reachable = await app.inject({
      method: "POST",
      url: "/api/remote-diagnostics",
      payload: {
        provider: "github",
        url: "https://github.com/acme/kanbalone/issues/123",
      },
    });
    assert.equal(reachable.statusCode, 200);
    assert.equal(fetchedUrl, "https://github.com/acme/kanbalone/issues/123");
    assert.deepEqual(reachable.json(), {
      provider: "github",
      hasCredential: true,
      status: "reachable",
      displayRef: "acme/kanbalone#123",
      url: "https://github.com/acme/kanbalone/issues/123",
      message: "Remote issue is reachable with the configured credential",
    });
  } finally {
    await app.close();
  }
});

test("remote diagnostics support exact Redmine subpath credential scopes", async () => {
  const dbFile = createDbFile();
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteCredentialProviders: ["redmine"],
    remoteCredentialScopes: [{ provider: "redmine", instanceUrl: "https://redmine.example.test/redmine", wildcard: false }],
    remoteAdapters: {
      redmine: createMockRemoteAdapter("redmine", {
        initial: {
          provider: "redmine",
          instanceUrl: "https://redmine.example.test/redmine",
          resourceType: "issue",
          projectKey: "7",
          issueKey: "7",
          displayRef: "Backend #7",
          url: "https://redmine.example.test/redmine/issues/7",
          title: "Redmine diagnostic",
          bodyMarkdown: "Remote body",
          state: "New",
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
      }),
    },
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/remote-diagnostics",
      payload: {
        provider: "redmine",
        url: "https://redmine.example.test/redmine/issues/7",
      },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "reachable");
    assert.equal(response.json().displayRef, "Backend #7");
  } finally {
    await app.close();
  }
});

test("remote diagnostics classify missing credentials and provider failures", async () => {
  const dbFile = createDbFile();
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteCredentialProviders: ["github"],
    remoteCredentialScopes: [{ provider: "github", instanceUrl: "https://github.com", wildcard: false }],
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "403",
          displayRef: "acme/kanbalone#403",
          url: "https://github.com/acme/kanbalone/issues/403",
          title: "Permission failure",
          bodyMarkdown: "Remote body",
          state: "open",
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
        onFetch() {
          throw new Error("GitHub request failed: 403 Resource not accessible by personal access token");
        },
      }),
      gitlab: createMockRemoteAdapter("gitlab", {
        initial: {
          provider: "gitlab",
          instanceUrl: "https://gitlab.example.test",
          resourceType: "issue",
          projectKey: "team/project",
          issueKey: "1",
          displayRef: "team/project#1",
          url: "https://gitlab.example.test/team/project/-/issues/1",
          title: "Missing credential",
          bodyMarkdown: "Remote body",
          state: "opened",
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
      }),
    },
  });

  try {
    const missingCredential = await app.inject({
      method: "POST",
      url: "/api/remote-diagnostics",
      payload: {
        provider: "gitlab",
        url: "https://gitlab.example.test/team/project/-/issues/1",
      },
    });
    assert.equal(missingCredential.statusCode, 400);
    assert.deepEqual(missingCredential.json(), {
      provider: "gitlab",
      hasCredential: false,
      status: "missing_credential",
      message: "Exact remote provider credential is not configured for this diagnostic target",
    });

    const permissionFailure = await app.inject({
      method: "POST",
      url: "/api/remote-diagnostics",
      payload: {
        provider: "github",
        url: "https://github.com/acme/kanbalone/issues/403",
      },
    });
    assert.equal(permissionFailure.statusCode, 400);
    assert.deepEqual(permissionFailure.json(), {
      provider: "github",
      hasCredential: true,
      status: "permission_failed",
      message: "Remote provider credential does not have permission to read this issue.",
    });
  } finally {
    await app.close();
  }
});

test("remote diagnostics require exact credential scope and do not expose raw provider errors", async () => {
  const dbFile = createDbFile();
  let fetched = false;
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteCredentialProviders: ["github"],
    remoteCredentialScopes: [{ provider: "github", instanceUrl: "*", wildcard: true }],
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.example.test",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "500",
          displayRef: "acme/kanbalone#500",
          url: "https://github.example.test/acme/kanbalone/issues/500",
          title: "Unsafe target",
          bodyMarkdown: "Remote body",
          state: "open",
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
        onFetch() {
          fetched = true;
          throw new Error("GitHub request failed: 500 echoed secret ghp_should_not_leak");
        },
      }),
    },
  });

  try {
    const wildcardTarget = await app.inject({
      method: "POST",
      url: "/api/remote-diagnostics",
      payload: {
        provider: "github",
        url: "https://github.example.test/acme/kanbalone/issues/500",
      },
    });
    assert.equal(wildcardTarget.statusCode, 400);
    assert.equal(wildcardTarget.json().status, "missing_credential");
    assert.equal(fetched, false);
  } finally {
    await app.close();
  }

  const exactApp = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
    remoteCredentialProviders: ["github"],
    remoteCredentialScopes: [{ provider: "github", instanceUrl: "https://github.com", wildcard: false }],
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "500",
          displayRef: "acme/kanbalone#500",
          url: "https://github.com/acme/kanbalone/issues/500",
          title: "Provider error",
          bodyMarkdown: "Remote body",
          state: "open",
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
        onFetch() {
          throw new Error("GitHub request failed: 500 echoed secret ghp_should_not_leak");
        },
      }),
    },
  });
  try {
    const providerFailure = await exactApp.inject({
      method: "POST",
      url: "/api/remote-diagnostics",
      payload: {
        provider: "github",
        url: "https://github.com/acme/kanbalone/issues/500",
      },
    });
    assert.equal(providerFailure.statusCode, 400);
    assert.deepEqual(providerFailure.json(), {
      provider: "github",
      hasCredential: true,
      status: "error",
      message: "Remote diagnostic failed. Check the provider URL, issue reference, and server logs.",
    });
  } finally {
    await exactApp.close();
  }
});

