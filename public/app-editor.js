import { createTicketActionsModule } from "./app-ticket-actions.js";
import { createTicketCommentsModule } from "./app-ticket-comments.js";
import { createTicketDetailModule } from "./app-ticket-detail.js";
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
    saveTicket,
    setSaveState,
    toggleTicketArchive,
  } = actionsModule;

  const commentsModule = createTicketCommentsModule({
    ...ctx,
    refreshDialogTicket,
    setSaveState,
  });

  function setDialogMode(mode) {
    state.dialogMode = mode;
    elements.editorDialog.classList.toggle("editor-create-mode", mode === "edit" && !state.editingTicketId);
    elements.editorDialog.classList.toggle("editor-edit-mode", mode === "edit" && Boolean(state.editingTicketId));
    elements.editorDialog.classList.toggle("editor-view-mode", mode === "view");
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
    elements.commentsTabButton.hidden = mode !== "view";
    elements.activityTabButton.hidden = mode !== "view";
    if (mode !== "edit") {
      tagPicker.closeOptions();
      relationsModule.closeOptions();
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
    state.tagQuery = "";
    state.parentQuery = "";
    state.blockerQuery = "";
    state.childQuery = "";
    detailModule.setDetailTab("comments");
  }

  function handleEditorDialogClose() {
    const shouldSync = !state.skipDialogCloseSync && window.location.pathname.startsWith("/tickets/");
    resetDialogState();
    state.skipDialogCloseSync = false;
    if (shouldSync) {
      ctx.syncBoardUrl();
    }
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
    elements.ticketTitle.value = ticket.title;
    elements.ticketPriority.value = getPriorityInputValue(ticket.priority);
    elements.ticketResolved.checked = ticket.isResolved;
    elements.ticketBody.value = ticket.bodyMarkdown;
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
    detailModule.setDetailTab("comments");
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

  async function openEditor(ticketId = null, mode = "edit", defaultLaneId = null) {
    if (!state.boardDetail) {
      return;
    }
    state.editingTicketId = ticketId;
    const ticket = ticketId ? await ctx.api(`/api/tickets/${ticketId}`) : null;
    const activity = ticketId ? ((await ctx.api(`/api/tickets/${ticketId}/activity`).catch(() => ({ activity: [] }))).activity ?? []) : [];
    elements.ticketTitle.value = ticket?.title ?? "";
    elements.ticketPriority.value = getPriorityInputValue(ticket?.priority);
    elements.ticketResolved.checked = ticket?.isResolved ?? false;
    elements.ticketBody.value = ticket?.bodyMarkdown ?? "";
    detailModule.syncTicketDetail(ticket, activity);
    elements.ticketComments.innerHTML = commentsModule.renderComments(ticket?.comments ?? []);
    elements.commentBody.value = "";
    const selectedLaneId = ticket?.laneId ?? defaultLaneId;
    elements.ticketLane.innerHTML = state.boardDetail.lanes
      .map((lane) => `<option value="${lane.id}" ${selectedLaneId === lane.id ? "selected" : ""}>${ctx.escapeHtml(lane.name)}</option>`)
      .join("");
    elements.ticketParent.value = ticket?.parentTicketId == null ? "" : String(ticket.parentTicketId);
    elements.deleteTicketButton.hidden = !ticketId;
    elements.commentForm.hidden = !ticketId;
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
    clearSaveState();
    commentsModule.clearCommentState();
    tagPicker.syncOptions();
    relationsModule.syncOptions();
    setDialogMode(ticketId ? mode : "edit");
    detailModule.setDetailTab("comments");
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    ctx.prepareEditorDialogPosition?.(scrollY);
    state.editorIgnoreOutsideClickUntil = performance.now() + 100;
    elements.editorDialog.show();
    window.scrollTo(scrollX, scrollY);
    ctx.syncDialogScrollLock?.();
    ctx.ensureEditorDialogPosition?.();
    ctx.syncDialogScrollLock?.();
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
    if (!elements.uxDialog.open && !elements.editorDialog.contains(target) && !eventPath.includes(elements.editorDialog)) {
      closeEditor();
    }
  }

  return {
    addComment: commentsModule.addComment,
    closeEditor,
    createTagFromEditor: tagPicker.createTagFromEditor,
    deleteTicket,
    handleCommentAction: commentsModule.handleCommentAction,
    handleBlockerFieldClick: relationsModule.handleBlockerFieldClick,
    handleBlockerSearchInput: relationsModule.handleBlockerSearchInput,
    handleBlockerSearchKeydown: relationsModule.handleBlockerSearchKeydown,
    handleChildFieldClick: relationsModule.handleChildFieldClick,
    handleChildSearchInput: relationsModule.handleChildSearchInput,
    handleChildSearchKeydown: relationsModule.handleChildSearchKeydown,
    handleDocumentClick,
    handleEditorDialogClose,
    handleParentChange: relationsModule.handleParentChange,
    handleParentFieldClick: relationsModule.handleParentFieldClick,
    handleParentSearchInput: relationsModule.handleParentSearchInput,
    handleParentSearchKeydown: relationsModule.handleParentSearchKeydown,
    handleTicketTagSearchInput: tagPicker.handleSearchInput,
    handleTicketTagSearchKeydown: tagPicker.handleSearchKeydown,
    handleTicketTagFieldClick: tagPicker.handleFieldClick,
    openBlockerOptions: relationsModule.openBlockerOptions,
    openChildOptions: relationsModule.openChildOptions,
    openEditor,
    openParentOptions: relationsModule.openParentOptions,
    openTicketTagOptions: tagPicker.openOptions,
    saveTicket,
    setDetailTab: detailModule.setDetailTab,
    setDialogMode,
    syncTicketTagOptions: tagPicker.syncOptions,
    toggleTicketArchive,
  };
}
