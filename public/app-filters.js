export function createFiltersModule(ctx, options) {
  const { state, elements } = ctx;

  function syncViewMode() {
    elements.viewModeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.viewMode === state.viewMode);
    });
    elements.laneBoard.hidden = state.viewMode !== "kanban";
    elements.listBoard.hidden = state.viewMode !== "list";
    elements.laneFilter.hidden = state.viewMode !== "list";
  }

  function resetBoardFilters() {
    state.filters = { q: "", lane: "", resolved: "false", tag: "", archived: "" };
    elements.searchInput.value = "";
    elements.laneFilter.value = "";
    syncResolvedFilter();
    syncArchivedFilter();
    elements.tagFilter.value = "";
    syncActiveFilterStyles();
  }

  function buildTicketListUrl(filters = {}) {
    const params = new URLSearchParams();
    const archived = filters.archived ?? state.filters.archived;
    if (archived === "all") {
      params.set("archived", "all");
    }
    const lane = filters.lane ?? (state.viewMode === "list" ? state.filters.lane : "");
    if (lane) {
      params.set("lane_id", String(lane));
    }
    if (filters.resolved ?? state.filters.resolved) {
      params.set("resolved", String(filters.resolved ?? state.filters.resolved));
    }
    if (filters.tag ?? state.filters.tag) {
      params.set("tag", String(filters.tag ?? state.filters.tag));
    }
    if (filters.q ?? state.filters.q) {
      params.set("q", String(filters.q ?? state.filters.q));
    }
    const query = params.toString();
    return `/api/boards/${state.activeBoardId}/tickets${query ? `?${query}` : ""}`;
  }

  function hasActiveTicketFilters() {
    return Object.entries(state.filters).some(
      ([key, value]) => key !== "archived" && (key !== "lane" || state.viewMode === "list") && value !== "",
    );
  }

  function bindFilterEvents() {
    elements.viewModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.viewMode = button.dataset.viewMode || "kanban";
        if (state.viewMode !== "list") {
          state.filters.lane = "";
          elements.laneFilter.value = "";
        }
        syncViewMode();
        syncActiveFilterStyles();
        options.refreshBoardDetail().catch((error) => {
          console.error(error);
          options.showToast(error.message, "error");
        });
        options.syncBoardUrl();
      });
    });
    elements.searchInput.addEventListener("input", async (event) => {
      state.filters.q = event.target.value.trim();
      syncActiveFilterStyles();
      await options.refreshBoardDetail();
    });
    elements.laneFilter.addEventListener("change", async (event) => {
      state.filters.lane = event.target.value;
      syncActiveFilterStyles();
      await options.refreshBoardDetail();
    });
    elements.archivedFilterButton.addEventListener("click", async () => {
      state.filters.archived = state.filters.archived === "all" ? "" : "all";
      syncArchivedFilter();
      syncActiveFilterStyles();
      await options.refreshBoardDetail();
    });
    elements.resolvedFilterButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        state.filters.resolved = button.dataset.value ?? "";
        syncResolvedFilter();
        syncActiveFilterStyles();
        await options.refreshBoardDetail();
      });
    });
    elements.tagFilter.addEventListener("change", async (event) => {
      state.filters.tag = event.target.value;
      syncActiveFilterStyles();
      await options.refreshBoardDetail();
    });
  }

  function syncResolvedFilter(value = state.filters.resolved) {
    state.filters.resolved = value;
    elements.resolvedFilterButtons.forEach((button) => {
      button.classList.toggle("active", (button.dataset.value ?? "") === value);
    });
  }

  function syncArchivedFilter() {
    elements.archivedFilterButton.classList.toggle("active", state.filters.archived === "all");
  }

  function syncActiveFilterStyles() {
    elements.searchInput.closest(".toolbar-search")?.classList.toggle("is-filter-active", state.filters.q !== "");
    elements.laneFilter.classList.toggle("is-filter-active", state.viewMode === "list" && state.filters.lane !== "");
    elements.resolvedFilter.classList.toggle("is-filter-active", state.filters.resolved !== "");
    elements.tagFilter.classList.toggle("is-filter-active", state.filters.tag !== "");
    elements.archivedFilterButton.classList.toggle("is-filter-active", state.filters.archived === "all");
  }

  return {
    bindFilterEvents,
    buildTicketListUrl,
    hasActiveTicketFilters,
    resetBoardFilters,
    syncActiveFilterStyles,
    syncArchivedFilter,
    syncResolvedFilter,
    syncViewMode,
  };
}
