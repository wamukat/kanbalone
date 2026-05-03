import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import type { RemoteIssueSnapshot } from "../src/remote/adapters.js";
import packageJson from "../package.json" with { type: "json" };
import { createDbFile, createMockGithubAdapter, createMockRemoteAdapter } from "./app-test-helpers.js";

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
