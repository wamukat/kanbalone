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

  return {
    deleteSelectedListTickets,
    handleListSelectAll,
    handleListTicketSelection,
    updateSelectedListArchive,
    updateSelectedListTickets,
  };
}
