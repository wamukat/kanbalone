import { t } from "./app-i18n.js";
import { createTicketActionsModule } from "./app-ticket-actions.js";
import { createTicketCommentsModule } from "./app-ticket-comments.js";
import { createTicketDetailModule } from "./app-ticket-detail.js";
import { createTicketVisitModule } from "./app-ticket-visit.js";
import { createEditorRemoteImportModule } from "./app-editor-remote-import.js";
import { createImageAttachments } from "./app-image-attachments.js";
import { createTicketRelationsModule } from "./app-ticket-relations.js";
import { createTicketTasks } from "./app-ticket-tasks.js";
import { createTicketTagPicker } from "./app-ticket-tag-picker.js";
import { getPriorityInputValue } from "./app-priority.js";

export function createEditorModule(ctx) {
  const { state, elements } = ctx;

  function getSelectedTagIds() {
    return [...state.editorTagIds];
  }

  let relationsModule;
  let savedForm = "";
  let discardPending = null;
  let editorOriginVersion;
  let editorOpenGeneration = 0;
  let dialogSession = 0;
  let activityRequest = 0;
  let dialogBoardId = null;
  let compositionTarget = null;
  const imageAttachments = createImageAttachments(ctx.api, ctx.showToast);
  const isDialogCurrent = () => elements.editorDialog.open && state.activeBoardId === dialogBoardId;
  const isComposing = (event) => event.isComposing || event.keyCode === 229 || event.target === compositionTarget;
  const isSaveShortcut = (event) => !event.defaultPrevented && !isComposing(event)
    && !elements.uxDialog.open && event.key === "Enter" && (event.ctrlKey || event.metaKey)
    && !event.altKey && !event.shiftKey;

  imageAttachments.bind(elements.ticketBody, () => isDialogCurrent() && state.dialogMode === "edit");

  function formSnapshot() {
    return JSON.stringify([
      elements.ticketTitle.value, elements.ticketBody.value, elements.ticketPriority.value,
      elements.ticketLane.value, elements.ticketParent.value,
      ...[state.editorTagIds, state.editorBlockerIds, state.editorRelatedIds, state.editorChildIds]
        .map((ids) => [...ids].sort((a, b) => a - b)),
      [...state.editorTagDraftNames].sort(),
    ]);
  }

  function hasUnsavedChanges() {
    if (!elements.editorDialog.open) return false;
    return imageAttachments.hasPending() || (state.dialogMode === "edit" && savedForm !== formSnapshot())
      || detailModule.hasUnsavedBody() || commentsModule.hasUnsavedComments() || tasksModule.hasUnsaved();
  }

  async function confirmDiscardChanges() {
    if (state.editorSaving || commentsModule.isSaving() || tasksModule.isSaving()) {
      ctx.showToast(t("Please wait until saving finishes"));
      return false;
    }
    if (!hasUnsavedChanges()) return true;
    if (discardPending) return discardPending;
    const focused = document.activeElement;
    const selection = focused instanceof HTMLTextAreaElement || (focused instanceof HTMLInputElement && focused.selectionStart !== null)
      ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
    discardPending = ctx.confirmAndRun({
      title: t("Discard changes?"),
      message: t("Your unsaved changes will be lost."),
      submitLabel: t("Discard changes"),
      run: async () => {},
    });
    try {
      const discard = await discardPending;
      if (!discard && focused instanceof HTMLElement && focused.isConnected && elements.editorDialog.contains(focused)) {
        focused.focus({ preventScroll: true });
        if (selection) focused.setSelectionRange(...selection);
      }
      return discard;
    } finally { discardPending = null; }
  }

  async function requestCloseEditor() {
    if (await confirmDiscardChanges()) closeEditor();
  }

  async function cancelEditorEdit() {
    if (!await confirmDiscardChanges()) return;
    if (state.editingTicketId) setDialogMode("view");
    else closeEditor();
  }


  const tagPicker = createTicketTagPicker({
    ...ctx,
    closePeerOptions: () => {
      relationsModule?.closeOptions();
    },
  });

  relationsModule = createTicketRelationsModule(ctx, { tagPicker });

  const detailModule = createTicketDetailModule({
    ...ctx,
    confirmDiscardChanges,
    refreshDialogTicket,
    updateDialogTicket,
    imageAttachments,
    isDialogCurrent,
    isComposing,
    isSaveShortcut,
  });

  const visitModule = createTicketVisitModule({
    dialog: elements.editorDialog,
    normal: elements.ticketView,
    api: ctx.api,
    escapeHtml: ctx.escapeHtml,
    showActivity: detailModule.openVisitActivity,
    refreshNormal: () => refreshDialogTicket(state.editingTicketId, null, { onlyIfPristine: true }).catch(() => null),
  });

  function openVisit() {
    const ticketId = state.editingTicketId;
    const boardId = state.activeBoardId;
    if (!ticketId || !elements.editorDialog.open || state.dialogMode !== "view") return;
    void visitModule.open(ticketId, boardId, () => isDialogCurrent() && state.editingTicketId === ticketId);
  }

  function restoreActionFocus(preferred) {
    if (!elements.editorDialog.open && ctx.restoreEditorOrigin?.(editorOriginVersion)) return;
    const visible = (element) => element instanceof HTMLElement
      && element.getClientRects().length > 0
      && !element.closest("[hidden], [inert]")
      && !element.hasAttribute("disabled")
      && getComputedStyle(element).visibility !== "hidden";
    // Do not take focus away if the user moved to another visible control.
    if (document.activeElement !== document.body && visible(document.activeElement)) return;
    const candidates = elements.editorDialog.open
      ? [state.dialogMode === "view" ? elements.headerEditButton : preferred, elements.ticketBody]
      : [elements.searchInput, document.querySelector('[data-group-action="add"]'), elements.sidebarReopenButton, elements.sidebarToggleButton];
    const target = candidates.find(visible);
    target?.focus({ preventScroll: true });
  }

  const actionsModule = createTicketActionsModule(ctx, {
    captureDialogScope,
    confirmDiscardChanges,
    closeEditor,
    getSelectedTagIds,
    canSaveBody: () => imageAttachments.canSave(elements.ticketBody),
    restoreActionFocus,
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
    imageAttachments,
    isDialogCurrent,
    captureDialogScope,
  });

  const tasksModule = createTicketTasks(elements.ticketTasks, {
    api: ctx.api,
    sendJson: ctx.sendJson,
    escapeHtml: ctx.escapeHtml,
    confirmAndRun: ctx.confirmAndRun,
    captureDialogScope,
    isSaveShortcut,
    imageAttachments,
    onSaved: async (ticketId) => {
      const isCurrent = captureDialogScope();
      const request = ++activityRequest;
      await Promise.all([
        ctx.refreshBoardDetail(),
        ctx.api(`/api/tickets/${ticketId}/activity?compact=true`).catch(() => ({ activity: null })).then((payload) => {
          if (isCurrent() && request === activityRequest) detailModule.syncActivity(payload.activity ?? null);
        }),
      ]);
    },
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
    if (mode !== state.dialogMode) dialogSession++;
    if (mode === "edit" && state.dialogTicket) {
      tasksModule.reset();
      commentsModule.discardDrafts();
      detailModule.resetInlineEdit();
      hydrateEditorForm(state.dialogTicket);
    }
    state.dialogMode = mode;
    elements.editorDialog.classList.toggle("editor-create-mode", mode === "edit" && !state.editingTicketId);
    elements.editorDialog.classList.toggle("editor-edit-mode", mode === "edit" && Boolean(state.editingTicketId));
    elements.editorDialog.classList.toggle("editor-view-mode", mode === "view");
    elements.remoteImportCreateButton.hidden = mode !== "edit" || Boolean(state.editingTicketId) || !hasEnabledRemoteProvider();
    visitModule.setViewing(mode === "view" && Boolean(state.editingTicketId));
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
      state.editorTagDraftNames = [];
      imageAttachments.reset(elements.ticketBody);
      tagPicker.closeOptions();
      relationsModule.closeOptions();
      state.editorRemoteImportOpen = false;
      syncRemoteImportSheet();
    } else {
      syncEditorBodyPresentation(state.dialogTicket);
      syncRemoteImportProviderSwitch();
      syncRemoteImportSheet();
    }
    if (mode === "view" && state.editingTicketId && isDialogCurrent()) {
      tasksModule.open(state.editingTicketId);
      openVisit();
    }
  }

  // Board and custom-view routes can share the same board ID and view mode.
  // Revoke requests across that boundary before replacing the editor's owner.
  function invalidateOpening() {
    editorOpenGeneration++;
  }

  function resetDialogState() {
    dialogSession++;
    dialogBoardId = null;
    visitModule.setViewing(false);
    visitModule.reset();
    detailModule.clearActivityInterval();
    imageAttachments.reset(elements.ticketBody);
    detailModule.resetInlineEdit();
    commentsModule.resetImageUploads();
    tasksModule.reset();
    relationsModule.resetCandidates();
    compositionTarget = null;
    invalidateOpening();
    state.editingTicketId = null;
    state.dialogMode = "view";
    state.editorTagIds = [];
    state.editorTagDraftNames = [];
    state.editorBlockerIds = [];
    state.editorRelatedIds = [];
    state.editorChildIds = [];
    state.editorOriginalChildIds = [];
    state.editorEditToken = null;
    state.editorSelectedParents = {};
    state.editorCreateGroup = null;
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

  async function handleEditorDialogClose() {
    if (elements.editorDialog.open) return;
    const originVersion = editorOriginVersion;
    // A new ticket save restores focus after its explicit board refresh.
    const restoreAfterSave = state.editorSaving && state.editingTicketId === null;
    const shouldSync = !state.skipDialogCloseSync && window.location.pathname.startsWith("/tickets/");
    resetDialogState();
    state.skipDialogCloseSync = false;
    if (shouldSync) {
      ctx.syncBoardUrl();
    }
    try { await ctx.flushPendingBoardRefreshAfterDialogClose?.(); }
    catch (error) { console.error(error); }
    if (!restoreAfterSave) ctx.restoreEditorOrigin?.(originVersion);
  }

  function closeEditor() {
    visitModule.setViewing(false);
    visitModule.reset();
    detailModule.clearActivityInterval();
    imageAttachments.reset(elements.ticketBody);
    commentsModule.resetImageUploads();
    tasksModule.reset();
    detailModule.resetInlineEdit();
    relationsModule.resetCandidates();
    if (elements.editorDialog.open) {
      elements.editorDialog.close();
    }
    tagPicker.closeOptions();
    relationsModule.closeOptions();
    ctx.syncBoardUrl();
  }

  function hydrateDialogTicket(ticket, activity = [], events = [], preserveTabs = false) {
    relationsModule.resetCandidates(ticket);
    state.dialogTicket = ticket;
    state.dialogActivity = activity;
    state.dialogEvents = events;
    detailModule.syncTicketDetail(ticket, activity, events);
    commentsModule.syncComments(ticket.comments ?? []);
    if (state.dialogMode !== "edit" || state.editorSaving) hydrateEditorForm(ticket);
    if (!preserveTabs) {
      detailModule.setDetailTab("comments");
      detailModule.setBodyTab("local");
    }
  }

  function hydrateEditorForm(ticket) {
    imageAttachments.reset(elements.ticketBody);
    elements.ticketTitle.value = ticket.title;
    elements.ticketPriority.value = getPriorityInputValue(ticket.priority);
    elements.ticketBody.value = ticket.bodyMarkdown;
    elements.ticketTitle.disabled = Boolean(ticket.remote);
    elements.ticketLane.value = String(ticket.laneId);
    elements.ticketParent.value = ticket.parentTicketId == null ? "" : String(ticket.parentTicketId);
    state.editorTagIds = ticket.tags.map((tag) => tag.id);
    state.editorTagDraftNames = [];
    state.editorBlockerIds = [...ticket.blockerIds];
    state.editorRelatedIds = [...ticket.relatedIds];
    state.editorChildIds = ticket.children.map((child) => child.id);
    state.editorOriginalChildIds = [...state.editorChildIds];
    state.editorEditToken = ticket?.editToken;
    state.editorSelectedParents = {};
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
    savedForm = formSnapshot();
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
        <div class="editor-readonly-label">${t("Remote Title")}</div>
        <div class="editor-readonly-value">${ctx.escapeHtml(ticket.title)}</div>
      `
      : "";
    elements.ticketEditBodyTabs.hidden = !hasRemote;
    elements.ticketEditLocalBodyTabButton.classList.toggle("active", !showRemoteBody);
    elements.ticketEditLocalBodyTabButton.setAttribute("aria-selected", String(!showRemoteBody));
    elements.ticketEditRemoteBodyTabButton.classList.toggle("active", showRemoteBody);
    elements.ticketEditRemoteBodyTabButton.setAttribute("aria-selected", String(showRemoteBody));
    elements.ticketBody.hidden = showRemoteBody;
    imageAttachments.setHidden(elements.ticketBody, showRemoteBody);
    elements.ticketRemoteBodyPanel.hidden = !showRemoteBody;
    elements.ticketRemoteBodyPanel.innerHTML = showRemoteBody
      ? renderRemoteBodyPanel(ticket.remote?.bodyHtml ?? "")
      : "";
  }

  function renderRemoteBodyPanel(bodyHtml) {
    if (!bodyHtml) {
      return `<p class="muted">${t("No remote body snapshot.")}</p>`;
    }
    return `<div class="markdown ticket-remote-body-rendered">${bodyHtml}</div>`;
  }

  function captureDialogScope() {
    const session = dialogSession;
    const boardId = state.activeBoardId;
    const ticketId = state.editingTicketId;
    return () => elements.editorDialog.open && session === dialogSession
      && boardId === state.activeBoardId && ticketId === state.editingTicketId;
  }

  async function refreshDialogTicket(ticketId = state.editingTicketId, savedTicket = null, { onlyIfPristine = false } = {}) {
    if (!ticketId || ticketId !== state.editingTicketId) {
      return null;
    }
    const isBusy = () => {
      if (!onlyIfPristine) return false;
      const active = document.activeElement;
      const selection = document.getSelection();
      const selecting = selection && !selection.isCollapsed &&
        (elements.ticketView.contains(selection.anchorNode) || elements.ticketView.contains(selection.focusNode));
      return state.dialogMode !== "view" || state.editorSaving || commentsModule.isSaving() || tasksModule.isSaving()
        || hasUnsavedChanges() || selecting || elements.ticketView.contains(active)
        || elements.ticketView.querySelector(".inline-action-menu.expanded")
        || elements.editorDialog.contains(active) && active.matches("input, textarea, select, [contenteditable='true']");
    };
    if (isBusy()) return null;
    const isCurrent = captureDialogScope();
    const request = ++activityRequest;
    const [ticket, activityPayload, eventsPayload] = await Promise.all([
      savedTicket ?? ctx.api(`/api/tickets/${ticketId}`),
      ctx.api(`/api/tickets/${ticketId}/activity?compact=true`).catch(() => ({ activity: null })),
      ctx.api(`/api/tickets/${ticketId}/events`).catch(() => ({ events: [] })),
    ]);
    if (!isCurrent() || isBusy()) return null;
    if (ticket.boardId !== state.activeBoardId) throw new Error(t("Ticket moved to a different board. Reopen it from the updated list."));
    if (savedTicket && state.boardDetail?.board.id === ticket.boardId) {
      // The committed payload may have tags that the board refresh has not loaded yet.
      const tagsById = new Map(state.boardDetail.tags.map((tag) => [tag.id, tag]));
      for (const tag of ticket.tags) {
        if (tag.boardId === ticket.boardId) tagsById.set(tag.id, tag);
      }
      state.boardDetail.tags = [...tagsById.values()];
    }
    dialogBoardId = ticket.boardId;
    const activity = request === activityRequest ? activityPayload.activity ?? null : state.dialogActivity;
    hydrateDialogTicket(ticket, activity, eventsPayload.events ?? [], onlyIfPristine);
    ctx.syncDialogScrollLock?.();
    return ticket;
  }

  async function updateDialogTicket(patch, savedMessage = t("Saved")) {
    if (!state.editingTicketId || state.editorSaving) {
      return null;
    }
    state.editorSaving = true;
    const inlineInputs = [...elements.editorDialog.querySelectorAll("[data-detail-body-input], [data-detail-title-input]")];
    for (const input of inlineInputs) input.readOnly = true;
    setSaveState("saving", t("Saving..."));
    try {
      const updated = await ctx.sendJson(`/api/tickets/${state.editingTicketId}`, {
        method: "PATCH",
        body: patch,
      });
      detailModule.resetInlineEdit();
      await refreshDialogTicket(state.editingTicketId);
      await ctx.refreshBoardDetail();
      setSaveState("saved", savedMessage);
      return updated;
    } catch (error) {
      setSaveState("error", t("Save failed"));
      throw error;
    } finally {
      for (const input of elements.editorDialog.querySelectorAll("[data-detail-body-input], [data-detail-title-input]")) input.readOnly = false;
      state.editorSaving = false;
    }
  }

  async function openEditor(ticketId = null, mode = "edit", defaultLaneId = null, creationGroup = null, stillOpening = () => true) {
    if (!state.boardDetail || state.editorSaving) {
      return;
    }
    // Keep the current ticket's selected relations if opening another ticket fails.
    relationsModule.resetCandidates(state.dialogTicket);
    const request = ++editorOpenGeneration;
    const boardId = state.activeBoardId;
    const viewMode = state.viewMode;
    const originVersion = ctx.captureEditorOrigin?.();
    const isCurrent = () => stillOpening() && request === editorOpenGeneration && boardId === state.activeBoardId && viewMode === state.viewMode
      && (!creationGroup || ctx.isActiveGroup(creationGroup.id));
    const [ticket, activityPayload, eventsPayload] = ticketId
      ? await Promise.all([
        ctx.api(`/api/tickets/${ticketId}`),
        ctx.api(`/api/tickets/${ticketId}/activity?compact=true`).catch(() => ({ activity: null })),
        ctx.api(`/api/tickets/${ticketId}/events`).catch(() => ({ events: [] })),
      ])
      : [null, { activity: [] }, { events: [] }];
    if (!isCurrent()) return;
    if (ticket && ticket.boardId !== boardId) throw new Error(t("Ticket moved to a different board. Reopen it from the updated list."));
    editorOriginVersion = originVersion;
    dialogSession++;
    visitModule.setViewing(false);
    visitModule.reset();
    detailModule.clearActivityInterval();
    tasksModule.reset();
    compositionTarget = null;
    dialogBoardId = boardId;
    imageAttachments.reset(elements.ticketBody);
    commentsModule.resetImageUploads();
    detailModule.resetInlineEdit();
    state.editingTicketId = ticketId;
    state.editorCreateGroup = ticketId ? null : creationGroup;
    relationsModule.resetCandidates(ticket);

    const activity = activityPayload.activity ?? null;
    const events = eventsPayload.events ?? [];
    state.dialogTicket = ticket;
    state.dialogActivity = activity;
    state.dialogEvents = events;
    state.detailBodyTab = "local";
    state.editorBodyTab = "local";
    elements.ticketTitle.value = ticket?.title ?? "";
    elements.ticketPriority.value = getPriorityInputValue(ticket?.priority);
    elements.ticketBody.value = ticket?.bodyMarkdown ?? "";
    elements.ticketTitle.disabled = Boolean(ticket?.remote);
    detailModule.syncTicketDetail(ticket, activity, events);
    commentsModule.syncComments(ticket?.comments ?? [], { preserveEdits: false });
    commentsModule.resetCommentComposer();
    const selectedLaneId = ticket?.laneId ?? defaultLaneId;
    elements.ticketLane.innerHTML = state.boardDetail.lanes
      .map((lane) => `<option value="${lane.id}" ${selectedLaneId === lane.id ? "selected" : ""}>${ctx.escapeHtml(lane.name)}</option>`)
      .join("");
    elements.ticketParent.value = ticket?.parentTicketId == null ? "" : String(ticket.parentTicketId);
    elements.deleteTicketButton.hidden = !ticketId;
    elements.archiveTicketButton.hidden = !ticketId;
    if (!ticketId && defaultLaneId != null) {
      elements.ticketLane.value = String(defaultLaneId);
    }
    state.editorTagIds = ticket?.tags.map((entry) => entry.id) ?? [];
    state.editorTagDraftNames = [];
    state.editorBlockerIds = ticket?.blockerIds ?? [];
    state.editorRelatedIds = ticket?.relatedIds ?? [];
    state.editorChildIds = ticket?.children.map((entry) => entry.id) ?? [];
    state.editorOriginalChildIds = [...state.editorChildIds];
    state.editorEditToken = ticket?.editToken;
    state.editorSelectedParents = {};
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
    syncCreationContext();
    populateRemoteImportLaneOptions(ticket?.laneId ?? defaultLaneId);
    clearSaveState();
    commentsModule.clearCommentState();
    tagPicker.syncOptions();
    relationsModule.syncOptions();
    syncEditorBodyPresentation(ticket);
    setDialogMode(ticketId ? mode : "edit");
    savedForm = formSnapshot();
    detailModule.setDetailTab("comments");
    detailModule.setBodyTab("local");
    ctx.prepareEditorDialogPosition?.();
    if (!elements.editorDialog.open) {
      elements.editorDialog.showModal();
    }
    ctx.syncDialogScrollLock?.();
    elements.editorDialog.querySelector(".editor-scroll").scrollTop = 0;
    if (ticketId && mode === "view") {
      tasksModule.open(ticketId);
      openVisit();
      queueMicrotask(() => elements.headerEditButton.focus({ preventScroll: true }));
    } else if (!ticketId) {
      queueMicrotask(() => {
        if (isCurrent() && elements.editorDialog.open && !state.editingTicketId) elements.ticketTitle.focus({ preventScroll: true });
      });
    }
    if (ticketId) {
      ctx.syncTicketUrl(ticketId);
    }
  }

  function syncCreationContext() {
    const context = elements.editorForm.querySelector('.editor-group-context');
    const creating = !state.editingTicketId;
    if (context) {
      const lane = state.boardDetail?.lanes.find((lane) => lane.id === Number(elements.ticketLane.value));
      context.hidden = !creating;
      context.textContent = creating ? [state.boardDetail?.board.name,
        state.editorCreateGroup ? t('Group: {name}', { name: state.editorCreateGroup.name }) : '',
        lane?.isCompletionLane ? t('Tickets in this lane are resolved') : '',
      ].filter(Boolean).join(' · ') : '';
    }
  }

  elements.ticketLane.addEventListener('change', syncCreationContext);
  elements.editorDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (compositionTarget) return;
    if (state.editorRemoteImportOpen) closeRemoteImportSheet();
    else requestCloseEditor();
  });
  elements.editorDialog.addEventListener("compositionstart", (event) => { compositionTarget = event.target; });
  function clearComposition(event) {
    if (event.target === compositionTarget) compositionTarget = null;
  }
  elements.editorDialog.addEventListener("compositionend", clearComposition);
  elements.editorDialog.addEventListener("focusout", clearComposition);

  elements.editorForm.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || isComposing(event) || elements.uxDialog.open
        || state.dialogMode !== "edit" || !isDialogCurrent()) return;
    if (isSaveShortcut(event)) {
      event.preventDefault();
      if (!event.repeat && !state.editorSaving) elements.editorForm.requestSubmit();
    } else if (!state.editingTicketId && event.key === "Enter" && event.target === elements.ticketTitle) {
      // Enter confirms text; creating a ticket uses the explicit save action.
      event.preventDefault();
    }
  });

  elements.commentBody.addEventListener("keydown", (event) => {
    if (state.dialogMode !== "view" || !isDialogCurrent() || elements.commentForm.hidden
        || elements.commentsSection.hidden || !isSaveShortcut(event)) return;
    event.preventDefault();
    if (!event.repeat && !elements.saveCommentButton.disabled) elements.commentForm.requestSubmit();
  });

  function handleDocumentClick(event) {
    if (!elements.editorDialog.open) {
      return;
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
  }

  return {
    invalidateOpening,
    hasUnsavedChanges,
    confirmDiscardChanges,
    requestCloseEditor,
    cancelEditorEdit,
    refreshTicketTasks: tasksModule.refresh,
    checkTicketVisitUpdate: visitModule.scheduleUpdateCheck,
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
