import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import type { RemoteIssueSnapshot } from "../src/remote/adapters.js";
import packageJson from "../package.json" with { type: "json" };
import { createDbFile, createMockGithubAdapter, createMockRemoteAdapter } from "./app-test-helpers.js";

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

