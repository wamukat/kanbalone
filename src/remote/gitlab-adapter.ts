import type { TicketRemoteLinkView, TicketExternalReferenceView } from "../types.js";
import type { ChangeRequestSnapshot, RemoteCommentPushResult, RemoteIssueAdapter, RemoteIssueLookup, RemoteIssueSnapshot } from "./adapters.js";
import { EnvRemoteCredentialResolver, type RemoteCredentialResolver } from "./credentials.js";
import { fetchRemoteJson } from "./http.js";

type GitlabIssueResponse = {
  iid: number;
  web_url: string;
  title: string;
  description: string | null;
  state: string;
  updated_at: string;
  references?: {
    full?: string;
  };
};

type GitlabCommentResponse = {
  id: number;
  created_at: string;
};

export class GitlabIssueAdapter implements RemoteIssueAdapter {
  readonly provider = "gitlab";

  constructor(private readonly credentialResolver: RemoteCredentialResolver = new EnvRemoteCredentialResolver()) {}

  async fetchIssue(input: RemoteIssueLookup): Promise<RemoteIssueSnapshot> {
    const parsed = parseGitlabLookup(input);
    const issue = await this.fetchJson<GitlabIssueResponse>(
      `${parsed.apiBase}/projects/${encodeURIComponent(parsed.projectKey)}/issues/${encodeURIComponent(parsed.issueKey)}`,
      parsed.instanceUrl,
    );
    const issueKey = String(issue.iid ?? parsed.issueKey);
    return {
      provider: this.provider,
      instanceUrl: parsed.instanceUrl,
      resourceType: "issue",
      projectKey: parsed.projectKey,
      issueKey,
      displayRef: issue.references?.full ?? `${parsed.projectKey}#${issueKey}`,
      url: issue.web_url,
      title: issue.title,
      bodyMarkdown: issue.description ?? "",
      state: issue.state,
      updatedAt: issue.updated_at,
    };
  }

  async fetchChangeRequest(reference: TicketExternalReferenceView): Promise<ChangeRequestSnapshot> {
    if (!reference.projectKey || !/^[1-9]\d*$/.test(reference.issueKey)) throw new Error("Invalid merge request reference");
    const result = await this.fetchJson<{ state: string; draft?: boolean; work_in_progress?: boolean }>(
      `${normalizeGitlabApiBase(reference.instanceUrl)}/projects/${encodeURIComponent(reference.projectKey)}/merge_requests/${reference.issueKey}`,
      reference.instanceUrl, { redirect: "error" }, { maxRetries: 0 });
    if (!["opened", "closed", "merged", "locked"].includes(result.state)) throw new Error("Invalid merge request response");
    return { state: result.state === "opened" || result.state === "locked" ? "open" : result.state as "closed" | "merged",
      isDraft: result.draft === true || result.work_in_progress === true };
  }

  refreshIssue(link: TicketRemoteLinkView): Promise<RemoteIssueSnapshot> {
    return this.fetchIssue({
      provider: this.provider,
      instanceUrl: link.instanceUrl,
      projectKey: link.projectKey,
      issueKey: link.issueKey,
    });
  }

  async postComment(link: TicketRemoteLinkView, bodyMarkdown: string): Promise<RemoteCommentPushResult> {
    const apiBase = normalizeGitlabApiBase(link.instanceUrl);
    const response = await this.fetchJson<GitlabCommentResponse>(
      `${apiBase}/projects/${encodeURIComponent(link.projectKey)}/issues/${encodeURIComponent(link.issueKey)}/notes`,
      link.instanceUrl,
      {
        method: "POST",
        body: JSON.stringify({ body: bodyMarkdown }),
      },
      { maxRetries: 0 },
    );
    return {
      remoteCommentId: String(response.id),
      pushedAt: response.created_at,
    };
  }

  private async fetchJson<T>(url: string, instanceUrl: string, init: RequestInit = {}, options: { maxRetries?: number } = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const credential = await this.credentialResolver.getCredential({ provider: this.provider, instanceUrl });
    if (credential?.type === "token") {
      headers.set("private-token", credential.token);
    }
    return fetchRemoteJson<T>(url, { ...init, headers }, { providerLabel: "GitLab", maxRetries: options.maxRetries });
  }
}

function parseGitlabLookup(input: RemoteIssueLookup): { instanceUrl: string; apiBase: string; projectKey: string; issueKey: string } {
  if (input.url) {
    const url = new URL(input.url);
    const trimmedPath = url.pathname.replace(/\/+$/, "").replace(/^\/+/, "");
    const match = trimmedPath.match(/^(?<projectPath>.+?)(?:\/-)?\/(?<resource>issues|work_items)\/(?<issueKey>[^/]+)$/);
    const projectPath = match?.groups?.projectPath;
    const issueKey = match?.groups?.issueKey;
    if (!projectPath || !issueKey) {
      throw new Error("Invalid GitLab issue URL");
    }
    const instanceUrl = `${url.protocol}//${url.host}`;
    return {
      instanceUrl,
      apiBase: normalizeGitlabApiBase(instanceUrl),
      projectKey: projectPath,
      issueKey,
    };
  }
  if (!input.projectKey || !input.issueKey) {
    throw new Error("GitLab issue lookup requires projectKey and issueKey");
  }
  const instanceUrl = input.instanceUrl ?? "https://gitlab.com";
  return {
    instanceUrl,
    apiBase: normalizeGitlabApiBase(instanceUrl),
    projectKey: input.projectKey,
    issueKey: input.issueKey,
  };
}

function normalizeGitlabApiBase(instanceUrl: string): string {
  return `${new URL(instanceUrl).origin}/api/v4`;
}
