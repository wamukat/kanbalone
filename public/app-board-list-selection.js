export function createListSelectionModule(ctx) {
  const { state } = ctx;

  async function updateSelectedListTickets(isResolved) {
    const ticketIds = [...state.selectedListTicketIds];
    if (ticketIds.length === 0) {
      return;
    }
    await ctx.sendJson(`/api/boards/${state.activeBoardId}/tickets/bulk-complete`, {
      method: "POST",
      body: { ticketIds, isResolved },
    });
    state.selectedListTicketIds = [];
    await ctx.refreshBoardDetail();
  }

  async function updateSelectedListArchive(isArchived) {
    const ticketIds = [...state.selectedListTicketIds];
    if (ticketIds.length === 0) {
      return;
    }
    await ctx.sendJson(`/api/boards/${state.activeBoardId}/tickets/bulk-archive`, {
      method: "POST",
      body: { ticketIds, isArchived },
    });
    state.selectedListTicketIds = [];
    await ctx.refreshBoardDetail();
  }

  async function moveSelectedListTickets() {
    const ticketIds = [...state.selectedListTicketIds];
    if (ticketIds.length === 0) {
      return;
    }
    const targetBoards = state.boards.filter((board) => board.id !== state.activeBoardId);
    if (targetBoards.length === 0) {
      ctx.showToast("Create another board before moving tickets", "error");
      return;
    }

    const selectedTickets = state.boardTickets.filter((ticket) => ticketIds.includes(ticket.id));
    const selectedLaneIds = [...new Set(selectedTickets.map((ticket) => ticket.laneId))];
    const sourceLaneName = selectedLaneIds.length === 1
      ? state.boardDetail?.lanes?.find((lane) => lane.id === selectedLaneIds[0])?.name
      : undefined;
    const initialBoard = await ctx.api(`/api/boards/${targetBoards[0].id}`);
    const initialLaneId = getDefaultTargetLaneId(initialBoard.lanes, sourceLaneName);
    const dialogPromise = ctx.openFormDialog({
      title: "Move Tickets",
      message: "Move selected tickets to another board. Matching tag names will be kept. Parent, child, and blocker links outside the destination board will be cleared.",
      fields: renderMoveFields(targetBoards, initialBoard.lanes, initialLaneId),
      submitLabel: "Move",
    });
    const boardSelect = ctx.elements.uxFields.querySelector("[data-bulk-move-board-select]");
    const laneSelect = ctx.elements.uxFields.querySelector("[data-bulk-move-lane-select]");
    boardSelect?.addEventListener("change", async () => {
      try {
        const board = await ctx.api(`/api/boards/${Number(boardSelect.value)}`);
        laneSelect.innerHTML = renderLaneOptions(board.lanes, getDefaultTargetLaneId(board.lanes, sourceLaneName));
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
      for (const ticketId of ticketIds) {
        await ctx.sendJson(`/api/tickets/${ticketId}/move`, {
          method: "POST",
          body: { boardId, laneId },
        });
      }
      state.selectedListTicketIds = [];
      await ctx.refreshBoardDetail();
      ctx.showToast(`${ticketIds.length} ticket${ticketIds.length === 1 ? "" : "s"} moved`);
    } catch (error) {
      ctx.showToast(error.message, "error");
    }
  }

  async function deleteSelectedListTickets() {
    const ticketIds = [...state.selectedListTicketIds];
    if (ticketIds.length === 0) {
      return;
    }
    await ctx.confirmAndRun({
      title: "Delete Tickets",
      message: `Delete ${ticketIds.length} selected ticket${ticketIds.length === 1 ? "" : "s"}?`,
      details: [
        `${ticketIds.length} selected ticket${ticketIds.length === 1 ? "" : "s"}`,
        "Comments and relations on the selected tickets",
        "The selected tickets will disappear from Kanban and List views",
      ],
      warning: "This action cannot be undone.",
      submitLabel: "Delete",
      run: async () => {
        for (const ticketId of ticketIds) {
          await ctx.api(`/api/tickets/${ticketId}`, { method: "DELETE" });
        }
        state.selectedListTicketIds = [];
        await ctx.refreshBoardDetail();
      },
    });
  }

  function handleListTicketSelection(target) {
    const ticketId = Number(target.dataset.listTicketId);
    if (target.checked) {
      state.selectedListTicketIds = [...new Set([...state.selectedListTicketIds, ticketId])];
    } else {
      state.selectedListTicketIds = state.selectedListTicketIds.filter((id) => id !== ticketId);
    }
    ctx.renderBoardDetail();
  }

  function handleListSelectAll(target, visibleTicketIds) {
    if (target.checked) {
      state.selectedListTicketIds = [...new Set([...state.selectedListTicketIds, ...visibleTicketIds])];
    } else {
      const visibleSet = new Set(visibleTicketIds);
      state.selectedListTicketIds = state.selectedListTicketIds.filter((ticketId) => !visibleSet.has(ticketId));
    }
    ctx.renderBoardDetail();
  }

  function renderMoveFields(targetBoards, lanes, selectedLaneId) {
    return `
      <label class="editor-field">
        <span class="editor-field-label">Board</span>
        <select data-bulk-move-board-select>
          ${targetBoards.map((board) => `<option value="${board.id}">${ctx.escapeHtml(board.name)}</option>`).join("")}
        </select>
      </label>
      <label class="editor-field">
        <span class="editor-field-label">Lane</span>
        <select data-bulk-move-lane-select>
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
    deleteSelectedListTickets,
    handleListSelectAll,
    handleListTicketSelection,
    moveSelectedListTickets,
    updateSelectedListArchive,
    updateSelectedListTickets,
  };
}
