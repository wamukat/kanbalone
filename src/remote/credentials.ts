export type RemoteCredential = {
  type: "token";
  token: string;
};

export type RemoteCredentialScope = {
  provider: string;
  instanceUrl: string;
};

export interface RemoteCredentialResolver {
  getCredential(scope: RemoteCredentialScope): RemoteCredential | null | Promise<RemoteCredential | null>;
}

type CredentialEnvironment = Partial<Record<"GITHUB_TOKEN" | "KANBALONE_REMOTE_CREDENTIALS", string>>;

export class EnvRemoteCredentialResolver implements RemoteCredentialResolver {
  constructor(private readonly env: CredentialEnvironment = process.env) {}

  getCredential(scope: RemoteCredentialScope): RemoteCredential | null {
    const configured = this.getConfiguredCredential(scope);
    if (configured) {
      return configured;
    }
    if (
      normalizeProvider(scope.provider) === "github" &&
      normalizeInstanceUrl(scope.instanceUrl) === "https://github.com" &&
      this.env.GITHUB_TOKEN
    ) {
      return { type: "token", token: this.env.GITHUB_TOKEN };
    }
    return null;
  }

  private getConfiguredCredential(scope: RemoteCredentialScope): RemoteCredential | null {
    if (!this.env.KANBALONE_REMOTE_CREDENTIALS) {
      return null;
    }
    const parsed = parseCredentialMap(this.env.KANBALONE_REMOTE_CREDENTIALS);
    const provider = normalizeProvider(scope.provider);
    const instanceUrl = normalizeInstanceUrl(scope.instanceUrl);
    return parsed.get(`${provider}:${instanceUrl}`) ?? parsed.get(`${provider}:*`) ?? null;
  }
}

export function parseCredentialMap(raw: string): Map<string, RemoteCredential> {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("KANBALONE_REMOTE_CREDENTIALS must be a JSON object");
  }
  const credentials = new Map<string, RemoteCredential>();
  for (const [rawKey, rawValue] of Object.entries(parsed)) {
    const credential = parseCredentialValue(rawValue);
    if (!credential) {
      continue;
    }
    credentials.set(normalizeCredentialKey(rawKey), credential);
  }
  return credentials;
}

export function getConfiguredCredentialProviders(env: CredentialEnvironment = process.env): string[] {
  const providers = new Set<string>();
  if (env.KANBALONE_REMOTE_CREDENTIALS) {
    const parsed = parseCredentialMap(env.KANBALONE_REMOTE_CREDENTIALS);
    for (const key of parsed.keys()) {
      const separatorIndex = key.indexOf(":");
      if (separatorIndex > 0) {
        providers.add(key.slice(0, separatorIndex));
      }
    }
  }
  if (env.GITHUB_TOKEN) {
    providers.add("github");
  }
  return [...providers].sort();
}

function parseCredentialValue(value: unknown): RemoteCredential | null {
  if (typeof value === "string") {
    return value ? { type: "token", token: value } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Remote credential values must be token strings or credential objects");
  }
  const credential = value as { type?: unknown; token?: unknown };
  if (credential.type !== "token" || typeof credential.token !== "string" || !credential.token) {
    throw new Error('Remote credential objects must use type "token" and a non-empty token');
  }
  return { type: "token", token: credential.token };
}

function normalizeCredentialKey(key: string): string {
  const [provider, ...instanceParts] = key.split(":");
  const instance = instanceParts.join(":");
  if (!provider || !instance) {
    throw new Error("Remote credential keys must use provider:instanceUrl");
  }
  return `${normalizeProvider(provider)}:${instance === "*" ? "*" : normalizeInstanceUrl(instance)}`;
}

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase();
}

function normalizeInstanceUrl(instanceUrl: string): string {
  const url = new URL(instanceUrl);
  return url.origin;
}
