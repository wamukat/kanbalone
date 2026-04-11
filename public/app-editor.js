import { icon } from "./icons.js";
import { createTicketCommentsModule } from "./app-ticket-comments.js";
import { createTicketDetailModule } from "./app-ticket-detail.js";
import { createTicketRelationPicker } from "./app-ticket-relation-picker.js";
import { createTicketTagPicker } from "./app-ticket-tag-picker.js";

export function createEditorModule(ctx) {
  const { state, elements } = ctx;
  let saveStateTimer = null;

  function getSelectedTagIds() {
    return [...state.editorTagIds];
  }

  function getBoardTickets() {
    return state.boardTickets ?? [];
  }

  function getTicketById(ticketId) {
    return getBoardTickets().find((ticket) => ticket.id === ticketId) ?? null;
  }

  function hasChildOnBoard(ticketId) {
    return getBoardTickets().some((ticket) => ticket.parentTicketId === ticketId);
  }

  function getBlockingTickets(ticketId) {
    return getBoardTickets().filter((ticket) => ticket.id !== ticketId && ticket.blockerIds.includes(ticketId));
  }

  function formatTicketChoice(ticket) {
    return `#${ticket.id} ${ticket.title}`;
  }

  function matchTicketQuery(ticket, query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return true;
    }
    const idText = String(ticket.id);
    const hashText = `#${ticket.id}`;
    return idText.includes(normalized) || hashText.includes(normalized) || ticket.title.toLowerCase().includes(normalized);
  }

  function renderTicketSummaryChip(ticket, removeAttr) {
    return `<button type="button" class="ticket-tag-chip ticket-ref-chip" ${removeAttr}="${ticket.id}" title="Remove ${ctx.escapeHtml(formatTicketChoice(ticket))}"><span class="ticket-ref-chip-id">#${ticket.id}</span><span class="ticket-ref-chip-text">${ctx.escapeHtml(ticket.title)}</span>${icon("x")}</button>`;
  }

  function renderTicketOption(ticket, attrName, isSelected) {
    const meta = ticket.isCompleted ? '<span class="ticket-picker-meta">Done</span>' : "";
    return `
      <button type="button" class="tag-picker-item ${isSelected ? "selected" : ""}" ${attrName}="${ticket.id}" role="option" aria-selected="${isSelected}">
        <span class="ticket-picker-id">#${ticket.id}</span>
        <span class="tag-picker-text">${ctx.escapeHtml(ticket.title)}</span>
        ${meta}
      </button>
    `;
  }

  function getAvailableBlockerTickets() {
    const currentId = state.editingTicketId;
    return getBoardTickets()
      .filter((ticket) => ticket.id !== currentId)
      .filter((ticket) => currentId == null || !ticket.blockerIds.includes(currentId))
      .sort((a, b) => b.priority - a.priority || a.id - b.id);
  }

  function getSelectedParentId() {
    return elements.ticketParent.value ? Number(elements.ticketParent.value) : null;
  }

  function getAvailableParentTickets() {
    return getBoardTickets()
      .filter((ticket) => ticket.id !== state.editingTicketId)
      .filter((ticket) => ticket.parentTicketId == null)
      .sort((a, b) => b.priority - a.priority || a.id - b.id);
  }

  function setParent(ticketId) {
    elements.ticketParent.value = ticketId == null ? "" : String(ticketId);
    state.parentQuery = "";
    elements.ticketParentSearch.value = "";
    parentPicker.syncOptions();
    handleParentChange();
    parentPicker.openOptions();
    elements.ticketParentSearch.focus();
  }

  function toggleBlocker(ticketId) {
    if (state.editorBlockerIds.includes(ticketId)) {
      state.editorBlockerIds = state.editorBlockerIds.filter((id) => id !== ticketId);
    } else {
      state.editorBlockerIds = [...state.editorBlockerIds, ticketId];
    }
    state.blockerQuery = "";
    elements.ticketBlockerSearch.value = "";
    blockerPicker.syncOptions();
    blockerPicker.openOptions();
    elements.ticketBlockerSearch.focus();
  }

  function getAvailableChildTickets() {
    if (!state.editingTicketId || getSelectedParentId() != null) {
      return [];
    }
    return getBoardTickets()
      .filter((ticket) => ticket.id !== state.editingTicketId)
      .filter((ticket) => state.editorChildIds.includes(ticket.id) || (ticket.parentTicketId == null && !hasChildOnBoard(ticket.id)))
      .sort((a, b) => b.priority - a.priority || a.id - b.id);
  }

  function syncChildPickerAvailability() {
    const canEditChildren = Boolean(state.editingTicketId) && getSelectedParentId() == null;
    elements.ticketChildrenRow.hidden = !state.editingTicketId;
    elements.ticketChildSearch.disabled = !canEditChildren;
    elements.ticketChildToggle.classList.toggle("is-disabled", !canEditChildren);
    if (!canEditChildren) {
      childPicker.closeOptions();
      if (getSelectedParentId() != null) {
        state.editorChildIds = [];
      }
    }
  }

  function toggleChild(ticketId) {
    if (state.editorChildIds.includes(ticketId)) {
      state.editorChildIds = state.editorChildIds.filter((id) => id !== ticketId);
    } else {
      state.editorChildIds = [...state.editorChildIds, ticketId];
    }
    state.childQuery = "";
    elements.ticketChildSearch.value = "";
    childPicker.syncOptions();
    childPicker.openOptions();
    elements.ticketChildSearch.focus();
  }

  function handleParentChange() {
    syncChildPickerAvailability();
    childPicker.syncOptions();
  }

  let parentPicker;
  let blockerPicker;
  let childPicker;

  const tagPicker = createTicketTagPicker({
    ...ctx,
    closePeerOptions: () => {
      parentPicker.closeOptions();
      blockerPicker.closeOptions();
      childPicker.closeOptions();
    },
  });

  const relationPickerContext = {
    escapeHtml: ctx.escapeHtml,
    getTicketById,
    matchTicketQuery,
    renderOption: renderTicketOption,
    renderSummaryChip: renderTicketSummaryChip,
  };

  parentPicker = createTicketRelationPicker({
    ...relationPickerContext,
    optionAttr: "data-parent-id",
    removeAttr: "data-remove-parent-id",
    elements: {
      toggle: elements.ticketParentToggle,
      summary: elements.ticketParentSummary,
      search: elements.ticketParentSearch,
      options: elements.ticketParentOptions,
    },
    closePeerOptions: () => {
      tagPicker.closeOptions();
      blockerPicker.closeOptions();
      childPicker.closeOptions();
    },
    getAvailableTickets: getAvailableParentTickets,
    getPlaceholder: () => "",
    getQuery: () => state.parentQuery,
    getSelectedTicketIds: () => {
      const selectedParentId = getSelectedParentId();
      return selectedParentId == null ? [] : [selectedParentId];
    },
    removeTicket: () => setParent(null),
    selectTicket: setParent,
    setQuery: (value) => {
      state.parentQuery = value;
    },
  });

  blockerPicker = createTicketRelationPicker({
    ...relationPickerContext,
    optionAttr: "data-blocker-id",
    removeAttr: "data-remove-blocker-id",
    elements: {
      toggle: elements.ticketBlockerToggle,
      summary: elements.ticketBlockerSummary,
      search: elements.ticketBlockerSearch,
      options: elements.ticketBlockerOptions,
    },
    closePeerOptions: () => {
      tagPicker.closeOptions();
      parentPicker.closeOptions();
      childPicker.closeOptions();
    },
    getAvailableTickets: getAvailableBlockerTickets,
    getPlaceholder: () => "",
    getQuery: () => state.blockerQuery,
    getSelectedTicketIds: () => [...state.editorBlockerIds],
    removeTicket: toggleBlocker,
    selectTicket: toggleBlocker,
    setQuery: (value) => {
      state.blockerQuery = value;
    },
  });

  childPicker = createTicketRelationPicker({
    ...relationPickerContext,
    optionAttr: "data-child-id",
    removeAttr: "data-remove-child-id",
    elements: {
      toggle: elements.ticketChildToggle,
      summary: elements.ticketChildSummary,
      search: elements.ticketChildSearch,
      options: elements.ticketChildOptions,
    },
    canOpen: () => Boolean(state.editingTicketId) && getSelectedParentId() == null,
    closePeerOptions: () => {
      tagPicker.closeOptions();
      parentPicker.closeOptions();
      blockerPicker.closeOptions();
    },
    getAvailableTickets: getAvailableChildTickets,
    getPlaceholder: () => (state.editingTicketId ? (getSelectedParentId() != null ? "Clear parent to edit children" : "") : "Save ticket first"),
    getQuery: () => state.childQuery,
    getSelectedTicketIds: () => [...state.editorChildIds],
    getUnavailableMessage: () => (!state.editingTicketId || getSelectedParentId() != null ? "Children cannot be edited while this ticket has a parent" : ""),
    removeTicket: toggleChild,
    selectTicket: toggleChild,
    setQuery: (value) => {
      state.childQuery = value;
    },
  });

  const detailModule = createTicketDetailModule({
    ...ctx,
    getBlockingTickets,
  });

  const commentsModule = createTicketCommentsModule({
    ...ctx,
    refreshDialogTicket,
    setSaveState,
  });

  function setDialogMode(mode) {
    state.dialogMode = mode;
    elements.ticketView.hidden = mode !== "view";
    elements.editorForm.hidden = mode !== "edit";
    elements.headerEditButton.hidden = mode !== "view" || !state.editingTicketId;
    elements.editorHeaderTitle.hidden = mode !== "view" || !state.editingTicketId;
    elements.archiveTicketButton.hidden = mode !== "edit" || !state.editingTicketId;
    elements.commentsTabButton.hidden = mode !== "view";
    elements.activityTabButton.hidden = mode !== "view";
    if (mode !== "edit") {
      parentPicker.closeOptions();
      tagPicker.closeOptions();
      blockerPicker.closeOptions();
      childPicker.closeOptions();
    }
  }

  function resetDialogState() {
    state.editingTicketId = null;
    state.dialogMode = "view";
    state.editorTagIds = [];
    state.editorBlockerIds = [];
    state.editorChildIds = [];
    state.editorOriginalChildIds = [];
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
    parentPicker.closeOptions();
    tagPicker.closeOptions();
    blockerPicker.closeOptions();
    childPicker.closeOptions();
    ctx.syncBoardUrl();
  }

  function hydrateDialogTicket(ticket, activity = []) {
    detailModule.syncTicketDetail(ticket, activity);
    elements.ticketComments.innerHTML = commentsModule.renderComments(ticket.comments ?? []);
    elements.ticketTitle.value = ticket.title;
    elements.ticketPriority.value = String(ticket.priority ?? 0);
    elements.ticketCompleted.checked = ticket.isCompleted;
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
    parentPicker.syncOptions();
    tagPicker.syncOptions();
    blockerPicker.syncOptions();
    syncChildPickerAvailability();
    childPicker.syncOptions();
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
    elements.ticketPriority.value = String(ticket?.priority ?? 0);
    elements.ticketCompleted.checked = ticket?.isCompleted ?? false;
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
    elements.ticketCompletedRow.hidden = !ticketId;
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
    parentPicker.syncOptions();
    tagPicker.syncOptions();
    blockerPicker.syncOptions();
    syncChildPickerAvailability();
    childPicker.syncOptions();
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

  async function saveTicket(event) {
    event.preventDefault();
    if (!state.activeBoardId) {
      return;
    }
    const tagIds = getSelectedTagIds();
    const blockerIds = [...state.editorBlockerIds];
    const nextParentTicketId = elements.ticketParent.value ? Number(elements.ticketParent.value) : null;
    const payload = {
      title: elements.ticketTitle.value.trim(),
      laneId: Number(elements.ticketLane.value),
      parentTicketId: nextParentTicketId,
      priority: Number(elements.ticketPriority.value || 0),
      isCompleted: elements.ticketCompleted.checked,
      bodyMarkdown: elements.ticketBody.value,
      tagIds,
      blockerIds,
    };
    const endpoint = state.editingTicketId
      ? `/api/tickets/${state.editingTicketId}`
      : `/api/boards/${state.activeBoardId}/tickets`;
    const method = state.editingTicketId ? "PATCH" : "POST";
    const editingTicketId = state.editingTicketId;
    try {
      if (editingTicketId && nextParentTicketId != null && state.editorOriginalChildIds.length > 0) {
        for (const childId of state.editorOriginalChildIds) {
          await ctx.sendJson(`/api/tickets/${childId}`, {
            method: "PATCH",
            body: { parentTicketId: null },
          });
        }
      }
      setSaveState("saving", "Saving...");
      const savedTicket = await ctx.api(endpoint, {
        method,
        body: JSON.stringify(payload),
      });
      if (editingTicketId) {
        if (nextParentTicketId == null) {
          const originalChildIds = new Set(state.editorOriginalChildIds);
          const nextChildIds = new Set(state.editorChildIds);
          for (const childId of state.editorOriginalChildIds) {
            if (!nextChildIds.has(childId)) {
              await ctx.sendJson(`/api/tickets/${childId}`, {
                method: "PATCH",
                body: { parentTicketId: null },
              });
            }
          }
          for (const childId of state.editorChildIds) {
            if (!originalChildIds.has(childId)) {
              await ctx.sendJson(`/api/tickets/${childId}`, {
                method: "PATCH",
                body: { parentTicketId: editingTicketId },
              });
            }
          }
        }
        await refreshDialogTicket(editingTicketId);
        state.editorOriginalChildIds = [...state.editorChildIds];
        setDialogMode("view");
        setSaveState("saved", "Saved");
      } else {
        closeEditor();
        ctx.showToast("Saved");
      }
      await ctx.refreshBoardDetail();
      return savedTicket;
    } catch (error) {
      setSaveState("error", "Save failed");
      ctx.showToast(error.message, "error");
      return null;
    }
  }

  async function toggleTicketArchive() {
    if (!state.editingTicketId) {
      return;
    }
    try {
      const current = await ctx.api(`/api/tickets/${state.editingTicketId}`);
      setSaveState("saving", current.isArchived ? "Restoring..." : "Archiving...");
      await ctx.sendJson(`/api/tickets/${state.editingTicketId}`, {
        method: "PATCH",
        body: { isArchived: !current.isArchived },
      });
      await ctx.refreshBoardDetail();
      if (!current.isArchived && state.filters.archived !== "all") {
        closeEditor();
        ctx.showToast("Archived");
        return;
      }
      await refreshDialogTicket(state.editingTicketId);
      setSaveState("saved", current.isArchived ? "Restored" : "Archived");
    } catch (error) {
      setSaveState("error", "Save failed");
      ctx.showToast(error.message, "error");
    }
  }

  function clearSaveState() {
    if (saveStateTimer) {
      window.clearTimeout(saveStateTimer);
      saveStateTimer = null;
    }
    elements.editorSaveState.hidden = true;
    elements.editorSaveState.textContent = "";
    elements.editorSaveState.dataset.kind = "";
  }

  function setSaveState(kind, message) {
    if (saveStateTimer) {
      window.clearTimeout(saveStateTimer);
      saveStateTimer = null;
    }
    elements.editorSaveState.hidden = false;
    elements.editorSaveState.dataset.kind = kind;
    elements.editorSaveState.textContent = message;
    if (kind === "saved") {
      saveStateTimer = window.setTimeout(() => {
        if (elements.editorSaveState.dataset.kind === "saved") {
          clearSaveState();
        }
      }, 1400);
    }
  }

  async function deleteTicket() {
    if (!state.editingTicketId) {
      return;
    }
    const ticketId = state.editingTicketId;
    await ctx.confirmAndRun({
      title: "Delete Ticket",
      message: "Delete this ticket?",
      submitLabel: "Delete",
      run: async () => {
        await ctx.api(`/api/tickets/${ticketId}`, { method: "DELETE" });
        closeEditor();
        await ctx.refreshBoardDetail();
      },
    });
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
    if (blockerPicker.handleOptionClick(event)) {
      return;
    }
    if (childPicker.handleOptionClick(event)) {
      return;
    }
    if (parentPicker.handleOptionClick(event)) {
      return;
    }
    if (
      elements.ticketParentToggle.contains(target) ||
      elements.ticketParentOptions.contains(target) ||
      elements.ticketTagToggle.contains(target) ||
      elements.ticketTagOptions.contains(target) ||
      elements.ticketBlockerToggle.contains(target) ||
      elements.ticketBlockerOptions.contains(target) ||
      elements.ticketChildToggle.contains(target) ||
      elements.ticketChildOptions.contains(target)
    ) {
      return;
    }
    parentPicker.closeOptions();
    tagPicker.closeOptions();
    blockerPicker.closeOptions();
    childPicker.closeOptions();
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
    handleBlockerFieldClick: blockerPicker.handleFieldClick,
    handleBlockerSearchInput: blockerPicker.handleSearchInput,
    handleBlockerSearchKeydown: blockerPicker.handleSearchKeydown,
    handleChildFieldClick: childPicker.handleFieldClick,
    handleChildSearchInput: childPicker.handleSearchInput,
    handleChildSearchKeydown: childPicker.handleSearchKeydown,
    handleDocumentClick,
    handleEditorDialogClose,
    handleParentChange,
    handleParentFieldClick: parentPicker.handleFieldClick,
    handleParentSearchInput: parentPicker.handleSearchInput,
    handleParentSearchKeydown: parentPicker.handleSearchKeydown,
    handleTicketTagSearchInput: tagPicker.handleSearchInput,
    handleTicketTagSearchKeydown: tagPicker.handleSearchKeydown,
    handleTicketTagFieldClick: tagPicker.handleFieldClick,
    openBlockerOptions: blockerPicker.openOptions,
    openChildOptions: childPicker.openOptions,
    openEditor,
    openParentOptions: parentPicker.openOptions,
    openTicketTagOptions: tagPicker.openOptions,
    saveTicket,
    setDetailTab: detailModule.setDetailTab,
    setDialogMode,
    syncTicketTagOptions: tagPicker.syncOptions,
    toggleTicketArchive,
  };
}
