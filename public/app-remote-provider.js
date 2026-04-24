import { icon } from "./icons.js";

const PROVIDER_META = {
  github: { label: "GitHub", iconName: "github", shortLabel: "GH" },
  gitlab: { label: "GitLab", iconName: "gitlab", shortLabel: "GL" },
  jira: { label: "Jira", shortLabel: "JI" },
  redmine: { label: "Redmine", iconName: "redmine", shortLabel: "RM" },
};

export function remoteProviderLabel(provider) {
  const key = normalizeProvider(provider);
  return PROVIDER_META[key]?.label ?? provider;
}

export function renderRemoteProviderIcon(provider, escapeHtml) {
  const key = normalizeProvider(provider);
  const meta = PROVIDER_META[key] ?? {
    label: provider,
    shortLabel: shortProviderLabel(provider),
  };
  const title = escapeHtml(meta.label);
  const providerClass = escapeHtml(key);
  if (meta.iconName) {
    return `<span class="remote-provider-icon remote-provider-icon-${providerClass}" title="${title}" aria-label="${title}">${icon(meta.iconName)}</span>`;
  }
  return `<span class="remote-provider-icon remote-provider-icon-${providerClass} remote-provider-initials" title="${title}" aria-label="${title}">${escapeHtml(meta.shortLabel)}</span>`;
}

export function renderRemoteProviderBadge(provider, escapeHtml) {
  return `
    <span class="ticket-remote-provider remote-provider-badge">
      ${renderRemoteProviderIcon(provider, escapeHtml)}
      <span>${escapeHtml(remoteProviderLabel(provider))}</span>
    </span>
  `;
}

export function renderRemoteRefBadge(remote, escapeHtml, className = "ticket-remote-ref") {
  if (!remote) {
    return "";
  }
  return `
    <span class="${className} remote-ref-badge" title="${escapeHtml(remoteProviderLabel(remote.provider))}: ${escapeHtml(remote.displayRef)}">
      ${renderRemoteProviderIcon(remote.provider, escapeHtml)}
      <span>${escapeHtml(remote.displayRef)}</span>
    </span>
  `;
}

export function renderRemoteRefLink(remote, escapeHtml, className = "ticket-remote-ref") {
  if (!remote) {
    return "";
  }
  return `
    <a class="${className} remote-ref-badge" href="${escapeHtml(remote.url)}" target="_blank" rel="noreferrer" title="${escapeHtml(remoteProviderLabel(remote.provider))}: ${escapeHtml(remote.displayRef)}">
      ${renderRemoteProviderIcon(remote.provider, escapeHtml)}
      <span>${escapeHtml(remote.displayRef)}</span>
    </a>
  `;
}

function normalizeProvider(provider) {
  return String(provider || "remote").toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function shortProviderLabel(provider) {
  const cleaned = String(provider || "remote").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return (cleaned || "R").slice(0, 2);
}
