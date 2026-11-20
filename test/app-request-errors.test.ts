import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";

test("bodyless JSON GET and DELETE work while invalid mutations remain client errors", async () => {
  const app = buildApp({ dbFile: ":memory:" });
  try {
    for (const headers of [{}, { "content-type": "application/json" }, { "content-type": "application/json", "content-length": "0" }]) {
      const health = await app.inject({ method: "GET", url: "/api/health", headers });
      assert.equal(health.statusCode, 200);
      const created = await app.inject({ method: "POST", url: "/api/boards", payload: { name: "Disposable", laneNames: ["todo"] } });
      assert.equal(created.statusCode, 201);
      const id = created.json().board.id;
      const removed = await app.inject({ method: "DELETE", url: `/api/boards/${id}`, headers });
      assert.equal(removed.statusCode, 204);
      assert.equal((await app.inject({ method: "GET", url: `/api/boards/${id}` })).statusCode, 404);
    }
    for (const payload of [undefined, "", "{", " "]) {
      const response = await app.inject({ method: "POST", url: "/api/boards", headers: { "content-type": "application/json" }, payload });
      assert.equal(response.statusCode, 400);
    }
    const invalidDelete = await app.inject({ method: "DELETE", url: "/api/boards/999", headers: { "content-type": "application/json" }, payload: "{" });
    assert.equal(invalidDelete.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("error handler preserves HTTP errors and reports unexpected failures as 500", async () => {
  const app = buildApp({ dbFile: ":memory:" });
  app.get("/test-error", async () => { throw new Error("unexpected failure"); });
  app.post("/test-small-body", { bodyLimit: 8 }, async () => ({ ok: true }));
  app.delete("/test-required-body", { schema: { body: { type: "object", required: ["name"], properties: { name: { type: "string" } } } } }, async () => ({ ok: true }));
  try {
    assert.equal((await app.inject({ method: "GET", url: "/test-error" })).statusCode, 500);
    assert.equal((await app.inject({ method: "POST", url: "/test-small-body", payload: { name: "too long" } })).statusCode, 413);
    assert.equal((await app.inject({ method: "POST", url: "/api/boards", headers: { "content-type": "application/unknown" }, payload: "data" })).statusCode, 415);
    assert.equal((await app.inject({ method: "DELETE", url: "/test-required-body", headers: { "content-type": "application/json" } })).statusCode, 400);
  } finally {
    await app.close();
  }
});
