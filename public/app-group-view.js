// @ts-check
import { renderTicketStatusIcons } from "./app-ticket-status.js";
import { icon } from "./icons.js";
import { getListTicketComparator } from "./app-ticket-sort.js";
import { renderTicketHierarchyIcon } from "./app-ticket-hierarchy.js";
/**
 * @typedef {import("./app-group-types.js").GroupView} GroupView
 * @typedef {import("./app-group-types.js").GroupSummary} GroupSummary
 * @typedef {import("./app-group-types.js").GroupTicket} GroupTicket
 */
/** @param {number} id @param {GroupTicket[]} source */
export function relatedTickets(id, source) {
  const t = source.find((t) => t.id === id);
  if (!t) return [];
  const parent =
    t.parentTicketId == null
      ? t
      : source.find((p) => p.id === t.parentTicketId) || t;
  return [parent, ...source.filter((c) => c.parentTicketId === parent.id)];
}
/** @param {import("./app-group-types.js").GroupSearchState} state */
export function searchGroupCandidates({ query, candidates, chosen }) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return candidates.filter(
    (t) =>
      !chosen.includes(relatedTickets(t.id, candidates)[0]?.id) &&
      (t.title.toLowerCase().includes(q) ||
        String(t.id).includes(q.replace(/^#/, ""))),
  );
}
/** @param {import("./app-group-types.js").GroupSearchState} state @param {(value: string) => string} esc */
export function renderGroupOptions(state, esc) {
  const { query, candidates, activeOption } = state;
  const matches = searchGroupCandidates(state);
  return !query.trim()
    ? ""
    : matches.length
      ? matches
          .map(
            (t, i) =>
              `<button type="button" role="option" id="group-option-${t.id}" aria-selected="${i === activeOption}" data-group-pick="${t.id}"><span>#${t.id} ${esc(t.title)}</span><small>${relatedTickets(t.id, candidates).length > 1 ? `${relatedTickets(t.id, candidates).length} parent/child tickets` : "Single ticket"}${t.isArchived ? " · Archived" : ""}</small></button>`,
          )
          .join("")
      : '<p class="muted">No unassigned tickets match.</p>';
}

/** @param {import("./app-group-types.js").GroupViewState} view @param {import("./app-group-types.js").GroupViewOptions} options */
export function renderGroupView(view, { escapeHtml: esc, lanes }) {
  const {
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
  } = view;
  /** @param {number} id @param {GroupTicket[]} [source] */
  const related = (id, source = tickets) => relatedTickets(id, source);
  const optionsHtml = () => renderGroupOptions(view, esc);
  /** @param {GroupSummary} g */
  const counts = (g) =>
    `${g.openTicketCount} open · ${g.totalTicketCount} total`;
  /** @param {GroupTicket} t @param {boolean} [parent] @param {boolean} [context] */
  const row = (
    t,
    parent = false,
    context = false,
  ) => `<div class="group-ticket-row ${context ? "group-ticket-context" : ""}">
    <div class="group-ticket-title-cell">${renderTicketHierarchyIcon(t, tickets)}${context ? `<span class="list-ticket-link group-ticket-title" title="Archived parent · shown for context"><span class="ticket-ref">#${t.id}</span><span>${esc(t.title)}</span></span>` : `<button class="list-ticket-link group-ticket-title" data-group-ticket="${t.id}"><span class="ticket-ref">#${t.id}</span><span>${esc(t.title)}</span></button>`}${t.isArchived ? `<span class="ticket-status-icons">${renderTicketStatusIcons(t, { showResolved: false })}</span>` : ""}</div>
    <span class="group-ticket-meta">${esc(lanes.find((l) => l.id === t.laneId)?.name || "")}</span>
    ${parent ? `<button class="ghost icon-button group-remove-button group-text-action" data-group-remove="${t.id}" title="Remove ${related(t.id).length} ticket(s) from Group" aria-label="${related(t.id).length > 1 ? `Remove ${related(t.id).length} tickets from Group` : "Remove from Group"}" ${busy ? "disabled" : ""}>${icon("trash-2")}</button>` : ""}
  </div>`;
  function ticketRows() {
    const comparator = getListTicketComparator(null);
    return tickets
      .filter(
        (t) =>
          t.parentTicketId == null ||
          !tickets.some((p) => p.id === t.parentTicketId),
      )
      .sort(comparator)
      .map((parent) => {
        const children = tickets
          .filter((t) => t.parentTicketId === parent.id)
          .sort(comparator)
          .filter((t) => showArchived || !t.isArchived);
        if (!showArchived && parent.isArchived && !children.length) return "";
        return `<div class="group-ticket-family">${row(parent, true, parent.isArchived && !showArchived)}${children.map((t) => `<div class="group-ticket-child">${row(t)}</div>`).join("")}</div>`;
      })
      .join("");
  }
  function description() {
    if (!selected) return "";
    if (descriptionEditing)
      return `<form data-group-form="description" class="group-edit-form"><label>Description <span class="muted">Markdown</span><textarea name="description" rows="7" maxlength="100000">${esc(descriptionDraft)}</textarea></label>${descriptionPreview !== null ? `<div class="markdown group-description-preview">${descriptionPreview}</div>` : ""}<div class="group-actions"><button type="button" data-group-action="preview-description">Preview</button><button type="submit" class="primary-action" ${busy ? "disabled" : ""}>Save</button><button type="button" class="ghost" data-group-action="cancel-description">Cancel</button></div></form>`;
    if (!selected.descriptionMarkdown)
      return `<button class="ghost group-description-add group-text-action" data-group-action="edit-description">${icon("pencil")}Add description</button>`;
    // Parse the already-sanitized HTML in an inert template. A plain summary cannot
    // leave invisible links, tables or images focusable behind a CSS height clip.
    const template = document.createElement("template");
    template.innerHTML = selected.descriptionHtml;
    const text = (template.content.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    const first =
      template.content
        .querySelector("p, li")
        ?.textContent?.replace(/\s+/g, " ")
        .trim() || text;
    const long =
      text.length > 180 ||
      template.content.children.length > 1 ||
      !!template.content.querySelector(
        "h1,h2,h3,h4,h5,h6,pre,table,img,ul,ol,blockquote",
      );
    const summary =
      first.length > 180 ? `${first.slice(0, 177).trimEnd()}…` : first;
    return `<div class="group-description"><div id="group-description-body" class="${long && !expanded ? "group-description-summary" : "markdown group-description-body"}">${long && !expanded ? esc(summary) : selected.descriptionHtml}</div><div class="group-description-actions">${long ? `<button class="ghost group-text-action" data-group-action="expand-description" aria-controls="group-description-body" aria-expanded="${expanded}">${icon(expanded ? "chevron-left" : "chevron-right")}${expanded ? "Show less" : "Read more"}</button>` : "<span></span>"}<button class="ghost group-text-action" data-group-action="edit-description">${icon("pencil")}Edit description</button></div></div>`;
  }
  function addForm() {
    const count = chosen.flatMap((id) => related(id, candidates)).length;
    return `<form data-group-form="members" class="group-edit-form"><label for="group-ticket-search">Find unassigned tickets</label><p class="muted">To move tickets here from another Group, remove them from that Group first.</p><div class="group-selection" aria-live="polite">${chosen
      .map((id) => {
        const family = related(id, candidates);
        return `<span class="group-selected-ticket">#${id} ${esc(family[0].title)}${family.length > 1 ? ` · ${family.length} tickets` : ""}<button type="button" class="ghost icon-button" aria-label="Deselect #${id}" data-group-unpick="${id}">${icon("x")}</button></span>`;
      })
      .join(
        "",
      )}</div><input id="group-ticket-search" role="combobox" aria-autocomplete="list" aria-controls="group-ticket-options" aria-expanded="${!!query.trim()}" autocomplete="off" placeholder="Title or #123" value="${esc(query)}"><div id="group-ticket-options" class="group-ticket-options" role="listbox" aria-label="Unassigned tickets">${optionsHtml()}</div><div class="group-actions"><button type="submit" class="primary-action" ${!count || busy ? "disabled" : ""}>Add ${count || ""} tickets</button><button type="button" class="ghost" data-group-action="cancel-add">Cancel</button></div></form>`;
  }
  /** @param {string} value */
  function sortButtons(value) {
    const [current, direction] = value.split(":");
    const options = [
      { key: "createdAt", label: "Created", subjectIcon: "calendar" },
      { key: "name", label: "Name", subjectIcon: "type" },
    ];
    return `<div class="group-sort-buttons" role="group" aria-label="Group order">${options
      .map(({ key, label, subjectIcon }) => {
        const active = current === key;
        const tooltip = `${label}: ${active ? (direction === "asc" ? "ascending" : "descending") : "not sorted"}. Click for ${active && direction === "asc" ? "descending" : "ascending"} order.`;
        return `<button type="button" id="group-sort-groups-${key}" class="list-sort-button icon-button group-sort-button ${active ? "active" : ""}" title="${tooltip}" data-group-sort-key="${key}" aria-pressed="${active}" aria-label="${label}, ${active ? `sorted ${direction === "asc" ? "ascending" : "descending"}` : "not sorted"}">${icon(subjectIcon)}<span class="list-sort-indicator" aria-hidden="true">${icon(active ? (direction === "asc" ? "arrow-up" : "arrow-down") : "arrow-up-down")}</span></button>`;
      })
      .join("")}</div>`;
  }

  function groupCreateForm() {
    if (!creating) {
      return `<button class="ghost group-add-button" data-group-action="create" aria-label="Add Group" title="Add Group">${icon("plus")}</button>`;
    }
    return [
      '<form data-group-form="create" class="group-edit-form">',
      `<label>Group name<input name="name" value="${esc(createName)}" required maxlength="100" autocomplete="off"></label>`,
      '<div class="group-actions"><button type="submit" class="primary-action">Create</button>',
      '<button type="button" class="ghost" data-group-action="cancel-create">Cancel</button></div></form>',
    ].join("");
  }

  function groupList() {
    const visible = groups.filter((g) => all || g.isActive);
    const choices = visible
      .map((g) =>
        [
          `<button class="ghost group-choice ${g.id === selectedId ? "selected" : ""}" data-select-group="${g.id}" aria-current="${g.id === selectedId}">`,
          `<span>${esc(g.name)}</span><small>${counts(g)}${g.isActive ? "" : " · Inactive"}</small></button>`,
        ].join(""),
      )
      .join("");
    return [
      '<div class="group-list-panel"><div class="group-list-heading"><h3>Groups</h3></div>',
      '<div class="group-list-controls"><div class="filter-toggle" aria-label="Group visibility">',
      `<button data-group-action="active" class="${!all ? "active" : ""}">Active</button>`,
      `<button data-group-action="all" class="${all ? "active" : ""}">All</button></div>`,
      sortButtons(sort),
      "</div>",
      `<div class="group-choices">${choices || (groups.length ? '<p class="muted">No active Groups. All tickets in your Groups are completed or archived.</p><button class="ghost group-text-action" data-group-action="all">Show all Groups</button>' : '<p class="muted">No Groups yet.</p>')}</div>`,
      groupCreateForm(),
      "</div>",
    ].join("");
  }

  /** @param {GroupView} group */
  function groupHeading(group) {
    if (renaming) {
      return [
        '<form data-group-form="rename" class="group-edit-form">',
        `<label>Group name<input name="name" value="${esc(renameName)}" required maxlength="100"></label>`,
        '<div class="group-actions"><button type="submit" class="primary-action">Save</button>',
        '<button type="button" class="ghost" data-group-action="cancel-rename">Cancel</button></div></form>',
      ].join("");
    }
    return [
      '<div class="group-detail-heading"><h3>',
      `<button class="ghost group-name" data-group-action="rename" title="Rename Group">${esc(group.name)}</button></h3>`,
      `<span class="muted group-ticket-count">${counts(group)}</span></div>`,
    ].join("");
  }

  function archiveToggle() {
    const count = tickets.filter((t) => t.isArchived).length;
    if (!count) return "";
    return [
      `<button class="ghost group-archive-toggle group-text-action" data-group-action="archive" aria-expanded="${showArchived}">`,
      icon(showArchived ? "chevron-left" : "chevron-right"),
      `${showArchived ? "Hide" : "Show"} archived tickets (${count})</button>`,
    ].join("");
  }

  function groupContent() {
    const content = selected
      ? [
          groupHeading(selected),
          description(),
          '<div class="group-ticket-toolbar">',
          '<button class="ghost group-text-action" data-group-action="add">Add existing tickets</button>',
          '<button class="ghost group-text-action" data-group-action="new-ticket">Create ticket</button></div>',
          !selected.isActive
            ? '<p class="muted">This Group is inactive because it has no open, unarchived tickets.</p>'
            : "",
          adding ? addForm() : "",
          ticketRows() ||
            `<p class="group-empty muted">${tickets.length ? "All tickets are archived." : "Add or create tickets to get started."}</p>`,
          archiveToggle(),
          !tickets.length
            ? '<button class="ghost danger group-delete" data-group-action="delete">Delete empty Group</button>'
            : "",
        ].join("")
      : `<p class="group-empty muted">${groups.length ? "Select All to see your inactive Groups." : "Create a Group to organize tickets."}</p>`;
    return `<div class="group-content-panel">${content}<p class="group-error" role="alert">${esc(error)}</p></div>`;
  }

  return groupList() + groupContent();
}
