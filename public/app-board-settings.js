import { icon } from "./icons.js";

export function createBoardSettingsModule(ctx) {
  const { state, elements } = ctx;

  function renderBoardNameControl() {
    if (!elements.boardRenameInlineHost) {
      return;
    }
    const board = state.boardDetail?.board;
    if (!board) {
      elements.boardRenameInlineHost.innerHTML = "";
      return;
    }
    if (state.isRenamingBoard) {
      elements.boardRenameInlineHost.innerHTML = `
        <form class="sidebar-board-name-form" data-board-rename-form>
          <input id="board-rename-input" data-board-rename-input type="text" value="${ctx.escapeHtml(board.name)}" aria-label="Board name" autocomplete="off" required />
          <div class="sidebar-board-name-error danger" data-board-rename-error ${state.boardRenameError ? "" : "hidden"}>${ctx.escapeHtml(state.boardRenameError)}</div>
          <div class="sidebar-board-name-actions">
            <button type="button" class="ghost" data-board-rename-cancel>Cancel</button>
            <button type="submit" class="primary-action">Save</button>
          </div>
        </form>
      `;
      bindBoardNameForm();
      requestAnimationFrame(() => {
        const input = elements.boardRenameInlineHost.querySelector("[data-board-rename-input]");
        input?.focus();
        input?.select();
      });
      return;
    }

    elements.boardRenameInlineHost.innerHTML = `
      <div class="sidebar-board-name-display">
        <div class="sidebar-board-name-row">
          <span class="sidebar-board-name-text" title="${ctx.escapeHtml(board.name)}">${ctx.escapeHtml(board.name)}</span>
          <button type="button" class="ghost icon-button" data-board-rename-start title="Rename board" aria-label="Rename board">
            ${icon("pencil")}
          </button>
        </div>
      </div>
    `;
    elements.boardRenameInlineHost.querySelector("[data-board-rename-start]")?.addEventListener("click", startBoardRename);
  }

  function bindBoardNameForm() {
    const form = elements.boardRenameInlineHost.querySelector("[data-board-rename-form]");
    form?.addEventListener("submit", submitBoardRename);
    form?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      cancelBoardRename();
    });
    form?.querySelector("[data-board-rename-cancel]")?.addEventListener("click", cancelBoardRename);
  }

  function startBoardRename() {
    if (!state.boardDetail) {
      return;
    }
    state.isRenamingBoard = true;
    state.boardRenameError = "";
    renderBoardNameControl();
  }

  function cancelBoardRename() {
    state.isRenamingBoard = false;
    state.boardRenameError = "";
    renderBoardNameControl();
  }

  async function submitBoardRename(event) {
    event.preventDefault();
    if (!state.boardDetail) {
      return;
    }
    const input = elements.boardRenameInlineHost.querySelector("[data-board-rename-input]");
    const name = input?.value.trim() ?? "";
    if (!name) {
      state.boardRenameError = "Board name is required";
      renderBoardNameControl();
      return;
    }
    if (name === state.boardDetail.board.name) {
      cancelBoardRename();
      return;
    }
    await ctx.sendJson(`/api/boards/${state.activeBoardId}`, {
      method: "PATCH",
      body: { name },
    });
    state.isRenamingBoard = false;
    state.boardRenameError = "";
    await ctx.refreshBoards();
  }

  async function deleteBoard() {
    if (!state.boardDetail) {
      return;
    }
    const board = state.boardDetail.board;
    const nextBoard = state.boards.find((entry) => entry.id !== board.id) ?? null;
    await ctx.confirmAndRun({
      title: "Delete Board",
      message: `Delete board "${board.name}"?`,
      details: [
        `Board "${board.name}"`,
        "All lanes in this board",
        "All tickets, comments, tags, and relations in this board",
        "Board activity history",
      ],
      warning: "This action cannot be undone.",
      submitLabel: "Delete",
      run: async () => {
        await ctx.api(`/api/boards/${board.id}`, { method: "DELETE" });
        state.activeBoardId = nextBoard?.id ?? null;
        await ctx.refreshBoards();
        ctx.syncBoardUrl();
      },
    });
  }

  async function exportBoard() {
    if (!state.activeBoardId) {
      return;
    }
    const payload = await ctx.api(`/api/boards/${state.activeBoardId}/export`);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${payload.board.name.replace(/\s+/g, "-").toLowerCase() || "board"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importBoard(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const payload = JSON.parse(await file.text());
    const imported = await ctx.api("/api/boards/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.activeBoardId = imported.board.id;
    event.target.value = "";
    await ctx.refreshBoards();
    ctx.syncBoardUrl();
  }

  function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem("soloboard:sidebar-collapsed", String(state.sidebarCollapsed));
    syncSidebar();
  }

  function syncSidebar() {
    elements.shell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    elements.sidebarReopenButton.hidden = !state.sidebarCollapsed;
    elements.sidebarToggleButton.innerHTML = icon(state.sidebarCollapsed ? "menu" : "chevron-left");
  }

  function toggleBoardSettings() {
    state.boardSettingsExpanded = !state.boardSettingsExpanded;
    syncBoardSettingsPanel();
  }

  function syncBoardSettingsPanel() {
    elements.sidebarBoardSection.classList.toggle("expanded", state.boardSettingsExpanded);
    elements.boardSettingsToggleButton.setAttribute("aria-expanded", String(state.boardSettingsExpanded));
    elements.sidebarBoardActionsPanel.toggleAttribute("inert", !state.boardSettingsExpanded);
    elements.sidebarBoardActionsPanel.setAttribute("aria-hidden", String(!state.boardSettingsExpanded));
    renderBoardNameControl();
  }

  return {
    deleteBoard,
    exportBoard,
    importBoard,
    toggleSidebar,
    syncSidebar,
    toggleBoardSettings,
    syncBoardSettingsPanel,
  };
}
