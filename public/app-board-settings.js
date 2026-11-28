import { t as tr } from "./app-i18n.js";
import { createCompletionSettingsModule } from "./app-completion-settings.js";
import { createInlineTextForm } from "./app-inline-text-form.js";
import { icon } from "./icons.js";

export function createBoardSettingsModule(ctx) {
  const { state, elements } = ctx;
  const completionSettings = createCompletionSettingsModule(ctx);
  let hintBoardId = null;
  let deletionPreviewPending = false;
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
        html: `<input id="board-rename-input" data-board-rename-input type="text" value="${ctx.escapeHtml(board.name)}" aria-label="${tr("Board name")}" autocomplete="off" />`,
        inputSelector: "[data-board-rename-input]",
        requiredMessage: tr("Enter a name."),
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
          <button type="button" class="ghost icon-button" data-board-rename-start title="${tr("Rename board")}" aria-label="${tr("Rename board")}">
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
    if (!state.boardDetail || deletionPreviewPending) {
      return;
    }
    const boardId = state.activeBoardId;
    let detail, count;
    deletionPreviewPending = true;
    try {
      [detail, count] = await Promise.all([
        ctx.api(`/api/boards/${boardId}`),
        ctx.api(`/api/boards/${boardId}/tickets?limit=1&archived=all`),
      ]);
    } catch (error) {
      ctx.showToast(error.message, "error");
      return;
    } finally {
      deletionPreviewPending = false;
    }
    if (state.activeBoardId !== boardId) return;
    const board = detail.board;
    const nextBoard = state.boards.find((entry) => entry.id !== board.id) ?? null;
    await ctx.openConfirmDialog({
      title: tr("Delete Board"),
      message: tr("Delete board \"{name}\"?", { name: board.name }),
      details: [
        tr("Board \"{name}\"", { name: board.name }),
        tr("Tickets including archived: {count}", { count: count.page.total }),
        tr("Lanes: {count}; tags: {tags}", { count: detail.lanes.length, tags: detail.tags.length }),
        tr("All tickets, comments, tags, and relations in this board"),
        tr("All Groups and board activity history"),
      ],
      warning: tr("This action cannot be undone."),
      submitLabel: tr("Delete"),
      fields: `<label for="confirm-board-name">${ctx.escapeHtml(tr("Type the board name to confirm"))}</label><input id="confirm-board-name" type="text" required autocomplete="off" spellcheck="false" />`,
      onSubmit: async () => {
        if (document.querySelector("#confirm-board-name").value !== board.name) {
          throw new Error(tr("The board name does not match."));
        }
        const current = await ctx.api(`/api/boards/${board.id}`);
        if (state.activeBoardId !== boardId || current.board.name !== board.name) {
          throw new Error(tr("The board changed. Close this dialog and review it again."));
        }
        await ctx.api(`/api/boards/${board.id}`, { method: "DELETE" });
        delete state.filtersByBoardId[String(board.id)];
        delete state.viewModeByBoardId[String(board.id)];
        delete state.filterExpansionByBoardId[String(board.id)];
        state.activeBoardId = nextBoard?.id ?? null;
        ctx.restoreBoardViewMode?.(state.activeBoardId);
        ctx.restoreBoardFilters?.(state.activeBoardId);
        ctx.restoreBoardFilterExpansion?.(state.activeBoardId);
        ctx.syncBoardUrl();
        try {
          await ctx.refreshBoards();
        } catch (error) {
          // Deletion already succeeded; close confirmation instead of offering it again.
          ctx.showToast(error.message, "error");
        }
      },
    });
  }

  async function exportBoard() {
    if (!state.activeBoardId) {
      return;
    }
    try {
      const payload = await ctx.api(`/api/boards/${state.activeBoardId}/export`);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${payload.board.name.replace(/\s+/g, "-").toLowerCase() || "board"}.json`;
      link.click();
      URL.revokeObjectURL(url);
      ctx.showToast(tr("Download started"));
    } catch (error) {
      const message = error?.status === 413
        ? tr("The board exceeds the export size limit with its images. Use a backup of the database and image files.")
        : tr("Could not export board. Please try again.");
      ctx.showToast(message, "error");
    }
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
    (state.sidebarCollapsed ? elements.sidebarReopenButton : elements.sidebarToggleButton).focus({ preventScroll: true });
  }

  function syncSidebar() {
    elements.shell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    elements.sidebar.inert = state.sidebarCollapsed;
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
    hint.innerHTML = `<div><strong>${tr("Ticket created. No completion lane is configured.")}</strong><p>${tr("Choose which lanes should treat tickets as resolved. You can also set this up later in board settings.")}</p></div><div class="completion-hint-actions"><button type="button" class="primary-action" data-hint-setup>${tr("Set up")}</button><button type="button" class="ghost" data-hint-later>${tr("Later")}</button></div>`;
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
    for (const section of elements.sidebarBoardActionsPanel.querySelectorAll("[data-board-setting]")) {
      section.hidden = !state.boardDetail;
    }
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
