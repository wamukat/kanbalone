import { icon } from "./icons.js";
import { getListTicketComparator } from "./app-board-list.js";
import { renderTicketHierarchyIcon } from "./app-ticket-hierarchy.js";

// Keep the board sidebar intact: group selection and ticket families share the content area.
// Existing surface, accent and spacing tokens keep this occasional grouping task quiet.
export function createGroupBoardModule(ctx) {
  const { state, elements } = ctx;
  const host = elements.groupBoard;
  const esc = ctx.escapeHtml;
  let boardId = null, groups = [], selectedId = null, selected = null, tickets = [];
  let all = false, sort = "createdAt:asc", showArchived = false;
  let createName = "", renameName = "", renameTarget = null, descriptionTarget = null;
  let creating = false, renaming = false, descriptionEditing = false, descriptionDraft = "", descriptionPreview = null, expanded = false;
  let addGroupId = null;
  let adding = false, candidates = [], chosen = [], query = "", activeOption = 0;
  let busy = false, error = "", generation = 0;

  const sortKey = () => `kanbalone:group-sort:${state.activeBoardId}`;
  function reset(nextBoardId) {
    boardId = nextBoardId; groups = []; selectedId = null; selected = null; tickets = [];
    all = false; showArchived = false; creating = false; renaming = false; descriptionEditing = false;
    adding = false; expanded = false; error = "";
    try { sort = localStorage.getItem(sortKey()) || "createdAt:asc"; } catch { sort = "createdAt:asc"; }
    if (!["createdAt:asc", "createdAt:desc", "name:asc", "name:desc"].includes(sort)) sort = "createdAt:asc";
  }
  async function load() {
    if (!state.activeBoardId || state.viewMode !== "group") return;
    if (boardId !== state.activeBoardId) reset(state.activeBoardId);
    const currentBoardId = boardId, request = ++generation;
    const [key, order] = sort.split(":");
    try {
      const response = await ctx.api(`/api/boards/${currentBoardId}/groups?status=all&sort=${key}&order=${order}`);
      if (request !== generation || currentBoardId !== state.activeBoardId || state.viewMode !== "group") return;
      groups = response.groups;
      if (!groups.some(g => g.id === selectedId) && !renaming && !descriptionEditing && !adding) selectedId = groups.find(g => all || g.isActive)?.id ?? null;
      if (selectedId) {
        const [detail, rows] = await Promise.all([
          ctx.api(`/api/groups/${selectedId}`),
          ctx.api(`/api/boards/${currentBoardId}/tickets?groupId=${selectedId}&archived=all`),
        ]);
        if (request !== generation || currentBoardId !== state.activeBoardId || state.viewMode !== "group") return;
        selected = detail; tickets = rows.tickets;
      } else { selected = null; tickets = []; }
      render();
    } catch (e) { if (request === generation) { error = e.message; render(); } }
  }
  function renderGroupBoard() { if (boardId !== state.activeBoardId) reset(state.activeBoardId); render(); void load(); }
  async function openGroup(id) {
    const group = await ctx.api(`/api/groups/${id}`);
    ctx.closeEditor?.();
    state.activeBoardId = group.boardId;
    if (boardId !== group.boardId) reset(group.boardId);
    selectedId = group.id; all = !group.isActive || all;
    adding = false; descriptionEditing = false; renaming = false;
    state.viewMode = "group"; ctx.saveBoardViewMode?.(); ctx.syncViewMode(); ctx.syncBoardUrl();
    await ctx.refreshBoardDetail();
    await load();
  }
  function related(id, source = tickets) {
    const t = source.find(t => t.id === id); if (!t) return [];
    const parent = t.parentTicketId == null ? t : source.find(p => p.id === t.parentTicketId) || t;
    return [parent, ...source.filter(c => c.parentTicketId === parent.id)];
  }
  const counts = g => `${g.openTicketCount} open · ${g.totalTicketCount} total`;
  const row = (t, parent = false, context = false) => `<div class="group-ticket-row ${context ? "group-ticket-context" : ""}">
    <div class="group-ticket-title-cell">${renderTicketHierarchyIcon(t, tickets)}${context ? `<span class="list-ticket-link group-ticket-title" title="Archived parent · shown for context"><span class="ticket-ref">#${t.id}</span><span>${esc(t.title)}</span></span>` : `<button class="list-ticket-link group-ticket-title" data-group-ticket="${t.id}"><span class="ticket-ref">#${t.id}</span><span>${esc(t.title)}</span></button>`}${t.isArchived ? `<span class="ticket-status-icons"><span class="ticket-status-icon ticket-status-icon-archived" title="Archived" aria-label="Archived">${icon("archive")}</span></span>` : ""}</div>
    <span class="group-ticket-meta">${esc(state.boardDetail?.lanes.find(l => l.id === t.laneId)?.name || "")}</span>
    ${parent ? `<button class="ghost icon-button group-remove-button group-text-action" data-group-remove="${t.id}" title="Remove ${related(t.id).length} ticket(s) from Group" aria-label="${related(t.id).length > 1 ? `Remove ${related(t.id).length} tickets from Group` : "Remove from Group"}" ${busy ? "disabled" : ""}>${icon("trash-2")}</button>` : ""}
  </div>`;
  function ticketRows() {
    const comparator = getListTicketComparator(null);
    return tickets.filter(t => t.parentTicketId == null || !tickets.some(p => p.id === t.parentTicketId)).sort(comparator).map(parent => {
      const children = tickets.filter(t => t.parentTicketId === parent.id).sort(comparator).filter(t => showArchived || !t.isArchived);
      if (!showArchived && parent.isArchived && !children.length) return "";
      return `<div class="group-ticket-family">${row(parent, true, parent.isArchived && !showArchived)}${children.map(t => `<div class="group-ticket-child">${row(t)}</div>`).join("")}</div>`;
    }).join("");
  }
  function description() {
    if (descriptionEditing) return `<form data-group-form="description" class="group-edit-form"><label>Description <span class="muted">Markdown</span><textarea name="description" rows="7" maxlength="100000">${esc(descriptionDraft)}</textarea></label>${descriptionPreview !== null ? `<div class="markdown group-description-preview">${descriptionPreview}</div>` : ""}<div class="group-actions"><button type="button" data-group-action="preview-description">Preview</button><button type="submit" class="primary-action" ${busy ? "disabled" : ""}>Save</button><button type="button" class="ghost" data-group-action="cancel-description">Cancel</button></div></form>`;
    if (!selected.descriptionMarkdown) return `<button class="ghost group-description-add group-text-action" data-group-action="edit-description">${icon("pencil")}Add description</button>`;
    // Parse the already-sanitized HTML in an inert template. A plain summary cannot
    // leave invisible links, tables or images focusable behind a CSS height clip.
    const template = document.createElement("template"); template.innerHTML = selected.descriptionHtml;
    const text = (template.content.textContent || "").replace(/\s+/g, " ").trim();
    const first = template.content.querySelector("p, li")?.textContent?.replace(/\s+/g, " ").trim() || text;
    const long = text.length > 180 || template.content.children.length > 1 || !!template.content.querySelector("h1,h2,h3,h4,h5,h6,pre,table,img,ul,ol,blockquote");
    const summary = first.length > 180 ? `${first.slice(0, 177).trimEnd()}…` : first;
    return `<div class="group-description"><div id="group-description-body" class="${long && !expanded ? "group-description-summary" : "markdown group-description-body"}">${long && !expanded ? esc(summary) : selected.descriptionHtml}</div><div class="group-description-actions">${long ? `<button class="ghost group-text-action" data-group-action="expand-description" aria-controls="group-description-body" aria-expanded="${expanded}">${icon(expanded ? "chevron-left" : "chevron-right")}${expanded ? "Show less" : "Read more"}</button>` : "<span></span>"}<button class="ghost group-text-action" data-group-action="edit-description">${icon("pencil")}Edit description</button></div></div>`;
  }
  function searchMatches() {
    const q = query.trim().toLowerCase(); if (!q) return [];
    return candidates.filter(t => !chosen.includes(related(t.id, candidates)[0]?.id) && (t.title.toLowerCase().includes(q) || String(t.id).includes(q.replace(/^#/, ""))));
  }
  function optionsHtml() { const matches = searchMatches(); return !query.trim() ? "" : matches.length ? matches.map((t, i) => `<button type="button" role="option" id="group-option-${t.id}" aria-selected="${i === activeOption}" data-group-pick="${t.id}"><span>#${t.id} ${esc(t.title)}</span><small>${related(t.id, candidates).length > 1 ? `${related(t.id, candidates).length} parent/child tickets` : "Single ticket"}${t.isArchived ? " · Archived" : ""}</small></button>`).join("") : '<p class="muted">No unassigned tickets match.</p>'; }
  function addForm() {
    const count = chosen.flatMap(id => related(id, candidates)).length;
    return `<form data-group-form="members" class="group-edit-form"><label for="group-ticket-search">Find unassigned tickets</label><div class="group-selection" aria-live="polite">${chosen.map(id => { const family = related(id, candidates); return `<span class="group-selected-ticket">#${id} ${esc(family[0].title)}${family.length > 1 ? ` · ${family.length} tickets` : ""}<button type="button" class="ghost icon-button" aria-label="Deselect #${id}" data-group-unpick="${id}">${icon("x")}</button></span>`; }).join("")}</div><input id="group-ticket-search" role="combobox" aria-autocomplete="list" aria-controls="group-ticket-options" aria-expanded="${!!query.trim()}" autocomplete="off" placeholder="Title or #123" value="${esc(query)}"><div id="group-ticket-options" class="group-ticket-options" role="listbox" aria-label="Unassigned tickets">${optionsHtml()}</div><div class="group-actions"><button type="submit" class="primary-action" ${!count || busy ? "disabled" : ""}>Add ${count || ""} tickets</button><button type="button" class="ghost" data-group-action="cancel-add">Cancel</button></div></form>`;
  }
  function sortButtons(scope, value, options) {
    const [current, direction] = (value === "default" ? "priority:desc" : value).split(":");
    return `<div class="group-sort-buttons" role="group" aria-label="${scope === "groups" ? "Group order" : "Ticket order"}">${options.map(([key, label]) => {
      const active = current === key;
      const tooltip = `${label}: ${active ? (direction === "asc" ? "ascending" : "descending") : "not sorted"}. Click for ${active && direction === "asc" ? "descending" : "ascending"} order.`;
      const subjectIcon = { createdAt: "calendar", name: "type", id: "hash", tags: "tag", priority: "priority-high" }[key];
      return `<button type="button" id="group-sort-${scope}-${key}" class="list-sort-button icon-button group-sort-button ${active ? "active" : ""}" title="${tooltip}" data-group-sort-scope="${scope}" data-group-sort-key="${key}" aria-pressed="${active}" aria-label="${label}, ${active ? `sorted ${direction === "asc" ? "ascending" : "descending"}` : "not sorted"}">${icon(subjectIcon)}<span class="list-sort-indicator" aria-hidden="true">${icon(active ? (direction === "asc" ? "arrow-up" : "arrow-down") : "arrow-up-down")}</span></button>`;
    }).join("")}</div>`;
  }
  function render() {
    // Live board events must not interrupt a draft or move the caret while typing.
    const focused = host.contains(document.activeElement) ? document.activeElement : null;
    const focusedForm = focused?.closest("[data-group-form]")?.dataset.groupForm;
    const action = focused?.dataset.groupAction;
    const returningAction = { "cancel-create": "create", "cancel-rename": "rename", "cancel-description": "edit-description", "cancel-add": "add" }[action];
    const submittedForm = focused?.type === "submit" ? focusedForm : null;
    const afterSubmitAction = { create: "rename", rename: "rename", description: "edit-description", members: "add" }[submittedForm];
    const focusSelector = focused?.id ? `#${focused.id}` : focused?.name && focusedForm ? `[data-group-form="${focusedForm}"] [name="${focused.name}"]` : action ? `[data-group-action="${returningAction || action}"]` : submittedForm ? `[data-group-form="${submittedForm}"] button[type="submit"]` : null;
    const selection = focused && "selectionStart" in focused ? [focused.selectionStart, focused.selectionEnd] : null;
    if (!boardId) { host.innerHTML = ""; return; }
    const visible = groups.filter(g => all || g.isActive);
    host.innerHTML = `<div class="group-list-panel"><div class="group-list-heading"><h3>Groups</h3></div><div class="group-list-controls"><div class="filter-toggle" aria-label="Group visibility"><button data-group-action="active" class="${!all ? "active" : ""}">Active</button><button data-group-action="all" class="${all ? "active" : ""}">All</button></div>${sortButtons("groups", sort, [["createdAt", "Created"], ["name", "Name"]])}</div><div class="group-choices">${visible.map(g => `<button class="ghost group-choice ${g.id === selectedId ? "selected" : ""}" data-select-group="${g.id}" aria-current="${g.id === selectedId}"><span>${esc(g.name)}</span><small>${counts(g)}${g.isActive ? "" : " · Inactive"}</small></button>`).join("") || '<p class="muted">No groups to show.</p>'}</div>${creating ? `<form data-group-form="create" class="group-edit-form"><label>Group name<input name="name" value="${esc(createName)}" required maxlength="100" autocomplete="off"></label><div class="group-actions"><button type="submit" class="primary-action">Create</button><button type="button" class="ghost" data-group-action="cancel-create">Cancel</button></div></form>` : `<button class="ghost group-add-button" data-group-action="create" aria-label="Add Group" title="Add Group">${icon("plus")}</button>`}</div><div class="group-content-panel">${selected ? `${renaming ? `<form data-group-form="rename" class="group-edit-form"><label>Group name<input name="name" value="${esc(renameName)}" required maxlength="100"></label><div class="group-actions"><button type="submit" class="primary-action">Save</button><button type="button" class="ghost" data-group-action="cancel-rename">Cancel</button></div></form>` : `<div class="group-detail-heading"><h3><button class="ghost group-name" data-group-action="rename" title="Rename Group">${esc(selected.name)}</button></h3><span class="muted group-ticket-count">${counts(selected)}</span></div>`}${description()}<div class="group-ticket-toolbar"><button class="ghost group-text-action" data-group-action="add">Add existing tickets</button><button class="ghost group-text-action" data-group-action="new-ticket">Create ticket</button></div>${!selected.isActive ? '<p class="muted">This Group is inactive because it has no open, unarchived tickets.</p>' : ""}${adding ? addForm() : ""}${ticketRows() || `<p class="group-empty muted">${tickets.length ? "All tickets are archived." : "Add or create tickets to get started."}</p>`}${tickets.some(t => t.isArchived) ? `<button class="ghost group-archive-toggle group-text-action" data-group-action="archive" aria-expanded="${showArchived}">${icon(showArchived ? "chevron-left" : "chevron-right")}${showArchived ? "Hide" : "Show"} archived tickets (${tickets.filter(t => t.isArchived).length})</button>` : ""}${!tickets.length ? '<button class="ghost danger group-delete" data-group-action="delete">Delete empty Group</button>' : ""}` : '<p class="group-empty muted">Create a Group to organize tickets.</p>'}<p class="group-error" role="alert">${esc(error)}</p></div>`;
    if (focusSelector) {
      const next = host.querySelector(focusSelector) || (afterSubmitAction ? host.querySelector(`[data-group-action="${afterSubmitAction}"]`) : null);
      next?.focus({ preventScroll: true });
      if (selection && next?.setSelectionRange) next.setSelectionRange(...selection);
    }
  }
  async function remove(id) {
    const request = { ticketIds: [id], groupId: null };
    const preview = await ctx.sendJson(`/api/boards/${boardId}/group-memberships/preview`, { method: "POST", body: request });
    const confirmed = await ctx.openFormDialog({ title: "Remove from Group?", message: `Remove ${preview.tickets.length} ticket(s) from “${selected.name}”? Parent/child relationships and ticket status stay unchanged.`, fields: `<ul class="group-impact-list">${preview.tickets.map(t => `<li>#${t.id} ${esc(t.title)}${t.isArchived ? ' <span class="muted">Archived</span>' : ""}</li>`).join("")}</ul>`, submitLabel: "Remove from Group" });
    if (!confirmed) return;
    await ctx.sendJson(`/api/boards/${boardId}/group-memberships`, { method: "PUT", body: { ...request, expectedToken: preview.expectedToken } });
    await ctx.refreshBoardDetail();
  }
  async function act(button) {
    if (busy) return;
    error = "";
    if (button.dataset.groupSortKey) {
      const key = button.dataset.groupSortKey;
      const value = sort;
      const [current, direction] = value.split(":");
      const next = `${key}:${current === key && direction === "asc" ? "desc" : "asc"}`;
      sort = next; try { localStorage.setItem(sortKey(), sort); } catch {} await load();
      return;
    }
    if (button.dataset.selectGroup) { selectedId = Number(button.dataset.selectGroup); adding = false; renaming = false; descriptionEditing = false; showArchived = false; expanded = false; await load(); return; }
    if (button.dataset.groupTicket) { await ctx.openEditor(Number(button.dataset.groupTicket), "view"); return; }
    if (button.dataset.groupRemove) { await remove(Number(button.dataset.groupRemove)); return; }
    if (button.dataset.groupPick) { const id = related(Number(button.dataset.groupPick), candidates)[0]?.id; if (id && !chosen.includes(id)) chosen.push(id); query = ""; render(); host.querySelector("#group-ticket-search")?.focus(); return; }
    if (button.dataset.groupUnpick) { chosen = chosen.filter(id => id !== Number(button.dataset.groupUnpick)); render(); host.querySelector("#group-ticket-search")?.focus(); return; }
    switch (button.dataset.groupAction) {
      case "active": all = false; if (!groups.find(g => g.id === selectedId)?.isActive) selectedId = null; await load(); return;
      case "all": all = true; await load(); return;
      case "create": creating = true; createName = ""; render(); host.querySelector('[data-group-form="create"] input')?.focus(); return;
      case "cancel-create": creating = false; break;
      case "rename": renaming = true; renameTarget = { id: selected.id, revision: selected.revision }; renameName = selected.name; render(); host.querySelector('[data-group-form="rename"] input')?.focus(); return;
      case "cancel-rename": renaming = false; break;
      case "edit-description": descriptionEditing = true; descriptionTarget = { id: selected.id, revision: selected.revision }; descriptionDraft = selected.descriptionMarkdown || ""; descriptionPreview = null; render(); host.querySelector("textarea")?.focus(); return;
      case "cancel-description": descriptionEditing = false; break;
      case "preview-description": { const result = await ctx.sendJson("/api/markdown/preview", { method: "POST", body: { bodyMarkdown: descriptionDraft } }); descriptionPreview = result.bodyHtml; break; }
      case "expand-description": expanded = !expanded; break;
      case "archive": showArchived = !showArchived; break;
      case "add": if (adding) { host.querySelector("#group-ticket-search")?.focus(); return; } addGroupId = selected.id; candidates = (await ctx.api(`/api/boards/${boardId}/tickets?ungrouped=true&archived=all`)).tickets; chosen = []; query = ""; adding = true; render(); host.querySelector("#group-ticket-search")?.focus(); return;
      case "cancel-add": adding = false; break;
      case "new-ticket": render(); await ctx.openEditor(null, "edit", null, { id: selected.id, name: selected.name }); return;
      case "delete": { const deleting = { ...selected }; await ctx.confirmAndRun({ title: "Delete Group", message: `Delete Group “${deleting.name}”?`, warning: "This action cannot be undone.", submitLabel: "Delete", run: async () => { await ctx.api(`/api/groups/${deleting.id}`, { method: "DELETE", headers: { "If-Match": `"${deleting.revision}"` } }); selectedId = null; await load(); } }); return; }
      default: return;
    }
    render();
  }
  host.addEventListener("click", e => { const button = e.target.closest("button"); if (button && !(button.type === "submit" && button.closest("form"))) void act(button).catch(e => { error = e.message; render(); }); });
  host.addEventListener("submit", async e => {
    e.preventDefault(); if (busy) return;
    const form = e.target, data = new FormData(form), kind = form.dataset.groupForm;
    busy = true; error = ""; form.querySelectorAll('button[type="submit"]').forEach(b => b.disabled = true);
    try {
      if (kind === "create") { const group = await ctx.sendJson(`/api/boards/${boardId}/groups`, { method: "POST", body: { name: String(data.get("name")).trim() } }); selectedId = group.id; creating = false; }
      else if (kind === "rename" || kind === "description") { const target = kind === "rename" ? renameTarget : descriptionTarget; await ctx.sendJson(`/api/groups/${target.id}`, { method: "PATCH", body: { ...(kind === "rename" ? { name: String(data.get("name")).trim() } : { descriptionMarkdown: descriptionDraft }), expectedRevision: target.revision } }); if (kind === "rename") renaming = false; else descriptionEditing = false; }
      else if (kind === "members") { const request = { ticketIds: chosen, groupId: addGroupId }; const preview = await ctx.sendJson(`/api/boards/${boardId}/group-memberships/preview`, { method: "POST", body: request }); const expectedIds = chosen.flatMap(id => related(id, candidates)).map(t => t.id).sort((a,b) => a-b); if (JSON.stringify([...new Set(expectedIds)]) !== JSON.stringify(preview.tickets.map(t => t.id).sort((a,b) => a-b))) throw new Error("Parent/child tickets changed. Cancel and search again before adding."); await ctx.sendJson(`/api/boards/${boardId}/group-memberships`, { method: "PUT", body: { ...request, expectedToken: preview.expectedToken } }); adding = false; }
      await ctx.refreshBoardDetail(); await load();
    } catch (e) { error = e.message; }
    finally { busy = false; render(); }
  });
  host.addEventListener("input", e => {
    if (e.target.name === "description") descriptionDraft = e.target.value;
    if (e.target.name === "name") { if (e.target.closest('[data-group-form="create"]')) createName = e.target.value; else renameName = e.target.value; }
    if (e.target.id === "group-ticket-search") { query = e.target.value; activeOption = 0; host.querySelector("#group-ticket-options").innerHTML = optionsHtml(); e.target.setAttribute("aria-expanded", String(!!query.trim())); }
  });
  host.addEventListener("keydown", e => {
    if (e.target.id !== "group-ticket-search") return;
    const matches = searchMatches();
    if (["ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); activeOption = matches.length ? (activeOption + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length : 0; host.querySelector("#group-ticket-options").innerHTML = optionsHtml(); if (matches[activeOption]) e.target.setAttribute("aria-activedescendant", `group-option-${matches[activeOption].id}`); }
    if (e.key === "Enter") { e.preventDefault(); if (matches[activeOption]) host.querySelector(`[data-group-pick="${matches[activeOption].id}"]`)?.click(); }
    if (e.key === "Escape") { query = ""; e.target.value = ""; host.querySelector("#group-ticket-options").innerHTML = ""; e.target.setAttribute("aria-expanded", "false"); }
  });
  return { renderGroupBoard, openGroup };
}
