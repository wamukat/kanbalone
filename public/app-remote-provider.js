// @ts-check

import { t, getLocale, translateError } from "./app-i18n.js";
import { icon } from "./icons.js";

/** @type {Record<string, { label: string; iconName?: string; shortLabel: string }>} */
const PROVIDER_META = {
  github: { label: "GitHub", iconName: "github", shortLabel: "GH" },
  gitlab: { label: "GitLab", iconName: "gitlab", shortLabel: "GL" },
  jira: { label: "Jira", shortLabel: "JI" },
  redmine: { label: "Redmine", iconName: "redmine", shortLabel: "RM" },
};

/**
 * @typedef {{
 *   provider: string;
 *   displayRef: string;
 *   url: string;
 *   resourceType?: string;
 *   changeRequestStatus?: {state: string | null; isDraft: boolean; fetchedAt: string | null; attemptedAt: string; error: string | null} | null;
 * }} RemoteRefLike
 */

/** @param {RemoteRefLike} reference */
export function isChangeRequest(reference) {
  return reference.provider === "github" && reference.resourceType === "pull_request"
    || reference.provider === "gitlab" && reference.resourceType === "merge_request";
}

/** @param {RemoteRefLike} reference @param {(value: unknown) => string} escapeHtml */
function renderChangeRequestStatus(reference, escapeHtml) {
  if (!isChangeRequest(reference)) return "";
  const status = reference.changeRequestStatus;
  const state = status?.state ?? "unknown";
  const draft = state === "open" && status?.isDraft;
  const label = draft ? t("Change request: Draft") : state === "merged" ? t("Change request: Merged")
    : state === "closed" ? t("Change request: Closed") : state === "open" ? t("Change request: Open") : t("Change request: Not fetched");
  const stale = status?.fetchedAt && Date.now() - Date.parse(status.fetchedAt) > 15 * 60 * 1000;
  const title = [label, status?.fetchedAt ? t("Last checked: {time}", { time: new Date(status.fetchedAt).toLocaleString(getLocale()) }) : "",
    stale ? t("Possibly stale") : "", status?.error ? t("Last attempt: {time}", { time: new Date(status.attemptedAt).toLocaleString(getLocale()) }) : "", status?.error ? translateError(status.error) : ""].filter(Boolean).join(" · ");
  const glyph = draft ? "pencil" : state === "merged" ? "git-merge" : state === "closed" ? "x" : state === "open" ? "git-pull-request" : "circle";
  return `<span class="change-request-status" data-change-request-state="${state}" role="img" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${icon(glyph)}${stale || status?.error ? icon("circle-alert") : ""}</span>`;
}

/** @param {string} provider */
export function remoteProviderLabel(provider) {
  const key = normalizeProvider(provider);
  return getProviderMeta(key)?.label ?? provider;
}

/** @param {string} provider @param {(value: unknown) => string} escapeHtml */
export function renderRemoteProviderIcon(provider, escapeHtml) {
  const key = normalizeProvider(provider);
  const meta = getProviderMeta(key) ?? {
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

/** @param {string} provider @param {(value: unknown) => string} escapeHtml */
export function renderRemoteProviderBadge(provider, escapeHtml) {
  return `
    <span class="ticket-remote-provider remote-provider-badge">
      ${renderRemoteProviderIcon(provider, escapeHtml)}
      <span>${escapeHtml(remoteProviderLabel(provider))}</span>
    </span>
  `;
}

/** @param {RemoteRefLike | null | undefined} remote @param {(value: unknown) => string} escapeHtml @param {string} [className] */
export function renderRemoteRefBadge(remote, escapeHtml, className = "ticket-remote-ref") {
  if (!remote) {
    return "";
  }
  return `
    <span class="${className} remote-ref-badge" title="${escapeHtml(remoteProviderLabel(remote.provider))}: ${escapeHtml(remote.displayRef)}">
      ${renderRemoteProviderIcon(remote.provider, escapeHtml)}
      ${renderChangeRequestStatus(remote, escapeHtml)}
      <span>${escapeHtml(remote.displayRef)}</span>
    </span>
  `;
}

/** @param {RemoteRefLike | null | undefined} remote @param {(value: unknown) => string} escapeHtml @param {string} [className] */
export function renderRemoteRefLink(remote, escapeHtml, className = "ticket-remote-ref") {
  if (!remote) {
    return "";
  }
  return `
    <a class="${className} remote-ref-badge" href="${escapeHtml(remote.url)}" target="_blank" rel="noreferrer" title="${escapeHtml(remoteProviderLabel(remote.provider))}: ${escapeHtml(remote.displayRef)}">
      ${renderRemoteProviderIcon(remote.provider, escapeHtml)}
      ${renderChangeRequestStatus(remote, escapeHtml)}
      <span>${escapeHtml(remote.displayRef)}</span>
    </a>
  `;
}

/** @param {string} provider */
function normalizeProvider(provider) {
  return String(provider || "remote").toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/** @param {string} key */
function getProviderMeta(key) {
  return Object.hasOwn(PROVIDER_META, key)
    ? PROVIDER_META[key]
    : null;
}

/** @param {string} provider */
function shortProviderLabel(provider) {
  const cleaned = String(provider || "remote").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return (cleaned || "R").slice(0, 2);
}
