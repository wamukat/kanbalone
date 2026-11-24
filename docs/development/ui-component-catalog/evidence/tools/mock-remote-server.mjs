import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildApp } from "../../../../../dist/src/app.js";

const dbFile = process.env.KANBALONE_DB_FILE;
if (!dbFile) throw new Error("Set KANBALONE_DB_FILE to a separate copy of the synthetic fixture");
const port = Number(process.env.PORT ?? 3676);
const stamp = "2026-01-15T12:00:00.000Z";
const specimen = await readFile(new URL("../markdown-specimen.md", import.meta.url), "utf8");
const markdown = specimen.split("````markdown\n")[1].split("````")[0];

function adapter(provider) {
  function snapshot(key) {
    return {
      provider,
      instanceUrl: "https://github.com",
      resourceType: "issue",
      projectKey: "example/catalog-sample",
      issueKey: key,
      displayRef: `example/catalog-sample#${key}`,
      url: `https://github.com/example/catalog-sample/issues/${key}`,
      title: key === "77" ? "Remote Markdown surfaces" : "Prepare the release notes",
      bodyMarkdown: key === "77" ? markdown : "Remote snapshot.\n\n- Review the calendar.\n- Confirm the publishing checklist.",
      state: "open",
      updatedAt: stamp,
    };
  }
  return {
    provider,
    async fetchIssue(input) {
      const key = new URL(input.url).pathname.split("/").at(-1);
      if (key === "10") throw new Error("Synthetic remote preview failure");
      return snapshot(key);
    },
    async refreshIssue(link) {
      return snapshot(link.issueKey);
    },
    async postComment(_link, bodyMarkdown) {
      if (bodyMarkdown.includes("failed")) throw new Error("Synthetic provider unavailable");
      return { remoteCommentId: "synthetic-accepted", pushedAt: stamp };
    },
  };
}

const providers = ["github", "gitlab", "redmine"];
const app = buildApp({
  dbFile,
  staticDir: fileURLToPath(new URL("../../../../../dist/public/", import.meta.url)),
  remoteCredentialProviders: providers,
  remoteCredentialScopes: [],
  remoteAdapters: Object.fromEntries(providers.map(provider => [provider, adapter(provider)])),
});
await app.listen({ host: "127.0.0.1", port });
