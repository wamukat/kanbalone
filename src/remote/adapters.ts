import type { TicketRemoteLinkView } from "../types.js";

export type RemoteIssueSnapshot = {
  provider: string;
  instanceUrl: string;
  resourceType: string;
  projectKey: string;
  issueKey: string;
  displayRef: string;
  url: string;
  title: string;
  bodyMarkdown: string;
  state: string | null;
  updatedAt: string | null;
};

export type RemoteIssueLookup = {
  provider: string;
  instanceUrl?: string;
  projectKey?: string;
  issueKey?: string;
  url?: string;
};

export type RemoteCommentPushResult = {
  remoteCommentId: string;
  pushedAt: string;
};

export interface RemoteIssueAdapter {
  readonly provider: string;
  fetchIssue(input: RemoteIssueLookup): Promise<RemoteIssueSnapshot>;
  refreshIssue(link: TicketRemoteLinkView): Promise<RemoteIssueSnapshot>;
  postComment(link: TicketRemoteLinkView, bodyMarkdown: string): Promise<RemoteCommentPushResult>;
}

export type RemoteAdapterRegistry = Record<string, RemoteIssueAdapter>;
