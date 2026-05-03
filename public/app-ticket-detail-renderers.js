import { icon } from "./icons.js";
import { renderPriorityBadge } from "./app-priority.js";
import { renderRemoteProviderBadge, renderRemoteRefLink } from "./app-remote-provider.js";
import { renderTag } from "./app-tags.js";

const REMOTE_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_DIFF_CELLS = 40000;

export function createTicketDetailRenderers(ctx) {
  function renderTicketMeta(ticket) {
    if (!ticket) {
      return "";
    }
    const tags = ticket.tags
      .map((tag) => renderTag(tag, ctx.escapeHtml))
      .join("");
    return `
      <div class="ticket-meta-row">${tags}</div>
    `;
  }

  function renderRemoteSummary(ticket) {
    const externalReferences = ticket?.externalReferences ?? [];
    if (!ticket?.remote && externalReferences.length === 0) {
      return {
        html: "",
        hidden: true,
        hasOnlyExternalReferences: false,
      };
    }
    const freshness = ticket.remote ? getRemoteSnapshotFreshness(ticket.remote) : null;
    return {
      hidden: false,
      hasOnlyExternalReferences: !ticket.remote,
      html: `
        ${ticket.remote ? `
          <div class="ticket-remote-summary-head">
            <div class="ticket-remote-summary-title">
              ${renderRemoteProviderBadge(ticket.remote.provider, ctx.escapeHtml)}
              ${renderRemoteRefLink(ticket.remote, ctx.escapeHtml)}
              <span class="ticket-remote-state muted">${ctx.escapeHtml(ticket.remote.state ?? "state unknown")}</span>
              ${freshness?.isStale ? `<span class="ticket-remote-stale-pill">${icon("circle-alert")}<span>Possibly stale</span></span>` : ""}
            </div>
            <div class="ticket-remote-summary-actions">
              <button type="button" class="ghost action-with-icon" data-refresh-remote-ticket>
                ${icon("rotate-ccw")}<span>Refresh</span>
              </button>
            </div>
          </div>
          <div class="ticket-remote-summary-meta muted">
            <span>Imported snapshot</span>
            <span>Last sync ${ctx.escapeHtml(formatDateTime(ticket.remote.lastSyncedAt))}</span>
            <span>Remote updated ${ctx.escapeHtml(formatDateTime(ticket.remote.remoteUpdatedAt))}</span>
            ${freshness?.isStale ? `<span>${ctx.escapeHtml(freshness.message)}</span>` : ""}
          </div>
        ` : ""}
        ${externalReferences.length ? renderExternalReferences(externalReferences) : ""}
      `,
    };
  }

  function renderExternalReferences(references) {
    return `
      <div class="ticket-external-references">
        ${references.map((reference) => `
          <div class="ticket-external-reference-row">
            <span class="ticket-external-reference-kind">${ctx.escapeHtml(formatExternalReferenceKind(reference.kind))}</span>
            ${renderRemoteRefLink(reference, ctx.escapeHtml, "ticket-external-reference-ref")}
            ${reference.title ? `<span class="ticket-external-reference-title muted">${ctx.escapeHtml(reference.title)}</span>` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderTicketRelations(ticket) {
    if (!ticket) {
      return "";
    }
    const parts = [];
    const blocking = ctx.getBlockingTickets(ticket.id);
    if (ticket.parent) {
      parts.push(renderRelationRow("Parent", "folder-up", renderRelationChip(ticket.parent, "parent")));
    }
    if (ticket.children.length) {
      parts.push(renderRelationRow("Children", "folder-tree", ticket.children.map((child) => renderRelationChip(child, "child")).join("")));
    }
    if (ticket.blockers.length) {
      parts.push(renderRelationRow("Blocked By", "octagon-alert", ticket.blockers.map((blocker) => renderRelationChip(blocker, "blocked-by")).join("")));
    }
    if (blocking.length) {
      parts.push(renderRelationRow("Blocks", "octagon-alert", blocking.map((blocked) => renderRelationChip(blocked, "blocks")).join("")));
    }
    if (ticket.related.length) {
      parts.push(renderRelationRow("Related", "link-plus", ticket.related.map((related) => renderRelationChip(related, "related")).join("")));
    }
    return parts.join("");
  }

  function renderRelationRow(label, iconName, chips) {
    return `
      <div class="ticket-relation-row">
        <span class="ticket-relation-label muted">${icon(iconName)}<span>${ctx.escapeHtml(label)}</span></span>
        <span class="ticket-relation-chips">${chips}</span>
      </div>
    `;
  }

  function renderRelationChip(ticket, kind) {
    return `<a class="ticket-tag-chip ticket-ref-chip ticket-relation-chip ticket-relation-chip-${kind}" href="/tickets/${ticket.id}"><span class="ticket-ref-chip-id${ticket.isResolved ? " ticket-ref-resolved" : ""}">#${ticket.id}</span><span class="ticket-ref-chip-text">${ctx.escapeHtml(ticket.title)}</span></a>`;
  }

  function renderActivity(activity, events = []) {
    const timeline = [
      ...activity.map((entry) => ({ type: "activity", createdAt: entry.createdAt, entry })),
      ...events.map((entry) => ({ type: "event", createdAt: entry.createdAt, entry })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (!timeline.length) {
      return '<p class="muted">No activity yet.</p>';
    }
    return timeline
      .map((item) => {
        if (item.type === "event") {
          return `
          <article class="activity-item">
            <div class="activity-meta muted">${ctx.escapeHtml(renderEventMeta(item.entry))}</div>
            <div class="activity-message">${ctx.escapeHtml(item.entry.title)}</div>
            ${item.entry.summary ? `<div class="activity-meta muted">${ctx.escapeHtml(item.entry.summary)}</div>` : ""}
          </article>
        `;
        }
        return `
          <article class="activity-item">
            <div class="activity-meta muted">${new Date(item.entry.createdAt).toLocaleString()}</div>
            <div class="activity-message">${ctx.escapeHtml(item.entry.message)}</div>
          </article>
        `;
      })
      .join("");
  }

  function renderRemoteBody(bodyHtml) {
    if (!bodyHtml) {
      return '<p class="muted">No remote body snapshot.</p>';
    }
    return `<div class="markdown ticket-remote-body-rendered">${bodyHtml}</div>`;
  }

  function renderBodyDiff(remoteMarkdown, localMarkdown) {
    const rows = buildBodyDiffRows(remoteMarkdown, localMarkdown);
    if (!rows.length) {
      return '<p class="muted">No remote or local body content.</p>';
    }
    return `
      <div class="ticket-body-diff" role="table" aria-label="Remote and local body diff">
        ${rows.map((row) => `
          <div class="ticket-body-diff-row ticket-body-diff-row-${row.type}" role="row">
            <div class="ticket-body-diff-marker" role="cell">${ctx.escapeHtml(row.marker)}</div>
            <pre class="ticket-body-diff-line" role="cell">${ctx.escapeHtml(row.text || " ")}</pre>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderPrioritySelect(ticket) {
    const value = String(ticket.priority === 4 ? 4 : ticket.priority || 2);
    return `
      <select class="ticket-detail-select ticket-detail-priority-select" data-detail-priority-select aria-label="Priority">
        ${[
          ["1", "Low"],
          ["2", "Medium"],
          ["3", "High"],
          ["4", "Urgent"],
        ].map(([optionValue, label]) => `<option value="${optionValue}" ${value === optionValue ? "selected" : ""}>${label}</option>`).join("")}
      </select>
    `;
  }

  function renderPriorityButton(priority) {
    return `
      <button type="button" class="ticket-detail-badge-button" data-detail-edit="priority">
        ${renderPriorityBadge(priority)}
      </button>
    `;
  }

  function renderEventMeta(entry) {
    const parts = [new Date(entry.createdAt).toLocaleString(), entry.source, entry.kind];
    if (entry.severity) {
      parts.push(entry.severity);
    }
    return parts.filter(Boolean).join(" / ");
  }

  function formatDateTime(value) {
    if (!value) {
      return "unknown";
    }
    return new Date(value).toLocaleString();
  }

  function formatExternalReferenceKind(kind) {
    return String(kind || "reference").replace(/[-_]+/g, " ");
  }

  return {
    renderActivity,
    renderBodyDiff,
    renderPriorityButton,
    renderPrioritySelect,
    renderRemoteBody,
    renderRemoteSummary,
    renderTicketMeta,
    renderTicketRelations,
  };
}

export function getRemoteSnapshotFreshness(remote, now = Date.now()) {
  const lastSyncedAt = Date.parse(remote?.lastSyncedAt ?? "");
  if (!Number.isFinite(lastSyncedAt)) {
    return {
      isStale: true,
      message: "Refresh recommended: last sync is unknown",
    };
  }
  if (now - lastSyncedAt > REMOTE_STALE_THRESHOLD_MS) {
    return {
      isStale: true,
      message: "Refresh recommended: last sync is over 24 hours old",
    };
  }
  return {
    isStale: false,
    message: "",
  };
}

export function buildBodyDiffRows(remoteMarkdown = "", localMarkdown = "") {
  const remoteLines = splitMarkdownLines(remoteMarkdown);
  const localLines = splitMarkdownLines(localMarkdown);
  if (remoteLines.length * localLines.length > MAX_BODY_DIFF_CELLS) {
    return buildLinearBodyDiffRows(remoteLines, localLines);
  }
  const table = Array.from({ length: remoteLines.length + 1 }, () => Array(localLines.length + 1).fill(0));
  for (let remoteIndex = remoteLines.length - 1; remoteIndex >= 0; remoteIndex -= 1) {
    for (let localIndex = localLines.length - 1; localIndex >= 0; localIndex -= 1) {
      table[remoteIndex][localIndex] = remoteLines[remoteIndex] === localLines[localIndex]
        ? table[remoteIndex + 1][localIndex + 1] + 1
        : Math.max(table[remoteIndex + 1][localIndex], table[remoteIndex][localIndex + 1]);
    }
  }

  const rows = [];
  let remoteIndex = 0;
  let localIndex = 0;
  while (remoteIndex < remoteLines.length || localIndex < localLines.length) {
    if (remoteLines[remoteIndex] === localLines[localIndex]) {
      rows.push({ type: "same", marker: " ", text: remoteLines[remoteIndex] ?? "" });
      remoteIndex += 1;
      localIndex += 1;
    } else if (localIndex >= localLines.length || table[remoteIndex + 1]?.[localIndex] >= table[remoteIndex]?.[localIndex + 1]) {
      rows.push({ type: "remote", marker: "-", text: remoteLines[remoteIndex] ?? "" });
      remoteIndex += 1;
    } else {
      rows.push({ type: "local", marker: "+", text: localLines[localIndex] ?? "" });
      localIndex += 1;
    }
  }
  return rows;
}

function splitMarkdownLines(value) {
  if (!value) {
    return [];
  }
  return String(value).replace(/\r\n?/g, "\n").split("\n");
}

function buildLinearBodyDiffRows(remoteLines, localLines) {
  const rows = [];
  const length = Math.max(remoteLines.length, localLines.length);
  for (let index = 0; index < length; index += 1) {
    const remoteLine = remoteLines[index];
    const localLine = localLines[index];
    if (remoteLine === localLine) {
      rows.push({ type: "same", marker: " ", text: remoteLine ?? "" });
    } else {
      if (remoteLine != null) {
        rows.push({ type: "remote", marker: "-", text: remoteLine });
      }
      if (localLine != null) {
        rows.push({ type: "local", marker: "+", text: localLine });
      }
    }
  }
  return rows;
}
