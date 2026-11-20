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
    try {
      setSaveState("saving", "Saving...");
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
        setSaveState("saved", "Saved");
      } else {
        options.closeEditor();
        ctx.showToast("Ticket created");
      }
      await ctx.refreshBoardDetail();
      if (!editingTicketId) await ctx.onTicketCreated?.(savedTicket.boardId);
      if (!editingTicketId && creationGroup && savedTicket.groupId != null && savedTicket.groupId !== creationGroup.id) await ctx.openGroup?.(savedTicket.groupId);
      return savedTicket;
    } catch (error) {
      setSaveState("error", "Save failed");
      ctx.showToast(error.message, "error");
      return null;
    } finally { state.editorSaving = false; }
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
      if (!current.isArchived && !state.filters.status.includes("archived")) {
        options.closeEditor();
        ctx.showToast("Archived");
        return;
      }
      await options.refreshDialogTicket(state.editingTicketId);
      setSaveState("saved", current.isArchived ? "Restored" : "Archived");
    } catch (error) {
      setSaveState("error", "Save failed");
      ctx.showToast(error.message, "error");
    }
  }

  async function deleteTicket() {
    if (!state.editingTicketId) {
      return;
    }
    const ticketId = state.editingTicketId;
    const ticketTitle = state.dialogTicket?.title ?? `#${ticketId}`;
    await ctx.confirmAndRun({
      title: "Delete Ticket",
      message: `Delete ticket "${ticketTitle}"?`,
      details: [
        `Ticket #${ticketId}`,
        "Comments and relations on this ticket",
        "The ticket will disappear from Kanban and List views",
      ],
      warning: "This action cannot be undone.",
      submitLabel: "Delete",
      run: async () => {
        await ctx.api(`/api/tickets/${ticketId}`, { method: "DELETE" });
        options.closeEditor();
        await ctx.refreshBoardDetail();
      },
    });
  }

  async function moveTicketToBoard() {
    if (!state.editingTicketId || !state.dialogTicket) {
      return;
    }
    const targetBoards = state.boards.filter((board) => board.id !== state.dialogTicket.boardId);
    if (targetBoards.length === 0) {
      ctx.showToast("Create another board before moving tickets", "error");
      return;
    }

    const initialBoardId = targetBoards[0].id;
    const initialBoard = await ctx.api(`/api/boards/${initialBoardId}`);
    const sourceLane = state.boardDetail?.lanes.find((lane) => lane.id === state.dialogTicket.laneId);
    const initialLaneId = getDefaultTargetLaneId(initialBoard.lanes, sourceLane?.name);
    const dialogPromise = ctx.openFormDialog({
      title: "Move Ticket",
      message: "Move this ticket to another board. Matching tag names will be kept. Group membership will be cleared. Parent, child, and blocker links outside the destination board will be cleared.",
      fields: renderMoveFields(state.boards, state.dialogTicket.boardId, initialBoard.lanes, initialLaneId),
      submitLabel: "Move",
    });
    const boardSelect = elements.uxFields.querySelector("[data-move-board]");
    const laneSelect = elements.uxFields.querySelector("[data-move-lane]");
    boardSelect?.addEventListener("change", async () => {
      try {
        const board = await ctx.api(`/api/boards/${Number(boardSelect.value)}`);
        laneSelect.innerHTML = renderLaneOptions(board.lanes, getDefaultTargetLaneId(board.lanes, sourceLane?.name));
      } catch (error) {
        ctx.showToast(error.message, "error");
      }
    });

    const confirmed = await dialogPromise;
    if (!confirmed) {
      return;
    }

    const boardId = Number(boardSelect?.value);
    const laneId = Number(laneSelect?.value);
    if (!Number.isInteger(boardId) || !Number.isInteger(laneId)) {
      ctx.showToast("Choose a destination board and lane", "error");
      return;
    }

    try {
      setSaveState("saving", "Moving...");
      const moved = await ctx.sendJson(`/api/tickets/${state.editingTicketId}/move`, {
        method: "POST",
        body: { boardId, laneId },
      });
      state.activeBoardId = moved.boardId;
      await ctx.refreshBoardDetail();
      await options.refreshDialogTicket(moved.id);
      ctx.syncTicketUrl(moved.id);
      setSaveState("saved", "Moved");
      ctx.showToast("Ticket moved");
    } catch (error) {
      setSaveState("error", "Move failed");
      ctx.showToast(error.message, "error");
    }
  }

  function renderMoveFields(boards, currentBoardId, lanes, selectedLaneId) {
    return `
      <label class="editor-field">
        <span class="editor-field-label">Board</span>
        <select data-move-board>
          ${boards
            .filter((board) => board.id !== currentBoardId)
            .map((board) => `<option value="${board.id}">${ctx.escapeHtml(board.name)}</option>`)
            .join("")}
        </select>
      </label>
      <label class="editor-field">
        <span class="editor-field-label">Lane</span>
        <select data-move-lane>
          ${renderLaneOptions(lanes, selectedLaneId)}
        </select>
      </label>
    `;
  }

  function renderLaneOptions(lanes, selectedLaneId) {
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
