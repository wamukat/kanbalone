export function createBoardEventsModule(ctx, options) {
  const { state, elements } = ctx;
  let ticketCreationRefresh;

  function deferBoardUpdatesDuringCreationRefresh(boardId) {
    if (state.activeBoardId !== boardId) return;
    const refresh = { boardId, queued: false };
    ticketCreationRefresh = refresh;
    // The save's explicit refresh covers events deferred before the dialog closed.
    state.boardRefreshPendingAfterDialog = false;
    return () => {
      if (ticketCreationRefresh !== refresh) return;
      ticketCreationRefresh = undefined;
      if (refresh.queued && state.activeBoardId === boardId) {
        handleBoardUpdatedEvent().catch((error) => console.error(error));
      }
    };
  }

  function closeBoardEvents() {
    if (state.boardEvents) {
      state.boardEvents.close();
    }
    state.boardEvents = null;
    state.boardEventsBoardId = null;
  }

  function syncBoardEvents() {
    if (!state.activeBoardId) {
      closeBoardEvents();
      return;
    }
    if (state.boardEvents && state.boardEventsBoardId === state.activeBoardId) {
      return;
    }
    closeBoardEvents();
    const source = new EventSource(`/api/boards/${state.activeBoardId}/events`);
    source.onmessage = () => {
      handleBoardUpdatedEvent().catch((error) => {
        console.error(error);
      });
    };
    source.addEventListener("board_updated", handleBoardUpdatedEvent);
    source.addEventListener("board_imported", handleBoardUpdatedEvent);
    source.addEventListener("board_created", handleBoardUpdatedEvent);
    source.onerror = () => {
      if (state.boardEvents === source && source.readyState === EventSource.CLOSED) {
        closeBoardEvents();
      }
    };
    state.boardEvents = source;
    state.boardEventsBoardId = state.activeBoardId;
  }

  async function handleBoardUpdatedEvent() {
    if (!state.activeBoardId) {
      return;
    }
    if (ticketCreationRefresh?.boardId === state.activeBoardId) {
      ticketCreationRefresh.queued = true;
      return;
    }
    if (elements.editorDialog.open) {
      state.boardRefreshPendingAfterDialog = true;
      options.checkTicketVisitUpdate?.();
      await options.refreshTicketTasks?.();
      return;
    }
    if (state.boardRefreshInFlight) {
      state.boardRefreshQueued = true;
      return;
    }
    state.boardRefreshInFlight = true;
    try {
      await options.refreshBoardDetail({ reuseReadyKanbanLanes: true });
    } catch (error) {
      console.error(error);
    } finally {
      state.boardRefreshInFlight = false;
      if (state.boardRefreshQueued) {
        state.boardRefreshQueued = false;
        queueMicrotask(() => {
          handleBoardUpdatedEvent().catch((error) => {
            console.error(error);
          });
        });
      }
    }
  }

  async function flushPendingBoardRefreshAfterDialogClose() {
    if (!state.boardRefreshPendingAfterDialog || !state.activeBoardId) {
      return;
    }
    state.boardRefreshPendingAfterDialog = false;
    await handleBoardUpdatedEvent();
  }

  return {
    closeBoardEvents,
    deferBoardUpdatesDuringCreationRefresh,
    flushPendingBoardRefreshAfterDialogClose,
    syncBoardEvents,
  };
}
