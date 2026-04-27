import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import type { RemoteIssueAdapter, RemoteIssueSnapshot } from "../src/remote/adapters.js";
import packageJson from "../package.json" with { type: "json" };

function createDbFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kanbalone-test-")), "test.sqlite");
}

function createMockRemoteAdapter(
  provider: string,
  options: {
  initial: RemoteIssueSnapshot;
  refreshed?: RemoteIssueSnapshot;
  postCommentResult?: { remoteCommentId: string; pushedAt: string };
  postCommentError?: Error;
  onFetch?(input: Parameters<RemoteIssueAdapter["fetchIssue"]>[0]): void;
  onRefresh?(input: Parameters<RemoteIssueAdapter["refreshIssue"]>[0]): void;
  onPostComment?(bodyMarkdown: string): void;
},
): RemoteIssueAdapter {
  return {
    provider,
    async fetchIssue(input) {
      options.onFetch?.(input);
      return options.initial;
    },
    async refreshIssue(link) {
      options.onRefresh?.(link);
      return options.refreshed ?? options.initial;
    },
    async postComment(_link, bodyMarkdown) {
      options.onPostComment?.(bodyMarkdown);
      if (options.postCommentError) {
        throw options.postCommentError;
      }
      return options.postCommentResult ?? {
        remoteCommentId: "remote-comment-1",
        pushedAt: "2026-04-23T00:00:00.000Z",
      };
    },
  };
}

function createMockGithubAdapter(options: Parameters<typeof createMockRemoteAdapter>[1]): RemoteIssueAdapter {
  return createMockRemoteAdapter("github", options);
}

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

test("board lifecycle, ticket filters, reorder, and export/import", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const createdBoardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Ops Board", laneNames: ["todo", "doing", "done"] },
  });
  assert.equal(createdBoardResponse.statusCode, 201);
  const createdBoard = createdBoardResponse.json();
  const boardId = createdBoard.board.id;
  const [todoLane, doingLane] = createdBoard.lanes;

  const bugTagResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/tags`,
    payload: { name: "bug", color: "#ff0000" },
  });
  assert.equal(bugTagResponse.statusCode, 201);
  const bugTag = bugTagResponse.json();

  const docsTagResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/tags`,
    payload: { name: "docs", color: "#00aa00" },
  });
  const docsTag = docsTagResponse.json();

  const firstTicketResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/tickets`,
    payload: {
      laneId: todoLane.id,
      title: "Fix parser",
      bodyMarkdown: "Needs **attention**",
      priority: 4,
      tagIds: [bugTag.id],
      isResolved: false,
    },
  });
  assert.equal(firstTicketResponse.statusCode, 201);
  const firstTicket = firstTicketResponse.json();
  assert.equal(firstTicket.isResolved, false);
  assert.equal(firstTicket.isCompleted, false);

  const secondTicketResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/tickets`,
    payload: {
      laneId: todoLane.id,
      parentTicketId: firstTicket.id,
      title: "Write docs",
      bodyMarkdown: "Link [guide](https://example.com)",
      priority: 2,
      tagIds: [docsTag.id],
      isResolved: true,
    },
  });
  const secondTicket = secondTicketResponse.json();
  assert.equal(secondTicket.isResolved, true);
  assert.equal(secondTicket.isCompleted, true);
  assert.equal(secondTicket.priority, 2);
  assert.equal(secondTicket.parentTicketId, firstTicket.id);
  assert.deepEqual(secondTicket.blockerIds, []);

  for (const priority of [0, 100, 3.5]) {
    const invalidPriorityCreateResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${boardId}/tickets`,
      payload: {
        laneId: todoLane.id,
        title: `Invalid priority ${priority}`,
        priority,
      },
    });
    assert.equal(invalidPriorityCreateResponse.statusCode, 400);
  }

  const boardShellResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}`,
  });
  assert.equal(boardShellResponse.statusCode, 200);
  assert.ok(!("tickets" in boardShellResponse.json()));

  const summaryResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets`,
  });
  assert.equal(summaryResponse.statusCode, 200);
  const summaryTicket = summaryResponse.json().tickets.find((ticket: { id: number }) => ticket.id === firstTicket.id);
  assert.ok(!("comments" in summaryTicket));
  assert.ok(!("bodyHtml" in summaryTicket));
  assert.equal(summaryTicket.ref, `Ops Board#${firstTicket.id}`);

  const filteredResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets?tag=bug&completed=false&q=parser`,
  });
  assert.equal(filteredResponse.statusCode, 200);
  const filtered = filteredResponse.json();
  assert.equal(filtered.tickets.length, 1);
  assert.equal(filtered.tickets[0].id, firstTicket.id);
  assert.equal(filtered.tickets[0].id, firstTicket.id);
  assert.equal(filtered.tickets[0].ref, `Ops Board#${firstTicket.id}`);
  assert.equal(filtered.tickets[0].shortRef, `#${firstTicket.id}`);
  assert.ok(!("bodyHtml" in filtered.tickets[0]));

  const idFilteredResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets?q=${firstTicket.id}`,
  });
  assert.equal(idFilteredResponse.statusCode, 200);
  assert.deepEqual(
    idFilteredResponse.json().tickets.map((ticket: { id: number }) => ticket.id),
    [firstTicket.id],
  );

  const shortRefFilteredResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets?q=%23${firstTicket.id}`,
  });
  assert.equal(shortRefFilteredResponse.statusCode, 200);
  assert.deepEqual(
    shortRefFilteredResponse.json().tickets.map((ticket: { id: number }) => ticket.id),
    [firstTicket.id],
  );

  const prioritySearchResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets?q=priority%3Ahigh`,
  });
  assert.equal(prioritySearchResponse.statusCode, 200);
  assert.deepEqual(
    prioritySearchResponse.json().tickets.map((ticket: { id: number }) => ticket.id),
    [],
  );

  const commentResponse = await app.inject({
    method: "POST",
    url: `/api/tickets/${firstTicket.id}/comments`,
    payload: {
      bodyMarkdown: "Checked with `logs`",
    },
  });
  assert.equal(commentResponse.statusCode, 201);

  const updateResponse = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${firstTicket.id}`,
    payload: { laneId: doingLane.id, priority: 4, blockerIds: [secondTicket.id] },
  });
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(updateResponse.json().laneId, doingLane.id);
  assert.equal(updateResponse.json().isResolved, false);
  assert.equal(updateResponse.json().priority, 4);
  assert.equal(updateResponse.json().children.length, 1);
  assert.deepEqual(updateResponse.json().blockerIds, [secondTicket.id]);
  assert.equal(updateResponse.json().ref, `Ops Board#${firstTicket.id}`);
  assert.equal(updateResponse.json().shortRef, `#${firstTicket.id}`);

  for (const priority of [0, 100, 3.5]) {
    const invalidPriorityUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/tickets/${firstTicket.id}`,
      payload: { priority },
    });
    assert.equal(invalidPriorityUpdateResponse.statusCode, 400);
  }

  const reorderResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/tickets/reorder`,
    payload: {
      items: [
        { ticketId: secondTicket.id, laneId: doingLane.id, position: 0 },
        { ticketId: firstTicket.id, laneId: todoLane.id, position: 0 },
      ],
    },
  });
  assert.equal(reorderResponse.statusCode, 200);

  const reorderedActivityResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${firstTicket.id}/activity`,
  });
  assert.equal(reorderedActivityResponse.statusCode, 200);
  assert.ok(
    reorderedActivityResponse.json().activity.some((entry: { action: string; message: string }) =>
      entry.action === "ticket_transitioned" && entry.message === "Moved to todo"),
  );

  const exportResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/export`,
  });
  assert.equal(exportResponse.statusCode, 200);
  const exported = exportResponse.json();
  assert.equal(exported.tickets.length, 2);
  assert.ok(!("bodyHtml" in exported.tickets[0]));
  assert.equal(exported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").comments.length, 1);
  assert.equal(exported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").priority, 4);
  assert.deepEqual(
    exported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").blockerIds,
    [secondTicket.id],
  );
  assert.equal(
    exported.tickets.find((ticket: { title: string }) => ticket.title === "Write docs").parentTicketId,
    firstTicket.id,
  );

  const importResponse = await app.inject({
    method: "POST",
    url: "/api/boards/import",
    payload: exported,
  });
  assert.equal(importResponse.statusCode, 201);
  const imported = importResponse.json();
  assert.equal(imported.tags.length, 2);
  assert.equal(imported.tickets.length, 2);
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").comments.length, 1);
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").priority, 4);
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").children.length, 1);
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Write docs").parent?.title, "Fix parser");
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").blockerIds.length, 1);

  await app.close();
});

test("comment list, relations, transition, and canonical refs", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const createdBoardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Portal", laneNames: ["Todo", "In progress", "Done"] },
  });
  assert.equal(createdBoardResponse.statusCode, 201);
  const board = createdBoardResponse.json();
  const [todoLane, inProgressLane] = board.lanes;

  const parent = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "Parent" },
  })).json();

  const child = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "Child", parentTicketId: parent.id },
  })).json();

  const dependency = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: inProgressLane.id, title: "Dependency" },
  })).json();

  const updatedParent = (await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}`,
    payload: { blockerIds: [dependency.id] },
  })).json();
  assert.equal(updatedParent.blockers[0].ref, `Portal#${dependency.id}`);

  const firstComment = await app.inject({
    method: "POST",
    url: `/api/tickets/${parent.id}/comments`,
    payload: { bodyMarkdown: "First comment" },
  });
  assert.equal(firstComment.statusCode, 201);

  const secondComment = await app.inject({
    method: "POST",
    url: `/api/tickets/${parent.id}/comments`,
    payload: { bodyMarkdown: "Second comment" },
  });
  assert.equal(secondComment.statusCode, 201);

  const ticketDetail = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}`,
  });
  assert.equal(ticketDetail.statusCode, 200);
  assert.equal(ticketDetail.json().ref, `Portal#${parent.id}`);
  assert.equal(ticketDetail.json().shortRef, `#${parent.id}`);
  assert.equal(ticketDetail.json().children.length, 1);
  assert.equal(ticketDetail.json().children[0].id, child.id);
  assert.equal(ticketDetail.json().blockers.length, 1);
  assert.equal(ticketDetail.json().blockers[0].id, dependency.id);

  const dependencyDetail = await app.inject({
    method: "GET",
    url: `/api/tickets/${dependency.id}`,
  });
  assert.equal(dependencyDetail.statusCode, 200);
  assert.equal(dependencyDetail.json().blockedBy.length, 1);
  assert.equal(dependencyDetail.json().blockedBy[0].id, parent.id);

  const commentsResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/comments`,
  });
  assert.equal(commentsResponse.statusCode, 200);
  assert.deepEqual(
    commentsResponse.json().comments.map((comment: { bodyMarkdown: string }) => comment.bodyMarkdown),
    ["Second comment", "First comment"],
  );

  const firstCommentId = commentsResponse.json().comments[1].id;
  const updateCommentResponse = await app.inject({
    method: "PATCH",
    url: `/api/comments/${firstCommentId}`,
    payload: { bodyMarkdown: "First comment updated" },
  });
  assert.equal(updateCommentResponse.statusCode, 200);
  assert.equal(updateCommentResponse.json().bodyMarkdown, "First comment updated");

  const activityResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/activity`,
  });
  assert.equal(activityResponse.statusCode, 200);
  const updatedCommentActivity = activityResponse.json().activity.find((entry: {
    action: string;
    details: { oldBodyMarkdown?: string; newBodyMarkdown?: string };
  }) => entry.action === "comment_updated");
  assert.ok(updatedCommentActivity);
  assert.equal(updatedCommentActivity.details.oldBodyMarkdown, "First comment");
  assert.equal(updatedCommentActivity.details.newBodyMarkdown, "First comment updated");

  const deleteCommentResponse = await app.inject({
    method: "DELETE",
    url: `/api/comments/${firstCommentId}`,
  });
  assert.equal(deleteCommentResponse.statusCode, 204);

  const commentsAfterDeleteResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/comments`,
  });
  assert.equal(commentsAfterDeleteResponse.statusCode, 200);
  assert.equal(commentsAfterDeleteResponse.json().comments.length, 1);

  const deleteActivityResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/activity`,
  });
  assert.equal(deleteActivityResponse.statusCode, 200);
  const deletedCommentActivity = deleteActivityResponse.json().activity.find((entry: {
    action: string;
    details: { deletedBodyMarkdown?: string };
  }) => entry.action === "comment_deleted");
  assert.ok(deletedCommentActivity);
  assert.equal(deletedCommentActivity.details.deletedBodyMarkdown, "First comment updated");

  const relationsResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/relations`,
  });
  assert.equal(relationsResponse.statusCode, 200);
  const relations = relationsResponse.json();
  assert.equal(relations.parent, null);
  assert.equal(relations.children.length, 1);
  assert.equal(relations.children[0].id, child.id);
  assert.equal(relations.children[0].laneId, todoLane.id);
  assert.equal(relations.children[0].ref, `Portal#${child.id}`);
  assert.equal(relations.blockers.length, 1);
  assert.equal(relations.blockers[0].id, dependency.id);
  assert.equal(relations.blockers[0].laneId, inProgressLane.id);
  assert.equal(relations.blockedBy.length, 0);

  const reverseRelationsResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${dependency.id}/relations`,
  });
  assert.equal(reverseRelationsResponse.statusCode, 200);
  assert.equal(reverseRelationsResponse.json().blockedBy.length, 1);
  assert.equal(reverseRelationsResponse.json().blockedBy[0].id, parent.id);

  const clearBlockersResponse = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}`,
    payload: { blockerIds: null },
  });
  assert.equal(clearBlockersResponse.statusCode, 200);
  assert.deepEqual(clearBlockersResponse.json().blockerIds, []);

  const reverseRelationsAfterClearResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${dependency.id}/relations`,
  });
  assert.equal(reverseRelationsAfterClearResponse.statusCode, 200);
  assert.equal(reverseRelationsAfterClearResponse.json().blockedBy.length, 0);

  const dependencyDetailAfterClear = await app.inject({
    method: "GET",
    url: `/api/tickets/${dependency.id}`,
  });
  assert.equal(dependencyDetailAfterClear.statusCode, 200);
  assert.equal(dependencyDetailAfterClear.json().blockedBy.length, 0);

  const clearParentResponse = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${child.id}`,
    payload: { parentTicketId: null },
  });
  assert.equal(clearParentResponse.statusCode, 200);
  assert.equal(clearParentResponse.json().parentTicketId, null);

  const parentRelationsAfterClearResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/relations`,
  });
  assert.equal(parentRelationsAfterClearResponse.statusCode, 200);
  assert.equal(parentRelationsAfterClearResponse.json().children.length, 0);

  const parentDetailAfterClear = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}`,
  });
  assert.equal(parentDetailAfterClear.statusCode, 200);
  assert.equal(parentDetailAfterClear.json().children.length, 0);

  const transitionResponse = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}/transition`,
    payload: { laneName: "Done", isResolved: true },
  });
  assert.equal(transitionResponse.statusCode, 200);
  assert.equal(transitionResponse.json().laneId, board.lanes[2].id);
  assert.equal(transitionResponse.json().isResolved, true);
  assert.equal(transitionResponse.json().ref, `Portal#${parent.id}`);

  const archiveResponse = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}`,
    payload: { isArchived: true },
  });
  assert.equal(archiveResponse.statusCode, 200);
  assert.equal(archiveResponse.json().isArchived, true);

  const hiddenArchivedSummary = await app.inject({
    method: "GET",
    url: `/api/boards/${board.board.id}/tickets`,
  });
  assert.equal(hiddenArchivedSummary.statusCode, 200);
  assert.equal(
    hiddenArchivedSummary.json().tickets.some((ticket: { id: number }) => ticket.id === parent.id),
    false,
  );

  const includedArchivedSummary = await app.inject({
    method: "GET",
    url: `/api/boards/${board.board.id}/tickets?archived=all`,
  });
  assert.equal(includedArchivedSummary.statusCode, 200);
  assert.equal(
    includedArchivedSummary.json().tickets.some((ticket: { id: number; isArchived: boolean }) => ticket.id === parent.id && ticket.isArchived === true),
    true,
  );

  const missingComments = await app.inject({
    method: "GET",
    url: "/api/tickets/99999/comments",
  });
  assert.equal(missingComments.statusCode, 404);

  const missingRelations = await app.inject({
    method: "GET",
    url: "/api/tickets/99999/relations",
  });
  assert.equal(missingRelations.statusCode, 404);

  const missingActivity = await app.inject({
    method: "GET",
    url: "/api/tickets/99999/activity",
  });
  assert.equal(missingActivity.statusCode, 404);

  const invalidTransition = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}/transition`,
    payload: { laneName: "Nope" },
  });
  assert.equal(invalidTransition.statusCode, 400);

  const schemaRejectedTransition = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}/transition`,
    payload: {},
  });
  assert.equal(schemaRejectedTransition.statusCode, 400);

  const schemaRejectedTicketCreate = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "", unexpected: true },
  });
  assert.equal(schemaRejectedTicketCreate.statusCode, 400);

  await app.close();
});

test("ticket detail, summary, and comments expose remote and sync fields", async () => {
  const dbFile = createDbFile();
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
  });

  const db = new KanbanDb(dbFile);
  try {
    const createdBoardResponse = await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote API", laneNames: ["todo"] },
    });
    const board = createdBoardResponse.json();
    const ticket = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/tickets`,
      payload: { laneId: board.lanes[0].id, title: "Tracked ticket", bodyMarkdown: "Local body" },
    })).json();

    const comment = (await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/comments`,
      payload: { bodyMarkdown: "Started work" },
    })).json();

    db.upsertTicketRemoteLink({
      ticketId: ticket.id,
      provider: "github",
      instanceUrl: "https://github.com",
      resourceType: "issue",
      projectKey: "acme/kanbalone",
      issueKey: "77",
      displayRef: "acme/kanbalone#77",
      url: "https://github.com/acme/kanbalone/issues/77",
      title: "Tracked ticket",
      bodyMarkdown: "Remote body",
      state: "open",
      updatedAt: "2026-04-23T00:00:00.000Z",
      lastSyncedAt: "2026-04-23T00:00:01.000Z",
    });
    db.upsertCommentRemoteSync({
      commentId: comment.id,
      status: "pushed",
      remoteCommentId: "gh-comment-1",
      pushedAt: "2026-04-23T00:00:02.000Z",
    });

    const detail = await app.inject({
      method: "GET",
      url: `/api/tickets/${ticket.id}`,
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().remote.displayRef, "acme/kanbalone#77");
    assert.equal(detail.json().remote.bodyMarkdown, "Remote body");
    assert.match(detail.json().remote.bodyHtml, /<p>Remote body<\/p>/);
    assert.equal(detail.json().comments[0].sync.status, "pushed");

    const summary = await app.inject({
      method: "GET",
      url: `/api/boards/${board.board.id}/tickets`,
    });
    assert.equal(summary.statusCode, 200);
    assert.deepEqual(summary.json().tickets[0].remote, {
      provider: "github",
      displayRef: "acme/kanbalone#77",
      url: "https://github.com/acme/kanbalone/issues/77",
    });

    const comments = await app.inject({
      method: "GET",
      url: `/api/tickets/${ticket.id}/comments`,
    });
    assert.equal(comments.statusCode, 200);
    assert.equal(comments.json().comments[0].sync.remoteCommentId, "gh-comment-1");

    const plainTicket = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/tickets`,
      payload: { laneId: board.lanes[0].id, title: "Plain ticket" },
    })).json();
    const plainDetail = await app.inject({
      method: "GET",
      url: `/api/tickets/${plainTicket.id}`,
    });
    assert.equal(plainDetail.statusCode, 200);
    assert.equal(plainDetail.json().remote, null);
  } finally {
    db.close();
    await app.close();
  }
});

test("remote import creates a tracked ticket and prevents duplicate imports", async () => {
  const dbFile = createDbFile();
  let fetchedUrl: string | undefined;
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "101",
          displayRef: "acme/kanbalone#101",
          url: "https://github.com/acme/kanbalone/issues/101",
          title: "Imported remote issue",
          bodyMarkdown: "Remote implementation context",
          state: "open",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
        onFetch(input) {
          fetchedUrl = input.url;
        },
      }),
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Import", laneNames: ["todo"] },
    })).json();

    const importResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        url: "https://github.com/acme/kanbalone/issues/101",
      },
    });
    assert.equal(importResponse.statusCode, 201);
    assert.equal(fetchedUrl, "https://github.com/acme/kanbalone/issues/101");
    assert.equal(importResponse.json().title, "Imported remote issue");
    assert.equal(importResponse.json().bodyMarkdown, "Remote implementation context");
    assert.equal(importResponse.json().remote.displayRef, "acme/kanbalone#101");
    assert.equal(importResponse.json().remote.bodyMarkdown, "Remote implementation context");
    assert.match(importResponse.json().remote.bodyHtml, /<p>Remote implementation context<\/p>/);

    const duplicateResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        projectKey: "acme/kanbalone",
        issueKey: "101",
      },
    });
    assert.equal(duplicateResponse.statusCode, 409);
    assert.equal(duplicateResponse.json().error, "remote issue already imported");
  } finally {
    await app.close();
  }
});

test("remote import preview resolves remote issue and reports duplicates", async () => {
  const dbFile = createDbFile();
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "102",
          displayRef: "acme/kanbalone#102",
          url: "https://github.com/acme/kanbalone/issues/102",
          title: "Preview remote issue",
          bodyMarkdown: "Preview body",
          state: "open",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
      }),
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Import Preview", laneNames: ["todo"] },
    })).json();

    const previewResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import/preview`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        url: "https://github.com/acme/kanbalone/issues/102",
      },
    });
    assert.equal(previewResponse.statusCode, 200);
    assert.equal(previewResponse.json().displayRef, "acme/kanbalone#102");
    assert.equal(previewResponse.json().title, "Preview remote issue");
    assert.equal(previewResponse.json().state, "open");
    assert.equal(previewResponse.json().duplicate, false);
    assert.equal(previewResponse.json().existingTicketId, null);

    const importResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        url: "https://github.com/acme/kanbalone/issues/102",
      },
    });
    assert.equal(importResponse.statusCode, 201);

    const duplicatePreviewResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import/preview`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        url: "https://github.com/acme/kanbalone/issues/102",
      },
    });
    assert.equal(duplicatePreviewResponse.statusCode, 200);
    assert.equal(duplicatePreviewResponse.json().duplicate, true);
    assert.equal(duplicatePreviewResponse.json().existingTicketId, importResponse.json().id);
    assert.equal(duplicatePreviewResponse.json().existingTicketRef, importResponse.json().ref);
  } finally {
    await app.close();
  }
});

test("remote import preview rejects invalid issue URLs", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Import Preview Invalid", laneNames: ["todo"] },
    })).json();

    const previewResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import/preview`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        url: "not-a-url",
      },
    });
    assert.equal(previewResponse.statusCode, 400);
    assert.match(previewResponse.json().error, /invalid url/);
  } finally {
    await app.close();
  }
});

test("remote import preview sanitizes upstream provider errors", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: {
        provider: "github",
        async fetchIssue() {
          throw new Error("GitHub request failed: 500 echoed token secret-token-value");
        },
        async refreshIssue() {
          throw new Error("not used");
        },
        async postComment() {
          throw new Error("not used");
        },
      },
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Import Preview Sanitized", laneNames: ["todo"] },
    })).json();

    const previewResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import/preview`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        url: "https://github.com/acme/kanbalone/issues/103",
      },
    });
    assert.equal(previewResponse.statusCode, 400);
    assert.equal(previewResponse.json().error, "remote import preview failed");
    assert.doesNotMatch(JSON.stringify(previewResponse.json()), /secret-token-value/);
  } finally {
    await app.close();
  }
});

test("remote import can post an optional backlink comment once", async () => {
  const dbFile = createDbFile();
  const postedBodies: string[] = [];
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "104",
          displayRef: "acme/kanbalone#104",
          url: "https://github.com/acme/kanbalone/issues/104",
          title: "Backlink remote issue",
          bodyMarkdown: "Backlink body",
          state: "open",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
        onPostComment(bodyMarkdown) {
          postedBodies.push(bodyMarkdown);
        },
      }),
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Import Backlink", laneNames: ["todo"] },
    })).json();

    const importResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        url: "https://github.com/acme/kanbalone/issues/104",
        postBacklinkComment: true,
      },
    });
    assert.equal(importResponse.statusCode, 201);
    assert.deepEqual(postedBodies, [`Imported into Kanbalone as ${importResponse.json().ref}.`]);

    const duplicateResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        url: "https://github.com/acme/kanbalone/issues/104",
        postBacklinkComment: true,
      },
    });
    assert.equal(duplicateResponse.statusCode, 409);
    assert.equal(postedBodies.length, 1);
  } finally {
    await app.close();
  }
});

test("remote import backlink can include an explicit Kanbalone URL", async () => {
  const postedBodies: string[] = [];
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "105",
          displayRef: "acme/kanbalone#105",
          url: "https://github.com/acme/kanbalone/issues/105",
          title: "Backlink URL remote issue",
          bodyMarkdown: "Backlink URL body",
          state: "open",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
        onPostComment(bodyMarkdown) {
          postedBodies.push(bodyMarkdown);
        },
      }),
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Import Backlink URL", laneNames: ["todo"] },
    })).json();

    const importResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        url: "https://github.com/acme/kanbalone/issues/105",
        postBacklinkComment: true,
        backlinkUrl: "https://kanbalone.example.test/boards/1/tickets/105",
      },
    });
    assert.equal(importResponse.statusCode, 201);
    assert.deepEqual(postedBodies, [
      `Imported into Kanbalone as ${importResponse.json().ref}: https://kanbalone.example.test/boards/1/tickets/105`,
    ]);
  } finally {
    await app.close();
  }
});

test("remote import rejects invalid backlink URLs", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Import Invalid Backlink", laneNames: ["todo"] },
    })).json();

    const importResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        url: "https://github.com/acme/kanbalone/issues/106",
        postBacklinkComment: true,
        backlinkUrl: "not a url\n@channel",
      },
    });
    assert.equal(importResponse.statusCode, 400);
    assert.equal(importResponse.json().error, "backlinkUrl must be an absolute http or https URL");
  } finally {
    await app.close();
  }
});

test("remote import sanitizes upstream provider errors", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: {
        provider: "github",
        async fetchIssue() {
          throw new Error("GitHub request failed: 500 echoed token secret-token-value");
        },
        async refreshIssue() {
          throw new Error("not used");
        },
        async postComment() {
          throw new Error("not used");
        },
      },
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Import Sanitized", laneNames: ["todo"] },
    })).json();

    const importResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        url: "https://github.com/acme/kanbalone/issues/107",
      },
    });
    assert.equal(importResponse.statusCode, 400);
    assert.equal(importResponse.json().error, "remote import failed");
    assert.doesNotMatch(JSON.stringify(importResponse.json()), /secret-token-value/);
  } finally {
    await app.close();
  }
});

test("remote refresh updates title and remote snapshot without overwriting local body", async () => {
  const dbFile = createDbFile();
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "202",
          displayRef: "acme/kanbalone#202",
          url: "https://github.com/acme/kanbalone/issues/202",
          title: "Initial remote title",
          bodyMarkdown: "Initial remote body",
          state: "open",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
        refreshed: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "202",
          displayRef: "acme/kanbalone#202",
          url: "https://github.com/acme/kanbalone/issues/202",
          title: "Updated remote title",
          bodyMarkdown: "Updated remote body",
          state: "open",
          updatedAt: "2026-04-23T10:00:00.000Z",
        },
      }),
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Refresh", laneNames: ["todo"] },
    })).json();

    const imported = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        projectKey: "acme/kanbalone",
        issueKey: "202",
      },
    })).json();

    const localEdit = await app.inject({
      method: "PATCH",
      url: `/api/tickets/${imported.id}`,
      payload: { bodyMarkdown: "Expanded local implementation body" },
    });
    assert.equal(localEdit.statusCode, 200);
    assert.equal(localEdit.json().bodyMarkdown, "Expanded local implementation body");

    const refreshResponse = await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/remote-refresh`,
    });
    assert.equal(refreshResponse.statusCode, 200);
    assert.equal(refreshResponse.json().title, "Updated remote title");
    assert.equal(refreshResponse.json().bodyMarkdown, "Expanded local implementation body");
    assert.equal(refreshResponse.json().remote.title, "Updated remote title");
    assert.equal(refreshResponse.json().remote.bodyMarkdown, "Updated remote body");
    assert.match(refreshResponse.json().remote.bodyHtml, /<p>Updated remote body<\/p>/);
    assert.equal(refreshResponse.json().remote.remoteUpdatedAt, "2026-04-23T10:00:00.000Z");
  } finally {
    await app.close();
  }
});

test("remote sync operations are recorded in ticket activity", async () => {
  const initial: RemoteIssueSnapshot = {
    provider: "github",
    instanceUrl: "https://github.com",
    resourceType: "issue",
    projectKey: "acme/kanbalone",
    issueKey: "208",
    displayRef: "acme/kanbalone#208",
    url: "https://github.com/acme/kanbalone/issues/208",
    title: "Activity remote title",
    bodyMarkdown: "Activity remote body",
    state: "open",
    updatedAt: "2026-04-23T09:00:00.000Z",
  };
  const refreshed: RemoteIssueSnapshot = {
    ...initial,
    title: "Activity remote title updated",
    bodyMarkdown: "Activity remote body updated",
    updatedAt: "2026-04-23T10:00:00.000Z",
  };
  let failNextCommentPush = false;
  let remoteCommentId = 0;
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: {
        provider: "github",
        async fetchIssue() {
          return initial;
        },
        async refreshIssue() {
          return refreshed;
        },
        async postComment() {
          if (failNextCommentPush) {
            throw new Error("provider echoed token secret-token-value");
          }
          remoteCommentId += 1;
          return {
            remoteCommentId: `remote-comment-${remoteCommentId}`,
            pushedAt: "2026-04-23T11:00:00.000Z",
          };
        },
      },
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Activity", laneNames: ["todo"] },
    })).json();

    const imported = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        projectKey: "acme/kanbalone",
        issueKey: "208",
      },
    })).json();

    const refreshResponse = await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/remote-refresh`,
    });
    assert.equal(refreshResponse.statusCode, 200);

    const pushedComment = (await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/comments`,
      payload: { bodyMarkdown: "Successful remote push" },
    })).json();
    const pushResponse = await app.inject({
      method: "POST",
      url: `/api/comments/${pushedComment.id}/push-remote`,
    });
    assert.equal(pushResponse.statusCode, 200);

    failNextCommentPush = true;
    const failedComment = (await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/comments`,
      payload: { bodyMarkdown: "Failed remote push" },
    })).json();
    const failedPushResponse = await app.inject({
      method: "POST",
      url: `/api/comments/${failedComment.id}/push-remote`,
    });
    assert.equal(failedPushResponse.statusCode, 400);

    const activityResponse = await app.inject({
      method: "GET",
      url: `/api/tickets/${imported.id}/activity`,
    });
    assert.equal(activityResponse.statusCode, 200);
    const activity = activityResponse.json().activity;

    const importActivity = activity.find((entry: { action: string }) => entry.action === "remote_imported");
    assert.equal(importActivity.message, "Remote issue imported");
    assert.equal(importActivity.details.provider, "github");
    assert.equal(importActivity.details.displayRef, "acme/kanbalone#208");

    const refreshActivity = activity.find((entry: { action: string }) => entry.action === "remote_refreshed");
    assert.equal(refreshActivity.message, "Remote issue refreshed");
    assert.equal(refreshActivity.details.remoteUpdatedAt, "2026-04-23T10:00:00.000Z");

    const pushActivity = activity.find((entry: { action: string }) => entry.action === "remote_comment_pushed");
    assert.equal(pushActivity.message, "Remote comment pushed");
    assert.equal(pushActivity.details.commentId, pushedComment.id);
    assert.equal(pushActivity.details.remoteCommentId, "remote-comment-1");

    const failureActivity = activity.find((entry: { action: string }) => entry.action === "remote_comment_push_failed");
    assert.equal(failureActivity.message, "Remote comment push failed");
    assert.equal(failureActivity.details.commentId, failedComment.id);
    assert.equal(failureActivity.details.error, "Remote comment push failed. Check the provider URL, issue reference, permissions, and server logs.");
    assert.doesNotMatch(JSON.stringify(failureActivity), /secret-token-value/);
  } finally {
    await app.close();
  }
});

test("gitlab remote routes support import refresh and comment push", async () => {
  const dbFile = createDbFile();
  let pushedBodyMarkdown: string | undefined;
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      gitlab: createMockRemoteAdapter("gitlab", {
        initial: {
          provider: "gitlab",
          instanceUrl: "https://gitlab.example.test",
          resourceType: "issue",
          projectKey: "team/platform",
          issueKey: "12",
          displayRef: "team/platform#12",
          url: "https://gitlab.example.test/team/platform/-/issues/12",
          title: "Initial GitLab title",
          bodyMarkdown: "Initial GitLab body",
          state: "opened",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
        refreshed: {
          provider: "gitlab",
          instanceUrl: "https://gitlab.example.test",
          resourceType: "issue",
          projectKey: "team/platform",
          issueKey: "12",
          displayRef: "team/platform#12",
          url: "https://gitlab.example.test/team/platform/-/issues/12",
          title: "Updated GitLab title",
          bodyMarkdown: "Updated GitLab body",
          state: "opened",
          updatedAt: "2026-04-23T10:00:00.000Z",
        },
        postCommentResult: {
          remoteCommentId: "gitlab-note-12",
          pushedAt: "2026-04-23T11:00:00.000Z",
        },
        onPostComment(bodyMarkdown) {
          pushedBodyMarkdown = bodyMarkdown;
        },
      }),
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "GitLab Remote", laneNames: ["todo"] },
    })).json();

    const imported = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "gitlab",
        laneId: board.lanes[0].id,
        url: "https://gitlab.example.test/team/platform/-/issues/12",
      },
    })).json();
    assert.equal(imported.remote.provider, "gitlab");
    assert.equal(imported.remote.displayRef, "team/platform#12");

    await app.inject({
      method: "PATCH",
      url: `/api/tickets/${imported.id}`,
      payload: { bodyMarkdown: "Local GitLab implementation notes" },
    });

    const refreshed = await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/remote-refresh`,
    });
    assert.equal(refreshed.statusCode, 200);
    assert.equal(refreshed.json().title, "Updated GitLab title");
    assert.equal(refreshed.json().bodyMarkdown, "Local GitLab implementation notes");
    assert.equal(refreshed.json().remote.bodyMarkdown, "Updated GitLab body");

    const comment = (await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/comments`,
      payload: { bodyMarkdown: "GitLab progress update" },
    })).json();

    const pushed = await app.inject({
      method: "POST",
      url: `/api/comments/${comment.id}/push-remote`,
    });
    assert.equal(pushed.statusCode, 200);
    assert.equal(pushedBodyMarkdown, "GitLab progress update");
    assert.equal(pushed.json().sync.remoteCommentId, "gitlab-note-12");
  } finally {
    await app.close();
  }
});

test("redmine remote routes support import refresh and comment push", async () => {
  const dbFile = createDbFile();
  let pushedBodyMarkdown: string | undefined;
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      redmine: createMockRemoteAdapter("redmine", {
        initial: {
          provider: "redmine",
          instanceUrl: "https://redmine.example.test/redmine",
          resourceType: "issue",
          projectKey: "9",
          issueKey: "42",
          displayRef: "Backend #42",
          url: "https://redmine.example.test/redmine/issues/42",
          title: "Initial Redmine title",
          bodyMarkdown: "Initial Redmine body",
          state: "New",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
        refreshed: {
          provider: "redmine",
          instanceUrl: "https://redmine.example.test/redmine",
          resourceType: "issue",
          projectKey: "9",
          issueKey: "42",
          displayRef: "Backend #42",
          url: "https://redmine.example.test/redmine/issues/42",
          title: "Updated Redmine title",
          bodyMarkdown: "Updated Redmine body",
          state: "In Progress",
          updatedAt: "2026-04-23T10:00:00.000Z",
        },
        postCommentResult: {
          remoteCommentId: "redmine-journal-42",
          pushedAt: "2026-04-23T11:00:00.000Z",
        },
        onPostComment(bodyMarkdown) {
          pushedBodyMarkdown = bodyMarkdown;
        },
      }),
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Redmine Remote", laneNames: ["todo"] },
    })).json();

    const imported = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "redmine",
        laneId: board.lanes[0].id,
        url: "https://redmine.example.test/redmine/issues/42",
      },
    })).json();
    assert.equal(imported.remote.provider, "redmine");
    assert.equal(imported.remote.displayRef, "Backend #42");

    await app.inject({
      method: "PATCH",
      url: `/api/tickets/${imported.id}`,
      payload: { bodyMarkdown: "Local Redmine implementation notes" },
    });

    const refreshed = await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/remote-refresh`,
    });
    assert.equal(refreshed.statusCode, 200);
    assert.equal(refreshed.json().title, "Updated Redmine title");
    assert.equal(refreshed.json().bodyMarkdown, "Local Redmine implementation notes");
    assert.equal(refreshed.json().remote.bodyMarkdown, "Updated Redmine body");

    const comment = (await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/comments`,
      payload: { bodyMarkdown: "Redmine progress update" },
    })).json();

    const pushed = await app.inject({
      method: "POST",
      url: `/api/comments/${comment.id}/push-remote`,
    });
    assert.equal(pushed.statusCode, 200);
    assert.equal(pushedBodyMarkdown, "Redmine progress update");
    assert.equal(pushed.json().sync.remoteCommentId, "redmine-journal-42");
  } finally {
    await app.close();
  }
});

test("remote refresh rejects adapter identity drift", async () => {
  const dbFile = createDbFile();
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "250",
          displayRef: "acme/kanbalone#250",
          url: "https://github.com/acme/kanbalone/issues/250",
          title: "Original issue",
          bodyMarkdown: "Original body",
          state: "open",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
        refreshed: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "251",
          displayRef: "acme/kanbalone#251",
          url: "https://github.com/acme/kanbalone/issues/251",
          title: "Different issue",
          bodyMarkdown: "Different body",
          state: "open",
          updatedAt: "2026-04-23T10:00:00.000Z",
        },
      }),
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Drift", laneNames: ["todo"] },
    })).json();

    const imported = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        projectKey: "acme/kanbalone",
        issueKey: "250",
      },
    })).json();

    const refreshResponse = await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/remote-refresh`,
    });
    assert.equal(refreshResponse.statusCode, 400);
    assert.equal(refreshResponse.json().error, "remote refresh returned a different issue");

    const activityResponse = await app.inject({
      method: "GET",
      url: `/api/tickets/${imported.id}/activity`,
    });
    assert.equal(activityResponse.statusCode, 200);
    const failureActivity = activityResponse.json().activity.find((entry: { action: string }) => entry.action === "remote_refresh_failed");
    assert.equal(failureActivity.message, "Remote issue refresh failed");
    assert.equal(failureActivity.details.error, "remote refresh returned a different issue");
  } finally {
    await app.close();
  }
});

test("remote tracked ticket blocks title edits and pushed comments become read-only after remote push", async () => {
  const dbFile = createDbFile();
  let pushedBodyMarkdown: string | undefined;
  let pushCount = 0;
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "303",
          displayRef: "acme/kanbalone#303",
          url: "https://github.com/acme/kanbalone/issues/303",
          title: "Remote write rules",
          bodyMarkdown: "Remote body",
          state: "open",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
        postCommentResult: {
          remoteCommentId: "gh-comment-303",
          pushedAt: "2026-04-23T11:00:00.000Z",
        },
        onPostComment(bodyMarkdown) {
          pushedBodyMarkdown = bodyMarkdown;
          pushCount += 1;
        },
      }),
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Guards", laneNames: ["todo"] },
    })).json();

    const imported = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        projectKey: "acme/kanbalone",
        issueKey: "303",
      },
    })).json();

    const titlePatch = await app.inject({
      method: "PATCH",
      url: `/api/tickets/${imported.id}`,
      payload: { title: "Do not allow this" },
    });
    assert.equal(titlePatch.statusCode, 400);
    assert.equal(titlePatch.json().error, "remote tracked ticket title is read-only");

    const comment = (await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/comments`,
      payload: { bodyMarkdown: "Posting progress to remote" },
    })).json();

    const pushResponse = await app.inject({
      method: "POST",
      url: `/api/comments/${comment.id}/push-remote`,
    });
    assert.equal(pushResponse.statusCode, 200);
    assert.equal(pushedBodyMarkdown, "Posting progress to remote");
    assert.equal(pushResponse.json().sync.status, "pushed");
    assert.equal(pushResponse.json().sync.remoteCommentId, "gh-comment-303");

    const secondPushResponse = await app.inject({
      method: "POST",
      url: `/api/comments/${comment.id}/push-remote`,
    });
    assert.equal(secondPushResponse.statusCode, 400);
    assert.equal(secondPushResponse.json().error, "comment already pushed to remote");
    assert.equal(pushCount, 1);

    const editPushedComment = await app.inject({
      method: "PATCH",
      url: `/api/comments/${comment.id}`,
      payload: { bodyMarkdown: "Edited after push" },
    });
    assert.equal(editPushedComment.statusCode, 400);
    assert.equal(editPushedComment.json().error, "pushed comments are read-only");

    const deletePushedComment = await app.inject({
      method: "DELETE",
      url: `/api/comments/${comment.id}`,
    });
    assert.equal(deletePushedComment.statusCode, 400);
    assert.equal(deletePushedComment.json().error, "pushed comments cannot be deleted");
  } finally {
    await app.close();
  }
});

test("board export omits remote metadata and imported board becomes local-only", async () => {
  const dbFile = createDbFile();
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "505",
          displayRef: "acme/kanbalone#505",
          url: "https://github.com/acme/kanbalone/issues/505",
          title: "Export remote ticket",
          bodyMarkdown: "Remote body copied into local body",
          state: "open",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
        postCommentResult: {
          remoteCommentId: "gh-comment-505",
          pushedAt: "2026-04-23T11:00:00.000Z",
        },
      }),
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Export", laneNames: ["todo"] },
    })).json();

    const imported = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        projectKey: "acme/kanbalone",
        issueKey: "505",
      },
    })).json();
    const comment = (await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/comments`,
      payload: { bodyMarkdown: "Remote progress" },
    })).json();
    await app.inject({
      method: "POST",
      url: `/api/comments/${comment.id}/push-remote`,
    });

    const exportResponse = await app.inject({
      method: "GET",
      url: `/api/boards/${board.board.id}/export`,
    });
    assert.equal(exportResponse.statusCode, 200);
    const exported = exportResponse.json();
    assert.ok(!("remote" in exported.tickets[0]));
    assert.ok(!("sync" in exported.tickets[0].comments[0]));

    const importResponse = await app.inject({
      method: "POST",
      url: "/api/boards/import",
      payload: exported,
    });
    assert.equal(importResponse.statusCode, 201);
    const importedBoard = importResponse.json();
    const localOnlyTicket = importedBoard.tickets[0];
    assert.equal(localOnlyTicket.remote, null);
    assert.equal(localOnlyTicket.comments[0].sync.status, "local_only");
  } finally {
    await app.close();
  }
});

test("remote comment push failures persist push_failed sync state", async () => {
  const dbFile = createDbFile();
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "404",
          displayRef: "acme/kanbalone#404",
          url: "https://github.com/acme/kanbalone/issues/404",
          title: "Remote push failure",
          bodyMarkdown: "Remote body",
          state: "open",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
        postCommentError: new Error("remote API unavailable"),
      }),
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Push Failure", laneNames: ["todo"] },
    })).json();

    const imported = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        projectKey: "acme/kanbalone",
        issueKey: "404",
      },
    })).json();

    const comment = (await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/comments`,
      payload: { bodyMarkdown: "This push will fail" },
    })).json();

    const pushResponse = await app.inject({
      method: "POST",
      url: `/api/comments/${comment.id}/push-remote`,
    });
    assert.equal(pushResponse.statusCode, 400);
    assert.equal(pushResponse.json().error, "Remote comment push failed. Check the provider URL, issue reference, permissions, and server logs.");

    const comments = await app.inject({
      method: "GET",
      url: `/api/tickets/${imported.id}/comments`,
    });
    assert.equal(comments.statusCode, 200);
    assert.equal(comments.json().comments[0].sync.status, "push_failed");
    assert.equal(comments.json().comments[0].sync.lastError, "Remote comment push failed. Check the provider URL, issue reference, permissions, and server logs.");
  } finally {
    await app.close();
  }
});

test("remote comment push can recover stale pushing state", async () => {
  const dbFile = createDbFile();
  let postCount = 0;
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "406",
          displayRef: "acme/kanbalone#406",
          url: "https://github.com/acme/kanbalone/issues/406",
          title: "Stale push recovery",
          bodyMarkdown: "Remote body",
          state: "open",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
        postCommentResult: {
          remoteCommentId: "gh-comment-406",
          pushedAt: "2026-04-23T11:00:00.000Z",
        },
        onPostComment() {
          postCount += 1;
        },
      }),
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Push Stale", laneNames: ["todo"] },
    })).json();
    const imported = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        projectKey: "acme/kanbalone",
        issueKey: "406",
      },
    })).json();
    const comment = (await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/comments`,
      payload: { bodyMarkdown: "Recover stale push" },
    })).json();

    const db = new KanbanDb(dbFile);
    try {
      db.upsertCommentRemoteSync({ commentId: comment.id, status: "pushing" });
      db.sqlite
        .prepare("UPDATE comment_remote_sync SET updated_at = ? WHERE comment_id = ?")
        .run("2026-04-23T00:00:00.000Z", comment.id);
    } finally {
      db.close();
    }

    const response = await app.inject({
      method: "POST",
      url: `/api/comments/${comment.id}/push-remote`,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().sync.status, "pushed");
    assert.equal(response.json().sync.remoteCommentId, "gh-comment-406");
    assert.equal(postCount, 1);
  } finally {
    await app.close();
  }
});

test("remote comment push rejects concurrent duplicate attempts", async () => {
  const dbFile = createDbFile();
  let postCount = 0;
  let releasePost: (() => void) | undefined;
  let resolvePostStarted: () => void = () => {};
  const postStarted = new Promise<void>((resolve) => {
    resolvePostStarted = resolve;
  });
  const app = buildApp({
    dbFile,
    staticDir: path.join(process.cwd(), "public"),
    remoteAdapters: {
      github: {
        provider: "github",
        async fetchIssue() {
          return {
            provider: "github",
            instanceUrl: "https://github.com",
            resourceType: "issue",
            projectKey: "acme/kanbalone",
            issueKey: "405",
            displayRef: "acme/kanbalone#405",
            url: "https://github.com/acme/kanbalone/issues/405",
            title: "Concurrent push",
            bodyMarkdown: "Remote body",
            state: "open",
            updatedAt: "2026-04-23T09:00:00.000Z",
          };
        },
        async refreshIssue(link) {
          return {
            provider: "github",
            instanceUrl: link.instanceUrl,
            resourceType: link.resourceType,
            projectKey: link.projectKey,
            issueKey: link.issueKey,
            displayRef: link.displayRef,
            url: link.url,
            title: link.title,
            bodyMarkdown: link.bodyMarkdown,
            state: link.state,
            updatedAt: link.remoteUpdatedAt,
          };
        },
        async postComment() {
          postCount += 1;
          resolvePostStarted();
          await new Promise<void>((release) => {
            releasePost = release;
          });
          return {
            remoteCommentId: "gh-comment-405",
            pushedAt: "2026-04-23T11:00:00.000Z",
          };
        },
      },
    },
  });

  try {
    const board = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Remote Push Race", laneNames: ["todo"] },
    })).json();

    const imported = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        projectKey: "acme/kanbalone",
        issueKey: "405",
      },
    })).json();

    const comment = (await app.inject({
      method: "POST",
      url: `/api/tickets/${imported.id}/comments`,
      payload: { bodyMarkdown: "Only push this once" },
    })).json();

    const firstPush = app.inject({
      method: "POST",
      url: `/api/comments/${comment.id}/push-remote`,
    });
    await postStarted;

    const pendingComments = await app.inject({
      method: "GET",
      url: `/api/tickets/${imported.id}/comments`,
    });
    assert.equal(pendingComments.json().comments[0].sync.status, "pushing");

    const secondPush = await app.inject({
      method: "POST",
      url: `/api/comments/${comment.id}/push-remote`,
    });
    assert.equal(secondPush.statusCode, 409);
    assert.equal(secondPush.json().error, "comment push already in progress");

    releasePost?.();
    const firstPushResponse = await firstPush;
    assert.equal(firstPushResponse.statusCode, 200);
    assert.equal(firstPushResponse.json().sync.status, "pushed");
    assert.equal(firstPushResponse.json().sync.remoteCommentId, "gh-comment-405");
    assert.equal(postCount, 1);
  } finally {
    releasePost?.();
    await app.close();
  }
});

test("ticket delete activity is retained after ticket removal", () => {
  const db = new KanbanDb(createDbFile());
  const board = db.createBoard({ name: "Delete Log Board", laneNames: ["todo"] });
  const laneId = board.lanes[0].id;
  const ticket = db.createTicket({
    boardId: board.board.id,
    laneId,
    title: "Delete me",
  });

  db.deleteTicket(ticket.id);

  const rows = db.sqlite
    .prepare("SELECT ticket_id, subject_ticket_id, action, message FROM activity_logs WHERE subject_ticket_id = ? AND action = ?")
    .all(ticket.id, "ticket_deleted") as Array<{ ticket_id: number | null; subject_ticket_id: number; action: string; message: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ticket_id, null);
  assert.equal(rows[0].subject_ticket_id, ticket.id);
  assert.equal(rows[0].action, "ticket_deleted");
  assert.equal(rows[0].message, "Ticket deleted");

  db.close();
});

test("tickets can move between boards with safe tag and relation cleanup", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  try {
    const sourceBoard = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Move Source", laneNames: ["todo", "done"] },
    })).json();
    const targetBoard = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Move Target", laneNames: ["todo", "done"] },
    })).json();
    const sourceLane = sourceBoard.lanes[0];
    const targetLane = targetBoard.lanes[1];

    const keepSourceTag = (await app.inject({
      method: "POST",
      url: `/api/boards/${sourceBoard.board.id}/tags`,
      payload: { name: "keep", color: "#111111" },
    })).json();
    const dropSourceTag = (await app.inject({
      method: "POST",
      url: `/api/boards/${sourceBoard.board.id}/tags`,
      payload: { name: "drop", color: "#222222" },
    })).json();
    const keepTargetTag = (await app.inject({
      method: "POST",
      url: `/api/boards/${targetBoard.board.id}/tags`,
      payload: { name: "keep", color: "#333333" },
    })).json();

    const movingTicket = (await app.inject({
      method: "POST",
      url: `/api/boards/${sourceBoard.board.id}/tickets`,
      payload: {
        laneId: sourceLane.id,
        title: "Move me",
        bodyMarkdown: "Keep this body",
        priority: 4,
        tagIds: [keepSourceTag.id, dropSourceTag.id],
      },
    })).json();
    const childTicket = (await app.inject({
      method: "POST",
      url: `/api/boards/${sourceBoard.board.id}/tickets`,
      payload: { laneId: sourceLane.id, title: "Child", parentTicketId: movingTicket.id },
    })).json();
    const blockerTicket = (await app.inject({
      method: "POST",
      url: `/api/boards/${sourceBoard.board.id}/tickets`,
      payload: { laneId: sourceLane.id, title: "Blocker" },
    })).json();
    const blockedTicket = (await app.inject({
      method: "POST",
      url: `/api/boards/${sourceBoard.board.id}/tickets`,
      payload: { laneId: sourceLane.id, title: "Blocked", blockerIds: [movingTicket.id] },
    })).json();

    const updateBlockerResponse = await app.inject({
      method: "PATCH",
      url: `/api/tickets/${movingTicket.id}`,
      payload: { blockerIds: [blockerTicket.id] },
    });
    assert.equal(updateBlockerResponse.statusCode, 200);

    const invalidMoveResponse = await app.inject({
      method: "POST",
      url: `/api/tickets/${movingTicket.id}/move`,
      payload: { boardId: targetBoard.board.id, laneId: sourceLane.id },
    });
    assert.equal(invalidMoveResponse.statusCode, 400);

    const moveResponse = await app.inject({
      method: "POST",
      url: `/api/tickets/${movingTicket.id}/move`,
      payload: { boardId: targetBoard.board.id, laneId: targetLane.id },
    });
    assert.equal(moveResponse.statusCode, 200);
    assert.equal(moveResponse.json().boardId, targetBoard.board.id);
    assert.equal(moveResponse.json().laneId, targetLane.id);
    assert.equal(moveResponse.json().bodyMarkdown, "Keep this body");
    assert.equal(moveResponse.json().priority, 4);
    assert.deepEqual(moveResponse.json().tags.map((tag: { id: number }) => tag.id), [keepTargetTag.id]);
    assert.deepEqual(moveResponse.json().blockerIds, []);
    assert.equal(moveResponse.json().children.length, 0);
    assert.equal(moveResponse.json().ref, `Move Target#${movingTicket.id}`);

    const childAfterMove = (await app.inject({ method: "GET", url: `/api/tickets/${childTicket.id}` })).json();
    assert.equal(childAfterMove.parentTicketId, null);
    const blockedAfterMove = (await app.inject({ method: "GET", url: `/api/tickets/${blockedTicket.id}` })).json();
    assert.deepEqual(blockedAfterMove.blockerIds, []);
    const activity = (await app.inject({ method: "GET", url: `/api/tickets/${movingTicket.id}/activity` })).json();
    assert.equal(activity.activity.some((entry: { action: string; message: string }) =>
      entry.action === "ticket_moved_board" && entry.message === "Moved to Move Target / done"), true);
  } finally {
    await app.close();
  }
});

test("deleted ticket activity remains available through the API", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const board = (await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Deleted Activity Board", laneNames: ["todo"] },
  })).json();
  const laneId = board.lanes[0].id;
  const ticket = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId, title: "Delete me through API" },
  })).json();

  const deleteResponse = await app.inject({
    method: "DELETE",
    url: `/api/tickets/${ticket.id}`,
  });
  assert.equal(deleteResponse.statusCode, 204);

  const activityResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${ticket.id}/activity`,
  });
  assert.equal(activityResponse.statusCode, 200);
  assert.equal(activityResponse.json().activity[0].action, "ticket_deleted");
  assert.equal(activityResponse.json().activity[0].ticketId, null);
  assert.equal(activityResponse.json().activity[0].subjectTicketId, ticket.id);

  await app.close();
});

test("boards can be reordered", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const first = (await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "First" },
  })).json();
  const second = (await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Second" },
  })).json();
  const third = (await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Third" },
  })).json();

  const reorderResponse = await app.inject({
    method: "POST",
    url: "/api/boards/reorder",
    payload: { boardIds: [third.board.id, first.board.id, second.board.id] },
  });
  assert.equal(reorderResponse.statusCode, 200);
  assert.deepEqual(
    reorderResponse.json().boards.map((board: { name: string; position: number }) => ({ name: board.name, position: board.position })),
    [
      { name: "Third", position: 0 },
      { name: "First", position: 1 },
      { name: "Second", position: 2 },
    ],
  );

  const listResponse = await app.inject({ method: "GET", url: "/api/boards" });
  assert.deepEqual(
    listResponse.json().boards.map((board: { name: string }) => board.name),
    ["Third", "First", "Second"],
  );

  const invalidResponse = await app.inject({
    method: "POST",
    url: "/api/boards/reorder",
    payload: { boardIds: [first.board.id, second.board.id] },
  });
  assert.equal(invalidResponse.statusCode, 400);

  await app.close();
});

test("reordering visible tickets preserves stable archived positions on restore", () => {
  const db = new KanbanDb(createDbFile());
  const board = db.createBoard({ name: "Archive Order Board", laneNames: ["todo"] });
  const laneId = board.lanes[0].id;
  const first = db.createTicket({ boardId: board.board.id, laneId, title: "First" });
  const second = db.createTicket({ boardId: board.board.id, laneId, title: "Second" });
  const third = db.createTicket({ boardId: board.board.id, laneId, title: "Third" });

  db.updateTicket(second.id, { isArchived: true });
  db.reorderTickets(board.board.id, [
    { ticketId: third.id, laneId, position: 0 },
    { ticketId: first.id, laneId, position: 1 },
  ]);

  db.updateTicket(second.id, { isArchived: false });

  const restored = db.listTickets(board.board.id, { includeArchived: true });
  assert.deepEqual(
    restored.map((ticket) => ({ id: ticket.id, position: ticket.position })),
    [
      { id: third.id, position: 0 },
      { id: first.id, position: 1 },
      { id: second.id, position: 2 },
    ],
  );

  db.close();
});

test("positioning one ticket moves it without requiring hidden board tickets", () => {
  const db = new KanbanDb(createDbFile());
  const board = db.createBoard({ name: "Single Position Board", laneNames: ["todo", "done"] });
  const todoLaneId = board.lanes[0].id;
  const doneLaneId = board.lanes[1].id;
  const first = db.createTicket({ boardId: board.board.id, laneId: todoLaneId, title: "First" });
  const moving = db.createTicket({ boardId: board.board.id, laneId: todoLaneId, title: "Moving" });
  const after = db.createTicket({ boardId: board.board.id, laneId: doneLaneId, title: "After" });
  for (let index = 0; index < 10; index += 1) {
    db.createTicket({ boardId: board.board.id, laneId: todoLaneId, title: `Resolved ${index}`, isResolved: true });
  }

  const moved = db.positionTicket(moving.id, { laneId: doneLaneId, position: 0 });

  assert.equal(moved.laneId, doneLaneId);
  assert.deepEqual(
    db.listTickets(board.board.id, { includeArchived: true })
      .filter((ticket) => ticket.laneId === doneLaneId)
      .map((ticket) => ({ id: ticket.id, position: ticket.position })),
    [
      { id: moving.id, position: 0 },
      { id: after.id, position: 1 },
    ],
  );
  assert.equal(db.getTicket(first.id)?.laneId, todoLaneId);

  db.close();
});

test("positioning one ticket honors visible anchors when target lane has hidden inactive tickets", () => {
  const db = new KanbanDb(createDbFile());
  const board = db.createBoard({ name: "Anchored Position Board", laneNames: ["todo", "done"] });
  const todoLaneId = board.lanes[0].id;
  const doneLaneId = board.lanes[1].id;
  const moving = db.createTicket({ boardId: board.board.id, laneId: todoLaneId, title: "Moving" });
  const resolved = Array.from({ length: 10 }, (_, index) =>
    db.createTicket({ boardId: board.board.id, laneId: doneLaneId, title: `Resolved ${index}`, isResolved: true })
  );
  const anchor = db.createTicket({ boardId: board.board.id, laneId: doneLaneId, title: "Visible anchor" });

  db.positionTicket(moving.id, {
    laneId: doneLaneId,
    position: 4,
    afterTicketId: anchor.id,
  });

  assert.deepEqual(
    db.listTickets(board.board.id, { includeArchived: true })
      .filter((ticket) => ticket.laneId === doneLaneId)
      .map((ticket) => ticket.id),
    [...resolved.map((ticket) => ticket.id), anchor.id, moving.id],
  );

  db.close();
});

test("ticket position endpoint validates lane and anchor scope", async () => {
  const app = buildApp({ dbFile: createDbFile() });
  const boardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Position API Board", laneNames: ["todo", "done"] },
  });
  const board = boardResponse.json() as { board: { id: number }; lanes: Array<{ id: number }> };
  const otherBoardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Other Position Board", laneNames: ["todo"] },
  });
  const otherBoard = otherBoardResponse.json() as { board: { id: number }; lanes: Array<{ id: number }> };
  const ticketResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: board.lanes[0].id, title: "Moving" },
  });
  const ticket = ticketResponse.json() as { id: number };
  const otherLaneTicketResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${otherBoard.board.id}/tickets`,
    payload: { laneId: otherBoard.lanes[0].id, title: "Other" },
  });
  const otherLaneTicket = otherLaneTicketResponse.json() as { id: number };

  const invalidBody = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${ticket.id}/position`,
    payload: { position: 0 },
  });
  assert.equal(invalidBody.statusCode, 400);

  const crossBoardLane = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${ticket.id}/position`,
    payload: { laneId: otherBoard.lanes[0].id, position: 0 },
  });
  assert.equal(crossBoardLane.statusCode, 400);

  const crossBoardAnchor = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${ticket.id}/position`,
    payload: { laneId: board.lanes[1].id, afterTicketId: otherLaneTicket.id },
  });
  assert.equal(crossBoardAnchor.statusCode, 400);

  const missingTicket = await app.inject({
    method: "PATCH",
    url: "/api/tickets/999999/position",
    payload: { laneId: board.lanes[1].id, position: 0 },
  });
  assert.equal(missingTicket.statusCode, 404);

  await app.close();
});

test("deleting a lane compacts remaining lane positions", () => {
  const db = new KanbanDb(createDbFile());
  const board = db.createBoard({ name: "Lane Position Board", laneNames: ["Todo", "Doing", "Review", "Done"] });

  db.deleteLane(board.lanes[1].id);

  assert.deepEqual(
    db.listLanes(board.board.id).map((lane) => ({ name: lane.name, position: lane.position })),
    [
      { name: "Todo", position: 0 },
      { name: "Review", position: 1 },
      { name: "Done", position: 2 },
    ],
  );

  db.close();
});

test("bulk resolve and bulk transition operate on board ticket sets", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const createdBoardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Bulk Board", laneNames: ["Todo", "Doing", "Done"] },
  });
  assert.equal(createdBoardResponse.statusCode, 201);
  const board = createdBoardResponse.json();
  const [todoLane, doingLane, doneLane] = board.lanes;

  const first = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "One" },
  })).json();
  const second = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: doingLane.id, title: "Two" },
  })).json();

  const bulkResolve = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets/bulk-complete`,
    payload: { ticketIds: [first.id, second.id], isResolved: true },
  });
  assert.equal(bulkResolve.statusCode, 200);
  assert.deepEqual(
    bulkResolve.json().tickets.map((ticket: { id: number; isResolved: boolean }) => [ticket.id, ticket.isResolved]),
    [[first.id, true], [second.id, true]],
  );

  const bulkTransition = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets/bulk-transition`,
    payload: { ticketIds: [first.id, second.id], laneName: "Done", isResolved: true },
  });
  assert.equal(bulkTransition.statusCode, 200);
  const transitioned = bulkTransition.json().tickets;
  assert.equal(transitioned.length, 2);
  assert.ok(transitioned.every((ticket: { laneId: number; isResolved: boolean }) => ticket.laneId === doneLane.id));
  assert.ok(transitioned.every((ticket: { isResolved: boolean }) => ticket.isResolved === true));

  const detailOne = await app.inject({
    method: "GET",
    url: `/api/tickets/${first.id}`,
  });
  assert.equal(detailOne.json().laneId, doneLane.id);
  assert.equal(detailOne.json().isResolved, true);

  const bulkArchive = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets/bulk-archive`,
    payload: { ticketIds: [first.id, second.id], isArchived: true },
  });
  assert.equal(bulkArchive.statusCode, 200);
  assert.ok(bulkArchive.json().tickets.every((ticket: { isArchived: boolean }) => ticket.isArchived === true));

  const hiddenArchived = await app.inject({
    method: "GET",
    url: `/api/boards/${board.board.id}/tickets`,
  });
  assert.equal(hiddenArchived.statusCode, 200);
  assert.equal(hiddenArchived.json().tickets.length, 0);

  const bulkRestore = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets/bulk-archive`,
    payload: { ticketIds: [first.id, second.id], isArchived: false },
  });
  assert.equal(bulkRestore.statusCode, 200);
  assert.ok(bulkRestore.json().tickets.every((ticket: { isArchived: boolean }) => ticket.isArchived === false));

  const missingLaneTransition = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets/bulk-transition`,
    payload: { ticketIds: [first.id], laneName: "Missing" },
  });
  assert.equal(missingLaneTransition.statusCode, 400);

  const missingTicket = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets/bulk-complete`,
    payload: { ticketIds: [first.id, 99999], isResolved: false },
  });
  assert.equal(missingTicket.statusCode, 400);

  await app.close();
});

test("bulk move is atomic when any selected ticket is invalid", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const sourceBoard = (await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Bulk Move Atomic Source", laneNames: ["todo"] },
  })).json();
  const targetBoard = (await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Bulk Move Atomic Target", laneNames: ["todo"] },
  })).json();
  const first = (await app.inject({
    method: "POST",
    url: `/api/boards/${sourceBoard.board.id}/tickets`,
    payload: { laneId: sourceBoard.lanes[0].id, title: "First" },
  })).json();
  const second = (await app.inject({
    method: "POST",
    url: `/api/boards/${sourceBoard.board.id}/tickets`,
    payload: { laneId: sourceBoard.lanes[0].id, title: "Second" },
  })).json();

  const invalidMove = await app.inject({
    method: "POST",
    url: `/api/boards/${sourceBoard.board.id}/tickets/bulk-move`,
    payload: { ticketIds: [first.id, 999999], boardId: targetBoard.board.id, laneId: targetBoard.lanes[0].id },
  });
  assert.equal(invalidMove.statusCode, 400);
  assert.equal((await app.inject({ method: "GET", url: `/api/tickets/${first.id}` })).json().boardId, sourceBoard.board.id);

  const moved = await app.inject({
    method: "POST",
    url: `/api/boards/${sourceBoard.board.id}/tickets/bulk-move`,
    payload: { ticketIds: [first.id, second.id], boardId: targetBoard.board.id, laneId: targetBoard.lanes[0].id },
  });
  assert.equal(moved.statusCode, 200);
  assert.deepEqual(
    moved.json().tickets.map((ticket: { id: number; boardId: number; laneId: number }) => [ticket.id, ticket.boardId, ticket.laneId]),
    [
      [first.id, targetBoard.board.id, targetBoard.lanes[0].id],
      [second.id, targetBoard.board.id, targetBoard.lanes[0].id],
    ],
  );

  await app.close();
});

test("ticket event API stores opaque structured events", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  try {
    const createdBoardResponse = await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Events Board", laneNames: ["todo"] },
    });
    assert.equal(createdBoardResponse.statusCode, 201);
    const board = createdBoardResponse.json();
    const ticket = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/tickets`,
      payload: { laneId: board.lanes[0].id, title: "Event target" },
    })).json();

    const created = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/events`,
      payload: {
        source: "a2o",
        kind: "remote_branch_pushed",
        title: "Remote branch pushed",
        summary: "Pushed task branch.",
        severity: "success",
        icon: "git-branch",
        data: { branch: "a2o/test", commit: "abc123" },
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().source, "a2o");
    assert.equal(created.json().kind, "remote_branch_pushed");
    assert.deepEqual(created.json().data, { branch: "a2o/test", commit: "abc123" });

    const second = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/events`,
      payload: {
        source: "ci",
        kind: "check_finished",
        title: "Check finished",
      },
    });
    assert.equal(second.statusCode, 201);

    const listed = await app.inject({
      method: "GET",
      url: `/api/tickets/${ticket.id}/events`,
    });
    assert.equal(listed.statusCode, 200);
    assert.deepEqual(
      listed.json().events.map((event: { title: string }) => event.title),
      ["Check finished", "Remote branch pushed"],
    );

    const activity = await app.inject({
      method: "GET",
      url: `/api/tickets/${ticket.id}/activity`,
    });
    assert.equal(activity.statusCode, 200);
    assert.ok(
      activity.json().activity.every((entry: { action: string }) => entry.action !== "ticket_event_added"),
    );

    const missing = await app.inject({
      method: "POST",
      url: "/api/tickets/999999/events",
      payload: { source: "a2o", kind: "missing", title: "Missing" },
    });
    assert.equal(missing.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("ticket tag reason API returns current attached tag metadata only", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  try {
    const createdBoardResponse = await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Tag Reason Board", laneNames: ["todo"] },
    });
    assert.equal(createdBoardResponse.statusCode, 201);
    const board = createdBoardResponse.json();
    const tag = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/tags`,
      payload: { name: "needs:clarification", color: "#eeeeee" },
    })).json();
    const otherTag = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/tags`,
      payload: { name: "blocked", color: "#eeeeee" },
    })).json();
    const ticket = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/tickets`,
      payload: { laneId: board.lanes[0].id, title: "Tag reason target" },
    })).json();

    const setReason = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/tags/${tag.id}`,
      payload: {
        reason: "Need scope clarification.",
        details: { question: "Which workflow owns this?" },
      },
    });
    assert.equal(setReason.statusCode, 200);
    assert.equal(setReason.json().tag.name, "needs:clarification");
    assert.equal(setReason.json().reason, "Need scope clarification.");
    assert.deepEqual(setReason.json().details, { question: "Which workflow owns this?" });

    const listed = await app.inject({
      method: "GET",
      url: `/api/tickets/${ticket.id}/tag-reasons`,
    });
    assert.equal(listed.statusCode, 200);
    assert.deepEqual(
      listed.json().tags.map((entry: { tag: { name: string }; reason: string | null }) => [entry.tag.name, entry.reason]),
      [["needs:clarification", "Need scope clarification."]],
    );

    const retained = await app.inject({
      method: "PATCH",
      url: `/api/tickets/${ticket.id}`,
      payload: { tagIds: [tag.id, otherTag.id] },
    });
    assert.equal(retained.statusCode, 200);
    const afterRetain = await app.inject({
      method: "GET",
      url: `/api/tickets/${ticket.id}/tag-reasons`,
    });
    assert.equal(afterRetain.statusCode, 200);
    assert.deepEqual(
      afterRetain.json().tags.map((entry: { tag: { name: string }; reason: string | null }) => [entry.tag.name, entry.reason]),
      [
        ["blocked", null],
        ["needs:clarification", "Need scope clarification."],
      ],
    );

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/tickets/${ticket.id}`,
      payload: { tagIds: [otherTag.id] },
    });
    assert.equal(patched.statusCode, 200);
    const afterReplace = await app.inject({
      method: "GET",
      url: `/api/tickets/${ticket.id}/tag-reasons`,
    });
    assert.equal(afterReplace.statusCode, 200);
    assert.deepEqual(
      afterReplace.json().tags.map((entry: { tag: { name: string }; reason: string | null }) => [entry.tag.name, entry.reason]),
      [["blocked", null]],
    );

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/tickets/${ticket.id}/tags/${otherTag.id}`,
    });
    assert.equal(deleted.statusCode, 204);
    const afterDelete = await app.inject({
      method: "GET",
      url: `/api/tickets/${ticket.id}/tag-reasons`,
    });
    assert.equal(afterDelete.statusCode, 200);
    assert.deepEqual(afterDelete.json().tags, []);
  } finally {
    await app.close();
  }
});

test("reciprocal blockers are rejected", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const createdBoardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Board" },
  });
  const board = createdBoardResponse.json();
  const todoLane = board.lanes[0];

  const first = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "One" },
  })).json();
  const second = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "Two" },
  })).json();

  const setBlocker = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${first.id}`,
    payload: { blockerIds: [second.id] },
  });
  assert.equal(setBlocker.statusCode, 200);

  const reciprocal = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${second.id}`,
    payload: { blockerIds: [first.id] },
  });
  assert.equal(reciprocal.statusCode, 400);
  assert.match(reciprocal.body, /deadlock/);

  await app.close();
});

test("lane deletion rejects non-empty lane", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const createdBoardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Board" },
  });
  const board = createdBoardResponse.json();
  const todoLane = board.lanes[0];

  await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "Task" },
  });

  const deletionResponse = await app.inject({
    method: "DELETE",
    url: `/api/lanes/${todoLane.id}`,
  });
  assert.equal(deletionResponse.statusCode, 409);

  await app.close();
});

test("tags can use no color", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const createdBoardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Board" },
  });
  const board = createdBoardResponse.json();

  const tagResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tags`,
    payload: { name: "outline", color: "" },
  });
  assert.equal(tagResponse.statusCode, 201);
  assert.equal(tagResponse.json().color, "");

  await app.close();
});
