// @ts-check
import { t as tr } from "./app-i18n.js";
import { renderTicketStatusIcons } from "./app-ticket-status.js";
import { icon } from "./icons.js";
import { ticketInlineIcon } from "./app-ticket-inline-icons.js";
import { renderTag } from "./app-tags.js";
import { getListTicketComparator } from "./app-ticket-sort.js";
import { renderTicketHierarchyIcon, indexTicketHierarchy } from "./app-ticket-hierarchy.js";
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
  const byId = new Map(candidates.map((ticket) => [ticket.id, ticket]));
  const selected = new Set(chosen);
  return candidates.filter(
    (t) =>
      !selected.has(t.parentTicketId != null && byId.has(t.parentTicketId) ? t.parentTicketId : t.id) &&
      (t.title.toLowerCase().includes(q) ||
        String(t.id).includes(q.replace(/^#/, ""))),
  );
}
/** @param {import("./app-group-types.js").GroupSearchState} state @param {(value: string) => string} esc */
export function renderGroupOptions(state, esc) {
  const { query, candidates, activeOption } = state;
  const matches = searchGroupCandidates(state);
  const { relatedCount } = indexTicketHierarchy(candidates);
  return !query.trim()
    ? ""
    : matches.length
      ? matches
          .map(
            (t, i) =>
              `<button type="button" role="option" id="group-option-${t.id}" aria-selected="${i === activeOption}" data-group-pick="${t.id}"><span>#${t.id} ${esc(t.title)}</span><small>${relatedCount(t.id) > 1 ? tr("{count} parent/child tickets", { count: relatedCount(t.id) }) : tr("Single ticket")}${t.isArchived ? tr(" · Archived") : ""}</small></button>`,
          )
          .join("")
      : `<p class="muted">${tr("No unassigned tickets match.")}</p>`;
}

/** @param {import("./app-group-types.js").GroupViewState} view @param {import("./app-group-types.js").GroupViewOptions} options */
export function renderGroupView(view, options) {
  const sections = renderGroupViewSections(view, options);
  return sections.list + `<div class="group-content-panel">${sections.header}${sections.tickets}${sections.footer}</div>`;
}

/** @param {import("./app-group-types.js").GroupViewState} view @param {import("./app-group-types.js").GroupViewOptions} options @param {boolean | "auto"} [includeTickets] */
export function renderGroupViewSections(view, { escapeHtml: esc, lanes, rowIcon = ticketInlineIcon }, includeTickets = true) {
  const {
    groups,
    selectedId,
    selected,
    ungroupedTicketCount,
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
  const showUngrouped = selectedId === "ungrouped";
  const ungroupedCount = ungroupedTicketCount === 1 ? tr("1 ticket") : tr("{count} tickets", { count: ungroupedTicketCount });
  /** @type {ReturnType<typeof indexTicketHierarchy<GroupTicket>> | null} */
  let ticketHierarchy = null;
  const hierarchy = () => ticketHierarchy ??= indexTicketHierarchy(tickets);
  const candidateHierarchy = adding ? indexTicketHierarchy(candidates) : null;
  /** @param {number} id @param {GroupTicket[]} [source] */
  const related = (id, source = tickets) => source === tickets
    ? hierarchy().related(id)
    : (candidateHierarchy ?? indexTicketHierarchy(source)).related(id);
  const optionsHtml = () => renderGroupOptions(view, esc);
  /** @param {GroupSummary} g */
  const counts = (g) =>
    tr("{open} open · {total} total", { open: g.openTicketCount, total: g.totalTicketCount });
  /** @param {GroupSummary} group */
  function groupChoice(group) {
    const { id, name, isActive, resolvedTicketCount, totalTicketCount } = group;
    const isSelected = id === selectedId;
    const completed = totalTicketCount > 0 && resolvedTicketCount === totalTicketCount;
    const completedLabel = tr("Completed Group");
    const progressLabel = tr("Completed {resolved} of {total}", { resolved: resolvedTicketCount, total: totalTicketCount });
    return `<button type="button" class="ghost group-choice ${isSelected ? "selected" : ""}" data-select-group="${id}" aria-current="${isSelected}">
      <span class="group-choice-heading"><span class="group-choice-name">${esc(name)}</span>${completed ? `<span class="ticket-status-icon ticket-status-icon-resolved group-choice-completed" aria-hidden="true" title="${esc(completedLabel)}">${icon("check")}</span><span class="visually-hidden">${esc(completedLabel)}</span>` : ""}</span>
      <progress class="group-choice-progress" aria-hidden="true" title="${esc(progressLabel)}" value="${resolvedTicketCount}" max="${totalTicketCount || 1}"></progress>
      <small>${counts(group)}${isActive ? "" : tr(" · Inactive")}</small>
      <span class="visually-hidden">${esc(progressLabel)}</span>
    </button>`;
  }
  /** @param {GroupTicket} t @param {boolean} [parent] @param {boolean} [context] */
  const row = (
    t,
    parent = false,
    context = false,
  ) => `<div data-group-row-id="${t.id}" class="group-ticket-row ${context ? "group-ticket-context" : ""} ${t.isResolved ? "group-ticket-resolved" : ""} ${t.isArchived ? "group-ticket-archived" : ""}">
    <div class="group-ticket-title-cell">${renderTicketHierarchyIcon(t, tickets, { renderIcon: rowIcon })}${context ? `<span class="list-ticket-link group-ticket-title" title="${tr("Archived parent · shown for context")}"><span class="ticket-ref">#${t.id}</span><span>${esc(t.title)}</span></span>` : `<button class="list-ticket-link group-ticket-title" data-group-ticket="${t.id}"><span class="ticket-ref">#${t.id}</span><span>${esc(t.title)}</span></button>`}<span class="ticket-status-icons group-ticket-status">${renderTicketStatusIcons(t, { renderIcon: rowIcon })}</span></div>
    <span class="group-ticket-meta">${esc(lanes.find((l) => l.id === t.laneId)?.name || "")}</span>
    ${parent && !showUngrouped ? `<button class="ghost icon-button group-remove-button group-text-action" data-group-remove="${t.id}" title="${tr("Remove {count} ticket(s) from Group", { count: hierarchy().relatedCount(t.id) })}" aria-label="${hierarchy().relatedCount(t.id) > 1 ? tr("Remove {count} tickets from Group", { count: hierarchy().relatedCount(t.id) }) : tr("Remove from Group")}" ${busy ? "disabled" : ""}>${rowIcon("trash-2")}</button>` : ""}
    ${t.tags.length ? `<div class="tag-list group-ticket-tags">${t.tags.map((tag) => renderTag(tag, esc)).join("")}</div>` : ""}
  </div>`;
  function ticketFamilies() {
    const comparator = getListTicketComparator(null);
    return tickets
      .filter((t) => t.parentTicketId == null || !hierarchy().byId.has(t.parentTicketId))
      .sort(comparator)
      .flatMap((parent) => {
        const children = (hierarchy().childrenByParent.get(parent.id) ?? []).sort(comparator)
          .filter((t) => showArchived || !t.isArchived);
        return !showArchived && parent.isArchived && !children.length ? [] : [{ parent, children }];
      });
  }
  /** @param {{parent: GroupTicket, children: GroupTicket[]}} family */
  function renderFamily({ parent, children }) {
    return `<div class="group-ticket-family">${row(parent, true, parent.isArchived && !showArchived)}${children.map(t => `<div class="group-ticket-child">${row(t)}</div>`).join("")}</div>`;
  }
  /** @param {import("./app-group-types.js").GroupTicketRow} item */
  function renderWindowRow(item) {
    const html = row(item.ticket, !item.child, item.context);
    return item.child ? `<div class="group-ticket-child">${html}</div>` : html;
  }
  function description() {
    if (!selected) return "";
    if (descriptionEditing)
      return `<form data-group-form="description" class="group-edit-form"><label>${tr("Description")} <span class="muted">Markdown</span><textarea name="description" rows="7" maxlength="100000">${esc(descriptionDraft)}</textarea></label>${descriptionPreview !== null ? `<div class="markdown group-description-preview">${descriptionPreview}</div>` : ""}<div class="group-actions"><button type="button" data-group-action="preview-description">${tr("Preview")}</button><button type="submit" class="primary-action" ${busy ? "disabled" : ""}>${tr("Save")}</button><button type="button" class="ghost" data-group-action="cancel-description">${tr("Cancel")}</button></div></form>`;
    if (!selected.descriptionMarkdown)
      return `<button class="ghost group-description-add group-text-action" data-group-action="edit-description">${icon("pencil")}${tr("Add description")}</button>`;
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
    return `<div class="group-description"><div id="group-description-body" class="${long && !expanded ? "group-description-summary" : "markdown group-description-body"}">${long && !expanded ? esc(summary) : selected.descriptionHtml}</div><div class="group-description-actions">${long ? `<button class="ghost group-text-action" data-group-action="expand-description" aria-controls="group-description-body" aria-expanded="${expanded}">${icon(expanded ? "chevron-left" : "chevron-right")}${expanded ? tr("Show less") : tr("Read more")}</button>` : "<span></span>"}<button class="ghost group-text-action" data-group-action="edit-description">${icon("pencil")}${tr("Edit description")}</button></div></div>`;
  }
  function addForm() {
    const count = chosen.flatMap((id) => related(id, candidates)).length;
    return `<form data-group-form="members" class="group-edit-form"><label for="group-ticket-search">${tr("Find unassigned tickets")}</label><p class="muted">${tr("To move tickets here from another Group, remove them from that Group first.")}</p><div class="group-selection" aria-live="polite">${chosen
      .map((id) => {
        const family = related(id, candidates);
        return `<span class="group-selected-ticket">#${id} ${esc(family[0].title)}${family.length > 1 ? tr(" · {count} tickets", { count: family.length }) : ""}<button type="button" class="ghost icon-button" aria-label="${tr("Deselect #{id}", { id })}" data-group-unpick="${id}">${icon("x")}</button></span>`;
      })
      .join(
        "",
      )}</div><input id="group-ticket-search" role="combobox" aria-autocomplete="list" aria-controls="group-ticket-options" aria-expanded="${!!query.trim()}" autocomplete="off" placeholder="${tr("Title or #123")}" value="${esc(query)}"><div id="group-ticket-options" class="group-ticket-options" role="listbox" aria-label="${tr("Unassigned tickets")}">${optionsHtml()}</div><div class="group-actions"><button type="submit" class="primary-action" ${!count || busy ? "disabled" : ""}>${tr("Add {count} tickets", { count: count || "" })}</button><button type="button" class="ghost" data-group-action="cancel-add">${tr("Cancel")}</button></div></form>`;
  }
  /** @param {string} value */
  function sortButtons(value) {
    const [current, direction] = value.split(":");
    const options = [
      { key: "createdAt", label: tr("Created"), subjectIcon: "calendar" },
      { key: "name", label: tr("Name"), subjectIcon: "type" },
    ];
    return `<div class="group-sort-buttons" role="group" aria-label="${tr("Group order")}">${options
      .map(({ key, label, subjectIcon }) => {
        const active = current === key;
        const tooltip = tr("{label}: {direction}. Click for {next} order.", { label, direction: active ? (direction === "asc" ? tr("ascending") : tr("descending")) : tr("not sorted"), next: active && direction === "asc" ? tr("descending") : tr("ascending") });
        return `<button type="button" id="group-sort-groups-${key}" class="list-sort-button icon-button group-sort-button ${active ? "active" : ""}" title="${tooltip}" data-group-sort-key="${key}" aria-pressed="${active}" aria-label="${label}, ${active ? tr("sorted {direction}", { direction: direction === "asc" ? tr("ascending") : tr("descending") }) : tr("not sorted")}">${icon(subjectIcon)}<span class="list-sort-indicator" aria-hidden="true">${icon(active ? (direction === "asc" ? "arrow-up" : "arrow-down") : "arrow-up-down")}</span></button>`;
      })
      .join("")}</div>`;
  }

  function groupCreateForm() {
    if (!creating) {
      return `<button class="ghost group-add-button" data-group-action="create" aria-label="${tr("Add Group")}" title="${tr("Add Group")}">${icon("plus")}</button>`;
    }
    return [
      '<form data-group-form="create" class="group-edit-form">',
      `<label>${tr("Group name")}<input name="name" value="${esc(createName)}" required maxlength="100" autocomplete="off"></label>`,
      `<div class="group-actions"><button type="submit" class="primary-action" ${busy ? "disabled" : ""}>${tr("Create")}</button>`,
      `<button type="button" class="ghost" data-group-action="cancel-create">${tr("Cancel")}</button></div></form>`,
    ].join("");
  }

  function groupList() {
    const visible = groups.filter((g) => all || g.isActive);
    const ungroupedChoice = ungroupedTicketCount
      ? `<button type="button" class="ghost group-choice ${showUngrouped ? "selected" : ""}" data-select-group="ungrouped" aria-current="${showUngrouped}"><span class="group-choice-name">${tr("No Group")}</span><small>${ungroupedCount}</small></button>`
      : "";
    const choices = visible.map(groupChoice).join("") + ungroupedChoice;
    return [
      `<div class="group-list-panel"><div class="group-list-heading"><h3>${tr("Groups")}</h3></div>`,
      `<div class="group-list-controls"><div class="filter-toggle" aria-label="${tr("Group visibility")}">`,
      `<button data-group-action="active" class="${!all ? "active" : ""}">${tr("Active")}</button>`,
      `<button data-group-action="all" class="${all ? "active" : ""}">${tr("All")}</button></div>`,
      sortButtons(sort),
      "</div>",
      `<div class="group-choices">${choices || (groups.length ? `<p class="muted">${tr("No active Groups. All tickets in your Groups are completed or archived.")}</p><button class="ghost group-text-action" data-group-action="all">${tr("Show all Groups")}</button>` : `<p class="muted">${tr("No Groups yet.")}</p>`)}</div>`,
      groupCreateForm(),
      "</div>",
    ].join("");
  }

  /** @param {GroupView} group */
  function groupHeading(group) {
    if (renaming) {
      return [
        '<form data-group-form="rename" class="group-edit-form">',
        `<label>${tr("Group name")}<input name="name" value="${esc(renameName)}" required maxlength="100"></label>`,
        `<div class="group-actions"><button type="submit" class="primary-action" ${busy ? "disabled" : ""}>${tr("Save")}</button>`,
        `<button type="button" class="ghost" data-group-action="cancel-rename">${tr("Cancel")}</button></div></form>`,
      ].join("");
    }
    return [
      '<div class="group-detail-heading"><h3>',
      `<button class="ghost group-name" data-group-action="rename" title="${tr("Rename Group")}">${esc(group.name)}</button></h3>`,
      `<span class="muted group-ticket-count">${counts(group)}</span></div>`,
    ].join("");
  }

  function archiveToggle() {
    const count = tickets.filter((t) => t.isArchived).length;
    if (!count) return "";
    return [
      `<button class="ghost group-archive-toggle group-text-action" data-group-action="archive" aria-expanded="${showArchived}">`,
      icon(showArchived ? "chevron-left" : "chevron-right"),
      `${showArchived ? tr("Hide archived tickets ({count})", { count }) : tr("Show archived tickets ({count})", { count })}</button>`,
    ].join("");
  }

  const createTicket = `<button class="ghost group-text-action" data-group-action="new-ticket">${tr("Create ticket")}</button>`;
  const header = selected ? [
    groupHeading(selected),
    description(),
    '<div class="group-ticket-toolbar">',
    `<button class="ghost group-text-action" data-group-action="add">${tr("Add existing tickets")}</button>`,
    `${createTicket}</div>`,
    !selected.isActive
      ? `<p class="muted">${tr("This Group is inactive because it has no open, unarchived tickets.")}</p>`
      : "",
    adding ? addForm() : "",
  ].join("") : showUngrouped ? [
    `<div class="group-detail-heading"><h3>${tr("No Group")}</h3><span class="muted group-ticket-count">${ungroupedCount}</span></div>`,
    `<div class="group-ticket-toolbar">${createTicket}</div>`,
  ].join("") : "";
  const families = includeTickets && (selected || showUngrouped) ? ticketFamilies() : null;
  /** @type {import("./app-group-types.js").GroupTicketWindowModel | null} */ let ticketWindow = null;
  if (includeTickets === "auto" && families && families.reduce((count, family) => count + family.children.length + 1, 0) >= 1000) {
    const rows = families.flatMap(({ parent, children }) => [
      { ticket: parent, familyId: parent.id, child: false, context: parent.isArchived && !showArchived, canRemove: !showUngrouped, lastInFamily: !children.length },
      ...children.map((ticket, index) => ({
        ticket, familyId: parent.id, child: true, context: false, canRemove: false, lastInFamily: index === children.length - 1,
      })),
    ]);
    ticketWindow = { rows, renderRow: renderWindowRow };
  }
  const rows = !includeTickets || ticketWindow ? null : families
    ? families.map(renderFamily).join("") || `<p class="group-empty muted">${tickets.length ? tr("All tickets are archived.") : tr("Add or create tickets to get started.")}</p>`
    : `<p class="group-empty muted">${groups.length ? tr("Select All to see your inactive Groups.") : tr("Create a Group to organize tickets.")}</p>`;
  const footer = [
    selected || showUngrouped ? archiveToggle() : "",
    selected && !tickets.length
      ? `<button class="ghost danger group-delete" data-group-action="delete">${tr("Delete empty Group")}</button>`
      : "",
    `<p class="group-error" role="alert">${esc(error)}</p>`,
  ].join("");
  return { list: groupList(), header, tickets: rows, footer, ticketWindow };
}
