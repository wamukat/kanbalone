import fs from "node:fs";
import path from "node:path";

import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const dataDir = path.join(process.cwd(), "data");
const dbFile = process.env.SOLOBOARD_DB_FILE ?? path.join(dataDir, "soloboard.sqlite");

fs.mkdirSync(dataDir, { recursive: true });

const app = buildApp({
  dbFile,
  staticDir: path.join(process.cwd(), "public"),
});

app.listen({ host, port }).then(() => {
  console.log(`Kanbalone listening on http://${host}:${port}`);
});
