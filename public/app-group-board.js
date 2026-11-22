// @ts-check
import { t as tr } from "./app-i18n.js";
/**
 * @typedef {import("./app-group-types.js").GroupView} GroupView
 * @typedef {import("./app-group-types.js").GroupSummary} GroupSummary
 * @typedef {import("./app-group-types.js").GroupTicket} GroupTicket
 * @typedef {import("./app-group-types.js").GroupPreview} GroupPreview
 */
import {
  relatedTickets,
  searchGroupCandidates,
  renderGroupOptions,
  renderGroupView,
} from "./app-group-view.js";

// Keep the board sidebar intact: group selection and ticket families share the content area.
// Existing surface, accent and spacing tokens keep this occasional grouping task quiet.
/** @param {import("./app-group-types.js").GroupContext} ctx */
export function createGroupBoardModule(ctx) {
  const { state, elements } = ctx;
  const host = elements.groupBoard;
  const esc = ctx.escapeHtml;
  /** @type {number | null} */ let boardId = null;
  /** @type {GroupSummary[]} */ let groups = [];
  /** @type {number | null} */ let selectedId = null;
  /** @type {GroupView | null} */ let selected = null;
  /** @type {GroupTicket[]} */ let tickets = [];
  let all = false,
    sort = "createdAt:asc",
    showArchived = false;
  let createName = "",
    renameName = "";
  /** @type {import("./app-group-types.js").GroupTarget | null} */ let renameTarget =
    null;
  /** @type {import("./app-group-types.js").GroupTarget | null} */ let descriptionTarget =
    null;
  let creating = false,
    renaming = false,
    descriptionEditing = false,
    descriptionDraft = "",
    expanded = false;
  /** @type {string | null} */ let descriptionPreview = null;
  /** @type {number | null} */ let addGroupId = null;
  let adding = false,
    query = "",
    activeOption = 0;
  /** @type {GroupTicket[]} */ let candidates = [];
  /** @type {number[]} */ let chosen = [];
  let busy = false,
    error = "",
    generation = 0;

  /** @param {string} selector */
  function focus(selector) {
    const element = host.querySelector(selector);
    if (element instanceof HTMLElement) element.focus();
  }
  /** @param {number | null} targetBoardId @param {number | null} targetGroupId */
  function focusMembershipAction(targetBoardId, targetGroupId) {
    if (state.viewMode === "group" && state.activeBoardId === targetBoardId && selectedId === targetGroupId) {
      focus('[data-group-action="add"]');
    }
  }
  function renderOptions() {
    const options = host.querySelector("#group-ticket-options");
    if (options) options.innerHTML = optionsHtml();
  }

  const sortKey = () => `kanbalone:group-sort:${state.activeBoardId}`;
  /** @param {number | null} nextBoardId */
  function reset(nextBoardId) {
    boardId = nextBoardId;
    groups = [];
    selectedId = null;
    selected = null;
    tickets = [];
    all = false;
    showArchived = false;
    creating = false;
    renaming = false;
    descriptionEditing = false;
    adding = false;
    expanded = false;
    error = "";
    try {
      sort = localStorage.getItem(sortKey()) || "createdAt:asc";
    } catch {
      sort = "createdAt:asc";
    }
    if (
      !["createdAt:asc", "createdAt:desc", "name:asc", "name:desc"].includes(
        sort,
      )
    )
      sort = "createdAt:asc";
  }
  async function load() {
    if (!state.activeBoardId || state.viewMode !== "group") return;
    if (boardId !== state.activeBoardId) reset(state.activeBoardId);
    const currentBoardId = boardId,
      request = ++generation;
    const [key, order] = sort.split(":");
    try {
      const response = /** @type {{groups: GroupSummary[]}} */ (
        await ctx.api(
          `/api/boards/${currentBoardId}/groups?status=all&sort=${key}&order=${order}`,
        )
      );
      if (
        request !== generation ||
        currentBoardId !== state.activeBoardId ||
        state.viewMode !== "group"
      )
        return;
      groups = response.groups;
      if (
        !groups.some((g) => g.id === selectedId) &&
        !renaming &&
        !descriptionEditing &&
        !adding
      )
        selectedId = groups.find((g) => all || g.isActive)?.id ?? null;
      if (selectedId) {
        const [detail, rows] = await Promise.all([
          ctx.api(`/api/groups/${selectedId}`),
          ctx.api(
            `/api/boards/${currentBoardId}/tickets?groupId=${selectedId}&archived=all`,
          ),
        ]);
        if (
          request !== generation ||
          currentBoardId !== state.activeBoardId ||
          state.viewMode !== "group"
        )
          return;
        selected = /** @type {GroupView} */ (detail);
        tickets = /** @type {{tickets: GroupTicket[]}} */ (rows).tickets;
      } else {
        selected = null;
        tickets = [];
      }
      render();
    } catch (e) {
      if (request === generation) {
        error = e instanceof Error ? e.message : String(e);
        render();
      }
    }
  }
  function renderGroupBoard() {
    if (boardId !== state.activeBoardId) reset(state.activeBoardId);
    render();
    void load();
  }
  /** @param {number} id */
  async function openGroup(id) {
    const group = /** @type {GroupView} */ (await ctx.api(`/api/groups/${id}`));
    ctx.closeEditor?.();
    state.activeBoardId = group.boardId;
    if (boardId !== group.boardId) reset(group.boardId);
    selectedId = group.id;
    all = !group.isActive || all;
    adding = false;
    descriptionEditing = false;
    renaming = false;
    state.viewMode = "group";
    ctx.saveBoardViewMode?.();
    ctx.syncViewMode();
    ctx.syncBoardUrl();
    await ctx.refreshBoardDetail();
    await load();
  }
  /** @param {number} id @param {GroupTicket[]} [source] */
  const related = (id, source = tickets) => relatedTickets(id, source);
  const searchState = () => ({ candidates, chosen, query, activeOption });
  const searchMatches = () => searchGroupCandidates(searchState());
  const optionsHtml = () => renderGroupOptions(searchState(), esc);
  function render() {
    ctx.beforeGroupRender?.();
    // Live board events must not interrupt a draft or move the caret while typing.
    const active = document.activeElement;
    const focused =
      host.contains(active) &&
      (active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLButtonElement)
        ? active
        : null;
    const focusedForm = focused?.closest("form")?.dataset.groupForm;
    const action = focused?.dataset.groupAction;
    /** @type {Record<string, string>} */
    const returnActions = {
      "cancel-create": "create",
      "cancel-rename": "rename",
      "cancel-description": "edit-description",
      "cancel-add": "add",
    };
    const returningAction = returnActions[action || ""];
    const submittedForm = focused?.type === "submit" ? focusedForm : null;
    /** @type {Record<string, string>} */
    const submitActions = {
      create: "rename",
      rename: "rename",
      description: "edit-description",
      members: "add",
    };
    const afterSubmitAction = submitActions[submittedForm || ""];
    const focusSelector = focused?.dataset.selectGroup
      ? `[data-select-group="${Number(focused.dataset.selectGroup)}"]`
      : focused?.id
      ? `#${focused.id}`
      : focused?.name && focusedForm
        ? `[data-group-form="${focusedForm}"] [name="${focused.name}"]`
        : action
          ? `[data-group-action="${returningAction || action}"]`
          : submittedForm
            ? `[data-group-form="${submittedForm}"] button[type="submit"]`
            : null;
    /** @type {[number | null, number | null] | null} */
    const selection =
      focused instanceof HTMLInputElement ||
      focused instanceof HTMLTextAreaElement
        ? [focused.selectionStart, focused.selectionEnd]
        : null;
    if (!boardId) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML = renderGroupView(
      {
        groups,
        selectedId,
        selected,
        tickets,
        all,
        sort,
        showArchived,
        creating,
        createName,
        renaming,
        renameName,
        descriptionEditing,
        descriptionDraft,
        descriptionPreview,
        expanded,
        adding,
        busy,
        error,
        candidates,
        chosen,
        query,
        activeOption,
      },
      { escapeHtml: esc, lanes: state.boardDetail?.lanes ?? [] },
    );
    if (focusSelector) {
      const next =
        host.querySelector(focusSelector) ||
        (afterSubmitAction
          ? host.querySelector(`[data-group-action="${afterSubmitAction}"]`)
          : null);
      if (next instanceof HTMLElement) next.focus({ preventScroll: true });
      if (
        selection &&
        (next instanceof HTMLInputElement ||
          next instanceof HTMLTextAreaElement)
      )
        next.setSelectionRange(...selection);
    }
    ctx.afterGroupRender?.();
  }
  /** @param {number} id */
  async function remove(id) {
    const group = selected;
    if (!group) return;
    const targetBoardId = boardId;
    const request = { ticketIds: [id], groupId: null };
    const preview = /** @type {GroupPreview} */ (
      await ctx.sendJson(`/api/boards/${boardId}/group-memberships/preview`, {
        method: "POST",
        body: request,
      })
    );
    const confirmed = await ctx.openFormDialog({
      title: tr("Remove from Group?"),
      message: tr("Remove {count} ticket(s) from “{name}”? Parent/child relationships and ticket status stay unchanged.", { count: preview.tickets.length, name: group.name }),
      fields: `<ul class="group-impact-list">${preview.tickets.map((t) => `<li>#${t.id} ${esc(t.title)}${t.isArchived ? ` <span class="muted">${tr("Archived")}</span>` : ""}</li>`).join("")}</ul>`,
      submitLabel: tr("Remove from Group"),
    });
    if (!confirmed) return;
    await ctx.sendJson(`/api/boards/${boardId}/group-memberships`, {
      method: "PUT",
      body: { ...request, expectedToken: preview.expectedToken },
    });
    await ctx.refreshBoardDetail();
    focusMembershipAction(targetBoardId, group.id);
  }
  /** @param {HTMLButtonElement} button */
  async function act(button) {
    if (busy) return;
    error = "";
    if (button.dataset.groupSortKey) {
      const key = button.dataset.groupSortKey;
      const value = sort;
      const [current, direction] = value.split(":");
      const next = `${key}:${current === key && direction === "asc" ? "desc" : "asc"}`;
      sort = next;
      try {
        localStorage.setItem(sortKey(), sort);
      } catch {}
      await load();
      return;
    }
    if (button.dataset.selectGroup) {
      selectedId = Number(button.dataset.selectGroup);
      adding = false;
      renaming = false;
      descriptionEditing = false;
      showArchived = false;
      expanded = false;
      await load();
      return;
    }
    if (button.dataset.groupTicket) {
      await ctx.openEditor(Number(button.dataset.groupTicket), "view");
      return;
    }
    if (button.dataset.groupRemove) {
      await remove(Number(button.dataset.groupRemove));
      return;
    }
    if (button.dataset.groupPick) {
      const id = related(Number(button.dataset.groupPick), candidates)[0]?.id;
      if (id && !chosen.includes(id)) chosen.push(id);
      query = "";
      render();
      focus("#group-ticket-search");
      return;
    }
    if (button.dataset.groupUnpick) {
      chosen = chosen.filter((id) => id !== Number(button.dataset.groupUnpick));
      render();
      focus("#group-ticket-search");
      return;
    }
    switch (button.dataset.groupAction) {
      case "active":
        all = false;
        if (!groups.find((g) => g.id === selectedId)?.isActive)
          selectedId = null;
        await load();
        return;
      case "all":
        all = true;
        await load();
        return;
      case "create":
        creating = true;
        createName = "";
        render();
        focus('[data-group-form="create"] input');
        return;
      case "cancel-create":
        creating = false;
        break;
      case "rename":
        if (!selected) return;
        renaming = true;
        renameTarget = { id: selected.id, revision: selected.revision };
        renameName = selected.name;
        render();
        focus('[data-group-form="rename"] input');
        return;
      case "cancel-rename":
        renaming = false;
        break;
      case "edit-description":
        if (!selected) return;
        descriptionEditing = true;
        descriptionTarget = { id: selected.id, revision: selected.revision };
        descriptionDraft = selected.descriptionMarkdown || "";
        descriptionPreview = null;
        render();
        focus("textarea");
        return;
      case "cancel-description":
        descriptionEditing = false;
        break;
      case "preview-description": {
        const result = /** @type {{bodyHtml: string}} */ (
          await ctx.sendJson("/api/markdown/preview", {
            method: "POST",
            body: { bodyMarkdown: descriptionDraft },
          })
        );
        descriptionPreview = result.bodyHtml;
        break;
      }
      case "expand-description":
        expanded = !expanded;
        break;
      case "archive":
        showArchived = !showArchived;
        break;
      case "add":
        if (!selected) return;
        if (adding) {
          focus("#group-ticket-search");
          return;
        }
        addGroupId = selected.id;
        candidates = /** @type {{tickets: GroupTicket[]}} */ (
          await ctx.api(
            `/api/boards/${boardId}/tickets?ungrouped=true&archived=all`,
          )
        ).tickets;
        chosen = [];
        query = "";
        adding = true;
        render();
        focus("#group-ticket-search");
        return;
      case "cancel-add":
        adding = false;
        break;
      case "new-ticket":
        if (!selected) return;
        await ctx.openEditor(null, "edit", null, {
          id: selected.id,
          name: selected.name,
        });
        return;
      case "delete":
        if (!selected) return;
        {
          const deleting = { ...selected };
          await ctx.confirmAndRun({
            title: tr("Delete Group"),
            message: tr("Delete Group “{name}”?", { name: deleting.name }),
            warning: tr("This action cannot be undone."),
            submitLabel: tr("Delete"),
            run: async () => {
              await ctx.api(`/api/groups/${deleting.id}`, {
                method: "DELETE",
                headers: { "If-Match": `"${deleting.revision}"` },
              });
              selectedId = null;
              await load();
            },
          });
          return;
        }
      default:
        return;
    }
    render();
  }
  host.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const button = e.target.closest("button");
    if (button && !(button.type === "submit" && button.closest("form")))
      void act(button).catch((e) => {
        error = e instanceof Error ? e.message : String(e);
        render();
      });
  });
  host.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const data = new FormData(form),
      kind = form.dataset.groupForm;
    const targetBoardId = boardId;
    const targetGroupId = addGroupId;
    let membershipSaved = false;
    busy = true;
    error = "";
    form.querySelectorAll('button[type="submit"]').forEach((b) => {
      if (b instanceof HTMLButtonElement) b.disabled = true;
    });
    try {
      if (kind === "create") {
        const group = /** @type {GroupView} */ (
          await ctx.sendJson(`/api/boards/${boardId}/groups`, {
            method: "POST",
            body: { name: String(data.get("name")).trim() },
          })
        );
        selectedId = group.id;
        creating = false;
      } else if (kind === "rename" || kind === "description") {
        const target = kind === "rename" ? renameTarget : descriptionTarget;
        if (!target) return;
        await ctx.sendJson(`/api/groups/${target.id}`, {
          method: "PATCH",
          body: {
            ...(kind === "rename"
              ? { name: String(data.get("name")).trim() }
              : { descriptionMarkdown: descriptionDraft }),
            expectedRevision: target.revision,
          },
        });
        if (kind === "rename") renaming = false;
        else descriptionEditing = false;
      } else if (kind === "members") {
        const request = { ticketIds: chosen, groupId: addGroupId };
        const preview = /** @type {GroupPreview} */ (
          await ctx.sendJson(
            `/api/boards/${boardId}/group-memberships/preview`,
            { method: "POST", body: request },
          )
        );
        const expectedIds = chosen
          .flatMap((id) => related(id, candidates))
          .map((t) => t.id)
          .sort((a, b) => a - b);
        if (
          JSON.stringify([...new Set(expectedIds)]) !==
          JSON.stringify(preview.tickets.map((t) => t.id).sort((a, b) => a - b))
        )
          throw new Error(
            tr("Parent/child tickets changed. Cancel and search again before adding."),
          );
        await ctx.sendJson(`/api/boards/${boardId}/group-memberships`, {
          method: "PUT",
          body: { ...request, expectedToken: preview.expectedToken },
        });
        adding = false;
        membershipSaved = true;
      }
      await ctx.refreshBoardDetail();
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
      render();
      if (membershipSaved) focusMembershipAction(targetBoardId, targetGroupId);
    }
  });
  host.addEventListener("input", (e) => {
    if (
      !(
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
    )
      return;
    if (e.target.name === "description") descriptionDraft = e.target.value;
    if (e.target.name === "name") {
      if (e.target.closest('[data-group-form="create"]'))
        createName = e.target.value;
      else renameName = e.target.value;
    }
    if (e.target.id === "group-ticket-search") {
      query = e.target.value;
      activeOption = 0;
      renderOptions();
      e.target.setAttribute("aria-expanded", String(!!query.trim()));
    }
  });
  host.addEventListener("keydown", (e) => {
    if (
      !(e.target instanceof HTMLInputElement) ||
      e.target.id !== "group-ticket-search"
    )
      return;
    const matches = searchMatches();
    if (["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      activeOption = matches.length
        ? (activeOption + (e.key === "ArrowDown" ? 1 : -1) + matches.length) %
          matches.length
        : 0;
      renderOptions();
      if (matches[activeOption])
        e.target.setAttribute(
          "aria-activedescendant",
          `group-option-${matches[activeOption].id}`,
        );
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches[activeOption]) {
        const option = host.querySelector(`button[data-group-pick="${matches[activeOption].id}"]`);
        if (option instanceof HTMLButtonElement) option.click();
      }
    }
    if (e.key === "Escape") {
      query = "";
      e.target.value = "";
      renderOptions();
      e.target.setAttribute("aria-expanded", "false");
    }
  });
  /** @param {number} id */
  const isActiveGroup = (id) => state.viewMode === "group" && boardId === state.activeBoardId && selectedId === id;
  return { renderGroupBoard, openGroup, isActiveGroup };
}
