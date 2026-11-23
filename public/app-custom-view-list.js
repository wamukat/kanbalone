import { getLocale, t } from "./app-i18n.js";
import { renderTicketStatusIcons } from "./app-ticket-status.js";
import { renderPriorityBadge } from "./app-priority.js";
import { renderTag } from "./app-tags.js";
import { completionLabel, missingBoard, missingTag, ruleLabel } from "./app-custom-view-settings.js";

const dates = new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" });

export function renderCustomView({ view, display, page, catalog, pageIndex, pageSize, esc }) {
  const dirty = display.showBody !== view.showBody || display.showLatestComment !== view.showLatestComment;
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
    const posted = comment && part ? `<time datetime="${esc(part.createdAt)}">${esc(dates.format(new Date(part.createdAt)))}</time>` : "";
    return `<section class="cv-excerpt"><h4>${title} ${posted}</h4>
      <p>${part?.excerpt ? esc(part.excerpt) : comment ? t("No comments yet.") : t("No body")}${part?.truncated ? "…" : ""}</p>
      ${part?.truncated ? `<button type="button" class="cv-text-action" data-view-expand="${field}" data-row-id="${row.id}" data-comment-id="${part.id ?? ""}" aria-expanded="false">${t("Show full text")}</button>` : ""}
      </section>`;
  }

  function ticket(row) {
    return `<article class="cv-ticket${row.isResolved ? " resolved" : ""}"><h4>${renderTicketStatusIcons(row)}<a href="/tickets/${row.id}" data-view-ticket="${row.id}" data-owner="${row.boardId}">${esc(row.title)}</a></h4>
      <dl class="cv-meta">
        <div><dt>${t("Ticket ID")}</dt><dd>#${row.id}</dd></div>
        <div><dt>${t("Lane")}</dt><dd>${esc(row.laneName)}</dd></div>
        <div><dt>${t("Tags")}</dt><dd>${row.tags.map(tag => renderTag(tag, esc)).join(" ") || t("None")}</dd></div>
        <div><dt>${t("Priority")}</dt><dd>${renderPriorityBadge(row.priority)}</dd></div>
      </dl>
      ${display.showBody ? excerpt(row, "body") : ""}${display.showLatestComment ? excerpt(row, "comment") : ""}
    </article>`;
  }

  function condition(boardId) {
    const rule = rules.get(boardId);
    if (rule?.mode !== "tags") return ruleLabel(rule?.mode);
    const tags = new Map(boards.get(boardId)?.tags.map(tag => [tag.id, tag.name]));
    return rule.tagIds.length
      ? t("Any tag: {tags}", { tags: rule.tagIds.map(id => tags.get(id) ?? missingTag(id)).join(" / ") })
      : t("All tags off (0 matches)");
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
      ${view.scope === "all" ? t("All boards") : t("Selected boards")} · ${completionLabel(view.completion)} · ${t("Archived tickets excluded")}
    </p></div><button type="button" data-view-action="edit">${t("Edit view")}</button></header>
    <div class="cv-toolbar"><strong id="custom-view-total">${esc(countLabel(page.total))}</strong>
      <div class="cv-choices">
        ${[["showBody", t("Body")], ["showLatestComment", t("Latest comment")]].map(([key, label]) => `<label><input type="checkbox" data-view-appearance="${key}" ${display[key] ? "checked" : ""}> ${label}</label>`).join("")}
        ${dirty ? `<button type="button" data-view-action="save-display">${t("Save display settings")}</button><button type="button" data-view-action="revert-display">${t("Revert")}</button>` : ""}
      </div></div>
    ${page.warnings.filter(warning => warning.kind === "missing_board" || warning.kind === "missing_tag").map(warning => {
      const board = boards.get(warning.boardId)?.name ?? missingBoard(warning.boardId);
      const message = warning.kind === "missing_tag" ? t("{board}: {tag} is unavailable.", { board, tag: missingTag(warning.tagId) }) : t("{board} is unavailable.", { board });
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
