import { createChangeRequestLinks } from './app-change-request-links.js';
import { t } from "./app-i18n.js";
import { icon } from "./icons.js";
import { createTicketDetailRenderers } from "./app-ticket-detail-renderers.js";
import { readRecordedText, renderRecordedText } from "./app-ticket-history.js";

export { buildBodyDiffRows, getRemoteSnapshotFreshness } from "./app-ticket-detail-renderers.js";

export function createTicketDetailModule(ctx) {
  const { state, elements } = ctx;
  let activeInlineEdit = null;
  let expandedStateAction = null;
  const pendingExternalReferences = new Set();
  const renderers = createTicketDetailRenderers({ ...ctx,
    isExternalReferenceRefreshing: kind => pendingExternalReferences.has(`${state.dialogTicket?.id}:${kind}`),
  });
  const changeRequestLinks = createChangeRequestLinks(ctx, updated => {
    // Only update link metadata; preserve inline body/comment/Task drafts.
    state.dialogTicket = { ...state.dialogTicket, externalReferences: updated.externalReferences };
    syncRemoteSummary(state.dialogTicket);
  });
  const bodyInput = () => elements.ticketViewBody.querySelector("[data-detail-body-input]");

  function resetInlineEdit() {
    ctx.imageAttachments.reset(bodyInput());
    activeInlineEdit = null;
  }

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
      ctx.showToast(t("Save or cancel the local body edit before switching tabs"), "error");
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
    syncActivity(activity, events);
  }

  let activityInterval;

  function renderActivityView() {
    const comments = state.dialogTicket?.comments ?? [];
    if (!activityInterval) {
      elements.ticketActivity.innerHTML = renderers.renderActivity(state.dialogActivity, state.dialogEvents, comments);
      return;
    }
    const { loading, activity, historyPossiblyIncomplete } = activityInterval;
    const context = `<div class="ticket-visit-activity-heading"><strong>${t("Activity between these views")}</strong>
      <button type="button" class="ghost ticket-visit-link" data-ticket-show-all-activity>${t("Show all activity")}</button></div>`;
    const status = loading ? t("Loading activity…") : activity === null ? t("Could not load activity for this comparison.") :
      historyPossiblyIncomplete ? t("Some activity in this interval may no longer be available.") :
      activity.length === 0 ? t("No recorded activity between these views.") : "";
    elements.ticketActivity.innerHTML = context +
      (status ? `<p class="muted" role="status">${status}</p>` : "") +
      (activity?.length ? renderers.renderActivity(activity, [], comments, true) : "");
  }

  function syncActivity(activity, events = state.dialogEvents) {
    state.dialogActivity = activity;
    state.dialogEvents = events;
    renderActivityView();
  }

  function clearActivityInterval() {
    if (!activityInterval) return;
    activityInterval = undefined;
    renderActivityView();
  }

  async function openVisitActivity(result) {
    setDetailTab("activity");
    if (!result?.before || !result.current) {
      clearActivityInterval();
      return;
    }
    const { before, current } = result;
    const scope = { loading: true, series: current.series };
    activityInterval = scope;
    renderActivityView();
    const isCurrent = () => scope === activityInterval && current.ticketId === state.dialogTicket?.id && ctx.isDialogCurrent();
    try {
      const query = new URLSearchParams({ compact: "true", after: before.activityThrough, through: current.activityThrough });
      const payload = await ctx.api(`/api/tickets/${current.ticketId}/activity?${query}`);
      if (!isCurrent()) return;
      scope.activity = payload.series === scope.series ? payload.activity : null;
      scope.historyPossiblyIncomplete = payload.historyPossiblyIncomplete;
    } catch {
      if (!isCurrent()) return;
      scope.activity = null;
    }
    scope.loading = false;
    renderActivityView();
  }

  elements.ticketActivity.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-ticket-show-all-activity]")) {
      clearActivityInterval();
      elements.activityTabButton.focus({ preventScroll: true });
      return;
    }
    const link = event.target instanceof Element ? event.target.closest("[data-activity-comment-id]") : null;
    if (!link || !ctx.isDialogCurrent()) return;
    const id = Number(link.getAttribute("data-activity-comment-id"));
    if (!state.dialogTicket?.comments?.some((comment) => comment.id === id)) return;
    const target = elements.ticketComments.querySelector(`[data-comment-id="${id}"]`);
    if (!(target instanceof HTMLElement)) return;
    setDetailTab("comments");
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  });

  elements.ticketActivity.addEventListener("toggle", async (event) => {
    const disclosure = event.target;
    if (!(disclosure instanceof HTMLDetailsElement) || !disclosure.open || disclosure.dataset.activityDetailState) return;
    const activityId = Number(disclosure.dataset.activityDetailId);
    const ticketId = state.dialogTicket?.id;
    const panel = disclosure.querySelector("[data-activity-detail-content]");
    if (!ticketId || !Number.isSafeInteger(activityId) || activityId <= 0 || !panel || !ctx.isDialogCurrent()) return;
    const isCurrent = () => disclosure.isConnected && state.dialogTicket?.id === ticketId && ctx.isDialogCurrent();
    disclosure.dataset.activityDetailState = "loading";
    panel.textContent = t("Loading recorded text...");
    try {
      const series = activityInterval?.series;
      const query = series ? "?" + new URLSearchParams({ series }) : "";
      const entry = await ctx.api(`/api/tickets/${ticketId}/activity/${activityId}${query}`);
      if (!isCurrent()) return;
      if (entry.id !== activityId || entry.subjectTicketId !== ticketId) throw new Error("Unexpected activity");
      panel.innerHTML = renderRecordedText(readRecordedText(entry), ctx.escapeHtml);
      disclosure.dataset.activityDetailState = "loaded";
    } catch {
      if (!isCurrent()) return;
      panel.textContent = t("Could not load recorded text. Close and reopen to retry.");
      delete disclosure.dataset.activityDetailState;
    }
  }, true);

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
    syncArchiveState(ticket);
    elements.editorHeaderId.textContent = `#${ticket.id}`;
    renderHeaderTitle(ticket);
    elements.editorHeaderTitle.hidden = state.dialogMode !== "view";
    renderHeaderPriority(ticket);
    const headerPriority = elements.editorHeaderPriority.innerHTML;
    elements.editorHeaderPriority.hidden = state.dialogMode !== "view" || !headerPriority;
    elements.headerEditButton.hidden = state.dialogMode !== "view";
  }

  function syncArchiveState(ticket) {
    const statePills = renderHeaderStatePills(ticket);
    elements.editorHeaderState.hidden = state.dialogMode !== "view" || !statePills;
    elements.editorHeaderState.innerHTML = statePills;
    elements.archiveTicketButton.hidden = state.dialogMode !== "edit";
    const archiveIcon = ticket.isArchived ? "rotate-ccw" : "archive";
    const archiveLabel = ticket.isArchived ? t("Restore") : t("Archive");
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
        <input class="ticket-inline-title-input" data-detail-title-input value="${ctx.escapeHtml(ticket.title)}" aria-label="${t("Ticket title")}" />
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
      pills.push(`<span class="ticket-state-pill ticket-state-pill-resolved" title="${t("Completion is determined by the lane. Move to a normal lane to reopen.")}">${icon("check")}<span>${t("Resolved")}</span></span>`);
    }
    if (ticket.isArchived) {
      pills.push(renderStatePill({
        key: "archived",
        label: t("Archived"),
        iconName: "archive",
        actionLabel: t("Restore"),
        actionAriaLabel: t("Restore ticket"),
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
    syncTicketDetail(state.dialogTicket, state.dialogActivity, state.dialogEvents ?? []);
  }

  function hasUnsavedBody() {
    const input = bodyInput();
    return activeInlineEdit === "body" && input
      && (ctx.imageAttachments.isPending(input) || input.value !== (state.dialogTicket?.bodyMarkdown ?? ""));
  }

  async function cancelInlineEdit() {
    if (!activeInlineEdit) {
      return;
    }
    if (hasUnsavedBody() && !await ctx.confirmDiscardChanges()) return;
    resetInlineEdit();
    syncTicketDetail(state.dialogTicket, state.dialogActivity, state.dialogEvents ?? []);
  }

  async function updateInlineTicket(patch, savedMessage = t("Saved")) {
    if (!state.dialogTicket || !ctx.updateDialogTicket) {
      return;
    }
    expandedStateAction = null;
    await ctx.updateDialogTicket(patch, savedMessage);
  }

  function renderBodyEditor() {
    if (state.detailBodyTab === "remote") {
      return;
    }
    if (activeInlineEdit === "body" && bodyInput()) return;
    activeInlineEdit = "body";
    elements.ticketViewBody.classList.add("ticket-detail-body-editing");
    elements.ticketViewBody.innerHTML = `
      <textarea class="ticket-detail-body-input" data-detail-body-input rows="10" aria-label="${t("Ticket body")}" ${state.editorSaving ? "readonly" : ""}>${ctx.escapeHtml(state.dialogTicket?.bodyMarkdown ?? "")}</textarea>
      <div class="ticket-detail-body-actions">
        <span class="muted">${t("Ctrl+Enter / Cmd+Enter to save")}</span>
        <div class="editor-actions-right">
          <button type="button" class="ghost" data-detail-cancel="body">${t("Cancel")}</button>
          <button type="button" class="primary-action" aria-keyshortcuts="Control+Enter Meta+Enter" data-detail-save-body>${t("Save")}</button>
        </div>
      </div>
    `;
    const input = bodyInput();
    ctx.imageAttachments.bind(input, () => ctx.isDialogCurrent() && state.dialogMode === "view" && activeInlineEdit === "body");
    queueMicrotask(() => input.focus());
  }

  function renderBodyDisplay(ticket) {
    ctx.imageAttachments.reset(bodyInput());
    elements.ticketViewBody.classList.remove("ticket-detail-body-editing");
    if (ticket?.remote && state.detailBodyTab === "remote") {
      elements.ticketViewBody.innerHTML = `
        <div class="ticket-remote-body-note muted">${t("Read-only remote Markdown snapshot")}</div>
        ${renderers.renderRemoteBody(ticket.remote.bodyHtml)}
      `;
      return;
    }
    if (ticket?.remote && state.detailBodyTab === "diff") {
      elements.ticketViewBody.innerHTML = renderers.renderBodyDiff(ticket.remote.bodyMarkdown, ticket.bodyMarkdown);
      return;
    }
    elements.ticketViewBody.innerHTML = `
      <div class="ticket-detail-body-content">${ticket?.bodyHtml || `<p class="muted">${t("No description")}</p>`}</div>
      <button type="button" class="ticket-detail-inline-edit-button" data-detail-edit="body">
        ${icon("pencil")}<span>${t("Edit local body")}</span>
      </button>
    `;
    for (const marker of elements.ticketViewBody.querySelectorAll(".task-checkbox[data-task-offset]")) {
      const offset = Number(marker.dataset.taskOffset);
      if (!Number.isSafeInteger(offset) || !/^[ xX]$/.test(ticket.bodyMarkdown[offset] ?? "")) continue;
      const label = marker.closest("li")?.cloneNode(true);
      label?.querySelectorAll("ul, ol, .task-checkbox").forEach(node => node.remove());
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "task-checkbox";
      input.dataset.detailChecklistOffset = String(offset);
      input.checked = ticket.bodyMarkdown[offset].toLowerCase() === "x";
      input.setAttribute("aria-label", t("Checklist: {text}", { text: label?.textContent?.trim() || String(offset) }));
      marker.replaceWith(input);
    }
  }

  async function toggleBodyChecklist(input) {
    const ticket = state.dialogTicket;
    if (!ticket || state.editorSaving || !ticket.editToken) return;
    const offset = Number(input.dataset.detailChecklistOffset);
    const body = ticket.bodyMarkdown;
    if (!Number.isSafeInteger(offset) || !/^[ xX]$/.test(body[offset] ?? "") || body[offset - 1] !== "[" || body[offset + 1] !== "]") return;
    const checked = input.checked;
    input.checked = body[offset].toLowerCase() === "x";
    const isCurrent = ctx.captureDialogScope();
    const controls = [...elements.ticketViewBody.querySelectorAll("[data-detail-checklist-offset]")];
    state.editorSaving = true;
    const wasInert = elements.ticketViewBody.inert;
    elements.ticketViewBody.inert = true;
    controls.forEach(control => { control.disabled = true; });
    elements.ticketViewBody.setAttribute("aria-busy", "true");
    let saved = false;
    try {
      const updated = await ctx.sendJson(`/api/tickets/${ticket.id}`, { method: "PATCH", body: {
        bodyMarkdown: body.slice(0, offset) + (checked ? "x" : " ") + body.slice(offset + 1),
        expectedEditToken: ticket.editToken,
      } });
      saved = true;
      if (isCurrent()) await ctx.refreshDialogTicket(ticket.id, updated);
      await ctx.refreshBoardDetail();
    } catch (error) {
      if (isCurrent()) ctx.showToast(saved ? t("Ticket saved, but the view could not refresh. Reload to continue.") : error.message, "error");
    } finally {
      state.editorSaving = false;
      elements.ticketViewBody.inert = wasInert;
      controls.forEach(control => { control.disabled = false; });
      elements.ticketViewBody.removeAttribute("aria-busy");
      if (isCurrent()) elements.ticketViewBody.querySelector(`[data-detail-checklist-offset="${offset}"]`)?.focus();
    }
  }

  function syncExternalReferenceButtons() {
    for (const button of elements.ticketRemoteSummary.querySelectorAll("[data-refresh-external-reference]")) {
      const pending = pendingExternalReferences.has(`${state.dialogTicket?.id}:${button.dataset.refreshExternalReference}`);
      button.disabled = pending;
      button.setAttribute("aria-busy", String(pending));
    }
  }

  async function refreshExternalReference(kind) {
    const ticket = state.dialogTicket;
    if (!ticket) return;
    const key = `${ticket.id}:${kind}`;
    if (pendingExternalReferences.has(key)) return;
    const isCurrent = ctx.captureDialogScope();
    const restoreFocus = document.activeElement?.matches("[data-refresh-external-reference]");
    if (restoreFocus) document.activeElement.blur();
    pendingExternalReferences.add(key);
    syncExternalReferenceButtons();
    try {
      const updated = await ctx.api(`/api/tickets/${ticket.id}/external-references/${encodeURIComponent(kind)}/refresh`, { method: "POST" });
      if (isCurrent()) await ctx.refreshDialogTicket(ticket.id, updated, { onlyIfPristine: true });
      await ctx.refreshBoardDetail();
    } catch (error) {
      if (isCurrent()) {
        ctx.showToast(error.message, "error");
        await ctx.refreshDialogTicket(ticket.id, null, { onlyIfPristine: true }).catch(() => {});
      }
    } finally {
      pendingExternalReferences.delete(key);
      syncExternalReferenceButtons();
      if (restoreFocus && isCurrent() && document.activeElement === document.body) {
        [...elements.ticketRemoteSummary.querySelectorAll("[data-refresh-external-reference]")]
          .find(button => button.dataset.refreshExternalReference === kind)?.focus();
      }
    }
  }

  async function refreshRemoteTicket() {
    if (!state.dialogTicket?.id) {
      return;
    }
    try {
      await ctx.api(`/api/tickets/${state.dialogTicket.id}/remote-refresh`, { method: "POST" });
      await ctx.refreshDialogTicket(state.dialogTicket.id);
      await ctx.refreshBoardDetail();
      ctx.showToast(t("Remote snapshot refreshed"));
    } catch (error) {
      ctx.showToast(error.message, "error");
    }
  }

  async function handleDetailClick(event) {
    const target = event.target;
    if (!(target instanceof Element) || state.dialogMode !== "view") {
      return;
    }
    if (hasUnsavedBody() && target.closest("[data-ticket-group], [data-ticket-body-tab], [data-refresh-remote-ticket], [data-detail-edit], [data-detail-state-action]")) {
      event.preventDefault();
      if (!await ctx.confirmDiscardChanges()) return;
      resetInlineEdit();
    }
    const groupLink = target.closest("[data-ticket-group]");
    if (groupLink) { event.preventDefault(); ctx.openGroup?.(Number(groupLink.getAttribute("data-ticket-group"))).catch(error => ctx.showToast(error.message, "error")); return; }
    if (target.closest('#link-change-request-button')) { await changeRequestLinks.add(); return; }
    const unlink = target.closest('[data-unlink-change-request]');
    if (unlink) { await changeRequestLinks.remove(Number(unlink.dataset.unlinkChangeRequest)); return; }
    const externalRefresh = target.closest("[data-refresh-external-reference]");
    if (externalRefresh) { await refreshExternalReference(externalRefresh.dataset.refreshExternalReference); return; }
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
      if (action === "archived") {
        updateInlineTicket({ isArchived: false }, t("Restored")).catch((error) => ctx.showToast(error.message, "error"));
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
      const input = bodyInput();
      if (!ctx.imageAttachments.canSave(input)) return;
      updateInlineTicket({ bodyMarkdown: input?.value ?? "" }).catch((error) => ctx.showToast(error.message, "error"));
    }
  }

  function handleDetailChange(event) {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches("[data-detail-checklist-offset]") && state.dialogMode === "view") {
      toggleBodyChecklist(target);
      return;
    }
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
    if (event.key === "Escape" && !ctx.isComposing(event)
        && (activeInlineEdit === "title" || activeInlineEdit === "priority" || expandedStateAction)) {
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
    if (target.matches("[data-detail-title-input]") && event.key === "Enter" && !ctx.isComposing(event)) {
      event.preventDefault();
      if (event.repeat) return;
      const title = target.value.trim();
      if (title) {
        updateInlineTicket({ title }).catch((error) => ctx.showToast(error.message, "error"));
      }
      return;
    }
    if (target.matches("[data-detail-body-input]") && ctx.isSaveShortcut(event)) {
      event.preventDefault();
      if (!event.repeat && !state.editorSaving) elements.ticketViewBody.querySelector("[data-detail-save-body]")?.click();
    }
  }

  return {
    resetInlineEdit,
    hasUnsavedBody,
    setBodyTab,
    setDetailTab,
    clearActivityInterval,
    openVisitActivity,
    handleDetailChange,
    handleDetailClick,
    handleDetailFocusout,
    handleDetailKeydown,
    syncActivity,
    syncEditorHeader,
    syncArchiveState,
    syncTicketDetail,
  };
}
