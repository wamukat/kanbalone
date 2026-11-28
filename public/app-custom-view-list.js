import { getLocale, t } from "./app-i18n.js";
import { renderTicketStatusIcons } from "./app-ticket-status.js";
import { renderPriorityBadge } from "./app-priority.js";
import { renderTag } from "./app-tags.js";
import { completionLabel, missingBoard, missingLane, missingTag, ruleLabel, sortOptions } from "./app-custom-view-settings.js";

export function displayChanged(display, view) {
  return display.showBody !== view.showBody || display.showLatestComment !== view.showLatestComment || display.sort !== (view.sort ?? "position_asc");
}

export function renderCustomView({ view, display, page, catalog, pageIndex, pageSize, esc }) {
  const dirty = displayChanged(display, view);
  const boards = new Map(catalog.map(board => [board.id, board]));
  const rules = new Map(view.rules.map(rule => [rule.boardId, rule]));
  const rows = new Map();
  for (const row of page.tickets) {
    if (!rows.has(row.boardId)) rows.set(row.boardId, []);
    rows.get(row.boardId).push(row);
  }
  const countLabel = count => count === 1 ? t("1 ticket") : t("{count} tickets", { count });

  function excerpt(row, field) {
    const comment = field === "comment";
    const part = comment ? row.latestComment : row.body;
    const title = comment ? t("Latest comment") : t("Body");
    const posted = comment && part ? `<time datetime="${esc(part.createdAt)}">${esc(new Date(part.createdAt).toLocaleString(getLocale()))}</time>` : "";
    const text = comment ? (part?.excerpt ?? t("No comments yet.")) : (part?.excerpt || t("No description"));
    return `<section class="cv-excerpt"><h4>${title} ${posted}</h4>
      <p>${esc(text)}${part?.truncated ? "…" : ""}</p>
      ${part?.truncated ? `<button type="button" class="cv-text-action" data-view-expand="${field}" data-row-id="${row.id}" data-comment-id="${part.id ?? ""}" aria-expanded="false">${t("Show full text")}</button>` : ""}
      </section>`;
  }

  function ticket(row) {
    return `<article class="cv-ticket${row.isResolved ? " resolved" : ""}">
      <h4><a class="list-ticket-link" href="/tickets/${row.id}" data-view-ticket="${row.id}" data-owner="${row.boardId}">
        <span class="ticket-id">#${row.id}</span> <span>${esc(row.title)}</span>
      </a>${renderTicketStatusIcons(row)}</h4>
      <dl class="cv-meta">
        <div><dt>${t("Lane")}</dt><dd>${esc(row.laneName)}</dd></div>
        <div><dt>${t("Tags")}</dt><dd>${row.tags.map(tag => renderTag(tag, esc)).join(" ") || `<span aria-hidden="true">-</span><span class="visually-hidden">${t("No tags")}</span>`}</dd></div>
        <div><dt>${t("Priority")}</dt><dd>${renderPriorityBadge(row.priority)}</dd></div>
      </dl>
      ${display.showBody ? excerpt(row, "body") : ""}${display.showLatestComment ? excerpt(row, "comment") : ""}
    </article>`;
  }

  function condition(boardId) {
    const rule = rules.get(boardId);
    const board = boards.get(boardId);
    let tags = ruleLabel(rule?.mode);
    if (rule?.mode === "tags") {
      const names = new Map(board?.tags.map(tag => [tag.id, tag.name]));
      tags = rule.tagIds.length
        ? t("Any tag: {tags}", { tags: rule.tagIds.map(id => names.get(id) ?? missingTag(id)).join(" / ") })
        : t("All tags off (0 matches)");
    }
    if (rule?.laneMode !== "selected") return tags;
    const names = new Map(board?.lanes?.map(lane => [lane.id, lane.name]));
    const lanes = rule.laneIds.length
      ? t("Lanes: {lanes}", { lanes: rule.laneIds.map(id => names.get(id) ?? missingLane(id)).join(" / ") })
      : t("No lanes selected (0 matches)");
    return `${tags} · ${lanes}`;
  }

  function group({ boardId, boardName, count }) {
    const tickets = rows.get(boardId) ?? [];
    return `<section class="cv-group" data-view-group="${boardId}"><header><div class="cv-group-line">
      <h3>${esc(boardName ?? missingBoard(boardId))}</h3><span>${esc(countLabel(count))}</span></div>
      <p class="cv-condition">${esc(condition(boardId))}</p></header>
      ${tickets.map(ticket).join("")}</section>`;
  }

  const paging = pageIndex > 0 || Boolean(page.nextCursor);
  return `<header class="cv-header"><div><h2 id="custom-view-heading" tabindex="-1">${esc(view.name)}</h2><p class="cv-context">
      ${view.scope === "all" ? t("All boards; only configured boards match") : t("Selected boards")} · ${completionLabel(view.completion)} · ${t("Archived tickets excluded")}
    </p></div><button type="button" data-view-action="edit">${t("Edit view")}</button></header>
    <div class="cv-toolbar"><strong id="custom-view-total">${esc(countLabel(page.total))}</strong>
      <div class="cv-choices">
        <label class="cv-order">${t("Order within boards")}<select data-view-appearance="sort">${sortOptions(display.sort, esc)}</select></label>
        ${[["showBody", t("Body")], ["showLatestComment", t("Latest comment")]].map(([key, label]) => `<label><input type="checkbox" data-view-appearance="${key}" ${display[key] ? "checked" : ""}> ${label}</label>`).join("")}
        ${dirty ? `<button type="button" data-view-action="save-display">${t("Save display settings")}</button><button type="button" data-view-action="revert-display">${t("Revert")}</button>` : ""}
      </div></div>
    ${page.warnings.filter(warning => ["missing_board", "missing_tag", "missing_lane"].includes(warning.kind)).map(warning => {
      const board = boards.get(warning.boardId)?.name ?? missingBoard(warning.boardId);
      let message = t("{board} is unavailable.", { board });
      if (warning.kind === "missing_tag") message = t("{board}: {tag} is unavailable.", { board, tag: missingTag(warning.tagId) });
      if (warning.kind === "missing_lane") message = t("{board}: {lane} is unavailable.", { board, lane: missingLane(warning.laneId) });
      return `<p class="cv-warning">${esc(message)}</p>`;
    }).join("")}
    ${page.total === 0 ? `<p class="cv-empty">${t("No tickets match. Edit the view to change its filters.")}</p>` : ""}
    ${page.boardCounts.map(group).join("")}
    ${paging ? `<nav class="cv-paging" aria-label="${t("Result pages")}">
      <button type="button" data-view-action="previous" ${pageIndex ? "" : "disabled"}>${t("Previous")}</button>
      <span>${esc(t("{first}–{last} of {total}", { first: pageIndex * pageSize + 1, last: pageIndex * pageSize + page.tickets.length, total: page.total }))}</span>
      <button type="button" data-view-action="next" ${page.nextCursor ? "" : "disabled"}>${t("Next")}</button>
    </nav>` : ""}`;
}
