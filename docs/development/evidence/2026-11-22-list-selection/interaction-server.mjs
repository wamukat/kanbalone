import path from "node:path";
import { buildApp } from "../../../../src/app.ts";
const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw new Error("Pass before or after");
const app = buildApp({
  dbFile: path.resolve(`coverage/list-selection/${phase}.sqlite`),
  staticDir: path.resolve(phase === "before" ? "coverage/list-selection/before/public" : "public"),
});
await app.listen({ host: "127.0.0.1", port: phase === "before" ? 3630 : 3631 });
