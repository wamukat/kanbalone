import type { ServerResponse } from "node:http";

import type { Id } from "./types.js";

export class BoardEventHub {
  readonly #clients = new Map<Id, Set<ServerResponse>>();
  readonly #customViewClients = new Set<ServerResponse>();

  addCustomViewClient = (response: ServerResponse): void => {
    this.#customViewClients.add(response);
    response.once("close", () => this.#customViewClients.delete(response));
  };

  publishCustomViews = (): void => {
    this.#broadcast(this.#customViewClients, { event: "views_updated" });
  };

  publishGlobalBoardUpdate = (boardId?: Id): void => {
    this.#broadcast(this.#customViewClients, { event: "board_updated", boardId });
  };

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
    this.publishGlobalBoardUpdate(boardId);
    const clients = this.#clients.get(boardId);
    if (!clients) return;
    this.#broadcast(clients, { boardId, event, sentAt: new Date().toISOString() });
    if (clients.size === 0) this.#clients.delete(boardId);
  };

  #broadcast(clients: Set<ServerResponse>, data: { event: string; boardId?: Id; sentAt?: string }): void {
    if (!clients.size) return;
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      if (client.destroyed || client.writableEnded) {
        clients.delete(client);
        continue;
      }
      client.write(payload);
    }
  }

  close(): void {
    for (const clients of [...this.#clients.values(), this.#customViewClients]) {
      for (const client of clients) {
        if (!client.destroyed && !client.writableEnded) {
          client.end();
        }
      }
    }
    this.#clients.clear();
    this.#customViewClients.clear();
  }
}
