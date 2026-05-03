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
