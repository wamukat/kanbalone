import { createTicketActionsModule } from "./app-ticket-actions.js";
import { createTicketCommentsModule } from "./app-ticket-comments.js";
import { createTicketDetailModule } from "./app-ticket-detail.js";
import { createTicketRelationsModule } from "./app-ticket-relations.js";
import { createTicketTagPicker } from "./app-ticket-tag-picker.js";
import { getPriorityInputValue } from "./app-priority.js";

export function createEditorModule(ctx) {
  const { state, elements } = ctx;
  const DEFAULT_REMOTE_PROVIDER_ORDER = ["github", "gitlab", "redmine"];

  function getSelectedTagIds() {
    return [...state.editorTagIds];
  }

  let relationsModule;

  const tagPicker = createTicketTagPicker({
    ...ctx,
    closePeerOptions: () => {
      relationsModule?.closeOptions();
    },
  });

  relationsModule = createTicketRelationsModule(ctx, { tagPicker });

  const detailModule = createTicketDetailModule({
    ...ctx,
    getBlockingTickets: relationsModule.getBlockingTickets,
    updateDialogTicket,
  });

  const actionsModule = createTicketActionsModule(ctx, {
    closeEditor,
    getSelectedTagIds,
    refreshDialogTicket,
    setDialogMode,
  });

  const {
    clearSaveState,
    deleteTicket,
    moveTicketToBoard,
    saveTicket,
    setSaveState,
    toggleTicketArchive,
  } = actionsModule;

  const commentsModule = createTicketCommentsModule({
    ...ctx,
    refreshDialogTicket,
    setSaveState,
  });

  function syncRemoteImportSheet() {
    const open = state.editorRemoteImportOpen && state.dialogMode === "edit" && !state.editingTicketId;
    elements.editorDialog.classList.toggle("remote-import-open", open);
    elements.editorRemoteImportSheet.hidden = false;
    elements.editorRemoteImportSheet.setAttribute("aria-hidden", String(!open));
    elements.editorForm.toggleAttribute("inert", open);
    elements.editorForm.setAttribute("aria-hidden", String(open));
    elements.remoteImportCreateButton.setAttribute("aria-pressed", String(open));
    if (!open) {
      elements.editorRemoteImportError.hidden = true;
      elements.editorRemoteImportError.textContent = "";
    }
  }

  function syncRemoteImportProviderSwitch() {
    const provider = elements.editorRemoteProvider.value || "github";
    for (const option of elements.editorRemoteProviderOptions) {
      const optionProvider = option.dataset.remoteProviderOption || "";
      const availability = state.remoteProviderAvailability?.[optionProvider];
      const enabled = availability?.hasCredential ?? false;
      const selected = option.dataset.remoteProviderOption === provider;
      option.classList.toggle("active", selected);
      option.setAttribute("aria-checked", String(selected));
      option.tabIndex = enabled && selected ? 0 : -1;
      option.disabled = !enabled;
      option.setAttribute("aria-disabled", String(!enabled));
      option.classList.toggle("disabled", !enabled);
      option.title = enabled
        ? optionProviderLabel(optionProvider)
        : `${optionProviderLabel(optionProvider)} requires a configured credential`;
    }
    syncRemoteImportProviderHelp();
  }

  function setRemoteImportProvider(provider) {
    if (!isRemoteProviderEnabled(provider)) {
      return;
    }
    elements.editorRemoteProvider.value = provider;
    elements.editorRemoteUrl.placeholder = remoteUrlPlaceholder(provider);
    syncRemoteImportProviderSwitch();
  }

  function populateRemoteImportLaneOptions(defaultLaneId = null) {
    if (!state.boardDetail) {
      elements.editorRemoteLane.innerHTML = "";
      return;
    }
    const selectedLaneId = Number.isInteger(defaultLaneId) ? defaultLaneId : Number(elements.ticketLane.value || state.boardDetail.lanes[0]?.id);
    elements.editorRemoteLane.innerHTML = state.boardDetail.lanes
      .map((lane) => `<option value="${lane.id}" ${selectedLaneId === lane.id ? "selected" : ""}>${ctx.escapeHtml(lane.name)}</option>`)
      .join("");
  }

  function openRemoteImportSheet() {
    populateRemoteImportLaneOptions();
    setRemoteImportProvider(firstEnabledRemoteProvider());
    elements.editorRemoteUrl.value = "";
    elements.editorRemoteImportError.hidden = true;
    elements.editorRemoteImportError.textContent = "";
    state.editorRemoteImportOpen = true;
    syncRemoteImportSheet();
    queueMicrotask(() => elements.editorRemoteUrl.focus());
  }

  function remoteUrlPlaceholder(provider) {
    switch (provider) {
      case "gitlab":
        return "https://gitlab.example.com/group/project/-/issues/123";
      case "redmine":
        return "https://redmine.example.com/issues/123";
      case "github":
      default:
        return "https://github.com/owner/repo/issues/123";
    }
  }

  function handleRemoteImportProviderClick(event) {
    const option = event.target.closest("[data-remote-provider-option]");
    if (!(option instanceof HTMLElement)) {
      return;
    }
    if (option.disabled) {
      return;
    }
    setRemoteImportProvider(option.dataset.remoteProviderOption || "github");
    option.focus({ preventScroll: true });
  }

  function closeRemoteImportSheet() {
    if (elements.editorRemoteImportCancelButton.disabled || elements.editorRemoteImportCloseButton.disabled) {
      return;
    }
    state.editorRemoteImportOpen = false;
    syncRemoteImportSheet();
    queueMicrotask(() => elements.remoteImportCreateButton.focus({ preventScroll: true }));
  }

  async function submitRemoteImport(event) {
    event.preventDefault();
    if (!state.activeBoardId) {
      return;
    }
    const provider = elements.editorRemoteProvider.value.trim();
    const laneId = Number(elements.editorRemoteLane.value);
    const url = elements.editorRemoteUrl.value.trim();
    if (!provider || !Number.isInteger(laneId) || !url) {
      elements.editorRemoteImportError.hidden = false;
      elements.editorRemoteImportError.textContent = "Provider, lane, and issue URL are required";
      return;
    }
    if (!isRemoteProviderEnabled(provider)) {
      elements.editorRemoteImportError.hidden = false;
      elements.editorRemoteImportError.textContent = `${optionProviderLabel(provider)} requires a configured credential`;
      return;
    }
    elements.editorRemoteImportSubmitButton.disabled = true;
    elements.editorRemoteImportCancelButton.disabled = true;
    elements.editorRemoteImportCloseButton.disabled = true;
    try {
      const ticket = await ctx.sendJson(`/api/boards/${state.activeBoardId}/remote-import`, {
        method: "POST",
        body: { provider, laneId, url },
      });
      state.editorRemoteImportOpen = false;
      syncRemoteImportSheet();
      await ctx.refreshBoardDetail();
      await openEditor(ticket.id, "view");
      ctx.showToast("Remote issue imported");
    } catch (error) {
      elements.editorRemoteImportError.hidden = false;
      elements.editorRemoteImportError.textContent = error.message;
    } finally {
      elements.editorRemoteImportSubmitButton.disabled = DEFAULT_REMOTE_PROVIDER_ORDER.every((candidate) => !isRemoteProviderEnabled(candidate));
      elements.editorRemoteImportCancelButton.disabled = false;
      elements.editorRemoteImportCloseButton.disabled = false;
    }
  }

  function setEditBodyTab(tab = "local") {
    state.editorBodyTab = tab === "remote" && state.dialogTicket?.remote ? "remote" : "local";
    syncEditorBodyPresentation(state.dialogTicket);
  }

  function setDialogMode(mode) {
    if (mode === "edit" && state.dialogTicket) {
      hydrateEditorForm(state.dialogTicket);
    }
    state.dialogMode = mode;
    elements.editorDialog.classList.toggle("editor-create-mode", mode === "edit" && !state.editingTicketId);
    elements.editorDialog.classList.toggle("editor-edit-mode", mode === "edit" && Boolean(state.editingTicketId));
    elements.editorDialog.classList.toggle("editor-view-mode", mode === "view");
    elements.remoteImportCreateButton.hidden = mode !== "edit" || Boolean(state.editingTicketId);
    elements.ticketView.hidden = mode !== "view";
    elements.editorForm.hidden = mode !== "edit";
    elements.headerEditButton.hidden = mode !== "view" || !state.editingTicketId;
    elements.editorHeaderTitle.hidden = mode !== "view" || !state.editingTicketId;
    if (mode !== "view") {
      elements.editorHeaderState.hidden = true;
      elements.editorHeaderPriority.hidden = true;
    } else if (state.dialogTicket) {
      detailModule.syncEditorHeader(state.dialogTicket);
    }
    elements.archiveTicketButton.hidden = mode !== "edit" || !state.editingTicketId;
    elements.moveTicketButton.hidden = mode !== "edit" || !state.editingTicketId || state.boards.length < 2;
    elements.commentsTabButton.hidden = mode !== "view";
    elements.activityTabButton.hidden = mode !== "view";
    if (mode !== "edit") {
      tagPicker.closeOptions();
      relationsModule.closeOptions();
      state.editorRemoteImportOpen = false;
      syncRemoteImportSheet();
    } else {
      syncEditorBodyPresentation(state.dialogTicket);
      syncRemoteImportProviderSwitch();
      syncRemoteImportSheet();
    }
  }

  function resetDialogState() {
    state.editingTicketId = null;
    state.dialogMode = "view";
    state.editorTagIds = [];
    state.editorBlockerIds = [];
    state.editorChildIds = [];
    state.editorOriginalChildIds = [];
    state.dialogTicket = null;
    state.dialogActivity = [];
    state.detailBodyTab = "local";
    state.editorBodyTab = "local";
    state.editorRemoteImportOpen = false;
    state.tagQuery = "";
    state.parentQuery = "";
    state.blockerQuery = "";
    state.childQuery = "";
    detailModule.setDetailTab("comments");
    detailModule.setBodyTab("local");
    commentsModule.resetCommentComposer();
    setRemoteImportProvider(firstEnabledRemoteProvider());
    syncRemoteImportSheet();
  }

  function setRemoteProviderAvailability(remoteProviders) {
    state.remoteProviderAvailability = Object.fromEntries(
      (remoteProviders ?? []).map((provider) => [provider.id, provider]),
    );
    const nextProvider = isRemoteProviderEnabled(elements.editorRemoteProvider.value)
      ? elements.editorRemoteProvider.value
      : firstEnabledRemoteProvider();
    elements.editorRemoteProvider.value = nextProvider;
    elements.editorRemoteUrl.placeholder = remoteUrlPlaceholder(nextProvider);
    syncRemoteImportProviderSwitch();
  }

  function firstEnabledRemoteProvider() {
    return DEFAULT_REMOTE_PROVIDER_ORDER.find((provider) => isRemoteProviderEnabled(provider)) ?? DEFAULT_REMOTE_PROVIDER_ORDER[0];
  }

  function isRemoteProviderEnabled(provider) {
    return Boolean(state.remoteProviderAvailability?.[provider]?.hasCredential);
  }

  function syncRemoteImportProviderHelp() {
    const enabledProviders = DEFAULT_REMOTE_PROVIDER_ORDER.filter((provider) => isRemoteProviderEnabled(provider));
    elements.editorRemoteImportSubmitButton.disabled = enabledProviders.length === 0;
    if (enabledProviders.length === DEFAULT_REMOTE_PROVIDER_ORDER.length) {
      elements.editorRemoteProviderHelp.hidden = true;
      elements.editorRemoteProviderHelp.textContent = "";
      return;
    }
    elements.editorRemoteProviderHelp.hidden = false;
    elements.editorRemoteProviderHelp.textContent = enabledProviders.length
      ? "Configure KANBALONE_REMOTE_CREDENTIALS to enable additional providers."
      : "Configure KANBALONE_REMOTE_CREDENTIALS to enable remote import.";
  }

  function optionProviderLabel(provider) {
    switch (provider) {
      case "gitlab":
        return "GitLab";
      case "redmine":
        return "Redmine";
      case "github":
      default:
        return "GitHub";
    }
  }

  function handleEditorDialogClose() {
    const shouldSync = !state.skipDialogCloseSync && window.location.pathname.startsWith("/tickets/");
    resetDialogState();
    state.skipDialogCloseSync = false;
    if (shouldSync) {
      ctx.syncBoardUrl();
    }
    ctx.flushPendingBoardRefreshAfterDialogClose?.().catch((error) => {
      console.error(error);
    });
  }

  function closeEditor() {
    if (elements.editorDialog.open) {
      elements.editorDialog.close();
    }
    tagPicker.closeOptions();
    relationsModule.closeOptions();
    ctx.syncBoardUrl();
  }

  function hydrateDialogTicket(ticket, activity = []) {
    state.dialogTicket = ticket;
    detailModule.syncTicketDetail(ticket, activity);
    elements.ticketComments.innerHTML = commentsModule.renderComments(ticket.comments ?? []);
    hydrateEditorForm(ticket);
    detailModule.setDetailTab("comments");
    detailModule.setBodyTab("local");
  }

  function hydrateEditorForm(ticket) {
    elements.ticketTitle.value = ticket.title;
    elements.ticketPriority.value = getPriorityInputValue(ticket.priority);
    elements.ticketResolved.checked = ticket.isResolved;
    elements.ticketBody.value = ticket.bodyMarkdown;
    elements.ticketTitle.disabled = Boolean(ticket.remote);
    elements.ticketLane.value = String(ticket.laneId);
    elements.ticketParent.value = ticket.parentTicketId == null ? "" : String(ticket.parentTicketId);
    state.editorTagIds = ticket.tags.map((tag) => tag.id);
    state.editorBlockerIds = [...ticket.blockerIds];
    state.editorChildIds = ticket.children.map((child) => child.id);
    state.editorOriginalChildIds = [...state.editorChildIds];
    state.tagQuery = "";
    state.parentQuery = "";
    state.blockerQuery = "";
    state.childQuery = "";
    elements.ticketTagSearch.value = "";
    elements.ticketParentSearch.value = "";
    elements.ticketBlockerSearch.value = "";
    elements.ticketChildSearch.value = "";
    tagPicker.syncOptions();
    relationsModule.syncOptions();
    syncEditorBodyPresentation(ticket);
  }

  function syncEditorBodyPresentation(ticket) {
    const hasRemote = Boolean(ticket?.remote);
    if (!hasRemote) {
      state.editorBodyTab = "local";
    }
    const showRemoteBody = hasRemote && state.editorBodyTab === "remote";
    elements.ticketTitle.parentElement.hidden = hasRemote;
    elements.ticketTitleReadonly.hidden = !hasRemote;
    elements.ticketTitleReadonly.innerHTML = hasRemote
      ? `
        <div class="editor-readonly-label">Remote Title</div>
        <div class="editor-readonly-value">${ctx.escapeHtml(ticket.title)}</div>
      `
      : "";
    elements.ticketEditBodyTabs.hidden = !hasRemote;
    elements.ticketEditLocalBodyTabButton.classList.toggle("active", !showRemoteBody);
    elements.ticketEditLocalBodyTabButton.setAttribute("aria-selected", String(!showRemoteBody));
    elements.ticketEditRemoteBodyTabButton.classList.toggle("active", showRemoteBody);
    elements.ticketEditRemoteBodyTabButton.setAttribute("aria-selected", String(showRemoteBody));
    elements.ticketBody.hidden = showRemoteBody;
    elements.ticketRemoteBodyPanel.hidden = !showRemoteBody;
    elements.ticketRemoteBodyPanel.innerHTML = showRemoteBody
      ? renderRemoteBodyPanel(ticket.remote?.bodyHtml ?? "")
      : "";
  }

  function renderRemoteBodyPanel(bodyHtml) {
    if (!bodyHtml) {
      return '<p class="muted">No remote body snapshot.</p>';
    }
    return `<div class="markdown ticket-remote-body-rendered">${bodyHtml}</div>`;
  }

  async function refreshDialogTicket(ticketId = state.editingTicketId) {
    if (!ticketId) {
      return null;
    }
    const [ticket, activityPayload] = await Promise.all([
      ctx.api(`/api/tickets/${ticketId}`),
      ctx.api(`/api/tickets/${ticketId}/activity`).catch(() => ({ activity: [] })),
    ]);
    hydrateDialogTicket(ticket, activityPayload.activity ?? []);
    ctx.syncDialogScrollLock?.();
    return ticket;
  }

  async function updateDialogTicket(patch, savedMessage = "Saved") {
    if (!state.editingTicketId) {
      return null;
    }
    setSaveState("saving", "Saving...");
    try {
      const updated = await ctx.sendJson(`/api/tickets/${state.editingTicketId}`, {
        method: "PATCH",
        body: patch,
      });
      await refreshDialogTicket(state.editingTicketId);
      await ctx.refreshBoardDetail();
      setSaveState("saved", savedMessage);
      return updated;
    } catch (error) {
      setSaveState("error", "Save failed");
      throw error;
    }
  }

  async function openEditor(ticketId = null, mode = "edit", defaultLaneId = null) {
    if (!state.boardDetail) {
      return;
    }
    state.editingTicketId = ticketId;
    const ticket = ticketId ? await ctx.api(`/api/tickets/${ticketId}`) : null;
    const activity = ticketId ? ((await ctx.api(`/api/tickets/${ticketId}/activity`).catch(() => ({ activity: [] }))).activity ?? []) : [];
    state.dialogTicket = ticket;
    state.dialogActivity = activity;
    state.detailBodyTab = "local";
    state.editorBodyTab = "local";
    elements.ticketTitle.value = ticket?.title ?? "";
    elements.ticketPriority.value = getPriorityInputValue(ticket?.priority);
    elements.ticketResolved.checked = ticket?.isResolved ?? false;
    elements.ticketBody.value = ticket?.bodyMarkdown ?? "";
    elements.ticketTitle.disabled = Boolean(ticket?.remote);
    detailModule.syncTicketDetail(ticket, activity);
    elements.ticketComments.innerHTML = commentsModule.renderComments(ticket?.comments ?? []);
    elements.commentBody.value = "";
    commentsModule.resetCommentComposer();
    const selectedLaneId = ticket?.laneId ?? defaultLaneId;
    elements.ticketLane.innerHTML = state.boardDetail.lanes
      .map((lane) => `<option value="${lane.id}" ${selectedLaneId === lane.id ? "selected" : ""}>${ctx.escapeHtml(lane.name)}</option>`)
      .join("");
    elements.ticketParent.value = ticket?.parentTicketId == null ? "" : String(ticket.parentTicketId);
    elements.deleteTicketButton.hidden = !ticketId;
    elements.ticketResolvedRow.hidden = !ticketId;
    elements.archiveTicketButton.hidden = !ticketId;
    if (!ticketId && defaultLaneId != null) {
      elements.ticketLane.value = String(defaultLaneId);
    }
    state.editorTagIds = ticket?.tags.map((entry) => entry.id) ?? [];
    state.editorBlockerIds = ticket?.blockerIds ?? [];
    state.editorChildIds = ticket?.children.map((entry) => entry.id) ?? [];
    state.editorOriginalChildIds = [...state.editorChildIds];
    state.tagQuery = "";
    state.parentQuery = "";
    state.blockerQuery = "";
    state.childQuery = "";
    elements.ticketTagSearch.value = "";
    elements.ticketParentSearch.value = "";
    elements.ticketBlockerSearch.value = "";
    elements.ticketChildSearch.value = "";
    elements.ticketChildrenRow.hidden = !ticketId;
    populateRemoteImportLaneOptions(ticket?.laneId ?? defaultLaneId);
    clearSaveState();
    commentsModule.clearCommentState();
    tagPicker.syncOptions();
    relationsModule.syncOptions();
    syncEditorBodyPresentation(ticket);
    setDialogMode(ticketId ? mode : "edit");
    detailModule.setDetailTab("comments");
    detailModule.setBodyTab("local");
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    ctx.prepareEditorDialogPosition?.(scrollY);
    state.editorIgnoreOutsideClickUntil = performance.now() + 100;
    if (!elements.editorDialog.open) {
      elements.editorDialog.show();
    }
    window.scrollTo(scrollX, scrollY);
    ctx.syncDialogScrollLock?.();
    ctx.ensureEditorDialogPosition?.();
    ctx.syncDialogScrollLock?.();
    if (ticketId && mode === "view") {
      queueMicrotask(() => elements.headerEditButton.focus({ preventScroll: true }));
    }
    if (ticketId) {
      ctx.syncTicketUrl(ticketId);
    }
  }

  function handleDocumentClick(event) {
    if (!elements.editorDialog.open) {
      return;
    }
    if (state.editorIgnoreOutsideClickUntil) {
      if (event.timeStamp <= state.editorIgnoreOutsideClickUntil) {
        return;
      }
      state.editorIgnoreOutsideClickUntil = 0;
    }
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    const eventPath = event.composedPath?.() ?? [];
    if (elements.uxDialog.contains(target) || eventPath.includes(elements.uxDialog)) {
      return;
    }
    if (tagPicker.handleOptionClick(event)) {
      return;
    }
    if (relationsModule.handleOptionClick(event)) {
      return;
    }
    if (
      elements.ticketTagToggle.contains(target) ||
      elements.ticketTagOptions.contains(target) ||
      relationsModule.containsTarget(target)
    ) {
      return;
    }
    tagPicker.closeOptions();
    relationsModule.closeOptions();
    if (
      state.editorRemoteImportOpen &&
      (elements.editorDialog.contains(target) || eventPath.includes(elements.editorDialog)) &&
      !elements.editorRemoteImportSheet.contains(target) &&
      !eventPath.includes(elements.editorRemoteImportSheet) &&
      !elements.remoteImportCreateButton.contains(target)
    ) {
      closeRemoteImportSheet();
      return;
    }
    if (!elements.uxDialog.open && !elements.editorDialog.contains(target) && !eventPath.includes(elements.editorDialog)) {
      closeEditor();
    }
  }

  return {
    addComment: commentsModule.addComment,
    closeEditor,
    deleteTicket,
    moveTicketToBoard,
    handleCommentAction: commentsModule.handleCommentAction,
    toggleCommentComposer: commentsModule.toggleCommentComposer,
    handleBlockerFieldClick: relationsModule.handleBlockerFieldClick,
    handleBlockerSearchInput: relationsModule.handleBlockerSearchInput,
    handleBlockerSearchKeydown: relationsModule.handleBlockerSearchKeydown,
    handleChildFieldClick: relationsModule.handleChildFieldClick,
    handleChildSearchInput: relationsModule.handleChildSearchInput,
    handleChildSearchKeydown: relationsModule.handleChildSearchKeydown,
    handleDocumentClick,
    handleDetailChange: detailModule.handleDetailChange,
    handleDetailClick: detailModule.handleDetailClick,
    handleDetailFocusout: detailModule.handleDetailFocusout,
    handleDetailKeydown: detailModule.handleDetailKeydown,
    handleEditorDialogClose,
    handleParentChange: relationsModule.handleParentChange,
    handleParentFieldClick: relationsModule.handleParentFieldClick,
    handleParentSearchInput: relationsModule.handleParentSearchInput,
    handleParentSearchKeydown: relationsModule.handleParentSearchKeydown,
    handleRemoteImportProviderClick,
    handleTicketTagSearchInput: tagPicker.handleSearchInput,
    handleTicketTagSearchKeydown: tagPicker.handleSearchKeydown,
    handleTicketTagFieldClick: tagPicker.handleFieldClick,
    openBlockerOptions: relationsModule.openBlockerOptions,
    openChildOptions: relationsModule.openChildOptions,
    openEditor,
    openParentOptions: relationsModule.openParentOptions,
    openTicketTagOptions: tagPicker.openOptions,
    saveTicket,
    submitRemoteImport,
    setRemoteProviderAvailability,
    setEditBodyTab,
    setDetailTab: detailModule.setDetailTab,
    setDialogMode,
    openRemoteImportSheet,
    closeRemoteImportSheet,
    syncTicketTagOptions: tagPicker.syncOptions,
    toggleTicketArchive,
  };
}
