import { test, expect } from "@playwright/test";
import { startTestApp, createBoard } from "./helpers.js";

test("test server teardown closes an open event stream", async ({ request }) => {
  test.setTimeout(10_000);
  const { baseUrl, close } = await startTestApp();
  const controller = new AbortController();
  try {
    const { board } = await createBoard(request, baseUrl, { name: "Teardown", laneNames: ["todo"] });
    const response = await fetch(`${baseUrl}/api/boards/${board.id}/events`, { signal: controller.signal });
    expect(response.status).toBe(200);
    await close();
  } finally {
    controller.abort();
    await close();
  }
});
