import type { ServerResponse } from "node:http";

import type { Id } from "./types.js";

export class BoardEventHub {
  readonly #clients = new Map<Id, Set<ServerResponse>>();

  addClient = (boardId: Id, response: ServerResponse): void => {
    const clients = this.#clients.get(boardId) ?? new Set<ServerResponse>();
    clients.add(response);
    this.#clients.set(boardId, clients);
  };

  removeClient = (boardId: Id, response: ServerResponse): void => {
    const clients = this.#clients.get(boardId);
    if (!clients) {
      return;
    }
    clients.delete(response);
    if (clients.size === 0) {
      this.#clients.delete(boardId);
    }
  };

  publish = (boardId: Id, event = "board_updated"): void => {
    const clients = this.#clients.get(boardId);
    if (!clients || clients.size === 0) {
      return;
    }
    const payload = `data: ${JSON.stringify({ boardId, event, sentAt: new Date().toISOString() })}\n\n`;
    for (const client of [...clients]) {
      if (client.destroyed || client.writableEnded) {
        this.removeClient(boardId, client);
        continue;
      }
      client.write(payload);
    }
  };

  close(): void {
    for (const clients of this.#clients.values()) {
      for (const client of clients) {
        if (!client.destroyed && !client.writableEnded) {
          client.end();
        }
      }
    }
    this.#clients.clear();
  }
}
