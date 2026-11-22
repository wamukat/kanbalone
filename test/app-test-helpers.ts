import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { RemoteIssueAdapter, RemoteIssueSnapshot } from "../src/remote/adapters.js";

export function createDbFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kanbalone-test-")), "test.sqlite");
}

export function createMockRemoteAdapter(
  provider: string,
  options: {
  initial: RemoteIssueSnapshot;
  refreshed?: RemoteIssueSnapshot;
  postCommentResult?: { remoteCommentId: string; pushedAt: string };
  postCommentError?: Error;
  onFetch?(input: Parameters<RemoteIssueAdapter["fetchIssue"]>[0]): void;
  onRefresh?(input: Parameters<RemoteIssueAdapter["refreshIssue"]>[0]): void;
  onPostComment?(bodyMarkdown: string): void;
},
): RemoteIssueAdapter {
  return {
    provider,
    async fetchIssue(input) {
      options.onFetch?.(input);
      return options.initial;
    },
    async refreshIssue(link) {
      options.onRefresh?.(link);
      return options.refreshed ?? options.initial;
    },
    async postComment(_link, bodyMarkdown) {
      options.onPostComment?.(bodyMarkdown);
      if (options.postCommentError) {
        throw options.postCommentError;
      }
      return options.postCommentResult ?? {
        remoteCommentId: "remote-comment-1",
        pushedAt: "2026-04-23T00:00:00.000Z",
      };
    },
  };
}

export function createMockGithubAdapter(options: Parameters<typeof createMockRemoteAdapter>[1]): RemoteIssueAdapter {
  return createMockRemoteAdapter("github", options);
}

/** Strip additive pagination objects before a test reconstructs a historical schema. */
export function removePaginationSchema(sqlite: import("better-sqlite3").Database): void {
  const triggers = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'ticket_list_%'").all() as { name: string }[];
  for (const { name } of triggers) sqlite.exec(`DROP TRIGGER ${name}`);
  sqlite.exec(`DROP INDEX IF EXISTS tickets_paging_id_idx;
    DROP INDEX IF EXISTS tickets_paging_completed_idx;
    DROP TABLE IF EXISTS ticket_list_revisions;
    DROP TABLE IF EXISTS ticket_cursor_secret;`);
}
