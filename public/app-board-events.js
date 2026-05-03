export function createBoardEventsModule(ctx, options) {
  const { state, elements } = ctx;

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
    if (elements.editorDialog.open) {
      state.boardRefreshPendingAfterDialog = true;
      return;
    }
    if (state.boardRefreshInFlight) {
      state.boardRefreshQueued = true;
      return;
    }
    state.boardRefreshInFlight = true;
    try {
      await options.refreshBoardDetail();
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
    flushPendingBoardRefreshAfterDialogClose,
    syncBoardEvents,
  };
}
