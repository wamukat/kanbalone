import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import type { RemoteIssueSnapshot } from "../src/remote/adapters.js";
import packageJson from "../package.json" with { type: "json" };
import { createDbFile, createMockGithubAdapter, createMockRemoteAdapter } from "./app-test-helpers.js";

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

test("external references are set independently from tracked remote links and are searchable", async () => {
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
          title: "Imported requirement",
          bodyMarkdown: "Remote requirement body",
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
      payload: { name: "External References", laneNames: ["todo"] },
    })).json();

    const imported = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        projectKey: "acme/kanbalone",
        issueKey: "202",
      },
    });
    assert.equal(imported.statusCode, 201);

    const generated = (await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/tickets`,
      payload: {
        laneId: board.lanes[0].id,
        title: "Generated implementation ticket",
      },
    })).json();

    const setReference = await app.inject({
      method: "PUT",
      url: `/api/tickets/${generated.id}/external-references/source`,
      payload: {
        provider: "github",
        instanceUrl: "https://github.com",
        resourceType: "issue",
        projectKey: "acme/kanbalone",
        issueKey: "202",
        displayRef: "acme/kanbalone#202",
        url: "https://github.com/acme/kanbalone/issues/202",
        title: "Imported requirement",
      },
    });
    assert.equal(setReference.statusCode, 200);
    assert.equal(setReference.json().remote, null);
    assert.equal(setReference.json().externalReferences.length, 1);
    assert.equal(setReference.json().externalReferences[0].kind, "source");
    assert.equal(setReference.json().externalReferences[0].displayRef, "acme/kanbalone#202");

    const duplicateImport = await app.inject({
      method: "POST",
      url: `/api/boards/${board.board.id}/remote-import`,
      payload: {
        provider: "github",
        laneId: board.lanes[0].id,
        projectKey: "acme/kanbalone",
        issueKey: "202",
      },
    });
    assert.equal(duplicateImport.statusCode, 409);

    const searchByDisplayRef = (await app.inject({
      method: "GET",
      url: `/api/boards/${board.board.id}/tickets?q=acme%2Fkanbalone%23202&resolved=false`,
    })).json();
    assert.deepEqual(
      searchByDisplayRef.tickets.map((ticket: { id: number }) => ticket.id).sort((a: number, b: number) => a - b),
      [imported.json().id, generated.id].sort((a: number, b: number) => a - b),
    );

    const searchByShortRef = (await app.inject({
      method: "GET",
      url: `/api/boards/${board.board.id}/tickets?q=gh%23202&resolved=false`,
    })).json();
    assert.deepEqual(
      searchByShortRef.tickets.map((ticket: { id: number }) => ticket.id).sort((a: number, b: number) => a - b),
      [imported.json().id, generated.id].sort((a: number, b: number) => a - b),
    );

    const searchByExternalRef = (await app.inject({
      method: "GET",
      url: `/api/boards/${board.board.id}/tickets?q=ext%23202&resolved=false`,
    })).json();
    assert.deepEqual(
      searchByExternalRef.tickets.map((ticket: { id: number }) => ticket.id),
      [generated.id],
    );

    const searchByRemoteRef = (await app.inject({
      method: "GET",
      url: `/api/boards/${board.board.id}/tickets?q=remote%23202&resolved=false`,
    })).json();
    assert.deepEqual(
      searchByRemoteRef.tickets.map((ticket: { id: number }) => ticket.id),
      [imported.json().id],
    );

    const searchByLocalRef = (await app.inject({
      method: "GET",
      url: `/api/boards/${board.board.id}/tickets?q=%23202&resolved=false`,
    })).json();
    assert.deepEqual(searchByLocalRef.tickets, []);

    for (let index = 0; index < 20; index += 1) {
      await app.inject({
        method: "POST",
        url: `/api/boards/${board.board.id}/tickets`,
        payload: {
          laneId: board.lanes[0].id,
          title: `Neutral generated task ${index}`,
        },
      });
    }
    const exactLocalRef = (await app.inject({
      method: "GET",
      url: `/api/boards/${board.board.id}/tickets?q=%23${imported.json().id}&resolved=false`,
    })).json();
    assert.deepEqual(
      exactLocalRef.tickets.map((ticket: { id: number }) => ticket.id),
      [imported.json().id],
    );
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
