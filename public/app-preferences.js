// @ts-check

const UI_PREFERENCES_KEY = "kanbalone:ui-preferences";
const UI_PREFERENCES_VERSION = 1;
const EDITOR_DIALOG_SIZE_KEY = "kanbalone:editor-dialog-size";
const DEFAULT_FILTERS = { q: "", lane: "", status: ["open"], priority: [], tag: "" };

/**
 * @typedef {"kanban" | "list"} BoardViewMode
 * @typedef {{ q: string; lane: string; status: string[]; priority: string[]; tag: string }} BoardFilters
 * @typedef {{ status: boolean; priority: boolean }} FilterExpansion
 * @typedef {{
 *   activeBoardId: number | null;
 *   filtersByBoardId: Record<string, BoardFilters>;
 *   viewModeByBoardId: Record<string, BoardViewMode>;
 *   filterExpansionByBoardId: Record<string, FilterExpansion>;
 * }} UiPreferences
 * @typedef {{
 *   id: number;
 * }} BoardSummary
 * @typedef {UiPreferences & {
 *   boards: BoardSummary[];
 *   viewMode: BoardViewMode;
 * }} UiPreferencesState
 * @typedef {{ width: number; height: number }} EditorDialogSize
 */

/** @returns {UiPreferences} */
export function readUiPreferences() {
  try {
    const raw = localStorage.getItem(UI_PREFERENCES_KEY);
    if (!raw) {
      return createDefaultUiPreferences();
    }
    const parsed = JSON.parse(raw);
    return parsed?.version === UI_PREFERENCES_VERSION
      ? readVersionedUiPreferences(parsed)
      : readLegacyUiPreferences(parsed);
  } catch {
    return createDefaultUiPreferences();
  }
}

/** @returns {EditorDialogSize | null} */
export function readEditorDialogSize() {
  try {
    const raw = localStorage.getItem(EDITOR_DIALOG_SIZE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const width = Number(parsed?.width);
    const height = Number(parsed?.height);
    return Number.isFinite(width) && Number.isFinite(height)
      ? { width, height }
      : null;
  } catch {
    return null;
  }
}

/** @param {EditorDialogSize} size */
export function saveEditorDialogSize(size) {
  try {
    localStorage.setItem(EDITOR_DIALOG_SIZE_KEY, JSON.stringify(size));
  } catch {
    // Ignore storage failures; resizing should remain usable for this session.
  }
}

/** @param {UiPreferencesState} state */
export function createUiPreferencesController(state) {
  function persistUiPreferences() {
    try {
      localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify({
        version: UI_PREFERENCES_VERSION,
        activeBoardId: state.activeBoardId,
        boards: buildBoardUiPreferences(),
      }));
    } catch (error) {
      console.warn("Failed to persist UI preferences", error);
    }
  }

  function buildBoardUiPreferences() {
    const boardIds = new Set([
      ...Object.keys(state.filtersByBoardId),
      ...Object.keys(state.viewModeByBoardId),
      ...Object.keys(state.filterExpansionByBoardId),
    ]);

    return Object.fromEntries(
      [...boardIds]
        .filter((boardId) => normalizeBoardId(boardId))
        .map((boardId) => [boardId, {
          filters: normalizeStoredFilters(state.filtersByBoardId[boardId]),
          viewMode: state.viewModeByBoardId[boardId] === "list" ? "list" : "kanban",
          filterExpansion: normalizeStoredFilterExpansion(state.filterExpansionByBoardId[boardId]),
        }]),
    );
  }

  function pruneUiPreferencesForBoards() {
    const boardIds = new Set(state.boards.map((board) => String(board.id)));
    state.filtersByBoardId = Object.fromEntries(
      Object.entries(state.filtersByBoardId).filter(([boardId]) => boardIds.has(boardId)),
    );
    state.viewModeByBoardId = Object.fromEntries(
      Object.entries(state.viewModeByBoardId).filter(([boardId]) => boardIds.has(boardId)),
    );
    state.filterExpansionByBoardId = Object.fromEntries(
      Object.entries(state.filterExpansionByBoardId).filter(([boardId]) => boardIds.has(boardId)),
    );
  }

  /**
   * @param {number | null} [boardId]
   * @param {BoardViewMode} [viewMode]
   */
  function saveBoardViewMode(boardId = state.activeBoardId, viewMode = state.viewMode) {
    if (!boardId) {
      return;
    }
    state.viewModeByBoardId[String(boardId)] = viewMode === "list" ? "list" : "kanban";
    persistUiPreferences();
  }

  /** @param {number | null} [boardId] */
  function restoreBoardViewMode(boardId = state.activeBoardId) {
    state.viewMode = boardId && state.viewModeByBoardId[String(boardId)] === "list" ? "list" : "kanban";
  }

  return {
    persistUiPreferences,
    pruneUiPreferencesForBoards,
    saveBoardViewMode,
    restoreBoardViewMode,
  };
}

/** @returns {UiPreferences} */
function createDefaultUiPreferences() {
  return {
    activeBoardId: null,
    filtersByBoardId: {},
    viewModeByBoardId: {},
    filterExpansionByBoardId: {},
  };
}

/** @param {any} parsed @returns {UiPreferences} */
function readVersionedUiPreferences(parsed) {
  const preferences = createDefaultUiPreferences();
  preferences.activeBoardId = normalizeBoardId(parsed?.activeBoardId);

  for (const [boardId, boardPreferences] of Object.entries(normalizeObject(parsed?.boards))) {
    if (!normalizeBoardId(boardId)) {
      continue;
    }
    const normalizedBoardId = String(boardId);
    preferences.filtersByBoardId[normalizedBoardId] = normalizeStoredFilters(boardPreferences?.filters);
    preferences.viewModeByBoardId[normalizedBoardId] = boardPreferences?.viewMode === "list" ? "list" : "kanban";
    preferences.filterExpansionByBoardId[normalizedBoardId] = normalizeStoredFilterExpansion(boardPreferences?.filterExpansion);
  }

  return preferences;
}

/** @param {any} parsed @returns {UiPreferences} */
function readLegacyUiPreferences(parsed) {
  const activeBoardId = normalizeBoardId(parsed?.activeBoardId);
  const viewModeByBoardId = normalizeStoredViewModesByBoard(parsed?.viewModeByBoardId);
  if (activeBoardId && !viewModeByBoardId[String(activeBoardId)] && parsed?.viewMode === "list") {
    viewModeByBoardId[String(activeBoardId)] = "list";
  }
  return {
    activeBoardId,
    filtersByBoardId: normalizeStoredFiltersByBoard(parsed?.filtersByBoardId),
    viewModeByBoardId,
    filterExpansionByBoardId: normalizeStoredFilterExpansionByBoard(parsed?.filterExpansionByBoardId),
  };
}

/** @param {unknown} value @returns {Record<string, any>} */
function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** @param {unknown} value @returns {number | null} */
function normalizeBoardId(value) {
  const boardId = Number(value);
  return Number.isInteger(boardId) && boardId > 0 ? boardId : null;
}

/** @param {unknown} value @returns {Record<string, BoardViewMode>} */
function normalizeStoredViewModesByBoard(value) {
  return Object.fromEntries(
    Object.entries(normalizeObject(value))
      .filter(([boardId, viewMode]) => normalizeBoardId(boardId) && ["kanban", "list"].includes(viewMode))
      .map(([boardId, viewMode]) => [String(boardId), viewMode]),
  );
}

/** @param {unknown} value @returns {Record<string, FilterExpansion>} */
function normalizeStoredFilterExpansionByBoard(value) {
  return Object.fromEntries(
    Object.entries(normalizeObject(value))
      .filter(([boardId, expansion]) => normalizeBoardId(boardId) && expansion && typeof expansion === "object" && !Array.isArray(expansion))
      .map(([boardId, expansion]) => [String(boardId), normalizeStoredFilterExpansion(expansion)]),
  );
}

/** @param {any} expansion @returns {FilterExpansion} */
function normalizeStoredFilterExpansion(expansion) {
  return {
    status: expansion?.status === true,
    priority: expansion?.priority === true,
  };
}

/** @param {unknown} value @returns {Record<string, BoardFilters>} */
function normalizeStoredFiltersByBoard(value) {
  return Object.fromEntries(
    Object.entries(normalizeObject(value))
      .filter(([boardId]) => normalizeBoardId(boardId))
      .map(([boardId, filters]) => [String(boardId), normalizeStoredFilters(filters)]),
  );
}

/** @param {any} filters @returns {BoardFilters} */
function normalizeStoredFilters(filters) {
  const status = Array.isArray(filters?.status)
    ? filters.status.filter(/** @param {unknown} item */ (item) => typeof item === "string" && ["open", "resolved", "archived"].includes(item))
    : [];
  const priority = Array.isArray(filters?.priority)
    ? filters.priority.filter(/** @param {unknown} item */ (item) => typeof item === "string" && ["low", "medium", "high", "urgent"].includes(item))
    : [];
  return {
    q: typeof filters?.q === "string" ? filters.q : DEFAULT_FILTERS.q,
    lane: typeof filters?.lane === "string" ? filters.lane : DEFAULT_FILTERS.lane,
    status: status.length ? [...new Set(status)] : [...DEFAULT_FILTERS.status],
    priority: [...new Set(priority)],
    tag: typeof filters?.tag === "string" ? filters.tag : DEFAULT_FILTERS.tag,
  };
}
