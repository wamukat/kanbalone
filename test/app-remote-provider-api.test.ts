import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import type { RemoteIssueSnapshot } from "../src/remote/adapters.js";
import packageJson from "../package.json" with { type: "json" };
import { createDbFile, createMockGithubAdapter, createMockRemoteAdapter } from "./app-test-helpers.js";

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
