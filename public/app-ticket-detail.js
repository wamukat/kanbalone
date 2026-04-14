import { icon } from "./icons.js";
import { renderTag } from "./app-tags.js";
import { renderPriorityBadge } from "./app-priority.js";

export function createTicketDetailModule(ctx) {
  const { state, elements } = ctx;

  function setDetailTab(tab) {
    const showComments = tab !== "activity";
    elements.commentsTabButton.classList.toggle("active", showComments);
    elements.commentsTabButton.setAttribute("aria-selected", String(showComments));
    elements.activityTabButton.classList.toggle("active", !showComments);
    elements.activityTabButton.setAttribute("aria-selected", String(!showComments));
    elements.commentsSection.hidden = !showComments;
    elements.activitySection.hidden = showComments;
  }

  function syncTicketDetail(ticket, activity = []) {
    syncEditorHeader(ticket);
    elements.ticketViewMeta.innerHTML = renderTicketMeta(ticket);
    syncTicketRelations(ticket);
    elements.ticketViewBody.innerHTML = ticket?.bodyHtml || '<p class="muted">No description</p>';
    elements.ticketActivity.innerHTML = renderActivity(activity);
  }

  function syncEditorHeader(ticket) {
    if (!ticket) {
      elements.editorHeaderState.hidden = true;
      elements.editorHeaderId.textContent = "";
      elements.editorHeaderTitle.hidden = true;
      elements.editorHeaderTitle.textContent = "";
      elements.editorHeaderPriority.hidden = true;
      elements.editorHeaderPriority.innerHTML = "";
      elements.headerEditButton.hidden = true;
      elements.archiveTicketButton.hidden = true;
      return;
    }
    elements.editorHeaderState.hidden = state.dialogMode !== "view" || !ticket.isResolved;
    elements.editorHeaderState.textContent = ticket.isResolved ? "Resolved" : "";
    elements.editorHeaderState.className = "ticket-state-pill ticket-state-pill-resolved";
    elements.editorHeaderId.textContent = `#${ticket.id}`;
    elements.editorHeaderTitle.textContent = ticket.title;
    elements.editorHeaderTitle.hidden = state.dialogMode !== "view";
    const headerPriority = renderPriorityBadge(ticket.priority);
    elements.editorHeaderPriority.innerHTML = headerPriority;
    elements.editorHeaderPriority.hidden = state.dialogMode !== "view" || !headerPriority;
    elements.headerEditButton.hidden = state.dialogMode !== "view";
    elements.archiveTicketButton.hidden = state.dialogMode !== "edit";
    const archiveIcon = ticket.isArchived ? "rotate-ccw" : "archive";
    const archiveLabel = ticket.isArchived ? "Restore" : "Archive";
    elements.archiveTicketButton.innerHTML = `${icon(archiveIcon)}<span>${ctx.escapeHtml(archiveLabel)}</span>`;
  }

  function renderTicketMeta(ticket) {
    if (!ticket) {
      return "";
    }
    const archived = ticket.isArchived ? '<span class="ticket-archived-label">Archived</span>' : "";
    const tags = ticket.tags
      .map((tag) => renderTag(tag, ctx.escapeHtml))
      .join("");
    return `
      <div class="ticket-meta-row">${archived}${tags}</div>
    `;
  }

  function syncTicketRelations(ticket) {
    const relationsHtml = renderTicketRelations(ticket);
    elements.ticketRelations.innerHTML = relationsHtml;
    elements.ticketRelations.hidden = !relationsHtml;
  }

  function renderTicketRelations(ticket) {
    if (!ticket) {
      return "";
    }
    const parts = [];
    const blocking = ctx.getBlockingTickets(ticket.id);
    if (ticket.parent) {
      parts.push(`<div><span class="muted">Parent</span> ${renderRelationChip(ticket.parent, "parent")}</div>`);
    }
    if (ticket.children.length) {
      parts.push(`<div><span class="muted">Children</span> ${ticket.children.map((child) => renderRelationChip(child, "child")).join("")}</div>`);
    }
    if (ticket.blockers.length) {
      parts.push(`<div><span class="muted">Blocked By</span> ${ticket.blockers.map((blocker) => renderRelationChip(blocker, "blocked-by")).join("")}</div>`);
    }
    if (blocking.length) {
      parts.push(`<div><span class="muted">Blocks</span> ${blocking.map((blocked) => renderRelationChip(blocked, "blocks")).join("")}</div>`);
    }
    return parts.join("");
  }

  function renderRelationChip(ticket, kind) {
    return `<a class="ticket-tag-chip ticket-ref-chip ticket-relation-chip ticket-relation-chip-${kind}" href="/tickets/${ticket.id}"><span class="ticket-ref-chip-id${ticket.isResolved ? " ticket-ref-resolved" : ""}">#${ticket.id}</span><span class="ticket-ref-chip-text">${ctx.escapeHtml(ticket.title)}</span></a>`;
  }

  function renderActivity(activity) {
    if (!activity.length) {
      return '<p class="muted">No activity yet.</p>';
    }
    return activity
      .map(
        (entry) => `
          <article class="activity-item">
            <div class="activity-meta muted">${new Date(entry.createdAt).toLocaleString()}</div>
            <div class="activity-message">${ctx.escapeHtml(entry.message)}</div>
          </article>
        `,
      )
      .join("");
  }

  return {
    setDetailTab,
    syncEditorHeader,
    syncTicketDetail,
  };
}
