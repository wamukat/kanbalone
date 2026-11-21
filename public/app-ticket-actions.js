import { t } from "./app-i18n.js";
import { chooseGroupResolution } from "./app-group-conflict.js";

export function createTicketActionsModule(ctx, options) {
  const { state, elements } = ctx;
  let saveStateTimer = null;

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

  async function saveTicket(event) {
    event.preventDefault();
    if (!state.activeBoardId || state.editorSaving) {
      return;
    }
    const tagIds = options.getSelectedTagIds();
    const blockerIds = [...state.editorBlockerIds];
    const relatedIds = [...state.editorRelatedIds];
    const nextParentTicketId = elements.ticketParent.value ? Number(elements.ticketParent.value) : null;
    const payload = {
      title: state.editingTicketId && state.dialogTicket?.remote ? undefined : elements.ticketTitle.value.trim(),
      laneId: Number(elements.ticketLane.value),
      parentTicketId: nextParentTicketId,
      priority: Number(elements.ticketPriority.value || 0),
      bodyMarkdown: elements.ticketBody.value,
      tagIds,
      blockerIds,
      relatedIds,
    };
    const endpoint = state.editingTicketId
      ? `/api/tickets/${state.editingTicketId}`
      : `/api/boards/${state.activeBoardId}/tickets`;
    const method = state.editingTicketId ? "PATCH" : "POST";
    const editingTicketId = state.editingTicketId;
    const creationGroup = state.editorCreateGroup;
    if (editingTicketId) {
      payload.childTicketIds = nextParentTicketId == null ? [...state.editorChildIds] : [];
      payload.expectedEditToken = state.editorEditToken;
      payload.expectedSelectedParents = payload.childTicketIds.filter(id => !state.editorOriginalChildIds.includes(id)).map(id => ({ ticketId: id, parentTicketId: state.editorSelectedParents?.[id] ?? null }));
    } else if (creationGroup) {
      payload.groupId = creationGroup.id;
    }
    state.editorSaving = true;
    const wasInert = elements.editorForm.inert;
    elements.editorForm.inert = true;
    try {
      setSaveState("saving", t("Saving..."));
      if (editingTicketId || nextParentTicketId != null || creationGroup) {
        const preview = await ctx.sendJson(editingTicketId ? `${endpoint}/change-preview` : `${endpoint}/preview`, { method: "POST", body: payload });
        const resolution = await chooseGroupResolution(ctx, preview);
        if (resolution === null) { clearSaveState(); return null; }
        if (resolution) payload.groupResolution = resolution;
        payload.expectedToken = preview.expectedToken;
      }
      const savedTicket = await ctx.api(endpoint, { method, body: JSON.stringify(payload) });
      if (editingTicketId) {
        await options.refreshDialogTicket(editingTicketId);
        options.setDialogMode("view");
        setSaveState("saved", t("Saved"));
      } else {
        options.closeEditor();
        ctx.showToast(t("Ticket created"));
      }
      await ctx.refreshBoardDetail();
      if (!editingTicketId) await ctx.onTicketCreated?.(savedTicket.boardId);
      if (!editingTicketId && creationGroup && savedTicket.groupId != null && savedTicket.groupId !== creationGroup.id) await ctx.openGroup?.(savedTicket.groupId);
      return savedTicket;
    } catch (error) {
      setSaveState("error", t("Save failed"));
      ctx.showToast(error.message, "error");
      return null;
    } finally {
      elements.editorForm.inert = wasInert;
      state.editorSaving = false;
    }
  }

  async function toggleTicketArchive() {
    if (!state.editingTicketId || state.editorSaving) {
      return;
    }
    const ticketId = state.editingTicketId;
    if (!await options.confirmDiscardChanges() || state.editingTicketId !== ticketId || state.editorSaving) return;
    state.editorSaving = true;
    const wasInert = elements.editorForm.inert;
    elements.editorForm.inert = true;
    try {
      const current = await ctx.api(`/api/tickets/${ticketId}`);
      setSaveState("saving", current.isArchived ? t("Restoring...") : t("Archiving..."));
      await ctx.sendJson(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        body: { isArchived: !current.isArchived },
      });
      await ctx.refreshBoardDetail();
      if (!current.isArchived && !state.filters.includeArchived) {
        options.closeEditor();
        ctx.showToast(t("Archived"));
        return;
      }
      await options.refreshDialogTicket(ticketId);
      options.setDialogMode("view");
      setSaveState("saved", current.isArchived ? t("Restored") : t("Archived"));
    } catch (error) {
      setSaveState("error", t("Save failed"));
      ctx.showToast(error.message, "error");
    } finally {
      elements.editorForm.inert = wasInert;
      state.editorSaving = false;
    }
  }

  async function deleteTicket() {
    if (!state.editingTicketId) {
      return;
    }
    const ticketId = state.editingTicketId;
    const ticketTitle = state.dialogTicket?.title ?? `#${ticketId}`;
    await ctx.confirmAndRun({
      title: t("Delete Ticket"),
      message: t('Delete ticket "{title}"?', { title: ticketTitle }),
      details: [
        t("Ticket #{id}", { id: ticketId }),
        t("Comments and relations on this ticket"),
        t("The ticket will disappear from Kanban and List views"),
      ],
      warning: t("This action cannot be undone."),
      submitLabel: t("Delete"),
      run: async () => {
        await ctx.api(`/api/tickets/${ticketId}`, { method: "DELETE" });
        options.closeEditor();
        await ctx.refreshBoardDetail();
      },
    });
  }

  async function moveTicketToBoard() {
    if (!state.editingTicketId || !state.dialogTicket || state.editorSaving) {
      return;
    }
    const ticketId = state.editingTicketId;
    const sourceBoardId = state.dialogTicket.boardId;
    const sourceLane = state.boardDetail?.lanes.find((lane) => lane.id === state.dialogTicket.laneId);
    const isCurrentEditor = () => elements.editorDialog.open && state.editingTicketId === ticketId
      && state.dialogTicket?.boardId === sourceBoardId && !state.editorSaving;
    if (!isCurrentEditor()) return;
    const targetBoards = state.boards.filter((board) => board.id !== sourceBoardId);
    if (targetBoards.length === 0) {
      ctx.showToast(t("Create another board before moving tickets"), "error");
      return;
    }

    const initialBoardId = targetBoards[0].id;
    let initialBoard;
    try {
      initialBoard = await ctx.api(`/api/boards/${initialBoardId}`);
    } catch (error) {
      if (isCurrentEditor()) ctx.showToast(error.message, "error");
      return;
    }
    if (!isCurrentEditor() || !await options.confirmDiscardChanges() || !isCurrentEditor()) return;
    const initialLaneId = getDefaultTargetLaneId(initialBoard.lanes, sourceLane?.name);
    const dialogPromise = ctx.openFormDialog({
      title: t("Move Ticket"),
      message: t("Move this ticket to another board. Matching tag names will be kept. Group membership will be cleared. Parent, child, and blocker links outside the destination board will be cleared."),
      fields: renderMoveFields(state.boards, sourceBoardId, initialBoard.lanes, initialLaneId),
      submitLabel: t("Move"),
    });
    const boardSelect = elements.uxFields.querySelector("[data-move-board]");
    const laneSelect = elements.uxFields.querySelector("[data-move-lane]");
    let requestId = 0;
    let dialogOpen = true;
    elements.uxSubmitButton.disabled = initialBoard.lanes.length === 0;
    boardSelect?.addEventListener("change", async () => {
      const currentRequest = ++requestId;
      laneSelect.disabled = true;
      laneSelect.innerHTML = `<option value="">${t("Loading lanes...")}</option>`;
      elements.uxSubmitButton.disabled = true;
      try {
        const board = await ctx.api(`/api/boards/${Number(boardSelect.value)}`);
        if (!dialogOpen || currentRequest !== requestId) return;
        laneSelect.innerHTML = renderLaneOptions(board.lanes, getDefaultTargetLaneId(board.lanes, sourceLane?.name));
        laneSelect.disabled = board.lanes.length === 0;
        elements.uxSubmitButton.disabled = board.lanes.length === 0;
      } catch (error) {
        if (!dialogOpen || currentRequest !== requestId) return;
        laneSelect.innerHTML = `<option value="">${t("Could not load lanes")}</option>`;
        ctx.showToast(error.message, "error");
      }
    });

    const confirmed = await dialogPromise;
    dialogOpen = false;
    elements.uxSubmitButton.disabled = false;
    if (!confirmed || !isCurrentEditor()) {
      return;
    }

    const boardId = Number(boardSelect?.value);
    const laneId = Number(laneSelect?.value);
    if (!Number.isInteger(boardId) || boardId <= 0 || !Number.isInteger(laneId) || laneId <= 0 || laneSelect.disabled) {
      ctx.showToast(t("Choose a destination board and lane"), "error");
      return;
    }

    let moved = null;
    state.editorSaving = true;
    const wasInert = elements.editorForm.inert;
    elements.editorForm.inert = true;
    try {
      setSaveState("saving", t("Moving..."));
      moved = await ctx.sendJson(`/api/tickets/${ticketId}/move`, {
        method: "POST",
        body: { boardId, laneId },
      });
      state.activeBoardId = moved.boardId;
      await ctx.refreshBoardDetail();
      elements.ticketLane.innerHTML = renderLaneOptions(state.boardDetail.lanes, moved.laneId);
      await options.refreshDialogTicket(moved.id);
      ctx.syncTicketUrl(moved.id);
      setSaveState("saved", t("Moved"));
      ctx.showToast(t("Ticket moved"));
    } catch (error) {
      if (moved) {
        options.closeEditor();
        ctx.showToast(t("Ticket moved, but the view could not refresh. Reload to continue."), "error");
      } else {
        setSaveState("error", t("Move failed"));
        ctx.showToast(error.message, "error");
      }
    } finally {
      elements.editorForm.inert = wasInert;
      state.editorSaving = false;
    }
  }

  function renderMoveFields(boards, currentBoardId, lanes, selectedLaneId) {
    return `
      <label class="editor-field">
        <span class="editor-field-label">${t("Board")}</span>
        <select data-move-board>
          ${boards
            .filter((board) => board.id !== currentBoardId)
            .map((board) => `<option value="${board.id}">${ctx.escapeHtml(board.name)}</option>`)
            .join("")}
        </select>
      </label>
      <label class="editor-field">
        <span class="editor-field-label">${t("Lane")}</span>
        <select data-move-lane>
          ${renderLaneOptions(lanes, selectedLaneId)}
        </select>
      </label>
    `;
  }

  function renderLaneOptions(lanes, selectedLaneId) {
    if (lanes.length === 0) return `<option value="">${t("No lanes — choose another board")}</option>`;
    return lanes
      .map((lane) => `<option value="${lane.id}" ${lane.id === selectedLaneId ? "selected" : ""}>${ctx.escapeHtml(lane.name)}</option>`)
      .join("");
  }

  function getDefaultTargetLaneId(lanes, sourceLaneName) {
    return lanes.find((lane) => lane.name === sourceLaneName)?.id ?? lanes[0]?.id ?? null;
  }

  return {
    clearSaveState,
    deleteTicket,
    moveTicketToBoard,
    saveTicket,
    setSaveState,
    toggleTicketArchive,
  };
}
