import { createTicketActionsModule } from "./app-ticket-actions.js";
import { createTicketCommentsModule } from "./app-ticket-comments.js";
import { createTicketDetailModule } from "./app-ticket-detail.js";
import { createEditorRemoteImportModule } from "./app-editor-remote-import.js";
import { createTicketRelationsModule } from "./app-ticket-relations.js";
import { createTicketTagPicker } from "./app-ticket-tag-picker.js";
import { getPriorityInputValue } from "./app-priority.js";

export function createEditorModule(ctx) {
  const { state, elements } = ctx;

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
    refreshDialogTicket,
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

  const remoteImportModule = createEditorRemoteImportModule(ctx, {
    openImportedTicket: (ticketId) => openEditor(ticketId, "view"),
  });

  const {
    closeSheet: closeRemoteImportSheet,
    handleBacklinkToggle: handleRemoteBacklinkToggle,
    handleInputChange: handleRemoteImportInputChange,
    handleProviderClick: handleRemoteImportProviderClick,
    hasEnabledProvider: hasEnabledRemoteProvider,
    openSheet: openRemoteImportSheet,
    populateLaneOptions: populateRemoteImportLaneOptions,
    preview: previewRemoteImport,
    resetProvider: resetRemoteImportProvider,
    setProviderAvailability: setRemoteProviderAvailability,
    submit: submitRemoteImport,
    syncProviderSwitch: syncRemoteImportProviderSwitch,
    syncSheet: syncRemoteImportSheet,
  } = remoteImportModule;

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
    elements.remoteImportCreateButton.hidden = mode !== "edit" || Boolean(state.editingTicketId) || !hasEnabledRemoteProvider();
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
    state.editorRelatedIds = [];
    state.editorChildIds = [];
    state.editorOriginalChildIds = [];
    state.editorVisibleRelationTypes = [];
    state.dialogTicket = null;
    state.dialogActivity = [];
    state.dialogEvents = [];
    state.detailBodyTab = "local";
    state.editorBodyTab = "local";
    state.editorRemoteImportOpen = false;
    state.tagQuery = "";
    state.parentQuery = "";
    state.blockerQuery = "";
    state.relatedQuery = "";
    state.childQuery = "";
    detailModule.setDetailTab("comments");
    detailModule.setBodyTab("local");
    commentsModule.resetCommentComposer();
    resetRemoteImportProvider();
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

  function hydrateDialogTicket(ticket, activity = [], events = []) {
    state.dialogTicket = ticket;
    state.dialogActivity = activity;
    state.dialogEvents = events;
    detailModule.syncTicketDetail(ticket, activity, events);
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
    state.editorRelatedIds = [...ticket.relatedIds];
    state.editorChildIds = ticket.children.map((child) => child.id);
    state.editorOriginalChildIds = [...state.editorChildIds];
    state.editorVisibleRelationTypes = relationsModule.getActiveRelationTypes();
    state.tagQuery = "";
    state.parentQuery = "";
    state.blockerQuery = "";
    state.relatedQuery = "";
    state.childQuery = "";
    elements.ticketTagSearch.value = "";
    elements.ticketParentSearch.value = "";
    elements.ticketBlockerSearch.value = "";
    elements.ticketRelatedSearch.value = "";
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
    const [ticket, activityPayload, eventsPayload] = await Promise.all([
      ctx.api(`/api/tickets/${ticketId}`),
      ctx.api(`/api/tickets/${ticketId}/activity`).catch(() => ({ activity: [] })),
      ctx.api(`/api/tickets/${ticketId}/events`).catch(() => ({ events: [] })),
    ]);
    hydrateDialogTicket(ticket, activityPayload.activity ?? [], eventsPayload.events ?? []);
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
    const [ticket, activityPayload, eventsPayload] = ticketId
      ? await Promise.all([
        ctx.api(`/api/tickets/${ticketId}`),
        ctx.api(`/api/tickets/${ticketId}/activity`).catch(() => ({ activity: [] })),
        ctx.api(`/api/tickets/${ticketId}/events`).catch(() => ({ events: [] })),
      ])
      : [null, { activity: [] }, { events: [] }];
    const activity = activityPayload.activity ?? [];
    const events = eventsPayload.events ?? [];
    state.dialogTicket = ticket;
    state.dialogActivity = activity;
    state.dialogEvents = events;
    state.detailBodyTab = "local";
    state.editorBodyTab = "local";
    elements.ticketTitle.value = ticket?.title ?? "";
    elements.ticketPriority.value = getPriorityInputValue(ticket?.priority);
    elements.ticketResolved.checked = ticket?.isResolved ?? false;
    elements.ticketBody.value = ticket?.bodyMarkdown ?? "";
    elements.ticketTitle.disabled = Boolean(ticket?.remote);
    detailModule.syncTicketDetail(ticket, activity, events);
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
    state.editorRelatedIds = ticket?.relatedIds ?? [];
    state.editorChildIds = ticket?.children.map((entry) => entry.id) ?? [];
    state.editorOriginalChildIds = [...state.editorChildIds];
    state.editorVisibleRelationTypes = relationsModule.getActiveRelationTypes(ticket);
    state.tagQuery = "";
    state.parentQuery = "";
    state.blockerQuery = "";
    state.relatedQuery = "";
    state.childQuery = "";
    elements.ticketTagSearch.value = "";
    elements.ticketParentSearch.value = "";
    elements.ticketBlockerSearch.value = "";
    elements.ticketRelatedSearch.value = "";
    elements.ticketChildSearch.value = "";
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
    handleRelatedFieldClick: relationsModule.handleRelatedFieldClick,
    handleRelatedSearchInput: relationsModule.handleRelatedSearchInput,
    handleRelatedSearchKeydown: relationsModule.handleRelatedSearchKeydown,
    handleDocumentClick,
    handleDetailChange: detailModule.handleDetailChange,
    handleDetailClick: detailModule.handleDetailClick,
    handleDetailFocusout: detailModule.handleDetailFocusout,
    handleDetailKeydown: detailModule.handleDetailKeydown,
    handleEditorDialogClose,
    handleAddRelation: relationsModule.handleAddRelation,
    handleAddRelationTypeClick: relationsModule.handleAddRelationTypeClick,
    handleParentChange: relationsModule.handleParentChange,
    handleParentFieldClick: relationsModule.handleParentFieldClick,
    handleParentSearchInput: relationsModule.handleParentSearchInput,
    handleParentSearchKeydown: relationsModule.handleParentSearchKeydown,
    handleRemoteBacklinkToggle,
    handleRemoteImportProviderClick,
    handleRemoteImportInputChange,
    handleTicketTagSearchInput: tagPicker.handleSearchInput,
    handleTicketTagSearchKeydown: tagPicker.handleSearchKeydown,
    handleTicketTagFieldClick: tagPicker.handleFieldClick,
    openBlockerOptions: relationsModule.openBlockerOptions,
    openChildOptions: relationsModule.openChildOptions,
    openRelatedOptions: relationsModule.openRelatedOptions,
    openEditor,
    openParentOptions: relationsModule.openParentOptions,
    openTicketTagOptions: tagPicker.openOptions,
    previewRemoteImport,
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
