import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import type { APIRequestContext, Page } from "@playwright/test";

import { buildApp } from "../../src/app.js";

export { buildApp, path };

export function createDbFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kanbalone-ui-test-")), "test.sqlite");
}

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

export async function startTestApp(page?: Page) {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    app,
    baseUrl,
    close: async () => {
      await page?.close();
      await app.close();
    },
  };
}

export async function createBoard(request: APIRequestContext, baseUrl: string, data: { name: string; laneNames: string[] }) {
  const response = await request.post(`${baseUrl}/api/boards`, { data });
  if (response.status() !== 201) {
    throw new Error(`Failed to create board: ${response.status()}`);
  }
  return response.json();
}

export async function createTicket(request: APIRequestContext, baseUrl: string, boardId: number, data: Record<string, unknown>) {
  const response = await request.post(`${baseUrl}/api/boards/${boardId}/tickets`, { data });
  if (response.status() !== 201) {
    throw new Error(`Failed to create ticket: ${response.status()}`);
  }
  return response.json();
}

export async function createTag(request: APIRequestContext, baseUrl: string, boardId: number, data: { name: string; color?: string | null }) {
  const response = await request.post(`${baseUrl}/api/boards/${boardId}/tags`, { data });
  if (response.status() !== 201) {
    throw new Error(`Failed to create tag: ${response.status()}`);
  }
  return response.json();
}

export async function updateTicket(request: APIRequestContext, baseUrl: string, ticketId: number, data: Record<string, unknown>) {
  const response = await request.patch(`${baseUrl}/api/tickets/${ticketId}`, { data });
  if (response.status() !== 200) {
    throw new Error(`Failed to update ticket: ${response.status()}`);
  }
  return response.json();
}
