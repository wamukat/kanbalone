import { createCompletionSettingsModule } from "./app-completion-settings.js";
import { createInlineTextForm } from "./app-inline-text-form.js";
import { icon } from "./icons.js";

export function createBoardSettingsModule(ctx) {
  const { state, elements } = ctx;
  const completionSettings = createCompletionSettingsModule(ctx);
  let hintBoardId = null;
  const hintSeen = new Set();

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
      const form = createInlineTextForm({
        className: "sidebar-board-name-form",
        html: `<input id="board-rename-input" data-board-rename-input type="text" value="${ctx.escapeHtml(board.name)}" aria-label="Board name" autocomplete="off" />`,
        inputSelector: "[data-board-rename-input]",
        onSubmit: submitBoardRename,
        onCancel: cancelBoardRename,
        cancelOnFocusOut: "always",
      });
      form.dataset.boardRenameForm = "";
      elements.boardRenameInlineHost.replaceChildren(form);
      requestAnimationFrame(() => {
        const input = elements.boardRenameInlineHost.querySelector("[data-board-rename-input]");
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

  async function submitBoardRename(input) {
    if (!state.boardDetail) {
      return;
    }
    const name = input?.value.trim() ?? "";
    if (!name) {
      cancelBoardRename();
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
        delete state.filtersByBoardId[String(board.id)];
        delete state.viewModeByBoardId[String(board.id)];
        delete state.filterExpansionByBoardId[String(board.id)];
        state.activeBoardId = nextBoard?.id ?? null;
        ctx.restoreBoardViewMode?.(state.activeBoardId);
        ctx.restoreBoardFilters?.(state.activeBoardId);
        ctx.restoreBoardFilterExpansion?.(state.activeBoardId);
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
    ctx.saveBoardFilters?.();
    ctx.saveBoardFilterExpansion?.();
    ctx.saveBoardViewMode?.();
    state.activeBoardId = imported.board.id;
    ctx.restoreBoardViewMode?.(imported.board.id);
    ctx.restoreBoardFilters?.(imported.board.id);
    ctx.restoreBoardFilterExpansion?.(imported.board.id);
    event.target.value = "";
    await ctx.refreshBoards();
    ctx.syncBoardUrl();
  }

  function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem("kanbalone:sidebar-collapsed", String(state.sidebarCollapsed));
    syncSidebar();
  }

  function syncSidebar() {
    elements.shell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    elements.sidebarReopenButton.hidden = !state.sidebarCollapsed;
    elements.sidebarToggleButton.innerHTML = icon(state.sidebarCollapsed ? "menu" : "chevron-left");
  }

  async function onTicketCreated(boardId) {
    const key = `kanbalone:completion-hint:${boardId}`;
    if (state.activeBoardId !== boardId || state.boardDetail?.lanes.some((lane) => lane.isCompletionLane) || hintSeen.has(boardId)) return;
    try { if (localStorage.getItem(key)) return; } catch { /* Storage is optional. */ }
    try {
      const result = await ctx.api(`/api/boards/${boardId}/tickets?archived=all`);
      if (state.activeBoardId !== boardId || result.tickets.length !== 1 || state.boardDetail?.lanes.some((lane) => lane.isCompletionLane)) return;
      hintBoardId = boardId; hintSeen.add(boardId);
      try { localStorage.setItem(key, "shown"); } catch { /* Keep the session flag. */ }
      renderCompletionHint();
    } catch { /* A guidance failure must not turn a successful create into an error. */ }
  }

  function renderCompletionHint() {
    const hint = elements.completionHint;
    if (state.boardDetail?.lanes.some((lane) => lane.isCompletionLane) && hintBoardId === state.activeBoardId) hintBoardId = null;
    hint.hidden = !state.activeBoardId || hintBoardId !== state.activeBoardId;
    if (hint.hidden) return;
    hint.innerHTML = `<div><strong>Ticket created. No completion lane is configured.</strong><p>Choose which lanes should treat tickets as resolved. You can also set this up later in board settings.</p></div><div class="completion-hint-actions"><button type="button" class="primary-action" data-hint-setup>Set up</button><button type="button" class="ghost" data-hint-later>Later</button></div>`;
    hint.querySelector("[data-hint-later]").addEventListener("click", () => { hintBoardId = null; renderCompletionHint(); });
    hint.querySelector("[data-hint-setup]").addEventListener("click", () => {
      hintBoardId = null;
      state.sidebarCollapsed = false; syncSidebar();
      state.boardSettingsExpanded = true; syncBoardSettingsPanel();
      completionSettings.start();
      elements.sidebarLaneSettings.scrollIntoView({ block: "nearest" });
    });
  }

  function toggleBoardSettings() {
    state.boardSettingsExpanded = !state.boardSettingsExpanded;
    if (!state.boardSettingsExpanded) completionSettings.cancel();
    syncBoardSettingsPanel();
  }

  function syncBoardSettingsPanel() {
    elements.sidebarBoardSection.classList.toggle("expanded", state.boardSettingsExpanded);
    elements.boardSettingsToggleButton.setAttribute("aria-expanded", String(state.boardSettingsExpanded));
    elements.sidebarBoardActionsPanel.toggleAttribute("inert", !state.boardSettingsExpanded);
    elements.sidebarBoardActionsPanel.setAttribute("aria-hidden", String(!state.boardSettingsExpanded));
    renderBoardNameControl();
    completionSettings.render();
    renderCompletionHint();
  }

  return {
    onTicketCreated,
    deleteBoard,
    exportBoard,
    importBoard,
    toggleSidebar,
    syncSidebar,
    toggleBoardSettings,
    syncBoardSettingsPanel,
  };
}
