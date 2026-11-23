import { t } from "./app-i18n.js";

export const emptyDefinition = () => ({
  name: "", scope: "all", boardIds: [], rules: [], completion: "open",
  showBody: true, showLatestComment: true,
});

export function definitionOf(view) {
  return Object.fromEntries(Object.keys(emptyDefinition()).map(key => [key, structuredClone(view[key])]));
}

export function completionLabel(value) {
  if (value === "open") return t("Open");
  if (value === "done") return t("Resolved");
  return t("All");
}

export function ruleLabel(mode) {
  if (mode === "all") return t("Do not filter by tag");
  if (mode === "tags") return t("Match any selected tag");
  return t("Not configured (0 matches)");
}

export const missingBoard = id => t("Deleted board #{id}", { id });
export const missingTag = id => t("Deleted tag #{id}", { id });

export function createViewSettings(panel, definition, catalog, { escapeHtml: esc, onChange, onSave, editing }) {
  const draft = definitionOf(definition);
  const knownIds = new Set(catalog.map(board => board.id));
  const referenced = new Set([...draft.boardIds, ...draft.rules.map(rule => rule.boardId)]);
  const boards = [...catalog, ...[...referenced].filter(id => !knownIds.has(id)).map(id => ({ id, name: missingBoard(id), tags: [] }))];
  const option = (value, selected, label) => `<option value="${value}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`;
  panel.innerHTML = `
    <header class="cv-header"><h2 id="custom-view-heading" tabindex="-1">${editing ? t("Edit custom view") : t("New custom view")}</h2></header>
    <form id="custom-view-form" class="cv-form">
      <label class="cv-field">${t("View name")}<input name="name" required maxlength="200" autocomplete="off" value="${esc(draft.name)}"></label>
      <fieldset><legend>${t("Target boards")}</legend>
        <div class="cv-choices">${["all", "selected"].map(value => `<label><input type="radio" name="scope" value="${value}" ${value === draft.scope ? "checked" : ""}> ${value === "all" ? t("All boards") : t("Selected boards")}</label>`).join("")}</div>
        <div class="cv-choices cv-board-checks" ${draft.scope === "all" ? "hidden" : ""}>${boards.map(board => `<label><input type="checkbox" name="boards" value="${board.id}" ${draft.boardIds.includes(board.id) ? "checked" : ""}> ${esc(board.name)}</label>`).join("")}</div>
      </fieldset>
      <fieldset><legend>${t("Board tag filters")}</legend>
        <p class="muted">${t("Unconfigured boards and empty tag selections match no tickets.")}</p>
        <div class="cv-rules"></div>
      </fieldset>
      <label class="cv-field">${t("Completion status")}<select name="completion">${["open", "done", "all"].map(value => option(value, draft.completion, completionLabel(value))).join("")}</select></label>
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
      const ids = rule?.tagIds ?? [];
      const tags = [...board.tags, ...ids.filter(id => !board.tags.some(tag => tag.id === id)).map(id => ({ id, name: missingTag(id) }))];
      return `<div class="cv-rule"><label class="cv-rule-head"><strong>${esc(board.name)}</strong><select data-rule-mode="${board.id}">${["unset", "tags", "all"].map(value => option(value, mode, ruleLabel(value))).join("")}</select></label>
        <div class="cv-choices cv-tag-checks" ${mode === "tags" ? "" : "hidden"}>${tags.map(tag => `<label><input type="checkbox" data-rule-board="${board.id}" value="${tag.id}" ${ids.includes(tag.id) ? "checked" : ""}> ${esc(tag.name)}</label>`).join("") || t("No tags")}</div>
      </div>`;
    }).join("");
  }

  function readDefinition() {
    const result = definitionOf(draft);
    result.name = form.elements.name.value.trim();
    if (result.scope === "all") result.boardIds = [];
    else result.rules = result.rules.filter(rule => result.boardIds.includes(rule.boardId));
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
      draft.rules = draft.rules.filter(rule => rule.boardId !== boardId);
      if (field.value !== "unset") draft.rules.push({ boardId, mode: field.value, tagIds: [] });
      updateRules();
      ruleArea.querySelector(`[data-rule-mode="${boardId}"]`).focus({ preventScroll: true });
    } else if (field.hasAttribute("data-rule-board")) {
      const rule = draft.rules.find(rule => rule.boardId === Number(field.dataset.ruleBoard));
      rule.tagIds = [...form.querySelectorAll(`[data-rule-board="${rule.boardId}"]:checked`)].map(input => Number(input.value));
    } else if (field.name === "completion") draft.completion = field.value;
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
