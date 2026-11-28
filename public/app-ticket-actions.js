import { t } from "./app-i18n.js";
import { chooseGroupResolution } from "./app-group-conflict.js";
import { icon } from "./icons.js";

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
    if (!state.activeBoardId || state.editorSaving || !options.canSaveBody()) {
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
      ...(state.editorTagDraftNames.length ? { newTagNames: [...state.editorTagDraftNames] } : {}),
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
    let savedTicket = null;
    let resumeBoardUpdates;
    try {
      setSaveState("saving", t("Saving..."));
      if (editingTicketId || nextParentTicketId != null || creationGroup) {
        const preview = await ctx.sendJson(editingTicketId ? `${endpoint}/change-preview` : `${endpoint}/preview`, { method: "POST", body: payload });
        const resolution = await chooseGroupResolution(ctx, preview);
        if (resolution === null) { clearSaveState(); return null; }
        if (resolution) payload.groupResolution = resolution;
        payload.expectedToken = preview.expectedToken;
      }
      savedTicket = await ctx.api(endpoint, { method, body: JSON.stringify(payload) });
      if (editingTicketId) {
        await options.refreshDialogTicket(editingTicketId, savedTicket);
        options.setDialogMode("view");
        setSaveState("saved", t("Saved"));
      } else {
        resumeBoardUpdates = ctx.deferBoardUpdatesDuringCreationRefresh(savedTicket.boardId);
        options.closeEditor();
        ctx.showToast(t("Ticket created"));
      }
      await ctx.refreshBoardDetail();
      if (!editingTicketId) await ctx.onTicketCreated?.(savedTicket.boardId);
      if (!editingTicketId && creationGroup && savedTicket.groupId != null && savedTicket.groupId !== creationGroup.id) await ctx.openGroup?.(savedTicket.groupId);
      return savedTicket;
    } catch (error) {
      if (savedTicket) {
        if (elements.editorDialog.open && state.dialogMode === "edit") options.closeEditor();
        ctx.showToast(t("Ticket saved, but the view could not refresh. Reload to continue."), "error");
        return savedTicket;
      }
      setSaveState("error", t("Save failed"));
      ctx.showToast(error.message, "error");
      return null;
    } finally {
      elements.editorForm.inert = wasInert;
      state.editorSaving = false;
      resumeBoardUpdates?.();
      options.restoreActionFocus?.(elements.editorForm.querySelector("button[type=submit]"));
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
    let saved = false;
    let archived = false;
    try {
      const current = await ctx.api(`/api/tickets/${ticketId}`);
      setSaveState("saving", current.isArchived ? t("Restoring...") : t("Archiving..."));
      await ctx.sendJson(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        body: { isArchived: !current.isArchived },
      });
      saved = true;
      archived = !current.isArchived;
      await ctx.refreshBoardDetail();
      if (!current.isArchived && (ctx.isCustomView?.() || !state.filters.includeArchived)) {
        options.closeEditor();
        ctx.showToast(t("Archived"));
        return;
      }
      await options.refreshDialogTicket(ticketId);
      options.setDialogMode("view");
      setSaveState("saved", current.isArchived ? t("Restored") : t("Archived"));
    } catch (error) {
      if (saved) {
        options.closeEditor();
        ctx.showToast(t(archived
          ? "Ticket archived, but the view could not refresh. Reload to continue."
          : "Ticket restored, but the view could not refresh. Reload to continue."), "error");
      } else {
        setSaveState("error", t("Save failed"));
        ctx.showToast(error.message, "error");
      }
    } finally {
      elements.editorForm.inert = wasInert;
      state.editorSaving = false;
      options.restoreActionFocus?.(elements.archiveTicketButton);
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
    if (!state.editingTicketId || !state.dialogTicket || state.editorSaving) return;
    const ticketId = state.editingTicketId;
    const { boardId: sourceBoardId, laneId: sourceLaneId, boardName: sourceBoardName } = state.dialogTicket;
    const sourceBoard = state.boards.find(board => board.id === sourceBoardId) ?? { id: sourceBoardId, name: sourceBoardName };
    const sourceLane = state.boardDetail?.lanes.find(lane => lane.id === sourceLaneId) ?? { id: sourceLaneId, name: `#${sourceLaneId}` };
    const isCurrentEditor = options.captureDialogScope();
    if (!isCurrentEditor()) return;
    const targetBoards = state.boards.filter(board => board.id !== sourceBoardId);
    if (!targetBoards.length) {
      ctx.showToast(t("Create another board before moving tickets"), "error");
      return;
    }
    if (!await options.confirmDiscardChanges() || !isCurrentEditor() || state.editorSaving || elements.uxDialog.open) return;

    const wasInert = elements.editorForm.inert;
    let moving = false;
    let moved = null;
    let laneRequest = null;
    let loadedBoardId = null;
    let loadedLanes = [];
    let dialogOpen = true;
    const dialogPromise = ctx.openFormDialog({
      title: t("Move Ticket"),
      fields: renderMoveFields(sourceBoard, sourceLane, targetBoards),
      submitLabel: t("Move"),
      onSubmit: async () => {
        if (!canMove()) return false;
        const boardId = Number(boardSelect.value);
        const laneId = Number(laneSelect.value);
        moving = state.editorSaving = true;
        elements.editorForm.inert = true;
        boardSelect.disabled = laneSelect.disabled = true;
        setSaveState("saving", t("Moving..."));
        try {
          moved = await ctx.sendJson(`/api/tickets/${ticketId}/move`, { method: "POST", body: { boardId, laneId } });
        } catch (error) {
          moving = state.editorSaving = false;
          elements.editorForm.inert = wasInert;
          boardSelect.disabled = laneSelect.disabled = false;
          setSaveState("error", t("Move failed"));
          throw error;
        }
      },
    });
    const boardSelect = elements.uxFields.querySelector("[data-move-board]");
    const laneSelect = elements.uxFields.querySelector("[data-move-lane]");
    const hint = elements.uxFields.querySelector("[data-move-hint]");
    const activePicker = () => dialogOpen && elements.uxDialog.open && isCurrentEditor();
    const canMove = () => activePicker() && !state.editorSaving && !laneSelect.disabled
      && Number(boardSelect.value) === loadedBoardId && loadedLanes.some(lane => lane.id === Number(laneSelect.value));
    const setHint = (message) => { hint.textContent = message; };
    const updateSubmit = () => { elements.uxSubmitButton.disabled = !canMove(); };
    updateSubmit();
    boardSelect.focus({ preventScroll: true });

    boardSelect.addEventListener("change", async () => {
      if (!activePicker() || moving) return;
      laneRequest?.abort();
      loadedBoardId = null;
      loadedLanes = [];
      laneSelect.disabled = true;
      elements.uxError.hidden = true;
      updateSubmit();
      const boardId = Number(boardSelect.value);
      if (boardId === sourceBoardId) {
        laneSelect.innerHTML = renderLaneOptions([sourceLane], sourceLaneId);
        setHint(t("Choose another board."));
        return;
      }

      const controller = new AbortController();
      laneRequest = controller;
      const isCurrentRequest = () => activePicker() && !controller.signal.aborted && Number(boardSelect.value) === boardId;
      laneSelect.innerHTML = renderMovePlaceholder(t("Loading lanes..."));
      setHint(t("Loading lanes..."));
      try {
        const destination = await ctx.api(`/api/boards/${boardId}`, { signal: controller.signal });
        if (!isCurrentRequest()) return;
        loadedBoardId = boardId;
        loadedLanes = destination.lanes;
        const hintText = loadedLanes.length ? t("Choose a destination lane.") : t("No lanes — choose another board");
        laneSelect.innerHTML = renderMovePlaceholder(hintText) + (loadedLanes.length ? renderLaneOptions(loadedLanes) : "");
        laneSelect.disabled = !loadedLanes.length;
        setHint(hintText);
      } catch {
        if (!isCurrentRequest()) return;
        laneSelect.innerHTML = renderMovePlaceholder(t("Could not load lanes"));
        setHint(t("Could not load lanes"));
      }
    });
    laneSelect.addEventListener("change", () => {
      if (!activePicker() || moving) return;
      elements.uxError.hidden = true;
      setHint(canMove() ? "" : t("Choose a destination lane."));
      updateSubmit();
    });

    await dialogPromise;
    dialogOpen = false;
    laneRequest?.abort();
    try {
      if (!moved || !isCurrentEditor()) return;
      state.activeBoardId = moved.boardId;
      const isDestinationEditor = options.captureDialogScope();
      await ctx.refreshBoardDetail();
      if (!isDestinationEditor()) return;
      elements.ticketLane.innerHTML = renderLaneOptions(state.boardDetail.lanes, moved.laneId);
      await options.refreshDialogTicket(moved.id);
      if (!isDestinationEditor()) return;
      ctx.syncTicketUrl(moved.id);
      setSaveState("saved", t("Moved"));
      ctx.showToast(t("Ticket moved"));
    } catch {
      if (state.editingTicketId === ticketId) options.closeEditor();
      ctx.showToast(t("Ticket moved, but the view could not refresh. Reload to continue."), "error");
    } finally {
      if (moving) {
        elements.editorForm.inert = wasInert;
        state.editorSaving = false;
      }
      options.restoreActionFocus?.(elements.moveTicketButton);
    }
  }

  function renderMoveFields(currentBoard, currentLane, targetBoards) {
    return `
      <dl class="ticket-move-origin">
        <dt>${t("Move from")}</dt>
        <dd data-move-source><span>${ctx.escapeHtml(currentBoard.name)}</span>${icon("chevron-right")}<span>${ctx.escapeHtml(currentLane.name)}</span></dd>
      </dl>
      <fieldset class="ticket-move-destination">
        <legend>${t("Move to")}</legend>
        <div class="ticket-move-fields">
          <label class="editor-field">
            <span class="editor-field-label">${t("Board")}</span>
            <select data-move-board aria-describedby="ticket-move-hint">
              <option value="${currentBoard.id}" selected>${ctx.escapeHtml(currentBoard.name)}</option>
              ${targetBoards.map(board => `<option value="${board.id}">${ctx.escapeHtml(board.name)}</option>`).join("")}
            </select>
          </label>
          <label class="editor-field">
            <span class="editor-field-label">${t("Lane")}</span>
            <select data-move-lane aria-describedby="ticket-move-hint" disabled>${renderLaneOptions([currentLane], currentLane.id)}</select>
          </label>
        </div>
      </fieldset>
      <p id="ticket-move-hint" data-move-hint class="muted" role="status">${t("Choose another board.")}</p>
      <p class="muted ticket-move-impact">${t("Tags with matching names on the destination board are kept. Group membership and links to parents, children, blockers, and related tickets are cleared.")}</p>
    `;
  }

  function renderMovePlaceholder(message) {
    return `<option value="" selected>${ctx.escapeHtml(message)}</option>`;
  }

  function renderLaneOptions(lanes, selectedLaneId) {
    if (lanes.length === 0) return `<option value="">${t("No lanes — choose another board")}</option>`;
    return lanes
      .map((lane) => `<option value="${lane.id}" ${lane.id === selectedLaneId ? "selected" : ""}>${ctx.escapeHtml(lane.name)}</option>`)
      .join("");
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
