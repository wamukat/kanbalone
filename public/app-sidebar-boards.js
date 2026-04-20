import { createInlineTextForm } from "./app-inline-text-form.js";

export function createSidebarBoardsModule(ctx, options) {
  const { state, elements } = ctx;

  function renderBoards() {
    const hasBoards = state.boards.length > 0;
    if (!hasBoards && state.sidebarCollapsed) {
      state.sidebarCollapsed = false;
      localStorage.setItem("kanbalone:sidebar-collapsed", "false");
      options.syncSidebar();
    }
    elements.shell.classList.toggle("no-boards", !hasBoards);
    elements.boardList.innerHTML = "";
    for (const board of state.boards) {
      const button = document.createElement("button");
      button.className = `board-button ${board.id === state.activeBoardId ? "active" : ""}`;
      button.draggable = true;
      button.dataset.boardId = String(board.id);
      button.textContent = board.name;
      button.addEventListener("click", async () => {
        cancelBoardCreate();
        options.cancelLaneCreate();
        await ctx.selectBoard(board.id);
      });
      bindBoardDrag(button);
      elements.boardList.append(button);
    }
    if (state.isCreatingBoard) {
      elements.boardList.append(createBoardInputRow());
    }
    elements.newBoardButton.hidden = state.isCreatingBoard;
    const shouldGuideBoardCreate = !hasBoards && !state.isCreatingBoard;
    elements.newBoardButton.classList.toggle("is-empty-target", shouldGuideBoardCreate);
    elements.newBoardButton.title = shouldGuideBoardCreate ? "Create your first board" : "New board";
    elements.newBoardButton.setAttribute(
      "aria-label",
      shouldGuideBoardCreate ? "Create your first board" : "New board",
    );
  }

  function createBoardInputRow() {
    return createInlineTextForm({
      className: "board-create-row",
      html: '<input type="text" data-board-create-input aria-label="Board name" placeholder="Board name" autocomplete="off" />',
      inputSelector: "[data-board-create-input]",
      onSubmit: submitBoardCreate,
      onCancel: cancelBoardCreate,
    });
  }

  function bindBoardDrag(button) {
    button.addEventListener("dragstart", (event) => {
      state.activeBoardDragId = Number(button.dataset.boardId);
      button.classList.add("dragging-board");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", button.dataset.boardId);
    });
    button.addEventListener("dragend", async () => {
      if (state.activeBoardDragId == null) {
        return;
      }
      button.classList.remove("dragging-board");
      state.activeBoardDragId = null;
      await persistBoardOrder();
    });
  }

  async function persistBoardOrder() {
    const boardIds = [...elements.boardList.querySelectorAll(".board-button")].map((button) => Number(button.dataset.boardId));
    if (boardIds.length !== state.boards.length || boardIds.every((boardId, index) => boardId === state.boards[index]?.id)) {
      return;
    }
    const data = await ctx.sendJson("/api/boards/reorder", {
      method: "POST",
      body: { boardIds },
    });
    state.boards = data.boards;
    renderBoards();
  }

  async function createBoard() {
    state.isCreatingBoard = true;
    renderBoards();
  }

  async function submitBoardCreate(input) {
    const name = input?.value.trim() ?? "";
    if (!name) {
      cancelBoardCreate();
      return;
    }
    const created = await ctx.sendJson("/api/boards", {
      method: "POST",
      body: { name },
    });
    ctx.saveBoardFilters?.();
    ctx.saveBoardFilterExpansion?.();
    ctx.saveBoardViewMode?.();
    state.isCreatingBoard = false;
    state.activeBoardId = created.board.id;
    ctx.restoreBoardViewMode?.(created.board.id);
    ctx.restoreBoardFilters?.(created.board.id);
    ctx.restoreBoardFilterExpansion?.(created.board.id);
    await ctx.refreshBoards();
    ctx.syncBoardUrl();
  }

  function cancelBoardCreate() {
    if (!state.isCreatingBoard) {
      return;
    }
    state.isCreatingBoard = false;
    renderBoards();
  }

  function handleBoardListDragOver(event) {
    const dragging =
      state.activeBoardDragId == null
        ? null
        : elements.boardList.querySelector(`.board-button[data-board-id="${state.activeBoardDragId}"]`);
    if (!dragging) {
      return;
    }
    event.preventDefault();
    const afterElement = getBoardAfterElement(elements.boardList, event.clientY);
    if (!afterElement) {
      elements.boardList.append(dragging);
      return;
    }
    elements.boardList.insertBefore(dragging, afterElement);
  }

  function getBoardAfterElement(container, y) {
    const boardButtons = [...container.querySelectorAll(".board-button:not(.dragging-board)")];
    return boardButtons.reduce(
      (closest, button) => {
        const box = button.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: button };
        }
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY, element: null },
    ).element;
  }

  return { renderBoards, createBoard, handleBoardListDragOver };
}
