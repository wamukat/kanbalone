import { t } from "./app-i18n.js";

export const emptyDefinition = () => ({
  name: "", scope: "all", boardIds: [], rules: [], completion: "open",
  sort: "position_asc", showBody: true, showLatestComment: true,
});

export function definitionOf(view) {
  return Object.fromEntries(Object.entries(emptyDefinition()).map(([key, fallback]) => [key, structuredClone(view[key] ?? fallback)]));
}

export function completionLabel(value) {
  if (value === "open") return t("Open");
  if (value === "done") return t("Resolved");
  return t("All");
}

export function ruleLabel(mode) {
  if (mode === "all") return t("Do not filter by tag");
  if (mode === "tags") return t("Match any selected tag");
  return t("Excluded until filters are configured");
}

export const missingBoard = id => t("Deleted board #{id}", { id });
export const missingTag = id => t("Deleted tag #{id}", { id });
export const missingLane = id => t("Deleted lane #{id}", { id });

function option(value, selected, label, esc) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`;
}

export function sortOptions(selected, esc) {
  return [
    ["position_asc", t("Lane and ticket order")],
    ["content_activity_desc", t("Newest body or comment update first")],
    ["priority_desc", t("Highest priority first")],
  ].map(([value, label]) => option(value, selected, label, esc)).join("");
}

function checkChoices(items, ids, attribute, boardId, missing, emptyLabel, esc) {
  const names = new Map(items.map(item => [item.id, item.name]));
  for (const id of ids) if (!names.has(id)) names.set(id, missing(id));
  return [...names].map(([id, name]) => `<label><input type="checkbox" ${attribute}="${boardId}" value="${id}" ${ids.includes(id) ? "checked" : ""}> ${esc(name)}</label>`).join("") || esc(emptyLabel);
}

export function createViewSettings(panel, definition, catalog, { escapeHtml: esc, onChange, onSave, editing }) {
  const draft = definitionOf(definition);
  const knownIds = new Set(catalog.map(board => board.id));
  const referenced = new Set([...draft.boardIds, ...draft.rules.map(rule => rule.boardId)]);
  const boards = [...catalog, ...[...referenced].filter(id => !knownIds.has(id)).map(id => ({ id, name: missingBoard(id), tags: [], lanes: [] }))];
  panel.innerHTML = `
    <header class="cv-header"><h2 id="custom-view-heading" tabindex="-1">${editing ? t("Edit custom view") : t("New custom view")}</h2></header>
    <form id="custom-view-form" class="cv-form">
      <label class="cv-field">${t("View name")}<input name="name" required maxlength="200" autocomplete="off" value="${esc(draft.name)}"></label>
      <fieldset><legend>${t("Target boards")}</legend>
        <div class="cv-choices">${["all", "selected"].map(value => `<label><input type="radio" name="scope" value="${value}" ${value === draft.scope ? "checked" : ""}> ${value === "all" ? t("All boards") : t("Selected boards")}</label>`).join("")}</div>
        <div class="cv-choices cv-board-checks" ${draft.scope === "all" ? "hidden" : ""}>${boards.map(board => `<label><input type="checkbox" name="boards" value="${board.id}" ${draft.boardIds.includes(board.id) ? "checked" : ""}> ${esc(board.name)}</label>`).join("")}</div>
      </fieldset>
      <fieldset><legend>${t("Filters by board")}</legend>
        <p class="muted">${t("Tickets must match both filters. An unconfigured board or an empty selection matches no tickets.")}</p>
        <div class="cv-rules"></div>
      </fieldset>
      <label class="cv-field">${t("Completion status")}<select name="completion">${["open", "done", "all"].map(value => option(value, draft.completion, completionLabel(value), esc)).join("")}</select></label>
      <label class="cv-field">${t("Order within boards")}<select name="sort">${sortOptions(draft.sort, esc)}</select></label>
      <fieldset><legend>${t("Show in list")}</legend><div class="cv-choices">
        <label><input type="checkbox" name="showBody" ${draft.showBody ? "checked" : ""}> ${t("Body")}</label>
        <label><input type="checkbox" name="showLatestComment" ${draft.showLatestComment ? "checked" : ""}> ${t("Latest comment")}</label>
      </div></fieldset>
      <p class="cv-preview muted" role="status"></p>
      <p class="cv-error" role="alert" hidden></p>
      <div class="cv-actions"><button type="submit" class="primary-action">${t("Save")}</button><button type="button" data-view-action="cancel">${t("Cancel")}</button>
        ${editing ? `<button class="danger cv-delete" type="button" data-view-action="delete">${t("Delete view")}</button>` : ""}
      </div>
    </form>`;

  const form = panel.querySelector("form");
  const ruleArea = form.querySelector(".cv-rules");

  function updateRules() {
    const targetBoards = boards.filter(board => draft.scope === "all" || draft.boardIds.includes(board.id));
    ruleArea.innerHTML = targetBoards.map(board => {
      const rule = draft.rules.find(item => item.boardId === board.id);
      const mode = rule?.mode ?? "unset";
      const lanes = rule?.laneMode ?? "all";
      return `<div class="cv-rule" role="group" aria-labelledby="cv-rule-${board.id}"><h3 id="cv-rule-${board.id}">${esc(board.name)}</h3>
        <div class="cv-rule-fields">
          <div class="cv-rule-row"><label><span>${t("Tags")}</span><select data-rule-mode="${board.id}">${["unset", "tags", "all"].map(value => option(value, mode, ruleLabel(value), esc)).join("")}</select></label>
            ${mode === "tags" ? `<div class="cv-choices">${checkChoices(board.tags, rule.tagIds, "data-rule-board", board.id, missingTag, t("No tags"), esc)}</div>` : ""}
          </div>
          <div class="cv-rule-row"><label><span>${t("Lane")}</span><select data-lane-mode="${board.id}" ${mode === "unset" ? "disabled" : ""}>${option("all", lanes, t("All lanes"), esc)}${option("selected", lanes, t("Select lanes"), esc)}</select></label>
            ${mode !== "unset" && lanes === "selected" ? `<div class="cv-choices">${checkChoices(board.lanes ?? [], rule.laneIds ?? [], "data-lane-board", board.id, missingLane, t("No lanes"), esc)}</div>` : ""}
          </div>
        </div>
      </div>`;
    }).join("");
  }

  function readDefinition() {
    const result = definitionOf(draft);
    result.name = form.elements.name.value.trim();
    if (result.scope === "all") result.boardIds = [];
    result.rules = result.rules.filter(rule => rule.mode !== "unset" && (result.scope === "all" || result.boardIds.includes(rule.boardId)));
    return result;
  }

  updateRules();
  const changed = () => onChange(readDefinition());
  form.addEventListener("input", event => { if (event.target.name === "name") changed(); });
  form.addEventListener("change", event => {
    const field = event.target;
    if (field.name === "scope" || field.name === "boards") {
      draft.scope = form.elements.scope.value;
      draft.boardIds = [...form.querySelectorAll('input[name="boards"]:checked')].map(input => Number(input.value));
      form.querySelector(".cv-board-checks").hidden = draft.scope === "all";
      updateRules();
    } else if (field.hasAttribute("data-rule-mode")) {
      const boardId = Number(field.dataset.ruleMode);
      let rule = draft.rules.find(item => item.boardId === boardId);
      if (!rule) {
        rule = { boardId, laneMode: "all", laneIds: [] };
        draft.rules.push(rule);
      }
      rule.mode = field.value;
      rule.tagIds = [];
      updateRules();
      ruleArea.querySelector(`[data-rule-mode="${boardId}"]`).focus({ preventScroll: true });
    } else if (field.hasAttribute("data-rule-board")) {
      const rule = draft.rules.find(rule => rule.boardId === Number(field.dataset.ruleBoard));
      rule.tagIds = [...form.querySelectorAll(`[data-rule-board="${rule.boardId}"]:checked`)].map(input => Number(input.value));
    } else if (field.hasAttribute("data-lane-mode")) {
      const boardId = Number(field.dataset.laneMode);
      const rule = draft.rules.find(item => item.boardId === boardId);
      rule.laneMode = field.value;
      rule.laneIds = [];
      updateRules();
      ruleArea.querySelector(`[data-lane-mode="${boardId}"]`).focus({ preventScroll: true });
    } else if (field.hasAttribute("data-lane-board")) {
      const rule = draft.rules.find(item => item.boardId === Number(field.dataset.laneBoard));
      rule.laneIds = [...form.querySelectorAll(`[data-lane-board="${rule.boardId}"]:checked`)].map(input => Number(input.value));
    } else if (field.name === "completion" || field.name === "sort") draft[field.name] = field.value;
    else if (field.name === "showBody" || field.name === "showLatestComment") draft[field.name] = field.checked;
    changed();
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    onSave(readDefinition());
  });
  form.elements.name.focus();
  return { readDefinition, form };
}
