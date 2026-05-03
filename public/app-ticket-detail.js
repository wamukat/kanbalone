import { icon } from "./icons.js";
import { createTicketDetailRenderers } from "./app-ticket-detail-renderers.js";

export { buildBodyDiffRows, getRemoteSnapshotFreshness } from "./app-ticket-detail-renderers.js";

export function createTicketDetailModule(ctx) {
  const { state, elements } = ctx;
  let activeInlineEdit = null;
  let expandedStateAction = null;
  const renderers = createTicketDetailRenderers(ctx);

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
    if (activeInlineEdit === "body" && tab !== "local") {
      ctx.showToast("Save or cancel the local body edit before switching tabs", "error");
      return;
    }
    state.detailBodyTab = (tab === "remote" || tab === "diff") && state.dialogTicket?.remote ? tab : "local";
    const showRemote = state.detailBodyTab === "remote" && Boolean(state.dialogTicket?.remote);
    const showDiff = state.detailBodyTab === "diff" && Boolean(state.dialogTicket?.remote);
    elements.ticketLocalBodyTabButton.classList.toggle("active", !showRemote && !showDiff);
    elements.ticketLocalBodyTabButton.setAttribute("aria-selected", String(!showRemote && !showDiff));
    elements.ticketRemoteBodyTabButton.classList.toggle("active", showRemote);
    elements.ticketRemoteBodyTabButton.setAttribute("aria-selected", String(showRemote));
    elements.ticketDiffBodyTabButton.classList.toggle("active", showDiff);
    elements.ticketDiffBodyTabButton.setAttribute("aria-selected", String(showDiff));
    if (state.dialogTicket) {
      if (activeInlineEdit === "body" && !showRemote && !showDiff) {
        renderBodyEditor();
      } else {
        activeInlineEdit = showRemote || showDiff ? null : activeInlineEdit;
        renderBodyDisplay(state.dialogTicket);
      }
    }
  }

  function syncTicketDetail(ticket, activity = [], events = []) {
    state.dialogActivity = activity;
    state.dialogEvents = events;
    syncEditorHeader(ticket);
    elements.ticketViewMeta.innerHTML = renderers.renderTicketMeta(ticket);
    syncRemoteSummary(ticket);
    syncBodyTabs(ticket);
    syncTicketRelations(ticket);
    if (activeInlineEdit === "body" && state.detailBodyTab === "local") {
      renderBodyEditor();
    } else {
      renderBodyDisplay(ticket);
    }
    elements.ticketActivity.innerHTML = renderers.renderActivity(activity, events);
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
    const summary = renderers.renderRemoteSummary(ticket);
    elements.ticketRemoteSummary.hidden = summary.hidden;
    elements.ticketRemoteSummary.innerHTML = summary.html;
    elements.ticketRemoteSummary.classList.toggle("has-only-external-references", summary.hasOnlyExternalReferences);
  }

  function syncBodyTabs(ticket) {
    const hasRemote = Boolean(ticket?.remote);
    elements.ticketBodyTabs.hidden = !hasRemote;
    if (!hasRemote) {
      state.detailBodyTab = "local";
      return;
    }
    if (state.detailBodyTab !== "remote") {
      state.detailBodyTab = state.detailBodyTab === "diff" ? "diff" : "local";
    }
    elements.ticketLocalBodyTabButton.classList.toggle("active", state.detailBodyTab === "local");
    elements.ticketLocalBodyTabButton.setAttribute("aria-selected", String(state.detailBodyTab === "local"));
    elements.ticketRemoteBodyTabButton.classList.toggle("active", state.detailBodyTab === "remote");
    elements.ticketRemoteBodyTabButton.setAttribute("aria-selected", String(state.detailBodyTab === "remote"));
    elements.ticketDiffBodyTabButton.classList.toggle("active", state.detailBodyTab === "diff");
    elements.ticketDiffBodyTabButton.setAttribute("aria-selected", String(state.detailBodyTab === "diff"));
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
      elements.editorHeaderPriority.innerHTML = renderers.renderPrioritySelect(ticket);
      queueMicrotask(() => elements.editorHeaderPriority.querySelector("[data-detail-priority-select]")?.focus());
      return;
    }
    elements.editorHeaderPriority.innerHTML = renderers.renderPriorityButton(ticket.priority);
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
    const relationsHtml = renderers.renderTicketRelations(ticket);
    elements.ticketRelations.innerHTML = relationsHtml;
    elements.ticketRelations.hidden = !relationsHtml;
  }

  function startInlineEdit(field) {
    activeInlineEdit = field;
    syncTicketDetail(state.dialogTicket, state.dialogActivity ?? [], state.dialogEvents ?? []);
  }

  function cancelInlineEdit() {
    if (!activeInlineEdit) {
      return;
    }
    activeInlineEdit = null;
    syncTicketDetail(state.dialogTicket, state.dialogActivity ?? [], state.dialogEvents ?? []);
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
        ${renderers.renderRemoteBody(ticket.remote.bodyHtml)}
      `;
      return;
    }
    if (ticket?.remote && state.detailBodyTab === "diff") {
      elements.ticketViewBody.innerHTML = renderers.renderBodyDiff(ticket.remote.bodyMarkdown, ticket.bodyMarkdown);
      return;
    }
    elements.ticketViewBody.innerHTML = `
      <div class="ticket-detail-body-content">${ticket?.bodyHtml || '<p class="muted">No description</p>'}</div>
      <button type="button" class="ticket-detail-inline-edit-button" data-detail-edit="body">
        ${icon("pencil")}<span>Edit local body</span>
      </button>
    `;
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
