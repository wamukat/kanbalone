import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { buildApp } from "../../src/app.js";

export { buildApp, path };

export function createDbFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "soloboard-ui-test-")), "test.sqlite");
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
