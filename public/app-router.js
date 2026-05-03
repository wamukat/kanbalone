export function createRouterModule(ctx, options) {
  const { state, elements, api } = ctx;

  function readRouteFromLocation() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const [kind, rawId, rawView] = parts;
    const id = Number(rawId);
    if (kind === "boards" && Number.isInteger(id) && id > 0) {
      return { kind: "board", id, viewMode: rawView === "list" ? "list" : "kanban" };
    }
    if (kind === "tickets" && Number.isInteger(id) && id > 0) {
      return { kind: "ticket", id };
    }
    return { kind: "home" };
  }

  async function applyRouteFromLocation({ replace = false } = {}) {
    const route = readRouteFromLocation();

    if (route.kind === "ticket") {
      try {
        const ticket = await api(`/api/tickets/${route.id}`);
        options.saveBoardFilters();
        options.saveBoardFilterExpansion();
        options.saveBoardViewMode();
        state.activeBoardId = ticket.boardId;
        options.restoreBoardViewMode(ticket.boardId);
        options.restoreBoardFilters(ticket.boardId);
        options.restoreBoardFilterExpansion(ticket.boardId);
        await options.refreshBoardDetail();
        await options.openEditor(ticket.id, "view");
        options.persistUiPreferences();
        if (replace) {
          syncTicketUrl(ticket.id, { replace: true });
        }
        return;
      } catch {
        options.showToast("Ticket not found", "error");
      }
    }

    if (route.kind === "board") {
      if (state.boards.some((board) => board.id === route.id)) {
        options.saveBoardFilters();
        options.saveBoardFilterExpansion();
        options.saveBoardViewMode();
        state.activeBoardId = route.id;
        state.viewMode = route.viewMode;
        options.saveBoardViewMode(route.id, route.viewMode);
        options.restoreBoardFilters(route.id);
        options.restoreBoardFilterExpansion(route.id);
        await options.refreshBoardDetail();
        options.persistUiPreferences();
        if (elements.editorDialog.open) {
          state.skipDialogCloseSync = true;
          elements.editorDialog.close();
        }
        if (replace) {
          syncBoardUrl(true);
        }
        return;
      }
      options.showToast("Board not found", "error");
    }

    if (state.boards.length > 0) {
      options.saveBoardFilters();
      options.saveBoardFilterExpansion();
      options.saveBoardViewMode();
      state.activeBoardId =
        state.activeBoardId && state.boards.some((board) => board.id === state.activeBoardId)
          ? state.activeBoardId
          : state.boards[0].id;
      options.restoreBoardViewMode(state.activeBoardId);
      options.restoreBoardFilters(state.activeBoardId);
      options.restoreBoardFilterExpansion(state.activeBoardId);
      await options.refreshBoardDetail();
      options.persistUiPreferences();
      if (elements.editorDialog.open) {
        state.skipDialogCloseSync = true;
        elements.editorDialog.close();
      }
      syncBoardUrl(replace);
      return;
    }

    state.activeBoardId = null;
    state.viewMode = "kanban";
    options.persistUiPreferences();
    await options.refreshBoardDetail();
  }

  function setUrl(pathname, { replace = false } = {}) {
    if (window.location.pathname === pathname) {
      return;
    }
    const method = replace ? "replaceState" : "pushState";
    window.history[method](null, "", pathname);
  }

  function syncBoardUrl(replace = false) {
    options.saveBoardViewMode();
    const pathname = !state.activeBoardId
      ? "/"
      : state.viewMode === "list"
        ? `/boards/${state.activeBoardId}/list`
        : `/boards/${state.activeBoardId}`;
    setUrl(pathname, { replace });
    options.persistUiPreferences();
  }

  function syncTicketUrl(ticketId, { replace = false } = {}) {
    setUrl(`/tickets/${ticketId}`, { replace });
  }

  return {
    applyRouteFromLocation,
    syncBoardUrl,
    syncTicketUrl,
  };
}
