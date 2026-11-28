import type { ChangeRequestSnapshot, RemoteCommentPushResult, RemoteIssueAdapter, RemoteIssueLookup, RemoteIssueSnapshot } from "./adapters.js";
import { EnvRemoteCredentialResolver, type RemoteCredentialResolver } from "./credentials.js";
import { fetchRemoteJson } from "./http.js";
import type { TicketRemoteLinkView, TicketExternalReferenceView } from "../types.js";

type GithubIssueResponse = {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  state: string;
  updated_at: string;
};

type GithubCommentResponse = {
  id: number;
  created_at: string;
};

export class GithubIssueAdapter implements RemoteIssueAdapter {
  readonly provider = "github";

  constructor(private readonly credentialResolver: RemoteCredentialResolver = new EnvRemoteCredentialResolver()) {}

  async fetchIssue(input: RemoteIssueLookup): Promise<RemoteIssueSnapshot> {
    const parsed = parseGithubLookup(input);
    const issue = await this.fetchJson<GithubIssueResponse>(
      `${parsed.apiBase}/repos/${parsed.projectKey}/issues/${parsed.issueKey}`,
      parsed.instanceUrl,
    );
    return {
      provider: this.provider,
      instanceUrl: parsed.instanceUrl,
      resourceType: "issue",
      projectKey: parsed.projectKey,
      issueKey: parsed.issueKey,
      displayRef: `${parsed.projectKey}#${parsed.issueKey}`,
      url: issue.html_url,
      title: issue.title,
      bodyMarkdown: issue.body ?? "",
      state: issue.state,
      updatedAt: issue.updated_at,
    };
  }

  async fetchChangeRequest(reference: TicketExternalReferenceView): Promise<ChangeRequestSnapshot> {
    if (!/^[^/]+\/[^/]+$/.test(reference.projectKey) || !/^[1-9]\d*$/.test(reference.issueKey)) throw new Error("Invalid pull request reference");
    const project = reference.projectKey.split("/").map(encodeURIComponent).join("/");
    const result = await this.fetchJson<{ state: string; merged: boolean; draft?: boolean }>(
      `${normalizeGithubApiBase(reference.instanceUrl)}/repos/${project}/pulls/${reference.issueKey}`,
      reference.instanceUrl, { redirect: "error" }, { maxRetries: 0 });
    if (!["open", "closed"].includes(result.state) || typeof result.merged !== "boolean") throw new Error("Invalid pull request response");
    return { state: result.merged ? "merged" : result.state as "open" | "closed", isDraft: result.draft === true };
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
    const apiBase = normalizeGithubApiBase(link.instanceUrl);
    const response = await this.fetchJson<GithubCommentResponse>(
      `${apiBase}/repos/${link.projectKey}/issues/${link.issueKey}/comments`,
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
    headers.set("accept", "application/vnd.github+json");
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const credential = await this.credentialResolver.getCredential({ provider: this.provider, instanceUrl });
    if (credential?.type === "token") {
      headers.set("authorization", `Bearer ${credential.token}`);
    }
    return fetchRemoteJson<T>(url, { ...init, headers }, { providerLabel: "GitHub", maxRetries: options.maxRetries });
  }
}

function parseGithubLookup(input: RemoteIssueLookup): { instanceUrl: string; apiBase: string; projectKey: string; issueKey: string } {
  if (input.url) {
    const url = new URL(input.url);
    const parts = url.pathname.replace(/^\/+/, "").split("/");
    if (parts.length < 4 || parts[2] !== "issues") {
      throw new Error("Invalid GitHub issue URL");
    }
    return {
      instanceUrl: `${url.protocol}//${url.host}`,
      apiBase: normalizeGithubApiBase(`${url.protocol}//${url.host}`),
      projectKey: `${parts[0]}/${parts[1]}`,
      issueKey: parts[3],
    };
  }
  if (!input.projectKey || !input.issueKey) {
    throw new Error("GitHub issue lookup requires projectKey and issueKey");
  }
  const instanceUrl = input.instanceUrl ?? "https://github.com";
  return {
    instanceUrl,
    apiBase: normalizeGithubApiBase(instanceUrl),
    projectKey: input.projectKey,
    issueKey: input.issueKey,
  };
}

function normalizeGithubApiBase(instanceUrl: string): string {
  const url = new URL(instanceUrl);
  if (url.host === "github.com") {
    return "https://api.github.com";
  }
  return `${url.origin}/api/v3`;
}
