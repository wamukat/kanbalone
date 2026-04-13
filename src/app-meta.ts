import fs from "node:fs";
import path from "node:path";

export type AppMeta = {
  name: string;
  version: string;
};

export function readPackageMeta(): AppMeta {
  const fallback = { name: "SoloBoard", version: "0.0.0" };
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { name?: string; version?: string };
    return {
      name: "SoloBoard",
      version: typeof parsed.version === "string" ? parsed.version : fallback.version,
    };
  } catch {
    return fallback;
  }
}
