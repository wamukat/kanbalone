import { icon } from "./icons.js";
import { renderTag } from "./app-tags.js";
import { renderPriorityBadge } from "./app-priority.js";
import { renderRemoteProviderBadge, renderRemoteRefLink } from "./app-remote-provider.js";

export function createTicketDetailModule(ctx) {
  const { state, elements } = ctx;
  let activeInlineEdit = null;
  let expandedStateAction = null;

  function setDetailTab(tab) {
    const showComments = tab !== "activity";
    elements.commentsTabButton.classList.toggle("active", showComments);
    elements.commentsTabButton.setAttribute("aria-selected", String(showComments));
    elements.activityTabButton.classList.toggle("active", !showComments);
    elements.activityTabButton.setAttribute("aria-selected", String(!showComments));
    elements.commentsSection.hidden = !showComments;
    elements.activitySection.hidden = showComments;
  }

  function setBodyTab(tab = "local") {
    if (activeInlineEdit === "body" && tab === "remote") {
      ctx.showToast("Save or cancel the local body edit before switching tabs", "error");
      return;
    }
    state.detailBodyTab = tab === "remote" && state.dialogTicket?.remote ? "remote" : "local";
    const showRemote = state.detailBodyTab === "remote" && Boolean(state.dialogTicket?.remote);
    elements.ticketLocalBodyTabButton.classList.toggle("active", !showRemote);
    elements.ticketLocalBodyTabButton.setAttribute("aria-selected", String(!showRemote));
    elements.ticketRemoteBodyTabButton.classList.toggle("active", showRemote);
    elements.ticketRemoteBodyTabButton.setAttribute("aria-selected", String(showRemote));
    if (state.dialogTicket) {
      if (activeInlineEdit === "body" && !showRemote) {
        renderBodyEditor();
      } else {
        activeInlineEdit = showRemote ? null : activeInlineEdit;
        renderBodyDisplay(state.dialogTicket);
      }
    }
  }

  function syncTicketDetail(ticket, activity = []) {
    state.dialogActivity = activity;
    syncEditorHeader(ticket);
    elements.ticketViewMeta.innerHTML = renderTicketMeta(ticket);
    syncRemoteSummary(ticket);
    syncBodyTabs(ticket);
    syncTicketRelations(ticket);
    if (activeInlineEdit === "body" && state.detailBodyTab === "local") {
      renderBodyEditor();
    } else {
      renderBodyDisplay(ticket);
    }
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
    const statePills = renderHeaderStatePills(ticket);
    elements.editorHeaderState.hidden = state.dialogMode !== "view" || !statePills;
    elements.editorHeaderState.innerHTML = statePills;
    elements.editorHeaderId.textContent = `#${ticket.id}`;
    renderHeaderTitle(ticket);
    elements.editorHeaderTitle.hidden = state.dialogMode !== "view";
    renderHeaderPriority(ticket);
    const headerPriority = elements.editorHeaderPriority.innerHTML;
    elements.editorHeaderPriority.hidden = state.dialogMode !== "view" || !headerPriority;
    elements.headerEditButton.hidden = state.dialogMode !== "view";
    elements.archiveTicketButton.hidden = state.dialogMode !== "edit";
    const archiveIcon = ticket.isArchived ? "rotate-ccw" : "archive";
    const archiveLabel = ticket.isArchived ? "Restore" : "Archive";
    elements.archiveTicketButton.innerHTML = `${icon(archiveIcon)}<span>${ctx.escapeHtml(archiveLabel)}</span>`;
  }

  function syncRemoteSummary(ticket) {
    if (!ticket?.remote) {
      elements.ticketRemoteSummary.hidden = true;
      elements.ticketRemoteSummary.innerHTML = "";
      return;
    }
    elements.ticketRemoteSummary.hidden = false;
    elements.ticketRemoteSummary.innerHTML = `
      <div class="ticket-remote-summary-head">
        <div class="ticket-remote-summary-title">
          ${renderRemoteProviderBadge(ticket.remote.provider, ctx.escapeHtml)}
          ${renderRemoteRefLink(ticket.remote, ctx.escapeHtml)}
          <span class="ticket-remote-state muted">${ctx.escapeHtml(ticket.remote.state ?? "state unknown")}</span>
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
      </div>
    `;
  }

  function syncBodyTabs(ticket) {
    const hasRemote = Boolean(ticket?.remote);
    elements.ticketBodyTabs.hidden = !hasRemote;
    if (!hasRemote) {
      state.detailBodyTab = "local";
      return;
    }
    if (state.detailBodyTab !== "remote") {
      state.detailBodyTab = "local";
    }
    elements.ticketLocalBodyTabButton.classList.toggle("active", state.detailBodyTab !== "remote");
    elements.ticketLocalBodyTabButton.setAttribute("aria-selected", String(state.detailBodyTab !== "remote"));
    elements.ticketRemoteBodyTabButton.classList.toggle("active", state.detailBodyTab === "remote");
    elements.ticketRemoteBodyTabButton.setAttribute("aria-selected", String(state.detailBodyTab === "remote"));
  }

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

  function renderHeaderTitle(ticket) {
    if (ticket.remote) {
      elements.editorHeaderTitle.innerHTML = `<span class="ticket-inline-title-static">${ctx.escapeHtml(ticket.title)}</span>`;
      return;
    }
    if (activeInlineEdit === "title") {
      elements.editorHeaderTitle.innerHTML = `
        <input class="ticket-inline-title-input" data-detail-title-input value="${ctx.escapeHtml(ticket.title)}" aria-label="Ticket title" />
      `;
      queueMicrotask(() => {
        const input = elements.editorHeaderTitle.querySelector("[data-detail-title-input]");
        input?.focus();
        input?.select();
      });
      return;
    }
    elements.editorHeaderTitle.innerHTML = `
      <button type="button" class="ticket-inline-title-button" data-detail-edit="title">
        <span>${ctx.escapeHtml(ticket.title)}</span>
      </button>
    `;
  }

  function renderHeaderPriority(ticket) {
    if (activeInlineEdit === "priority") {
      elements.editorHeaderPriority.innerHTML = renderPrioritySelect(ticket);
      queueMicrotask(() => elements.editorHeaderPriority.querySelector("[data-detail-priority-select]")?.focus());
      return;
    }
    elements.editorHeaderPriority.innerHTML = `
      <button type="button" class="ticket-detail-badge-button" data-detail-edit="priority">
        ${renderPriorityBadge(ticket.priority)}
      </button>
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

  function renderHeaderStatePills(ticket) {
    const pills = [];
    if (ticket.isResolved) {
      pills.push(renderStatePill({
        key: "resolved",
        label: "Resolved",
        iconName: "check",
        actionLabel: "Open",
        actionAriaLabel: "Mark open",
      }));
    }
    if (ticket.isArchived) {
      pills.push(renderStatePill({
        key: "archived",
        label: "Archived",
        iconName: "archive",
        actionLabel: "Restore",
        actionAriaLabel: "Restore ticket",
      }));
    }
    return pills.join("");
  }

  function renderStatePill({ key, label, iconName, actionLabel, actionAriaLabel }) {
    const expanded = expandedStateAction === key;
    return `
      <span
        class="ticket-state-pill ticket-state-pill-${key}${expanded ? " expanded" : ""}"
        data-detail-state-pill="${key}"
        role="button"
        tabindex="0"
        aria-expanded="${String(expanded)}"
        title="${ctx.escapeHtml(label)}"
      >
        ${icon(iconName)}<span>${ctx.escapeHtml(label)}</span>
        <button type="button" class="ticket-state-pill-action" data-detail-state-action="${key}" aria-label="${ctx.escapeHtml(actionAriaLabel)}" ${expanded ? "" : "hidden"}>${ctx.escapeHtml(actionLabel)}</button>
      </span>
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

  function startInlineEdit(field) {
    activeInlineEdit = field;
    syncTicketDetail(state.dialogTicket, state.dialogActivity ?? []);
  }

  function cancelInlineEdit() {
    if (!activeInlineEdit) {
      return;
    }
    activeInlineEdit = null;
    syncTicketDetail(state.dialogTicket, state.dialogActivity ?? []);
  }

  async function updateInlineTicket(patch, savedMessage = "Saved") {
    if (!state.dialogTicket || !ctx.updateDialogTicket) {
      return;
    }
    activeInlineEdit = null;
    expandedStateAction = null;
    await ctx.updateDialogTicket(patch, savedMessage);
  }

  function renderBodyEditor() {
    if (state.detailBodyTab === "remote") {
      return;
    }
    activeInlineEdit = "body";
    elements.ticketViewBody.classList.add("ticket-detail-body-editing");
    elements.ticketViewBody.innerHTML = `
      <textarea class="ticket-detail-body-input" data-detail-body-input rows="10" aria-label="Ticket body">${ctx.escapeHtml(state.dialogTicket?.bodyMarkdown ?? "")}</textarea>
      <div class="ticket-detail-body-actions">
        <span class="muted">Ctrl+Enter / Cmd+Enter to save</span>
        <div class="editor-actions-right">
          <button type="button" class="ghost" data-detail-cancel="body">Cancel</button>
          <button type="button" class="primary-action" data-detail-save-body>Save</button>
        </div>
      </div>
    `;
    queueMicrotask(() => elements.ticketViewBody.querySelector("[data-detail-body-input]")?.focus());
  }

  function renderBodyDisplay(ticket) {
    elements.ticketViewBody.classList.remove("ticket-detail-body-editing");
    if (ticket?.remote && state.detailBodyTab === "remote") {
      elements.ticketViewBody.innerHTML = `
        <div class="ticket-remote-body-note muted">Read-only remote Markdown snapshot</div>
        ${renderRemoteBody(ticket.remote.bodyHtml)}
      `;
      return;
    }
    elements.ticketViewBody.innerHTML = `
      <div class="ticket-detail-body-content">${ticket?.bodyHtml || '<p class="muted">No description</p>'}</div>
      <button type="button" class="ticket-detail-inline-edit-button" data-detail-edit="body">
        ${icon("pencil")}<span>Edit local body</span>
      </button>
    `;
  }

  function renderRemoteBody(bodyHtml) {
    if (!bodyHtml) {
      return '<p class="muted">No remote body snapshot.</p>';
    }
    return `<div class="markdown ticket-remote-body-rendered">${bodyHtml}</div>`;
  }

  async function refreshRemoteTicket() {
    if (!state.dialogTicket?.id) {
      return;
    }
    try {
      await ctx.api(`/api/tickets/${state.dialogTicket.id}/remote-refresh`, { method: "POST" });
      await ctx.refreshDialogTicket(state.dialogTicket.id);
      await ctx.refreshBoardDetail();
      ctx.showToast("Remote snapshot refreshed");
    } catch (error) {
      ctx.showToast(error.message, "error");
    }
  }

  function handleDetailClick(event) {
    const target = event.target;
    if (!(target instanceof Element) || state.dialogMode !== "view") {
      return;
    }
    const bodyTab = target.closest("[data-ticket-body-tab]");
    if (bodyTab) {
      setBodyTab(bodyTab.getAttribute("data-ticket-body-tab") ?? "local");
      return;
    }
    if (target.closest("[data-refresh-remote-ticket]")) {
      refreshRemoteTicket().catch((error) => ctx.showToast(error.message, "error"));
      return;
    }
    const editTarget = target.closest("[data-detail-edit]");
    if (editTarget) {
      const field = editTarget.getAttribute("data-detail-edit");
      if (field === "body") {
        renderBodyEditor();
        return;
      }
      startInlineEdit(field);
      return;
    }
    const stateAction = target.closest("[data-detail-state-action]");
    if (stateAction) {
      const action = stateAction.getAttribute("data-detail-state-action");
      if (action === "resolved") {
        updateInlineTicket({ isResolved: false }, "Reopened").catch((error) => ctx.showToast(error.message, "error"));
      } else if (action === "archived") {
        updateInlineTicket({ isArchived: false }, "Restored").catch((error) => ctx.showToast(error.message, "error"));
      }
      return;
    }
    const statePill = target.closest("[data-detail-state-pill]");
    if (statePill) {
      const action = statePill.getAttribute("data-detail-state-pill");
      expandedStateAction = expandedStateAction === action ? null : action;
      syncEditorHeader(state.dialogTicket);
      return;
    }
    if (expandedStateAction) {
      expandedStateAction = null;
      syncEditorHeader(state.dialogTicket);
    }
    if (target.closest("[data-detail-cancel]")) {
      cancelInlineEdit();
      return;
    }
    if (target.closest("[data-detail-save-body]")) {
      const input = elements.ticketViewBody.querySelector("[data-detail-body-input]");
      updateInlineTicket({ bodyMarkdown: input?.value ?? "" }).catch((error) => ctx.showToast(error.message, "error"));
    }
  }

  function handleDetailChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || state.dialogMode !== "view") {
      return;
    }
    if (target.matches("[data-detail-priority-select]")) {
      updateInlineTicket({ priority: Number(target.value) }).catch((error) => ctx.showToast(error.message, "error"));
    }
  }

  function handleDetailFocusout(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || state.dialogMode !== "view") {
      return;
    }
    if (target.matches("[data-detail-title-input], [data-detail-priority-select]")) {
      queueMicrotask(() => {
        if (activeInlineEdit && document.activeElement !== target) {
          cancelInlineEdit();
        }
      });
    }
  }

  function handleDetailKeydown(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || state.dialogMode !== "view") {
      return;
    }
    if (event.key === "Escape" && (activeInlineEdit || expandedStateAction)) {
      event.preventDefault();
      expandedStateAction = null;
      cancelInlineEdit();
      if (!activeInlineEdit) {
        syncEditorHeader(state.dialogTicket);
      }
      return;
    }
    if (target.matches("[data-detail-state-pill]") && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const action = target.getAttribute("data-detail-state-pill");
      expandedStateAction = expandedStateAction === action ? null : action;
      syncEditorHeader(state.dialogTicket);
      return;
    }
    if (target.matches("[data-detail-title-input]") && event.key === "Enter") {
      event.preventDefault();
      const title = target.value.trim();
      if (title) {
        updateInlineTicket({ title }).catch((error) => ctx.showToast(error.message, "error"));
      }
      return;
    }
    if (target.matches("[data-detail-body-input]") && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      updateInlineTicket({ bodyMarkdown: target.value }).catch((error) => ctx.showToast(error.message, "error"));
    }
  }

  function formatDateTime(value) {
    if (!value) {
      return "unknown";
    }
    return new Date(value).toLocaleString();
  }

  return {
    setBodyTab,
    setDetailTab,
    handleDetailChange,
    handleDetailClick,
    handleDetailFocusout,
    handleDetailKeydown,
    syncEditorHeader,
    syncTicketDetail,
  };
}
